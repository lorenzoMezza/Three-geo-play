import { buildTileGeometry } from './tileGeometry.js';
import { startGeometryWorker } from './geometryWorker.js';

/**
 * Workers per map. Two keep up with a camera flying over the city; more only
 * compete for the cores that the page and the GPU process need to draw.
 */
const WORKER_COUNT = Math.min(2, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2));

/**
 * Builds tile geometry ({@link buildTileGeometry}) in web workers, so loading
 * tiles does not slow the frames down. Where workers are not available, or fail
 * to start (e.g. a Content-Security-Policy without `blob:` workers), the same
 * function runs on the main thread: the geometry is the same either way.
 */
export class GeometryBuilder {

    /** @type {Worker[]} */
    #workers = [];
    #next = 0;
    #lastId = 0;

    /** Jobs sent to a worker, by id. @type {Map<number, { job: Object, resolve: Function, reject: Function }>} */
    #pending = new Map();

    constructor() {
        for (let i = 0; i < WORKER_COUNT; i++) {
            const worker = startGeometryWorker();
            if (!worker) break;
            worker.onmessage = ({ data }) => this.#finish(data);
            worker.onerror   = event => this.#fallBack(event);
            this.#workers.push(worker);
        }
    }

    /** Number of workers (0: tiles are built on the main thread). */
    get workerCount() {
        return this.#workers.length;
    }

    /**
     * @param {Object} job - From {@link Tile#plan}.
     * @returns {Promise<import('./tileGeometry.js').TileGeometry>}
     */
    build(job) {
        return new Promise((resolve, reject) => {
            if (this.#workers.length === 0) {
                resolve(buildTileGeometry(job));
                return;
            }
            const id = ++this.#lastId;
            this.#pending.set(id, { job, resolve, reject });
            this.#workers[this.#next++ % this.#workers.length].postMessage({ id, job });
        });
    }

    /** Stops the workers. Builds still running are rejected, so nothing waits on them forever. */
    dispose() {
        for (const worker of this.#workers) worker.terminate();
        this.#workers = [];
        for (const { reject } of this.#pending.values()) reject(new Error('ThreeGeoPlay: the map was destroyed'));
        this.#pending.clear();
    }

    #finish({ id, geometry, error }) {
        const entry = this.#pending.get(id);
        if (!entry) return;
        this.#pending.delete(id);
        if (!error) {
            entry.resolve(geometry);
            return;
        }
        // Built again here: reports the error with its stack, or succeeds if it came from the worker.
        try {
            entry.resolve(buildTileGeometry(entry.job));
        } catch (err) {
            entry.reject(err);
        }
    }

    /** A worker could not start or crashed: build everything on the main thread from now on. */
    #fallBack(event) {
        event.preventDefault?.();
        if (this.#workers.length === 0) return;   // already fallen back
        console.warn(`ThreeGeoPlay: web workers are not available (${event.message ?? 'the worker could not start'}); tiles are built on the main thread.`);
        const pending = [...this.#pending.values()];
        this.#pending.clear();
        this.dispose();
        for (const { job, resolve, reject } of pending) {
            try {
                resolve(buildTileGeometry(job));
            } catch (err) {
                reject(err);
            }
        }
    }
}
