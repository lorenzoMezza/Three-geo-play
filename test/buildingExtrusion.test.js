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

test('simpleExtrusion leaves out walls shared with a neighbour at least as tall', async () => {
    const { BuildingGeometryBuilder, BuildingShading } = await import('../src/geometry/buildingGeometry.js');
    const shading = new BuildingShading({ groundY: 0, aoTop: 10, ambientOcclusion: 0, wallShading: 0 });
    const white = { r: 1, g: 1, b: 1 };
    // Two squares side by side; the shared wall runs (10,0)→(10,10) in the left one, the other way in the right one.
    const left  = [[0, 0, 10, 0, 10, 10, 0, 10]];
    const right = [[10, 0, 20, 0, 20, 10, 10, 10]];
    const walls = (tops, polygon, top) => {
        const out = new BuildingGeometryBuilder();
        const hidden = (x0, y0, x1, y1) => (tops.get(`${x1},${y1},${x0},${y0}`) ?? -1) >= top;
        out.appendBuilding(polygon, 1, 0, top, -100, 100, shading, white, white, false, hidden);
        return (out.length / 3 - 6) / 6;   // vertices minus the two roof triangles, 6 per wall
    };
    const tops = new Map([['10,10,10,0', 20], ['10,0,10,10', 30]]);   // left's wall: 30 m, right's wall: 20 m
    assert.equal(walls(tops, left, 30), 4, 'the taller building keeps its shared wall');
    assert.equal(walls(tops, right, 20), 3, 'the lower one drops it: it is inside its neighbour');
});
