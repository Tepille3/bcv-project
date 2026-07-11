const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');
const USDT_FILE = path.join(__dirname, 'usdt-cache.json');

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
const USDT_KEY = 'bcv_usdt';

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

async function saveRate(date, fechaVenezuela, usd, eur, fuente, usdt) {
  const db = await getDB();

  const existing = db.rates.findIndex(r => r.date === date);

  const entry = {
    date,
    fechaVenezuela,
    usd: parseFloat(usd),
    eur: eur ? parseFloat(eur) : null,
    usdt: usdt ? parseFloat(usdt) : null,
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

// ----- Snapshot de USDT (caché con marca de tiempo, independiente de las tasas BCV) -----
async function getUsdtSnapshot() {
  if (redis) {
    try {
      const data = await redis.get(USDT_KEY);
      if (data && data.value) return data;
    } catch (_) {}
  }
  try {
    if (fs.existsSync(USDT_FILE)) {
      const snap = JSON.parse(fs.readFileSync(USDT_FILE, 'utf8'));
      if (snap && snap.value) return snap;
    }
  } catch (_) {}
  return null;
}

async function saveUsdtSnapshot(value, fetchedAt) {
  const snapshot = { value: parseFloat(value), fetchedAt: fetchedAt || Date.now() };
  if (redis) {
    try { await redis.set(USDT_KEY, snapshot); } catch (_) {}
  }
  try {
    fs.writeFileSync(USDT_FILE, JSON.stringify(snapshot, null, 2));
  } catch (_) {}
  return snapshot;
}

module.exports = { saveRate, getRates, getLatestRate, getRateByDate, getUsdtSnapshot, saveUsdtSnapshot };
