import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype.js';

/**
 * Controls the rendering of 3D building extrusions on the map.
 * Buildings are extruded from their real OSM height (`render_height` /
 * `render_min_height`, or `height` / `min_height`), converted to world units
 * using the map's zoom level and tile size, and multiplied by
 * {@link BuildingLayer#height}.
 *
 * `BuildingLayer` is a single-type layer — it acts as both the layer and its
 * own feature type, so `getTypeByName` returns `this`.
 *
 * Inherits `material`, `Y`, `renderingOrder`, and `isVisible` from
 * {@link BaseFeatureType}. `renderingOrder` is not applied to buildings:
 * they are real 3D geometry and use the depth buffer.
 *
 * @example
 * const style = geoPlay.getMapStyle();
 * style.buildingLayer.isVisible = true;
 * style.buildingLayer.height    = 1.5; // 50 % taller than reality
 * style.buildingLayer.material  = new THREE.MeshStandardMaterial({ color: 0xeeeecc });
 *
 * @class
 * @extends BaseFeatureType
 */
export class BuildingLayer extends BaseFeatureType {

    /** @type {number} */
    #height = 1;

    /** @type {boolean} */
    #allowDetails = false;

    /**
     * @param {THREE.Material} [material] - Fill material. Defaults to a
     *   semi-transparent yellow-green.
     * @param {number}         [Y=0]
     */
    constructor(
        material = new THREE.MeshBasicMaterial({
            color:       0xF0F4C3,
            opacity:     0.85,
            transparent: true,
            side:        THREE.DoubleSide,
        }),
        Y = 0.0,
    ) {
        super(null, Y, -1);
        this.material = material;
    }

    // ── material override ────────────────────────────────────────────────────

    /**
     * The Three.js material applied to building geometry.
     * Materials with `opacity < 1` are made transparent with `depthWrite`
     * disabled. Assigning an invalid value logs a warning and is ignored.
     * @type {THREE.Material|null}
     */
    get material() { return super.material; }
    set material(value) {
        if (value !== null && value !== undefined && !(value instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: Invalid building material — must be a valid THREE.Material');
            return;
        }
        super.material = this.#prepareMaterial(value ?? null);
    }

    // ── building-specific properties ─────────────────────────────────────────

    /**
     * Vertical exaggeration applied to the real building heights.
     * `1` (default) renders buildings at true scale relative to the map,
     * `2` twice as tall, `0` flat footprints. Must be ≥ 0.
     * @type {number}
     */
    get height()       { return this.#height; }
    set height(value)  {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            console.warn(`ThreeGeoPlay: building height must be a non-negative number (received: ${value})`);
            return;
        }
        this.#height = value;
        this._touch();
    }

    /**
     * Reserved for finer building detail (e.g. roof shapes). Currently has no effect.
     * @type {boolean}
     */
    get allowDetails()      { return this.#allowDetails; }
    set allowDetails(value) {
        this.#allowDetails = !!value;
        this._touch();
    }

    // ── single-type layer contract ────────────────────────────────────────────

    /**
     * Returns this instance regardless of name.
     * `BuildingLayer` has a single type (itself).
     * @param {string} _name - Unused.
     * @returns {BuildingLayer} This instance.
     */
    getTypeByName(_name) { return this; }

    // ── fluent helpers ────────────────────────────────────────────────────────

    /**
     * Sets the material and returns this instance for chaining.
     * @param {THREE.Material} material
     * @returns {BuildingLayer}
     */
    setMaterial(material)     { this.material     = material; return this; }

    /**
     * Sets the base height (Y) and returns this instance for chaining.
     * @param {number} y
     * @returns {BuildingLayer}
     */
    setY(y)                   { this.Y            = y;        return this; }

    /**
     * Sets the height exaggeration factor and returns this instance for chaining.
     * @param {number} h
     * @returns {BuildingLayer}
     */
    setHeight(h)              { this.height       = h;        return this; }

    /**
     * Enables or disables detail rendering and returns this instance for chaining.
     * @param {boolean} val
     * @returns {BuildingLayer}
     */
    setAllowDetails(val)      { this.allowDetails = val;      return this; }

    // ── private ───────────────────────────────────────────────────────────────

    /**
     * Ensures semi-transparent materials have `depthWrite` disabled
     * (required for correct alpha blending with the map geometry).
     * @param {THREE.Material|null} material
     * @returns {THREE.Material|null}
     * @private
     */
    #prepareMaterial(material) {
        if (material && material.opacity < 1) {
            material.transparent = true;
            material.depthWrite  = false;
        }
        return material;
    }
}
