# ThreeGeoPlay guide

How to style the map, integrate it with your scene and pick a tile provider. For the full list of options, properties, defaults, events and types see the [API reference](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md); to get started see the [README](https://github.com/lorenzoMezza/Three-geo-play#readme).

---

## Styling

Every option, property and method is described in the [API reference](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md). Access the style with `geo.getMapStyle()` (same object as `getMapConfig().mapStyle`) and modify each layer type directly. Changes are applied to the tiles already on screen on the next `onFrameUpdate()` — no reload needed:

```js
import * as THREE from 'three';

const style = geo.getMapStyle();

// Roads
style.transportationLayer.primary.material        = new THREE.MeshBasicMaterial({ color: 0xffffff });
style.transportationLayer.primary.outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc });
style.transportationLayer.motorway.isVisible      = true;
style.transportationLayer.pedestrian.isVisible    = true;

// Land use
style.landUseLayer.residential.material = new THREE.MeshBasicMaterial({ color: 0xe8f4e8 });
style.landUseLayer.industrial.isVisible = false;

// Buildings 3D (single-type layer: set properties on the layer itself)
style.buildingLayer.material  = new THREE.MeshStandardMaterial({ color: 0xeeeeee, vertexColors: true }); // lit materials get normals automatically
style.buildingLayer.isVisible = true;  // false to hide all buildings
style.buildingLayer.height    = 1;     // vertical exaggeration: 1 = true scale
```

Each type exposes `material`, `isVisible`, `Y` (height of the layer), `renderingOrder`, `castShadow`, `receiveShadow` and `featureStyle`; `visible` and `renderOrder` are aliases named like their Three.js counterparts. Line types (roads, waterways) also have `outlineMaterial`, `lineWidthMeters` / `outlineWidthMeters` (in metres), `lineWidth` / `outlineWidth` (relative to a zoom-18 tile, used when the metre values are `null`) and `jointSegments`.
A layer's `isVisible` is a master switch that keeps per-type settings; `setVisibleAll(v)`, `setAllMaterials(material)` and, for line layers, `setLineWidthAll(w)` / `setOutlineWidthAll(w)` change every type at once.

```js
style.transportationLayer.primary.lineWidthMeters = 14;   // 14 m wide, whatever the zoom level
style.waterwayLayer.river.lineWidthMeters         = 30;
```

**Themes.** `MapStyle.dark()` is a ready-made night style; `style.clone()` makes an independent copy (materials included) to derive variants:

```js
import { MapStyle } from 'lm-three-geo-play';

const night = MapStyle.dark();
night.transportationLayer.primary.material.color.set(0x7fd4ff);
geo.setMapStyle(night);
```

**Per-feature styling.** Any type can take a `featureStyle` function, called with `{ id, key, properties, sourceLayer, type }` for each feature: return `{ visible: false }` to skip it, `{ material }` (and `{ outlineMaterial }` for lines) to draw it differently — buildings also accept `color`, `height` and `minHeight` (see below). Assign it again, or call `style.refresh()`, when the answer changes.

```js
const highlight = new THREE.MeshBasicMaterial({ color: 0x00c2ff });
style.transportationLayer.primary.featureStyle = ({ properties }) =>
  properties.name === 'Via del Corso' ? { material: highlight } : null;
style.transportationLayer.path.featureStyle = ({ properties }) => (properties.name ? null : { visible: false });
```

Materials are used exactly as you configure them: ThreeGeoPlay never changes their settings, so you can share them with your own objects.

### How lines are layered

Roads and waterways are stacked like on a printed map, inside the `renderingOrder` of their type:

- **Bridges above, tunnels below** — the OpenMapTiles `brunnel` / `layer` attributes (Mapbox `structure` / `layer`, Shortbread `bridge` / `tunnel`) put a flyover on top of the roads it crosses; bridge and tunnel sections end flat.
- **Outlines below fills** — at a junction the fills merge, an outline never cuts through another road.
- **Wider roads on top** — a minor road joins a major one cleanly even when their colours differ; ramps (`ramp`) slip under the road they merge into.

Lower a type's `renderingOrder` by 1 to put it entirely below the others.

> Map geometry faces up (+Y), so the default `THREE.FrontSide` materials work. Flat layers lie on the same plane, so they are stacked by `renderingOrder` and drawn without writing depth (only during their own draw — the material is not modified). They are still depth tested: buildings and your objects in front of them always hide them. Three.js draws transparent materials after opaque ones, so a transparent flat layer ends up above every opaque one whatever its `renderingOrder`.

### Buildings

Buildings are solid, depth-tested meshes. The default material is an opaque, unlit `MeshBasicMaterial` that still reads as 3D: every vertex carries a colour baked by the library, used by materials created with `vertexColors: true` (multiplied by `material.color`):

```js
const buildings = style.buildingLayer;
buildings.wallShading      = 0.6;      // walls facing away from a south-west sun get darker (unlit materials only)
buildings.ambientOcclusion = 0.45;     // walls darken towards the ground
buildings.roofColor        = 0xf6ebe2; // roof tint (the getter returns a copy: assign to change it)
buildings.colorVariation   = 0.08;     // slight tone change from roof to roof
buildings.simpleExtrusion  = false;    // true: plain footprint extrusions from the ground, fewer triangles
```

With a lit material (`MeshLambertMaterial`, `MeshStandardMaterial`, …) your lights shade the walls and the baked colour adds the ambient occlusion and the roof tones. Wall colours depend only on the wall direction and height, so where OSM buildings overlap their shared walls get the same colour and cannot flicker.

**Transparent buildings.** With `transparent: true` and `opacity < 1`, each pixel is blended once, with the surface nearest to the camera (`buildings.depthPrepass`, on by default): walls behind and between buildings stay hidden and objects behind them show through a single layer of "glass". The buildings' depth is drawn first with the building material itself (colour writes off), so both passes compute exactly the same depth, and a stencil bit (`0x80`) lets only one fragment per pixel be blended — so faces that coincide in the tile data (outlines drawn together with their `building:part`s, duplicated footprints, parts sharing walls) cannot be blended twice and flicker while the camera moves. Create the renderer with a stencil buffer for this:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });

// With post-processing, the composer's render targets need a stencil buffer too:
const target   = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, stencilBuffer: true });
const composer = new EffectComposer(renderer, target);
```

Without it ThreeGeoPlay warns once and coinciding faces are blended twice. Set `depthPrepass = false` for plain Three.js blending of every face. Glass lets the light through: while the material is transparent, buildings cast no shadows (they still receive them).

### Your objects and the map

The map behaves like a solid floor with solid buildings, so objects you add to the scene need no special settings:

- **Buildings** are ordinary depth-tested meshes: they hide your objects and are hidden by them.
- **The ground hides what is below it** — an invisible plane writes the ground depth before anything else is drawn (`MapConfig.occludeBelowGround`, default `true`; set it to `false` to see through the ground, e.g. with your own terrain). If the map lies on a surface of yours (a diorama on a table, your own terrain just below it), draw that surface before the map — `table.renderOrder = -2000` — and the map layers are painted over it.
- **Flat layers never cover your objects**, even when their materials are transparent.
- **Nothing you pass in is modified**, so materials can be shared with your own meshes.

### Integrating with your scene

**The map group is yours.** `geo.getMapGroup()` holds every map mesh. Add it to an object of yours before `start()` (it stays there), move, rotate or scale it; the follow target is tracked through its world position whatever the transform, and the API's "world" coordinates (`latLonToWorld`, `moveMapOriginToPosition`, …) are in the group's space. Set `layers` on it and every map mesh follows (Three.js layers are not inherited, ThreeGeoPlay copies them); `visible` and `renderOrder` work as for any group. Map objects carry `userData.threeGeoPlay = true`.

```js
const world = new THREE.Group();
world.scale.setScalar(0.01);                 // your units
world.add(geo.getMapGroup());
scene.add(world);
geo.getMapGroup().layers.set(2);             // e.g. keep the map out of a reflection camera
geo.start();
```

**Scale and heights.** Set `unitsPerMeter: 1` (MapConfig) to work in metres: the tile size follows the zoom level and the origin latitude so distances and heights are true to scale around the origin. `geo.getUnitsPerMeter()` gives the current scale whatever the setting, and `geo.getHeightAt(x, z)` the top of the building at a point (0 on open ground) — from the same footprints and heights that are drawn, cheap enough for every frame:

```js
const { x, z } = geo.latLonToWorld(41.8902, 12.4922);        // the Colosseum
marker.position.set(x, geo.getHeightAt(x, z), z);            // on top of its walls
marker.scale.setScalar(5 * geo.getUnitsPerMeter());          // 5 m tall, at any scale

