const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const instance = axios.create({
      httpsAgent: new https.Agent({  
        rejectUnauthorized: false // Esto ayuda si el certificado del BCV da problemas
      })
    });

    const { data } = await instance.get('https://www.bcv.org.ve/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000 
    });

    const $ = cheerio.load(data);

    // Los selectores ID del BCV a veces cambian levemente. Intentamos extraer por el ID específico:
    const dolar = $('#dolar strong').text().trim().replace(',', '.');
    const euro = $('#euro strong').text().trim().replace(',', '.');

    if (!dolar) {
      throw new Error("No se pudo encontrar el valor del dólar en el HTML");
    }

    res.status(200).json({
      success: true,
      monedas: { dolar, euro },
      ultima_actualizacion: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
    });

  } catch (error) {
    console.error("DETALLE DEL ERROR:", error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      ayuda: "El BCV podría estar bloqueando la IP de Vercel o cambió su estructura HTML."
    });
  }
};