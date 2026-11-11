/**
 * Small control kit for the settings panel.
 *
 * Every control reads its value through a `get()` callback, so the whole panel
 * can be re-synchronised with the map state (e.g. after a theme change) with
 * {@link refreshAll}. What the panel shows is always what the map renders.
 */

const controls = []

export function refreshAll() {
    for (const control of controls) control.refresh()
}

function register(refresh) {
    controls.push({ refresh })
    refresh()
}

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

let uid = 0
const nextId = () => `ctl-${++uid}`

const toHex = color => `#${color.getHexString()}`

function swatch(label, get, set) {
    const input = el('input', 'swatch')
    input.type  = 'color'
    input.title = label
    input.setAttribute('aria-label', label)
    input.addEventListener('input', () => set(input.value))
    register(() => { input.value = toHex(get()) })
    return input
}

/** Collapsible section; returns its body. */
export function section(parent, { title, open = false }) {
    const details = el('details', 'section')
    details.open  = open
    const summary = el('summary', null, title)
    const body    = el('div', 'section-body')
    details.append(summary, body)
    parent.append(details)
    return body
}

export function subheading(parent, text) {
    parent.append(el('h3', 'subheading', text))
}

export function hint(parent, text = '') {
    const node = el('p', 'hint', text)
    parent.append(node)
    return node
}

export function slider(parent, { label, min, max, step, get, set, format = String }) {
    const id    = nextId()
    const field = el('div', 'slider')
    const name  = el('label', null, label)
    const value = el('output')
    const input = el('input')
    name.htmlFor = id
    value.htmlFor = id
    Object.assign(input, { id, type: 'range', min, max, step })
    field.append(name, value, input)
    parent.append(field)

    input.addEventListener('input', () => {
        const v = parseFloat(input.value)
        value.textContent = format(v)
        set(v)
    })
    register(() => {
        const v = get()
        input.value = v
        value.textContent = format(v)
    })
}

export function toggle(parent, { label, get, set }) {
    const row   = el('label', 'check')
    const input = el('input')
    input.type  = 'checkbox'
    row.append(input, el('span', null, label))
    parent.append(row)

    input.addEventListener('change', () => set(input.checked))
    register(() => { input.checked = get() })
}

export function select(parent, { label, options, get, set }) {
    const id    = nextId()
    const row   = el('div', 'row')
    const name  = el('label', null, label)
    const input = el('select')
    name.htmlFor = input.id = id
    for (const [value, text] of options) {
        const option = el('option', null, text)
        option.value = value
        input.append(option)
    }
    row.append(name, input)
    parent.append(row)

    input.addEventListener('change', () => set(input.value))
    register(() => { input.value = get() })
}

/** Row of mutually exclusive buttons. */
export function segmented(parent, { label, options, get, set }) {
    const row   = el('div', 'row')
    const group = el('div', 'segmented')
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', label)
    const buttons = options.map(([value, text]) => {
        const node = el('button', null, text)
        node.type = 'button'
        node.addEventListener('click', () => set(value))
        group.append(node)
        return [value, node]
    })
    row.append(el('span', 'row-label', label), group)
    parent.append(row)
    register(() => {
        const current = get()
        for (const [value, node] of buttons) node.setAttribute('aria-pressed', String(value === current))
    })
}

export function color(parent, { label, get, set }) {
    const row = el('div', 'row')
    row.append(el('span', 'row-label', label), swatch(label, get, set))
    parent.append(row)
}

/** Text field with a submit button on the same line; returns the input. */
export function inputWithButton(parent, { label, type = 'text', placeholder = '', buttonLabel, onSubmit }) {
    const id    = nextId()
    const form  = el('form', 'field')
    const name  = el('label', null, label)
    const line  = el('div', 'field-line')
    const input = el('input')
    const go    = el('button', 'btn', buttonLabel)
    name.htmlFor = input.id = id
    Object.assign(input, { type, placeholder, autocomplete: 'off', spellcheck: false })
    go.type = 'submit'
    form.addEventListener('submit', event => { event.preventDefault(); onSubmit(input.value) })
    line.append(input, go)
    form.append(name, line)
    parent.append(form)
    return input
}

export function button(parent, { label, onClick, primary = false }) {
    const node = el('button', primary ? 'btn btn-primary' : 'btn', label)
    node.type = 'button'
    node.addEventListener('click', onClick)
    parent.append(node)
    return node
}

/** Wrapping list of small buttons. */
export function chips(parent, items) {
    const list = el('div', 'chips')
    parent.append(list)
    for (const { label, onClick } of items) {
        const node = el('button', 'chip', label)
        node.type = 'button'
        node.addEventListener('click', onClick)
        list.append(node)
    }
}

/** Latitude / longitude fields and a "go" button on one line. */
export function coordinates(parent, { getLat, getLon, onGo }) {
    const form = el('form', 'coords')
    const make = (label, get) => {
        const input = el('input')
        Object.assign(input, { type: 'number', step: 0.0001, title: label })
        input.setAttribute('aria-label', label)
        register(() => { input.value = get().toFixed(5) })
        return input
    }
    const lat = make('Latitude', getLat)
    const lon = make('Longitude', getLon)
    const go  = el('button', 'btn', 'Go')
    go.type = 'submit'
    form.addEventListener('submit', event => { event.preventDefault(); onGo(parseFloat(lat.value), parseFloat(lon.value)) })
    form.append(lat, lon, go)
    parent.append(form)
}

/** Column captions above a legend. */
export function legendHeader(parent, captions) {
    const row = el('div', 'legend-row legend-head')
    row.style.setProperty('--swatches', String(captions.length - 1))
    row.append(el('span', 'legend-name'))
    for (const caption of captions) row.append(el('span', 'legend-caption', caption))
    parent.append(row)
}

/**
 * One legend line: colour swatch(es), name and a visibility checkbox.
 * @param {{ name: string, colors: { title: string, get: Function, set: Function }[], visible: { get: Function, set: Function } }} options
 */
export function legendRow(parent, { name, colors, visible }) {
    const label = name.replace(/_/g, ' ')
    const row   = el('div', 'legend-row')
    row.style.setProperty('--swatches', String(colors.length))
    row.append(el('span', 'legend-name', label))
    for (const { title, get, set } of colors) row.append(swatch(`${label} ${title}`, get, set))

    const checkbox = el('input')
    checkbox.type  = 'checkbox'
    checkbox.setAttribute('aria-label', `Show ${label}`)
    checkbox.addEventListener('change', () => visible.set(checkbox.checked))
    register(() => { checkbox.checked = visible.get() })
    row.append(checkbox)
    parent.append(row)
}
