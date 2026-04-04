import * as THREE from 'three';

/**
 * Base class for all single feature types (polygon and line).
 * Holds the common properties shared by WaterType, LandCoverType,
 * LandUseType, WaterwayType, RoadType, etc.
 *
 * @class
 */
export class BaseFeatureType {

    /** @type {boolean} */
    #isVisible = true;

    /** @type {THREE.Material|null} */
    #material = null;

    /** @type {number} */
    #Y = 0;

    /** @type {number} */
    #renderingOrder = -1;

    /**
     * @param {THREE.Material} material
     * @param {number}         Y
     * @param {number}         [defaultRenderingOrder=-1]
     */
    constructor(material, Y, defaultRenderingOrder = -1) {
        this.#material       = material;
        this.#Y         = Y;
        this.#renderingOrder = defaultRenderingOrder;
    }

    // ── visibility ───────────────────────────────────────────────────────────

    /**
     * Whether this feature type is rendered.
     * @type {boolean}
     */
    get isVisible()  { return this.#isVisible; }
    set isVisible(v) { this.#isVisible = !!v; }

    /**
     * Sets visibility (alias for the `isVisible` setter).
     * @param {boolean} v
     */
    setVisible(v) { this.#isVisible = !!v; }

    // ── material ─────────────────────────────────────────────────────────────

    /**
     * The Three.js fill material for this feature type.
     * Must be a {@link THREE.Material} instance.
     * @type {THREE.Material|null}
     */
    get material() { return this.#material; }
    set material(m) {
        if (m && !(m instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: material must be a THREE.Material instance');
            return;
        }
        this.#material = m;
    }

    // ── Y ───────────────────────────────────────────────────────────────

    /**
     * Y-axis render order offset for depth sorting.
     * @type {number}
     */
    get Y()  { return this.#Y; }
    set Y(v) {
        if (typeof v !== 'number' || isNaN(v)) {
            console.warn(`ThreeGeoPlay: Y must be a number (received: ${v})`);
            return;
        }
        this.#Y = v;
    }

    // ── renderingOrder ───────────────────────────────────────────────────────

    /**
     * Three.js render order for this feature type. Must be < 0.
     * @type {number}
     */
    get renderingOrder() { return this.#renderingOrder; }
    set renderingOrder(num) {
        if (typeof num !== 'number' || isNaN(num)) {
            console.warn('ThreeGeoPlay: renderingOrder must be a valid number');
            return;
        }
        if (num >= 0) {
            console.warn('ThreeGeoPlay: it is raccomanded to use values under 0 for the rendering order of the map parts');

        }
        this.#renderingOrder = num;
    }
}