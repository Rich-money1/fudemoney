const crypto = require('crypto');

/* InstaNeural：Instagram 綁定共用邏輯（Unified Login 版）
   走的是「Instagram API with Unified Login」＝ Facebook Login for Business，
   授權對話框在 facebook.com，所有 API 走 graph.facebook.com，
   拿到的是 Business Integration System User Access Token（預設永不過期）。

   為什麼不是 Instagram Login：Meta 後台現在只開放 Unified Login 和 Facebook Login 兩種設定，
   Instagram Login（graph.instagram.com 那套）文件還在但新 App 已經選不到了。
   Unified Login 不需要 FB 粉專，但需要一個商家資產管理組合。

   需要的環境變數：IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI，外加 IG_CONFIG_ID 或 IG_SCOPES 至少一個。
   IG_CONFIG_ID 來自後台「Facebook Login for Business → 設定」建立的那組設定編號（商家登入流程）。
   IG_SCOPES 是逗號分隔的權限清單，給「含有 Facebook 登入的 API 設定」那條路用
   （IG 帳號已連 Facebook 粉專時走這條，文件最完整）。
   兩個都給的話一起送，Meta 會以 config_id 為準。 */

const GRAPH_VERSION = 'v23.0';
const GRAPH_HOST = `https://graph.facebook.com/${GRAPH_VERSION}`;

function igConfig() {
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  const redirectUri = process.env.IG_REDIRECT_URI;
  const configId = process.env.IG_CONFIG_ID;
  const scopes = (process.env.IG_SCOPES || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    appId, appSecret, redirectUri, configId, scopes,
    ready: !!(appId && appSecret && redirectUri && (configId || scopes.length)),
  };
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
  const { appId, redirectUri, configId, scopes, ready } = igConfig();
  if (!ready) throw new Error('伺服器尚未設定 IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI，以及 IG_CONFIG_ID 或 IG_SCOPES 其中之一');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: signState(userId),
  });
  // 商家登入(Unified Login)：少了 config_id 會退化成一般 Facebook 登入，拿不到商家系統用戶 token
  if (configId) params.set('config_id', configId);
  // Facebook 登入：要明確列出要哪些權限，否則只會拿到 public_profile
  if (scopes.length) params.set('scope', scopes.join(','));
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

/* 取 IG 帳號資料。
   Unified Login 下 /me 解析出來的不一定是 IG 專業帳號——實測拿到的節點連 username 都沒有
   （回 "username field is deprecated"，那是 Facebook User 節點的錯誤），
   所以不要再硬猜欄位或節點。做法是：先用 metadata=1 問 Graph API 這是什麼節點、有哪些欄位，
   照答案取；真的不是 IG 帳號，再沿著「粉專 → 商家資產組合」兩條路去找出被授權的那個 IG 帳號。 */

const WANTED_FIELDS = ['username', 'name', 'followers_count', 'follows_count', 'media_count', 'biography', 'profile_picture_url'];
const IG_SUBFIELDS = 'id,username,name,followers_count,follows_count,media_count';

async function graph(path, params, accessToken, label) {
  const sp = new URLSearchParams({ ...params, access_token: accessToken });
  return readJson(await fetch(`${GRAPH_HOST}/${path}?${sp.toString()}`), label);
}

/* Graph API 只要請求裡有一個欄位不存在，整包就失敗。
   哪些欄位存在會隨節點型態與授權範圍而不同（實測同一個節點有 username 卻沒有 followers_count），
   所以任何帶 fields 的查詢都要走這裡：被退哪個就拿掉哪個再要一次，有什麼拿什麼。
   required 裡的欄位被退才算真的失敗。 */
async function graphFields(path, { required = ['id'], optional = [] }, accessToken, label) {
  let fields = [...required, ...optional];
  let lastErr;
  for (let i = 0; i <= optional.length; i++) {
    try {
      return await graph(path, { fields: fields.join(',') }, accessToken, label);
    } catch (err) {
      lastErr = err;
      const bad = /nonexisting field \(([^)]+)\)/.exec(err.message)?.[1];
      if (!bad || required.includes(bad)) throw err;
      fields = fields.filter(f => f !== bad);
    }
  }
  throw lastErr;
}

/* 問出節點型態與可用欄位清單。metadata 不支援時回空陣列，呼叫端要能接受。 */
async function fetchNodeMeta(accessToken) {
  try {
    const data = await graph('me', { metadata: '1' }, accessToken, '讀取節點資訊');
    return {
      id: data.id || null,
      type: data.metadata?.type || null,
      fields: (data.metadata?.fields || []).map(f => f.name).filter(Boolean),
    };
  } catch (e) {
    return { id: null, type: null, fields: [], error: e.message };
  }
}

/* /me 不是 IG 帳號時，沿兩條路找出被授權的 IG 專業帳號 */
/* 用 app token 檢查這張 token，granular_scopes 會列出每個權限各自授權了哪些資產 id——
   instagram_* 那幾個的 target_ids 就是被授權的 IG 專業帳號。
   這條路不需要任何額外權限，是最可靠的來源（me/businesses 要 business_management，一般不會給）。 */
