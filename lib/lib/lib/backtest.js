/* 策略回測：把 lib/indicators.js 的規則型錨點邏輯（跟正式盯盤用的是同一套函式，
   不是另外寫一套規則）套到歷史K線上逐日重播，模擬「進場區間被觸及就進場，
   之後看先碰到止損還是止盈，或超過持有天數上限就出場」，統計勝率與期望值。
   只回測系統算出來的錨點規則，不模擬AI的文字判讀（那部分無法用機械規則驗證）。 */
const { fetchDailyCandles } = require('./yahoo');
const { computeIndicators, computeAnchors } = require('./indicators');

const MIN_HISTORY = 60;   // 至少要有60天資料才開始跑指標
const MAX_HOLD_DAYS = 40; // 逾時出場天數

function finishTrade(entry, exitDate, exitPrice, reason, daysHeld) {
  const pnlPct = ((exitPrice - entry.entryPrice) / entry.entryPrice) * 100;
  return {
    entryDate: entry.entryDate,
    entryPrice: +entry.entryPrice.toFixed(4),
    exitDate,
    exitPrice: +exitPrice.toFixed(4),
    reason, // 'stop_loss' | 'take_profit' | 'timeout'
    daysHeld,
    pnlPct: +pnlPct.toFixed(2),
    win: pnlPct > 0,
  };
}

function summarize(trades) {
  const n = trades.length;
  if (n === 0) {
    return { trades, totalTrades: 0, winRate: null, avgWin: null, avgLoss: null, expectancy: null };
  }
  const wins = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const winRate = (wins.length / n) * 100;
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;
  const expectancy = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;
  return {
    trades,
    totalTrades: n,
    winRate: +winRate.toFixed(1),
    avgWin: +avgWin.toFixed(2),
    avgLoss: +avgLoss.toFixed(2),
    expectancy: +expectancy.toFixed(2),
  };
}

function runBacktestOnCandles(candles) {
  const trades = [];
  let inPosition = false;
  let entry = null;

  for (let i = MIN_HISTORY; i < candles.length; i++) {
    const today = candles[i];

    if (!inPosition) {
      const windowCandles = candles.slice(0, i + 1);
      const ind = computeIndicators(windowCandles);
      const anchors = computeAnchors(ind);

      if (anchors.entryLow != null && anchors.entryHigh != null &&
          today.low <= anchors.entryHigh && today.high >= anchors.entryLow) {
        inPosition = true;
        entry = {
          entryIndex: i,
          entryDate: today.date,
          entryPrice: Math.min(Math.max(today.close, anchors.entryLow), anchors.entryHigh),
          stopLoss: anchors.stopLoss,
          takeProfit: anchors.takeProfit1,
        };
      }
      continue;
    }

    const daysHeld = i - entry.entryIndex;
    if (entry.stopLoss != null && today.low <= entry.stopLoss) {
      trades.push(finishTrade(entry, today.date, entry.stopLoss, 'stop_loss', daysHeld));
      inPosition = false; entry = null;
    } else if (entry.takeProfit != null && today.high >= entry.takeProfit) {
      trades.push(finishTrade(entry, today.date, entry.takeProfit, 'take_profit', daysHeld));
      inPosition = false; entry = null;
    } else if (daysHeld >= MAX_HOLD_DAYS) {
      trades.push(finishTrade(entry, today.date, today.close, 'timeout', daysHeld));
      inPosition = false; entry = null;
    }
  }

  return summarize(trades);
}

async function runBacktest(symbol, range = '2y') {
  const candles = await fetchDailyCandles(symbol, range);
  if (candles.length < MIN_HISTORY + 10) throw new Error('歷史資料不足，無法回測');
  return runBacktestOnCandles(candles);
}

module.exports = { runBacktest, runBacktestOnCandles };
