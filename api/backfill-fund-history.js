const { supabase } = require('../lib/supabase');
const { FUND_SOURCES, fetchNavHistory } = require('../lib/moneydj');

/* 一次性回填單一基金的歷史淨值（每次呼叫處理一檔，避免執行時間過長）
   用法：GET /api/backfill-fund-history?fund=allianz&years=7 */
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  const fundId = req.query.fund;
  const years = parseInt(req.query.years) || 7;
  if (!fundId || !FUND_SOURCES[fundId]) {
    res.status(400).json({ error: '請提供有效的 fund 參數，例如 ?fund=allianz' });
    return;
  }

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setFullYear(fromDate.getFullYear() - years);
  const fmt = (d) => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;

  try {
    const points = await fetchNavHistory(fundId, fmt(fromDate), fmt(today));
    if (points.length === 0) {
      res.status(200).json({ fund_id: fundId, inserted: 0, note: '該日期範圍查無資料' });
      return;
    }

    // 先清掉這檔基金舊的回填紀錄，避免重複執行造成資料重複（用日期判斷是否已存在較複雜，直接清空重寫最單純）
    await supabase.from('fund_nav_history').delete().eq('fund_id', fundId);

    const rows = points.map(p => ({
      fund_id: fundId,
      nav: p.nav,
      recorded_at: new Date(p.date + 'T12:00:00Z').toISOString(),
    }));

    // 分批寫入，避免單次 request 過大
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase.from('fund_nav_history').insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    res.status(200).json({
      fund_id: fundId,
      inserted,
      range: { from: points[0].date, to: points[points.length-1].date },
    });
  } catch (err) {
    console.error(`回填 ${fundId} 失敗`, err);
    res.status(500).json({ fund_id: fundId, error: err.message });
  }
};
