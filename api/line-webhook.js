const { supabase } = require('../lib/supabase');
const { verifySignature, replyMessage } = require('../lib/line');

/* 讀取原始 request body（驗證簽章需要未經解析的原始字串） */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-line-signature'];

  if (!signature || !verifySignature(rawBody, signature)) {
    res.status(401).send('Invalid signature');
    return;
  }

  const body = JSON.parse(rawBody);
  const events = body.events || [];

  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    if (event.type === 'follow') {
      // 客戶第一次加好友：請他傳送綁定代碼
      if (event.replyToken) {
        await replyMessage(
          event.replyToken,
          '歡迎加入富得財富管理！\n\n請將顧問提供給您的「6位綁定代碼」直接傳送給我，即可完成帳戶綁定，開始接收您的專屬配息提醒。'
        ).catch(err => console.error('reply follow failed', err));
      }
      continue;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text.trim();

      // 嘗試用這段文字當作 link_code 查找待綁定的客戶
      const { data: client, error } = await supabase
        .from('clients')
        .select('id, name, line_user_id')
        .eq('link_code', text)
        .maybeSingle();

      if (error) {
        console.error('查詢客戶失敗', error);
        continue;
      }

      if (!client) {
        if (event.replyToken) {
          await replyMessage(event.replyToken, '找不到對應的綁定代碼，請確認代碼是否正確，或聯繫您的顧問重新取得。')
            .catch(err => console.error('reply not-found failed', err));
        }
        continue;
      }

      if (client.line_user_id) {
        if (event.replyToken) {
          await replyMessage(event.replyToken, `您的帳號已經綁定過了，${client.name} 您好！`)
            .catch(err => console.error('reply already-bound failed', err));
        }
        continue;
      }

      // 綁定成功：寫入 line_user_id
      const { error: updateErr } = await supabase
        .from('clients')
        .update({ line_user_id: userId })
        .eq('id', client.id);

      if (updateErr) {
        console.error('綁定失敗', updateErr);
        continue;
      }

      if (event.replyToken) {
        await replyMessage(
          event.replyToken,
          `✅ 綁定成功！\n\n${client.name} 您好，歡迎加入富得財富管理。\n往後您的配息提醒將會準時透過這個帳號通知您。`
        ).catch(err => console.error('reply success failed', err));
      }
    }
  }

  res.status(200).send('OK');
};
