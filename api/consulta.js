const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Usamos una API que ya tiene la data procesada
    const { data } = await axios.get('https://pydolarvenezuela-api.vercel.app/api/v1/dollar/page?page=bcv');

    // Extraemos dólar y euro del formato que nos da esta API
    const usd = data.monedas.usd.promedio;
    const eur = data.monedas.eur.promedio;

    res.status(200).json({
      success: true,
      monedas: {
        dolar: usd.toString().replace('.', ','),
        euro: eur.toString().replace('.', ',')
      },
      ultima_actualizacion: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: "Error al obtener datos del puente" 
    });
  }
};