import * as THREE from 'three';

import { geoToTileXYFloat, tileSizeInMeters } from '../geo_utils/projection.js';
import { TileLayout }                         from '../config/MapConfig.js';
import fetchTileData                          from '../utils/fetchTileData.js';
import { isTileTemplate, resolveTileSource, templateSource, redactToken } from '../utils/tileSource.js';
import { Tile }                               from './Tile.js';
import { MeshBatches }                        from './MeshBatches.js';

/** Maximum number of tile downloads in flight. */
const MAX_CONCURRENT_FETCHES = 16;

/** Attempts per tile before giving up (until it leaves and re-enters the render area). */
const MAX_FETCH_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS  = 16000;

/**
 * Tiles are built in time slices of this length, yielding to the browser in
 * between, so a burst of downloaded tiles never freezes the frame loop.
 */
const BUILD_BUDGET_MS = 8;

const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

/** @enum {number} */
const State = Object.freeze({
    QUEUED:   0, // waiting for a download slot
    LOADING:  1, // download in flight
    WAITING:  2, // waiting to retry a failed download
    LOADED:   3, // payload available, first build pending
    READY:    4, // meshes on screen
    EMPTY:    5, // no data for this tile
    FAILED:   6, // gave up (download or build error)
});

/**
 * @typedef {Object} TileRecord
 * @property {string} key
 * @property {number} tx
 * @property {number} ty
 * @property {State}  state
 * @property {number} attempts
 * @property {AbortController|null} controller
 * @property {ReturnType<typeof setTimeout>|null} retryTimer
 * @property {Tile|null} tile
 * @property {boolean} buildPending
 */

/**
 * Loads, builds, places and disposes the tiles around the current map center.
 *
 * Changes are requested through {@link setCenterPosition}, {@link configChanged}
 * and {@link restyle}, and applied together by {@link update} (called once per
 * frame by {@link ThreeGeoPlay#onFrameUpdate}).
 *
 * @private
 */
export class TileManager {

    /** @type {import('../config/MapConfig.js').MapConfig} */
    #config;

    /** @type {THREE.Object3D} */
    #root;

    // Snapshot of the source / origin currently in use.
    #zoom = 0;

    /** @type {import('../utils/tileSource.js').TileSource|null} Resolved tile source (null while loading). */
    #source = null;
    #sourceKey = null;
    /** @type {AbortController|null} */
    #sourceRequest = null;
    #sourceRetry = null;
    #sourceAttempts = 0;
    #zoomWarned = null;
    #originFX = 0;
    #originFY = 0;
    #unitsPerMeter = 1;

    /** @type {{ x: number, z: number } | null} World position the map is centered on (`null` = origin). */
    #centerPos = null;
    #centerTX = null;
    #centerTY = null;

    /** @type {Map<string, TileRecord>} */
    #tiles = new Map();

    /** @type {TileRecord[]} Sorted farthest-first, so `pop()` returns the nearest tile. */
    #fetchQueue = [];
    #fetchQueueSorted = true;
    #activeFetches = 0;

    /** @type {TileRecord[]} */
    #buildQueue = [];
    #buildTimer = null;

    /** @type {THREE.Mesh|null} */
    #groundMesh = null;

    /** @type {MeshBatches} */
    #batches;

    #pending = { reset: true, origin: true, placement: true, needed: true, borders: false, restyle: false };
    #warnedStatuses = new Set();
    #destroyed = false;

    /** @type {(type: 'sourceload'|'sourceerror', detail: Object) => void} */
    #notify;

    /**
     * @param {import('../config/MapConfig.js').MapConfig} mapConfig
     * @param {THREE.Object3D} root - Parent object of all map meshes.
     * @param {(type: 'sourceload'|'sourceerror', detail: Object) => void} [notify] - Tile source events.
     */
    constructor(mapConfig, root, notify = () => {}) {
        this.#config  = mapConfig;
        this.#root    = root;
        this.#notify  = notify;
        this.#batches = new MeshBatches(root);
    }

    // ─── Requests (applied by update) ─────────────────────────────────────────

    /**
     * World position (X/Z) the map should be centered on; `null` centers it on the origin.
     * @param {{ x: number, z: number } | null} position
     */
    setCenterPosition(position) {
        this.#centerPos = position ? { x: position.x, z: position.z } : null;
    }

