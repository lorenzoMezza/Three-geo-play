# Contributing

Thanks for helping! Issues and pull requests are welcome.

## Getting started

```bash
npm install
npm test          # unit tests on the tiles in test/fixtures (Node 18+, no browser needed)
npm run build     # dist/: ES module, CommonJS and types
npm run check     # sanity checks of the built package
```

To see your changes, run the playground: it uses the library straight from `src`, so edits reload at once.

```bash
cd playground && npm install && npm run dev
```

## How the code is organised

```
src/
  index.js             public exports          index.d.ts   TypeScript declarations (keep them in sync)
  ThreeGeoPlay.js      the map: public API, follow target, picking
  config/MapConfig.js  options, validated, with dirty tracking
  map/                 tiles on screen
    TileManager.js       which tiles are needed, downloads, build queue, ground planes
    Tile.js              one tile: builds its geometry from the vector data
    MeshBatches.js       draws the geometry of every tile with one BatchedMesh per material
    drawHooks.js         per-draw state: flat layers without depth writes, glass depth pre-pass
    lineLayering.js      draw order of roads and waterways (bridges, tunnels, casings)
  tiles/               tile data
    tileSource.js        template, TileJSON, style and mapbox:// URLs
    fetchTileData.js     downloads (gzip included)
    vectorTile.js        MVT decoder
    tileSchemas.js       OpenMapTiles / Mapbox layers → style layers and types
    TileFeatureCollector.js  groups the features of a tile by style type
    projection.js        Web Mercator
  geometry/            polygons (earcut), thick lines, extruded buildings
  style/               MapStyle, its layers (style/layers) and their base classes (style/core)
```

A frame goes like this: `ThreeGeoPlay.onFrameUpdate()` applies config and style changes, moves the loaded area with the follow target, and lets `TileManager` download and build tiles in slices of a few milliseconds. `Tile` turns the vector data into geometry with the builders of `geometry/`, and `MeshBatches` adds it to the batched meshes.

## Guidelines

- **Keep the public API stable.** Anything in `index.d.ts` and `API.md` is public: change it only with a deprecation path, and update both files (and the README when it is shown there).
- **Never modify the user's materials.** Per-draw changes (depth writes, the glass pre-pass) are made in `drawHooks.js` and restored after the draw.
- **No dependencies** besides `three` (a peer dependency).
- **Style:** ES modules, 4-space indentation, private `#fields`, JSDoc on anything exported. Comments say *why*, in English.
- **Tests:** add or update a test in `test/` for behaviour you change. Rendering changes also need a look in the playground or the [demo](https://github.com/lorenzoMezza/Three-geo-play-demo-website).
