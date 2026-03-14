export default async function fetchTileData(url, tilePosition = null, signal = null) {
    const PERMANENT_ERRORS = new Set([401, 403, 404, 410]);

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const res = await fetch(url, { signal });

    if (PERMANENT_ERRORS.has(res.status)) return null;
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error("Empty payload");

    return { payload: new Uint8Array(arrayBuffer), tilePosition, url };
}