import * as THREE from 'three';
import { LineFeatureType } from '../core/Linefeaturetype';
import { BaseLayer } from '../core/Baselayer';

/**
 * @typedef {'river'|'stream'|'tidal_channel'|'flowline'|
 *  'canal'|'drain'|'ditch'|'pressurised'} WaterwayClassName
 */

/**
 * Layer that renders waterway lines (rivers, canals, ditches, …).
 *
 * Each waterway type is a {@link LineFeatureType} with shared fill and
 * outline materials, differing only in `lineWidth`.
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.waterwayLayer.isVisible = true;
 * style.waterwayLayer.river.lineWidth = 0.12;
 *
 * @class
 * @extends BaseLayer
 */
export class WaterwayLayer extends BaseLayer {

    /** @type {LineFeatureType} */ #river;
    /** @type {LineFeatureType} */ #stream;
    /** @type {LineFeatureType} */ #tidal_channel;
    /** @type {LineFeatureType} */ #flowline;
    /** @type {LineFeatureType} */ #canal;
    /** @type {LineFeatureType} */ #drain;
    /** @type {LineFeatureType} */ #ditch;
    /** @type {LineFeatureType} */ #pressurised;

    constructor() {
        super();

        const delta = 0.2;

        // Blu-acciaio saturo, leggermente più scuro del WaterLayer poligonale
        const waterMat   = new THREE.MeshBasicMaterial({ color: 0x3A8AB8, side: THREE.BackSide });
        // Outline blu notte profondo — definisce nettamente i bordi del corso d'acqua
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1A3F60, side: THREE.BackSide });

        this.#river         = new LineFeatureType(waterMat, outlineMat, 0, 0.50 * delta, 0.04,true, -2);
        this.#stream        = new LineFeatureType(waterMat, outlineMat, 0, 0.30 * delta,  0.04,true, -2);
        this.#tidal_channel = new LineFeatureType(waterMat, outlineMat, 0, 0.40 * delta,  0.04,true, -2);
        this.#flowline      = new LineFeatureType(waterMat, outlineMat, 0, 0.20 * delta,  0.04,true, -2);
        this.#canal         = new LineFeatureType(waterMat, outlineMat, 0, 0.40 * delta,  0.04,true, -2);
        this.#drain         = new LineFeatureType(waterMat, outlineMat, 0, 0.20 * delta, 0.04,true, -2);
        this.#ditch         = new LineFeatureType(waterMat, outlineMat, 0, 0.15 * delta,  0.04,true, -2);
        this.#pressurised   = new LineFeatureType(waterMat, outlineMat, 0, 0.10 * delta,  0.04,true, -2);

        this._register('river',         this.#river);
        this._register('stream',        this.#stream);
        this._register('tidal_channel', this.#tidal_channel);
        this._register('flowline',      this.#flowline);
        this._register('canal',         this.#canal);
        this._register('drain',         this.#drain);
        this._register('ditch',         this.#ditch);
        this._register('pressurised',   this.#pressurised);
    }

    /** @type {LineFeatureType} */ get river()         { return this.#river; }
    /** @type {LineFeatureType} */ get stream()        { return this.#stream; }
    /** @type {LineFeatureType} */ get tidal_channel() { return this.#tidal_channel; }
    /** @type {LineFeatureType} */ get flowline()      { return this.#flowline; }
    /** @type {LineFeatureType} */ get canal()         { return this.#canal; }
    /** @type {LineFeatureType} */ get drain()         { return this.#drain; }
    /** @type {LineFeatureType} */ get ditch()         { return this.#ditch; }
    /** @type {LineFeatureType} */ get pressurised()   { return this.#pressurised; }

    // ── line-specific bulk helpers ───────────────────────────────────────────

    /**
     * Replaces fill and (optionally) outline material on every waterway type.
     * @param {THREE.Material} material
     * @param {THREE.Material} [outlineMaterial]
     */
    setAllMaterials(material, outlineMaterial) {
        super.setAllMaterials(material);
        if (outlineMaterial) {
            if (!(outlineMaterial instanceof THREE.Material)) {
                console.warn('ThreeGeoPlay: Invalid outlineMaterial, must be THREE.Material');
                return;
            }
            this._allTypes().forEach(t => { t.outlineMaterial = outlineMaterial; });
        }
    }

    /**
     * Sets `outlineWidth` on every waterway type.
     * @param {number} width
     */
    setOutlineWidthAll(width) { this._allTypes().forEach(t => { t.outlineWidth = width; }); }

    /**
     * Resets the per-type outline width on all waterway types.
     */
    resetOutlineWidthAll() { this._allTypes().forEach(t => t.resetOutlineWidth()); }

    /**
     * Sets `lineWidth` on every waterway type.
     * @param {number} width
     */
    setLineWidthAll(width) { this._allTypes().forEach(t => { t.lineWidth = width; }); }

  /**
     * Sets `renderingOrder` on every WaterWay type.
     * @param {number} order
     */
    setAllRenderOrder(order) {
        this._allTypes().forEach(t => {
            t.renderingOrder = order;
        });
    }
}