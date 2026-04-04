import { parseGeometry } from "../geom_utils/geomParser";
import { simplifyLine } from "../geom_utils/RDPalgoritm";

class FeatureGroup {
    identifier;
    style;
    layerName    = '';
    featureClass = '';

    constructor(identifier, style) {
        this.identifier = identifier;
        this.style      = style;
    }
}

export class LineGroup extends FeatureGroup {
   lines = [];
}

export class PolygonGroup extends FeatureGroup {
    features = [];
}


const GeomType = Object.freeze({ UNKNOWN: 0, POINT: 1, LINESTRING: 2, POLYGON: 3 });

export class TileFeatureCollector {

    static unknownSet = new Set();

    #mapconfig   = null;
    #positionXY  = null;

    constructor(positionXY, mapconfig) {
        this.#positionXY = positionXY;
        this.#mapconfig  = mapconfig;
    }

    collect(protoTile) {
        const lineGroups    = [];
        const polygonGroups = [];

        for (const layer of protoTile.layers) {
            const scale = (1 / layer.extent) * this.#mapconfig.tileWorldSize;
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