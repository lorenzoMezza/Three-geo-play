import { MapStyle }  from "./style/MapStyle";
import { MapConfig, ViewMode } from "./config/MapConfig";
import { TileManager } from "./map/TileManager";

/**
 * Main entry point for ThreeGeoPlay — a geographic map renderer built on Three.js.
 *
 * Instantiate once with your Three.js scene, camera and renderer, then call
 * {@link ThreeGeoPlay#start} to begin loading tiles and
 * {@link ThreeGeoPlay#onFrameUpdate} inside your animation loop to keep the map
 * in sync with the camera / follow-target.
 *
 * @example
 * const geoPlay = new ThreeGeoPlay(scene, camera, renderer);
 * geoPlay.start();
 *
 * function animate() {
 *   requestAnimationFrame(animate);
 *   geoPlay.onFrameUpdate();
 *   renderer.render(scene, camera);
 * }
 * animate();
 *
 * @class
 */
export class ThreeGeoPlay {

    /** @type {boolean} */
    #isStarted = false;

    /** @type {number} */
    #lastTime = Date.now();

    /** @type {MapConfig} */
    #mapConfig = null;

    /** @type {MapStyle} */
    #mapStyle = null;

    /** @type {THREE.Scene} */
    #scene = null;

    /** @type {THREE.Camera} */
    #camera = null;

    /** @type {THREE.WebGLRenderer} */
    #renderer = null;

    /**
     * The Three.js Object3D whose position the map tracks in {@link ViewMode.FOLLOW_TARGET} mode.
     * Defaults to the camera passed to the constructor.
     * @type {THREE.Object3D}
     */
    #followTarget = null;

    /**
     * @param {THREE.Scene}         threeScene    - Three.js scene.
     * @param {THREE.Camera}        threeCamera   - Three.js camera (also the default follow target).
     * @param {THREE.WebGLRenderer} threeRenderer - Three.js renderer.
     * @throws {Error} If any parameter is missing.
     */
    constructor(threeScene, threeCamera, threeRenderer) {
        this.#validateConstructorParams(threeScene, threeCamera, threeRenderer);

        this.#scene         = threeScene;
        this.#camera        = threeCamera;
        this.#followTarget  = threeCamera;
        this.#renderer      = threeRenderer;
        threeRenderer.localClippingEnabled = true;
        this.#mapConfig     = new MapConfig();
        this.#mapStyle      = new MapStyle();
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * @param {THREE.Scene}         scene
     * @param {THREE.Camera}        camera
     * @param {THREE.WebGLRenderer} renderer
     * @throws {Error}
     * @private
     */
    #validateConstructorParams(scene, camera, renderer) {
        if (!scene)    throw new Error("ThreeGeoPlay: threeScene is required");
        if (!camera)   throw new Error("ThreeGeoPlay: threeCamera is required");
        if (!renderer) throw new Error("ThreeGeoPlay: threeRenderer is required");
    }

