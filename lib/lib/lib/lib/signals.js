const { supabase } = require('./supabase');
const { fetchDailyCandles } = require('./yahoo');
const { computeIndicators, computeAnchors } = require('./indicators');
const { fetchTechnicalRating } = require('./tradingview');
const { notifyAll } = require('./notify');

const SYSTEM_PROMPT = `你是我自己在用的技術面盯盤助理，這是個人工具，不是要發給任何客戶的投資建議。

你會收到系統已經算好的技術指標（RSI、均線、布林通道、ATR、MACD、KD、近期支撐壓力），以及系統依規則算出的「進場區間／止損／止盈」參考錨點；如果我目前有持有這檔，也會告訴你我的成本與未實現損益。

規則（務必遵守）：
- entry_low/entry_high/stop_loss/take_profit_1/take_profit_2 這幾個錨點若為 null，代表系統判斷目前沒有明確的拉回買點，你就回傳 null，不要自己編造數字。
- 若錨點不是 null，你可以在錨點基礎上做「合理微調」（±3%以內，貼近K線整數關卡或前波高低點皆可），但不能大幅偏離系統給的錨點，止盈止損的數字必須是根據資料算出來的，不能憑感覺捏造。
- 注意：當趨勢是「空頭」但錨點仍非null時，代表是RSI超賣的逆勢反彈訊號（接刀），不是順勢拉回買點，風險比多頭拉回買點高很多——這種情況通常應標為「觀望」，只有在RSI極度超賣且價格站在強力支撐才考慮標為「買進區間」，並在rationale說明這是短線逆勢反彈、需嚴設停損。
- 用一句話判斷目前訊號分類：只能是「買進區間」「觀望」「避免追高」「跌破止損」「盤整」其中一個。
- 如果我目前持有這檔，rationale要結合我的成本與未實現損益給判斷（例如已經套牢要不要停損、已經獲利要不要移動停利），不要只講技術面不管我的部位。
- 如果有附上「TradingView技術評級」，那是非官方資料來源僅供參考，可以當作額外的市場情緒佐證寫進rationale，但entry_low/entry_high/stop_loss/take_profit_1/take_profit_2還是只能根據系統給的錨點微調，不能因為TradingView評級就自己另外編一組數字；如果TradingView評級跟系統技術指標矛盾，以系統技術指標為準，可以在rationale提一句「跟TradingView評級不同調」。
- rationale 用繁體中文寫60-100字，白話講重點，語氣像自己寫筆記，不要用「保證」「必賺」等字眼——止盈止損只是風險管理參考，不是保證。

只能輸出純JSON，不要加任何說明文字或markdown code fence，格式如下：
{"signal": "...", "rationale": "...", "entry_low": number|null, "entry_high": number|null, "stop_loss": number|null, "take_profit_1": number|null, "take_profit_2": number|null}`;

function fmt(v) {
  return v == null ? 'null' : v;
}

async function buildUniverse() {
  const [{ data: holdings, error: hErr }, { data: watchlist, error: wErr }] = await Promise.all([
    supabase.from('holdings').select('symbol, name, market, quantity, cost_basis'),
    supabase.from('watchlist').select('symbol, name, market'),
  ]);
  if (hErr) throw hErr;
  if (wErr) throw wErr;

  const map = new Map();
  (watchlist || []).forEach(item => map.set(item.symbol, { symbol: item.symbol, name: item.name, market: item.market }));
  (holdings || []).forEach(item => {
    const existing = map.get(item.symbol) || {};
    map.set(item.symbol, {
      ...existing,
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      quantity: item.quantity,
      cost_basis: item.cost_basis,
    });
  });
  return [...map.values()];
}

async function callClaude(item, ind, anchors, tv) {
  const holdingLine = (item.quantity != null && item.cost_basis != null)
    ? `\n我目前持有此標的：${item.quantity} 股，平均成本 ${item.cost_basis}，未實現損益 ${(((ind.price - item.cost_basis) / item.cost_basis) * 100).toFixed(2)}%`
    : '';
  const tvLine = tv ? `\nTradingView技術評級（非官方資料，僅供參考）：${tv.rating}（分數 ${tv.score}）` : '';

  const userMessage = `標的：${item.name}（${item.symbol}）　類別：${item.market}
現價：${fmt(ind.price)}　漲跌幅：${fmt(ind.changePercent)}%
趨勢：${ind.trend}　RSI(14)：${fmt(ind.rsi14)}
SMA20：${fmt(ind.sma20)}　SMA50：${fmt(ind.sma50)}
布林通道：上軌 ${fmt(ind.bb && ind.bb.upper)} / 中軌 ${fmt(ind.bb && ind.bb.mid)} / 下軌 ${fmt(ind.bb && ind.bb.lower)}
ATR(14)：${fmt(ind.atr14)}
MACD：${fmt(ind.macd && ind.macd.macd)}　訊號線：${fmt(ind.macd && ind.macd.signal)}　柱狀圖：${fmt(ind.macd && ind.macd.histogram)}
KD：K=${fmt(ind.kd && ind.kd.k)}　D=${fmt(ind.kd && ind.kd.d)}
近60日支撐：${fmt(ind.support)}　近60日壓力：${fmt(ind.resistance)}${holdingLine}${tvLine}

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
  const tv = await fetchTechnicalRating(item); // 非官方資料，內部已try/catch，失敗回傳null不影響主流程
  const parsed = await callClaude(item, ind, anchors, tv);

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
    macd: ind.macd ? ind.macd.macd : null,
    macd_signal: ind.macd ? ind.macd.signal : null,
    macd_histogram: ind.macd ? ind.macd.histogram : null,
    kd_k: ind.kd ? ind.kd.k : null,
    kd_d: ind.kd ? ind.kd.d : null,
    support: ind.support,
    resistance: ind.resistance,
    tv_rating: tv ? tv.rating : null,
    tv_score: tv ? tv.score : null,
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

async function runSignals() {
  const universe = await buildUniverse();
  if (universe.length === 0) return { updated: [], errors: [] };

  const symbols = universe.map(u => u.symbol);
  const { data: previousRows } = await supabase.from('signals').select('symbol, signal').in('symbol', symbols);
  const previousMap = new Map((previousRows || []).map(r => [r.symbol, r.signal]));

  const settled = await runBatched(universe, 4, analyzeSymbol);

  const rows = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(r.value);
    else errors.push({ symbol: universe[i].symbol, error: r.reason.message });
  });

  if (rows.length > 0) {
    const { error } = await supabase.from('signals').upsert(rows, { onConflict: 'symbol' });
    if (error) throw error;
  }
  if (errors.length) console.error('部分標的分析失敗', errors);

  /* 訊號「新變成」買進區間或跌破止損才通知，避免每天重複轟炸同一個已知狀態 */
  const notable = rows.filter(r => {
    const prev = previousMap.get(r.symbol);
    return (r.signal === '買進區間' || r.signal === '跌破止損') && prev !== r.signal;
  });
  let notified = [];
  if (notable.length > 0) {
    const lines = notable.map(r => `${r.name}(${r.symbol})：${r.signal}　現價 ${r.price}`).join('\n');
    await notifyAll('盯盤智能助理：訊號變化通知', lines).catch(err => console.error('通知發送失敗', err.message));
    notified = notable.map(r => r.symbol);
  }

  return { updated: rows.map(r => ({ symbol: r.symbol, name: r.name, signal: r.signal })), errors, notified };
}

module.exports = { runSignals, analyzeSymbol, buildUniverse };
