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
    /** Tiles on screen still waiting to be rebuilt after a style change (0 once it is applied). */
    rebuilding: number;
}

/** Style layer names. */
export type StyleLayerName = 'background' | 'waterway' | 'water' | 'landcover' | 'landuse' | 'building' | 'transportation' | 'shadow';

/**
 * A tile on screen (see `ThreeGeoPlay.getTiles()` and the `tileload` / `tileunload` events).
 *
 * `object3D` is the tile's group, child of the map group. Its local frame is fixed for the
 * tile's life: the tile spans `[0, size]` on X and Z (north-west corner at the origin), the
 * ground is at Y 0 and `unitsPerMeter` converts metres. Objects added to it follow the tile
 * and leave the scene with it — dispose their resources on `tileunload`.
 */
export interface MapTile {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
    readonly object3D: THREE.Group;
    /** Side of the tile in `object3D` units. */
    readonly size: number;
    /** `object3D` units per metre (heights included). */
    readonly unitsPerMeter: number;
    /** Decodes the features of the tile — every layer, also those not drawn — optionally of one layer only. */
    getFeatures(sourceLayer?: string): TileFeature[];
}

/** A feature of a vector tile, geometry in the local frame of its `MapTile.object3D`. */
export interface TileFeature {
    /** Layer of the vector tile (`'building'`, `'poi'`, …). */
    sourceLayer: string;
    id: number;
    type: 'point' | 'line' | 'polygon';
    properties: Record<string, string | number | boolean>;
    /** Parts (points, lines or polygon rings — exterior then holes) as flat `[x0, z0, x1, z1, …]` arrays. */
    geometry: number[][];
}

/** A map feature found by `ThreeGeoPlay.getFeatureAt()` / `pickFeature()`. */
export interface MapFeature {
    /** Style layer it is drawn with. */
    layer: StyleLayerName;
    /** Style type name (`'primary'`, `'residential'`, `'building'`, …). */
    type: string;
    /** Style type object (e.g. `style.transportationLayer.primary`). */
    style: BaseFeatureType;
    /** Layer of the vector tile. */
    sourceLayer: string;
    id: number;
    properties: Record<string, string | number | boolean>;
    /** Tile the feature was hit in. */
    tile: MapTile;
    /** Outline in the tile's local frame, as in `TileFeature.geometry`. */
    getGeometry(): number[][];
}

/** A feature picked along a ray, with the intersection. */
export interface PickedFeature extends MapFeature {
    intersection: THREE.Intersection;
}

/** The vector tile feature passed to a `featureStyle` function. */
export interface StyledFeature {
    id: number;
    properties: Record<string, string | number | boolean>;
    /** Layer of the vector tile. */
    sourceLayer: string;
    /** Style type name the feature was matched to (`'primary'`, `'park'`, `'building'`, …). */
    type: string;
}

/** Per-feature overrides returned by a `featureStyle` function. */
export interface FeatureStyleOverrides {
    /** `false` skips the feature. */
    visible?: boolean;
    /** Draws the feature with another material. */
    material?: THREE.Material;
    /** Lines: draws the outline with another material. */
    outlineMaterial?: THREE.Material;
}

/** Per-building overrides returned by `BuildingLayer.featureStyle`. */
export interface BuildingFeatureStyle extends FeatureStyleOverrides {
    /** Tint multiplied into the building colour (needs a `vertexColors` material; a warning tells otherwise). */
    color?: THREE.ColorRepresentation;
    /** Height in metres instead of the OSM one. */
    height?: number;
    /** Base height in metres instead of the OSM one. */
    minHeight?: number;
}

// ─── Feature types ────────────────────────────────────────────────────────────

/**
 * Properties shared by every feature type (and by single-type layers).
 * Every change is applied to the tiles already on screen on the next `onFrameUpdate()`.
 */
