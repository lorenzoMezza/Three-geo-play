const MAX_MERCATOR_LAT = 85.051129;
const EARTH_CIRCUMFERENCE_M = 40075016.686;

/**
 * Converts geographic coordinates to fractional Web-Mercator tile coordinates.
 * @param {number} dLon - Longitude in degrees.
 * @param {number} dLat - Latitude in degrees (clamped to the Mercator range).
 * @param {number} zoom
 * @returns {[number, number]}
 */
export function geoToTileXYFloat(dLon, dLat, zoom) {
    dLon = ((dLon + 180) % 360 + 360) % 360 - 180;
    dLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, dLat));

    const n     = 2 ** zoom;
    const rLat  = dLat * Math.PI / 180;
    const tileX = n * ((dLon + 180) / 360);
    const tileY = n * (1 - Math.log(Math.tan(rLat) + 1 / Math.cos(rLat)) / Math.PI) / 2;
    return [tileX, tileY];
}

/**
 * Converts (fractional) tile coordinates back to geographic coordinates.
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} zoom
 * @returns {[number, number]} `[lon, lat]` in degrees.
 */
export function tileXYToGeo(tileX, tileY, zoom) {
    const n   = 2 ** zoom;
    const lon = (tileX / n) * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n))) * 180 / Math.PI;
    return [lon, lat];
}

/**
 * Ground size in metres of one tile edge at the given latitude and zoom.
 * @param {number} lat - Latitude in degrees.
 * @param {number} zoom
 * @returns {number}
 */
export function tileSizeInMeters(lat, zoom) {
    const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
    return EARTH_CIRCUMFERENCE_M * Math.cos(clamped * Math.PI / 180) / 2 ** zoom;
}
