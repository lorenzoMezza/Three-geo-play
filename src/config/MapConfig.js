import { MapStyle } from '../style/MapStyle.js';
import { TileSchema } from '../utils/tileSchemas.js';

/**
 * Fields whose change discards every loaded tile and downloads them again.
 * @private
 * @type {ReadonlySet<string>}
 */
const REBUILD_REQUIRED_FIELDS = new Set(['zoomLevel', 'tileUrl', 'accessToken']);

/** Properties accepted by {@link MapConfig#set} and the `ThreeGeoPlay` options. */
const SETTABLE = new Set([
    'tileUrl', 'accessToken', 'tileSchema', 'zoomLevel', 'renderDistance', 'tileWorldSize',
    'tileLayout', 'originLatLon', 'worldOriginOffset', 'viewMode', 'mapStyle',
    'showTileBorders', 'followUpdateInterval', 'pbfTileProviderZXYurl',
]);

const MIN_ZOOM = 0;
const MAX_ZOOM = 24;

/**
 * Available tile layout modes.
 * @enum {string}
 */
export const TileLayout = Object.freeze({
    /** Tiles are loaded in a circular pattern around the center. */
    CIRCULAR: 'circular',
    /** Tiles are loaded in a square grid around the center. */
    GRID: 'grid',
});

/**
 * Available camera/map tracking modes.
 * @enum {string}
 */
export const ViewMode = Object.freeze({
    /**
     * The loaded area automatically follows the target set via
     * {@link ThreeGeoPlay#setFollowTarget} (defaults to the camera).
     */
    FOLLOW_TARGET: 'follow_target',
    /**
     * The loaded area is controlled manually via
     * {@link ThreeGeoPlay#moveMapOriginToLatLon} or
     * {@link ThreeGeoPlay#moveMapOriginToPosition}.
     */
    MANUAL: 'manual',
});

/**
 * @typedef {{ readonly lat: number, readonly lon: number }} LatLon
 * @typedef {{ readonly x: number, readonly z: number }} WorldOffset
 */

/**
 * Configuration for a ThreeGeoPlay map instance.
 * All settable properties mark themselves dirty so that {@link ThreeGeoPlay#onFrameUpdate}
 * can apply the minimum necessary update (re-layout, restyle, or full reload).
 * Invalid values throw an `Error`.
 *
 * @example
 * const config = geoPlay.getMapConfig();
 * config.zoomLevel      = 16;
 * config.renderDistance = 6;
 * config.tileLayout     = TileLayout.GRID;
 *
 * @class
 */
export class MapConfig {

    /** @type {string} */
    #tileUrl = '';

    /** @type {string} */
    #accessToken = '';

    /** @type {string|Function} */
    #tileSchema = TileSchema.AUTO;

    /**
     * Web-Mercator zoom level. Higher values load more detail.
     * @type {number}
     */
    #zoomLevel = 18;

    /**
     * Number of tiles to load in each direction from the center tile.
     * @type {number}
     */
    #renderDistance = 4;

    /**
     * World-space size of one tile in Three.js units.
     * @type {number}
     */
    #tileWorldSize = 1;

    /**
     * @type {TileLayout}
     */
    #tileLayout = TileLayout.CIRCULAR;

    /**
     * Geographic coordinates of the map origin.
     * @type {LatLon}
     */
    #originLatLon = Object.freeze({ lat: 41.899689, lon: 12.437790 });

    /**
     * World position (X/Z) of the geographic origin, in Three.js units.
     * @type {WorldOffset}
     */
    #worldOriginOffset = Object.freeze({ x: 0, z: 0 });

    /**
     * @type {ViewMode}
     */
    #viewMode = ViewMode.FOLLOW_TARGET;

    /**
     * @type {MapStyle}
     */
    #mapStyle = new MapStyle();

    /**
     * Minimum interval in milliseconds between follow-target updates.
     * `0` means update every frame.
     * @type {number}
     */
    #followUpdateIntervalInMs = 0;

