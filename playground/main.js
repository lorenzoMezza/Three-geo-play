import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Stats from 'three/addons/libs/stats.module.js'

import { 
  ThreeGeoPlay, 
  MapStyle, 
  TileLayout, 
  ViewMode, 
  MapConfig 
} from '../src/index.js';

// ─── Scene ─────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a2e)

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
   1,
    1000
)
camera.position.set(0, 100, 200)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// ─── Controls ───────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.screenSpacePanning = false
controls.minDistance = 0.001
controls.maxDistance = 5000
controls.maxPolarAngle = Math.PI / 2

// ─── Stats (Three.js default FPS meter) ─────────────────────
const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

// ─── GeoPlay ────────────────────────────────────────────────
const gp = new ThreeGeoPlay(scene, camera, renderer)
const cfg = gp.getMapConfig()

cfg.renderDistance = 6
cfg.tileWorldSize = 50
cfg.zoomLevel = 16
cfg.worldOriginOffset = { x: 0, z: 0 }
cfg.tileLayout = TileLayout.CIRCULAR
cfg.viewMode = ViewMode.FOLLOW_TARGET
cfg.originLatLon = { lat: 41.899689, lon: 12.437790 }
cfg.showTileBorders = false
cfg.pbfTileProviderZXYurl = `http://localhost:8090/tiles/{z}/{x}/{y}.pbf`
cfg.tileWorldSize = 10;


//gp.setFollowTarget()

gp.start()

// ─── Animation loop ─────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate)

    stats.begin()

    controls.update()
    gp.onFrameUpdate()
    renderer.render(scene, camera)

    stats.end()
}

animate()
// ─── Debug Cube ─────────────────────────────────────────────
const geometry = new THREE.BoxGeometry(10, 10, 10);

const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.5
});

const cube = new THREE.Mesh(geometry, material);

// posizione: x=0, y=20, z=0
cube.position.set(0, 20, 0);

//scene.add(cube);
// ─── Resize ─────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})