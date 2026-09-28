import * as THREE from 'three';

import { geoToTileXYFloat, tileSizeInMeters } from '../geo_utils/projection.js';
import { TileLayout }                         from '../config/MapConfig.js';
import fetchTileData                          from '../utils/fetchTileData.js';
import { isTileTemplate, resolveTileSource, templateSource, redactToken } from '../utils/tileSource.js';
import { Tile }                               from './Tile.js';
import { MeshBatches }                        from './MeshBatches.js';
import { drawWithoutDepthWrite }              from './drawHooks.js';

/** Missing tiles in a row, with none found, after which the tile URL is reported as wrong. */
const MISSING_TILES_TO_REPORT = 8;

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

/**
 * The ground depth plane is drawn before everything else, so the whole scene
 * is depth tested against the ground.
 */
const GROUND_DEPTH_RENDER_ORDER = -Number.MAX_SAFE_INTEGER;

const noRaycast = () => {};

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

    /** Unit plane shared by the ground meshes (background, depth, shadows). */
    #planeGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    /** @type {THREE.Mesh|null} Background colour plane. */
    #groundMesh = null;

    /** @type {THREE.Mesh|null} Invisible plane writing the depth of the ground ({@link MapConfig#occludeBelowGround}). */
    #groundDepthMesh = null;

    /** Material of {@link #groundDepthMesh}: depth only, pushed slightly back so the map layers lying on it always pass. */
    #groundDepthMaterial = new THREE.MeshBasicMaterial({
        colorWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });

    /** @type {THREE.Mesh|null} Ground shadows ({@link MapStyle#shadowLayer}). */
    #shadowMesh = null;

    /** Whether the renderer draws shadow maps (the shadow plane is useless otherwise). */
    #shadowsEnabled = false;

    /** `vertexColors` of the building material the loaded buildings were built for. */
    #buildingVertexColors;

    /** Layers mask last applied to the map objects (they follow the root's). */
    #layersMask;

    /** @type {MeshBatches} */
    #batches;

    #pending = { reset: true, origin: true, placement: true, needed: true, borders: false, restyle: false, ground: false };
    #warnedStatuses = new Set();
    /** Tiles downloaded with data / refused, since the source was set: spots a wrong tile URL. */
    #tilesFound   = 0;
    #tilesRefused = 0;
    #reportedRefusal = false;
    #destroyed = false;

    /** @type {(type: 'sourceload'|'sourceerror'|'tileload'|'tileunload', detail: Object) => void} */
    #notify;

    /**
     * @param {import('../config/MapConfig.js').MapConfig} mapConfig
     * @param {THREE.Object3D} root - Parent object of all map meshes.
     * @param {(type: 'sourceload'|'sourceerror'|'tileload'|'tileunload', detail: Object) => void} [notify] - Map events.
     */
    constructor(mapConfig, root, notify = () => {}) {
        this.#config  = mapConfig;
        this.#root    = root;
        this.#notify  = notify;
        this.#layersMask = root.layers.mask;
        this.#batches = new MeshBatches(root);
        this.#buildingVertexColors = !!mapConfig.mapStyle.buildingLayer.material?.vertexColors;
        this.#groundDepthMaterial.name = 'ThreeGeoPlayGroundDepth';
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
     * @returns {{ total: number, ready: number, empty: number, loading: number, failed: number, rebuilding: number }}
     */
    get stats() {
        const stats = { total: this.#tiles.size, ready: 0, empty: 0, loading: 0, failed: 0, rebuilding: 0 };
        for (const record of this.#tiles.values()) {
            if (record.state === State.READY) {
                stats.ready++;
                if (record.buildPending) stats.rebuilding++;
            }
            else if (record.state === State.EMPTY)  stats.empty++;
            else if (record.state === State.FAILED) stats.failed++;
            else                                    stats.loading++;
        }
        // A style change is applied on the next update: count it as pending already.
        if (this.#pending.restyle) stats.rebuilding = stats.ready;
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
        if (fields.has('occludeBelowGround'))                                p.ground = true;
    }

    /**
     * Whether the renderer draws shadow maps: the ground shadow plane is only drawn then.
     * @param {boolean} enabled
     */
    setShadowsEnabled(enabled) {
        this.#shadowsEnabled = !!enabled;
        if (this.#shadowMesh) this.#shadowMesh.visible = this.#shadowsEnabled;
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

    /**
     * Public descriptions of the tiles on screen.
     * @returns {Object[]}
     */
    get tiles() {
        const tiles = [];
        for (const record of this.#tiles.values()) {
            if (record.state === State.READY) tiles.push(record.tile.info);
        }
        return tiles;
    }

    /**
     * Height of the buildings at a map-space position (see {@link ThreeGeoPlay#getHeightAt}).
     * @param {number} x
     * @param {number} z
     * @returns {number} Top of the highest building part there, 0 on open ground or where no tile is loaded.
     */
    heightAt(x, z) {
        const cfg    = this.#config;
        const size   = cfg.tileWorldSize;
        const offset = cfg.worldOriginOffset;
        const fx = this.#originFX + (x - offset.x) / size;
        const fy = this.#originFY + (z - offset.z) / size;
        const tx = Math.floor(fx);
        const ty = Math.floor(fy);
        const record = this.#tiles.get(`${tx}/${ty}`);
        if (!record || record.state !== State.READY) return 0;
        const frame = record.tile.size;
        const top   = record.tile.heightAt((fx - tx) * frame, (fy - ty) * frame);
        return top === null ? 0 : top * (size / frame);
    }

    /**
     * The map feature drawn at a raycast intersection (see {@link ThreeGeoPlay#getFeatureAt}).
     * @param {THREE.Intersection} intersection
     * @returns {Object|null}
     */
    featureAt(intersection) {
        const hit = this.#batches.featureAt(intersection);
        if (!hit || !hit.tile.info) return null;
        const { feature: item, tile } = hit;
        return {
            layer:       item.layer,
            type:        item.type,
            style:       item.style,
            sourceLayer: item.sourceLayer,
            id:          item.feature.id,
            properties:  item.feature.properties,
            tile:        tile.info,
            getGeometry: () => tile.featureGeometry(item.feature, item.extent),
        };
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

        // Buildings carry colours only for `vertexColors` materials: rebuild them when the flag changes.
        const vertexColors = !!cfg.mapStyle.buildingLayer.material?.vertexColors;
        if (vertexColors !== this.#buildingVertexColors) {
            this.#buildingVertexColors = vertexColors;
            p.restyle = true;
        }

        if (p.restyle) {
            for (const record of this.#tiles.values()) {
                if (record.state === State.READY) this.#enqueueBuild(record);
            }
        }

        if (p.restyle || p.placement || p.needed || p.ground || centerMoved) this.#syncGround();

        // Map objects follow the layers of the map group (THREE.Layers are not inherited).
        if (this.#root.layers.mask !== this.#layersMask) {
            this.#layersMask = this.#root.layers.mask;
            this.#root.traverse(object => {
                if (object !== this.#root && object.userData.threeGeoPlay) object.layers.mask = this.#layersMask;
            });
        }

        p.reset = p.origin = p.placement = p.needed = p.borders = p.restyle = p.ground = false;
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
        for (const mesh of [this.#groundMesh, this.#groundDepthMesh, this.#shadowMesh]) mesh?.removeFromParent();
        this.#groundMesh = this.#groundDepthMesh = this.#shadowMesh = null;
        this.#planeGeometry.dispose();
        this.#groundDepthMaterial.dispose();
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
        if (record.tile?.info) this.#emit('tileunload', { tile: record.tile.info });
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
        this.#tilesFound = this.#tilesRefused = 0;
        this.#reportedRefusal = false;
        this.#sourceRequest?.abort();
        this.#sourceRequest = null;
        if (this.#sourceRetry !== null) clearTimeout(this.#sourceRetry);
        this.#sourceRetry = null;
        this.#source = null;

        if (isTileTemplate(tileUrl)) {
            this.#source = templateSource(tileUrl, accessToken);
            this.#checkZoomRange();
            this.#emit('sourceload', { source: this.source });
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
            this.#emit('sourceload', { source: this.source });
            this.#drainFetchQueue();
        }, err => {
            if (this.#sourceRequest !== request || this.#destroyed || err?.name === 'AbortError') return;
            this.#sourceRequest = null;
            this.#emit('sourceerror', { error: err, willRetry: !err?.permanent });
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
                this.#tilesFound++;
                record.tile  = new Tile(result.payload);
                record.tile.object3D.layers.mask = this.#root.layers.mask;
                record.state = State.LOADED;
                this.#enqueueBuild(record);
            } else {
                record.state = State.EMPTY;
                if (result.status === 'unavailable') {
                    this.#warnUnavailable(result.httpStatus, url);
                    this.#checkRefusals(result.httpStatus, url);
                }
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

    /**
     * Tells the application (`sourceerror`) when the tile URL is clearly wrong:
     * access refused (401 / 403), or the first tiles all missing (404 …) while
     * none was found — rather than letting the area look merely empty.
     */
    #checkRefusals(status, url) {
        this.#tilesRefused++;
        if (this.#reportedRefusal || this.#tilesFound > 0) return;
        const denied = status === 401 || status === 403;
        if (!denied && this.#tilesRefused < MISSING_TILES_TO_REPORT) return;
        this.#reportedRefusal = true;
        const message = denied
            ? `ThreeGeoPlay: the tile provider refused access (HTTP ${status}) for ${redactToken(url)}: check the API key / access token.`
            : `ThreeGeoPlay: none of the first ${this.#tilesRefused} tiles exists (HTTP ${status}, e.g. ${redactToken(url)}): check tileUrl and zoomLevel.`;
        const error = Object.assign(new Error(message), { permanent: true, httpStatus: status });
        this.#emit('sourceerror', { error, willRetry: false });
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

            let appeared = false;
            try {
                record.tile.build(ctx);
                this.#place(record);
                if (record.state !== State.READY) {
                    this.#root.add(record.tile.object3D);
                    record.state = State.READY;
                    record.tile.info = this.#describeTile(record);
                    appeared = true;
                }
            } catch (err) {
                console.error(`ThreeGeoPlay: tile ${this.#zoom}/${record.tx}/${record.ty} could not be built`, err);
                record.tile.dispose();
                record.tile  = null;
                record.state = State.FAILED;
            }
            if (appeared) this.#emit('tileload', { tile: record.tile.info });
        }

        if (this.#buildQueue.length > 0) this.#buildTimer = setTimeout(this.#runBuildSlice, 0);
    };

    /**
     * Dispatches an event. A listener that throws is reported but never breaks
     * the map (tile building, downloads and clean-up go on).
     */
    #emit(type, detail) {
        try {
            this.#notify(type, detail);
        } catch (err) {
            console.error(`ThreeGeoPlay: a '${type}' event listener threw`, err);
        }
    }

    /** Public description of a tile, handed to the user. */
    #describeTile(record) {
        const tile      = record.tile;
        const tileCount = 2 ** this.#zoom;
        return Object.freeze({
            x:             ((record.tx % tileCount) + tileCount) % tileCount,
            y:             record.ty,
            zoom:          this.#zoom,
            object3D:      tile.object3D,
            size:          tile.size,
            unitsPerMeter: tile.unitsPerMeter,
            getFeatures:   sourceLayer => tile.getFeatures(sourceLayer),
        });
    }

    // ─── Ground ───────────────────────────────────────────────────────────────

    /**
     * Creates, updates or removes the planes covering the loaded area:
     *  - the background colour ({@link MapStyle#backgroundLayer}), a flat layer;
     *  - the ground depth ({@link MapConfig#occludeBelowGround}): an invisible
     *    plane drawn first, so buildings and scene objects are depth tested
     *    against the ground — what is below it is hidden, what stands on it is not;
     *  - the ground shadows ({@link MapStyle#shadowLayer}), over the flat layers.
     */
    #syncGround() {
        const cfg        = this.#config;
        const style      = cfg.mapStyle;
        const background = style.backgroundLayer;
        const shadow     = style.shadowLayer;

        const showBackground = !!(background?.isVisible && background.material);
        const showShadow     = !!(shadow?.isVisible && shadow.material);
        const groundY        = Math.min(0, showBackground ? background.Y : 0);

        this.#groundMesh = this.#syncPlane(this.#groundMesh, showBackground, 'ThreeGeoPlayGround', mesh => {
            mesh.material      = background.material;
            mesh.renderOrder   = background.renderingOrder;
            mesh.receiveShadow = background.receiveShadow;
            mesh.castShadow    = background.castShadow;
            return background.Y;
        });

        this.#groundDepthMesh = this.#syncPlane(this.#groundDepthMesh, cfg.occludeBelowGround, 'ThreeGeoPlayGroundDepth', mesh => {
            mesh.material    = this.#groundDepthMaterial;
            mesh.renderOrder = GROUND_DEPTH_RENDER_ORDER;
            mesh.raycast     = noRaycast;   // not a visible surface: raycasts hit the background instead
            return groundY;
        }, false);

        this.#shadowMesh = this.#syncPlane(this.#shadowMesh, showShadow, 'ThreeGeoPlayShadow', mesh => {
            mesh.raycast       = noRaycast;
            mesh.material      = shadow.material;
            mesh.renderOrder   = shadow.renderingOrder;
            mesh.receiveShadow = shadow.receiveShadow;
            mesh.visible       = this.#shadowsEnabled;
            return shadow.Y;
        });
    }

    /**
     * Keeps one ground plane in sync with the loaded area.
     * @param {THREE.Mesh|null} mesh - Current plane, if any.
     * @param {boolean} show
     * @param {string} name
     * @param {(mesh: THREE.Mesh) => number} configure - Applies material & co., returns the plane height.
     * @param {boolean} [flatLayer=true] - Drawn as a flat map layer (stacked by render order, no depth writes).
     * @returns {THREE.Mesh|null}
     */
    #syncPlane(mesh, show, name, configure, flatLayer = true) {
        if (!show) {
            mesh?.removeFromParent();
            return null;
        }
        if (!mesh) {
            mesh = new THREE.Mesh(this.#planeGeometry);
            mesh.name             = name;
            mesh.matrixAutoUpdate = false;
            mesh.layers.mask      = this.#root.layers.mask;
            mesh.userData.threeGeoPlay = true;
            if (flatLayer) drawWithoutDepthWrite(mesh);
            this.#root.add(mesh);
        }

        const cfg    = this.#config;
        const size   = cfg.tileWorldSize;
        const offset = cfg.worldOriginOffset;
        const extent = (cfg.renderDistance * 2 + 1) * size;
        mesh.position.set(
            (this.#centerTX - this.#originFX + 0.5) * size + offset.x,
            configure(mesh) ?? 0,
            (this.#centerTY - this.#originFY + 0.5) * size + offset.z,
        );
        mesh.scale.set(extent, 1, extent);
        mesh.updateMatrix();
        return mesh;
    }
}
