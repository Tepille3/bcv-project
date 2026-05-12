const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Usamos el endpoint principal que es más estable
    const response = await axios.get('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?monitor=bcv');
    const data = response.data;

    // La estructura de esta API puede variar, así que aseguramos la captura
    const precioUsd = data.last_update ? data.price : data.moneda === 'USD' ? data.price : null;
    
    // Si la respuesta anterior falla, intentamos la ruta directa alternativa
    const usdValue = precioUsd || data.price || "0,00";

    return res.status(200).json({
      success: true,
      monedas: {
        dolar: usdValue.toString().replace('.', ','),
        euro: "Consulte BCV" // El euro suele variar menos, nos enfocamos en que el USD funcione
      },
      ultima_actualizacion: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
    });

  } catch (error) {
    // Si falla la API anterior, usamos una SEGUNDA fuente (criptodolar)
    try {
      const backup = await axios.get('https://pydolarvenezuela-api.vercel.app/api/v1/dollar/page?page=criptodolar');
      const usdBackup = backup.data.monedas.bcv.promedio;
      
      return res.status(200).json({
        success: true,
        monedas: {
          dolar: usdBackup.toString().replace('.', ','),
          euro: "---"
        },
        ultima_actualizacion: "Backup: " + new Date().toLocaleTimeString()
      });
    } catch (e2) {
      return res.status(500).json({ success: false, error: "Fuentes no disponibles" });
    }
  }
};