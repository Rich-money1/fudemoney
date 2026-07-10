/* 市場指數即時報價來源（取代 TradingView 免費 widget）：
   - 台股（加權指數 + 個股）：證交所官方 MIS 即時報價 API（免費，無需金鑰）
   - 美股指數 / 匯率 / 貴金屬：Yahoo Finance chart API（免費，無需金鑰，業界常用的非官方標準端點）
   兩者皆無 CORS 授權標頭，瀏覽器端無法直接呼叫，需透過此後端代理。 */
const TWSE_QUOTES = {
  taiex: { code: 't00', name: '加權指數' },
  tsmc:  { code: '2330', name: '台積電' },
  mtk:   { code: '2454', name: '聯發科' },
};
const YAHOO_QUOTES = {
  dji:    { symbol: '%5EDJI',  name: '道瓊指數' },
  spx:    { symbol: '%5EGSPC', name: 'S&P 500' },
  ixic:   { symbol: '%5EIXIC', name: '那斯達克' },
  usdtwd: { symbol: 'USDTWD=X', name: '美元/台幣' },
  jpytwd: { symbol: 'JPYTWD=X', name: '日幣/台幣' },
  eurtwd: { symbol: 'EURTWD=X', name: '歐元/台幣' },
  gold:   { symbol: 'GC=F', name: '黃金' },
  silver: { symbol: 'SI=F', name: '銀' },
};

async function fetchTwseQuote(id) {
  const src = TWSE_QUOTES[id];
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${src.code}.tw&json=1&delay=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  const row = data.msgArray && data.msgArray[0];
  if (!row) return { id, name: src.name, price: null, change: null, changePercent: null };

  const price = parseFloat(row.z) || parseFloat(row.pz) || null;
  const prevClose = parseFloat(row.y) || null;
  const change = (price != null && prevClose != null) ? +(price - prevClose).toFixed(2) : null;
  const changePercent = (change != null && prevClose) ? +((change / prevClose) * 100).toFixed(2) : null;
  return { id, name: src.name, price, change, changePercent };
}

async function fetchYahooQuote(id) {
  const src = YAHOO_QUOTES[id];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${src.symbol}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  const meta = data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  if (!meta) return { id, name: src.name, price: null, change: null, changePercent: null };

  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = (price != null && prevClose != null) ? +(price - prevClose).toFixed(4) : null;
  const changePercent = (change != null && prevClose) ? +((change / prevClose) * 100).toFixed(2) : null;
  return { id, name: src.name, price, change, changePercent };
}

async function fetchAllMarketIndexes() {
  const twseIds = Object.keys(TWSE_QUOTES);
  const yahooIds = Object.keys(YAHOO_QUOTES);
  const results = await Promise.all([
    ...twseIds.map(fetchTwseQuote),
    ...yahooIds.map(fetchYahooQuote),
  ]);
  const out = { updated_at: new Date().toISOString() };
  [...twseIds, ...yahooIds].forEach((id, i) => { out[id] = results[i]; });
  return out;
}

module.exports = { fetchAllMarketIndexes };
