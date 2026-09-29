import { BaseLayer, polygonTypes } from '../core/BaseLayer.js';

/** Colour of each class. Where areas overlap, the later class in this list is drawn on top. */
const COLORS = {
    swimming_pool: 0x4DD0D8,
    river:         0x4A9FC8,
    lake:          0x3A7FBD,
    ocean:         0x2C6BA0,
    pond:          0x5B9EAA,
    dock:          0x4A7A90,
};

/**
 * Water bodies drawn as areas (oceans, lakes, wide rivers), one type per class (`layer.lake`, …).
 *
 * @example
 * style.waterLayer.ocean.material = new THREE.MeshBasicMaterial({ color: 0x1a6080 });
 */
export class WaterLayer extends BaseLayer {

    /** Class names with a type in this layer. */
    static admittedClasses = new Set(Object.keys(COLORS));

    constructor() {
        super();
        this._addTypes(polygonTypes(COLORS, -2));
    }
}
