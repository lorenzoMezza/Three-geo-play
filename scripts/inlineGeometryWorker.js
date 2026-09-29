// Replaces src/map/geometryWorker.js in the published bundle (see build.mjs): the
// worker code is a string in the bundle, started from a Blob URL. It works with
// every bundler and CDN, with nothing to configure.
import code from 'inline:tileGeometryWorker';

/** One Blob URL for every map of the page. */
let url = null;

/** @returns {Worker|null} */
export function startGeometryWorker() {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
    try {
        url ??= URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        return new Worker(url);
    } catch {
        return null;
    }
}
