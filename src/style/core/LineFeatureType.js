import * as THREE from 'three';
import { BaseFeatureType } from './BaseFeatureType.js';

/**
 * A line type (road, waterway): adds the outline material, the widths (in
 * metres or relative to a zoom-18 tile) and the round cap resolution.
 */
export class LineFeatureType extends BaseFeatureType {

    /** @type {THREE.Material|null} */
    #outlineMaterial = null;

    /** @type {number} */
    #lineWidth = 0;

    /** @type {number} */
    #outlineWidth = 0;

    /** @type {number} Value restored by {@link resetOutlineWidth}. */
    #defaultOutlineWidth = 0;

    /** @type {number} */
    #jointSegments = 8;

    /** @type {number|null} */
    #lineWidthMeters = null;

    /** @type {number|null} */
    #outlineWidthMeters = null;

    /**
     * @param {THREE.Material}      material
     * @param {THREE.Material}      outlineMaterial
     * @param {number}              Y
     * @param {number}              [lineWidth=0]
     * @param {number}              [outlineWidth=0]
     * @param {boolean}             [isVisible=true]
     * @param {number}              [renderingOrder=-1]
     */
    constructor(material, outlineMaterial, Y, lineWidth = 0, outlineWidth = 0, isVisible = true, renderingOrder = -1) {
        super(material, Y, renderingOrder, isVisible);
        this.#outlineMaterial     = outlineMaterial;
        this.#lineWidth           = lineWidth;
        this.#outlineWidth        = outlineWidth;
        this.#defaultOutlineWidth = outlineWidth;
    }

    /** @protected */
    _copyFrom(source, copyMaterial) {
        super._copyFrom(source, copyMaterial);
        this.#outlineMaterial     = copyMaterial(source.outlineMaterial);
        this.#lineWidth           = source.lineWidth;
        this.#outlineWidth        = source.outlineWidth;
        this.#jointSegments       = source.jointSegments;
        this.#lineWidthMeters     = source.lineWidthMeters;
        this.#outlineWidthMeters  = source.outlineWidthMeters;
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
        this._touch();
    }

    // ── lineWidth ────────────────────────────────────────────────────────────

    /**
     * Full width of the rendered line, relative to one tile at zoom 18
     * (so roads keep the same real-world width at every zoom level; about
     * 150 m × cos(latitude) — use {@link lineWidthMeters} to give metres).
     * Must be ≥ 0.
     * @type {number}
     */
    get lineWidth() { return this.#lineWidth; }
    set lineWidth(v) {
        if (typeof v !== 'number' || isNaN(v) || v < 0) {
            console.warn(`ThreeGeoPlay: lineWidth must be a non-negative number (received: ${v})`);
            return;
        }
        this.#lineWidth = v;
        this._touch();
    }

    /**
     * Full width of the line in metres, e.g. `12` for a 12 m wide road. When
     * set (not `null`) it replaces {@link lineWidth}. Default `null`.
     * @type {number|null}
     */
    get lineWidthMeters() { return this.#lineWidthMeters; }
    set lineWidthMeters(v) {
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
            console.warn(`ThreeGeoPlay: lineWidthMeters must be a non-negative number or null (received: ${v})`);
            return;
        }
        this.#lineWidthMeters = v;
        this._touch();
    }

    /**
     * Extra outline width in metres (added around the line). When set (not
     * `null`) it replaces {@link outlineWidth}. Default `null`.
     * @type {number|null}
     */
    get outlineWidthMeters() { return this.#outlineWidthMeters; }
    set outlineWidthMeters(v) {
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
            console.warn(`ThreeGeoPlay: outlineWidthMeters must be a non-negative number or null (received: ${v})`);
            return;
        }
        this.#outlineWidthMeters = v;
        this._touch();
    }

    // ── jointSegments ────────────────────────────────────────────────────────

    /**
     * Number of points used to round line caps and joints. Minimum 6.
     * @type {number}
     */
    get jointSegments() { return this.#jointSegments; }
    set jointSegments(num) {
        if (typeof num !== 'number' || isNaN(num)) {
            console.warn(`ThreeGeoPlay: jointSegments must be a number (received: ${num})`);
            return;
        }
        if (num < 6) {
            console.warn(`ThreeGeoPlay: jointSegments cannot be less than 6 (received: ${num}), defaulting to 6`);
            num = 6;
        }
        this.#jointSegments = Math.round(num);
        this._touch();
    }

    // ── outlineWidth ─────────────────────────────────────────────────────────

    /**
     * Extra width added around the line and drawn with `outlineMaterial`
     * (same units as {@link lineWidth}). `0` disables the outline.
     * Assigning `null` restores the default value.
     * @type {number}
     */
    get outlineWidth() { return this.#outlineWidth; }
    set outlineWidth(num) {
        if (num === null) {
            this.resetOutlineWidth();
            return;
        }
        if (typeof num !== 'number' || isNaN(num)) {
            console.warn(`ThreeGeoPlay: outlineWidth must be a number or null (received: ${num})`);
            return;
        }
        if (num < 0) {
            console.warn('ThreeGeoPlay: outlineWidth cannot be negative, defaulting to 0');
            num = 0;
        }
        this.#outlineWidth = num;
        this._touch();
    }

    /**
     * Restores the outline width this type was created with.
     */
    resetOutlineWidth() {
        this.#outlineWidth = this.#defaultOutlineWidth;
        this._touch();
    }
}
