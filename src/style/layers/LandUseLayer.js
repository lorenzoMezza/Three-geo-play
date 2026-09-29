import { BaseLayer, polygonTypes } from '../core/BaseLayer.js';

/** Colour of each class. Where areas overlap, the later class in this list is drawn on top. */
const COLORS = {
    // agricultural and protected land
    farmland:          0xC8A85A,
    nature_reserve:    0x5A8F50,
    protected_area:    0x6AAF60,
    // residential
    suburb:            0xE8D8C0,
    residential:       0xE0CEB0,
    quarter:           0xD8C8A8,
    neighbourhood:     0xD0C0A0,
    // industry, commerce and transport
    industrial:        0xB8A8B8,
    commercial:        0xD4906A,
    retail:            0xC87850,
    railway:           0xA89888,
    parking:           0xA8B0B8,
    garages:           0xB8B0A8,
    dam:               0x909888,
    // sport and leisure
    pitch:             0x5A9E55,
    playground:        0xD4B840,
    recreation_ground: 0x80B870,
    track:             0xC87840,
    stadium:           0xB86830,
    zoo:               0x70A860,
    theme_park:        0xC860A0,
    // education
    university:        0xD4C060,
    school:            0x80A8C8,
    college:           0x9080C0,
    kindergarten:      0xE080A0,
    library:           0x8870B8,
    // services
    hospital:          0xD06868,
    bus_station:       0x5898A8,
    military:          0x788858,
    // other
    cemetery:          0x708868,
    religious:         0x9878B8,
    quarry:            0x988878,
    attraction:        0xD4A030,
};

/**
 * How land is used (residential, industrial, school, …), one type per class (`layer.residential`, …).
 *
 * @example
 * style.landUseLayer.residential.material = new THREE.MeshBasicMaterial({ color: 0xe8f4e8 });
 * style.landUseLayer.industrial.isVisible = false;
 */
export class LandUseLayer extends BaseLayer {

    /** Class names with a type in this layer. */
    static admittedClasses = new Set(Object.keys(COLORS));

    constructor() {
        super();
        this._addTypes(polygonTypes(COLORS, -4));
    }
}
