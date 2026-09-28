import * as THREE from 'three'
import { MapStyle, TileLayout } from 'lm-three-geo-play'

import { PLACES, SOURCES, TILESET, isInsideTileset } from './tileset.js'
import { applyDayTheme, applyNightTheme } from './themes.js'
import {
    section, subheading, hint, slider, toggle, select, segmented, color, button, chips, coordinates,
    inputWithButton, legendHeader, legendRow, refreshAll,
} from './ui.js'

const ROAD_TYPES = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service',
    'pedestrian', 'path', 'track', 'rail', 'transit', 'ferry', 'pier',
]
const LANDCOVER_TYPES = [
    'grass', 'park', 'garden', 'meadow', 'wood', 'forest', 'scrub', 'farmland', 'sand', 'beach', 'wetland', 'rock',
]
const LANDUSE_TYPES = [
    'residential', 'commercial', 'industrial', 'retail', 'school', 'university', 'hospital', 'parking',
    'pitch', 'stadium', 'cemetery', 'religious', 'military', 'railway', 'quarter', 'recreation_ground',
]
const WATER_TYPES = ['ocean', 'lake', 'river', 'pond']

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass = degrees => `${COMPASS[Math.round(degrees / 45) % 8]} · ${Math.round(degrees)}°`

/**
 * Same material with another shading model: `MeshLambertMaterial` (lit by the
 * sun, receives shadows) or `MeshBasicMaterial` (unlit, shading baked by the library).
 */
function withLighting(material, lit) {
    const Type = lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial
    return new Type({
        color:        material.color,
        opacity:      material.opacity,
        transparent:  material.transparent,
        vertexColors: material.vertexColors,
    })
}

/**
 * Returns the material of `type[prop]` that can be recoloured without affecting
 * other types. Default styles share materials between types (e.g. all roads use
 * the same grey): such a material is replaced by a private copy first.
 */
function recolorable(type, prop, siblings) {
    const material = type[prop]
    const shared   = siblings.some(t => t !== type && (t.material === material || t.outlineMaterial === material))
    if (!shared) return material
    const copy = material.clone()
    type[prop] = copy
    return copy
}

/** Legend rows for the given types of a layer, each with its own colour and visibility. */
function legend(parent, layer, names, withCasing = false) {
    const siblings = () => names.map(n => layer()[n])
    legendHeader(parent, withCasing ? ['Fill', 'Casing', 'Show'] : ['Color', 'Show'])
    for (const name of names) {
        const type = () => layer()[name]
        const colors = [{ title: 'fill', get: () => type().material.color,
                          set: v => recolorable(type(), 'material', siblings()).color.set(v) }]
        if (withCasing) {
            colors.push({ title: 'casing', get: () => type().outlineMaterial.color,
                          set: v => recolorable(type(), 'outlineMaterial', siblings()).color.set(v) })
        }
        legendRow(parent, { name, colors, visible: { get: () => type().isVisible, set: v => { type().isVisible = v } } })
    }
}

/**
 * Builds the settings panel.
 * @param {HTMLElement} root
 * @param {{ geo: import('lm-three-geo-play').ThreeGeoPlay,
 *           controls: import('three/addons/controls/OrbitControls.js').OrbitControls,
 *           flyTo: (lat: number, lon: number) => void,
 *           atmosphere: import('./atmosphere.js').Atmosphere,
 *           loading: { mode: 'camera'|'view'|'manual', setMode: (mode: string) => void, loadAround: (x: number, z: number) => void },
 *           source: { name: string, set: (name: string, accessToken?: string) => void } }} app
 */
