import * as THREE from 'three'

import { createPlane } from './models.js'

/** The map origin: St Peter's. */
const ORIGIN = { lat: 41.9022, lon: 12.4539 }
/** Take-off: west of St Peter's, heading east. */
const START = { lat: 41.9012, lon: 12.4395, altitude: 190 }

/** Grand tour of Rome: one ring above each landmark (altitudes in metres). */
const RINGS = [
    { name: "St Peter's",          lat: 41.9022, lon: 12.4534, altitude: 170 },
    { name: "Castel Sant'Angelo",  lat: 41.9031, lon: 12.4663, altitude: 95 },
    { name: 'Piazza Navona',       lat: 41.8992, lon: 12.4731, altitude: 75 },
    { name: 'Pantheon',            lat: 41.8986, lon: 12.4769, altitude: 85 },
    { name: 'Vittoriano',          lat: 41.8946, lon: 12.4831, altitude: 120 },
    { name: 'Colosseum',           lat: 41.8902, lon: 12.4922, altitude: 90 },
    { name: 'Circus Maximus',      lat: 41.8861, lon: 12.4851, altitude: 60 },
    { name: 'Tiber Island',        lat: 41.8906, lon: 12.4775, altitude: 55 },
    { name: 'Janiculum',           lat: 41.8919, lon: 12.4610, altitude: 150 },
]
const RING_RADIUS = 26

const CRUISE = 70, BOOST = 150, BRAKE = 38, TRAIL_POINTS = 90

const UP = ['KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown']
const LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight']

/**
 * A fading ribbon behind a moving point (the contrails at the wing tips).
 */
class Trail {
    constructor(scene, color) {
        const vertices = TRAIL_POINTS * 2
        this.positions = new Float32Array(vertices * 3)
        const colors = new Float32Array(vertices * 4)
        const c = new THREE.Color(color)
        for (let i = 0; i < TRAIL_POINTS; i++) {
            const alpha = (i / (TRAIL_POINTS - 1)) ** 2 * 0.4
            colors.set([c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha], i * 8)
        }
        const index = []
        for (let i = 0; i < TRAIL_POINTS - 1; i++) {
            const a = i * 2
            index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
        geometry.setIndex(index)
        this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        }))
        this.mesh.frustumCulled = false
        scene.add(this.mesh)
    }

    /** Fills the whole ribbon with one point (no streak from the previous flight). */
    reset(point) {
        for (let i = 0; i < TRAIL_POINTS * 2; i++) this.positions.set([point.x, point.y, point.z], i * 3)
    }

    /** Adds the newest sample: two points `half` apart along `up`. */
    push(point, up, half) {
        this.positions.copyWithin(0, 6)
        const i = (TRAIL_POINTS - 1) * 6
        this.positions.set([
            point.x + up.x * half, point.y + up.y * half, point.z + up.z * half,
            point.x - up.x * half, point.y - up.y * half, point.z - up.z * half,
        ], i)
        this.mesh.geometry.attributes.position.needsUpdate = true
    }

    dispose() {
        this.mesh.removeFromParent()
        this.mesh.geometry.dispose()
        this.mesh.material.dispose()
    }
}

/**
 * Fly mode: a propeller plane over Rome, a grand tour through rings above the
 * landmarks (placed with `latLonToWorld()`), crashes on the roofs (collisions
 * from the tile data), the plane's shadow sweeping over the city.
 */
