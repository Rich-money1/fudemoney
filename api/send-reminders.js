const { supabase } = require('../lib/supabase');
const { pushMessage } = require('../lib/line');
const { FUNDS, FUND_APPROX_DAY, findFund } = require('../lib/funds');
const { runDailyReport } = require('../lib/dailyReport');

function fmt(n) {
  return Math.round(n).toLocaleString('zh-TW');
}

function calcGroupMonthly(group) {
  const rate = (group.fund_ids || []).reduce((s, fid) => {
    const f = findFund(fid);
    return s + (f ? f.rate : 0);
  }, 0);
  return (parseFloat(group.principal) || 0) * rate / 12;
}

module.exports = async (req, res) => {
  // 若有設定 CRON_SECRET，驗證請求來源（避免被外部亂觸發）
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  const today = new Date();
  const todayDay = today.getDate();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

  // 撈出所有啟用提醒、且已完成LINE綁定的客戶（含配息組合）
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, line_user_id, remind_enabled, dividend_groups(id, principal, fund_ids)')
    .eq('remind_enabled', true)
    .not('line_user_id', 'is', null);

  if (error) {
    console.error('查詢客戶失敗', error);
    res.status(500).json({ error: error.message });
    return;
  }

  let sentCount = 0;
  const results = [];

  for (const client of clients || []) {
    // 找出今天是基準日的基金
    const dueFundIds = new Set();
    for (const group of client.dividend_groups || []) {
      for (const fid of group.fund_ids || []) {
        if (FUND_APPROX_DAY[fid] === todayDay) dueFundIds.add(fid);
      }
    }
    if (dueFundIds.size === 0) continue;

    for (const fid of dueFundIds) {
      // 避免同一天同一檔基金重複發送（unique constraint 保護 + 前置檢查）
      const { data: existing } = await supabase
        .from('notification_log')
        .select('id')
        .eq('client_id', client.id)
        .eq('fund_id', fid)
        .eq('sent_date', todayStr)
        .maybeSingle();
      if (existing) continue;

      const fund = findFund(fid);
      const relatedGroup = (client.dividend_groups || []).find(g => (g.fund_ids || []).includes(fid));
      const mo = relatedGroup ? calcGroupMonthly(relatedGroup) : 0;

      const message =
        `📅 【配息提醒】今日為基準日\n\n` +
        `${client.name} 您好，\n\n` +
        `${fund?.name || fid}（年化 ${((fund?.rate || 0) * 100).toFixed(1)}%）今日為配息基準日，\n` +
        `本組月配息約 ${fmt(mo)} 元，將依基金公司公告時程陸續入帳。\n\n` +
        `富得財富管理 · Eddie Lin 林顧問`;

      try {
        await pushMessage(client.line_user_id, message);
        await supabase.from('notification_log').insert({
          client_id: client.id,
          fund_id: fid,
          sent_date: todayStr,
          message_content: message,
        });
        sentCount++;
        results.push({ client: client.name, fund: fid, status: 'sent' });
      } catch (err) {
        console.error(`發送失敗 client=${client.id} fund=${fid}`, err);
        results.push({ client: client.name, fund: fid, status: 'failed', error: err.message });
      }
    }
  }

  // 每日市場報告（PDF+LINE連結，併入同一個每日排程，避免超過 Vercel Hobby 方案排程數量上限）
  let dailyReportResult = null;
  try {
    dailyReportResult = await runDailyReport();
  } catch (err) {
    console.error('產生每日報告失敗', err);
    dailyReportResult = { error: err.message };
  }

  res.status(200).json({ date: todayStr, sentCount, results, dailyReportResult });
};
