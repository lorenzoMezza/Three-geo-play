/**
 * Shares the vertices that are equal bit for bit (position, and normal and colour
 * when present) between the triangles that use them: an indexed geometry drawing
 * the same triangles, in the same order, with the same vertex data. The GPU then
 * runs the vertex shader once per shared vertex instead of once per corner, and
 * the buffers shrink (a quad of a wall or a road: 4 vertices instead of 6; a roof
 * of n corners: n instead of 3(n − 2)).
 *
 * Corner `i` of the input is entry `i` of the index, so whatever counts corners
 * (the feature ranges used for picking) counts index entries the same way.
 *
 * @param {{ positions: Float32Array, normals?: Float32Array, colors?: Uint8Array }} arrays
 *     Non-indexed triangles (3 floats per position / normal, 3 bytes per colour).
 * @returns {{ positions: Float32Array, normals?: Float32Array, colors?: Uint8Array, index: Uint16Array|Uint32Array }}
 */
export function indexVertices({ positions, normals, colors }) {
    const corners = positions.length / 3;
    const p = new Uint32Array(positions.buffer, positions.byteOffset, positions.length);
    const n = normals ? new Uint32Array(normals.buffer, normals.byteOffset, normals.length) : null;

    let size = 1;
    while (size < corners * 2) size *= 2;
    const mask   = size - 1;
    const table  = new Int32Array(size).fill(-1);   // hash slot → shared vertex
    const source = new Int32Array(corners);         // shared vertex → its first corner
    const index  = new Uint32Array(corners);
    let shared = 0;

    const equal = (a, b) => {
        const a3 = 3 * a, b3 = 3 * b;
        if (p[a3] !== p[b3] || p[a3 + 1] !== p[b3 + 1] || p[a3 + 2] !== p[b3 + 2]) return false;
        if (n && (n[a3] !== n[b3] || n[a3 + 1] !== n[b3 + 1] || n[a3 + 2] !== n[b3 + 2])) return false;
        if (colors && (colors[a3] !== colors[b3] || colors[a3 + 1] !== colors[b3 + 1] || colors[a3 + 2] !== colors[b3 + 2])) return false;
        return true;
    };

    for (let i = 0; i < corners; i++) {
        const i3 = 3 * i;
        let h = Math.imul(p[i3] ^ 0x9e3779b9, 0x85ebca6b);
        h = Math.imul(h ^ p[i3 + 1] ^ (h >>> 13), 0xc2b2ae35);
        h = Math.imul(h ^ p[i3 + 2] ^ (h >>> 16), 0x85ebca6b);
        if (colors) h = Math.imul(h ^ (colors[i3] | colors[i3 + 1] << 8 | colors[i3 + 2] << 16) ^ (h >>> 13), 0xc2b2ae35);
        h ^= h >>> 16;
        for (let slot = h & mask; ; slot = (slot + 1) & mask) {
            const v = table[slot];
            if (v < 0) {
                table[slot] = shared;
                source[shared] = i;
                index[i] = shared++;
                break;
            }
            if (equal(source[v], i)) {
                index[i] = v;
                break;
            }
        }
    }

    const copy = (array, Type) => {
        const out = new Type(shared * 3);
        for (let v = 0; v < shared; v++) {
            const from = 3 * source[v], to = 3 * v;
            out[to] = array[from];  out[to + 1] = array[from + 1];  out[to + 2] = array[from + 2];
        }
        return out;
    };
    // Copied as bits, so -0 and every float stay exactly what they were
    const out = { positions: new Float32Array(copy(p, Uint32Array).buffer) };
    if (n) out.normals = new Float32Array(copy(n, Uint32Array).buffer);
    if (colors) out.colors = copy(colors, Uint8Array);
    out.index = shared <= 0x10000 ? Uint16Array.from(index) : index;
    return out;
}
