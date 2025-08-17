const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'weather.db');

// Initialize DB if missing
function ensureDb() {
  if (fs.existsSync(DB_PATH)) return;
  console.log('🛠️ Creating weather.db from schema + seed...');
  const db = new sqlite3.Database(DB_PATH);
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  const seed   = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');

  db.exec(schema, (err) => {
    if (err) { console.error('Schema error:', err.message); process.exit(1); }
    db.exec(seed, (err2) => {
      if (err2) { console.error('Seed error:', err2.message); process.exit(1); }
      db.close(() => console.log('✅ DB ready.'));
    });
  });
}
ensureDb();

const db = new sqlite3.Database(DB_PATH);

// Helper: pick query params
function pick(query, keys) {
  const out = {};
  keys.forEach(k => { if (query[k] !== undefined) out[k] = query[k]; });
  return out;
}

// GET /api/cities
app.get('/api/cities', (req, res) => {
  db.all('SELECT DISTINCT city FROM weather_readings ORDER BY city', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.city));
  });
});

// GET /api/weather
app.get('/api/weather', (req, res) => {
  const { city, from, to } = pick(req.query, ['city','from','to']);
  const clauses = [];
  const params = [];
  if (city) { clauses.push('city = ?'); params.push(city); }
  if (from) { clauses.push('ts >= ?'); params.push(from); }
  if (to)   { clauses.push('ts <= ?'); params.push(to); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sql = `SELECT city, ts, temp_c, precip_mm, wind_kph FROM weather_readings ${where} ORDER BY ts ASC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/summary
app.get('/api/summary', (req, res) => {
  const { city, from, to } = pick(req.query, ['city','from','to']);
  const clauses = [];
  const params = [];
  if (city) { clauses.push('city = ?'); params.push(city); }
  if (from) { clauses.push('ts >= ?'); params.push(from); }
  if (to)   { clauses.push('ts <= ?'); params.push(to); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sql = `
    SELECT city,
           substr(ts, 1, 10) AS day,
           ROUND(AVG(temp_c), 2)   AS avg_temp_c,
           ROUND(SUM(precip_mm),2) AS total_precip_mm,
           ROUND(AVG(wind_kph), 2) AS avg_wind_kph
    FROM weather_readings
    ${where}
    GROUP BY city, day
    ORDER BY day ASC;
  `;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
