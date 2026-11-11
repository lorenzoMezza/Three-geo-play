import * as THREE from 'three';

/**
 * Per-object render hooks that change how a map mesh is drawn without touching
 * its material outside of that draw: materials belong to the user's style and
 * may be shared with other objects of the scene.
 */

/**
 * Draws a flat map layer without writing depth.
 *
 * Flat layers lie on (almost) the same plane and are stacked by render order:
 * writing depth would make them fight each other. They are still depth tested,
 * so buildings and scene objects in front of them hide them, whatever the
 * transparency of their materials. The material's `depthWrite` is switched off
 * for this object's draw only and restored right after.
 *
 * @param {THREE.Mesh} object - A `THREE.Mesh` or `THREE.BatchedMesh`.
 */
export function drawWithoutDepthWrite(object) {
    const beforeRender = object.onBeforeRender;   // BatchedMesh: per-instance culling
    let depthWrite = true;
    const saved = {};
    let claiming = false;

    object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        beforeRender.call(this, renderer, scene, camera, geometry, material, group);
        depthWrite = material.depthWrite;
        material.depthWrite = false;
        // Front to back (see setFlatOrder): a pixel belongs to the first layer drawn on it
        claiming = this.userData.frontToBack === true && !material.transparent;
        if (!claiming) return;
        for (const key of CLAIM_STATE) saved[key] = material[key];
        material.stencilWrite     = true;
        material.stencilRef       = 0;
        material.stencilFunc      = THREE.EqualStencilFunc;
        material.stencilFuncMask  = FLAT_STENCIL_BIT;
        material.stencilWriteMask = FLAT_STENCIL_BIT;
        material.stencilFail      = THREE.KeepStencilOp;
        material.stencilZFail     = THREE.KeepStencilOp;
        material.stencilZPass     = THREE.InvertStencilOp;
    };
    object.onAfterRender = function (renderer, scene, camera, geometry, material) {
        material.depthWrite = depthWrite;
        if (!claiming) return;
        claiming = false;
        for (const key of CLAIM_STATE) material[key] = saved[key];
    };
    keepShadowCulling(object, beforeRender);
}

/** Stencil bit used to blend transparent buildings at most once per pixel. */
export const GLASS_STENCIL_BIT = 0x80;

/**
 * Stencil bit set by the first flat layer drawn on a pixel when the flat layers are
 * drawn front to back ({@link MapConfig#flatLayersFrontToBack}).
 */
export const FLAT_STENCIL_BIT = 0x10;

/** Material settings changed while a flat layer claims its pixels, restored afterwards. */
const CLAIM_STATE = [
    'stencilWrite', 'stencilRef', 'stencilFunc', 'stencilFuncMask', 'stencilWriteMask',
    'stencilFail', 'stencilZFail', 'stencilZPass',
];

/**
 * Render orders of the flat layers drawn front to back: `FRONT_TO_BACK_BASE - order`, so
 * the topmost layer comes first, all of them before the scene's own objects (order 0).
 */
const FRONT_TO_BACK_BASE = -5000;

/** Among layers of one order three.js draws the lower material id first: reversed too. */
const MATERIAL_ORDER_STEP = 1e-9;

/**
 * Sets when a flat map mesh is drawn among the others.
 *
 * Painter's order (the default): lowest `order` first, each layer over the ones before
 * it. Every pixel is then shaded once per layer lying on it — the ground, the land use
 * on it, the road's edge, the road — and only the last one is seen.
 *
 * Front to back (`frontToBack`): the same picture drawn the other way round. The topmost
 * layer is drawn first and marks its pixels in the stencil ({@link FLAT_STENCIL_BIT});
 * the layers below skip the pixels already marked, before their shader runs. Each pixel
 * is shaded once. What ends up on screen is the same, sample by sample (also with
 * multisampling): the topmost layer covering it. Only for opaque materials: a
 * transparent one must be blended over what is below it, so it keeps the painter's order.
 *
 * @param {THREE.Mesh} mesh - Set up with {@link drawWithoutDepthWrite}.
 * @param {number} order - The style's `renderingOrder`.
 * @param {boolean} frontToBack
 */
