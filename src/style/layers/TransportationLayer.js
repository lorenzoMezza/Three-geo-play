import { LineLayer, lineTypes } from '../core/LineLayer.js';

const ROAD         = 0x9C9C9C;
const CONSTRUCTION = 0x787878;
const RACEWAY      = 0xC86040;
const BUSWAY       = 0x6080A0;

/**
 * Fill colour, `lineWidth` (relative to a zoom-18 tile) and default visibility
 * of each class. Classes under construction, rails and minor transport are hidden by default.
 */
const TYPES = {
    motorway:               [ROAD,         0.1375, true],
    motorway_construction:  [CONSTRUCTION, 0.13,   false],
    trunk:                  [ROAD,         0.125,  true],
    trunk_construction:     [CONSTRUCTION, 0.12,   false],
    primary:                [ROAD,         0.1125, true],
    primary_construction:   [CONSTRUCTION, 0.1075, false],
    secondary:              [ROAD,         0.095,  true],
    secondary_construction: [CONSTRUCTION, 0.09,   false],
    tertiary:               [ROAD,         0.075,  true],
    tertiary_construction:  [CONSTRUCTION, 0.07,   false],
    minor:                  [ROAD,         0.055,  true],
    minor_construction:     [CONSTRUCTION, 0.05,   false],
    service:                [ROAD,         0.04,   true],
    service_construction:   [CONSTRUCTION, 0.0375, false],
    track:                  [ROAD,         0.025,  false],
    track_construction:     [CONSTRUCTION, 0.0225, false],
    path:                   [ROAD,         0.02,   true],
    path_construction:      [CONSTRUCTION, 0.02,   false],
    raceway:                [RACEWAY,      0.065,  false],
    raceway_construction:   [CONSTRUCTION, 0.0625, false],
    busway:                 [BUSWAY,       0.045,  false],
    bus_guideway:           [BUSWAY,       0.0425, false],
    rail:                   [ROAD,         0.045,  false],
    transit:                [ROAD,         0.05,   false],
    pedestrian:             [ROAD,         0.03,   true],
    pier:                   [ROAD,         0.05,   false],
    ferry:                  [ROAD,         0.0625, false],
};

/**
 * Roads, railways, paths and ferries, one line type per class (`layer.primary`, …).
 * OpenMapTiles `subclass` values (e.g. `pedestrian`) take precedence over `class`.
 *
 * @example
 * style.transportationLayer.motorway.material = new THREE.MeshBasicMaterial({ color: 0xff8800 });
 * style.transportationLayer.primary.lineWidthMeters = 14;
 */
export class TransportationLayer extends LineLayer {

    /** Class names with a type in this layer. */
    static admittedClasses = new Set(Object.keys(TYPES));

    constructor() {
        super();
        this._addTypes(lineTypes(TYPES, { outlineColor: 0x3F3F3F, outlineWidth: 0.03, renderingOrder: -1 }));
    }

    /** Alias of the `isVisible` setter. @param {boolean} isVisible */
    setVisible(isVisible) { this.isVisible = isVisible; }
}
