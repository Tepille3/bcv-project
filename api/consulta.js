const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const BCV_URL = 'https://www.bcv.org.ve/';
const CACHE_FILE = path.join(__dirname, 'cache.json');

function getCachedRates() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      return data;
    }
  } catch (_) {}
  return null;
}

function saveCachedRates(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

function parseNumber(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/[^\d.,]/g, '').trim();
  const normalized = cleaned.replace(',', '.');
  return parseFloat(normalized);
}

function formatRate(val) {
  return val.toFixed(2).replace('.', ',');
}

async function fetchFromBCV() {
  const res = await axios.get(BCV_URL, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'es-ES,es;q=0.9',
    },
    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  });

  const $ = cheerio.load(res.data);
  const tasas = {};

  $('div.recuadrotsmc').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const match = text.match(/\b(USD|EUR)\b\s*([\d.,]+)/i);
    if (match) {
      const codigo = match[1].toUpperCase();
      const valor = parseNumber(match[2]);
      if (valor && valor > 0) tasas[codigo.toLowerCase()] = valor;
    }
  });

  const fechaEl = $('span.date-display-single, div.pull-right dinpro center').first();
  const fecha = fechaEl.text().trim()
    .replace(/Fecha\s*Valor:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null;

  return {
    usd: tasas.usd || null,
    eur: tasas.eur || null,
    fecha: fecha,
  };
}

async function fetchFromBCVBackend() {
  try {
    const [eurRes, usdRes] = await Promise.all([
      axios.get('https://www.bcv.org.ve/backend/abrir-bcv-euro', { timeout: 8000 }),
      axios.get('https://www.bcv.org.ve/backend/abrir-bcv-dolar', { timeout: 8000 }),
    ]);
    return {
      usd: parseNumber(String(eurRes.data)) || null,
      eur: parseNumber(String(usdRes.data)) || null,
    };
  } catch (_) {}
  return { usd: null, eur: null };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const ahora = new Date();
  const horaVenezuela = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const fechaActual = horaVenezuela.toISOString().split('T')[0];

  const cache = getCachedRates();

  if (cache && cache.fecha === fechaActual) {
    return res.status(200).json({
      success: true,
      monedas: cache.monedas,
      tasas: cache.tasas,
      ultima_actualizacion: cache.ultima_actualizacion,
      desde_cache: true,
    });
  }

  const estrategias = [
    { name: 'BCV (www.bcv.org.ve)', fn: fetchFromBCV },
    { name: 'BCV Backend', fn: fetchFromBCVBackend },
  ];

  let resultado = null;
  let fuente = null;

  for (const estr of estrategias) {
    try {
      const datos = await estr.fn();
      if (datos.usd && datos.usd > 0) {
        resultado = datos;
        fuente = estr.name;
        break;
      }
    } catch (_) {}
  }

  if (resultado) {
    const fechaTxt = new Date(horaVenezuela.getTime() - (horaVenezuela.getTimezoneOffset() * 60000))
      .toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const datosCache = {
      fecha: fechaActual,
      monedas: {
        USD: formatRate(resultado.usd),
        EUR: resultado.eur && resultado.eur > 0 ? formatRate(resultado.eur) : null,
      },
      tasas: {
        USD: resultado.usd,
        EUR: resultado.eur && resultado.eur > 0 ? resultado.eur : null,
      },
      ultima_actualizacion: fuente + (resultado.fecha ? ' | Fecha valor: ' + resultado.fecha : ' | ' + fechaTxt),
    };

    saveCachedRates(datosCache);

    return res.status(200).json({
      success: true,
      monedas: datosCache.monedas,
      tasas: datosCache.tasas,
      ultima_actualizacion: datosCache.ultima_actualizacion,
      desde_cache: false,
    });
  }

  return res.status(200).json({
    success: false,
    monedas: {},
    tasas: {},
    ultima_actualizacion: 'Sin datos',
  });
};
