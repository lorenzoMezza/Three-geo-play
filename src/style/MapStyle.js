import { BuildingLayer } from './layers/BuildingLayer.js';
import { WaterLayer } from './layers/WaterLayer.js';
import { LandUseLayer } from './layers/LandUseLayer.js';
import { LandCoverLayer } from './layers/LandCoverLayer.js';
import { TransportationLayer } from './layers/TransportationLayer.js';
import { WaterwayLayer } from './layers/WaterwayLayer.js';
import { BackgroundLayer } from './layers/BackgroundLayer.js';
import { ShadowLayer } from './layers/ShadowLayer.js';
import { BaseLayer } from './core/BaseLayer.js';
import { nextStyleStamp } from './core/styleStamp.js';
import { applyDarkPreset } from './presets.js';

/** Style layer names, in the order they are copied by {@link MapStyle#clone}. */
const LAYER_NAMES = ['background', 'waterway', 'water', 'landcover', 'landuse', 'building', 'transportation', 'shadow'];

/**
 * The style of a map: one instance of each layer, as named properties. Changes
 * to any layer or type are applied to the tiles on screen at the next
 * {@link ThreeGeoPlay#onFrameUpdate}.
 */
export class MapStyle {

    /** @type {BuildingLayer} */
    #buildingLayer;

    /** @type {WaterLayer} */
    #waterLayer;

    /** @type {WaterwayLayer} */
    #waterwayLayer;

    /** @type {LandUseLayer} */
    #landUseLayer;

    /** @type {LandCoverLayer} */
    #landCoverLayer;

    /** @type {TransportationLayer} */
    #transportationLayer;

    /** @type {BackgroundLayer} */
    #backgroundLayer;

    /** @type {ShadowLayer} */
    #shadowLayer;

    /** @type {number} */
    #stamp = 0;

    constructor() {
        this.#buildingLayer       = new BuildingLayer();
        this.#waterLayer          = new WaterLayer();
        this.#waterwayLayer       = new WaterwayLayer();
        this.#landUseLayer        = new LandUseLayer();
        this.#landCoverLayer      = new LandCoverLayer();
        this.#transportationLayer = new TransportationLayer();
        this.#backgroundLayer     = new BackgroundLayer();
        this.#shadowLayer         = new ShadowLayer();
    }

