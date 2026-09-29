import * as THREE from 'three';

import { drawWithoutDepthWrite, drawWithDepthPrepass } from './drawHooks.js';

/** Initial capacity of a batch; it doubles whenever it runs out of room. */
const INITIAL_VERTICES  = 1 << 15;
const INITIAL_INSTANCES = 32;

/**
 * `THREE.BatchedMesh` with the capacity management used here (resizing,
 * instance growth) exists since three r170.
 */
const BATCHING_SUPPORTED =
    typeof THREE.BatchedMesh === 'function' &&
    typeof THREE.BatchedMesh.prototype.setGeometrySize === 'function' &&
    typeof THREE.BatchedMesh.prototype.setInstanceCount === 'function' &&
    typeof THREE.BatchedMesh.prototype.addInstance === 'function';

/**
 * @typedef {Object} BatchDescriptor
 * @property {string}         kind          - 'line' | 'outline' | 'polygon' | 'building'
 * @property {THREE.Material} material
 * @property {number|null}    renderOrder   - `null` for solid geometry (buildings).
 * @property {boolean}        castShadow
 * @property {boolean}        receiveShadow
 * @property {boolean}        [depthPrepass] - Buildings: draw transparent materials with a depth pre-pass.
 */

/**
 * Draws the geometry of every tile that shares a material and a render order
 * with a single `THREE.BatchedMesh` (one multi-draw call), so the number of
 * draw calls no longer grows with the number of loaded tiles.
 *
 * Each tile geometry becomes one instance whose matrix places the tile, so
 * moving or rescaling tiles only updates matrices. Per-instance frustum culling
 * keeps off-screen tiles out of the draw.
 *
 * Falls back to one `THREE.Mesh` per tile when batching is unavailable
 * (three < r170) or the material has a custom shader, which cannot be batched.
 * @private
 */
export class MeshBatches {

    /** @type {THREE.Object3D} */
    #root;

    /** @type {Map<string, Batch>} */
    #batches = new Map();

    /** Batch or per-tile mesh behind each drawn object, for {@link featureAt}. @type {WeakMap<THREE.Object3D, Batch|MeshHandle>} */
    #owners = new WeakMap();

    /** Meshes drawing buildings, for {@link updateShadowCasting}. @type {Set<THREE.Mesh>} */
    #buildingMeshes = new Set();

    /**
     * @param {THREE.Object3D} root - Parent of the batched meshes.
     */
    constructor(root) {
        this.#root = root;
    }

