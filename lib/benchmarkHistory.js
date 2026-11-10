/* 大盤指數歷史資料（Yahoo Finance chart API），供基金績效走勢圖疊圖比較用 */
const BENCHMARKS = {
  twii: { symbol: '%5ETWII', name: '台灣加權指數' },
  ixic: { symbol: '%5EIXIC', name: '那斯達克' },
  gspc: { symbol: '%5EGSPC', name: 'S&P 500' },
  dji:  { symbol: '%5EDJI',  name: '道瓊工業指數' },
};

// 任意 Yahoo ticker 直接查（用於0050.TW這類ETF，不限於上面四個固定大盤指數）
async function fetchYahooHistory(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  const result = data.chart && data.chart.result && data.chart.result[0];
  if (!result) return [];
  const ts = result.timestamp || [];
  const closes = (result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    const d = new Date(ts[i] * 1000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    out.push({ date: iso, value: closes[i] });
  }
  return out;
}

async function fetchBenchmarkHistory(key, range, interval) {
  const bm = BENCHMARKS[key];
  if (!bm) throw new Error(`未知的大盤指數: ${key}`);
  const points = await fetchYahooHistory(bm.symbol, range, interval);
  return { name: bm.name, points };
}

module.exports = { BENCHMARKS, fetchYahooHistory, fetchBenchmarkHistory };
