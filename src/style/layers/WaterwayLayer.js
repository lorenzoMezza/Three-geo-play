import { LineLayer, lineTypes } from '../core/LineLayer.js';

const WATER = 0x3A8AB8;

/** Fill colour, `lineWidth` (relative to a zoom-18 tile) and default visibility of each class. */
const TYPES = {
    river:         [WATER, 0.1,  true],
    stream:        [WATER, 0.06, true],
    tidal_channel: [WATER, 0.08, true],
    flowline:      [WATER, 0.04, true],
    canal:         [WATER, 0.08, true],
    drain:         [WATER, 0.04, true],
    ditch:         [WATER, 0.03, true],
    pressurised:   [WATER, 0.02, true],
};

/**
 * Rivers, canals and streams drawn as lines, one line type per class (`layer.river`, …).
 *
 * @example
 * style.waterwayLayer.river.lineWidthMeters = 30;
 */
export class WaterwayLayer extends LineLayer {

    /** Class names with a type in this layer. */
    static admittedClasses = new Set(Object.keys(TYPES));

    constructor() {
        super();
        this._addTypes(lineTypes(TYPES, { outlineColor: 0x1A3F60, outlineWidth: 0.04, renderingOrder: -2 }));
    }
}
