import * as THREE from 'three';
import { BaseFeatureType } from './BaseFeatureType.js';

/**
 * A railway type: a raised bed (`material`, an extrusion of the track widened to
 * {@link bedWidthMeters}) with two rails on top (`railMaterial`, half a gauge on
 * each side of the track). Bed and rails are drawn like buildings — depth tested,
 * with the wall shading and ambient occlusion baked in, and with the depth prepass
 * of transparent materials — so a bed can share the building material.
 *
 * Levels (OpenMapTiles `brunnel` / `layer`): a road above the track (a bridge over
 * it) hides the track where it crosses; a road at the same level (a level crossing)
 * leaves the rails, flush with the road, without the bed; a track above a road
 * (a railway bridge) is drawn over it. Tracks in tunnels are not drawn.
 */
export class RailFeatureType extends BaseFeatureType {

    /** @type {THREE.Material|null} */
    #railMaterial;

    #bed;
    #rails;
    #bedWidthMeters    = 3.4;
    #bedHeightMeters   = 0.8;
    #gaugeMeters       = 1.435;
    #railWidthMeters   = 0.3;
    #railHeightMeters  = 0.2;
    #wallShading       = 0.6;
    #ambientOcclusion  = 0.45;
    #depthPrepass      = true;

    /**
     * @param {THREE.Material} material - Bed.
     * @param {THREE.Material} railMaterial
     * @param {{ bed?: boolean, rails?: boolean, gaugeMeters?: number }} [shape] - Whether the track has a
     *   raised bed (not a tram in the street) and rails (not a monorail beam), and its gauge.
     */
    constructor(material, railMaterial, { bed = true, rails = true, gaugeMeters = 1.435 } = {}) {
        super(material, 0, 0);
        this.#railMaterial = railMaterial;
        this.#bed          = bed;
        this.#rails        = rails;
        this.#gaugeMeters  = gaugeMeters;
    }

    /** @protected */
    _copyFrom(source, copyMaterial) {
        super._copyFrom(source, copyMaterial);
        this.#railMaterial     = copyMaterial(source.railMaterial);
        this.#bed              = source.bed;
        this.#rails            = source.rails;
        this.#bedWidthMeters   = source.bedWidthMeters;
        this.#bedHeightMeters  = source.bedHeightMeters;
        this.#gaugeMeters      = source.gaugeMeters;
        this.#railWidthMeters  = source.railWidthMeters;
        this.#railHeightMeters = source.railHeightMeters;
        this.#wallShading      = source.wallShading;
        this.#ambientOcclusion = source.ambientOcclusion;
        this.#depthPrepass     = source.depthPrepass;
    }

    /**
     * Material of the rails (`null`: no rails).
     * @type {THREE.Material|null}
     */
    get railMaterial()      { return this.#railMaterial; }
    set railMaterial(value) {
        if (value !== null && !(value instanceof THREE.Material)) {
            console.warn('ThreeGeoPlay: Invalid rail material — must be a valid THREE.Material or null');
            return;
        }
        this.#railMaterial = value;
        this._touch();
    }

    /** Whether the track stands on a raised bed (`false`: rails flush with the ground, as a tram in the street). @type {boolean} */
    get bed()       { return this.#bed; }
    set bed(value)  { this.#bed = !!value; this._touch(); }

    /** Whether the two rails are drawn (`false`: a monorail beam, the bed alone). @type {boolean} */
    get rails()      { return this.#rails; }
    set rails(value) { this.#rails = !!value; this._touch(); }

    /** Width of the bed in metres. @type {number} */
    get bedWidthMeters()      { return this.#bedWidthMeters; }
    set bedWidthMeters(value) { this.#setMeters('bedWidthMeters', value, v => { this.#bedWidthMeters = v; }); }

    /** Height of the bed in metres. @type {number} */
    get bedHeightMeters()      { return this.#bedHeightMeters; }
    set bedHeightMeters(value) { this.#setMeters('bedHeightMeters', value, v => { this.#bedHeightMeters = v; }); }

    /** Distance between the rails in metres (default: standard gauge, 1.435). @type {number} */
    get gaugeMeters()      { return this.#gaugeMeters; }
    set gaugeMeters(value) { this.#setMeters('gaugeMeters', value, v => { this.#gaugeMeters = v; }); }

    /** Width of each rail in metres (wider than real rails, which would be thinner than a pixel). @type {number} */
    get railWidthMeters()      { return this.#railWidthMeters; }
    set railWidthMeters(value) { this.#setMeters('railWidthMeters', value, v => { this.#railWidthMeters = v; }); }

    /** Height of each rail above the bed (or the ground) in metres. @type {number} */
    get railHeightMeters()      { return this.#railHeightMeters; }
    set railHeightMeters(value) { this.#setMeters('railHeightMeters', value, v => { this.#railHeightMeters = v; }); }

    /** Directional shading of the walls, 0–1, as {@link BuildingLayer#wallShading}. @type {number} */
    get wallShading()      { return this.#wallShading; }
    set wallShading(value) { this.#setUnit('wallShading', value, v => { this.#wallShading = v; }); }

    /** Darkening of the walls near the ground, 0–1, as {@link BuildingLayer#ambientOcclusion}. @type {number} */
    get ambientOcclusion()      { return this.#ambientOcclusion; }
    set ambientOcclusion(value) { this.#setUnit('ambientOcclusion', value, v => { this.#ambientOcclusion = v; }); }

    /** With a transparent bed material, blend each pixel once, as {@link BuildingLayer#depthPrepass}. @type {boolean} */
    get depthPrepass()      { return this.#depthPrepass; }
    set depthPrepass(value) { this.#depthPrepass = !!value; this._touch(); }

    #setMeters(name, value, set) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            console.warn(`ThreeGeoPlay: railway ${name} must be a non-negative number (received: ${value})`);
            return;
        }
        set(value);
        this._touch();
    }

    #setUnit(name, value, set) {
        if (typeof value !== 'number' || !(value >= 0 && value <= 1)) {
            console.warn(`ThreeGeoPlay: railway ${name} must be a number between 0 and 1 (received: ${value})`);
            return;
        }
        set(value);
        this._touch();
    }
}