export function buildPanel(root, app) {
    const { geo, controls } = app
    const cfg   = () => geo.getMapConfig()
    const style = () => geo.getMapStyle()

    // ── Source ───────────────────────────────────────────────────────────────
    const src = section(root, { title: 'Source', open: true })
    let token = ''
    let sourceError = null
    const useSource = name => {
        try {
            app.source.set(name, token)
            sourceError.textContent = ''
        } catch (err) {
            sourceError.textContent = err.message
        }
        refreshAll()
    }
    select(src, {
        label: 'Tiles',
        options: Object.entries(SOURCES).map(([name, s]) => [name, s.label]),
        get: () => app.source.name,
        set: useSource,
    })
    inputWithButton(src, {
        label: 'Mapbox token', type: 'password', placeholder: 'pk.…', buttonLabel: 'Use',
        onSubmit: value => { token = value.trim(); useSource('mapbox') },
    })
    sourceError = hint(src)
    sourceError.classList.add('hint-error')
    geo.addEventListener('sourceload',  () => { sourceError.textContent = '' })
    geo.addEventListener('sourceerror', ({ error, willRetry }) => {
        sourceError.textContent = error.message.replace(/^ThreeGeoPlay: /, '') + (willRetry ? ' Retrying…' : '')
    })

    // ── Map ──────────────────────────────────────────────────────────────────
    const map = section(root, { title: 'Map', open: true })
    select(map, {
        label: 'Load tiles',
        options: [['camera', 'Around the camera'], ['view', 'Around the view centre'], ['manual', 'Fixed']],
        get: () => app.loading.mode,
        set: v => { app.loading.setMode(v); refreshAll() },
    })
    slider(map, {
        label: 'Render distance', min: 1, max: 30, step: 1,
        get: () => cfg().renderDistance, set: v => { cfg().renderDistance = v },
        format: v => `${v} tiles`,
    })
    slider(map, {
        label: 'Tile size', min: 10, max: 200, step: 5,
        get: () => cfg().tileWorldSize, set: v => { cfg().tileWorldSize = v },
        format: v => `${v} units`,
    })
    select(map, {
        label: 'Layout',
        options: [[TileLayout.CIRCULAR, 'Circular'], [TileLayout.GRID, 'Square']],
        get: () => cfg().tileLayout, set: v => { cfg().tileLayout = v },
    })
    toggle(map, { label: 'Fog', get: () => app.atmosphere.enabled, set: v => { app.atmosphere.enabled = v } })
    toggle(map, { label: 'Tile borders', get: () => cfg().showTileBorders, set: v => { cfg().showTileBorders = v } })
    button(map, {
        label: 'Load tiles around the view',
        onClick: () => { app.loading.loadAround(controls.target.x, controls.target.z); refreshAll() },
    })

    // ── Location ─────────────────────────────────────────────────────────────
    const loc = section(root, { title: 'Location', open: true })
    chips(loc, PLACES.map(place => ({ label: place.name, onClick: () => { app.flyTo(place.lat, place.lon); refreshAll() } })))
    let locationError = null
    coordinates(loc, {
        getLat: () => cfg().originLatLon.lat,
        getLon: () => cfg().originLatLon.lon,
        onGo: (lat, lon) => {
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                locationError.textContent = 'Enter a latitude and a longitude.'
            } else if (app.source.name === 'local' && !isInsideTileset(lat, lon)) {
                const { north, south, west, east } = TILESET.bounds
                locationError.textContent = `The local tiles only cover ${south}°–${north}° N, ${west}°–${east}° E.`
            } else {
                locationError.textContent = ''
                app.flyTo(lat, lon)
                refreshAll()
            }
        },
    })
    locationError = hint(loc)
    locationError.classList.add('hint-error')
    subheading(loc, 'Origin offset')
    for (const axis of ['x', 'z']) {
        slider(loc, {
            label: axis.toUpperCase(), min: -500, max: 500, step: 10,
            get: () => cfg().worldOriginOffset[axis],
            set: v => { cfg().worldOriginOffset = { ...cfg().worldOriginOffset, [axis]: v } },
            format: v => `${v}`,
        })
    }

    // ── Style ────────────────────────────────────────────────────────────────
    const styleSec = section(root, { title: 'Style', open: true })
    let theme = 'default'
    segmented(styleSec, {
        label: 'Theme',
        options: [['default', 'Day'], ['night', 'Night']],
        get: () => theme,
        set: name => {
            const next = new MapStyle()
            if (name === 'night') applyNightTheme(next)
            else applyDayTheme(next)
            geo.setMapStyle(next)
            theme = name
            app.atmosphere.resample()
            refreshAll()
        },
    })

    // ── Sun & shadows ────────────────────────────────────────────────────────
    const sunSec = section(root, { title: 'Sun & shadows', open: true })
    const lighting = app.lighting
    toggle(sunSec, { label: 'Shadows', get: () => lighting.shadows, set: v => { lighting.shadows = v } })
    slider(sunSec, {
        label: 'Sun direction', min: 0, max: 355, step: 5,
        get: () => lighting.azimuth, set: v => { lighting.azimuth = v },
        format: compass,
    })
    slider(sunSec, {
        label: 'Sun height', min: 5, max: 85, step: 1,
        get: () => lighting.elevation, set: v => { lighting.elevation = v },
        format: v => `${v}°`,
    })
    slider(sunSec, {
        label: 'Shadow strength', min: 0, max: 1, step: 0.02,
        get: () => style().shadowLayer.material.opacity, set: v => { style().shadowLayer.material.opacity = v },
        format: v => `${Math.round(v * 100)}%`,
    })
    hint(sunSec, 'Buildings cast shadows on the map and on each other; anything you add to the scene can join in.')

    // ── Buildings ────────────────────────────────────────────────────────────
    const bld = section(root, { title: 'Buildings', open: true })
    const buildings = () => style().buildingLayer
    toggle(bld, { label: 'Show buildings', get: () => buildings().isVisible, set: v => { buildings().isVisible = v } })
    segmented(bld, {
        label: 'Shading',
        options: [['lit', 'Sun'], ['baked', 'Baked']],
        get: () => (buildings().material.isMeshBasicMaterial ? 'baked' : 'lit'),
        set: v => { buildings().material = withLighting(buildings().material, v === 'lit'); refreshAll() },
    })
    color(bld, { label: 'Walls', get: () => buildings().material.color, set: v => buildings().material.color.set(v) })
    color(bld, { label: 'Roof tint', get: () => buildings().roofColor, set: v => { buildings().roofColor = v } })
    slider(bld, {
        label: 'Opacity', min: 0.1, max: 1, step: 0.05,
        get: () => buildings().material.opacity,
        set: v => {
            const m = buildings().material
            m.opacity = v
            if (m.transparent !== v < 1) {
                m.transparent = v < 1
                m.needsUpdate = true
            }
        },
        format: v => `${Math.round(v * 100)}%`,
    })
    toggle(bld, {
        label: 'Glass: hide inner walls',
        get: () => buildings().depthPrepass, set: v => { buildings().depthPrepass = v },
    })
    hint(bld, 'Below 100 % opacity only the nearest surface is blended. Unticked, every face is blended as in plain three.js, and the result depends on the draw order.')
    slider(bld, {
        label: 'Ambient occlusion', min: 0, max: 1, step: 0.05,
        get: () => buildings().ambientOcclusion, set: v => { buildings().ambientOcclusion = v },
        format: v => `${Math.round(v * 100)}%`,
    })
    slider(bld, {
        label: 'Baked wall shading', min: 0, max: 1, step: 0.05,
        get: () => buildings().wallShading, set: v => { buildings().wallShading = v },
        format: v => `${Math.round(v * 100)}%`,
    })
    slider(bld, {
        label: 'Roof variation', min: 0, max: 0.3, step: 0.01,
        get: () => buildings().colorVariation, set: v => { buildings().colorVariation = v },
        format: v => `${Math.round(v * 100)}%`,
    })
    slider(bld, {
        label: 'Height', min: 0, max: 4, step: 0.1,
        get: () => buildings().height, set: v => { buildings().height = v },
        format: v => (v === 1 ? 'true scale' : `${v.toFixed(1)}×`),
    })
    toggle(bld, { label: 'Cast shadows', get: () => buildings().castShadow, set: v => { buildings().castShadow = v } })

    // ── Roads ────────────────────────────────────────────────────────────────
    const roadsSec  = section(root, { title: 'Roads' })
    const roads     = () => style().transportationLayer
    const roadTypes = () => ROAD_TYPES.map(name => roads()[name])
    toggle(roadsSec, { label: 'Show roads', get: () => roads().isVisible, set: v => { roads().isVisible = v } })

    let sharedFill = null
    let sharedCasing = null
    color(roadsSec, {
        label: 'Fill, all types',
        get: () => roads().primary.material.color,
        set: v => {
            if (!sharedFill || !roadTypes().every(t => t.material === sharedFill)) {
                sharedFill = new THREE.MeshBasicMaterial()
                roads().setAllMaterials(sharedFill)
            }
            sharedFill.color.set(v)
            refreshAll()
        },
    })
    color(roadsSec, {
        label: 'Casing, all types',
        get: () => roads().primary.outlineMaterial.color,
        set: v => {
            if (!sharedCasing || !roadTypes().every(t => t.outlineMaterial === sharedCasing)) {
                sharedCasing = new THREE.MeshBasicMaterial()
                roads().setAllMaterials(null, sharedCasing)
            }
            sharedCasing.color.set(v)
            refreshAll()
        },
    })
    slider(roadsSec, {
        label: 'Casing width', min: 0, max: 0.15, step: 0.005,
        get: () => roads().primary.outlineWidth, set: v => roads().setOutlineWidthAll(v),
        format: v => v.toFixed(3),
    })
    slider(roadsSec, {
        label: 'Rounded joins', min: 6, max: 24, step: 1,
        get: () => roads().primary.jointSegments, set: v => roads().setJointSegmentsAll(v),
        format: v => `${v} steps`,
    })
    legend(roadsSec, roads, ROAD_TYPES, true)

    // ── Water ────────────────────────────────────────────────────────────────
    const waterSec = section(root, { title: 'Water' })
    const water    = () => style().waterLayer
    const waterway = () => style().waterwayLayer
    toggle(waterSec, { label: 'Show water', get: () => water().isVisible, set: v => { water().isVisible = v } })
    legend(waterSec, water, WATER_TYPES)
    subheading(waterSec, 'Rivers and canals')
    toggle(waterSec, { label: 'Show waterways', get: () => waterway().isVisible, set: v => { waterway().isVisible = v } })
    color(waterSec, { label: 'Fill',   get: () => waterway().river.material.color,        set: v => waterway().river.material.color.set(v) })
    color(waterSec, { label: 'Casing', get: () => waterway().river.outlineMaterial.color, set: v => waterway().river.outlineMaterial.color.set(v) })

    // ── Land cover ───────────────────────────────────────────────────────────
    const lcSec = section(root, { title: 'Land cover' })
    const landCover = () => style().landCoverLayer
    toggle(lcSec, { label: 'Show land cover', get: () => landCover().isVisible, set: v => { landCover().isVisible = v } })
    legend(lcSec, landCover, LANDCOVER_TYPES)

    // ── Land use ─────────────────────────────────────────────────────────────
    const luSec = section(root, { title: 'Land use' })
    const landUse = () => style().landUseLayer
    toggle(luSec, { label: 'Show land use', get: () => landUse().isVisible, set: v => { landUse().isVisible = v } })
    legend(luSec, landUse, LANDUSE_TYPES)

    // ── Ground ───────────────────────────────────────────────────────────────
    const groundSec = section(root, { title: 'Ground' })
    const background = () => style().backgroundLayer
    toggle(groundSec, { label: 'Show ground plane', get: () => background().isVisible, set: v => { background().isVisible = v } })
    color(groundSec, { label: 'Color', get: () => background().material.color, set: v => background().material.color.set(v) })
}
