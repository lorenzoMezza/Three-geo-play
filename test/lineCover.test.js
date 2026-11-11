import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendThickLine } from '../src/geometry/lineGeometry.js';
import { FloatArrayBuilder } from '../src/geometry/FloatArrayBuilder.js';
import { LineCover } from '../src/map/tileGeometry.js';

/** Triangles of the lines as [ax, az, bx, bz, cx, cz] (Y dropped). */
function triangles(lines, capsOf) {
    const out = new FloatArrayBuilder();
    lines.forEach(({ points, width }, i) => {
        const [start, end] = capsOf(i);
        appendThickLine(out, points, width, 8, 0, start, end);
    });
    const a = out.array, tris = [];
    for (let i = 0; i < out.length; i += 9) tris.push([a[i], a[i + 2], a[i + 3], a[i + 5], a[i + 6], a[i + 8]]);
    return tris;
}

function inside([ax, az, bx, bz, cx, cz], x, z) {
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(neg && pos);
}

const covered = (tris, x, z) => tris.some(t => inside(t, x, z));

test('leaving out the caps that LineCover hides changes coverage only within the arc tessellation', () => {
    const lines = [
        { points: [0, 0, 50, 0, 100, 0], width: 10 },     // through road
        { points: [50, 60, 50, 0], width: 6 },            // T-junction on a vertex of a wider road
        { points: [100, 0, 140, 30], width: 10 },          // continues the through road, end to end
        { points: [100, 0, 100, -50], width: 8 },          // narrower end meeting there
        { points: [140, 30, 180, 30], width: 10 },         // end to end, same width
        { points: [180, 30, 200, 60], width: 12 },         // wider end meeting a narrower one
        { points: [0, 0, -40, -40], width: 14 },           // wider line ending on a narrower end: keeps its cap
    ];
    const cover = new LineCover();
    const ids = lines.map(({ points, width }) => cover.add(points, width));
    cover.resolve();

    const full    = triangles(lines, () => [true, true]);
    const reduced = triangles(lines, i => ids[i].map(id => !cover.hidden.has(id)));
    assert.ok(cover.hidden.size >= 5, `caps left out: ${cover.hidden.size}`);
    assert.ok(reduced.length < full.length, `${reduced.length} < ${full.length} triangles`);

    // Caps and joins are polygons (8 points per half circle), not true circles:
    // two of them around one point differ by slivers up to the sagitta of one arc step.
    const ends = lines.flatMap(({ points: p, width }) => [[p[0], p[1], width / 2], [p.at(-2), p.at(-1), width / 2]]);
    const nearArc = (x, z) => ends.some(([ex, ez, r]) => {
        const sagitta = r * (1 - Math.cos(Math.PI / 7 / 2));
        return Math.abs(Math.hypot(x - ex, z - ez) - r) <= sagitta + 1e-6;
    });
    let differing = 0;
    for (let x = -60; x <= 215; x += 0.25) {
        for (let z = -70; z <= 80; z += 0.25) {
            if (covered(reduced, x, z) === covered(full, x, z)) continue;
            differing++;
            assert.ok(nearArc(x, z), `point ${x}, ${z} differs away from the arc tessellation`);
        }
    }
    assert.ok(differing < 40, `only slivers differ (${differing} samples)`);
});
