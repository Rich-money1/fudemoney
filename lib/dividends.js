/* 被動收入／現金流：用 Yahoo Finance 的除息事件資料算出每檔持倉的
   trailing 12個月配息、預估年化收入、殖利率，供「現金流」頁面使用。
   純讀取歷史事實（哪天發過多少配息），不對未來配息日期做預測承諾。 */
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; InvestDashboardBot/1.0)' };

async function fetchDividendHistory(symbol, range = '2y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&events=div`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${symbol}`);
  const data = await res.json();
  const result = data.chart && data.chart.result && data.chart.result[0];
  const divEvents = result && result.events && result.events.dividends;
  if (!divEvents) return [];
  return Object.values(divEvents)
    .map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* dividendEvents：fetchDividendHistory的回傳值；quantity：持有股數；currentPrice：現價（算殖利率用） */
function summarizeDividends(dividendEvents, quantity, currentPrice) {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().slice(0, 10);
  const trailing = dividendEvents.filter(d => d.date >= cutoff);

  const perShareTrailing12mo = trailing.reduce((a, d) => a + d.amount, 0);
  const annualIncome = perShareTrailing12mo * quantity;
  const yieldPct = (currentPrice && perShareTrailing12mo) ? (perShareTrailing12mo / currentPrice) * 100 : null;

  const byMonth = {};
  trailing.forEach(d => {
    const month = d.date.slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + d.amount * quantity;
  });

  return {
    perShareTrailing12mo: +perShareTrailing12mo.toFixed(4),
    annualIncome: +annualIncome.toFixed(2),
    yieldPct: yieldPct != null ? +yieldPct.toFixed(2) : null,
    byMonth,
    events: trailing,
  };
}

module.exports = { fetchDividendHistory, summarizeDividends };
