const { supabase } = require('../lib/supabase');
const { generateMarketNote } = require('../lib/generateMarketNote');

/* 每日投資觀點自動更新：抓取市場新聞來源 → AI彙整 → 存入 daily_market_note
   需要設定 ANTHROPIC_API_KEY 環境變數才會運作，未設定時安全跳過不報錯。 */
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ skipped: true, reason: '尚未設定 ANTHROPIC_API_KEY' });
    return;
  }

  try {
    const content = await generateMarketNote();
    const { error } = await supabase
      .from('daily_market_note')
      .upsert({ id: 1, content, updated_at: new Date().toISOString() });
    if (error) throw error;
    res.status(200).json({ updated: true, content });
  } catch (err) {
    console.error('更新每日投資觀點失敗', err);
    res.status(500).json({ error: err.message });
  }
};
