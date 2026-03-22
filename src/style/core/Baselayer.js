import * as THREE from 'three';

/**
 * Base class for all map layers that contain multiple feature types
 * (e.g. `WaterLayer`, `LandCoverLayer`, `LandUseLayer`, `WaterwayLayer`).
 *
 * Subclasses register their feature types via `_register(name, type)` in their
 * constructor. All shared layer behaviour — `getTypeByName`, `setAllMaterials`,
 * `setVisibleAll`, and the `isVisible` toggle — is provided here and does not
 * need to be re-implemented in every subclass.
 *
 * @class
 */
export class BaseLayer {

    /** @type {boolean} */
    #isVisible = true;

    /**
     * Internal registry populated by subclass constructors via {@link _register}.
     * @type {Map<string, import('./BaseFeatureType.js').BaseFeatureType>}
     */
    #typeMap = new Map();

    // ── protected registration API ───────────────────────────────────────────

    /**
     * Registers a feature type under the given OSM class name.
     * Must be called by the subclass constructor for every type it owns.
     *
     * @param {string}                                       name
     * @param {import('./BaseFeatureType.js').BaseFeatureType} type
     * @protected
     */
    _register(name, type) {
        this.#typeMap.set(name, type);
    }

    /**
     * Returns all registered feature type instances as an array.
     * @returns {import('./BaseFeatureType.js').BaseFeatureType[]}
     * @protected
     */
    _allTypes() {
        return Array.from(this.#typeMap.values());
    }

    // ── public API ───────────────────────────────────────────────────────────

    /**
     * Master visibility toggle for the entire layer.
     * Setting this to `false` hides all registered types.
     * @type {boolean}
     */
    get isVisible() { return this.#isVisible; }
    set isVisible(v) {
        this.#isVisible = !!v;
        this._allTypes().forEach(t => t.setVisible(v));
    }

    /**
     * Returns a feature type by its OSM class name, or `null` if not found.
     * @param {string} name
     * @returns {import('./BaseFeatureType.js').BaseFeatureType|null}
     */
    getTypeByName(name) { return this.#typeMap.get(name) ?? null; }

    /**
     * Replaces the fill material on every registered feature type.
     * @param {THREE.Material} material
     */
    setAllMaterials(material) {
        if (!(material instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: Invalid material, must be THREE.Material');
            return;
        }
        this._allTypes().forEach(t => { t.material = material; });
    }

    /**
     * Sets visibility on every registered feature type.
     * @param {boolean} v
     */
    setVisibleAll(v) { this._allTypes().forEach(t => t.setVisible(v)); }
}