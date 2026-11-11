import * as THREE from 'three'
import { MapStyle } from 'lm-three-geo-play'

/**
 * Neon theme: the map drawn with custom shaders and a generated texture.
 *
 * It shows the two ways to shade the map:
 * - built-in materials extended with `onBeforeCompile` (ground, roads, buildings):
 *   they keep every three.js feature — batching (one draw call per material),
 *   lights, shadows, fog, vertex colours, transparency;
 * - a plain `THREE.ShaderMaterial` written from scratch (water), which the
 *   library draws tile by tile.
 *
 * Patterns are computed in metres (`geo.getUnitsPerMeter()`), so they keep
 * their size in every scene of the demo, and a light pulse spreads from the
 * point of interest (the orbit target, or the player in the games).
 */

// ─── Shared state ───────────────────────────────────────────────────────────

/** Uniforms shared by reference by every neon material: updated once per frame. */
const shared = {
    uTime:          { value: 0 },
    uUnitsPerMeter: { value: 1 },
    uFocus:         { value: new THREE.Vector3() },
}

/** Where the values come from; set by `createNeonStyle`. */
const context = { geo: null, focus: null, frame: -1 }
const clock = new THREE.Timer()

/** Called by every neon material before it draws (`Material.onBeforeRender`); runs once per frame. */
function updateShared(renderer) {
    const frame = renderer.info.render.frame
    if (frame === context.frame) return
    context.frame = frame
    clock.update()
    shared.uTime.value = clock.getElapsed()
    if (context.geo) shared.uUnitsPerMeter.value = context.geo.getUnitsPerMeter()
    if (context.focus) shared.uFocus.value.copy(context.focus)
}

// ─── GLSL shared by the materials ───────────────────────────────────────────

/** World position of the vertex, batching included (after `project_vertex`). */
const WORLD_VERTEX = /* glsl */ `
    vec4 neonWorld = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
        neonWorld = batchingMatrix * neonWorld;
    #endif
    #ifdef USE_INSTANCING
        neonWorld = instanceMatrix * neonWorld;
    #endif
    vNeonWorld = ( modelMatrix * neonWorld ).xyz;
    #ifdef NEON_NORMAL
        vec3 neonNormal = objectNormal;
        #ifdef USE_BATCHING
            neonNormal = mat3( batchingMatrix ) * neonNormal;
        #endif
        vNeonNormal = normalize( mat3( modelMatrix ) * neonNormal );
    #endif
`

const NEON_COMMON = /* glsl */ `
    uniform float uTime;
    uniform float uUnitsPerMeter;
    uniform vec3  uFocus;

    float neonHash( vec2 p ) {
        p = fract( p * vec2( 123.34, 456.21 ) );
        p += dot( p, p + 45.32 );
        return fract( p.x * p.y );
    }

    // Light pulse spreading from the focus: bright at the front, fading behind it (metres).
    float neonPulse( vec2 p ) {
        float d      = length( p - uFocus.xz / uUnitsPerMeter );
        float behind = 700.0 - fract( ( d - uTime * 90.0 ) / 700.0 ) * 700.0;
        return exp( -behind / 30.0 ) * smoothstep( 0.0, 3.0, behind ) * ( 1.0 - smoothstep( 900.0, 2600.0, d ) );
    }

    // Anti-aliased grid lines, one pixel wide, fading out before they turn into moiré.
    float neonGrid( vec2 p, float period ) {
        vec2 c  = p / period;
        vec2 fw = fwidth( c );
        vec2 g  = abs( fract( c - 0.5 ) - 0.5 ) / fw;
        return ( 1.0 - min( min( g.x, g.y ), 1.0 ) ) * ( 1.0 - smoothstep( 0.08, 0.35, max( fw.x, fw.y ) ) );
    }

    // Distance to the nearest hexagon edge: 0 on the edge, 0.5 in the centre (cell units).
    float neonHex( vec2 p ) {
        const vec2 s = vec2( 1.0, 1.7320508 );
        vec4 hc = floor( vec4( p, p - vec2( 0.5, 1.0 ) ) / s.xyxy ) + 0.5;
        vec4 h  = vec4( p - hc.xy * s, p - ( hc.zw + 0.5 ) * s );
        vec2 q  = abs( dot( h.xy, h.xy ) < dot( h.zw, h.zw ) ? h.xy : h.zw );
        return 0.5 - max( dot( q, s * 0.5 ), q.x );
    }
`

