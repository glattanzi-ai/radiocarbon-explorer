/* curves.js — loads and caches the IntCal20, SHCal20 and Marine20 curve data.
 * Source: intcal.org / calib.org, Reimer et al. 2020, Hogg et al. 2020, Heaton et al. 2020.
 */
const Curves = (() => {
  const files = {
    intcal20: './intcal20.json',
    shcal20: './shcal20.json',
    marine20: './marine20.json',
  };
  const meta = {
    intcal20: {
      label: 'IntCal20',
      full: 'IntCal20 — Northern Hemisphere Atmospheric',
      citation: 'Reimer et al. 2020, Radiocarbon 62(4):725–757',
      url: 'https://doi.org/10.1017/RDC.2020.41',
      color: '#b4741f',
    },
    shcal20: {
      label: 'SHCal20',
      full: 'SHCal20 — Southern Hemisphere Atmospheric',
      citation: 'Hogg et al. 2020, Radiocarbon 62(4):759–778',
      url: 'https://doi.org/10.1017/RDC.2020.59',
      color: '#5c7a4a',
    },
    marine20: {
      label: 'Marine20',
      full: 'Marine20 — Marine (global surface ocean)',
      citation: 'Heaton et al. 2020, Radiocarbon 62(4):779–820',
      url: 'https://doi.org/10.1017/RDC.2020.68',
      color: '#1f6f78',
    },
  };
  const cache = {};

  async function load(key) {
    if (cache[key]) return cache[key];
    const res = await fetch(files[key]);
    if (!res.ok) throw new Error(`Failed to load ${key}: ${res.status}`);
    const data = await res.json();
    cache[key] = data;
    return data;
  }

  async function loadAll() {
    const keys = Object.keys(files);
    const results = await Promise.all(keys.map(load));
    const out = {};
    keys.forEach((k, i) => (out[k] = results[i]));
    return out;
  }

  return { load, loadAll, meta };
})();
