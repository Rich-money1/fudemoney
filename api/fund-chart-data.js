const { FUND_SOURCES, fetchNavHistory } = require('../lib/moneydj');
const { BENCHMARKS, fetchYahooHistory, fetchBenchmarkHistory } = require('../lib/benchmarkHistory');

/* 基金績效走勢圖：抓基金真實淨值歷史 + 大盤指數歷史，各自正規化成「相對區間起點的累計報酬率%」疊圖比較
   GET /api/fund-chart-data?fund=allianz&benchmark=gspc&range=1y
   fund：FUND_SOURCES裡的基金id，或 idx:<yahoo ticker> 直接指定一個Yahoo指數/ETF當作「基金」線（例如 tw0050/sp500 這兩個本身就是追蹤指數的標的）
   benchmark：twii | ixic | gspc | dji
   range：6m | 1y | 2y | 3y | 5y | max */
const RANGE_CONFIG = {
  '6m': { days: 183,  yahooRange: '6mo', interval: '1d' },
  '1y': { days: 365,  yahooRange: '1y',  interval: '1d' },
  '2y': { days: 730,  yahooRange: '2y',  interval: '1wk' },
  '3y': { days: 1095, yahooRange: '3y',  interval: '1wk' },
  '5y': { days: 1826, yahooRange: '5y',  interval: '1wk' },
  'max':{ days: 3652, yahooRange: '10y', interval: '1mo' },
};

function fmtDate(d) {
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

// 正規化：第一個有效值當基準(0%)，之後每個點算相對基準的累計報酬率%
function normalize(points, dateKey, valueKey) {
  const valid = points.filter(p => p[valueKey] != null && !isNaN(p[valueKey]));
  if (valid.length === 0) return [];
  const base = valid[0][valueKey];
  return valid.map(p => [p[dateKey], +(((p[valueKey] - base) / base) * 100).toFixed(2)]);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  const fundParam = req.query.fund;
  const benchmarkKey = req.query.benchmark || 'gspc';
  const range = RANGE_CONFIG[req.query.range] ? req.query.range : '1y';
  const cfg = RANGE_CONFIG[range];

  if (!fundParam) {
    res.status(400).json({ error: '請提供 fund 參數' });
    return;
  }
  if (!BENCHMARKS[benchmarkKey]) {
    res.status(400).json({ error: `未知的大盤指數: ${benchmarkKey}` });
    return;
  }

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - cfg.days);

  try {
    let fundName, fundRawPoints;

    if (fundParam.startsWith('idx:')) {
      // tw0050 / sp500 這類本身就是指數/ETF的「基金」，直接用Yahoo歷史資料當基金線
      const ticker = fundParam.slice(4);
      const label = { '0050.TW': '元大台灣50（0050）', '%5EGSPC': 'S&P 500' }[ticker] || ticker;
      const points = await fetchYahooHistory(ticker, cfg.yahooRange, cfg.interval);
      fundName = label;
      fundRawPoints = points.map(p => ({ date: p.date, nav: p.value }));
    } else {
      if (!FUND_SOURCES[fundParam]) {
        res.status(400).json({ error: `未知的基金: ${fundParam}` });
        return;
      }
      const points = await fetchNavHistory(fundParam, fmtDate(fromDate), fmtDate(today));
      fundName = fundParam;
      fundRawPoints = points;
    }

    const benchmark = await fetchBenchmarkHistory(benchmarkKey, cfg.yahooRange, cfg.interval);

    const fundSeries = normalize(fundRawPoints, 'date', 'nav');
    const benchmarkSeries = normalize(benchmark.points, 'date', 'value');

    res.status(200).json({
      fund: fundParam,
      fundName,
      benchmarkKey,
      benchmarkName: benchmark.name,
      range,
      fundSeries,
      benchmarkSeries,
    });
  } catch (err) {
    console.error(`讀取基金績效走勢圖失敗 fund=${fundParam} benchmark=${benchmarkKey}`, err);
    res.status(500).json({ error: err.message });
  }
};