export function setFlatOrder(mesh, order, frontToBack) {
    const material = mesh.material;
    const claims = !!frontToBack && !!material && !Array.isArray(material) && !material.transparent;
    mesh.userData.flatOrder   = order;
    mesh.userData.frontToBack = claims;
    mesh.renderOrder = claims ? FRONT_TO_BACK_BASE - order - material.id * MATERIAL_ORDER_STEP : order;
}

/**
 * Stencil bit set wherever the ground plane is drawn ({@link MapConfig#occludeBelowGround}):
 * a backdrop drawn after it (a sky) can skip these pixels, which the map covers.
 */
export const GROUND_STENCIL_BIT = 0x20;

/** Material settings changed during the two passes, restored afterwards. */
const PASS_STATE = [
    'colorWrite', 'depthWrite', 'side', 'stencilWrite', 'stencilWriteMask', 'stencilFunc',
    'stencilRef', 'stencilFuncMask', 'stencilFail', 'stencilZFail', 'stencilZPass',
];

let warnedNoStencil = false;

/**
 * Draws a transparent material as a single layer of "glass": each pixel is
 * blended once, with the surface nearest to the camera. The walls behind a
 * building, the walls between two buildings and the buildings behind it stay
 * hidden — and so do the duplicated or overlapping faces found in real tile
 * data (outlines drawn together with their `building:part`s, repeated
 * footprints, parts sharing walls), which would otherwise be blended twice
 * where they coincide and flicker as the camera moves.
 * Opaque materials are drawn normally (one pass).
 *
 * 1. Depth pass: colour writes off, with the vertex stage of the object's own
 *    material, so both passes compute the same depth bit for bit, and a fragment
 *    stage that does nothing (see {@link depthPassMaterial}): no colour is
 *    written, so shading the pixels would be wasted work.
 *    It also clears {@link GLASS_STENCIL_BIT} where the buildings are drawn.
 * 2. Colour pass (drawn by three.js right after): a fragment is blended only
 *    at the nearest depth and only while the stencil bit is clear; blending
 *    sets the bit, so a coinciding face cannot be blended a second time.
 *
 * Material settings are changed for these draws only and restored right after.
 * Without a stencil buffer (`new THREE.WebGLRenderer({ stencil: true })`) the
 * stencil test does nothing: coinciding faces are then blended twice.
 * Both passes run where three.js draws the transparent material, i.e. after
 * every opaque object: opaque objects behind the buildings stay visible.
 *
 * @param {THREE.Mesh} object - A `THREE.Mesh` or `THREE.BatchedMesh`.
 */
export function drawWithDepthPrepass(object) {
    const beforeRender = object.onBeforeRender;
    const saved = {};
    let changed = false;

    object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        beforeRender.call(this, renderer, scene, camera, geometry, material, group);
        // The depth pass needs WebGLRenderer#renderBufferDirect (not available with WebGPURenderer).
        if (!material.transparent || typeof renderer.renderBufferDirect !== 'function') return;
        warnWithoutStencil(renderer);

        for (const key of PASS_STATE) saved[key] = material[key];
        changed = true;

        // 1. Depth of the nearest surface; clear the stencil bit there.
        // Two-sided transparent materials are drawn back faces first, then front
        // faces, each with a single-sided shader: write the depth with the front one.
        const twoPass = material.side === THREE.DoubleSide && !material.forceSinglePass;
        const twin    = depthPassMaterial(material, renderer, twoPass ? THREE.FrontSide : material.side);
        const depth   = twin ?? material;
        depth.colorWrite  = false;
        depth.depthWrite  = true;
        setGlassStencil(depth);
        depth.stencilFunc  = THREE.AlwaysStencilFunc;
        depth.stencilZPass = THREE.ReplaceStencilOp;
        if (!twin && twoPass) {
            material.side        = THREE.FrontSide;
            material.needsUpdate = true;
        }

        // three.js updates these right after onBeforeRender; the depth pass needs them now.
        this.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, this.matrixWorld);
        this.normalMatrix.getNormalMatrix(this.modelViewMatrix);
        renderer.renderBufferDirect(camera, scene, geometry, depth, this, group);

        // 2. Colour: once per pixel, at the nearest depth.
        material.colorWrite      = saved.colorWrite;
        material.depthWrite      = saved.depthWrite;
        setGlassStencil(material);
        material.stencilFunc     = THREE.EqualStencilFunc;
        material.stencilFuncMask = GLASS_STENCIL_BIT;
        material.stencilZPass    = THREE.InvertStencilOp;
        if (!twin && twoPass) {
            material.side        = saved.side;
            material.needsUpdate = true;
        }
    };
    object.onAfterRender = function (renderer, scene, camera, geometry, material) {
        if (!changed) return;
        changed = false;
        for (const key of PASS_STATE) {
            if (key !== 'side') material[key] = saved[key];
        }
    };
    keepShadowCulling(object, beforeRender);
}

