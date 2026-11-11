/**
 * Geometry helpers of the railways ({@link RailwayLayer}): a track is drawn as a
 * raised bed (an extrusion of the line widened to the bed width) with two rails
 * on top (two narrow extrusions, half a gauge on each side of the line).
 *
 * Lines are flat `[x0, y0, x1, y1, …]` arrays in tile extent coordinates.
 */

import { signedArea } from './polygonGeometry.js';

/** Joins sharper than this (radians) split the line: the strip around them would fold over itself. */
const MAX_TURN = Math.PI / 3;

/** Miter joins longer than this many half widths are cut (bevelled). */
const MITER_LIMIT = 2;

/** Cuts never extend more than this many half widths of the crossing line along the track (grazing crossings). */
const MAX_CUT_STRETCH = 4;

/** What a crossing leaves of the track. */
export const Cut = Object.freeze({
    /** The crossing line is above the track (a bridge over it): nothing of the track is drawn. */
    ALL: 2,
    /** A level crossing: the rails run flush with the road, without the raised bed. */
    BED: 1,
});

/**
 * Closed ring around a line, `halfWidth` on each side, with mitered joins
 * (bevelled beyond {@link MITER_LIMIT}) and flat ends. Positive area (MVT
 * exterior winding), so it can be extruded as is.
 *
 * @param {ArrayLike<number>} line - At least two distinct points.
 * @param {number} halfWidth
 * @returns {number[]|null} `null` for a degenerate line.
 */
export function stripRing(line, halfWidth) {
    const left  = offsetLine(line, halfWidth);
    const right = offsetLine(line, -halfWidth);
    if (!left || !right) return null;
    const ring = left;
    for (let i = right.length - 2; i >= 0; i -= 2) ring.push(right[i], right[i + 1]);
    return signedArea(ring) < 0 ? reverse(ring) : ring;
}

/**
 * The line moved sideways by `distance` (positive: to the left of the direction
 * of travel in a Y-down frame, i.e. along `(dy, -dx)`), with mitered joins.
 * @param {ArrayLike<number>} line
 * @param {number} distance
 * @returns {number[]|null}
 */
export function offsetLine(line, distance) {
    const points = dedupe(line);
    const n = points.length / 2;
    if (n < 2) return null;
    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = i > 0 ? normal(points, i - 1) : null;
        const next = i < n - 1 ? normal(points, i) : null;
        const x = points[2 * i], y = points[2 * i + 1];
        if (!prev || !next) {
            const [nx, ny] = prev ?? next;
            out.push(x + nx * distance, y + ny * distance);
            continue;
        }
        // Miter: the bisector of the two normals, lengthened so the edges stay parallel
        let mx = prev[0] + next[0], my = prev[1] + next[1];
        const ml = Math.hypot(mx, my);
        const cos = ml / 2;   // cosine of half the turn
        if (ml < 1e-9 || 1 / cos > MITER_LIMIT) {
            // Bevel: both edge ends
            out.push(x + prev[0] * distance, y + prev[1] * distance, x + next[0] * distance, y + next[1] * distance);
            continue;
        }
        mx /= ml; my /= ml;
        const length = distance / cos;
        out.push(x + mx * length, y + my * length);
    }
    return out;
}

/**
 * The line split where it turns sharply (more than {@link MAX_TURN}): each part
 * can be widened into a strip that does not fold over itself.
 * @param {ArrayLike<number>} line
 * @returns {number[][]}
 */
export function splitAtSharpTurns(line) {
    const points = dedupe(line);
    const n = points.length / 2;
    if (n < 2) return [];
    const parts = [];
    let part = [points[0], points[1]];
    for (let i = 1; i < n - 1; i++) {
        part.push(points[2 * i], points[2 * i + 1]);
        const [ax, ay] = direction(points, i - 1);
        const [bx, by] = direction(points, i);
        const turn = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by)));
        if (turn > MAX_TURN) {
            parts.push(part);
            part = [points[2 * i], points[2 * i + 1]];
        }
    }
    part.push(points[2 * n - 2], points[2 * n - 1]);
    parts.push(part);
    return parts;
}

/**
 * The stretches of a track crossed by other lines, as distances along it.
 * A crossing line cuts the track over its own half width plus `margin`,
 * measured across it (so a road crossing at an angle cuts a longer stretch).
 *
 * @param {ArrayLike<number>} line - The track.
 * @param {{ line: ArrayLike<number>, halfWidth: number, cut: number }[]} crossings - Lines that may cross it, with the {@link Cut} they make.
 * @param {number} margin - Added to every half width.
 * @returns {{ from: number, to: number, cut: number }[]} Sorted by `from`, overlapping stretches merged (the stronger cut wins where they overlap).
 */
