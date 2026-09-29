/**
 * Tile schemas: how the layers and attributes of a vector tile source map onto
 * the layers and types of {@link MapStyle}.
 */

/**
 * Vector tile schemas supported out of the box.
 * @enum {string}
 */
export const TileSchema = Object.freeze({
    /** Detected from the source / tile layers (default). */
    AUTO: 'auto',
    /** OpenMapTiles — MapTiler, OpenFreeMap and most MapLibre sources. */
    OPENMAPTILES: 'openmaptiles',
    /** Mapbox Streets v8 (`mapbox.mapbox-streets-v8`). */
    MAPBOX: 'mapbox',
    /** Shortbread 1.0 — VersaTiles. */
    SHORTBREAD: 'shortbread',
});

/**
 * Result of a schema lookup.
 * @typedef {Object} SchemaMatch
 * @property {'transportation'|'building'|'water'|'waterway'|'landuse'|'landcover'} layer - Style layer.
 * @property {string|Array<string|undefined>} type - Style type name(s), most specific first.
 * @property {boolean} [ramp] - Link road (drawn under the road it merges into).
 */

/**
 * A custom schema: returns the style layer / type of a feature, or `null` to skip it.
 * @callback TileSchemaFunction
 * @param {string} sourceLayer - Layer name in the vector tile.
 * @param {Record<string, unknown>} properties - Feature attributes.
 * @returns {SchemaMatch|null}
 */

// Built-in schemas reuse one result object: no allocation per feature.
const match = { layer: '', type: [undefined, undefined], ramp: false };

function result(layer, specific, general, ramp = false) {
    match.layer   = layer;
    match.type[0] = specific;
    match.type[1] = general;
    match.ramp    = ramp;
    return match;
}

// ─── OpenMapTiles ────────────────────────────────────────────────────────────

const OMT_LAYERS = new Set(['transportation', 'building', 'water', 'waterway', 'landuse', 'landcover']);

/** @type {TileSchemaFunction} */
function openMapTiles(sourceLayer, p) {
    if (!OMT_LAYERS.has(sourceLayer)) return null;
    let layer = sourceLayer;
    // `landuse` grass / park areas use the land-cover style of the same name.
    if (layer === 'landuse' && (p.class === 'grass' || p.class === 'park')) layer = 'landcover';
    const general = p.class ?? (layer === 'water' ? 'lake' : layer);
    return result(layer, p.subclass, general, p.ramp === 1 || p.ramp === true);
}

// ─── Mapbox Streets v8 ───────────────────────────────────────────────────────

const MAPBOX_ROAD = {
    motorway: 'motorway',     motorway_link: 'motorway',
    trunk: 'trunk',           trunk_link: 'trunk',
    primary: 'primary',       primary_link: 'primary',
    secondary: 'secondary',   secondary_link: 'secondary',
    tertiary: 'tertiary',     tertiary_link: 'tertiary',
    street: 'minor',          street_limited: 'minor',
    pedestrian: 'pedestrian', construction: 'minor_construction',
    service: 'service',       track: 'track',
    path: 'path',             golf: 'path',
    ferry: 'ferry',
    major_rail: 'rail',       minor_rail: 'rail',       service_rail: 'rail',
};

const MAPBOX_AREAS = {
    // landuse
    park: ['landcover', 'park'],       grass: ['landcover', 'grass'],     wood: ['landcover', 'wood'],
    scrub: ['landcover', 'scrub'],     sand: ['landcover', 'sand'],       rock: ['landcover', 'rock'],
    glacier: ['landcover', 'glacier'], agriculture: ['landuse', 'farmland'],
    cemetery: ['landuse', 'cemetery'], hospital: ['landuse', 'hospital'], school: ['landuse', 'school'],
    industrial: ['landuse', 'industrial'], commercial_area: ['landuse', 'commercial'],
    residential: ['landuse', 'residential'], parking: ['landuse', 'parking'], pitch: ['landuse', 'pitch'],
    // landuse_overlay
    national_park: ['landuse', 'protected_area'], wetland: ['landcover', 'wetland'], wetland_noveg: ['landcover', 'wetland'],
};

const MAPBOX_WATERWAY = { stream_intermittent: 'stream' };

/** @type {TileSchemaFunction} */
function mapbox(sourceLayer, p) {
    switch (sourceLayer) {
        case 'road': {
            const type = MAPBOX_ROAD[p.class];
            return type ? result('transportation', undefined, type, typeof p.class === 'string' && p.class.endsWith('_link')) : null;
        }
        case 'building':
            return p.underground === 'true' || p.underground === true ? null : result('building', undefined, 'building');
        case 'water':
            return result('water', undefined, 'lake');
        case 'waterway':
            return result('waterway', undefined, MAPBOX_WATERWAY[p.class] ?? p.class);
        case 'landuse':
        case 'landuse_overlay': {
            const area = MAPBOX_AREAS[p.class];
            return area ? result(area[0], undefined, area[1]) : null;
        }
        default:
            return null;
    }
}

