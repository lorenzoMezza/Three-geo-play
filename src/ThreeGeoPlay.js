import * as THREE from 'three';

import { MapStyle }                   from './style/MapStyle.js';
import { MapConfig, ViewMode }        from './config/MapConfig.js';
import { TileManager }                from './map/TileManager.js';
import { geoToTileXYFloat, tileXYToGeo, tileSizeInMeters } from './tiles/projection.js';

const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

/**
 * Flat layer intersections this close to the nearest one (relative to its
 * distance) are on the same spot of the ground: the one drawn on top is picked.
 */
const FLAT_PICK_TOLERANCE = 0.01;

/**
 * Main entry point for ThreeGeoPlay — a geographic map renderer built on Three.js.
 *
 * Instantiate once with your Three.js scene, camera and renderer, then call
 * {@link ThreeGeoPlay#start} to begin loading tiles and
 * {@link ThreeGeoPlay#onFrameUpdate} inside your animation loop to keep the map
 * in sync with the camera / follow-target.
 *
 * All map meshes live under a single `THREE.Group` (see {@link ThreeGeoPlay#getMapGroup}),
 * which is yours to place: parent it anywhere, move, rotate or scale it, give
 * it `layers`, `visible` or a `renderOrder` for the whole map. The "world"
 * coordinates of the API ({@link latLonToWorld}, {@link moveMapOriginToPosition},
 * …) are expressed in that group's space — the scene's world space as long as
 * the group is not transformed — while the follow target is tracked through
 * its world position, whatever the transform.
 *
 * @example
 * const geoPlay = new ThreeGeoPlay(scene, camera, renderer, {
 *     tileUrl:      'https://tiles.openfreemap.org/planet',   // TileJSON, style, template or mapbox://
 *     originLatLon: { lat: 41.8902, lon: 12.4922 },
 *     zoomLevel:    14,
 * });
 * geoPlay.start();
 *
 * function animate() {
 *   requestAnimationFrame(animate);
 *   geoPlay.onFrameUpdate();
 *   renderer.render(scene, camera);
 * }
 * animate();
 *
 * Events (`geoPlay.addEventListener(type, listener)`):
 *  - `sourceload`  — `{ source }`: the tile source is resolved (see {@link getTileSource});
 *  - `sourceerror` — `{ error, willRetry }`: the tile source could not be loaded
 *    (e.g. wrong access token); `willRetry` is false for configuration errors;
 *  - `tileload`    — `{ tile }`: a tile appeared on screen (see {@link getTiles});
 *  - `tileunload`  — `{ tile }`: a tile left the render area and was removed.
 *
 * @class
 * @extends THREE.EventDispatcher
 */
export class ThreeGeoPlay extends THREE.EventDispatcher {

    /** @type {boolean} */
    #isStarted = false;

    /** @type {boolean} */
    #isDestroyed = false;

    /** @type {number} */
    #lastFollowUpdate = -Infinity;

    /** @type {MapConfig} */
    #mapConfig = null;

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

    /** @type {TileManager|null} */
    #tileManager = null;

    /** @type {THREE.Group} */
    #mapGroup = null;

    /** Center requested in MANUAL mode before the map was started (`null` = origin). */
    #manualCenter = null;

    /** @type {MapStyle|null} */
    #lastStyle = null;

    /** @type {number} */
    #lastStyleStamp = -1;

    #tmpVec = new THREE.Vector3();

