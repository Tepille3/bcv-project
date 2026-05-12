const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Habilitar CORS para que tu frontend pueda leer los datos
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const { data } = await axios.get('https://www.bcv.org.ve/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    const $ = cheerio.load(data);

    // Extraemos los valores usando los selectores específicos de la web del BCV
    const usd = $('#dolar strong').text().trim();
    const eur = $('#euro strong').text().trim();

    res.status(200).json({
      success: true,
      monedas: {
        dolar: usd,
        euro: eur
      },
      ultima_actualizacion: new Date().toLocaleString('es-VE')
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error al conectar con el origen" });
  }
};