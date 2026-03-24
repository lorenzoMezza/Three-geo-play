import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype';
import { BaseLayer } from '../core/Baselayer';

/**
 * @private
 * A single land-use type (residential, industrial, park, …).
 * Inherits all properties from {@link BaseFeatureType}.
 * renderingOrder defaults to -4 for all land-use polygons.
 */
class LandUseType extends BaseFeatureType {
    /**
     * @param {number} color  - Hex color for the MeshBasicMaterial.
     * @param {number} Y - Y-axis render offset.
     */
    constructor(color, Y) {
        super(
            new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
            Y,
            -4  // renderingOrder
        );
    }
}

/**
 * @typedef {'farmland'|'suburb'|'residential'|'industrial'|'pitch'|'university'|
 *  'retail'|'playground'|'commercial'|'military'|'school'|'college'|'bus_station'|
 *  'kindergarten'|'theme_park'|'hospital'|'railway'|'parking'|'recreation_ground'|
 *  'cemetery'|'library'|'track'|'stadium'|'quarter'|'zoo'|'attraction'|'religious'|
 *  'quarry'|'nature_reserve'|'protected_area'|'neighbourhood'|'garages'|'dam'} LandUseClassName
 */

/**
 * Layer that renders OSM land-use polygons
 * (residential areas, industrial zones, parks, schools, …).
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.landUseLayer.isVisible = true;
 * style.landUseLayer.park.material = new THREE.MeshBasicMaterial({ color: 0x5a9e55 });
 *
 * @class
 * @extends BaseLayer
 */
export class LandUseLayer extends BaseLayer {

    /** @type {LandUseType} */ #farmland;
    /** @type {LandUseType} */ #suburb;
    /** @type {LandUseType} */ #residential;
    /** @type {LandUseType} */ #industrial;
    /** @type {LandUseType} */ #pitch;
    /** @type {LandUseType} */ #university;
    /** @type {LandUseType} */ #retail;
    /** @type {LandUseType} */ #playground;
    /** @type {LandUseType} */ #commercial;
    /** @type {LandUseType} */ #military;
    /** @type {LandUseType} */ #school;
    /** @type {LandUseType} */ #college;
    /** @type {LandUseType} */ #bus_station;
    /** @type {LandUseType} */ #kindergarten;
    /** @type {LandUseType} */ #theme_park;
    /** @type {LandUseType} */ #hospital;
    /** @type {LandUseType} */ #railway;
    /** @type {LandUseType} */ #parking;
    /** @type {LandUseType} */ #recreation_ground;
    /** @type {LandUseType} */ #cemetery;
    /** @type {LandUseType} */ #library;
    /** @type {LandUseType} */ #track;
    /** @type {LandUseType} */ #stadium;
    /** @type {LandUseType} */ #quarter;
    /** @type {LandUseType} */ #zoo;
    /** @type {LandUseType} */ #attraction;
    /** @type {LandUseType} */ #religious;
    /** @type {LandUseType} */ #quarry;
    /** @type {LandUseType} */ #nature_reserve;
    /** @type {LandUseType} */ #protected_area;
    // ── missing from OSM spec ─────────────────────────────────────────────────
    /** @type {LandUseType} */ #neighbourhood;
    /** @type {LandUseType} */ #garages;
    /** @type {LandUseType} */ #dam;

