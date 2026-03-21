import * as THREE from 'three';

import { deserializeMVT }       from '../utils/deserializeProtobuf';
import { TileFeatureCollector } from '../utils/TileFeatureCollector';
import { earcut }               from '../geom_utils/earcut';
import {
    transformLineToAccumulators,
    transformLineInPolygon,
    vertsToGeometry,
} from '../geom_utils/generatePolygonGeometry';


const TILE_BORDER_MATERIAL = new THREE.LineBasicMaterial({
    color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8,
});


export class Tile {

    tileMeshes   = [];
    #positionXY  = null;
    #scene       = null;
    #mapconfig   = null;
    #tileData    = null;
    #borderLines = null;

    constructor(positionXY, tileData, scene, mapconfig) {
        this.#positionXY = positionXY;
        this.#scene      = scene;
        this.#mapconfig  = mapconfig;
        this.#tileData   = tileData;
    }

    async render() {
        let protoTile;
        try {
            protoTile = deserializeMVT(this.#tileData);
        } catch (err) {
            console.error('ThreeGeoPlay: deserialization error:', err);
            return;
        }

        const collector = new TileFeatureCollector(this.#positionXY, this.#mapconfig);
        const result    = collector.collect(protoTile);
        if (!result) return;

        this.#buildLineMeshes(result.lineGroups);
        this.#buildPolygonMeshes(result.polygonGroups);
        this.#buildBorderLines();
    }

    updateBorderVisibility() {
        if (this.#mapconfig.showTileBorders) {
            if (!this.#borderLines) this.#buildBorderLines();
        } else if (this.#borderLines) {
            this.#scene.remove(this.#borderLines);
            this.#borderLines.geometry.dispose();
            this.#borderLines = null;
        }
    }

    scaleMeshes(ratio) {
        for (const mesh of this.tileMeshes) mesh.scale.multiplyScalar(ratio);
        this.#borderLines?.scale.multiplyScalar(ratio);
    }

    refreshMaterials() {
        for (const mesh of this.tileMeshes) {
            const { featureClass, isOutline, layerName } = mesh.userData;
            if (!featureClass) continue;
            const style = this.#mapconfig.mapStyle
                .getStyleLayerByName(layerName)
                ?.getTypeByName(featureClass);
            if (!style) continue;
            mesh.material = isOutline ? style.outlineMaterial : style.material;
        }
    }

    destroy() {
        for (const mesh of this.tileMeshes) {
            this.#scene.remove(mesh);
            mesh.geometry?.dispose();
        }
        if (this.#borderLines) {
            this.#scene.remove(this.#borderLines);
            this.#borderLines.geometry.dispose();
            this.#borderLines = null;
        }
        this.tileMeshes = [];
    }


    #buildBorderLines() {
        const [wx, wz] = this.#positionXY;
        const size = this.#mapconfig.tileWorldSize;
        const y    = 0.01;
        const corners = new Float32Array([
            wx,        y, wz,
            wx + size, y, wz,
            wx + size, y, wz + size,
            wx,        y, wz + size,
            wx,        y, wz,
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(corners, 3));
        this.#borderLines         = new THREE.Line(geo, TILE_BORDER_MATERIAL);
        this.#borderLines.visible = this.#mapconfig.showTileBorders;
        this.#scene.add(this.#borderLines);
    }


    #buildLineMeshes(lineGroups) {

       
        if (lineGroups.length === 0) return;

        const tileSize  = this.#mapconfig.tileWorldSize;
        const zoomScale = this.#mapconfig.zoomScaleFactor;

        // Map<material, { verts: [], order }>
        const outlineVerts = new Map();
        const fillVerts    = new Map();

        const getOrCreate = (map, material, order) => {
            if (!map.has(material)) {
                map.set(material, { verts: [], order: order ?? 0 });
            }
            return map.get(material).verts;
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