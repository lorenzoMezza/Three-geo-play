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

    object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        beforeRender.call(this, renderer, scene, camera, geometry, material, group);
        depthWrite = material.depthWrite;
        material.depthWrite = false;
    };
    object.onAfterRender = function (renderer, scene, camera, geometry, material) {
        material.depthWrite = depthWrite;
    };
    keepShadowCulling(object, beforeRender);
}

/** Stencil bit used to blend transparent buildings at most once per pixel. */
const GLASS_STENCIL_BIT = 0x80;

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
 * 1. Depth pass: the object's own material with colour writes off — the same
 *    shader as the colour pass, so both compute the same depth bit for bit.
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
        material.colorWrite       = false;
        material.depthWrite       = true;
        material.stencilWrite     = true;
        material.stencilFunc      = THREE.AlwaysStencilFunc;
        material.stencilRef       = 0;
        material.stencilWriteMask = GLASS_STENCIL_BIT;
        material.stencilFail      = THREE.KeepStencilOp;
        material.stencilZFail     = THREE.KeepStencilOp;
        material.stencilZPass     = THREE.ReplaceStencilOp;
        if (twoPass) {
            material.side        = THREE.FrontSide;
            material.needsUpdate = true;
        }

        // three.js updates these right after onBeforeRender; the depth pass needs them now.
        this.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, this.matrixWorld);
        this.normalMatrix.getNormalMatrix(this.modelViewMatrix);
        renderer.renderBufferDirect(camera, scene, geometry, material, this, group);

        // 2. Colour: once per pixel, at the nearest depth.
        material.colorWrite      = saved.colorWrite;
        material.depthWrite      = saved.depthWrite;
        material.stencilFunc     = THREE.EqualStencilFunc;
        material.stencilFuncMask = GLASS_STENCIL_BIT;
        material.stencilZPass    = THREE.InvertStencilOp;
        if (twoPass) {
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