    /**
     * @param {THREE.Scene}         threeScene    - Three.js scene.
     * @param {THREE.Camera}        threeCamera   - Three.js camera (also the default follow target).
     * @param {THREE.WebGLRenderer} threeRenderer - Three.js renderer.
     * @param {Object} [options] - Initial {@link MapConfig} values (see {@link MapConfig#set}).
     * @throws {Error} If a parameter is missing or an option is invalid.
     */
    constructor(threeScene, threeCamera, threeRenderer, options) {
        super();
        this.#validateConstructorParams(threeScene, threeCamera, threeRenderer);

        this.#scene         = threeScene;
        this.#camera        = threeCamera;
        this.#followTarget  = threeCamera;
        this.#renderer      = threeRenderer;
        this.#mapConfig     = new MapConfig();

        this.#mapGroup      = new THREE.Group();
        this.#mapGroup.name = 'ThreeGeoPlay';
        this.#mapGroup.userData.threeGeoPlay = true;

        if (options) this.#mapConfig.set(options);
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
     * @param {number} lat
     * @param {number} lon
     * @throws {Error}
     * @private
     */
    #validateLatLon(lat, lon) {
        if (typeof lat !== 'number' || isNaN(lat)) throw new Error(`ThreeGeoPlay: Invalid latitude: ${lat}. Must be a number`);
        if (lat < -90 || lat > 90)                 throw new Error(`ThreeGeoPlay: Invalid latitude: ${lat}. Must be between -90 and 90`);
        if (typeof lon !== 'number' || isNaN(lon)) throw new Error(`ThreeGeoPlay: Invalid longitude: ${lon}. Must be a number`);
        if (lon < -180 || lon > 180)               throw new Error(`ThreeGeoPlay: Invalid longitude: ${lon}. Must be between -180 and 180`);
    }

