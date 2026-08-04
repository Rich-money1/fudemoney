const { runBacktest } = require('../lib/backtest');

/* 策略回測：?symbol=2330.TW&range=2y，任何代碼都能查（不限於watchlist/holdings） */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  const { symbol, range } = req.query;
  if (!symbol) return res.status(400).json({ error: '缺少 symbol 參數' });

  try {
    const result = await runBacktest(symbol, range || '2y');
    res.status(200).json({ symbol, ...result });
  } catch (err) {
    console.error('回測失敗', err);
    res.status(500).json({ error: err.message });
  }
};
