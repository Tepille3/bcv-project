const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // FUENTE 1: CriptoDolar (Muy específica para Venezuela)
    const resCripto = await axios.get('https://criptodolar.net/api/v1/quotes', { timeout: 8000 });
    const bcv = resCripto.data.find(i => i.provider === 'bcv');

    if (bcv && bcv.price > 0) {
      return res.status(200).json({
        success: true,
        monedas: { dolar: bcv.price.toFixed(2).replace('.', ','), euro: "---" },
        ultima_actualizacion: "Fuente: CriptoDolar (BCV)"
      });
    }

    // FUENTE 2: ExchangeRate.host (Alternativa si la anterior falla)
    const resHost = await axios.get('https://api.exchangerate.host/live?access_key=TU_KEY_OPCIONAL&symbols=VES');
    // Nota: Si no tienes key, a veces limita. Probemos una más abierta:
    
    const resBackup = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=ves');
    const precioUSDT = resBackup.data.tether.ves;

    return res.status(200).json({
      success: true,
      monedas: { 
        dolar: precioUSDT.toFixed(2).replace('.', ','), 
        euro: "---" 
      },
      ultima_actualizacion: "Fuente: Mercado Digital (USDT/VES)"
    });

  } catch (error) {
    return res.status(200).json({
      success: true,
      monedas: { dolar: "36,55", euro: "39,40" }, // Valor "quemado" (hardcoded) solo como último recurso
      ultima_actualizacion: "Modo Offline (Valores aprox)"
    });
  }
};