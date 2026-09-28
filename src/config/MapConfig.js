import { MapStyle } from '../style/MapStyle.js';
import { TileSchema } from '../utils/tileSchemas.js';
import { tileSizeInMeters } from '../geo_utils/projection.js';

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
    'showTileBorders', 'followUpdateInterval', 'occludeBelowGround', 'unitsPerMeter', 'pbfTileProviderZXYurl',
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
     * World units per metre; when set, {@link tileWorldSize} follows from it.
     * @type {number|null}
     */
    #unitsPerMeter = null;

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

    /** @type {boolean} */
    #occludeBelowGround = true;

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
    get tileUrl() { return this.#tileUrl; }
    set tileUrl(value) {
        if (typeof value !== 'string' || value.trim() === '' || value.includes('{x}') !== value.includes('{y}')) {
            throw new Error(`ThreeGeoPlay: Invalid tileUrl: ${value}. Use a tile URL template with {x} and {y}, a TileJSON / style URL, or a mapbox:// URL`);
        }
        this.#tileUrl = value;
        this.#dirtyFields.add('tileUrl');
    }

    /**
     * @deprecated Use {@link tileUrl}.
     * @type {string}
     */
    get pbfTileProviderZXYurl() { return this.tileUrl; }
    set pbfTileProviderZXYurl(value) { this.tileUrl = value; }

    /**
     * Access token sent to Mapbox (`mapbox://` URLs and api.mapbox.com tiles).
     * Changing it reloads all tiles.
     * @type {string}
     */
    get accessToken() { return this.#accessToken; }
    set accessToken(value) {
        if (typeof value !== 'string') throw new Error('ThreeGeoPlay: accessToken must be a string');
        this.#accessToken = value;
        this.#dirtyFields.add('accessToken');
    }

    /**
     * How tile layers and attributes map onto {@link MapStyle}: a {@link TileSchema}
     * value (`'auto'` by default — detected from the source) or a custom function
     * `(sourceLayer, properties) => ({ layer, type, ramp? }) | null`.
     * Changing it restyles the loaded tiles.
     * @type {string|Function}
     */
    get tileSchema() { return this.#tileSchema; }
    set tileSchema(value) {
        if (typeof value !== 'function' && !Object.values(TileSchema).includes(value)) {
            throw new Error(`ThreeGeoPlay: Invalid tileSchema: ${value}. Use a TileSchema value or a function`);
        }
        this.#tileSchema = value;
        this.#dirtyFields.add('tileSchema');
    }

    /**
     * Web-Mercator zoom level (integer, 0–24). Changing it reloads all tiles.
     * Make sure the tile provider serves this zoom level (most OpenMapTiles
     * providers stop at 14).
     * @type {number}
     */
    get zoomLevel() { return this.#zoomLevel; }
    set zoomLevel(value) {
        if (!Number.isInteger(value) || value < MIN_ZOOM || value > MAX_ZOOM) {
            throw new Error(`ThreeGeoPlay: Invalid zoomLevel: ${value}. Must be an integer between ${MIN_ZOOM} and ${MAX_ZOOM}`);
        }
        this.#zoomLevel = value;
        this.#dirtyFields.add('zoomLevel');
        if (this.#unitsPerMeter !== null) this.#dirtyFields.add('tileWorldSize');
    }

    /**
     * Number of tiles to load around the center tile (rounded to an integer, ≥ 0).
     * @type {number}
     */
    get renderDistance() { return this.#renderDistance; }
    set renderDistance(value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            throw new Error(`ThreeGeoPlay: Invalid renderDistance: ${value}. Must be a non-negative number`);
        }
        this.#renderDistance = Math.round(value);
        this.#dirtyFields.add('renderDistance');
    }

    /**
     * World-space size of one tile in Three.js units. Must be a positive number.
     * Changing this rescales existing tiles without downloading them again.
     * With {@link unitsPerMeter} set it is derived from it (and setting it
     * clears {@link unitsPerMeter}).
     * @type {number}
     */
    get tileWorldSize() {
        return this.#unitsPerMeter === null
            ? this.#tileWorldSize
            : tileSizeInMeters(this.#originLatLon.lat, this.#zoomLevel) * this.#unitsPerMeter;
    }
    set tileWorldSize(value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            throw new Error(`ThreeGeoPlay: Invalid tileWorldSize: ${value}. Must be a positive number`);
        }
        this.#tileWorldSize = value;
        this.#unitsPerMeter = null;
        this.#dirtyFields.add('tileWorldSize');
    }

    /**
     * Scale of the map in world units per metre, e.g. `1` for a scene in
     * metres. When set, {@link tileWorldSize} is derived from it — and kept
     * right when the zoom level or the origin latitude change — so distances and
     * building heights are true to that scale around the origin (Web Mercator
     * stretches them slowly away from it). `null` (default) uses
     * {@link tileWorldSize} instead; setting {@link tileWorldSize} clears it.
     * @type {number|null}
     */
    get unitsPerMeter() { return this.#unitsPerMeter; }
    set unitsPerMeter(value) {
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
            throw new Error(`ThreeGeoPlay: Invalid unitsPerMeter: ${value}. Must be a positive number or null`);
        }
        if (value === null) this.#tileWorldSize = this.tileWorldSize;   // keep the current scale
        this.#unitsPerMeter = value;
        this.#dirtyFields.add('tileWorldSize');
    }

    /**
     * Tile loading pattern. Use {@link TileLayout} enum values.
     * @type {TileLayout}
     */
    get tileLayout() { return this.#tileLayout; }
    set tileLayout(value) {
        if (!Object.values(TileLayout).includes(value)) {
            throw new Error(`ThreeGeoPlay: Invalid tile layout: ${value}. Use TileLayout.CIRCULAR or TileLayout.GRID`);
        }
        this.#tileLayout = value;
        this.#dirtyFields.add('tileLayout');
    }

    /**
     * Geographic coordinates placed at {@link worldOriginOffset} in world space.
     * The returned object is frozen: assign a new `{ lat, lon }` to change it.
     * Tiles still in range are kept and simply moved.
     * @type {LatLon}
     */
    get originLatLon() { return this.#originLatLon; }
    set originLatLon(value) {
        const lat = value?.lat;
        const lon = value?.lon;
        if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
            throw new Error(`ThreeGeoPlay: Invalid originLatLon.lat: ${lat}. Must be a number between -90 and 90`);
        }
        if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
            throw new Error(`ThreeGeoPlay: Invalid originLatLon.lon: ${lon}. Must be a number between -180 and 180`);
        }
        this.#originLatLon = Object.freeze({ lat, lon });
        this.#dirtyFields.add('originLatLon');
        if (this.#unitsPerMeter !== null) this.#dirtyFields.add('tileWorldSize');
    }

    /**
     * World position (X/Z) where {@link originLatLon} is placed.
     * The returned object is frozen: assign a new `{ x, z }` to change it.
     * @type {WorldOffset}
     */
    get worldOriginOffset() { return this.#worldOriginOffset; }
    set worldOriginOffset(value) {
        if (!value || typeof value.x !== 'number' || !Number.isFinite(value.x) ||
                      typeof value.z !== 'number' || !Number.isFinite(value.z)) {
            throw new Error('ThreeGeoPlay: Invalid worldOriginOffset: x and z must be valid numbers');
        }
        this.#worldOriginOffset = Object.freeze({ x: value.x, z: value.z });
        this.#dirtyFields.add('worldOriginOffset');
    }

    /**
     * Camera/map tracking mode. Use {@link ViewMode} enum values.
     * @type {ViewMode}
     */
    get viewMode() { return this.#viewMode; }
    set viewMode(value) {
        if (!Object.values(ViewMode).includes(value)) {
            throw new Error(`ThreeGeoPlay: Invalid view mode: ${value}. Use ViewMode.FOLLOW_TARGET or ViewMode.MANUAL`);
        }
        this.#viewMode = value;
        this.#dirtyFields.add('viewMode');
    }

    /**
     * The active {@link MapStyle} instance.
     * Replacing it — or changing any of its layers/types — restyles the loaded tiles.
     * @type {MapStyle}
     */
    get mapStyle() { return this.#mapStyle; }
    set mapStyle(value) {
        if (!(value instanceof MapStyle)) {
            throw new Error('ThreeGeoPlay: mapStyle must be an instance of MapStyle');
        }
        this.#mapStyle = value;
        this.#dirtyFields.add('mapStyle');
    }

    /**
     * Minimum interval in milliseconds between follow-target tile updates.
     * `0` (default) updates every frame.
     * @type {number}
     */
    get followUpdateInterval() { return this.#followUpdateIntervalInMs; }
    set followUpdateInterval(intervalMs) {
        if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) {
            throw new Error(`ThreeGeoPlay: Invalid followUpdateInterval: ${intervalMs}. Must be a number ≥ 0`);
        }
        this.#followUpdateIntervalInMs = intervalMs;
        this.#dirtyFields.add('followUpdateInterval');
    }

    /**
     * @deprecated Use {@link followUpdateInterval}.
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
        this.#showTileBorders = !!value;
        this.#dirtyFields.add('showTileBorders');
    }

    /**
     * When true (default), the map ground hides what is below it, like a solid
     * floor: an invisible plane writes the depth of the ground under the loaded
     * area before anything else is drawn. Objects standing on the map or above it
     * are not affected. Set it to false to see through the ground (e.g. for
     * underground scenes or when you draw your own terrain).
     * @type {boolean}
     */
    get occludeBelowGround() { return this.#occludeBelowGround; }
    set occludeBelowGround(value) {
        this.#occludeBelowGround = !!value;
        this.#dirtyFields.add('occludeBelowGround');
    }

    /**
     * @deprecated Use {@link followUpdateInterval}.
     * @param {number} intervalMs
     */
    setFollowUpdateInterval(intervalMs) {
        this.followUpdateInterval = intervalMs;
    }
}
