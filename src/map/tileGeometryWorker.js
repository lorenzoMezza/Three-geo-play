// Worker building tile geometry off the main thread (see tileGeometry.js and GeometryBuilder.js).
import { buildTileGeometry, geometryBuffers } from './tileGeometry.js';

self.onmessage = ({ data: { id, job } }) => {
    try {
        const geometry = buildTileGeometry(job);
        self.postMessage({ id, geometry }, geometryBuffers(geometry));
    } catch (err) {
        self.postMessage({ id, error: String(err?.message ?? err) });
    }
};
