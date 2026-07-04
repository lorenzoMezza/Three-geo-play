import * as THREE from 'three';
import { nextStyleStamp } from './styleStamp.js';

/**
 * Base class for all single feature types (polygon and line).
 * Holds the common properties shared by WaterType, LandCoverType,
 * LandUseType, WaterwayType, RoadType, etc.
 *
 * Every setter records a change stamp, so modifications made after
 * {@link ThreeGeoPlay#start} are re-applied to the tiles already on screen
 * during the next {@link ThreeGeoPlay#onFrameUpdate}.
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

    /** @type {number} */
    #stamp = 0;

    /**
     * @param {THREE.Material} material
     * @param {number}         Y
     * @param {number}         [defaultRenderingOrder=-1]
     * @param {boolean}        [isVisible=true]
     */
    constructor(material, Y, defaultRenderingOrder = -1, isVisible = true) {
        this.#material       = material;
        this.#Y              = Y;
        this.#renderingOrder = defaultRenderingOrder;
        this.#isVisible      = !!isVisible;
    }

    // ── change tracking ──────────────────────────────────────────────────────

    /**
     * Stamp of the latest change made to this type.
     * @type {number}
     * @readonly
     * @protected
     */
    get _stamp() { return this.#stamp; }

    /**
     * Records a change. Subclasses call this from their own setters.
     * @protected
     */
    _touch() { this.#stamp = nextStyleStamp(); }

    // ── visibility ───────────────────────────────────────────────────────────

    /**
     * Whether this feature type is rendered.
     * @type {boolean}
     */
    get isVisible()  { return this.#isVisible; }
    set isVisible(v) {
        this.#isVisible = !!v;
        this._touch();
    }

    /**
     * Sets visibility (alias for the `isVisible` setter).
     * @param {boolean} v
     */
    setVisible(v) { this.isVisible = v; }

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
        this._touch();
    }

    // ── Y ───────────────────────────────────────────────────────────────

    /**
     * Height (world units) at which this feature type is drawn.
     * @type {number}
     */
    get Y()  { return this.#Y; }
    set Y(v) {
        if (typeof v !== 'number' || isNaN(v)) {
            console.warn(`ThreeGeoPlay: Y must be a number (received: ${v})`);
            return;
        }
        this.#Y = v;
        this._touch();
    }

    // ── renderingOrder ───────────────────────────────────────────────────────

    /**
     * Three.js render order for this feature type. Values below 0 are recommended
     * so the map is drawn before the rest of the scene.
     * Note: flat map geometry is drawn with `depthTest` disabled on its material,
     * relying on this order for layering. Line types use the range
     * `[renderingOrder, renderingOrder + 1)` to stack bridges, tunnels, outlines
     * and fills, so types one unit apart never interleave.
     * @type {number}
     */
    get renderingOrder() { return this.#renderingOrder; }
    set renderingOrder(num) {
        if (typeof num !== 'number' || isNaN(num)) {
            console.warn('ThreeGeoPlay: renderingOrder must be a valid number');
            return;
        }
        if (num >= 0) {
            console.warn('ThreeGeoPlay: it is recommended to use values below 0 for the rendering order of the map parts');
        }
        this.#renderingOrder = num;
        this._touch();
    }
}
