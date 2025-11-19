const state = {
  leftLap: null,
  rightLap: null,
  sampleCount: 1200,
  smoothingWindow: 1,
  swapSides: false,
  showMarkers: false
};

const elements = {
  leftFile: document.getElementById('leftFile'),
  rightFile: document.getElementById('rightFile'),
  sampleCount: document.getElementById('sampleCount'),
  smoothWindow: document.getElementById('smoothWindow'),
  swapSides: document.getElementById('swapSides'),
  showMarkers: document.getElementById('showMarkers'),
  downloadBtn: document.getElementById('downloadBtn'),
  viewPreviewBtn: document.getElementById('viewPreviewBtn'),
  clearBtn: document.getElementById('clearBtn'),
  canvas: document.getElementById('trackCanvas'),
  stats: document.getElementById('stats'),
  message: document.getElementById('message')
};

let currentRender = null;

elements.leftFile.addEventListener('change', (event) => handleFileSelect(event, 'left'));
elements.rightFile.addEventListener('change', (event) => handleFileSelect(event, 'right'));

elements.sampleCount.addEventListener('input', () => {
  state.sampleCount = clampNumber(Number(elements.sampleCount.value), 200, 20000) || 1200;
  render();
});

elements.smoothWindow.addEventListener('input', () => {
  const value = Number(elements.smoothWindow.value);
  const normalized = value % 2 === 0 ? value + 1 : value;
  state.smoothingWindow = normalized;
  if (normalized !== value) {
    elements.smoothWindow.value = String(normalized);
  }
  render();
});

elements.swapSides.addEventListener('change', () => {
  state.swapSides = elements.swapSides.checked;
  render();
});

elements.showMarkers.addEventListener('change', () => {
  state.showMarkers = elements.showMarkers.checked;
  render();
});

