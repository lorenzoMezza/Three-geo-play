import { BaseLayer, polygonTypes } from '../core/BaseLayer.js';

/** Colour of each class and subclass. Where areas overlap, the later one in this list is drawn on top. */
const COLORS = {
    // OpenMapTiles classes
    sand:              0xD4B483,
    park:              0x78B05A,
    grass:             0x8DB56A,
    wood:              0x3D7038,
    wetland:           0x6B8F5E,
    rock:              0xA89880,
    farmland:          0xC8A85A,
    ice:               0xDDEEF5,
    // subclasses (take precedence over the class)
    allotments:        0xA8C878,
    bare_rock:         0xB0A090,
    beach:             0xE8D0A0,
    bog:               0x7A8C60,
    dune:              0xD8C070,
    scrub:             0x90A860,
    shrubbery:         0x6A9050,
    farm:              0xC0A860,
    fell:              0xB8C090,
    flowerbed:         0xA0C870,
    forest:            0x4A7840,
    garden:            0x88C068,
    glacier:           0xD0E8F0,
    grassland:         0x98C070,
    golf_course:       0x60B040,
    heath:             0xB09880,
    mangrove:          0x508858,
    marsh:             0x789870,
    meadow:            0xA8C858,
    orchard:           0x88B850,
    plant_nursery:     0x98C878,
    recreation_ground: 0x80B870,
    reedbed:           0x7A9060,
    saltern:           0xD8D0B8,
    saltmarsh:         0x8A9E78,
    scree:             0xB8A898,
    swamp:             0x608858,
    tidalflat:         0xC0B898,
    tundra:            0xA8B888,
    village_green:     0x90C870,
    vineyard:          0x98A858,
    wet_meadow:        0x88B878,
};

/**
 * Natural land cover (grass, wood, sand, …), one type per class (`layer.wood`, …).
 * OpenMapTiles `subclass` values (e.g. `park`, `forest`, `beach`) take precedence over `class`.
 *
 * @example
 * style.landCoverLayer.wood.material = new THREE.MeshBasicMaterial({ color: 0x2d6e29 });
 */
export class LandCoverLayer extends BaseLayer {

    /** Class and subclass names with a type in this layer. */
    static admittedClasses = new Set(Object.keys(COLORS));

    constructor() {
        super();
        this._addTypes(polygonTypes(COLORS, -3));
    }
}
