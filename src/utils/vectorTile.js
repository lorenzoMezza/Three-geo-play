/**
 * Minimal, dependency-free decoder for Mapbox Vector Tiles (MVT spec v2.x).
 *
 * Only the layers accepted by the optional `acceptLayer` predicate are decoded,
 * and feature geometry is decoded lazily through {@link VectorTileFeature#loadGeometry},
 * so layers that are never rendered (poi, housenumber, labels, …) cost almost nothing.
 */

/** @enum {number} */
export const GeomType = Object.freeze({ UNKNOWN: 0, POINT: 1, LINESTRING: 2, POLYGON: 3 });

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_BYTES = 2;
const WIRE_FIXED32 = 5;

const CMD_MOVE_TO = 1;
const CMD_LINE_TO = 2;
const CMD_CLOSE_PATH = 7;

const utf8 = new TextDecoder('utf-8');

class PbfReader {
    constructor(buf, pos = 0, end = buf.length) {
        this.buf  = buf;
        this.pos  = pos;
        this.end  = end;
        this.view = null;
    }

    varint(isSigned = false) {
        const buf = this.buf;
        let b = buf[this.pos++]; let val = b & 0x7f;           if (b < 0x80) return val;
        b = buf[this.pos++];     val |= (b & 0x7f) << 7;       if (b < 0x80) return val;
        b = buf[this.pos++];     val |= (b & 0x7f) << 14;      if (b < 0x80) return val;
        b = buf[this.pos++];     val |= (b & 0x7f) << 21;      if (b < 0x80) return val;
        b = buf[this.pos];       val |= (b & 0x0f) << 28;
        return this.#varintRemainder(val, isSigned);
    }

    #varintRemainder(low, isSigned) {
        const buf = this.buf;
        let b = buf[this.pos++]; let high = (b & 0x70) >> 4;   if (b < 0x80) return toNumber(low, high, isSigned);
        b = buf[this.pos++];     high |= (b & 0x7f) << 3;      if (b < 0x80) return toNumber(low, high, isSigned);
        b = buf[this.pos++];     high |= (b & 0x7f) << 10;     if (b < 0x80) return toNumber(low, high, isSigned);
        b = buf[this.pos++];     high |= (b & 0x7f) << 17;     if (b < 0x80) return toNumber(low, high, isSigned);
        b = buf[this.pos++];     high |= (b & 0x7f) << 24;     if (b < 0x80) return toNumber(low, high, isSigned);
        b = buf[this.pos++];     high |= (b & 0x01) << 31;     if (b < 0x80) return toNumber(low, high, isSigned);
        throw new Error('ThreeGeoPlay: malformed varint in vector tile');
    }

    svarint() {
        const n = this.varint();
        return n % 2 === 1 ? (n + 1) / -2 : n / 2;
    }

    string() {
        const len   = this.varint();
        const start = this.pos;
        this.pos   += len;
        return utf8.decode(this.buf.subarray(start, this.pos));
    }

    float() {
        const v = this.#dataView().getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }

    double() {
        const v = this.#dataView().getFloat64(this.pos, true);
        this.pos += 8;
        return v;
    }

    skip(wireType) {
        switch (wireType) {
            case WIRE_VARINT:  while (this.buf[this.pos++] > 0x7f); break;
            case WIRE_FIXED64: this.pos += 8; break;
            case WIRE_BYTES:   this.pos += this.varint(); break;
            case WIRE_FIXED32: this.pos += 4; break;
            default: throw new Error(`ThreeGeoPlay: unsupported protobuf wire type ${wireType}`);
        }
    }

    #dataView() {
        if (!this.view) this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
        return this.view;
    }
}

function toNumber(low, high, isSigned) {
    return isSigned
        ? high * 0x100000000 + (low >>> 0)
        : (high >>> 0) * 0x100000000 + (low >>> 0);
}

/**
 * A single feature of a vector tile layer.
 */
export class VectorTileFeature {

    /** @type {number} */ id;
    /** @type {number} One of {@link GeomType}. */ type;
    /** @type {Record<string, string|number|boolean>} */ properties;

    #buf;
    #geomStart;
    #geomEnd;

    constructor(buf, id, type, properties, geomStart, geomEnd) {
        this.#buf       = buf;
        this.id         = id;
        this.type       = type;
        this.properties = properties;
        this.#geomStart = geomStart;
        this.#geomEnd   = geomEnd;
    }

