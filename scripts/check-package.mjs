// Sanity checks of the built package, run before publishing:
// both formats load, export the whole API, and never contain Three.js itself.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const expected = ['ThreeGeoPlay', 'MapConfig', 'MapStyle', 'ViewMode', 'TileLayout', 'TileSchema']
let failed = false
const check = (ok, message) => { console.log(`${ok ? '✓' : '✗'} ${message}`); if (!ok) failed = true }

for (const file of ['dist/three-geo-play.js', 'dist/three-geo-play.cjs']) {
    const code = await readFile(file, 'utf8')
    check(!/Three\.js Authors|REVISION\s*=/.test(code), `${file} does not bundle Three.js`)
    check(/from\s*["']three["']|require\(["']three["']\)/.test(code), `${file} imports the application's three`)
}

const esm = await import('../dist/three-geo-play.js')
check(expected.every(name => name in esm), `ESM exports ${expected.join(', ')}`)

const cjs = createRequire(import.meta.url)('../dist/three-geo-play.cjs')
check(expected.every(name => name in cjs), 'CommonJS exports the same API')

const style = new esm.MapStyle()
check(typeof esm.MapStyle.dark === 'function' && style.clone() instanceof esm.MapStyle, 'MapStyle works')

process.exit(failed ? 1 : 0)
