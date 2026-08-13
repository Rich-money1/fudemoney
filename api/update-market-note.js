const { supabase } = require('../lib/supabase');
const { generateMarketNote } = require('../lib/generateMarketNote');
const { generateStockPicks } = require('../lib/generateStockPicks');

/* 每日投資觀點自動更新：抓取市場新聞來源 → AI彙整 → 存入 daily_market_note
   同一排程也順便更新台股/美股精選TOP20的股價與進場建議一句話（daily_stock_picks）
   兩者皆需要設定 ANTHROPIC_API_KEY 環境變數才會運作，未設定時安全跳過不報錯。 */
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

  let marketNoteResult = null;
  try {
    const content = await generateMarketNote();
    const { error } = await supabase
      .from('daily_market_note')
      .upsert({ id: 1, content, updated_at: new Date().toISOString() });
    if (error) throw error;
    marketNoteResult = { updated: true };
  } catch (err) {
    console.error('更新每日投資觀點失敗', err);
    marketNoteResult = { error: err.message };
  }

  let stockPicksResult = null;
  try {
    const { tw_notes, us_notes } = await generateStockPicks();
    const { error } = await supabase
      .from('daily_stock_picks')
      .upsert({ id: 1, tw_notes, us_notes, updated_at: new Date().toISOString() });
    if (error) throw error;
    stockPicksResult = { updated: true, twCount: Object.keys(tw_notes).length, usCount: Object.keys(us_notes).length };
  } catch (err) {
    console.error('更新台股/美股精選TOP20失敗', err);
    stockPicksResult = { error: err.message };
  }

  res.status(200).json({ marketNoteResult, stockPicksResult });
};
