const { supabase } = require('../lib/supabase');
const { checkToken } = require('../lib/igAuth');

/* 每週檢查已綁定的 IG token 還活著沒。
   Unified Login 拿的是商家系統用戶 token，預設永不過期，所以不需要續期——
   但使用者可以在 FB/IG 端撤銷授權，撤銷後綁定會無聲失效，
   所以改成每週驗一次，壞掉就把狀態記進 last_error，綁定頁會顯示出來。 */
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  try {
    const { data: rows, error } = await supabase
      .from('ig_accounts').select('owner_id,username,access_token');
    if (error) throw new Error(error.message);
    if (!rows || !rows.length) { res.status(200).json({ checked: 0, note: '沒有已綁定的帳號' }); return; }

    const results = [];
    for (const row of rows) {
      const result = await checkToken(row.access_token);
      // 單一帳號壞掉不要讓整批中斷，記下來讓綁定頁顯示就好
      await supabase.from('ig_accounts').update({
        username: result.ok ? (result.profile.username || row.username) : row.username,
        refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('owner_id', row.owner_id);
      if (!result.ok) console.error('IG綁定失效', row.username, result.error);
      results.push({ username: row.username, ok: result.ok, error: result.error });
    }

    res.status(200).json({ checked: rows.length, results });
  } catch (err) {
    console.error('ig-health-check失敗', err);
    res.status(500).json({ error: err.message });
  }
};
