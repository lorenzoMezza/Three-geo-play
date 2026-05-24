import * as THREE from 'three'

const basic = color => new THREE.MeshBasicMaterial({ color })

/**
 * Dark "night" look, built only with the public style API.
 * Apply it to a fresh `MapStyle` so no previous customisation leaks through.
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

    style.buildingLayer.material = new THREE.MeshBasicMaterial({
        color:       0x39415a,
        opacity:     0.92,
        transparent: true,
        side:        THREE.DoubleSide,
    })
}
