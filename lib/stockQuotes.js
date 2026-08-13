/* 個股即時報價（供台股/美股精選 TOP 20 每日自動更新股價用）
   台股：證交所官方 MIS 即時報價 API（免金鑰）
   美股：Yahoo Finance chart API（免金鑰，業界常用非官方端點）
   兩者皆無 CORS 授權標頭，僅能在後端呼叫，故獨立於 lib/marketIndex.js（那份是給前端浮動報價列用，維持不動） */

async function fetchTwStockQuote(code) {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${code}.tw&json=1&delay=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${code}`);
  const data = await res.json();
  const row = data.msgArray && data.msgArray[0];
  if (!row) return { code, price: null, change: null, changePercent: null };

  const price = parseFloat(row.z) || parseFloat(row.pz) || null;
  const prevClose = parseFloat(row.y) || null;
  const change = (price != null && prevClose != null) ? +(price - prevClose).toFixed(2) : null;
  const changePercent = (change != null && prevClose) ? +((change / prevClose) * 100).toFixed(2) : null;
  return { code, price, change, changePercent };
}

async function fetchUsStockQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${symbol}`);
  const data = await res.json();
  const meta = data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  if (!meta) return { code: symbol, price: null, change: null, changePercent: null };

  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = (price != null && prevClose != null) ? +(price - prevClose).toFixed(2) : null;
  const changePercent = (change != null && prevClose) ? +((change / prevClose) * 100).toFixed(2) : null;
  return { code: symbol, price, change, changePercent };
}

/* codes: 台股代號陣列（如 ['2330','2382']）；symbols: 美股Ticker陣列（如 ['NVDA','MSFT']）
   平行呼叫以縮短總執行時間（此函式併入 update-fund-data.js 既有的每日排程，需控制在Vercel函式逾時上限內），
   回傳 { code: {price,change,changePercent} } */
async function fetchQuotesBatch(codes, symbols) {
  const out = {};
  const results = await Promise.allSettled([
    ...codes.map(code => fetchTwStockQuote(code)),
    ...symbols.map(symbol => fetchUsStockQuote(symbol)),
  ]);
  const allKeys = [...codes, ...symbols];
  allKeys.forEach((key, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      out[key] = r.value;
    } else {
      console.error(`報價抓取失敗 ${key}`, r.reason);
      out[key] = { code: key, price: null, change: null, changePercent: null };
    }
  });
  return out;
}

module.exports = { fetchTwStockQuote, fetchUsStockQuote, fetchQuotesBatch };