    /**
     * Decodes the feature geometry into parts (lines or rings), each a flat
     * `[x0, y0, x1, y1, …]` array in tile extent coordinates.
     * Polygon rings are returned open: the closing point is implicit.
     * @returns {number[][]}
     */
    loadGeometry() {
        const r     = new PbfReader(this.#buf, this.#geomStart, this.#geomEnd);
        const parts = [];
        let part    = null;
        let cmd     = 0;
        let count   = 0;
        let x = 0, y = 0;

        while (r.pos < r.end) {
            if (count <= 0) {
                const cmdInt = r.varint();
                cmd   = cmdInt & 0x7;
                count = cmdInt >>> 3;
            }
            count--;

            if (cmd === CMD_MOVE_TO || cmd === CMD_LINE_TO) {
                const dx = r.varint();
                const dy = r.varint();
                x += (dx >>> 1) ^ -(dx & 1);
                y += (dy >>> 1) ^ -(dy & 1);
                if (cmd === CMD_MOVE_TO) {
                    if (part && part.length > 0) parts.push(part);
                    part = [];
                }
                part?.push(x, y);
            } else if (cmd === CMD_CLOSE_PATH) {
                // Rings are implicitly closed.
            } else {
                throw new Error(`ThreeGeoPlay: unknown geometry command ${cmd}`);
            }
        }
        if (part && part.length > 0) parts.push(part);
        return parts;
    }
}

/**
 * @typedef {Object} VectorTileLayer
 * @property {string} name
 * @property {number} extent
 * @property {number} version
 * @property {VectorTileFeature[]} features
 */

/**
 * Decodes an MVT payload.
 *
 * @param {Uint8Array} buf
 * @param {(layerName: string) => boolean} [acceptLayer] - Return `false` to skip a layer entirely.
 * @returns {VectorTileLayer[]}
 */
export function decodeVectorTile(buf, acceptLayer) {
    const r      = new PbfReader(buf);
    const layers = [];

    while (r.pos < r.end) {
        const tag = r.varint();
        if (tag >> 3 === 3 && (tag & 7) === WIRE_BYTES) {
            const len   = r.varint();
            const end   = r.pos + len;
            const layer = readLayer(buf, r.pos, end, acceptLayer);
            if (layer) layers.push(layer);
            r.pos = end;
        } else {
            r.skip(tag & 7);
        }
    }
    return layers;
}

function readLayer(buf, start, end, acceptLayer) {
    const r = new PbfReader(buf, start, end);
    let name    = '';
    let extent  = 4096;
    let version = 1;
    const featureRanges = [];
    const keyRanges     = [];
    const valueRanges   = [];

    // First pass: only record where things are, so rejected layers cost a single scan.
    while (r.pos < r.end) {
        const tag   = r.varint();
        const field = tag >> 3;
        const wire  = tag & 7;
        if (field === 1 && wire === WIRE_BYTES) {
            name = r.string();
        } else if (field === 5 && wire === WIRE_VARINT) {
            extent = r.varint();
        } else if (field === 15 && wire === WIRE_VARINT) {
            version = r.varint();
        } else if ((field === 2 || field === 3 || field === 4) && wire === WIRE_BYTES) {
            const len    = r.varint();
            const target = field === 2 ? featureRanges : field === 3 ? keyRanges : valueRanges;
            target.push(r.pos, r.pos + len);
            r.pos += len;
        } else {
            r.skip(wire);
        }
    }

    if (acceptLayer && !acceptLayer(name)) return null;

    const keys = new Array(keyRanges.length / 2);
    for (let i = 0; i < keyRanges.length; i += 2) {
        keys[i / 2] = utf8.decode(buf.subarray(keyRanges[i], keyRanges[i + 1]));
    }

    const values = new Array(valueRanges.length / 2);
    for (let i = 0; i < valueRanges.length; i += 2) {
        values[i / 2] = readValue(buf, valueRanges[i], valueRanges[i + 1]);
    }

    const features = new Array(featureRanges.length / 2);
    for (let i = 0; i < featureRanges.length; i += 2) {
        features[i / 2] = readFeature(buf, featureRanges[i], featureRanges[i + 1], keys, values);
    }

    return { name, extent: extent || 4096, version, features };
}

function readValue(buf, start, end) {
    const r   = new PbfReader(buf, start, end);
    let value = null;
    while (r.pos < r.end) {
        const tag = r.varint();
        switch (tag >> 3) {
            case 1:  value = r.string();         break;
            case 2:  value = r.float();          break;
            case 3:  value = r.double();         break;
            case 4:  value = r.varint(true);     break;
            case 5:  value = r.varint();         break;
            case 6:  value = r.svarint();        break;
            case 7:  value = r.varint() !== 0;   break;
            default: r.skip(tag & 7);
        }
    }
    return value;
}

function readFeature(buf, start, end, keys, values) {
    const r = new PbfReader(buf, start, end);
    let id        = 0;
    let type      = GeomType.UNKNOWN;
    let geomStart = 0;
    let geomEnd   = 0;
    const properties = {};

    while (r.pos < r.end) {
        const tag   = r.varint();
        const field = tag >> 3;
        const wire  = tag & 7;
        if (field === 1 && wire === WIRE_VARINT) {
            id = r.varint();
        } else if (field === 2 && wire === WIRE_BYTES) {
            const tagsEnd = r.varint() + r.pos;
            while (r.pos < tagsEnd) {
                const key   = keys[r.varint()];
                const value = values[r.varint()];
                if (key !== undefined) properties[key] = value;
            }
        } else if (field === 3 && wire === WIRE_VARINT) {
            type = r.varint();
        } else if (field === 4 && wire === WIRE_BYTES) {
            const len = r.varint();
            geomStart = r.pos;
            geomEnd   = r.pos + len;
            r.pos     = geomEnd;
        } else {
            r.skip(wire);
        }
    }

    return new VectorTileFeature(buf, id, type, properties, geomStart, geomEnd);
}
