const { runDailyReport } = require('../lib/dailyReport');

/* 手動觸發用端點（正式排程已併入 send-reminders.js 的每日排程執行）
   加上 ?test=1 只會產生PDF並回傳連結，不會真的推播給客戶（方便測試排版） */
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  const testMode = req.query?.test === '1';

  try {
    const result = await runDailyReport({ testMode });
    res.status(200).json(result);
  } catch (err) {
    console.error('產生每日報告失敗', err);
    res.status(500).json({ error: err.message });
  }
};
