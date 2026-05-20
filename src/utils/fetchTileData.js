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

    if (PERMANENT_ERRORS.has(res.status)) return null;
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error("Empty payload");

    return { payload: new Uint8Array(arrayBuffer), tilePosition, url };
}