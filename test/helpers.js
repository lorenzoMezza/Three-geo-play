// Shared helpers of the tests: a local tile server and a map that loads the fixture tiles.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ThreeGeoPlay, TileLayout } from '../src/index.js';

const TILES = new URL('./fixtures/tiles/', import.meta.url);

/** St. Peter's Square: the centre of the fixture tiles. */
export const ORIGIN = { lat: 41.9022, lon: 12.4539 };

/**
 * Serves the fixture tiles (`/Y{y}X{x}.pbf`) and `/tiles.json`, a TileJSON pointing to them.
 * @returns {Promise<{ url: string, close: () => void }>}
 */
export async function serveTiles() {
    const server = http.createServer(async (req, res) => {
        const path = req.url.split('?')[0];
        if (path === '/tiles.json') {
            const tiles = [`http://localhost:${server.address().port}/Y{y}X{x}.pbf`];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tilejson: '3.0.0', tiles, minzoom: 16, maxzoom: 16, vector_layers: [] }));
            return;
        }
        try {
            const data = await readFile(new URL('.' + path, TILES));
            res.writeHead(200, { 'Content-Type': 'application/x-protobuf' });
            res.end(data);
        } catch {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise(resolve => server.listen(0, resolve));
    return { url: `http://localhost:${server.address().port}`, close: () => server.close() };
}

/** What the map needs from a renderer, without WebGL. */
export const fakeRenderer = () => ({ shadowMap: { enabled: false } });

/**
 * A started map around St. Peter's, loaded from the local server, in metres.
 * @param {string} baseUrl - From {@link serveTiles}.
 * @param {Object} [options] - More `MapConfig` options.
 */
export async function loadMap(baseUrl, options = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const geo = new ThreeGeoPlay(scene, camera, fakeRenderer(), {
        tileUrl: `${baseUrl}/Y{y}X{x}.pbf`,
        zoomLevel: 16,
        originLatLon: ORIGIN,
        unitsPerMeter: 1,
        renderDistance: 1,
        tileLayout: TileLayout.GRID,
        ...options,
    });
    geo.start();
    await settle(geo);
    return { geo, scene, camera };
}

/** Runs frames until every tile is loaded and up to date. */
export async function settle(geo, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        geo.onFrameUpdate();
        const { total, loading, rebuilding } = geo.getTileStats();
        if (total > 0 && loading === 0 && rebuilding === 0) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`tiles did not load: ${JSON.stringify(geo.getTileStats())}`);
}

/** Collects the console warnings printed while `fn` runs. */
export async function warningsOf(fn) {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        await fn();
    } finally {
        console.warn = warn;
    }
    return warnings;
}
