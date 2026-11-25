const { supabase } = require('../lib/supabase');
const { verifyState, exchangeCode, fetchProfile, igConfig } = require('../lib/igAuth');

/* Instagram 授權完成後 Meta 會把使用者丟回這支（這個網址要填進 Meta 後台的
   「Valid OAuth Redirect URIs」，也要設成環境變數 IG_REDIRECT_URI，兩邊必須一字不差）。
   這支不經過 Supabase 登入——使用者是從 instagram.com 回來的，沒有 Authorization header，
   所以改用 state 裡的 HMAC 簽章來確認是哪個顧問在綁。 */

const page = (title, body, ok) => `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
body{margin:0;background:#f5f4f0;color:#141414;font-family:system-ui,'Noto Sans TC',sans-serif;
     display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;line-height:1.75}
.box{background:#fff;border:1px solid rgba(0,0,0,.09);padding:36px 32px;max-width:420px;width:100%}
h1{font-size:1.1rem;margin:0 0 10px;letter-spacing:1px;color:${ok ? '#1a6e3c' : '#c0392b'}}
p{font-size:.86rem;color:rgba(0,0,0,.72);margin:0 0 10px}
.hint{font-size:.76rem;color:rgba(0,0,0,.5);margin-top:18px}
</style></head><body><div class="box">${body}<div class="hint">可以關掉這個分頁，回到 InstaNeural 綁定頁按「重新整理狀態」。</div></div></body></html>`;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 這頁含授權結果，不要讓任何快取留下來
  res.setHeader('Cache-Control', 'no-store');

  const { code, state, error, error_description } = req.query || {};

  if (error) {
    res.status(200).send(page('授權未完成',
      `<h1>授權未完成</h1><p>Instagram 回報：${String(error_description || error).slice(0, 200)}</p>
       <p>最常見原因是在 Instagram 畫面上按了「不允許」，或選到的不是專業帳號。</p>`, false));
    return;
  }
  if (!code || !state) {
    res.status(400).send(page('參數不足', '<h1>參數不足</h1><p>這個網址缺少授權碼，請從綁定頁重新開始。</p>', false));
    return;
  }
  if (!igConfig().ready) {
    res.status(500).send(page('伺服器未設定',
      '<h1>伺服器尚未設定</h1><p>還沒填齊 IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI / IG_CONFIG_ID 這四個環境變數。</p>', false));
    return;
  }

  try {
    const ownerId = verifyState(state);

    const granted = await exchangeCode(code);
    const accessToken = granted.access_token;
    if (!accessToken) throw new Error('沒拿到存取權杖');

    const profile = await fetchProfile(accessToken);

    // 商家系統用戶 token 預設永不過期，所以通常不會有 expires_in；
    // 真的有才記到期日，沒有就留 null 當作「不會過期」
    const expiresAt = granted.expires_in
      ? new Date(Date.now() + Number(granted.expires_in) * 1000).toISOString()
      : null;

    const { error: dbError } = await supabase.from('ig_accounts').upsert({
      owner_id: ownerId,
      ig_user_id: String(profile.user_id || ''),
      username: profile.username || null,
      access_token: long.access_token,
      token_expires_at: expiresAt,
      scopes: Array.isArray(granted.permissions) ? granted.permissions.join(',') : (granted.permissions || null),
      connected_at: new Date().toISOString(),
      refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' });
    if (dbError) throw new Error('寫入綁定資料失敗：' + dbError.message);

    res.status(200).send(page('綁定成功',
      `<h1>綁定成功</h1>
       <p>已連上 <strong>@${String(profile.username || '').replace(/[<>&"]/g, '')}</strong>
       （粉絲 ${profile.followers_count ?? '—'}、貼文 ${profile.media_count ?? '—'}）。</p>
       <p>${expiresAt ? '授權效期到 ' + expiresAt.slice(0,10) : '這組授權不會過期'}，不用再手動處理。</p>`, true));
  } catch (err) {
    console.error('ig-oauth-callback失敗', err);
    res.status(200).send(page('綁定失敗',
      `<h1>綁定失敗</h1><p>${String(err.message).replace(/[<>&"]/g, '').slice(0, 300)}</p>`, false));
  }
};
