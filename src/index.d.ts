import * as THREE from 'three';

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Available tile loading patterns. */
export declare const TileLayout: {
    readonly CIRCULAR: 'circular';
    readonly GRID: 'grid';
};
export type TileLayout = typeof TileLayout[keyof typeof TileLayout];

/**
 * Vector tile schemas supported out of the box. `AUTO` (default) detects the
 * schema from the layers of the source.
 */
export declare const TileSchema: {
    readonly AUTO: 'auto';
    /** OpenMapTiles — MapTiler, OpenFreeMap and most MapLibre sources. */
    readonly OPENMAPTILES: 'openmaptiles';
    /** Mapbox Streets v8. */
    readonly MAPBOX: 'mapbox';
};
export type TileSchema = typeof TileSchema[keyof typeof TileSchema];

/** Style layer / type a tile feature is drawn with (see {@link TileSchemaFunction}). */
export interface SchemaMatch {
    layer: 'transportation' | 'building' | 'water' | 'waterway' | 'landuse' | 'landcover';
    /** Type name(s) looked up in the layer, most specific first. */
    type: string | Array<string | undefined>;
    /** Link road: drawn under the road it merges into. */
    ramp?: boolean;
}

/** Custom tile schema: maps a feature of `sourceLayer` to a style layer / type, or `null` to skip it. */
export type TileSchemaFunction = (sourceLayer: string, properties: Record<string, unknown>) => SchemaMatch | null;

/** Resolved tile source (see `ThreeGeoPlay.getTileSource()`). */
export interface TileSource {
    /** Tile URL templates, used round-robin. */
    tiles: string[];
    minZoom: number;
    maxZoom: number;
    /** HTML attribution the provider requires you to display ('' if unknown). */
    attribution: string;
    /** Vector layer ids announced by the source ([] if unknown). */
    layers: string[];
}

/** Camera / map tracking modes. */
export declare const ViewMode: {
    readonly FOLLOW_TARGET: 'follow_target';
    readonly MANUAL: 'manual';
};
export type ViewMode = typeof ViewMode[keyof typeof ViewMode];

// ─── Utility types ────────────────────────────────────────────────────────────

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

export interface WorldOffset {
    readonly x: number;
    readonly z: number;
}

export interface WorldPosition {
    x: number;
    z: number;
}

/** Loading progress of the tiles in the current render area. */
export interface TileStats {
    /** Tiles in the render area. */
    total: number;
    /** Tiles on screen. */
    ready: number;
    /** Tiles without data (e.g. outside the provider coverage). */
    empty: number;
    /** Tiles queued, downloading or being built. */
    loading: number;
    /** Tiles that gave up after retries. */
    failed: number;
}

// ─── Feature types ────────────────────────────────────────────────────────────

/**
 * Properties shared by every feature type (and by single-type layers).
 * Every change is applied to the tiles already on screen on the next `onFrameUpdate()`.
 */
export declare class BaseFeatureType {
    /** Whether this type is rendered. */
    isVisible: boolean;
    /** Fill material. Map geometry faces up (+Y): `THREE.FrontSide` materials work. */
    material: THREE.Material | null;
    /** Height (world units) at which this type is drawn. */
    Y: number;
    /**
     * Three.js render order. Flat map geometry is drawn with `depthTest`
     * disabled on its material and layered by this value (negative recommended).
     * Line types use `[renderingOrder, renderingOrder + 1)`: tunnels < ground < bridges,
     * outlines below fills, wider lines above narrower ones.
     */
    renderingOrder: number;
    setVisible(v: boolean): void;
}

/** A single land cover type (grass, wood, sand, …). */
export declare class LandCoverType extends BaseFeatureType {}

/** A single land use type (residential, industrial, hospital, …). */
export declare class LandUseType extends BaseFeatureType {}

/** A single water body type (river, lake, ocean, …). */
export declare class WaterType extends BaseFeatureType {}

