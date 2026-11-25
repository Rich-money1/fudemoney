const { supabase } = require('../lib/supabase');
const { buildAuthorizeUrl, fetchProfile, igConfig } = require('../lib/igAuth');

/* InstaNeural 綁定頁（ig-connect.html）的控制端點。
   access_token 永遠不會回給前端——前端只拿得到帳號名稱、粉絲數、到期日這些顯示用欄位。
   action：
     status      查目前綁定狀態（順便即時抓一次 IG 粉絲數）
     authorize_url 產生 Instagram 授權連結（state 內含簽章過的 userId）
     verify      重新驗證 token 還活著沒（Unified Login 的商家系統用戶 token 不會自然過期，
                 但使用者可以在 FB/IG 端撤銷授權，所以要能主動驗）
     disconnect  解除綁定（只刪我們這邊的紀錄，IG 那邊要自己去設定移除）
*/
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
    const ownerId = userData.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('status').eq('id', ownerId).single();
    if (profileError || !profile || profile.status !== 'active') {
      res.status(403).json({ error: '帳號尚未開通，請聯繫管理者確認繳費狀態' });
      return;
    }

    const { action } = req.body || {};
    const cfg = igConfig();

    if (action === 'authorize_url') {
      if (!cfg.ready) {
        res.status(400).json({ error: '伺服器還沒設定齊 IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI / IG_CONFIG_ID，請先完成 Meta 後台設定' });
        return;
      }
      res.status(200).json({ url: buildAuthorizeUrl(ownerId), redirectUri: cfg.redirectUri });
      return;
    }

    if (action === 'disconnect') {
      const { error } = await supabase.from('ig_accounts').delete().eq('owner_id', ownerId);
      if (error) throw new Error(error.message);
      res.status(200).json({ connected: false, disconnected: true });
      return;
    }

    // 以下動作都需要已經有綁定紀錄
    const { data: row, error: rowError } = await supabase
      .from('ig_accounts')
      .select('ig_user_id,username,access_token,token_expires_at,scopes,connected_at,refreshed_at')
      .eq('owner_id', ownerId).maybeSingle();
    if (rowError) throw new Error(rowError.message);

    if (!row) {
      res.status(200).json({ connected: false, serverReady: cfg.ready });
      return;
    }

    if (action === 'verify') {
      const live = await fetchProfile(row.access_token);   // 失敗會丟例外，由外層轉成500
      const { error } = await supabase.from('ig_accounts').update({
        username: live.username || row.username,
        refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('owner_id', ownerId);
      if (error) throw new Error(error.message);
      res.status(200).json({ connected: true, verified: true, username: live.username });
      return;
    }

    // 預設 status：順便即時抓一次帳號資料，順便驗證 token 還活著
    let live = null, liveError = null;
    try {
      live = await fetchProfile(row.access_token);
      if (live.username && live.username !== row.username) {
        await supabase.from('ig_accounts')
          .update({ username: live.username, updated_at: new Date().toISOString() })
          .eq('owner_id', ownerId);
      }
    } catch (err) {
      liveError = err.message;
    }

    res.status(200).json({
      connected: true,
      serverReady: cfg.ready,
      username: live?.username || row.username,
      ig_user_id: row.ig_user_id,
      account_type: live?.account_type || null,
      followers_count: live?.followers_count ?? null,
      follows_count: live?.follows_count ?? null,
      media_count: live?.media_count ?? null,
      profile_picture_url: live?.profile_picture_url || null,
      token_expires_at: row.token_expires_at,
      scopes: row.scopes,
      connected_at: row.connected_at,
      refreshed_at: row.refreshed_at,
      tokenError: liveError,
    });
  } catch (err) {
    console.error('ig-connect失敗', err);
    res.status(500).json({ error: err.message });
  }
};