    /** @returns {{ x: number, z: number } | null} */
    get centerPosition() {
        return this.#centerPos ? { ...this.#centerPos } : null;
    }

    /**
     * Loading progress of the tiles in the current render area.
     * @returns {{ total: number, ready: number, empty: number, loading: number, failed: number }}
     */
    get stats() {
        const stats = { total: this.#tiles.size, ready: 0, empty: 0, loading: 0, failed: 0 };
        for (const record of this.#tiles.values()) {
            if (record.state === State.READY)       stats.ready++;
            else if (record.state === State.EMPTY)  stats.empty++;
            else if (record.state === State.FAILED) stats.failed++;
            else                                    stats.loading++;
        }
        return stats;
    }

    /**
     * Notifies the manager of modified {@link MapConfig} fields.
     * @param {Set<string>} fields
     */
    configChanged(fields) {
        const p = this.#pending;
        if (fields.has('zoomLevel') || fields.has('tileUrl') || fields.has('accessToken')) p.reset = true;
        if (fields.has('originLatLon'))                                      p.origin = true;
        if (fields.has('tileWorldSize') || fields.has('worldOriginOffset'))  p.placement = true;
        if (fields.has('renderDistance') || fields.has('tileLayout'))        p.needed = true;
        if (fields.has('showTileBorders'))                                   p.borders = true;
        if (fields.has('mapStyle') || fields.has('tileSchema'))              p.restyle = true;
    }

    /**
     * The resolved tile source, or `null` while it is loading.
     * @returns {import('../utils/tileSource.js').TileSource|null}
     */
    get source() {
        return this.#source ? { ...this.#source, tiles: [...this.#source.tiles], layers: [...this.#source.layers] } : null;
    }

    /**
     * Rebuilds every loaded tile (and the ground) with the current style.
     */
    restyle() {
        this.#pending.restyle = true;
    }

    // ─── Frame update ─────────────────────────────────────────────────────────

    /**
     * Applies all pending changes.
     */
    update() {
        if (this.#destroyed) return;
        const cfg = this.#config;
        const p   = this.#pending;

        if (p.reset) {
            for (const record of this.#tiles.values()) this.#discard(record);
            this.#tiles.clear();
            this.#fetchQueue   = [];
            this.#buildQueue   = [];
            this.#zoom         = cfg.zoomLevel;
            if (this.#sourceKey !== `${cfg.tileUrl}\n${cfg.accessToken}`) this.#resolveSource();
            else this.#checkZoomRange();
            this.#centerTX     = null;
            this.#centerTY     = null;
            p.origin = true;
        }

        if (p.origin) {
            const { lat, lon } = cfg.originLatLon;
            [this.#originFX, this.#originFY] = geoToTileXYFloat(lon, lat, this.#zoom);
            p.placement = true;
        }

        if (p.placement) {
            // Used for new builds only: a tileWorldSize change rescales existing tiles
            // uniformly (heights included), so they stay consistent without a rebuild.
            this.#unitsPerMeter = cfg.tileWorldSize / tileSizeInMeters(cfg.originLatLon.lat, this.#zoom);
            for (const record of this.#tiles.values()) {
                if (record.state === State.READY) this.#place(record);
            }
        }

        const size   = cfg.tileWorldSize;
        const offset = cfg.worldOriginOffset;
        const center = this.#centerPos ?? offset;
        const cx     = Math.floor(this.#originFX + (center.x - offset.x) / size);
        const cy     = Math.floor(this.#originFY + (center.z - offset.z) / size);
        const centerMoved = cx !== this.#centerTX || cy !== this.#centerTY;

        if (centerMoved || p.needed) {
            this.#centerTX = cx;
            this.#centerTY = cy;
            this.#applyNeededTiles();
        }

        if (p.borders) {
            for (const record of this.#tiles.values()) {
                if (record.state === State.READY) record.tile.setBorderVisible(cfg.showTileBorders);
            }
        }

        if (p.restyle) {
            for (const record of this.#tiles.values()) {
                if (record.state === State.READY) this.#enqueueBuild(record);
            }
        }

        if (p.restyle || p.placement || p.needed || centerMoved) this.#syncGround(p.restyle);

        p.reset = p.origin = p.placement = p.needed = p.borders = p.restyle = false;
    }

    /**
     * Aborts downloads, disposes every tile and the ground mesh.
     * The instance cannot be used afterwards.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        this.#sourceRequest?.abort();
        if (this.#sourceRetry !== null) clearTimeout(this.#sourceRetry);
        for (const record of this.#tiles.values()) this.#discard(record);
        this.#tiles.clear();
        this.#fetchQueue = [];
        this.#buildQueue = [];
        if (this.#buildTimer !== null) {
            clearTimeout(this.#buildTimer);
            this.#buildTimer = null;
        }
        if (this.#groundMesh) {
            this.#groundMesh.removeFromParent();
            this.#groundMesh.geometry.dispose();
            this.#groundMesh = null;
        }
        this.#batches.dispose();
    }

    // ─── Tile set ─────────────────────────────────────────────────────────────

    #applyNeededTiles() {
        const cfg        = this.#config;
        const R          = cfg.renderDistance;
        const isCircular = cfg.tileLayout === TileLayout.CIRCULAR;
        const r2         = R * R;
        const cx         = this.#centerTX;
        const cy         = this.#centerTY;
        const tileCount  = 2 ** this.#zoom;

        const needed = new Map();
        for (let ty = cy - R; ty <= cy + R; ty++) {
            if (ty < 0 || ty >= tileCount) continue; // beyond the poles
            for (let tx = cx - R; tx <= cx + R; tx++) {
                if (isCircular) {
                    const ccx = cx + 0.5;
                    const ccy = cy + 0.5;
                    const dx  = Math.max(tx, Math.min(ccx, tx + 1)) - ccx;
                    const dy  = Math.max(ty, Math.min(ccy, ty + 1)) - ccy;
                    if (dx * dx + dy * dy > r2) continue;
                }
                needed.set(`${tx}/${ty}`, [tx, ty]);
            }
        }

        for (const [key, record] of this.#tiles) {
            if (!needed.has(key)) {
                this.#discard(record);
                this.#tiles.delete(key);
            }
        }

        for (const [key, [tx, ty]] of needed) {
            if (this.#tiles.has(key)) continue;
            const record = {
                key, tx, ty,
                state:        State.QUEUED,
                attempts:     0,
                controller:   null,
                retryTimer:   null,
                tile:         null,
                buildPending: false,
            };
            this.#tiles.set(key, record);
        }

        this.#fetchQueue = [];
        for (const record of this.#tiles.values()) {
            if (record.state === State.QUEUED) this.#fetchQueue.push(record);
        }
        this.#fetchQueueSorted = false;
        this.#drainFetchQueue();

        // Build the nearest tiles first after the center moved.
        this.#buildQueue.sort(this.#fartherFirst);
    }

    /** Releases everything held by a record that left the render area. */
    #discard(record) {
        record.controller?.abort();
        record.controller = null;
        if (record.retryTimer !== null) {
            clearTimeout(record.retryTimer);
            record.retryTimer = null;
        }
        record.tile?.dispose();
        record.tile = null;
        record.buildPending = false;
    }

    #isCurrent(record) {
        return !this.#destroyed && this.#tiles.get(record.key) === record;
    }

    #fartherFirst = (a, b) => this.#distanceSq(b) - this.#distanceSq(a);

    #distanceSq(record) {
        const dx = record.tx - this.#centerTX;
        const dy = record.ty - this.#centerTY;
        return dx * dx + dy * dy;
    }

    #place(record) {
        const cfg    = this.#config;
        const size   = cfg.tileWorldSize;
        const offset = cfg.worldOriginOffset;
        record.tile.place(
            (record.tx - this.#originFX) * size + offset.x,
            (record.ty - this.#originFY) * size + offset.z,
            size,
        );
    }

    // ─── Downloads ────────────────────────────────────────────────────────────

    // ─── Tile source ──────────────────────────────────────────────────────────

    /** Resolves `tileUrl` (template, TileJSON, style or mapbox://); downloads wait for it. */
    #resolveSource() {
        const { tileUrl, accessToken } = this.#config;
        this.#sourceKey = `${tileUrl}\n${accessToken}`;
        this.#sourceRequest?.abort();
        this.#sourceRequest = null;
        if (this.#sourceRetry !== null) clearTimeout(this.#sourceRetry);
        this.#sourceRetry = null;
        this.#source = null;

        if (isTileTemplate(tileUrl)) {
            this.#source = templateSource(tileUrl, accessToken);
            this.#checkZoomRange();
            this.#notify('sourceload', { source: this.source });
            return;
        }

        const request = new AbortController();
        this.#sourceRequest = request;
        resolveTileSource(tileUrl, { accessToken, signal: request.signal }).then(source => {
            if (this.#sourceRequest !== request || this.#destroyed) return;
            this.#sourceRequest  = null;
            this.#sourceAttempts = 0;
            this.#source         = source;
            this.#checkZoomRange();
            this.#notify('sourceload', { source: this.source });
            this.#drainFetchQueue();
        }, err => {
            if (this.#sourceRequest !== request || this.#destroyed || err?.name === 'AbortError') return;
            this.#sourceRequest = null;
            this.#notify('sourceerror', { error: err, willRetry: !err?.permanent });
            if (err?.permanent) {
                console.error(err.message);
                return;
            }
            const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** this.#sourceAttempts++, RETRY_MAX_DELAY_MS * 2);
            console.warn(`ThreeGeoPlay: could not load the tile source (${err?.message ?? err}), retrying in ${(delay / 1000).toFixed(0)}s`);
            this.#sourceRetry = setTimeout(() => { this.#sourceRetry = null; this.#resolveSource(); }, delay);
        });
    }

    #checkZoomRange() {
        const source = this.#source;
        if (!source || this.#zoomWarned === this.#zoom) return;
        if (this.#zoom > source.maxZoom || this.#zoom < source.minZoom) {
            this.#zoomWarned = this.#zoom;
            console.warn(`ThreeGeoPlay: zoomLevel ${this.#zoom} is outside the zoom range of the tile source (${source.minZoom}–${source.maxZoom}): tiles will be missing. Use a zoomLevel in that range.`);
        }
    }

    #tileUrl(x, y) {
        const templates = this.#source.tiles;
        return templates[(x + y) % templates.length]
            .replaceAll('{z}', String(this.#zoom))
            .replaceAll('{x}', String(x))
            .replaceAll('{y}', String(y));
    }

    // ─── Downloads (continued) ────────────────────────────────────────────────

    #drainFetchQueue() {
        if (!this.#source) return;
        if (!this.#fetchQueueSorted) {
            this.#fetchQueue.sort(this.#fartherFirst);
            this.#fetchQueueSorted = true;
        }
        while (this.#activeFetches < MAX_CONCURRENT_FETCHES && this.#fetchQueue.length > 0) {
            const record = this.#fetchQueue.pop();
            if (this.#isCurrent(record) && record.state === State.QUEUED) this.#fetch(record);
        }
    }

    async #fetch(record) {
        const controller  = new AbortController();
        record.controller = controller;
        record.state      = State.LOADING;
        this.#activeFetches++;

        const tileCount = 2 ** this.#zoom;
        const x = ((record.tx % tileCount) + tileCount) % tileCount; // wrap across the antimeridian
        const url = this.#tileUrl(x, record.ty);

        try {
            const result = await fetchTileData(url, controller.signal);
            if (!this.#isCurrent(record)) return;

            if (result.status === 'ok') {
                record.tile  = new Tile(result.payload);
                record.state = State.LOADED;
                this.#enqueueBuild(record);
            } else {
                record.state = State.EMPTY;
                if (result.status === 'unavailable') this.#warnUnavailable(result.httpStatus, url);
            }
        } catch (err) {
            if (err?.name === 'AbortError' || !this.#isCurrent(record)) return;

            record.attempts++;
            if (record.attempts >= MAX_FETCH_ATTEMPTS) {
                record.state = State.FAILED;
                console.error(`ThreeGeoPlay: giving up on tile ${this.#zoom}/${x}/${record.ty} after ${record.attempts} attempts`, err);
                return;
            }

            const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (record.attempts - 1), RETRY_MAX_DELAY_MS)
                        * (0.75 + Math.random() * 0.5);
            console.warn(`ThreeGeoPlay: tile ${this.#zoom}/${x}/${record.ty} failed (${err?.message ?? err}), retrying in ${(delay / 1000).toFixed(1)}s`);
            record.state      = State.WAITING;
            record.retryTimer = setTimeout(() => {
                record.retryTimer = null;
                if (!this.#isCurrent(record)) return;
                record.state = State.QUEUED;
                this.#fetchQueue.push(record);
                this.#fetchQueueSorted = false;
                this.#drainFetchQueue();
            }, delay);
        } finally {
            if (record.controller === controller) record.controller = null;
            this.#activeFetches--;
            if (!this.#destroyed) this.#drainFetchQueue();
        }
    }

    #warnUnavailable(status, url) {
        if (this.#warnedStatuses.has(status)) return;
        this.#warnedStatuses.add(status);
        const hint = status === 401 || status === 403
            ? 'check the API key / access token of tileUrl'
            : 'tiles outside the provider coverage or zoom range are treated as empty';
        console.warn(`ThreeGeoPlay: tile provider answered HTTP ${status} for ${redactToken(url)} (${hint}). Further ${status} responses will not be logged.`);
    }

    // ─── Geometry building ────────────────────────────────────────────────────

    #enqueueBuild(record) {
        if (record.buildPending) return;
        record.buildPending = true;
        this.#buildQueue.push(record);
        this.#buildQueue.sort(this.#fartherFirst);
        if (this.#buildTimer === null) this.#buildTimer = setTimeout(this.#runBuildSlice, 0);
    }

    #runBuildSlice = () => {
        this.#buildTimer = null;
        if (this.#destroyed) return;

        const cfg = this.#config;
        const ctx = {
            mapStyle:      cfg.mapStyle,
            tileWorldSize: cfg.tileWorldSize,
            zoomScale:     2 ** (this.#zoom - 18),
            unitsPerMeter: this.#unitsPerMeter,
            showBorders:   cfg.showTileBorders,
            batches:       this.#batches,
            tileSchema:    cfg.tileSchema,
            sourceLayers:  this.#source?.layers ?? [],
        };

        const start = now();
        while (this.#buildQueue.length > 0 && now() - start < BUILD_BUDGET_MS) {
            const record = this.#buildQueue.pop();
            if (!record.buildPending || !this.#isCurrent(record) || !record.tile) continue;
            record.buildPending = false;

            try {
                record.tile.build(ctx);
                this.#place(record);
                if (record.state !== State.READY) {
                    this.#root.add(record.tile.object3D);
                    record.state = State.READY;
                }
            } catch (err) {
                console.error(`ThreeGeoPlay: tile ${this.#zoom}/${record.tx}/${record.ty} could not be built`, err);
                record.tile.dispose();
                record.tile  = null;
                record.state = State.FAILED;
            }
        }

        if (this.#buildQueue.length > 0) this.#buildTimer = setTimeout(this.#runBuildSlice, 0);
    };

    // ─── Ground ───────────────────────────────────────────────────────────────

    /** Creates, updates or removes the background plane under the loaded tiles. */
    #syncGround(styleChanged) {
        const cfg   = this.#config;
        const style = cfg.mapStyle.getStyleLayerByName('background');

        if (!style?.isVisible || !style.material) {
            if (this.#groundMesh) {
                this.#groundMesh.removeFromParent();
                this.#groundMesh.geometry.dispose();
                this.#groundMesh = null;
            }
            return;
        }

        if (!this.#groundMesh) {
            const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
            this.#groundMesh = new THREE.Mesh(geometry, style.material);
            this.#groundMesh.name = 'ThreeGeoPlayGround';
            this.#groundMesh.matrixAutoUpdate = false;
            this.#root.add(this.#groundMesh);
            styleChanged = true;
        }

        const ground = this.#groundMesh;
        if (styleChanged) {
            ground.material = style.material;
            const order = style.renderingOrder;
            if (order !== undefined && order !== null) {
                ground.material.depthTest = false;
                ground.renderOrder        = order;
            }
        }

        const size   = cfg.tileWorldSize;
        const offset = cfg.worldOriginOffset;
        const extent = (cfg.renderDistance * 2 + 1) * size;
        ground.position.set(
            (this.#centerTX - this.#originFX + 0.5) * size + offset.x,
            style.Y ?? 0,
            (this.#centerTY - this.#originFY + 0.5) * size + offset.z,
        );
        ground.scale.set(extent, 1, extent);
        ground.updateMatrix();
    }
}
