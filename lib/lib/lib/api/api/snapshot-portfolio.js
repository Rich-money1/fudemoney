const { supabase } = require('../lib/supabase');
const { fetchQuote } = require('../lib/yahoo');

/* 每日持倉快照：排程記錄當天總市值/總成本/損益，累積起來供「風險與歷史績效」區塊畫資產曲線。
   資料從第一次執行這支開始累積，無法回溯補算過去的持倉組成。 */
module.exports = async (req, res) => {
  try {
    const { data: holdings, error } = await supabase.from('holdings').select('symbol, quantity, cost_basis');
    if (error) throw error;
    if (!holdings || holdings.length === 0) {
      return res.status(200).json({ skipped: true, reason: '尚無持倉' });
    }

    const quotes = await Promise.all(holdings.map(h => fetchQuote(h.symbol).catch(() => ({ price: null }))));
    let totalValue = 0, totalCost = 0;
    holdings.forEach((h, i) => {
      const price = quotes[i].price;
      if (price != null) totalValue += price * h.quantity;
      totalCost += h.cost_basis * h.quantity;
    });

    const today = new Date().toISOString().slice(0, 10);
    const { error: upsertErr } = await supabase.from('portfolio_snapshots').upsert(
      { snapshot_date: today, total_value: totalValue, total_cost: totalCost, total_pnl: totalValue - totalCost },
      { onConflict: 'snapshot_date' }
    );
    if (upsertErr) throw upsertErr;

    res.status(200).json({ date: today, totalValue, totalCost });
  } catch (err) {
    console.error('儲存持倉快照失敗', err);
    res.status(500).json({ error: err.message });
  }
};
