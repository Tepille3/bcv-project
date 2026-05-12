const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Usamos CriptoDolar, que tiene una API muy limpia para el BCV
    const response = await axios.get('https://criptodolar.net/api/v1/quotes');
    const data = response.data;

    // Buscamos el objeto que corresponde al BCV
    const bcvData = data.find(item => item.provider === 'bcv');

    if (!bcvData) {
      throw new Error("No se encontró el proveedor BCV");
    }

    return res.status(200).json({
      success: true,
      monedas: {
        dolar: bcvData.price.toFixed(2).replace('.', ','),
        euro: "Cargando..." 
      },
      ultima_actualizacion: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
    });

  } catch (error) {
    // ÚLTIMO RECURSO: Una API global (aunque puede variar un poco el decimal)
    try {
      const globalRes = await axios.get('https://open.er-api.com/v6/latest/USD');
      const rate = globalRes.data.rates.VES;
      
      return res.status(200).json({
        success: true,
        monedas: {
          dolar: rate.toFixed(2).replace('.', ','),
          euro: "---"
        },
        ultima_actualizacion: "Fuente Global (Aprox)"
      });
    } catch (e2) {
      return res.status(500).json({ success: false, error: "Error crítico de conexión" });
    }
  }
};