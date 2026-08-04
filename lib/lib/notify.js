/* 主動通知：LINE 或 Email，看哪組環境變數有設定就用哪個（可以兩個都設，會都發）。
   沒設定任何一組就安全跳過，不影響主流程（訊號分析不能因為通知失敗而整批失敗）。 */

async function sendLineMessage(text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_USER_ID) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: process.env.LINE_USER_ID, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  });
  if (!res.ok) throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
  return true;
}

async function sendEmail(subject, body) {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFY_EMAIL) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM_EMAIL || 'onboarding@resend.dev',
      to: [process.env.NOTIFY_EMAIL],
      subject,
      text: body,
    }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
  return true;
}

async function notifyAll(subject, text) {
  const results = { line: false, email: false };
  try { results.line = await sendLineMessage(`${subject}\n\n${text}`); }
  catch (err) { console.error('LINE通知失敗', err.message); }
  try { results.email = await sendEmail(subject, text); }
  catch (err) { console.error('Email通知失敗', err.message); }
  return results;
}

module.exports = { notifyAll, sendLineMessage, sendEmail };
