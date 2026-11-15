/* 醫療險六大保障規劃（fude-site的medical.html）用：顧問拍1~3張保單/App保單明細/建議書照片，
   AI辨識出六大類別目前各自的保障內容，直接帶入前端對應的六張卡片。
   這份工具本身沒有登入限制（跟medical.html一致），純粹靠前端一次最多3張 + 壓圖控制用量。 */
const CATEGORY_KEYS = ['hospital', 'surgery', 'critical', 'accident', 'ltc', 'death'];

const SYSTEM_PROMPT = `你是「富得財富管理」醫療險六大保障規劃工具的保單辨識助理。顧問會拍1~3張保單、App保單明細頁或建議書的照片給你，你要從照片中盡量辨識出以下六大保障類別目前的保障內容，填入固定格式的JSON，方便直接帶入試算表單。

六大類別定義：
- hospital（住院醫療）：日額給付或住院雜費保障
- surgery（手術保障）：手術費、麻醉費相關給付
- critical（重大疾病）：癌症、心臟病、中風等重大疾病/傷病一次性給付
- accident（意外傷害）：意外醫療、意外殘廢給付
- ltc（失能照護）：長期照顧、失能扶助金（通常為月給付）
- death（身故保障）：身故、喪葬相關給付（含壽險主約保額）

嚴格規則（務必遵守）：
1. 每個類別如果照片裡完全沒有對應保障，coverages裡該key就整個填null，不要亂猜或編造數字。
2. 金額只能填照片上實際看到的數字（純數字，不要加逗號、單位文字、「約」等字樣）。
3. hospitalMisc 是「實支實付醫療雜費」額度（常見寫法如「每次住院給付上限」），沒有就填null。
4. annualPremium 是這張保單的總年繳保費（如果照片上寫的是月繳，就乘以12），看不出來就填null。
5. policyName 填保單/商品的正式名稱，看不出來就填null。
6. notes 簡短寫下辨識上的不確定之處（例如反光看不清楚），沒有不確定之處就填空字串。
7. 只輸出純JSON，不要加任何說明文字或markdown code block標記，格式必須是：
{"policyName":"...","annualPremium":數字或null,"hospitalMisc":數字或null,"coverages":{"hospital":{"amount":數字,"name":"..."}或null,"surgery":同上或null,"critical":同上或null,"accident":同上或null,"ltc":同上或null,"death":同上或null},"notes":"..."}`;

function sanitizeNumber(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v.replace(/[^\d.]/g, '')) : NaN);
  return (Number.isFinite(n) && n >= 0) ? Math.round(n) : null;
}

function sanitizeCoverage(v) {
  if (!v || typeof v !== 'object') return null;
  const amount = sanitizeNumber(v.amount);
  if (amount == null) return null;
  const name = (typeof v.name === 'string' && v.name.trim()) ? v.name.trim().slice(0, 60) : null;
  return { amount, name };
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

async function scanMedicalPolicy(images) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');
  if (!Array.isArray(images) || !images.length) throw new Error('沒有收到圖片');
  if (images.length > 3) throw new Error('一次最多 3 張圖片');

  const content = [];
  for (const img of images) {
    const parsed = parseDataUrl(img);
    if (!parsed) throw new Error('圖片格式錯誤');
    content.push({ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } });
  }
  content.push({ type: 'text', text: '請依系統指示辨識這些保單照片，輸出純JSON。' });

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
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // 回傳內容可能有多個content block，要找出真正的text區塊而非只取第一個（見lib/generateStockPicks.js的教訓）
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

  const coverages = {};
  CATEGORY_KEYS.forEach(k => { coverages[k] = sanitizeCoverage(parsed.coverages?.[k]); });

  return {
    policyName: (typeof parsed.policyName === 'string' && parsed.policyName.trim()) ? parsed.policyName.trim().slice(0, 60) : null,
    annualPremium: sanitizeNumber(parsed.annualPremium),
    hospitalMisc: sanitizeNumber(parsed.hospitalMisc),
    coverages,
    notes: (typeof parsed.notes === 'string') ? parsed.notes.trim().slice(0, 200) : '',
  };
}

module.exports = { scanMedicalPolicy, CATEGORY_KEYS };
