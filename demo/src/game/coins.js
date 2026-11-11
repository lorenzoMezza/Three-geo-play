import * as THREE from 'three'

import { createCoinAssets } from './models.js'

const ROOF_COINS   = 5
const STREET_COINS = 7
const STREET_CLASSES = new Set(['primary', 'secondary', 'tertiary', 'minor', 'service', 'pedestrian'])
const PICK_RADIUS_M = 1.4

const _matrix = new THREE.Matrix4()
const _quat   = new THREE.Quaternion()
const _pos    = new THREE.Vector3()
const _scale  = new THREE.Vector3()
const _world  = new THREE.Vector3()
const Y_AXIS  = new THREE.Vector3(0, 1, 0)

/** Even-odd point-in-polygon test over all the rings of a polygon (holes are outside). */
function insidePolygon(rings, x, z) {
    let inside = false
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
            const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1]
            if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
        }
    }
    return inside
}

/** Small deterministic random generator, so a tile always gets the same coins. */
function random(seed) {
    let s = seed >>> 0 || 1
    return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ Math.imul(s ^ (s >>> 13), 0x297a2d39)) >>> 0) / 4294967296
}

/**
 * Coins on the roofs and along the streets, placed from the data of each tile
 * (`getFeatures()`) and drawn in the tile's own group: they follow the tile and
 * disappear with it. One instanced mesh per tile.
 */
export class CoinField {

    #geo
    #assets = createCoinAssets()
    /** @type {Map<Object, { tile: Object, mesh: THREE.InstancedMesh, coins: Object[] }>} */
    #tiles = new Map()
    #time = 0
    #onLoad   = ({ tile }) => this.#add(tile)
    #onUnload = ({ tile }) => this.#remove(tile)

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
        for (const tile of [...this.#tiles.keys()]) this.#remove(tile)
    }

    /**
     * Spins the coins and collects those the player touches.
     * @param {number} dt
     * @param {THREE.Vector3} player - World position of the player's chest.
     * @returns {number} Coins collected this frame.
     */
    update(dt, player) {
        this.#time += dt
        let collected = 0
        for (const { tile, mesh, coins } of this.#tiles.values()) {
            const u = tile.unitsPerMeter
            coins.forEach((coin, i) => {
                if (coin.taken >= 1) return
                if (coin.taken > 0) {
                    coin.taken = Math.min(1, coin.taken + dt * 4)   // pop and vanish
                } else if (_world.set(coin.x, coin.y, coin.z).applyMatrix4(tile.object3D.matrixWorld).distanceTo(player) < PICK_RADIUS_M) {
                    coin.taken = 0.001
                    collected++
                }
                const size = coin.taken > 0 ? (1 + coin.taken * 1.5) * (1 - coin.taken) : 1
                _pos.set(coin.x, coin.y + Math.sin(this.#time * 2.5 + coin.phase) * 0.15 * u + coin.taken * 1.5 * u, coin.z)
                _quat.setFromAxisAngle(Y_AXIS, this.#time * (coin.taken > 0 ? 14 : 2.5) + coin.phase)
                _scale.setScalar(Math.max(size, 0.0001) * u)
                mesh.setMatrixAt(i, _matrix.compose(_pos, _quat, _scale))
            })
            mesh.instanceMatrix.needsUpdate = true
        }
        return collected
    }

    #add(tile) {
        const rand   = random(tile.x * 73856093 ^ tile.y * 19349663)
        const u      = tile.unitsPerMeter
        const height = this.#geo.getMapStyle().buildingLayer.height
        const coins  = []

        const roofs = tile.getFeatures('building').filter(f => {
            const h = Number(f.properties.render_height)
            return f.type === 'polygon' && h >= 6 && h <= 45
        })
        for (let n = 0; n < ROOF_COINS && roofs.length; n++) {
            const roof = roofs.splice(Math.floor(rand() * roofs.length), 1)[0]
            const ring = roof.geometry[0]
            let x = 0, z = 0
            for (let i = 0; i < ring.length; i += 2) { x += ring[i]; z += ring[i + 1] }
            x /= ring.length / 2
            z /= ring.length / 2
            if (!insidePolygon(roof.geometry, x, z)) continue
            coins.push({ x, z, y: (Number(roof.properties.render_height) * height + 1.2) * u, phase: rand() * 6, taken: 0 })
        }

        const streets = tile.getFeatures('transportation')
            .filter(f => f.type === 'line' && STREET_CLASSES.has(f.properties.class) && !f.properties.brunnel)
        for (let n = 0; n < STREET_COINS && streets.length; n++) {
            const line = streets[Math.floor(rand() * streets.length)].geometry[0]
            if (line.length < 4) continue
            const i = 2 * Math.floor(rand() * (line.length / 2 - 1))
            const x = (line[i] + line[i + 2]) / 2, z = (line[i + 1] + line[i + 3]) / 2
            if (x < 0 || z < 0 || x > tile.size || z > tile.size) continue
            coins.push({ x, z, y: 1 * u, phase: rand() * 6, taken: 0 })
        }
        if (coins.length === 0) return

        const mesh = new THREE.InstancedMesh(this.#assets.geometry, this.#assets.material, coins.length)
        mesh.name          = 'Coins'
        mesh.castShadow    = true
        mesh.frustumCulled = false
        tile.object3D.add(mesh)
        this.#tiles.set(tile, { tile, mesh, coins })
    }

    #remove(tile) {
        const entry = this.#tiles.get(tile)
        if (!entry) return
        entry.mesh.removeFromParent()
        entry.mesh.dispose()
        this.#tiles.delete(tile)
    }
}
