const { supabase } = require('./supabase');
const { pushMessage } = require('./line');
const { generateReportPdf } = require('./generateReportPdf');

/* 每日市場報告：抓 daily_market_note + 精選個股 → 產生PDF → 上傳Supabase Storage
   → LINE推播下載連結給所有已綁定LINE的客戶
   testMode=true 時：只產生PDF並上傳，不會真的推播給客戶（測試排版用） */
async function runDailyReport({ testMode = false } = {}) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  const fileDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const { data: noteRow, error: noteErr } = await supabase
    .from('daily_market_note')
    .select('content')
    .eq('id', 1)
    .maybeSingle();
  if (noteErr) throw noteErr;
  const noteContent = noteRow?.content || '<strong>今日核心觀點：</strong> 暫無更新內容。';

  const pdfBuffer = await generateReportPdf({ dateStr, noteContent });

  const filePath = `${fileDate}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('market-reports')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('market-reports').getPublicUrl(filePath);
  const pdfUrl = urlData.publicUrl;

  if (testMode) {
    return { date: fileDate, pdfUrl, sentCount: 0, total: 0, results: [], testMode: true };
  }

  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, line_user_id')
    .eq('remind_enabled', true)
    .not('line_user_id', 'is', null);
  if (clientErr) throw clientErr;

  let sentCount = 0;
  const results = [];
  for (const client of clients || []) {
    const message =
      `📊 【每日市場報告】${dateStr}\n\n` +
      `${client.name} 您好，今日市場分析與精選個股報告已經整理好囉：\n${pdfUrl}\n\n` +
      `富得財富管理 · Eddie Lin 林顧問`;
    try {
      await pushMessage(client.line_user_id, message);
      sentCount++;
      results.push({ client: client.name, status: 'sent' });
    } catch (err) {
      console.error(`推播每日報告失敗 client=${client.id}`, err);
      results.push({ client: client.name, status: 'failed', error: err.message });
    }
  }

  return { date: fileDate, pdfUrl, sentCount, total: (clients || []).length, results };
}

module.exports = { runDailyReport };
