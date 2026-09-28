import * as THREE from 'three';

const basic = color => new THREE.MeshBasicMaterial({ color });

/**
 * Night look: dark ground, glowing arterial roads, deep water and unlit
 * buildings shaded by the library. Built only with the public style API.
 * @param {import('./MapStyle.js').MapStyle} style
 * @private
 */
export function applyDarkPreset(style) {
    style.backgroundLayer.material = basic(0x10131a);

    style.landUseLayer.setAllMaterials(basic(0x171b24));
    style.landUseLayer.industrial.material = basic(0x1b1c22);

    const cover = style.landCoverLayer;
    cover.setAllMaterials(basic(0x122019));
    const woods = basic(0x0f1f16);
    const parks = basic(0x14261b);
    const sand  = basic(0x2a2618);
    for (const name of ['wood', 'forest']) cover[name].material = woods;
    for (const name of ['park', 'grass', 'garden', 'meadow']) cover[name].material = parks;
    for (const name of ['sand', 'beach', 'dune']) cover[name].material = sand;

    style.waterLayer.setAllMaterials(basic(0x0b2238));
    style.waterwayLayer.setAllMaterials(basic(0x0b2238), basic(0x071729));

    const roads = style.transportationLayer;
    roads.setAllMaterials(basic(0x2b3140), basic(0x0b0d12));
    const arterial = basic(0xe0a04a);
    const main     = basic(0x9c7640);
    const minor    = basic(0x252a36);
    for (const name of ['motorway', 'trunk', 'primary']) roads[name].material = arterial;
    for (const name of ['secondary', 'tertiary']) roads[name].material = main;
    for (const name of ['path', 'pedestrian', 'track']) roads[name].material = minor;
    roads.rail.material = basic(0x3a3f4b);

    // Roofs keep the material colour, walls are darkened by the baked shading.
    const buildings = style.buildingLayer;
    buildings.material    = new THREE.MeshBasicMaterial({ color: 0x4f5a7a, vertexColors: true });
    buildings.wallShading = 0.75;

    style.shadowLayer.material = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.45 });
}
