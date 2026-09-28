import * as THREE from 'three';

/**
 * Per-object render hooks that change how a map mesh is drawn without touching
 * its material outside of that draw: materials belong to the user's style and
 * may be shared with other objects of the scene.
 * @private
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

/**
 * Draws a transparent material in two passes: depth first, then colour where
 * the depth matches. Only the surface nearest to the camera is blended, so the
 * walls behind a building, the walls between two buildings and the buildings
 * behind it stay hidden — a clean "glass" look instead of a tangle of faces.
 * Opaque materials are drawn normally (one pass).
 *
 * Both passes run where three.js draws the transparent material, i.e. after
 * every opaque object: opaque objects behind the buildings stay visible
 * through them.
 *
 * @param {THREE.Mesh} object - A `THREE.Mesh` or `THREE.BatchedMesh`.
 * @returns {THREE.Material} The depth pass material (dispose it with the object).
 */
export function drawWithDepthPrepass(object) {
    const beforeRender = object.onBeforeRender;
    const prepass = new THREE.MeshBasicMaterial({ colorWrite: false, fog: false });
    prepass.name = 'ThreeGeoPlayDepthPrepass';

    object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        beforeRender.call(this, renderer, scene, camera, geometry, material, group);
        if (!material.transparent) return;

        copyDepthState(prepass, material);
        // three.js updates these right after onBeforeRender; the depth pass needs them now.
        this.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, this.matrixWorld);
        this.normalMatrix.getNormalMatrix(this.modelViewMatrix);
        renderer.renderBufferDirect(camera, scene, geometry, prepass, this, group);
    };
    keepShadowCulling(object, beforeRender);
    return prepass;
}

/** Makes the depth pass cover exactly what the colour pass draws. */
function copyDepthState(prepass, material) {
    prepass.side                = material.side;
    prepass.wireframe           = material.wireframe;
    prepass.depthTest           = material.depthTest;
    prepass.depthFunc           = material.depthFunc;
    prepass.clippingPlanes      = material.clippingPlanes;
    prepass.clipIntersection    = material.clipIntersection;
    prepass.polygonOffset       = material.polygonOffset;
    prepass.polygonOffsetFactor = material.polygonOffsetFactor;
    prepass.polygonOffsetUnits  = material.polygonOffsetUnits;
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
