/**
 * Growable Float32Array used to accumulate vertex positions without the
 * memory and GC overhead of plain JS number arrays.
 */
export class FloatArrayBuilder {

    /** @type {Float32Array} */
    array;

    /** @type {number} */
    length = 0;

    constructor(initialCapacity = 4096) {
        this.array = new Float32Array(initialCapacity);
    }

    /**
     * Ensures room for `count` more values.
     * @param {number} count
     */
    reserve(count) {
        const needed = this.length + count;
        if (needed <= this.array.length) return;
        let capacity = this.array.length * 2;
        while (capacity < needed) capacity *= 2;
        const next = new Float32Array(capacity);
        next.set(this.array.subarray(0, this.length));
        this.array = next;
    }

    /**
     * Appends three values (one XYZ vertex, normal or colour).
     */
    push3(a, b, c) {
        this.reserve(3);
        const array = this.array;
        const i     = this.length;
        array[i] = a; array[i + 1] = b; array[i + 2] = c;
        this.length = i + 3;
    }

    /**
     * Appends one triangle (three XYZ vertices).
     */
    pushTriangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
        this.reserve(9);
        const a = this.array;
        let i   = this.length;
        a[i++] = ax; a[i++] = ay; a[i++] = az;
        a[i++] = bx; a[i++] = by; a[i++] = bz;
        a[i++] = cx; a[i++] = cy; a[i++] = cz;
        this.length = i;
    }

    /**
     * Returns a tightly sized copy of the accumulated values.
     * @returns {Float32Array}
     */
    toFloat32Array() {
        return this.array.slice(0, this.length);
    }
}
