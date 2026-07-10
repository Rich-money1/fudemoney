const { fetchAllMarketIndexes } = require('../lib/marketIndex');

/* 前端直接呼叫的公開只讀端點：市場指數即時報價（TWSE官方MIS + Yahoo Finance）
   前端每15秒輪詢一次，快取時間對齊輪詢頻率，避免邊緣快取讓浮動報價顯得卡住不動 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  try {
    const data = await fetchAllMarketIndexes();
    res.status(200).json(data);
  } catch (err) {
    console.error('讀取市場指數失敗', err);
    res.status(500).json({ error: err.message });
  }
};
