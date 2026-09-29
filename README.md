# 🌍 ThreeGeoPlay

**Real-world maps in Three.js — OpenStreetMap vector tiles rendered as 3D geometry, ready for games and apps.**

[![npm](https://img.shields.io/npm/v/lm-three-geo-play?color=cb3837&logo=npm)](https://www.npmjs.com/package/lm-three-geo-play)
[![license](https://img.shields.io/npm/l/lm-three-geo-play)](https://github.com/lorenzoMezza/Three-geo-play/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/lm-three-geo-play)](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md)

### ▶️ [Try the live demo](https://lorenzomezza.github.io/Three-geo-play-demo-website/) — explore Rome, walk through the streets or fly over the city, in the browser.

[![ThreeGeoPlay demo: St. Peter's Square with extruded buildings and real-time shadows](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/hero.jpg)](https://lorenzomezza.github.io/Three-geo-play-demo-website/)

## Install

```bash
npm i lm-three-geo-play three
```

Three.js is a peer dependency (r150+, r170+ recommended). ES module and CommonJS builds and TypeScript types are included; no other dependencies.

## Quick start

```js
import * as THREE from 'three';
import { ThreeGeoPlay } from 'lm-three-geo-play';

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 20000);
camera.position.set(0, 400, 600);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geo = new ThreeGeoPlay(scene, camera, renderer, {
  tileUrl:       'https://tiles.openfreemap.org/planet',   // free OpenStreetMap tiles, no key
  originLatLon:  { lat: 41.9028, lon: 12.4964 },           // Rome
  zoomLevel:     14,
  unitsPerMeter: 1,                                        // 1 world unit = 1 metre
});
geo.start();

renderer.setAnimationLoop(() => {
  geo.onFrameUpdate();   // call every frame
  renderer.render(scene, camera);
});
```

The map loads around the camera as it moves. Show the provider's credits from `geo.getTileSource().attribution`.

## Features

- **3D city from OpenStreetMap** — roads, water, land use and buildings with true-scale heights
- **Plays well with your scene** — your materials and lights, real-time shadows, ordinary depth-tested meshes, no flicker
- **Fully styleable** — any material per layer, live changes, a ready-made night theme, per-feature styling from OSM data
- **Made for games** — follow any object, `getHeightAt()` for collisions, `pickFeature()` for clicks, attach objects to tiles
- **Any vector tile provider** — OpenFreeMap, MapTiler, Mapbox, MapLibre styles or your own server
- **Fast** — one draw call per material, tiles built without blocking the frame

| | |
|---|---|
| ![Colosseum with real-time shadows](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/shadows.jpg) | ![Night theme](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/night.jpg) |
| ![Glass buildings](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/glass.jpg) | ![Buildings styled from their OSM height](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/data-driven.jpg) |
| ![Walk scene of the demo](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/walk.jpg) | ![Fly scene of the demo](https://raw.githubusercontent.com/lorenzoMezza/Three-geo-play/main/docs/images/fly.jpg) |

<sub>Shadows · night theme · glass buildings · data-driven style · Walk and Fly scenes of the [demo](https://lorenzomezza.github.io/Three-geo-play-demo-website/). Map data © OpenStreetMap contributors, © OpenMapTiles.</sub>

## A taste of the API

```js
const style = geo.getMapStyle();

// Any Three.js material, changed live
style.buildingLayer.material = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, vertexColors: true });
style.transportationLayer.primary.lineWidthMeters = 14;

// Style single features from their OSM data
style.buildingLayer.featureStyle = ({ properties }) =>
  properties.render_height > 40 ? { color: 0x9ec5ff } : null;

// What did the user click? How tall is the building here?
const hit = geo.pickFeature(raycaster);             // { layer: 'building', properties, intersection, … }
player.position.y = geo.getHeightAt(player.position.x, player.position.z);

// Put your own objects at real coordinates
const { x, z } = geo.latLonToWorld(41.8902, 12.4922);   // the Colosseum
marker.position.set(x, geo.getHeightAt(x, z), z);
```

## Documentation

- 📘 **[API reference](https://github.com/lorenzoMezza/Three-geo-play/blob/main/API.md)** — every class, option, default, event and type
- 📖 **[Guide](https://github.com/lorenzoMezza/Three-geo-play/blob/main/docs/GUIDE.md)** — styling, buildings and glass, integrating with your scene, shadows, tile providers, migrating from 1.x
- ▶️ **[Live demo](https://lorenzomezza.github.io/Three-geo-play-demo-website/)** and its [source](https://github.com/lorenzoMezza/Three-geo-play-demo-website)
- 🧪 **Playground** — `cd playground && npm install && npm run dev` runs the library from `src` for quick tries and debugging
- 🤝 **[Contributing](https://github.com/lorenzoMezza/Three-geo-play/blob/main/CONTRIBUTING.md)** — how the code is organised, tests and guidelines
- 📝 **[Changelog](https://github.com/lorenzoMezza/Three-geo-play/blob/main/CHANGELOG.md)**

## License

[MIT](https://github.com/lorenzoMezza/Three-geo-play/blob/main/LICENSE) © Lorenzo Mezzabarba. Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