function toJsonBlob(data) {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

elements.downloadBtn.addEventListener('click', () => {
  if (!currentRender) return;
  const blob = toJsonBlob(currentRender);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'simple-track-map-preview.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

elements.viewPreviewBtn.addEventListener('click', () => {
  if (!currentRender) return;
  try {
    localStorage.setItem('trackMapPreview', JSON.stringify(currentRender));
    elements.message.textContent = 'Loaded preview JSON into localStorage (trackMapPreview).';
    const target = './track-map-preview.html';
    if (window.location.protocol === 'file:') {
      window.location.href = target;
    } else {
      window.open(target, '_blank', 'noopener');
    }
  } catch (error) {
    elements.message.textContent = `Unable to save preview JSON: ${error.message}`;
  }
});

elements.clearBtn.addEventListener('click', () => {
  state.leftLap = null;
  state.rightLap = null;
  elements.leftFile.value = '';
  elements.rightFile.value = '';
  state.sampleCount = 1200;
  elements.sampleCount.value = '1200';
  state.smoothingWindow = 1;
  elements.smoothWindow.value = '1';
  state.swapSides = false;
  elements.swapSides.checked = false;
  state.showMarkers = false;
  elements.showMarkers.checked = false;
  elements.message.textContent = '';
  currentRender = null;
  render();
});

async function handleFileSelect(event, side) {
  const file = event.target.files?.[0];
  if (!file) {
    state[`${side}Lap`] = null;
    render();
    return;
  }
  try {
    elements.message.textContent = `Loading ${file.name}…`;
    const text = await file.text();
    const lap = parseLapCsv(text, file.name);
    state[`${side}Lap`] = lap;
    elements.message.textContent = `${file.name} loaded (${lap.samples.length} samples)`;
    render();
  } catch (error) {
    state[`${side}Lap`] = null;
    elements.message.textContent = `Failed to parse ${file?.name ?? ''}: ${error.message}`;
    render();
  }
}

function parseLapCsv(text, filename = '') {
  const delimiter = guessDelimiter(text);
  const lines = text.split(/\r?\n/);
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('lapdistance')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    throw new Error('LapDistance header not found');
  }
  const headerParts = splitLine(lines[headerIndex], delimiter);
  const norm = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

  const idxDistance = headerParts.findIndex((label) => norm(label).includes('lapdistance'));
  const idxX = headerParts.findIndex((label) => {
    const tag = norm(label);
    return tag === 'xm' || tag === 'x' || tag.endsWith('posx');
  });
  const idxY = headerParts.findIndex((label) => {
    const tag = norm(label);
    return tag === 'ym' || tag === 'y' || tag.endsWith('posy');
  });
  const idxZ = headerParts.findIndex((label) => {
    const tag = norm(label);
    return tag === 'zm' || tag === 'z' || tag.endsWith('posz');
  });

  if (idxDistance === -1 || idxX === -1 || (idxY === -1 && idxZ === -1)) {
    throw new Error('Required columns (LapDistance, X, Y/Z) not found');
  }

  const samples = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const parts = splitLine(raw, delimiter);
    if (parts.length <= Math.max(idxDistance, idxX, idxY, idxZ)) continue;
    const distance = Number(parts[idxDistance]);
    const x = Number(parts[idxX]);
    const yVal = idxY >= 0 ? Number(parts[idxY]) : null;
    const zVal = idxZ >= 0 ? Number(parts[idxZ]) : null;
    if (!Number.isFinite(distance) || !Number.isFinite(x)) continue;
    const y = Number.isFinite(zVal) ? zVal : Number.isFinite(yVal) ? yVal : null;
    if (!Number.isFinite(y)) continue;
    samples.push({ distance, x, y });
  }

  if (samples.length < 4) {
    throw new Error('Not enough spatial samples to plot');
  }

  return {
    filename,
    samples
  };
}

function guessDelimiter(text) {
  const comma = (text.match(/,/g) || []).length;
  const semi = (text.match(/;/g) || []).length;
  return semi > comma ? ';' : ',';
}

function splitLine(line, delimiter) {
  return line
    .split(delimiter)
    .map((part) => part.replace(/\0/g, '').trim())
    .filter((part, idx, arr) => !(idx === arr.length - 1 && part === ''));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function resamplePath(samples, sampleCount) {
  const points = [...samples].sort((a, b) => a.distance - b.distance);
  const start = points[0].distance;
  const end = points[points.length - 1].distance;
  const span = Math.max(end - start, 1);
  const resampled = [];
  let cursor = 0;
  for (let i = 0; i < sampleCount; i++) {
    const target = start + (span * i) / Math.max(sampleCount - 1, 1);
    while (cursor < points.length - 2 && points[cursor + 1].distance < target) {
      cursor++;
    }
    const a = points[cursor];
    const b = points[Math.min(points.length - 1, cursor + 1)];
    const range = Math.max(b.distance - a.distance, 1e-6);
    const t = clampNumber((target - a.distance) / range, 0, 1);
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    resampled.push({ x, y });
  }
  return resampled;
}

function lerp(a, b, t) {
  return a + (b - a) * (t ?? 0);
}

function smoothPath(points, windowSize) {
  if (windowSize <= 1) return points;
  const n = points.length;
  const half = Math.floor(windowSize / 2);
  const smoothed = [];
  for (let i = 0; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = (i + j + n) % n;
      sumX += points[idx].x;
      sumY += points[idx].y;
      count++;
    }
    smoothed.push({ x: sumX / count, y: sumY / count });
  }
  return smoothed;
}

function computePathLength(points) {
  if (!points || points.length < 2) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  return length;
}

function render() {
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  const sampleCount = state.sampleCount;
  const smoothingWindow = Math.max(1, state.smoothingWindow);
  const hasLeft = Boolean(state.leftLap);
  const hasRight = Boolean(state.rightLap);

  if (!hasLeft && !hasRight) {
    elements.stats.textContent = 'Drop at least one CSV to get started.';
    elements.downloadBtn.disabled = true;
    elements.viewPreviewBtn.disabled = true;
    currentRender = null;
    return;
  }

  const leftPath = hasLeft
    ? smoothPath(resamplePath(state.leftLap.samples, sampleCount), smoothingWindow)
    : null;
  const rightPath = hasRight
    ? smoothPath(resamplePath(state.rightLap.samples, sampleCount), smoothingWindow)
    : null;

  let displayLeft = leftPath;
  let displayRight = rightPath;
  if (state.swapSides) {
    displayLeft = rightPath;
    displayRight = leftPath;
  }

  const centerPath = computeCenterPath(displayLeft, displayRight) || displayLeft || displayRight;

  const bounds = computeBounds([displayLeft, displayRight, centerPath].filter(Boolean));
  drawBackground(ctx, bounds);
  if (displayLeft) drawPath(ctx, displayLeft, bounds, '#f87171', state.showMarkers);
  if (displayRight) drawPath(ctx, displayRight, bounds, '#38bdf8', state.showMarkers);
  if (centerPath) drawPath(ctx, centerPath, bounds, '#cbd5f5', false, 2, [6, 6]);

  const statsText = formatStats({
    sampleCount,
    smoothingWindow,
    leftPath: displayLeft,
    rightPath: displayRight,
    leftSource: state.leftLap?.filename,
    rightSource: state.rightLap?.filename
  });
  elements.stats.textContent = statsText;

  currentRender = {
    left: displayLeft,
    right: displayRight,
    center: centerPath,
    meta: {
      sampleCount,
      smoothingWindow,
      leftSource: state.leftLap?.filename || null,
      rightSource: state.rightLap?.filename || null
    }
  };
  elements.downloadBtn.disabled = false;
  elements.viewPreviewBtn.disabled = false;
}

function computeCenterPath(left, right) {
  if (left && right && left.length === right.length) {
    return left.map((point, idx) => ({
      x: (point.x + right[idx].x) / 2,
      y: (point.y + right[idx].y) / 2
    }));
  }
  return null;
}

function computeBounds(paths) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const point of path) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = -1;
    maxX = 1;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = -1;
    maxY = 1;
  }
  const paddingX = (maxX - minX) * 0.05 || 1;
  const paddingY = (maxY - minY) * 0.05 || 1;
  return {
    minX: minX - paddingX,
    maxX: maxX + paddingX,
    minY: minY - paddingY,
    maxY: maxY + paddingY
  };
}