    /**
     * Adds a tile geometry.
     * @param {BatchDescriptor} descriptor
     * @param {THREE.BufferGeometry} geometry - Consumed: do not reuse it.
     * @param {THREE.Object3D} tileObject - Parent for the per-tile fallback mesh.
     * @param {Array} ranges - Flat `[firstVertex, feature, …]` list: which feature each vertex range draws.
     * @param {Object} tile - The tile the geometry belongs to.
     * @returns {BatchHandle}
     */
    add(descriptor, geometry, tileObject, ranges, tile) {
        const { material } = descriptor;
        if (!BATCHING_SUPPORTED || material.isShaderMaterial) {
            const handle = new MeshHandle(descriptor, geometry, tileObject, { ranges, tile });
            this.#owners.set(handle.object, handle);
            if (descriptor.kind === 'building') this.#buildingMeshes.add(handle.object);
            return handle;
        }

        const key = [
            descriptor.kind, material.id, descriptor.renderOrder,
            descriptor.castShadow, descriptor.receiveShadow, descriptor.depthPrepass,
            geometry.hasAttribute('normal'), geometry.hasAttribute('color'),
        ].join('|');
        let batch = this.#batches.get(key);
        if (!batch) {
            batch = new Batch(descriptor, this.#root, () => this.#batches.delete(key));
            this.#batches.set(key, batch);
            this.#owners.set(batch.mesh, batch);
            if (descriptor.kind === 'building') this.#buildingMeshes.add(batch.mesh);
        }
        return batch.add(geometry, { ranges, tile });
    }

    /**
     * The feature drawn at a raycast intersection with one of the map meshes.
     * @param {THREE.Intersection} intersection
     * @returns {{ feature: Object, tile: Object } | null} The collected feature and its tile.
     */
    featureAt(intersection) {
        const owner = intersection?.object && this.#owners.get(intersection.object);
        return owner ? owner.featureAt(intersection) : null;
    }

    /**
     * Glass lets the light through: buildings cast shadows only while their
     * material is opaque — otherwise the ground seen through them shows the
     * shadow of every inner wall. Called every frame, since a material can
     * become transparent at any time.
     */
    updateShadowCasting() {
        for (const mesh of this.#buildingMeshes) {
            if (!mesh.parent) {
                this.#buildingMeshes.delete(mesh);   // removed with its tile or batch
                continue;
            }
            const { material } = mesh;
            mesh.castShadow = mesh.userData.castShadow && !(material.transparent && material.opacity < 1);
        }
    }

    /** Gives memory back from batches that are mostly free space (see Batch#trim). Call it while the map is idle. */
    trim() {
        for (const batch of this.#batches.values()) batch.trim();
    }

    /** Number of batched meshes (one draw call each). */
    get size() {
        return this.#batches.size;
    }

    dispose() {
        for (const batch of [...this.#batches.values()]) batch.dispose();
        this.#batches.clear();
        this.#buildingMeshes.clear();
    }
}

/**
 * @typedef {Object} BatchHandle
 * @property {(matrix: THREE.Matrix4) => void} setMatrix
 * @property {() => void} remove
 */

class Batch {

    /** @type {THREE.BatchedMesh} */
    mesh;
    #capacity = INITIAL_VERTICES;
    #freedVertices = 0;
    #count = 0;
    #onEmpty;

    /** Features drawn by each instance. @type {Map<number, { geometryId: number, ranges: Array, tile: Object }>} */
    #instances = new Map();

    constructor(descriptor, root, onEmpty) {
        this.#onEmpty = onEmpty;
        const mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_VERTICES * 2, descriptor.material);
        mesh.name                   = 'ThreeGeoPlayBatch';
        mesh.layers.mask            = root.layers.mask;
        mesh.matrixAutoUpdate       = false;
        mesh.frustumCulled          = false;  // culled per tile instead
        mesh.perObjectFrustumCulled = true;
        mesh.sortObjects            = descriptor.kind === 'building';  // front to back (early depth rejection)
        setUpDraw(mesh, descriptor);
        root.add(mesh);
        this.mesh = mesh;
    }

    add(geometry, { ranges, tile }) {
        const vertices = geometry.getAttribute('position').count;
        this.#reserve(vertices);
        const mesh = this.mesh;
        const geometryId = mesh.addGeometry(geometry);
        geometry.dispose();

        if (mesh.instanceCount >= mesh.maxInstanceCount) mesh.setInstanceCount(mesh.maxInstanceCount * 2);
        const instanceId = mesh.addInstance(geometryId);
        this.#instances.set(instanceId, { geometryId, ranges, tile });
        this.#count++;

        let removed = false;
        return {
            setMatrix: matrix => { if (!removed) mesh.setMatrixAt(instanceId, matrix); },
            remove: () => {
                if (removed) return;
                removed = true;
                this.#instances.delete(instanceId);
                this.#remove(geometryId, vertices);
            },
        };
    }

    featureAt(intersection) {
        const entry = this.#instances.get(intersection.batchId);
        if (!entry || !Number.isInteger(intersection.faceIndex)) return null;
        // Raycast face indices count from the start of the whole batch buffer.
        const start = typeof this.mesh.getGeometryRangeAt === 'function'
            ? this.mesh.getGeometryRangeAt(entry.geometryId).start
            : this.mesh._geometryInfo[entry.geometryId].start;
        return featureOfVertex(entry, intersection.faceIndex * 3 - start);
    }

    /**
     * Gives memory back when more than half of the batch is left by removed tiles:
     * compacts it and shrinks it to fit. Meant for when the map is idle, as it uploads the whole batch.
     */
    trim() {
        if (this.#freedVertices <= this.#capacity / 2) return;
        this.mesh.optimize();
        this.#freedVertices = 0;
        const used = this.#capacity - this.mesh.unusedVertexCount;
        let capacity = this.#capacity;
        while (capacity > INITIAL_VERTICES && capacity / 2 >= used * 1.5) capacity /= 2;
        if (capacity < this.#capacity) {
            this.mesh.setGeometrySize(capacity, capacity * 2);
            this.#capacity = capacity;
        }
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.dispose();
        this.#onEmpty();
    }

    #remove(geometryId, vertices) {
        this.mesh.deleteGeometry(geometryId);
        this.#freedVertices += vertices;
        if (--this.#count === 0) this.dispose();
    }

    /** Makes room for `vertices` more vertices: compacts freed space first, grows if needed. */
    #reserve(vertices) {
        const mesh = this.mesh;
        if (mesh.unusedVertexCount >= vertices) return;
        if (this.#freedVertices > 0) {
            mesh.optimize();
            this.#freedVertices = 0;
            if (mesh.unusedVertexCount >= vertices) return;
        }
        const used = this.#capacity - mesh.unusedVertexCount;
        let capacity = this.#capacity * 2;
        while (capacity < used + vertices) capacity *= 2;
        mesh.setGeometrySize(capacity, capacity * 2);
        this.#capacity = capacity;
    }
}

/** Fallback: one plain mesh per tile geometry, child of the tile object. */
class MeshHandle {

    #mesh;
    #entry;

    constructor(descriptor, geometry, tileObject, entry) {
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, descriptor.material);
        mesh.matrixAutoUpdate = false;
        mesh.layers.mask      = tileObject.layers.mask;
        setUpDraw(mesh, descriptor);
        tileObject.add(mesh);
        this.#mesh  = mesh;
        this.#entry = entry;
    }

    /** @type {THREE.Mesh|null} */
    get object() { return this.#mesh; }

    featureAt(intersection) {
        if (!this.#mesh || !Number.isInteger(intersection.faceIndex)) return null;
        return featureOfVertex(this.#entry, intersection.faceIndex * 3);
    }

    setMatrix() {
        // Positioned through the tile object.
    }

    remove() {
        if (!this.#mesh) return;
        this.#mesh.removeFromParent();
        this.#mesh.geometry.dispose();
        this.#mesh = null;
    }
}

/**
 * Configures how a map mesh is drawn. The material is never modified:
 * flat layers only skip depth writes during their own draw, and buildings are
 * plain solid geometry (with a depth pre-pass when their material is transparent).
 *
 * @param {THREE.Mesh} mesh
 * @param {BatchDescriptor} descriptor
 */
function setUpDraw(mesh, { kind, renderOrder, castShadow, receiveShadow, depthPrepass }) {
    mesh.userData.kind         = kind;
    mesh.userData.threeGeoPlay = true;
    mesh.userData.castShadow   = !!castShadow;   // the style's setting (see MeshBatches#updateShadowCasting)
    mesh.castShadow    = !!castShadow;
    mesh.receiveShadow = !!receiveShadow;
    if (kind === 'building') {
        if (depthPrepass) drawWithDepthPrepass(mesh);
        return;
    }
    // Flat map layers are stacked by render order instead of depth.
    mesh.renderOrder = renderOrder;
    drawWithoutDepthWrite(mesh);
}

/**
 * The feature whose vertex range contains `vertex`: the last range starting at
 * or before it (ranges of features that drew nothing are empty and skipped).
 * @param {{ ranges: Array, tile: Object }} entry
 * @param {number} vertex - Vertex index in the tile geometry.
 */
function featureOfVertex({ ranges, tile }, vertex) {
    let lo = 0;
    let hi = ranges.length / 2 - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ranges[mid * 2] <= vertex) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found < 0 ? null : { feature: ranges[found * 2 + 1], tile };
}
