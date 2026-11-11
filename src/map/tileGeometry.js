import { decodeVectorTile } from '../tiles/vectorTile.js';
import { FloatArrayBuilder } from '../geometry/FloatArrayBuilder.js';
import { BuildingGeometryBuilder, BuildingShading } from '../geometry/buildingGeometry.js';
import { appendThickLine } from '../geometry/lineGeometry.js';
import { classifyRings, clipPolygon, appendFlatPolygon } from '../geometry/polygonGeometry.js';
import { simplifyLine } from '../geometry/simplifyLine.js';
import { indexVertices } from '../geometry/indexVertices.js';
import { Cut, crossingCuts, offsetLine, splitAtSharpTurns, splitByCuts, stripRing } from '../geometry/railGeometry.js';
import { densifyLine, densifyRing } from '../geometry/tessellate.js';

/**
 * The geometry of a tile, built from the job prepared by {@link Tile#plan}. This
 * is the heavy half of a tile build, and it needs neither the style nor three.js:
 * it runs in a worker (see GeometryBuilder), or on the main thread where there is
 * none — with the same result.
 *
 * The job is plain data: the tile bytes (`payload`) and commands. Each command
 * draws a list of `features` of one tile layer (`sourceLayer`), given by their
 * position in it, with the same parameters (and `maxEdge`, the longest edge in
 * extent units, 0 for no limit: MapConfig.maxSegmentMeters):
 *  - `line`:     `scale`, `tolerance`, `width`, `jointSegments`, `y`, `roundEnds`,
 *                and an optional outline: `outlineBatch` (-1 for none), `outlineWidth`;
 *  - `polygon`:  `min` / `max` (clip bounds), `scale`, `y`;
 *  - `building`: `scale`, `min`, `max`, `shading` (index in `shadings`), `tolerance`
 *                (footprint simplification, 0 for none), and for each
 *                feature `yBase`, `yTop`, `raised` and three values of `roofs` / `walls` (r, g, b);
 *  - `rail`:     `bed` / `rails` (what is drawn: the bed in `batch`, the rails in
 *                `outlineBatch`, or in `batch` without a bed), `scale`, `min`, `max`,
 *                `shading`, `tolerance`, `y`, `bedTop`, `railHeight`, the half widths
 *                `bedHalf`, `gaugeHalf`, `railHalf` and the crossing `margin` (extent
 *                units), and the `levels` of the features.
 *
 * `crossings` lists the road features that cut the railways they cross: `sourceLayer`,
 * `index`, drawn `halfWidth` (extent units) and `level` (see RailFeatureType).
 *
 * @param {{ payload: Uint8Array, batches: { kind: string, normals: boolean, colors: boolean }[], shadings: Object[], commands: Object[] }} job
 * @returns {TileGeometry}
 *
 * @typedef {Object} TileGeometry
 * @property {{ positions: Float32Array, normals?: Float32Array, colors?: Uint8Array, index: Uint16Array|Uint32Array }[]} batches
 *     One per job batch, indexed: equal vertices are shared (see indexVertices).
 * @property {Int32Array} starts - For each feature of each command, in order: the first
 *     corner (index entry) it wrote in its batch and in its outline batch (-1 for none).
 */
