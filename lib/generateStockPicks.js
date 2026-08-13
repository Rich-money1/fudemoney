const { fetchQuotesBatch } = require('./stockQuotes');
const { fetchAllMarketNews } = require('./marketNews');
const { TW_UNIVERSE, US_UNIVERSE } = require('./stockPickUniverse');

const SYSTEM_PROMPT = `你是「富得財富管理」的股票觀察清單撰寫人，負責把每天的真實收盤價與市場新聞，重寫成「進場建議」欄位的一句話評語。

嚴格規則（務必遵守）：
1. 每檔股票只能使用系統訊息裡提供的「真實股價／漲跌幅」數字，絕對不能自己編造或修改任何價格、百分比。
2. 若某檔股票的股價資料為 null（抓取失敗），該句評語就不要提到任何具體價格，只寫基本面/題材觀點即可。
3. 每句話約 40-70 個中文字，語氣像專業投顧對顧問內部使用的簡短備註，不要加多餘的招呼語。
4. 台股格式範例："7/17收盤2,290元（-2.1%），N2製程量產基本面未變，CoWoS訂單仍滿載，逢急殺為長線布局良機"
5. 美股格式範例："最新收盤202.81美元（約-3.9%），隨AI類股估值疑慮同步拉回，Rubin架構與GB300供不應求的基本面未變"
6. 必須融入該股提供的「基本論點」，可以合理延伸但不要偏離論點核心。
7. 只輸出純JSON，不要加任何說明文字或markdown code block標記，格式必須是：
{"tw":{"股票代號":"評語", ...每一檔都要有}, "us":{"Ticker":"評語", ...每一檔都要有}}`;

function buildUserMessage(twQuotes, usQuotes, newsText, dateStr) {
  const twLines = TW_UNIVERSE.map(s => {
    const q = twQuotes[s.code] || {};
    const priceInfo = q.price != null
      ? `收盤${q.price}元（${q.changePercent >= 0 ? '+' : ''}${q.changePercent}%）`
      : '（股價資料暫缺）';
    return `- ${s.code} ${s.name}：${priceInfo}，基本論點：${s.thesis}`;
  }).join('\n');

  const usLines = US_UNIVERSE.map(s => {
    const q = usQuotes[s.code] || {};
    const priceInfo = q.price != null
      ? `收盤${q.price}美元（${q.changePercent >= 0 ? '+' : ''}${q.changePercent}%）`
      : '（股價資料暫缺）';
    return `- ${s.code} ${s.name}：${priceInfo}，基本論點：${s.thesis}`;
  }).join('\n');

  return `今天日期：${dateStr}

【台股清單】
${twLines}

【美股清單】
${usLines}

【今日市場新聞素材】
${newsText}

請依系統指示的格式與規則，為上面每一檔股票各寫一句「進場建議」評語，輸出純JSON。`;
}

async function generateStockPicks() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

  const twCodes = TW_UNIVERSE.map(s => s.code);
  const usCodes = US_UNIVERSE.map(s => s.code);
  const quotes = await fetchQuotesBatch(twCodes, usCodes);

  const twQuotes = {}, usQuotes = {};
  twCodes.forEach(c => { twQuotes[c] = quotes[c]; });
  usCodes.forEach(c => { usQuotes[c] = quotes[c]; });

  const newsSources = await fetchAllMarketNews();
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Anthropic API 未回傳內容');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AI 回傳內容不是合法 JSON: ${raw.slice(0, 200)}`);
  }

  return { tw_notes: parsed.tw || {}, us_notes: parsed.us || {} };
}

module.exports = { generateStockPicks };
