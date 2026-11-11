import * as THREE from 'three'

import { createRunner } from './models.js'
import { CoinField } from './coins.js'

/** Piazza San Pietro, next to the obelisk. */
const SPAWN = { lat: 41.90218, lon: 12.45738 }

// Metres and seconds: game speeds, a bit superhuman.
const WALK_SPEED = 4.5
const RUN_SPEED  = 11
const GRAVITY    = 30
const JUMP       = 8
const SUPER_JUMP = 27     // added by a full charge: about 25 m high
const CHARGE_S   = 0.9
const STEP       = 0.7    // highest step climbed without jumping
const RADIUS     = 0.35
const TURN_SPEED = 2.8    // rad/s
const TAP_S      = 0.15   // a shorter press of Space is a plain hop

/** Moves `angle` towards `target` along the shortest way round. */
const dampAngle = (angle, target, lambda, dt) =>
    angle + Math.atan2(Math.sin(target - angle), Math.cos(target - angle)) * (1 - Math.exp(-lambda * dt))

const PAINTS = [0xff4f8b, 0x2ad4c6, 0xb4f03c, 0xffc233, 0x9b7bff, 0xff7a2b]

const FORWARD = ['KeyW', 'ArrowUp'], BACK = ['KeyS', 'ArrowDown']
const LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight']

/**
 * Walk mode: a runner in Piazza San Pietro. Run through Rome, super-jump onto
 * the roofs, collect the coins placed from the tile data and paint buildings.
 *
 * Library features on show: the follow target, `getFeatures()` (collisions and
 * coins), objects added to the tiles, `pickFeature()` and `featureStyle` (paint),
 * shadows cast by and on your own objects.
 */