export function buildTileGeometry({ payload, batches, shadings, commands, crossings = [] }) {
    const used    = new Set([...commands.map(command => command.sourceLayer), ...crossings.map(c => c.sourceLayer)]);
    const layers  = new Map(decodeVectorTile(payload, name => used.has(name)).map(layer => [layer.name, layer]));
    const outs    = batches.map(({ kind }) => (kind === 'building' ? new BuildingGeometryBuilder() : new FloatArrayBuilder()));
    const shading = shadings.map(parameters => new BuildingShading(parameters));
    const starts  = new Int32Array(2 * commands.reduce((count, command) => count + command.features.length, 0)).fill(-1);
    const roof    = { r: 1, g: 1, b: 1 };
    const walls   = { r: 1, g: 1, b: 1 };

    // Lines first: simplified once, and every round cap that another line of the
    // same batch already covers is left out (see LineCover).
    const lineParts = new Map();   // command → per feature: [{ line, ends, outlineEnds }]
    const covers    = new Map();   // batch → LineCover
    const coverOf   = batch => covers.get(batch) ?? covers.set(batch, new LineCover()).get(batch);
    for (const command of commands) {
        if (command.type !== 'line') continue;
        const features = layers.get(command.sourceLayer).features;
        const rounded  = command.roundEnds && command.jointSegments >= 2;
        lineParts.set(command, command.features.map(index => features[index].loadGeometry().map(part => {
            const line = densifyLine(simplifyLine(part, command.tolerance), command.maxEdge);
            const capStart = command.roundEnds, capEnd = command.roundEnds;
            if (!rounded || line.length < 4) return { line, capStart, capEnd, ends: null, outlineEnds: null };
            return {
                line, capStart, capEnd,
                ends:        coverOf(command.batch).add(line, command.width),
                outlineEnds: command.outlineBatch >= 0 ? coverOf(command.outlineBatch).add(line, command.outlineWidth) : null,
            };
        })));
    }
    for (const cover of covers.values()) cover.resolve();

    // Simple extrusions: footprints prepared once, and the walls of each batch
    // indexed so that walls shared with a neighbour at least as tall are left out.
    const footprints = new Map();   // command → per feature: clipped polygons
    const wallTops   = new Map();   // batch → Map(directed wall → highest top drawn along it)
    for (const command of commands) {
        if (command.type !== 'building' || !command.simple) continue;
        const features = layers.get(command.sourceLayer).features;
        const tops = wallTops.get(command.batch) ?? wallTops.set(command.batch, new Map()).get(command.batch);
        footprints.set(command, command.features.map((index, j) => {
            const parts = features[index].loadGeometry();
            const rings = command.tolerance > 0 ? parts.map(ring => simplifyRing(ring, command.tolerance)) : parts;
            const polygons = [];
            for (const polygon of classifyRings(rings)) {
                // Densified before the walls are indexed, so shared walls still match
                const clipped = densifyPolygon(clipPolygon(polygon, command.min, command.max), command.maxEdge);
                if (!clipped) continue;
                polygons.push(clipped);
                for (const ring of clipped) {
                    const n = ring.length;
                    for (let i = 0, k = n - 2; i < n; k = i, i += 2) {
                        const key = `${ring[k]},${ring[k + 1]},${ring[i]},${ring[i + 1]}`;
                        if (!(tops.get(key) >= command.yTop[j])) tops.set(key, command.yTop[j]);
                    }
                }
            }
            return polygons;
        }));
    }

    // Roads that cross railways, with the bounds of each part to skip the far ones quickly
    const roads = commands.some(command => command.type === 'rail')
        ? crossings.map(({ sourceLayer, index, halfWidth, level }) => ({
            halfWidth, level,
            parts: layers.get(sourceLayer).features[index].loadGeometry().map(line => ({ line, bounds: lineBounds(line, halfWidth) })),
        }))
        : [];

    let n = 0;
    for (const command of commands) {
        const features = layers.get(command.sourceLayer).features;
        const out      = outs[command.batch];
        const outline  = command.outlineBatch >= 0 ? outs[command.outlineBatch] : null;

        command.features.forEach((index, j) => {
            starts[2 * n] = out.length / 3;
            if (outline) starts[2 * n + 1] = outline.length / 3;
            n++;

            if (command.type === 'line') {
                const { jointSegments, y } = command;
                const fill   = covers.get(command.batch);
                const casing = covers.get(command.outlineBatch);
                const capped = (cap, cover, id) => cap && !(id !== null && cover.hidden.has(id));
                for (const { line: part, capStart, capEnd, ends, outlineEnds } of lineParts.get(command)[j]) {
                    const line = scaled(part, command.scale);
                    appendThickLine(out, line, command.width, jointSegments, y,
                        capped(capStart, fill, ends?.[0] ?? null),
                        capped(capEnd, fill, ends?.[1] ?? null));
                    if (outline) {
                        appendThickLine(outline, line, command.outlineWidth, jointSegments, y,
                            capped(capStart, casing, outlineEnds?.[0] ?? null),
                            capped(capEnd, casing, outlineEnds?.[1] ?? null));
                    }
                }
                return;
            }

            if (command.type === 'rail') {
                const bedOut  = command.bed ? out : null;
                const railOut = !command.rails ? null : command.bed ? outline : out;
                for (const part of features[index].loadGeometry()) {
                    appendRailway(bedOut, railOut, densifyLine(simplifyLine(part, command.tolerance), command.maxEdge), command,
                        command.levels[j], roads, shading[command.shading]);
                }
                return;
            }

            if (command.type === 'polygon') {
                for (const polygon of classifyRings(features[index].loadGeometry())) {
                    const clipped = clipPolygon(polygon, command.min, command.max);
                    if (clipped) appendFlatPolygon(out, clipped, command.scale, command.y, command.maxEdge);
                }
            } else {
                const c = 3 * j;
                roof.r  = command.roofs[c];  roof.g  = command.roofs[c + 1];  roof.b  = command.roofs[c + 2];
                walls.r = command.walls[c];  walls.g = command.walls[c + 1];  walls.b = command.walls[c + 2];
                if (command.simple) {
                    // A wall is hidden inside the neighbour that has the same wall the other way round,
                    // when that neighbour stands on the same ground and is at least as tall.
                    const tops = wallTops.get(command.batch);
                    const top  = command.yTop[j];
                    const isWallHidden = (x0, y0, x1, y1) => tops.get(`${x1},${y1},${x0},${y0}`) >= top;
                    for (const clipped of footprints.get(command)[j]) {
                        out.appendBuilding(clipped, command.scale, command.yBase[j], top, command.min, command.max,
                            shading[command.shading], roof, walls, command.raised[j], isWallHidden, command.maxEdge);
                    }
                    return;
                }
                for (const polygon of classifyRings(features[index].loadGeometry())) {
                    const clipped = densifyPolygon(clipPolygon(polygon, command.min, command.max), command.maxEdge);
                    if (clipped) {
                        out.appendBuilding(clipped, command.scale, command.yBase[j], command.yTop[j], command.min, command.max,
                            shading[command.shading], roof, walls, command.raised[j], null, command.maxEdge);
                    }
                }
            }
        });
    }

    return {
        batches: outs.map((out, i) => indexVertices(batches[i].kind === 'building'
            ? {
                positions: out.positions.toFloat32Array(),
                normals:   batches[i].normals ? out.normals.toFloat32Array() : undefined,
                colors:    batches[i].colors ? out.colorBytes() : undefined,
            }
            : { positions: out.toFloat32Array() })),
        starts,
    };
}

