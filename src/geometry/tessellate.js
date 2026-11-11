/**
 * Splits long edges for {@link MapConfig#maxSegmentMeters}: a vertex shader that
 * bends the map (a curved world, a terrain) moves the vertices only, and a long
 * edge stays straight between them, away from the bent surface. Every helper
 * here leaves the shape exactly as it was; it only adds vertices on the edges.
 *
 * Coordinates are flat `[x0, y0, x1, y1, …]` arrays.
 */

/**
 * The line with points added so that no segment is longer than `maxLength`
 * (each segment split into equal parts).
 * @param {ArrayLike<number>} line
 * @param {number} maxLength - `Infinity` or `0`/`null` for none.
 * @returns {ArrayLike<number>} The line itself when nothing is added.
 */
export function densifyLine(line, maxLength) {
    if (!(maxLength > 0 && maxLength < Infinity) || !needsSplit(line, maxLength, false)) return line;
    const out = [line[0], line[1]];
    for (let i = 2; i + 1 < line.length; i += 2) splitEdge(out, line[i - 2], line[i - 1], line[i], line[i + 1], maxLength);
    return out;
}

/**
 * The closed ring (last point joined to the first, MVT style) with points added
 * so that no edge is longer than `maxLength`. An edge is split at the same points
 * whichever way it is walked, so two polygons sharing an edge still share every
 * vertex of it (walls shared by attached buildings stay recognisable).
 * @param {ArrayLike<number>} ring
 * @param {number} maxLength
 * @returns {ArrayLike<number>} The ring itself when nothing is added.
 */
export function densifyRing(ring, maxLength) {
    if (!(maxLength > 0 && maxLength < Infinity) || !needsSplit(ring, maxLength, true)) return ring;
    const out = [];
    const n = ring.length;
    for (let i = 0; i + 1 < n; i += 2) {
        const j = (i + 2) % n;
        out.push(ring[i], ring[i + 1]);
        splitEdge(out, ring[i], ring[i + 1], ring[j], ring[j + 1], maxLength, false);
    }
    return out;
}

/**
 * Triangles split until no edge is longer than `maxLength`: each triangle is cut
 * through the middle of its longest edge, again and again, and the middle of an
 * edge is one shared vertex for both triangles on its sides, so the mesh stays
 * watertight (no T-junctions).
 * @param {ArrayLike<number>} flat - Vertex coordinates `[x, y, …]`.
 * @param {ArrayLike<number>} indices - Triangles, three vertex indices each.
 * @param {number} maxLength
 * @returns {{ flat: ArrayLike<number>, indices: ArrayLike<number> }} The input itself when nothing is split.
 */
export function subdivideTriangles(flat, indices, maxLength) {
    if (!(maxLength > 0 && maxLength < Infinity)) return { flat, indices };
    const max2 = maxLength * maxLength;
    const length2 = (a, b) => (points[2 * a] - points[2 * b]) ** 2 + (points[2 * a + 1] - points[2 * b + 1]) ** 2;
    let points = null;
    const midpoints = new Map();
    const midpoint = (a, b) => {
        const key = a < b ? a * 0x200000 + b : b * 0x200000 + a;
        let m = midpoints.get(key);
        if (m === undefined) {
            m = points.length / 2;
            points.push((points[2 * a] + points[2 * b]) / 2, (points[2 * a + 1] + points[2 * b + 1]) / 2);
            midpoints.set(key, m);
        }
        return m;
    };

    // Nothing to do for most polygons: check before copying anything
    let any = false;
    for (let i = 0; i < indices.length && !any; i += 3) {
        for (let k = 0; k < 3 && !any; k++) {
            const a = indices[i + k], b = indices[i + (k + 1) % 3];
            any = (flat[2 * a] - flat[2 * b]) ** 2 + (flat[2 * a + 1] - flat[2 * b + 1]) ** 2 > max2;
        }
    }
    if (!any) return { flat, indices };

    points = Array.from(flat);
    const out = [];
    const stack = [];
    for (let i = 0; i < indices.length; i += 3) {
        stack.push(indices[i], indices[i + 1], indices[i + 2]);
        while (stack.length > 0) {
            const c = stack.pop(), b = stack.pop(), a = stack.pop();
            const ab = length2(a, b), bc = length2(b, c), ca = length2(c, a);
            const longest = Math.max(ab, bc, ca);
            if (longest <= max2) {
                out.push(a, b, c);
                continue;
            }
            // Cut through the middle of the longest edge, keeping the winding
            if (longest === ab) {
                const m = midpoint(a, b);
                stack.push(a, m, c, m, b, c);
            } else if (longest === bc) {
                const m = midpoint(b, c);
                stack.push(a, b, m, a, m, c);
            } else {
                const m = midpoint(c, a);
                stack.push(a, b, m, m, b, c);
            }
        }
    }
    return { flat: points, indices: out };
}

/** Whether a segment of the line (or ring, closing edge included) is longer than `maxLength`. */
function needsSplit(line, maxLength, closed) {
    const max2 = maxLength * maxLength;
    const n = line.length;
    for (let i = 0; i + 1 < n; i += 2) {
        if (!closed && i + 3 >= n) break;
        const j = (i + 2) % n;
        if ((line[j] - line[i]) ** 2 + (line[j + 1] - line[i + 1]) ** 2 > max2) return true;
    }
    return false;
}

/**
 * Pushes the points that split the edge (x0, y0) → (x1, y1) into equal parts no
 * longer than `maxLength`, then (unless `withEnd` is false) the end point. The
 * parts are computed from the edge's endpoints in a fixed order, so walking the
 * edge either way gives bit-identical points.
 */
function splitEdge(out, x0, y0, x1, y1, maxLength, withEnd = true) {
    const parts = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxLength);
    const forward = x0 < x1 || (x0 === x1 && y0 <= y1);
    const [ax, ay, bx, by] = forward ? [x0, y0, x1, y1] : [x1, y1, x0, y0];
    for (let k = 1; k < parts; k++) {
        const t = (forward ? k : parts - k) / parts;
        out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
    if (withEnd) out.push(x1, y1);
}
