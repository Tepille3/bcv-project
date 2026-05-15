const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

function getDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (_) {}
  return { rates: [] };
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

function saveRate(date, fechaVenezuela, usd, eur, fuente) {
  const db = getDB();
  
  const existing = db.rates.findIndex(r => r.date === date);
  
  const entry = {
    date,
    fechaVenezuela,
    usd: parseFloat(usd),
    eur: eur ? parseFloat(eur) : null,
    fuente,
    updatedAt: new Date().toISOString()
  };
  
  if (existing >= 0) {
    db.rates[existing] = entry;
  } else {
    db.rates.unshift(entry);
  }
  
  db.rates = db.rates.slice(0, 30);
  saveDB(db);
  
  return entry;
}

function getRates(days = 30) {
  const db = getDB();
  return db.rates.slice(0, days);
}

function getLatestRate() {
  const db = getDB();
  return db.rates[0] || null;
}

function getRateByDate(date) {
  const db = getDB();
  return db.rates.find(r => r.date === date) || null;
}

module.exports = { saveRate, getRates, getLatestRate, getRateByDate };