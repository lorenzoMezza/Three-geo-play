function perpendicularDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

  if (t < 0) {
    return Math.hypot(px - x1, py - y1);
  } else if (t > 1) {
    return Math.hypot(px - x2, py - y2);
  }

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function simplifyLine(line, epsilon) {
  const n = line.length / 2;
  if (n < 3) return line.slice();

  const stack = [];
  const keptIndices = new Set([0, n - 1]);

  stack.push([0, n - 1]);

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop();

    if (endIndex <= startIndex + 1) continue;

    const x1 = line[2 * startIndex];
    const y1 = line[2 * startIndex + 1];
    const x2 = line[2 * endIndex];
    const y2 = line[2 * endIndex + 1];

    let maxDistance = 0;
    let indexFarthest = -1;

    for (let i = startIndex + 1; i < endIndex; i++) {
      const px = line[2 * i];
      const py = line[2 * i + 1];
      const dist = perpendicularDistance(px, py, x1, y1, x2, y2);
      if (dist > maxDistance) {
        maxDistance = dist;
        indexFarthest = i;
      }
    }

    if (maxDistance > epsilon) {
      keptIndices.add(indexFarthest);
      stack.push([startIndex, indexFarthest]);
      stack.push([indexFarthest, endIndex]);
    }
  }

  const resultIndices = Array.from(keptIndices).sort((a, b) => a - b);
  const result = new Array(resultIndices.length * 2);

  for (let i = 0; i < resultIndices.length; i++) {
    const idx = resultIndices[i];
    result[2 * i] = line[2 * idx];
    result[2 * i + 1] = line[2 * idx + 1];
  }

  return result;
}
