import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThreeGeoPlay, MapStyle } from '../src/index.js';
import { serveTiles, loadMap, settle, fakeRenderer, warningsOf, ORIGIN } from './helpers.js';

let server;
before(async () => { server = await serveTiles(); });
after(() => server.close());

/** The first point of a 10 m grid around the origin where `accept(height)` holds. */
function findPoint(geo, accept) {
    for (let x = -300; x <= 300; x += 10) {
        for (let z = -300; z <= 300; z += 10) {
            if (accept(geo.getHeightAt(x, z))) return { x, z };
        }
    }
    throw new Error('no such point near the origin');
}

/** Every map mesh of a kind ('building', 'polygon', 'line', 'outline'). */
function meshesOf(scene, kind) {
    const meshes = [];
    scene.traverse(object => { if (object.isMesh && object.userData.kind === kind) meshes.push(object); });
    return meshes;
}

test('builds the tiles around the origin, with every kind of geometry', async () => {
    const loaded = [];
    const scene = new THREE.Scene();
    const geo = new ThreeGeoPlay(scene, new THREE.PerspectiveCamera(), fakeRenderer(), {
        tileUrl: `${server.url}/Y{y}X{x}.pbf`, zoomLevel: 16, originLatLon: ORIGIN, unitsPerMeter: 1, renderDistance: 1,
    });
    geo.addEventListener('tileload', ({ tile }) => loaded.push(tile));
    geo.start();
    await settle(geo);

    const stats = geo.getTileStats();
    assert.equal(stats.failed, 0);
    assert.equal(stats.ready, stats.total);
    assert.equal(loaded.length, stats.total);
    for (const kind of ['building', 'polygon', 'line', 'outline']) {
        assert.ok(meshesOf(scene, kind).length > 0, `${kind} meshes`);
    }
    geo.destroy();
});

test('getHeightAt() matches the buildings that are drawn', async () => {
    const { geo, scene } = await loadMap(server.url);
    const buildings = meshesOf(scene, 'building');
    const raycaster = new THREE.Raycaster();
    let checked = 0;
    for (let i = 0; i < 200; i++) {
        const x = (i % 20) * 12 - 120, z = Math.floor(i / 20) * 12 - 60;
        raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObjects(buildings)[0];
        const expected = hit ? hit.point.y : 0;
        assert.ok(Math.abs(geo.getHeightAt(x, z) - expected) < 0.01, `height at ${x}, ${z}`);
        if (hit) checked++;
    }
    assert.ok(checked > 20, 'some points are on buildings');
    geo.destroy();
});

test('pickFeature() returns what the ray sees', async () => {
    const { geo } = await loadMap(server.url);
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);

    const roof = findPoint(geo, height => height > 10);
    raycaster.set(new THREE.Vector3(roof.x, 500, roof.z), down);
    const building = geo.pickFeature(raycaster);
    assert.equal(building?.layer, 'building');
    assert.ok(Math.abs(building.intersection.point.y - geo.getHeightAt(roof.x, roof.z)) < 0.01);
    assert.equal(typeof building.properties, 'object');

    const open = findPoint(geo, height => height === 0);
    raycaster.set(new THREE.Vector3(open.x, 500, open.z), down);
    const ground = geo.pickFeature(raycaster);
    assert.ok(ground, 'something is drawn on the ground');
    assert.notEqual(ground.layer, 'building');
    geo.destroy();
});

test('featureStyle can raise and hide buildings, and is applied to the tiles on screen', async () => {
    const { geo } = await loadMap(server.url);
    const style = geo.getMapStyle();
    const { x, z } = findPoint(geo, height => height > 5);

    style.buildingLayer.featureStyle = () => ({ height: 200 });
    await settle(geo);
    assert.ok(Math.abs(geo.getHeightAt(x, z) - 200) < 0.01);

    style.buildingLayer.featureStyle = () => ({ visible: false });
    await settle(geo);
    assert.equal(geo.getHeightAt(x, z), 0);
    geo.destroy();
});

/** What is seen straight down from every point of a 10 m grid around the origin. */
function lookDown(geo) {
    const raycaster = new THREE.Raycaster();
    const hits = [];
    for (let x = -200; x < 200; x += 10) {
        for (let z = -200; z < 200; z += 10) {
            raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
            const feature = geo.pickFeature(raycaster);
            if (feature) hits.push({ x, z, feature });
        }
    }
    return hits;
}

/** Vertex colour of the face hit by a pick. */
function colorAt({ intersection }) {
    const color = intersection.object.geometry.getAttribute('color');
    const i = intersection.face.a;
    return { r: color.getX(i), g: color.getY(i), b: color.getZ(i) };
}

