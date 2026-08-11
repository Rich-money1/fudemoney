const { supabase } = require('../lib/supabase');

/* 前端儀表板呼叫的端點：盯盤智能助理的技術面訊號（trading_signals表，每日排程更新一次）
   限定已登入且繳費開通(status=active)的顧問才能讀取，比照系統其他資料的權限模式。
   前端需在Authorization header帶上Supabase登入後的access_token。 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: '請先登入' });
    return;
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData || !userData.user) {
      res.status(401).json({ error: '登入已過期，請重新登入' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userData.user.id)
      .single();
    if (profileError || !profile || profile.status !== 'active') {
      res.status(403).json({ error: '帳號尚未開通，請聯繫管理者確認繳費狀態' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    const { data, error } = await supabase
      .from('trading_signals')
      .select('*')
      .order('market', { ascending: true })
      .order('symbol', { ascending: true });
    if (error) throw error;
    res.status(200).json({ signals: data || [] });
  } catch (err) {
    console.error('讀取盯盤訊號失敗', err);
    res.status(500).json({ error: err.message });
  }
};