/** A line feature type (roads, waterways). */
export declare class LineFeatureType extends BaseFeatureType {
    /** Material of the outline drawn around the line. */
    outlineMaterial: THREE.Material | null;
    /** Full line width, relative to one tile at zoom 18 (constant real-world width across zooms). Must be ≥ 0. */
    lineWidth: number;
    /** Extra width drawn with `outlineMaterial` (same units as `lineWidth`). `0` disables it; `null` restores the default. */
    outlineWidth: number;
    /** Points used to round caps and joints. Minimum 6. */
    jointSegments: number;
    /** Restores the outline width the type was created with. */
    resetOutlineWidth(): void;
}

/** A single waterway type (river, canal, ditch, …). */
export type WaterwayType = LineFeatureType;

/** A single road / transport type (motorway, primary, rail, …). */
export type RoadType = LineFeatureType;

// ─── Layers ───────────────────────────────────────────────────────────────────

/** Shared behaviour of multi-type layers. */
export declare class BaseLayer<TName extends string, TType extends BaseFeatureType> {
    /**
     * Master toggle: when `false` nothing of the layer is rendered; when `true`
     * each type follows its own `isVisible` (per-type settings are preserved).
     */
    isVisible: boolean;
    getTypeByName(name: TName | (string & {})): TType | null;
    setAllMaterials(material: THREE.Material): void;
    /** Sets `isVisible` on every type of the layer. */
    setVisibleAll(isVisible: boolean): void;
}

/** Background base-fill plane rendered beneath everything else. */
export declare class BackgroundLayer extends BaseFeatureType {
    getTypeByName(name: string): this;
}

/** 3D building extrusion layer (`renderingOrder` is not applied to buildings). */
export declare class BuildingLayer extends BaseFeatureType {
    /** Vertical exaggeration of the real OSM heights: `1` = true scale, `0` = flat. */
    height: number;
    /** Reserved for future roof/detail rendering. Currently has no effect. */
    allowDetails: boolean;
    getTypeByName(name: string): this;
    setMaterial(material: THREE.Material): this;
    setY(y: number): this;
    setHeight(h: number): this;
    setAllowDetails(val: boolean): this;
}

export type LandCoverClassName =
    | 'sand' | 'park' | 'grass' | 'wood' | 'wetland' | 'rock' | 'farmland' | 'ice'
    | 'allotments' | 'bare_rock' | 'beach' | 'bog' | 'dune' | 'scrub' | 'shrubbery'
    | 'farm' | 'fell' | 'flowerbed' | 'forest' | 'garden' | 'glacier' | 'grassland'
    | 'golf_course' | 'heath' | 'mangrove' | 'marsh' | 'meadow' | 'orchard'
    | 'plant_nursery' | 'recreation_ground' | 'reedbed' | 'saltern' | 'saltmarsh'
    | 'scree' | 'swamp' | 'tidalflat' | 'tundra' | 'village_green' | 'vineyard'
    | 'wet_meadow';

/**
 * Land cover types (grass, wood, sand, …). OpenMapTiles `subclass` values
 * (e.g. `park`, `forest`, `beach`) take precedence over `class` values.
 */
export declare class LandCoverLayer extends BaseLayer<LandCoverClassName, LandCoverType> {
    readonly sand: LandCoverType;
    readonly park: LandCoverType;
    readonly grass: LandCoverType;
    readonly wood: LandCoverType;
    readonly wetland: LandCoverType;
    readonly rock: LandCoverType;
    readonly farmland: LandCoverType;
    readonly ice: LandCoverType;
    readonly allotments: LandCoverType;
    readonly bare_rock: LandCoverType;
    readonly beach: LandCoverType;
    readonly bog: LandCoverType;
    readonly dune: LandCoverType;
    readonly scrub: LandCoverType;
    readonly shrubbery: LandCoverType;
    readonly farm: LandCoverType;
    readonly fell: LandCoverType;
    readonly flowerbed: LandCoverType;
    readonly forest: LandCoverType;
    readonly garden: LandCoverType;
    readonly glacier: LandCoverType;
    readonly grassland: LandCoverType;
    readonly golf_course: LandCoverType;
    readonly heath: LandCoverType;
    readonly mangrove: LandCoverType;
    readonly marsh: LandCoverType;
    readonly meadow: LandCoverType;
    readonly orchard: LandCoverType;
    readonly plant_nursery: LandCoverType;
    readonly recreation_ground: LandCoverType;
    readonly reedbed: LandCoverType;
    readonly saltern: LandCoverType;
    readonly saltmarsh: LandCoverType;
    readonly scree: LandCoverType;
    readonly swamp: LandCoverType;
    readonly tidalflat: LandCoverType;
    readonly tundra: LandCoverType;
    readonly village_green: LandCoverType;
    readonly vineyard: LandCoverType;
    readonly wet_meadow: LandCoverType;
    static readonly admittedClasses: Set<LandCoverClassName>;
}

