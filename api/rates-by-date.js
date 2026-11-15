const db = require('./db');

function formatRate(val) {
  if (val == null || isNaN(val)) return null;
  const parts = Number(val).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, error: 'Formato de fecha inválido. Use YYYY-MM-DD.' });
  }

  try {
    const rate = await db.getRateByDate(date);
    const usdtDaily = await db.getUsdtDaily();

    if (!rate && !usdtDaily[date]) {
      return res.status(200).json({ success: false, date, noData: true });
    }

    const usdtVal = usdtDaily[date] != null ? usdtDaily[date] : (rate && rate.usdt ? rate.usdt : null);
    const eurVal = rate && rate.eur ? ((rate.eur < 10 && rate.usd > 500) ? rate.eur * 1000 : rate.eur) : null;

    return res.status(200).json({
      success: true,
      date,
      fechaVenezuela: rate ? rate.fechaVenezuela : date,
      monedas: {
        USD: rate ? formatRate(rate.usd) : null,
        EUR: eurVal ? formatRate(eurVal) : null,
        USDT: usdtVal ? formatRate(usdtVal) : null,
      },
      tasas: {
        USD: rate ? rate.usd : null,
        EUR: eurVal,
        USDT: usdtVal || null,
      },
      fuente: rate ? rate.fuente : null,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Error interno.' });
  }
};
