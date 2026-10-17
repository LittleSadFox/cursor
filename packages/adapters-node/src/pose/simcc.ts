/**
 * Decode RTMPose SimCC heads into keypoint locations and confidences.
 * Matches rtmlib `get_simcc_maximum` (mean of per-axis max responses).
 */
export function decodeSimcc(
  simccX: Float32Array,
  simccY: Float32Array,
  keypointCount: number,
  widthBins: number,
  heightBins: number,
): { xs: Float32Array; ys: Float32Array; scores: Float32Array } {
  const xs = new Float32Array(keypointCount);
  const ys = new Float32Array(keypointCount);
  const scores = new Float32Array(keypointCount);
  for (let k = 0; k < keypointCount; k += 1) {
    let bestX = 0;
    let bestXVal = -Infinity;
    const xBase = k * widthBins;
    for (let i = 0; i < widthBins; i += 1) {
      const value = simccX[xBase + i] ?? -Infinity;
      if (value > bestXVal) {
        bestXVal = value;
        bestX = i;
      }
    }
    let bestY = 0;
    let bestYVal = -Infinity;
    const yBase = k * heightBins;
    for (let i = 0; i < heightBins; i += 1) {
      const value = simccY[yBase + i] ?? -Infinity;
      if (value > bestYVal) {
        bestYVal = value;
        bestY = i;
      }
    }
    const score = 0.5 * (bestXVal + bestYVal);
    if (!(score > 0)) {
      xs[k] = -1;
      ys[k] = -1;
      scores[k] = 0;
      continue;
    }
    xs[k] = bestX;
    ys[k] = bestY;
    scores[k] = score;
  }
  return { xs, ys, scores };
}

/** Scale SimCC bin indices into the pose network's input pixel space. */
export function simccToInputPixels(
  xs: Float32Array,
  ys: Float32Array,
  splitRatio: number,
): { xs: Float32Array; ys: Float32Array } {
  const outX = new Float32Array(xs.length);
  const outY = new Float32Array(ys.length);
  for (let i = 0; i < xs.length; i += 1) {
    outX[i] = (xs[i] ?? 0) / splitRatio;
    outY[i] = (ys[i] ?? 0) / splitRatio;
  }
  return { xs: outX, ys: outY };
}
