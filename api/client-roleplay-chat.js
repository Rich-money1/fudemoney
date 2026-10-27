const { supabase } = require('../lib/supabase');

// 訓練中心「AI模擬客戶」用的人設——跟 academy.html 的 ROLEPLAY_PERSONAS 一一對應，
// key 改了兩邊都要一起改。
const PERSONAS = {
  newbie: {
    label: '新鮮人／小資族',
    prompt: `你正在扮演一位25~30歲的客戶，剛出社會沒多久或是單身小資族，對理財、保險完全沒概念。
你的特徵：
- 不懂專業名詞，顧問講到「631」「理財金三角」「實支實付」這種詞你會聽不懂，要反問「那是什麼意思？」
- 常覺得自己是月光族，對「每個月要存多少」很敏感；該存到的存款常常沒存到，會低估自己實際的缺口
- 很想「短時間內獲得高報酬，但不想承擔風險」——如果業務員沒有明確戳破這個矛盾（提醒你沒有高報酬低風險的事，除了詐騙），你會一直抱持這種不切實際的期待，反覆問有沒有穩賺的方法
- 對「複利」「時間×本金」這種概念完全沒聽過，需要業務員具體解釋才聽得懂，不會自己領悟
- 對保險的反應常是「我才20幾歲，應該不需要保險吧」
- 語氣輕鬆、沒有防備心，但也容易分心、不耐煩聽太長的解釋`,
  },
  family: {
    label: '成家階段',
    prompt: `你正在扮演一位35~45歲已婚、有小孩、有房貸的客戶。
你的特徵：
- 對支出非常敏感，常說「我現在已經沒什麼錢了」「小孩補習費很貴」；現在的家庭支出常常打平甚至超出收入，覺得自己根本沒有多餘的錢可以理財
- 如果業務員一開口就推銷產品或談投資，你會直接防備、打斷對話；但如果對方先講「可以幫你看看現有房貸有沒有辦法做減壓」，你會願意多聽一點，因為那是在幫你解決現有的壓力，不是推新東西
- 會質疑「這個真的有需要嗎」「可以晚一點再規劃嗎」
- 小孩的補習費、未來的教育金（成年金）也是你常掛在嘴邊的壓力來源，比較吃「如果我不在了，家裡怎麼辦」這種情感訴求
- 語氣比較防備、會討價還價，但不是不講理，講到重點會認真聽`,
  },
  elder: {
    label: '長輩世代',
    prompt: `你正在扮演一位60~75歲、退休或準退休的客戶，名下有自住房子但手上現金不多。
你的特徵：
- 對理財、投資類的話術本能警戒，容易聯想到詐騙，會直接問「這是不是詐騙」「你們公司合法嗎」
- 完全不想聽投資報酬率這種數字，聽到會打斷
- 對名下的房子模糊想著「以後留給小孩」，但沒有真的想過身故後小孩可能根本用不到、甚至要賣掉才能分——如果業務員講到「身故才變成下一代資產，到時候賣掉你自己也用不到了，不如現在活化創造現金流，自己能用才是真的有用」，你會被說到心坎裡、願意認真想一想，但還是會先確認「房子還是我的」「不會被騙」才放心
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

const feedbackSystem = (personaLabel) => `你是富得財富管理的資深業務培訓教練，熟悉公司的631理財金三角（6日常支出/3投資理財/1風險管理）、六大保障（壽險/意外險/失能險/實支實付醫療險/癌症險/重大傷病險）、保經優勢（商品選擇性、理賠糾紛立場、法律顧問資源）這套SOP教學內容。

以下是一位業務員跟模擬客戶（角色設定：${personaLabel}）的練習對話紀錄。請針對這段對話給具體、有深度的教練回饋，用下面四個標題分段回答，每段都要講出具體內容（引用對話中實際講了什麼、或實際沒講到什麼），不要用「還不錯」「可以更好」這種空泛字眼帶過：

【講得好的地方】
指出具體是哪一句話、哪個做法有效，為什麼對這個角色的客戶有效。

【漏掉的重點】
依這個客戶的角色設定，照SOP原本應該帶到但這段對話沒帶到的話術重點是什麼（例如該講631哪個角、該提六大保障哪一項、該不該提保經優勢），具體指出缺了哪一塊，不要只說「可以講更多」。

【客戶反應解讀】
模擬客戶在對話中的反應透露了什麼心理狀態（例如還在防備、已經鬆動、完全沒被說服、卡在某個疑慮），下一句話應該往哪個方向推進。

【具體改進建議】
給1~2句可以直接拿去用的替代講法或下一步問題，不要只說「要更有說服力」這種空話。

不要打分數，不限制字數但每段都要言之有物，用繁體中文回答。`;

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
        max_tokens: mode === 'feedback' ? 1000 : 400,
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