    /**
     * Stamp of the latest change made anywhere in this style.
     * @type {number}
     * @readonly
     * @protected
     */
    get _stamp() {
        return Math.max(this.#stamp, ...LAYER_NAMES.map(name => this.getStyleLayerByName(name)._stamp));
    }

    /**
     * A ready-made night style: dark ground, glowing arterial roads, deep water
     * and unlit buildings shaded by the library. Customise it like any style.
     * @returns {MapStyle}
     *
     * @example
     * geoPlay.setMapStyle(MapStyle.dark());
     */
    static dark() {
        const style = new MapStyle();
        applyDarkPreset(style);
        return style;
    }

    /**
     * An independent copy of this style: every setting of every layer and
     * type, with the materials cloned too (types that share a material still
     * share its copy). Handy to derive a variant without touching the original.
     * @returns {MapStyle}
     *
     * @example
     * const night = geoPlay.getMapStyle().clone();
     * night.backgroundLayer.material.color.set(0x111111);
     */
    clone() {
        const copy = new MapStyle();
        const materials = new Map();
        const copyMaterial = material => {
            if (!material) return material ?? null;
            if (!materials.has(material)) materials.set(material, material.clone());
            return materials.get(material);
        };
        for (const name of LAYER_NAMES) {
            copy.getStyleLayerByName(name)._copyFrom(this.getStyleLayerByName(name), copyMaterial);
        }
        return copy;
    }

    /**
     * Applies the style again to the tiles on screen, on the next
     * {@link ThreeGeoPlay#onFrameUpdate}. Changes made through the style's
     * properties are detected by themselves; call this after changing
     * something they cannot see — e.g. the result of a
     * {@link BuildingLayer#featureStyle} function that depends on your own state.
     */
    refresh() {
        this.#stamp = nextStyleStamp();
    }

    /**
     * Calls `callback(type, layerName, typeName)` for every feature type of every
     * layer. The single-type layers (background, building, shadow) are passed
     * as their own type, with `typeName` equal to the layer name.
     * @param {(type: import('./core/BaseFeatureType.js').BaseFeatureType, layerName: string, typeName: string) => void} callback
     *
     * @example
     * // Clip the whole map
     * style.forEachType(type => { if (type.material) type.material.clippingPlanes = planes; });
     */
    forEachType(callback) {
        for (const layerName of LAYER_NAMES) {
            const layer = this.getStyleLayerByName(layerName);
            if (layer instanceof BaseLayer) {
                for (const [typeName, type] of Object.entries(layer.types)) callback(type, layerName, typeName);
            } else {
                callback(layer, layerName, layerName);
            }
        }
    }

    /**
     * Retrieves a style layer by its internal OSM layer name.
     * @param {'background'|'waterway'|'water'|'landcover'|'landuse'|'building'|'transportation'|'shadow'} layerName
     * @returns {BackgroundLayer|WaterwayLayer|WaterLayer|LandCoverLayer|LandUseLayer|BuildingLayer|TransportationLayer|ShadowLayer|null}
     */
    getStyleLayerByName(layerName) {
        switch (layerName) {
            case 'background':     return this.#backgroundLayer;
            case 'waterway':       return this.#waterwayLayer;
            case 'water':          return this.#waterLayer;
            case 'landcover':      return this.#landCoverLayer;
            case 'landuse':        return this.#landUseLayer;
            case 'building':       return this.#buildingLayer;
            case 'transportation': return this.#transportationLayer;
            case 'shadow':         return this.#shadowLayer;
            default:               return null;
        }
    }

    /**
     * The building extrusion layer.
     * @type {BuildingLayer}
     */
    get buildingLayer()       { return this.#buildingLayer; }
    set buildingLayer(layer)  { this.#buildingLayer = this.#checked(layer, BuildingLayer, 'buildingLayer'); }

    /**
     * The water body layer (lakes, oceans, rivers as polygons).
     * @type {WaterLayer}
     */
    get waterLayer()          { return this.#waterLayer; }
    set waterLayer(layer)     { this.#waterLayer = this.#checked(layer, WaterLayer, 'waterLayer'); }

    /**
     * The waterway layer (rivers, canals, ditches as lines).
     * @type {WaterwayLayer}
     */
    get waterwayLayer()       { return this.#waterwayLayer; }
    set waterwayLayer(layer)  { this.#waterwayLayer = this.#checked(layer, WaterwayLayer, 'waterwayLayer'); }

    /**
     * The land-use layer (residential, industrial, parks, etc.).
     * @type {LandUseLayer}
     */
    get landUseLayer()        { return this.#landUseLayer; }
    set landUseLayer(layer)   { this.#landUseLayer = this.#checked(layer, LandUseLayer, 'landUseLayer'); }

    /**
     * The land-cover layer (grass, wood, sand, etc.).
     * @type {LandCoverLayer}
     */
    get landCoverLayer()      { return this.#landCoverLayer; }
    set landCoverLayer(layer) { this.#landCoverLayer = this.#checked(layer, LandCoverLayer, 'landCoverLayer'); }

    /**
     * The transportation layer (roads, rails, paths, etc.).
     * @type {TransportationLayer}
     */
    get transportationLayer()       { return this.#transportationLayer; }
    set transportationLayer(layer)  { this.#transportationLayer = this.#checked(layer, TransportationLayer, 'transportationLayer'); }

    /**
     * The background (base fill) layer rendered beneath all other layers.
     * @type {BackgroundLayer}
     */
    get backgroundLayer()      { return this.#backgroundLayer; }
    set backgroundLayer(layer) { this.#backgroundLayer = this.#checked(layer, BackgroundLayer, 'backgroundLayer'); }

    /**
     * Shadows cast on the ground, drawn over the flat layers while
     * `renderer.shadowMap.enabled` is true (see {@link ShadowLayer}).
     * @type {ShadowLayer}
     */
    get shadowLayer()      { return this.#shadowLayer; }
    set shadowLayer(layer) { this.#shadowLayer = this.#checked(layer, ShadowLayer, 'shadowLayer'); }

    /** Validates a layer assigned to the style (and records the change). */
    #checked(layer, LayerClass, name) {
        if (!(layer instanceof LayerClass)) {
            throw new Error(`ThreeGeoPlay: MapStyle.${name} must be an instance of ${LayerClass.name}`);
        }
        this.#stamp = nextStyleStamp();
        return layer;
    }
}
