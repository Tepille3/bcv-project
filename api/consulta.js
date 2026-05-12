const axios = require('axios');
const cheerio = require('cheerio');

const BCV_URL = 'https://www.bcv.org.ve/';

function parseNumber(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/[^\d.,]/g, '').trim();
  const normalized = cleaned.replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

async function fetchFromBCV() {
  const res = await axios.get(BCV_URL, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  });

  const $ = cheerio.load(res.data);
  const rows = [];
  $('#datos tbody tr, .contenedor .centrado table tbody tr, table tbody tr').each((_, el) => {
    const cells = $(el).find('td');
    if (cells.length >= 2) {
      const label = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      rows.push({ label, value });
    }
  });

  let usd = null, eur = null, fecha = null;

  for (const row of rows) {
    const l = row.label.toLowerCase();
    if (!usd && (l.includes('dólar') || l.includes('dollar') || l.includes('usd') || l.includes('dolar')) && !l.includes('euro')) {
      usd = parseNumber(row.value);
    }
    if (!eur && (l.includes('euro') || l.includes('eur'))) {
      eur = parseNumber(row.value);
    }
  }

  if (!usd || !eur) {
    $('.ENCSS003-1, .valor, [class*="venta"], [class*="tasa"]').each((_, el) => {
      const text = $(el).text().trim();
      const num = parseNumber(text);
      if (num && num > 1) {
        if (!usd) usd = num;
        else if (!eur) { eur = num; }
      }
    });
  }

  const fechaEl = $('span[class*="fecha"], .date, [class*="date"], time').first();
  if (fechaEl.length) {
    fecha = fechaEl.text().trim();
  }

  if (!fecha) {
    const dateEl = $('input[name*="fecha"], [data-fecha]').first();
    if (dateEl.length) {
      fecha = dateEl.attr('value') || dateEl.attr('data-fecha') || '';
    }
  }

  if (!fecha) {
    const bodyText = $('body').text();
    const dateMatch = bodyText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (dateMatch) fecha = dateMatch[1];
  }

  return { usd, eur, fecha };
}

async function fetchFromFexant() {
  const res = await axios.get('https://www.fexant.com/api/v1/bank/BCV/rates', { timeout: 8000 });
  if (res.data && res.data.rates) {
    return {
      usd: res.data.rates.USD || null,
      eur: res.data.rates.EUR || null,
      fecha: res.data.date || null,
    };
  }
  return { usd: null, eur: null, fecha: null };
}

async function fetchFromBCVDirect() {
  try {
    const res = await axios.get('https://www.bcv.org.ve/backend/abrir-bcv-euro', { timeout: 8000 });
    const eurRaw = res.data;
    const eurVal = typeof eurRaw === 'string'
      ? parseNumber(eurRaw)
      : (eurRaw?. euro || eurRaw?. value || eurRaw?. price || eurRaw?. rate || null);

    const resUSD = await axios.get('https://www.bcv.org.ve/backend/abrir-bcv-dolar', { timeout: 8000 });
    const usdRaw = resUSD.data;
    const usdVal = typeof usdRaw === 'string'
      ? parseNumber(usdRaw)
      : (usdRaw?. dolar || usdRaw?. usd || usdRaw?. value || usdRaw?. price || usdRaw?. rate || null);

    if (usdVal || eurVal) {
      return { usd: usdVal, eur: eurVal, fecha: null };
    }
  } catch (_) {}
  return { usd: null, eur: null, fecha: null };
}

function formatRate(val) {
  return val.toFixed(2).replace('.', ',');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const estrategias = [
    { name: 'BCV (www.bcv.org.ve)', fn: fetchFromBCV },
    { name: 'Fexant API', fn: fetchFromFexant },
    { name: 'BCV Backend Directo', fn: fetchFromBCVDirect },
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
    } catch (err) {
      continue;
    }
  }

  if (resultado) {
    const ahora = new Date().toLocaleString('es-ES', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    return res.status(200).json({
      success: true,
      monedas: {
        dolar: formatRate(resultado.usd),
        euro: resultado.eur && resultado.eur > 0 ? formatRate(resultado.eur) : null,
      },
      ultima_actualizacion: `${fuente} | ${resultado.fecha || ahora}`,
    });
  }

  return res.status(200).json({
    success: false,
    error: 'No se pudo obtener la tasa de cambio',
    monedas: { dolar: null, euro: null },
    ultima_actualizacion: 'Sin datos - todos los endpoints fallaron',
  });
};
