import * as THREE from 'three';
import { LineFeatureType } from '../core/Linefeaturetype';
import { BaseLayer } from '../core/Baselayer';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRoadMaterial(color) {
    return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, wireframe: false });
}

function makeOutlineMaterial(color) {
    return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
}

// ── TransportationLayer ───────────────────────────────────────────────────────

/**
 * @typedef {'motorway'|'trunk'|'trunk_construction'|'primary'|'primary_construction'|
 *  'secondary'|'secondary_construction'|'tertiary'|'tertiary_construction'|
 *  'minor'|'minor_construction'|'service'|'service_construction'|
 *  'track'|'track_construction'|'path'|'path_construction'|
 *  'raceway'|'raceway_construction'|'busway'|'bus_guideway'|
 *  'rail'|'transit'|'pedestrian'|'pier'|'ferry'} TransportClassName
 */

/**
 * Manages all transport / road types rendered on the map.
 * Each OSM transport class has a dedicated {@link LineFeatureType} instance
 * accessible as a named property.
 *
 * Extends {@link BaseLayer} for `getTypeByName`, `setVisibleAll`, and the
 * internal type registry. Overrides `setAllMaterials` to also handle the
 * optional `outlineMaterial` argument.
 *
 * @example
 * const tl = geoPlay.getMapConfig().mapStyle.transportationLayer;
 * tl.motorway.material = new THREE.MeshBasicMaterial({ color: 0xff8800 });
 * tl.setOutlineWidthAll(0.06);
 *
 * @class
 * @extends BaseLayer
 */
export class TransportationLayer extends BaseLayer {

    /** @type {LineFeatureType} */ #motorway;
    /** @type {LineFeatureType} */ #trunk;
    /** @type {LineFeatureType} */ #trunk_construction;
    /** @type {LineFeatureType} */ #primary;
    /** @type {LineFeatureType} */ #primary_construction;
    /** @type {LineFeatureType} */ #secondary;
    /** @type {LineFeatureType} */ #secondary_construction;
    /** @type {LineFeatureType} */ #tertiary;
    /** @type {LineFeatureType} */ #tertiary_construction;
    /** @type {LineFeatureType} */ #minor;
    /** @type {LineFeatureType} */ #minor_construction;
    /** @type {LineFeatureType} */ #service;
    /** @type {LineFeatureType} */ #service_construction;
    /** @type {LineFeatureType} */ #track;
    /** @type {LineFeatureType} */ #track_construction;
    /** @type {LineFeatureType} */ #path;
    /** @type {LineFeatureType} */ #path_construction;
    /** @type {LineFeatureType} */ #raceway;
    /** @type {LineFeatureType} */ #raceway_construction;
    /** @type {LineFeatureType} */ #busway;
    /** @type {LineFeatureType} */ #bus_guideway;
    /** @type {LineFeatureType} */ #rail;
    /** @type {LineFeatureType} */ #transit;
    /** @type {LineFeatureType} */ #pedestrian;
    /** @type {LineFeatureType} */ #pier;
    /** @type {LineFeatureType} */ #ferry;

