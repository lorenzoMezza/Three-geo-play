import { FloatArrayBuilder } from './FloatArrayBuilder.js';
import { triangulate } from './polygonGeometry.js';

/**
 * Direction towards the light baked into unlit buildings: an afternoon sun from
 * the south-west, 60° above the horizon (world −X is west, +Z is south). A high
 * sun keeps every wall darker than the roofs, so the outline of each roof reads.
 */
const LIGHT_X = -0.5 * Math.SQRT1_2;
const LIGHT_Y = Math.sqrt(3) / 2;
const LIGHT_Z = 0.5 * Math.SQRT1_2;

/**
 * How the faces of the buildings of a tile are shaded. The result is a
 * per-vertex colour, used by materials with `vertexColors: true`.
 *
 * Wall colours depend only on the wall direction and on the height above the
 * ground, never on the building: where two buildings overlap (OSM outlines and
 * `building:part`s, duplicated footprints) their coinciding walls get the same
 * colour, so the overlap cannot flicker.
 */
export class BuildingShading {

    #groundY;
    #aoTop;
    #ambientOcclusion;
    #wallShading;
    #roofBrightness;

    /**
     * @param {Object} options
     * @param {number} options.groundY          - Local Y of the ground the buildings stand on.
     * @param {number} options.aoTop            - Local Y above which walls are no longer darkened.
     * @param {number} options.ambientOcclusion - Darkening at the foot of the walls, 0–1.
     * @param {number} options.wallShading      - Baked directional shading, 0–1 (0 when the material is lit by the scene).
     */
    constructor({ groundY, aoTop, ambientOcclusion, wallShading }) {
        this.#groundY          = groundY;
        this.#aoTop            = aoTop;
        this.#ambientOcclusion = aoTop > groundY ? ambientOcclusion : 0;
        this.#wallShading      = wallShading;
        this.#roofBrightness   = this.#lambert(0, 1, 0);
    }

    /** Local Y where the ambient occlusion ends (walls are split there), or `null` without occlusion. */
    get aoTop() {
        return this.#ambientOcclusion > 0 ? this.#aoTop : null;
    }

