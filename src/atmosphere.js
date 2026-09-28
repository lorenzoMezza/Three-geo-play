import * as THREE from 'three'
import { TileLayout } from 'lm-three-geo-play'

/** The fog starts at this fraction of its radius and is complete at the radius. */
const FOG_START = 0.6

/** How fast colours / radius ease, in seconds. */
const COLOR_EASE_S  = 0.8
const RADIUS_EASE_S = 0.5

/** How much the ground colour is lightened for the sky, for a hazy look. */
const HAZE = 0.18

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
 * - Their colour is the ground colour of the current style (its background
 *   layer), slightly hazier, so the map dissolves into a matching horizon — it
 *   follows theme changes by itself.
 * - The fog radius follows the tiles actually drawn: it opens up while tiles load
 *   and always ends at the edge of the loaded area, whatever the render distance.
 */
export class Atmosphere {

    /** Toggles the fog (the sky keeps the ground colour). */
    enabled = true

    #scene
    #geo
    #getCenter

    #color  = new THREE.Color()
    #target = new THREE.Color()
    #white  = new THREE.Color(1, 1, 1)
    #fog    = new THREE.Fog(0xffffff, 1, 2)
    #radius = 0

    /**
     * @param {{ scene: THREE.Scene,
     *           geo: import('lm-three-geo-play').ThreeGeoPlay,
     *           getCenter: () => { x: number, z: number } }} options
     *   `getCenter` returns the world position the tiles are loaded around.
     */
    constructor({ scene, geo, getCenter }) {
        this.#scene     = scene
        this.#geo       = geo
        this.#getCenter = getCenter

        this.#measure()
        this.#color.copy(this.#target)

        // Sky and fog share one Color instance, so they always match exactly.
        this.#fog.color     = this.#color
        scene.background    = this.#color
    }

    /** Reads the ground colour again (e.g. after a theme change); the sky eases to it. */
    resample() {
        this.#measure()
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

    #measure() {
        const ground = this.#geo.getMapStyle().backgroundLayer.material?.color
        this.#target.set(ground ?? 0xd8d3a5)
        // Light grounds get a light haze; dark ones (night) stay dark.
        this.#target.lerp(this.#white, HAZE * this.#target.getHSL({}).l)
    }
}
