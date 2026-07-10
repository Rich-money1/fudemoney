const { fetchAllMarketIndexes } = require('../lib/marketIndex');

/* 前端直接呼叫的公開只讀端點：台積電/聯發科/道瓊/S&P500/那斯達克即時報價
   （TradingView 免費 widget 對這幾檔僅顯示「此商品僅適用TradingView」，改用官方/常用免費資料源代理） */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  try {
    const data = await fetchAllMarketIndexes();
    res.status(200).json(data);
  } catch (err) {
    console.error('讀取市場指數失敗', err);
    res.status(500).json({ error: err.message });
  }
};
