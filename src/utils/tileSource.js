import { fetchWithTimeout } from './fetchTileData.js';

/**
 * @typedef {Object} TileSource
 * @property {string[]} tiles       - Tile URL templates (`{z}`, `{x}`, `{y}`), used round-robin.
 * @property {number}   minZoom
 * @property {number}   maxZoom
 * @property {string}   attribution - HTML attribution required by the provider ('' if unknown).
 * @property {string[]} layers      - Vector layer ids announced by the source ([] if unknown).
 */

const MAPBOX_API = 'https://api.mapbox.com';

/** Whether `url` is a tile URL template rather than a TileJSON / style document. */
export function isTileTemplate(url) {
    return url.includes('{x}') && url.includes('{y}');
}

/**
 * Source made of a single tile URL template (no request needed).
 * @param {string} url
 * @param {string} [accessToken]
 * @returns {TileSource}
 */
export function templateSource(url, accessToken = '') {
    return { tiles: [withMapboxToken(url, accessToken)], minZoom: 0, maxZoom: Infinity, attribution: '', layers: [] };
}

/** Configuration problem: retrying cannot help. */
function permanentError(message) {
    const error = new Error(`ThreeGeoPlay: ${message}`);
    error.permanent = true;
    return error;
}

/**
 * Turns the URL of a tile source into tile URL templates. Accepts:
 *  - a template such as `https://host/{z}/{x}/{y}.pbf`;
 *  - a TileJSON document (MapTiler, OpenFreeMap, tileservers, Mapbox API);
 *  - a MapLibre / Mapbox style: its first vector source is used;
 *  - `mapbox://` URLs (`mapbox://mapbox.mapbox-streets-v8`, `mapbox://styles/mapbox/streets-v12`),
 *    which need an access token.
 *
 * @param {string} url
 * @param {{ accessToken?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<TileSource>}
 */
export async function resolveTileSource(url, { accessToken = '', signal } = {}) {
    if (isTileTemplate(url)) return templateSource(url, accessToken);
    return resolveDocument(url, accessToken, signal, 0);
}

async function resolveDocument(url, accessToken, signal, depth) {
    if (depth > 3) throw permanentError('too many nested tile source references');
    if (url.startsWith('pmtiles://')) {
        throw permanentError('PMTiles sources are not supported; serve the tiles as {z}/{x}/{y} (e.g. with pmtiles serve or martin)');
    }

    const documentUrl = mapboxToHttps(url, accessToken);
    const { status, json } = await fetchWithTimeout(documentUrl, signal, async response => ({
        status: response.status,
        json:   response.ok
            ? await response.json().catch(() => { throw permanentError(`${redactToken(documentUrl)} did not return JSON`); })
            : null,
    }));
    if (!json) {
        const message = `HTTP ${status} loading tile source ${redactToken(documentUrl)}`;
        throw [400, 401, 403, 404].includes(status) ? permanentError(message) : new Error(message);
    }

    if (Array.isArray(json.tiles)) return fromTileJson(json, documentUrl, accessToken);

    if (json.sources && typeof json.sources === 'object') {
        const source = Object.values(json.sources).find(s => s?.type === 'vector');
        if (!source) throw permanentError('the map style has no vector source');
        if (Array.isArray(source.tiles)) return fromTileJson(source, documentUrl, accessToken);
        if (typeof source.url === 'string') {
            const next = source.url.startsWith('mapbox://') || source.url.startsWith('pmtiles://')
                ? source.url
                : resolveUrl(source.url, documentUrl);
            return resolveDocument(next, accessToken, signal, depth + 1);
        }
    }
    throw permanentError(`${redactToken(documentUrl)} is neither a TileJSON document nor a map style`);
}

function fromTileJson(json, baseUrl, accessToken) {
    return {
        tiles:       json.tiles.map(t => withMapboxToken(resolveUrl(t, baseUrl), accessToken)),
        minZoom:     Number.isFinite(json.minzoom) ? json.minzoom : 0,
        maxZoom:     Number.isFinite(json.maxzoom) ? json.maxzoom : 30,
        attribution: typeof json.attribution === 'string' ? json.attribution : '',
        layers:      Array.isArray(json.vector_layers) ? json.vector_layers.map(l => l.id).filter(Boolean) : [],
    };
}

/** Resolves a possibly relative URL without percent-encoding the `{z}/{x}/{y}` placeholders. */
function resolveUrl(url, baseUrl) {
    let base = baseUrl;
    if (typeof location !== 'undefined' && location.href) base = new URL(baseUrl, location.href).href;
    try {
        return new URL(url, base).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
    } catch {
        return url;
    }
}

/** `mapbox://…` → Mapbox API URL (TileJSON for tilesets, style document for styles). */
function mapboxToHttps(url, accessToken) {
    if (!url.startsWith('mapbox://')) return withMapboxToken(url, accessToken);
    if (!accessToken) throw permanentError('mapbox:// URLs need MapConfig.accessToken');
    const path  = url.slice('mapbox://'.length);
    const token = `access_token=${encodeURIComponent(accessToken)}`;
    return path.startsWith('styles/')
        ? `${MAPBOX_API}/styles/v1/${path.slice('styles/'.length)}?${token}`
        : `${MAPBOX_API}/v4/${path}.json?secure&${token}`;
}

/** Adds the access token to Mapbox URLs that do not carry one. */
function withMapboxToken(url, accessToken) {
    if (!accessToken || !/^https?:\/\/([a-z0-9-]+\.)*mapbox\.com\//i.test(url) || /[?&]access_token=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
}

/** Hides access tokens / keys in URLs shown in messages. */
export function redactToken(url) {
    return url.replace(/([?&](?:access_token|key|api_key|token)=)[^&]+/gi, '$1…');
}
