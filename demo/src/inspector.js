import * as THREE from 'three'

const LAYER_NAMES = {
    building:       'Building',
    transportation: 'Road',
    water:          'Water',
    waterway:       'Waterway',
    landuse:        'Land use',
    landcover:      'Land cover',
}

/**
 * Click on the map to see what is there (`ThreeGeoPlay#pickFeature`) and drop
 * a pin: an ordinary scene object, which casts a shadow on the map and hides
 * behind the buildings like anything else you add to the scene.
 *
 * @param {{ geo: import('lm-three-geo-play').ThreeGeoPlay, camera: THREE.Camera,
 *           renderer: THREE.WebGLRenderer, scene: THREE.Scene, output: HTMLElement }} options
 * @returns {{ enabled: boolean }} Set `enabled` to false to ignore clicks (e.g. during a game).
 */
export function installInspector({ geo, camera, renderer, scene, output }) {
    const raycaster = new THREE.Raycaster()
    const pointer   = new THREE.Vector2()
    const pin       = createPin()
    pin.visible = false
    scene.add(pin)

    const inspector = { enabled: true }
    const canvas = renderer.domElement
    let down = null
    canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY } })
    canvas.addEventListener('pointerup', event => {
        // A click, not the end of a drag.
        if (!inspector.enabled || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return
        down = null

        const rect = canvas.getBoundingClientRect()
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        const feature = geo.pickFeature(raycaster)

        pin.visible = !!feature
        output.textContent = feature ? describe(feature) : ''
        if (feature) pin.position.copy(feature.intersection.point)
    })
    return inspector
}

function describe({ layer, type, properties }) {
    if (layer === 'building') {
        const height = Number(properties.render_height)
        return height ? `Building · ${Math.round(height)} m` : 'Building'
    }
    return `${LAYER_NAMES[layer] ?? layer} · ${type.replace(/_/g, ' ')}`
}

function createPin() {
    const material = new THREE.MeshLambertMaterial({ color: 0xd9412b })
    const head  = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 12), material)
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), material)
    head.position.y  = 3
    stick.position.y = 1.5
    const pin = new THREE.Group()
    pin.name = 'Pin'
    pin.add(head, stick)
    pin.traverse(object => { object.castShadow = true })
    return pin
}
