import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MapStyle } from '../src/index.js';

const MULTI_TYPE_LAYERS = ['water', 'waterway', 'landuse', 'landcover', 'transportation'];

test('every type of the default style has a material and is reachable three ways', () => {
    const style = new MapStyle();
    for (const name of MULTI_TYPE_LAYERS) {
        const layer = style.getStyleLayerByName(name);
        const types = Object.entries(layer.types);
        assert.ok(types.length > 0, name);
        assert.deepEqual(new Set(types.map(([typeName]) => typeName)), layer.constructor.admittedClasses, `${name}.admittedClasses`);
        for (const [typeName, type] of types) {
            assert.ok(type.material instanceof THREE.Material, `${name}.${typeName}.material`);
            assert.equal(layer[typeName], type, `${name}.${typeName} property`);
            assert.equal(layer.getTypeByName(typeName), type, `${name}.getTypeByName('${typeName}')`);
        }
    }
});

test('flat layers lie on the ground and are stacked by render order', () => {
    const style = new MapStyle();
    style.forEachType((type, layerName) => {
        if (layerName !== 'building') assert.equal(type.Y, 0, `${layerName} Y`);
    });
    assert.ok(style.backgroundLayer.renderingOrder < style.landUseLayer.residential.renderingOrder);
    assert.ok(style.landUseLayer.residential.renderingOrder < style.transportationLayer.primary.renderingOrder);
});

test('forEachType visits every type once, single-type layers included', () => {
    const style = new MapStyle();
    const seen = new Map();
    style.forEachType((type, layerName, typeName) => seen.set(`${layerName}/${typeName}`, type));
    const expected = MULTI_TYPE_LAYERS.reduce((n, name) => n + Object.keys(style.getStyleLayerByName(name).types).length, 3);
    assert.equal(seen.size, expected);
    assert.equal(seen.get('building/building'), style.buildingLayer);
    assert.equal(seen.get('transportation/primary'), style.transportationLayer.primary);
});

test('a type cannot be replaced, only configured', () => {
    const roads = new MapStyle().transportationLayer;
    assert.throws(() => { roads.primary = roads.minor; }, TypeError);
});

test('clone() copies every setting into independent materials', () => {
    const style = new MapStyle();
    style.transportationLayer.primary.lineWidthMeters = 14;
    style.buildingLayer.height = 2;
    const copy = style.clone();
    assert.equal(copy.transportationLayer.primary.lineWidthMeters, 14);
    assert.equal(copy.buildingLayer.height, 2);
    assert.notEqual(copy.transportationLayer.primary.material, style.transportationLayer.primary.material);
    // Types sharing a material still share its copy.
    assert.equal(copy.transportationLayer.primary.material, copy.transportationLayer.secondary.material);
    copy.transportationLayer.primary.material.color.set(0xff0000);
    assert.notEqual(style.transportationLayer.primary.material.color.getHex(), 0xff0000);
});

test('MapStyle.dark() is a complete style', () => {
    const dark = MapStyle.dark();
    dark.forEachType((type, layerName, typeName) => {
        assert.ok(type.material, `${layerName}.${typeName}`);
    });
});
