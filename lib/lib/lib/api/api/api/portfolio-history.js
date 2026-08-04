const { supabase } = require('../lib/supabase');

/* 持倉歷史快照：供前端算波動度/最大回撤/畫資產曲線 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true });
    if (error) throw error;
    res.status(200).json({ snapshots: data || [] });
  } catch (err) {
    console.error('讀取持倉歷史失敗', err);
    res.status(500).json({ error: err.message });
  }
};