    /**
     * Brightness of a face from its direction, relative to a roof (roofs are 1).
     * @returns {number}
     */
    face(nx, ny, nz) {
        if (this.#wallShading === 0) return 1;
        return Math.min(1, this.#lambert(nx, ny, nz) / this.#roofBrightness);
    }

    /**
     * Ambient occlusion factor at a local height: darker at the ground, 1 above {@link aoTop}.
     * @param {number} y
     * @returns {number}
     */
    occlusion(y) {
        if (this.#ambientOcclusion === 0) return 1;
        const t = Math.min(1, Math.max(0, (y - this.#groundY) / (this.#aoTop - this.#groundY)));
        return 1 - this.#ambientOcclusion * (1 - t);
    }

    /** Half-Lambert term blended by the shading strength. */
    #lambert(nx, ny, nz) {
        const d = nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z;
        return 1 - this.#wallShading * (1 - d) / 2;
    }
}

/**
 * Accumulates the geometry of extruded buildings: positions, flat normals and
 * baked colours (see {@link BuildingShading}).
 */
export class BuildingGeometryBuilder {

    positions = new FloatArrayBuilder();
    normals   = new FloatArrayBuilder();
    colors    = new FloatArrayBuilder();

    /** Number of position values written. */
    get length() {
        return this.positions.length;
    }

    /**
     * Colours as normalised bytes (a quarter of the memory of floats).
     * @returns {Uint8Array}
     */
    colorBytes() {
        const src   = this.colors.array;
        const bytes = new Uint8Array(this.colors.length);
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, src[i])) * 255);
        return bytes;
    }

    /**
     * Appends one building (or building part): its roof, its walls and, when it
     * is raised above the ground (`min_height`), its underside. Walls face away
     * from the solid; walls lying on the clip boundary (`min`/`max`) are skipped,
     * so buildings split across tiles show no seam.
     *
     * @param {number[][]} polygon - `[exterior, ...holes]` in extent coordinates, exterior with positive area.
     * @param {number} scale - Extent → local units.
     * @param {number} yBase
     * @param {number} yTop
     * @param {number} min - Clip boundary (extent coordinates).
     * @param {number} max
     * @param {BuildingShading} shading
     * @param {{ r: number, g: number, b: number }} roof  - Roof colour (linear RGB).
     * @param {{ r: number, g: number, b: number }} walls - Tint of the walls and underside (linear RGB).
     * @param {boolean} raised - Whether the part starts above the ground and needs an underside.
     */
    appendBuilding(polygon, scale, yBase, yTop, min, max, shading, roof, walls, raised) {
        const { flat, indices } = triangulate(polygon);
        this.#appendCap(flat, indices, scale, yTop, 1, roof.r, roof.g, roof.b);
        if (!(yTop > yBase)) return;

        if (raised) {
            const shade = shading.face(0, -1, 0) * shading.occlusion(yBase);
            this.#appendCap(flat, indices, scale, yBase, -1, shade * walls.r, shade * walls.g, shade * walls.b);
        }

        const aoTop = shading.aoTop;
        const split = aoTop !== null && yBase < aoTop && aoTop < yTop;
        for (const ring of polygon) {
            const n = ring.length;
            for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
                const rx0 = ring[j], ry0 = ring[j + 1];
                const rx1 = ring[i], ry1 = ring[i + 1];
                if ((rx0 === rx1 && (rx0 === min || rx0 === max)) ||
                    (ry0 === ry1 && (ry0 === min || ry0 === max))) continue;

                const x0 = rx0 * scale, z0 = ry0 * scale;
                const x1 = rx1 * scale, z1 = ry1 * scale;
                const dx = x1 - x0, dz = z1 - z0;
                const length = Math.hypot(dx, dz);
                if (length === 0) continue;
                const nx = dz / length, nz = -dx / length;
                const shade = shading.face(nx, 0, nz);

                if (split) {
                    this.#appendWall(x0, z0, x1, z1, nx, nz, yBase, aoTop, shade, shading, walls);
                    this.#appendWall(x0, z0, x1, z1, nx, nz, aoTop, yTop, shade, shading, walls);
                } else {
                    this.#appendWall(x0, z0, x1, z1, nx, nz, yBase, yTop, shade, shading, walls);
                }
            }
        }
    }

    /** Horizontal face (roof facing up, underside facing down). */
    #appendCap(flat, indices, scale, y, facing, r, g, b) {
        this.#reserve(indices.length);
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i] * 2;
            // Roofs use the (a, c, b) order to face up; undersides keep (a, b, c).
            const b2 = indices[facing > 0 ? i + 2 : i + 1] * 2;
            const c2 = indices[facing > 0 ? i + 1 : i + 2] * 2;
            this.#vertex(flat[a]  * scale, y, flat[a + 1]  * scale, 0, facing, 0, r, g, b);
            this.#vertex(flat[b2] * scale, y, flat[b2 + 1] * scale, 0, facing, 0, r, g, b);
            this.#vertex(flat[c2] * scale, y, flat[c2 + 1] * scale, 0, facing, 0, r, g, b);
        }
    }

    /** One wall quad between `ya` and `yb`. */
    #appendWall(x0, z0, x1, z1, nx, nz, ya, yb, shade, shading, { r, g, b }) {
        this.#reserve(6);
        const low  = shade * shading.occlusion(ya);
        const high = shade * shading.occlusion(yb);
        this.#vertex(x0, yb, z0, nx, 0, nz, high * r, high * g, high * b);
        this.#vertex(x1, ya, z1, nx, 0, nz, low * r,  low * g,  low * b);
        this.#vertex(x0, ya, z0, nx, 0, nz, low * r,  low * g,  low * b);
        this.#vertex(x0, yb, z0, nx, 0, nz, high * r, high * g, high * b);
        this.#vertex(x1, yb, z1, nx, 0, nz, high * r, high * g, high * b);
        this.#vertex(x1, ya, z1, nx, 0, nz, low * r,  low * g,  low * b);
    }

    #reserve(vertices) {
        this.positions.reserve(vertices * 3);
        this.normals.reserve(vertices * 3);
        this.colors.reserve(vertices * 3);
    }

    #vertex(x, y, z, nx, ny, nz, r, g, b) {
        this.positions.push3(x, y, z);
        this.normals.push3(nx, ny, nz);
        this.colors.push3(r, g, b);
    }
}

/**
 * Brightness factor in `[1 - amount, 1]` that gives neighbouring roofs slightly
 * different tones. It is derived from the heights of the part — stable across
 * tiles and rebuilds, and equal for overlapping parts of the same height, whose
 * coinciding roofs therefore never flicker.
 *
 * @param {number} height    - Metres.
 * @param {number} minHeight - Metres.
 * @param {number} amount    - 0–1.
 * @returns {number}
 */
export function roofVariation(height, minHeight, amount) {
    if (amount === 0) return 1;
    let h = Math.imul(Math.round(height * 10) | 0, 0x9E3779B1) ^ Math.imul((Math.round(minHeight * 10) | 0) + 1, 0x85EBCA77);
    h ^= h >>> 15;
    h  = Math.imul(h, 0x2C1B3C6D);
    h ^= h >>> 12;
    return 1 - amount * ((h >>> 0) / 0xFFFFFFFF);
}
