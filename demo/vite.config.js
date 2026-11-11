import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

// The demo showcases the library source (`lm-three-geo-play`), looked up in order:
//   1. THREE_GEO_PLAY_SRC            — explicit path to the library's `src` folder (used by CI)
//   2. ../Three-geo-play/src         — library repo cloned next to this one
//   3. ../../src                     — this repo checked out inside the library repo
// If none exists, the `lm-three-geo-play` npm package is used (install it with `npm i lm-three-geo-play`).
const candidates = [process.env.THREE_GEO_PLAY_SRC, '../Three-geo-play/src', '../../src']
    .filter(Boolean)
    .map(dir => path.resolve(root, dir))
const librarySrc = candidates.find(dir => existsSync(path.join(dir, 'ThreeGeoPlay.js')))

if (!librarySrc && !existsSync(path.join(root, 'node_modules/lm-three-geo-play/package.json'))) {
    throw new Error(
        'three-geo-play library not found. Clone https://github.com/lorenzoMezza/Three-geo-play next to this ' +
        'repository, set THREE_GEO_PLAY_SRC=/path/to/Three-geo-play/src, or run `npm i lm-three-geo-play`.',
    )
}

export default defineConfig({
    base: '/Three-geo-play-demo-website/',
    resolve: {
        alias: librarySrc ? [{ find: /^lm-three-geo-play$/, replacement: path.join(librarySrc, 'index.js') }] : [],
        // The library source imports `three`: resolve it from this project so there is one Three.js instance.
        dedupe: ['three'],
    },
    server: {
        port: 3000,
        open: true,
        fs: { allow: [root, ...(librarySrc ? [librarySrc] : [])] },
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 1000,
    },
})
