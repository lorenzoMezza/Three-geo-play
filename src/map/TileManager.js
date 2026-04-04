import { geoToTileXY, geoToTileXYFloat } from '../geo_utils/projection.js';
import { TileLayout }                    from '../config/MapConfig.js';
import fetchTileData                     from '../utils/fetchTileData.js';
import { Tile }                          from './Tile.js';
import * as THREE                        from 'three';

export class TileManager {

    #mapConfig = null;

    #originLatLon = null;

    #zoomLevel = null;

    #tileProviderUrl = null;

    #originTileX = null;

    #originTileY = null;

    #scene = null;

    #subTileOffsetX = 0;

    #subTileOffsetY = 0;

    #lastCenterTileX = null;

    #lastCenterTileY = null;

    #lastTileWorldSize = null;

    #doneTiles = new Map();

    #pendingTiles = new Map();

    #fetchQueue = [];

    #activeFetches = 0;

    #maxConcurrentFetches = 100;

    #groundMesh = null;

    constructor(mapConfig, scene) {
        this.#mapConfig         = mapConfig;
        this.#originLatLon      = mapConfig.originLatLon;
        this.#zoomLevel         = mapConfig.zoomLevel;
        this.#tileProviderUrl   = mapConfig.pbfTileProviderZXYurl;
        this.#scene             = scene;
        this.#lastTileWorldSize = mapConfig.tileWorldSize;

        this.#initGroundMesh();
    }

