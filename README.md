# 📊 Weather Trends Dashboard

Interactive dashboard built with **JavaScript, Chart.js, Node.js/Express, and SQLite**.  
It visualizes weather data (temperature, precipitation, wind) in interactive charts and a daily summary table.

## Features
- Line chart for daily temperatures  
- Bar chart for daily precipitation  
- Daily summary table (avg temp, precip, wind)  
- City & date filters  

## Tech Stack
- Frontend: HTML, CSS, JavaScript, Chart.js  
- Backend: Node.js, Express  
- Database: SQLite  

## Getting Started
```bash
git clone <your-repo-url>
cd weather-dashboard
npm install

# Initialize the DB
node -e "const fs=require('fs');const sqlite3=require('sqlite3').verbose();const db=new sqlite3.Database('weather.db');db.exec(fs.readFileSync('db/schema.sql','utf8'));db.exec(fs.readFileSync('db/seed.sql','utf8'));db.close();console.log('DB ready.');"

# Run the server
node server.js
