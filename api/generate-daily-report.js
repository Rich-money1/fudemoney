const { runDailyReport } = require('../lib/dailyReport');

/* 手動觸發用端點（正式排程已併入 send-reminders.js 的每日排程執行） */
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  try {
    const result = await runDailyReport();
    res.status(200).json(result);
  } catch (err) {
    console.error('產生每日報告失敗', err);
    res.status(500).json({ error: err.message });
  }
};
