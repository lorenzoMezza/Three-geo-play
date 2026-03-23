import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype';
import { BaseLayer } from '../core/Baselayer';

/**
 * @private
 * A single water body type (ocean, lake, river, …).
 * Inherits all properties from {@link BaseFeatureType}.
 * renderingOrder defaults to -2 for all water polygons.
 */
class WaterType extends BaseFeatureType {
    /**
     * @param {number} color  - Hex color for the MeshBasicMaterial.
     * @param {number} Y - Y-axis render offset.
     */
    constructor(color, Y) {
        super(
            new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
            Y,
            -2  // renderingOrder
        );
    }
}

/**
 * @typedef {'swimming_pool'|'river'|'lake'|'ocean'|'pond'|'dock'} WaterClassName
 */

/**
 * Layer that renders water body polygons (lakes, oceans, rivers, ponds, docks, …).
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.waterLayer.isVisible = true;
 * style.waterLayer.ocean.material = new THREE.MeshBasicMaterial({ color: 0x1a6080 });
 *
 * @class
 * @extends BaseLayer
 */
export class WaterLayer extends BaseLayer {

    /** @type {WaterType} */ #swimming_pool;
    /** @type {WaterType} */ #river;
    /** @type {WaterType} */ #lake;
    /** @type {WaterType} */ #ocean;
    /** @type {WaterType} */ #pond;
    /** @type {WaterType} */ #dock;

    constructor() {
        super();

        // Swimming pool — turchese brillante, clorato
        this.#swimming_pool = new WaterType(0x4DD0D8, 0.00010);
        // River — blu corrente, vivace e saturo
        this.#river         = new WaterType(0x4A9FC8, 0.00012);
        // Lake — blu-acciaio calmo, più scuro del fiume
        this.#lake          = new WaterType(0x3A7FBD, 0.00014);
        // Ocean — blu marino profondo, il più scuro
        this.#ocean         = new WaterType(0x2C6BA0, 0.00010);
        // Pond — verde-acqua desaturato, acque basse vegetate
        this.#pond          = new WaterType(0x5B9EAA, 0.00011);
        // Dock — grigio-blu porto / darsena, wet & dry dock
        this.#dock          = new WaterType(0x4A7A90, 0.00013);

        this._register('swimming_pool', this.#swimming_pool);
        this._register('river',         this.#river);
        this._register('lake',          this.#lake);
        this._register('ocean',         this.#ocean);
        this._register('pond',          this.#pond);
        this._register('dock',          this.#dock);
    }

    /** @type {WaterType} */ get swimming_pool() { return this.#swimming_pool; }
    /** @type {WaterType} */ get river()         { return this.#river; }
    /** @type {WaterType} */ get lake()          { return this.#lake; }
    /** @type {WaterType} */ get ocean()         { return this.#ocean; }
    /** @type {WaterType} */ get pond()          { return this.#pond; }
    /** @type {WaterType} */ get dock()          { return this.#dock; }

    /**
     * Set of all admitted OSM water class names.
     * @type {Set<WaterClassName>}
     */
    static admittedClasses = new Set([
        'swimming_pool', 'river', 'lake', 'ocean', 'pond', 'dock',
    ]);
}