import * as THREE from 'three';
import { BaseFeatureType } from './BaseFeatureType.js';
import { nextStyleStamp } from './styleStamp.js';

/**
 * Base class of the layers made of several feature types (land use, water,
 * roads, …). A subclass passes its types to {@link _addTypes}; each one is then
 * available as a read-only property named after its class (`layer.park`) and
 * through {@link getTypeByName}.
 */
export class BaseLayer {

    #isVisible = true;
    #stamp = 0;

    /** @type {Map<string, BaseFeatureType>} */
    #types = new Map();

    /**
     * Adds feature types, each also readable as `layer[name]`.
     * @param {Record<string, BaseFeatureType>} types
     * @protected
     */
    _addTypes(types) {
        for (const [name, type] of Object.entries(types)) {
            this.#types.set(name, type);
            Object.defineProperty(this, name, { get: () => type, enumerable: true });
        }
    }

    /**
     * Every feature type of the layer.
     * @returns {BaseFeatureType[]}
     * @protected
     */
    _allTypes() {
        return [...this.#types.values()];
    }

    /**
     * Stamp of the latest change made to this layer or any of its types.
     * @type {number}
     * @protected
     */
    get _stamp() {
        let stamp = this.#stamp;
        for (const type of this.#types.values()) stamp = Math.max(stamp, type._stamp);
        return stamp;
    }

    /**
     * Copies the settings of another layer of the same kind (used by {@link MapStyle#clone}).
     * @param {BaseLayer} source
     * @param {(material: THREE.Material|null) => THREE.Material|null} copyMaterial
     * @protected
     */
    _copyFrom(source, copyMaterial) {
        this.#isVisible = source.isVisible;
        for (const [name, type] of this.#types) {
            const other = source.getTypeByName(name);
            if (other) type._copyFrom(other, copyMaterial);
        }
        this.#stamp = nextStyleStamp();
    }

    /**
     * Master switch of the layer: when `false` nothing of it is drawn; when
     * `true` each type follows its own `isVisible` (per-type settings are kept).
     * @type {boolean}
     */
    get isVisible() { return this.#isVisible; }
    set isVisible(v) {
        this.#isVisible = !!v;
        this.#stamp = nextStyleStamp();
    }

    /** Alias of {@link isVisible}, named like `THREE.Object3D#visible`. */
    get visible()  { return this.isVisible; }
    set visible(v) { this.isVisible = v; }

    /**
     * Every feature type of the layer, by class name.
     * @type {Readonly<Record<string, BaseFeatureType>>}
     */
    get types() { return Object.freeze(Object.fromEntries(this.#types)); }

    /**
     * The feature type of a class, or `null`.
     * @param {string} name
     * @returns {BaseFeatureType|null}
     */
    getTypeByName(name) { return this.#types.get(name) ?? null; }

    /**
     * Sets the fill material of every type.
     * @param {THREE.Material} material
     */
    setAllMaterials(material) {
        if (!(material instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: Invalid material, must be THREE.Material');
            return;
        }
        for (const type of this.#types.values()) type.material = material;
    }

    /** Sets `isVisible` on every type. @param {boolean} v */
    setVisibleAll(v) { for (const type of this.#types.values()) type.isVisible = v; }

    /** Sets `receiveShadow` on every type (useful with lit materials). @param {boolean} v */
    setReceiveShadowAll(v) { for (const type of this.#types.values()) type.receiveShadow = v; }
}

/**
 * Flat polygon types with one `MeshBasicMaterial` each.
 * @param {Record<string, number>} colors - Colour of each class.
 * @param {number} renderingOrder
 * @returns {Record<string, BaseFeatureType>}
 */
export function polygonTypes(colors, renderingOrder) {
    const types = {};
    for (const [name, color] of Object.entries(colors)) {
        types[name] = new BaseFeatureType(new THREE.MeshBasicMaterial({ color }), 0, renderingOrder);
    }
    return types;
}
