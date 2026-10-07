# Changelog

## Unreleased

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
