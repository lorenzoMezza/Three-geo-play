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

export function tileXYToGeo(tileX, tileY, zoom) {
    const n                = 2 ** zoom;
    const lon_deg          = (tileX / n) * 360 - 180;
    const tileY_normalized = tileY / n;
    const lat_rad          = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY_normalized)));
    const lat_deg          = lat_rad * 180 / Math.PI;
    return [lon_deg, lat_deg];
}