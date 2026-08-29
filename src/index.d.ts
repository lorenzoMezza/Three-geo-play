import * as THREE from 'three';

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Available tile loading patterns. */
export declare const TileLayout: {
    readonly CIRCULAR: 'circular';
    readonly GRID: 'grid';
};
export type TileLayout = typeof TileLayout[keyof typeof TileLayout];

/** Camera / map tracking modes. */
export declare const ViewMode: {
    readonly FOLLOW_TARGET: 'follow_target';
    readonly MANUAL: 'manual';
};
export type ViewMode = typeof ViewMode[keyof typeof ViewMode];

// ─── Utility types ────────────────────────────────────────────────────────────

export interface LatLon {
    lat: number;
    lon: number;
}

export interface WorldOffset {
    x: number;
    z: number;
}

// ─── Layer sub-types ──────────────────────────────────────────────────────────

/** A single land cover type (grass, wood, sand, …). */
export declare class LandCoverType {
    /** Whether this type is rendered. */
    isVisible: boolean;
    /** Three.js material used for this land cover. */
    material: THREE.Material;
    /** Y-axis render order offset. */
    YOrder: number;
    setVisible(v: boolean): void;
}

/** A single land use type (residential, industrial, hospital, …). */
export declare class LandUseType {
    isVisible: boolean;
    material: THREE.Material;
    YOrder: number;
    setVisible(v: boolean): void;
}

/** A single water body type (river, lake, ocean, …). */
export declare class WaterType {
    isVisible: boolean;
    material: THREE.Material;
    YOrder: number;
    setVisible(v: boolean): void;
}

/** A single waterway type (river, canal, ditch, …). */
export declare class WaterwayType {
    isVisible: boolean;
    material: THREE.Material;
    outlineMaterial: THREE.Material;
    YOrder: number;
    /** Half-width of the rendered line in world units. Must be ≥ 0. */
    lineWidth: number;
    /**
     * Per-type outline width. Set to `null` to inherit from the layer default.
     */
    outlineWidth: number | null;
    setVisible(v: boolean): void;
    /** Resets outlineWidth to null (falls back to layer default). */
    resetOutlineWidth(): void;
}

/** A single road / transport type (motorway, primary, rail, …). */
export declare class RoadType {
    isVisible: boolean;
    material: THREE.Material;
    outlineMaterial: THREE.Material;
    YOrder: number;
    /** Half-width of the road geometry in world units. Must be ≥ 0. */
    lineWidth: number;
    /** Per-type outline width. `null` falls back to GeneralConfig.outlineWidth. */
    outlineWidth: number | null;
    setVisible(v: boolean): void;
    resetOutlineWidth(): void;
}

// ─── Layers ───────────────────────────────────────────────────────────────────

/** Background base-fill layer rendered beneath everything else. */
export declare class BackgroundLayer {
    isVisible: boolean;
    material: THREE.Material;
    /** Y-axis render order (very negative — renders under all other layers). */
    YOrder: number;
    getTypeByName(name: string): this;
}

/** 3D building extrusion layer. */
export declare class BuildingLayer {
    isVisible: boolean;
    /** Material applied to building faces. */
    material: THREE.Material;
    YOrder: number;
    /** Base extrusion height multiplier for buildings without OSM height data. */
    height: number;
    /** Enable finer roof / detail shapes when available in tile data. */
    allowDetails: boolean;
    getTypeByName(name: string): this;
    setMaterial(material: THREE.Material): this;
    setYOrder(y: number): this;
    setHeight(h: number): this;
    setAllowDetails(val: boolean): this;
}

export type LandCoverClassName = 'sand' | 'park' | 'grass' | 'wood' | 'wetland' | 'rock' | 'farmland';

/** Manages land cover types (grass, wood, sand, …). */
export declare class LandCoverLayer {
    /** Master toggle — also propagates to all individual types. */
    isVisible: boolean;
    readonly sand: LandCoverType;
    readonly park: LandCoverType;
    readonly grass: LandCoverType;
    readonly wood: LandCoverType;
    readonly wetland: LandCoverType;
    readonly rock: LandCoverType;
    readonly farmland: LandCoverType;
    getTypeByName(name: LandCoverClassName): LandCoverType | null;
    setAllMaterials(material: THREE.Material): void;
    setVisibleAll(isVisible: boolean): void;
}

