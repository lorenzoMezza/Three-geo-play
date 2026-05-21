/** HTTP statuses meaning "this tile will never exist / is not accessible": retrying is pointless. */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 410]);

/** A request that does not complete within this time is aborted and retried. */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * `fetch` that also fails when the server does not answer in time, so a stalled
 * connection never blocks a download slot forever. The timeout covers reading
 * the body inside `read`.
 *
 * @template T
 * @param {string} url
 * @param {AbortSignal} [signal] - Cancels the request (rejects with `AbortError`).
 * @param {(response: Response) => Promise<T>} [read] - Reads the response before the timeout is cleared.
 * @returns {Promise<T>}
 */
export async function fetchWithTimeout(url, signal, read = async response => response) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const controller = new AbortController();
    const cancel     = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer  = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);

    try {
        return await read(await fetch(url, { signal: controller.signal }));
    } catch (err) {
        if (timedOut) throw new Error(`timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
        throw err;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
}

/**
 * @typedef {Object} TileFetchResult
 * @property {'ok'|'empty'|'unavailable'} status
 *   `ok`: `payload` holds the MVT bytes; `empty`: the provider returned no data
 *   (e.g. 204 or a zero-length body); `unavailable`: permanent HTTP error, see `httpStatus`.
 * @property {Uint8Array|null} payload
 * @property {number} httpStatus
 */

/**
 * Downloads one vector tile.
 * Transient failures (network errors, timeouts, 5xx, 429, …) throw so the caller can retry.
 *
 * @param {string}      url
 * @param {AbortSignal} [signal]
 * @returns {Promise<TileFetchResult>}
 */
export default function fetchTileData(url, signal) {
    return fetchWithTimeout(url, signal, async res => {
        if (PERMANENT_STATUSES.has(res.status)) {
            await res.body?.cancel();
            return { status: 'unavailable', payload: null, httpStatus: res.status };
        }
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);

        // Dev servers and SPA hosts answer missing files with index.html and status 200.
        if (res.headers.get('content-type')?.includes('text/html')) {
            await res.body?.cancel();
            return { status: 'unavailable', payload: null, httpStatus: 404 };
        }

        let payload = new Uint8Array(await res.arrayBuffer());
        if (payload.byteLength === 0) {
            return { status: 'empty', payload: null, httpStatus: res.status };
        }

        // Some static hosts serve gzipped .pbf files without a Content-Encoding header.
        if (payload[0] === 0x1f && payload[1] === 0x8b) {
            payload = await gunzip(payload);
        }

        return { status: 'ok', payload, httpStatus: res.status };
    });
}

async function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('Tile payload is gzip-compressed and DecompressionStream is not available');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
