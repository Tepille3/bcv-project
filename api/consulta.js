const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const db = require('./db');

const BCV_URL = 'https://www.bcv.org.ve/';

async function getHistorial() {
  const rates = await db.getRates();
  const daily = await db.getUsdtDaily();
  return rates.map(r => {
    // Para cada día, el USDT del historial es el último valor registrado ese día
    const usdtVal = daily[r.date] != null ? daily[r.date] : (r.usdt || null);
    const eurVal = (r.eur && r.eur > 10) ? r.eur : null;
    return {
      fecha: r.date,
      fechaVenezuela: r.fechaVenezuela,
      monedas: {
        USD: r.usd ? formatRate(r.usd) : 'N/A',
        EUR: eurVal ? formatRate(eurVal) : 'N/A',
        USDT: usdtVal ? formatRate(usdtVal) : 'N/A',
      },
      tasas: {
        USD: r.usd || null,
        EUR: eurVal,
        USDT: usdtVal,
      },
      ultima_actualizacion: r.fuente + ' | Fecha BCV: ' + r.fechaVenezuela,
    };
  });
}

function pushToHistorial(historial, entry) {
  historial = historial.filter(e => e.fecha !== entry.fecha);
  historial.unshift(entry);
  return historial.slice(0, 3);
}

function parseNumber(str) {
  if (str == null) return null;
  if (typeof str === 'number') return isNaN(str) ? null : str;
  if (typeof str !== 'string') return null;
  const cleaned = str.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Notación española: 1.010,56078251 -> 1010.56078251
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Notación anglosajona: 1,010.56078251 -> 1010.56078251
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Solo coma decimal: 914,0218 -> 914.0218
    normalized = cleaned.replace(',', '.');
  } else {
    // Solo punto o entero: 1072.55
    normalized = cleaned;
  }

  const val = parseFloat(normalized);
  return isNaN(val) ? null : val;
}

