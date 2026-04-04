import * as THREE from 'three';
import { BaseFeatureType } from '../core/Basefeaturetype';
import { BaseLayer } from '../core/Baselayer';

/**
 * @private
 * A single land-cover type (grass, wood, sand, …).
 * Inherits all properties from {@link BaseFeatureType}.
 * renderingOrder defaults to -3 for all land-cover polygons.
 */
class LandCoverType extends BaseFeatureType {
    /**
     * @param {number} color  - Hex color for the MeshBasicMaterial.
     * @param {number} Y - Y-axis render offset.
     */
    constructor(color, Y) {
        super(
            new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
            Y,
            -3  // renderingOrder
        );
    }
}

/**
 * @typedef {'sand'|'park'|'grass'|'wood'|'wetland'|'rock'|'farmland'|'ice'|
 *  'allotments'|'bare_rock'|'beach'|'bog'|'dune'|'scrub'|'shrubbery'|'farm'|
 *  'fell'|'flowerbed'|'forest'|'garden'|'glacier'|'grassland'|'golf_course'|
 *  'heath'|'mangrove'|'marsh'|'meadow'|'orchard'|'plant_nursery'|
 *  'recreation_ground'|'reedbed'|'saltern'|'saltmarsh'|'scree'|'swamp'|
 *  'tidalflat'|'tundra'|'village_green'|'vineyard'|'wet_meadow'} LandCoverClassName
 */

/**
 * Layer that renders natural land-cover polygons
 * (grass, woodland, sand, wetland, ice, …).
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.landCoverLayer.isVisible = true;
 * style.landCoverLayer.wood.material = new THREE.MeshBasicMaterial({ color: 0x2d6e29 });
 *
 * @class
 * @extends BaseLayer
 */
export class LandCoverLayer extends BaseLayer {

    // ── core classes ─────────────────────────────────────────────────────────
    /** @type {LandCoverType} */ #sand;
    /** @type {LandCoverType} */ #park;
    /** @type {LandCoverType} */ #grass;
    /** @type {LandCoverType} */ #wood;
    /** @type {LandCoverType} */ #wetland;
    /** @type {LandCoverType} */ #rock;
    /** @type {LandCoverType} */ #farmland;
    /** @type {LandCoverType} */ #ice;

    // ── subclasses ────────────────────────────────────────────────────────────
    /** @type {LandCoverType} */ #allotments;
    /** @type {LandCoverType} */ #bare_rock;
    /** @type {LandCoverType} */ #beach;
    /** @type {LandCoverType} */ #bog;
    /** @type {LandCoverType} */ #dune;
    /** @type {LandCoverType} */ #scrub;
    /** @type {LandCoverType} */ #shrubbery;
    /** @type {LandCoverType} */ #farm;
    /** @type {LandCoverType} */ #fell;
    /** @type {LandCoverType} */ #flowerbed;
    /** @type {LandCoverType} */ #forest;
    /** @type {LandCoverType} */ #garden;
    /** @type {LandCoverType} */ #glacier;
    /** @type {LandCoverType} */ #grassland;
    /** @type {LandCoverType} */ #golf_course;
    /** @type {LandCoverType} */ #heath;
    /** @type {LandCoverType} */ #mangrove;
    /** @type {LandCoverType} */ #marsh;
    /** @type {LandCoverType} */ #meadow;
    /** @type {LandCoverType} */ #orchard;
    /** @type {LandCoverType} */ #plant_nursery;
    /** @type {LandCoverType} */ #recreation_ground;
    /** @type {LandCoverType} */ #reedbed;
    /** @type {LandCoverType} */ #saltern;
    /** @type {LandCoverType} */ #saltmarsh;
    /** @type {LandCoverType} */ #scree;
    /** @type {LandCoverType} */ #swamp;
    /** @type {LandCoverType} */ #tidalflat;
    /** @type {LandCoverType} */ #tundra;
    /** @type {LandCoverType} */ #village_green;
    /** @type {LandCoverType} */ #vineyard;
    /** @type {LandCoverType} */ #wet_meadow;

