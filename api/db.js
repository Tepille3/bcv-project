const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

let redis = null;
try {
  const { Redis } = require('@upstash/redis');
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken });
  }
} catch (_) {}

const REDIS_KEY = 'bcv_rates';

async function getDB() {
  if (redis) {
    try {
      const data = await redis.get(REDIS_KEY);
      if (data) return { rates: data };
    } catch (_) {}
  }
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (_) {}
  return { rates: [] };
}

async function saveDB(data) {
  if (redis) {
    try {
      await redis.set(REDIS_KEY, data.rates);
    } catch (_) {}
  }
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

async function saveRate(date, fechaVenezuela, usd, eur, fuente) {
  const db = await getDB();

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
  await saveDB(db);

  return entry;
}

async function getRates(days = 30) {
  const db = await getDB();
  return db.rates.slice(0, days);
}

async function getLatestRate() {
  const db = await getDB();
  return db.rates[0] || null;
}

async function getRateByDate(date) {
  const db = await getDB();
  return db.rates.find(r => r.date === date) || null;
}

module.exports = { saveRate, getRates, getLatestRate, getRateByDate };
