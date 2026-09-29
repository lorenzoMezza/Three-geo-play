import * as THREE from 'three';
import { BaseFeatureType } from '../core/BaseFeatureType.js';

/**
 * The ground colour under every other layer: a plane covering the loaded area.
 *
 * A single-type layer: it is its own feature type (`material`, `Y`,
 * `renderingOrder`, `isVisible`, …), so `getTypeByName` returns `this`.
 */
export class BackgroundLayer extends BaseFeatureType {

    constructor() {
        super(new THREE.MeshBasicMaterial({ color: 0xD8D3A5 }), 0, -1000);
    }

    /** Returns this layer (it has a single type). */
    getTypeByName(_name) { return this; }
}
