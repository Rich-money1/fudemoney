const { supabase } = require('../lib/supabase');
const { fetchAllMarketIndexes } = require('../lib/marketIndex');

/* InstaNeural：IG 內容引擎（instaneural.html 專用）
   前端傳 mode 決定要生成什麼，後端用同一支 Anthropic 呼叫，
   統一要求 AI 回 JSON，前端才能逐段落渲染＋逐段複製。
   新增 mode 時：這裡加 PROMPTS 的一筆，前端 renderers 也要加對應的渲染函式。 */

/* 三個帳號定位——跟 instaneural.html 的 POSITIONING 一一對應，key 改了兩邊都要一起改 */
const POSITIONING = {
  wealth: {
    label: '富得財富管理（理財顧問本業）',
    brief: `帳號定位：資產顧問 Eddie，品牌名「富得財富管理」（Fude Wealth），主打「月配息現金流 × 資產配置」。
品牌標籤請用富得財富管理／Fude相關字樣，不要自創其他人名或品牌。
核心哲學（文案要能自然帶到，不要生硬）：「防守層的月配息是不受市場漲跌干擾的固定現金流，進攻層才是市場波動的舞台。」
常用武器：631理財金三角（6日常支出／3投資理財／1風險管理）、月配息基金現金流試算、保單活化／保單貸款、六大保障缺口。
目標受眾：30~55歲上班族、雙薪家庭、準退休族；痛點是「薪水存不下來」「怕退休沒錢」「手上資產不會生錢」。
這個帳號的紅線（金融內容受法規管制，踩到的代價遠高於一支爆款）：
不保證獲利、不預測特定標的漲跌、不寫「一定」「保證」「穩賺」「無風險」，談報酬要提風險或用區間描述；引用客戶案例要先取得同意。`,
  },
  recruit: {
    label: '呈祥保經增員（招募）',
    brief: `帳號定位：呈祥保經的增員招募，品牌名「呈祥保經」，講職涯與收入結構，不是賣保單。
品牌標籤請用呈祥保經相關字樣，不要自創其他人名或品牌。
常用武器：FYP→FYB→FYC 的佣金邏輯（加碼倍數不算收入，講清楚才有可信度）、保經 vs 壽險公司的商品選擇性、理賠糾紛的立場差異、法律顧問資源、職級級距。
目標受眾：22~35歲想轉職／想要收入天花板更高的人，以及現職壽險業務員（同業）；痛點是「現在的工作沒有成長」「同業制度綁手綁腳」「想知道實際能賺多少」。
語氣：務實、數字講得出來、不販賣暴富幻想——誇大收入會立刻失去同業信任。
這個帳號的紅線（金融內容受法規管制，踩到的代價遠高於一支爆款）：
不保證獲利、不預測特定標的漲跌、不寫「一定」「保證」「穩賺」「無風險」，談報酬要提風險或用區間描述；引用客戶案例要先取得同意。`,
  },
  style: {
    label: '個人風格帳號（穿搭 × 品味）',
    brief: `帳號定位：個人風格帳號，主軸「穿搭 × 品味」，心理觀察為輔，比重大約 7:3。
視覺與語氣：冷調質感——低飽和、留白、構圖乾淨。文字克制，少用驚嘆號與表情符號，不要網紅腔（「姐妹們～」「真的絕了」「必收」這類一律不用），寧可冷一點也不要熱鬧。
目標受眾：25~35 歲女性，以及服飾品牌、KOL、選品店這些同業觀察者。她們追蹤的理由是「這是我想成為的樣子」，不是「這個好便宜」。

這類帳號的演算法邏輯跟知識型帳號不同，產內容時務必對準：
- 穿搭吃的是「身分認同」＋「可模仿性」。抽象的美感宣言不會被儲存，具體的穿搭公式、比例、色票、單品清單才會。要讓人覺得這個風格我學得來、單品我找得到替代。
- 對比結構最容易衝完播率：同一件三種穿法、before/after、便宜版 vs 貴版的實際差別在哪。
- 心理類貼文吃的是「被說中」→ 轉發給朋友說「這就是你」。要戳得具體，不要寫成心靈雞湯或人人適用的空話。
- 不要用教學口吻。這個帳號的權威感來自品味本身，不是來自說教。

這個帳號的紅線：
- 不貶低身材、外貌、年齡；除了「顯瘦」「比例」這種中性穿搭用語之外不評價身材，不碰減重與醫美暗示
- 有業配或聯盟連結一定要標註
- 不拿別人的穿搭照或品牌圖當自己的內容
- **這個帳號不談投資理財、不導流到金融服務**。那是另一個帳號的事，混在一起會兩邊都失焦——這條沒有例外。`,
  },
  life: {
    label: '生活理財混合（衝觸及用）',
    brief: `帳號定位：用生活場景切入理財，這是觸及最廣、最容易被非粉絲看到的內容線。經營者是資產顧問 Eddie，品牌名「富得財富管理」。
品牌標籤請用富得財富管理／Fude相關字樣，不要自創其他人名或品牌。
題材：房貸／租屋、育兒教育費、外送訂閱小額支出、年終獎金、婚禮與蜜月、長輩的房子、醫療自費、旅遊預算。
作法：先用生活共鳴把人留住，最後30%才轉到理財觀念，不要一開頭就上專業名詞。
目標受眾：泛大眾（25~50歲），不預設有理財知識。
這個帳號的紅線（金融內容受法規管制，踩到的代價遠高於一支爆款）：
不保證獲利、不預測特定標的漲跌、不寫「一定」「保證」「穩賺」「無風險」，談報酬要提風險或用區間描述；引用客戶案例要先取得同意。`,
  },
};

