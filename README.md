# 🌍 ThreeGeoPlay

**Real-world map tiles rendered in 3D — powered by Three.js and OpenStreetMap vector data.**

🔴 [Live Demo](https://lorenzomezza.github.io/Three-geo-play-demo-website/)

ThreeGeoPlay is a JavaScript library that fetches [Vector Tiles (MVT/PBF)](https://docs.mapbox.com/vector-tiles/specification/) and renders them as 3D geometry directly into your Three.js scene. Roads, buildings, water, land use — all as real meshes you can walk through, fly over, or build games on top of.

---

## Features

- 🗺️ **Vector tile rendering** — roads, buildings, waterways, land use, and more
- 🏙️ **3D building extrusion** — true-scale heights from OSM data
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
npm i lm-three-geo-play
```

---

## Quick Start

```js
import * as THREE from 'three';
import { ThreeGeoPlay } from 'lm-three-geo-play';

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geo = new ThreeGeoPlay(scene, camera, renderer, {
  tileUrl:        'https://tiles.openfreemap.org/planet',   // free OpenMapTiles source (TileJSON)
  originLatLon:   { lat: 41.9028, lon: 12.4964 },           // Rome
  zoomLevel:      14,
  tileWorldSize:  50,
  renderDistance: 6,
});

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

Access the style with `geo.getMapStyle()` (same object as `getMapConfig().mapStyle`) and modify each layer type directly. Changes are applied to the tiles already on screen on the next `onFrameUpdate()` — no reload needed:

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
style.buildingLayer.material  = new THREE.MeshStandardMaterial({ color: 0xaaaaaa }); // lit materials get normals automatically
style.buildingLayer.isVisible = true;  // false to hide all buildings
style.buildingLayer.height    = 1;     // vertical exaggeration: 1 = true scale
```

Each type exposes `material`, `isVisible`, `Y` (height of the layer) and `renderingOrder`; line types (roads, waterways) also have `outlineMaterial`, `lineWidth`, `outlineWidth` and `jointSegments`.
A layer's `isVisible` is a master switch that keeps per-type settings; use `setVisibleAll(v)` to change every type at once.

### How lines are layered

Roads and waterways are stacked like on a printed map, inside the `renderingOrder` of their type:

- **Bridges above, tunnels below** — the OpenMapTiles `brunnel` / `layer` attributes (Mapbox `structure` / `layer`) put a flyover on top of the roads it crosses; bridge and tunnel sections end flat.
- **Outlines below fills** — at a junction the fills merge, an outline never cuts through another road.
- **Wider roads on top** — a minor road joins a major one cleanly even when their colours differ; ramps (`ramp`) slip under the road they merge into.

Lower a type's `renderingOrder` by 1 to put it entirely below the others.

> Map geometry faces up (+Y), so the default `THREE.FrontSide` materials work. Flat layers are stacked with `renderingOrder`: ThreeGeoPlay sets `depthTest = false` on their materials, so do not share those material instances with your own scene objects.

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
geo.moveMapOriginToLatLon(48.8566, 2.3522); // put Paris at the world origin (switches to MANUAL)

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
| `tileWorldSize` | World units per tile (changing it rescales loaded tiles) | `1` |
| `renderDistance` | Tiles loaded around the center | `4` |
| `tileLayout` | `TileLayout.CIRCULAR` or `TileLayout.GRID` | `CIRCULAR` |
| `worldOriginOffset` | `{ x, z }` world position of `originLatLon` | `{ x: 0, z: 0 }` |
| `viewMode` | `ViewMode.FOLLOW_TARGET` or `ViewMode.MANUAL` | `FOLLOW_TARGET` |
| `followUpdateInterval` | Minimum ms between follow updates (`0` = every frame) | `0` |
| `showTileBorders` | Debug tile boundaries | `false` |

Invalid values and unknown option names throw an `Error`. `originLatLon` and `worldOriginOffset` are frozen objects: assign a new object to change them. (`pbfTileProviderZXYurl` still works as a deprecated alias of `tileUrl`.)

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

## License

MIT