    #initGroundMesh() {
        const style = this.#mapConfig.mapStyle.getStyleLayerByName('background');
        if (style.isVisible) {
            const material = style?.material;

            const geo        = new THREE.PlaneGeometry(1, 1);
            this.#groundMesh = new THREE.Mesh(geo, material);
            this.#groundMesh.rotation.x = -Math.PI / 2;
            this.#groundMesh.position.y = style?.Y ?? 0;

            if (style.renderingOrder !== undefined && style.renderingOrder !== null) {
                this.#groundMesh.material.depthTest = false;
                this.#groundMesh.renderOrder        = style.renderingOrder;
            }

            this.#scene.add(this.#groundMesh);
        }
    }

    #updateGroundMesh(centerWorldX, centerWorldZ) {
        if (!this.#groundMesh) return;
        const size = (this.#mapConfig.renderDistance * 2 + 1) * this.#mapConfig.tileWorldSize;
        this.#groundMesh.scale.set(size, size, 1);
        this.#groundMesh.position.x = centerWorldX;
        this.#groundMesh.position.z = centerWorldZ;
    }

    async init() {
        const { lon, lat } = this.#originLatLon;
        const zoom         = this.#zoomLevel;



        if (lon < -180 || lon > 180)             console.warn('ThreeGeoPlay: lon out of range [-180, 180]:', lon);
        if (lat < -85.051129 || lat > 85.051129) console.warn('ThreeGeoPlay: lat out of range[-85.05, 85.05]:', lat);

        const [ox, oy] = geoToTileXY(lon, lat, zoom);
   

        if (isNaN(ox) || isNaN(oy)) {
            console.error('ThreeGeoPlay: tile origine NaN');
            return;
        }

        const maxTile = 2 ** zoom;
        if (ox < 0 || oy < 0)              console.warn('ThreeGeoPlay: negative tile origin');
        if (ox >= maxTile || oy >= maxTile) console.warn('ThreeGeoPlay: tile origin out of OSM grid');

        this.#originTileX = ox;
        this.#originTileY = oy;

        const [fox, foy]     = geoToTileXYFloat(lon, lat, zoom);
        this.#subTileOffsetX = fox - ox;
        this.#subTileOffsetY = foy - oy;


        this.#applyCenter(ox, oy);
    }

    updateCenter(lat, lon) {
        const [cx, cy] = geoToTileXY(lon, lat, this.#zoomLevel);
        this.#applyCenter(cx, cy);
    }

    updateCenterFromPosition(x, z) {
        const { originLatLon, tileWorldSize, zoomLevel, worldOriginOffset: offset } = this.#mapConfig;
        const [ox, oy] = geoToTileXY(originLatLon.lon, originLatLon.lat, zoomLevel);
        const cx = Math.floor(ox + (x - offset.x) / tileWorldSize);
        const cy = Math.floor(oy + (z - offset.z) / tileWorldSize);

        if (cx === this.#lastCenterTileX && cy === this.#lastCenterTileY) return;
        this.#lastCenterTileX = cx;
        this.#lastCenterTileY = cy;
        this.#applyCenter(cx, cy);
    }

    updateBorders() {
        for (const [, entry] of this.#doneTiles) {
            entry.tile?.updateBorderVisibility();
        }
    }

    rescaleTiles(newSize) {
        if (!this.#lastTileWorldSize || this.#lastTileWorldSize === newSize) return;
        const ratio = newSize / this.#lastTileWorldSize;
        for (const [, entry] of this.#doneTiles) {
            entry.tile?.scaleMeshes(ratio);
        }
        this.#lastTileWorldSize = newSize;

        if (this.#lastCenterTileX !== null) {
            const offset = this.#mapConfig.worldOriginOffset;
            const dx     = this.#lastCenterTileX - this.#originTileX;
            const dy     = this.#lastCenterTileY - this.#originTileY;
            const cx     = (dx - this.#subTileOffsetX) * newSize + offset.x;
            const cz     = (dy - this.#subTileOffsetY) * newSize + offset.z;
            this.#updateGroundMesh(cx, cz);
        }
    }

    applyCenter() {
        if (this.#lastCenterTileX === null || this.#originTileX === null) {
            return;
        }
        this.#applyCenter(this.#lastCenterTileX, this.#lastCenterTileY);
    }

    updateMaterials() {
        for (const [, entry] of this.#doneTiles) {
            entry.tile?.refreshMaterials();
        }
        const style = this.#mapConfig.mapStyle.getStyleLayerByName('background');
        if (style?.material && this.#groundMesh) {
            this.#groundMesh.material = style.material;
        }
    }

    #applyCenter(centerTileX, centerTileY) {
        const renderDistance = this.#mapConfig.renderDistance;
        const tileWorldSize  = this.#mapConfig.tileWorldSize;
        const offset         = this.#mapConfig.worldOriginOffset;
        const isCircular     = this.#mapConfig.tileLayout === TileLayout.CIRCULAR;
        const r2             = renderDistance * renderDistance;

        const needed = new Map();
        for (let tx = centerTileX - renderDistance; tx <= centerTileX + renderDistance; tx++) {
            for (let ty = centerTileY - renderDistance; ty <= centerTileY + renderDistance; ty++) {
                const cdx = tx - centerTileX;
                const cdy = ty - centerTileY;

                if (isCircular) {
                    const cx       = centerTileX + 0.5;
                    const cy       = centerTileY + 0.5;
                    const nearestX = Math.max(tx, Math.min(cx, tx + 1));
                    const nearestZ = Math.max(ty, Math.min(cy, ty + 1));
                    const dx       = nearestX - cx;
                    const dz       = nearestZ - cy;
                    if (dx * dx + dz * dz > r2) continue;
                }

                const dx  = tx - this.#originTileX;
                const dy  = ty - this.#originTileY;
                const key = `${dx}_${dy}`;

                const worldX = (dx - this.#subTileOffsetX) * tileWorldSize + offset.x;
                const worldZ = (dy - this.#subTileOffsetY) * tileWorldSize + offset.z;

                needed.set(key, { tx, ty, worldX, worldZ, dist: cdx * cdx + cdy * cdy });
            }
        }

        const centerWorldX = (centerTileX - this.#originTileX - this.#subTileOffsetX + 0.5) * tileWorldSize + offset.x;
        const centerWorldZ = (centerTileY - this.#originTileY - this.#subTileOffsetY + 0.5) * tileWorldSize + offset.z;
        this.#updateGroundMesh(centerWorldX, centerWorldZ);

        for (const [key, controller] of this.#pendingTiles) {
            if (!needed.has(key)) {
                controller.abort();
                this.#pendingTiles.delete(key);
            }
        }

        for (const [key, entry] of this.#doneTiles) {
            if (!needed.has(key)) {
                entry.dispose();
                this.#doneTiles.delete(key);
            }
        }

        this.#fetchQueue = [];
        for (const [key, data] of needed) {
            if (!this.#doneTiles.has(key) && !this.#pendingTiles.has(key)) {
                this.#fetchQueue.push({ key, ...data });
            }
        }
        this.#fetchQueue.sort((a, b) => a.dist - b.dist);

        this.#drainQueue();
    }

    #drainQueue() {
        while (this.#activeFetches < this.#maxConcurrentFetches && this.#fetchQueue.length > 0) {
            const item = this.#fetchQueue.shift();
            if (this.#doneTiles.has(item.key) || this.#pendingTiles.has(item.key)) continue;
            this.#activeFetches++;
            this.#fetchTile(item);
        }
    }


async #fetchTile({ key, tx, ty, worldX, worldZ }) {
    const controller = new AbortController();
    this.#pendingTiles.set(key, controller);

    const url = this.#tileProviderUrl
        .replace('{z}', this.#zoomLevel)
        .replace('{x}', tx)
        .replace('{y}', ty);

    let result;

    try {

        try {
            result = await fetchTileData(url, key, controller.signal);
        } catch (err) {
            if (err.name === 'AbortError') {
                return; 
            }

            console.error(`ThreeGeoPlay: Fetch ${tx}/${ty} failed, retrying in 3 or 5 seconds...`, err);
            const n = Math.floor(Math.random() * 4) + 3;
            await new Promise(resolve => setTimeout(resolve, n  * 1000));

      
            if (!this.#pendingTiles.has(key) || controller.signal.aborted) {
                return;
            }

  
            this.#fetchQueue.unshift({ key, tx, ty, worldX, worldZ, dist: 0 });
            return;
        }

        if (!result || this.#doneTiles.has(key) || !this.#pendingTiles.has(key)) {
            return;
        }

        try {
            const tile = new Tile(
                [worldX, worldZ],
                result.payload,
                this.#scene,
                this.#mapConfig
            );

            await tile.render(controller.signal);

            this.#doneTiles.set(key, {
                tile,
                dispose: () => tile.destroy(),
            });

        } catch (err) {
            if (err.name === 'AbortError') {
                return;
            }

            console.error(`ThreeGeoPlay: Tile ${tx}/${ty} render failed (no retry)`, err);
        }

    } finally {

        this.#pendingTiles.delete(key);
        this.#activeFetches--;
        this.#drainQueue();
    }
}

    destroy() {
        for (const [, c] of this.#pendingTiles) c.abort();
        for (const [, t] of this.#doneTiles)    t.dispose();
        this.#pendingTiles.clear();
        this.#doneTiles.clear();
        this.#fetchQueue    = [];
        this.#activeFetches = 0;

        if (this.#groundMesh) {
            this.#scene.remove(this.#groundMesh);
            this.#groundMesh.geometry.dispose();
            this.#groundMesh = null;
        }
    }
}