export declare class BaseFeatureType {
    /** Whether this type is rendered. */
    isVisible: boolean;
    /**
     * Fill material, used as is (ThreeGeoPlay never modifies it, so it can be shared
     * with your own objects). Map geometry faces up (+Y): `THREE.FrontSide` materials work.
     */
    material: THREE.Material | null;
    /** Height (world units) at which this type is drawn (default 0: flat layers are stacked by `renderingOrder`, not by height). */
    Y: number;
    /**
     * Three.js render order (negative recommended). Flat map layers lie on the same
     * plane: they are drawn without writing depth (during their own draw only) and
     * stacked by this value; they are still depth tested, so buildings and your
     * objects in front of them hide them. A transparent flat layer is drawn after
     * every opaque one (Three.js draws transparent objects last).
     * Line types use `[renderingOrder, renderingOrder + 1)`: tunnels < ground < bridges,
     * outlines below fills, wider lines above narrower ones.
     */
    renderingOrder: number;
    /**
     * Casts shadows (default `false`; `true` for buildings). Shadows need
     * `renderer.shadowMap.enabled` and a light with `castShadow`. Buildings with a
     * transparent material (glass) let the light through and cast none.
     */
    castShadow: boolean;
    /**
     * Receives shadows (default `false`; `true` for buildings). Only lit materials show them;
     * with the default unlit map materials, ground shadows come from `MapStyle.shadowLayer`.
     */
    receiveShadow: boolean;
    /**
     * Data-driven styling: called for every feature of this type, returns overrides (or nothing).
     * Assign it again, or call `MapStyle.refresh()`, when what it returns changes.
     * @example
     * roads.primary.featureStyle = ({ id }) => (id === selectedId ? { material: highlight } : null);
     */
    featureStyle: ((feature: StyledFeature) => FeatureStyleOverrides | null | undefined | void) | null;
    /** Alias of `isVisible`, named like `THREE.Object3D.visible`. */
    visible: boolean;
    /** Alias of `renderingOrder`, named like `THREE.Object3D.renderOrder`. */
    renderOrder: number;
    setVisible(v: boolean): void;
}

/** A single land cover type (grass, wood, sand, …). */
export type LandCoverType = BaseFeatureType;

/** A single land use type (residential, industrial, hospital, …). */
export type LandUseType = BaseFeatureType;

/** A single water body type (river, lake, ocean, …). */
export type WaterType = BaseFeatureType;

/** A line feature type (roads, waterways). */
export declare class LineFeatureType extends BaseFeatureType {
    /** Material of the outline drawn around the line. */
    outlineMaterial: THREE.Material | null;
    /**
     * Full line width, relative to one tile at zoom 18 (constant real-world width across zooms;
     * about 150 m × cos(latitude) per unit). Prefer `lineWidthMeters`. Must be ≥ 0.
     */
    lineWidth: number;
    /** Extra width drawn with `outlineMaterial` (same units as `lineWidth`). `0` disables it; `null` restores the default. */
    outlineWidth: number;
    /** Full line width in metres; when set (not `null`) it replaces `lineWidth`. Default `null`. */
    lineWidthMeters: number | null;
    /** Outline width in metres; when set (not `null`) it replaces `outlineWidth`. Default `null`. */
    outlineWidthMeters: number | null;
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
    /** Alias of `isVisible`, named like `THREE.Object3D.visible`. */
    visible: boolean;
    /** Every feature type of the layer, by class name. */
    readonly types: Readonly<Record<TName, TType>>;
    getTypeByName(name: TName | (string & {})): TType | null;
    setAllMaterials(material: THREE.Material): void;
    /** Sets `isVisible` on every type of the layer. */
    setVisibleAll(isVisible: boolean): void;
    /** Sets `receiveShadow` on every type of the layer (useful with lit materials). */
    setReceiveShadowAll(receiveShadow: boolean): void;
}

/** Shared behaviour of the line layers (roads, waterways). */
export declare class LineLayer<TName extends string> extends BaseLayer<TName, LineFeatureType> {
    /** Pass `null` as `material` to change only the outlines. */
    setAllMaterials(material: THREE.Material | null, outlineMaterial?: THREE.Material): void;
    /** Sets `lineWidth` on every type. */
    setLineWidthAll(width: number): void;
    setOutlineWidthAll(width: number): void;
    resetOutlineWidthAll(): void;
    setJointSegmentsAll(segments: number): void;
    setAllRenderOrder(order: number): void;
}

/** Background base-fill plane rendered beneath everything else. */
export declare class BackgroundLayer extends BaseFeatureType {
    getTypeByName(name: string): this;
}

