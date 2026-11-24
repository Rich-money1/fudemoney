const crypto = require('crypto');

/* InstaNeural：Instagram 綁定共用邏輯
   走的是「Instagram API with Instagram Login」(graph.instagram.com)，
   不是舊的「綁 Facebook 粉專」那條路——所以不需要 FB 粉專，自己的帳號也不需要 App Review。
   需要的環境變數：IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI */

const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
  'instagram_business_manage_comments',
].join(',');

function igConfig() {
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  const redirectUri = process.env.IG_REDIRECT_URI;
  return { appId, appSecret, redirectUri, ready: !!(appId && appSecret && redirectUri) };
}

/* state 用來防 CSRF，同時把「是哪個顧問在綁」帶過去。
   callback 收不到 Supabase 的登入狀態，所以這裡用 HMAC 簽章自帶 userId。 */
function stateSecret() {
  const s = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('缺少可用來簽 state 的伺服器密鑰（CRON_SECRET）');
  return s;
}
function signState(userId) {
  const payload = `${userId}.${Date.now()}`;
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('hex').slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}
function verifyState(state) {
  let decoded;
  try { decoded = Buffer.from(String(state || ''), 'base64url').toString('utf8'); }
  catch (e) { throw new Error('state 格式錯誤'); }
  const parts = decoded.split('.');
  if (parts.length !== 3) throw new Error('state 格式錯誤');
  const [userId, ts, sig] = parts;
  const expect = crypto.createHmac('sha256', stateSecret()).update(`${userId}.${ts}`).digest('hex').slice(0, 32);
  // 被竄改的 state 解出來可能含多位元組字元，字串長度相同但位元組長度不同，
  // timingSafeEqual 會直接丟例外——所以要比 Buffer 的 byte length，不是 string length
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectBuf = Buffer.from(expect, 'utf8');
  if (sigBuf.length !== expectBuf.length || !crypto.timingSafeEqual(sigBuf, expectBuf)) {
    throw new Error('state 驗證失敗');
  }
  if (Date.now() - Number(ts) > 30 * 60 * 1000) throw new Error('授權連結已過期，請重新點一次綁定');
  return userId;
}

function buildAuthorizeUrl(userId) {
  const { appId, redirectUri, ready } = igConfig();
  if (!ready) throw new Error('伺服器尚未設定 IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state: signState(userId),
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

async function readJson(res, label) {
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`${label} 回傳非JSON：${text.slice(0, 300)}`); }
  if (!res.ok || data.error || data.error_message) {
    const msg = data.error_message || data.error?.message || data.error_type || JSON.stringify(data).slice(0, 300);
    throw new Error(`${label} 失敗：${msg}`);
  }
  return data;
}

/* code → 短效 token（1小時） */
async function exchangeCode(code) {
  const { appId, appSecret, redirectUri } = igConfig();
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  return readJson(res, '交換短效token');
}

/* 短效 → 長效 token（60天） */
async function exchangeLongLived(shortToken) {
  const { appSecret } = igConfig();
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: shortToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`);
  return readJson(res, '交換長效token');
}

/* 續期：token 必須滿24小時、且未過期；超過60天沒續就救不回來了，只能重綁 */
async function refreshLongLived(longToken) {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: longToken,
  });
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`);
  return readJson(res, '續期token');
}

async function fetchProfile(accessToken) {
  const params = new URLSearchParams({
    fields: 'user_id,username,account_type,followers_count,follows_count,media_count,profile_picture_url',
    access_token: accessToken,
  });
  const res = await fetch(`https://graph.instagram.com/v23.0/me?${params.toString()}`);
  return readJson(res, '讀取IG帳號資料');
}

module.exports = {
  SCOPES, igConfig, signState, verifyState, buildAuthorizeUrl,
  exchangeCode, exchangeLongLived, refreshLongLived, fetchProfile,
};
