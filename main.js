import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ThreeGeoPlay, TileLayout, ViewMode } from 'lm-three-geo-play'

import { SOURCES, PLACES, isInsideTileset } from './src/tileset.js'
import { Atmosphere, installRadialFog } from './src/atmosphere.js'
import { Lighting } from './src/lighting.js'
import { applyDayTheme } from './src/themes.js'
import { buildPanel } from './src/panel.js'
import './style.css'

// Must run before any material is compiled.
installRadialFog()

// ─── Scene ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()

const renderer = new THREE.WebGLRenderer({ antialias: true })
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
const focus = new THREE.Object3D()   // follows the orbit target, used by the "view" mode

const loading = {
    mode: 'camera',
    manualCenter: new THREE.Vector3(),

    /** World position the tiles are currently loaded around. */
    center() {
        if (this.mode === 'camera') return camera.position
        if (this.mode === 'view')   return controls.target
        return this.manualCenter
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

// Debug handle for the browser console during development (`demo.geo`, `demo.camera`, …).
if (import.meta.env.DEV) window.demo = { THREE, geo, camera, controls, scene, renderer, focus, atmosphere, lighting, loading, source }

// ─── Loop ───────────────────────────────────────────────────────────────────
const timer = new THREE.Timer()
renderer.setAnimationLoop(time => {
    timer.update(time)
    const dt = Math.min(timer.getDelta(), 0.1)
    if (dt > 0) fps += (1 / dt - fps) * 0.05
    controls.update()
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
