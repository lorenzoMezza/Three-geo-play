import * as THREE from 'three';

import { decodeVectorTile, GeomType } from '../tiles/vectorTile.js';
import { TileFeatureCollector } from '../tiles/TileFeatureCollector.js';
import { LineLayering, lineLevel } from './lineLayering.js';
import { classifyRings, clipPolygon } from '../geometry/polygonGeometry.js';
import { roofVariation } from '../geometry/buildingGeometry.js';


const TMP_COLOR = new THREE.Color();

const TILE_BORDER_MATERIAL = new THREE.LineBasicMaterial({
    color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8,
});

const BORDER_Y = 0.01;

/** Height used for buildings without height data, in metres. */
const DEFAULT_BUILDING_HEIGHT_M = 10;

/** Height over which the ambient occlusion of building walls fades out, in metres. */
const AMBIENT_OCCLUSION_HEIGHT_M = 10;

const WHITE = Object.freeze({ r: 1, g: 1, b: 1 });

/** Public names of the vector tile geometry types. */
const GEOMETRY_TYPES = { [GeomType.POINT]: 'point', [GeomType.LINESTRING]: 'line', [GeomType.POLYGON]: 'polygon' };

/** Line simplification tolerance, as a fraction of the tile extent. */
const LINE_SIMPLIFY_TOLERANCE = 2 / 4096;

/**
 * Polygons are clipped to the tile plus this margin (fraction of the extent):
 * the tiny overlap avoids hairline cracks between neighbouring tiles.
 */
const CLIP_MARGIN = 1 / 4096;

/**
 * @typedef {Object} TileBuildContext
 * @property {import('../style/MapStyle.js').MapStyle} mapStyle
 * @property {number}  tileWorldSize - World size of a tile when built.
 * @property {number}  zoomScale     - {@link MapConfig#zoomScaleFactor}.
 * @property {number}  unitsPerMeter - World units per metre at the map origin.
 * @property {boolean} showBorders
 * @property {import('./MeshBatches.js').MeshBatches} batches - Where the tile geometry is drawn.
 * @property {string|Function} [tileSchema] - {@link MapConfig#tileSchema}.
 * @property {string[]} [sourceLayers]      - Layer names announced by the tile source.
 */

/**
 * One map tile: holds the raw MVT payload and builds its geometry.
 *
 * Geometry is built in the tile's local frame — the tile spans `[0, size]` on
 * X and Z, `size` being the tile world size at the first build, and it keeps
 * that frame for its whole life — and handed to the shared {@link MeshBatches};
 * the tile transform (position + uniform scale) is applied per instance, so
 * moving or rescaling a tile never touches its vertices. Objects the user adds
 * to {@link object3D} use the same frame, so they follow the tile too.
 */
export class Tile {

    /** @type {Uint8Array|null} */
    #payload;

    /** `zoom/x/y` of the tile, the start of its feature keys. */
    #name;

    /** @type {THREE.Group} */
    #group = new THREE.Group();

    /** @type {import('./MeshBatches.js').BatchHandle[]} */
    #handles = [];

    /** @type {THREE.Line|null} */
    #border = null;

    /** Side of the tile in local units: the tile world size at the first build. */
    #frameSize = null;

    /** Local units per metre used by the latest build. */
    #unitsPerMeter = 1;

    /**
     * Building footprints of the latest build, for {@link heightAt}: a grid of
     * cells over the tile, each listing the parts that overlap it.
     * @type {{ cells: Map<number, { rings: number[][], scale: number, top: number, minX: number, maxX: number, minZ: number, maxZ: number }[]> } | null}
     */
    #footprints = null;

    /**
     * Public description of the tile handed to the user (`tileload` events,
     * picked features); set by the tile manager.
     * @type {Object|null}
     */
    info = null;

    /**
     * @param {Uint8Array} payload - Raw MVT bytes.
     * @param {string} name - `zoom/x/y` of the tile.
     */
    constructor(payload, name) {
        this.#payload                 = payload;
        this.#name                    = name;
        this.#group.name              = 'ThreeGeoPlayTile';
        this.#group.matrixAutoUpdate  = false;
        this.#group.userData.threeGeoPlay = true;
    }

