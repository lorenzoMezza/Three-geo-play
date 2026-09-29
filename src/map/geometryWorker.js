/**
 * Starts a worker running tileGeometryWorker.js, or returns `null` where web
 * workers are not available (Node, React Native, …).
 *
 * The published package replaces this module (see scripts/build.mjs) with one
 * that starts the worker from code inlined in the bundle, which works with every
 * bundler and needs no configuration.
 * @returns {Worker|null}
 */
export function startGeometryWorker() {
    if (typeof Worker === 'undefined') return null;
    try {
        return new Worker(new URL('./tileGeometryWorker.js', import.meta.url), { type: 'module' });
    } catch {
        return null;
    }
}
