/* 技術分析引擎：抓歷史日K線 + 計算指標 + 算出「進場/止損/止盈」的客觀錨點
   錨點全部由規則算出（不靠AI憑空生成數字），AI只負責在錨點基礎上做文字判讀，
   避免止盈止損價位是模型幻覺出來的。 */

async function fetchDailyCandles(symbol, range = '6mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  const result = data.chart && data.chart.result && data.chart.result[0];
  const quote = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!result || !quote || !result.timestamp) throw new Error(`無K線資料: ${symbol}`);

  const { close, high, low } = quote;
  const candles = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    if (close[i] == null || high[i] == null || low[i] == null) continue;
    candles.push({
      date: new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10),
      high: high[i],
      low: low[i],
      close: close[i],
    });
  }
  return candles;
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/* RSI(14)，Wilder平滑法 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function bollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mid: mean, upper: mean + mult * sd, lower: mean - mult * sd };
}

/* ATR(14)：衡量近期波動幅度，用來抓止損距離 */
function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i], prev = candles[i - 1];
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

function computeIndicators(candles) {
  const closes = candles.map(c => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const bb = bollingerBands(closes, 20, 2);
  const atr14 = atr(candles, 14);
  const recent60 = candles.slice(-60);
  const resistance = recent60.length ? Math.max(...recent60.map(c => c.high)) : null;
  const support = recent60.length ? Math.min(...recent60.map(c => c.low)) : null;

  let trend = '盤整';
  if (sma20 != null && sma50 != null) {
    if (last.close > sma20 && sma20 > sma50) trend = '多頭';
    else if (last.close < sma20 && sma20 < sma50) trend = '空頭';
  }

  return {
    price: last.close,
    changePercent: prev ? +(((last.close - prev.close) / prev.close) * 100).toFixed(2) : null,
    sma20, sma50, rsi14, bb, atr14, support, resistance, trend,
  };
}

/* 依規則算出進場區間/止損/止盈的客觀錨點：
   - 多頭趨勢：拉回到「布林中軌(SMA20)～布林下軌」之間找買點
   - 非多頭但RSI<30（超賣）：貼近布林下軌找反彈買點
   - 其餘（空頭、無明確拉回訊號）：不給進場區間，代表當下觀望
   止損＝進場區間下緣再扣 1.5倍ATR，並取近60日支撐價與該值中較保守（高）者，避免止損設在支撐之下太遠
   止盈1＝進場區間上緣加 2倍ATR（風報比約1.3倍），止盈2＝近60日壓力價 */
function computeAnchors(ind) {
  const { sma20, bb, atr14, support, resistance, trend, rsi14 } = ind;
  if (atr14 == null || bb == null) return { entryLow: null, entryHigh: null, stopLoss: null, takeProfit1: null, takeProfit2: null };

  let entryLow = null, entryHigh = null;
  if (trend === '多頭') {
    entryLow = Math.min(bb.lower, sma20);
    entryHigh = sma20;
  } else if (rsi14 != null && rsi14 < 30) {
    entryLow = bb.lower;
    entryHigh = bb.mid;
  }

  if (entryLow == null || entryHigh == null) {
    return { entryLow: null, entryHigh: null, stopLoss: null, takeProfit1: null, takeProfit2: null };
  }

  const rawStop = entryLow - atr14 * 1.5;
  const stopLoss = support != null ? Math.max(rawStop, support * 0.98) : rawStop;
  const takeProfit1 = entryHigh + atr14 * 2;
  const takeProfit2 = resistance;

  const round = v => v == null ? null : +v.toFixed(4);
  return {
    entryLow: round(entryLow),
    entryHigh: round(entryHigh),
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    takeProfit2: round(takeProfit2),
  };
}

module.exports = { fetchDailyCandles, computeIndicators, computeAnchors, sma, rsi, bollingerBands, atr };
