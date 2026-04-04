import { BuildingLayer } from './layers/Buildinglayer.js';
import { WaterLayer } from './layers/Waterlayer.js';
import { LandUseLayer } from './layers/Landuselayer.js';
import { LandCoverLayer } from './layers/Landcoverlayer.js';
import { TransportationLayer } from './layers/Transportationlayer.js';
import { WaterwayLayer } from './layers/Waterwaylayer.js';
import { BackgroundLayer } from './layers/Backgroundlayer.js';

/**
 * Top-level style container for a ThreeGeoPlay map.
 * Holds one instance of each renderable layer and exposes them as named
 * properties. Pass a `MapStyle` instance to {@link MapConfig#mapStyle} to
 * apply it.
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.buildingLayer.isVisible = true;
 * style.transportationLayer.motorway.material =
 *     new THREE.MeshBasicMaterial({ color: 0xff0000 });
 *
 * @class
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

    constructor() {
        this.#buildingLayer       = new BuildingLayer();
        this.#waterLayer          = new WaterLayer();
        this.#waterwayLayer       = new WaterwayLayer();
        this.#landUseLayer        = new LandUseLayer();
        this.#landCoverLayer      = new LandCoverLayer();
        this.#transportationLayer = new TransportationLayer();
        this.#backgroundLayer     = new BackgroundLayer();
    }

    /**
     * Retrieves a style layer by its internal OSM layer name.
     * @param {'background'|'waterway'|'water'|'landcover'|'landuse'|'building'|'transportation'} layerName
     * @returns {BackgroundLayer|WaterwayLayer|WaterLayer|LandCoverLayer|LandUseLayer|BuildingLayer|TransportationLayer|null}
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
            default:               return null;
        }
    }

    /**
     * The building extrusion layer.
     * @type {BuildingLayer}
     */
    get buildingLayer()       { return this.#buildingLayer; }
    set buildingLayer(layer)  { this.#buildingLayer = layer; }

    /**
     * The water body layer (lakes, oceans, rivers as polygons).
     * @type {WaterLayer}
     */
    get waterLayer()          { return this.#waterLayer; }
    set waterLayer(layer)     { this.#waterLayer = layer; }

    /**
     * The waterway layer (rivers, canals, ditches as lines).
     * @type {WaterwayLayer}
     */
    get waterwayLayer()       { return this.#waterwayLayer; }
    set waterwayLayer(layer)  { this.#waterwayLayer = layer; }

    /**
     * The land-use layer (residential, industrial, parks, etc.).
     * @type {LandUseLayer}
     */
    get landUseLayer()        { return this.#landUseLayer; }
    set landUseLayer(layer)   { this.#landUseLayer = layer; }

    /**
     * The land-cover layer (grass, wood, sand, etc.).
     * @type {LandCoverLayer}
     */
    get landCoverLayer()      { return this.#landCoverLayer; }
    set landCoverLayer(layer) { this.#landCoverLayer = layer; }

    /**
     * The transportation layer (roads, rails, paths, etc.).
     * @type {TransportationLayer}
     */
    get transportationLayer()       { return this.#transportationLayer; }
    set transportationLayer(layer)  { this.#transportationLayer = layer; }

    /**
     * The background (base fill) layer rendered beneath all other layers.
     * @type {BackgroundLayer}
     */
    get backgroundLayer()      { return this.#backgroundLayer; }
    set backgroundLayer(layer) { this.#backgroundLayer = layer; }
}