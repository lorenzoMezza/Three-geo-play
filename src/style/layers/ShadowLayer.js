import * as THREE from 'three';
import { BaseFeatureType } from '../core/BaseFeatureType.js';

/**
 * Shadows on the ground: a transparent plane over the flat layers, drawn with a
 * `THREE.ShadowMaterial` that only darkens where a shadow falls (the flat layers
 * are unlit and cannot show shadows themselves). Drawn while
 * `renderer.shadowMap.enabled` is true. A single-type layer: it is its own type.
 */
export class ShadowLayer extends BaseFeatureType {

    /**
     * Creates a ShadowLayer with a black `ShadowMaterial` at 30 % opacity,
     * Y 0 and renderingOrder -0.001 (above every flat layer).
     */
    constructor() {
        super(
            new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 }),
            0,        // Y — the ground the buildings stand on
            -0.001,   // renderingOrder — above the other flat layers
        );
        this.receiveShadow = true;
    }

    /** Returns this layer (it has a single type). */
    getTypeByName(_name) { return this; }
}
