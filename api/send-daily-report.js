const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../lib/supabase');
const { runDailyReport } = require('../lib/dailyReport');

/* 手動發送每日財經給所有已綁定LINE的客戶（後台「發送每日財經」按鈕呼叫）
   排程本身只負責自動產生PDF，不會自動推播，需要管理者在後台確認內容後手動觸發這支才會真的送出。
   用登入者的 Supabase session 驗證身分，僅限 role=admin 可觸發（會發送給所有顧問名下的客戶，非管理者不開放）。 */
module.exports = async (req, res) => {
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
