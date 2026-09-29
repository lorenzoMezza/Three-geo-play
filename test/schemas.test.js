import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapStyle } from '../src/index.js';
import { TileSchema, resolveSchema } from '../src/tiles/tileSchemas.js';
import { lineLevel } from '../src/map/lineLayering.js';

const style = new MapStyle();

/** The style type a feature is drawn with, or `null` when it is skipped. */
function drawnAs(schema, sourceLayer, properties) {
    const match = schema(sourceLayer, properties);
    if (!match) return null;
    const layer = style.getStyleLayerByName(match.layer);
    const names = Array.isArray(match.type) ? match.type : [match.type];
    for (const name of names) {
        if (name !== undefined && layer.getTypeByName(name)) return `${match.layer}.${name}`;
    }
    return null;
}

/** Checks every value of a schema attribute: drawn with an existing style type, or skipped on purpose. */
function checkValues(schema, sourceLayer, attribute, values, skipped = []) {
    for (const value of values) {
        const type = drawnAs(schema, sourceLayer, { [attribute]: value });
        if (skipped.includes(value)) assert.equal(type, null, `${sourceLayer} ${value} is skipped`);
        else assert.ok(type, `${sourceLayer} ${attribute}=${value} has a style type`);
    }
}

test('the schema is detected from the layers of the source', () => {
    const omt = ['water', 'waterway', 'landcover', 'landuse', 'transportation', 'building', 'poi'];
    const mapboxStyle = ['landcover', 'hillshade', 'contour', 'landuse_overlay', 'landuse', 'water', 'road', 'building'];
    const shortbread = ['addresses', 'buildings', 'land', 'ocean', 'streets', 'water_lines', 'water_polygons'];
    assert.equal(drawnAs(resolveSchema(TileSchema.AUTO, omt), 'transportation', { class: 'primary' }), 'transportation.primary');
    assert.equal(drawnAs(resolveSchema(TileSchema.AUTO, mapboxStyle), 'road', { class: 'primary' }), 'transportation.primary');
    assert.equal(drawnAs(resolveSchema(TileSchema.AUTO, shortbread), 'streets', { kind: 'primary' }), 'transportation.primary');
});

test('OpenMapTiles classes are drawn with the style types of the same name', () => {
    const omt = resolveSchema(TileSchema.OPENMAPTILES, []);
    checkValues(omt, 'transportation', 'class', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track', 'path', 'rail', 'transit', 'ferry', 'pier', 'busway', 'raceway']);
    checkValues(omt, 'water', 'class', ['lake', 'river', 'ocean', 'pond', 'dock', 'swimming_pool']);
    checkValues(omt, 'waterway', 'class', ['river', 'stream', 'canal', 'drain', 'ditch']);
    checkValues(omt, 'landcover', 'class', ['farmland', 'ice', 'wood', 'rock', 'grass', 'wetland', 'sand']);
    checkValues(omt, 'landuse', 'class', ['residential', 'commercial', 'industrial', 'retail', 'railway', 'cemetery', 'military', 'hospital', 'school', 'university', 'stadium', 'pitch', 'playground', 'park']);
    assert.equal(drawnAs(omt, 'building', {}), 'building.building');
});

test('Mapbox Streets v8 classes are drawn, underground buildings are not', () => {
    const mapbox = resolveSchema(TileSchema.MAPBOX, []);
    checkValues(mapbox, 'road', 'class', [
        'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
        'tertiary', 'tertiary_link', 'street', 'street_limited', 'pedestrian', 'construction', 'track', 'service', 'ferry',
        'path', 'major_rail', 'minor_rail', 'service_rail', 'golf', 'aerialway', 'turning_circle',
    ], ['aerialway', 'turning_circle']);
    checkValues(mapbox, 'waterway', 'class', ['river', 'canal', 'stream', 'stream_intermittent', 'drain', 'ditch']);
    checkValues(mapbox, 'landuse', 'class', [
        'aboriginal_lands', 'agriculture', 'airport', 'cemetery', 'commercial_area', 'facility', 'glacier', 'grass',
        'hospital', 'industrial', 'park', 'parking', 'piste', 'pitch', 'residential', 'rock', 'sand', 'school', 'scrub', 'wood',
    ], ['aboriginal_lands', 'airport', 'facility', 'piste']);
    checkValues(mapbox, 'landuse_overlay', 'class', ['national_park', 'wetland', 'wetland_noveg']);
    assert.equal(drawnAs(mapbox, 'water', {}), 'water.lake');
    assert.equal(drawnAs(mapbox, 'building', { underground: 'false' }), 'building.building');
    assert.equal(drawnAs(mapbox, 'building', { underground: 'true' }), null);
});

test('Shortbread (VersaTiles) kinds are drawn with the matching style types', () => {
    const shortbread = resolveSchema(TileSchema.SHORTBREAD, []);
    checkValues(shortbread, 'streets', 'kind', [
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'busway', 'bus_guideway',
        'living_street', 'service', 'pedestrian', 'track', 'footway', 'steps', 'path', 'cycleway', 'runway', 'taxiway',
        'rail', 'narrow_gauge', 'tram', 'light_rail', 'funicular', 'subway', 'monorail',
    ], ['runway', 'taxiway']);
    checkValues(shortbread, 'water_polygons', 'kind', ['glacier', 'water', 'river', 'reservoir', 'basin', 'dock', 'canal']);
    checkValues(shortbread, 'water_lines', 'kind', ['canal', 'river', 'stream', 'ditch']);
    checkValues(shortbread, 'land', 'kind', [
        'forest', 'grass', 'meadow', 'orchard', 'vineyard', 'allotments', 'cemetery', 'grave_yard', 'village_green',
        'recreation_ground', 'greenhouse_horticulture', 'plant_nursery', 'sand', 'beach', 'heath', 'scrub', 'grassland',
        'bare_rock', 'scree', 'shingle', 'swamp', 'bog', 'string_bog', 'wet_meadow', 'marsh', 'golf_course', 'park', 'garden',
        'playground', 'miniature_golf', 'residential', 'industrial', 'commercial', 'garages', 'retail', 'railway', 'landfill',
        'quarry', 'brownfield', 'greenfield', 'farmyard', 'farmland',
    ], ['greenhouse_horticulture', 'shingle', 'miniature_golf', 'landfill', 'brownfield', 'greenfield', 'farmyard']);
    checkValues(shortbread, 'sites', 'kind', [
        'danger_area', 'sports_centre', 'university', 'college', 'school', 'hospital', 'prison', 'parking', 'bicycle_parking', 'construction',
    ], ['danger_area', 'sports_centre', 'prison', 'bicycle_parking', 'construction']);
    assert.equal(drawnAs(shortbread, 'buildings', { height: 20 }), 'building.building');
    assert.equal(drawnAs(shortbread, 'ocean', {}), 'water.ocean');
    assert.equal(drawnAs(shortbread, 'ferries', { kind: 'ferry' }), 'transportation.ferry');
    assert.equal(shortbread('streets', { kind: 'motorway', link: true }).ramp, true);
});

test('bridges and tunnels are recognised in every schema', () => {
    assert.equal(lineLevel({ brunnel: 'bridge' }), 1);          // OpenMapTiles
    assert.equal(lineLevel({ structure: 'tunnel' }), -1);       // Mapbox
    assert.equal(lineLevel({ bridge: true, tunnel: false }), 1);  // Shortbread
    assert.equal(lineLevel({ bridge: false, tunnel: true }), -1);
    assert.equal(lineLevel({ bridge: false, tunnel: false }), 0);
    assert.equal(lineLevel({ brunnel: 'bridge', layer: 3 }), 3);
});