    /**
     * Switches to MANUAL mode (with a warning) if the map is following a target.
     * @private
     */
    #ensureManualMode() {
        if (this.#mapConfig.viewMode === ViewMode.FOLLOW_TARGET) {
            console.warn("ThreeGeoPlay: ViewMode was set to FOLLOW_TARGET. Automatically switching to MANUAL mode.");
            this.#mapConfig.viewMode = ViewMode.MANUAL;
        }
    }

    /**
     * Position of the follow target in the map group's space (X/Z).
     * @returns {{ x: number, z: number }}
     * @private
     */
    #followTargetPosition() {
        const p = this.#followTarget.getWorldPosition(this.#tmpVec);
        if (this.#mapGroup.parent) {
            this.#mapGroup.updateWorldMatrix(true, false);
            this.#mapGroup.worldToLocal(p);
        }
        return { x: p.x, z: p.z };
    }

    /**
     * Creates a tile manager for the current config and loads the first tiles.
     * @private
     */
    #createTileManager(center) {
        this.#tileManager = new TileManager(this.#mapConfig, this.#mapGroup, (type, detail) => this.dispatchEvent({ type, ...detail }));
        this.#tileManager.setCenterPosition(center);
        this.#tileManager.setShadowsEnabled(this.#renderer.shadowMap?.enabled === true);
        this.#mapConfig.flushDirtyState();
        this.#lastStyle      = this.#mapConfig.mapStyle;
        this.#lastStyleStamp = this.#lastStyle._stamp;
        this.#tileManager.update();
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Sets the object the map will follow in {@link ViewMode.FOLLOW_TARGET} mode.
     * The target's world position is used, so nested objects work too.
     * If the current `viewMode` is not `FOLLOW_TARGET` it is switched automatically.
     *
     * @param {THREE.Object3D} target - Any Three.js Object3D (mesh, group, camera, …).
     * @throws {Error} If `target` is not a valid Three.js Object3D.
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

        this.#followTarget = target;

        if (this.#mapConfig.viewMode !== ViewMode.FOLLOW_TARGET) {
            console.warn("ThreeGeoPlay: ViewMode was not set to FOLLOW_TARGET. Automatically switching to FOLLOW_TARGET mode.");
            this.#mapConfig.viewMode = ViewMode.FOLLOW_TARGET;
        }
        this.#lastFollowUpdate = -Infinity;
    }

    /**
     * Places the given geographic coordinates at the world origin
     * ({@link MapConfig#worldOriginOffset}). In {@link ViewMode.MANUAL} mode the
     * loaded area is centered there; in {@link ViewMode.FOLLOW_TARGET} mode the
     * map keeps following its target — move the target to the origin to look
     * at the new place (the view mode is never changed).
     *
     * @param {number} lat - Latitude in degrees (−90 … 90).
     * @param {number} lon - Longitude in degrees (−180 … 180).
     * @throws {Error} If either coordinate is out of range or not a number.
     *
     * @example
     * geoPlay.moveMapOriginToLatLon(48.8566, 2.3522); // Paris
     */
    moveMapOriginToLatLon(lat, lon) {
        this.#validateLatLon(lat, lon);
        this.#mapConfig.originLatLon = { lat, lon };
        if (this.#mapConfig.viewMode === ViewMode.MANUAL) {
            this.#manualCenter = null;
            this.#tileManager?.setCenterPosition(null);
        }
    }

    /**
     * Centers the loaded area on the given world-space X/Z position, without
     * changing the geographic origin (world coordinates stay stable).
     * This is the manual counterpart of {@link ViewMode.FOLLOW_TARGET}: if the
     * current mode is `FOLLOW_TARGET` it is automatically switched to
     * {@link ViewMode.MANUAL}.
     *
     * @param {number} x - X coordinate in Three.js world space.
     * @param {number} z - Z coordinate in Three.js world space.
     * @throws {Error} If either coordinate is not a valid number.
     */
    moveMapOriginToPosition(x, z) {
        if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`ThreeGeoPlay: Invalid x coordinate: ${x}. Must be a number`);
        if (typeof z !== 'number' || !Number.isFinite(z)) throw new Error(`ThreeGeoPlay: Invalid z coordinate: ${z}. Must be a number`);
        this.#ensureManualMode();

        this.#manualCenter = { x, z };
        this.#tileManager?.setCenterPosition(this.#manualCenter);
    }

    /**
     * Converts geographic coordinates to world-space X/Z using the current
     * {@link MapConfig} (origin, zoom level, tile size and offset).
     *
     * @param {number} lat - Latitude in degrees.
     * @param {number} lon - Longitude in degrees.
     * @returns {{ x: number, z: number }}
     *
     * @example
     * const { x, z } = geoPlay.latLonToWorld(41.8902, 12.4922); // Colosseum
     * marker.position.set(x, 0, z);
     */
    latLonToWorld(lat, lon) {
        this.#validateLatLon(lat, lon);
        const { originLatLon, zoomLevel, tileWorldSize, worldOriginOffset } = this.#mapConfig;
        const [ox, oy] = geoToTileXYFloat(originLatLon.lon, originLatLon.lat, zoomLevel);
        const [tx, ty] = geoToTileXYFloat(lon, lat, zoomLevel);
        return {
            x: (tx - ox) * tileWorldSize + worldOriginOffset.x,
            z: (ty - oy) * tileWorldSize + worldOriginOffset.z,
        };
    }

    /**
     * World units per metre at the map origin — `MapConfig.unitsPerMeter` when
     * set, otherwise derived from `tileWorldSize`. Use it to size your objects:
     * `mesh.scale.setScalar(2 * geoPlay.getUnitsPerMeter())` for a 2 m object.
     * @returns {number}
     */
    getUnitsPerMeter() {
        const { originLatLon, zoomLevel, tileWorldSize } = this.#mapConfig;
        return tileWorldSize / tileSizeInMeters(originLatLon.lat, zoomLevel);
    }

    /**
     * Height of the buildings at a map-space position: the top of the highest
     * building part covering it, or 0 on open ground and where no tile is
     * loaded yet. It follows what is drawn (height exaggeration, `featureStyle`,
     * hidden buildings) and costs a few point-in-polygon tests: fine every frame,
     * e.g. to keep a character on the roofs or a drone above them.
     *
     * @param {number} x - X in the map group's space.
     * @param {number} z - Z in the map group's space.
     * @returns {number}
     *
     * @example
     * const { x, z } = geoPlay.latLonToWorld(41.8902, 12.4922);
     * marker.position.set(x, geoPlay.getHeightAt(x, z), z); // on top of the Colosseum
     */
    getHeightAt(x, z) {
        return this.#tileManager?.heightAt(x, z) ?? 0;
    }

    /**
     * Converts a world-space X/Z position to geographic coordinates using the
     * current {@link MapConfig}.
     *
     * @param {number} x
     * @param {number} z
     * @returns {{ lat: number, lon: number }}
     */
    worldToLatLon(x, z) {
        const { originLatLon, zoomLevel, tileWorldSize, worldOriginOffset } = this.#mapConfig;
        const [ox, oy] = geoToTileXYFloat(originLatLon.lon, originLatLon.lat, zoomLevel);
        const [lon, lat] = tileXYToGeo(
            ox + (x - worldOriginOffset.x) / tileWorldSize,
            oy + (z - worldOriginOffset.z) / tileWorldSize,
            zoomLevel,
        );
        return { lat, lon: ((lon + 180) % 360 + 360) % 360 - 180 };
    }

    /**
     * Initialises the map, adds it to the scene and starts loading tiles.
     * Call this once, after configuring {@link MapConfig} and {@link MapStyle}.
     * If you already added {@link getMapGroup} to an object of yours, it stays there.
     *
     * @throws {Error} If `tileUrl` has not been set.
     */
    start() {
        if (this.#isDestroyed) {
            console.warn("ThreeGeoPlay: Cannot start a destroyed instance");
            return;
        }
        if (this.#isStarted) {
            console.warn("ThreeGeoPlay: Already started");
            return;
        }
        if (!this.#mapConfig.tileUrl) {
            throw new Error("ThreeGeoPlay: MapConfig.tileUrl must be set before start()");
        }

        if (!this.#mapGroup.parent) this.#scene.add(this.#mapGroup);
        const center = this.#mapConfig.viewMode === ViewMode.FOLLOW_TARGET
            ? this.#followTargetPosition()
            : this.#manualCenter;
        this.#createTileManager(center);
        this.#lastFollowUpdate = now();
        this.#isStarted = true;
    }

    /**
     * Processes per-frame updates: applies config and style changes, and
     * (in {@link ViewMode.FOLLOW_TARGET} mode) moves the loaded area to track
     * the follow target. Does nothing before {@link start} or after {@link destroy}.
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
        if (!this.#isStarted || this.#isDestroyed) return;

        const config      = this.#mapConfig;
        const tileManager = this.#tileManager;

        if (config._isDirty) {
            tileManager.configChanged(config._dirtyFields);
            config.flushDirtyState();
        }

        const style = config.mapStyle;
        const stamp = style._stamp;
        if (style !== this.#lastStyle || stamp !== this.#lastStyleStamp) {
            this.#lastStyle      = style;
            this.#lastStyleStamp = stamp;
            tileManager.restyle();
        }

        if (config.viewMode === ViewMode.FOLLOW_TARGET) {
            const t = now();
            if (t - this.#lastFollowUpdate >= config.followUpdateInterval) {
                this.#lastFollowUpdate = t;
                tileManager.setCenterPosition(this.#followTargetPosition());
            }
        }

        tileManager.setShadowsEnabled(this.#renderer.shadowMap?.enabled === true);
        tileManager.update();
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
     * Replaces the entire map configuration. If the map is running, all tiles
     * are reloaded with the new configuration immediately.
     *
     * @param {MapConfig} mapConfig - A fully constructed {@link MapConfig} instance.
     * @throws {Error} If `mapConfig` is not a valid {@link MapConfig} instance.
     */
    setMapConfig(mapConfig) {
        if (!(mapConfig instanceof MapConfig)) {
            throw new Error("ThreeGeoPlay: Invalid MapConfig provided — must be an instance of MapConfig");
        }
        if (mapConfig === this.#mapConfig) return;
        this.#mapConfig = mapConfig;

        if (this.#isStarted && !this.#isDestroyed) {
            if (!mapConfig.tileUrl) {
                throw new Error("ThreeGeoPlay: MapConfig.tileUrl must be set");
            }
            const center = mapConfig.viewMode === ViewMode.FOLLOW_TARGET
                ? this.#followTargetPosition()
                : this.#tileManager.centerPosition;
            this.#tileManager.destroy();
            this.#createTileManager(center);
        }
    }

    /**
     * Returns the active {@link MapStyle} (the one of the current {@link MapConfig}).
     * @returns {MapStyle}
     */
    getMapStyle() {
        return this.#mapConfig.mapStyle;
    }

    /**
     * Replaces the active map style. Loaded tiles are restyled on the next
     * {@link onFrameUpdate}.
     *
     * @param {MapStyle} mapStyle - A fully constructed {@link MapStyle} instance.
     * @throws {Error} If `mapStyle` is not a valid {@link MapStyle} instance.
     */
    setMapStyle(mapStyle) {
        if (!(mapStyle instanceof MapStyle)) {
            throw new Error("ThreeGeoPlay: Invalid MapStyle provided — must be an instance of MapStyle");
        }
        this.#mapConfig.mapStyle = mapStyle;
    }

    /**
     * Loading progress of the tiles in the current render area: `ready` tiles are
     * on screen, `empty` ones have no data, `loading` ones are queued, downloading
     * or being built, `failed` ones gave up after retries. `rebuilding` counts the
     * tiles on screen still waiting to be rebuilt after a style change (0 once
     * the change is fully applied). All zero before {@link start}.
     *
     * @returns {{ total: number, ready: number, empty: number, loading: number, failed: number, rebuilding: number }}
     *
     * @example
     * const { total, loading } = geoPlay.getTileStats();
     * progress.textContent = loading ? `Loading ${total - loading}/${total}` : '';
     */
    getTileStats() {
        const stats = this.#tileManager?.stats;
        if (!stats) return { total: 0, ready: 0, empty: 0, loading: 0, failed: 0, rebuilding: 0 };
        // A style change not seen by onFrameUpdate yet will rebuild every tile.
        const style = this.#mapConfig.mapStyle;
        if (style !== this.#lastStyle || style._stamp !== this.#lastStyleStamp) stats.rebuilding = stats.ready;
        return stats;
    }

    /**
     * The resolved tile source: URL templates, zoom range, vector layers and the
     * attribution the provider requires you to display (e.g. Mapbox, MapTiler, OSM).
     * `null` before {@link start} and while a TileJSON / style URL is loading.
     *
     * @returns {{ tiles: string[], minZoom: number, maxZoom: number, attribution: string, layers: string[] } | null}
     *
     * @example
     * credits.innerHTML = geoPlay.getTileSource()?.attribution ?? '';
     */
    getTileSource() {
        return this.#tileManager?.source ?? null;
    }

    /**
     * Returns the group containing every map mesh (added to the scene by {@link start},
     * unless you parented it yourself). Its `layers` are applied to every map mesh;
     * `visible`, the transform and `renderOrder` work as for any Three.js group.
     * Map objects carry `userData.threeGeoPlay = true`.
     * @returns {THREE.Group}
     */
    getMapGroup() {
        return this.#mapGroup;
    }

    /**
     * The map feature drawn at a raycast intersection: which building, road, park…
     * was hit. Returns `null` for other objects and for the ground planes.
     *
     * `layer` / `type` / `style` are the style layer, type name and type object
     * the feature is drawn with; `sourceLayer`, `id` and `properties` come from
     * the vector tile; `tile` is the tile it belongs to (see {@link getTiles}) and
     * `getGeometry()` returns its outline in that tile's local frame.
     *
     * @param {THREE.Intersection} intersection - From `raycaster.intersectObject(geoPlay.getMapGroup(), true)`.
     * @returns {Object|null}
     *
     * @example
     * const hits = raycaster.intersectObject(geoPlay.getMapGroup(), true);
     * const feature = hits.length ? geoPlay.getFeatureAt(hits[0]) : null;
     * if (feature?.layer === 'building') console.log(feature.properties.render_height);
     */
    getFeatureAt(intersection) {
        return this.#tileManager?.featureAt(intersection) ?? null;
    }

    /**
     * The map feature seen along a ray: raycasts the map and returns what is
     * drawn on top, or `null`. Prefer it to {@link getFeatureAt} on the nearest
     * intersection: flat layers lie on (almost) the same plane and are stacked by
     * `renderingOrder`, not by height, so the nearest flat intersection is not
     * always the one you see (e.g. a park under a road).
     *
     * The result is the one of {@link getFeatureAt}, plus the `intersection`
     * (with `point` and `distance`).
     *
     * @param {THREE.Raycaster} raycaster
     * @returns {Object|null}
     *
     * @example
     * raycaster.setFromCamera(pointer, camera);
     * const feature = geoPlay.pickFeature(raycaster);
     * if (feature) console.log(feature.layer, feature.type, feature.properties);
     */
    pickFeature(raycaster) {
        if (!this.#tileManager) return null;
        let best = null;
        let bestHit = null;
        for (const hit of raycaster.intersectObject(this.#mapGroup, true)) {
            const feature = this.getFeatureAt(hit);
            if (!feature) continue;   // ground planes, your own objects in tiles
            const flat = hit.object.userData.kind !== 'building';
            if (!best) {
                best = feature;
                bestHit = hit;
                if (!flat) break;
                continue;
            }
            // Only flat intersections on the same spot compete, by render order.
            if (!flat || hit.distance - bestHit.distance > FLAT_PICK_TOLERANCE * bestHit.distance + 1e-6) break;
            if (hit.object.renderOrder > bestHit.object.renderOrder) {
                best = feature;
                bestHit = hit;
            }
        }
        return best ? { ...best, intersection: bestHit } : null;
    }

    /**
     * The tiles on screen. Each tile is `{ x, y, zoom, object3D, size, unitsPerMeter, getFeatures(sourceLayer?) }`:
     *  - `object3D` is the tile's group, child of the map group. Its local frame is
     *    fixed for the tile's life: the tile spans `[0, size]` on X and Z, the ground
     *    is at Y 0 and `unitsPerMeter` converts metres. Objects you add to it follow
     *    the tile (moved and rescaled with the map) and leave the scene with it —
     *    dispose their geometry and materials on `tileunload`.
     *  - `getFeatures()` decodes every feature of the tile — including layers the
     *    map does not draw (POIs, labels, …) — as `{ sourceLayer, id, type, properties, geometry }`,
     *    `type` being `'point'`, `'line'` or `'polygon'` and `geometry` a list of parts
     *    (or rings) as flat `[x0, z0, x1, z1, …]` arrays in that local frame.
     *
     * The same objects are passed to the `tileload` / `tileunload` events.
     *
     * @returns {Object[]}
     *
     * @example
     * // A marker on every POI
     * geoPlay.addEventListener('tileload', ({ tile }) => {
     *   for (const poi of tile.getFeatures('poi')) {
     *     const [x, z] = poi.geometry[0];
     *     const marker = new THREE.Mesh(markerGeometry, markerMaterial);
     *     marker.position.set(x, 0, z);
     *     marker.scale.setScalar(3 * tile.unitsPerMeter);   // 3 m
     *     tile.object3D.add(marker);
     *   }
     * });
     */
    getTiles() {
        return this.#tileManager?.tiles ?? [];
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
     * Stops all downloads, removes the map from the scene, frees its GPU
     * geometry and releases all held references.
     * Materials belong to the {@link MapStyle} and are not disposed.
     * After calling this method the instance must not be used again.
     */
    destroy() {
        if (this.#isDestroyed) return;
        this.#isDestroyed = true;

        this.#tileManager?.destroy();
        this.#tileManager = null;
        this.#mapGroup?.removeFromParent();

        this.#scene        = null;
        this.#camera       = null;
        this.#renderer     = null;
        this.#followTarget = null;
        this.#mapConfig    = null;
        this.#mapGroup     = null;
        this.#lastStyle    = null;
    }
}
