import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype.js';

/**
 * Controls the rendering of 3D building extrusions on the map.
 * Buildings are extruded from their real OSM height (`render_height` /
 * `render_min_height`, or `height` / `min_height`), converted to world units
 * using the map's zoom level and tile size, and multiplied by
 * {@link BuildingLayer#height}.
 *
 * Buildings are ordinary depth-tested 3D geometry: they hide and are hidden by
 * your own objects like any other mesh, cast and receive shadows, and their
 * material is used exactly as you configure it (ThreeGeoPlay never changes it).
 *
 * **Shading.** Every vertex carries a colour baked by the library — used by
 * materials created with `vertexColors: true`, multiplied by `material.color`:
 *  - {@link BuildingLayer#wallShading}: walls are lit from the south-west, so
 *    buildings read as volumes even with an unlit `MeshBasicMaterial`
 *    (lit materials are shaded by your lights instead);
 *  - {@link BuildingLayer#ambientOcclusion}: walls darken towards the ground;
 *  - {@link BuildingLayer#roofColor} and {@link BuildingLayer#colorVariation}:
 *    roof tint and a slight tone variation from roof to roof.
 *
 * **Transparency.** With a transparent material (`transparent: true`,
 * `opacity < 1`) only the surface nearest to the camera is blended (see
 * {@link BuildingLayer#depthPrepass}): no inner walls, no tangle of faces.
 *
 * `BuildingLayer` is a single-type layer — it acts as both the layer and its
 * own feature type, so `getTypeByName` returns `this`.
 *
 * Inherits `material`, `Y`, `renderingOrder`, `isVisible`, `castShadow` and
 * `receiveShadow` from {@link BaseFeatureType}. `renderingOrder` is not applied
 * to buildings: they are real 3D geometry and use the depth buffer.
 *
 * @example
 * const style = geoPlay.getMapStyle();
 * style.buildingLayer.height   = 1.5; // 50 % taller than reality
 * style.buildingLayer.material = new THREE.MeshStandardMaterial({ color: 0xeeeecc, vertexColors: true });
 * style.buildingLayer.roofColor = 0xd9a58c; // terracotta roofs
 *
 * @class
 * @extends BaseFeatureType
 */
export class BuildingLayer extends BaseFeatureType {

    /** @type {number} */
    #height = 1;

    /** @type {boolean} */
    #allowDetails = false;

    /** @type {number} */
    #wallShading = 0.6;

    /** @type {number} */
    #ambientOcclusion = 0.45;

    /** @type {THREE.Color} */
    #roofColor = new THREE.Color(0xffffff);

    /** @type {number} */
    #colorVariation = 0.08;

    /** @type {boolean} */
    #depthPrepass = true;

    /**
     * @param {THREE.Material} [material] - Fill material. Defaults to an opaque,
     *   unlit warm white using the baked shading.
     * @param {number}         [Y=0]
     */
    constructor(
        material = new THREE.MeshBasicMaterial({ color: 0xF2ECE1, vertexColors: true }),
        Y = 0.0,
    ) {
        super(null, Y, -1);
        this.material      = material;
        this.castShadow    = true;
        this.receiveShadow = true;
    }

    // ── material override ────────────────────────────────────────────────────

    /**
     * The Three.js material applied to building geometry, used as is.
     * Set `vertexColors: true` to use the baked shading, and `transparent: true`
     * for an `opacity` below 1 (as for any Three.js material).
     * Assigning an invalid value logs a warning and is ignored.
     * @type {THREE.Material|null}
     */
    get material() { return super.material; }
    set material(value) {
        if (value !== null && value !== undefined && !(value instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: Invalid building material — must be a valid THREE.Material');
            return;
        }
        if (value && value.opacity < 1 && !value.transparent) {
            console.warn('ThreeGeoPlay: the building material has opacity < 1 but transparent = false, so it is drawn opaque. Set transparent = true to blend it.');
        }
        super.material = value ?? null;
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
     * Strength of the directional shading baked into the walls, 0–1
     * (default 0.6): walls facing away from the south-west light get darker,
     * roofs stay the brightest faces. Applies to `MeshBasicMaterial`s — lit
     * materials are shaded by the scene lights instead. `0` disables it.
     * @type {number}
     */
    get wallShading()      { return this.#wallShading; }
    set wallShading(value) {
        if (!isUnit(value, 'wallShading')) return;
        this.#wallShading = value;
        this._touch();
    }

    /**
     * Darkening of the walls near the ground, 0–1 (default 0.45): a soft
     * contact shadow that anchors the buildings to the map. It fades out over
     * the first ten metres. `0` disables it.
     * @type {number}
     */
    get ambientOcclusion()      { return this.#ambientOcclusion; }
    set ambientOcclusion(value) {
        if (!isUnit(value, 'ambientOcclusion')) return;
        this.#ambientOcclusion = value;
        this._touch();
    }

    /**
     * Tint of the roofs, multiplied by the material colour (default white: roofs
     * have the material colour). Accepts any `THREE.ColorRepresentation`; the
     * getter returns a copy, so assign a new value to change it.
     * @type {THREE.Color}
     */
    get roofColor()      { return this.#roofColor.clone(); }
    set roofColor(value) {
        if (!(value?.isColor || typeof value === 'number' || typeof value === 'string')) {
            console.warn(`ThreeGeoPlay: roofColor must be a THREE.ColorRepresentation (received: ${value})`);
            return;
        }
        this.#roofColor = new THREE.Color(value);
        this._touch();
    }

    /**
     * Tone variation from roof to roof, 0–1 (default 0.08): each roof is up to
     * this much darker, so neighbouring buildings are told apart. `0` disables it.
     * @type {number}
     */
    get colorVariation()      { return this.#colorVariation; }
    set colorVariation(value) {
        if (!isUnit(value, 'colorVariation')) return;
        this.#colorVariation = value;
        this._touch();
    }

    /**
     * With a transparent material, draw the buildings' depth before their
     * colour, so only the surface nearest to the camera is blended (default
     * `true`): walls behind and between buildings stay hidden, and objects
     * behind the buildings show through a single layer of "glass".
     * Set it to `false` for plain Three.js blending of every face (e.g. with a
     * custom shader that moves vertices). Has no effect on opaque materials.
     * @type {boolean}
     */
    get depthPrepass()      { return this.#depthPrepass; }
    set depthPrepass(value) {
        this.#depthPrepass = !!value;
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
}

/** Whether `value` is a number in [0, 1]; warns otherwise. */
function isUnit(value, name) {
    if (typeof value === 'number' && value >= 0 && value <= 1) return true;
    console.warn(`ThreeGeoPlay: building ${name} must be a number between 0 and 1 (received: ${value})`);
    return false;
}