player.position.y = Math.max(player.position.y, geo.getHeightAt(player.position.x, player.position.z));
```

**Picking.** `pickFeature(raycaster)` returns what is seen along a ray — the building, road, park… — with its style layer and type, the vector tile properties, a `key` unique to that feature (the tile data's `id` is 0 for most OpenMapTiles features), the intersection and its outline. Flat layers are stacked by `renderingOrder`, not by height, so use it rather than the nearest intersection (`getFeatureAt(intersection)` works on intersections of your own raycasts).

```js
raycaster.setFromCamera(pointer, camera);
const hit = geo.pickFeature(raycaster);
if (hit?.layer === 'building') console.log(hit.id, hit.properties.render_height, hit.intersection.point);
if (hit?.layer === 'transportation') console.log(hit.type);          // 'primary', 'minor', …
```

**Tiles and their data.** `tileload` / `tileunload` events (and `geo.getTiles()`) give each tile on screen as `{ x, y, zoom, object3D, size, unitsPerMeter, getFeatures(sourceLayer?) }`. `getFeatures()` decodes every feature of the tile — also layers the map does not draw, such as POIs or labels — with geometry in the tile's local frame, where `object3D` spans `[0, size]` on X and Z with the ground at Y 0. Objects you add to `object3D` follow the tile when the map moves or is rescaled, and leave the scene with it:

```js
geo.addEventListener('tileload', ({ tile }) => {
  for (const poi of tile.getFeatures('poi')) {
    if (poi.properties.rank > 3) continue;   // a zoom-14 tile of a big city has thousands of POIs
    const [x, z] = poi.geometry[0];
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);   // a 1 m marker
    marker.position.set(x, 0, z);
    marker.scale.setScalar(tile.unitsPerMeter);
    tile.object3D.add(marker);
  }
});
geo.addEventListener('tileunload', ({ tile }) => tile.object3D.clear());   // dispose your resources here
```

**Data-driven buildings.** `buildingLayer.featureStyle` is called for every building with `{ id, key, properties, sourceLayer, type }` and may return `{ color, height, minHeight, visible, material }` (heights in metres; `color` needs a `vertexColors` material — ThreeGeoPlay warns once otherwise). Assign it again, or call `style.refresh()`, when the answer changes:

```js
let selected = null;
style.buildingLayer.featureStyle = ({ key, properties }) =>
  key === selected ? { color: 0xff8844 } : { color: properties.render_height > 40 ? 0xc8d6ff : 0xffffff };
