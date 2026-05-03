import * as THREE from 'three';

import { decodeVectorTile }     from '../utils/vectorTile.js';
import { TileFeatureCollector } from '../utils/TileFeatureCollector.js';
import { FloatArrayBuilder }    from '../geom_utils/FloatArrayBuilder.js';
import { appendThickLine }      from '../geom_utils/lineGeometry.js';
import { simplifyLine }         from '../geom_utils/RDPalgoritm.js';
import { LineLayering, lineLevel } from './lineLayering.js';
import {
    classifyRings,
    clipPolygon,
    appendFlatPolygon,
    appendExtrudedPolygon,
} from '../geom_utils/polygonGeometry.js';


const TILE_BORDER_MATERIAL = new THREE.LineBasicMaterial({
    color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8,
});

const BORDER_Y = 0.01;

/** Height used for buildings without height data, in metres. */
const DEFAULT_BUILDING_HEIGHT_M = 10;

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
 * Geometry is built in tile-local coordinates (the tile spans `[0, size]` on
 * X and Z) and handed to the shared {@link MeshBatches}; the tile transform
 * (position + scale) is applied per instance, so moving or rescaling a tile
 * never touches its vertices.
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

    /** World tile size the current geometry was built with. */
    #builtSize = 1;

    /**
     * @param {Uint8Array} payload - Raw MVT bytes.
     */
    constructor(payload) {
        this.#payload                = payload;
        this.#group.name             = 'ThreeGeoPlayTile';
        this.#group.matrixAutoUpdate = false;
    }

    /** @type {THREE.Group} */
    get object3D() { return this.#group; }

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

        const size    = ctx.tileWorldSize;
        const batches = new Map();
        const batchFor = (kind, material, renderOrder) => {
            const key = `${kind}|${material.id}|${renderOrder}`;
            let batch = batches.get(key);
            if (!batch) {
                batch = { kind, material, renderOrder, out: new FloatArrayBuilder() };
                batches.set(key, batch);
            }
            return batch.out;
        };

        // ── lines ────────────────────────────────────────────────────────────
        const layering = new LineLayering(ctx.mapStyle);
        for (const { style, feature, extent, ramp: isRamp } of lines) {
            const width = style.lineWidth * size * ctx.zoomScale;
            if (!(width > 0)) continue;

            const props        = feature.properties;
            const level        = lineLevel(props);
            const roundEnds    = level === 0;   // bridges / tunnels end flat on the road they join
            const outlineExtra = style.outlineWidth * size * ctx.zoomScale;
            const fillOut      = batchFor('line', style.material, layering.fillOrder(style, level, isRamp));
            const outlineOut   = outlineExtra > 0 && style.outlineMaterial
                ? batchFor('outline', style.outlineMaterial, layering.outlineOrder(style, level))
                : null;
            const scale     = size / extent;
            const tolerance = LINE_SIMPLIFY_TOLERANCE * extent;
            const arcError  = tolerance * scale;   // round caps / joins: same accuracy as the simplification

            for (const part of feature.loadGeometry()) {
                const line = scaled(simplifyLine(part, tolerance), scale);
                appendThickLine(fillOut, line, width, style.jointSegments, style.Y, roundEnds, arcError);
                if (outlineOut) {
                    appendThickLine(outlineOut, line, width + outlineExtra, style.jointSegments, style.Y, roundEnds, arcError);
                }
            }
        }

        // ── flat polygons ────────────────────────────────────────────────────
        for (const { style, feature, extent } of polygons) {
            const out    = batchFor('polygon', style.material, style.renderingOrder);
            const margin = CLIP_MARGIN * extent;
            for (const polygon of classifyRings(feature.loadGeometry())) {
                const clipped = clipPolygon(polygon, -margin, extent + margin);
                if (clipped) appendFlatPolygon(out, clipped, size / extent, style.Y);
            }
        }

        // ── buildings ────────────────────────────────────────────────────────
        for (const { style, feature, extent } of buildings) {
            const props     = feature.properties;
            const k         = ctx.unitsPerMeter * style.height;
            const height    = toFiniteNumber(props.render_height ?? props.height, DEFAULT_BUILDING_HEIGHT_M);
            const minHeight = toFiniteNumber(props.render_min_height ?? props.min_height, 0);
            const yTop      = style.Y + Math.max(0, height) * k;
            const yBase     = style.Y + Math.max(0, minHeight) * k;
            if (yTop < yBase) continue;

            const out    = batchFor('building', style.material, null);
            const margin = CLIP_MARGIN * extent;
            const min    = -margin;
            const max    = extent + margin;
            for (const polygon of classifyRings(feature.loadGeometry())) {
                const clipped = clipPolygon(polygon, min, max);
                if (clipped) appendExtrudedPolygon(out, clipped, size / extent, yBase, yTop, min, max);
            }
        }

        // Add the new geometry before removing the old one: no empty frame.
        const handles = [];
        for (const batch of batches.values()) {
            if (batch.out.length > 0) handles.push(ctx.batches.add(batch, createGeometry(batch), this.#group));
        }

        this.#removeGeometry();
        this.#handles   = handles;
        this.#builtSize = size;

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
        this.#group.scale.setScalar(tileWorldSize / this.#builtSize);
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
        const s = this.#builtSize;
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
    const positions = out.toFloat32Array();
    const geometry  = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Lit materials need normals; unlit ones (the defaults) do not pay for them.
    if (!material.isMeshBasicMaterial) {
        if (kind === 'building') {
            geometry.computeVertexNormals();
        } else {
            const normals = new Float32Array(positions.length);
            for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        }
    }
    return geometry;
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
