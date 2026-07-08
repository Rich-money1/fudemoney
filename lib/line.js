const crypto = require('crypto');

const LINE_API = 'https://api.line.me/v2/bot/message';

/** 驗證 LINE 傳來的 webhook 簽章，確保請求真的來自 LINE */
function verifySignature(rawBody, signature) {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

/** 主動推播一則文字訊息給指定的 LINE 使用者 */
async function pushMessage(userId, text) {
  const res = await fetch(`${LINE_API}/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${err}`);
  }
  return res.json().catch(() => ({}));
}

/** 回覆 webhook 事件（用 replyToken，不消耗月配額） */
async function replyMessage(replyToken, text) {
  const res = await fetch(`${LINE_API}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LINE reply failed: ${res.status} ${err}`);
  }
}

module.exports = { verifySignature, pushMessage, replyMessage };