/**
 * Extends a built-in material: `diffuse` runs after `color_fragment` (to change
 * `diffuseColor`), `glow` before `opaque_fragment` (to add light to `outgoingLight`).
 * Fog, tone mapping and colour space are applied afterwards as usual. Called by
 * the constructors, so copies made by `clone()` are extended as well.
 */
function extend(material, key, { uniforms = {}, head = '', diffuse = '', glow = '', normal = false }) {
    const varyings = `varying vec3 vNeonWorld;\n${normal ? '#define NEON_NORMAL\nvarying vec3 vNeonNormal;' : ''}`
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, shared, uniforms)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${varyings}`)
            .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VERTEX}`)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${varyings}\n${NEON_COMMON}\n${head}`)
            .replace('#include <color_fragment>', `#include <color_fragment>\n${diffuse}`)
            .replace('#include <opaque_fragment>', `${glow}\n#include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => key
    material.onBeforeRender = updateShared   // (renderer, …): keeps the shared uniforms up to date
}

// ─── Circuit texture ────────────────────────────────────────────────────────

let circuitTexture = null

/**
 * A tileable circuit-board pattern drawn on a canvas, used as a mask in metres:
 * traces running along a 16 px grid with 45° bends, ending on pads. Each trace
 * is drawn nine times, shifted by the canvas size, so it wraps across the edges.
 */
function circuit() {
    if (circuitTexture) return circuitTexture
    const size = 512, step = 16
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = ctx.fillStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.lineJoin = ctx.lineCap = 'round'
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
    const wrapped = draw => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy) }
    for (let n = 0; n < 70; n++) {
        let x = Math.floor(random() * size / step) * step, y = Math.floor(random() * size / step) * step
        let dir = Math.floor(random() * 4) * 2          // start straight
        const points = [[x, y]]
        const length = 4 + Math.floor(random() * 10)
        for (let i = 0; i < length; i++) {
            if (random() < 0.25) dir = (dir + (random() < 0.5 ? 1 : 7)) % 8   // 45° bend
            x += DIRS[dir][0] * step; y += DIRS[dir][1] * step
            points.push([x, y])
        }
        wrapped((ox, oy) => {
            ctx.beginPath()
            points.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)))
            ctx.stroke()
            for (const [px, py] of [points[0], points[points.length - 1]]) {
                ctx.beginPath(); ctx.arc(px + ox, py + oy, 4.5, 0, Math.PI * 2); ctx.fill()
            }
        })
    }
    circuitTexture = new THREE.CanvasTexture(canvas)
    circuitTexture.wrapS = circuitTexture.wrapT = THREE.RepeatWrapping
    circuitTexture.colorSpace = THREE.NoColorSpace   // a mask, not a colour
    circuitTexture.anisotropy = 8
    return circuitTexture
}

// ─── Materials ──────────────────────────────────────────────────────────────
// Classes rather than patched instances: `material.clone()` (used by the demo's
// colour pickers) calls the constructor again, so copies keep their shader.

/** Ground: a glowing metric grid (20 m and 100 m) swept by the pulse. */
export class NeonGroundMaterial extends THREE.MeshBasicMaterial {
    constructor(params) {
        super(params)
        this.accent = new THREE.Color(0x2de2ff)
        extend(this, 'neon-ground', {
            uniforms: { uAccent: { value: this.accent } },
            head: 'uniform vec3 uAccent;',
            glow: /* glsl */ `
                vec2 neonP = vNeonWorld.xz / uUnitsPerMeter;
                float neonLines = neonGrid( neonP, 20.0 ) * 0.25 + neonGrid( neonP, 100.0 ) * 0.7;
                outgoingLight += uAccent * ( neonLines * ( 0.35 + 1.6 * neonPulse( neonP ) ) + neonPulse( neonP ) * 0.12 );
            `,
        })
    }
    copy(source) { super.copy(source); this.accent.copy(source.accent); return this }
}

/** Land use: the circuit texture, sampled in metres, lit up by the pulse. */
export class NeonCircuitMaterial extends THREE.MeshBasicMaterial {
    constructor({ accent = 0x7a5cff, ...params } = {}) {
        super(params)
        this.accent = new THREE.Color(accent)
        extend(this, 'neon-circuit', {
            uniforms: { uAccent: { value: this.accent }, uCircuit: { value: circuit() } },
            head: 'uniform vec3 uAccent;\nuniform sampler2D uCircuit;',
            glow: /* glsl */ `
                vec2 neonP = vNeonWorld.xz / uUnitsPerMeter;
                float neonTrace = texture2D( uCircuit, neonP / 160.0 ).r;
                outgoingLight += uAccent * ( neonTrace * ( 0.28 + 1.2 * neonPulse( neonP ) ) + neonPulse( neonP ) * 0.15 );
            `,
        })
    }
    copy(source) { super.copy(source); this.accent.copy(source.accent); return this }
}

/** Parks and natural areas: a procedural hexagon grid (14 m cells). */
export class NeonHexMaterial extends THREE.MeshBasicMaterial {
    constructor({ accent = 0x14ffa8, ...params } = {}) {
        super(params)
        this.accent = new THREE.Color(accent)
        extend(this, 'neon-hex', {
            uniforms: { uAccent: { value: this.accent } },
            head: 'uniform vec3 uAccent;',
            glow: /* glsl */ `
                vec2  neonP = vNeonWorld.xz / uUnitsPerMeter;
                float neonE = neonHex( neonP / 14.0 );
                float neonW = fwidth( neonE );
                float neonLine = ( 1.0 - smoothstep( 0.0, neonW * 1.5, neonE ) ) * ( 1.0 - smoothstep( 0.05, 0.25, neonW ) );
                outgoingLight += uAccent * ( neonLine * 0.45 + neonPulse( neonP ) * 0.5 );
            `,
        })
    }
    copy(source) { super.copy(source); this.accent.copy(source.accent); return this }
}

/** Roads and waterway casings: a neon tube with light flowing through the city, lit by the pulse. */
export class NeonLineMaterial extends THREE.MeshBasicMaterial {
    constructor({ flow = 0.35, ...params } = {}) {
        super(params)
        this.flow = { value: flow }
        extend(this, 'neon-line', {
            uniforms: { uFlow: this.flow },
            head: 'uniform float uFlow;',
            glow: /* glsl */ `
                vec2 neonP = vNeonWorld.xz / uUnitsPerMeter;
                float neonStream = 0.5 + 0.5 * sin( dot( neonP, vec2( 0.045, 0.031 ) ) - uTime * 2.4 );
                outgoingLight *= 1.0 + uFlow * ( neonStream - 0.5 ) + 1.4 * neonPulse( neonP );
            `,
        })
    }
    copy(source) { super.copy(source); this.flow.value = source.flow.value; return this }
}

/**
 * Buildings: dark glass with windows on every floor, some of them switching
 * on and off, circuit roofs and the pulse running up the walls. Built on
 * `MeshLambertMaterial`, so the library provides exact normals; `unlit`
 * replaces the lights with a fixed shading (the panel's "Baked" setting).
 * With `vertexColors`, a building painted with `featureStyle({ color })` glows in that colour.
 */
function buildingShader(material, unlit) {
    material.accent  = material.accent ?? new THREE.Color(0xff3df2)
    material.windowA = material.windowA ?? new THREE.Color(0x4df3ff)
    material.windowB = material.windowB ?? new THREE.Color(0xff5bd8)
    material.windowC = material.windowC ?? new THREE.Color(0xffc26b)
    extend(material, unlit ? 'neon-building-unlit' : 'neon-building', {
        uniforms: {
            uAccent:  { value: material.accent },
            uWindowA: { value: material.windowA },
            uWindowB: { value: material.windowB },
            uWindowC: { value: material.windowC },
            uCircuit: { value: circuit() },
        },
        head: `uniform vec3 uAccent, uWindowA, uWindowB, uWindowC;\nuniform sampler2D uCircuit;\n${unlit ? '#define NEON_UNLIT' : ''}`,
        normal: true,
        glow: /* glsl */ `
            vec3  neonN    = normalize( vNeonNormal );
            float neonWall = 1.0 - smoothstep( 0.25, 0.6, abs( neonN.y ) );
            vec3  neonM    = vNeonWorld / uUnitsPerMeter;

            #ifdef USE_COLOR
                vec3 neonTint = vColor.rgb / max( max( vColor.r, vColor.g ), max( vColor.b, 1e-3 ) );
            #else
                vec3 neonTint = vec3( 1.0 );
            #endif

            // Windows: 3.2 m wide bays, 3.6 m floors, along the wall.
            vec2  neonT    = normalize( vec2( -neonN.z, neonN.x ) + 1e-5 );
            vec2  neonCell = vec2( dot( neonM.xz, neonT ) / 3.2, neonM.y / 3.6 );
            vec2  neonId   = floor( neonCell );
            vec2  neonF    = fract( neonCell );
            vec2  neonFw   = fwidth( neonCell );
            vec2  neonIn   = smoothstep( vec2( 0.2 ) - neonFw, vec2( 0.2 ) + neonFw, neonF )
                           * ( 1.0 - smoothstep( vec2( 0.8 ) - neonFw, vec2( 0.8 ) + neonFw, neonF ) );
            float neonSeed = neonHash( neonId );
            float neonLit  = step( 0.58, neonHash( neonId * 1.37 + floor( uTime * 0.12 + neonSeed * 17.0 ) ) );
            vec3  neonWin  = mix( mix( uWindowA, uWindowB, step( 0.55, neonSeed ) ), uWindowC, step( 0.86, neonSeed ) );
            // Far away the windows are smaller than a pixel: use their average light instead.
            float neonNear  = 1.0 - smoothstep( 0.25, 0.8, max( neonFw.x, neonFw.y ) );
            float neonLight = mix( 0.15, neonIn.x * neonIn.y * neonLit, neonNear ) * step( 0.6, neonM.y );

            float neonPulseHere = neonPulse( neonM.xz );
            float neonRoofTrace = texture2D( uCircuit, neonM.xz / 120.0 ).r;

            vec3 neonGlow = neonWall * neonLight * neonWin * 1.15
                          + ( 1.0 - neonWall ) * neonRoofTrace * uAccent * 0.3
                          + neonPulseHere * uAccent * ( 0.25 + 0.75 * neonWall );
            #ifdef NEON_UNLIT
                outgoingLight = diffuseColor.rgb * ( 0.6 + 0.4 * max( dot( neonN, normalize( vec3( -0.5, 0.75, 0.45 ) ) ), 0.0 ) );
            #endif
            outgoingLight += neonGlow * neonTint;
        `,
    })
}

export class NeonBuildingMaterial extends THREE.MeshLambertMaterial {
    isNeonBuilding = true
    /** @param {Object} [params] - `MeshLambertMaterial` parameters, plus `unlit`. */
    constructor({ unlit = false, ...params } = {}) {
        super(params)
        this.unlit = unlit
        buildingShader(this, unlit)
    }
    copy(source) {
        super.copy(source)
        for (const k of ['accent', 'windowA', 'windowB', 'windowC']) this[k].copy(source[k])
        if (source.unlit !== this.unlit) { this.unlit = source.unlit; buildingShader(this, this.unlit) }
        return this
    }
    /** The same look, lit by the sun of the scene or with a fixed shading. */
    withLighting(lit) { return new NeonBuildingMaterial({ ...paramsOf(this), unlit: !lit }) }
}

const paramsOf = m => ({ color: m.color, opacity: m.opacity, transparent: m.transparent, vertexColors: m.vertexColors })

/**
 * Water: a `THREE.ShaderMaterial` written from scratch — animated neon contour
 * lines over deep blue. The library draws custom shader materials tile by tile.
 * `color` / `accent` are its uniforms, so the colour pickers work as for any material.
 */
export class NeonWaterMaterial extends THREE.ShaderMaterial {
    constructor({ color = 0x03163d, accent = 0x1fd8ff } = {}) {
        super({
            fog: true,
            uniforms: {
                ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
                uColor:  { value: new THREE.Color(color) },
                uAccent: { value: new THREE.Color(accent) },
                ...shared,
            },
            vertexShader: /* glsl */ `
                #include <common>
                #include <fog_pars_vertex>
                varying vec3 vWorld;
                void main() {
                    vec4 world = modelMatrix * vec4( position, 1.0 );
                    vWorld = world.xyz;
                    vec4 mvPosition = viewMatrix * world;
                    gl_Position = projectionMatrix * mvPosition;
                    #include <fog_vertex>
                }
            `,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <fog_pars_fragment>
                uniform vec3  uColor;
                uniform vec3  uAccent;
                uniform float uTime;
                uniform float uUnitsPerMeter;
                uniform vec3  uFocus;
                varying vec3  vWorld;
                void main() {
                    vec2 p = vWorld.xz / uUnitsPerMeter;
                    float t = uTime;
                    float w = sin( p.x * 0.043 + t * 0.9 ) + sin( p.y * 0.051 - t * 0.7 )
                            + sin( ( p.x + p.y ) * 0.029 + t * 0.5 )
                            + 0.8 * sin( length( p - uFocus.xz / uUnitsPerMeter ) * 0.06 - t * 1.8 );
                    // Contour lines of the moving waves, one pixel wide, faded where they get too dense.
                    float c     = w * 1.2;
                    float fw    = fwidth( c );
                    float line  = ( 1.0 - smoothstep( fw * 0.5, fw * 1.8, abs( fract( c ) - 0.5 ) ) )
                                * ( 1.0 - smoothstep( 0.2, 0.6, fw ) );
                    vec3 col = uColor * ( 0.8 + 0.08 * w ) + uAccent * line * 0.9;
                    gl_FragColor = vec4( col, 1.0 );
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                    #include <fog_fragment>
                }
            `,
        })
    }
    get color()  { return this.uniforms.uColor.value }
    get accent() { return this.uniforms.uAccent.value }
    onBeforeRender(renderer) {
        updateShared(renderer)
        // The shared uniforms are used by reference; a clone() has copies, kept up to date here.
        const u = this.uniforms
        if (u.uTime !== shared.uTime) {
            u.uTime.value = shared.uTime.value
            u.uUnitsPerMeter.value = shared.uUnitsPerMeter.value
            u.uFocus.value.copy(shared.uFocus.value)
        }
    }
}

