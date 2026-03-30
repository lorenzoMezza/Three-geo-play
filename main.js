import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Stats from 'three/addons/libs/stats.module.js'
import { ThreeGeoPlay, TileLayout, ViewMode } from 'three-geo-play'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a2e)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 5000)
camera.position.set(0, 100, 200)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:0'
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.screenSpacePanning = false
controls.minDistance = 0.001
controls.maxDistance = 500000
controls.maxPolarAngle = Math.PI / 2

const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

const gp  = new ThreeGeoPlay(scene, camera, renderer)
const cfg = gp.getMapConfig()

cfg.renderDistance        = 6
cfg.tileWorldSize         = 50
cfg.zoomLevel             = 16
cfg.worldOriginOffset     = { x: 0, z: 0 }
cfg.tileLayout            = TileLayout.CIRCULAR
cfg.viewMode              = ViewMode.FOLLOW_TARGET
cfg.originLatLon          = { lat:41.9029, lon: 12.4534 }
cfg.showTileBorders       = false
cfg.pbfTileProviderZXYurl = './tiles/Y{y}X{x}.pbf'

gp.start()

function animate() {
    requestAnimationFrame(animate)
    stats.begin()
    controls.update()
    gp.onFrameUpdate()
    renderer.render(scene, camera)
    stats.end()
}
animate()

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})


// --- ui helpers ---

function applyColor(mat, hex) {
    mat.color.set(hex)
}

function sl(id, valId, fn) {
    const el = document.getElementById(id)
    const vl = document.getElementById(valId)
    el.addEventListener('input', () => {
        if (vl) vl.textContent = el.value
        fn(parseFloat(el.value))
    })
}

function col(id, fn) {
    document.getElementById(id).addEventListener('input', e => fn(e.target.value))
}

function chk(id, fn) {
    document.getElementById(id).addEventListener('change', e => fn(e.target.checked))
}


// --- styles ---

