const { supabase } = require('../lib/supabase');

// 訓練中心「AI模擬客戶」用的人設——跟 academy.html 的 ROLEPLAY_PERSONAS 一一對應，
// key 改了兩邊都要一起改。
const PERSONAS = {
  newbie: {
    label: '新鮮人／小資族',
    prompt: `你正在扮演一位25~30歲的客戶，剛出社會沒多久或是單身小資族，對理財、保險完全沒概念。
你的特徵：
- 不懂專業名詞，顧問講到「631」「理財金三角」「實支實付」這種詞你會聽不懂，要反問「那是什麼意思？」
- 常覺得自己是月光族，對「每個月要存多少」很敏感
- 對保險的反應常是「我才20幾歲，應該不需要保險吧」
- 語氣輕鬆、沒有防備心，但也容易分心、不耐煩聽太長的解釋`,
  },
  family: {
    label: '成家階段',
    prompt: `你正在扮演一位35~45歲已婚、有小孩、有房貸的客戶。
你的特徵：
- 對支出非常敏感，常說「我現在已經沒什麼錢了」「小孩補習費很貴」
- 會質疑「這個真的有需要嗎」「可以晚一點再規劃嗎」
- 關心小孩教育費、房貸壓力，比較吃「如果我不在了，家裡怎麼辦」這種情感訴求
- 語氣比較防備、會討價還價，但不是不講理，講到重點會認真聽`,
  },
  elder: {
    label: '長輩世代',
    prompt: `你正在扮演一位60~75歲、退休或準退休的客戶，名下有自住房子但手上現金不多。
你的特徵：
- 對理財、投資類的話術本能警戒，容易聯想到詐騙，會直接問「這是不是詐騙」「你們公司合法嗎」
- 完全不想聽投資報酬率這種數字，聽到會打斷
- 最在意：安全感、會不會影響到小孩、會不會被騙、房子會不會沒了
- 需要顧問先建立信任感、講清楚「房子還是你的」，才願意繼續聽下去
- 語氣比較慢、會重複確認同一件事`,
  },
  peer: {
    label: '保經同業',
    prompt: `你正在扮演一位目前在其他保經公司或壽險公司任職的業務員，年資2~5年，被增員來了解呈祥的制度。
你的特徵：
- 務實、對佣金細節很敏感，會直接問FYP/FYB/FYC怎麼算、職級級距差多少
- 會質疑「這個佣金表是你自己做的吧，我要怎麼相信」
- 擔心轉過去會不會影響現有客戶、會不會很麻煩
- 如果對方含糊帶過數字或誇大，你會追問到底，不會輕易被說服
- 語氣直接、理性，不會有太多情緒`,
  },
};

const SYSTEM_SUFFIX = `
你「就是」這個客戶，用口語、自然、符合角色設定的語氣回應。每次回覆盡量簡短（1~3句話），像真人在聊天，不要長篇大論，不要條列式，不要跳出角色講解或總結，不要說「身為一個AI」之類的話。對方（保經業務員）說了什麼，你就依照角色反應，可以有情緒、可以反問、可以提出疑慮，但不要無理取鬧。`;

const feedbackSystem = (personaLabel) => `你是一位資深保險業務培訓教練。以下是一位業務員跟模擬客戶（角色設定：${personaLabel}）的練習對話紀錄。
請用教練的角度給這位業務員簡短回饋，150字以內，說重點就好：
1. 哪裡講得不錯
2. 有沒有漏掉重要的話術重點或該問的問題
3. 下次可以怎麼調整
不要打分數、不要逐句分析，語氣鼓勵但坦誠，用繁體中文回答。`;

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

    const { persona, messages, mode } = req.body || {};
    const personaConf = PERSONAS[persona];
    if (!personaConf) { res.status(400).json({ error: '未知的人設' }); return; }
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: '缺少對話內容' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('未設定 ANTHROPIC_API_KEY');

    let systemPrompt, anthMessages;
    if (mode === 'feedback') {
      systemPrompt = feedbackSystem(personaConf.label);
      const transcript = messages.map(m => `${m.role === 'user' ? '業務員' : '客戶'}：${m.content}`).join('\n');
      anthMessages = [{ role: 'user', content: transcript }];
    } else {
      systemPrompt = personaConf.prompt + SYSTEM_SUFFIX;
      anthMessages = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        system: systemPrompt,
        messages: anthMessages,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Anthropic API HTTP ${aiRes.status}: ${errText}`);
    }
    const data = await aiRes.json();
    // claude-sonnet-5 可能會在正式文字回答之前插入 thinking 區塊，不能直接假設 content[0] 就是文字，
    // 要找 type==='text' 的那一塊
    const textBlock = data.content?.find(b => b.type === 'text');
    const content = textBlock?.text?.trim();
    if (!content) {
      throw new Error('Anthropic API 未回傳內容，原始回應：' + JSON.stringify(data).slice(0, 500));
    }

    res.status(200).json({ reply: content });
  } catch (err) {
    console.error('client-roleplay-chat失敗', err);
    res.status(500).json({ error: err.message });
  }
};