// on click:
selected = geo.pickFeature(raycaster)?.key ?? null;
style.refresh();
```

`geo.getTileStats()` tells when everything is on screen: `loading` counts tiles being downloaded or built, `rebuilding` the tiles still waiting for a style change.

### Shadows

Buildings cast and receive shadows (`castShadow` / `receiveShadow`, both `true` by default). Enable shadow maps and give a light `castShadow`:

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFShadowMap;

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
// Cover the area you look at with the shadow camera (and move it with the view):
Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 2000 });
scene.add(sun, sun.target);

style.buildingLayer.material = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, vertexColors: true });
```

The flat map layers use unlit materials, which cannot show shadows: `style.shadowLayer` lays a transparent `THREE.ShadowMaterial` plane over them that only darkens where a shadow falls (drawn while `renderer.shadowMap.enabled` is true; `style.shadowLayer.material.opacity` sets the strength). If you give the flat layers lit materials instead, use `layer.setReceiveShadowAll(true)` and hide the shadow layer. Your own meshes cast shadows on the map and the buildings like on any other surface.

### Every material at once

`layer.types` lists the types of a layer by class name, and `style.forEachType()` visits every type of every layer, the single-type ones (background, building, shadow) included:

```js
// Clip the whole map, e.g. to a round diorama
renderer.localClippingEnabled = true;
style.forEachType(type => {
  for (const material of [type.material, type.outlineMaterial]) if (material) material.clippingPlanes = planes;
});
```

### React Three Fiber

Create the map in an effect, so that React's `StrictMode` (which mounts, unmounts and mounts again in development) gets a fresh instance each time — `destroy()` is final:

