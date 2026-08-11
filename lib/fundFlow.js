const iconv = require('iconv-lite');
const { supabase } = require('./supabase');

/* 類股資金流向表（富邦e點通DJ資料）：頁面內容是Big5編碼、伺服器端渲染的靜態表格，
   分「上市資金流向表」「上櫃資金流向表」兩塊，各是「類股名稱／流向率(%)」的4欄格狀排列。
   流向率＝該類股成交金額佔當日大盤總成交金額的比重，數字越高代表資金越集中在該類股。 */
const SOURCE_URL = 'https://fubon-ebrokerdj.fbs.com.tw/z/zb/zba/zba.djhtm';

async function fetchFundFlowHtml() {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${SOURCE_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, 'big5');
}

/* 從一段HTML區塊裡把「類股名稱／流向率」配對全部抓出來 */
function parseSectorRows(block, market) {
  const rows = [];
  const rowRegex = /<td class="t4t1">([^<]+)<\/td>\s*<td class="t3n1">([\d.]+)%<\/td>/gi;
  let m;
  while ((m = rowRegex.exec(block))) {
    rows.push({ market, sector: m[1].trim(), flow_rate: parseFloat(m[2]) });
  }
  return rows;
}

function parseFundFlow(html) {
  const tseStart = html.indexOf('上市資金流向表');
  const otcStart = html.indexOf('上櫃資金流向表');
  if (tseStart === -1 || otcStart === -1) throw new Error('資金流向表頁面格式不符預期，找不到上市/上櫃區塊');
  const otcEnd = html.indexOf('<select', otcStart);

  const tseBlock = html.slice(tseStart, otcStart);
  const otcBlock = html.slice(otcStart, otcEnd === -1 ? undefined : otcEnd);

  const rows = [...parseSectorRows(tseBlock, 'TSE'), ...parseSectorRows(otcBlock, 'OTC')];
  if (rows.length === 0) throw new Error('資金流向表解析結果為空');
  return rows;
}

/* 排程呼叫：抓最新一天的類股資金流向並寫入資料庫，同一天同一類股會覆蓋(upsert)，
   不同天則會累積成歷史紀錄，供之後追蹤「資金連續流入」的趨勢用 */
async function updateSectorFundFlow() {
  const html = await fetchFundFlowHtml();
  const rows = parseFundFlow(html);
  const recordedDate = new Date().toISOString().slice(0, 10);
  const upsertRows = rows.map(r => ({ ...r, recorded_date: recordedDate }));

  const { error } = await supabase
    .from('sector_fund_flow')
    .upsert(upsertRows, { onConflict: 'market,sector,recorded_date' });
  if (error) throw error;

  return { updated: upsertRows.length };
}

module.exports = { fetchFundFlowHtml, parseFundFlow, updateSectorFundFlow };
