
export function geoToTileXY(dLon, dLat, zoom) {
    dLon = ((dLon + 180) % 360 + 360) % 360 - 180;
    dLat = Math.max(-85.051129, Math.min(85.051129, dLat));

    const n     = 2 ** zoom;
    const rLat  = dLat * Math.PI / 180;
    const tileX = Math.floor(n * ((dLon + 180) / 360));
    const tileY = Math.floor(n * (1 - Math.log(Math.tan(rLat) + 1 / Math.cos(rLat)) / Math.PI) / 2);
    return [tileX, tileY];
}

export function geoToTileXYFloat(dLon, dLat, zoom) {
    dLon = ((dLon + 180) % 360 + 360) % 360 - 180;
    dLat = Math.max(-85.051129, Math.min(85.051129, dLat));

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