// ─── Shortbread 1.0 (VersaTiles) ─────────────────────────────────────────────

const SHORTBREAD_STREET = {
    motorway: 'motorway',        trunk: 'trunk',         primary: 'primary',
    secondary: 'secondary',      tertiary: 'tertiary',
    unclassified: 'minor',       residential: 'minor',   living_street: 'minor',
    pedestrian: 'pedestrian',    service: 'service',     track: 'track',
    busway: 'busway',            bus_guideway: 'bus_guideway',
    footway: 'path',             steps: 'path',          path: 'path',          cycleway: 'path',
    rail: 'rail',                narrow_gauge: 'rail',
    tram: 'transit',             light_rail: 'transit',  funicular: 'transit',
    subway: 'transit',           monorail: 'transit',
};

const SHORTBREAD_WATER = { water: 'lake', reservoir: 'lake', basin: 'pond', canal: 'river', river: 'river', dock: 'dock' };

/** `land` kinds drawn by the land use layer; the others are land cover. */
const SHORTBREAD_LANDUSE = new Set([
    'residential', 'industrial', 'commercial', 'retail', 'garages', 'railway', 'quarry',
    'cemetery', 'grave_yard', 'playground', 'recreation_ground',
]);

const SHORTBREAD_ALIASES = { grave_yard: 'cemetery', string_bog: 'bog' };

/** @type {TileSchemaFunction} */
function shortbread(sourceLayer, p) {
    switch (sourceLayer) {
        case 'streets': {
            const type = SHORTBREAD_STREET[p.kind];
            return type ? result('transportation', undefined, type, p.link === true) : null;
        }
        case 'ferries':
            return result('transportation', undefined, 'ferry');
        case 'pier_lines':
            return result('transportation', undefined, 'pier');
        case 'buildings':
            return result('building', undefined, 'building');
        case 'ocean':
            return result('water', undefined, 'ocean');
        case 'water_polygons':
            return p.kind === 'glacier' ? result('landcover', undefined, 'glacier') : result('water', undefined, SHORTBREAD_WATER[p.kind] ?? 'lake');
        case 'water_lines':
            return result('waterway', undefined, p.kind);
        case 'land': {
            const kind = SHORTBREAD_ALIASES[p.kind] ?? p.kind;
            return result(SHORTBREAD_LANDUSE.has(p.kind) ? 'landuse' : 'landcover', undefined, kind);
        }
        case 'sites':
            return result('landuse', undefined, p.kind);
        case 'dam_polygons':
            return result('landuse', undefined, 'dam');
        default:
            return null;
    }
}

const SHORTBREAD_LAYERS = ['streets', 'ferries', 'pier_lines', 'buildings', 'ocean', 'water_polygons', 'water_lines', 'land', 'sites', 'dam_polygons'];

/** Layer names the built-in schemas read: other layers are not even decoded. */
const BUILT_IN_LAYERS = new Set([...OMT_LAYERS, 'road', 'landuse_overlay', ...SHORTBREAD_LAYERS]);

/**
 * Whether a tile layer can matter for the given schema setting.
 * @param {string|TileSchemaFunction} setting
 * @param {string} layerName
 */
export function schemaReadsLayer(setting, layerName) {
    return typeof setting === 'function' || BUILT_IN_LAYERS.has(layerName);
}

/**
 * Picks the schema function for a tile.
 * @param {string|TileSchemaFunction} setting - A {@link TileSchema} value or a custom function.
 * @param {Iterable<string>} layerNames - Layer names of the source (TileJSON) or of the tile itself.
 * @returns {TileSchemaFunction}
 */
export function resolveSchema(setting, layerNames) {
    if (typeof setting === 'function') return setting;
    if (setting === TileSchema.MAPBOX) return mapbox;
    if (setting === TileSchema.SHORTBREAD) return shortbread;
    if (setting === TileSchema.OPENMAPTILES) return openMapTiles;
    // Detected by layers that only one schema has (Mapbox styles also carry the
    // `landcover` layer of Mapbox Terrain, so it cannot tell OpenMapTiles apart).
    const names = new Set(layerNames);
    if (names.has('road') || names.has('landuse_overlay')) return mapbox;
    if (names.has('streets') || names.has('water_polygons')) return shortbread;
    return openMapTiles;
}
