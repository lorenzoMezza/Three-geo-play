# ThreeGeoPlay API reference

Complete reference of `lm-three-geo-play` **2.x**. For a guided introduction, screenshots and recipes see the [README](https://github.com/lorenzoMezza/Three-geo-play#readme).

Everything listed here is exported from the package root and typed in the bundled TypeScript declarations:

```js
import { ThreeGeoPlay, MapConfig, MapStyle, ViewMode, TileLayout, TileSchema } from 'lm-three-geo-play';
```

## Contents

- [Package and requirements](#package-and-requirements)
- [Coordinates and units](#coordinates-and-units)
- [ThreeGeoPlay](#threegeoplay)
  - [Constructor](#constructor) · [Lifecycle](#lifecycle) · [Configuration and style](#configuration-and-style) · [Following and positioning](#following-and-positioning) · [Coordinates and heights](#coordinates-and-heights) · [Picking](#picking) · [Tiles and loading](#tiles-and-loading) · [Scene objects](#scene-objects) · [Events](#events)
- [MapConfig](#mapconfig)
- [MapStyle](#mapstyle)
- [Feature types](#feature-types)
  - [BaseFeatureType](#basefeaturetype) · [LineFeatureType](#linefeaturetype) · [BuildingLayer](#buildinglayer) · [BackgroundLayer](#backgroundlayer) · [ShadowLayer](#shadowlayer)
- [Layers](#layers)
  - [BaseLayer](#baselayer) · [TransportationLayer](#transportationlayer) · [WaterwayLayer](#waterwaylayer) · [WaterLayer](#waterlayer) · [LandUseLayer](#landuselayer) · [LandCoverLayer](#landcoverlayer)
- [Data-driven styling](#data-driven-styling)
- [Data types](#data-types)
- [Enums](#enums)
- [Tile sources and schemas](#tile-sources-and-schemas)
- [Rendering model](#rendering-model)
- [Errors and warnings](#errors-and-warnings)

---

## Package and requirements

| | |
|---|---|
| Formats | ES module (`import`) and CommonJS (`require`), selected automatically through `exports` |
| Types | `three-geo-play.d.ts` (ESM) and `three-geo-play.d.cts` (CommonJS), no `@types` package needed |
| Three.js | peer dependency `three >= 0.150.0`; never bundled — your copy is used |
| Batched drawing | three **r170+** (one `THREE.BatchedMesh` per material); older versions fall back to one mesh per tile |
| Renderer | `THREE.WebGLRenderer`; create it with `{ stencil: true }` for [transparent buildings](#transparency) |
| Runtime dependencies | none (vector tile decoder and triangulation are built in) |

Tested with three r150, r155, r160, r165, r168–r172, r175, r178, r180, r183 and r186; TypeScript 5.9 and 7 with `moduleResolution` `bundler`, `node16` and `nodenext`.

The library also runs in Node.js 18+ (it uses no DOM API; tested with Node 25): tiles are downloaded, decoded and built without WebGL, which is useful for tests and tooling.

---

## Coordinates and units

- **World space** means the local space of the [map group](#getmapgroup) (the scene's space unless you parent or transform the group). Every method taking or returning `x` / `z` uses it.
- **Axes**: X points east, Z points south (north is −Z), Y is up. The ground is at Y 0.
- **Scale**: one tile is `tileWorldSize` units wide. Set [`unitsPerMeter`](#mapconfig) instead to get a true metric scale around the origin (`unitsPerMeter: 1` = metres); [`getUnitsPerMeter()`](#getunitspermeter) returns the current scale either way. Building heights use the same scale as distances.
- **Origin**: `originLatLon` is placed at `worldOriginOffset` (default `{ x: 0, z: 0 }`).
- **Tile frame**: each [`MapTile.object3D`](#maptile) has a fixed local frame for the tile's life: X and Z span `[0, tile.size]` from the north-west corner, Y 0 is the ground and `tile.unitsPerMeter` converts metres. Objects added to it follow the tile when the map is moved or rescaled.

---

## ThreeGeoPlay

`class ThreeGeoPlay extends THREE.EventDispatcher`

The map. It owns a `THREE.Group` with every map mesh, loads the tiles around a target and applies config and style changes once per frame.

### Constructor

```ts
new ThreeGeoPlay(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, options?: MapConfigOptions)
```

| Parameter | Description |
|---|---|
| `scene` | Scene the map group is added to by `start()` (unless you parented the group yourself). |
| `camera` | Camera; also the default [follow target](#setfollowtarget). |
| `renderer` | Renderer; its `shadowMap.enabled` toggles the [shadow layer](#shadowlayer), its stencil buffer is used by [transparent buildings](#transparency). |
| `options` | Initial [`MapConfig`](#mapconfig) values, as accepted by `MapConfig.set()`. |

Throws if a parameter is missing or an option is unknown or invalid.

```js
const geo = new ThreeGeoPlay(scene, camera, renderer, {
  tileUrl: 'https://tiles.openfreemap.org/planet',
  originLatLon: { lat: 41.9028, lon: 12.4964 },
  zoomLevel: 14,
  unitsPerMeter: 1,
});
```

### Lifecycle

#### `start(): void`

Adds the map group to the scene (if it has no parent yet) and starts loading tiles around the follow target (or around the manual centre in `MANUAL` mode). Call it once. Throws if `tileUrl` is not set; warns and does nothing if already started or destroyed.

#### `onFrameUpdate(): void`

**Call it every frame**, before `renderer.render()`. It applies pending [`MapConfig`](#mapconfig) and [`MapStyle`](#mapstyle) changes, moves the loaded area with the follow target, and builds tiles in time slices of a few milliseconds (loading never blocks the frame). Does nothing before `start()` or after `destroy()`.

#### `destroy(): void`

Removes the map group from the scene, aborts downloads and disposes every map geometry. Materials belong to the style and are **not** disposed. The instance cannot be used afterwards; `tileunload` is dispatched for the tiles on screen.

### Configuration and style

#### `getMapConfig(): MapConfig`

The live configuration. Change its properties at any time; changes are applied on the next `onFrameUpdate()`.

#### `setMapConfig(config: MapConfig): void`

Replaces the whole configuration (applied at once if the map is running).

#### `getMapStyle(): MapStyle`

The active style — the same object as `getMapConfig().mapStyle`. Changes to it are detected and applied to the tiles on screen on the next `onFrameUpdate()`.

#### `setMapStyle(style: MapStyle): void`

Replaces the style; the loaded tiles are rebuilt from their cached data (no download).

### Following and positioning

#### `setFollowTarget(target: THREE.Object3D): void`

Loads tiles around `target`'s world position (the camera by default) and switches `viewMode` to `FOLLOW_TARGET`. The position is read through the map group's transform, so the target can live anywhere in the scene graph. `MapConfig.followUpdateInterval` throttles the updates.

#### `moveMapOriginToLatLon(lat: number, lon: number): void`

Places the coordinates at `worldOriginOffset`: the map moves under your scene. In `MANUAL` mode the loaded area is also centred there; in `FOLLOW_TARGET` mode the map keeps following its target (the mode never changes).

#### `moveMapOriginToPosition(x: number, z: number): void`

Loads the tiles around a world position without changing the geographic origin. Switches to `MANUAL` mode.

### Coordinates and heights

#### `latLonToWorld(lat: number, lon: number): { x: number, z: number }`

Web Mercator projection of geographic coordinates to world X/Z with the current config.

#### `worldToLatLon(x: number, z: number): { lat: number, lon: number }`

The inverse conversion.

#### `getUnitsPerMeter(): number`

World units per metre at the origin: `MapConfig.unitsPerMeter` when set, otherwise derived from `tileWorldSize`, the zoom level and the origin latitude.

#### `getHeightAt(x: number, z: number): number`

Top of the highest building part at a world position, in world units; `0` on open ground or where no tile is loaded. It uses the same footprints and heights that are drawn (vertical exaggeration and `featureStyle` included) through a spatial index, so it is cheap enough to call every frame — for collisions, placing objects on roofs or keeping a camera above the buildings.

```js
player.position.y = Math.max(player.position.y, geo.getHeightAt(player.position.x, player.position.z));
```

### Picking

#### `pickFeature(raycaster: THREE.Raycaster): PickedFeature | null`

The map feature **seen** along the ray — building, road, water, park… — or `null`. Flat layers lie on the same plane and are stacked by render order, so the visible one is not necessarily the nearest intersection: this method resolves it like the renderer does. Ground planes and objects that are not part of the map are skipped. See [`PickedFeature`](#pickedfeature).

```js
raycaster.setFromCamera(pointer, camera);
const hit = geo.pickFeature(raycaster);
if (hit?.layer === 'building') console.log(hit.id, hit.properties.render_height, hit.intersection.point);
```

It raycasts the map geometry, so its cost grows with the detail on screen: a few milliseconds on a zoom-16 map, tens of milliseconds on large zoom-14 tiles of a dense city. Call it on clicks, or throttle it for hover effects.

#### `getFeatureAt(intersection: THREE.Intersection): MapFeature | null`

The feature drawn at an intersection of your own raycast with a map mesh; `null` for ground planes and objects that are not part of the map.

### Tiles and loading

#### `getTiles(): MapTile[]`

The tiles on screen (see [`MapTile`](#maptile)).

#### `getTileStats(): TileStats`

Loading progress of the tiles in the render area — for a progress bar, or to know when everything is on screen and up to date (`loading === 0 && rebuilding === 0`). See [`TileStats`](#tilestats).

#### `getTileSource(): TileSource | null`

The resolved tile source (URL templates, zoom range, attribution, layers), or `null` before `start()` and while a TileJSON / style URL is loading. Display `attribution`: providers require it.

### Scene objects

#### `getMapGroup(): THREE.Group`

The group holding every map mesh (named `'ThreeGeoPlay'`). It is yours:

- add it to one of your objects before `start()` and it stays there; move, rotate or scale it freely;
- set its `layers` and every map mesh follows (Three.js layers are not inherited, the library copies them);
- `visible` and `renderOrder` work as for any group.

Every map object has `userData.threeGeoPlay === true`; map meshes also have `userData.kind` (`'polygon'`, `'line'`, `'outline'` or `'building'`).

#### `getScene()`, `getCamera()`, `getRenderer()`

The objects passed to the constructor.

### Events

`ThreeGeoPlay` is a `THREE.EventDispatcher`: use `addEventListener`, `removeEventListener` and `hasEventListener`. An exception thrown by a listener is logged and does not stop the map.

| Event | Payload | When |
|---|---|---|
| `sourceload` | `{ source: TileSource }` | The tile source is resolved (TileJSON / style read, or template ready). |
| `sourceerror` | `{ error: Error, willRetry: boolean }` | The source cannot be read, the provider refuses access (HTTP 401 / 403), or none of the first tiles exists (usually a wrong template or an unsupported zoom level). Configuration errors are not retried. |
| `tileload` | `{ tile: MapTile }` | A tile is built and on screen. |
| `tileunload` | `{ tile: MapTile }` | A tile leaves the render area, or the map is reloaded or destroyed. Dispose what you attached to `tile.object3D`. |

```js
geo.addEventListener('sourceload',  ({ source }) => { credits.innerHTML = source.attribution; });
geo.addEventListener('sourceerror', ({ error }) => console.error(error.message));
geo.addEventListener('tileload',    ({ tile }) => decorate(tile));
geo.addEventListener('tileunload',  ({ tile }) => undecorate(tile));
```

---

## MapConfig

`class MapConfig`

Holds the map settings. Get the live instance with `geo.getMapConfig()`, or pass options to the constructor. Properties are validated when set (invalid values throw) and applied on the next `onFrameUpdate()`, doing only the work each change needs.

#### `set(values: MapConfigOptions): this`

Sets several properties at once. Unknown names throw.

```js
geo.getMapConfig().set({ zoomLevel: 16, renderDistance: 6, unitsPerMeter: 1 });
```

### Properties

| Property | Type | Default | Effect of a change |
|---|---|---|---|
| `tileUrl` | `string` | `''` (required) | Reloads every tile. A `{z}/{x}/{y}` template, a TileJSON URL, a MapLibre / Mapbox style URL or a `mapbox://` URL — see [Tile sources](#tile-sources-and-schemas). |
| `accessToken` | `string` | `''` | Reloads every tile. Mapbox token for `mapbox://` URLs and `api.mapbox.com` tiles. |
| `tileSchema` | `TileSchema \| TileSchemaFunction` | `TileSchema.AUTO` | Rebuilds the tiles from cached data. |
| `zoomLevel` | integer 0–24 | `18` | Reloads every tile. OpenMapTiles providers usually stop at 14, Mapbox at 16: a level the source does not serve is replaced by the nearest one it serves, at the same scale (with a warning). |
| `renderDistance` | integer ≥ 0 | `4` | Loads / unloads tiles. Tiles loaded in each direction from the centre tile. |
| `tileLayout` | `TileLayout` | `CIRCULAR` | Loads / unloads tiles. Circular or square render area. |
| `unitsPerMeter` | `number \| null` | `null` | Rescales the tiles. World units per metre; while set, `tileWorldSize` is derived from it and follows zoom and origin changes. |
| `tileWorldSize` | `number > 0` | `1` | Rescales the tiles (no reload). World units per tile; setting it clears `unitsPerMeter`. |
| `originLatLon` | `{ lat, lon }` (frozen) | `{ lat: 41.899689, lon: 12.43779 }` | Re-places the tiles. Geographic point at `worldOriginOffset`. Assign a new object to change it. |
| `worldOriginOffset` | `{ x, z }` (frozen) | `{ x: 0, z: 0 }` | Re-places the tiles. World position of `originLatLon`. |
| `viewMode` | `ViewMode` | `FOLLOW_TARGET` | `FOLLOW_TARGET`: tiles follow the target. `MANUAL`: they stay where `moveMapOriginToPosition()` put them. |
| `followUpdateInterval` | ms ≥ 0 | `0` | Minimum time between follow updates (`0` = every frame). |
| `mapStyle` | `MapStyle` | `new MapStyle()` | Rebuilds the tiles from cached data. Same as `setMapStyle()`. |
| `showTileBorders` | `boolean` | `false` | Draws a border around every tile (debugging). |
| `occludeBelowGround` | `boolean` | `true` | The ground hides what is below it (an invisible depth plane at the map's ground, drawn first). `false` lets you see through it, e.g. with your own terrain. |
| `zoomScaleFactor` | `number` (read-only) | — | Scale of the current zoom level relative to zoom 18. |
| `pbfTileProviderZXYurl` | `string` | — | Deprecated alias of `tileUrl`. |

`FollowUpdateInterval` and `setFollowUpdateInterval(ms)` are deprecated aliases of `followUpdateInterval`. `_isDirty`, `_dirtyFields`, `requiresRebuild` and `flushDirtyState()` are used by `ThreeGeoPlay` internally.

---

## MapStyle

`class MapStyle`

The look of the map: one object per layer, one [feature type](#feature-types) per class of feature. Every property can be changed live; the tiles on screen are updated on the next `onFrameUpdate()` without downloading them again. Materials are used exactly as given and never modified, so they can be shared with your own objects.

```js
const style = geo.getMapStyle();
style.transportationLayer.primary.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
style.buildingLayer.material = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, vertexColors: true });
```

### Layers

| Property | Class | Name for `getStyleLayerByName` | Default render order |
|---|---|---|---|
| `backgroundLayer` | [`BackgroundLayer`](#backgroundlayer) | `'background'` | −1000 |
| `landUseLayer` | [`LandUseLayer`](#landuselayer) | `'landuse'` | −4 |
| `landCoverLayer` | [`LandCoverLayer`](#landcoverlayer) | `'landcover'` | −3 |
| `waterLayer` | [`WaterLayer`](#waterlayer) | `'water'` | −2 |
| `waterwayLayer` | [`WaterwayLayer`](#waterwaylayer) | `'waterway'` | −2 |
| `transportationLayer` | [`TransportationLayer`](#transportationlayer) | `'transportation'` | −1 |
| `buildingLayer` | [`BuildingLayer`](#buildinglayer) | `'building'` | — (depth-tested solids) |
| `shadowLayer` | [`ShadowLayer`](#shadowlayer) | `'shadow'` | −0.001 |

Assigning a layer of the wrong class throws.

### Methods

#### `new MapStyle()`

The default day style: unlit `MeshBasicMaterial`s, light ground, grey roads, shaded opaque buildings.

#### `static dark(): MapStyle`

A ready-made night style: dark ground, glowing arterial roads, unlit shaded buildings.

#### `clone(): MapStyle`

An independent copy of every setting, with cloned materials (materials shared between types stay shared in the copy). Use it to derive variants.

#### `refresh(): void`

Applies the style again on the next frame. Property changes are detected automatically; call it when something the style cannot see changes — typically the result of a `featureStyle` function that depends on your own state.

#### `getStyleLayerByName(name: StyleLayerName): layer | null`

The layer with the given name (see the table), or `null` for an unknown name. In TypeScript the result is typed by the name (`StyleLayers[name]`).

#### `forEachType(callback: (type, layerName, typeName) => void): void`

Calls `callback` for every feature type of every layer; the single-type layers (background, building, shadow) are passed as their own type, with `typeName` equal to the layer name. Handy to change every material at once:

```js
style.forEachType(type => { if (type.material) type.material.clippingPlanes = planes; });
```

---

## Feature types

A feature type styles one class of features (e.g. `transportationLayer.primary`, `landCoverLayer.wood`). The background, building and shadow layers are single-type: their properties are set on the layer itself.

### BaseFeatureType

Properties shared by every type and single-type layer.

| Property | Type | Description |
|---|---|---|
| `material` | `THREE.Material \| null` | Fill material, used as is. Map geometry faces up (+Y), so `THREE.FrontSide` works. Normals are generated for lit materials, vertex colours for materials with `vertexColors`. |
| `isVisible` / `visible` | `boolean` | Whether the type is drawn. `setVisible(v)` does the same. |
| `Y` | `number` | Height the type is drawn at, in world units (default `0`: flat layers are stacked by `renderingOrder`, not by height). |
| `renderingOrder` / `renderOrder` | `number` | Three.js render order of the type (negative recommended). Flat layers are stacked by it — see [Rendering model](#rendering-model). |
| `castShadow` | `boolean` | Casts shadows (default `false`; `true` for buildings). |
| `receiveShadow` | `boolean` | Receives shadows (default `false`; `true` for buildings). Only lit materials show them; the default flat layers get their ground shadows from the [`shadowLayer`](#shadowlayer). |
| `featureStyle` | `(feature: StyledFeature) => FeatureStyleOverrides \| null` | Per-feature overrides; see [Data-driven styling](#data-driven-styling). Default `null`. |

### LineFeatureType

Roads and waterways (`RoadType`, `WaterwayType`) add:

| Property | Type | Description |
|---|---|---|
| `outlineMaterial` | `THREE.Material \| null` | Material of the outline drawn around the line (casing). |
| `lineWidthMeters` | `number \| null` | Full width in metres. When set it replaces `lineWidth`. Default `null`. |
| `outlineWidthMeters` | `number \| null` | Outline width in metres. When set it replaces `outlineWidth`. Default `null`. |
| `lineWidth` | `number ≥ 0` | Full width relative to one zoom-18 tile (about 150 m × cos(latitude) per unit), so the real-world width is the same at every zoom. |
| `outlineWidth` | `number ≥ 0` | Extra width drawn with `outlineMaterial`, same units as `lineWidth`. `0` disables the outline; `null` restores the default. |
| `jointSegments` | integer ≥ 6 | Points used to round caps and joints (default 8). |
| `resetOutlineWidth()` | method | Restores the default outline width. |

```js
style.transportationLayer.primary.lineWidthMeters = 14;
style.transportationLayer.primary.outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
```

Lines are layered like a printed map within `[renderingOrder, renderingOrder + 1)`: tunnels below the ground level, bridges above it (from the `brunnel` / `structure` and `layer` attributes), outlines below fills, wider roads above narrower ones, ramps under the road they merge into.

### BuildingLayer

`style.buildingLayer` — extruded 3D buildings, true-scale heights from OSM (`render_height` / `height`, `render_min_height` / `min_height`). Buildings are ordinary depth-tested solids: they hide your objects and are hidden by them, and cast and receive shadows.

| Property | Type | Default | Description |
|---|---|---|---|
| `material` | `THREE.Material` | `MeshBasicMaterial({ color: 0xf2ece1, vertexColors: true })` | Any material. With `vertexColors: true` it is multiplied by the colour baked into every vertex (wall shading, ambient occlusion, roof tint and tone). Lit materials get normals and are shaded by your lights. |
| `height` | `number ≥ 0` | `1` | Vertical exaggeration: `1` true scale, `0` flat. |
| `wallShading` | 0–1 | `0.6` | Baked darkening of walls facing away from a south-west sun. Applies to unlit materials; lit ones are shaded by your lights. |
| `ambientOcclusion` | 0–1 | `0.45` | Darkening of the walls near the ground, fading out over the first ten metres. |
| `roofColor` | `THREE.ColorRepresentation` | white | Roof tint multiplied by the material colour. The getter returns a copy: assign to change it. |
| `colorVariation` | 0–1 | `0.08` | Tone variation from roof to roof. |
| `depthPrepass` | `boolean` | `true` | With a transparent material, blend each pixel once, with the nearest surface — see [Transparency](#transparency). No effect on opaque materials. |
| `featureStyle` | `(feature) => BuildingFeatureStyle \| null` | `null` | Per-building colour, height, visibility or material — see [Data-driven styling](#data-driven-styling). |
| `castShadow` / `receiveShadow` | `boolean` | `true` | Shadows. |
| `Y` | `number` | `0` | Base height of the buildings. |

Chainable setters: `setMaterial(m)`, `setY(y)`, `setHeight(h)`. (`allowDetails` / `setAllowDetails()` are deprecated and have no effect.) `renderingOrder` is not applied to buildings. `getTypeByName()` returns the layer itself.

```js
const buildings = style.buildingLayer;
buildings.material  = new THREE.MeshStandardMaterial({ color: 0xeeeeee, vertexColors: true, roughness: 0.9 });
buildings.roofColor = 0xd9a58c;
buildings.height    = 1.5;
```

### BackgroundLayer

`style.backgroundLayer` — the ground plane under everything else (default `MeshBasicMaterial` `#d8d3a5`, render order −1000). Single-type: `material`, `isVisible`, `Y`, `renderingOrder`, shadows and so on are set on the layer.

### ShadowLayer

`style.shadowLayer` — a transparent plane with a `THREE.ShadowMaterial` (opacity 0.3) laid over the flat layers. It only darkens where a shadow falls, because the default flat layers are unlit and cannot show shadows themselves. It is drawn only while `renderer.shadowMap.enabled` is true; `material.opacity` sets the strength. If you give the flat layers lit materials, use `layer.setReceiveShadowAll(true)` and hide this layer.

---

## Layers

Multi-type layers hold one [feature type](#feature-types) per class, as properties (`style.landUseLayer.residential`) or by name (`getTypeByName('residential')`).

### BaseLayer

Methods and properties shared by the multi-type layers.

| Member | Description |
|---|---|
| `isVisible` / `visible` | Master switch: `false` hides the whole layer; `true` shows each type according to its own `isVisible` (per-type settings are kept). |
| `types` | Every type of the layer, by class name (a frozen object): `Object.values(layer.types)`. |
| `getTypeByName(name)` | The type with this class name, or `null`. |
| `setAllMaterials(material)` | Sets `material` on every type. |
| `setVisibleAll(visible)` | Sets `isVisible` on every type. |
| `setReceiveShadowAll(receive)` | Sets `receiveShadow` on every type (for lit materials). |
| `static admittedClasses` | `Set` of the class names the layer has a type for. |

### TransportationLayer

`style.transportationLayer` — roads, railways, paths and ferries. OpenMapTiles `subclass` values (e.g. `pedestrian`) take precedence over `class`. Extra methods: `setAllMaterials(material, outlineMaterial?)` (pass `null` as `material` to change only the outlines), `setLineWidthAll(width)`, `setOutlineWidthAll(width)`, `resetOutlineWidthAll()`, `setJointSegmentsAll(n)`, `setAllRenderOrder(order)`, `setVisible(v)`.

| Types | Visible by default | Default width (`lineWidth`) |
|---|---|---|
| `motorway`, `trunk`, `primary`, `secondary`, `tertiary` | yes | 0.1375, 0.125, 0.1125, 0.095, 0.075 |
| `minor`, `service`, `pedestrian`, `path` | yes | 0.055, 0.04, 0.03, 0.02 |
| `track`, `raceway`, `busway`, `bus_guideway`, `rail`, `transit`, `pier`, `ferry` | no | 0.025–0.065 |
| `motorway_construction`, `trunk_construction`, `primary_construction`, `secondary_construction`, `tertiary_construction`, `minor_construction`, `service_construction`, `track_construction`, `path_construction`, `raceway_construction` | no | slightly narrower than the finished road |

Default materials: fill `#9c9c9c`, outline `#3f3f3f` (outline width 0.03).

### WaterwayLayer

`style.waterwayLayer` — rivers and streams drawn as lines: `river`, `stream`, `tidal_channel`, `flowline`, `canal`, `drain`, `ditch`, `pressurised`. Same extra methods as `TransportationLayer` (except `setVisible`): both are line layers (`LineLayer` in the type declarations). Default fill `#3a8ab8`, outline `#1a3f60`.

### WaterLayer

`style.waterLayer` — water polygons: `swimming_pool`, `river`, `lake`, `ocean`, `pond`, `dock`.

### LandUseLayer

`style.landUseLayer` — `farmland`, `suburb`, `residential`, `industrial`, `pitch`, `university`, `retail`, `playground`, `commercial`, `military`, `school`, `college`, `bus_station`, `kindergarten`, `theme_park`, `hospital`, `railway`, `parking`, `recreation_ground`, `cemetery`, `library`, `track`, `stadium`, `quarter`, `zoo`, `attraction`, `religious`, `quarry`, `nature_reserve`, `protected_area`, `neighbourhood`, `garages`, `dam`.

### LandCoverLayer

`style.landCoverLayer` — `sand`, `park`, `grass`, `wood`, `wetland`, `rock`, `farmland`, `ice`, `allotments`, `bare_rock`, `beach`, `bog`, `dune`, `scrub`, `shrubbery`, `farm`, `fell`, `flowerbed`, `forest`, `garden`, `glacier`, `grassland`, `golf_course`, `heath`, `mangrove`, `marsh`, `meadow`, `orchard`, `plant_nursery`, `recreation_ground`, `reedbed`, `saltern`, `saltmarsh`, `scree`, `swamp`, `tidalflat`, `tundra`, `village_green`, `vineyard`, `wet_meadow`. OpenMapTiles `subclass` values (e.g. `park`, `forest`, `beach`) take precedence over `class`.

---

## Data-driven styling

Every feature type (and the building layer) accepts a `featureStyle` function. It is called for each feature of that type when a tile is built, with a [`StyledFeature`](#styledfeature), and returns overrides — or `null` / `undefined` to keep the type's style.

| Override | Applies to | Effect |
|---|---|---|
| `visible: false` | all | Skips the feature. |
| `material` | all | Draws the feature with another material. |
| `outlineMaterial` | lines | Draws the outline with another material. |
| `color` | buildings | Tint multiplied into the building colour; needs a `vertexColors` material (a warning tells otherwise). |
| `height`, `minHeight` | buildings | Height and base height in metres, instead of the OSM ones. |

The function runs again when a tile is rebuilt. When its answer changes because of your own state, assign it again or call `style.refresh()`:

```js
let selected = null;
style.buildingLayer.featureStyle = ({ id, properties }) =>
  id === selected ? { color: 0xff8844 } : { height: Number(properties.render_height ?? 10) * 1.2 };

renderer.domElement.addEventListener('click', () => {
  selected = geo.pickFeature(raycaster)?.id ?? null;
  style.refresh();
});

style.transportationLayer.path.featureStyle = ({ properties }) => (properties.name ? null : { visible: false });
```

Materials returned by `featureStyle` are batched like the type's own; reuse the same instances rather than creating one per feature.

---

## Data types

### MapTile

A tile on screen, from `getTiles()`, `tileload` and `tileunload`. Frozen.

| Member | Description |
|---|---|
| `x`, `y`, `zoom` | Tile coordinates (Web Mercator / XYZ). |
| `object3D` | The tile's `THREE.Group`, child of the map group. Its local frame is described in [Coordinates and units](#coordinates-and-units). Objects added here follow the tile and leave the scene with it. |
| `size` | Side of the tile in `object3D` units. |
| `unitsPerMeter` | `object3D` units per metre (heights included). |
| `getFeatures(sourceLayer?)` | Decodes the tile's features — every source layer, also those the map does not draw (`poi`, `place`, labels…) — optionally of one layer only. Returns [`TileFeature`](#tilefeature)`[]`. |

```js
geo.addEventListener('tileload', ({ tile }) => {
  for (const poi of tile.getFeatures('poi')) {
    if (poi.properties.rank > 3) continue;     // only the main places
    const [x, z] = poi.geometry[0];
    const pin = new THREE.Mesh(pinGeometry, pinMaterial);
    pin.position.set(x, 0, z);
    pin.scale.setScalar(tile.unitsPerMeter);   // 1 m model → metres of this tile
    tile.object3D.add(pin);
  }
});
```

Tiles of big cities hold a lot of data: a zoom-14 OpenMapTiles tile of central Rome has about 6000 POIs. Filter the features you need (OpenMapTiles `rank`, `class`), or draw many objects with one `THREE.InstancedMesh`.

### TileFeature

| Member | Description |
|---|---|
| `sourceLayer` | Layer of the vector tile (`'building'`, `'poi'`, …). |
| `id` | Feature id from the tile. |
| `type` | `'point'`, `'line'` or `'polygon'`. |
| `properties` | Vector tile attributes. |
| `geometry` | Parts as flat `[x0, z0, x1, z1, …]` arrays in the tile's local frame: points, lines, or polygon rings (exterior then holes). |

### MapFeature

Returned by `getFeatureAt()`.

| Member | Description |
|---|---|
| `layer` | Style layer name (`'building'`, `'transportation'`, …). |
| `type` | Style type name (`'primary'`, `'residential'`, `'building'`, …). |
| `style` | The feature type object (e.g. `style.transportationLayer.primary`). |
| `sourceLayer`, `id`, `properties` | As in `TileFeature`. |
| `tile` | The [`MapTile`](#maptile) it was hit in. |
| `getGeometry()` | Outline in the tile's local frame, as in `TileFeature.geometry`. |

### PickedFeature

`MapFeature` plus `intersection: THREE.Intersection` (point, distance, face…). Returned by `pickFeature()`.

### StyledFeature

Passed to `featureStyle`: `{ id, properties, sourceLayer, type }` (`type` is the style type name the feature was matched to).

### FeatureStyleOverrides / BuildingFeatureStyle

`{ visible?, material?, outlineMaterial? }`; buildings add `{ color?, height?, minHeight? }`. See [Data-driven styling](#data-driven-styling).

### TileStats

| Field | Description |
|---|---|
| `total` | Tiles in the render area. |
| `ready` | Tiles on screen. |
| `empty` | Tiles without data (e.g. outside the provider's coverage). |
| `loading` | Tiles queued, downloading or being built. |
| `failed` | Tiles that gave up after retries. |
| `rebuilding` | Tiles on screen still waiting for a style change (0 once it is applied). |

### TileSource

| Field | Description |
|---|---|
| `tiles` | Tile URL templates, used round-robin. |
| `minZoom`, `maxZoom` | Zoom range announced by the source. |
| `attribution` | HTML attribution the provider requires on screen (`''` if unknown). |
| `layers` | Vector layer ids announced by the source (`[]` if unknown). |

### Other types

| Type | Shape |
|---|---|
| `LatLon` | `{ readonly lat: number, readonly lon: number }` |
| `WorldOffset` | `{ readonly x: number, readonly z: number }` |
| `WorldPosition` | `{ x: number, z: number }` |
| `StyleLayerName` | `'background' \| 'waterway' \| 'water' \| 'landcover' \| 'landuse' \| 'building' \| 'transportation' \| 'shadow'` |
| `MapConfigOptions` | Every writable [`MapConfig`](#mapconfig) property, all optional. |
| `SchemaMatch` | `{ layer, type: string \| (string \| undefined)[], ramp?: boolean }` — see [custom schemas](#custom-schemas). |
| `TileSchemaFunction` | `(sourceLayer: string, properties: object) => SchemaMatch \| null` |
| `ThreeGeoPlayEventMap` | Payloads of the [events](#events). |

---

## Enums

| Enum | Values |
|---|---|
| `ViewMode` | `FOLLOW_TARGET` (`'follow_target'`) — tiles follow the target · `MANUAL` (`'manual'`) — tiles stay where you put them |
| `TileLayout` | `CIRCULAR` (`'circular'`) · `GRID` (`'grid'`) |
| `TileSchema` | `AUTO` (`'auto'`, detects the schema from the source layers) · `OPENMAPTILES` (MapTiler, OpenFreeMap, most MapLibre sources) · `MAPBOX` (Mapbox Streets v8) |

Each enum is also a TypeScript type of its values.

---

## Tile sources and schemas

`tileUrl` accepts:

| Form | Example |
|---|---|
| Template | `https://your-server/{z}/{x}/{y}.pbf` (`{z}` may be omitted for a single-zoom set) |
| TileJSON | `https://tiles.openfreemap.org/planet`, `https://api.maptiler.com/tiles/v3/tiles.json?key=…` |
| MapLibre / Mapbox style | `https://tiles.openfreemap.org/styles/liberty` (its first vector source is used) |
| `mapbox://` | `mapbox://mapbox.mapbox-streets-v8`, `mapbox://styles/mapbox/streets-v12` (with `accessToken`) |

Several URLs in a TileJSON are used round-robin. Gzip-compressed tiles served without `Content-Encoding` are decompressed. Downloads are nearest-first, concurrent, abortable, with timeouts and retries with backoff. PMTiles archives must be served as `{z}/{x}/{y}` (e.g. `pmtiles serve`, martin).

### Custom schemas

Map another vector tile schema onto the style with a function returning the style layer and the type name(s) to look up (most specific first), or `null` to skip the feature:

```js
geo.getMapConfig().tileSchema = (sourceLayer, props) => {
  if (sourceLayer === 'roads')     return { layer: 'transportation', type: [props.kind_detail, props.kind, 'minor'] };
  if (sourceLayer === 'buildings') return { layer: 'building', type: 'building' };
  if (sourceLayer === 'water')     return { layer: 'water', type: 'lake' };
  return null;
};
```

`ramp: true` draws a link road under the road it merges into.

---

## Rendering model

- **Flat layers** (background, land use, land cover, water, waterways, roads) lie on the ground plane. They are drawn without writing depth — only during their own draw, the materials are not modified — and stacked by `renderingOrder`; they are still depth tested, so buildings and your objects in front of them always hide them. Three.js draws transparent materials after opaque ones, so a transparent flat layer ends up above every opaque one.
- **Ground occluder**: with `occludeBelowGround` an invisible plane writes the ground depth before anything else is drawn, so the map hides what is below it like a solid floor. It sits at the map's ground (`Y` 0), pushed back by a polygon offset of one pixel of slope, so that what lies on the ground — the flat layers, flattened buildings, your own markers at `Y` 0 — never flickers against it. A surface of yours just below the map (a table under a diorama, your own terrain) is therefore not hidden near the map: draw it before the map instead (`renderOrder = -2000`), and the map layers are painted over it.
- **Buildings** are solid, depth-tested meshes with exact normals; they interact with your objects like any other mesh.
- **Shadows**: enable `renderer.shadowMap.enabled` and a light with `castShadow`. Buildings cast and receive; the [shadow layer](#shadowlayer) shows shadows on the unlit flat layers; your objects cast on the map and on the buildings.
- **Batching**: with three r170+ the geometry of all tiles sharing a material is drawn by one `THREE.BatchedMesh` (one draw call, per-tile frustum culling). Custom `ShaderMaterial`s are drawn per tile.
- **Materials are never modified** by the library: `depthWrite`, `transparent`, `side` and the rest stay as you set them.

### Transparency

With `transparent: true` and `opacity < 1` on the building material, `depthPrepass` (default `true`) makes buildings look like a single layer of glass: the buildings' depth is drawn first with the building material itself (colour writes off), then a stencil bit (`0x80`) lets one fragment per pixel be blended. Walls behind and inside buildings stay hidden, and faces that coincide in the tile data (building outlines drawn together with their parts, duplicated footprints) cannot be blended twice and flicker. This needs a stencil buffer:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });

// Post-processing: give the EffectComposer render targets with a stencil buffer too
const target   = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, stencilBuffer: true });
const composer = new EffectComposer(renderer, target);
```

Without it the library warns once and coinciding faces may be blended twice. Set `depthPrepass = false` for plain Three.js blending of every face. If you use stencil bit `0x80` yourself, avoid it for other effects drawn between the buildings' passes.

---

## Errors and warnings

| Situation | Behaviour |
|---|---|
| Invalid config value or unknown option name | `Error` thrown by the setter / `set()` / constructor. |
| `start()` without `tileUrl` | `Error`. |
| Wrong URL, refused token, no tile found | `sourceerror` event (and a console message). |
| Transparent buildings without a stencil buffer (renderer or render target, e.g. an `EffectComposer`) | One console warning. |
| `featureStyle` returns `color` for a material without `vertexColors` | One console warning. |
| Building material with `opacity < 1` but `transparent: false` | One console warning. |
| `zoomLevel` outside the source's range | The nearest served level is used, at the same scale; one console warning. |
