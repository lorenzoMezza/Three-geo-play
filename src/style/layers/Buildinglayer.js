import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype';

/**
 * Controls the rendering of 3D building extrusions on the map.
 * Buildings are extruded polygons whose height can be driven by OSM data or
 * fixed manually via {@link BuildingLayer#height}.
 *
 * `BuildingLayer` is a single-type layer — it acts as both the layer and its
 * own feature type, so `getTypeByName` returns `this`.
 *
 * Inherits `material`, `Y`, `renderingOrder`, and `isVisible` from
 * {@link BaseFeatureType}.
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.buildingLayer.isVisible = true;
 * style.buildingLayer.height    = 0.002;
 * style.buildingLayer.material  = new THREE.MeshBasicMaterial({ color: 0xeeeecc });
 *
 * @class
 * @extends BaseFeatureType
 */
export class BuildingLayer extends BaseFeatureType {

    /** @type {number} */
    #height = 0.0015;

    /** @type {boolean} */
    #allowDetails = false;

    /**
     * @param {THREE.Material} [material] - Fill material. Defaults to a
     *   semi-transparent yellow-green.
     * @param {number}         [Y=0.03]
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
        // Buildings render on top of everything else → no negative renderingOrder
        // (renderingOrder is intentionally left as the base default -1 and is
        // overridden per-mesh in Tile.js for extruded geometry).
        super(null, Y, -1);
        this.material = this.#validateAndWrapMaterial(material);
    }

    // ── material override ────────────────────────────────────────────────────

    /**
     * The Three.js material applied to building geometry.
     * Assigning an invalid value logs a warning and is silently ignored.
     * @type {THREE.Material|null}
     */
    get material() { return super.material; }
    set material(value) {
        super.material = this.#validateAndWrapMaterial(value);
    }

    // ── building-specific properties ─────────────────────────────────────────

    /**
     * Base extrusion height multiplier applied to buildings that have no
     * `render_height` property in the tile data.
     * @type {number}
     */
    get height()       { return this.#height; }
    set height(value)  { this.#height = value; }

    /**
     * If `true`, finer building detail (e.g. roof shapes) will be rendered
     * when available in the tile data.
     * @type {boolean}
     */
    get allowDetails()      { return this.#allowDetails; }
    set allowDetails(value) { this.#allowDetails = !!value; }

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
     * Sets the Y render order and returns this instance for chaining.
     * @param {number} y
     * @returns {BuildingLayer}
     */
    setY(y)              { this.Y       = y;        return this; }

    /**
     * Sets the base extrusion height multiplier and returns this instance for chaining.
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
     * Validates a material and ensures transparent materials have `depthWrite`
     * disabled (required for correct alpha blending with the map geometry).
     * @param {THREE.Material|null} material
     * @returns {THREE.Material|null}
     * @private
     */
    #validateAndWrapMaterial(material) {
        if (!material || !(material instanceof THREE.Material)) {
            if (material !== null && material !== undefined) {
                console.warn('ThreeGeoPlay: Invalid building material — must be a valid THREE.Material');
            }
            return null;
        }
        if (material.opacity < 1) {
            material.transparent = true;
            material.depthWrite  = false;
        }
        return material;
    }
}