export function createFlyMode(app) {
    const { geo, camera, keys, hud, collider, lighting, scene } = app
    const plane  = createPlane()
    const state  = { yaw: 0, pitch: 0, roll: 0, speed: CRUISE }
    const pos    = plane.object.position
    const fwd    = new THREE.Vector3()
    const up     = new THREE.Vector3()
    const look   = new THREE.Vector3()
    const tmp    = new THREE.Vector3()
    const rings  = []
    let trails   = []
    let next     = 0
    let started  = 0
    let checkpoint = null

    const ringMaterial = () => new THREE.MeshStandardMaterial({ color: 0xffa51f, emissive: 0xff7a00, emissiveIntensity: 0.9, roughness: 0.4 })

    function placeRings() {
        RINGS.forEach((ring, i) => {
            const { x, z } = geo.latLonToWorld(ring.lat, ring.lon)
            const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 1.6, 10, 48), ringMaterial())
            mesh.position.set(x, ring.altitude, z)
            mesh.castShadow = true
            scene.add(mesh)
            rings.push({ ...ring, mesh })
            if (i > 0) rings[i - 1].mesh.lookAt(mesh.position)
        })
        rings.at(-1).mesh.lookAt(rings[0].mesh.position)
    }

    function respawn(at) {
        pos.set(at.x, at.y, at.z)
        state.yaw   = at.yaw
        state.pitch = 0
        state.roll  = 0
        state.speed = CRUISE
        for (const trail of trails) trail.reset(pos)
    }

    function highlightRings() {
        rings.forEach((ring, i) => {
            const material = ring.mesh.material
            const isNext = i === next
            material.emissive.set(isNext ? 0xff7a00 : i < next ? 0x1f8a4c : 0x5a4a30)
            material.color.set(isNext ? 0xffa51f : i < next ? 0x5ee08a : 0xb8a58a)
            material.emissiveIntensity = isNext ? 1 : 0.35
        })
    }

    return {
        enter() {
            app.startGame({ spawn: ORIGIN, renderDistance: 7, follow: plane.object, sun: { azimuth: 255, elevation: 16 } })
            scene.add(plane.object)
            trails = plane.wingTips.map(() => new Trail(scene, 0xffffff))
            placeRings()
            next = 0
            started = performance.now()
            const start = geo.latLonToWorld(START.lat, START.lon)
            const first = rings[0].mesh.position
            checkpoint = { x: start.x, y: START.altitude, z: start.z, yaw: Math.atan2(-(first.x - start.x), -(first.z - start.z)) }
            respawn(checkpoint)
            camera.position.set(pos.x, pos.y + 8, pos.z + 30)
            highlightRings()
            hud.show({
                title: 'Fly · Grand tour of Rome',
                help: ['W / S · climb · dive', 'A / D · bank and turn', 'Shift · boost   Q · slow down', 'Fly through the glowing rings — the arrow shows the next one'],
            })
            hud.flash('Fly through the rings above the landmarks', 3)
        },

        exit() {
            plane.object.removeFromParent()
            for (const trail of trails) trail.dispose()
            trails = []
            for (const ring of rings) {
                ring.mesh.removeFromParent()
                ring.mesh.geometry.dispose()
                ring.mesh.material.dispose()
            }
            rings.length = 0
            app.endGame()
        },

        /** @param {number} dt */
        update(dt) {
            // ── arcade flight: bank to turn, pitch to climb ──────────────────
            const turn  = keys.axis(RIGHT, LEFT)
            const climb = keys.axis(DOWN, UP)
            const boost = keys.held('ShiftLeft', 'ShiftRight')
            const brake = keys.held('KeyQ')
            state.roll  = THREE.MathUtils.damp(state.roll, turn * 0.85, 3.5, dt)
            state.yaw  += state.roll * (brake ? 1 : 0.75) * dt   // slower is tighter
            state.pitch = THREE.MathUtils.clamp(
                THREE.MathUtils.damp(state.pitch, climb * 0.55, 2.2, dt), -0.8, 0.8)
            state.speed = THREE.MathUtils.damp(state.speed, boost ? BOOST : brake ? BRAKE : CRUISE, 1.5, dt)

            plane.object.rotation.set(state.pitch, state.yaw, state.roll, 'YXZ')
            fwd.set(0, 0, -1).applyQuaternion(plane.object.quaternion)
            up.set(0, 1, 0).applyQuaternion(plane.object.quaternion)
            pos.addScaledVector(fwd, state.speed * dt)
            pos.y = Math.min(pos.y, 1500)
            plane.propeller.rotation.z += dt * (30 + state.speed * 0.4)

            // ── crash into the roofs or the ground ────────────────────────────
            if (pos.y < collider.heightAt(pos.x, pos.z) + 2.5) {
                hud.flash('Crash! Back to the last ring', 1.5)
                respawn(checkpoint)
            }

            // ── rings ────────────────────────────────────────────────────────
            const ring = rings[next]
            const toRing = tmp.subVectors(ring.mesh.position, pos)
            if (toRing.length() < RING_RADIUS * 0.95) {
                next++
                checkpoint = { x: pos.x, y: pos.y, z: pos.z, yaw: state.yaw }
                if (next === rings.length) {
                    const seconds = (performance.now() - started) / 1000
                    hud.flash(`Grand tour complete in ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}!`, 4)
                    next = 0
                    started = performance.now()
                } else {
                    hud.flash(`${ring.name} ✓`, 1.2)
                }
                highlightRings()
            }
            for (const r of rings) r.mesh.rotation.z += dt * 0.3

            // ── contrails and chase camera ───────────────────────────────────
            plane.object.updateMatrixWorld()
            plane.wingTips.forEach((tip, i) => trails[i].push(tip.getWorldPosition(look), up, 0.1 + state.speed / BOOST * 0.15))

            const behind = tmp.set(0, 6, 22).applyAxisAngle(new THREE.Vector3(1, 0, 0), state.pitch * 0.6)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw)
            camera.position.lerp(behind.add(pos), 1 - Math.exp(-dt * 5))
            camera.lookAt(look.copy(pos).addScaledVector(fwd, 25))
            const fov = 60 + (state.speed - CRUISE) / (BOOST - CRUISE) * 18
            if (Math.abs(camera.fov - fov) > 0.05) {
                camera.fov = fov
                camera.updateProjectionMatrix()
            }
            app.focus.copy(pos).setY(0)
            lighting.shadowArea = THREE.MathUtils.clamp(pos.y * 1.3 + 120, 160, 900)

            // ── HUD: arrow to the next ring ──────────────────────────────────
            const target = rings[next].mesh.position
            const bearing = v => Math.atan2(v.x, -v.z)
            let angle = bearing(tmp.subVectors(target, pos)) - bearing(fwd)
            angle = Math.atan2(Math.sin(angle), Math.cos(angle))
            hud.arrow(angle)
            const distance = tmp.subVectors(target, pos).length()
            const dy = target.y - pos.y
            const vertical = Math.abs(dy) > 15 ? (dy > 0 ? '  ↑ climb' : '  ↓ dive') : ''
            hud.stats(`Rings ${next}/${rings.length}  ·  Next: ${rings[next].name} ${distance > 1000 ? (distance / 1000).toFixed(1) + ' km' : Math.round(distance) + ' m'}${vertical}  ·  ${Math.round(state.speed * 3.6)} km/h  ·  ${Math.round(pos.y)} m`)
        },
    }
}