function drawBackground(ctx, bounds) {
  ctx.save();
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(32, 32, ctx.canvas.width - 64, ctx.canvas.height - 64);
  ctx.restore();
}

function project(point, bounds, canvas) {
  const { minX, maxX, minY, maxY } = bounds;
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const scale = Math.min((canvas.width - 64) / width, (canvas.height - 64) / height);
  const offsetX = (canvas.width - width * scale) / 2;
  const offsetY = (canvas.height - height * scale) / 2;
  return {
    x: offsetX + (point.x - minX) * scale,
    y: canvas.height - (offsetY + (point.y - minY) * scale)
  };
}

function drawPath(ctx, path, bounds, color, showMarkers, lineWidth = 3, dash = []) {
  if (!path || !path.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const first = project(path[0], bounds, ctx.canvas);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < path.length; i++) {
    const point = project(path[i], bounds, ctx.canvas);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.stroke();
  if (showMarkers) {
    ctx.fillStyle = color;
    for (let i = 0; i < path.length; i += Math.max(1, Math.floor(path.length / 200))) {
      const point = project(path[i], bounds, ctx.canvas);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function formatStats({
  sampleCount,
  smoothingWindow,
  leftPath,
  rightPath,
  leftSource,
  rightSource
}) {
  const lines = [];
  lines.push(`Sample count: ${sampleCount}`);
  lines.push(`Smoothing window: ${smoothingWindow}`);
  if (leftPath) {
    lines.push(
      `Left lap (${leftSource || 'n/a'}): length ≈ ${computePathLength(leftPath).toFixed(1)} m`
    );
  }
  if (rightPath) {
    lines.push(
      `Right lap (${rightSource || 'n/a'}): length ≈ ${computePathLength(rightPath).toFixed(1)} m`
    );
  }
  if (leftPath && rightPath && leftPath.length === rightPath.length) {
    const widths = leftPath.map((point, idx) =>
      Math.hypot(point.x - rightPath[idx].x, point.y - rightPath[idx].y)
    );
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    const avgWidth = widths.reduce((sum, value) => sum + value, 0) / widths.length;
    const narrowSections = widths
      .map((value, idx) => ({ value, idx }))
      .filter(({ value }) => value < 3)
      .slice(0, 5)
      .map(({ idx, value }) => `    • Sample ${idx}: ${value.toFixed(2)} m`)
      .join('\n');
    lines.push(
      `Width stats: min ${minWidth.toFixed(2)} m / avg ${avgWidth.toFixed(2)} m / max ${maxWidth.toFixed(2)} m`
    );
    if (narrowSections) {
      lines.push('Narrow (<3 m) samples:');
      lines.push(narrowSections);
    }
  } else {
    lines.push('Width stats: provide both left and right laps to compare.');
  }
  return lines.join('\n');
}

render();
