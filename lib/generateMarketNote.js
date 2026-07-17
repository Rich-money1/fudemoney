const { fetchAllMarketNews } = require('./marketNews');

const SYSTEM_PROMPT = `你是「富得財富管理」的投資觀點撰寫人，負責把每天的市場新聞彙整成一段給客戶看的「每日投資觀點」。

核心哲學（務必融入操作建議段落，語氣一致）：
「防守層的月配息是不受市場漲跌干擾的固定現金流，進攻層才是市場波動的舞台」——防守層月配息基金照常收取，進攻層核心持倉（台股AI供應鏈、美股科技龍頭）逢拉回可加碼、不追高。

輸出格式規定（務必完全比照，直接輸出HTML片段，不要加其他說明文字）：
<strong>今日核心觀點（YYYY/MM/DD）：</strong> [一段整體市場趨勢總結，可用<em>關鍵字</em>標記重點，約100-150字]<br><br>
<strong>今日重點關注：</strong> [列出2-4個具體關注焦點，可用<em>關鍵字</em>標記重點，約80-120字]<br><br>
<strong>操作建議：</strong> [呼應防守層/進攻層哲學的具體建議，約60-100字，結尾可以引用核心哲學那句話]

寫作要求：
- 全部使用繁體中文，語氣專業但不生硬，像是理財顧問對客戶說話
- 內容必須基於下方提供的新聞素材，但用你自己的話重新整理，不要照抄原文
- 如果素材裡有雜訊(選單、頁尾等網頁雜訊)，直接忽略，只萃取真正的財經市場資訊
- 若素材不足以支撐具體觀點，可以合理延伸至台股/美股/AI供應鏈/升降息環境等常見總經主題，但語氣不要空泛`;

async function generateMarketNote() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

  const sources = await fetchAllMarketNews();
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;

  const sourcesText = sources.map(s =>
    `【${s.name}】(${s.url})\n${s.error ? `(抓取失敗：${s.error})` : s.text}`
  ).join('\n\n---\n\n');

  const userMessage = `今天日期：${dateStr}\n\n以下是今天蒐集到的市場新聞原始素材：\n\n${sourcesText}\n\n請依照系統指示的格式，輸出今天的「每日投資觀點」HTML片段。`;

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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text?.trim();
  if (!content) throw new Error('Anthropic API 未回傳內容');

  return content;
}

module.exports = { generateMarketNote };
