import * as THREE from 'three'
import { TileLayout } from 'lm-three-geo-play'

/** The fog starts at this fraction of its radius and is complete at the radius. */
const FOG_START = 0.6

/** How often the dominant ground colour is measured, and how fast colours / radius ease. */
const SAMPLE_INTERVAL_MS = 1000
const COLOR_EASE_S       = 0.8
const RADIUS_EASE_S      = 0.5

/** Screen rows sampled for the ground colour, as fractions of the height from the bottom. */
const SAMPLE_ROWS = [0.06, 0.14, 0.22, 0.30, 0.38, 0.46]

/** How much the measured ground colour is lightened, for a hazy look. */
const HAZE = 0.12

/** World position of the fog centre (the tile loading centre); only X and Z are used. */
const fogCenter = { x: 0, y: 0, z: 0 }

/**
 * Replaces three.js' depth fog with a radial fog around a point of the ground —
 * the centre of the loaded tiles — so the map fades out in a circle wherever
 * the camera looks from. `fog.near` / `fog.far` become the inner / outer radius.
 *
 * The centre is a `fogCenter` uniform added to every built-in shader. It is a
 * plain object, which three.js shares by reference instead of cloning it per
 * material, so updating it once moves the fog of every material.
 * Call it before anything is rendered: it affects every built-in material.
 */
export function installRadialFog() {
    for (const shader of Object.values(THREE.ShaderLib)) {
        if (shader.uniforms?.fogColor) shader.uniforms.fogCenter = { value: fogCenter }
    }

    THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
    varying vec3 vFogWorldPosition;
#endif`

    // World position rebuilt from the view-space one: works for every shader
    // that includes the fog chunks (meshes, lines, points, sprites).
    THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
    vFogWorldPosition = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif`

    THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
    uniform vec3 fogColor;
    uniform vec3 fogCenter;
    uniform float fogNear;
    uniform float fogFar;
    varying vec3 vFogWorldPosition;
#endif`

    THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
    float fogDistance = length( vFogWorldPosition.xz - fogCenter.xz );
    float fogFactor   = smoothstep( fogNear, fogFar, fogDistance );
    gl_FragColor.rgb  = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`
}

/**
 * Sky and fog of the demo.
 * - Their colour is the ground colour that covers most of the screen, so the map
 *   dissolves into a matching haze (it adapts to themes and places by itself).
 * - The fog radius follows the tiles actually drawn: it opens up while tiles load
 *   and always ends at the edge of the loaded area, whatever the render distance.
 */
export class Atmosphere {

    /** Toggles the fog (the sky keeps the ground colour). */
    enabled = true

    #scene
    #renderer
    #geo
    #getCenter

    #color  = new THREE.Color()
    #target = new THREE.Color()
    #fog    = new THREE.Fog(0xffffff, 1, 2)
    #radius = 0
    #lastSample = -Infinity
    #row = new Uint8Array(0)

    /**
     * @param {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer,
     *           geo: import('lm-three-geo-play').ThreeGeoPlay,
     *           getCenter: () => { x: number, z: number } }} options
     *   `getCenter` returns the world position the tiles are loaded around.
     */
    constructor({ scene, renderer, geo, getCenter }) {
        this.#scene     = scene
        this.#renderer  = renderer
        this.#geo       = geo
        this.#getCenter = getCenter

        const ground = geo.getMapStyle().backgroundLayer.material?.color
        this.#color.set(ground ?? 0xd8d3a5)
        this.#target.copy(this.#color)

        // Sky and fog share one Color instance, so they always match exactly.
        this.#fog.color     = this.#color
        scene.background    = this.#color
    }

    /** Measures the ground colour again on the next frame (e.g. after a theme change). */
    resample() {
        this.#lastSample = -Infinity
    }

    /**
     * Call once per frame, before rendering.
     * @param {number} dt - Seconds since the previous frame.
     */
    update(dt) {
        this.#color.lerp(this.#target, 1 - Math.exp(-dt / COLOR_EASE_S))

        const config  = this.#geo.getMapConfig()
        const size    = config.tileWorldSize
        const full    = (config.renderDistance + 0.5) * size
        const { total, loading } = this.#geo.getTileStats()
        const settled = total - loading
        const covered = config.tileLayout === TileLayout.GRID
            ? Math.sqrt(settled) * size / 2
            : Math.sqrt(settled / Math.PI) * size
        const radius  = Math.max(size, Math.min(full, covered))
        this.#radius += (radius - this.#radius) * (1 - Math.exp(-dt / RADIUS_EASE_S))

        const center = this.#getCenter()
        fogCenter.x = center.x
        fogCenter.z = center.z

        this.#scene.fog = this.enabled ? this.#fog : null
        this.#fog.near  = this.#radius * FOG_START
        this.#fog.far   = this.#radius
    }

    /**
     * Call right after rendering to the screen: periodically samples the frame.
     * @param {number} now - Timestamp in milliseconds.
     */
    afterRender(now) {
        if (now - this.#lastSample < SAMPLE_INTERVAL_MS) return
        this.#lastSample = now
        const dominant = this.#dominantScreenColor()
        if (dominant) this.#target.copy(dominant).lerp(new THREE.Color(1, 1, 1), HAZE)
    }

    /** Most frequent colour in a few rows of the lower half of the frame, ignoring the haze itself. */
    #dominantScreenColor() {
        const gl = this.#renderer.getContext()
        const w  = gl.drawingBufferWidth
        const h  = gl.drawingBufferHeight
        if (this.#row.length !== w * 4) this.#row = new Uint8Array(w * 4)
        const row  = this.#row
        const step = Math.max(1, Math.floor(w / 128))

        const haze = { r: 0, g: 0, b: 0 }
        this.#color.getRGB(haze, THREE.SRGBColorSpace)
        const hr = haze.r * 255, hg = haze.g * 255, hb = haze.b * 255

        const buckets = new Map()
        let samples = 0
        for (const fraction of SAMPLE_ROWS) {
            gl.readPixels(0, Math.floor(h * fraction), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row)
            for (let x = 0; x < w; x += step) {
                const i = x * 4
                const r = row[i], g = row[i + 1], b = row[i + 2]
                if (Math.abs(r - hr) + Math.abs(g - hg) + Math.abs(b - hb) < 30) continue
                const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
                let bucket = buckets.get(key)
                if (!bucket) buckets.set(key, bucket = { n: 0, r: 0, g: 0, b: 0 })
                bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b
                samples++
            }
        }

        let best = null
        for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket
        if (!best || best.n < samples * 0.05) return null
        return new THREE.Color().setRGB(best.r / best.n / 255, best.g / best.n / 255, best.b / best.n / 255, THREE.SRGBColorSpace)
    }
}
