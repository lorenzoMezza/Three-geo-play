/** Cells per tile side of the lookup grid. */
const CELLS = 16

/** Height of buildings without height data, as the library draws them. */
const DEFAULT_HEIGHT_M = 10

/**
 * Even-odd point-in-polygon test over all the rings of a polygon (so holes,
 * like courtyards, are outside).
 * @param {number[][]} rings - Flat `[x0, z0, x1, z1, …]` rings.
 */
export function insidePolygon(rings, x, z) {
    let inside = false
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
            const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1]
            if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
        }
    }
    return inside
}

/**
 * Height of the city at any point, for the games: the roofs the player walks
 * on and the walls that stop them.
 *
 * Built from the building footprints of the tiles on screen
 * (`tile.getFeatures('building')`), kept up to date with the `tileload` /
 * `tileunload` events. Each tile keeps its data in its own local frame, so the
 * lookup stays right when the map is moved or rescaled.
 */
export class CityCollider {

    #geo
    /** @type {Map<Object, { tile: Object, cells: Map<number, Object[]> }>} */
    #tiles = new Map()
    #onLoad   = ({ tile }) => this.#add(tile)
    #onUnload = ({ tile }) => this.#tiles.delete(tile)

    /** @param {import('lm-three-geo-play').ThreeGeoPlay} geo */
    constructor(geo) {
        this.#geo = geo
    }

    start() {
        for (const tile of this.#geo.getTiles()) this.#add(tile)
        this.#geo.addEventListener('tileload', this.#onLoad)
        this.#geo.addEventListener('tileunload', this.#onUnload)
    }

    stop() {
        this.#geo.removeEventListener('tileload', this.#onLoad)
        this.#geo.removeEventListener('tileunload', this.#onUnload)
        this.#tiles.clear()
    }

    /**
     * Height of the roofs at a world position (X/Z), 0 on open ground.
     * The map group of the demo is not transformed: world = map space.
     */
    heightAt(x, z) {
        for (const { tile, cells } of this.#tiles.values()) {
            const frame = tile.object3D
            const scale = frame.scale.x
            const lx = (x - frame.position.x) / scale
            const lz = (z - frame.position.z) / scale
            if (lx < 0 || lz < 0 || lx >= tile.size || lz >= tile.size) continue

            let top = 0
            const parts = cells.get(this.#cell(tile, lx, lz)) ?? []
            for (const p of parts) {
                if (p.top <= top || lx < p.minX || lx > p.maxX || lz < p.minZ || lz > p.maxZ) continue
                if (insidePolygon(p.rings, lx, lz)) top = p.top
            }
            return top * scale   // tiles do not overlap: this is the one
        }
        return 0
    }

    #cell(tile, lx, lz) {
        const n = CELLS / tile.size
        return Math.min(CELLS - 1, Math.floor(lz * n)) * CELLS + Math.min(CELLS - 1, Math.floor(lx * n))
    }

    #add(tile) {
        const exaggeration = this.#geo.getMapStyle().buildingLayer.height
        const cells = new Map()
        for (const feature of tile.getFeatures('building')) {
            if (feature.type !== 'polygon') continue
            const height = Number(feature.properties.render_height ?? feature.properties.height) || DEFAULT_HEIGHT_M
            const part = { rings: feature.geometry, top: height * exaggeration * tile.unitsPerMeter, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
            for (const ring of part.rings) {
                for (let i = 0; i < ring.length; i += 2) {
                    part.minX = Math.min(part.minX, ring[i]);     part.maxX = Math.max(part.maxX, ring[i])
                    part.minZ = Math.min(part.minZ, ring[i + 1]); part.maxZ = Math.max(part.maxZ, ring[i + 1])
                }
            }
            const n  = CELLS / tile.size
            const x0 = Math.max(0, Math.floor(part.minX * n)), x1 = Math.min(CELLS - 1, Math.floor(part.maxX * n))
            const z0 = Math.max(0, Math.floor(part.minZ * n)), z1 = Math.min(CELLS - 1, Math.floor(part.maxZ * n))
            for (let cz = z0; cz <= z1; cz++) {
                for (let cx = x0; cx <= x1; cx++) {
                    const key = cz * CELLS + cx
                    const list = cells.get(key)
                    if (list) list.push(part)
                    else cells.set(key, [part])
                }
            }
        }
        this.#tiles.set(tile, { tile, cells })
    }
}