const GROWTH_CORE = `你是 IG 成長策略與短影音腳本專家，服務台灣的個人品牌帳號。
每個帳號的領域與紅線寫在下方「帳號定位」裡，那是最高指導原則；本段只講所有帳號共通的演算法機制。

你必須內化的 IG 觸及機制（所有產出都要服務這幾條，不要只是漂亮文案）：
1. 觸及主要來自推薦（Reels／探索），不是粉絲牆。所以每一篇的第一目標是「讓完全不認識他的人看完」。
2. 演算法最吃的訊號依序是：分享（傳給朋友）＞ 儲存 ＞ 看完率／重看 ＞ 留言 ＞ 讚。所以每篇都要有明確的「為什麼會被分享」和「為什麼會被儲存」的設計。
3. 前 3 秒（或圖卡第一頁）決定一切。鉤子要具體、有數字、有衝突或有代價，不要「你知道嗎」「大家好」這種開場。
4. 留言引導要「低門檻、可以一個字回答」，例如選 A 或 B、回答一個數字，不要問開放式大問題。
5. Hashtag 要分層：大標籤（百萬級，衝曝光）＋中標籤（10~50萬，精準）＋小標籤（1萬以下，容易排進熱門）＋個人品牌標籤。總數控制在 8~15 個。
   品牌標籤只能從下面「帳號定位」裡給的真實品牌名產生，**絕對不可以自己發明人名、暱稱或虛構的品牌**（例如掰一個「理財顧問阿明」出來）。
   文案、圖卡、口白裡提到自己時也一樣，只能用給定的品牌名，不確定就不要提。
6. 可儲存的內容（清單、數字表、步驟、可對照的級距）比純抒情貼文長期帶來更多粉絲。

絕對不要建議的事（會被降觸及或封號）：買粉、互追群、機器人自動留言／自動追蹤退追、一次大量私訊陌生人、未經同意引用他人的案例或照片。

所有文案一律使用繁體中文台灣用語，口語、像真人在講話，不要大陸用詞、不要 AI 味的排比句。
輸出一律只回一個合法 JSON 物件，不要加 markdown 程式碼框、不要任何說明文字。`;

