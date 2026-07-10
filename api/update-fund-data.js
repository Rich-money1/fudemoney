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
      const { error } = await supabase
        .from('fund_market_data')
        .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'fund_id' });
      if (error) throw error;
      results.push({ fund_id: fundId, status: 'ok', nav: data.nav });
    } catch (err) {
      console.error(`更新 ${fundId} 失敗`, err);
      results.push({ fund_id: fundId, status: 'failed', error: err.message });
    }
  }

  const okCount = results.filter(r => r.status === 'ok').length;
  res.status(200).json({ updated: okCount, total: fundIds.length, results });
};
