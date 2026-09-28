import * as THREE from 'three';

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
 * @property {string}         kind        - 'line' | 'outline' | 'polygon' | 'building'
 * @property {THREE.Material} material
 * @property {number|null}    renderOrder - `null` for depth-tested geometry (buildings).
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
     * @returns {BatchHandle}
     */
    add(descriptor, geometry, tileObject) {
        const { material } = descriptor;
        if (!BATCHING_SUPPORTED || material.isShaderMaterial) {
            return new MeshHandle(descriptor, geometry, tileObject);
        }

        const key = `${descriptor.kind}|${material.id}|${descriptor.renderOrder}|${geometry.hasAttribute('normal')}`;
        let batch = this.#batches.get(key);
        if (!batch) {
            batch = new Batch(descriptor, this.#root, () => this.#batches.delete(key));
            this.#batches.set(key, batch);
        }
        return batch.add(geometry);
    }

    /** Number of batched meshes (one draw call each). */
    get size() {
        return this.#batches.size;
    }

    dispose() {
        for (const batch of [...this.#batches.values()]) batch.dispose();
        this.#batches.clear();
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

    constructor({ kind, material, renderOrder }, root, onEmpty) {
        this.#onEmpty = onEmpty;
        const mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_VERTICES * 2, material);
        mesh.name                   = 'ThreeGeoPlayBatch';
        mesh.userData.kind          = kind;
        mesh.matrixAutoUpdate       = false;
        mesh.frustumCulled          = false;  // culled per tile instead
        mesh.perObjectFrustumCulled = true;
        mesh.sortObjects            = renderOrder === null || renderOrder === undefined;
        if (!mesh.sortObjects) {
            // Flat map layers are stacked by render order instead of depth.
            material.depthTest = false;
            mesh.renderOrder   = renderOrder;
        }
        root.add(mesh);
        this.mesh = mesh;
    }

    add(geometry) {
        const vertices = geometry.getAttribute('position').count;
        this.#reserve(vertices);
        const mesh = this.mesh;
        const geometryId = mesh.addGeometry(geometry);
        geometry.dispose();

        if (mesh.instanceCount >= mesh.maxInstanceCount) mesh.setInstanceCount(mesh.maxInstanceCount * 2);
        const instanceId = mesh.addInstance(geometryId);
        this.#count++;

        let removed = false;
        return {
            setMatrix: matrix => { if (!removed) mesh.setMatrixAt(instanceId, matrix); },
            remove: () => {
                if (removed) return;
                removed = true;
                this.#remove(geometryId, vertices);
            },
        };
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

    constructor({ kind, material, renderOrder }, geometry, tileObject) {
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.userData.kind    = kind;
        if (renderOrder !== null && renderOrder !== undefined) {
            material.depthTest = false;
            mesh.renderOrder   = renderOrder;
        }
        tileObject.add(mesh);
        this.#mesh = mesh;
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