    constructor() {
        super();

        // ── core classes ──────────────────────────────────────────────────────
        // Sand — sabbia calda desaturata, dune e spiagge
        this.#sand              = new LandCoverType(0xD4B483, 0.00021);
        // Park — verde curato urbano, prato ben mantenuto
        this.#park              = new LandCoverType(0x78B05A, 0.00022);
        // Grass — verde erba naturale, prato aperto
        this.#grass             = new LandCoverType(0x8DB56A, 0.00023);
        // Wood — verde foresta denso, alberi fitti
        this.#wood              = new LandCoverType(0x3D7038, 0.00024);
        // Wetland — verde-oliva paludoso, zone umide
        this.#wetland           = new LandCoverType(0x6B8F5E, 0.00025);
        // Rock — grigio-beige pietra, affioramenti rocciosi
        this.#rock              = new LandCoverType(0xA89880, 0.00026);
        // Farmland — ocra coltivato, campi agricoli
        this.#farmland          = new LandCoverType(0xC8A85A, 0.00027);
        // Ice — bianco-azzurro ghiacciaio / calotta polare
        this.#ice               = new LandCoverType(0xDDEEF5, 0.00028);

        // ── subclasses ────────────────────────────────────────────────────────
        // Allotments — verde chiaro orti urbani
        this.#allotments        = new LandCoverType(0xA8C878, 0.00029);
        // Bare rock — grigio roccia nuda, senza vegetazione
        this.#bare_rock         = new LandCoverType(0xB0A090, 0.00030);
        // Beach — sabbia chiara spiaggia costiera
        this.#beach             = new LandCoverType(0xE8D0A0, 0.00031);
        // Bog — verde-marrone torbiera
        this.#bog               = new LandCoverType(0x7A8C60, 0.00032);
        // Dune — sabbia dorata dune costiere / desertiche
        this.#dune              = new LandCoverType(0xD8C070, 0.00033);
        // Scrub — verde-grigio macchia arbustiva
        this.#scrub             = new LandCoverType(0x90A860, 0.00034);
        // Shrubbery — verde scuro arbusti ornamentali
        this.#shrubbery         = new LandCoverType(0x6A9050, 0.00035);
        // Farm — ocra-verde terreno agricolo generico
        this.#farm              = new LandCoverType(0xC0A860, 0.00036);
        // Fell — beige-verde altopiano alpino / moorland
        this.#fell              = new LandCoverType(0xB8C090, 0.00037);
        // Flowerbed — verde chiaro aiuola fiorita
        this.#flowerbed         = new LandCoverType(0xA0C870, 0.00038);
        // Forest — verde foresta piantata / gestita
        this.#forest            = new LandCoverType(0x4A7840, 0.00039);
        // Garden — verde tenero giardino privato
        this.#garden            = new LandCoverType(0x88C068, 0.00040);
        // Glacier — bianco-blu ghiacciaio alpino
        this.#glacier           = new LandCoverType(0xD0E8F0, 0.00041);
        // Grassland — verde prato naturale esteso
        this.#grassland         = new LandCoverType(0x98C070, 0.00042);
        // Golf course — verde brillante campo da golf
        this.#golf_course       = new LandCoverType(0x60B040, 0.00043);
        // Heath — viola-beige brughiera
        this.#heath             = new LandCoverType(0xB09880, 0.00044);
        // Mangrove — verde scuro mangrovie costiere
        this.#mangrove          = new LandCoverType(0x508858, 0.00045);
        // Marsh — verde-acqua palude
        this.#marsh             = new LandCoverType(0x789870, 0.00046);
        // Meadow — verde-giallo prato da sfalcio
        this.#meadow            = new LandCoverType(0xA8C858, 0.00047);
        // Orchard — verde puntinato frutteto
        this.#orchard           = new LandCoverType(0x88B850, 0.00048);
        // Plant nursery — verde chiaro vivaio
        this.#plant_nursery     = new LandCoverType(0x98C878, 0.00049);
        // Recreation ground — verde ricreativo parco pubblico
        this.#recreation_ground = new LandCoverType(0x80B870, 0.00050);
        // Reedbed — verde-oliva canneto
        this.#reedbed           = new LandCoverType(0x7A9060, 0.00051);
        // Saltern — bianco-grigio salina
        this.#saltern           = new LandCoverType(0xD8D0B8, 0.00052);
        // Saltmarsh — verde-grigio palude salmastra
        this.#saltmarsh         = new LandCoverType(0x8A9E78, 0.00053);
        // Scree — grigio detritico ghiaione
        this.#scree             = new LandCoverType(0xB8A898, 0.00054);
        // Swamp — verde scuro palude tropicale
        this.#swamp             = new LandCoverType(0x608858, 0.00055);
        // Tidalflat — beige-grigio pianura tidale
        this.#tidalflat         = new LandCoverType(0xC0B898, 0.00056);
        // Tundra — beige-verde tundra artica
        this.#tundra            = new LandCoverType(0xA8B888, 0.00057);
        // Village green — verde prato comune rurale
        this.#village_green     = new LandCoverType(0x90C870, 0.00058);
        // Vineyard — verde-viola vigneto
        this.#vineyard          = new LandCoverType(0x98A858, 0.00059);
        // Wet meadow — verde brillante prato umido
        this.#wet_meadow        = new LandCoverType(0x88B878, 0.00060);

        // ── core registrations ────────────────────────────────────────────────
        this._register('sand',              this.#sand);
        this._register('park',              this.#park);
        this._register('grass',             this.#grass);
        this._register('wood',              this.#wood);
        this._register('wetland',           this.#wetland);
        this._register('rock',              this.#rock);
        this._register('farmland',          this.#farmland);
        this._register('ice',               this.#ice);

        // ── subclass registrations ────────────────────────────────────────────
        this._register('allotments',        this.#allotments);
        this._register('bare_rock',         this.#bare_rock);
        this._register('beach',             this.#beach);
        this._register('bog',               this.#bog);
        this._register('dune',              this.#dune);
        this._register('scrub',             this.#scrub);
        this._register('shrubbery',         this.#shrubbery);
        this._register('farm',              this.#farm);
        this._register('fell',              this.#fell);
        this._register('flowerbed',         this.#flowerbed);
        this._register('forest',            this.#forest);
        this._register('garden',            this.#garden);
        this._register('glacier',           this.#glacier);
        this._register('grassland',         this.#grassland);
        this._register('golf_course',       this.#golf_course);
        this._register('heath',             this.#heath);
        this._register('mangrove',          this.#mangrove);
        this._register('marsh',             this.#marsh);
        this._register('meadow',            this.#meadow);
        this._register('orchard',           this.#orchard);
        this._register('plant_nursery',     this.#plant_nursery);
        this._register('recreation_ground', this.#recreation_ground);
        this._register('reedbed',           this.#reedbed);
        this._register('saltern',           this.#saltern);
        this._register('saltmarsh',         this.#saltmarsh);
        this._register('scree',             this.#scree);
        this._register('swamp',             this.#swamp);
        this._register('tidalflat',         this.#tidalflat);
        this._register('tundra',            this.#tundra);
        this._register('village_green',     this.#village_green);
        this._register('vineyard',          this.#vineyard);
        this._register('wet_meadow',        this.#wet_meadow);
    }

    // ── core getters ──────────────────────────────────────────────────────────
    /** @type {LandCoverType} */ get sand()              { return this.#sand; }
    /** @type {LandCoverType} */ get park()              { return this.#park; }
    /** @type {LandCoverType} */ get grass()             { return this.#grass; }
    /** @type {LandCoverType} */ get wood()              { return this.#wood; }
    /** @type {LandCoverType} */ get wetland()           { return this.#wetland; }
    /** @type {LandCoverType} */ get rock()              { return this.#rock; }
    /** @type {LandCoverType} */ get farmland()          { return this.#farmland; }
    /** @type {LandCoverType} */ get ice()               { return this.#ice; }

    // ── subclass getters ──────────────────────────────────────────────────────
    /** @type {LandCoverType} */ get allotments()        { return this.#allotments; }
    /** @type {LandCoverType} */ get bare_rock()         { return this.#bare_rock; }
    /** @type {LandCoverType} */ get beach()             { return this.#beach; }
    /** @type {LandCoverType} */ get bog()               { return this.#bog; }
    /** @type {LandCoverType} */ get dune()              { return this.#dune; }
    /** @type {LandCoverType} */ get scrub()             { return this.#scrub; }
    /** @type {LandCoverType} */ get shrubbery()         { return this.#shrubbery; }
    /** @type {LandCoverType} */ get farm()              { return this.#farm; }
    /** @type {LandCoverType} */ get fell()              { return this.#fell; }
    /** @type {LandCoverType} */ get flowerbed()         { return this.#flowerbed; }
    /** @type {LandCoverType} */ get forest()            { return this.#forest; }
    /** @type {LandCoverType} */ get garden()            { return this.#garden; }
    /** @type {LandCoverType} */ get glacier()           { return this.#glacier; }
    /** @type {LandCoverType} */ get grassland()         { return this.#grassland; }
    /** @type {LandCoverType} */ get golf_course()       { return this.#golf_course; }
    /** @type {LandCoverType} */ get heath()             { return this.#heath; }
    /** @type {LandCoverType} */ get mangrove()          { return this.#mangrove; }
    /** @type {LandCoverType} */ get marsh()             { return this.#marsh; }
    /** @type {LandCoverType} */ get meadow()            { return this.#meadow; }
    /** @type {LandCoverType} */ get orchard()           { return this.#orchard; }
    /** @type {LandCoverType} */ get plant_nursery()     { return this.#plant_nursery; }
    /** @type {LandCoverType} */ get recreation_ground() { return this.#recreation_ground; }
    /** @type {LandCoverType} */ get reedbed()           { return this.#reedbed; }
    /** @type {LandCoverType} */ get saltern()           { return this.#saltern; }
    /** @type {LandCoverType} */ get saltmarsh()         { return this.#saltmarsh; }
    /** @type {LandCoverType} */ get scree()             { return this.#scree; }
    /** @type {LandCoverType} */ get swamp()             { return this.#swamp; }
    /** @type {LandCoverType} */ get tidalflat()         { return this.#tidalflat; }
    /** @type {LandCoverType} */ get tundra()            { return this.#tundra; }
    /** @type {LandCoverType} */ get village_green()     { return this.#village_green; }
    /** @type {LandCoverType} */ get vineyard()          { return this.#vineyard; }
    /** @type {LandCoverType} */ get wet_meadow()        { return this.#wet_meadow; }

    /**
     * Set of all admitted OSM land-cover class / subclass names.
     * @type {Set<LandCoverClassName>}
     */
    static admittedClasses = new Set([
        'sand', 'park', 'grass', 'wood', 'wetland', 'rock', 'farmland', 'ice',
        'allotments', 'bare_rock', 'beach', 'bog', 'dune', 'scrub', 'shrubbery',
        'farm', 'fell', 'flowerbed', 'forest', 'garden', 'glacier', 'grassland',
        'golf_course', 'heath', 'mangrove', 'marsh', 'meadow', 'orchard',
        'plant_nursery', 'recreation_ground', 'reedbed', 'saltern', 'saltmarsh',
        'scree', 'swamp', 'tidalflat', 'tundra', 'village_green', 'vineyard',
        'wet_meadow',
    ]);
}