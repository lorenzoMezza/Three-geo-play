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

        for (const group of lineGroups) {
            const { style, layerName, lines } = group;
            const isLayerVisibile = this.#mapconfig.mapStyle.getStyleLayerByName(layerName).isVisible
            if(!isLayerVisibile){
                continue;
            }
            const jointSegs = style.jointSegments
           
            if (!style.isVisible) continue;
            

            if (!style.isVisible) continue;

            const lineWidth = style.lineWidth * tileSize * zoomScale;
            const roadY     = style.Y ?? 0;

            const outlineWidth = style.outlineWidth 
           
            if (outlineWidth > 0) {
                const borderWidth = lineWidth + outlineWidth * tileSize * zoomScale;
                const fillArr    = getOrCreate(fillVerts,    style.material,        style.renderingOrder);
                const outlineArr = getOrCreate(outlineVerts, style.outlineMaterial, style.renderingOrder);

                for (const line of lines) {
                    transformLineToAccumulators(
                        line,
                        lineWidth,
                        borderWidth,
                        jointSegs,
                        fillArr,
                        outlineArr,
                        roadY,
                        roadY
                    );
                }
            } else {
                const fillArr = getOrCreate(fillVerts, style.material, style.renderingOrder);

                for (const line of lines) {
                    for (const poly of transformLineInPolygon(line, lineWidth, jointSegs)) {
                        const n  = poly.length / 2;
                        const x0 = poly[0];
                        const z0 = poly[1];

                        for (let i = 1; i < n - 1; i++) {
                            fillArr.push(
                                x0,              roadY, z0,
                                poly[i * 2],     roadY, poly[i * 2 + 1],
                                poly[i * 2 + 2], roadY, poly[i * 2 + 3],
                            );
                        }
                    }
                }
            }
        }

        for (const [mat, data] of outlineVerts) {
            this.#addMesh(
                vertsToGeometry(data.verts),
                mat,
                this.#metaFor(mat, lineGroups, true,  'featureClass'),
                this.#metaFor(mat, lineGroups, true,  'layerName'),
                true,
                data.order
            );
        }

        for (const [mat, data] of fillVerts) {
            this.#addMesh(
                vertsToGeometry(data.verts),
                mat,
                this.#metaFor(mat, lineGroups, false, 'featureClass'),
                this.#metaFor(mat, lineGroups, false, 'layerName'),
                false,
                data.order + 0.001
            );
        }
    }

    #metaFor(mat, groups, isOutline, field) {
        for (const g of groups)
            if ((isOutline ? g.style.outlineMaterial : g.style.material) === mat)
                return g[field];
        return '';
    }


    #buildPolygonMeshes(polygonGroups) {
        if (polygonGroups.length === 0) return;

        const [tileX, tileY] = this.#positionXY;
        const tileSize       = this.#mapconfig.tileWorldSize;
        const clippingPlanes = this.#makeTileClippingPlanes(tileX, tileY, tileSize);

        const flatGroups     = [];
        const extrudedGroups = [];

        for (const group of polygonGroups) {
            if (group.layerName === 'transportation') continue;
            if (!group.style.isVisible) continue;
            if (!group.style.material) {
                console.warn(`ThreeGeoPlay: material undefined for ${group.featureClass}/${group.layerName}`);
                continue;
            }

            const isBuilding = group.style.material.transparent && group.style.height != null;
            (isBuilding ? extrudedGroups : flatGroups).push(group);
        }

        this.#buildFlatGroups(flatGroups);
        this.#buildExtrudedGroups(extrudedGroups, clippingPlanes);
    }


    #buildFlatGroups(flatGroups) {
        if (flatGroups.length === 0) return;

        // Map<material, { verts, featureClass, layerName, renderingOrder }>
        const accumByMat = new Map();

        for (const { style, layerName, featureClass, features } of flatGroups) {
            if (!style.isVisible) continue;

            if (!accumByMat.has(style.material)) {
                accumByMat.set(style.material, {
                    verts:          [],
                    featureClass,
                    layerName,
                    renderingOrder: style.renderingOrder ?? null,
                });
            }

            const { verts } = accumByMat.get(style.material);
            const y = style.Y ?? 0;

            for (const { rings } of features) {
                if (rings.length === 0 || rings[0].length < 6) continue;
                this.#earcutInto(rings, verts, y);
            }
        }

        for (const [mat, { verts, featureClass, layerName, renderingOrder }] of accumByMat) {
            if (verts.length === 0) continue;
            this.#addMesh(vertsToGeometry(verts), mat, featureClass, layerName, false, renderingOrder);
        }
    }


    #buildExtrudedGroups(extrudedGroups, clippingPlanes) {
        if (extrudedGroups.length === 0) return;

        const tileSize   = this.#mapconfig.tileWorldSize;
        const accumByMat = new Map();

        for (const { style, layerName, featureClass, features } of extrudedGroups) {
            if (!style.isVisible) continue;

            if (!accumByMat.has(style.material)) {
                const clonedMat          = style.material.clone();
                clonedMat.clippingPlanes = clippingPlanes;
                accumByMat.set(style.material, {
                    verts:  [],
                    clonedMat,
                    featureClass,
                    layerName,
                    // buildings intentionally excluded from renderingOrder
                });
            }

            const { verts } = accumByMat.get(style.material);
            const extrusionScale = (style.height ?? 0.05) * tileSize;
            const baseY     = style.Y ?? 0;

            for (const { rings, properties } of features) {
                if (rings.length === 0 || rings[0].length < 6) continue;

                const renderHeight    = properties.get('render_height')     ?? 10;
                const renderMinHeight = properties.get('render_min_height') ?? 0;
                const yTop  = baseY + Math.max(0, renderHeight)    * extrusionScale;
                const yBase = baseY + Math.max(0, renderMinHeight) * extrusionScale;

                this.#buildExtrudedVerts(rings, yBase, yTop, verts);
            }
        }

        for (const [, { verts, clonedMat, featureClass, layerName }] of accumByMat) {
            if (verts.length === 0) { clonedMat.dispose(); continue; }
            // renderingOrder intentionally omitted for 3D buildings
            this.#addMesh(vertsToGeometry(verts), clonedMat, featureClass, layerName, false);
        }
    }


    #earcutInto(rings, verts, y) {
        let flat, holeIndices;

        if (rings.length === 1) {
            flat        = rings[0];
            holeIndices = null;
        } else {
            holeIndices  = [];
            let totalLen = rings[0].length;
            for (let i = 1; i < rings.length; i++) {
                holeIndices.push(totalLen / 2);
                totalLen += rings[i].length;
            }
            flat = new Float32Array(totalLen);
            let off = 0;
            for (const ring of rings) { flat.set(ring, off); off += ring.length; }
        }

        const indices = earcut(flat, holeIndices, 2);
        for (const idx of indices) verts.push(flat[idx * 2], y, flat[idx * 2 + 1]);
    }


    #buildExtrudedVerts(rings, yBase, yTop, verts) {
        const { flat, indices } = this.#earcutFlat(rings);
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i] * 2, b = indices[i + 1] * 2, c = indices[i + 2] * 2;
            verts.push(flat[c], yTop, flat[c + 1]);
            verts.push(flat[b], yTop, flat[b + 1]);
            verts.push(flat[a], yTop, flat[a + 1]);
        }

        for (const ring of rings) {
            const n = ring.length / 2;
            for (let i = 0; i < n; i++) {
                const j  = (i + 1) % n;
                const x0 = ring[i * 2], z0 = ring[i * 2 + 1];
                const x1 = ring[j * 2], z1 = ring[j * 2 + 1];
                verts.push(x0, yTop,  z0,  x1, yBase, z1,  x0, yBase, z0);
                verts.push(x0, yTop,  z0,  x1, yTop,  z1,  x1, yBase, z1);
            }
        }
    }


    #earcutFlat(rings) {
        if (rings.length === 1)
            return { flat: rings[0], indices: earcut(rings[0], null, 2) };

        const holeIndices = [];
        let totalLen = rings[0].length;
        for (let i = 1; i < rings.length; i++) {
            holeIndices.push(totalLen / 2);
            totalLen += rings[i].length;
        }
        const flat = new Float32Array(totalLen);
        let off = 0;
        for (const ring of rings) { flat.set(ring, off); off += ring.length; }
        return { flat, indices: earcut(flat, holeIndices, 2) };
    }


    #makeTileClippingPlanes(tileX, tileY, size) {
        const corners = [
            new THREE.Vector3(tileX,        0, tileY + size),
            new THREE.Vector3(tileX + size, 0, tileY + size),
            new THREE.Vector3(tileX + size, 0, tileY),
            new THREE.Vector3(tileX,        0, tileY),
        ];
        const up = new THREE.Vector3(0, 1, 0);
        return corners.map((a, i) => {
            const b      = corners[(i + 1) % 4];
            const edge   = new THREE.Vector3().subVectors(b, a);
            const normal = new THREE.Vector3().crossVectors(edge, up).normalize().negate();
            return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, a);
        });
    }


    #addMesh(geometry, material, featureClass, layerName, isOutline, renderOrder) {
        const mesh                 = new THREE.Mesh(geometry, material);
        mesh.userData.featureClass = featureClass;
        mesh.userData.layerName    = layerName;
        mesh.userData.isOutline    = isOutline;
        if (renderOrder !== undefined && renderOrder !== null) {
            mesh.material.depthTest = false;
            mesh.renderOrder        = renderOrder;
        }
        this.tileMeshes.push(mesh);
        this.#scene.add(mesh);
    }
}