import * as THREE from 'three';

import { decodeVectorTile, GeomType } from '../utils/vectorTile.js';
import { TileFeatureCollector } from '../utils/TileFeatureCollector.js';
import { FloatArrayBuilder }    from '../geom_utils/FloatArrayBuilder.js';
import { appendThickLine }      from '../geom_utils/lineGeometry.js';
import { simplifyLine }         from '../geom_utils/RDPalgoritm.js';
import { LineLayering, lineLevel } from './lineLayering.js';
import { classifyRings, clipPolygon, appendFlatPolygon } from '../geom_utils/polygonGeometry.js';
import { BuildingGeometryBuilder, BuildingShading, roofVariation } from '../geom_utils/buildingGeometry.js';


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
     * Public description of the tile handed to the user (`tileload` events,
     * picked features); set by the tile manager.
     * @type {Object|null}
     */
    info = null;

    /**
     * @param {Uint8Array} payload - Raw MVT bytes.
     */
    constructor(payload) {
        this.#payload                 = payload;
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
            for (const feature of layer.features) {
                const type = GEOMETRY_TYPES[feature.type];
                if (type) result.push(this.#describe(feature, layer.name, layer.extent, type));
            }
        }
        return result;
    }

    /**
     * Geometry of a feature in the tile's local frame: parts (points, lines or
     * polygon rings) as flat `[x0, z0, x1, z1, …]` arrays.
     * @param {import('../utils/vectorTile.js').VectorTileFeature} feature
     * @param {number} extent
     * @returns {number[][]}
     */
    featureGeometry(feature, extent) {
        const scale = this.#frameSize / extent;
        return feature.loadGeometry().map(part => Array.from(part, v => v * scale));
    }

    #describe(feature, sourceLayer, extent, type) {
        return {
            sourceLayer,
            id:         feature.id,
            type,
            properties: feature.properties,
            geometry:   this.featureGeometry(feature, extent),
        };
    }

    /**
     * (Re)builds all meshes from the payload using the current style.
     * The previous meshes are replaced only once the new ones are ready.
     *
     * @param {TileBuildContext} ctx
     */
    build(ctx) {
        const collector = new TileFeatureCollector(ctx.mapStyle, ctx.tileSchema, ctx.sourceLayers);
        const layers    = decodeVectorTile(this.#payload, collector.acceptsLayer);
        const { lines, polygons, buildings } = collector.collect(layers);

        // The tile keeps the local frame of its first build (see the class description).
        if (this.#frameSize === null) this.#frameSize = ctx.tileWorldSize;
        const size          = this.#frameSize;
        const toLocal       = size / ctx.tileWorldSize;            // world units → local units
        const unitsPerMeter = ctx.unitsPerMeter * toLocal;
        this.#unitsPerMeter = unitsPerMeter;

        const batches = new Map();
        /**
         * Output of the batch for a feature: records where the feature starts
         * in it (vertex index), so a raycast hit can be traced back to it.
         */
        const batchFor = (kind, material, renderOrder, item) => {
            const { castShadow, receiveShadow } = item.style;
            const depthPrepass = kind === 'building' && item.style.depthPrepass;
            const key = `${kind}|${material.id}|${renderOrder}|${castShadow}|${receiveShadow}|${depthPrepass}`;
            let batch = batches.get(key);
            if (!batch) {
                const out = kind === 'building' ? new BuildingGeometryBuilder() : new FloatArrayBuilder();
                batch = { kind, material, renderOrder, castShadow, receiveShadow, depthPrepass, out, ranges: [] };
                batches.set(key, batch);
            }
            batch.ranges.push(batch.out.length / 3, item);
            return batch.out;
        };

        // ── lines ────────────────────────────────────────────────────────────
        const layering = new LineLayering(ctx.mapStyle);
        for (const item of lines) {
            const { style, feature, extent, ramp: isRamp } = item;
            const width = style.lineWidth * size * ctx.zoomScale;
            if (!(width > 0)) continue;

            const props        = feature.properties;
            const level        = lineLevel(props);
            const roundEnds    = level === 0;   // bridges / tunnels end flat on the road they join
            const outlineExtra = style.outlineWidth * size * ctx.zoomScale;
            const y            = style.Y * toLocal;
            const fillOut      = batchFor('line', style.material, layering.fillOrder(style, level, isRamp), item);
            const outlineOut   = outlineExtra > 0 && style.outlineMaterial
                ? batchFor('outline', style.outlineMaterial, layering.outlineOrder(style, level), item)
                : null;
            const scale     = size / extent;
            const tolerance = LINE_SIMPLIFY_TOLERANCE * extent;
            const arcError  = tolerance * scale;   // round caps / joins: same accuracy as the simplification

            for (const part of feature.loadGeometry()) {
                const line = scaled(simplifyLine(part, tolerance), scale);
                appendThickLine(fillOut, line, width, style.jointSegments, y, roundEnds, arcError);
                if (outlineOut) {
                    appendThickLine(outlineOut, line, width + outlineExtra, style.jointSegments, y, roundEnds, arcError);
                }
            }
        }

        // ── flat polygons ────────────────────────────────────────────────────
        for (const item of polygons) {
            const { style, feature, extent } = item;
            const out    = batchFor('polygon', style.material, style.renderingOrder, item);
            const margin = CLIP_MARGIN * extent;
            for (const polygon of classifyRings(feature.loadGeometry())) {
                const clipped = clipPolygon(polygon, -margin, extent + margin);
                if (clipped) appendFlatPolygon(out, clipped, size / extent, style.Y * toLocal);
            }
        }

        // ── buildings ────────────────────────────────────────────────────────
        const shadings = new Map();
        const roof     = { r: 1, g: 1, b: 1 };
        const walls    = { r: 1, g: 1, b: 1 };
        for (const item of buildings) {
            const { style, feature, extent } = item;
            const props   = feature.properties;
            let height    = Math.max(0, toFiniteNumber(props.render_height ?? props.height, DEFAULT_BUILDING_HEIGHT_M));
            let minHeight = Math.max(0, toFiniteNumber(props.render_min_height ?? props.min_height, 0));
            let color     = WHITE;

            // Per-building overrides from the style (data-driven styling).
            if (style.featureStyle) {
                const custom = callFeatureStyle(style.featureStyle, { id: feature.id, properties: props, sourceLayer: item.sourceLayer, type: item.type });
                if (custom) {
                    if (custom.visible === false) continue;
                    if (Number.isFinite(custom.height))    height    = Math.max(0, custom.height);
                    if (Number.isFinite(custom.minHeight)) minHeight = Math.max(0, custom.minHeight);
                    if (custom.color !== undefined && custom.color !== null) color = TMP_COLOR.set(custom.color);
                }
            }

            const k     = unitsPerMeter * style.height;
            const y     = style.Y * toLocal;
            const yTop  = y + height * k;
            const yBase = y + minHeight * k;
            if (yTop < yBase) continue;

            let shading = shadings.get(style);
            if (!shading) {
                shading = { shade: buildingShading(style, y, k), tint: style.roofColor };
                shadings.set(style, shading);
            }
            const tint = shading.tint;
            const tone = roofVariation(height, minHeight, style.colorVariation);
            roof.r  = tint.r * tone * color.r;
            roof.g  = tint.g * tone * color.g;
            roof.b  = tint.b * tone * color.b;
            walls.r = color.r;
            walls.g = color.g;
            walls.b = color.b;

            const out    = batchFor('building', style.material, null, item);
            const margin = CLIP_MARGIN * extent;
            const min    = -margin;
            const max    = extent + margin;
            for (const polygon of classifyRings(feature.loadGeometry())) {
                const clipped = clipPolygon(polygon, min, max);
                if (clipped) out.appendBuilding(clipped, size / extent, yBase, yTop, min, max, shading.shade, roof, walls, minHeight > 0);
            }
        }

        // Add the new geometry before removing the old one: no empty frame.
        const handles = [];
        for (const batch of batches.values()) {
            if (batch.out.length > 0) handles.push(ctx.batches.add(batch, createGeometry(batch), this.#group, batch.ranges, this));
        }

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


function createGeometry({ kind, material, out }) {
    const geometry = new THREE.BufferGeometry();

    // Lit materials need normals and only `vertexColors` materials read colours:
    // the defaults (unlit) do not pay for what they do not use.
    const needsNormals = !material.isMeshBasicMaterial;

    if (kind === 'building') {
        geometry.setAttribute('position', new THREE.BufferAttribute(out.positions.toFloat32Array(), 3));
        if (needsNormals)          geometry.setAttribute('normal', new THREE.BufferAttribute(out.normals.toFloat32Array(), 3));
        if (material.vertexColors) geometry.setAttribute('color',  new THREE.BufferAttribute(out.colorBytes(), 3, true));
        return geometry;
    }

    const positions = out.toFloat32Array();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (needsNormals) {
        const normals = new Float32Array(positions.length);
        for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    }
    return geometry;
}

/**
 * Shading baked into the buildings of one style (see {@link BuildingShading}).
 * The directional part is only baked for unlit materials: lit ones get it from the scene lights.
 * @param {import('../style/layers/Buildinglayer.js').BuildingLayer} style
 * @param {number} groundY - Local Y of the ground the buildings stand on.
 * @param {number} k       - Local units per (exaggerated) metre.
 */
function buildingShading(style, groundY, k) {
    return new BuildingShading({
        groundY,
        aoTop:            groundY + AMBIENT_OCCLUSION_HEIGHT_M * k,
        ambientOcclusion: style.ambientOcclusion ?? 0,
        wallShading:      style.material?.isMeshBasicMaterial ? (style.wallShading ?? 0) : 0,
    });
}

/** `featureStyle` functions that already threw (reported once each). */
const failingFeatureStyles = new WeakSet();

/**
 * Calls a user `featureStyle` function. If it throws, the building keeps its
 * default style and the error is reported once: a bug in the callback never
 * breaks the tiles.
 */
function callFeatureStyle(featureStyle, feature) {
    try {
        return featureStyle(feature);
    } catch (err) {
        if (!failingFeatureStyles.has(featureStyle)) {
            failingFeatureStyles.add(featureStyle);
            console.error('ThreeGeoPlay: buildingLayer.featureStyle threw; the buildings it failed on keep their default style', err);
        }
        return null;
    }
}

function scaled(points, scale) {
    const out = new Float64Array(points.length);
    for (let i = 0; i < points.length; i++) out[i] = points[i] * scale;
    return out;
}

function toFiniteNumber(value, fallback) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
