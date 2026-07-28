const { supabase } = require('../lib/supabase');
const { FUND_SOURCES, fetchFundData } = require('../lib/moneydj');
const { DIVIDEND_SOURCES, fetchDividendRate } = require('../lib/fundDividendRate');
const { generateMarketNote } = require('../lib/generateMarketNote');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// MoneyDJ 偶爾會逾時或回傳異常格式，失敗時等1秒後再試一次，避免單日抓取失敗就整天沒資料
async function fetchFundDataWithRetry(fundId, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchFundData(fundId);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1000);
    }
  }
  throw lastErr;
}

// 配息率來源（尤其 MoneyLink）偶爾會連線失敗，同樣失敗重試一次
async function fetchDividendRateWithRetry(fundId, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchDividendRate(fundId);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1000);
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  // 每日投資觀點（需設定 ANTHROPIC_API_KEY 才會執行，沿用同一個每日排程，避免超過 Vercel Hobby 方案的排程數量上限）
  let marketNoteStatus = 'skipped';
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const content = await generateMarketNote();
      const { error } = await supabase
        .from('daily_market_note')
        .upsert({ id: 1, content, updated_at: new Date().toISOString() });
      if (error) throw error;
      marketNoteStatus = 'ok';
    } catch (err) {
      console.error('更新每日投資觀點失敗', err);
      marketNoteStatus = 'failed: ' + err.message;
    }
  }

  const fundIds = Object.keys(FUND_SOURCES);
  const results = [];

  for (const fundId of fundIds) {
    try {
      const data = await fetchFundDataWithRetry(fundId);

      // 最新快照（供「即時淨值」欄位使用，同一檔基金只保留一筆最新的）
      const { error } = await supabase
        .from('fund_market_data')
        .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'fund_id' });
      if (error) throw error;

      // 歷史紀錄（每次執行都新增一筆，用來畫走勢圖，不覆蓋舊資料）
      if (data.nav != null) {
        const { error: histErr } = await supabase
          .from('fund_nav_history')
          .insert({ fund_id: fundId, nav: data.nav });
        if (histErr) throw histErr;
      }

      results.push({ fund_id: fundId, status: 'ok', nav: data.nav });
    } catch (err) {
      console.error(`更新 ${fundId} 失敗`, err);
      results.push({ fund_id: fundId, status: 'failed', error: err.message });
    }
  }

  // 各基金配息率（來源網站僅每月更新一次，這裡每天檢查一次即可自動跟上最新月配息率，
  // 各來源彼此獨立、互不影響，用 Promise.allSettled 平行抓取以縮短總執行時間）
  const dividendIds = Object.keys(DIVIDEND_SOURCES);
  const dividendResults = await Promise.allSettled(
    dividendIds.map(fundId => fetchDividendRateWithRetry(fundId))
  );

  const dividendSummary = [];
  for (let i = 0; i < dividendIds.length; i++) {
    const fundId = dividendIds[i];
    const outcome = dividendResults[i];
    try {
      if (outcome.status !== 'fulfilled' || !outcome.value) {
        throw outcome.reason || new Error('查無配息資料');
      }
      const { error } = await supabase
        .from('fund_dividend_rate')
        .upsert({ ...outcome.value, updated_at: new Date().toISOString() }, { onConflict: 'fund_id' });
      if (error) throw error;
      dividendSummary.push({ fund_id: fundId, status: 'ok', rate: outcome.value.rate });
    } catch (err) {
      console.error(`更新 ${fundId} 配息率失敗`, err);
      dividendSummary.push({ fund_id: fundId, status: 'failed', error: err.message });
    }
  }

  const okCount = results.filter(r => r.status === 'ok').length;
  const dividendOkCount = dividendSummary.filter(r => r.status === 'ok').length;
  res.status(200).json({
    updated: okCount, total: fundIds.length, results, marketNoteStatus,
    dividendUpdated: dividendOkCount, dividendTotal: dividendIds.length, dividendResults: dividendSummary,
  });
};
