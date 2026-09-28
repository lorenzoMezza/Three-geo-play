import { earcut } from './earcut.js';

/**
 * Polygon helpers working on flat `[x0, y0, x1, y1, …]` rings expressed in
 * tile extent coordinates (MVT: X right, Y down, rings implicitly closed).
 */

/**
 * Signed ring area (surveyor's formula). Per the MVT spec exterior rings are positive.
 * @param {number[]} ring
 * @returns {number}
 */
export function signedArea(ring) {
    let sum = 0;
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        sum += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
    }
    return sum / 2;
}

/**
 * Splits the rings of a (multi)polygon feature into polygons, each being
 * `[exterior, ...holes]`. The first non-degenerate ring defines which winding
 * is "exterior", so non spec-compliant tiles with reversed winding still work.
 * Rings are normalised so exteriors always have a positive area.
 *
 * @param {number[][]} rings
 * @returns {number[][][]}
 */
export function classifyRings(rings) {
    const polygons = [];
    let polygon = null;
    let exteriorSign = 0;

    for (const ring of rings) {
        if (ring.length < 6) continue;
        const area = signedArea(ring);
        if (area === 0) continue;
        if (exteriorSign === 0) exteriorSign = Math.sign(area);

        if (exteriorSign < 0) reverseRing(ring);
        if (Math.sign(area) === exteriorSign) {
            if (polygon) polygons.push(polygon);
            polygon = [ring];
        } else if (polygon) {
            polygon.push(ring);
        }
    }
    if (polygon) polygons.push(polygon);
    return polygons;
}

function reverseRing(ring) {
    for (let i = 0, j = ring.length - 2; i < j; i += 2, j -= 2) {
        const x = ring[i], y = ring[i + 1];
        ring[i]     = ring[j];
        ring[i + 1] = ring[j + 1];
        ring[j]     = x;
        ring[j + 1] = y;
    }
}

/**
 * Clips a ring against the axis-aligned square `[min, max]²`
 * (Sutherland–Hodgman). Winding is preserved.
 *
 * @param {number[]} ring
 * @param {number} min
 * @param {number} max
 * @returns {number[]|null} The clipped ring, the input itself if fully inside, or `null` if nothing is left.
 */
export function clipRing(ring, min, max) {
    let inside = true;
    for (let i = 0; i < ring.length; i++) {
        const v = ring[i];
        if (v < min || v > max) { inside = false; break; }
    }
    if (inside) return ring;

    let out = clipAxis(ring, 0, min, true);
    out = clipAxis(out, 0, max, false);
    out = clipAxis(out, 1, min, true);
    out = clipAxis(out, 1, max, false);
    return out.length >= 6 ? out : null;
}

function clipAxis(ring, axis, bound, keepGreater) {
    const n = ring.length;
    if (n === 0) return ring;
    const out = [];

    let px = ring[n - 2], py = ring[n - 1];
    let pv = axis === 0 ? px : py;
    let pIn = keepGreater ? pv >= bound : pv <= bound;

    for (let i = 0; i < n; i += 2) {
        const cx = ring[i], cy = ring[i + 1];
        const cv = axis === 0 ? cx : cy;
        const cIn = keepGreater ? cv >= bound : cv <= bound;

        if (cIn !== pIn) {
            const t = (bound - pv) / (cv - pv);
            if (axis === 0) out.push(bound, py + t * (cy - py));
            else            out.push(px + t * (cx - px), bound);
        }
        if (cIn) out.push(cx, cy);

        px = cx; py = cy; pv = cv; pIn = cIn;
    }
    return out;
}

/**
 * Clips every ring of a polygon; returns `null` if the exterior vanishes.
 * @param {number[][]} polygon - `[exterior, ...holes]`
 * @param {number} min
 * @param {number} max
 * @returns {number[][]|null}
 */
export function clipPolygon(polygon, min, max) {
    const exterior = clipRing(polygon[0], min, max);
    if (!exterior) return null;
    const result = [exterior];
    for (let i = 1; i < polygon.length; i++) {
        const hole = clipRing(polygon[i], min, max);
        if (hole) result.push(hole);
    }
    return result;
}

/**
 * Triangulates a polygon.
 * @param {number[][]} polygon - `[exterior, ...holes]` in extent coordinates.
 * @returns {{ flat: ArrayLike<number>, indices: number[] }} Coordinates of every ring, one after the other, and the triangle indices into them.
 */
export function triangulate(polygon) {
    if (polygon.length === 1) return { flat: polygon[0], indices: earcut(polygon[0], null, 2) };

    const holeIndices = [];
    let total = 0;
    for (let i = 0; i < polygon.length; i++) {
        if (i > 0) holeIndices.push(total / 2);
        total += polygon[i].length;
    }
    const flat = new Float64Array(total);
    let offset = 0;
    for (const ring of polygon) { flat.set(ring, offset); offset += ring.length; }
    return { flat, indices: earcut(flat, holeIndices, 2) };
}

/**
 * Appends the up-facing triangles of a flat polygon.
 *
 * @param {import('./FloatArrayBuilder.js').FloatArrayBuilder} out
 * @param {number[][]} polygon - `[exterior, ...holes]` in extent coordinates.
 * @param {number} scale       - Extent → local units.
 * @param {number} y
 */
export function appendFlatPolygon(out, polygon, scale, y) {
    const { flat, indices } = triangulate(polygon);
    out.reserve(indices.length * 3);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 2, b = indices[i + 1] * 2, c = indices[i + 2] * 2;
        out.pushTriangle(
            flat[a] * scale, y, flat[a + 1] * scale,
            flat[c] * scale, y, flat[c + 1] * scale,
            flat[b] * scale, y, flat[b + 1] * scale,
        );
    }
}