const PROMPTS = {
  pack: {
    maxTokens: 8000,
    system: `${GROWTH_CORE}

這次任務：針對使用者給的主題，產出一個「可以直接發的完整貼文包」。

JSON 格式（務必完全照這個結構，陣列長度照標註）：
{
  "title": "這篇的內部命名，10字內",
  "format": "建議形式：Reels / 圖卡輪播 / 單圖 其中一個，並用一句話說為什麼",
  "hooks": ["5個可替換的開場鉤子，每個20字內，風格各不相同（數字型／反直覺型／代價型／對話型／清單型）"],
  "carousel": [{"page":1,"headline":"該頁大標，12字內","body":"該頁內文，40字內，口語"}],
  "reels": {"duration":"建議秒數","scenes":[{"t":"0-3s","visual":"畫面怎麼拍／畫面上要出現什麼字","script":"口白逐字稿"}]},
  "caption": "完整貼文文案，含換行（用\\n），開頭第一行就是最強的鉤子，中間給乾貨，結尾CTA＋一行留言引導。約150~300字",
  "hashtags": {"big":["3~4個大標籤"],"mid":["3~5個中標籤"],"small":["3~5個小標籤"],"brand":["1~2個個人品牌標籤"]},
  "save_trigger": "一句話說明這篇為什麼會被儲存",
  "share_trigger": "一句話說明這篇為什麼會被傳給朋友",
  "comment_hook": "發文後自己要在留言區補的第一則留言（補充資訊或延伸問題，用來拉第一波互動）",
  "best_time": "建議發文時段，含理由，一句話",
  "risk_note": "這篇在金融法遵上要避開的講法，一句話；沒有風險就寫「無」"
}
carousel 給 6~8 頁；reels.scenes 給 4~6 個場景。`,
  },

  calendar: {
    maxTokens: 6000,
    system: `${GROWTH_CORE}

這次任務：排一份 30 天的 IG 內容日曆。

排程原則：
- 先定 4~5 條內容柱（content pillar）並給出比例，比例要以「衝觸及的內容多於賣東西的內容」為前提。
- Reels 要佔一半以上（Reels 是目前唯一能大量觸及非粉絲的形式）。
- 每 5~7 天安排一篇「高儲存值」的工具型內容（清單／級距表／試算），這是把流量留成粉絲的關鍵。
- 每 7~10 天才安排一次明確的轉換型內容（預約諮詢／索取資料），不要天天賣。
- 同一週內主題不要重複，30 天要看得出節奏（暖身→建立專業→衝爆款→轉換）。

JSON 格式：
{
  "pillars": [{"name":"柱名","ratio":"佔比如30%","why":"為什麼需要這一柱，一句話","sample":"一個範例主題"}],
  "weekly_rhythm": "一段話說明一週的節奏怎麼跑",
  "days": [{"day":1,"format":"Reels/圖卡/單圖/限動","pillar":"對應柱名","topic":"具體主題","hook":"開場鉤子，20字內","goal":"這篇要拿到的訊號：觸及/儲存/分享/留言/轉換 其中一個"}],
  "kpi": [{"metric":"要追的指標","target":"30天後的合理目標","note":"怎麼看這個數字"}]
}
days 必須給完整 30 天（day 1 到 day 30），每天一筆。kpi 給 4~5 筆。`,
  },

  remix: {
    maxTokens: 8000,
    system: `${GROWTH_CORE}

這次任務：把「今天的真實市場數據與投資觀點」改寫成 IG 內容。這是這個帳號最大的差異化武器——每天都有新鮮素材，而且別人沒有。

額外規則：
- 數字必須完全採用素材裡給的數字，不可以自己編造或推測漲跌。
- 不要預測明天怎麼走，改成「這代表什麼」「一般人該注意什麼」。
- 一定要把市場事件翻譯成「對一般上班族的錢有什麼影響」，這才會被分享。

JSON 格式與 pack 相同：
{
  "title":"", "format":"",
  "hooks":["5個"],
  "carousel":[{"page":1,"headline":"","body":""}],
  "reels":{"duration":"","scenes":[{"t":"","visual":"","script":""}]},
  "caption":"", 
  "hashtags":{"big":[],"mid":[],"small":[],"brand":[]},
  "save_trigger":"", "share_trigger":"", "comment_hook":"", "best_time":"", "risk_note":""
}
carousel 給 5~7 頁（第一頁要放今天最有衝擊力的那個數字）；reels.scenes 給 4~5 個場景。`,
  },

  audit: {
    maxTokens: 4000,
    system: `${GROWTH_CORE}

這次任務：健檢使用者貼上的現有貼文文案，指出為什麼它衝不出去，然後改寫。
批評要具體——指出是哪一句、問題在哪、換成什麼，不要「可以更吸引人」這種空話。

JSON 格式：
{
  "score": 0到100的整數,
  "verdict": "一句話總評，直說它目前最大的問題",
  "diagnosis": [{"issue":"具體問題（要引用原文的字）","why":"為什麼這樣會被演算法吃掉","fix":"具體怎麼改"}],
  "rewritten_hooks": ["3個改寫後的開場第一行"],
  "rewritten_caption": "整篇改寫後的文案，含換行（用\\n）",
  "hashtags": {"big":[],"mid":[],"small":[],"brand":[]},
  "missing_signal": "原文最缺的是哪一種演算法訊號（分享/儲存/看完率/留言），一句話說怎麼補"
}
diagnosis 給 3~5 筆。`,
  },

  hooks: {
    maxTokens: 3500,
    system: `${GROWTH_CORE}

這次任務：針對使用者給的題目，大量產出開場鉤子（Reels 前 3 秒口白／圖卡第一頁大字／文案第一行通用）。

JSON 格式：
{
  "hooks": [{"text":"鉤子本體，22字內","type":"數字型/反直覺型/代價型/對話型/清單型/恐懼型/身分認同型 其中一個","why":"為什麼這句會讓人停下來，一句話"}],
  "best_three": ["從上面挑出最該先拍的3句，直接重複那3句的 text"]
}
hooks 給 20 筆，七種 type 都要出現，不要有兩句講同一件事。`,
  },
};

