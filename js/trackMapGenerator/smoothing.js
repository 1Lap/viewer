/**
 * Smoothing algorithms for track map data.
 *
 * This module provides smoothing functions to remove noise and sampling
 * artifacts from centerline coordinates and track widths.
 */

/**
 * Apply circular moving average smoothing to an array.
 *
 * For closed-loop tracks, the array wraps around (first element follows last).
 * Each output value is the average of a window of input values centered on that index.
 *
 * @param {Array<number>|Float64Array} values - Input values
 * @param {number} windowSize - Size of averaging window (must be odd for symmetry)
 * @param {boolean} [circular=true] - Treat array as circular (wrap around)
 * @returns {Float64Array} Smoothed values
 */
export function smoothArray(values, windowSize, circular = true) {
  const n = values.length;
  const smoothed = new Float64Array(n);

  if (windowSize < 1) {
    throw new Error('Window size must be at least 1.');
  }

  // Ensure window size is odd for symmetric averaging
  if (windowSize % 2 === 0) {
    windowSize += 1;
  }

  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      let index = i + j;

      if (circular) {
        // Wrap around for circular array
        index = (index + n) % n;
      } else {
        // Clamp to bounds for non-circular array
        if (index < 0 || index >= n) continue;
      }

      sum += values[index];
      count++;
    }

    smoothed[i] = count > 0 ? sum / count : values[i];
  }

  return smoothed;
}

/**
 * Smooth centerline coordinates.
 *
 * Applies moving average to X and Y coordinates independently.
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {number} windowSize - Size of averaging window
 * @param {boolean} [circular=true] - Treat as closed loop
 * @returns {Array<[number, number]>} Smoothed centerline
 */
export function smoothCenterline(centerline, windowSize, circular = true) {
  const n = centerline.length;

  // Extract X and Y coordinates
  const xValues = new Float64Array(n);
  const yValues = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    xValues[i] = centerline[i][0];
    yValues[i] = centerline[i][1];
  }

  // Smooth independently
  const xSmoothed = smoothArray(xValues, windowSize, circular);
  const ySmoothed = smoothArray(yValues, windowSize, circular);

  // Recombine
  const smoothed = [];
  for (let i = 0; i < n; i++) {
    smoothed.push([xSmoothed[i], ySmoothed[i]]);
  }

  return smoothed;
}

/**
 * Smooth track width arrays.
 *
 * Applies moving average to left and right half-widths independently.
 *
 * @param {Float64Array} halfWidthLeft - Left half-widths
 * @param {Float64Array} halfWidthRight - Right half-widths
 * @param {number} windowSize - Size of averaging window
 * @param {boolean} [circular=true] - Treat as closed loop
 * @returns {{halfWidthLeft: Float64Array, halfWidthRight: Float64Array}}
 */
export function smoothWidths(halfWidthLeft, halfWidthRight, windowSize, circular = true) {
  return {
    halfWidthLeft: smoothArray(halfWidthLeft, windowSize, circular),
    halfWidthRight: smoothArray(halfWidthRight, windowSize, circular)
  };
}

/**
 * Apply Gaussian smoothing to an array.
 *
 * Gaussian smoothing uses a weighted average where points closer to the center
 * have more influence than those farther away. This can produce smoother results
 * than simple moving average, especially for curves.
 *
 * @param {Array<number>|Float64Array} values - Input values
 * @param {number} sigma - Standard deviation of Gaussian kernel
 * @param {boolean} [circular=true] - Treat array as circular
 * @returns {Float64Array} Smoothed values
 */
export function gaussianSmooth(values, sigma, circular = true) {
  const n = values.length;
  const smoothed = new Float64Array(n);

  // Determine kernel size (typically ±3σ captures 99.7% of the distribution)
  const kernelRadius = Math.ceil(3 * sigma);

  // Precompute Gaussian weights
  const weights = [];
  let weightSum = 0;

  for (let j = -kernelRadius; j <= kernelRadius; j++) {
    const weight = Math.exp(-(j * j) / (2 * sigma * sigma));
    weights.push(weight);
    weightSum += weight;
  }

  // Normalize weights to sum to 1
  for (let i = 0; i < weights.length; i++) {
    weights[i] /= weightSum;
  }

  // Apply convolution
  for (let i = 0; i < n; i++) {
    let sum = 0;

    for (let j = -kernelRadius; j <= kernelRadius; j++) {
      let index = i + j;

      if (circular) {
        index = (index + n) % n;
      } else {
        if (index < 0 || index >= n) continue;
      }

      const weightIndex = j + kernelRadius;
      sum += values[index] * weights[weightIndex];
    }

    smoothed[i] = sum;
  }

  return smoothed;
}

/**
 * Smooth centerline using Gaussian smoothing.
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {number} sigma - Standard deviation of Gaussian kernel
 * @param {boolean} [circular=true] - Treat as closed loop
 * @returns {Array<[number, number]>} Smoothed centerline
 */
export function gaussianSmoothCenterline(centerline, sigma, circular = true) {
  const n = centerline.length;

  const xValues = new Float64Array(n);
  const yValues = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    xValues[i] = centerline[i][0];
    yValues[i] = centerline[i][1];
  }

  const xSmoothed = gaussianSmooth(xValues, sigma, circular);
  const ySmoothed = gaussianSmooth(yValues, sigma, circular);

  const smoothed = [];
  for (let i = 0; i < n; i++) {
    smoothed.push([xSmoothed[i], ySmoothed[i]]);
  }

  return smoothed;
}
