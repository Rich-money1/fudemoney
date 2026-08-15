const { supabase } = require('../lib/supabase');
const { generateMoviePicks } = require('../lib/generateMoviePicks');

/* 每日AI電影精選片單自動更新：AI選片 → 存入 daily_movie_picks
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
    const { picks, theme } = await generateMoviePicks();
    const { error } = await supabase
      .from('daily_movie_picks')
      .upsert({ id: 1, picks, theme, updated_at: new Date().toISOString() });
    if (error) throw error;
    res.status(200).json({ updated: true, count: picks.length, theme });
  } catch (err) {
    console.error('更新每日電影精選失敗', err);
    res.status(500).json({ error: err.message });
  }
};
