/**
 * Draw order of line features (roads, waterways).
 *
 * Flat map geometry is drawn without writing depth and stacked by render order.
 * Inside the `renderingOrder` unit of a line type (e.g. `-1 … -0.1` for roads)
 * lines are layered like on a printed map:
 *
 *   1. by level — tunnels below ground-level lines, bridges above them
 *      (OpenMapTiles `brunnel` / `layer`, Mapbox `structure` / `layer`), so a
 *      bridge is drawn over the roads it crosses;
 *   2. inside a level, every outline (casing) below every fill, so crossing
 *      lines merge instead of cutting through each other;
 *   3. among fills, wider lines above narrower ones, so a minor road joins a
 *      major one cleanly even when their colours differ; ramps (OpenMapTiles
 *      `ramp`) rank like a line half as wide, so they slip under the main road
 *      they merge into but stay above paths and service roads.
 */

/** Levels beyond ±MAX_LEVEL are clamped. */
const MAX_LEVEL = 5;

/** Share of one render order unit used by each level (11 levels + headroom). */
const LEVEL_SPAN = 1 / (2 * MAX_LEVEL + 2);

/** Style layers made of line types. */
const LINE_LAYERS = ['transportation', 'waterway'];

/**
 * Vertical level of a line feature: its OSM `layer`, at least 1 for bridges
 * and at most -1 for tunnels.
 * @param {Record<string, unknown>} properties
 * @returns {number} Integer in [-MAX_LEVEL, MAX_LEVEL].
 */
export function lineLevel(properties) {
    const layer = Number(properties.layer);
    let level = Number.isFinite(layer) ? Math.round(layer) : 0;
    const structure = properties.brunnel ?? properties.structure;
    if (structure === 'bridge' && level < 1) level = 1;
    else if (structure === 'tunnel' && level > -1) level = -1;
    return Math.max(-MAX_LEVEL, Math.min(MAX_LEVEL, level));
}

/** Monotonic map of a line width to [0, 1). */
function widthRank(width) {
    return width / (width + 0.25);
}

/**
 * Render orders of line outlines and fills for one map style.
 *
 * The fill order of a type depends only on the style (not on the tile being
 * built), so neighbouring tiles always agree. Types that are adjacent in the
 * width ranking and share one fill material get the same order, so they keep
 * being drawn in a single batch: with the default style, where most roads share
 * one material, this adds no draw calls.
 */
export class LineLayering {

    /** @type {Map<import('../style/core/LineFeatureType.js').LineFeatureType, number>} */
    #fillRank = new Map();

    /** Converts metres to `lineWidth` units, so both kinds of width rank together. */
    #metersToRelative;

    /**
     * @param {import('../style/MapStyle.js').MapStyle} mapStyle
     * @param {number} [metersToRelative=0] - `lineWidth` units per metre.
     */
    constructor(mapStyle, metersToRelative = 0) {
        this.#metersToRelative = metersToRelative;
        const typesByOrder = new Map();
        for (const name of LINE_LAYERS) {
            const layer = mapStyle.getStyleLayerByName(name);
            if (!layer?.isVisible || typeof layer._allTypes !== 'function') continue;
            for (const type of layer._allTypes()) {
                if (!type.isVisible || !type.material) continue;
                const group = typesByOrder.get(type.renderingOrder);
                if (group) group.push(type);
                else typesByOrder.set(type.renderingOrder, [type]);
            }
        }

        for (const types of typesByOrder.values()) {
            types.sort((a, b) => this.#width(a) - this.#width(b));
            let run = [];
            const closeRun = () => {
                const rank = widthRank(this.#width(run[run.length - 1]));
                for (const type of run) this.#fillRank.set(type, rank);
                run = [];
            };
            for (const type of types) {
                if (run.length > 0 && run[0].material !== type.material) closeRun();
                run.push(type);
            }
            if (run.length > 0) closeRun();
        }
    }

    /**
     * @param {import('../style/core/LineFeatureType.js').LineFeatureType} style
     * @param {number} level - From {@link lineLevel}.
     * @returns {number}
     */
    outlineOrder(style, level) {
        return style.renderingOrder + (level + MAX_LEVEL) * LEVEL_SPAN;
    }

    /**
     * @param {import('../style/core/LineFeatureType.js').LineFeatureType} style
     * @param {number} level - From {@link lineLevel}.
     * @param {boolean} [isRamp=false] - Link road: ranked like a line half as wide.
     * @returns {number}
     */
    fillOrder(style, level, isRamp = false) {
        const rank = isRamp
            ? widthRank(this.#width(style) * 0.5)
            : this.#fillRank.get(style) ?? widthRank(this.#width(style));
        return style.renderingOrder + (level + MAX_LEVEL + 0.5 + 0.45 * rank) * LEVEL_SPAN;
    }

    /** Width of a type in `lineWidth` units, whichever way it was given. */
    #width(style) {
        return style.lineWidthMeters === null || style.lineWidthMeters === undefined
            ? style.lineWidth
            : style.lineWidthMeters * this.#metersToRelative;
    }
}
