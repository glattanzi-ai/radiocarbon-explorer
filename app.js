/* app.js — UI wiring, state, and rendering for the Radiocarbon Calibration Explorer. */

(function () {
  const CAT_COLORS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'];

  const DELTA_R_PRESETS = [
    { value: 'custom', label: 'Custom / global average (ΔR = 0)', dr: 0, err: 0, region: 'Global average (built into Marine20)' },
    { value: 'potomac', label: 'Potomac River, MD (Rick et al. 2012)', dr: 148, err: 46, region: 'Potomac River, Maryland' },
    { value: 'chesW', label: 'Chesapeake Bay, Western Shore (Rick et al. 2012)', dr: 129, err: 22, region: 'Chesapeake Bay — Western Shore' },
    { value: 'chesE', label: 'Chesapeake Bay, Eastern Shore (Rick et al. 2012)', dr: -88, err: 23, region: 'Chesapeake Bay — Eastern Shore' },
    { value: 'atlN', label: 'Mid-Atlantic outer coast, north (Rick et al. 2012)', dr: 106, err: 46, region: 'Outer Atlantic Coast — Delmarva/NJ' },
    { value: 'atlS', label: 'Mid-Atlantic outer coast, south (Rick et al. 2012)', dr: 2, err: 46, region: 'Outer Atlantic Coast — Virginia' },
  ];

  const state = {
    curves: null,
    entries: [],
    nextId: 1,
    axisMode: 'bp',
  };

  const el = (id) => document.getElementById(id);

  function catColor(index) {
    const varName = CAT_COLORS[index % CAT_COLORS.length];
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // ---------------- Entry management ----------------

  function computeEntry(partial) {
    const curveData = state.curves[partial.curveKey];
    const result = Calib.calibrate({
      bp: partial.bp,
      err: partial.err,
      curve: curveData,
      deltaR: partial.curveKey === 'marine20' ? partial.deltaR : 0,
      deltaRErr: partial.curveKey === 'marine20' ? partial.deltaRErr : 0,
    });
    return { ...partial, result };
  }

  function addEntry(partial) {
    const index = state.entries.length;
    const entry = computeEntry({
      id: state.nextId++,
      label: partial.label,
      bp: partial.bp,
      err: partial.err,
      curveKey: partial.curveKey,
      deltaR: partial.deltaR || 0,
      deltaRErr: partial.deltaRErr || 0,
      color: catColor(index),
      visible: true,
    });
    state.entries.push(entry);
    renderAll();
  }

  function removeEntry(id) {
    state.entries = state.entries.filter((e) => e.id !== id);
    // reassign colors so palette stays contiguous
    state.entries.forEach((e, i) => (e.color = catColor(i)));
    renderAll();
  }

  function toggleVisible(id) {
    const e = state.entries.find((e) => e.id === id);
    if (e) e.visible = !e.visible;
    renderAll();
  }

  function clearAll() {
    state.entries = [];
    renderAll();
  }

  // ---------------- Rendering ----------------

  function renderCiteRow() {
    const row = el('citeRow');
    row.innerHTML = '';
    Object.entries(Curves.meta).forEach(([key, m]) => {
      const chip = document.createElement('span');
      chip.className = 'cite-chip';
      chip.innerHTML = `<span class="swatch" style="background:${m.color}"></span><a href="${m.url}" target="_blank" rel="noopener noreferrer">${m.full} — ${m.citation}</a>`;
      row.appendChild(chip);
    });
  }

  function renderDeltaRPresets() {
    const sel = el('deltaRPreset');
    sel.innerHTML = '';
    DELTA_R_PRESETS.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.label;
      sel.appendChild(opt);
    });

    const body = el('deltarRefBody');
    body.innerHTML = '';
    DELTA_R_PRESETS.filter((p) => p.value !== 'custom').forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="region">${p.region}</td><td>${p.dr > 0 ? '+' : ''}${p.dr}</td><td>±${p.err}</td><td><button type="button" class="use-btn" data-preset="${p.value}">Use</button></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        el('curveSel').value = 'marine20';
        toggleDeltaRBlock();
        el('deltaRPreset').value = btn.dataset.preset;
        applyPreset(btn.dataset.preset);
        window.scrollTo({ top: el('inputSection').offsetTop - 90, behavior: 'smooth' });
      });
    });
  }

  function applyPreset(value) {
    const p = DELTA_R_PRESETS.find((p) => p.value === value);
    if (!p) return;
    el('deltaRVal').value = p.dr;
    el('deltaRErr').value = p.err;
  }

  function toggleDeltaRBlock() {
    const isMarine = el('curveSel').value === 'marine20';
    el('deltaRBlock').classList.toggle('visible', isMarine);
  }

  function renderTable() {
    const body = el('compareBody');
    const empty = el('emptyState');
    body.innerHTML = '';
    if (!state.entries.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    state.entries.forEach((e) => {
      const tr = document.createElement('tr');
      if (!e.visible) tr.classList.add('dimmed');
      const meta = Curves.meta[e.curveKey];
      const r = e.result;

      let medianCell = '—';
      let r1Cell = '—';
      let r2Cell = '—';
      if (r && !r.outOfRange) {
        medianCell = Calib.formatCalendar(r.median);
        r1Cell = r.ranges1.map((s) => `${Calib.formatRangeCalendar(s)} <span class="range-2">(${(s.prob * 100).toFixed(1)}%)</span>`).join('<br/>');
        r2Cell = r.ranges2.map((s) => `${Calib.formatRangeCalendar(s)} <span class="range-2">(${(s.prob * 100).toFixed(1)}%)</span>`).join('<br/>');
      } else if (r && r.outOfRange) {
        r1Cell = 'Outside curve range';
        r2Cell = 'Outside curve range';
      }

      tr.innerHTML = `
        <td><span class="row-swatch"><span class="dot" style="background:${e.color}"></span></span></td>
        <td>
          <div class="row-label">${escapeHtml(e.label)}</div>
        </td>
        <td><span class="curve-badge">${meta.label}</span></td>
        <td class="range-cell">${e.bp.toLocaleString()} ± ${e.err} BP</td>
        <td class="range-cell">${e.curveKey === 'marine20' ? `${e.deltaR >= 0 ? '+' : ''}${e.deltaR} ± ${e.deltaRErr}` : '—'}</td>
        <td class="range-cell">${medianCell}</td>
        <td class="range-cell"><span class="range-1">${r1Cell}</span></td>
        <td class="range-cell"><span class="range-2">${r2Cell}</span></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="toggle" data-id="${e.id}" title="${e.visible ? 'Hide' : 'Show'} on charts" aria-label="${e.visible ? 'Hide' : 'Show'} ${escapeHtml(e.label)}">
              ${e.visible ? eyeIcon() : eyeOffIcon()}
            </button>
            <button class="icon-btn" data-action="remove" data-id="${e.id}" title="Remove" aria-label="Remove ${escapeHtml(e.label)}">${trashIcon()}</button>
          </div>
        </td>
      `;
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-action="toggle"]').forEach((b) => b.addEventListener('click', () => toggleVisible(Number(b.dataset.id))));
    body.querySelectorAll('[data-action="remove"]').forEach((b) => b.addEventListener('click', () => removeEntry(Number(b.dataset.id))));
  }

  function renderDensityLegend() {
    const legend = el('densityLegend');
    legend.innerHTML = '';
    state.entries
      .filter((e) => e.visible)
      .forEach((e) => {
        const item = document.createElement('span');
        item.className = 'legend-item';
        item.innerHTML = `<span class="legend-swatch" style="background:${e.color}"></span>${escapeHtml(e.label)}`;
        legend.appendChild(item);
      });
    if (!legend.children.length) {
      legend.innerHTML = '<span class="legend-item">No dates selected — add or show a date to plot its distribution.</span>';
    }
  }

  function renderCharts() {
    Charts.buildDensityChart(el('densityChart'), state.entries, state.axisMode);
    Charts.buildRangeChart(el('rangeChart'), state.entries, state.axisMode);
  }

  function renderAll() {
    renderTable();
    renderDensityLegend();
    renderCharts();
  }

  // ---------------- Icons ----------------
  function eyeIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  function eyeOffIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  }
  function trashIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------------- Form handling ----------------

  function wireForm() {
    el('curveSel').addEventListener('change', () => {
      toggleDeltaRBlock();
    });
    el('deltaRPreset').addEventListener('change', (ev) => applyPreset(ev.target.value));

    el('dateForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const labId = el('labId').value.trim() || `Sample ${state.nextId}`;
      const bp = parseFloat(el('bpVal').value);
      const err = parseFloat(el('bpErr').value);
      const curveKey = el('curveSel').value;
      const deltaR = parseFloat(el('deltaRVal').value) || 0;
      const deltaRErr = parseFloat(el('deltaRErr').value) || 0;

      if (!Number.isFinite(bp) || !Number.isFinite(err) || err < 0 || bp < 0) {
        el('bpVal').style.borderColor = 'var(--color-error)';
        el('bpErr').style.borderColor = 'var(--color-error)';
        return;
      }
      el('bpVal').style.borderColor = '';
      el('bpErr').style.borderColor = '';

      addEntry({ label: labId, bp, err, curveKey, deltaR, deltaRErr });

      el('dateForm').reset();
      el('deltaRVal').value = 0;
      el('deltaRErr').value = 0;
      el('deltaRPreset').value = 'custom';
      el('curveSel').value = 'intcal20';
      toggleDeltaRBlock();
      el('labId').focus();
    });

    el('clearAllBtn').addEventListener('click', clearAll);

    el('loadExampleBtn').addEventListener('click', loadI5247Example);

    document.querySelectorAll('[data-scroll]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    el('axisToggle').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        el('axisToggle').querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.axisMode = btn.dataset.axis;
        renderCharts();
      });
    });
  }

  function loadI5247Example() {
    state.entries = [];
    state.nextId = 1;
    addEntry({ label: 'I-5247 · IntCal20 (terrestrial)', bp: 2440, err: 95, curveKey: 'intcal20', deltaR: 0, deltaRErr: 0 });
    addEntry({ label: 'I-5247 · SHCal20 (terrestrial, S. Hemisphere)', bp: 2440, err: 95, curveKey: 'shcal20', deltaR: 0, deltaRErr: 0 });
    addEntry({ label: 'I-5247 · Marine20 + Potomac ΔR', bp: 2440, err: 95, curveKey: 'marine20', deltaR: 148, deltaRErr: 46 });
  }

  // ---------------- Theme ----------------

  function wireTheme() {
    const toggle = el('themeToggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggle = el('themeToggle');
    toggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    toggle.innerHTML =
      theme === 'light'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    // re-render charts so colors/gridlines pick up the new theme's CSS vars
    if (state.curves) renderCharts();
  }

  // ---------------- Init ----------------

  async function init() {
    wireTheme();
    wireForm();
    renderDeltaRPresets();
    toggleDeltaRBlock();

    try {
      state.curves = await Curves.loadAll();
      renderCiteRow();
      loadI5247Example();
    } catch (err) {
      console.error(err);
      el('compareBody').innerHTML = '';
      el('emptyState').style.display = 'block';
      el('emptyState').querySelector('p').textContent = 'Could not load calibration curve data. Please reload the page.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
