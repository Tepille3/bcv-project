const axios = require('axios');

module.exports = async (req, res) => {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    // Consultamos la API intermediaria
    const response = await axios.get('https://pydolarvenezuela-api.vercel.app/api/v1/dollar/page?page=bcv');
    const data = response.data;

    // Extraemos los valores
    const usd = data.monedas.usd.promedio;
    const eur = data.monedas.eur.promedio;

    // RESPUESTA CORRECTA: Usamos .json() directamente
    return res.status(200).json({
      success: true,
      monedas: {
        dolar: usd.toString().replace('.', ','),
        euro: eur.toString().replace('.', ',')
      },
      ultima_actualizacion: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      success: false, 
      error: "Error al obtener datos" 
    });
  }
};