import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ThreeGeoPlay, TileLayout, ViewMode } from 'lm-three-geo-play'

import { SOURCES, PLACES, isInsideTileset } from './src/tileset.js'
import { Atmosphere, installRadialFog } from './src/atmosphere.js'
import { Lighting } from './src/lighting.js'
import { applyDayTheme } from './src/themes.js'
import { installInspector } from './src/inspector.js'
import { buildPanel } from './src/panel.js'
import { Keys } from './src/game/input.js'
import { Hud } from './src/game/hud.js'
import { CityCollider } from './src/game/collider.js'
import { createWalkMode } from './src/game/walk.js'
import { createFlyMode } from './src/game/fly.js'
import './style.css'

// Must run before any material is compiled.
installRadialFog()

// ─── Scene ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()

// The stencil buffer lets transparent buildings be blended once per pixel (see the library README).
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.getElementById('viewport').append(renderer.domElement)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 50000)
camera.position.set(0, 90, 140)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping      = true
controls.dampingFactor      = 0.08
controls.screenSpacePanning = false   // pan along the ground
controls.minDistance        = 2
controls.maxDistance        = 20000
controls.maxPolarAngle      = Math.PI / 2 - 0.05

// Sun and sky. The flat map layers are unlit; the buildings of the day theme are
// lit, and the sun's shadows fall on the map through the style's shadow layer.
const lighting = new Lighting({ scene, renderer, camera, target: controls.target })

// ─── Map ────────────────────────────────────────────────────────────────────
const sourceOptions = ({ tileUrl, zoomLevel, tileWorldSize, renderDistance }) => ({ tileUrl, zoomLevel, tileWorldSize, renderDistance })

const geo = new ThreeGeoPlay(scene, camera, renderer, {
    ...sourceOptions(SOURCES.local),
    tileLayout:   TileLayout.CIRCULAR,
    originLatLon: { lat: PLACES[0].lat, lon: PLACES[0].lon },
})
const config = geo.getMapConfig()
applyDayTheme(geo.getMapStyle())

// The camera is the library's default follow target: tiles load around its X/Z.
geo.start()

// ─── Tile source ────────────────────────────────────────────────────────────
const source = {
    name: 'local',

    /** Switches provider, staying on the place currently looked at. */
    set(name, accessToken = '') {
        const next = SOURCES[name]
        if (next.needsToken && !accessToken) throw new Error('Enter a Mapbox access token (pk.…) first.')
        const { lat, lon } = geo.worldToLatLon(controls.target.x, controls.target.z)
        config.set({ ...sourceOptions(next), accessToken })
        this.name = name
        document.getElementById('panel-foot').textContent = `${next.label} · zoom ${next.zoomLevel}`
        flyTo(lat, lon)
        atmosphere.resample()
    },
}

// ─── Tile loading modes ─────────────────────────────────────────────────────
//   camera — around the camera position (default, like a game)
//   view   — around the point the camera looks at
//   manual — fixed until "Load tiles around the view" is pressed
//   object — around an object of a game (the runner, the plane)
const focus = new THREE.Object3D()   // follows the orbit target, used by the "view" mode

const loading = {
    mode: 'camera',
    manualCenter: new THREE.Vector3(),
    object: null,

    /** World position the tiles are currently loaded around. */
    center() {
        if (this.mode === 'camera') return camera.position
        if (this.mode === 'view')   return controls.target
        if (this.mode === 'object') return this.object.position
        return this.manualCenter
    },

    /** Loads the tiles around an object of a game. */
    follow(object) {
        this.mode   = 'object'
        this.object = object
        config.viewMode = ViewMode.FOLLOW_TARGET
        geo.setFollowTarget(object)
    },

    setMode(mode) {
        if (mode === this.mode) return
        if (mode === 'manual') {
            this.manualCenter.copy(this.center())   // keep the area that is loaded now
            config.viewMode = ViewMode.MANUAL
        } else {
            config.viewMode = ViewMode.FOLLOW_TARGET
            geo.setFollowTarget(mode === 'camera' ? camera : focus)
        }
        this.mode = mode
    },

    loadAround(x, z) {
        this.setMode('manual')
        this.manualCenter.set(x, 0, z)
        geo.moveMapOriginToPosition(x, z)
    },
}

