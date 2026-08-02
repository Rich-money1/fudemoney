const { supabase } = require('../lib/supabase');

/* 公開只讀端點：月配息計算機用的真實年化配息率（安聯月月配 / 東方匯理）
   資料由 update-fund-data.js 每日排程寫入 fund_dividend_rate，這裡只負責讀出給前端。
   配息率每月才變動一次，快取久一點即可。 */
const FUND_IDS = ['allianz', 'eastspring'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  try {
    const { data, error } = await supabase
      .from('fund_dividend_rate')
      .select('fund_id, rate, dividend_date, updated_at')
      .in('fund_id', FUND_IDS);
    if (error) throw error;

    const result = {};
    for (const row of data || []) {
      result[row.fund_id] = { rate: row.rate, dividend_date: row.dividend_date, updated_at: row.updated_at };
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('讀取基金配息率失敗', err);
    res.status(500).json({ error: err.message });
  }
};
