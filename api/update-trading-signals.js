const { runTradingSignals } = require('../lib/tradingSignals');
const { updateSectorFundFlow } = require('../lib/fundFlow');

/* 盯盤智能助理排程：抓K線 → 算技術指標與進場/止損/止盈錨點 → AI判讀 → 存入 trading_signals，
   同時更新類股資金流向表（跟AI判讀無關，即使沒設定ANTHROPIC_API_KEY也會照跑）。
   AI判讀需要設定 ANTHROPIC_API_KEY 環境變數才會運作，未設定時安全跳過不報錯。 */
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  let fundFlow = { updated: 0 };
  try {
    fundFlow = await updateSectorFundFlow();
  } catch (err) {
    console.error('更新類股資金流向失敗', err);
    fundFlow = { error: err.message };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({ skipped: true, reason: '尚未設定 ANTHROPIC_API_KEY', fundFlow });
    return;
  }

  try {
    const result = await runTradingSignals();
    res.status(200).json({ ...result, fundFlow });
  } catch (err) {
    console.error('更新盯盤訊號失敗', err);
    res.status(500).json({ error: err.message, fundFlow });
  }
};