const s = document.createElement('style')
s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap');

    :root {
        --bg:      #0d0f14;
        --panel:   #13161d;
        --border:  #1e2330;
        --accent:  #4fffb0;
        --text:    #c8cfdf;
        --muted:   #5a6480;W
        --sec:     #1a1e2a;
        --thumb:   #222736;
    }

    #dev-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 99999;
        background: repeating-linear-gradient(-45deg, #1a1200 0 12px, #221800 12px 24px);
        border-bottom: 2px solid #f5a623;
        padding: 8px 18px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        color: #f5a623;
        letter-spacing: 0.05em;
        pointer-events: auto;
    }
    #dev-banner strong { color: #ffc14f; }
    #dev-banner .dismiss {
        margin-left: auto;
        flex-shrink: 0;
        background: none;
        border: 1px solid #f5a623;
        color: #f5a623;
        font-family: inherit;
        font-size: 9px;
        padding: 3px 8px;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.06em;
    }
    #dev-banner .dismiss:hover { background: rgba(245,166,35,.12); }
    .blink { animation: blink 2s step-start infinite; }
    @keyframes blink { 50% { opacity: 0.2; } }

    #gp-panel {
        position: fixed;
        top: 0; right: 0;
        width: 310px;
        height: 100vh;
        background: var(--panel);
        border-left: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: var(--text);
        z-index: 9999;
        transition: transform 0.3s cubic-bezier(.77,0,.18,1);
        box-shadow: -8px 0 40px rgba(0,0,0,.6);
    }
    #gp-panel.hidden { transform: translateX(310px); }

    #gp-tab {
        position: fixed;
        top: 50%;
        right: 310px;
        transform: translateY(-50%);
        z-index: 10000;
        background: var(--accent);
        color: #000;
        border: none;
        cursor: pointer;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        font-size: 10px;
        padding: 10px 6px;
        letter-spacing: 0.08em;
        writing-mode: vertical-rl;
        border-radius: 6px 0 0 6px;
        transition: right 0.3s cubic-bezier(.77,0,.18,1);
    }
    #gp-tab:hover { background: #3df0a0; }

    .gp-head {
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
    }
    .gp-head h1 {
        font-family: 'Syne', sans-serif;
        font-size: 16px;
        font-weight: 800;
        color: var(--accent);
        margin: 0 0 2px;
        letter-spacing: -0.02em;
    }
    .gp-head p { margin: 0; color: var(--muted); font-size: 10px; letter-spacing: 0.06em; }

    .gp-body {
        overflow-y: auto;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: var(--thumb) transparent;
    }
    .gp-body::-webkit-scrollbar { width: 4px; }
    .gp-body::-webkit-scrollbar-thumb { background: var(--thumb); border-radius: 2px; }

    .sec { border-bottom: 1px solid var(--border); }
    .sec-head {
        padding: 11px 20px 9px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
        background: var(--sec);
    }
    .sec-head:hover { background: #1d2230; }
    .sec-head .ico { font-size: 13px; width: 18px; text-align: center; }
    .sec-head .lbl {
        font-family: 'Syne', sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #8896b8;
        flex: 1;
    }
    .sec-head .arr { color: var(--muted); font-size: 9px; transition: transform 0.2s; }
    .sec-head.open .arr { transform: rotate(180deg); }

    .sec-body { padding: 14px 20px; display: grid; gap: 11px; }
    .sec-body.off { display: none; }

    .row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; }
    .row-l { color: var(--muted); font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
    .row-v { color: var(--accent); font-size: 10px; text-align: right; min-width: 34px; }

    .sl-w { grid-column: 1 / -1; }
    input[type=range] {
        -webkit-appearance: none;
        width: 100%; height: 3px;
        background: var(--border);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
    }
    input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px; height: 13px;
        border-radius: 50%;
        background: var(--accent);
        border: 2px solid var(--panel);
        transition: transform 0.15s;
    }
    input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); }
    input[type=range]::-moz-range-thumb {
        width: 13px; height: 13px;
        border-radius: 50%;
        background: var(--accent);
        border: 2px solid var(--panel);
        cursor: pointer;
    }

    .col-row {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .col-row span { flex: 1; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    input[type=color] {
        -webkit-appearance: none;
        width: 32px; height: 22px;
        border: 1px solid var(--border);
        border-radius: 4px;
        background: none;
        cursor: pointer;
        padding: 1px;
    }
    input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
    input[type=color]::-webkit-color-swatch { border: none; border-radius: 3px; }

    .tog-row {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .tog-row span { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .sw { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
    .sw input { opacity: 0; width: 0; height: 0; }
    .sw-t {
        position: absolute; inset: 0;
        background: var(--border);
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.2s;
    }
    .sw input:checked + .sw-t { background: var(--accent); }
    .sw-t::after {
        content: '';
        position: absolute;
        top: 3px; left: 3px;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
    }
    .sw input:checked + .sw-t::after { transform: translateX(16px); }

    .sel-row {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }
    .sel-row span { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    select {
        background: var(--bg);
        color: var(--accent);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 4px 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        cursor: pointer;
        outline: none;
    }
    select:focus { border-color: var(--accent); }

    .ll { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .ll-f label { display: block; color: var(--muted); font-size: 9px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    .ll-f input[type=number] {
        width: 100%; box-sizing: border-box;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--accent);
        border-radius: 4px;
        padding: 5px 7px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        outline: none;
    }
    .ll-f input[type=number]:focus { border-color: var(--accent); }

    .btn {
        grid-column: 1 / -1;
        padding: 8px;
        background: var(--accent);
        color: #000;
        border: none;
        border-radius: 5px;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        font-size: 10px;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn:hover { background: #3df0a0; }

    .item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid var(--border);
    }
    .item:last-child { border-bottom: none; }
    .item-name { flex: 1; color: var(--text); font-size: 10px; text-transform: capitalize; }
    input[type=color].sm { width: 26px; height: 18px; }

    .sub {
        grid-column: 1 / -1;
        color: var(--muted);
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid var(--border);
    }

    .gp-foot {
        padding: 10px 20px;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 9px;
        text-align: center;
        letter-spacing: 0.06em;
        flex-shrink: 0;
    }
`
document.head.appendChild(s)


// --- banner ---

const banner = document.createElement('div')
banner.id = 'dev-banner'
banner.innerHTML = `
    <span class="blink">⚠</span>
    <span><strong>WORK IN PROGRESS</strong> — This demo is incomplete and still under active development. Bad estetic and Bugs and unexpected behaviour are normal.</span>
    <button class="dismiss" onclick="this.parentElement.remove()">DISMISS</button>
`
document.body.appendChild(banner)


// --- panel ---

const panel = document.createElement('div')
panel.id = 'gp-panel'
panel.innerHTML = `
<div class="gp-head">
    <h1>ThreeGeoPlay</h1>
    <p>LIVE MAP SETTINGS</p>
</div>
<div class="gp-body">

    <div class="sec">
        <div class="sec-head open" data-s="map">
            <span class="ico">🗺</span><span class="lbl">Map</span><span class="arr">▼</span>
        </div>
        <div class="sec-body" id="sec-map">
            <div class="row"><span class="row-l">Zoom Level</span><span class="row-v" id="v-zoom">16</span></div>
            <div class="sl-w"><input type="range" id="sl-zoom" min="12" max="18" step="1" value="16"></div>
            <div class="row"><span class="row-l">Render Distance</span><span class="row-v" id="v-rd">6</span></div>
            <div class="sl-w"><input type="range" id="sl-rd" min="1" max="12" step="1" value="6"></div>
            <div class="row"><span class="row-l">Tile World Size</span><span class="row-v" id="v-tws">50</span></div>
            <div class="sl-w"><input type="range" id="sl-tws" min="5" max="200" step="5" value="50"></div>
            <div class="sel-row">
                <span>Tile Layout</span>
                <select id="sel-layout">
                    <option value="circular" selected>CIRCULAR</option>
                    <option value="grid">GRID</option>
                </select>
            </div>
            <div class="sel-row">
                <span>View Mode</span>
                <select id="sel-view">
                    <option value="follow_target" selected>FOLLOW TARGET</option>
                    <option value="manual">MANUAL</option>
                </select>
            </div>
            <div class="tog-row">
                <span>Show Tile Borders</span>
                <label class="sw"><input type="checkbox" id="chk-borders"><span class="sw-t"></span></label>
            </div>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head open" data-s="origin">
            <span class="ico">📍</span><span class="lbl">Origin</span><span class="arr">▼</span>
        </div>
        <div class="sec-body" id="sec-origin">
            <div class="ll">
                <div class="ll-f"><label>Latitude</label><input type="number" id="inp-lat" value="41.899689" step="0.0001"></div>
                <div class="ll-f"><label>Longitude</label><input type="number" id="inp-lon" value="12.437790" step="0.0001"></div>
            </div>
            <button class="btn" id="btn-origin">Apply Origin</button>
            <div class="row"><span class="row-l">Offset X</span><span class="row-v" id="v-ox">0</span></div>
            <div class="sl-w"><input type="range" id="sl-ox" min="-500" max="500" step="10" value="0"></div>
            <div class="row"><span class="row-l">Offset Z</span><span class="row-v" id="v-oz">0</span></div>
            <div class="sl-w"><input type="range" id="sl-oz" min="-500" max="500" step="10" value="0"></div>
            <button class="btn" id="btn-offset">Apply Offset</button>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head" data-s="bg">
            <span class="ico">🎨</span><span class="lbl">Background</span><span class="arr">▼</span>
        </div>
        <div class="sec-body off" id="sec-bg">
            <div class="col-row"><span>Color</span><input type="color" id="col-bg" value="#f2efe9"></div>
            <div class="tog-row">
                <span>Visible</span>
                <label class="sw"><input type="checkbox" id="chk-bg-vis"><span class="sw-t"></span></label>
            </div>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head" data-s="bld">
            <span class="ico">🏙</span><span class="lbl">Buildings</span><span class="arr">▼</span>
        </div>
        <div class="sec-body off" id="sec-bld">
            <div class="tog-row">
                <span>Visible</span>
                <label class="sw"><input type="checkbox" id="chk-bld-vis" checked><span class="sw-t"></span></label>
            </div>
            <div class="col-row"><span>Fill Color</span><input type="color" id="col-bld" value="#fff4a3"></div>
            <div class="row"><span class="row-l">Opacity</span><span class="row-v" id="v-bld-op">0.5</span></div>
            <div class="sl-w"><input type="range" id="sl-bld-op" min="0" max="1" step="0.05" value="0.5"></div>
            <div class="row"><span class="row-l">Height</span><span class="row-v" id="v-bld-h">0.001</span></div>
            <div class="sl-w"><input type="range" id="sl-bld-h" min="0.0001" max="0.01" step="0.0001" value="0.001"></div>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head" data-s="water">
            <span class="ico">💧</span><span class="lbl">Water</span><span class="arr">▼</span>
        </div>
        <div class="sec-body off" id="sec-water">
            <div class="tog-row">
                <span>Visible</span>
                <label class="sw"><input type="checkbox" id="chk-water-vis" checked><span class="sw-t"></span></label>
            </div>
            <div class="col-row"><span>River</span><input type="color" id="col-river" value="#ff6600"></div>
            <div class="col-row"><span>Lake</span><input type="color" id="col-lake" value="#9cd8f6"></div>
            <div class="col-row"><span>Ocean</span><input type="color" id="col-ocean" value="#9cd8f6"></div>
            <div class="col-row"><span>Pond</span><input type="color" id="col-pond" value="#3be7a5"></div>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head" data-s="lc">
            <span class="ico">🌿</span><span class="lbl">Land Cover</span><span class="arr">▼</span>
        </div>
        <div class="sec-body off" id="sec-lc">
            <div class="tog-row">
                <span>Visible</span>
                <label class="sw"><input type="checkbox" id="chk-lc-vis" checked><span class="sw-t"></span></label>
            </div>
            <div class="col-row"><span>Grass</span><input type="color" id="col-grass" value="#17b605"></div>
            <div class="col-row"><span>Wood</span><input type="color" id="col-wood" value="#17b605"></div>
            <div class="col-row"><span>Sand</span><input type="color" id="col-sand" value="#f5e559"></div>
            <div class="col-row"><span>Park</span><input type="color" id="col-park" value="#109c00"></div>
            <div class="col-row"><span>Farmland</span><input type="color" id="col-lc-farm" value="#ffcc99"></div>
            <div class="col-row"><span>Wetland</span><input type="color" id="col-wetland" value="#17b605"></div>
            <div class="col-row"><span>Rock</span><input type="color" id="col-rock" value="#17b605"></div>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head" data-s="roads">
            <span class="ico">🛣</span><span class="lbl">Roads</span><span class="arr">▼</span>
        </div>
        <div class="sec-body off" id="sec-roads">
            <div class="tog-row">
                <span>All Visible</span>
                <label class="sw"><input type="checkbox" id="chk-roads-vis" checked><span class="sw-t"></span></label>
            </div>
            <div class="col-row"><span>Global Fill</span><input type="color" id="col-road-all" value="#ff0000"></div>
            <div class="col-row"><span>Global Outline</span><input type="color" id="col-outline-all" value="#ffff00"></div>
            <div class="row"><span class="row-l">Outline Width</span><span class="row-v" id="v-ow">0.075</span></div>
            <div class="sl-w"><input type="range" id="sl-ow" min="0" max="0.5" step="0.005" value="0.075"></div>
            <div class="row"><span class="row-l">Joint Segments</span><span class="row-v" id="v-js">8</span></div>
            <div class="sl-w"><input type="range" id="sl-js" min="6" max="32" step="1" value="8"></div>
            <div class="sub">Per-road</div>
            <div id="road-list"></div>
        </div>
    </div>

    <div class="sec">
        <div class="sec-head" data-s="lu">
            <span class="ico">🏘</span><span class="lbl">Land Use</span><span class="arr">▼</span>
        </div>
        <div class="sec-body off" id="sec-lu">
            <div class="tog-row">
                <span>Visible</span>
                <label class="sw"><input type="checkbox" id="chk-lu-vis"><span class="sw-t"></span></label>
            </div>
            <div id="lu-list"></div>
        </div>
    </div>

</div>
<div class="gp-foot">three-geo-play · live demo</div>
`
document.body.appendChild(panel)

const tab = document.createElement('button')
tab.id = 'gp-tab'
tab.textContent = 'SETTINGS'
document.body.appendChild(tab)

tab.addEventListener('click', () => {
    panel.classList.toggle('hidden')
    tab.style.right = panel.classList.contains('hidden') ? '0' : '310px'
})

document.querySelectorAll('.sec-head').forEach(h => {
    h.addEventListener('click', () => {
        const body = document.getElementById('sec-' + h.dataset.s)
        const isOpen = !body.classList.contains('off')
        body.classList.toggle('off', isOpen)
        h.classList.toggle('open', !isOpen)
    })
})


// --- wire up controls ---

const ms = cfg.mapStyle;


sl('sl-zoom', 'v-zoom', v => { cfg.zoomLevel = v })
sl('sl-rd',   'v-rd',   v => { cfg.renderDistance = v })
sl('sl-tws',  'v-tws',  v => { cfg.tileWorldSize = v })

document.getElementById('sel-layout').addEventListener('change', e => {
    cfg.tileLayout = e.target.value === 'circular' ? TileLayout.CIRCULAR : TileLayout.GRID
})
document.getElementById('sel-view').addEventListener('change', e => {
    cfg.viewMode = e.target.value === 'follow_target' ? ViewMode.FOLLOW_TARGET : ViewMode.MANUAL
})
chk('chk-borders', v => { cfg.showTileBorders = v })

document.getElementById('btn-origin').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('inp-lat').value)
    const lon = parseFloat(document.getElementById('inp-lon').value)
    if (!isNaN(lat) && !isNaN(lon)) cfg.originLatLon = { lat, lon }
})

sl('sl-ox', 'v-ox', () => {})
sl('sl-oz', 'v-oz', () => {})
document.getElementById('btn-offset').addEventListener('click', () => {
    cfg.worldOriginOffset = {
        x: parseFloat(document.getElementById('sl-ox').value),
        z: parseFloat(document.getElementById('sl-oz').value),
    }
})

const bgLayer = ms.getStyleLayerByName('background')
col('col-bg', v => { applyColor(bgLayer.material, v) })
chk('chk-bg-vis', v => { bgLayer.isVisible = v })

const bldLayer = ms.getStyleLayerByName('building')
chk('chk-bld-vis', v => { bldLayer.isVisible = v })
col('col-bld', v => { applyColor(bldLayer.material, v) })
sl('sl-bld-op', 'v-bld-op', v => { bldLayer.material.opacity = v })
sl('sl-bld-h',  'v-bld-h',  v => { bldLayer.height = v })

const waterLayer = ms.getStyleLayerByName('water')
chk('chk-water-vis', v => { waterLayer.isVisible = v })
for (const name of ['river', 'lake', 'ocean', 'pond']) {
    col('col-' + name, v => {
        const t = waterLayer.getTypeByName(name)
        if (t) applyColor(t.material, v)
    })
}

const lcLayer = ms.getStyleLayerByName('landcover')
chk('chk-lc-vis', v => { lcLayer.isVisible = v })
for (const [name, id] of [
    ['grass', 'col-grass'], ['wood', 'col-wood'], ['sand', 'col-sand'],
    ['park', 'col-park'], ['farmland', 'col-lc-farm'], ['wetland', 'col-wetland'], ['rock', 'col-rock'],
]) {
    col(id, v => {
        const t = lcLayer.getTypeByName(name)
        if (t) applyColor(t.material, v)
    })
}
ms.buildingLayer.height = 0.001
const transLayer = ms.getStyleLayerByName('transportation')
chk('chk-roads-vis', v => { transLayer.setVisible(v) })

col('col-road-all', v => {
    transLayer.setAllMaterials(new THREE.MeshBasicMaterial({ color: v, side: THREE.BackSide }))
})
col('col-outline-all', v => {
    const outMat = new THREE.MeshBasicMaterial({ color: v, side: THREE.BackSide })
    for (const name of ['motorway','trunk','primary','secondary','tertiary','minor','service','rail','transit','pedestrian','path','track','pier','ferry']) {
        const t = transLayer.getTypeByName(name)
        if (t) t.outlineMaterial = outMat.clone()
    }
})

sl('sl-ow', 'v-ow', v => { transLayer.generalConfig.outlineWidth = v })
sl('sl-js', 'v-js', v => { transLayer.generalConfig.jointSegments = Math.round(v) })

const roadNames = ['motorway','trunk','primary','secondary','tertiary','minor','service','rail','transit','pedestrian','path','track','pier','ferry']
const roadDefaultOn = new Set(['motorway','primary','secondary','tertiary','minor','service','path'])

const roadList = document.getElementById('road-list')
for (const name of roadNames) {
    const t = transLayer.getTypeByName(name)
    if (!t) continue

    const el = document.createElement('div')
    el.className = 'item'
    el.innerHTML = `
        <span class="item-name">${name}</span>
        <input type="color" class="sm" title="Fill" value="#ff0000">
        <input type="color" class="sm" title="Outline" value="#ffff00">
        <label class="sw"><input type="checkbox" ${roadDefaultOn.has(name) ? 'checked' : ''}><span class="sw-t"></span></label>
    `
    roadList.appendChild(el)

    const [fillInput, outlineInput] = el.querySelectorAll('input[type=color]')
    const visInput = el.querySelector('input[type=checkbox]')

    fillInput.addEventListener('input', e => { applyColor(t.material, e.target.value) })
    outlineInput.addEventListener('input', e => { applyColor(t.outlineMaterial, e.target.value) })
    visInput.addEventListener('change', e => { t.isVisible = e.target.checked })
}

const luLayer = ms.getStyleLayerByName('landuse')
chk('chk-lu-vis', v => { luLayer.isVisible = v })

const luEntries = [
    ['residential', '#6aeb74'], ['commercial', '#ff4500'], ['industrial', '#808080'],
    ['retail', '#ff6347'], ['school', '#add8e6'], ['hospital', '#ff0000'],
    ['university', '#0000ff'], ['parking', '#4682b4'], ['stadium', '#ff8c00'],
    ['cemetery', '#556b2f'], ['religious', '#4b0082'], ['military', '#696969'],
    ['farmland', '#ffcc99'], ['railway', '#a9a9a9'], ['recreation_ground', '#98fb98'],
    ['nature_reserve', '#006400'],
]

const luList = document.getElementById('lu-list')
for (const [name, defaultColor] of luEntries) {
    const t = luLayer.getTypeByName(name)
    if (!t) continue

    const el = document.createElement('div')
    el.className = 'item'
    el.innerHTML = `
        <span class="item-name">${name.replace(/_/g, ' ')}</span>
        <input type="color" class="sm" value="${defaultColor}">
        <label class="sw"><input type="checkbox" ${t.isVisible ? 'checked' : ''}><span class="sw-t"></span></label>
    `
    luList.appendChild(el)

    el.querySelector('input[type=color]').addEventListener('input', e => { applyColor(t.material, e.target.value) })
    el.querySelector('input[type=checkbox]').addEventListener('change', e => { t.isVisible = e.target.checked })
}