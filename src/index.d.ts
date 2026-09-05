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
 * Holds one instance of every renderable layer.
 *
 * @example
 * const style = geoPlay.getMapConfig().mapStyle;
 * style.buildingLayer.isVisible = true;
 * style.transportationLayer.motorway.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
 */
export declare class MapStyle {
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
 *
 * @example
 * const config = geoPlay.getMapConfig();
 * config.zoomLevel      = 16;
 * config.renderDistance = 6;
 * config.tileLayout     = TileLayout.GRID;
 */
export declare class MapConfig {
    /**
     * ZXY URL template for the PBF vector tile provider.
     * Use `{z}`, `{x}`, `{y}` as placeholders.
     * Changing this triggers a full tile rebuild.
     */
    pbfTileProviderZXYurl: string;
    /**
     * OSM zoom level (typically 14–18). Higher = more detail.
     * Changing this triggers a full tile rebuild.
     */
    zoomLevel: number;
    /**
     * Number of tiles to load in each direction from the origin tile.
     */
    renderDistance: number;
    /**
     * World-space size of one tile in Three.js units. Must be > 0.
     */
    tileWorldSize: number;
    /**
     * Tile loading pattern. Use `TileLayout.CIRCULAR` or `TileLayout.GRID`.
     * Changing this triggers a full tile rebuild.
     */
    tileLayout: TileLayout;
    /**
     * Geographic coordinates of the map origin.
     * Changing this triggers a full tile rebuild.
     */
    originLatLon: LatLon;
    /**
     * Additional X/Z offset applied to the world origin in Three.js units.
     * Changing this triggers a full tile rebuild.
     */
    worldOriginOffset: WorldOffset;
    /**
     * Camera/map tracking mode. Use `ViewMode.FOLLOW_TARGET` or `ViewMode.MANUAL`.
     */
    viewMode: ViewMode;
    /**
     * Active map style. Changing this triggers a material update on all tiles.
     */
    mapStyle: MapStyle;
    /** Draws a visible border around each tile — useful for debugging. */
    showTileBorders: boolean;
    /** Scale factor relative to zoom level 18. */
    readonly zoomScaleFactor: number;
    /** True if any property has changed since the last flush. */
    readonly _isDirty: boolean;
    readonly _dirtyFields: Set<string>;
    readonly requiresRebuild: boolean;
    /**
     * Minimum interval in milliseconds between follow-target tile updates.
     * `0` means update every frame.
     */
    readonly FollowUpdateInterval: number;
    /**
     * Sets the minimum interval between follow-target updates.
     * @param intervalMs Milliseconds. Must be ≥ 0.
     */
    setFollowUpdateInterval(intervalMs: number): void;
    flushDirtyState(): void;
}

// ─── ThreeGeoPlay ─────────────────────────────────────────────────────────────

/**
 * Main entry point for ThreeGeoPlay.
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
 */
export declare class ThreeGeoPlay {
    /**
     * @param threeScene    Three.js scene.
     * @param threeCamera   Three.js camera (also the default follow target).
     * @param threeRenderer Three.js renderer.
     */
    constructor(threeScene: THREE.Scene, threeCamera: THREE.Camera, threeRenderer: THREE.WebGLRenderer);

    /**
     * Sets the object the map will follow in `FOLLOW_TARGET` mode.
     * Automatically switches `viewMode` to `FOLLOW_TARGET` if needed.
     * @param target Any Three.js Object3D (mesh, group, camera, …).
     */
    setFollowTarget(target: THREE.Object3D): void;

    /**
     * Moves the map origin to geographic coordinates.
     * Only effective in `MANUAL` mode.
     * @param lat Latitude  −90 … 90.
     * @param lon Longitude −180 … 180.
     */
    moveMapOriginToLatLon(lat: number, lon: number): void;

    /**
     * Moves the map origin to a Three.js world-space position.
     * Automatically switches to `MANUAL` mode if needed.
     */
    moveMapOriginToPosition(x: number, z: number): void;

    /**
     * Initialises the map and loads the first set of tiles.
     * Call once after setting up `MapConfig` and `MapStyle`.
     */
    start(): void;

    /**
     * Processes per-frame updates. **Must be called every frame in your animation loop.**
     */
    onFrameUpdate(): void;

    /** Returns the active `MapConfig`. Modify its properties to change map behaviour. */
    getMapConfig(): MapConfig;

    /** Replaces the entire map configuration. */
    setMapConfig(mapConfig: MapConfig): void;

    /** Returns the active `MapStyle`. */
    getMapStyle(): MapStyle;

    /** Replaces the active map style. */
    setMapStyle(mapStyle: MapStyle): void;

    getScene(): THREE.Scene;
    getCamera(): THREE.Camera;
    getRenderer(): THREE.WebGLRenderer;

    /** Destroys the instance and releases all resources. */
    destroy(): void;
}