function formatRate(val) {
  if (val == null || isNaN(val)) return null;
  const parts = Number(val).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
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

  // Método 1: Búsqueda directa por los contenedores #dolar y #euro
  const dolarContainer = $('#dolar');
  if (dolarContainer.length) {
    const strongText = dolarContainer.find('strong').text().trim();
    const dVal = parseNumber(strongText || dolarContainer.text());
    if (dVal && dVal > 0) tasas.usd = dVal;
  }
  const euroContainer = $('#euro');
  if (euroContainer.length) {
    const strongText = euroContainer.find('strong').text().trim();
    const eVal = parseNumber(strongText || euroContainer.text());
    if (eVal && eVal > 0) tasas.eur = eVal;
  }

  // Método 2: div.recuadrotsmc (por si cambian los IDs #dolar/#euro)
  $('div.recuadrotsmc').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const match = text.match(/\b(USD|EUR)\b\s*([\d.,]+)/i);
    if (match) {
      const codigo = match[1].toUpperCase();
      const valor = parseNumber(match[2]);
      if (valor && valor > 0 && !tasas[codigo.toLowerCase()]) {
        tasas[codigo.toLowerCase()] = valor;
      }
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

const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// Precio mediano de las ofertas P2P de USDT/VES para un lado del libro (SELL o BUY)
async function fetchBinanceSide(tradeType) {
  const res = await axios.post(
    BINANCE_P2P_URL,
    { asset: 'USDT', fiat: 'VES', tradeType, page: 1, rows: 20, payTypes: [], publisherType: null },
    {
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }
  );
  const ads = res.data && Array.isArray(res.data.data) ? res.data.data : [];
  const precios = ads
    .map(a => (a && a.adv ? parseNumber(String(a.adv.price)) : null))
    .filter(p => p && p > 0)
    .sort((a, b) => a - b);
  if (!precios.length) return null;
  const mid = Math.floor(precios.length / 2);
  return precios.length % 2 ? precios[mid] : (precios[mid - 1] + precios[mid]) / 2;
}

// Referencia USDT: promedio del punto medio de compra y venta en Binance P2P
async function fetchFromBinance() {
  try {
    const [sell, buy] = await Promise.all([
      fetchBinanceSide('SELL'),
      fetchBinanceSide('BUY'),
    ]);
    const vals = [sell, buy].filter(v => v && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  } catch (_) {}
  return null;
}

// El precio de USDT se refresca en horas fijas ancladas al reloj (00:00, 01:00, 02:00 ...)
const USDT_REFRESH_MS = 1 * 60 * 60 * 1000;

// Identifica la franja horaria del reloj a la que pertenece un instante.
// Al ser Venezuela UTC-4 (desfase de horas completas), estas franjas caen en horas en punto tanto en UTC como VET.
function usdtBucket(ts) {
  return Math.floor(ts / USDT_REFRESH_MS);
}

// Fecha actual en Venezuela como clave YYYY-MM-DD
function fechaVenezuelaKey() {
  const hv = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  return hv.getFullYear() + '-' +
    String(hv.getMonth() + 1).padStart(2, '0') + '-' +
    String(hv.getDate()).padStart(2, '0');
}

const MESES_LARGO = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };

// Clave YYYY-MM-DD -> "DD de MMMM de YYYY"
function fechaVELarga(fechaKey) {
  const p = fechaKey.split('-');
  return p[2] + ' de ' + (MESES_LARGO[p[1]] || '') + ' de ' + p[0];
}

// Historial propio de USDT construido desde el mapa diario (fechas de calendario, no del BCV).
// Incluye hoy con el valor en vivo para que sea la entrada actual.
function buildUsdtHistorial(daily, fechaHoy, valorHoy) {
  const map = Object.assign({}, daily);
  if (valorHoy && valorHoy > 0) map[fechaHoy] = valorHoy;
  return Object.keys(map)
    .sort().reverse().slice(0, 365)
    .map(f => ({
      fecha: f,
      fechaVenezuela: fechaVELarga(f),
      monedas: { USDT: map[f].toFixed(2).replace('.', ',') },
      tasas: { USDT: map[f] },
    }));
}

async function getUsdtCached() {
  const snapshot = await db.getUsdtSnapshot();
  const ahora = Date.now();

  // El valor guardado pertenece a la franja horaria actual: usar caché sin consultar Binance
  if (snapshot && snapshot.value > 0 && usdtBucket(snapshot.fetchedAt) === usdtBucket(ahora)) {
    return snapshot.value;
  }

  // Nueva franja horaria (o sin caché): consultar Binance y guardar el nuevo valor.
  // Se registra bajo la fecha de hoy en Venezuela; así el último valor del día queda en el historial.
  const fresh = await fetchFromBinance();
  if (fresh && fresh > 0) {
    await db.saveUsdtSnapshot(fresh, ahora, fechaVenezuelaKey());
    return fresh;
  }

  // Si Binance falla, seguir mostrando el último valor conocido aunque sea de una franja anterior
  return snapshot && snapshot.value > 0 ? snapshot.value : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // USDT/Bs (Binance P2P) en paralelo — cacheado 2 h, independiente de la lógica BCV
  const binancePromise = getUsdtCached();

const ahora = new Date();
  const horaVenezuela = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const fechaActual = horaVenezuela.getFullYear() + '-' + 
    String(horaVenezuela.getMonth() + 1).padStart(2, '0') + '-' + 
    String(horaVenezuela.getDate()).padStart(2, '0');

  let historial = await getHistorial();

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

  if (!resultado) {
    const latestRate = await db.getLatestRate();
    if (latestRate) {
      resultado = {
        usd: latestRate.usd,
        eur: latestRate.eur,
        fecha: latestRate.fechaVenezuela,
        fromCache: true,
        fechaKey: latestRate.date,
        fechaVenezuela: latestRate.fechaVenezuela,
      };
      fuente = latestRate.fuente + ' (Caché)';
    }
  }

  const usdtValue = await binancePromise;

  // Historial de USDT desde su propio mapa diario (independiente de las fechas del BCV)
  const usdtDailyMap = await db.getUsdtDaily();
  const usdtHistorial = buildUsdtHistorial(usdtDailyMap, fechaActual, usdtValue);

  if (resultado) {
    const meses = { 'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12' };
    const mesesLargo = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };

    let fechaGuardar = null;
    let fechaVenezuelaGuardar = null;

    // Extraer la fecha que el BCV asignó a esta tasa
    let bcvDateProvided = false;
    if (resultado.fecha && !resultado.fromCache) {
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
          fechaGuardar = fechaKey; // usar la fecha futura para construir entry
          fechaVenezuelaGuardar = `${dia} de ${matchFecha[2]} de ${anio}`;
          await db.saveRate(fechaKey, fechaVenezuelaGuardar, resultado.usd, resultado.eur, fuente);
        } else {
          // El BCV tiene una fecha anterior (ej. fin de semana o feriado)
          fechaGuardar = fechaKey;
          fechaVenezuelaGuardar = `${dia} de ${matchFecha[2]} de ${anio}`;
          await db.saveRate(fechaKey, fechaVenezuelaGuardar, resultado.usd, resultado.eur, fuente);
        }
      }
    }

    if (resultado.fromCache) {
      fechaGuardar = resultado.fechaKey;
      fechaVenezuelaGuardar = resultado.fechaVenezuela;
      bcvDateProvided = true;
    }

    // Solo usar fecha actual si NO hay fecha del BCV disponible
    if (!fechaGuardar && !bcvDateProvided) {
      fechaGuardar = fechaActual;
      fechaVenezuelaGuardar = fechaActual.split('-')[2] + ' de ' + mesesLargo[fechaActual.split('-')[1]] + ' de ' + fechaActual.split('-')[0];
    }

      // Construir entrada con los datos recién obtenidos del BCV
      const bcvEntry = {
        fecha: fechaGuardar,
        fechaVenezuela: fechaVenezuelaGuardar,
        monedas: {
          USD: resultado.usd && resultado.usd > 0 ? formatRate(resultado.usd) : 'N/A',
          EUR: resultado.eur && resultado.eur > 0 ? formatRate(resultado.eur) : 'N/A',
          USDT: usdtValue && usdtValue > 0 ? formatRate(usdtValue) : 'N/A',
        },
        tasas: {
          USD: resultado.usd && resultado.usd > 0 ? resultado.usd : null,
          EUR: resultado.eur && resultado.eur > 0 ? resultado.eur : null,
          USDT: usdtValue && usdtValue > 0 ? usdtValue : null,
        },
        ultima_actualizacion: fuente + ' | Fecha BCV: ' + (resultado.fecha || fechaVenezuelaGuardar),
      };

      if (fechaGuardar === fechaActual) {
        // Guardar entrada para HOY en persistence
        historial = pushToHistorial(historial, bcvEntry);
        await db.saveRate(fechaGuardar, fechaVenezuelaGuardar, resultado.usd, resultado.eur, fuente, usdtValue);
      }

      // Leer historial completo desde DB (incluye lo guardado arriba + futuros guardados antes)
      const dbHistorial = await getHistorial();
      // Mezclar: priorizar el dato recién obtenido del BCV por si DB no se actualizó
      historial = dbHistorial.filter(e => e.fecha !== fechaGuardar);
      historial.unshift(bcvEntry);
      historial = historial.slice(0, 365);

      // Mostrar la última tasa válida (no futura) como principal
      const latestValid = historial.find(e => e.fecha <= fechaActual) || historial[0];
      const responseEntry = latestValid || { monedas: {}, tasas: {}, fechaVenezuela: '', ultima_actualizacion: 'Sin datos' };

      // El USDT es un precio de mercado en vivo: la tarjeta principal muestra el valor recién
      // obtenido, pero SIN mutar la entrada del historial (cada día conserva su último USDT).
      let respMonedas = responseEntry.monedas;
      let respTasas = responseEntry.tasas;
      if (usdtValue && usdtValue > 0) {
        respMonedas = Object.assign({}, respMonedas, { USDT: formatRate(usdtValue) });
        respTasas = Object.assign({}, respTasas, { USDT: usdtValue });
      }

      return res.status(200).json({
        success: true,
        monedas: respMonedas,
        tasas: respTasas,
        fechaVenezuela: responseEntry.fechaVenezuela,
        ultima_actualizacion: responseEntry.ultima_actualizacion,
        historial,
        usdtHistorial,
        desde_cache: false,
      });
    }

  return res.status(200).json({
    success: false,
    monedas: usdtValue && usdtValue > 0 ? { USDT: formatRate(usdtValue) } : {},
    tasas: usdtValue && usdtValue > 0 ? { USDT: usdtValue } : {},
    historial,
    usdtHistorial,
    ultima_actualizacion: 'Sin datos',
  });
};
