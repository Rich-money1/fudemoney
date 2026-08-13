const { supabase } = require('../lib/supabase');
const { FUND_SOURCES, fetchFundData } = require('../lib/moneydj');
const { DIVIDEND_SOURCES, fetchDividendRate } = require('../lib/fundDividendRate');
const { generateMarketNote } = require('../lib/generateMarketNote');
const { generateStockPicks } = require('../lib/generateStockPicks');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 保護用：即使某個環節丟出非 Error 物件（例如 undefined），也不會讓 err.message 再炸出新的例外把整支函式打掛
const errMsg = err => (err && err.message) ? err.message : String(err);

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

// 每日投資觀點（需設定 ANTHROPIC_API_KEY 才會執行）
async function runMarketNote() {
  if (!process.env.ANTHROPIC_API_KEY) return 'skipped';
  try {
    const content = await generateMarketNote();
    const { error } = await supabase
      .from('daily_market_note')
      .upsert({ id: 1, content, updated_at: new Date().toISOString() });
    if (error) throw error;
    return 'ok';
  } catch (err) {
    console.error('更新每日投資觀點失敗', err);
    return 'failed: ' + errMsg(err);
  }
}

// 台股/美股精選TOP20的「進場建議」一句話（需設定 ANTHROPIC_API_KEY 才會執行）
async function runStockPicks() {
  if (!process.env.ANTHROPIC_API_KEY) return 'skipped';
  try {
    const { tw_notes, us_notes } = await generateStockPicks();
    const { error } = await supabase
      .from('daily_stock_picks')
      .upsert({ id: 1, tw_notes, us_notes, updated_at: new Date().toISOString() });
    if (error) throw error;
    return 'ok';
  } catch (err) {
    console.error('更新台股/美股精選TOP20失敗', err);
    return 'failed: ' + errMsg(err);
  }
}

// 各檔基金即時淨值（14檔，彼此獨立，平行抓取縮短總執行時間）
async function runFundData() {
  const fundIds = Object.keys(FUND_SOURCES);
  const settled = await Promise.allSettled(fundIds.map(fundId => fetchFundDataWithRetry(fundId)));

  const results = [];
  for (let i = 0; i < fundIds.length; i++) {
    const fundId = fundIds[i];
    const outcome = settled[i];
    try {
      if (outcome.status !== 'fulfilled') throw outcome.reason;
      const data = outcome.value;

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
      results.push({ fund_id: fundId, status: 'failed', error: errMsg(err) });
    }
  }
  return { fundIds, results };
}

// 各基金配息率（來源網站僅每月更新一次，這裡每天檢查一次即可自動跟上最新月配息率，彼此獨立，平行抓取）
async function runDividendRates() {
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
      dividendSummary.push({ fund_id: fundId, status: 'failed', error: errMsg(err) });
    }
  }
  return { dividendIds, dividendSummary };
}

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  // 四項任務彼此互不依賴，全部平行執行以縮短總執行時間，避免超過 Vercel 函式逾時上限
  // （AI內容生成、基金淨值、配息率沿用同一個每日排程，避免超過 Vercel Hobby 方案的排程數量上限）
  const [marketNoteStatus, stockPicksStatus, fundDataResult, dividendResult] = await Promise.all([
    runMarketNote(),
    runStockPicks(),
    runFundData(),
    runDividendRates(),
  ]);

  const { fundIds, results } = fundDataResult;
  const { dividendIds, dividendSummary } = dividendResult;
  const okCount = results.filter(r => r.status === 'ok').length;
  const dividendOkCount = dividendSummary.filter(r => r.status === 'ok').length;
  res.status(200).json({
    updated: okCount, total: fundIds.length, results, marketNoteStatus, stockPicksStatus,
    dividendUpdated: dividendOkCount, dividendTotal: dividendIds.length, dividendResults: dividendSummary,
  });
};
