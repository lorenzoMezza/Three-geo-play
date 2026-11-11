import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendThickLine } from '../src/geometry/lineGeometry.js';
import { FloatArrayBuilder } from '../src/geometry/FloatArrayBuilder.js';

/** Triangles of one straight segment: 2 for the body, `jointSegments - 1` for each round cap. */
const triangles = (width, jointSegments, roundEnds = true) => {
    const out = new FloatArrayBuilder();
    appendThickLine(out, [0, 0, 100, 0], width, jointSegments, 0, roundEnds);
    return out.length / 9;
};

test('round caps always use jointSegments, at any line width', () => {
    for (const width of [0.5, 2.5, 8, 16, 200]) {
        for (const segments of [6, 8, 50]) {
            assert.equal(triangles(width, segments), 2 + 2 * (segments - 1), `width ${width}, jointSegments ${segments}`);
        }
    }
});

test('flat ends have no caps', () => {
    assert.equal(triangles(8, 50, false), 2);
});

/** Whether the point (x, z) lies in one of the triangles written to `out` (x, y, z per vertex). */
function covered(out, x, z) {
    const a = out.array;
    for (let i = 0; i < out.length; i += 9) {
        const [ax, az, bx, bz, cx, cz] = [a[i], a[i + 2], a[i + 3], a[i + 5], a[i + 6], a[i + 8]];
        const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
        const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
        const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
}

test('a nearly straight join leaves no sliver uncovered on the outer side of the turn', () => {
    // A turn of 0.015 rad, below the round join threshold, on a line 8 wide
    const half = 4;
    const turn = 0.015;
    const line = [0, 0, 100, 0, 100 + 100 * Math.cos(turn), 100 * Math.sin(turn)];
    const out = new FloatArrayBuilder();
    appendThickLine(out, line, 2 * half, 8, 0);
    // Every point within the line near the join, out to 0.999 of the half width
    for (let x = 99; x <= 101; x += 0.01) {
        for (let side = -1; side <= 1; side += 2) {
            for (const t of [0.5, 0.9, 0.99, 0.999]) {
                // Distance to the polyline from the nearest segment's side
                const z = side * half * t + (x > 100 ? (x - 100) * Math.tan(turn) : 0);
                assert.ok(covered(out, x, z), `uncovered at x=${x.toFixed(2)}, ${side > 0 ? 'left' : 'right'} ${t}`);
            }
        }
    }
});
