import * as THREE from 'three'

const basic = color => new THREE.MeshBasicMaterial({ color })

/**
 * Daytime look: the default map colours, with buildings lit by the sun of the
 * demo (they cast and receive shadows) and warm roofs.
 * @param {import('lm-three-geo-play').MapStyle} style
 */
export function applyDayTheme(style) {
    const buildings = style.buildingLayer
    // `vertexColors` adds the library's baked ambient occlusion and roof tones to the lighting.
    buildings.material  = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, vertexColors: true })
    buildings.roofColor = 0xf6ebe2
    style.shadowLayer.material.opacity = 0.32
}

/**
 * Dark "night" look, built only with the public style API.
 * Apply it to a fresh `MapStyle` so no previous customisation leaks through.
 * Buildings use an unlit material: their shading is baked by the library.
 * @param {import('lm-three-geo-play').MapStyle} style
 */
export function applyNightTheme(style) {
    style.backgroundLayer.material = basic(0x0f1117)
    style.landUseLayer.setAllMaterials(basic(0x191d27))
    style.landCoverLayer.setAllMaterials(basic(0x13211a))
    style.waterLayer.setAllMaterials(basic(0x0c2640))
    style.waterwayLayer.setAllMaterials(basic(0x0c2640), basic(0x081a2c))

    const roads = style.transportationLayer
    roads.setAllMaterials(basic(0x2c3242), basic(0x0a0c11))
    const arterial = basic(0xe0a04a)
    const main     = basic(0x9c7640)
    for (const name of ['motorway', 'trunk', 'primary']) roads[name].material = arterial
    for (const name of ['secondary', 'tertiary'])        roads[name].material = main

    // Roofs get the material colour, walls are darkened by the baked shading.
    const buildings = style.buildingLayer
    buildings.material    = new THREE.MeshBasicMaterial({ color: 0x4f5a7a, vertexColors: true })
    buildings.wallShading = 0.75
    style.shadowLayer.material.opacity = 0.45
}
