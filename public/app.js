async function fetchJSON(url) {
  console.log("GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const citySel    = document.getElementById('city');
const fromInp    = document.getElementById('from');
const toInp      = document.getElementById('to');
const applyBtn   = document.getElementById('apply');
const summaryDiv = document.getElementById('summary');

let tempChart = null;
let precipChart = null;

async function loadCities() {
  const cities = await fetchJSON('/api/cities');
  citySel.innerHTML = cities.map(c => `<option value="${c}">${c}</option>`).join('');
  if (cities.length && !citySel.value) citySel.value = cities[0];
}

function params() {
  const p = new URLSearchParams();
  if (citySel.value) p.set('city', citySel.value);
  if (fromInp.value) p.set('from', `${fromInp.value}T00:00:00Z`);
  if (toInp.value)   p.set('to',   `${toInp.value}T23:59:59Z`);
  return p.toString();
}

function makeCtx(id) {
  const el = document.getElementById(id);
  // Use 2D context explicitly (avoids some resize glitches)
  return el.getContext('2d');
}

function destroy(chart) {
  if (chart && typeof chart.destroy === 'function') chart.destroy();
}

async function refresh() {
  if (!window.Chart) {
    summaryDiv.innerHTML = `<p style="color:#fca5a5">Chart.js failed to load. Check internet/CDN.</p>`;
    return;
  }

  const q = params();
  const rows = await fetchJSON(`/api/weather?${q}`);

  if (!rows.length) {
    destroy(tempChart); destroy(precipChart);
    summaryDiv.innerHTML = `<p>No data for the selected filters.</p>`;
    return;
  }

  const labels  = rows.map(r => (r.ts || '').slice(0, 10));
  const temps   = rows.map(r => Number.parseFloat(r.temp_c));
  const precips = rows.map(r => Number.parseFloat(r.precip_mm));

  console.log("labels:", labels);
  console.log("temps:", temps);
  console.log("precips:", precips);

  // Safety: replace NaN with null so Chart.js can span gaps
  const clean = a => a.map(v => (Number.isFinite(v) ? v : null));

  const tdata = clean(temps);
  const pdata = clean(precips);

  destroy(tempChart);
  destroy(precipChart);

  Chart.defaults.maintainAspectRatio = false;

  tempChart = new Chart(makeCtx('tempChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Temp (°C)',
        data: tdata,
        spanGaps: true,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      animation: false,
      normalized: true,
      scales: {
        y: {
          suggestedMin: Math.min(...tdata.filter(Number.isFinite)) - 2,
          suggestedMax: Math.max(...tdata.filter(Number.isFinite)) + 2
        }
      }
    }
  });

  precipChart = new Chart(makeCtx('precipChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Precip (mm)',
        data: pdata
      }]
    },
    options: {
      responsive: true,
      animation: false,
      normalized: true,
      scales: {
        y: {
          suggestedMin: 0,
          suggestedMax: Math.max(...pdata.filter(Number.isFinite)) + 1
        }
      }
    }
  });

  // Summary (unchanged)
  const sum = await fetchJSON(`/api/summary?${q}`);
  summaryDiv.innerHTML = `
    <table>
      <thead>
        <tr><th>Day</th><th>Avg Temp (°C)</th><th>Total Precip (mm)</th><th>Avg Wind (kph)</th></tr>
      </thead>
      <tbody>
        ${sum.map(s => `<tr>
          <td>${s.day}</td>
          <td>${s.avg_temp_c}</td>
          <td>${s.total_precip_mm}</td>
          <td>${s.avg_wind_kph}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

applyBtn.addEventListener('click', refresh);
citySel.addEventListener('change', refresh);

(async function init() {
  await loadCities();
  fromInp.value = '2025-07-01';
  toInp.value   = '2025-07-14';
  await refresh();
})();
