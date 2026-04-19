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

                switch (feature.type) {
                    case GeomType.LINESTRING:
                        this.#collectLine(layer, feature, scale, lineGroups);
                        break;
                    case GeomType.POLYGON:
                        this.#collectPolygon(layer, feature, scale, polygonGroups);
                        break;
                }
            }
        }

        return { lineGroups, polygonGroups };
    }

    #collectLine(layer, feature, scale, lineGroups) {
        const featureClass = feature.properties.get('class');
        const style        = this.#resolveStyle(layer.name, featureClass);
        if (!style?.isVisible) return;

        const [tileX, tileY] = this.#positionXY;
        const group = this.#getOrCreate(
            LineGroup, `${layer.name}::${featureClass}`,
            style, layer.name, featureClass, lineGroups,
        );

        for (const rawLine of parseGeometry(feature.geometry))
            group.lines.push(this.#segmentLine(rawLine, scale, tileX, tileY));
    }

#segmentLine(rawLine, scale, tileX, tileY) {
    const simplified = simplifyLine(rawLine, 2.0);
    const out = new Float32Array(simplified.length);
    for (let i = 0; i < simplified.length; i += 2) {
        out[i]     = simplified[i]     * scale + tileX;
        out[i + 1] = simplified[i + 1] * scale + tileY;
    }
    return out;
}

    #collectPolygon(layer, feature, scale, polygonGroups) {
        const featureClass = feature.properties.get('class') ?? layer.name;
        const style        = this.#resolveStyle(layer.name, featureClass);
        if (!style?.isVisible) return;

        const [tileX, tileY] = this.#positionXY;
        const group = this.#getOrCreate(
            PolygonGroup, `${layer.name}::${featureClass}`,
            style, layer.name, featureClass, polygonGroups,
        );

        const rings = parseGeometry(feature.geometry)
            .map(ring => this.#normalizeRing(ring, scale, tileX, tileY));

        group.features.push({ rings, properties: feature.properties });
    }

    #normalizeRing(rawRing, scale, tileX, tileY) {
        const out = new Float32Array(rawRing.length);
        for (let i = 0; i < rawRing.length; i += 2) {
            out[i]     = rawRing[i]     * scale + tileX;
            out[i + 1] = rawRing[i + 1] * scale + tileY;
        }
        return out;
    }

#resolveStyle(layerName, featureClass) {
    if (layerName === "landuse" &&
       (featureClass === "grass" || featureClass === "park")) {
        layerName = "landcover";
    }

    const styleLayer = this.#mapconfig.mapStyle.getStyleLayerByName(layerName);
    if (!styleLayer) {
        TileFeatureCollector.unknownSet.add(`[no layer] ${featureClass}/${layerName}`);
        return null;
    }

    const style = styleLayer.getTypeByName
        ? styleLayer.getTypeByName(featureClass)
        : styleLayer;

    if (!style) {
        TileFeatureCollector.unknownSet.add(`[no type] ${featureClass}/${layerName}`);
    }

    return style ?? null;
}

    #getOrCreate(GroupClass, key, style, layerName, featureClass, list) {
        let group = list.find(g => g.identifier === key);
        if (!group) {
            group              = new GroupClass(key, style);
            group.layerName    = layerName;
            group.featureClass = featureClass;
            list.push(group);
        }
        return group;
    }
}