test('featureStyle changes only the features it styles, although they share batched meshes', async () => {
    const { geo } = await loadMap(server.url);
    const style = geo.getMapStyle();
    const before = lookDown(geo);
    const buildings = before.filter(hit => hit.feature.layer === 'building');
    const roads = before.filter(hit => hit.feature.layer === 'transportation');
    // OpenMapTiles leaves most ids at 0: only keys tell these features apart.
    assert.ok(buildings.filter(hit => hit.feature.id === 0).length > 1, 'buildings sharing id 0');
    const building = buildings.find(hit => hit.feature.id === 0).feature.key;
    const road = roads[0].feature.key;
    const heightBefore = new Map(buildings.map(({ x, z }) => [`${x},${z}`, geo.getHeightAt(x, z)]));

    const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    style.buildingLayer.featureStyle = ({ key }) => (key === building ? { color: 0xff0000, height: 150 } : null);
    style.forEachType(type => {
        if (type.outlineMaterial !== undefined) type.featureStyle = ({ key }) => (key === road ? { material: red } : null);
    });
    await settle(geo);

    let styled = 0;
    for (const hit of lookDown(geo)) {
        const { layer, key } = hit.feature;
        if (layer === 'building' && key === building) {
            styled++;
            const { g, b } = colorAt(hit.feature);
            assert.ok(g < 0.01 && b < 0.01, 'the styled building is red');
            assert.ok(Math.abs(geo.getHeightAt(hit.x, hit.z) - 150) < 0.01, 'the styled building is 150 m tall');
        } else if (layer === 'building') {
            const { g, b } = colorAt(hit.feature);
            assert.ok(g > 0.1 && b > 0.1, `building ${key} keeps its colour`);
            const height = heightBefore.get(`${hit.x},${hit.z}`);
            if (height !== undefined && hit.feature.intersection.point.y < 149) {
                assert.ok(Math.abs(geo.getHeightAt(hit.x, hit.z) - height) < 0.01, `building ${key} keeps its height`);
            }
        } else if (layer === 'transportation') {
            assert.equal(hit.feature.intersection.object.material === red, key === road, `road ${key}`);
        }
    }
    assert.ok(styled > 0, 'the styled building is in view');

    const glass = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
    style.buildingLayer.featureStyle = ({ key }) => (key === building ? { material: glass } : null);
    await settle(geo);
    for (const hit of lookDown(geo)) {
        if (hit.feature.layer !== 'building') continue;
        const material = hit.feature.intersection.object.material;
        assert.equal(material === glass, hit.feature.key === building, `material of building ${hit.feature.key}`);
    }
    geo.destroy();
});

test('feature keys are unique and the same in picking, featureStyle and getFeatures()', async () => {
    const { geo } = await loadMap(server.url);
    const styled = new Set();
    geo.getMapStyle().buildingLayer.featureStyle = ({ key }) => { styled.add(key); return null; };
    await settle(geo);

    const tile = geo.getTiles()[0];
    const keys = tile.getFeatures().map(feature => feature.key);
    assert.equal(new Set(keys).size, keys.length, 'no two features share a key');
    assert.match(keys[0], new RegExp(`^${tile.zoom}/${tile.x}/${tile.y}/`));

    const picked = lookDown(geo).filter(hit => hit.feature.layer === 'building');
    assert.ok(picked.length > 0 && picked.every(hit => styled.has(hit.feature.key)), 'picked keys are the styled ones');
    geo.destroy();
});

test('unitsPerMeter gives a metric scale', async () => {
    const { geo } = await loadMap(server.url, { unitsPerMeter: 1 });
    // 0.001° of latitude is about 111 m.
    const a = geo.latLonToWorld(ORIGIN.lat, ORIGIN.lon);
    const b = geo.latLonToWorld(ORIGIN.lat + 0.001, ORIGIN.lon);
    assert.ok(Math.abs(Math.abs(b.z - a.z) - 111.2) < 0.5);
    assert.equal(geo.getUnitsPerMeter(), 1);
    geo.destroy();
});

test('a zoomLevel the source does not serve is replaced by the nearest one', async () => {
    let geo;
    const warnings = await warningsOf(async () => {
        ({ geo } = await loadMap(server.url, { tileUrl: `${server.url}/tiles.json`, zoomLevel: 17 }));
    });
    assert.equal(geo.getMapConfig().zoomLevel, 16);
    assert.equal(geo.getUnitsPerMeter(), 1);
    assert.ok(geo.getTiles().length > 0);
    assert.match(warnings.join('\n'), /serves zoom levels 16–16: using zoomLevel 16 instead of 17/);
    geo.destroy();
});

test('a wrong tile URL is reported with a sourceerror event', async () => {
    const errors = [];
    const geo = new ThreeGeoPlay(new THREE.Scene(), new THREE.PerspectiveCamera(), fakeRenderer(), {
        tileUrl: `${server.url}/missing/{z}/{x}/{y}.pbf`, zoomLevel: 16, originLatLon: ORIGIN, renderDistance: 2,
    });
    geo.addEventListener('sourceerror', ({ error }) => errors.push(error.message));
    await warningsOf(async () => {
        geo.start();
        const start = Date.now();
        while (errors.length === 0 && Date.now() - start < 10000) {
            geo.onFrameUpdate();
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    });
    assert.match(errors[0] ?? '', /none of the first \d+ tiles exists/);
    geo.destroy();
});

test('destroy() removes the map from the scene and frees its geometry', async () => {
    const unloaded = [];
    const { geo, scene } = await loadMap(server.url);
    geo.addEventListener('tileunload', ({ tile }) => unloaded.push(tile));
    const tiles = geo.getTiles().length;
    geo.destroy();
    assert.equal(unloaded.length, tiles);
    assert.equal(scene.getObjectByName('ThreeGeoPlay'), undefined);
});

test('setMapStyle() restyles the loaded tiles without downloading them again', async () => {
    const { geo, scene } = await loadMap(server.url);
    const night = MapStyle.dark();
    geo.setMapStyle(night);
    await settle(geo);
    const materials = new Set(meshesOf(scene, 'building').map(mesh => mesh.material));
    assert.deepEqual([...materials], [night.buildingLayer.material]);
    geo.destroy();
});
