const { fetchAllMarketNews } = require('./marketNews');

/* 每日開門話題：跟「每日投資觀點」(generateMarketNote.js) 不同用途——
   那份是給顧問自己看的市場分析，這份是顧問可以直接照著說出口、拿來跟客戶破冰聊天的話題，
   刻意要求口語、貼近民生，不要分析腔，也不是投資建議 */
const SYSTEM_PROMPT = `你是「富得財富管理」顧問每天早上要用的「開門話題」產生器。目的是幫顧問從今天真實的市場新聞裡，找出幾個可以自然地跟客戶開場聊的輕鬆話題——不是要顧問去分析市場給客戶聽，是找一個讓客戶覺得「這個顧問有在關心我」、客戶聽了容易接話的切入點。

嚴格規則（務必遵守）：
1. 一定要輸出3個話題，每個話題都要是顧問可以直接照著說出口的一句話（口語、自然，像朋友聊天，不是書面報告語氣），不要用「根據...顯示」「本週OO指數上漲」這種分析腔開頭。
2. 內容必須基於下方提供的真實新聞素材，不要自己編造沒出現過的事件、數字或日期。
3. 話題盡量貼近「民生」「跟客戶切身相關」（例如：油價/電價/物價/房貸利率/股市漲跌對一般人退休金或存款的影響、最近很多人在討論的財經新聞），不要只談深奧的個股代號或總經名詞，要讓客戶一聽就懂、容易回話，不需要是投資類別，也可以是單純時事。
4. 絕對不能是任何投資建議、加碼/減碼建議或商品推薦，純粹是聊天破冰用的話題，結尾不要加「建議...」這類字眼。
5. 每個話題控制在30-55個中文字之間。
6. 只輸出純JSON，不要加任何說明文字或markdown code block標記，格式必須是：
{"topics":["話題一","話題二","話題三"]}`;

async function generateTalkTopics() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

  const sources = await fetchAllMarketNews();
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

  const sourcesText = sources.map(s =>
    `【${s.name}】${s.error ? `(抓取失敗：${s.error})` : s.text}`
  ).join('\n\n---\n\n');

  const userMessage = `今天日期：${dateStr}\n\n以下是今天蒐集到的市場新聞原始素材：\n\n${sourcesText}\n\n請依系統指示的規則，找出3個今天可以拿來跟客戶開場聊天的話題，輸出純JSON。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
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
  const textBlock = data.content?.find(b => b.type === 'text');
  let raw = textBlock?.text?.trim();
  if (!raw) throw new Error(`Anthropic API 未回傳文字內容 (stop_reason=${data.stop_reason})`);
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AI 回傳內容不是合法 JSON: ${raw.slice(0, 200)}`);
  }

  const topics = Array.isArray(parsed.topics)
    ? parsed.topics.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()).slice(0, 5)
    : [];
  if (!topics.length) throw new Error('AI 沒有回傳任何話題');

  return topics;
}

module.exports = { generateTalkTopics };