// Sky and circular fog in the colour of the ground, ending at the edge of the drawn tiles.
const atmosphere = new Atmosphere({ scene, geo, getCenter: () => loading.center() })

/** Places the given coordinates at the world origin and moves the view there. */
function flyTo(lat, lon) {
    config.originLatLon = { lat, lon }
    const { x, z } = config.worldOriginOffset
    const shift = new THREE.Vector3(x, 0, z).sub(controls.target)
    controls.target.add(shift)
    camera.position.add(shift)
    if (loading.mode === 'manual') loading.loadAround(x, z)
}

// ─── UI ─────────────────────────────────────────────────────────────────────
buildPanel(document.getElementById('panel-body'), { geo, controls, flyTo, atmosphere, lighting, loading, source })

const panel     = document.getElementById('panel')
const openPanel = document.getElementById('panel-open')
function setPanelOpen(open) {
    panel.hidden     = !open
    openPanel.hidden = open
}
document.getElementById('panel-close').addEventListener('click', () => setPanelOpen(false))
openPanel.addEventListener('click', () => setPanelOpen(true))
setPanelOpen(window.innerWidth > 640)

// Click on the map to see what is there.
const inspector = installInspector({ geo, camera, renderer, scene, output: document.getElementById('readout-pick') })

// The controls hint goes away after the first interaction (or a few seconds).
const controlsHint = document.getElementById('controls-hint')
const dismissHint  = () => controlsHint.classList.add('gone')
renderer.domElement.addEventListener('pointerdown', dismissHint, { once: true })
setTimeout(dismissHint, 8000)

// ─── Readout ────────────────────────────────────────────────────────────────
const readoutPosition = document.getElementById('readout-position')
const readoutStats    = document.getElementById('readout-stats')
const degrees = (value, positive, negative) => `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`
let fps = 60

setInterval(() => {
    const { lat, lon } = geo.worldToLatLon(controls.target.x, controls.target.z)
    readoutPosition.textContent = `${degrees(lat, 'N', 'S')}  ${degrees(lon, 'E', 'W')}`
    updateAttribution()

    const centre = loading.center()
    const here   = geo.worldToLatLon(centre.x, centre.z)
    if (source.name === 'local' && !isInsideTileset(here.lat, here.lon)) {
        readoutStats.textContent = 'No local tiles here (they cover Rome and Lazio)'
        return
    }
    const { total, loading: pending } = geo.getTileStats()
    const { calls, triangles } = renderer.info.render
    const tiles = pending ? `${total - pending} of ${total} tiles` : `${total} tiles`
    readoutStats.textContent = `${tiles} · ${calls} draw calls · ${(triangles / 1e6).toFixed(2)} M triangles · ${Math.round(fps)} fps`
}, 250)

/**
 * Shows the credits required by the provider (`getTileSource().attribution`),
 * keeping only text and http(s) links from its HTML.
 */
const attributionEl = document.getElementById('attribution')
const defaultAttribution = attributionEl.innerHTML
let shownAttribution = null
function updateAttribution() {
    const html = geo.getTileSource()?.attribution || ''
    if (html === shownAttribution) return
    shownAttribution = html
    if (!html) {
        attributionEl.innerHTML = defaultAttribution
        return
    }
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    attributionEl.replaceChildren(...[...parsed.body.childNodes].map(node => {
        if (node.nodeName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
            const link = document.createElement('a')
            Object.assign(link, { href: node.getAttribute('href'), textContent: node.textContent, target: '_blank', rel: 'noopener' })
            return link
        }
        return document.createTextNode(node.textContent)
    }))
}

// ─── Scenes: explore, walk, fly ─────────────────────────────────────────────
// The games use the same map and scene. They set the map so that one world
// unit is one metre, around their own follow target; `controls.target` stays
// the point of interest (lighting, fog and read-out follow it).
const keys     = new Keys()
const hud      = new Hud()
const collider = new CityCollider(geo)
const tileMetres = lat => 40075016.686 * Math.cos(lat * Math.PI / 180) / 2 ** SOURCES.local.zoomLevel

