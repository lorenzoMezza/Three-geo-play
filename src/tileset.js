/**
 * The tile set shipped in `public/tiles`: OpenMapTiles schema, zoom 16 only
 * (hence no `{z}` in the URL), covering Rome and most of Lazio.
 */
export const TILESET = {
    url:    `${import.meta.env.BASE_URL}tiles/Y{y}X{x}.pbf`,
    zoom:   16,
    bounds: { north: 42.8397, south: 41.2448, west: 11.4478, east: 14.0295 },
}

export function isInsideTileset(lat, lon) {
    const { north, south, west, east } = TILESET.bounds
    return lat <= north && lat >= south && lon >= west && lon <= east
}

/**
 * Tile sources the demo can switch between. Each zoom level comes with a tile
 * size keeping the same scale (about 9 m per world unit), so the view does not
 * jump when switching.
 */
export const SOURCES = {
    local: {
        label:          'Local · Rome & Lazio',
        tileUrl:        TILESET.url,
        zoomLevel:      TILESET.zoom,
        tileWorldSize:  50,
        renderDistance: 6,
    },
    openfreemap: {
        label:          'OpenFreeMap (MapLibre style)',
        tileUrl:        'https://tiles.openfreemap.org/styles/liberty',
        zoomLevel:      14,
        tileWorldSize:  200,
        renderDistance: 3,
    },
    mapbox: {
        label:          'Mapbox Streets',
        tileUrl:        'mapbox://mapbox.mapbox-streets-v8',
        zoomLevel:      16,
        tileWorldSize:  50,
        renderDistance: 6,
        needsToken:     true,
    },
}

export const PLACES = [
    { name: 'San Pietro',      lat: 41.9022, lon: 12.4539 },
    { name: 'Colosseo',        lat: 41.8902, lon: 12.4922 },
    { name: 'Pantheon',        lat: 41.8986, lon: 12.4769 },
    { name: 'EUR',             lat: 41.8335, lon: 12.4674 },
    { name: 'Ostia',           lat: 41.7317, lon: 12.2836 },
    { name: 'Tivoli',          lat: 41.9633, lon: 12.7981 },
]