    /**
     * When true, draws a visible border around each loaded tile (useful for debugging).
     * @type {boolean}
     */
    #showTileBorders = false;

    /** @type {Set<string>} */
    #dirtyFields = new Set();

    // ─── Dirty-state helpers ──────────────────────────────────────────────────

    /**
     * True if any property has been modified since the last {@link flushDirtyState} call.
     * @type {boolean}
     * @readonly
     */
    get _isDirty() { return this.#dirtyFields.size > 0; }

    /**
     * The set of field names that have been modified since the last flush.
     * @type {Set<string>}
     * @readonly
     */
    get _dirtyFields() { return this.#dirtyFields; }

    /**
     * True if any dirty field requires reloading all tiles (new download + geometry generation).
     * @type {boolean}
     * @readonly
     */
    get requiresRebuild() {
        for (const field of this.#dirtyFields) {
            if (REBUILD_REQUIRED_FIELDS.has(field)) return true;
        }
        return false;
    }

    /**
     * Scale factor relative to zoom level 18.
     * Useful for sizing world-space objects consistently across zoom levels.
     * @type {number}
     * @readonly
     */
    get zoomScaleFactor() {
        return 1 / Math.pow(2, 18 - this.#zoomLevel);
    }

    /**
     * Clears the dirty-field set. Called automatically by {@link ThreeGeoPlay#onFrameUpdate}
     * after processing changes.
     */
    flushDirtyState() {
        this.#dirtyFields.clear();
    }

    /**
     * Sets several properties at once; unknown names throw.
     * @param {Partial<Record<string, unknown>>} values
     * @returns {MapConfig} This instance, for chaining.
     *
     * @example
     * config.set({ tileUrl: 'https://tiles.openfreemap.org/planet', zoomLevel: 14, renderDistance: 5 });
     */
    set(values) {
        for (const [name, value] of Object.entries(values ?? {})) {
            if (!SETTABLE.has(name)) throw new Error(`ThreeGeoPlay: Unknown MapConfig option "${name}"`);
            this[name] = value;
        }
        return this;
    }

    // ─── Properties ──────────────────────────────────────────────────────────

    /**
     * Where the vector tiles come from. Required before {@link ThreeGeoPlay#start};
     * changing it reloads all tiles. Accepts:
     *  - a tile URL template with `{x}`, `{y}` and usually `{z}` (omit `{z}` only
     *    for single-zoom tile sets, whose zoom must then match {@link zoomLevel});
     *  - a TileJSON URL (MapTiler, OpenFreeMap, tileservers);
     *  - a MapLibre / Mapbox style URL: its first vector source is used;
     *  - a `mapbox://` URL, with {@link accessToken}.
     * @type {string}
     */
    get pbfTileProviderZXYurl() { return this.#pbfTileProviderZXYurl; }
    set pbfTileProviderZXYurl(value) {
        this.#pbfTileProviderZXYurl = value;
        this.#dirtyFields.add('pbfTileProviderZXYurl');
    }

    /**
     * OSM zoom level. Changing this triggers a full tile rebuild.
     * @type {number}
     */
    get zoomLevel() { return this.#zoomLevel; }
    set zoomLevel(value) {
        this.#zoomLevel = value;
        this.#dirtyFields.add('zoomLevel');
    }

    /**
     * Number of tiles to load around the origin. Changing this re-applies the tile center.
     * @type {number}
     */
    get renderDistance() { return this.#renderDistance; }
    set renderDistance(value) {
        this.#renderDistance = Math.round(value);
        this.#dirtyFields.add('renderDistance');
    }

    /**
     * World-space size of one tile in Three.js units. Must be a positive number.
     * Changing this rescales existing tiles without a full rebuild.
     * @type {number}
     */
    get tileWorldSize() { return this.#tileWorldSize; }
    set tileWorldSize(value) {
        if (typeof value !== 'number' || isNaN(value) || value <= 0) {
            throw new Error(`ThreeGeoPlay : Invalid tileWorldSize: ${value}. Must be a positive number`);
        }
        this.#tileWorldSize = value;
        this.#dirtyFields.add('tileWorldSize');
    }

    /**
     * Tile loading pattern. Use {@link TileLayout} enum values.
     * Changing this triggers a full tile rebuild.
     * @type {TileLayout}
     */
    get tileLayout() { return this.#tileLayout; }
    set tileLayout(value) {
        if (!Object.values(TileLayout).includes(value)) {
            throw new Error(`ThreeGeoPlay : Invalid tile layout: ${value}. Use TileLayout.CIRCULAR or TileLayout.GRID`);
        }
        this.#tileLayout = value;
        this.#dirtyFields.add('tileLayout');
    }

    /**
     * Geographic coordinates of the map origin.
     * Changing this triggers a full tile rebuild.
     * @type {LatLon}
     */
    get originLatLon() { return this.#originLatLon; }
    set originLatLon(value) {
        this.#originLatLon = value;
        this.#dirtyFields.add('originLatLon');
    }

    /**
     * Additional X/Z offset applied to the world origin.
     * Changing this triggers a full tile rebuild.
     * @type {WorldOffset}
     */
    get worldOriginOffset() { return this.#worldOriginOffset; }
    set worldOriginOffset(value) {
        if (!value || typeof value.x !== 'number' || isNaN(value.x) ||
                      typeof value.z !== 'number' || isNaN(value.z)) {
            throw new Error('Invalid worldOriginOffset: x and z must be valid numbers');
        }
        this.#worldOriginOffset = { x: value.x, z: value.z };
        this.#dirtyFields.add('worldOriginOffset');
    }

    /**
     * Camera/map tracking mode. Use {@link ViewMode} enum values.
     * @type {ViewMode}
     */
    get viewMode() { return this.#viewMode; }
    set viewMode(value) {
        if (!Object.values(ViewMode).includes(value)) {
            throw new Error(`ThreeGeoPlay : Invalid view mode: ${value}. Use ViewMode.FOLLOW_TARGET or ViewMode.MANUAL`);
        }
        this.#viewMode = value;
        this.#dirtyFields.add('viewMode');
    }

    /**
     * The active {@link MapStyle} instance.
     * Changing this triggers a material update on all tiles.
     * @type {MapStyle}
     */
    get mapStyle() { return this.#mapStyle; }
    set mapStyle(value) {
        this.#mapStyle = value;
        this.#dirtyFields.add('mapStyle');
    }

    /**
     * Minimum interval in milliseconds between follow-target tile updates.
     * `0` means the map updates every frame.
     * @type {number}
     * @readonly
     */
    get FollowUpdateInterval() { return this.#followUpdateIntervalInMs; }

    /**
     * When true, a visible border is drawn around each loaded tile.
     * Useful for debugging tile boundaries.
     * @type {boolean}
     */
    get showTileBorders() { return this.#showTileBorders; }
    set showTileBorders(value) {
        this.#showTileBorders = value;
        this.#dirtyFields.add('showTileBorders');
    }

    /**
     * Sets the minimum interval between follow-target updates.
     * Pass `0` to update every frame (default).
     * @param {number} intervalMs - Interval in milliseconds. Must be ≥ 0.
     * @throws {Error} If `intervalMs` is not a non-negative number.
     */
    setFollowUpdateInterval(intervalMs) {
        if (typeof intervalMs !== 'number' || isNaN(intervalMs)) {
            throw new Error(`ThreeGeoPlay : Invalid interval: ${intervalMs}. Must be a number`);
        }
        if (intervalMs < 0) {
            throw new Error(`ThreeGeoPlay : Invalid interval: ${intervalMs}. Must be 0 or positive`);
        }
        this.#followUpdateIntervalInMs = intervalMs;
        this.#dirtyFields.add('followUpdateIntervalInMs');
    }
}