/**
 * 3D building extrusion layer (`renderingOrder` is not applied to buildings).
 *
 * Buildings are ordinary depth-tested solids: they hide and are hidden by your objects,
 * cast and receive shadows, and their material is used exactly as configured.
 * Every vertex carries a baked colour — used by materials with `vertexColors: true`,
 * multiplied by `material.color` — made of the wall shading, the ambient occlusion,
 * the roof tint and the roof tone variation below.
 *
 * @example
 * style.buildingLayer.material  = new THREE.MeshStandardMaterial({ color: 0xeeeeee, vertexColors: true });
 * style.buildingLayer.roofColor = 0xd9a58c;
 */
export declare class BuildingLayer extends BaseFeatureType {
    /** Vertical exaggeration of the real OSM heights: `1` = true scale, `0` = flat. */
    height: number;
    /**
     * Baked directional shading of the walls, 0–1 (default 0.6): walls facing away from a
     * south-west sun get darker. Applies to `MeshBasicMaterial`s; lit materials are shaded
     * by your lights. `0` disables it.
     */
    wallShading: number;
    /** Darkening of the walls near the ground, 0–1 (default 0.45); fades out over the first ten metres. */
    ambientOcclusion: number;
    /** Tint of the roofs, multiplied by the material colour (default white). The getter returns a copy. */
    get roofColor(): THREE.Color;
    set roofColor(value: THREE.ColorRepresentation);
    /** Tone variation from roof to roof, 0–1 (default 0.08). */
    colorVariation: number;
    /**
     * With a transparent material, blend each pixel once, with the surface nearest to the camera —
     * no inner walls, no flicker where faces of the tile data coincide (default `true`). Uses stencil
     * bit `0x80`: create the renderer with `{ stencil: true }`. No effect on opaque materials.
     */
    depthPrepass: boolean;
    /**
     * Data-driven styling: called for every building of the tiles, returns overrides (or nothing).
     * Assign it again, or call `MapStyle.refresh()`, when what it returns changes.
     * @example
     * buildings.featureStyle = ({ properties }) => ({ color: properties.render_height > 30 ? 0xb0c4ff : 0xffffff });
     */
    featureStyle: ((feature: StyledFeature) => BuildingFeatureStyle | null | undefined | void) | null;
    /** @deprecated Has no effect. */
    allowDetails: boolean;
    getTypeByName(name: string): this;
    setMaterial(material: THREE.Material): this;
    setY(y: number): this;
    setHeight(h: number): this;
    /** @deprecated Has no effect. */
    setAllowDetails(val: boolean): this;
}

/**
 * Shadows cast on the ground by buildings and scene objects: a transparent plane with a
 * `THREE.ShadowMaterial` laid over the flat layers, drawn only while
 * `renderer.shadowMap.enabled` is true.
 */