```jsx
import { useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { ThreeGeoPlay } from 'lm-three-geo-play';

function GeoMap({ options }) {
  const { scene, camera, gl } = useThree();
  const geo = useRef(null);
  useEffect(() => {
    const map = new ThreeGeoPlay(scene, camera, gl, options);
    map.start();
    geo.current = map;
    return () => map.destroy();
  }, [scene, camera, gl]);
  useFrame(() => geo.current?.onFrameUpdate());
  return null;
}

<Canvas gl={{ stencil: true }} shadows camera={{ far: 20000 }}>
  <GeoMap options={{ tileUrl: 'https://tiles.openfreemap.org/planet', originLatLon: { lat: 45.46, lon: 9.19 }, zoomLevel: 14, unitsPerMeter: 1 }} />
</Canvas>
```

---

## Follow Mode

Attach the map to any moving object — perfect for games:

```js
geo.setFollowTarget(myPlayerMesh); // automatically switches to FOLLOW_TARGET mode

// Inside your animation loop:
geo.onFrameUpdate(); // tiles are loaded around the player as it moves
```

World coordinates stay stable while following: only the loaded area moves.

## Manual Mode & Coordinates

```js
geo.moveMapOriginToPosition(x, z);         // load tiles around a world position (switches to MANUAL)
geo.moveMapOriginToLatLon(48.8566, 2.3522); // put Paris at the world origin (in follow mode, move the target there)

const { x, z } = geo.latLonToWorld(41.8902, 12.4922); // Colosseum → world position
marker.position.set(x, 0, z);
const { lat, lon } = geo.worldToLatLon(player.position.x, player.position.z);

const { total, loading } = geo.getTileStats(); // loading progress, e.g. for a progress bar
```

---

## MapConfig Options

Set them in the constructor options, with `config.set({ … })`, or one by one on `geo.getMapConfig()`.

| Property | Description | Default |
|---|---|---|
| `tileUrl` | Tile source: `{z}/{x}/{y}` template, TileJSON, MapLibre / Mapbox style or `mapbox://` URL (see below) | required |
| `accessToken` | Mapbox access token | `''` |
| `tileSchema` | `TileSchema.AUTO`, `OPENMAPTILES`, `MAPBOX`, `SHORTBREAD` or a custom function | `AUTO` |
| `originLatLon` | `{ lat, lon }` placed at the world origin | Rome |
| `zoomLevel` | Integer zoom level. OpenMapTiles providers usually stop at 14, Mapbox at 16: a level the source does not serve is replaced by the nearest one it serves, at the same scale | `18` |
| `unitsPerMeter` | World units per metre (e.g. `1` for a scene in metres); when set, `tileWorldSize` follows from it | `null` |
| `tileWorldSize` | World units per tile (changing it rescales loaded tiles; setting it clears `unitsPerMeter`) | `1` |
| `renderDistance` | Tiles loaded around the center | `4` |
| `tileLayout` | `TileLayout.CIRCULAR` or `TileLayout.GRID` | `CIRCULAR` |
| `worldOriginOffset` | `{ x, z }` world position of `originLatLon` | `{ x: 0, z: 0 }` |
| `viewMode` | `ViewMode.FOLLOW_TARGET` or `ViewMode.MANUAL` | `FOLLOW_TARGET` |
| `followUpdateInterval` | Minimum ms between follow updates (`0` = every frame) | `0` |
| `showTileBorders` | Debug tile boundaries | `false` |
| `occludeBelowGround` | The map ground hides what is below it | `true` |

Invalid values and unknown option names throw an `Error`. `originLatLon` and `worldOriginOffset` are frozen objects: assign a new object to change them. (`pbfTileProviderZXYurl` still works as a deprecated alias of `tileUrl`.)

**When tiles do not load**, listen to `sourceerror`: it fires when a TileJSON / style URL cannot be read, when the provider refuses access (HTTP 401 / 403: check the key or token) and when none of the first tiles exists (usually a wrong `tileUrl` template or a `zoomLevel` the provider does not serve).

---

## Migrating from 1.x

- Install `three` next to the library: it is a peer dependency and is no longer bundled (1.x bundled its own copy, which rejected your materials).
- `tileUrl` replaces `pbfTileProviderZXYurl` (still accepted).
- Buildings are opaque and shaded by default; give the building material `transparent: true` and `opacity` for glass (create the renderer with `stencil: true`).
- `moveMapOriginToLatLon()` no longer switches to `ViewMode.MANUAL`: in follow mode the map keeps following its target.
- Materials are used as given: ThreeGeoPlay no longer changes their `depthTest`, `depthWrite` or `transparent`.
- `buildingLayer.allowDetails` / `setAllowDetails()` never had an effect and are deprecated.

