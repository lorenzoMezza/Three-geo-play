import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexVertices } from '../src/geometry/indexVertices.js';

/** The corners an indexed geometry draws, as [x, y, z, nx, ny, nz, r, g, b] per corner. */
function corners({ positions, normals, colors, index }) {
    return Array.from(index, v => [
        ...positions.slice(3 * v, 3 * v + 3),
        ...(normals ? normals.slice(3 * v, 3 * v + 3) : []),
        ...(colors ? colors.slice(3 * v, 3 * v + 3) : []),
    ]);
}

function plain({ positions, normals, colors }) {
    return Array.from({ length: positions.length / 3 }, (_, i) => [
        ...positions.slice(3 * i, 3 * i + 3),
        ...(normals ? normals.slice(3 * i, 3 * i + 3) : []),
        ...(colors ? colors.slice(3 * i, 3 * i + 3) : []),
    ]);
}

test('a quad shares its two diagonal corners', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
    const out = indexVertices({ positions });
    assert.equal(out.positions.length / 3, 4);
    assert.deepEqual(Array.from(out.index), [0, 1, 2, 0, 2, 3]);
    assert.deepEqual(corners(out), plain({ positions }));
});

test('vertices are shared only when every attribute is equal, bit for bit', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0, 1, 0]);
    const colors = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 0]);
    const out = indexVertices({ positions, colors });
    // (0,0,0) is shared; (1,0,0) differs in colour; (-0,1,0) differs from (0,1,0) in its bits
    assert.equal(out.positions.length / 3, 5);
    assert.deepEqual(corners(out), plain({ positions, colors }));
    assert.ok(Object.is(out.positions[3 * out.index[5]], -0));
});

test('a large random mesh draws exactly the same corners, in the same order', () => {
    let seed = 3;
    const random = () => (seed = (seed * 16807) % 2147483647) % 40;
    const count = 3 * 30000;
    const positions = new Float32Array(3 * count), normals = new Float32Array(3 * count), colors = new Uint8Array(3 * count);
    for (let i = 0; i < 3 * count; i++) {
        positions[i] = random() / 4;
        normals[i] = random() % 2;
        colors[i] = random() % 3;
    }
    const out = indexVertices({ positions, normals, colors });
    assert.ok(out.positions.length < positions.length);
    assert.ok(out.index instanceof Uint32Array || out.positions.length / 3 <= 0x10000);
    assert.deepEqual(corners(out), plain({ positions, normals, colors }));
});
