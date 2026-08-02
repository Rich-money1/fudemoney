const { supabase } = require('../lib/supabase');

/* 前端儀表板呼叫的公開只讀端點：盯盤智能助理的技術面訊號（trading_signals表，每日排程更新一次） */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  try {
    const { data, error } = await supabase
      .from('trading_signals')
      .select('*')
      .order('market', { ascending: true })
      .order('symbol', { ascending: true });
    if (error) throw error;
    res.status(200).json({ signals: data || [] });
  } catch (err) {
    console.error('讀取盯盤訊號失敗', err);
    res.status(500).json({ error: err.message });
  }
};
