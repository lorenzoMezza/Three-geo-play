# ThreeGeoPlay — demo website

Live demo of [ThreeGeoPlay](https://github.com/lorenzoMezza/Three-geo-play): OpenStreetMap vector tiles rendered as 3D Three.js geometry.

🔴 **Live:** https://lorenzomezza.github.io/Three-geo-play-demo-website/

## Three scenes

Switch with the bar at the top of the page.

- **Explore** — the map explorer and its settings panel (below).
- **Walk** — a runner in Piazza San Pietro. Run through Rome, hold Space for a super jump onto the roofs,
  collect the coins on the streets and roofs, press E to paint the building in front of you.
- **Fly** — a propeller plane over the city: a grand tour through glowing rings above the landmarks,
  with contrails, the plane's shadow on the roofs and crashes into the buildings.

The models are built from simple shapes (`src/game/models.js`). The games use the library the way your own
game would (`src/game/`):

- the runner and the plane are the follow target, so the tiles load around them;
- walls, roofs and crashes come from the building footprints of the tiles (`getFeatures('building')`,
  kept current with the `tileload` / `tileunload` events);
- coins are placed from the street and building data and added to the tiles' own groups, so they follow
  the map and disappear with their tile;
- painting uses `pickFeature()` and `featureStyle`; the rings are placed with `latLonToWorld()`;
- everything you add casts shadows on the city and hides behind the buildings like any Three.js object.

## What the explorer shows

- Tiles loaded around the camera (follow mode, the default), around the point you look at, or manually
- Solid 3D buildings with baked ambient occlusion and wall shading, lit by a sun you can move
- Real-time shadows: buildings shade the map and each other (the style's shadow layer draws them on the unlit map)
- Transparent buildings drawn as a single layer of "glass" — no inner walls
- Click on the map to see what is there (building height, road type, land use…): `pickFeature()` of the library, with a pin that casts its shadow like any object of your scene
- Live restyling of every layer: colours, visibility, outlines, building height, opacity, roof tint, sun or baked shading
- Themes (default / night) applied to the tiles already on screen
- Jumping to real places, geographic coordinates of the view
- Switching tile provider live: the local tile set, OpenFreeMap through its MapLibre style URL, or Mapbox Streets with your access token

## Tiles

`public/tiles` contains an OpenMapTiles-schema tile set at **zoom 16 only**, covering Rome and most of Lazio
(lat 41.24…42.84, lon 11.45…14.03). Files are named `Y{y}X{x}.pbf`, so the map uses that URL template
and a fixed zoom level. Map data © [OpenMapTiles](https://openmaptiles.org/) © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

## Development

The demo is built against the library **source**, so it always reflects the latest code.
`vite.config.js` looks for it in this order:

1. the folder in the `THREE_GEO_PLAY_SRC` environment variable;
2. `../Three-geo-play/src` — the library repository cloned next to this one;
3. `../../src` — this repository checked out inside the library repository;
4. otherwise the `lm-three-geo-play` npm package (`npm i lm-three-geo-play`).

```bash
git clone https://github.com/lorenzoMezza/Three-geo-play.git
git clone https://github.com/lorenzoMezza/Three-geo-play-demo-website.git
cd Three-geo-play-demo-website
npm install
npm run dev      # http://localhost:3000/Three-geo-play-demo-website/
npm run build    # production build in dist/
```

## Deployment

Pushing to `main` runs `.github/workflows/static.yml`, which checks out this repository and the library,
builds the site and publishes `dist/` to GitHub Pages. After changing the library, run the workflow manually
from the Actions tab to redeploy the demo with the new code. `dist/` is a build output and is not committed.