async function discoverViaTokenDebug(accessToken) {
  const { appId, appSecret } = igConfig();
  if (!appId || !appSecret) return [];
  const sp = new URLSearchParams({ input_token: accessToken, access_token: `${appId}|${appSecret}` });
  const data = await readJson(await fetch(`${GRAPH_HOST}/debug_token?${sp.toString()}`), '檢查權杖');
  const d = data.data || {};
  const ids = [];
  for (const sc of d.granular_scopes || []) {
    if (!/instagram/i.test(sc.scope || '')) continue;
    for (const t of sc.target_ids || []) if (t && !ids.includes(String(t))) ids.push(String(t));
  }
  // 沒找到時要能說出這張 token 到底拿到了什麼，才分得出是「授權沒給資產」還是「程式找錯地方」
  const summary = (d.granular_scopes || [])
    .map(sc => `${sc.scope}${sc.target_ids?.length ? `→${sc.target_ids.length}個資產` : '→無資產'}`)
    .join('、');
  return {
    ids,
    detail: `token型態=${d.type || '未知'}, 權限=[${(d.scopes || []).join(' ') || '無'}]` +
            `, 資產授權=[${summary || '無'}]`,
  };
}

/* 拿到 IG 帳號 id 之後盡量補齊顯示用欄位，補不到也不要讓綁定失敗——
   綁定的本質是「握有一張 token，並且知道它對應哪個 IG 帳號」，
   粉絲數和使用者名稱是錦上添花，不該因為 Meta 不給某個欄位就整個綁不起來。 */
async function hydrateIgAccount(id, accessToken) {
  try {
    const data = await graphFields(id,
      { required: ['id'], optional: ['username', 'name', 'followers_count', 'follows_count', 'media_count', 'biography'] },
      accessToken, '讀取IG帳號');
    return { ...data, id: data.id || id };
  } catch (e) {
    return { id };
  }
}

async function discoverIgAccount(accessToken, nodeId) {
  const tried = [];
  // 0) 先問 debug_token，這是唯一不需要額外權限就能問出被授權資產的方法
  try {
    const { ids, detail } = await discoverViaTokenDebug(accessToken);
    if (ids.length) return await hydrateIgAccount(ids[0], accessToken);
    tried.push(`debug_token 沒有 instagram 授權資產（${detail}）`);
  } catch (e) { tried.push('debug_token：' + e.message); }

  // 1) 直接用 /me 回的那個 id 再問一次。/me 這個別名有時會被當成 User 節點解析，
  //    但同一個 id 用明確路徑取反而是 IG 帳號（新制 IG id 長得像 1221047989...）
  if (nodeId) {
    try {
      const direct = await graphFields(nodeId,
        { required: ['id', 'username'], optional: ['name', 'followers_count', 'follows_count', 'media_count', 'biography'] },
        accessToken, '讀取IG帳號');
      if (direct && direct.username) return direct;
      tried.push(`直接取 ${nodeId} 沒有 username`);
    } catch (e) { tried.push(`直接取 ${nodeId}：${e.message}`); }
  }

  // 2) 掛在粉專底下的 IG 帳號（有連粉專的情況）
  try {
    const pages = await graph('me/accounts',
      { fields: `instagram_business_account{${IG_SUBFIELDS}}` }, accessToken, '讀取粉專');
    const hit = (pages.data || []).map(p => p.instagram_business_account).find(a => a && a.id);
    if (hit) return hit;
    tried.push('me/accounts 沒有連結的IG帳號');
  } catch (e) { tried.push('me/accounts：' + e.message); }

  // 3) 商家資產組合持有的 IG 帳號（需要 business_management，通常不會給）
  try {
    const businesses = await graph('me/businesses', { fields: 'id,name' }, accessToken, '讀取商家資產組合');
    for (const biz of businesses.data || []) {
      for (const edge of ['owned_instagram_accounts', 'client_instagram_accounts']) {
        try {
          const accounts = await graph(`${biz.id}/${edge}`, { fields: IG_SUBFIELDS }, accessToken, '讀取IG帳號');
          const hit = (accounts.data || []).find(a => a && a.id);
          if (hit) return hit;
        } catch (e) { tried.push(`${biz.name || biz.id}/${edge}：${e.message}`); }
      }
    }
    if (!(businesses.data || []).length) tried.push('me/businesses 是空的');
  } catch (e) { tried.push('me/businesses：' + e.message); }

  const err = new Error('找不到已授權的 Instagram 專業帳號。嘗試過：' + tried.join('｜'));
  err.diagnostics = tried;
  throw err;
}

async function fetchProfile(accessToken) {
  const meta = await fetchNodeMeta(accessToken);
  const available = WANTED_FIELDS.filter(f => meta.fields.includes(f));

  // metadata 問得到、而且這個節點確實有 username，就直接照它說的取
  if (available.includes('username')) {
    const data = await graphFields('me',
      { required: ['id'], optional: available }, accessToken, '讀取IG帳號資料');
    return { ...data, user_id: data.id };
  }

  // metadata 問不到欄位清單時，還是試一次最小集合，不要白白放棄
  if (!meta.fields.length) {
    try {
      const data = await graph('me', { fields: 'id,username' }, accessToken, '讀取IG帳號資料');
      if (data.username) return { ...data, user_id: data.id };
    } catch (e) { /* 預期內，往下走探索流程 */ }
  }

  // /me 不是 IG 帳號 → 去找出真正被授權的那一個
  try {
    const ig = await discoverIgAccount(accessToken, meta.id);
    if (!ig || !ig.id) throw new Error('找到的資料沒有帳號 id');
    return { ...ig, user_id: ig.id };
  } catch (err) {
    throw new Error(
      `${err.message}（/me 節點型態=${meta.type || '未知'}, id=${meta.id || '無'}` +
      `${meta.fields.length ? `, 可用欄位前20=${meta.fields.slice(0, 20).join('/')}` : ''}）`
    );
  }
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