    /** @type {THREE.Group} */
    get object3D() { return this.#group; }

    /** Side of the tile in its local frame (`null` before the first build). */
    get size() { return this.#frameSize; }

    /** Local units per metre (heights included), as used by the latest build. */
    get unitsPerMeter() { return this.#unitsPerMeter; }

    /**
     * Height (local units) of the highest building part covering a point of
     * the tile's local frame, or `null` where there is none.
     * @param {number} lx
     * @param {number} lz
     * @returns {number|null}
     */
    heightAt(lx, lz) {
        const parts = this.#footprints?.cells.get(footprintCell(lx, lz, this.#frameSize));
        if (!parts) return null;
        let top = null;
        for (const p of parts) {
            if ((top !== null && p.top <= top) || lx < p.minX || lx > p.maxX || lz < p.minZ || lz > p.maxZ) continue;
            if (insideRings(p.rings, lx / p.scale, lz / p.scale)) top = p.top;
        }
        return top;
    }

    /**
     * Decodes the features of the tile — every layer, including those the map
     * does not draw (labels, POIs, …) — with their geometry in the tile's
     * local frame.
     *
     * @param {string} [sourceLayer] - Only this vector tile layer.
     * @returns {{ sourceLayer: string, id: number, type: 'point'|'line'|'polygon', properties: Record<string, unknown>, geometry: number[][] }[]}
     */
    getFeatures(sourceLayer) {
        if (!this.#payload || this.#frameSize === null) return [];
        const accept = sourceLayer === undefined ? undefined : name => name === sourceLayer;
        const result = [];
        for (const layer of decodeVectorTile(this.#payload, accept)) {
            layer.features.forEach((feature, index) => {
                const type = GEOMETRY_TYPES[feature.type];
                if (type) result.push(this.#describe(feature, layer.name, index, layer.extent, type));
            });
        }
        return result;
    }

    /**
     * Geometry of a feature in the tile's local frame: parts (points, lines or
     * polygon rings) as flat `[x0, z0, x1, z1, …]` arrays.
     * @param {import('../tiles/vectorTile.js').VectorTileFeature} feature
     * @param {number} extent
     * @returns {number[][]}
     */
    featureGeometry(feature, extent) {
        const scale = this.#frameSize / extent;
        return feature.loadGeometry().map(part => Array.from(part, v => v * scale));
    }

    /**
     * Unique name of a feature on the map, `zoom/x/y/sourceLayer/index`. Unlike the
     * `id` of the tile data (0 for most OpenMapTiles features), it tells features apart.
     */
    featureKey(sourceLayer, index) {
        return `${this.#name}/${sourceLayer}/${index}`;
    }

    #describe(feature, sourceLayer, index, extent, type) {
        return {
            sourceLayer,
            id:         feature.id,
            key:        this.featureKey(sourceLayer, index),
            type,
            properties: feature.properties,
            geometry:   this.featureGeometry(feature, extent),
        };
    }

    /**
     * First half of a (re)build, on the main thread: decodes the tile and applies
     * the style — `featureStyle` included — to describe what to draw. The geometry
     * is then built from the plan's `job` by {@link buildTileGeometry}, in a worker
     * when possible, and handed to {@link apply}.
     *
     * Features drawn with the same parameters share one command of the job, which
     * lists them by their position in the tile. The worker decodes their geometry
     * from the tile bytes itself: little data is copied to it.
     *
     * @param {TileBuildContext} ctx
     * @returns {TilePlan}
     *
     * @typedef {Object} TilePlan
     * @property {Object}     job        - Input of {@link buildTileGeometry} (plain data).
     * @property {Object[]}   batches    - Batch descriptors (material, render order, …), in job order.
     * @property {Object[][]} items      - For each command of the job, the features it draws (for picking).
     * @property {Object}     footprints - Index of the building footprints, for {@link heightAt}.
     * @property {number}     unitsPerMeter - Local units per metre of this build.
     */
    plan(ctx) {
        const collector = new TileFeatureCollector(ctx.mapStyle, ctx.tileSchema, ctx.sourceLayers);
        const layers    = decodeVectorTile(this.#payload, collector.acceptsLayer);
        const { lines, polygons, buildings } = collector.collect(layers);

        // The tile keeps the local frame of its first build (see the class description).
        if (this.#frameSize === null) this.#frameSize = ctx.tileWorldSize;
        const size          = this.#frameSize;
        const toLocal       = size / ctx.tileWorldSize;            // world units → local units
        const unitsPerMeter = ctx.unitsPerMeter * toLocal;

        /** The `featureStyle` overrides of a collected feature, or `null`. */
        const overrides = item => (item.style.featureStyle
            ? featureOverrides(item, this.featureKey(item.sourceLayer, item.index))
            : null);

        const batches  = [];
        const batchIds = new Map();
        /** Index of the batch drawing `kind` with `material` at `renderOrder`. */
        const batchFor = (kind, material, renderOrder, style) => {
            const { castShadow, receiveShadow } = style;
            const depthPrepass = kind === 'building' && style.depthPrepass;
            const key = `${kind}|${material.id}|${renderOrder}|${castShadow}|${receiveShadow}|${depthPrepass}`;
            if (!batchIds.has(key)) {
                batchIds.set(key, batches.length);
                batches.push({ kind, material, renderOrder, castShadow, receiveShadow, depthPrepass });
            }
            return batchIds.get(key);
        };

        const commands   = [];
        const items      = [];
        const commandIds = new Map();
        /**
         * Adds a feature to the command of its `key` (its style and all that can change
         * how it is drawn); `create` gives the parameters of a new command.
         */
        const addToCommand = (key, item, create) => {
            let id = commandIds.get(key);
            if (id === undefined) {
                id = commands.length;
                commandIds.set(key, id);
                commands.push({ ...create(), sourceLayer: item.sourceLayer, features: [] });
                items.push([]);
            }
            commands[id].features.push(item.index);
            items[id].push(item);
            return commands[id];
        };

        // ── lines ────────────────────────────────────────────────────────────
        const relative = size * ctx.zoomScale;   // local units per `lineWidth` unit
        const layering = new LineLayering(ctx.mapStyle, unitsPerMeter / relative);
        for (const item of lines) {
            const { style, feature, extent, ramp: isRamp } = item;
            const width = style.lineWidthMeters === null ? style.lineWidth * relative : style.lineWidthMeters * unitsPerMeter;
            if (!(width > 0)) continue;

            const level  = lineLevel(feature.properties);
            const custom = overrides(item);
            if (custom?.visible === false) continue;
            const material        = asMaterial(custom?.material) ?? style.material;
            const outlineMaterial = asMaterial(custom?.outlineMaterial) ?? style.outlineMaterial;

            const key = `${item.layer}.${item.type}|${item.sourceLayer}|${level}|${isRamp}|${material.id}|${outlineMaterial?.id}`;
            addToCommand(key, item, () => {
                const outlineExtra = style.outlineWidthMeters === null
                    ? style.outlineWidth * relative
                    : style.outlineWidthMeters * unitsPerMeter;
                const hasOutline = outlineExtra > 0 && outlineMaterial;
                const tolerance  = LINE_SIMPLIFY_TOLERANCE * extent;
                const scale      = size / extent;
                return {
                    type:          'line',
                    batch:         batchFor('line', material, layering.fillOrder(style, level, isRamp), style),
                    outlineBatch:  hasOutline ? batchFor('outline', outlineMaterial, layering.outlineOrder(style, level), style) : -1,
                    scale,
                    tolerance,
                    width,
                    outlineWidth:  width + outlineExtra,
                    jointSegments: style.jointSegments,
                    y:             style.Y * toLocal,
                    roundEnds:     level === 0,              // bridges / tunnels end flat on the road they join
                    arcError:      tolerance * scale,        // round caps / joins: same accuracy as the simplification
                };
            });
        }

        // ── flat polygons ────────────────────────────────────────────────────
        for (const item of polygons) {
            const { style, extent } = item;
            const custom = overrides(item);
            if (custom?.visible === false) continue;
            const material = asMaterial(custom?.material) ?? style.material;

            addToCommand(`${item.layer}.${item.type}|${item.sourceLayer}|${material.id}`, item, () => {
                const margin = CLIP_MARGIN * extent;
                return {
                    type:  'polygon',
                    batch: batchFor('polygon', material, style.renderingOrder, style),
                    min:   -margin,
                    max:   extent + margin,
                    scale: size / extent,
                    y:     style.Y * toLocal,
                };
            });
        }

        // ── buildings ────────────────────────────────────────────────────────
        const shadings   = [];
        const shadingOf  = new Map();   // style → index in `shadings`
        const roofTints  = new Map();   // style → roof colour (the getter returns a copy)
        const footprints = new Map();
        for (const item of buildings) {
            const { style, feature, extent } = item;
            const props   = feature.properties;
            let height    = Math.max(0, toFiniteNumber(props.render_height ?? props.height, DEFAULT_BUILDING_HEIGHT_M));
            let minHeight = Math.max(0, toFiniteNumber(props.render_min_height ?? props.min_height, 0));
            let color     = WHITE;
            let material  = style.material;

            // Per-building overrides from the style (data-driven styling).
            const custom = overrides(item);
            if (custom) {
                if (custom.visible === false) continue;
                if (Number.isFinite(custom.height))    height    = Math.max(0, custom.height);
                if (Number.isFinite(custom.minHeight)) minHeight = Math.max(0, custom.minHeight);
                material = asMaterial(custom.material) ?? material;
                if (custom.color !== undefined && custom.color !== null) {
                    color = TMP_COLOR.set(custom.color);
                    if (!material.vertexColors) warnColorIgnored(material);
                }
            }

            const k     = unitsPerMeter * style.height;
            const y     = style.Y * toLocal;
            const yTop  = y + height * k;
            const yBase = y + minHeight * k;
            if (yTop < yBase) continue;

            if (!shadingOf.has(style)) {
                shadingOf.set(style, shadings.length);
                shadings.push(buildingShading(style, y, k));
                roofTints.set(style, style.roofColor);
            }
            const tint = roofTints.get(style);
            // Keyed by the drawn height, so roofs drawn at the same height (overlapping
            // parts, or every roof when the buildings are flattened) share one tone.
            const tone = roofVariation(height * style.height, style.colorVariation);

            const command = addToCommand(`${item.layer}.${item.type}|${item.sourceLayer}|${material.id}`, item, () => {
                const margin = CLIP_MARGIN * extent;
                return {
                    type:    'building',
                    batch:   batchFor('building', material, null, style),
                    shading: shadingOf.get(style),
                    scale:   size / extent,
                    min:     -margin,
                    max:     extent + margin,
                    yBase:   [],
                    yTop:    [],
                    raised:  [],
                    roofs:   [],
                    walls:   [],
                };
            });
            command.yBase.push(yBase);
            command.yTop.push(yTop);
            command.raised.push(minHeight > 0);
            command.roofs.push(tint.r * tone * color.r, tint.g * tone * color.g, tint.b * tone * color.b);
            command.walls.push(color.r, color.g, color.b);

            // Footprints for heightAt(). The worker clips the building again: cheaper than sending it.
            for (const polygon of classifyRings(feature.loadGeometry())) {
                const part = clipPolygon(polygon, command.min, command.max);
                if (part) indexFootprint(footprints, part, command.scale, yTop, size);
            }
        }

        // Lit materials need normals and only `vertexColors` materials read colours:
        // the defaults (unlit) do not pay for what they do not use.
        const job = {
            payload:  this.#payload,
            batches:  batches.map(({ kind, material }) => ({
                kind,
                normals: !material.isMeshBasicMaterial,
                colors:  !!material.vertexColors,
            })),
            shadings,
            commands,
        };
        return { job, batches, items, footprints: { cells: footprints }, unitsPerMeter };
    }

    /**
     * Second half of a (re)build, on the main thread: hands the geometry built
     * from {@link plan} to the batches. The previous meshes are replaced only once
     * the new ones are in, so there is never an empty frame.
     *
     * @param {TileBuildContext} ctx
     * @param {TilePlan} plan
     * @param {import('./tileGeometry.js').TileGeometry} geometry
     */
    apply(ctx, plan, geometry) {
        // Which feature draws which vertices, for picking.
        const ranges = plan.batches.map(() => []);
        let n = 0;
        plan.job.commands.forEach((command, i) => {
            for (const item of plan.items[i]) {
                ranges[command.batch].push(geometry.starts[2 * n], item);
                if (command.outlineBatch >= 0) ranges[command.outlineBatch].push(geometry.starts[2 * n + 1], item);
                n++;
            }
        });

        const handles = [];
        plan.batches.forEach((batch, i) => {
            const arrays = geometry.batches[i];
            if (arrays.positions.length > 0) {
                handles.push(ctx.batches.add(batch, createGeometry(batch, arrays), this.#group, ranges[i], this));
            }
        });
        this.#footprints    = plan.footprints;
        this.#unitsPerMeter = plan.unitsPerMeter;

        this.#removeGeometry();
        this.#handles = handles;

        this.#disposeBorder();
        if (ctx.showBorders) this.#createBorder();
    }

    /**
     * Positions the tile in world space. When `tileWorldSize` differs from the
     * size the geometry was built with, the tile is scaled accordingly.
     *
     * @param {number} worldX
     * @param {number} worldZ
     * @param {number} tileWorldSize
     */
    place(worldX, worldZ, tileWorldSize) {
        this.#group.position.set(worldX, 0, worldZ);
        this.#group.scale.setScalar(tileWorldSize / this.#frameSize);
        this.#group.updateMatrix();
        for (const handle of this.#handles) handle.setMatrix(this.#group.matrix);
    }

    /**
     * Shows or hides the debug border of the tile.
     * @param {boolean} visible
     */
    setBorderVisible(visible) {
        if (visible && !this.#border) this.#createBorder();
        else if (!visible) this.#disposeBorder();
    }

    /**
     * Releases all GPU resources and detaches the tile from the scene.
     */
    dispose() {
        this.#removeGeometry();
        this.#disposeBorder();
        this.#group.removeFromParent();
        this.#payload = null;
    }

    #createBorder() {
        const s = this.#frameSize;
        const corners = new Float32Array([
            0, BORDER_Y, 0,
            s, BORDER_Y, 0,
            s, BORDER_Y, s,
            0, BORDER_Y, s,
            0, BORDER_Y, 0,
        ]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(corners, 3));
        this.#border = new THREE.Line(geometry, TILE_BORDER_MATERIAL);
        this.#border.matrixAutoUpdate = false;
        this.#border.userData.threeGeoPlay = true;
        this.#border.layers.mask = this.#group.layers.mask;
        this.#group.add(this.#border);
    }

    #disposeBorder() {
        if (!this.#border) return;
        this.#border.removeFromParent();
        this.#border.geometry.dispose();
        this.#border = null;
    }

    #removeGeometry() {
        for (const handle of this.#handles) handle.remove();
        this.#handles = [];
    }
}


function createGeometry({ kind, material }, { positions, normals, colors }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (kind === 'building') {
        if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        if (colors)  geometry.setAttribute('color',  new THREE.BufferAttribute(colors, 3, true));
        return geometry;
    }
    // Flat map geometry faces up: lit materials get a constant normal.
    if (!material.isMeshBasicMaterial) {
        const up = new Float32Array(positions.length);
        for (let i = 1; i < up.length; i += 3) up[i] = 1;
        geometry.setAttribute('normal', new THREE.BufferAttribute(up, 3));
    }
    return geometry;
}

/**
 * Parameters of the shading baked into the buildings of one style (see BuildingShading).
 * The directional part is only baked for unlit materials: lit ones get it from the scene lights.
 * @param {import('../style/layers/BuildingLayer.js').BuildingLayer} style
 * @param {number} groundY - Local Y of the ground the buildings stand on.
 * @param {number} k       - Local units per (exaggerated) metre.
 */
function buildingShading(style, groundY, k) {
    return {
        groundY,
        aoTop:            groundY + AMBIENT_OCCLUSION_HEIGHT_M * k,
        ambientOcclusion: style.ambientOcclusion ?? 0,
        wallShading:      style.material?.isMeshBasicMaterial ? (style.wallShading ?? 0) : 0,
    };
}

/** Cells per tile side of the footprint grid used by {@link Tile#heightAt}. */
const FOOTPRINT_CELLS = 16;

function footprintCell(lx, lz, size) {
    const n = FOOTPRINT_CELLS / size;
    const cx = Math.min(FOOTPRINT_CELLS - 1, Math.max(0, Math.floor(lx * n)));
    const cz = Math.min(FOOTPRINT_CELLS - 1, Math.max(0, Math.floor(lz * n)));
    return cz * FOOTPRINT_CELLS + cx;
}

/** Adds a building part to the footprint grid (bounds in local units, rings kept in extent units). */
function indexFootprint(cells, rings, scale, top, size) {
    const part = { rings, scale, top, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i += 2) {
            const x = ring[i] * scale, z = ring[i + 1] * scale;
            if (x < part.minX) part.minX = x;
            if (x > part.maxX) part.maxX = x;
            if (z < part.minZ) part.minZ = z;
            if (z > part.maxZ) part.maxZ = z;
        }
    }
    const a = footprintCell(part.minX, part.minZ, size);
    const b = footprintCell(part.maxX, part.maxZ, size);
    for (let cz = Math.floor(a / FOOTPRINT_CELLS); cz <= Math.floor(b / FOOTPRINT_CELLS); cz++) {
        for (let cx = a % FOOTPRINT_CELLS; cx <= b % FOOTPRINT_CELLS; cx++) {
            const key = cz * FOOTPRINT_CELLS + cx;
            const list = cells.get(key);
            if (list) list.push(part);
            else cells.set(key, [part]);
        }
    }
}

/** Even-odd point-in-polygon over every ring (holes are outside). */
function insideRings(rings, x, z) {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
            const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
            if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        }
    }
    return inside;
}

/** `featureStyle` functions that already threw (reported once each). */
const failingFeatureStyles = new WeakSet();

/**
 * Calls the `featureStyle` function of a feature's type. If it throws, the
 * feature keeps its default style and the error is reported once: a bug in the
 * callback never breaks the tiles.
 * @param {import('../tiles/TileFeatureCollector.js').CollectedFeature} item
 * @param {string} key - {@link Tile#featureKey}.
 */
function featureOverrides({ style, feature, sourceLayer, type }, key) {
    const featureStyle = style.featureStyle;
    try {
        return featureStyle({ id: feature.id, key, properties: feature.properties, sourceLayer, type });
    } catch (err) {
        if (!failingFeatureStyles.has(featureStyle)) {
            failingFeatureStyles.add(featureStyle);
            console.error(`ThreeGeoPlay: the featureStyle of '${type}' threw; the features it failed on keep their default style`, err);
        }
        return null;
    }
}

let warnedNotMaterial = false;

/** A `featureStyle` material override, if it is one. */
function asMaterial(value) {
    if (value === undefined || value === null) return null;
    if (value instanceof THREE.Material) return value;
    if (!warnedNotMaterial) {
        warnedNotMaterial = true;
        console.warn('ThreeGeoPlay: featureStyle returned a material that is not a THREE.Material (is three.js imported twice?); it is ignored');
    }
    return null;
}

/** Materials already reported for ignoring `featureStyle` colours. */
const colorIgnored = new WeakSet();

function warnColorIgnored(material) {
    if (colorIgnored.has(material)) return;
    colorIgnored.add(material);
    console.warn('ThreeGeoPlay: featureStyle returned a building color, but the building material has vertexColors = false, so it is ignored. Create the material with { vertexColors: true }.');
}

function toFiniteNumber(value, fallback) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
