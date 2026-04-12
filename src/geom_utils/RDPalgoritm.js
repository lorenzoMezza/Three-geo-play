function segmentDistanceSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let x = x1;
  let y = y1;

  if (dx !== 0 || dy !== 0) {
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = x2;
      y = y2;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  const ex = px - x;
  const ey = py - y;
  return ex * ex + ey * ey;
}

/**
 * Ramer–Douglas–Peucker simplification of a flat `[x0, y0, x1, y1, …]` polyline.
 * Returns the input itself when there is nothing to simplify.
 *
 * @param {number[]} line
 * @param {number} epsilon - Maximum allowed deviation, in the line's units.
 * @returns {number[]}
 */
export function simplifyLine(line, epsilon) {
  const n = line.length >> 1;
  if (n < 3) return line;

  const epsilonSq = epsilon * epsilon;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  let kept = 2;

  const stack = [0, n - 1];
  while (stack.length > 0) {
    const endIndex = stack.pop();
    const startIndex = stack.pop();
    if (endIndex <= startIndex + 1) continue;

    const x1 = line[2 * startIndex];
    const y1 = line[2 * startIndex + 1];
    const x2 = line[2 * endIndex];
    const y2 = line[2 * endIndex + 1];

    let maxDistanceSq = 0;
    let indexFarthest = -1;
    for (let i = startIndex + 1; i < endIndex; i++) {
      const d = segmentDistanceSq(line[2 * i], line[2 * i + 1], x1, y1, x2, y2);
      if (d > maxDistanceSq) {
        maxDistanceSq = d;
        indexFarthest = i;
      }
    }

    if (maxDistanceSq > epsilonSq) {
      keep[indexFarthest] = 1;
      kept++;
      stack.push(startIndex, indexFarthest, indexFarthest, endIndex);
    }
  }

  if (kept === n) return line;

  const result = new Array(kept * 2);
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      result[j++] = line[2 * i];
      result[j++] = line[2 * i + 1];
    }
  }
  return result;
}