export function crossingCuts(line, crossings, margin) {
    const cuts = [];
    let start = 0;
    for (let i = 0; i + 3 < line.length; i += 2) {
        const ax = line[i], ay = line[i + 1], bx = line[i + 2], by = line[i + 3];
        const length = Math.hypot(bx - ax, by - ay);
        if (length === 0) continue;
        const ux = (bx - ax) / length, uy = (by - ay) / length;
        for (const crossing of crossings) {
            const c = crossing.line;
            for (let k = 0; k + 3 < c.length; k += 2) {
                const hit = intersect(ax, ay, bx, by, c[k], c[k + 1], c[k + 2], c[k + 3]);
                if (hit === null) continue;
                const cl = Math.hypot(c[k + 2] - c[k], c[k + 3] - c[k + 1]);
                const sin = Math.abs(ux * (c[k + 3] - c[k + 1]) - uy * (c[k + 2] - c[k])) / cl;
                const half = crossing.halfWidth + margin;
                const reach = Math.min(half / Math.max(sin, 1e-6), half * MAX_CUT_STRETCH);
                const at = start + hit * length;
                cuts.push({ from: at - reach, to: at + reach, cut: crossing.cut });
            }
        }
        start += length;
    }
    return mergeCuts(cuts);
}

/**
 * The track split into stretches by its cuts: each stretch is a polyline with
 * the {@link Cut} that applies to it (`0` for none).
 * @param {ArrayLike<number>} line
 * @param {{ from: number, to: number, cut: number }[]} cuts - From {@link crossingCuts}.
 * @returns {{ line: number[], cut: number }[]}
 */
export function splitByCuts(line, cuts) {
    const points = dedupe(line);
    if (points.length < 4) return [];
    if (cuts.length === 0) return [{ line: points, cut: 0 }];

    // Breakpoints: the ends of the line and of every cut, each stretch between two of them uniform
    const total = lineLength(points);
    const marks = [0, total];
    for (const { from, to } of cuts) marks.push(Math.max(0, Math.min(total, from)), Math.max(0, Math.min(total, to)));
    marks.sort((a, b) => a - b);

    const out = [];
    for (let i = 0; i + 1 < marks.length; i++) {
        const from = marks[i], to = marks[i + 1];
        if (to - from <= 1e-9) continue;
        const mid = (from + to) / 2;
        let cut = 0;
        for (const c of cuts) if (c.from <= mid && mid <= c.to) cut = Math.max(cut, c.cut);
        const piece = sliceLine(points, from, to);
        const last = out[out.length - 1];
        // Neighbouring stretches with the same cut are one polyline
        if (last && last.cut === cut) last.line.push(...piece.slice(2));
        else out.push({ line: piece, cut });
    }
    return out;
}

/** Length of a polyline. */
export function lineLength(line) {
    let length = 0;
    for (let i = 0; i + 3 < line.length; i += 2) length += Math.hypot(line[i + 2] - line[i], line[i + 3] - line[i + 1]);
    return length;
}

/** The part of a polyline between two distances along it. */
function sliceLine(points, from, to) {
    const out = [];
    let start = 0;
    for (let i = 0; i + 3 < points.length; i += 2) {
        const ax = points[i], ay = points[i + 1], bx = points[i + 2], by = points[i + 3];
        const length = Math.hypot(bx - ax, by - ay);
        const end = start + length;
        if (end >= from && start <= to && length > 0) {
            const t0 = Math.max(0, (from - start) / length);
            const t1 = Math.min(1, (to - start) / length);
            if (out.length === 0) out.push(ax + (bx - ax) * t0, ay + (by - ay) * t0);
            out.push(ax + (bx - ax) * t1, ay + (by - ay) * t1);
        }
        start = end;
        if (start > to) break;
    }
    return out;
}

/** Overlapping cuts merged; where a stronger cut overlaps a weaker one, the overlap takes the stronger. */
function mergeCuts(cuts) {
    if (cuts.length === 0) return cuts;
    // Each strength merged on its own; splitByCuts resolves overlaps between strengths
    const out = [];
    for (const strength of [Cut.ALL, Cut.BED]) {
        const same = cuts.filter(c => c.cut === strength).sort((a, b) => a.from - b.from);
        let current = null;
        for (const c of same) {
            if (current && c.from <= current.to) current.to = Math.max(current.to, c.to);
            else out.push(current = { ...c });
        }
    }
    return out.sort((a, b) => a.from - b.from);
}

/** Parameter along AB (0–1) where segments AB and CD cross, or `null`. */
function intersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) return null;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / denom;
    const u = ((cx - ax) * ry - (cy - ay) * rx) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Unit direction of segment i. */
function direction(points, i) {
    const dx = points[2 * i + 2] - points[2 * i], dy = points[2 * i + 3] - points[2 * i + 1];
    const length = Math.hypot(dx, dy);
    return [dx / length, dy / length];
}

/** Unit normal of segment i (to the left of the direction of travel, Y down). */
function normal(points, i) {
    const [dx, dy] = direction(points, i);
    return [dy, -dx];
}

/** The points without consecutive duplicates. */
function dedupe(line) {
    const out = [];
    for (let i = 0; i + 1 < line.length; i += 2) {
        const n = out.length;
        if (n >= 2 && out[n - 2] === line[i] && out[n - 1] === line[i + 1]) continue;
        out.push(line[i], line[i + 1]);
    }
    return out;
}

function reverse(ring) {
    const out = [];
    for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1]);
    return out;
}
