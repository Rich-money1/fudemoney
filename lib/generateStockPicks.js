const { fetchQuotesBatch } = require('./stockQuotes');
const { fetchAllMarketNews } = require('./marketNews');
const { TW_UNIVERSE, US_UNIVERSE } = require('./stockPickUniverse');

const RATING_WORDS = ['積極買進', '買進', '持有', '觀察'];
const RISK_WORDS = ['極低', '低', '中', '中高', '高'];
const TARGET_RE = /^\+\d+~\d+%$/;

const SYSTEM_PROMPT = `你是「富得財富管理」的股票觀察清單分析師，負責根據每天真實的收盤價、漲跌幅與基本論點，重新評估台股/美股精選清單裡每一檔股票的「評等」「潛力空間%」「風險等級」「進場建議」，並給出排序用的信心分數。

嚴格規則（務必遵守）：
1. 「進場建議」(note)：只能使用系統訊息裡提供的真實股價／漲跌幅數字，絕對不能自己編造或修改任何價格、百分比。若股價資料為 null（抓取失敗），就不要提到任何具體價格，只寫基本面/題材觀點。每句約40-70個中文字，語氣像專業投顧內部簡短備註，不要加招呼語。
2. 「評等」(rating) 的基礎詞只能從這4個裡選一個：積極買進、買進、持有、觀察。風險明顯升高或降低時可額外加註「（風險上調）」或「（風險下降）」後綴，但前面的基礎詞仍必須是這4個之一。
3. 「風險等級」(risk) 只能從這5個詞裡選一個：極低、低、中、中高、高。
4. 「潛力空間%」(target) 格式必須是 "+N~M%"（N、M為整數，M大於N），這是給顧問內部參考的區間，不是對外的具體報酬保證。
5. 除非基本面、題材或股價出現明顯變化（例如單日大幅漲跌、重大新聞），評等/風險/潛力空間%應維持與「前次評等／前次風險／前次潛力空間」一致或相近，不要毫無理由每天大幅跳動。
6. 「信心分數」(conviction)：0-100整數，數字越高代表你認為這檔股票當前的進場吸引力越高，純粹用來排序，不會顯示給使用者看。
7. 只輸出純JSON，不要加任何說明文字或markdown code block標記，格式必須是：
{"tw":{"股票代號":{"note":"...","rating":"...","target":"+N~M%","risk":"...","conviction":數字}, ...每一檔都要有}, "us":{"Ticker":{...}, ...每一檔都要有}}`;

function buildUserMessage(twQuotes, usQuotes, newsText, dateStr) {
  const line = (s, q) => {
    const priceInfo = q.price != null
      ? `收盤${q.price}（${q.changePercent >= 0 ? '+' : ''}${q.changePercent}%）`
      : '（股價資料暫缺）';
    return `- ${s.code} ${s.name}：${priceInfo}，基本論點：${s.thesis}，前次評等：${s.rating}，前次風險：${s.risk}，前次潛力空間：${s.target}`;
  };

  const twLines = TW_UNIVERSE.map(s => line(s, twQuotes[s.code] || {})).join('\n');
  const usLines = US_UNIVERSE.map(s => line(s, usQuotes[s.code] || {})).join('\n');

  return `今天日期：${dateStr}

【台股清單】
${twLines}

【美股清單】
${usLines}

【今日市場新聞素材】
${newsText}

請依系統指示的格式與規則，為上面每一檔股票重新評估評等/潛力空間%/風險等級/信心分數，並各寫一句「進場建議」評語，輸出純JSON。`;
}

// AI回傳的欄位可能格式跑掉或缺漏，逐項檢查落在合法範圍內，不合法就退回前次基準值，避免髒資料顯示給使用者
function sanitizePick(entry, base) {
  const rating = (typeof entry?.rating === 'string' && RATING_WORDS.some(w => entry.rating.includes(w)))
    ? entry.rating : base.rating;
  const risk = RISK_WORDS.includes(entry?.risk) ? entry.risk : base.risk;
  const target = (typeof entry?.target === 'string' && TARGET_RE.test(entry.target)) ? entry.target : base.target;
  const conviction = Number.isFinite(entry?.conviction) ? Math.max(0, Math.min(100, Math.round(entry.conviction))) : 50;
  const note = (typeof entry?.note === 'string' && entry.note.trim()) ? entry.note.trim() : null;
  return { note, rating, target, risk, conviction };
}

async function generateStockPicks() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

  const twCodes = TW_UNIVERSE.map(s => s.code);
  const usCodes = US_UNIVERSE.map(s => s.code);

  // 報價與新聞互不依賴，平行抓取縮短總執行時間（此函式併入 update-fund-data.js 既有的每日排程，需控制在Vercel函式逾時上限內）
  const [quotes, newsSources] = await Promise.all([
    fetchQuotesBatch(twCodes, usCodes),
    fetchAllMarketNews(),
  ]);

  const twQuotes = {}, usQuotes = {};
  twCodes.forEach(c => { twQuotes[c] = quotes[c]; });
  usCodes.forEach(c => { usQuotes[c] = quotes[c]; });

  const newsText = newsSources.map(s =>
    `【${s.name}】${s.error ? `(抓取失敗：${s.error})` : s.text}`
  ).join('\n\n');

  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}`;

  const userMessage = buildUserMessage(twQuotes, usQuotes, newsText, dateStr);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // 回傳內容可能是多個content block（例如思考區塊），要找出真正的text區塊而非只取第一個
  const textBlock = data.content?.find(b => b.type === 'text');
  const raw = textBlock?.text?.trim();
  if (!raw) throw new Error(`Anthropic API 未回傳文字內容 (stop_reason=${data.stop_reason})`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AI 回傳內容不是合法 JSON: ${raw.slice(0, 200)}`);
  }

  const tw_picks = {}, us_picks = {};
  TW_UNIVERSE.forEach(s => { tw_picks[s.code] = sanitizePick(parsed.tw?.[s.code], s); });
  US_UNIVERSE.forEach(s => { us_picks[s.code] = sanitizePick(parsed.us?.[s.code], s); });

  return { tw_picks, us_picks };
}

module.exports = { generateStockPicks };
