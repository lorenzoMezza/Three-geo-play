/**
 * Thick-line triangulation with round caps and round joins.
 * All emitted triangles face +Y (visible from above with `THREE.FrontSide`).
 */

/** Joins sharper than this (radians) get a round wedge; flatter ones need nothing. */
const MIN_JOIN_ANGLE = 0.02;

let points = new Float64Array(256);

/** Appends a triangle, swapping two vertices if needed so that it faces +Y. */
function pushUp(out, ax, az, bx, bz, cx, cz, y) {
    if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) {
        out.pushTriangle(ax, y, az, cx, y, cz, bx, y, bz);
    } else {
        out.pushTriangle(ax, y, az, bx, y, bz, cx, y, cz);
    }
}

/** Fan of triangles around (cx, cz) sweeping the vector (vx, vz) by `angle` radians in `steps` steps. */
function pushFan(out, cx, cz, vx, vz, angle, steps, y) {
    const step = angle / steps;
    const cos  = Math.cos(step);
    const sin  = Math.sin(step);
    let x0 = vx, z0 = vz;
    for (let k = 0; k < steps; k++) {
        const x1 = x0 * cos - z0 * sin;
        const z1 = x0 * sin + z0 * cos;
        pushUp(out, cx, cz, cx + x0, cz + z0, cx + x1, cz + z1, y);
        x0 = x1; z0 = z1;
    }
}

/**
 * Appends the triangles of a thick polyline to `out`.
 *
 * Each segment is a rectangle. At an interior vertex only the outer side of the
 * turn leaves a gap, which is filled with a round wedge whose tessellation
 * follows the turn angle (nearly straight joins cost nothing). The ends get
 * round caps unless `roundEnds` is false.
 *
 * @param {import('./FloatArrayBuilder.js').FloatArrayBuilder} out
 * @param {ArrayLike<number>} line  - Flat `[x0, z0, x1, z1, …]` in local units.
 * @param {number} width            - Full line width in local units.
 * @param {number} capSegments      - Points per round cap (< 2 disables rounding).
 * @param {number} y                - Height of the line.
 * @param {boolean} [roundEnds=true] - `false` gives flat ends (joins stay round),
 *   e.g. for bridges, whose ends must not spill over the road they connect to.
 * @param {number} [tolerance=0] - Largest allowed gap between a round cap / join
 *   and the true circle, in local units. Narrow lines then need fewer triangles;
 *   `0` always uses the `capSegments` resolution.
 */
export function appendThickLine(out, line, width, capSegments, y, roundEnds = true, tolerance = 0) {
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
    // Angular step of the arcs: the user resolution, or coarser when the chord
    // stays within `tolerance` of the circle (narrow lines).
    let step = round ? Math.PI / (capSegments - 1) : Math.PI;
    if (tolerance > 0 && tolerance < half) step = Math.max(step, 2 * Math.acos(1 - tolerance / half));
    else if (tolerance >= half) step = Math.PI;
    const capSteps = Math.max(1, Math.ceil(Math.PI / step - 1e-9));

    let prevDx = 0, prevDz = 0;
    for (let i = 0; i < n - 1; i++) {
        const x1 = points[i * 2],     z1 = points[i * 2 + 1];
        const x2 = points[i * 2 + 2], z2 = points[i * 2 + 3];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const dx  = (x2 - x1) / len;
        const dz  = (z2 - z1) / len;
        const px  = -dz * half;
        const pz  =  dx * half;

        // Segment body.
        pushUp(out, x1 + px, z1 + pz, x2 + px, z2 + pz, x2 - px, z2 - pz, y);
        pushUp(out, x1 + px, z1 + pz, x2 - px, z2 - pz, x1 - px, z1 - pz, y);

        if (i === 0) {
            if (round && roundEnds) {
                // Start cap: from +perp, through -direction, to -perp.
                pushFan(out, x1, z1, px, pz, Math.PI, capSteps, y);
            }
        } else if (round) {
            // Join with the previous segment: wedge on the outer side of the turn.
            const cross = prevDx * dz - prevDz * dx;
            const dot   = prevDx * dx + prevDz * dz;
            const angle = Math.atan2(Math.abs(cross), dot);
            if (angle > MIN_JOIN_ANGLE) {
                const side = cross > 0 ? -1 : 1;           // outer side of the turn
                const vx   = -prevDz * half * side;        // outer corner of the previous segment
                const vz   =  prevDx * half * side;
                const steps = Math.max(1, Math.ceil(angle / step - 1e-9));
                pushFan(out, x1, z1, vx, vz, angle * (cross > 0 ? 1 : -1), steps, y);
            }
        }

        if (i === n - 2 && round && roundEnds) {
            // End cap: from -perp, through +direction, to +perp.
            pushFan(out, x2, z2, -px, -pz, Math.PI, capSteps, y);
        }

        prevDx = dx; prevDz = dz;
    }
}

