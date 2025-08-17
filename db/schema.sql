PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS weather_readings;
CREATE TABLE weather_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  ts   TEXT NOT NULL,          -- ISO timestamp (UTC) e.g., 2025-01-01T00:00:00Z
  temp_c REAL,                 -- temperature in °C
  precip_mm REAL,              -- precipitation (mm)
  wind_kph REAL                -- wind speed (kph)
);

CREATE INDEX idx_city_ts ON weather_readings(city, ts);
