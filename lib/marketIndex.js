/* 個股/美股指數即時報價來源：
   - 台股個股：證交所官方 MIS 即時報價 API（免費，無需金鑰）
   - 美股指數：Yahoo Finance chart API（免費，無需金鑰，業界常用的非官方標準端點）
   兩者皆無 CORS 授權標頭，瀏覽器端無法直接呼叫，需透過此後端代理。 */
const TWSE_STOCKS = {
  tsmc: { code: '2330', name: '台積電' },
  mtk:  { code: '2454', name: '聯發科' },
};
const YAHOO_INDEXES = {
  dji:  { symbol: '%5EDJI',  name: '道瓊指數' },
  spx:  { symbol: '%5EGSPC', name: 'S&P 500' },
  ixic: { symbol: '%5EIXIC', name: '那斯達克' },
};

async function fetchTwseQuote(id) {
  const src = TWSE_STOCKS[id];
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
  const src = YAHOO_INDEXES[id];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${src.symbol}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  const meta = data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  if (!meta) return { id, name: src.name, price: null, change: null, changePercent: null };

  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = (price != null && prevClose != null) ? +(price - prevClose).toFixed(2) : null;
  const changePercent = (change != null && prevClose) ? +((change / prevClose) * 100).toFixed(2) : null;
  return { id, name: src.name, price, change, changePercent };
}

async function fetchAllMarketIndexes() {
  const [tsmc, mtk, dji, spx, ixic] = await Promise.all([
    fetchTwseQuote('tsmc'),
    fetchTwseQuote('mtk'),
    fetchYahooQuote('dji'),
    fetchYahooQuote('spx'),
    fetchYahooQuote('ixic'),
  ]);
  return { tsmc, mtk, dji, spx, ixic, updated_at: new Date().toISOString() };
}

module.exports = { fetchAllMarketIndexes };
