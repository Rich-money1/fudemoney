const { supabase } = require('../lib/supabase');
const { FUND_SOURCES, fetchFundData } = require('../lib/moneydj');

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  const fundIds = Object.keys(FUND_SOURCES);
  const results = [];

  for (const fundId of fundIds) {
    try {
      const data = await fetchFundData(fundId);

      // 最新快照（供「即時淨值」欄位使用，同一檔基金只保留一筆最新的）
      const { error } = await supabase
        .from('fund_market_data')
        .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'fund_id' });
      if (error) throw error;

      // 歷史紀錄（每次執行都新增一筆，用來畫走勢圖，不覆蓋舊資料）
      if (data.nav != null) {
        const { error: histErr } = await supabase
          .from('fund_nav_history')
          .insert({ fund_id: fundId, nav: data.nav });
        if (histErr) throw histErr;
      }

      results.push({ fund_id: fundId, status: 'ok', nav: data.nav });
    } catch (err) {
      console.error(`更新 ${fundId} 失敗`, err);
      results.push({ fund_id: fundId, status: 'failed', error: err.message });
    }
  }

  const okCount = results.filter(r => r.status === 'ok').length;
  res.status(200).json({ updated: okCount, total: fundIds.length, results });
};
