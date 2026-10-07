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
