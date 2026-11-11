/** Keys the games use that would otherwise scroll the page. */
const CAPTURED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

const isTyping = event => /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName ?? '')

/** Keyboard state of the games: keys held down and one-shot presses. */
export class Keys {

    /** Keys are only read while a game runs. */
    enabled = false

    #down    = new Set()
    #pressed = new Set()

    constructor() {
        window.addEventListener('keydown', event => {
            if (!this.enabled || isTyping(event)) return
            if (CAPTURED.has(event.code)) event.preventDefault()
            if (!this.#down.has(event.code)) this.#pressed.add(event.code)
            this.#down.add(event.code)
        })
        window.addEventListener('keyup', event => { this.#down.delete(event.code) })
        window.addEventListener('blur', () => this.clear())
    }

    /** Whether any of the keys is held down. */
    held(...codes) {
        return codes.some(code => this.#down.has(code))
    }

    /** -1, 0 or 1 from two sets of keys. */
    axis(negative, positive) {
        return (this.held(...positive) ? 1 : 0) - (this.held(...negative) ? 1 : 0)
    }

    /** True once per key press. */
    pressed(code) {
        const pressed = this.#pressed.has(code)
        this.#pressed.delete(code)
        return pressed
    }

    clear() {
        this.#down.clear()
        this.#pressed.clear()
    }
}
