const { supabase } = require('../lib/supabase');

/* 公開只讀端點：保單借款利率資料庫（原本寫死在網站 JS 裡的 8 家保險公司利率，
   改存 insurer_loan_rate 表，之後利率調整只要改資料庫，不必動程式碼重新部署。 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  try {
    const { data, error } = await supabase
      .from('insurer_loan_rate')
      .select('name, rate, max_pct, rating')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (err) {
    console.error('讀取保單借款利率失敗', err);
    res.status(500).json({ error: err.message });
  }
};
