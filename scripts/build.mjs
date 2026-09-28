// Builds the published package into dist/:
//   three-geo-play.js    ES module (bundlers, browsers with an import map)
//   three-geo-play.cjs   CommonJS (require, Jest, older tooling)
//   three-geo-play.d.ts / .d.cts   types for each format
// Three.js is always external: the application's copy is used, never a bundled one.
import { build } from 'esbuild'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })

const common = {
    entryPoints: ['src/index.js'],
    bundle: true,
    external: ['three', 'three/*'],
    target: 'es2022',
    platform: 'neutral',
    sourcemap: true,
    sourcesContent: true,
    legalComments: 'eof',
    banner: { js: `/* ${pkg.name} ${pkg.version} — ${pkg.license} — ${pkg.homepage} */` },
    logLevel: 'warning',
}

await build({ ...common, format: 'esm', outfile: 'dist/three-geo-play.js' })
await build({ ...common, format: 'cjs', outfile: 'dist/three-geo-play.cjs', platform: 'node' })
await copyFile('src/index.d.ts', 'dist/three-geo-play.d.ts')
await copyFile('src/index.d.ts', 'dist/three-geo-play.d.cts')

console.log(`built ${pkg.name} ${pkg.version} into dist/`)
