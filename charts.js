/* charts.js — Chart.js rendering helpers for the density plot and the
 * raw-vs-calibrated timeline. Kept separate from app.js state/UI logic. */

const Charts = (() => {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const bigint = parseInt(
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h,
      16
    );
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function toAxisX(calBP, axisMode) {
    return axisMode === 'calendar' ? 1950 - calBP : calBP;
  }

  function formatAxisYear(value, axisMode) {
    if (axisMode !== 'calendar') return Math.round(value).toLocaleString();
    const v = Math.round(value);
    return v <= 0 ? `${1 - v} BC` : `${v} AD`;
  }

  function inAnySegment(calBP, segments) {
    return segments.some((s) => calBP <= s.startBP && calBP >= s.endBP);
  }

  // ---------------- Density chart ----------------

  let densityChart = null;

  function buildDensityDatasets(entries, axisMode) {
    const datasets = [];
    entries.forEach((entry) => {
      if (!entry.visible || !entry.result || entry.result.outOfRange) return;
      const { grid, density, ranges1, ranges2 } = entry.result;
      let points = grid.map((calBP, i) => ({ x: toAxisX(calBP, axisMode), y: density[i], calBP }));
      if (axisMode === 'calendar') points = points.slice().reverse();

      const band2 = points.map((p) => ({ x: p.x, y: inAnySegment(p.calBP, ranges2) ? p.y : 0 }));
      const band1 = points.map((p) => ({ x: p.x, y: inAnySegment(p.calBP, ranges1) ? p.y : 0 }));

      datasets.push({
        label: `${entry.label} — 2σ`,
        data: band2,
        borderWidth: 0,
        backgroundColor: hexToRgba(entry.color, 0.16),
        fill: true,
        pointRadius: 0,
        tension: 0,
        order: 3,
      });
      datasets.push({
        label: `${entry.label} — 1σ`,
        data: band1,
        borderWidth: 0,
        backgroundColor: hexToRgba(entry.color, 0.36),
        fill: true,
        pointRadius: 0,
        tension: 0,
        order: 2,
      });
      datasets.push({
        label: entry.label,
        data: points.map((p) => ({ x: p.x, y: p.y })),
        borderColor: entry.color,
        backgroundColor: 'transparent',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.15,
        order: 1,
      });
    });
    return datasets;
  }

  function buildDensityChart(canvas, entries, axisMode) {
    const ctx = canvas.getContext('2d');
    const textMuted = cssVar('--color-text-muted') || '#766a54';
    const divider = cssVar('--color-divider') || '#e2d6bd';

    if (densityChart) {
      densityChart.destroy();
      densityChart = null;
    }

    densityChart = new Chart(ctx, {
      type: 'line',
      data: { datasets: buildDensityDatasets(entries, axisMode) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            type: 'linear',
            reverse: axisMode === 'bp',
            title: {
              display: true,
              text: axisMode === 'calendar' ? 'Calendar year' : 'cal BP (years before AD 1950)',
              color: textMuted,
              font: { family: "'Inter', sans-serif", size: 11 },
            },
            ticks: {
              color: textMuted,
              font: { family: "'JetBrains Mono', monospace", size: 10 },
              callback: (v) => formatAxisYear(v, axisMode),
            },
            grid: { color: divider },
          },
          y: {
            title: { display: true, text: 'Relative probability', color: textMuted, font: { family: "'Inter', sans-serif", size: 11 } },
            ticks: { display: false },
            grid: { color: divider },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => !item.dataset.label.includes('σ'),
            callbacks: {
              title: (items) => (items[0] ? formatAxisYear(items[0].parsed.x, axisMode) : ''),
              label: (item) => `${item.dataset.label}: ${item.parsed.y.toExponential(2)}`,
            },
          },
        },
      },
    });
    return densityChart;
  }

  function updateDensityChart(canvas, entries, axisMode) {
    return buildDensityChart(canvas, entries, axisMode);
  }

  // ---------------- Range / timeline chart ----------------

  let rangeChart = null;

  function outerBounds(segments) {
    if (!segments || !segments.length) return null;
    const startBP = Math.max(...segments.map((s) => s.startBP));
    const endBP = Math.min(...segments.map((s) => s.endBP));
    return [endBP, startBP]; // ascending numeric for Chart.js floating bar [min,max]
  }

  function buildRangeChart(canvas, entries, axisMode) {
    const ctx = canvas.getContext('2d');
    const visible = entries.filter((e) => e.visible && e.result && !e.result.outOfRange);
    const textMuted = cssVar('--color-text-muted') || '#766a54';
    const divider = cssVar('--color-divider') || '#e2d6bd';
    const faint = cssVar('--color-text-faint') || '#a99c80';

    const labels = visible.map((e) => e.label);

    const rawData = visible.map((e) => {
      const lo = e.bp - e.err;
      const hi = e.bp + e.err;
      const a = toAxisX(lo, axisMode);
      const b = toAxisX(hi, axisMode);
      return [Math.min(a, b), Math.max(a, b)];
    });
    const band2Data = visible.map((e) => {
      const b = outerBounds(e.result.ranges2);
      if (!b) return [0, 0];
      const a0 = toAxisX(b[0], axisMode);
      const a1 = toAxisX(b[1], axisMode);
      return [Math.min(a0, a1), Math.max(a0, a1)];
    });
    const band1Data = visible.map((e) => {
      const b = outerBounds(e.result.ranges1);
      if (!b) return [0, 0];
      const a0 = toAxisX(b[0], axisMode);
      const a1 = toAxisX(b[1], axisMode);
      return [Math.min(a0, a1), Math.max(a0, a1)];
    });
    const colors2 = visible.map((e) => hexToRgba(e.color, 0.32));
    const colors1 = visible.map((e) => e.color);

    if (rangeChart) {
      rangeChart.destroy();
      rangeChart = null;
    }

    const height = Math.max(160, visible.length * 74 + 40);
    canvas.parentElement.style.height = `${height}px`;

    rangeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Raw ¹⁴C age ±1σ (naïve, uncalibrated)',
            data: rawData,
            backgroundColor: hexToRgba(faint, 0.55),
            barThickness: 9,
            borderRadius: 2,
          },
          {
            label: 'Calibrated 2σ range',
            data: band2Data,
            backgroundColor: colors2,
            barThickness: 16,
            borderRadius: 3,
          },
          {
            label: 'Calibrated 1σ range',
            data: band1Data,
            backgroundColor: colors1,
            barThickness: 9,
            borderRadius: 2,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        scales: {
          x: {
            type: 'linear',
            reverse: axisMode === 'bp',
            title: { display: true, text: axisMode === 'calendar' ? 'Calendar year' : 'cal BP', color: textMuted, font: { family: "'Inter', sans-serif", size: 11 } },
            ticks: { color: textMuted, font: { family: "'JetBrains Mono', monospace", size: 10 }, callback: (v) => formatAxisYear(v, axisMode) },
            grid: { color: divider },
          },
          y: {
            ticks: { color: textMuted, font: { family: "'Inter', sans-serif", size: 11 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const [a, b] = item.raw;
                return `${item.dataset.label}: ${formatAxisYear(a, axisMode)} – ${formatAxisYear(b, axisMode)}`;
              },
            },
          },
        },
      },
    });
    return rangeChart;
  }

  return { buildDensityChart, updateDensityChart, buildRangeChart, hexToRgba, formatAxisYear };
})();
