import { GeomType } from './vectorTile.js';
import { LineFeatureType } from '../style/core/LineFeatureType.js';
import { TileSchema, resolveSchema, schemaReadsLayer } from './tileSchemas.js';

/**
 * @typedef {Object} CollectedFeature
 * @property {import('../style/core/BaseFeatureType.js').BaseFeatureType} style
 * @property {string} layer       - Style layer name (`'building'`, `'transportation'`, …).
 * @property {string} type        - Name of the style type the feature was matched to.
 * @property {string} sourceLayer - Layer of the vector tile the feature comes from.
 * @property {import('./vectorTile.js').VectorTileFeature} feature
 * @property {number} index  - Position of the feature in its tile layer.
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
            layer.features.forEach((feature, index) => {
                const isLine    = feature.type === GeomType.LINESTRING;
                const isPolygon = feature.type === GeomType.POLYGON;
                if (!isLine && !isPolygon) return;

                const match = classify(layer.name, feature.properties);
                if (!match) return;
                const found = this.#styleFor(match);
                if (!found) return;
                const { style, type } = found;
                const isLineStyle = style instanceof LineFeatureType;
                const item = { style, layer: match.layer, type, sourceLayer: layer.name, feature, index, extent, ramp: false };

                if (isLine) {
                    if (!isLineStyle) return;
                    item.ramp = !!match.ramp;
                    lines.push(item);
                } else if (match.layer === 'building') {
                    // Outlines flagged `hide_3d` are kept on purpose: in OSM their
                    // `building:part`s often cover only a fraction of the building
                    // (e.g. just a dome or a tower), so skipping them leaves holes.
                    buildings.push(item);
                } else if (!isLineStyle) {
                    polygons.push(item);
                }
            });
        }

        return { lines, polygons, buildings };
    }

    /**
     * Visible style of a schema match; the first type name the layer knows wins.
     * @param {import('./tileSchemas.js').SchemaMatch} match
     * @returns {{ style: import('../style/core/BaseFeatureType.js').BaseFeatureType, type: string } | null}
     */
    #styleFor(match) {
        const styleLayer = this.#mapStyle.getStyleLayerByName(match.layer);
        if (!styleLayer || !styleLayer.isVisible) return null;

        let style = null;
        let type  = null;
        const names = Array.isArray(match.type) ? match.type : [match.type];
        for (const name of names) {
            if (typeof name === 'string' && (style = styleLayer.getTypeByName(name))) {
                type = name;
                break;
            }
        }

        if (!style || !style.isVisible || !style.material) return null;
        return { style, type };
    }
}