export type LandUseClassName =
    | 'farmland' | 'suburb' | 'residential' | 'industrial' | 'pitch'
    | 'university' | 'retail' | 'playground' | 'commercial' | 'military'
    | 'school' | 'college' | 'bus_station' | 'kindergarten' | 'theme_park'
    | 'hospital' | 'railway' | 'parking' | 'recreation_ground' | 'cemetery'
    | 'library' | 'track' | 'stadium' | 'quarter' | 'zoo' | 'attraction'
    | 'religious' | 'quarry' | 'nature_reserve' | 'protected_area'
    | 'neighbourhood' | 'garages' | 'dam';

/** Land use types (residential, industrial, hospital, …). */
export declare class LandUseLayer extends BaseLayer<LandUseClassName, LandUseType> {
    readonly farmland: LandUseType;
    readonly suburb: LandUseType;
    readonly residential: LandUseType;
    readonly industrial: LandUseType;
    readonly pitch: LandUseType;
    readonly university: LandUseType;
    readonly retail: LandUseType;
    readonly playground: LandUseType;
    readonly commercial: LandUseType;
    readonly military: LandUseType;
    readonly school: LandUseType;
    readonly college: LandUseType;
    readonly bus_station: LandUseType;
    readonly kindergarten: LandUseType;
    readonly theme_park: LandUseType;
    readonly hospital: LandUseType;
    readonly railway: LandUseType;
    readonly parking: LandUseType;
    readonly recreation_ground: LandUseType;
    readonly cemetery: LandUseType;
    readonly library: LandUseType;
    readonly track: LandUseType;
    readonly stadium: LandUseType;
    readonly quarter: LandUseType;
    readonly zoo: LandUseType;
    readonly attraction: LandUseType;
    readonly religious: LandUseType;
    readonly quarry: LandUseType;
    readonly nature_reserve: LandUseType;
    readonly protected_area: LandUseType;
    readonly neighbourhood: LandUseType;
    readonly garages: LandUseType;
    readonly dam: LandUseType;
    static readonly admittedClasses: Set<LandUseClassName>;
}

export type WaterClassName = 'swimming_pool' | 'river' | 'lake' | 'ocean' | 'pond' | 'dock';

/** Water body types (lakes, oceans, rivers as polygons). */
export declare class WaterLayer extends BaseLayer<WaterClassName, WaterType> {
    readonly swimming_pool: WaterType;
    readonly river: WaterType;
    readonly lake: WaterType;
    readonly ocean: WaterType;
    readonly pond: WaterType;
    readonly dock: WaterType;
    static readonly admittedClasses: Set<WaterClassName>;
}

export type WaterwayClassName = 'river' | 'stream' | 'tidal_channel' | 'flowline' | 'canal' | 'drain' | 'ditch' | 'pressurised';

/** Waterway types (rivers, canals, ditches as lines). */
export declare class WaterwayLayer extends BaseLayer<WaterwayClassName, WaterwayType> {
    readonly river: WaterwayType;
    readonly stream: WaterwayType;
    readonly tidal_channel: WaterwayType;
    readonly flowline: WaterwayType;
    readonly canal: WaterwayType;
    readonly drain: WaterwayType;
    readonly ditch: WaterwayType;
    readonly pressurised: WaterwayType;
    /** Pass `null` as `material` to change only the outlines. */
    setAllMaterials(material: THREE.Material | null, outlineMaterial?: THREE.Material): void;
    setOutlineWidthAll(width: number): void;
    resetOutlineWidthAll(): void;
    setLineWidthAll(width: number): void;
    setJointSegmentsAll(segments: number): void;
    setAllRenderOrder(order: number): void;
}