    constructor() {
        super();

        const delta = 0.25;
        // Bianco-grigio caldo per le strade — leggibile su qualsiasi sfondo
        const roadMat    = makeRoadMaterial(0x9C9C9C);
        // Outline grigio-beige scuro — definisce i bordi senza essere aggressivo
        const outlineMat = makeOutlineMaterial(0x3F3F3F);
        // Materiale tratteggiato per strade in costruzione (più scuro / desaturato)
        const constrMat  = makeRoadMaterial(0x787878);
        // Materiale autodromo — arancio-rosso pista da corsa
        const racewayMat = makeRoadMaterial(0xC86040);
        // Materiale busway — blu-grigio corsie riservate bus
        const buswayMat  = makeRoadMaterial(0x6080A0);

        this.#motorway               = new LineFeatureType(roadMat,    outlineMat, 0, 0.55 * delta, 0.03, true,  -1);
        this.#trunk                  = new LineFeatureType(roadMat,    outlineMat, 0, 0.50 * delta, 0.03, false, -1);
        this.#trunk_construction     = new LineFeatureType(constrMat,  outlineMat, 0, 0.48 * delta, 0.03, false, -1);
        this.#primary                = new LineFeatureType(roadMat,    outlineMat, 0, 0.45 * delta, 0.03, true,  -1);
        this.#primary_construction   = new LineFeatureType(constrMat,  outlineMat, 0, 0.43 * delta, 0.03, false, -1);
        this.#secondary              = new LineFeatureType(roadMat,    outlineMat, 0, 0.38 * delta, 0.03, true,  -1);
        this.#secondary_construction = new LineFeatureType(constrMat,  outlineMat, 0, 0.36 * delta, 0.03, false, -1);
        this.#tertiary               = new LineFeatureType(roadMat,    outlineMat, 0, 0.30 * delta, 0.03, true,  -1);
        this.#tertiary_construction  = new LineFeatureType(constrMat,  outlineMat, 0, 0.28 * delta, 0.03, false, -1);
        this.#minor                  = new LineFeatureType(roadMat,    outlineMat, 0, 0.22 * delta, 0.03, true,  -1);
        this.#minor_construction     = new LineFeatureType(constrMat,  outlineMat, 0, 0.20 * delta, 0.03, false, -1);
        this.#service                = new LineFeatureType(roadMat,    outlineMat, 0, 0.16 * delta, 0.03, true,  -1);
        this.#service_construction   = new LineFeatureType(constrMat,  outlineMat, 0, 0.15 * delta, 0.03, false, -1);
        this.#track                  = new LineFeatureType(roadMat,    outlineMat, 0, 0.10 * delta, 0.03, false, -1);
        this.#track_construction     = new LineFeatureType(constrMat,  outlineMat, 0, 0.09 * delta, 0.03, false, -1);
        this.#path                   = new LineFeatureType(roadMat,    outlineMat, 0, 0.08 * delta, 0.03, true,  -1);
        this.#path_construction      = new LineFeatureType(constrMat,  outlineMat, 0, 0.08 * delta, 0.03, false, -1);
        this.#raceway                = new LineFeatureType(racewayMat, outlineMat, 0, 0.26 * delta, 0.03, false, -1);
        this.#raceway_construction   = new LineFeatureType(constrMat,  outlineMat, 0, 0.25 * delta, 0.03, false, -1);
        this.#busway                 = new LineFeatureType(buswayMat,  outlineMat, 0, 0.18 * delta, 0.03, false, -1);
        this.#bus_guideway           = new LineFeatureType(buswayMat,  outlineMat, 0, 0.17 * delta, 0.03, false, -1);
        this.#rail                   = new LineFeatureType(roadMat,    outlineMat, 0, 0.18 * delta, 0.03, false, -1);
        this.#transit                = new LineFeatureType(roadMat,    outlineMat, 0, 0.20 * delta, 0.03, false, -1);
        this.#pedestrian             = new LineFeatureType(roadMat,    outlineMat, 0, 0.12 * delta, 0.03, false, -1);
        this.#pier                   = new LineFeatureType(roadMat,    outlineMat, 0, 0.20 * delta, 0.03, false, -1);
        this.#ferry                  = new LineFeatureType(roadMat,    outlineMat, 0, 0.25 * delta, 0.03, false, -1);

        this._register('motorway',               this.#motorway);
        this._register('trunk',                  this.#trunk);
        this._register('trunk_construction',     this.#trunk_construction);
        this._register('primary',                this.#primary);
        this._register('primary_construction',   this.#primary_construction);
        this._register('secondary',              this.#secondary);
        this._register('secondary_construction', this.#secondary_construction);
        this._register('tertiary',               this.#tertiary);
        this._register('tertiary_construction',  this.#tertiary_construction);
        this._register('minor',                  this.#minor);
        this._register('minor_construction',     this.#minor_construction);
        this._register('service',                this.#service);
        this._register('service_construction',   this.#service_construction);
        this._register('track',                  this.#track);
        this._register('track_construction',     this.#track_construction);
        this._register('path',                   this.#path);
        this._register('path_construction',      this.#path_construction);
        this._register('raceway',                this.#raceway);
        this._register('raceway_construction',   this.#raceway_construction);
        this._register('busway',                 this.#busway);
        this._register('bus_guideway',           this.#bus_guideway);
        this._register('rail',                   this.#rail);
        this._register('transit',                this.#transit);
        this._register('pedestrian',             this.#pedestrian);
        this._register('pier',                   this.#pier);
        this._register('ferry',                  this.#ferry);
    }

    // ── named getters ─────────────────────────────────────────────────────────

    /** @type {LineFeatureType} */ get motorway()               { return this.#motorway; }
    /** @type {LineFeatureType} */ get trunk()                  { return this.#trunk; }
    /** @type {LineFeatureType} */ get trunk_construction()     { return this.#trunk_construction; }
    /** @type {LineFeatureType} */ get primary()                { return this.#primary; }
    /** @type {LineFeatureType} */ get primary_construction()   { return this.#primary_construction; }
    /** @type {LineFeatureType} */ get secondary()              { return this.#secondary; }
    /** @type {LineFeatureType} */ get secondary_construction() { return this.#secondary_construction; }
    /** @type {LineFeatureType} */ get tertiary()               { return this.#tertiary; }
    /** @type {LineFeatureType} */ get tertiary_construction()  { return this.#tertiary_construction; }
    /** @type {LineFeatureType} */ get minor()                  { return this.#minor; }
    /** @type {LineFeatureType} */ get minor_construction()     { return this.#minor_construction; }
    /** @type {LineFeatureType} */ get service()                { return this.#service; }
    /** @type {LineFeatureType} */ get service_construction()   { return this.#service_construction; }
    /** @type {LineFeatureType} */ get track()                  { return this.#track; }
    /** @type {LineFeatureType} */ get track_construction()     { return this.#track_construction; }
    /** @type {LineFeatureType} */ get path()                   { return this.#path; }
    /** @type {LineFeatureType} */ get path_construction()      { return this.#path_construction; }
    /** @type {LineFeatureType} */ get raceway()                { return this.#raceway; }
    /** @type {LineFeatureType} */ get raceway_construction()   { return this.#raceway_construction; }
    /** @type {LineFeatureType} */ get busway()                 { return this.#busway; }
    /** @type {LineFeatureType} */ get bus_guideway()           { return this.#bus_guideway; }
    /** @type {LineFeatureType} */ get rail()                   { return this.#rail; }
    /** @type {LineFeatureType} */ get transit()                { return this.#transit; }
    /** @type {LineFeatureType} */ get pedestrian()             { return this.#pedestrian; }
    /** @type {LineFeatureType} */ get pier()                   { return this.#pier; }
    /** @type {LineFeatureType} */ get ferry()                  { return this.#ferry; }

    // ── bulk helpers ──────────────────────────────────────────────────────────

    /**
     * Replaces fill and (optionally) outline material on every road type.
     * @param {THREE.Material}  material
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
     * Sets `outlineWidth` on every road type.
     * @param {number} width
     */
    setOutlineWidthAll(width) {
        this._allTypes().forEach(t => { t.outlineWidth = width; });
    }

    /**
     * Resets the per-type outline width on all road types (falls back to
     * `generalConfig`).
     */
    resetOutlineWidthAll() {
        this._allTypes().forEach(t => t.resetOutlineWidth());
    }

    /**
     * Sets `renderingOrder` on every transportation type.
     * @param {number} order
     */
    setAllRenderOrder(order) {
        this._allTypes().forEach(t => { t.renderingOrder = order; });
    }

    /**
     * Sets master layer visibility and propagates to all road types.
     * @param {boolean} isVisible
     */
    setVisible(isVisible) {
        this.isVisible = isVisible;
    }

    /**
     * Set of all admitted OSM transportation class names.
     * @type {Set<TransportClassName>}
     */
    static admittedClasses = new Set([
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor',
        'path', 'service', 'track', 'raceway', 'busway', 'bus_guideway', 'ferry',
        'motorway_construction', 'trunk_construction', 'primary_construction',
        'secondary_construction', 'tertiary_construction', 'minor_construction',
        'path_construction', 'service_construction', 'track_construction',
        'raceway_construction', 'rail', 'transit', 'pedestrian', 'pier',
    ]);
}