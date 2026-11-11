import * as THREE from 'three'

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
    return style
}