export type TransportClassName =
    | 'motorway' | 'trunk' | 'trunk_construction'
    | 'primary' | 'primary_construction'
    | 'secondary' | 'secondary_construction'
    | 'tertiary' | 'tertiary_construction'
    | 'minor' | 'minor_construction'
    | 'service' | 'service_construction'
    | 'track' | 'track_construction'
    | 'path' | 'path_construction'
    | 'raceway' | 'raceway_construction'
    | 'busway' | 'bus_guideway'
    | 'rail' | 'transit' | 'pedestrian' | 'pier' | 'ferry';

/** Road and transport types. OpenMapTiles `subclass` values (e.g. `pedestrian`) take precedence over `class`. */
export declare class TransportationLayer extends BaseLayer<TransportClassName, RoadType> {
    readonly motorway: RoadType;
    readonly trunk: RoadType;
    readonly trunk_construction: RoadType;
    readonly primary: RoadType;
    readonly primary_construction: RoadType;
    readonly secondary: RoadType;
    readonly secondary_construction: RoadType;
    readonly tertiary: RoadType;
    readonly tertiary_construction: RoadType;
    readonly minor: RoadType;
    readonly minor_construction: RoadType;
    readonly service: RoadType;
    readonly service_construction: RoadType;
    readonly track: RoadType;
    readonly track_construction: RoadType;
    readonly path: RoadType;
    readonly path_construction: RoadType;
    readonly raceway: RoadType;
    readonly raceway_construction: RoadType;
    readonly busway: RoadType;
    readonly bus_guideway: RoadType;
    readonly rail: RoadType;
    readonly transit: RoadType;
    readonly pedestrian: RoadType;
    readonly pier: RoadType;
    readonly ferry: RoadType;
    /** Pass `null` as `material` to change only the outlines. */
    setAllMaterials(material: THREE.Material | null, outlineMaterial?: THREE.Material): void;
    setOutlineWidthAll(width: number): void;
    resetOutlineWidthAll(): void;
    setJointSegmentsAll(segments: number): void;
    setAllRenderOrder(order: number): void;
    /** Alias for the `isVisible` setter. */
    setVisible(isVisible: boolean): void;
    static readonly admittedClasses: Set<TransportClassName | 'motorway_construction'>;
}

// ─── MapStyle ─────────────────────────────────────────────────────────────────

export type StyleLayerName = 'background' | 'waterway' | 'water' | 'landcover' | 'landuse' | 'building' | 'transportation';

/**
 * Top-level style container for a ThreeGeoPlay map.
 * Changes made after `start()` are applied to the loaded tiles on the next `onFrameUpdate()`.
 *
 * @example
 * const style = geoPlay.getMapStyle();
 * style.buildingLayer.isVisible = true;
 * style.transportationLayer.motorway.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
 */
export declare class MapStyle {
    constructor();
    /** Assigning a layer of the wrong class throws. */
    buildingLayer: BuildingLayer;
    waterLayer: WaterLayer;
    waterwayLayer: WaterwayLayer;
    landUseLayer: LandUseLayer;
    landCoverLayer: LandCoverLayer;
    transportationLayer: TransportationLayer;
    backgroundLayer: BackgroundLayer;
    getStyleLayerByName(layerName: 'background'): BackgroundLayer;
    getStyleLayerByName(layerName: 'waterway'): WaterwayLayer;
    getStyleLayerByName(layerName: 'water'): WaterLayer;
    getStyleLayerByName(layerName: 'landcover'): LandCoverLayer;
    getStyleLayerByName(layerName: 'landuse'): LandUseLayer;
    getStyleLayerByName(layerName: 'building'): BuildingLayer;
    getStyleLayerByName(layerName: 'transportation'): TransportationLayer;
    getStyleLayerByName(layerName: string): BackgroundLayer | WaterwayLayer | WaterLayer | LandCoverLayer | LandUseLayer | BuildingLayer | TransportationLayer | null;
}