    constructor() {
        super();

        // Agricoltura / natura
        this.#farmland          = new LandUseType(0xC8A85A, 0.00029);
        this.#nature_reserve    = new LandUseType(0x5A8F50, 0.00058);
        this.#protected_area    = new LandUseType(0x6AAF60, 0.00059);

        // Residenziale / urbano
        this.#suburb            = new LandUseType(0xE8D8C0, 0.00030);
        this.#residential       = new LandUseType(0xE0CEB0, 0.00031);
        this.#quarter           = new LandUseType(0xD8C8A8, 0.00053);
        this.#neighbourhood     = new LandUseType(0xD0C0A0, 0.00054); // beige quartiere minore

        // Commerciale / industriale
        this.#industrial        = new LandUseType(0xB8A8B8, 0.00032);
        this.#commercial        = new LandUseType(0xD4906A, 0.00037);
        this.#retail            = new LandUseType(0xC87850, 0.00035);
        this.#railway           = new LandUseType(0xA89888, 0.00045);
        this.#parking           = new LandUseType(0xA8B0B8, 0.00046);
        this.#garages           = new LandUseType(0xB8B0A8, 0.00047); // grigio-beige garage
        this.#dam               = new LandUseType(0x909888, 0.00060); // grigio-verde diga

        // Sport / svago
        this.#pitch             = new LandUseType(0x5A9E55, 0.00033);
        this.#playground        = new LandUseType(0xD4B840, 0.00036);
        this.#recreation_ground = new LandUseType(0x80B870, 0.00048);
        this.#track             = new LandUseType(0xC87840, 0.00051);
        this.#stadium           = new LandUseType(0xB86830, 0.00052);
        this.#zoo               = new LandUseType(0x70A860, 0.00055);
        this.#theme_park        = new LandUseType(0xC860A0, 0.00043);

        // Istruzione
        this.#university        = new LandUseType(0xD4C060, 0.00034);
        this.#school            = new LandUseType(0x80A8C8, 0.00039);
        this.#college           = new LandUseType(0x9080C0, 0.00040);
        this.#kindergarten      = new LandUseType(0xE080A0, 0.00042);
        this.#library           = new LandUseType(0x8870B8, 0.00050);

        // Servizi pubblici / sanità
        this.#hospital          = new LandUseType(0xD06868, 0.00044);
        this.#bus_station       = new LandUseType(0x5898A8, 0.00041);
        this.#military          = new LandUseType(0x788858, 0.00038);

        // Cimitero / religione / miniere
        this.#cemetery          = new LandUseType(0x708868, 0.00049);
        this.#religious         = new LandUseType(0x9878B8, 0.00056);
        this.#quarry            = new LandUseType(0x988878, 0.00057);
        this.#attraction        = new LandUseType(0xD4A030, 0.00055);

        // ── registrations ─────────────────────────────────────────────────────
        this._register('farmland',          this.#farmland);
        this._register('suburb',            this.#suburb);
        this._register('residential',       this.#residential);
        this._register('industrial',        this.#industrial);
        this._register('pitch',             this.#pitch);
        this._register('university',        this.#university);
        this._register('retail',            this.#retail);
        this._register('playground',        this.#playground);
        this._register('commercial',        this.#commercial);
        this._register('military',          this.#military);
        this._register('school',            this.#school);
        this._register('college',           this.#college);
        this._register('bus_station',       this.#bus_station);
        this._register('kindergarten',      this.#kindergarten);
        this._register('theme_park',        this.#theme_park);
        this._register('hospital',          this.#hospital);
        this._register('railway',           this.#railway);
        this._register('parking',           this.#parking);
        this._register('recreation_ground', this.#recreation_ground);
        this._register('cemetery',          this.#cemetery);
        this._register('library',           this.#library);
        this._register('track',             this.#track);
        this._register('stadium',           this.#stadium);
        this._register('quarter',           this.#quarter);
        this._register('zoo',               this.#zoo);
        this._register('attraction',        this.#attraction);
        this._register('religious',         this.#religious);
        this._register('quarry',            this.#quarry);
        this._register('nature_reserve',    this.#nature_reserve);
        this._register('protected_area',    this.#protected_area);
        this._register('neighbourhood',     this.#neighbourhood);
        this._register('garages',           this.#garages);
        this._register('dam',               this.#dam);
    }

    /** @type {LandUseType} */ get farmland()          { return this.#farmland; }
    /** @type {LandUseType} */ get suburb()            { return this.#suburb; }
    /** @type {LandUseType} */ get residential()       { return this.#residential; }
    /** @type {LandUseType} */ get industrial()        { return this.#industrial; }
    /** @type {LandUseType} */ get pitch()             { return this.#pitch; }
    /** @type {LandUseType} */ get university()        { return this.#university; }
    /** @type {LandUseType} */ get retail()            { return this.#retail; }
    /** @type {LandUseType} */ get playground()        { return this.#playground; }
    /** @type {LandUseType} */ get commercial()        { return this.#commercial; }
    /** @type {LandUseType} */ get military()          { return this.#military; }
    /** @type {LandUseType} */ get school()            { return this.#school; }
    /** @type {LandUseType} */ get college()           { return this.#college; }
    /** @type {LandUseType} */ get bus_station()       { return this.#bus_station; }
    /** @type {LandUseType} */ get kindergarten()      { return this.#kindergarten; }
    /** @type {LandUseType} */ get theme_park()        { return this.#theme_park; }
    /** @type {LandUseType} */ get hospital()          { return this.#hospital; }
    /** @type {LandUseType} */ get railway()           { return this.#railway; }
    /** @type {LandUseType} */ get parking()           { return this.#parking; }
    /** @type {LandUseType} */ get recreation_ground() { return this.#recreation_ground; }
    /** @type {LandUseType} */ get cemetery()          { return this.#cemetery; }
    /** @type {LandUseType} */ get library()           { return this.#library; }
    /** @type {LandUseType} */ get track()             { return this.#track; }
    /** @type {LandUseType} */ get stadium()           { return this.#stadium; }
    /** @type {LandUseType} */ get quarter()           { return this.#quarter; }
    /** @type {LandUseType} */ get zoo()               { return this.#zoo; }
    /** @type {LandUseType} */ get attraction()        { return this.#attraction; }
    /** @type {LandUseType} */ get religious()         { return this.#religious; }
    /** @type {LandUseType} */ get quarry()            { return this.#quarry; }
    /** @type {LandUseType} */ get nature_reserve()    { return this.#nature_reserve; }
    /** @type {LandUseType} */ get protected_area()    { return this.#protected_area; }
    /** @type {LandUseType} */ get neighbourhood()     { return this.#neighbourhood; }
    /** @type {LandUseType} */ get garages()           { return this.#garages; }
    /** @type {LandUseType} */ get dam()               { return this.#dam; }

    /**
     * Set of all admitted OSM land-use class names.
     * @type {Set<LandUseClassName>}
     */
    static admittedClasses = new Set([
        'farmland', 'suburb', 'residential', 'industrial', 'pitch', 'university',
        'retail', 'playground', 'commercial', 'military', 'school', 'college',
        'bus_station', 'kindergarten', 'theme_park', 'hospital', 'railway',
        'parking', 'recreation_ground', 'cemetery', 'library', 'track',
        'stadium', 'quarter', 'zoo', 'attraction', 'religious', 'quarry',
        'nature_reserve', 'protected_area', 'neighbourhood', 'garages', 'dam',
    ]);
}