const axios = require('axios');
const cheerio = require('cheerio');

const BCV_URL = 'https://www.bcv.org.ve/';

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const ahora = new Date();
  const horaVenezuela = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const fechaActual = horaVenezuela.getFullYear() + '-' + 
    String(horaVenezuela.getMonth() + 1).padStart(2, '0') + '-' + 
    String(horaVenezuela.getDate()).padStart(2, '0');

  const fechaVenezuelaFormateada = new Date(horaVenezuela.getTime() - (horaVenezuela.getTimezoneOffset() * 60000))
    .toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  let resultado = null;
  let fuente = null;

  try {
    resultado = await fetchFromBCV();
    fuente = 'BCV (www.bcv.org.ve)';
  } catch (e) {
    resultado = null;
  }

  if (resultado && resultado.usd && resultado.usd > 0) {
    return res.status(200).json({
      success: true,
      monedas: {
        USD: formatRate(resultado.usd),
        EUR: resultado.eur && resultado.eur > 0 ? formatRate(resultado.eur) : null,
      },
      tasas: {
        USD: resultado.usd,
        EUR: resultado.eur && resultado.eur > 0 ? resultado.eur : null,
      },
      fechaVenezuela: fechaVenezuelaFormateada,
      ultima_actualizacion: fuente + ' | Fecha BCV: ' + (resultado.fecha || fechaVenezuelaFormateada),
      historial: [{
        fecha: fechaActual,
        fechaVenezuela: fechaVenezuelaFormateada,
        monedas: {
          USD: formatRate(resultado.usd),
          EUR: resultado.eur && resultado.eur > 0 ? formatRate(resultado.eur) : null,
        },
        tasas: {
          USD: resultado.usd,
          EUR: resultado.eur && resultado.eur > 0 ? resultado.eur : null,
        },
        ultima_actualizacion: fuente + ' | Fecha BCV: ' + (resultado.fecha || fechaVenezuelaFormateada),
      }],
      desde_cache: false,
    });
  }

  return res.status(200).json({
    success: false,
    monedas: {},
    tasas: {},
    historial: [],
    ultima_actualizacion: 'Sin datos',
  });
};