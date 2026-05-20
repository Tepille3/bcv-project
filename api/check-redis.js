const db = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  try {
    const rates = await db.getRates(30);
    res.json({
      redis_configured: !!(redisUrl && redisToken),
      redis_url_set: !!redisUrl,
      redis_token_set: !!redisToken,
      total_rates: rates.length,
      latest: rates[0] || null,
      rates: rates.map(r => ({ date: r.date, usd: r.usd, eur: r.eur })),
    });
  } catch (e) {
    res.json({ error: e.message });
  }
};