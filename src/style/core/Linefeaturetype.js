import * as THREE from 'three';
import { BaseFeatureType } from './Basefeaturetype';

/**
 * Extends {@link BaseFeatureType} with line-specific properties:
 * `outlineMaterial`, `lineWidth`, `outlineWidth`.
 *
 * Used by `WaterwayType` (via `WaterwayLayer`) and `RoadType`
 * (via `TransportationLayer`).
 *
 * @class
 * @extends BaseFeatureType
 */
export class LineFeatureType extends BaseFeatureType {


    #isVisible = true
    /** @type {THREE.Material|null} */
    #outlineMaterial = null;

    /** @type {number} */
    #lineWidth = 0;

    /**
     * `null` means "fall back to the layer-level default" (e.g.
     * {@link GeneralConfig#outlineWidth} in `TransportationLayer`).
     * @type {number|null}
     */
    #outlineWidth = 0.03;

    #jointSegments = 8;
    /**
     * @param {THREE.Material}      material
     * @param {THREE.Material}      outlineMaterial
     * @param {number}              Y
     * @param {number}              [lineWidth=0]
     * @param {number}              [defaultRenderingOrder=-1]
     */
    constructor(material, outlineMaterial, Y, lineWidth = 0,outlineWidth,isVisible = true,renderingOrder = -1) {
        super(material, Y, renderingOrder);
        this.#outlineMaterial = outlineMaterial;
        this.#lineWidth       = lineWidth;
        this.#outlineWidth = outlineWidth;
        this.#isVisible = isVisible;
    }

    // ── outlineMaterial ──────────────────────────────────────────────────────

    /**
     * The Three.js outline (border) material for this line type.
     * Must be a {@link THREE.Material} instance.
     * @type {THREE.Material|null}
     */
    get outlineMaterial() { return this.#outlineMaterial; }
    set outlineMaterial(m) {
        if (m && !(m instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: outlineMaterial must be a THREE.Material instance');
            return;
        }
        this.#outlineMaterial = m;
    }
    /**
     * Sets master layer visibility and propagates to all road types.
     * @param {boolean} isVisible
     */
   set isVisible(isVisible)
   {
    this.#isVisible = isVisible
   }


    get isVisible() {
        return this.#isVisible;          // setter in BaseLayer propagates automatically
    }
    // ── lineWidth ────────────────────────────────────────────────────────────

    /**
     * Half-width of the rendered line geometry in world units. Must be ≥ 0.
     * @type {number}
     */
    get lineWidth() { return this.#lineWidth; }
    set lineWidth(v) {
        if (typeof v !== 'number' || isNaN(v) || v < 0) {
            console.warn(`ThreeGeoPlay: lineWidth must be a non-negative number (received: ${v})`);
            return;
        }
        this.#lineWidth = v;
    }
    get jointSegments() { return this.#jointSegments; }
    set jointSegments(num) {
        if (typeof num !== 'number' || isNaN(num)) {
            console.warn(`ThreeGeoPlay: jointSegments must be a number (received: ${num})`);
            return;
        }
        if (num < 6) {
            console.warn(`ThreeGeoPlay: jointSegments cannot be less than 6 (received: ${num}), defaulting to 6`);
            this.#jointSegments = 6;
            return;
        }
        this.#jointSegments = num;
    }

    // ── outlineWidth ─────────────────────────────────────────────────────────

    /**
     * Per-type outline width override in world units.
     * Set to `null` to fall back to the layer-level default.
     * @type {number|null}
     */
    get outlineWidth() { return this.#outlineWidth; }
    set outlineWidth(num) {
        if (num !== null && (typeof num !== 'number' || isNaN(num))) {
            console.warn(`ThreeGeoPlay: outlineWidth must be a number or null (received: ${num})`);
            return;
        }
        if (num !== null && num < 0) {
            console.warn(`ThreeGeoPlay: outlineWidth cannot be negative, defaulting to 0`);
            this.#outlineWidth = 0;
            return;
        }
        this.#outlineWidth = num;
    }

    /**
     * Clears the per-type outline width override, falling back to the layer default.
     */
    resetOutlineWidth() { this.#outlineWidth = null; }
}