// ─── MapConfig ────────────────────────────────────────────────────────────────

/**
 * Configuration for a ThreeGeoPlay map instance.
 * Modify properties directly — dirty tracking ensures only the minimum
 * necessary update runs on the next `onFrameUpdate()` call.
 * Invalid values throw an `Error`.
 *
 * @example
 * const config = geoPlay.getMapConfig();
 * config.zoomLevel      = 16;
 * config.renderDistance = 6;
 * config.tileLayout     = TileLayout.GRID;
 */
export declare class MapConfig {
    constructor();
    /**
     * Sets several properties at once; unknown names throw.
     * @example config.set({ tileUrl: 'https://tiles.openfreemap.org/planet', zoomLevel: 14 });
     */
    set(values: MapConfigOptions): this;
    /**
     * Where the tiles come from; required before `start()`, changing it reloads all tiles:
     * a template with `{x}`, `{y}` (and usually `{z}`), a TileJSON URL, a MapLibre / Mapbox
     * style URL (first vector source) or a `mapbox://` URL (with `accessToken`).
     */
    tileUrl: string;
    /** @deprecated Use `tileUrl`. */
    pbfTileProviderZXYurl: string;
    /** Access token for Mapbox (`mapbox://` URLs and api.mapbox.com tiles). */
    accessToken: string;
    /** How tile layers map onto `MapStyle`: a `TileSchema` (default `'auto'`) or a custom function. */
    tileSchema: TileSchema | TileSchemaFunction;
    /** Web-Mercator zoom level, integer 0–24 (default 18). Changing it reloads all tiles. */
    zoomLevel: number;
    /** Tiles loaded in each direction from the center tile (default 4). */
    renderDistance: number;
    /** World-space size of one tile in Three.js units, > 0 (default 1). Existing tiles are rescaled, not reloaded. */
    tileWorldSize: number;
    /** Tile loading pattern (default `TileLayout.CIRCULAR`). */
    tileLayout: TileLayout;
    /** Geographic coordinates placed at `worldOriginOffset`. Frozen: assign a new object to change it. */
    originLatLon: LatLon;
    /** World position of `originLatLon` (default `{ x: 0, z: 0 }`). Frozen: assign a new object to change it. */
    worldOriginOffset: WorldOffset;
    /** Camera/map tracking mode (default `ViewMode.FOLLOW_TARGET`). */
    viewMode: ViewMode;
    /** Active map style. Replacing it restyles the loaded tiles. */
    mapStyle: MapStyle;
    /** Draws a visible border around each tile — useful for debugging. */
    showTileBorders: boolean;
    /** Scale factor relative to zoom level 18. */
    readonly zoomScaleFactor: number;
    /** True if any property has changed since the last flush. */
    readonly _isDirty: boolean;
    readonly _dirtyFields: Set<string>;
    /** True if a dirty field requires reloading every tile (zoom level, tile URL or access token). */
    readonly requiresRebuild: boolean;
    /** Minimum interval in milliseconds between follow-target updates. `0` (default) means every frame. */
    followUpdateInterval: number;
    /** @deprecated Use `followUpdateInterval`. */
    readonly FollowUpdateInterval: number;
    /** @deprecated Use `followUpdateInterval`. */
    setFollowUpdateInterval(intervalMs: number): void;
    flushDirtyState(): void;
}

/** Options accepted by `MapConfig.set()` and the `ThreeGeoPlay` constructor. */
export interface MapConfigOptions {
    tileUrl?: string;
    accessToken?: string;
    tileSchema?: TileSchema | TileSchemaFunction;
    zoomLevel?: number;
    renderDistance?: number;
    tileWorldSize?: number;
    tileLayout?: TileLayout;
    originLatLon?: { lat: number; lon: number };
    worldOriginOffset?: { x: number; z: number };
    viewMode?: ViewMode;
    mapStyle?: MapStyle;
    showTileBorders?: boolean;
    followUpdateInterval?: number;
    /** @deprecated Use `tileUrl`. */
    pbfTileProviderZXYurl?: string;
}

