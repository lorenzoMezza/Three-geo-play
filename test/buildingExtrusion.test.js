import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MapStyle } from '../src/index.js';
import { serveTiles, loadMap, settle } from './helpers.js';

let server;
before(async () => { server = await serveTiles(); });
after(() => server.close());

/** A style with lit buildings, so that their geometry carries normals. */
function litStyle(simpleExtrusion) {
    const style = new MapStyle();
    style.buildingLayer.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    style.buildingLayer.simpleExtrusion = simpleExtrusion;
    return style;
}

/** Vertex count, lowest point and downward faces of the building geometry on screen. */
function buildingVertices(scene) {
    let count = 0, lowestY = Infinity, facingDown = 0;
    scene.traverse(object => {
        if (!object.isMesh || object.userData.kind !== 'building') return;
        const { position, normal } = object.geometry.attributes;
        for (const [start, length] of usedRanges(object)) {
            for (let i = start; i < start + length; i++) {
                count++;
                lowestY = Math.min(lowestY, position.getY(i));
                if (normal.getY(i) < -0.5) facingDown++;
            }
        }
    });
    return { count, lowestY, facingDown };
}

/** [first vertex, vertex count] of every tile geometry a mesh holds (BatchedMesh buffers have spare room). */
function usedRanges(mesh) {
    if (!mesh.isBatchedMesh) return [[0, mesh.geometry.attributes.position.count]];
    return mesh._geometryInfo.filter(info => info.active).map(info => [info.vertexStart, info.vertexCount]);
}

test('simpleExtrusion draws footprint prisms from the ground, with fewer triangles', async () => {
    const { geo, scene } = await loadMap(server.url);
    geo.setMapStyle(litStyle(false));
    await settle(geo);
    const detailed = buildingVertices(scene);
    assert.ok(detailed.facingDown > 0, 'the fixtures have raised building parts with an underside');

    geo.setMapStyle(litStyle(true));
    await settle(geo);
    const simple = buildingVertices(scene);

    assert.equal(simple.facingDown, 0, 'no undersides');
    assert.ok(Math.abs(simple.lowestY) < 1e-6, 'every building stands on the ground');
    assert.ok(simple.count < detailed.count, `fewer vertices (${simple.count} < ${detailed.count})`);
    geo.destroy();
});

test('simpleExtrusion is off by default and copied by clone()', () => {
    const style = new MapStyle();
    assert.equal(style.buildingLayer.simpleExtrusion, false);
    style.buildingLayer.simpleExtrusion = true;
    assert.equal(style.clone().buildingLayer.simpleExtrusion, true);
});
