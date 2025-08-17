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

// ---------------- Inline SQL so we don't rely on reading files on Render ----------------
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS weather_readings;
CREATE TABLE weather_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  ts   TEXT NOT NULL,
  temp_c REAL,
  precip_mm REAL,
  wind_kph REAL
);

CREATE INDEX idx_city_ts ON weather_readings(city, ts);
`;

const SEED_SQL = `
INSERT INTO weather_readings (city, ts, temp_c, precip_mm, wind_kph) VALUES
('Austin','2025-07-01T12:00:00Z', 35.2, 0.0, 18.0),
('Austin','2025-07-02T12:00:00Z', 36.0, 0.0, 16.5),
('Austin','2025-07-03T12:00:00Z', 34.8, 0.5, 19.2),
('Austin','2025-07-04T12:00:00Z', 35.5, 0.0, 21.0),
('Austin','2025-07-05T12:00:00Z', 37.1, 0.2, 14.4),
('Austin','2025-07-06T12:00:00Z', 38.3, 0.0, 13.7),
('Austin','2025-07-07T12:00:00Z', 39.0, 0.0, 17.3),
('Austin','2025-07-08T12:00:00Z', 38.4, 1.2, 15.1),
('Austin','2025-07-09T12:00:00Z', 36.8, 0.0, 18.8),
('Austin','2025-07-10T12:00:00Z', 35.9, 0.0, 20.6),
('Austin','2025-07-11T12:00:00Z', 34.1, 2.8, 22.0),
('Austin','2025-07-12T12:00:00Z', 33.7, 0.0, 19.5),
('Austin','2025-07-13T12:00:00Z', 34.9, 0.0, 18.3),
('Austin','2025-07-14T12:00:00Z', 36.2, 0.0, 17.9),

('Chicago','2025-07-01T12:00:00Z', 27.0, 0.4, 20.0),
('Chicago','2025-07-02T12:00:00Z', 26.5, 1.8, 22.5),
('Chicago','2025-07-03T12:00:00Z', 28.1, 0.0, 19.0),
('Chicago','2025-07-04T12:00:00Z', 29.0, 0.0, 18.7),
('Chicago','2025-07-05T12:00:00Z', 30.2, 0.0, 17.9),
('Chicago','2025-07-06T12:00:00Z', 31.1, 0.0, 16.2),
('Chicago','2025-07-07T12:00:00Z', 30.6, 0.6, 15.0),
('Chicago','2025-07-08T12:00:00Z', 29.9, 0.0, 14.3),
('Chicago','2025-07-09T12:00:00Z', 28.7, 3.1, 21.1),
('Chicago','2025-07-10T12:00:00Z', 27.5, 0.0, 20.0),
('Chicago','2025-07-11T12:00:00Z', 26.8, 0.0, 18.2),
('Chicago','2025-07-12T12:00:00Z', 27.3, 0.0, 17.5),
('Chicago','2025-07-13T12:00:00Z', 28.0, 0.0, 16.9),
('Chicago','2025-07-14T12:00:00Z', 29.4, 0.0, 16.1);
`;

// DB lives in project root
const DB_PATH = path.join(__dirname, 'weather.db');

// Create DB if missing — tolerant to errors
function ensureDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      console.log('ℹ️ Using existing weather.db');
      return;
    }
    console.log('🛠️ Creating weather.db…');
    const dbTmp = new sqlite3.Database(DB_PATH);
    dbTmp.serialize(() => {
      dbTmp.exec(SCHEMA_SQL, (e1) => {
        if (e1) console.error('Schema error:', e1.message);
        dbTmp.exec(SEED_SQL, (e2) => {
          if (e2) console.error('Seed error:', e2.message);
          dbTmp.close(() => console.log('✅ DB ready.'));
        });
      });
    });
  } catch (err) {
    console.error('DB init fatal (continuing anyway):', err);
  }
}
ensureDb();

const db = new sqlite3.Database(DB_PATH);

// Safe param picker
function pick(query, keys) {
  const out = {};
  keys.forEach(k => { if (query[k] !== undefined) out[k] = query[k]; });
  return out;
}

// Routes
app.get('/api/cities', (_req, res) => {
  db.all('SELECT DISTINCT city FROM weather_readings ORDER BY city', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.city));
  });
});

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
