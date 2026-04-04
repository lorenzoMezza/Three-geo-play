
import * as protobuf from 'protobufjs';

const _protoString = `
    package vector_tile;
  
    option optimize_for = LITE_RUNTIME;
  
    message Tile {
        enum GeomType {
            UNKNOWN = 0;
            POINT = 1;
            LINESTRING = 2;
            POLYGON = 3;
        }
        message Value {
            optional string string_value = 1;
            optional float  float_value  = 2;
            optional double double_value = 3;
            optional int64  int_value    = 4;
            optional uint64 uint_value   = 5;
            optional sint64 sint_value   = 6;
            optional bool   bool_value   = 7;
            extensions 8 to max;
        }
        message Feature {
            optional uint64   id       = 1 [ default = 0 ];
            repeated uint32   tags     = 2 [ packed = true ];
            optional GeomType type     = 3 [ default = UNKNOWN ];
            repeated uint32   geometry = 4 [ packed = true ];
        }
        message Layer {
            required uint32  version  = 15 [ default = 1 ];
            required string  name     = 1;
            repeated Feature features = 2;
            repeated string  keys     = 3;
            repeated Value   values   = 4;
            optional uint32  extent   = 5 [ default = 4096 ];
            extensions 16 to max;
        }
        repeated Layer layers = 3;
        extensions 16 to 8191;
    }
`;

const _ProtoTileType = protobuf.parse(_protoString).root.lookupType('vector_tile.Tile');

export function deserializeMVT(uintBuf) {
    const err = _ProtoTileType.verify(uintBuf);
    if (err) {
        console.error("ThreeGeoPlay : MVT Deserizalitation issue ", err);
        return null;
    }
    const tile = _ProtoTileType.decode(uintBuf);

    for (const layer of tile.layers) {
        for (const feature of layer.features) {
            feature.properties = _extractProperties(layer, feature);
        }
    }

    return tile;
}

function _extractProperties(layer, feature) {
    const map = new Map();
    for (let i = 0; i < feature.tags.length; i += 2) {
        const key   = layer.keys[feature.tags[i]];
        const value = Object.values(layer.values[feature.tags[i + 1]])[0];
        map.set(key, value);
    }
    return map;
}