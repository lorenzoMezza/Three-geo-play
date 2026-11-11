# Changelog

## 2.4.1

New:

- `getHeightAt(x, z, below)`: an optional height that leaves out the building parts starting above it (their `min_height`). A character can walk under arches, porticoes and raised floors instead of hitting them as walls; without it the result is the same as before.

## 2.4.0

New:

- `style.railwayLayer`: railways in relief, a raised bed with two rails on top (`RailFeatureType`: widths, heights and gauge in metres, rail material), extruded like the buildings so a bed can share their material, batch and depth prepass. Levels are respected: a road above a track (a bridge over it) hides the track where it crosses, a road on its level (a level crossing) leaves the rails flush with it without the bed, a railway bridge is drawn over the roads below, tracks in tunnels are not drawn. Trams have rails without a bed, monorails a beam without rails. Tile schemas route features to it with `layer: 'railway'`; the built-in schemas keep rails in the transportation layer, so existing maps look the same.
- `MapConfig.maxSegmentMeters`, the longest edge of the map geometry, for a vertex shader that bends the map (a curved world, a terrain): such a shader moves vertices only, so a long straight road or a large area stayed flat between far apart vertices, away from the bent ground, and its edges broke where long and short segments met. Lines and rings get points on their long edges (the same points whichever way an edge is walked, so shared walls still match) and triangles are split through their longest edge (shared midpoints, no cracks); the shape is unchanged. The ground planes (background, ground depth, shadows) are split into squares no larger than it too.
- `MapConfig.flatLayersFrontToBack` (default off): the flat layers (ground, land, water, roads) are drawn front to back, the topmost first, each marking its pixels in the stencil (`FLAT_STENCIL_BIT`, `0x10`), so the layers below skip them before their shader runs: every pixel is shaded once instead of once per layer lying on it. The picture is the same, sample by sample with multisampling too. Free where the GPU already drops hidden opaque pixels (Apple's), a saving in proportion to the layers and their shaders where it does not (most Android phones). Needs a stencil buffer and opaque flat materials; the flat meshes then take render orders around −5000, the style's order stays in `userData.flatOrder` (`pickFeature` reads it).
- `MapConfig.fetch`: a `fetch`-compatible function that downloads the tile source document and the tiles, e.g. from a cache.
- `retryDownloads()`: tries the waiting tiles and the tile source again at once, e.g. on the browser's `online` event.
- The stencil bits the map uses are exported: `GLASS_STENCIL_BIT` (`0x80`), `GROUND_STENCIL_BIT` (`0x20`, now set by the ground occluder of `occludeBelowGround` where it is drawn: something drawn after it with a stencil test, such as a sky, can shade only the pixels the map leaves free) and `FLAT_STENCIL_BIT` (`0x10`).

Faster:

- Tile geometry is indexed: vertices equal bit for bit (position, normal, colour) are shared, with the triangles in the same order, so every pixel is the same. About half the vertices for the GPU to transform (roads −54 %, buildings −42 % in Rome at zoom 14) and smaller buffers (94 → 69 MB there). Batches manage index room alongside vertex room and start smaller (4096 vertices, room for 64 tiles): most hold a few hundred vertices, and a usual scene never regrows them.
- Round caps that another line of the same batch already covers are left out: a cap ending on a vertex of a line at least as wide, or where several ends meet (the widest keeps its cap). About a quarter fewer road triangles in dense cities.
- Ramps with the same fill material as the roads around them join their batch instead of getting one each: fewer, often empty, batches.
- `simpleExtrusion` simplifies footprints with the accuracy of the lines, and leaves out walls shared with a neighbour at least as tall (same batch): such walls are always inside the neighbour.

Fixes:

- Thick lines are watertight: a nearly straight join (under 0.02 rad) is mitered, both segments ending on the same corners, and a round wedge ends exactly on the corner of the next segment. Before, the outer side of such joins left a sliver up to half the width × the angle (8 cm on an 8 m road), and the rasteriser could open one-pixel cracks across the road and its edge.
- A `zoomLevel` replaced by the nearest served level no longer starts downloading the tiles of the unserved level first (they were all cancelled on the next frame).
- `landUseLayer.nature_reserve` and `protected_area` are drawn under every other land use (rendering order −4.5) whatever materials the types share: protected areas are vast (whole regional parks, towns and sea included) and should fill only the land nothing else describes.

Changed:

- A tile download that fails is retried for as long as the tile is in the render area (1 s, 2 s, 4 s… then every 16 s, logged for the first 5 attempts) instead of giving up after 5 attempts: a device offline for more than a few seconds was left with holes in the map until it moved away. `failed` tiles in `getTileStats()` are now only those whose data could not be built.
- Circular layout: `renderDistance` is a radius around the exact map centre and may be fractional; the tiles are chosen again every 1/8 tile of movement. The grid layout still rounds it to whole tiles around the centre tile.

Repository:

- The demo website now lives in `demo/` of this repository, built from the library source on every push: https://lorenzomezza.github.io/Three-geo-play/

## 2.3.0

- New: `buildingLayer.simpleExtrusion`. Every building is drawn as a plain extrusion of its 2D footprint, one prism from the ground to its roof: no raised building parts, no undersides, one quad per wall. Fewer triangles for mobile and for stylised maps.

## 2.2.1

- `jointSegments` is always respected: round caps and joins of roads and waterways no longer get fewer points on narrow lines or at low zoom levels, where an internal tolerance could reduce a cap to a single triangle.

## 2.2.0

- Tile geometry is built in web workers (two per map): loading tiles takes about 60 % less time on the main thread, and its longest step drops from about 11 ms to 4 ms. Nothing to configure, the package starts the workers from code in its bundle. Where there are none (Node, React Native, a Content-Security-Policy without `worker-src blob:`) tiles are built on the main thread as before, with the same result.
- New: `key`, a unique name of each feature, in picked features, `tile.getFeatures()` and the `featureStyle` argument. Use it to highlight what the user clicked: the tile data's `id` is 0 for most OpenMapTiles features, so styling by `id` could colour many buildings at once.
- New: `TileSchema.SHORTBREAD`, detected automatically: VersaTiles (free, no key) works out of the box, bridges and tunnels included.
- Mapbox styles (`mapbox://styles/…`) are recognised as Mapbox Streets even when the Terrain layers come first.
- A source with none of the layers of the built-in schemas gets a console warning instead of an empty map without explanation.
- Seen from above, the flat layers no longer flicker while the camera moves.
- Transparent buildings no longer cast shadows: their hidden inner walls, and the walls between attached buildings, left dark stains inside the glass.
- When nothing is loading, the batched meshes give back the memory left unused by tiles that were unloaded.

## 2.1.0

- A `zoomLevel` the tile source does not serve (e.g. 16 on OpenFreeMap, which stops at 14) is replaced by the nearest served level, at the same scale, instead of leaving the map empty.
- Flat layers default to `Y = 0`, background included: the ground that hides what is below the map is now at the map's ground at any scale (before, it sat 0.01 world units lower — 10 m in a scene measured in kilometres).
- New: `layer.types` (every type of a layer by class name) and `style.forEachType()` (every type of every layer), e.g. to change all the materials at once.
- New: `transportationLayer.motorway_construction` (hidden by default, like the other roads under construction).
- `WaterwayLayer.admittedClasses`, like the other layers; `getStyleLayerByName()` is typed by name in TypeScript.
- Roof tones follow the drawn height: roofs of flattened buildings (`buildingLayer.height = 0`) no longer flicker.
- `MapStyle.clone()` keeps the draw order of overlapping areas of the original.
- The stencil warning of transparent buildings mentions the render targets of an `EffectComposer`.
- `buildingLayer.allowDetails` / `setAllowDetails()` never had an effect and are deprecated.
- Docs: React Three Fiber recipe, post-processing with glass buildings, POI filtering, a surface under the map, cost of `pickFeature()`.
- Contributors: source reorganised (`geometry/`, `tiles/`, one file per class), style layers written as tables, a test suite (`npm test`) and CI.

## 2.0.1

- Shorter README with the install and the live demo up front; the guide moved to `docs/GUIDE.md`.

## 2.0.0

- Installable package: ES module and CommonJS builds with TypeScript types; `three` is a peer dependency.
- Metric scale (`unitsPerMeter`), `getHeightAt()`, `pickFeature()`, tile events, per-feature styling, shadows, glass buildings without inner walls. See the migration notes in `docs/GUIDE.md`.