export type LandUseClassName =
    | 'farmland' | 'suburb' | 'residential' | 'industrial' | 'pitch'
    | 'university' | 'retail' | 'playground' | 'commercial' | 'military'
    | 'school' | 'college' | 'bus_station' | 'kindergarten' | 'theme_park'
    | 'hospital' | 'railway' | 'parking' | 'recreation_ground' | 'cemetery'
    | 'library' | 'track' | 'stadium' | 'quarter' | 'zoo' | 'attraction'
    | 'religious' | 'quarry' | 'nature_reserve' | 'protected_area';

/** Manages land use types (residential, industrial, parks, …). */
export declare class LandUseLayer {
    isVisible: boolean;
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
    getTypeByName(name: LandUseClassName): LandUseType | null;
    setAllMaterials(material: THREE.Material): void;
    setVisibleAll(v: boolean): void;
    static readonly admittedClasses: Set<LandUseClassName>;
}

export type WaterClassName = 'swimming_pool' | 'river' | 'lake' | 'ocean' | 'pond';

/** Manages water body types (lakes, oceans, rivers as polygons). */
export declare class WaterLayer {
    isVisible: boolean;
    readonly swimming_pool: WaterType;
    readonly river: WaterType;
    readonly lake: WaterType;
    readonly ocean: WaterType;
    readonly pond: WaterType;
    getTypeByName(name: WaterClassName): WaterType | null;
    setAllMaterials(material: THREE.Material): void;
    setVisibleAll(isVisible: boolean): void;
}

export type WaterwayClassName = 'river' | 'stream' | 'tidal_channel' | 'flowline' | 'canal' | 'drain' | 'ditch' | 'pressurised';

/** Manages waterway types (rivers, canals, ditches as lines). */
export declare class WaterwayLayer {
    isVisible: boolean;
    readonly river: WaterwayType;
    readonly stream: WaterwayType;
    readonly tidal_channel: WaterwayType;
    readonly flowline: WaterwayType;
    readonly canal: WaterwayType;
    readonly drain: WaterwayType;
    readonly ditch: WaterwayType;
    readonly pressurised: WaterwayType;
    getTypeByName(name: WaterwayClassName): WaterwayType | null;
    setAllMaterials(material: THREE.Material, outlineMaterial?: THREE.Material): void;
    setOutlineWidthAll(width: number): void;
    resetOutlineWidthAll(): void;
    setLineWidthAll(width: number): void;
    setVisibleAll(isVisible: boolean): void;
}

/** Shared defaults applied to all road types unless individually overridden. */
export declare class GeneralConfig {
    /** Segments used to round road joints. Minimum 6. */
    jointSegments: number;
    /** Default outline width in world units for all road types without their own override. */
    outlineWidth: number;
}

export type TransportClassName =
    | 'motorway' | 'trunk' | 'trunk_construction'
    | 'primary' | 'primary_construction'
    | 'secondary' | 'secondary_construction'
    | 'tertiary' | 'minor' | 'minor_construction'
    | 'service' | 'service_construction'
    | 'rail' | 'transit' | 'pedestrian'
    | 'path' | 'path_construction'
    | 'track' | 'pier' | 'ferry';

/** Manages all road and transport types rendered on the map. */
export declare class TransportationLayer {
    readonly isVisible: boolean;
    /** Shared configuration defaults (joint segments, global outline width). */
    readonly generalConfig: GeneralConfig;
    readonly motorway: RoadType;
    readonly trunk: RoadType;
    readonly trunk_construction: RoadType;
    readonly primary: RoadType;
    readonly primary_construction: RoadType;
    readonly secondary: RoadType;
    readonly secondary_construction: RoadType;
    readonly tertiary: RoadType;
    readonly minor: RoadType;
    readonly minor_construction: RoadType;
    readonly service: RoadType;
    readonly service_construction: RoadType;
    readonly rail: RoadType;
    readonly transit: RoadType;
    readonly pedestrian: RoadType;
    readonly path: RoadType;
    readonly path_construction: RoadType;
    readonly track: RoadType;
    readonly pier: RoadType;
    readonly ferry: RoadType;
    /**
     * Returns the effective outline width for a road type:
     * the type's own value if set, otherwise `generalConfig.outlineWidth`.
     */
    resolveOutlineWidth(roadType: RoadType): number;
    setOutlineWidthAll(width: number): void;
    resetOutlineWidthAll(): void;
    setVisible(isVisible: boolean): void;
    setAllMaterials(material: THREE.Material, outlineMaterial?: THREE.Material): void;
    getTypeByName(name: TransportClassName): RoadType | null;
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