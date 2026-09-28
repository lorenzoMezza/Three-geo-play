# 🌍 ThreeGeoPlay

**Real-world maps in Three.js — OpenStreetMap vector tiles rendered as 3D geometry, ready for games and apps.**

[![npm](https://img.shields.io/npm/v/lm-three-geo-play?color=cb3837&logo=npm)](https://www.npmjs.com/package/lm-three-geo-play)
[![license](https://img.shields.io/npm/l/lm-three-geo-play)](https://github.com/lorenzoMezza/Three-geo-play/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/lm-three-geo-play)](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md)

🔴 [**Live demo**](https://lorenzomezza.github.io/Three-geo-play-demo-website/) · 📘 [**API reference**](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md) · 🧪 [Playground](#playground)

![St. Peter's Square in ThreeGeoPlay: extruded buildings, roads and land use with real-time shadows](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/hero.jpg)

ThreeGeoPlay fetches [vector tiles (MVT / PBF)](https://docs.mapbox.com/vector-tiles/specification/) and renders them as meshes directly in your Three.js scene. Roads, buildings, water and land use become real geometry you can walk through, fly over, collide with and build games on top of — with your materials, your lights and your objects.

| | |
|---|---|
| ![Colosseum casting real-time shadows](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/shadows.jpg) | ![Night style made with MapStyle.dark()](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/night.jpg) |
| **Shadows** — buildings cast and receive them, on the map and on your objects | **Themes** — `MapStyle.dark()`, or any material per layer |
| ![Glass buildings blended as a single layer](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/glass.jpg) | ![Buildings coloured and raised from their OSM height with featureStyle](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/data-driven.jpg) |
| **Glass** — transparent buildings without inner walls or flicker | **Data-driven** — colour, raise or hide single features with `featureStyle` |
| ![Third-person runner on the colonnade of St. Peter's Square](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/walk.jpg) | ![Plane flying through rings over the Vatican](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/fly.jpg) |
| **Walk** — `getHeightAt()` for collisions and roofs, `pickFeature()` to paint buildings | **Fly** — follow mode streams the city under a plane |

<sub>Screenshots from the [demo](https://lorenzomezza.github.io/Three-geo-play-demo-website/) (Explore, Walk and Fly scenes). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [OpenMapTiles](https://openmaptiles.org/).</sub>

---

## Features

- 🗺️ **Vector tile rendering** — roads, buildings, waterways, land use, and more
- 🏙️ **3D building extrusion** — true-scale heights from OSM data, solid volumes with baked wall shading and ambient occlusion
- ☀️ **Shadows** — buildings cast and receive real-time shadows, on the map and on your own objects
- 🧩 **Plays well with your scene** — map materials are never modified, the ground hides what is below it, buildings are ordinary depth-tested meshes; parent, transform or layer the map like any group
- 🖱️ **Picking & data** — know which building, road or park was clicked, read every feature of a tile (POIs included) and attach your own objects to tiles
- 🧪 **Data-driven styling** — colour, raise or hide single buildings from their OSM properties
- 🎨 **Fully styleable** — swap materials, colors, and visibility per layer, live
- 🔌 **Any vector tile provider** — OpenMapTiles (MapTiler, OpenFreeMap), MapLibre styles, Mapbox, or your own schema
- 📡 **Auto tile loading** — nearest-first queue with concurrency, abort, timeouts, and retry with backoff
- 🚀 **Few draw calls** — geometry of all tiles is batched per material (one draw call each)
- 🎮 **Follow mode** — attach to any `THREE.Object3D` (camera, player…) and the map follows
- 🧭 **Geo ↔ world conversions** — place objects at real coordinates
- 🔲 **Circular or square** render regions
- ⚡ **Zero dependencies** beyond Three.js (built-in vector tile decoder)

---

## Installation

```bash
npm i lm-three-geo-play three
```

Three.js is a peer dependency: the library uses your copy (so your materials and objects mix freely with the map) and never bundles its own.

| | |
|---|---|
| Module formats | ES module and CommonJS, picked automatically (`import` / `require`) |
| TypeScript | types included, for `bundler`, `node16` and `nodenext` resolution |
| Three.js | r150 or newer; **r170+ recommended** (batched drawing: one draw call per material) |
| Renderer | `THREE.WebGLRenderer` — create it with `{ stencil: true }` for transparent buildings |
| Dependencies | none besides Three.js |

---

## Quick Start

```js
import * as THREE from 'three';
import { ThreeGeoPlay } from 'lm-three-geo-play';

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 20000);
camera.position.set(0, 400, 600);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true }); // stencil: clean transparent buildings
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geo = new ThreeGeoPlay(scene, camera, renderer, {
  tileUrl:        'https://tiles.openfreemap.org/planet',   // free OpenMapTiles source (TileJSON)
  originLatLon:   { lat: 41.9028, lon: 12.4964 },           // Rome
  zoomLevel:      14,
  unitsPerMeter:  1,                                        // one world unit = one metre
  renderDistance: 4,
});
geo.addEventListener('sourceerror', ({ error }) => console.error(error.message));

geo.start(); // adds the map to the scene (see geo.getMapGroup())

function animate() {
  requestAnimationFrame(animate);
  geo.onFrameUpdate(); // ← call every frame
  renderer.render(scene, camera);
}
animate();
```

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

**Per-feature styling.** Any type can take a `featureStyle` function, called with `{ id, properties, sourceLayer, type }` for each feature: return `{ visible: false }` to skip it, `{ material }` (and `{ outlineMaterial }` for lines) to draw it differently — buildings also accept `color`, `height` and `minHeight` (see below). Assign it again, or call `style.refresh()`, when the answer changes.

```js
const highlight = new THREE.MeshBasicMaterial({ color: 0x00c2ff });
style.transportationLayer.primary.featureStyle = ({ properties }) =>
  properties.name === 'Via del Corso' ? { material: highlight } : null;
style.transportationLayer.path.featureStyle = ({ properties }) => (properties.name ? null : { visible: false });
```

Materials are used exactly as you configure them: ThreeGeoPlay never changes their settings, so you can share them with your own objects.

### How lines are layered

Roads and waterways are stacked like on a printed map, inside the `renderingOrder` of their type:

- **Bridges above, tunnels below** — the OpenMapTiles `brunnel` / `layer` attributes (Mapbox `structure` / `layer`) put a flyover on top of the roads it crosses; bridge and tunnel sections end flat.
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
```

With a lit material (`MeshLambertMaterial`, `MeshStandardMaterial`, …) your lights shade the walls and the baked colour adds the ambient occlusion and the roof tones. Wall colours depend only on the wall direction and height, so where OSM buildings overlap their shared walls get the same colour and cannot flicker.

**Transparent buildings.** With `transparent: true` and `opacity < 1`, each pixel is blended once, with the surface nearest to the camera (`buildings.depthPrepass`, on by default): walls behind and between buildings stay hidden and objects behind them show through a single layer of "glass". The buildings' depth is drawn first with the building material itself (colour writes off), so both passes compute exactly the same depth, and a stencil bit (`0x80`) lets only one fragment per pixel be blended — so faces that coincide in the tile data (outlines drawn together with their `building:part`s, duplicated footprints, parts sharing walls) cannot be blended twice and flicker while the camera moves. Create the renderer with a stencil buffer for this:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true }); // render targets: stencilBuffer: true
```

Without it ThreeGeoPlay warns once and coinciding faces are blended twice. Set `depthPrepass = false` for plain Three.js blending of every face.

### Your objects and the map

The map behaves like a solid floor with solid buildings, so objects you add to the scene need no special settings:

- **Buildings** are ordinary depth-tested meshes: they hide your objects and are hidden by them.
- **The ground hides what is below it** — an invisible plane writes the ground depth before anything else is drawn (`MapConfig.occludeBelowGround`, default `true`; set it to `false` to see through the ground, e.g. with your own terrain).
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

**Picking.** `pickFeature(raycaster)` returns what is seen along a ray — the building, road, park… — with its style layer and type, the vector tile properties, the intersection and its outline. Flat layers are stacked by `renderingOrder`, not by height, so use it rather than the nearest intersection (`getFeatureAt(intersection)` works on intersections of your own raycasts).

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
    const [x, z] = poi.geometry[0];
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);   // a 1 m marker
    marker.position.set(x, 0, z);
    marker.scale.setScalar(tile.unitsPerMeter);
    tile.object3D.add(marker);
  }
});
geo.addEventListener('tileunload', ({ tile }) => tile.object3D.clear());   // dispose your resources here
```

**Data-driven buildings.** `buildingLayer.featureStyle` is called for every building with `{ id, properties, sourceLayer, type }` and may return `{ color, height, minHeight, visible, material }` (heights in metres; `color` needs a `vertexColors` material — ThreeGeoPlay warns once otherwise). Assign it again, or call `style.refresh()`, when the answer changes:

```js
let selected = null;
style.buildingLayer.featureStyle = ({ id, properties }) =>
  id === selected ? { color: 0xff8844 } : { color: properties.render_height > 40 ? 0xc8d6ff : 0xffffff };
// on click:
selected = geo.pickFeature(raycaster)?.id ?? null;
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
| `tileSchema` | `TileSchema.AUTO`, `OPENMAPTILES`, `MAPBOX` or a custom function | `AUTO` |
| `originLatLon` | `{ lat, lon }` placed at the world origin | Rome |
| `zoomLevel` | Integer zoom level — must be served by your provider (OpenMapTiles providers usually stop at 14, Mapbox at 16) | `18` |
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

`tileUrl` accepts what MapLibre and Mapbox use to describe a vector source; the schema of the tiles is detected automatically.

```js
// OpenMapTiles schema — MapTiler, OpenFreeMap, self-hosted tileservers
config.tileUrl = 'https://tiles.openfreemap.org/planet';                          // TileJSON
config.tileUrl = 'https://api.maptiler.com/tiles/v3/tiles.json?key=YOUR_KEY';     // TileJSON
config.tileUrl = 'https://your-server/{z}/{x}/{y}.pbf';                           // template

// MapLibre / Mapbox style URL: its first vector source is used
config.tileUrl = 'https://tiles.openfreemap.org/styles/liberty';

// Mapbox Streets v8
config.set({ tileUrl: 'mapbox://mapbox.mapbox-streets-v8', accessToken: 'pk.…', zoomLevel: 16 });
config.set({ tileUrl: 'mapbox://styles/mapbox/streets-v12', accessToken: 'pk.…' });
```

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
- Tiles are decoded and built in time slices of a few milliseconds, so loading never freezes the frame loop; only visible layers are decoded.

---

## Playground

`playground/` runs the library straight from `src` for quick tries and debugging — edits reload at once:

```bash
cd playground
npm install
npm run dev
```

It opens Rome from OpenFreeMap, one unit per metre. URL parameters: `?lat=41.89&lon=12.49`, `?zoom=14`, `?tiles=<template, TileJSON or style URL>`, `?token=<Mapbox token>`. Keys: **B** tile borders, **N** day / night style, **G** glass buildings, **S** shadows; a click logs the feature under the pointer. `geo`, `style`, `config`, `scene`, `camera` and `THREE` are available in the browser console.

---

## API reference

The complete reference — every class, property, default value, event and type — is in [API.md](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md).

---

## License

[MIT](https://github.com/lorenzoMezza/Three-geo-play/blob/main/LICENSE) © Lorenzo Mezzabarba. Map data from OpenStreetMap is © OpenStreetMap contributors (ODbL): display the attribution your tile provider requires (`geo.getTileSource().attribution`).
