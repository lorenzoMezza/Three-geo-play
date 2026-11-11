import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MapStyle } from '../src/index.js';
import { serveTiles, loadMap, settle } from './helpers.js';

let server;
before(async () => { server = await serveTiles(); });
after(() => server.close());

/** OpenMapTiles roads, with the rail classes routed to the railway layer (`roads: false` leaves the roads out). */
const schema = ({ roads = true } = {}) => (sourceLayer, p) => {
    if (sourceLayer !== 'transportation') return null;
    if (p.class === 'rail' || p.class === 'transit') return { layer: 'railway', type: [p.subclass, p.class] };
    return roads ? { layer: 'transportation', type: [p.subclass, p.class] } : null;
};

const bed  = new THREE.MeshBasicMaterial({ vertexColors: true });
const rail = new THREE.MeshBasicMaterial({ vertexColors: true });
const style = () => {
    const s = new MapStyle();
    s.railwayLayer.setAllMaterials(bed, rail);
    return s;
};

/** Vertex count and height range of the geometry drawn with `material`. */
function drawn(scene, material) {
    let count = 0, minY = Infinity, maxY = -Infinity;
    scene.traverse(object => {
        if (!object.isMesh || object.material !== material) return;
        const { position } = object.geometry.attributes;
        const ranges = object.isBatchedMesh
            ? object._geometryInfo.filter(info => info.active).map(info => [info.vertexStart, info.vertexCount])
            : [[0, position.count]];
        for (const [start, length] of ranges) {
            for (let i = start; i < start + length; i++) {
                count++;
                minY = Math.min(minY, position.getY(i));
                maxY = Math.max(maxY, position.getY(i));
            }
        }
    });
    return { count, minY, maxY };
}

test('railways routed to the railway layer are drawn in relief: a bed with rails on top', async () => {
    const { geo, scene } = await loadMap(server.url, { tileSchema: schema() });
    const s = style();
    geo.setMapStyle(s);
    await settle(geo);
    const beds = drawn(scene, bed), rails = drawn(scene, rail);
    assert.ok(beds.count > 0 && rails.count > 0, 'the fixtures have railways');
    const { bedHeightMeters, railHeightMeters } = s.railwayLayer.rail;
    assert.ok(Math.abs(beds.maxY - bedHeightMeters) < 1e-3, 'beds end at their height');
    assert.ok(Math.abs(rails.maxY - (bedHeightMeters + railHeightMeters)) < 1e-3, 'rails stand on the bed');
    assert.ok(beds.minY >= -1e-6, 'nothing below the ground: tunnels are not drawn');
});

test('trams have rails flush with the street and no bed', async () => {
    const { geo, scene } = await loadMap(server.url, { tileSchema: schema() });
    const s = style();
    s.railwayLayer.setVisibleAll(false);
    s.railwayLayer.tram.isVisible = true;
    geo.setMapStyle(s);
    await settle(geo);
    assert.equal(drawn(scene, bed).count, 0);
    const rails = drawn(scene, rail);
    assert.ok(rails.count > 0, 'the fixtures have a tram line');
    assert.ok(Math.abs(rails.maxY - s.railwayLayer.tram.railHeightMeters) < 1e-3);
});

/** Area (m²) of the horizontal faces drawn with `material` at height `y`: the top of the beds. */
function topArea(scene, material, y) {
    let area = 0;
    scene.traverse(object => {
        if (!object.isMesh || object.material !== material) return;
        const { position } = object.geometry.attributes;
        const index = object.geometry.index;
        const ranges = object.isBatchedMesh
            ? object._geometryInfo.filter(info => info.active).map(info => [info.indexStart, info.indexCount])
            : [[0, index.count]];
        const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        for (const [start, count] of ranges) {
            for (let i = start; i < start + count; i += 3) {
                for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(position, index.getX(i + k));
                if (v.some(p => Math.abs(p.y - y) > 1e-4)) continue;
                area += Math.abs((v[1].x - v[0].x) * (v[2].z - v[0].z) - (v[2].x - v[0].x) * (v[1].z - v[0].z)) / 2;
            }
        }
    });
    return area;
}

test('roads crossing the tracks cut them: less bed with the roads than without', async () => {
    const withRoads = await loadMap(server.url, { tileSchema: schema() });
    withRoads.geo.setMapStyle(style());
    await settle(withRoads.geo);
    const without = await loadMap(server.url, { tileSchema: schema({ roads: false }) });
    without.geo.setMapStyle(style());
    await settle(without.geo);
    const top = style().railwayLayer.rail.bedHeightMeters;
    const cut = topArea(withRoads.scene, bed, top), whole = topArea(without.scene, bed, top);
    assert.ok(whole > 0 && cut < whole, `bed top ${cut.toFixed(0)} m² with roads, ${whole.toFixed(0)} m² without`);
});
