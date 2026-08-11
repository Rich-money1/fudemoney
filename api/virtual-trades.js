const { supabase } = require('../lib/supabase');

/* 虛擬倉列表 + 勝率/報酬統計，權限比照 /api/trading-signals：需登入且繳費開通(status=active)。 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: '請先登入' });
    return;
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData || !userData.user) {
      res.status(401).json({ error: '登入已過期，請重新登入' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userData.user.id)
      .single();
    if (profileError || !profile || profile.status !== 'active') {
      res.status(403).json({ error: '帳號尚未開通，請聯繫管理者確認繳費狀態' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    const { data, error } = await supabase
      .from('virtual_trades')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const trades = data || [];
    const closedTrades = trades.filter(t => t.status !== 'open');
    const wins = closedTrades.filter(t => t.status === 'win_tp1' || t.status === 'win_tp2');
    const winRate = closedTrades.length > 0 ? +((wins.length / closedTrades.length) * 100).toFixed(1) : null;
    const totalPnlTwd = closedTrades.reduce((sum, t) => sum + (t.pnl_twd || 0), 0);
    const avgPnlPercent = closedTrades.length > 0
      ? +(closedTrades.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / closedTrades.length).toFixed(2)
      : null;

    res.status(200).json({
      trades,
      summary: {
        openCount: trades.length - closedTrades.length,
        closedCount: closedTrades.length,
        winCount: wins.length,
        lossCount: closedTrades.length - wins.length,
        winRate,
        totalPnlTwd: +totalPnlTwd.toFixed(2),
        avgPnlPercent,
      },
    });
  } catch (err) {
    console.error('讀取虛擬倉失敗', err);
    res.status(500).json({ error: err.message });
  }
};
