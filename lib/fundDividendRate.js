const iconv = require('iconv-lite');

/* 各基金「配息率」資料來源設定（不同於 lib/moneydj.js 的淨值來源，
   配息率需要各自對應到有公布月配息紀錄的頁面/API）
   type: 'moneydj'（wb05.djhtm 或 funddividend.djhtm，皆有「年化配息率」欄位，格式共通）
         'moneylink'（法巴人壽投資帳戶頁，只有每單位分配金額，需自行用最新淨值換算年化率）
         'cnyes'（鉅亨網基金API，直接回傳 sitcaYield 年化配息率） */
const DIVIDEND_SOURCES = {
  allianz:    { type: 'moneydj',   code: 'TLZF9' },     // 安聯收益成長 AMg7
  eastspring: { type: 'moneydj',   code: 'ACCP138' },   // 瀚亞多重收益
  schroder:   { type: 'moneydj',   code: 'ACES95' },    // 施羅德多重收益
  usgrowth:   { type: 'moneydj',   code: 'ALBT8' },     // 美國成長 AP
  twinno:     { type: 'moneylink', code: '0P0001DFB9' },// 台灣新益
  jpminc:     { type: 'cnyes',     code: 'B080291' },   // 摩根多重收益
  abusmi:     { type: 'moneydj',   code: 'ACTI94' },    // 聯博美國多重收益AI
  allianzai:  { type: 'moneydj',   code: 'TLZL7' },     // 安聯AI收益成長
  abamerican: { type: 'moneydj',   code: 'ALB62' },     // 聯博美國收益
  abmultiai:  { type: 'moneydj',   code: 'acti71' },    // 聯博多元資產收益AI
  brkdata:    { type: 'moneydj',   code: 'shzt9' },     // 貝萊德全球智慧數據
  // twtech（安聯台灣科技）為累積型基金，不配息，故無資料來源
};

async function fetchBig5(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, 'big5');
}

async function fetchUtf8(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/* MoneyDJ wb05.djhtm 與 funddividend.djhtm 兩種版型的配息紀錄表格共用同一組欄位格式，
   取表格第一列（最新一筆）的「每單位分配金額」與「年化配息率%」 */
function parseMoneyDjDividendRate(html) {
  const m = html.match(
    /<td class="t3n0c1">([\d/]+)<\/td>[\s\S]{0,400}?<td class="t3n1"[^>]*>([\d.]+)(?:&nbsp;)?\s*<\/td>\s*<td class="t3n1"[^>]*>([\d.]+)(?:&nbsp;)?\s*<\/td>/
  );
  if (!m) return null;
  return { date: m[1], amount: parseFloat(m[2]), rate: parseFloat(m[3]) };
}

/* MoneyLink 法巴人壽投資帳戶頁：只有「每單位分配金額」，沒有年化配息率，
   需另外取同頁「最新淨值」，用 amount / nav * 12 * 100 自行換算年化率 */
function parseMoneyLinkNav(html) {
  const m = html.match(
    /<th>淨值日期<\/th>[\s\S]*?<td class="[^"]*">([\d/]+)<\/td>\s*<td class="[^"]*">([\d.]+)<\/td>/
  );
  if (!m) return null;
  return { navDate: m[1], nav: parseFloat(m[2]) };
}
function parseMoneyLinkDividend(html) {
  const m = html.match(
    /<th width="34%">除息日<\/th>[\s\S]*?<tr><td>([\d/]+)<\/td><td>([\d.]+)<\/td><td>([^<]*)<\/td>/
  );
  if (!m) return null;
  return { date: m[1], amount: parseFloat(m[2]) };
}

async function fetchDividendRate(fundId) {
  const src = DIVIDEND_SOURCES[fundId];
  if (!src) return null;

  if (src.type === 'moneydj') {
    // 先試 wb05（多為美元AM/月收系列），沒有資料再試 funddividend（多為B配息/穩定月配系列）
    const urls = [
      `https://www.moneydj.com/funddj/yp/wb05.djhtm?a=${src.code}`,
      `https://www.moneydj.com/funddj/yp/funddividend.djhtm?a=${src.code}`,
    ];
    for (const url of urls) {
      const html = await fetchBig5(url);
      const parsed = parseMoneyDjDividendRate(html);
      if (parsed) {
        return { fund_id: fundId, rate: parsed.rate, source_url: url, dividend_date: parsed.date };
      }
    }
    return null;
  }

  if (src.type === 'moneylink') {
    const url = `https://moneylink.com.tw/Fund/FundCouponRecord.aspx?FundCode=${src.code}`;
    const html = await fetchUtf8(url);
    const nav = parseMoneyLinkNav(html);
    const div = parseMoneyLinkDividend(html);
    if (!nav || !div || !nav.nav) return null;
    const rate = (div.amount / nav.nav) * 12 * 100;
    return { fund_id: fundId, rate, source_url: url, dividend_date: div.date };
  }

  if (src.type === 'cnyes') {
    const url = `https://fund.api.cnyes.com/fund/api/v1/funds/${src.code}/dividend?page=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = await res.json();
    const row = json?.items?.data?.[0];
    if (!row || row.sitcaYield == null) return null;
    const dividendDate = row.excludingDate ? new Date(row.excludingDate * 1000).toISOString().slice(0, 10) : null;
    return { fund_id: fundId, rate: row.sitcaYield, source_url: url, dividend_date: dividendDate };
  }

  return null;
}

module.exports = { DIVIDEND_SOURCES, fetchDividendRate };
