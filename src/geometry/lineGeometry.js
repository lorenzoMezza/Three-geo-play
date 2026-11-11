/**
 * Thick-line triangulation with round caps and round joins.
 * All emitted triangles face +Y (visible from above with `THREE.FrontSide`).
 */

/**
 * Joins sharper than this (radians) get a round wedge; flatter ones a miter: both
 * segments end on the same two corners, so no sliver is left between them.
 */
const MIN_JOIN_ANGLE = 0.02;

let points = new Float64Array(256);
let directions = new Float64Array(256);

/** Appends a triangle, swapping two vertices if needed so that it faces +Y. */
function pushUp(out, ax, az, bx, bz, cx, cz, y) {
    if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) {
        out.pushTriangle(ax, y, az, cx, y, cz, bx, y, bz);
    } else {
        out.pushTriangle(ax, y, az, bx, y, bz, cx, y, cz);
    }
}

/**
 * Fan of triangles around (cx, cz) sweeping the vector (vx, vz) by `angle` radians in
 * `steps` steps, ending exactly on (ex, ez): the corner of the segment it meets, so the
 * two share their vertices and no hairline crack opens between them.
 */
function pushFan(out, cx, cz, vx, vz, angle, steps, y, ex, ez) {
    const step = angle / steps;
    const cos  = Math.cos(step);
    const sin  = Math.sin(step);
    let x0 = vx, z0 = vz;
    for (let k = 0; k < steps; k++) {
        const last = k === steps - 1;
        const x1 = last ? ex : x0 * cos - z0 * sin;
        const z1 = last ? ez : x0 * sin + z0 * cos;
        pushUp(out, cx, cz, cx + x0, cz + z0, cx + x1, cz + z1, y);
        x0 = x1; z0 = z1;
    }
}

/**
 * Appends the triangles of a thick polyline to `out`.
 *
 * Each segment is a rectangle. At an interior vertex only the outer side of the
 * turn leaves a gap, which is filled with a round wedge whose tessellation
 * follows the turn angle; nearly straight joins are mitered instead (they cost
 * nothing). Neighbouring pieces always share their vertices exactly: no crack.
 * The ends get round caps unless `roundStart` / `roundEnd` are false.
 *
 * @param {import('./FloatArrayBuilder.js').FloatArrayBuilder} out
 * @param {ArrayLike<number>} line  - Flat `[x0, z0, x1, z1, …]` in local units.
 * @param {number} width            - Full line width in local units.
 * @param {number} capSegments      - Points per round cap (< 2 disables rounding).
 * @param {number} y                - Height of the line.
 * @param {boolean} [roundStart=true] - `false` gives a flat start (joins stay round),
 *   e.g. for bridges, whose ends must not spill over the road they connect to,
 *   or for a cap that another line already covers.
 * @param {boolean} [roundEnd=roundStart] - Same for the end of the line.
 */
export function appendThickLine(out, line, width, capSegments, y, roundStart = true, roundEnd = roundStart) {
    const half = width * 0.5;
    if (!(half > 0)) return;

    // Drop repeated points so every segment has a direction.
    const inCount = line.length >> 1;
    if (points.length < inCount * 2) points = new Float64Array(inCount * 2);
    let n = 0;
    for (let i = 0; i < inCount; i++) {
        const x = line[i * 2], z = line[i * 2 + 1];
        if (n > 0 && x === points[n * 2 - 2] && z === points[n * 2 - 1]) continue;
        points[n * 2] = x; points[n * 2 + 1] = z;
        n++;
    }
    if (n < 2) return;

    const round = capSegments >= 2;
    // Angular step of the arcs: always the user resolution, whatever the width.
    const step     = round ? Math.PI / (capSegments - 1) : Math.PI;
    const capSteps = Math.max(1, Math.ceil(Math.PI / step - 1e-9));

    // Unit direction of every segment
    if (directions.length < n * 2) directions = new Float64Array(n * 2);
    for (let i = 0; i < n - 1; i++) {
        const dx = points[i * 2 + 2] - points[i * 2], dz = points[i * 2 + 3] - points[i * 2 + 1];
        const len = Math.hypot(dx, dz);
        directions[i * 2] = dx / len;
        directions[i * 2 + 1] = dz / len;
    }
    // Offset (from the vertex) of the left corner of a nearly straight join, shared by
    // both segments: the miter, along the mean of their normals; null for a real turn
    const miter = (i) => {
        if (i <= 0 || i >= n - 1) return null;
        const ax = directions[i * 2 - 2], az = directions[i * 2 - 1];
        const bx = directions[i * 2],     bz = directions[i * 2 + 1];
        const angle = Math.atan2(Math.abs(ax * bz - az * bx), ax * bx + az * bz);
        if (angle > MIN_JOIN_ANGLE) return null;
        const mx = -(az + bz), mz = ax + bx;           // sum of the two normals
        const scale = half / Math.max(mx * -bz + mz * bx, 1e-9);   // ÷ (normal · miter)
        return [mx * scale, mz * scale];
    };

    let startMiter = null;
    for (let i = 0; i < n - 1; i++) {
        const x1 = points[i * 2],     z1 = points[i * 2 + 1];
        const x2 = points[i * 2 + 2], z2 = points[i * 2 + 3];
        const dx  = directions[i * 2], dz = directions[i * 2 + 1];
        const px  = -dz * half;
        const pz  =  dx * half;
        const endMiter = miter(i + 1);
        const [sx, sz] = startMiter ?? [px, pz];
        const [ex, ez] = endMiter ?? [px, pz];

        // Segment body.
        pushUp(out, x1 + sx, z1 + sz, x2 + ex, z2 + ez, x2 - ex, z2 - ez, y);
        pushUp(out, x1 + sx, z1 + sz, x2 - ex, z2 - ez, x1 - sx, z1 - sz, y);

        if (i === 0) {
            if (round && roundStart) {
                // Start cap: from +perp, through -direction, to -perp.
                pushFan(out, x1, z1, px, pz, Math.PI, capSteps, y, -px, -pz);
            }
        } else if (round && !startMiter) {
            // Join with the previous segment: wedge on the outer side of the turn,
            // from the outer corner of the previous segment to the one of this segment.
            const prevDx = directions[i * 2 - 2], prevDz = directions[i * 2 - 1];
            const cross = prevDx * dz - prevDz * dx;
            const dot   = prevDx * dx + prevDz * dz;
            const angle = Math.atan2(Math.abs(cross), dot);
            const side = cross > 0 ? -1 : 1;           // outer side of the turn
            const vx   = -prevDz * half * side;        // outer corner of the previous segment
            const vz   =  prevDx * half * side;
            const steps = Math.max(1, Math.ceil(angle / step - 1e-9));
            pushFan(out, x1, z1, vx, vz, angle * (cross > 0 ? 1 : -1), steps, y, px * side, pz * side);
        }

        if (i === n - 2 && round && roundEnd) {
            // End cap: from -perp, through +direction, to +perp.
            pushFan(out, x2, z2, -px, -pz, Math.PI, capSteps, y, px, pz);
        }

        startMiter = endMiter;
    }
}