/** The array buffers of a {@link TileGeometry}, to transfer it from a worker without copying. */
export function geometryBuffers(geometry) {
    const buffers = [geometry.starts.buffer];
    for (const { positions, normals, colors, index } of geometry.batches) {
        buffers.push(positions.buffer, index.buffer);
        if (normals) buffers.push(normals.buffer);
        if (colors) buffers.push(colors.buffer);
    }
    return buffers;
}

/**
 * One railway line: its bed and its two rails, extruded like buildings, minus what
 * the roads crossing it take: all of it under a road above it (a bridge over the
 * track), the bed alone at a road on its level (a level crossing, the rails stay
 * flush with the road). Roads below the track (under a railway bridge) cut nothing.
 */
function appendRailway(bedOut, railOut, line, command, level, roads, shading) {
    const bounds = lineBounds(line, 0);
    const crossing = [];
    for (const road of roads) {
        const cut = road.level > level ? Cut.ALL : road.level === level && command.bed ? Cut.BED : 0;
        if (cut === 0) continue;
        for (const part of road.parts) if (overlaps(bounds, part.bounds)) crossing.push({ line: part.line, halfWidth: road.halfWidth, cut });
    }
    const extrude = (out, ring, yBase, yTop) => {
        const clipped = ring && clipPolygon([ring], command.min, command.max);
        if (clipped) out.appendBuilding(clipped, command.scale, yBase, yTop, command.min, command.max, shading, WHITE, WHITE, false, null, command.maxEdge);
    };
    for (const { line: stretch, cut } of splitByCuts(line, crossingCuts(line, crossing, command.margin))) {
        if (cut === Cut.ALL) continue;
        const raised = bedOut !== null && cut === 0;
        for (const piece of splitAtSharpTurns(stretch)) {
            if (raised) extrude(bedOut, stripRing(piece, command.bedHalf), command.y, command.bedTop);
            if (!railOut) continue;
            const base = raised ? command.bedTop : command.y;
            for (const side of [-1, 1]) {
                const rail = offsetLine(piece, side * command.gaugeHalf);
                if (rail) extrude(railOut, stripRing(rail, command.railHalf), base, base + command.railHeight);
            }
        }
    }
}

