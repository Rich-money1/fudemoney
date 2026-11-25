const crypto = require('crypto');

/* InstaNeural：Instagram 綁定共用邏輯（Unified Login 版）
   走的是「Instagram API with Unified Login」＝ Facebook Login for Business，
   授權對話框在 facebook.com，所有 API 走 graph.facebook.com，
   拿到的是 Business Integration System User Access Token（預設永不過期）。

   為什麼不是 Instagram Login：Meta 後台現在只開放 Unified Login 和 Facebook Login 兩種設定，
   Instagram Login（graph.instagram.com 那套）文件還在但新 App 已經選不到了。
   Unified Login 不需要 FB 粉專，但需要一個商家資產管理組合。

   需要的環境變數：IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI / IG_CONFIG_ID
   IG_CONFIG_ID 來自後台「Facebook Login for Business → 設定」建立的那組設定編號，
   沒有它授權對話框不會用商家登入流程。 */

const GRAPH_VERSION = 'v23.0';
const GRAPH_HOST = `https://graph.facebook.com/${GRAPH_VERSION}`;

function igConfig() {
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  const redirectUri = process.env.IG_REDIRECT_URI;
  const configId = process.env.IG_CONFIG_ID;
  return { appId, appSecret, redirectUri, configId, ready: !!(appId && appSecret && redirectUri && configId) };
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
  const { appId, redirectUri, configId, ready } = igConfig();
  if (!ready) throw new Error('伺服器尚未設定 IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI / IG_CONFIG_ID');
  const params = new URLSearchParams({
    client_id: appId,
    config_id: configId,          // 少了這個就會變成一般 Facebook 登入，拿不到商家系統用戶 token
    redirect_uri: redirectUri,
    response_type: 'code',
    state: signState(userId),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function readJson(res, label) {
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`${label} 回傳非JSON：${text.slice(0, 300)}`); }
  if (!res.ok || data.error) {
    const e = data.error || {};
    const msg = e.error_user_msg || e.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`${label} 失敗：${msg}`);
  }
  return data;
}

/* code → 商家系統用戶 token。Unified Login 不用再換長效 token，這個預設就不會過期 */
async function exchangeCode(code) {
  const { appId, appSecret, redirectUri } = igConfig();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${GRAPH_HOST}/oauth/access_token?${params.toString()}`);
  return readJson(res, '交換存取權杖');
}

/* /me 會自動解析成這組 token 所屬的物件。
   Unified Login 下那個節點到底支援哪些欄位，文件沒寫清楚（實測 profile_picture_url 就不存在），
   所以不要硬猜一組欄位送出去——少一個欄位整個請求會以 (#100) 失敗，
   改成「要一組，被退哪個就拿掉哪個再要一次」，有什麼拿什麼。 */
const BASE_FIELDS = ['id', 'username'];                    // 這兩個沒有的話就是節點型態不對，再試也沒用
const OPTIONAL_FIELDS = ['name', 'profile_picture_url', 'followers_count', 'follows_count', 'media_count', 'biography'];

/* 節點型態診斷：失敗時用 metadata=1 問 Graph API 這到底是什麼物件，
   這樣錯誤訊息才有辦法一次指出問題，不用再來回猜。 */
async function describeNode(accessToken) {
  try {
    const params = new URLSearchParams({ metadata: '1', fields: 'id', access_token: accessToken });
    const res = await fetch(`${GRAPH_HOST}/me?${params.toString()}`);
    const data = await res.json();
    return data?.metadata?.type || data?.id ? `節點型態=${data?.metadata?.type || '未知'}, id=${data?.id || '無'}` : null;
  } catch (e) { return null; }
}

async function fetchProfile(accessToken) {
  let fields = [...BASE_FIELDS, ...OPTIONAL_FIELDS];
  let lastErr;
  for (let attempt = 0; attempt < OPTIONAL_FIELDS.length + 1; attempt++) {
    const params = new URLSearchParams({ fields: fields.join(','), access_token: accessToken });
    try {
      const data = await readJson(await fetch(`${GRAPH_HOST}/me?${params.toString()}`), '讀取IG帳號資料');
      // graph.facebook.com 的節點用 id，不是 user_id——統一成前端認得的形狀
      return { ...data, user_id: data.id };
    } catch (err) {
      lastErr = err;
      const bad = /nonexisting field \(([^)]+)\)/.exec(err.message)?.[1];
      // 不是「欄位不存在」的錯就不是這裡能救的，直接往上拋
      if (!bad || BASE_FIELDS.includes(bad)) break;
      fields = fields.filter(f => f !== bad);
      if (fields.length === 0) break;
    }
  }
  const node = await describeNode(accessToken);
  throw new Error(lastErr.message + (node ? `（${node}）` : ''));
}

/* 檢查 token 還活著沒。Unified Login 的 token 不會自然過期，
   但使用者可以在 IG/FB 端撤銷授權，所以還是要能驗。 */
async function checkToken(accessToken) {
  try {
    const profile = await fetchProfile(accessToken);
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  GRAPH_VERSION, GRAPH_HOST, igConfig, signState, verifyState,
  buildAuthorizeUrl, exchangeCode, fetchProfile, checkToken,
};
