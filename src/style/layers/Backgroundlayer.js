import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype';

/**
 * The background (base-fill) layer rendered beneath all other layers.
 * It is a single-type layer — it acts as both the layer and its own type,
 * so `getTypeByName` returns `this`.
 *
 * Inherits `material`, `Y`, `renderingOrder`, and `isVisible`
 * from {@link BaseFeatureType}.
 *
 * @class
 * @extends BaseFeatureType
 */
export class BackgroundLayer extends BaseFeatureType {

    /**
     * Creates a BackgroundLayer with default sand-beige material,
     * Y -0.1, and renderingOrder -5.
     */
    constructor() {
        super(
            new THREE.MeshBasicMaterial({ color: 0xD8D3A5, side: THREE.FrontSide }),
            -0.01,   // Y  — rendered just below everything else
            -1000      // renderingOrder — lowest of all layers
        );
    }

    /**
     * Returns this instance regardless of name.
     * BackgroundLayer has a single type (itself).
     * @param {string} _name - Unused.
     * @returns {BackgroundLayer} This instance.
     */
    getTypeByName(_name) { return this; }
}