function extractJson(text) {
  let t = text.trim();
  // AI 偶爾還是會包 ```json 框，先剝掉
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI 回傳的不是 JSON');
  return JSON.parse(t.slice(start, end + 1));
}

/* remix 模式的素材：今天的投資觀點（daily_market_note）＋ 即時指數 ＋ 進攻層訊號 */
async function buildMarketContext() {
  const parts = [];

  const { data: note } = await supabase
    .from('daily_market_note').select('content,updated_at').eq('id', 1).single();
  if (note && note.content) {
    const plain = String(note.content).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    parts.push(`【今日投資觀點（${note.updated_at || ''}）】\n${plain}`);
  }

  try {
    // fetchAllMarketIndexes 回的是 { updated_at, taiex:{...}, tsmc:{...}, ... } 這種物件，不是陣列
    const indexes = await fetchAllMarketIndexes();
    const rows = Object.entries(indexes)
      .filter(([k, v]) => k !== 'updated_at' && v && v.price != null)
      .map(([, v]) => `${v.name}：${v.price}（${v.changePercent ?? '-'}%）`)
      .join('\n');
    if (rows) parts.push(`【今日主要指數】\n${rows}`);
  } catch (err) {
    console.warn('ig-content 取指數失敗，略過', err.message);
  }

  try {
    const { data: signals } = await supabase
      .from('trading_signals').select('symbol,name,trend,signal,change_percent').limit(10);
    if (signals && signals.length) {
      parts.push('【進攻層技術訊號（內部參考，文案不要點名個股買賣進出）】\n' +
        signals.map(s => `${s.name || s.symbol}：${s.trend || ''}／${s.signal || ''}`).join('\n'));
    }
  } catch (err) {
    console.warn('ig-content 取訊號失敗，略過', err.message);
  }

  return parts.join('\n\n');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: '請先登入' }); return; }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData || !userData.user) {
      res.status(401).json({ error: '登入已過期，請重新登入' });
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('status').eq('id', userData.user.id).single();
    if (profileError || !profile || profile.status !== 'active') {
      res.status(403).json({ error: '帳號尚未開通，請聯繫管理者確認繳費狀態' });
      return;
    }

    const { mode, positioning, topic, audience, extra, caption } = req.body || {};
    const conf = PROMPTS[mode];
    if (!conf) { res.status(400).json({ error: '未知的模式' }); return; }
    const pos = POSITIONING[positioning] || POSITIONING.wealth;

    if (mode === 'audit' && !String(caption || '').trim()) {
      res.status(400).json({ error: '請貼上要健檢的貼文文案' });
      return;
    }
    if (mode !== 'audit' && mode !== 'remix' && !String(topic || '').trim()) {
      res.status(400).json({ error: '請先輸入主題' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

    const blocks = [`${pos.brief}`];
    if (audience) blocks.push(`這次特別想打的受眾：${audience}`);
    if (topic) blocks.push(`主題：${topic}`);
    if (extra) blocks.push(`補充條件：${extra}`);
    if (caption) blocks.push(`要健檢的原始文案：\n"""\n${caption}\n"""`);
    if (mode === 'remix') {
      const marketContext = await buildMarketContext();
      blocks.push(marketContext
        ? `今天的真實素材如下（數字只能用這裡的）：\n${marketContext}`
        : '（今天抓不到市場素材，請改用通用的總經觀念切入，不要編造任何數字）');
    }
    blocks.push('請依系統指示輸出 JSON。');

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: conf.maxTokens,
        system: conf.system,
        messages: [{ role: 'user', content: blocks.join('\n\n') }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Anthropic API HTTP ${aiRes.status}: ${errText}`);
    }
    const data = await aiRes.json();
    // claude-sonnet-5 可能在正式回答前插入 thinking 區塊，要找 type==='text' 的那一塊
    const raw = data.content?.find(b => b.type === 'text')?.text?.trim();
    if (!raw) throw new Error('AI 未回傳內容，原始回應：' + JSON.stringify(data).slice(0, 500));
    // 寫到一半被 max_tokens 切掉的話 JSON 一定不完整，要講明白是截斷，
    // 不然前端只會顯示「格式解析失敗」，看起來像格式問題而不是長度問題
    const truncated = data.stop_reason === 'max_tokens';

    let result;
    try {
      result = extractJson(raw);
    } catch (parseErr) {
      // 解析失敗不要讓使用者白等一次，把原文丟回前端用純文字顯示
      res.status(200).json({
        mode, raw, truncated,
        parseError: truncated ? '內容太長被截斷了' : parseErr.message,
      });
      return;
    }

    res.status(200).json({ mode, result });
  } catch (err) {
    console.error('ig-content失敗', err);
    res.status(500).json({ error: err.message });
  }
};
