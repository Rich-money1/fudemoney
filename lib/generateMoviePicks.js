const THEMES = [
  '療癒系：適合心累時看的溫暖電影',
  '燒腦懸疑：需要動腦、看完想找人討論的片',
  '經典重溫：時間證明過的老片新看',
  '致鬱系：情緒濃烈、看完會沉默一陣子的片',
  '闔家歡樂：老少咸宜、適合一起看的片',
  '冷門遺珠：口碑好但知名度不高的片單外之作',
  '熱血動作：腎上腺素飆升的娛樂大片',
];

function pickTheme(date) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  return THEMES[dayOfYear % THEMES.length];
}

const SYSTEM_PROMPT = `你是「富得財富管理」AI電影頻道的選片編輯，負責每天為訪客精選6部值得一看的電影。

嚴格規則（務必遵守）：
1. 只能推薦真實存在、確實上映過的電影，片名、年份、類型都必須正確；不確定的資訊寧可保守也不要編造。絕對不能虛構片名或劇情。
2. 不要聲稱任何電影「現正在OO平台上架」等具體時效性資訊，因為串流上下架會變動，你沒有即時資料。availability欄位改用概括描述，例如「主要串流平台可找到」「院線/實體/串流皆有發行」「較冷門，需自行搜尋片名」。
3. 6部片要類型多樣（不要6部同類型），並包含至少1部知名度較低、值得被看見的片單外之作。
4. 每部片的hook欄位是一段40-70字「為什麼值得看」，用影評人口吻，避免爆雷關鍵轉折。
5. 只輸出純JSON陣列，不要加任何說明文字或markdown code block標記，格式必須是：
[{"title":"中文片名","original_title":"原文片名","year":"年份","genres":["類型1","類型2"],"hook":"為什麼值得看...","availability":"取得管道概括描述"}, ...]
陣列長度必須剛好6筆。`;

async function generateMoviePicks() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  const theme = pickTheme(today);

  const userMessage = `今天日期：${dateStr}
今天的選片方向參考（可當作靈感，不必嚴格照做，若跟真實片單衝突以規則2-4為準）：${theme}

請依系統指示的格式與規則，選出今天的6部精選電影，輸出純JSON陣列。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
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

  let picks;
  try {
    picks = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AI 回傳內容不是合法 JSON: ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(picks) || picks.length === 0) {
    throw new Error('AI 回傳格式不是非空陣列');
  }

  return { picks, theme };
}

module.exports = { generateMoviePicks };
