import * as THREE from 'three';

import { drawWithoutDepthWrite, drawWithDepthPrepass, setFlatOrder } from './drawHooks.js';

/** Initial capacity of a batch; vertices and indices each double whenever they run out of room. */
const INITIAL_VERTICES  = 1 << 12;  // most batches hold a few hundred vertices; the big ones double in a few steps
const INITIAL_INDICES   = INITIAL_VERTICES * 2;
const INITIAL_INSTANCES = 64;  // room for every tile of a usual scene (≤ 50) without regrowing

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

    /** Flat layers drawn front to back ({@link MapConfig#flatLayersFrontToBack}). */
    #frontToBack = false;

    /** Meshes drawing flat layers, for {@link setFrontToBack}. @type {Set<THREE.Mesh>} */
    #flatMeshes = new Set();

    /**
     * @param {THREE.Object3D} root - Parent of the batched meshes.
     * @param {{ frontToBack?: boolean }} [options]
     */
    constructor(root, { frontToBack = false } = {}) {
        this.#root = root;
        this.#frontToBack = !!frontToBack;
    }

    /**
     * Draws the flat layers front to back, or in painter's order (see drawHooks.js
     * setFlatOrder): applied to the meshes there are and to the ones made later.
     * @param {boolean} frontToBack
     */
    setFrontToBack(frontToBack) {
        this.#frontToBack = !!frontToBack;
        for (const mesh of this.#flatMeshes) setFlatOrder(mesh, mesh.userData.flatOrder, this.#frontToBack);
    }

    /**
     * Adds a tile geometry.
     * @param {BatchDescriptor} descriptor
     * @param {THREE.BufferGeometry} geometry - Consumed: do not reuse it.
     * @param {THREE.Object3D} tileObject - Parent for the per-tile fallback mesh.
     * @param {Array} ranges - Flat `[firstCorner, feature, …]` list: which feature each range of corners (index entries) draws.
     * @param {Object} tile - The tile the geometry belongs to.
     * @returns {BatchHandle}
     */
    add(descriptor, geometry, tileObject, ranges, tile) {
        const { material } = descriptor;
        const flat = descriptor.kind !== 'building';
        if (!BATCHING_SUPPORTED || material.isShaderMaterial) {
            const handle = new MeshHandle(descriptor, geometry, tileObject, { ranges, tile }, this.#frontToBack, mesh => this.#flatMeshes.delete(mesh));
            this.#owners.set(handle.object, handle);
            if (flat) this.#flatMeshes.add(handle.object);
            else this.#buildingMeshes.add(handle.object);
            return handle;
        }

        const key = [
            descriptor.kind, material.id, descriptor.renderOrder,
            descriptor.castShadow, descriptor.receiveShadow, descriptor.depthPrepass,
            geometry.hasAttribute('normal'), geometry.hasAttribute('color'),
        ].join('|');
        let batch = this.#batches.get(key);
        if (!batch) {
            const created = new Batch(descriptor, this.#root, this.#frontToBack, () => {
                this.#batches.delete(key);
                this.#flatMeshes.delete(created.mesh);
            });
            batch = created;
            this.#batches.set(key, batch);
            this.#owners.set(batch.mesh, batch);
            if (flat) this.#flatMeshes.add(batch.mesh);
            else this.#buildingMeshes.add(batch.mesh);
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
        this.#flatMeshes.clear();
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
    #vertexCapacity = INITIAL_VERTICES;
    #indexCapacity = INITIAL_INDICES;
    #freedVertices = 0;
    #freedIndices = 0;
    #count = 0;
    #onEmpty;

    /** Features drawn by each instance. @type {Map<number, { geometryId: number, ranges: Array, tile: Object }>} */
    #instances = new Map();

    constructor(descriptor, root, frontToBack, onEmpty) {
        this.#onEmpty = onEmpty;
        const mesh = new THREE.BatchedMesh(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_INDICES, descriptor.material);
        mesh.name                   = 'ThreeGeoPlayBatch';
        mesh.layers.mask            = root.layers.mask;
        mesh.matrixAutoUpdate       = false;
        mesh.frustumCulled          = false;  // culled per tile instead
        mesh.perObjectFrustumCulled = true;
        mesh.sortObjects            = descriptor.kind === 'building';  // front to back (early depth rejection)
        setUpDraw(mesh, descriptor, frontToBack);
        root.add(mesh);
        this.mesh = mesh;
    }

    add(geometry, { ranges, tile }) {
        const vertices = geometry.getAttribute('position').count;
        const indices  = geometry.index?.count ?? 0;
        this.#reserve(vertices, indices);
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
                this.#remove(geometryId, vertices, indices);
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
        if (this.#freedVertices <= this.#vertexCapacity / 2 && this.#freedIndices <= this.#indexCapacity / 2) return;
        this.mesh.optimize();
        this.#freedVertices = 0;
        this.#freedIndices = 0;
        const vertexCapacity = shrunk(this.#vertexCapacity, INITIAL_VERTICES, this.#vertexCapacity - this.mesh.unusedVertexCount);
        const indexCapacity  = shrunk(this.#indexCapacity, INITIAL_INDICES, this.#indexCapacity - this.mesh.unusedIndexCount);
        if (vertexCapacity < this.#vertexCapacity || indexCapacity < this.#indexCapacity) {
            this.mesh.setGeometrySize(vertexCapacity, indexCapacity);
            this.#vertexCapacity = vertexCapacity;
            this.#indexCapacity = indexCapacity;
        }
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.dispose();
        this.#onEmpty();
    }

    #remove(geometryId, vertices, indices) {
        this.mesh.deleteGeometry(geometryId);
        this.#freedVertices += vertices;
        this.#freedIndices += indices;
        if (--this.#count === 0) this.dispose();
    }

    /** Makes room for `vertices` more vertices and `indices` more indices: compacts freed space first, grows if needed. */
    #reserve(vertices, indices) {
        const mesh = this.mesh;
        const fits = () => mesh.unusedVertexCount >= vertices && mesh.unusedIndexCount >= indices;
        if (fits()) return;
        if (this.#freedVertices > 0 || this.#freedIndices > 0) {
            mesh.optimize();
            this.#freedVertices = 0;
            this.#freedIndices = 0;
            if (fits()) return;
        }
        const vertexCapacity = grown(this.#vertexCapacity, this.#vertexCapacity - mesh.unusedVertexCount + vertices);
        const indexCapacity  = grown(this.#indexCapacity, this.#indexCapacity - mesh.unusedIndexCount + indices);
        mesh.setGeometrySize(vertexCapacity, indexCapacity);
        this.#vertexCapacity = vertexCapacity;
        this.#indexCapacity = indexCapacity;
    }
}

/** The capacity doubled until `needed` fits (unchanged when it already does). */
function grown(capacity, needed) {
    while (capacity < needed) capacity *= 2;
    return capacity;
}

/** The capacity halved while half of it still leaves 50 % of room over `used` (never below `minimum`). */
function shrunk(capacity, minimum, used) {
    while (capacity > minimum && capacity / 2 >= used * 1.5) capacity /= 2;
    return capacity;
}

/** Fallback: one plain mesh per tile geometry, child of the tile object. */
class MeshHandle {

    #mesh;
    #entry;
    #onRemove;

    constructor(descriptor, geometry, tileObject, entry, frontToBack = false, onRemove = () => {}) {
        this.#onRemove = onRemove;
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, descriptor.material);
        mesh.matrixAutoUpdate = false;
        mesh.layers.mask      = tileObject.layers.mask;
        setUpDraw(mesh, descriptor, frontToBack);
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
        this.#onRemove(this.#mesh);
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
 * @param {boolean} [frontToBack=false] - Flat layers: drawn front to back (drawHooks.js setFlatOrder).
 */
function setUpDraw(mesh, { kind, renderOrder, castShadow, receiveShadow, depthPrepass }, frontToBack = false) {
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
    drawWithoutDepthWrite(mesh);
    setFlatOrder(mesh, renderOrder, frontToBack);
}

/**
 * The feature whose range of corners contains `vertex`: the last range starting at
 * or before it (ranges of features that drew nothing are empty and skipped).
 * @param {{ ranges: Array, tile: Object }} entry
 * @param {number} vertex - Corner (index entry) in the tile geometry: 3 × the face index.
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
