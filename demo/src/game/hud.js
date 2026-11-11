/**
 * Overlay of the games: title, live stats, controls, big messages and a
 * direction arrow. The elements live in index.html.
 */
export class Hud {

    #root    = document.getElementById('hud')
    #title   = document.getElementById('hud-title')
    #stats   = document.getElementById('hud-stats')
    #help    = document.getElementById('hud-help')
    #message = document.getElementById('hud-message')
    #arrow   = document.getElementById('hud-arrow')
    #timer   = null

    /** @param {{ title: string, help: string[] }} options */
    show({ title, help }) {
        this.#title.textContent = title
        this.#help.replaceChildren(...help.map(line => Object.assign(document.createElement('li'), { textContent: line })))
        this.#stats.textContent = ''
        this.#root.hidden = false
        this.arrow(null)
    }

    hide() {
        this.#root.hidden = true
        this.#message.classList.remove('shown')
    }

    /** @param {string} text */
    stats(text) {
        if (this.#stats.textContent !== text) this.#stats.textContent = text
    }

    /** A short message in the middle of the screen. */
    flash(text, seconds = 1.6) {
        this.#message.textContent = text
        this.#message.classList.add('shown')
        clearTimeout(this.#timer)
        this.#timer = setTimeout(() => this.#message.classList.remove('shown'), seconds * 1000)
    }

    /** Points the arrow (radians, clockwise, 0 = straight ahead); `null` hides it. */
    arrow(angle) {
        this.#arrow.hidden = angle === null
        if (angle !== null) this.#arrow.style.transform = `rotate(${angle}rad)`
    }
}
