// ---------- Helpers ----------
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
const $ = (sel) => document.querySelector(sel);

const citySel     = $('#city');
const city2Sel    = $('#city2');
const city2Wrap   = $('#city2Wrap');
const compareChk  = $('#compareChk');
const fromInp     = $('#from');
const toInp       = $('#to');
const applyBtn    = $('#apply');
const summaryDiv  = $('#summary');
const themeBtn    = $('#themeToggle');

let tempChart = null;
let precipChart = null;

// ---------- Theme Toggle ----------
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  if (saved === 'light') document.body.classList.add('light');
  themeBtn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
    themeBtn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
    refresh();
  });
})();

// ---------- Data ----------
async function loadCities() {
  const cities = await fetchJSON('/api/cities');
  const opts = cities.map(c => `<option value="${c}">${c}</option>`).join('');
  citySel.innerHTML = opts;
  city2Sel.innerHTML = opts;
  if (cities.length && !citySel.value) citySel.value = cities[0];
  if (cities.length > 1 && !city2Sel.value) city2Sel.value = cities[1];
}

function dateParams() {
  const p = new URLSearchParams();
  if (fromInp.value) p.set('from', `${fromInp.value}T00:00:00Z`);
  if (toInp.value)   p.set('to',   `${toInp.value}T23:59:59Z`);
  return p.toString();
}

async function fetchCitySeries(city) {
  const q = dateParams();
  const rows = await fetchJSON(`/api/weather?city=${encodeURIComponent(city)}&${q}`);
  return rows.map(r => ({
    day: (r.ts || '').slice(0,10),
    temp: Number.parseFloat(r.temp_c),
    precip: Number.parseFloat(r.precip_mm),
    wind: Number.parseFloat(r.wind_kph),
  }));
}

// union sorted labels
function unionLabels(aDays, bDays=[]) {
  const set = new Set([...aDays, ...bDays]);
  return Array.from(set).sort(); // ISO YYYY-MM-DD sorts chronologically
}
function align(series, labels, key) {
  const map = Object.create(null);
  for (const r of series) map[r.day] = Number.isFinite(r[key]) ? r[key] : null;
  return labels.map(d => (d in map ? map[d] : null));
}
function destroy(chart) { if (chart && chart.destroy) chart.destroy(); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// ---------- Charts ----------
async function refresh() {
  if (!window.Chart) {
    summaryDiv.innerHTML = `<p style="color:#f87171">Chart.js failed to load. Check the CDN.</p>`;
    return;
  }

  // Fetch primary city
  const cityA = citySel.value;
  if (!cityA) return;

  const seriesA = await fetchCitySeries(cityA);

  let labels = seriesA.map(r => r.day);

  let seriesB = [];
  const comparing = compareChk.checked && city2Sel.value && city2Sel.value !== cityA;
  if (comparing) {
    seriesB = await fetchCitySeries(city2Sel.value);
    labels = unionLabels(labels, seriesB.map(r => r.day));
  }

  // Align data arrays to the same labels
  const tempsA   = align(seriesA, labels, 'temp');
  const precipA  = align(seriesA, labels, 'precip');
  const tempsB   = comparing ? align(seriesB, labels, 'temp')   : null;
  const precipB  = comparing ? align(seriesB, labels, 'precip') : null;

  destroy(tempChart);
  destroy(precipChart);

  const tempCtx   = document.getElementById('tempChart').getContext('2d');
  const precipCtx = document.getElementById('precipChart').getContext('2d');

  Chart.defaults.font.family = 'system-ui, Arial, sans-serif';
  Chart.defaults.color = cssVar('--fg');

  // Temperature line(s)
  const accentA = cssVar('--accent');
  const accentB = cssVar('--accentB');

  tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${cityA} Temp (°C)`,
          data: tempsA,
          borderColor: accentA,
          backgroundColor: (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return accentA + '55';
            const grad = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            grad.addColorStop(0, accentA + '55');
            grad.addColorStop(1, accentA + '00');
            return grad;
          },
          fill: true, tension: 0.25, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, spanGaps: true
        },
        ...(comparing ? [{
          label: `${city2Sel.value} Temp (°C)`,
          data: tempsB,
          borderColor: accentB,
          backgroundColor: (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return accentB + '55';
            const grad = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            grad.addColorStop(0, accentB + '55');
            grad.addColorStop(1, accentB + '00');
            return grad;
          },
          fill: true, tension: 0.25, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, spanGaps: true
        }] : [])
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true } },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)', titleColor: '#fff', bodyColor: '#fff',
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} °C` }
        }
      },
      scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: false } }
    }
  });

  // Precipitation bars (grouped side-by-side)
  const precipAColor = cssVar('--accent2');
  const precipBColor = cssVar('--accent2B');

  const precipDatasets = [{
    label: `${cityA} Precip (mm)`,
    data: precipA,
    backgroundColor: precipAColor,
    borderRadius: 6, borderSkipped: false
  }];
  if (comparing) {
    precipDatasets.push({
      label: `${city2Sel.value} Precip (mm)`,
      data: precipB,
      backgroundColor: precipBColor,
      borderRadius: 6, borderSkipped: false
    });
  }

  precipChart = new Chart(precipCtx, {
    type: 'bar',
    data: { labels, datasets: precipDatasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true } },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)', titleColor: '#fff', bodyColor: '#fff',
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} mm` }
        }
      },
      scales: { x: { stacked: false }, y: { beginAtZero: true } }
    }
  });

  // Summary table
  if (!comparing) {
    const sum = await fetchJSON(`/api/summary?city=${encodeURIComponent(cityA)}&${dateParams()}`);
    summaryDiv.innerHTML = `
      <table>
        <thead>
          <tr><th>Day</th><th>City</th><th>Avg Temp (°C)</th><th>Total Precip (mm)</th><th>Avg Wind (kph)</th></tr>
        </thead>
        <tbody>
          ${sum.map(s => `<tr>
            <td>${s.day}</td><td>${s.city || cityA}</td>
            <td>${s.avg_temp_c}</td><td>${s.total_precip_mm}</td><td>${s.avg_wind_kph}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } else {
    const [sumA, sumB] = await Promise.all([
      fetchJSON(`/api/summary?city=${encodeURIComponent(cityA)}&${dateParams()}`),
      fetchJSON(`/api/summary?city=${encodeURIComponent(city2Sel.value)}&${dateParams()}`)
    ]);
    const rows = [...sumA.map(s => ({...s, city: cityA})), ...sumB.map(s => ({...s, city: city2Sel.value}))];
    rows.sort((a,b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.city.localeCompare(b.city)));
    summaryDiv.innerHTML = `
      <table>
        <thead>
          <tr><th>Day</th><th>City</th><th>Avg Temp (°C)</th><th>Total Precip (mm)</th><th>Avg Wind (kph)</th></tr>
        </thead>
        <tbody>
          ${rows.map(s => `<tr>
            <td>${s.day}</td><td>${s.city}</td>
            <td>${s.avg_temp_c}</td><td>${s.total_precip_mm}</td><td>${s.avg_wind_kph}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }
}

// ---------- Wire up ----------
applyBtn.addEventListener('click', refresh);
citySel.addEventListener('change', refresh);
city2Sel.addEventListener('change', () => { if (compareChk.checked) refresh(); });
compareChk.addEventListener('change', () => {
  city2Wrap.classList.toggle('hidden', !compareChk.checked);
  refresh();
});

(async function init() {
  await loadCities();
  fromInp.value = '2025-07-01';
  toInp.value   = '2025-07-14';
  city2Wrap.classList.add('hidden'); // default hidden
  await refresh();
})();
