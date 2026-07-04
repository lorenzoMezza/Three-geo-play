let lastStamp = 0;

/**
 * Returns a new, strictly increasing change stamp.
 *
 * Every style object records the stamp of its latest change; containers report
 * the maximum stamp of their children. Because stamps never repeat, comparing a
 * container's stamp with a previously seen one reliably tells whether anything
 * inside it changed — even when whole layers are swapped.
 *
 * @returns {number}
 * @private
 */
export function nextStyleStamp() {
    return ++lastStamp;
}
