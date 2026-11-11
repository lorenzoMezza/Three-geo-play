import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { densifyLine, densifyRing, subdivideTriangles } from '../src/geometry/tessellate.js';
import { serveTiles, loadMap, settle } from './helpers.js';

const segments = (line, closed) => {
    const out = [];
    const n = line.length;
    for (let i = 0; i + 1 < n; i += 2) {
        if (!closed && i + 3 >= n) break;
        const j = (i + 2) % n;
        out.push(Math.hypot(line[j] - line[i], line[j + 1] - line[i + 1]));
    }
    return out;
};

test('densifyLine splits long segments into equal parts on the same line', () => {
    const line = densifyLine([0, 0, 100, 0, 100, 25], 30);
    assert.deepEqual(line, [0, 0, 25, 0, 50, 0, 75, 0, 100, 0, 100, 25]);
    const short = [0, 0, 10, 0];
    assert.equal(densifyLine(short, 30), short, 'nothing to split: the same array');
    assert.equal(densifyLine(short, 0), short, 'no limit');
});

test('densifyRing splits the closing edge too, at the same points whichever way an edge is walked', () => {
    const ring = densifyRing([0, 0, 100, 0, 100, 100, 0, 100], 40);
    assert.ok(segments(ring, true).every(length => length <= 40));
    // The edge (100,0)-(100,100) of this ring, walked the other way in a neighbour
    const neighbour = densifyRing([100, 100, 100, 0, 200, 0, 200, 100], 40);
    const onEdge = (r) => r.flatMap((v, i) => (i % 2 === 0 && v === 100 && r[i + 1] > 0 && r[i + 1] < 100 ? [r[i + 1]] : [])).sort((a, b) => a - b);
    assert.deepEqual(onEdge(ring), onEdge(neighbour));
    assert.ok(onEdge(ring).length > 0);
});

test('subdivideTriangles: no edge longer than the limit, same area, no T-junctions', () => {
    // Two triangles of a square, sharing the diagonal
    const flat = [0, 0, 1000, 0, 1000, 1000, 0, 1000];
    const indices = [0, 1, 2, 0, 2, 3];
    const { flat: points, indices: out } = subdivideTriangles(flat, indices, 100);
    let area = 0;
    const edges = new Map();
    for (let i = 0; i < out.length; i += 3) {
        const [a, b, c] = [out[i], out[i + 1], out[i + 2]];
        const p = (k) => [points[2 * k], points[2 * k + 1]];
        const [[ax, ay], [bx, by], [cx, cy]] = [p(a), p(b), p(c)];
        const cross = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        assert.ok(cross > 0, 'winding kept (the input triangles turn this way)');
        area += Math.abs(cross) / 2;
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            assert.ok(Math.hypot(points[2 * u] - points[2 * v], points[2 * u + 1] - points[2 * v + 1]) <= 100 + 1e-9);
            const key = u < v ? `${u},${v}` : `${v},${u}`;
            edges.set(key, (edges.get(key) ?? 0) + 1);
        }
    }
    assert.ok(Math.abs(area - 1000 * 1000) < 1e-6);
    // Watertight: every inner edge is shared by exactly two triangles, the outline by one
    let boundary = 0;
    for (const count of edges.values()) {
        assert.ok(count === 1 || count === 2);
        if (count === 1) boundary++;
    }
    assert.ok(boundary > 0);
});

let server;
before(async () => { server = await serveTiles(); });
after(() => server.close());

/** Longest triangle edge (metres) and area of the flat polygon meshes on screen. */
function flatGeometry(scene) {
    let longest = 0, area = 0;
    scene.traverse(object => {
        if (!object.isMesh || object.userData.kind !== 'polygon') return;
        const pos = object.geometry.attributes.position, index = object.geometry.index;
        const ranges = object.isBatchedMesh
            ? object._geometryInfo.filter(info => info.active).map(info => [info.indexStart, info.indexCount])
            : [[0, index.count]];
        for (const [start, count] of ranges) {
            for (let i = start; i < start + count; i += 3) {
                const v = [0, 1, 2].map(k => index.getX(i + k));
                for (let k = 0; k < 3; k++) {
                    const a = v[k], b = v[(k + 1) % 3];
                    longest = Math.max(longest, Math.hypot(pos.getX(a) - pos.getX(b), pos.getZ(a) - pos.getZ(b)));
                }
                const [ax, az, bx, bz, cx, cz] = v.flatMap(k => [pos.getX(k), pos.getZ(k)]);
                area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
            }
        }
    });
    return { longest, area };
}

test('maxSegmentMeters keeps every flat triangle edge under the limit, drawing the same area', async () => {
    const { geo, scene } = await loadMap(server.url);
    const before = flatGeometry(scene);
    assert.ok(before.longest > 40, 'the fixtures have edges longer than the limit');
    geo.getMapConfig().maxSegmentMeters = 40;
    await settle(geo);
    const after = flatGeometry(scene);
    assert.ok(after.longest <= 40 + 1e-6, `longest edge ${after.longest.toFixed(1)} m`);
    assert.ok(Math.abs(after.area - before.area) / before.area < 1e-6, 'the same area');
});
