import { GeomType } from './vectorTile.js';
import { LineFeatureType } from '../style/core/Linefeaturetype.js';
import { TileSchema, resolveSchema, schemaReadsLayer } from './tileSchemas.js';

/**
 * @typedef {Object} CollectedFeature
 * @property {import('../style/core/Basefeaturetype.js').BaseFeatureType} style
 * @property {import('./vectorTile.js').VectorTileFeature} feature
 * @property {number} extent - Extent of the layer the feature belongs to.
 * @property {boolean} ramp  - Link road (lines only).
 */

/**
 * Resolves the style of every feature of a decoded tile — through the tile
 * schema (OpenMapTiles, Mapbox Streets or a custom one) — and sorts the
 * renderable ones into lines, flat polygons and buildings.
 * Hidden features, and features without a matching style, are dropped.
 */
export class TileFeatureCollector {

    /** @type {import('../style/MapStyle.js').MapStyle} */
    #mapStyle;

    /** @type {string|import('./tileSchemas.js').TileSchemaFunction} */
    #schema;

    /** @type {string[]} Layer names announced by the source (TileJSON), used to detect the schema. */
    #sourceLayers;

    /**
     * @param {import('../style/MapStyle.js').MapStyle} mapStyle
     * @param {string|import('./tileSchemas.js').TileSchemaFunction} [schema=TileSchema.AUTO]
     * @param {string[]} [sourceLayers=[]]
     */
    constructor(mapStyle, schema = TileSchema.AUTO, sourceLayers = []) {
        this.#mapStyle     = mapStyle;
        this.#schema       = schema;
        this.#sourceLayers = sourceLayers;
    }

    /**
     * Whether a tile layer can contain renderable features (used to skip decoding the others).
     * @param {string} layerName
     * @returns {boolean}
     */
    acceptsLayer = (layerName) => schemaReadsLayer(this.#schema, layerName);

    /**
     * @param {import('./vectorTile.js').VectorTileLayer[]} layers
     * @returns {{ lines: CollectedFeature[], polygons: CollectedFeature[], buildings: CollectedFeature[] }}
     */
    collect(layers) {
        const lines     = [];
        const polygons  = [];
        const buildings = [];
        const classify  = resolveSchema(
            this.#schema,
            this.#sourceLayers.length > 0 ? this.#sourceLayers : layers.map(layer => layer.name),
        );

        for (const layer of layers) {
            const extent = layer.extent;
            for (const feature of layer.features) {
                const isLine    = feature.type === GeomType.LINESTRING;
                const isPolygon = feature.type === GeomType.POLYGON;
                if (!isLine && !isPolygon) continue;

                const match = classify(layer.name, feature.properties);
                if (!match) continue;
                const style = this.#styleFor(match);
                if (!style) continue;
                const isLineStyle = style instanceof LineFeatureType;

                if (isLine) {
                    if (isLineStyle) lines.push({ style, feature, extent, ramp: !!match.ramp });
                } else if (match.layer === 'building') {
                    // Outlines flagged `hide_3d` are kept on purpose: in OSM their
                    // `building:part`s often cover only a fraction of the building
                    // (e.g. just a dome or a tower), so skipping them leaves holes.
                    buildings.push({ style, feature, extent, ramp: false });
                } else if (!isLineStyle) {
                    polygons.push({ style, feature, extent, ramp: false });
                }
            }
        }

        return { lines, polygons, buildings };
    }

    /**
     * Visible style of a schema match; the first type name the layer knows wins.
     * @param {import('./tileSchemas.js').SchemaMatch} match
     */
    #styleFor(match) {
        const styleLayer = this.#mapStyle.getStyleLayerByName(match.layer);
        if (!styleLayer || !styleLayer.isVisible) return null;

        let style = null;
        if (Array.isArray(match.type)) {
            for (const name of match.type) {
                if (typeof name === 'string' && (style = styleLayer.getTypeByName(name))) break;
            }
        } else if (typeof match.type === 'string') {
            style = styleLayer.getTypeByName(match.type);
        }

        if (!style || !style.isVisible || !style.material) return null;
        return style;
    }
}
