import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../src', import.meta.url))

// The playground imports `lm-three-geo-play` like an application would, but
// resolved to the library source: edits show up at once. `three` comes from
// the playground's node_modules, so there is a single Three.js instance.
export default defineConfig({
    resolve: {
        alias: [{ find: /^lm-three-geo-play$/, replacement: `${src}/index.js` }],
        dedupe: ['three'],
    },
    server: {
        open: true,
        fs: { allow: ['..'] },
    },
})
