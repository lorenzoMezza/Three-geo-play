import * as THREE from 'three';
import { nextStyleStamp } from './styleStamp.js';

/**
 * Settings of one feature type (a land use class, a road class, …): material,
 * visibility, height, render order, shadows and `featureStyle`. Every setter
 * records a change stamp, so changes reach the tiles on screen at the next
 * {@link ThreeGeoPlay#onFrameUpdate}.
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

    /** @type {boolean} */
    #castShadow = false;

    /** @type {boolean} */
    #receiveShadow = false;

    /** @type {Function|null} */
    #featureStyle = null;

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
     * Flat map layers lie on the same plane: they are drawn without writing depth
     * (only during their own draw — the material itself is not modified) and are
     * stacked by this order. They are still depth tested, so buildings and your
     * objects in front of them hide them. Line types use the range
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

    /**
     * Copies the settings of another type of the same kind (used by
     * {@link MapStyle#clone}).
     * @param {BaseFeatureType} source
     * @param {(material: THREE.Material|null) => THREE.Material|null} copyMaterial
     * @protected
     */
    _copyFrom(source, copyMaterial) {
        this.#material       = copyMaterial(source.material);
        this.#Y              = source.Y;
        this.#renderingOrder = source.renderingOrder;
        this.#isVisible      = source.isVisible;
        this.#castShadow     = source.castShadow;
        this.#receiveShadow  = source.receiveShadow;
        this.#featureStyle   = source.featureStyle;
        this._touch();
    }

    // ── Three.js-style aliases ──────────────────────────────────────────────

    /**
     * Alias of {@link isVisible}, named like `THREE.Object3D#visible`.
     * @type {boolean}
     */
    get visible()  { return this.isVisible; }
    set visible(v) { this.isVisible = v; }

    /**
     * Alias of {@link renderingOrder}, named like `THREE.Object3D#renderOrder`.
     * @type {number}
     */
    get renderOrder()    { return this.renderingOrder; }
    set renderOrder(num) { this.renderingOrder = num; }

    // ── per-feature styling ──────────────────────────────────────────────────

    /**
     * Data-driven styling: a function called for every feature of this type in
     * the tiles, returning overrides — or nothing to keep the type's settings:
     *  - `visible: false` skips the feature;
     *  - `material` (and, for lines, `outlineMaterial`) draws it with another material;
     *  - buildings also accept `color`, `height` and `minHeight` (see {@link BuildingLayer}).
     *
     * It receives `{ id, key, properties, sourceLayer, type }` (the vector tile
     * feature). Assign it again — or call {@link MapStyle#refresh} — when what
     * it returns changes, to apply it to the tiles on screen. A function that
     * throws is reported once and the features keep their default style.
     *
     * @type {((feature: { id: number, key: string, properties: Record<string, unknown>, sourceLayer: string, type: string }) => Object | null | undefined) | null}
     *
     * @example
     * // Highlight one road, hide footpaths without a name
     * roads.primary.featureStyle = ({ key }) => (key === selectedKey ? { material: highlight } : null);
     * roads.path.featureStyle    = ({ properties }) => (properties.name ? null : { visible: false });
     */
    get featureStyle()      { return this.#featureStyle; }
    set featureStyle(value) {
        if (value !== null && value !== undefined && typeof value !== 'function') {
            console.warn('ThreeGeoPlay: featureStyle must be a function or null');
            return;
        }
        this.#featureStyle = value ?? null;
        this._touch();
    }

    // ── shadows ──────────────────────────────────────────────────────────────

    /**
     * Whether this type casts shadows (Three.js `castShadow`). Shadows are only
     * rendered when `renderer.shadowMap.enabled` is true and a light casts them.
     * @type {boolean}
     */
    get castShadow() { return this.#castShadow; }
    set castShadow(v) {
        this.#castShadow = !!v;
        this._touch();
    }

    /**
     * Whether this type receives shadows (Three.js `receiveShadow`). Only lit
     * materials (`MeshLambertMaterial`, `MeshStandardMaterial`, …) show them; with
     * the default unlit materials, ground shadows are drawn by
     * {@link MapStyle#shadowLayer}.
     * @type {boolean}
     */
    get receiveShadow() { return this.#receiveShadow; }
    set receiveShadow(v) {
        this.#receiveShadow = !!v;
        this._touch();
    }
}
