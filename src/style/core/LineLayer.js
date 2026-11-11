import * as THREE from 'three';
import { BaseLayer } from './BaseLayer.js';
import { LineFeatureType } from './LineFeatureType.js';
import { nextStyleStamp } from './styleStamp.js';

/**
 * A layer of line types (roads, waterways): adds the setters that change a
 * line property on every type at once.
 */
export class LineLayer extends BaseLayer {

    #raisedOutlines = true;
    #stamp = 0;

    /**
     * Whether the outlines of bridges (lines above level 0) are drawn above the
     * lines below them (default `true`), like the casing of a road on a printed map.
     * `false` draws every outline under every fill of level 0 and up: a bridge still
     * passes over the road below, without its edges, and where it joins a road at an
     * angle its casing never cuts into that road's surface.
     * @type {boolean}
     */
    get raisedOutlines() { return this.#raisedOutlines; }
    set raisedOutlines(value) {
        this.#raisedOutlines = !!value;
        this.#stamp = nextStyleStamp();
    }

    /** @protected */
    get _stamp() { return Math.max(super._stamp, this.#stamp); }

    /** @protected */
    _copyFrom(source, copyMaterial) {
        super._copyFrom(source, copyMaterial);
        this.#raisedOutlines = source.raisedOutlines;
    }

    /**
     * Sets the fill and, optionally, the outline material of every type.
     * Pass `null` as `material` to change only the outlines.
     * @param {THREE.Material|null} material
     * @param {THREE.Material} [outlineMaterial]
     */
    setAllMaterials(material, outlineMaterial) {
        if (material !== null && material !== undefined) super.setAllMaterials(material);
        if (!outlineMaterial) return;
        if (!(outlineMaterial instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: Invalid outlineMaterial, must be THREE.Material');
            return;
        }
        for (const type of this._allTypes()) type.outlineMaterial = outlineMaterial;
    }

    /** Sets `lineWidth` on every type. @param {number} width */
    setLineWidthAll(width) { for (const type of this._allTypes()) type.lineWidth = width; }

    /** Sets `outlineWidth` on every type. @param {number} width */
    setOutlineWidthAll(width) { for (const type of this._allTypes()) type.outlineWidth = width; }

    /** Restores the default outline width of every type. */
    resetOutlineWidthAll() { for (const type of this._allTypes()) type.resetOutlineWidth(); }

    /** Sets `jointSegments` (roundness of caps and joints) on every type. @param {number} segments */
    setJointSegmentsAll(segments) { for (const type of this._allTypes()) type.jointSegments = segments; }

    /** Sets `renderingOrder` on every type. @param {number} order */
    setAllRenderOrder(order) { for (const type of this._allTypes()) type.renderingOrder = order; }
}

/**
 * Line types sharing one `MeshBasicMaterial` per fill colour and one outline material.
 * @param {Record<string, [color: number, lineWidth: number, visible: boolean]>} table
 * @param {{ outlineColor: number, outlineWidth: number, renderingOrder: number }} options
 * @returns {Record<string, LineFeatureType>}
 */
export function lineTypes(table, { outlineColor, outlineWidth, renderingOrder }) {
    const fills = new Map();
    for (const [color] of Object.values(table)) {
        if (!fills.has(color)) fills.set(color, new THREE.MeshBasicMaterial({ color }));
    }
    const outline = new THREE.MeshBasicMaterial({ color: outlineColor });
    const types = {};
    for (const [name, [color, lineWidth, visible]] of Object.entries(table)) {
        types[name] = new LineFeatureType(fills.get(color), outline, 0, lineWidth, outlineWidth, visible, renderingOrder);
    }
    return types;
}