// ─── ThreeGeoPlay ─────────────────────────────────────────────────────────────

/**
 * Main entry point for ThreeGeoPlay.
 *
 * @example
 * const geoPlay = new ThreeGeoPlay(scene, camera, renderer, {
 *     tileUrl: 'https://tiles.openfreemap.org/planet',
 *     originLatLon: { lat: 41.89, lon: 12.49 },
 *     zoomLevel: 14,
 * });
 * geoPlay.start();
 *
 * function animate() {
 *   requestAnimationFrame(animate);
 *   geoPlay.onFrameUpdate();
 *   renderer.render(scene, camera);
 * }
 * animate();
 */
/** Events dispatched by `ThreeGeoPlay`. */
export interface ThreeGeoPlayEventMap {
    /** The tile source is resolved. */
    sourceload: { source: TileSource };
    /** The tile source could not be loaded (e.g. wrong access token); no retry for configuration errors. */
    sourceerror: { error: Error; willRetry: boolean };
}

export declare class ThreeGeoPlay extends THREE.EventDispatcher<ThreeGeoPlayEventMap> {
    /**
     * @param threeScene    Three.js scene.
     * @param threeCamera   Three.js camera (also the default follow target).
     * @param threeRenderer Three.js renderer.
     * @param options       Initial `MapConfig` values.
     */
    constructor(threeScene: THREE.Scene, threeCamera: THREE.Camera, threeRenderer: THREE.WebGLRenderer, options?: MapConfigOptions);

    /**
     * Sets the object the map follows in `FOLLOW_TARGET` mode (its world position is used).
     * Automatically switches `viewMode` to `FOLLOW_TARGET` if needed.
     */
    setFollowTarget(target: THREE.Object3D): void;

    /**
     * Places the given coordinates at the world origin and centers the map there.
     * Switches to `MANUAL` mode if needed.
     */
    moveMapOriginToLatLon(lat: number, lon: number): void;

    /**
     * Centers the loaded area on a world-space X/Z position without changing the
     * geographic origin. Switches to `MANUAL` mode if needed.
     */
    moveMapOriginToPosition(x: number, z: number): void;

    /** Converts geographic coordinates to world-space X/Z with the current config. */
    latLonToWorld(lat: number, lon: number): WorldPosition;

    /** Converts a world-space X/Z position to geographic coordinates with the current config. */
    worldToLatLon(x: number, z: number): { lat: number; lon: number };

    /**
     * Adds the map to the scene and starts loading tiles.
     * @throws If `tileUrl` has not been set.
     */
    start(): void;

    /** Processes per-frame updates. **Must be called every frame in your animation loop.** */
    onFrameUpdate(): void;

    /** Returns the active `MapConfig`. Modify its properties to change map behaviour. */
    getMapConfig(): MapConfig;

    /** Replaces the entire map configuration (applied immediately if the map is running). */
    setMapConfig(mapConfig: MapConfig): void;

    /** Returns the active `MapStyle` (same as `getMapConfig().mapStyle`). */
    getMapStyle(): MapStyle;

    /** Replaces the active map style. */
    setMapStyle(mapStyle: MapStyle): void;

    /** Loading progress of the tiles in the current render area (all zero before `start()`). */
    getTileStats(): TileStats;

    /** Resolved tile source, including the attribution to display; `null` before `start()` / while loading (see the `sourceload` event). */
    getTileSource(): TileSource | null;

    /** The group containing every map mesh (useful for raycasting or toggling visibility). */
    getMapGroup(): THREE.Group;

    getScene(): THREE.Scene;
    getCamera(): THREE.Camera;
    getRenderer(): THREE.WebGLRenderer;

    /** Removes the map from the scene, stops downloads and frees geometry. Materials are not disposed. */
    destroy(): void;
}
