import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype.js';

/**
 * Shadows cast on the ground by the buildings and by your own objects.
 *
 * The flat map layers use unlit materials by default, which cannot show
 * shadows: this layer is a transparent plane laid over them, drawn with a
 * `THREE.ShadowMaterial` that only darkens where a shadow falls — the map keeps
 * its exact colours everywhere else. It is depth tested, so it never covers
 * buildings or objects.
 *
 * It is drawn only while `renderer.shadowMap.enabled` is true; you also need a
 * light with `castShadow = true` (e.g. a `DirectionalLight` whose shadow camera
 * covers the view). If you give the flat layers lit materials with
 * `receiveShadow = true` instead, hide this layer to avoid darkening twice.
 *
 * It is a single-type layer — it acts as both the layer and its own type, so
 * `getTypeByName` returns `this`.
 *
 * @example
 * renderer.shadowMap.enabled = true;
 * sun.castShadow = true;
 * geoPlay.getMapStyle().shadowLayer.material.opacity = 0.4; // darker shadows
 *
 * @class
 * @extends BaseFeatureType
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

    /**
     * Returns this instance regardless of name.
     * ShadowLayer has a single type (itself).
     * @param {string} _name - Unused.
     * @returns {ShadowLayer} This instance.
     */
    getTypeByName(_name) { return this; }
}
