const db = require('./db');

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

    return res.status(200).json({
      success: true,
      date,
      fechaVenezuela: rate ? rate.fechaVenezuela : date,
      monedas: {
        USD: rate ? rate.usd.toFixed(2).replace('.', ',') : null,
        EUR: rate && rate.eur ? rate.eur.toFixed(2).replace('.', ',') : null,
        USDT: usdtVal ? usdtVal.toFixed(2).replace('.', ',') : null,
      },
      tasas: {
        USD: rate ? rate.usd : null,
        EUR: rate && rate.eur ? rate.eur : null,
        USDT: usdtVal || null,
      },
      fuente: rate ? rate.fuente : null,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Error interno.' });
  }
};
