import * as THREE from 'three';
import { BaseLayer } from '../core/BaseLayer.js';
import { RailFeatureType } from '../core/RailFeatureType.js';

const BED  = 0xB8B0A8;
const RAIL = 0x5A5A60;

/**
 * Shape of each class and subclass (OpenMapTiles `transportation` classes `rail`
 * and `transit`; the subclass takes precedence): raised bed, rails, gauge in metres.
 */
const TYPES = {
    rail:         { bed: true,  rails: true,  gaugeMeters: 1.435 },
    light_rail:   { bed: true,  rails: true,  gaugeMeters: 1.435 },
    subway:       { bed: true,  rails: true,  gaugeMeters: 1.435 },
    transit:      { bed: true,  rails: true,  gaugeMeters: 1.435 },
    preserved:    { bed: true,  rails: true,  gaugeMeters: 1.435 },
    narrow_gauge: { bed: true,  rails: true,  gaugeMeters: 1 },
    funicular:    { bed: true,  rails: true,  gaugeMeters: 1 },
    // A beam, without rails
    monorail:     { bed: true,  rails: false, gaugeMeters: 0 },
    // In the street: rails flush with the road
    tram:         { bed: false, rails: true,  gaugeMeters: 1.435 },
};

/**
 * Railways drawn in relief: a raised bed with two rails on top, one type per
 * class (`layer.rail`, `layer.tram`, …), see {@link RailFeatureType}. Route the
 * railway features of the tiles to it with the tile schema (`layer: 'railway'`).
 *
 * @example
 * style.railwayLayer.setAllMaterials(style.buildingLayer.material);   // beds like the buildings
 * style.railwayLayer.rail.bedHeightMeters = 1.2;
 */
export class RailwayLayer extends BaseLayer {

    /** Class names with a type in this layer. */
    static admittedClasses = new Set(Object.keys(TYPES));

    constructor() {
        super();
        const bed  = new THREE.MeshBasicMaterial({ color: BED, vertexColors: true });
        const rail = new THREE.MeshBasicMaterial({ color: RAIL, vertexColors: true });
        const types = {};
        for (const [name, shape] of Object.entries(TYPES)) types[name] = new RailFeatureType(bed, rail, shape);
        this._addTypes(types);
    }

    /**
     * Sets the bed material of every type and, when given, the rail material.
     * @param {THREE.Material} material
     * @param {THREE.Material} [railMaterial]
     */
    setAllMaterials(material, railMaterial) {
        super.setAllMaterials(material);
        if (railMaterial) for (const type of this._allTypes()) type.railMaterial = railMaterial;
    }
}
