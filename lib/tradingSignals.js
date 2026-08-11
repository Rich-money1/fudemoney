const { supabase } = require('./supabase');
const { buildWatchlist } = require('./watchlist');
const { fetchDailyCandles, computeIndicators, computeAnchors } = require('./technicalAnalysis');
const { processVirtualTrades } = require('./virtualTrades');

const SYSTEM_PROMPT = `你是「富得財富管理」內部使用的技術面盯盤助理，供持牌顧問自己盯盤參考，不是要直接發送給客戶的投資建議或要約。

你會收到系統已經算好的技術指標（RSI、均線、布林通道、ATR、近期支撐壓力），以及系統依規則算出的「進場區間／止損／止盈」參考錨點。

規則（務必遵守）：
- entry_low/entry_high/stop_loss/take_profit_1/take_profit_2 這幾個錨點若為 null，代表系統判斷目前沒有明確的拉回買點，你就回傳 null，不要自己編造數字。
- 若錨點不是 null，你可以在錨點基礎上做「合理微調」（±3%以內，貼近K線整數關卡或前波高低點皆可），但不能大幅偏離系統給的錨點，止盈止損的數字必須是根據資料算出來的，不能憑感覺捏造。
- 注意：當趨勢是「空頭」但錨點仍非null時，代表是RSI超賣的逆勢反彈訊號（接刀），不是順勢拉回買點，風險比多頭拉回買點高很多——這種情況通常應標為「觀望」，只有在RSI極度超賣且價格站在強力支撐才考慮標為「買進區間」，並在rationale說明這是短線逆勢反彈、需嚴設停損。
- 用一句話判斷目前訊號分類：只能是「買進區間」「觀望」「避免追高」「跌破止損」「盤整」其中一個。
- rationale 用繁體中文寫60-100字，白話解釋目前技術面狀況、為什麼給這個訊號，語氣像顧問跟自己筆記，不要用「保證」「必賺」等字眼——止盈止損只是風險管理參考，不是保證。

只能輸出純JSON，不要加任何說明文字或markdown code fence，格式如下：
{"signal": "...", "rationale": "...", "entry_low": number|null, "entry_high": number|null, "stop_loss": number|null, "take_profit_1": number|null, "take_profit_2": number|null}`;

function fmt(v) {
  return v == null ? 'null' : v;
}

async function callClaude(item, ind, anchors) {
  const userMessage = `標的：${item.name}（${item.symbol}）　類別：${item.market}
現價：${fmt(ind.price)}　漲跌幅：${fmt(ind.changePercent)}%
趨勢：${ind.trend}　RSI(14)：${fmt(ind.rsi14)}
SMA20：${fmt(ind.sma20)}　SMA50：${fmt(ind.sma50)}
布林通道：上軌 ${fmt(ind.bb && ind.bb.upper)} / 中軌 ${fmt(ind.bb && ind.bb.mid)} / 下軌 ${fmt(ind.bb && ind.bb.lower)}
ATR(14)：${fmt(ind.atr14)}
近60日支撐：${fmt(ind.support)}　近60日壓力：${fmt(ind.resistance)}

系統計算的參考錨點：
進場區間：${fmt(anchors.entryLow)} ~ ${fmt(anchors.entryHigh)}
止損：${fmt(anchors.stopLoss)}
止盈1：${fmt(anchors.takeProfit1)}
止盈2（壓力位）：${fmt(anchors.takeProfit2)}

請輸出JSON判讀結果。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Anthropic API 未回傳內容');
  const jsonText = raw.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(jsonText);
}

async function analyzeSymbol(item) {
  const candles = await fetchDailyCandles(item.symbol, '6mo');
  if (candles.length < 30) throw new Error(`${item.symbol} K線資料不足`);

  const ind = computeIndicators(candles);
  const anchors = computeAnchors(ind);
  const parsed = await callClaude(item, ind, anchors);

  return {
    symbol: item.symbol,
    name: item.name,
    market: item.market,
    price: ind.price,
    change_percent: ind.changePercent,
    trend: ind.trend,
    rsi14: ind.rsi14,
    sma20: ind.sma20,
    sma50: ind.sma50,
    atr14: ind.atr14,
    support: ind.support,
    resistance: ind.resistance,
    signal: parsed.signal ?? null,
    rationale: parsed.rationale ?? null,
    entry_low: parsed.entry_low ?? null,
    entry_high: parsed.entry_high ?? null,
    stop_loss: parsed.stop_loss ?? null,
    take_profit_1: parsed.take_profit_1 ?? null,
    take_profit_2: parsed.take_profit_2 ?? null,
    updated_at: new Date().toISOString(),
  };
}

/* 分批（每批4檔）跑分析，避免同時發太多請求，也讓整體執行時間可控 */
async function runBatched(items, batchSize, fn) {
  const settled = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    settled.push(...await Promise.allSettled(batch.map(fn)));
  }
  return settled;
}

async function runTradingSignals() {
  const watchlist = buildWatchlist();
  const settled = await runBatched(watchlist, 4, analyzeSymbol);

  const rows = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(r.value);
    else errors.push({ symbol: watchlist[i].symbol, error: r.reason.message });
  });

  if (rows.length > 0) {
    const { error } = await supabase.from('trading_signals').upsert(rows, { onConflict: 'symbol' });
    if (error) throw error;
  }
  if (errors.length) console.error('部分標的盯盤分析失敗', errors);

  let virtualTrades = { closed: [], opened: [] };
  if (rows.length > 0) {
    try {
      virtualTrades = await processVirtualTrades(rows);
    } catch (err) {
      console.error('虛擬倉結算/開倉失敗', err);
    }
  }

  return { updated: rows.map(r => ({ symbol: r.symbol, name: r.name, signal: r.signal })), errors, virtualTrades };
}

module.exports = { runTradingSignals, analyzeSymbol };
