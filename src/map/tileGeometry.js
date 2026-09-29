import { decodeVectorTile } from '../tiles/vectorTile.js';
import { FloatArrayBuilder } from '../geometry/FloatArrayBuilder.js';
import { BuildingGeometryBuilder, BuildingShading } from '../geometry/buildingGeometry.js';
import { appendThickLine } from '../geometry/lineGeometry.js';
import { classifyRings, clipPolygon, appendFlatPolygon } from '../geometry/polygonGeometry.js';
import { simplifyLine } from '../geometry/simplifyLine.js';

/**
 * The geometry of a tile, built from the job prepared by {@link Tile#plan}. This
 * is the heavy half of a tile build, and it needs neither the style nor three.js:
 * it runs in a worker (see GeometryBuilder), or on the main thread where there is
 * none — with the same result.
 *
 * The job is plain data: the tile bytes (`payload`) and commands. Each command
 * draws a list of `features` of one tile layer (`sourceLayer`), given by their
 * position in it, with the same parameters:
 *  - `line`:     `scale`, `tolerance`, `width`, `jointSegments`, `y`, `roundEnds`, `arcError`,
 *                and an optional outline: `outlineBatch` (-1 for none), `outlineWidth`;
 *  - `polygon`:  `min` / `max` (clip bounds), `scale`, `y`;
 *  - `building`: `scale`, `min`, `max`, `shading` (index in `shadings`), and for each
 *                feature `yBase`, `yTop`, `raised` and three values of `roofs` / `walls` (r, g, b).
 *
 * @param {{ payload: Uint8Array, batches: { kind: string, normals: boolean, colors: boolean }[], shadings: Object[], commands: Object[] }} job
 * @returns {TileGeometry}
 *
 * @typedef {Object} TileGeometry
 * @property {{ positions: Float32Array, normals?: Float32Array, colors?: Uint8Array }[]} batches - One per job batch.
 * @property {Int32Array} starts - For each feature of each command, in order: the first
 *     vertex it wrote in its batch and in its outline batch (-1 for none).
 */
export function buildTileGeometry({ payload, batches, shadings, commands }) {
    const used    = new Set(commands.map(command => command.sourceLayer));
    const layers  = new Map(decodeVectorTile(payload, name => used.has(name)).map(layer => [layer.name, layer]));
    const outs    = batches.map(({ kind }) => (kind === 'building' ? new BuildingGeometryBuilder() : new FloatArrayBuilder()));
    const shading = shadings.map(parameters => new BuildingShading(parameters));
    const starts  = new Int32Array(2 * commands.reduce((count, command) => count + command.features.length, 0)).fill(-1);
    const roof    = { r: 1, g: 1, b: 1 };
    const walls   = { r: 1, g: 1, b: 1 };

    let n = 0;
    for (const command of commands) {
        const features = layers.get(command.sourceLayer).features;
        const out      = outs[command.batch];
        const outline  = command.type === 'line' && command.outlineBatch >= 0 ? outs[command.outlineBatch] : null;

        command.features.forEach((index, j) => {
            starts[2 * n] = out.length / 3;
            if (outline) starts[2 * n + 1] = outline.length / 3;
            n++;
            const parts = features[index].loadGeometry();

            if (command.type === 'line') {
                for (const part of parts) {
                    const line = scaled(simplifyLine(part, command.tolerance), command.scale);
                    appendThickLine(out, line, command.width, command.jointSegments, command.y, command.roundEnds, command.arcError);
                    if (outline) appendThickLine(outline, line, command.outlineWidth, command.jointSegments, command.y, command.roundEnds, command.arcError);
                }
            } else if (command.type === 'polygon') {
                for (const polygon of classifyRings(parts)) {
                    const clipped = clipPolygon(polygon, command.min, command.max);
                    if (clipped) appendFlatPolygon(out, clipped, command.scale, command.y);
                }
            } else {
                const c = 3 * j;
                roof.r  = command.roofs[c];  roof.g  = command.roofs[c + 1];  roof.b  = command.roofs[c + 2];
                walls.r = command.walls[c];  walls.g = command.walls[c + 1];  walls.b = command.walls[c + 2];
                for (const polygon of classifyRings(parts)) {
                    const clipped = clipPolygon(polygon, command.min, command.max);
                    if (clipped) {
                        out.appendBuilding(clipped, command.scale, command.yBase[j], command.yTop[j], command.min, command.max,
                            shading[command.shading], roof, walls, command.raised[j]);
                    }
                }
            }
        });
    }

    return {
        batches: outs.map((out, i) => (batches[i].kind === 'building'
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
    for (const { positions, normals, colors } of geometry.batches) {
        buffers.push(positions.buffer);
        if (normals) buffers.push(normals.buffer);
        if (colors) buffers.push(colors.buffer);
    }
    return buffers;
}

function scaled(points, scale) {
    const out = new Float64Array(points.length);
    for (let i = 0; i < points.length; i++) out[i] = points[i] * scale;
    return out;
}