const WHITE = Object.freeze({ r: 1, g: 1, b: 1 });

/** Every ring of a polygon (or `null`) with no edge longer than `maxEdge`. */
function densifyPolygon(polygon, maxEdge) {
    return polygon && maxEdge > 0 ? polygon.map(ring => densifyRing(ring, maxEdge)) : polygon;
}

/** `[minX, minY, maxX, maxY]` of a line, grown by `margin`. */
function lineBounds(line, margin) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < line.length; i += 2) {
        minX = Math.min(minX, line[i]);     maxX = Math.max(maxX, line[i]);
        minY = Math.min(minY, line[i + 1]); maxY = Math.max(maxY, line[i + 1]);
    }
    return [minX - margin, minY - margin, maxX + margin, maxY + margin];
}

function overlaps(a, b) {
    return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

function scaled(points, scale) {
    const out = new Float64Array(points.length);
    for (let i = 0; i < points.length; i++) out[i] = points[i] * scale;
    return out;
}

/** Simplified ring, or the ring itself when simplifying would leave less than a triangle. */
function simplifyRing(ring, tolerance) {
    const simplified = simplifyLine(ring, tolerance);
    return simplified.length >= 6 ? simplified : ring;
}

/**
 * Round caps of one batch of lines that are never visible, so they can be left out.
 *
 * A thick line with round caps and joins is the set of points within half its
 * width of its path, so it covers a whole disc of that radius around each of its
 * points. A cap is a half disc around a line end: it is hidden when the end lies
 * on a vertex of another line of the batch at least as wide, or where several
 * ends meet and the widest of them keeps its cap. Lines of a batch share material
 * and render order, so leaving those caps out changes no pixel.
 */
export class LineCover {

    /** Point → widest line that has an inner vertex there. @type {Map<string, number>} */
    #through = new Map();

    /** Point → line ends there. @type {Map<string, { id: number, width: number }[]>} */
    #ends = new Map();

    #count = 0;

    /** Ids of the ends whose cap is covered. @type {Set<number>} */
    hidden = new Set();

    /**
     * @param {ArrayLike<number>} line - Flat `[x0, y0, …]`, at least two points.
     * @param {number} width
     * @param {boolean} [capStart=true] - Whether the start has a round cap (a flat end covers nothing).
     * @param {boolean} [capEnd=true]
     * @returns {[number|null, number|null]} Ids of the start and the end (`null` without a cap).
     */
    add(line, width, capStart = true, capEnd = true) {
        const n = line.length;
        for (let i = 2; i < n - 2; i += 2) {
            const key = `${line[i]},${line[i + 1]}`;
            if (!(this.#through.get(key) >= width)) this.#through.set(key, width);
        }
        let start = null, end = null;
        if (capStart) this.#addEnd(`${line[0]},${line[1]}`, start = this.#count++, width);
        if (capEnd)   this.#addEnd(`${line[n - 2]},${line[n - 1]}`, end = this.#count++, width);
        return [start, end];
    }

    resolve() {
        for (const [key, ends] of this.#ends) {
            const through = this.#through.get(key) ?? 0;
            let widest = 0;
            for (const { width } of ends) widest = Math.max(widest, width);
            let kept = through >= widest;   // a line passing through covers every cap here
            for (const { id, width } of ends) {
                if (kept || through >= width || width < widest) this.hidden.add(id);
                else kept = true;
            }
        }
    }

    #addEnd(key, id, width) {
        const ends = this.#ends.get(key);
        if (ends) ends.push({ id, width });
        else this.#ends.set(key, [{ id, width }]);
    }
}
