// ThreeGeoPlay playground: the library straight from ../src, for quick tries and debugging.
//
//   ?lat=41.89&lon=12.49      place at the origin (default: Rome)
//   ?zoom=14                  zoom level (default: 14)
//   ?tiles=<url>              tile source: template, TileJSON, style URL or mapbox:// (default: OpenFreeMap)
//   ?token=<pk…>              access token (Mapbox)
//
// Keys: B tile borders · N day / night style · G glass buildings · S shadows
// Click: logs the feature under the pointer. In the console: geo, style, config, scene, camera, THREE.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Stats from 'three/addons/libs/stats.module.js'
import { ThreeGeoPlay, MapStyle } from 'lm-three-geo-play'

const params = new URLSearchParams(location.search)
const number = (name, fallback) => (params.has(name) ? Number(params.get(name)) : fallback)

// ─── Scene ──────────────────────────────────────────────────────────────────
const scene    = new THREE.Scene()
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
document.body.append(renderer.domElement)

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 30000)
camera.position.set(0, 600, 900)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI / 2 - 0.05

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.5))
const sun = new THREE.DirectionalLight(0xffffff, 2.5)
sun.castShadow = true
sun.shadow.mapSize.setScalar(4096)
Object.assign(sun.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 10, far: 4000 })
scene.add(sun, sun.target)

const stats = new Stats()
document.body.append(stats.dom)

// ─── Map ────────────────────────────────────────────────────────────────────
const geo = new ThreeGeoPlay(scene, camera, renderer, {
    tileUrl:        params.get('tiles') ?? 'https://tiles.openfreemap.org/planet',
    accessToken:    params.get('token') ?? '',
    zoomLevel:      number('zoom', 14),
    originLatLon:   { lat: number('lat', 41.8986), lon: number('lon', 12.4769) },
    unitsPerMeter:  1,
    renderDistance: 4,
})
const lit = style => {
    style.buildingLayer.material = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, vertexColors: true })
    return style
}
geo.setMapStyle(lit(new MapStyle()))
geo.addEventListener('sourceerror', ({ error }) => console.error(error.message))
geo.start()

// ─── Debug keys and picking ─────────────────────────────────────────────────
addEventListener('keydown', ({ key }) => {
    const config = geo.getMapConfig()
    const style  = geo.getMapStyle()
    switch (key.toLowerCase()) {
        case 'b': config.showTileBorders = !config.showTileBorders; break
        case 'n': geo.setMapStyle(style.backgroundLayer.material.color.getHex() === 0x10131a ? lit(new MapStyle()) : MapStyle.dark()); break
        case 'g': {
            const m = style.buildingLayer.material
            m.transparent = !m.transparent
            m.opacity     = m.transparent ? 0.5 : 1
            m.needsUpdate = true
            break
        }
        case 's': renderer.shadowMap.enabled = sun.castShadow = !renderer.shadowMap.enabled; break
    }
})

const raycaster = new THREE.Raycaster()
renderer.domElement.addEventListener('click', event => {
    raycaster.setFromCamera(new THREE.Vector2(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1), camera)
    const hit = geo.pickFeature(raycaster)
    if (hit) console.log(`${hit.layer} / ${hit.type}`, hit.properties, hit)
})

// ─── Loop ───────────────────────────────────────────────────────────────────
renderer.setAnimationLoop(() => {
    controls.update()
    sun.target.position.copy(controls.target)
    sun.position.copy(controls.target).add(new THREE.Vector3(-600, 1200, 500))
    geo.onFrameUpdate()
    renderer.render(scene, camera)
    stats.update()
})

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
})

// Console handles; `style` and `config` always return the current ones.
Object.assign(window, { geo, scene, camera, renderer, THREE })
Object.defineProperties(window, {
    style:  { get: () => geo.getMapStyle(), configurable: true },
    config: { get: () => geo.getMapConfig(), configurable: true },
})
