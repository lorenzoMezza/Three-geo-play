import * as THREE from 'three';
import { BaseFeatureType } from '../core/BaseFeatureType.js';

/**
 * Style of the extruded buildings. Heights come from OSM (`render_height` /
 * `render_min_height`, or `height` / `min_height`) and are multiplied by
 * {@link height}. Every vertex carries a baked colour (`wallShading`,
 * `ambientOcclusion`, `roofColor`, `colorVariation`) read by `vertexColors`
 * materials; `featureStyle` may also return `color`, `height` and `minHeight`.
 *
 * A single-type layer: it is its own feature type. `renderingOrder` does not
 * apply, buildings are depth tested.
 */
export class BuildingLayer extends BaseFeatureType {

    /** @type {number} */
    #height = 1;

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

    /** Opaque, unlit warm white buildings using the baked shading, casting and receiving shadows. */
    constructor() {
        super(new THREE.MeshBasicMaterial({ color: 0xF2ECE1, vertexColors: true }), 0, -1);
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

    /** @protected */
    _copyFrom(source, copyMaterial) {
        super._copyFrom(source, copyMaterial);
        this.#height           = source.height;
        this.#wallShading      = source.wallShading;
        this.#ambientOcclusion = source.ambientOcclusion;
        this.#roofColor        = source.roofColor;
        this.#colorVariation   = source.colorVariation;
        this.#depthPrepass     = source.depthPrepass;
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
     * With a transparent material, blend each pixel once, with the surface
     * nearest to the camera (default `true`): walls behind and between
     * buildings stay hidden, and objects behind the buildings show through a
     * single layer of "glass". The depth is drawn first with the material
     * itself (colour writes off, so it matches the colour pass exactly — also
     * with custom shaders), and stencil bit `0x80` stops faces that coincide in
     * the tile data from being blended twice. That needs a stencil buffer:
     * `new THREE.WebGLRenderer({ stencil: true })`.
     * Set it to `false` for plain Three.js blending of every face.
     * Has no effect on opaque materials.
     * @type {boolean}
     */
    get depthPrepass()      { return this.#depthPrepass; }
    set depthPrepass(value) {
        this.#depthPrepass = !!value;
        this._touch();
    }

    /** @deprecated Has no effect (kept so that code written for 1.x keeps working). */
    get allowDetails() { return false; }
    set allowDetails(_value) {}

    // ── single-type layer contract ────────────────────────────────────────────

    /** Returns this layer (it has a single type). */
    getTypeByName(_name) { return this; }

    // Chainable setters: `buildingLayer.setMaterial(m).setHeight(2)`.
    setMaterial(material) { this.material = material; return this; }
    setY(y)               { this.Y        = y;        return this; }
    setHeight(h)          { this.height   = h;        return this; }

    /** @deprecated Has no effect. */
    setAllowDetails(_value) { return this; }
}

/** Whether `value` is a number in [0, 1]; warns otherwise. */
function isUnit(value, name) {
    if (typeof value === 'number' && value >= 0 && value <= 1) return true;
    console.warn(`ThreeGeoPlay: building ${name} must be a number between 0 and 1 (received: ${value})`);
    return false;
}
