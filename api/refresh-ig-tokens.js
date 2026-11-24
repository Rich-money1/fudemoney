const { supabase } = require('../lib/supabase');
const { refreshLongLived } = require('../lib/igAuth');

/* 每週續期所有 IG 長效 token。
   Meta 的規則：token 必須滿24小時才能續、超過60天沒續就作廢只能重綁——
   所以這支一定要排 cron，不然綁定會在兩個月後安靜地死掉。 */
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
      .from('ig_accounts').select('owner_id,username,access_token,refreshed_at,connected_at');
    if (error) throw new Error(error.message);
    if (!rows || !rows.length) { res.status(200).json({ refreshed: 0, note: '沒有已綁定的帳號' }); return; }

    const results = [];
    for (const row of rows) {
      // 不滿24小時的 token 續期會被 Meta 拒絕，直接跳過等下週
      const since = new Date(row.refreshed_at || row.connected_at || 0).getTime();
      if (Date.now() - since < 24 * 60 * 60 * 1000) {
        results.push({ username: row.username, skipped: '未滿24小時' });
        continue;
      }
      try {
        const refreshed = await refreshLongLived(row.access_token);
        const expiresAt = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
          : null;
        await supabase.from('ig_accounts').update({
          access_token: refreshed.access_token,
          token_expires_at: expiresAt,
          refreshed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('owner_id', row.owner_id);
        results.push({ username: row.username, ok: true, token_expires_at: expiresAt });
      } catch (err) {
        // 單一帳號失敗不要讓整批中斷，記下來就好
        console.error('續期失敗', row.username, err.message);
        results.push({ username: row.username, ok: false, error: err.message });
      }
    }

    res.status(200).json({ total: rows.length, results });
  } catch (err) {
    console.error('refresh-ig-tokens失敗', err);
    res.status(500).json({ error: err.message });
  }
};
