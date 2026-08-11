const { supabase } = require('../lib/supabase');

/* 類股資金流向讀取端點：回傳最新一天的上市/上櫃資金流向率，權限比照/api/trading-signals
   （需登入且繳費開通）。同時回傳前一個交易日的資料，方便前端算漲跌/比較資金是否連續流入。 */
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

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    const { data: dates, error: dateError } = await supabase
      .from('sector_fund_flow')
      .select('recorded_date')
      .order('recorded_date', { ascending: false })
      .limit(1);
    if (dateError) throw dateError;
    if (!dates || dates.length === 0) {
      res.status(200).json({ latestDate: null, previousDate: null, rows: [] });
      return;
    }
    const latestDate = dates[0].recorded_date;

    const { data: prevDates, error: prevDateError } = await supabase
      .from('sector_fund_flow')
      .select('recorded_date')
      .lt('recorded_date', latestDate)
      .order('recorded_date', { ascending: false })
      .limit(1);
    if (prevDateError) throw prevDateError;
    const previousDate = prevDates && prevDates.length > 0 ? prevDates[0].recorded_date : null;

    const fetchDates = previousDate ? [latestDate, previousDate] : [latestDate];
    const { data, error } = await supabase
      .from('sector_fund_flow')
      .select('*')
      .in('recorded_date', fetchDates);
    if (error) throw error;

    const latestRows = (data || []).filter(r => r.recorded_date === latestDate);
    const prevMap = new Map(
      (data || []).filter(r => r.recorded_date === previousDate).map(r => [`${r.market}|${r.sector}`, r.flow_rate])
    );
    const rows = latestRows
      .map(r => ({ ...r, prev_flow_rate: prevMap.get(`${r.market}|${r.sector}`) ?? null }))
      .sort((a, b) => b.flow_rate - a.flow_rate);

    res.status(200).json({ latestDate, previousDate, rows });
  } catch (err) {
    console.error('讀取類股資金流向失敗', err);
    res.status(500).json({ error: err.message });
  }
};