    /**
     * @param {MapConfig} config
     * @returns {boolean}
     * @private
     */
    #validateConfig(config) {
        if (!config) return false;
        if (!(config instanceof MapConfig)) {
            console.warn("ThreeGeoPlay: MapConfig must be an instance of MapConfig");
            return false;
        }
        return true;
    }

    /**
     * @param {MapStyle} style
     * @returns {boolean}
     * @private
     */
    #validateStyle(style) {
        if (!style) return false;
        if (!(style instanceof MapStyle)) {
            console.warn("ThreeGeoPlay: MapStyle must be an instance of MapStyle");
            return false;
        }
        return true;
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Sets the object the map will follow in {@link ViewMode.FOLLOW_TARGET} mode.
     * If the current `viewMode` is not `FOLLOW_TARGET` it is switched automatically.
     *
     * @param {THREE.Object3D} target - Any Three.js Object3D (mesh, group, camera, …).
     * @throws {Error} If `target` is not a valid Three.js Object3D with a position.
     *
     * @example
     * const playerMesh = new THREE.Mesh(geometry, material);
     * geoPlay.setFollowTarget(playerMesh);
     */
    setFollowTarget(target) {
        if (!target) {
            throw new Error("ThreeGeoPlay: Follow target cannot be null or undefined");
        }
        if (!target.isObject3D) {
            throw new Error("ThreeGeoPlay: Follow target must be a Three.js Object3D (e.g., Camera, Mesh, Group)");
        }
        if (!target.position || typeof target.position.x !== 'number' || typeof target.position.z !== 'number') {
            throw new Error("ThreeGeoPlay: Follow target must have a valid position property with x and z coordinates");
        }

        this.#followTarget = target;

        if (this.#mapConfig.viewMode !== ViewMode.FOLLOW_TARGET) {
            console.warn("ThreeGeoPlay: ViewMode was not set to FOLLOW_TARGET. Automatically switching to FOLLOW_TARGET mode.");
            this.#mapConfig.viewMode = ViewMode.FOLLOW_TARGET;
        }
    }

    /**
     * Moves the map origin to the given geographic coordinates.
     * Only effective in {@link ViewMode.MANUAL} or `STATIC` mode — ignored (with a warning)
     * in {@link ViewMode.FOLLOW_TARGET}.
     *
     * @param {number} lat - Latitude in degrees (−90 … 90).
     * @param {number} lon - Longitude in degrees (−180 … 180).
     * @throws {Error} If either coordinate is out of range or not a number.
     *
     * @example
     * geoPlay.getMapConfig().viewMode = ViewMode.MANUAL;
     * geoPlay.moveMapOriginToLatLon(48.8566, 2.3522); // Paris
     */
    moveMapOriginToLatLon(lat, lon) {
        if (this.#mapConfig.viewMode === ViewMode.FOLLOW_TARGET) {
            console.warn("ThreeGeoPlay: ViewMode was set to FOLLOW_TARGET. Automatically switching to MANUAL mode.");
            return;
        }

        if (typeof lat !== 'number' || isNaN(lat)) throw new Error(`Invalid latitude: ${lat}. Must be a number`);
        if (lat < -90 || lat > 90)                 throw new Error(`Invalid latitude: ${lat}. Must be between -90 and 90`);
        if (typeof lon !== 'number' || isNaN(lon)) throw new Error(`Invalid longitude: ${lon}. Must be a number`);
        if (lon < -180 || lon > 180)               throw new Error(`Invalid longitude: ${lon}. Must be between -180 and 180`);

        this.#mapConfig.originLatLon = { lat, lon };
    }

    /**
     * Moves the map origin to match the given Three.js world-space X/Z position.
     * If the current mode is {@link ViewMode.FOLLOW_TARGET} it is automatically
     * switched to {@link ViewMode.MANUAL}.
     *
     * @param {number} x - X coordinate in Three.js world space.
     * @param {number} z - Z coordinate in Three.js world space.
     * @throws {Error} If either coordinate is not a valid number.
     */
    moveMapOriginToPosition(x, z) {
        if (this.#mapConfig.viewMode === ViewMode.FOLLOW_TARGET) {
            console.warn("ThreeGeoPlay: ViewMode was set to FOLLOW_TARGET. Automatically switching to MANUAL mode.");
            this.#mapConfig.viewMode = ViewMode.MANUAL;
        }

        if (typeof x !== 'number' || isNaN(x)) throw new Error(`Invalid x coordinate: ${x}. Must be a number`);
        if (typeof z !== 'number' || isNaN(z)) throw new Error(`Invalid z coordinate: ${z}. Must be a number`);
    }

    /**
     * Initialises the map, loads the first set of tiles and adds geometry to the scene.
     * Call this once, after configuring {@link MapConfig} and {@link MapStyle}.
     *
     * @throws {Error} If called more than once.
     */
    start() {
        if (this.#isStarted) {
            console.warn("ThreeGeoPlay: Already started");
            return;
        }
        this.tileManager = new TileManager(this.#mapConfig, this.#scene);
        this.tileManager.init();
        this.#isStarted = true;
    }

    /**
     * Processes per-frame updates: applies dirty config changes, updates tile
     * borders, and (in {@link ViewMode.FOLLOW_TARGET} mode) repositions the map
     * origin to track the follow target.
     *
     * **Must be called every frame inside your Three.js animation loop.**
     *
     * @example
     * function animate() {
     *   requestAnimationFrame(animate);
     *   geoPlay.onFrameUpdate();
     *   renderer.render(scene, camera);
     * }
     */
    onFrameUpdate() {
        this.tileManager?.updateBorders();

        if (this.#mapConfig._isDirty) {
            const dirty = this.#mapConfig._dirtyFields;

            if (dirty.has('tileWorldSize'))  this.tileManager?.rescaleTiles(this.#mapConfig.tileWorldSize);
            if (dirty.has('renderDistance')) this.tileManager?.applyCenter();
            if (dirty.has('mapStyle'))       this.tileManager?.updateMaterials();

            const needsRebuild = ['zoomLevel', 'pbfTileProviderZXYurl', 'tileLayout',
                                  'worldOriginOffset', 'originLatLon']
                .some(f => dirty.has(f));

            if (needsRebuild) {
                this.tileManager?.destroy();
                this.tileManager = new TileManager(this.#mapConfig, this.#scene);
                this.tileManager.init();
            }

            this.#mapConfig.flushDirtyState();
        }

        if (this.#mapConfig.viewMode === ViewMode.FOLLOW_TARGET) {
            const t        = Date.now();
            const interval = this.#mapConfig.FollowUpdateInterval;
            if (interval === 0 || t - this.#lastTime >= interval) {
                this.#lastTime = t;
                this.tileManager.updateCenterFromPosition(
                    this.#followTarget.position.x,
                    this.#followTarget.position.z
                );
            }
        }
    }

    /**
     * Returns the active {@link MapConfig} instance.
     * Modify its properties directly to adjust zoom, render distance, tile layout, etc.
     * @returns {MapConfig}
     */
    getMapConfig() {
        return this.#mapConfig;
    }

    /**
     * Replaces the entire map configuration.
     * The new config is applied on the next {@link onFrameUpdate} call.
     *
     * @param {MapConfig} mapConfig - A fully constructed {@link MapConfig} instance.
     * @throws {Error} If `mapConfig` is not a valid {@link MapConfig} instance.
     */
    setMapConfig(mapConfig) {
        if (!this.#validateConfig(mapConfig)) {
            throw new Error("ThreeGeoPlay: Invalid MapConfig provided");
        }
        this.#mapConfig = mapConfig;
    }

    /**
     * Returns the active {@link MapStyle} instance.
     * @returns {MapStyle}
     */
    getMapStyle() {
        return this.#mapStyle;
    }

    /**
     * Replaces the active map style.
     *
     * @param {MapStyle} mapStyle - A fully constructed {@link MapStyle} instance.
     * @throws {Error} If `mapStyle` is not a valid {@link MapStyle} instance.
     */
    setMapStyle(mapStyle) {
        if (!this.#validateStyle(mapStyle)) {
            throw new Error("ThreeGeoPlay: Invalid MapStyle provided");
        }
        this.#mapStyle = mapStyle;
    }

    /**
     * Returns the Three.js scene passed to the constructor.
     * @returns {THREE.Scene}
     */
    getScene() {
        return this.#scene;
    }

    /**
     * Returns the Three.js camera passed to the constructor.
     * @returns {THREE.Camera}
     */
    getCamera() {
        return this.#camera;
    }

    /**
     * Returns the Three.js renderer passed to the constructor.
     * @returns {THREE.WebGLRenderer}
     */
    getRenderer() {
        return this.#renderer;
    }

    /**
     * Destroys the ThreeGeoPlay instance and releases all held references.
     * After calling this method the instance must not be used again.
     */
    destroy() {
        this.#scene     = null;
        this.#camera    = null;
        this.#renderer  = null;
        this.#mapConfig = null;
        this.#mapStyle  = null;
        this.#lastTime  = null;
    }
}