---

## Supported Layers

| Layer | Types |
|---|---|
| `transportation` | motorway, trunk, primary, secondary, tertiary, minor, pedestrian, path, rail, ferry… |
| `building` | extruded 3D with true-scale heights from OSM (`render_height` / `height`) |
| `water` | ocean, lake, river, pond, dock, swimming_pool |
| `waterway` | river, stream, canal, ditch… |
| `landuse` | residential, industrial, school, hospital… |
| `landcover` | wood, grass, sand… and their subclasses (park, forest, beach, golf_course…) |
| `background` | ground plane |
| `shadow` | ground shadows (a `ShadowMaterial` plane over the flat layers) |

---

## Tile Providers

`tileUrl` accepts what MapLibre and Mapbox use to describe a vector source. Three tile schemas are built in and detected automatically: OpenMapTiles, Mapbox Streets v8 and Shortbread.

```js
// OpenMapTiles schema — OpenFreeMap, MapTiler, Carto, Stadia, self-hosted tileservers
config.tileUrl = 'https://tiles.openfreemap.org/planet';                          // TileJSON, free, no key
config.tileUrl = 'https://api.maptiler.com/tiles/v3/tiles.json?key=YOUR_KEY';     // TileJSON
config.tileUrl = 'https://your-server/{z}/{x}/{y}.pbf';                           // template

// MapLibre / Mapbox style URL: its first vector source is used
config.tileUrl = 'https://tiles.openfreemap.org/styles/liberty';

// Mapbox Streets v8
config.set({ tileUrl: 'mapbox://mapbox.mapbox-streets-v8', accessToken: 'pk.…', zoomLevel: 16 });
config.set({ tileUrl: 'mapbox://styles/mapbox/streets-v12', accessToken: 'pk.…' });

// Shortbread schema — VersaTiles (free, no key)
config.tileUrl = 'https://tiles.versatiles.org/tiles/osm/tiles.json';
```

Most sources stop at zoom 14 (OpenMapTiles, Shortbread) or 16 (Mapbox): a higher `zoomLevel` uses their highest level at the same scale. If a source has none of the layers of these schemas, ThreeGeoPlay warns once and draws nothing: map its layers with a `tileSchema` function (below).

Several URLs in a TileJSON are used round-robin. Gzip-compressed `.pbf` files served without a `Content-Encoding` header are handled too. PMTiles archives are not read directly: serve them as `{z}/{x}/{y}` (e.g. with `pmtiles serve` or martin).

**Attribution and errors.** Providers require their credits on screen; the resolved source exposes them, and source problems (wrong token, bad URL) are reported as events:

```js
geo.addEventListener('sourceload',  ({ source }) => credits.innerHTML = source.attribution);
geo.addEventListener('sourceerror', ({ error, willRetry }) => showMessage(error.message));
```

**Other schemas.** Map any tile source onto the style with a function returning the style layer and type(s), or `null` to skip a feature:

```js
config.tileSchema = (sourceLayer, props) => {
  if (sourceLayer === 'roads') return { layer: 'transportation', type: [props.kind_detail, 'minor'] };
  if (sourceLayer === 'buildings') return { layer: 'building', type: 'building' };
  return null;
};
```

---

## Performance

- Geometry of all tiles sharing a material is drawn by one `THREE.BatchedMesh` (one draw call, per-tile frustum culling). This needs three.js r170+; older versions fall back to one mesh per tile. Custom `ShaderMaterial`s are always drawn per tile.
- Lines use round caps and joins tessellated to the tile's precision: narrow roads cost a few triangles.
- Tile geometry is built in two web workers. The main thread only reads the feature attributes and applies the style (`featureStyle` included), in time slices of a few milliseconds, so loading never freezes the frame loop; only visible layers are decoded.
- The workers start by themselves from code in the package, with any bundler or CDN. Where they cannot (Node, React Native, a Content-Security-Policy without `worker-src blob:`), tiles are built on the main thread, in the same time slices, with the same result.
- A higher `zoomLevel` means smaller tiles: the same area takes four times as many tiles per level, so lower `renderDistance` as you raise the zoom. Most providers stop at zoom 14 (OpenMapTiles) or 16 (Mapbox); above that their highest level is used at the same scale, which costs the same as that level.