/** Stencil settings both glass passes share: they write {@link GLASS_STENCIL_BIT} only. */
function setGlassStencil(material) {
    material.stencilWrite     = true;
    material.stencilRef       = 0;
    material.stencilWriteMask = GLASS_STENCIL_BIT;
    material.stencilFail      = THREE.KeepStencilOp;
    material.stencilZFail     = THREE.KeepStencilOp;
}

/** Depth-pass twins of materials (see {@link depthPassMaterial}). */
const depthTwins = new WeakMap();

/**
 * The material of a depth pass for `material`: a copy whose fragment stage does
 * nothing, so the pixels are not shaded for a pass that writes no colour. Its
 * vertex stage is the material's own (the same shader text, the same depth bit
 * for bit). Only when the fragment stage of `material` cannot drop a fragment or
 * change its depth: built-in materials without alpha test, alpha hash or
 * clipping planes, without an `onBeforeCompile` of their own, and no
 * logarithmic depth buffer. Otherwise `null`: the material itself is used.
 * @param {THREE.Material} material
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Side} side
 * @returns {THREE.Material|null}
 */
function depthPassMaterial(material, renderer, side) {
    const ownCompile = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile');
    if (material.isShaderMaterial || ownCompile || material.alphaTest > 0 || material.alphaHash
        || material.clippingPlanes?.length || renderer.clippingPlanes?.length
        || renderer.capabilities?.logarithmicDepthBuffer) return null;

    let twin = depthTwins.get(material);
    if (twin && twin.userData.sourceVersion === material.version && twin.side === side) return twin;
    twin?.dispose();
    twin = material.clone();
    twin.defines = material.defines;
    twin.side    = side;
    twin.userData = { sourceVersion: material.version };
    // The vertex stage as the material's (its onBeforeCompile is the shared one of
    // its class), a fragment stage that only writes a constant (never seen)
    twin.onBeforeCompile = (shader, r) => {
        material.onBeforeCompile(shader, r);
        shader.fragmentShader = 'void main() { gl_FragColor = vec4(0.0); }';
    };
    twin.customProgramCacheKey = () => `${material.customProgramCacheKey()}|depth-pass`;
    depthTwins.set(material, twin);
    return twin;
}

/** Tells once that transparent buildings need a stencil buffer to be blended once per pixel. */
function warnWithoutStencil(renderer) {
    if (warnedNoStencil) return;
    const target  = renderer.getRenderTarget();
    const stencil = target ? target.stencilBuffer : renderer.getContext().getContextAttributes()?.stencil;
    if (stencil) return;
    warnedNoStencil = true;
    console.warn('ThreeGeoPlay: transparent buildings are drawn without a stencil buffer, so faces that coincide in the tile data (overlapping building parts) are blended twice and can flicker. Create the renderer with new THREE.WebGLRenderer({ stencil: true }) (and render targets, such as those of an EffectComposer, with stencilBuffer: true).');
}

/**
 * `BatchedMesh` culls its instances for the shadow camera by calling
 * `onBeforeRender`: keep that culling for shadows, without the hooks above.
 */
function keepShadowCulling(object, beforeRender) {
    if (!object.isBatchedMesh) return;
    object.onBeforeShadow = function (renderer, _object, _camera, shadowCamera, geometry, depthMaterial) {
        beforeRender.call(this, renderer, null, shadowCamera, geometry, depthMaterial);
    };
}
