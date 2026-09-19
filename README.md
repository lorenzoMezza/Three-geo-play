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

// Buildings 3D — material
style.buildingLayer.building.material  = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.9 });
style.buildingLayer.building.isVisible = true;  // false to hide all buildings
style.buildingLayer.building.height    = 1;     // extrusion scale factor
```

Each layer exposes its types directly — set `material`, `outlineMaterial`, `isVisible`, `lineWidth`, and `YOrder` per type.

---

## Follow Mode

Attach the map to any moving object — perfect for games:

```js
geo.setFollowTarget(myPlayerMesh); // automatically switches to FOLLOW_TARGET mode

// Inside your animation loop:
geo.onFrameUpdate(); // the map re-centers as the player moves
```

---

## MapConfig Options

| Property | Description | Default |
|---|---|---|
| `originLatLon` | Starting `{ lat, lon }` | required |
| `pbfTileProviderZXYurl` | Tile URL with `{z}`, `{x}`, `{y}` | required |
| `zoomLevel` | OSM zoom level (12–16 recommended) | `14` |
| `tileWorldSize` | World units per tile | `100` |
| `renderDistance` | Tiles loaded around center | `3` |
| `tileLayout` | `TileLayout.SQUARE` or `CIRCULAR` | `SQUARE` |
| `showTileBorders` | Debug tile boundaries | `false` |

---

## Supported Layers

| Layer | Types |
|---|---|
| `transportation` | motorway, primary, secondary, tertiary, path, rail, ferry… |
| `building` | extruded 3D with real heights from OSM |
| `waterway` | river, stream, canal, ditch… |
| `landuse` | residential, park, industrial, school, hospital… |
| `background` | ground plane |

---

## Tile Providers

Currently tested and supported with [OpenMapTiles Schema](https://openmaptiles.org/schema/) compatible endpoints.

> **Coming soon:** Mapbox Vector Tiles support.

---

## License

MIT