export function createWalkMode(app) {
    const { geo, camera, renderer, keys, hud, lighting } = app
    const runner    = createRunner()
    const player    = runner.object
    const coins     = new CoinField(geo)
    const velocity  = new THREE.Vector3()
    const view      = { yaw: 0, pitch: 0.3, distance: 6.5 }
    const target    = new THREE.Vector3()
    const chest     = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const painted   = new Map()
    const canvas    = renderer.domElement

    let grounded = true
    let charge   = 0
    let score    = 0
    let dragging = false

    const onDown  = event => { dragging = true; canvas.setPointerCapture?.(event.pointerId) }
    const onUp    = () => { dragging = false }
    const onMove  = event => {
        if (!dragging) return
        view.yaw   -= event.movementX * 0.005
        view.pitch  = THREE.MathUtils.clamp(view.pitch + event.movementY * 0.004, -0.1, 1.35)
    }
    const onWheel = event => {
        event.preventDefault()
        view.distance = THREE.MathUtils.clamp(view.distance * Math.exp(event.deltaY * 0.001), 2.5, 40)
    }

    /** Paints the building in front of the runner (pickFeature + featureStyle). */
    function paint() {
        const facing = new THREE.Vector3(-Math.sin(player.rotation.y), 0, -Math.cos(player.rotation.y))
        raycaster.set(chest, facing)
        raycaster.far = 12
        const hit = geo.pickFeature(raycaster)
        if (hit?.layer !== 'building') {
            hud.flash('Face a wall to paint it')
            return
        }
        painted.set(hit.id, PAINTS[painted.size % PAINTS.length])
        geo.getMapStyle().refresh()
        hud.flash(`Painted a ${Math.round(Number(hit.properties.render_height) || 10)} m building`)
    }

    return {
        enter() {
            app.startGame({ spawn: SPAWN, renderDistance: 3, follow: player, sun: { azimuth: 250, elevation: 24 } })
            lighting.shadowArea = 70
            player.position.set(0, geo.getHeightAt(0, 0), 0)
            player.rotation.y = Math.PI / 2   // facing the basilica (west)
            grounded = true
            charge   = 0
            velocity.set(0, 0, 0)
            view.yaw = player.rotation.y
            score = 0
            painted.clear()
            app.scene.add(player)
            coins.start()
            geo.getMapStyle().buildingLayer.featureStyle = ({ id }) => (painted.has(id) ? { color: painted.get(id) } : null)

            canvas.addEventListener('pointerdown', onDown)
            window.addEventListener('pointerup', onUp)
            window.addEventListener('pointermove', onMove)
            canvas.addEventListener('wheel', onWheel, { passive: false })
            hud.show({
                title: 'Walk · Rome from the ground',
                help: [
                    'W / S · forward · back   A / D · turn',
                    'Shift · run',
                    'Space · jump — hold it for a super jump onto the roofs',
                    'E · paint the building in front of you',
                    'Drag · look around · scroll · zoom',
                ],
            })
            hud.flash('Collect the coins on the streets and on the roofs', 3)
        },

        exit() {
            coins.stop()
            player.removeFromParent()
            geo.getMapStyle().buildingLayer.featureStyle = null
            canvas.removeEventListener('pointerdown', onDown)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointermove', onMove)
            canvas.removeEventListener('wheel', onWheel)
            app.endGame()
        },

        /** @param {number} dt */
        update(dt) {
            const pos = player.position

            // ── move: A/D turn the runner, W/S go forward / back ──────────────
            const forward = keys.axis(BACK, FORWARD)
            const turn    = keys.axis(RIGHT, LEFT)
            const running = keys.held('ShiftLeft', 'ShiftRight')
            player.rotation.y += turn * TURN_SPEED * (running ? 0.8 : 1) * dt
            const speed = forward > 0 ? (running ? RUN_SPEED : WALK_SPEED) : forward < 0 ? -WALK_SPEED * 0.6 : 0
            const dx = -Math.sin(player.rotation.y), dz = -Math.cos(player.rotation.y)
            const grip = 1 - Math.exp(-dt * (grounded ? 12 : 2.5))
            velocity.x += (dx * speed - velocity.x) * grip
            velocity.z += (dz * speed - velocity.z) * grip
            const moving = forward !== 0 || turn !== 0

            // Walls stop the runner; low steps are climbed. Slide along walls.
            const free = (x, z) => {
                const hs = Math.hypot(velocity.x, velocity.z) || 1
                return geo.getHeightAt(x, z) <= pos.y + STEP &&
                       geo.getHeightAt(x + velocity.x / hs * RADIUS, z + velocity.z / hs * RADIUS) <= pos.y + STEP
            }
            const nx = pos.x + velocity.x * dt
            const nz = pos.z + velocity.z * dt
            if (free(nx, nz))       { pos.x = nx; pos.z = nz }
            else if (free(nx, pos.z)) { pos.x = nx; velocity.z = 0 }
            else if (free(pos.x, nz)) { pos.z = nz; velocity.x = 0 }
            else                     { velocity.x = 0; velocity.z = 0 }

            // ── jump: tap for a hop, hold to charge a super jump ──────────────
            if (grounded && keys.held('Space')) charge = Math.min(1, charge + dt / CHARGE_S)
            if (grounded && charge > 0 && (!keys.held('Space') || charge >= 1)) {
                if (charge < TAP_S / CHARGE_S) charge = 0   // a tap: plain hop
                velocity.y = JUMP + SUPER_JUMP * charge * charge
                if (charge > 0.6) hud.flash('Super jump!', 0.8)
                grounded = false
                charge = 0
            }

            // ── gravity and landing on the ground or on a roof ────────────────
            const ground = geo.getHeightAt(pos.x, pos.z)
            if (grounded && ground < pos.y - 0.05) grounded = false   // walked off a roof
            if (!grounded) {
                velocity.y -= GRAVITY * dt
                pos.y += velocity.y * dt
                if (pos.y <= ground) {
                    pos.y = ground
                    velocity.y = 0
                    grounded = true
                }
            } else {
                pos.y = ground
            }

            if (keys.pressed('KeyE')) paint()

            runner.animate(dt, { speed: Math.hypot(velocity.x, velocity.z), grounded, charge, verticalSpeed: velocity.y })

            // ── coins ────────────────────────────────────────────────────────
            chest.copy(pos).setY(pos.y + 1.1)
            const collected = coins.update(dt, chest)
            if (collected) {
                score += collected
                if (score % 10 === 0) hud.flash(`${score} coins!`, 1)
            }

            // ── third-person camera behind the runner, kept above the roofs ───
            // Dragging orbits it; it swings back behind the runner (fast while moving).
            if (!dragging) view.yaw = dampAngle(view.yaw, player.rotation.y, moving ? 6 : 1.5, dt)
            target.set(pos.x, pos.y + 1.4, pos.z)
            const cp = Math.cos(view.pitch)
            const desired = new THREE.Vector3(
                target.x + Math.sin(view.yaw) * cp * view.distance,
                target.y + Math.sin(view.pitch) * view.distance,
                target.z + Math.cos(view.yaw) * cp * view.distance,
            )
            desired.y = Math.max(desired.y, geo.getHeightAt(desired.x, desired.z) + 0.6)
            camera.position.lerp(desired, 1 - Math.exp(-dt * 10))
            camera.lookAt(target)
            app.focus.copy(pos)

            const meter = charge > 0 ? `  ·  Super jump ${'▮'.repeat(Math.round(charge * 8)).padEnd(8, '▯')}` : ''
            hud.stats(`Coins ${score}  ·  Painted ${painted.size}  ·  Height ${Math.round(pos.y)} m${meter}`)
        },
    }
}
