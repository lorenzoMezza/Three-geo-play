
<p align="center">
  <big><big><big><a href="https://lorenzomezza.github.io/Three-geo-play-demo-website/" target="_blank">🔴 LIVE DEMO</a></big></big></big>
</p>

<div align="center">


# 🌍 ThreeGeoPlay



**Real-world map tiles rendered in 3D — powered by Three.js and OpenStreetMap vector data.**

ThreeGeoPlay is a JavaScript library that fetches [Vector Tiles (MVT/PBF)](https://docs.mapbox.com/vector-tiles/specification/) and renders them as 3D geometry directly into your Three.js scene. Roads, buildings, water, land use — all as real meshes you can walk through, fly over, or build games on top of.

---

## ✨ Features

- 🗺️ **Vector tile rendering** — roads, buildings, waterways, land use, and more
- 🏙️ **3D building extrusion** — real heights from OSM data
- 🎨 **Fully styleable** — swap materials, colors, and visibility per layer
- 📡 **Auto tile loading** — smart queue with concurrency, abort, and retry
- 🎮 **Follow mode** — attach to any `THREE.Object3D` (camera, player…) and the map follows
- 🔲 **Circular or square** render regions
- ⚡ **Zero dependencies** beyond Three.js

---

## 📦 Installation

```bash
npm i lm-three-geo-play
```

---

## 🚀 Quick Start

```js
import * as THREE from 'three';
import { ThreeGeoPlay } from 'three-geo-play';

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geo = new ThreeGeoPlay(scene, camera, renderer);

// Set your starting coordinates and tile source
const config = geo.getMapConfig();
config.originLatLon          = { lat: 41.9028, lon: 12.4964 }; // Rome
config.pbfTileProviderZXYurl = 'https://your-tile-server/{z}/{x}/{y}.pbf';
config.zoomLevel             = 16;
config.tileWorldSize         = 50;
config.renderDistance        = 6;

geo.start();

function animate() {
  requestAnimationFrame(animate);
  geo.onFrameUpdate();          // ← call every frame
  renderer.render(scene, camera);
}
animate();
```

---

## 🎨 Styling

Access the style through ThreeGeoPlay `MapConfig` and modify materials directly on each layer type:

```js
import * as THREE from 'three';

// geo is an instance of ThreeGeoPlay
const style = geo.getMapConfig().mapStyle;

// Style roads
style.transportationLayer.primary.material        = new THREE.MeshBasicMaterial({ color: 0xffffff });
style.transportationLayer.primary.outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc });
style.transportationLayer.motorway.isVisible      = true;
style.transportationLayer.pedestrian.isVisible    = true;

// Style land use
style.landUseLayer.residential.material = new THREE.MeshBasicMaterial({ color: 0xe8f4e8 });
style.landUseLayer.industrial.isVisible = false;

// Style buildings — material must be transparent to enable 3D extrusion
style.buildingLayer.building.material  = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.9 });
style.buildingLayer.building.isVisible = true;   // false to hide all buildings
style.buildingLayer.building.height    = 1;      // extrusion scale factor
```

Each layer exposes its types directly — set `material`, `outlineMaterial`, `isVisible`, `lineWidth`, and `YOrder` per type.

---

## 🎮 Follow Mode

Attach the map to any moving object — perfect for games:

```js
geo.setFollowTarget(myPlayerMesh); // automatically switches to FOLLOW_TARGET mode

// Inside your animation loop:
geo.onFrameUpdate(); // the map re-centers as the player moves
```

---

## ⚙️ MapConfig Options

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

## 🗂️ Supported Layers

| Layer | Types |
|---|---|
| `transportation` | motorway, primary, secondary, tertiary, path, rail, ferry… |
| `building` | extruded 3D with real render heights |
| `waterway` | river, stream, canal, ditch… |
| `landuse` | residential, park, industrial, school, hospital… |
| `background` | ground plane |

---

## 🛰️ Tile Providers

Currently tested and supported with **[OpenMapTiles](https://openmaptiles.org/)** compatible endpoints.

> **Coming soon:** Mapbox Vector Tiles support.

---

## 📄 License

MIT
