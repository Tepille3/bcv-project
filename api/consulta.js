const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Intentamos CriptoDolar (Fuente Principal)
    const response = await axios.get('https://criptodolar.net/api/v1/quotes', { timeout: 5000 });
    const bcvData = response.data.find(item => item.provider === 'bcv');

    if (bcvData && bcvData.price) {
      return res.status(200).json({
        success: true,
        monedas: { dolar: bcvData.price.toFixed(2).replace('.', ','), euro: "---" },
        ultima_actualizacion: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
      });
    }
    throw new Error("No bcv data");

  } catch (error) {
    try {
      // PLAN B: ExchangeRate API (Muy estable)
      const globalRes = await axios.get('https://open.er-api.com/v6/latest/USD');
      const rate = globalRes.data.rates.VES;
      
      if (!rate) throw new Error("No VES rate");

      return res.status(200).json({
        success: true,
        monedas: {
          dolar: rate.toFixed(2).replace('.', ','),
          euro: "---"
        },
        ultima_actualizacion: "Fuente Global (Sincronizada)"
      });
    } catch (e2) {
      return res.status(500).json({ success: false, error: "Servidores ocupados, intenta en 1 minuto" });
    }
  }
};