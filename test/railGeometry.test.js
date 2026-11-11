import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cut, crossingCuts, lineLength, offsetLine, splitAtSharpTurns, splitByCuts, stripRing } from '../src/geometry/railGeometry.js';
import { signedArea } from '../src/geometry/polygonGeometry.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('stripRing widens a line into a closed ring with the exterior winding', () => {
    const ring = stripRing([0, 0, 100, 0], 2);
    assert.equal(ring.length, 8);
    assert.ok(signedArea(ring) > 0);
    assert.ok(close(Math.abs(signedArea(ring)), 100 * 4));
});

test('offsetLine keeps the offset edges parallel across a bend (miter)', () => {
    const offset = offsetLine([0, 0, 100, 0, 100, 100], 10);
    assert.equal(offset.length, 6);
    // The corner moves along the bisector, √2 × the distance away
    assert.ok(close(Math.hypot(offset[2] - 100, offset[3] - 0), 10 * Math.SQRT2));
});

test('splitAtSharpTurns splits only where the line turns more than 60°', () => {
    assert.equal(splitAtSharpTurns([0, 0, 100, 0, 200, 20]).length, 1);
    const parts = splitAtSharpTurns([0, 0, 100, 0, 100, 100]);
    assert.equal(parts.length, 2);
    assert.deepEqual(parts[0].slice(-2), [100, 0]);
    assert.deepEqual(parts[1].slice(0, 2), [100, 0]);
});

test('a perpendicular crossing cuts its half width plus the margin on each side', () => {
    const track = [0, 0, 100, 0];
    const cuts = crossingCuts(track, [{ line: [50, -50, 50, 50], halfWidth: 5, cut: Cut.ALL }], 1);
    assert.equal(cuts.length, 1);
    assert.ok(close(cuts[0].from, 44) && close(cuts[0].to, 56));
});

test('an oblique crossing cuts a longer stretch, never more than 4 half widths', () => {
    const at45 = crossingCuts([0, 0, 100, 0], [{ line: [0, -50, 100, 50], halfWidth: 5, cut: Cut.BED }], 0)[0];
    assert.ok(close(at45.to - at45.from, 2 * 5 * Math.SQRT2));
    const grazing = crossingCuts([0, 0, 1000, 0], [{ line: [0, -1, 1000, 1], halfWidth: 5, cut: Cut.BED }], 0)[0];
    assert.ok(close(grazing.to - grazing.from, 2 * 5 * 4));
});

test('splitByCuts gives the stretches and the stronger cut where cuts overlap', () => {
    const track = [0, 0, 100, 0];
    const cuts = crossingCuts(track, [
        { line: [40, -50, 40, 50], halfWidth: 10, cut: Cut.BED },   // 30 – 50
        { line: [50, -50, 50, 50], halfWidth: 5, cut: Cut.ALL },    // 45 – 55
    ], 0);
    const stretches = splitByCuts(track, cuts).map(({ line, cut }) => [Math.round(line[0] * 1e6) / 1e6, Math.round(line[line.length - 2] * 1e6) / 1e6, cut]);
    assert.deepEqual(stretches, [[0, 30, 0], [30, 45, Cut.BED], [45, 55, Cut.ALL], [55, 100, 0]]);
    const total = splitByCuts(track, cuts).reduce((sum, { line }) => sum + lineLength(line), 0);
    assert.ok(close(total, 100));
});

test('a track without crossings is one stretch, a crossing outside it changes nothing', () => {
    const track = [0, 0, 50, 0, 100, 10];
    assert.deepEqual(splitByCuts(track, []), [{ line: track, cut: 0 }]);
    assert.deepEqual(crossingCuts(track, [{ line: [200, -50, 200, 50], halfWidth: 5, cut: Cut.ALL }], 1), []);
});