// ─── The style ──────────────────────────────────────────────────────────────

const GREEN_LANDUSE  = ['pitch', 'recreation_ground', 'cemetery', 'playground', 'nature_reserve', 'protected_area', 'zoo']
const AMBER_LANDUSE  = ['industrial', 'railway', 'commercial', 'retail', 'military', 'quarry', 'garages', 'parking']
const SAND_LANDCOVER = ['sand', 'beach', 'dune', 'bare_rock', 'rock', 'scree', 'farmland', 'farm']

/**
 * A `MapStyle` drawn with the neon materials.
 * @param {{ geo: import('lm-three-geo-play').ThreeGeoPlay, focus: THREE.Vector3 }} options
 *   `focus` is where the light pulse starts (it is read every frame).
 */
export function createNeonStyle({ geo, focus }) {
    context.geo   = geo
    context.focus = focus

    const style = new MapStyle()

    style.backgroundLayer.material = new NeonGroundMaterial({ color: 0x060918 })

    const urban = new NeonCircuitMaterial({ color: 0x0c0e24, accent: 0x6c4dff })
    const amber = new NeonCircuitMaterial({ color: 0x15101e, accent: 0xff9f3d })
    const green = new NeonHexMaterial({ color: 0x041c1a, accent: 0x14ffa8 })
    const sand  = new NeonHexMaterial({ color: 0x161428, accent: 0xb58cff })
    style.landUseLayer.setAllMaterials(urban)
    for (const name of GREEN_LANDUSE) style.landUseLayer.getTypeByName(name).material = green
    for (const name of AMBER_LANDUSE) style.landUseLayer.getTypeByName(name).material = amber
    style.landCoverLayer.setAllMaterials(green)
    for (const name of SAND_LANDCOVER) style.landCoverLayer.getTypeByName(name).material = sand

    const water = new NeonWaterMaterial()
    style.waterLayer.setAllMaterials(water)
    style.waterwayLayer.setAllMaterials(water, new NeonLineMaterial({ color: 0x1fd8ff }))

    // Roads: dark asphalt, neon casings by importance.
    const roads   = style.transportationLayer
    const asphalt = new NeonLineMaterial({ color: 0x0f1230, flow: 0.2 })
    roads.setAllMaterials(asphalt, new NeonLineMaterial({ color: 0x6b4dff }))
    const casing = (color, names) => {
        const material = new NeonLineMaterial({ color })
        for (const name of names) roads.getTypeByName(name).outlineMaterial = material
    }
    casing(0xff2e97, ['motorway', 'trunk', 'primary'])
    casing(0x22d3ff, ['secondary', 'tertiary'])
    casing(0x2a8f9a, ['pedestrian', 'path', 'track'])

    const buildings = style.buildingLayer
    buildings.material         = new NeonBuildingMaterial({ color: 0x2a2f5c, vertexColors: true })
    buildings.roofColor        = 0xffffff
    buildings.ambientOcclusion = 0.6
    buildings.colorVariation   = 0.15

    style.shadowLayer.material.opacity = 0.5
    return style
}
