import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up    = new THREE.Vector3()
const _focus = new THREE.Vector3()

/**
 * Sky light and sun of the demo. The sun casts real-time shadows: the buildings
 * (and anything added to the scene) shade the map and each other.
 *
 * The shadow camera follows the point looked at and grows with the viewing
 * distance, so shadows stay sharp close up and still cover the view from far
 * away. Its position is snapped to the shadow map texels and its size changes
 * in steps, so shadow edges do not shimmer while the camera moves.
 */
export class Lighting {

    /** Compass direction the sun shines from, in degrees (0 north, 90 east, 180 south, 270 west). */
    azimuth = 235

    /** Height of the sun above the horizon, in degrees. */
    elevation = 40

    sky = new THREE.HemisphereLight(0xe4ecff, 0x9a9282, 1.6)
    sun = new THREE.DirectionalLight(0xfff2df, 2.4)

    #renderer
    #camera
    #target

    /**
     * @param {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera, target: THREE.Vector3 }} options
     *   `target` is the point looked at (the orbit controls target).
     */
    constructor({ scene, renderer, camera, target }) {
        this.#renderer = renderer
        this.#camera   = camera
        this.#target   = target

        renderer.shadowMap.enabled = true
        renderer.shadowMap.type    = THREE.PCFShadowMap

        const small = Math.min(window.screen.width, window.screen.height) < 700
        const sun   = this.sun
        sun.castShadow = true
        sun.shadow.mapSize.setScalar(small ? 2048 : 4096)
        sun.shadow.bias = -0.0003
        scene.add(this.sky, sun, sun.target)
    }

    /** Real-time shadows on / off. */
    get shadows() { return this.#renderer.shadowMap.enabled }
    set shadows(on) {
        this.#renderer.shadowMap.enabled = on
        this.sun.castShadow = on
    }

    /** Call once per frame, before rendering. */
    update() {
        const sun    = this.sun
        const shadow = sun.shadow
        const target = this.#target

        // Shadow area: about the visible ground, in steps of √2 so its texel size rarely changes.
        const distance = this.#camera.position.distanceTo(target)
        const half     = 2 ** (Math.ceil(Math.log2(THREE.MathUtils.clamp(distance * 1.2, 20, 1500)) * 2) / 2)
        const texel    = (2 * half) / shadow.mapSize.x

        const azimuth   = THREE.MathUtils.degToRad(this.azimuth)
        const elevation = THREE.MathUtils.degToRad(this.elevation)
        _dir.set(
            Math.sin(azimuth) * Math.cos(elevation),
            Math.sin(elevation),
            -Math.cos(azimuth) * Math.cos(elevation),   // world −Z is north
        )

        // Snap the focus to whole texels of the shadow map, seen from the sun.
        _right.crossVectors(_dir, UP).normalize()
        _up.crossVectors(_right, _dir).normalize()
        const x = target.dot(_right)
        const y = target.dot(_up)
        _focus.copy(target)
            .addScaledVector(_right, Math.round(x / texel) * texel - x)
            .addScaledVector(_up,    Math.round(y / texel) * texel - y)

        sun.target.position.copy(_focus)
        sun.position.copy(_focus).addScaledVector(_dir, half * 3)
        sun.target.updateMatrixWorld()

        const camera = shadow.camera
        if (camera.right !== half) {
            camera.left   = -half
            camera.right  = half
            camera.top    = half
            camera.bottom = -half
            camera.near   = half * 0.5
            camera.far    = half * 6
            camera.updateProjectionMatrix()
            shadow.normalBias = texel * 1.5
        }
    }
}
