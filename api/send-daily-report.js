const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../lib/supabase');
const { runDailyReport } = require('../lib/dailyReport');

/* 手動補送每日財經給所有已綁定LINE的客戶（後台「發送每日財經」按鈕呼叫）
   正常情況下每天9點的市場觀點排程會自動更新內容並推播，這支是內容臨時改過、或自動推播失敗時的手動補送管道。
   用登入者的 Supabase session 驗證身分，僅限 role=admin 可觸發（會發送給所有顧問名下的客戶，非管理者不開放）。 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: '未登入' });
    return;
  }

  const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
  if (authErr || !user) {
    res.status(401).json({ error: '登入已失效，請重新整理頁面再試' });
    return;
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr || profile?.role !== 'admin') {
    res.status(403).json({ error: '權限不足，僅管理者可發送每日財經' });
    return;
  }

  try {
    const result = await runDailyReport({ testMode: false });
    res.status(200).json(result);
  } catch (err) {
    console.error('手動發送每日財經失敗', err);
    res.status(500).json({ error: err.message });
  }
};