const game = {
    geo, scene, camera, renderer, lighting, keys, hud, collider,
    focus: controls.target,

    /** Sets the map up for a game: metres, tiles around `follow`, a low sun. */
    startGame({ spawn, renderDistance, follow, sun }) {
        if (source.name !== 'local') source.set('local')
        config.set({
            originLatLon: spawn, worldOriginOffset: { x: 0, z: 0 },
            tileWorldSize: tileMetres(spawn.lat), renderDistance,
        })
        loading.follow(follow)
        geo.onFrameUpdate()   // apply the new scale now, so the tiles are placed before the game reads them
        Object.assign(lighting, sun)
        collider.start()
        keys.clear()
        keys.enabled = true
    },

    endGame() {
        collider.stop()
        keys.enabled = false
        lighting.shadowArea = null
    },
}

/** The explorer: orbit controls and the settings panel. Its view is kept while a game runs. */
const explore = {
    saved: null,
    enter() {
        const s = this.saved
        if (s) {
            config.set({ originLatLon: s.origin, worldOriginOffset: s.offset, tileWorldSize: s.tileWorldSize, renderDistance: s.renderDistance })
            Object.assign(lighting, s.sun)
            camera.fov = 60
            camera.updateProjectionMatrix()
            camera.position.copy(s.camera)
            controls.target.copy(s.target)
            loading.setMode(s.mode === 'manual' ? 'camera' : s.mode)
            if (s.mode === 'manual') loading.loadAround(s.manualCenter.x, s.manualCenter.z)
        }
        controls.enabled  = true
        inspector.enabled = true
        setPanelOpen(window.innerWidth > 640)
        hud.hide()
    },
    exit() {
        this.saved = {
            origin: config.originLatLon, offset: config.worldOriginOffset,
            tileWorldSize: config.tileWorldSize, renderDistance: config.renderDistance,
            sun: { azimuth: lighting.azimuth, elevation: lighting.elevation },
            camera: camera.position.clone(), target: controls.target.clone(),
            mode: loading.mode, manualCenter: loading.manualCenter.clone(),
        }
        controls.enabled  = false
        inspector.enabled = false
        panel.hidden      = true
        openPanel.hidden  = true
        document.getElementById('readout-pick').textContent = ''
        scene.getObjectByName('Pin').visible = false
    },
    update() {
        controls.update()
    },
}

const modes = { explore, walk: createWalkMode(game), fly: createFlyMode(game) }
let mode = explore
const modeButtons = [...document.querySelectorAll('#modes button')]

function setMode(name) {
    if (modes[name] === mode) return
    mode.exit()
    mode = modes[name]
    mode.enter()
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === name))
    controlsHint.classList.add('gone')
}
for (const button of modeButtons) button.addEventListener('click', () => { setMode(button.dataset.mode); button.blur() })

// Debug handle for the browser console during development (`demo.geo`, `demo.camera`, …).
if (import.meta.env.DEV) {
    window.demo = { THREE, geo, camera, controls, scene, renderer, focus, atmosphere, lighting, loading, source, setMode, collider, keys }
    /** Runs one frame by hand (the loop stops while the tab is hidden). */
    window.demo.step = (dt = 1 / 60) => { mode.update(dt); geo.onFrameUpdate(); atmosphere.update(dt); lighting.update(); renderer.render(scene, camera) }
}

// ─── Loop ───────────────────────────────────────────────────────────────────
const timer = new THREE.Timer()
renderer.setAnimationLoop(time => {
    timer.update(time)
    const dt = Math.min(timer.getDelta(), 0.1)
    if (dt > 0) fps += (1 / dt - fps) * 0.05
    mode.update(dt)
    focus.position.copy(controls.target)
    geo.onFrameUpdate()
    atmosphere.update(dt)
    lighting.update()
    renderer.render(scene, camera)
})

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})
