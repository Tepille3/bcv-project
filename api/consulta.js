const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const db = require('./db');

const BCV_URL = 'https://www.bcv.org.ve/';

function getHistorial() {
  const rates = db.getRates();
  return rates.map(r => ({
    fecha: r.date,
    fechaVenezuela: r.fechaVenezuela,
    monedas: {
      USD: r.usd.toFixed(2).replace('.', ','),
      EUR: r.eur ? r.eur.toFixed(2).replace('.', ',') : null,
    },
    tasas: {
      USD: r.usd,
      EUR: r.eur,
    },
    ultima_actualizacion: r.fuente + ' | Fecha BCV: ' + r.fechaVenezuela,
  }));
}

function pushToHistorial(historial, entry) {
  historial = historial.filter(e => e.fecha !== entry.fecha);
  historial.unshift(entry);
  return historial.slice(0, 3);
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
      usd: parseNumber(String(usdRes.data)) || null,
      eur: parseNumber(String(eurRes.data)) || null,
    };
  } catch (_) {}
  return { usd: null, eur: null };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

const ahora = new Date();
  const horaVenezuela = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const fechaActual = horaVenezuela.getFullYear() + '-' + 
    String(horaVenezuela.getMonth() + 1).padStart(2, '0') + '-' + 
    String(horaVenezuela.getDate()).padStart(2, '0');

  let historial = getHistorial();

  // Verificar si ya tenemos datos para hoy en cache
  const entryHoy = historial.find(e => e.fecha === fechaActual);

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
    const meses = { 'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12' };
    const mesesLargo = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };

    let fechaGuardar = null;
    let fechaVenezuelaGuardar = null;

    // Extraer la fecha que el BCV asignó a esta tasa
    let bcvDateProvided = false;
    if (resultado.fecha) {
      const matchFecha = resultado.fecha.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (matchFecha) {
        bcvDateProvided = true;
        const dia = matchFecha[1].padStart(2, '0');
        const mes = meses[matchFecha[2].toLowerCase()] || '01';
        const anio = matchFecha[3];
        const fechaKey = `${anio}-${mes}-${dia}`;
        if (fechaKey === fechaActual) {
          // El BCV publicó la tasa para HOY
          fechaGuardar = fechaKey;
          fechaVenezuelaGuardar = `${dia} de ${matchFecha[2]} de ${anio}`;
        } else if (fechaKey > fechaActual) {
          // El BCV publicó la tasa para una fecha futura
          // Guardar SOLO para esa fecha futura, NO para hoy
          fechaGuardar = null;
          db.saveRate(fechaKey, `${dia} de ${matchFecha[2]} de ${anio}`, resultado.usd, resultado.eur, fuente);
        }
      }
    }

    // Solo usar fecha actual si NO hay fecha del BCV disponible
    if (!fechaGuardar && !bcvDateProvided) {
      fechaGuardar = fechaActual;
      fechaVenezuelaGuardar = fechaActual.split('-')[2] + ' de ' + mesesLargo[fechaActual.split('-')[1]] + ' de ' + fechaActual.split('-')[0];
    }

    if (fechaGuardar === fechaActual) {
      // Guardar entrada para HOY (solo si el BCV realmente publicó para hoy)
      const entryHoy = {
        fecha: fechaGuardar,
        fechaVenezuela: fechaVenezuelaGuardar,
        monedas: {
          USD: formatRate(resultado.usd),
          EUR: resultado.eur && resultado.eur > 0 ? formatRate(resultado.eur) : null,
        },
        tasas: {
          USD: resultado.usd,
          EUR: resultado.eur && resultado.eur > 0 ? resultado.eur : null,
        },
        ultima_actualizacion: fuente + ' | Fecha BCV: ' + (resultado.fecha || fechaVenezuelaGuardar),
      };
      historial = pushToHistorial(historial, entryHoy);
      db.saveRate(fechaGuardar, fechaVenezuelaGuardar, resultado.usd, resultado.eur, fuente);
    }

    historial = getHistorial();

    // Mostrar la última tasa válida (no futura) como principal
    const latestValid = historial.find(e => e.fecha <= fechaActual) || historial[0];
    const responseEntry = latestValid || { monedas: {}, tasas: {}, fechaVenezuela: '', ultima_actualizacion: 'Sin datos' };

    return res.status(200).json({
      success: true,
      monedas: responseEntry.monedas,
      tasas: responseEntry.tasas,
      fechaVenezuela: responseEntry.fechaVenezuela,
      ultima_actualizacion: responseEntry.ultima_actualizacion,
      historial,
      desde_cache: false,
    });
}

  return res.status(200).json({
    success: false,
    monedas: {},
    tasas: {},
    historial,
    ultima_actualizacion: 'Sin datos',
  });
};