export declare class ShadowLayer extends BaseFeatureType {
    getTypeByName(name: string): this;
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
export declare class WaterwayLayer extends LineLayer<WaterwayClassName> {
    readonly river: WaterwayType;
    readonly stream: WaterwayType;
    readonly tidal_channel: WaterwayType;
    readonly flowline: WaterwayType;
    readonly canal: WaterwayType;
    readonly drain: WaterwayType;
    readonly ditch: WaterwayType;
    readonly pressurised: WaterwayType;
    static readonly admittedClasses: Set<WaterwayClassName>;
}

export type TransportClassName =
    | 'motorway' | 'motorway_construction' | 'trunk' | 'trunk_construction'
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
export declare class TransportationLayer extends LineLayer<TransportClassName> {
    readonly motorway: RoadType;
    readonly motorway_construction: RoadType;
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
    /** Alias for the `isVisible` setter. */
    setVisible(isVisible: boolean): void;
    static readonly admittedClasses: Set<TransportClassName>;
}

// ─── MapStyle ─────────────────────────────────────────────────────────────────

/** The layers of a {@link MapStyle}, by name. */
export interface StyleLayers {
    background: BackgroundLayer;
    waterway: WaterwayLayer;
    water: WaterLayer;
    landcover: LandCoverLayer;
    landuse: LandUseLayer;
    building: BuildingLayer;
    transportation: TransportationLayer;
    shadow: ShadowLayer;
}

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
    /** Ground shadows, drawn while `renderer.shadowMap.enabled` is true. */
    shadowLayer: ShadowLayer;
    /** The layer with this name (see {@link StyleLayers}), or `null` for an unknown name. */
    getStyleLayerByName<N extends StyleLayerName>(layerName: N): StyleLayers[N];
    getStyleLayerByName(layerName: string): StyleLayers[StyleLayerName] | null;
    /**
     * Calls `callback` for every feature type of every layer. The single-type layers
     * (background, building, shadow) are passed as their own type, with `typeName` equal to the layer name.
     * @example style.forEachType(type => { if (type.material) type.material.clippingPlanes = planes; });
     */
    forEachType(callback: (type: BaseFeatureType, layerName: StyleLayerName, typeName: string) => void): void;
    /**
     * Applies the style again to the tiles on screen (next `onFrameUpdate()`). Property changes are
     * detected by themselves; call it when something they cannot see changes, e.g. the result of a
     * `featureStyle` function that depends on your own state.
     */
    refresh(): void;
    /** An independent copy: every setting, materials cloned (shared materials stay shared in the copy). */
    clone(): MapStyle;
    /** A ready-made night style (dark ground, glowing arterial roads, unlit shaded buildings). */
    static dark(): MapStyle;
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
    /**
     * Web-Mercator zoom level, integer 0–24 (default 18). Changing it reloads all tiles.
     * A level the tile source does not serve is replaced by the nearest one it serves, at the same scale (with a warning).
     */
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
    /**
     * The map ground hides what is below it, like a solid floor (default `true`): an invisible
     * plane writes the ground depth before anything else is drawn. `false` lets you see through it.
     */
    occludeBelowGround: boolean;
    /**
     * World units per metre, e.g. `1` for a scene in metres. When set, `tileWorldSize` is derived
     * from it (and follows zoom / origin changes); setting `tileWorldSize` clears it. Default `null`.
     */
    unitsPerMeter: number | null;
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
    occludeBelowGround?: boolean;
    unitsPerMeter?: number | null;
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
    /** A tile appeared on screen. */
    tileload: { tile: MapTile };
    /** A tile left the render area (or the map was destroyed / reloaded). */
    tileunload: { tile: MapTile };
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
     * Places the given coordinates at the world origin. In `MANUAL` mode the loaded area is centered
     * there; in `FOLLOW_TARGET` mode the map keeps following its target (the mode never changes).
     */
    moveMapOriginToLatLon(lat: number, lon: number): void;

    /**
     * Centers the loaded area on a world-space X/Z position without changing the
     * geographic origin. Switches to `MANUAL` mode if needed.
     */
    moveMapOriginToPosition(x: number, z: number): void;

    /** Converts geographic coordinates to world-space X/Z with the current config. */
    latLonToWorld(lat: number, lon: number): WorldPosition;

    /** World units per metre at the map origin (`MapConfig.unitsPerMeter`, or derived from `tileWorldSize`). */
    getUnitsPerMeter(): number;

    /**
     * Top of the highest building part at a map-space position, 0 on open ground or where no tile is
     * loaded. Follows what is drawn (exaggeration, `featureStyle`); cheap enough for every frame.
     * @example marker.position.set(x, geoPlay.getHeightAt(x, z), z);
     */
    getHeightAt(x: number, z: number): number;

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

    /**
     * The group containing every map mesh, added to the scene by `start()` unless you parented it
     * yourself. Move, rotate, scale or re-parent it freely; its `layers` apply to every map mesh,
     * `visible` and `renderOrder` work as for any group. Map objects have `userData.threeGeoPlay`.
     * The API's world coordinates are in this group's space.
     */
    getMapGroup(): THREE.Group;

    /**
     * The feature drawn at a raycast intersection with the map (`null` for ground planes and other objects).
     * With flat layers the nearest intersection is not always the visible one: prefer `pickFeature()`.
     */
    getFeatureAt(intersection: THREE.Intersection): MapFeature | null;

    /** The map feature seen along a ray (flat layers compete by render order, like on screen), or `null`. */
    pickFeature(raycaster: THREE.Raycaster): PickedFeature | null;

    /** The tiles on screen (also passed to the `tileload` / `tileunload` events). */
    getTiles(): MapTile[];

    getScene(): THREE.Scene;
    getCamera(): THREE.Camera;
    getRenderer(): THREE.WebGLRenderer;

    /** Removes the map from the scene, stops downloads and frees geometry. Materials are not disposed. */
    destroy(): void;
}
