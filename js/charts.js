(function (app) {
  let setCursorDistance = () => {};
  let setViewWindow = () => {};

  function initCharts(deps) {
    setCursorDistance = deps.setCursorDistance;
    setViewWindow = deps.setViewWindow;
    if (!window.Chart) {
      console.warn('Chart.js not loaded');
      return;
    }

    Chart.register({
      id: 'sharedCursor',
      afterDatasetsDraw(chart) {
        const state = app.state;
        if (!state || state.cursorDistance == null) return;
        const xScale = chart.scales.x;
        if (!xScale) return;
        const xPixel = xScale.getPixelForValue(state.cursorDistance);
        if (Number.isNaN(xPixel)) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = '#11182733';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xPixel, chart.chartArea.top);
        ctx.lineTo(xPixel, chart.chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function updateLaneData() {
    const state = app.state;
    const visibleLaps = state.laps.filter((lap) => state.lapVisibility.has(lap.id));

    const throttleChart = ensureChart('throttle', 'throttleLane');
    throttleChart.data.datasets = visibleLaps.map((lap) => ({
      label: app.formatLapLabel(lap),
      borderColor: app.getLapColor(lap.id),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      data: lap.samples.filter((s) => s.throttle != null).map((s) => ({ x: s.distance, y: s.throttle }))
    }));
    applyWindowToChart(throttleChart);

    const brakeChart = ensureChart('brake', 'brakeLane');
    brakeChart.data.datasets = visibleLaps.map((lap) => ({
      label: app.formatLapLabel(lap),
      borderColor: app.getLapColor(lap.id),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      data: lap.samples.filter((s) => s.brake != null).map((s) => ({ x: s.distance, y: s.brake }))
    }));
    applyWindowToChart(brakeChart);
  }

  function applyWindowToCharts() {
    Object.values(app.state.charts).forEach((chart) => chart && applyWindowToChart(chart));
  }

  function refreshCharts() {
    Object.values(app.state.charts).forEach((chart) => chart && chart.update('none'));
  }

  function ensureChart(key, canvasId) {
    const state = app.state;
    if (state.charts[key]) return state.charts[key];
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      throw new Error(`Canvas ${canvasId} not found`);
    }
    const ctx = canvas.getContext('2d');
    const overlay = document.createElement('div');
    overlay.className = 'lane-selection';
    ctx.canvas.parentElement.appendChild(overlay);

    const chart = new Chart(ctx, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Distance (m)' }, grid: { color: '#eef1f6' } },
          y: { beginAtZero: true, suggestedMax: 100, title: { display: true, text: '% input' }, grid: { color: '#eef1f6' } }
        },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: { enabled: true }
        }
      }
    });

    const pointerState = { active: false, start: null, end: null };

    function getXValueFromEvent(event) {
      const rect = chart.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const xScale = chart.scales.x;
      if (!xScale) return null;
      const value = xScale.getValueForPixel(x);
      return Number.isFinite(value) ? value : null;
    }

    chart.canvas.addEventListener('mousemove', (event) => {
      const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: false }, true);
      const xValue = getXValueFromEvent(event);
      if (points.length) {
        const first = points[0];
        const point = chart.data.datasets[first.datasetIndex].data[first.index];
        setCursorDistance(point.x);
      } else if (xValue != null) {
        setCursorDistance(xValue);
      } else {
        setCursorDistance(null);
      }

      if (pointerState.active && xValue != null) {
        pointerState.end = xValue;
        setOverlayRange(chart, pointerState.start, pointerState.end, 0.4);
      }
    });

    chart.canvas.addEventListener('mouseleave', () => {
      setCursorDistance(null);
      if (!pointerState.active) {
        syncLaneSelectionOverlay(chart);
      }
    });

    chart.canvas.addEventListener('pointerdown', (event) => {
      const xValue = getXValueFromEvent(event);
      if (xValue == null) return;
      chart.canvas.setPointerCapture(event.pointerId);
      pointerState.active = true;
      pointerState.start = xValue;
      pointerState.end = xValue;
      setOverlayRange(chart, pointerState.start, pointerState.end, 0.5);
      setCursorDistance(xValue);
    });

    chart.canvas.addEventListener('pointermove', (event) => {
      if (!pointerState.active) return;
      const xValue = getXValueFromEvent(event);
      if (xValue == null) return;
      pointerState.end = xValue;
      setOverlayRange(chart, pointerState.start, pointerState.end, 0.5);
    });

    function endLaneDrag(event) {
      if (!pointerState.active) return;
      const xValue = getXValueFromEvent(event);
      if (xValue != null) {
        pointerState.end = xValue;
      }
      pointerState.active = false;
      try { chart.canvas.releasePointerCapture(event.pointerId); } catch (_) {}
      syncLaneSelectionOverlay(chart);
      if (pointerState.start != null && pointerState.end != null) {
        const lap = app.getActiveLap();
        if (lap) {
          let start = Math.min(pointerState.start, pointerState.end);
          let end = Math.max(pointerState.start, pointerState.end);
          if (Math.abs(end - start) < 0.5) {
            const center = (start + end) / 2;
            start = center - 0.25;
            end = center + 0.25;
          }
          setViewWindow(lap, start, end);
        }
      }
      pointerState.start = null;
      pointerState.end = null;
    }

    chart.canvas.addEventListener('pointerup', endLaneDrag);
    chart.canvas.addEventListener('pointerleave', endLaneDrag);

    chart._selectionOverlay = overlay;
    state.charts[key] = chart;
    return chart;
  }

  function setOverlayRange(chart, startValue, endValue, opacity = 0.25) {
    const overlay = chart?._selectionOverlay;
    if (!overlay) return;
    if (startValue == null || endValue == null) {
      overlay.style.opacity = 0;
      return;
    }
    const xScale = chart.scales.x;
    if (!xScale) {
      overlay.style.opacity = 0;
      return;
    }
    const left = xScale.getPixelForValue(startValue);
    const right = xScale.getPixelForValue(endValue);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      overlay.style.opacity = 0;
      return;
    }
    overlay.style.opacity = opacity;
    overlay.style.left = `${Math.min(left, right)}px`;
    overlay.style.width = `${Math.max(2, Math.abs(right - left))}px`;
  }

  function syncLaneSelectionOverlay(chart) {
    const lap = app.getActiveLap();
    const state = app.state;
    if (!lap || !state.viewWindow) {
      setOverlayRange(chart, null, null);
      return;
    }
    setOverlayRange(chart, state.viewWindow.start, state.viewWindow.end, 0.2);
  }

  function applyWindowToChart(chart) {
    if (!chart) return;
    const lap = app.getActiveLap();
    const state = app.state;
    if (!lap) {
      chart.update('none');
      return;
    }
    const start = state.viewWindow?.start ?? lap.samples[0].distance;
    const end = state.viewWindow?.end ?? lap.samples[lap.samples.length - 1].distance;
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update('none');
    syncLaneSelectionOverlay(chart);
  }

  app.initCharts = initCharts;
  app.updateLaneData = updateLaneData;
  app.applyWindowToCharts = applyWindowToCharts;
  app.refreshCharts = refreshCharts;
})(window.LMUApp = window.LMUApp || {});
