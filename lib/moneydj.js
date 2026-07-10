const iconv = require('iconv-lite');

/* 各基金對應的 MoneyDJ 資料來源設定
   template: 'yp010000' | 'yp010001'（一般基金頁，只有淨值，無靜態報酬率）
             'cardif'（法巴人壽投資帳戶頁，淨值+報酬率皆為靜態資料）
   注意：部分基金有台幣/美元多種版本，此處選用與網站描述最接近的版本，
   如與客戶實際持有級別不符，請調整 code。 */
const FUND_SOURCES = {
  allianz:    { code: 'tlz64',  template: 'yp010001' }, // 安聯收益成長（美元AM月配）
  eastspring: { code: 'ACCP138',template: 'yp010000' }, // 瀚亞多重收益優化組合（美元B配息）
  schroder:   { code: 'pyzt8',  template: 'yp010001' }, // 施羅德環球收益成長（美元U月配固定）
  usgrowth:   { code: 'albt8',  template: 'yp010001' }, // 聯博-美國成長基金AP（美元總報酬月配）
  twinno:     { code: 'DMA052', template: 'cardif'   }, // 法巴人壽台灣新益投資帳戶
  allianzai:  { code: 'TLZL7',  template: 'yp010001' }, // 安聯AI收益成長（美元AM月配）
  abamerican: { code: 'ALB62',  template: 'yp010001' }, // 聯博美國收益（美元AA穩定月配）
  abmultiai:  { code: 'acti71', template: 'yp010000' }, // 聯博多元資產收益AI（美元）
  abusmi:     { code: 'ACTI94', template: 'yp010000' }, // 聯博美國多重收益AI（美元）
  jpminc:     { code: 'jfzn3',  template: 'yp010001' }, // 摩根多重收益（美元對沖月配固定）
  brkdata:    { code: 'shzt9',  template: 'yp010001' }, // 貝萊德全球智慧數據（A6美元）
};

async function fetchBig5(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, 'big5');
}

/* 一般 MoneyDJ 基金頁（yp010000 / yp010001）：只能穩定抓到淨值，抓不到報酬率（JS動態載入） */
function parseStandardNav(html) {
  const m = html.match(/class="t3n0c1">([\d/]+)<\/td>\s*<td class="t3n1">([\d.]+)<\/td>/);
  if (!m) return null;
  return { navDate: m[1], nav: parseFloat(m[2]) };
}

/* 法巴人壽 Cardif 投資帳戶頁：淨值 + 報酬率皆為靜態表格 */
function parseCardifNav(html) {
  const m = html.match(/<td class="text-center">([\d/]+)<\/td>\s*<td class="text-right">([\d.]+)<\/td>/);
  if (!m) return null;
  return { navDate: m[1], nav: parseFloat(m[2]) };
}
function parseCardifReturns(html) {
  // 找「資產撥回前」那一列：月/季/半年/1年/2年/3年/5年/成立以來
  const m = html.match(
    /<td>資產撥回前<\/td>\s*<td>([-\d.]+)<\/td>\s*<td>([-\d.]+)<\/td>\s*<td>([-\d.]+)<\/td>\s*<td>([-\d.]+)<\/td>\s*<td>([-\d.]+)<\/td>\s*<td>([-\d.]+)<\/td>/
  );
  if (!m) return null;
  return {
    return1y: parseFloat(m[4]),
    return3y: parseFloat(m[6]),
  };
}

async function fetchFundData(fundId) {
  const src = FUND_SOURCES[fundId];
  if (!src) throw new Error(`未知的基金 ID: ${fundId}`);

  if (src.template === 'cardif') {
    const navUrl = `https://cardif.moneydj.com/w/mcp/mcp02.djhtm?a=${src.code}`;
    const retUrl = `https://cardif.moneydj.com/w/mcp/mcp03.djhtm?a=${src.code}`;
    const [navHtml, retHtml] = await Promise.all([fetchBig5(navUrl), fetchBig5(retUrl)]);
    const navData = parseCardifNav(navHtml);
    const retData = parseCardifReturns(retHtml);
    return {
      fund_id: fundId,
      nav: navData?.nav ?? null,
      return_1y: retData?.return1y ?? null,
      return_3y: retData?.return3y ?? null,
      source_url: navUrl,
    };
  }

  const url = `https://www.moneydj.com/funddj/ya/${src.template}.djhtm?a=${src.code}`;
  const html = await fetchBig5(url);
  const navData = parseStandardNav(html);
  return {
    fund_id: fundId,
    nav: navData?.nav ?? null,
    return_1y: null,  // 一般基金頁抓不到，維持前端既有靜態描述
    return_3y: null,
    source_url: url,
  };
}

/* 解析「日期list,值list」合併字串（最後一個日期與第一個值中間是空格、不是逗號） */
function parseDateValueBlob(text) {
  const fields = text.split(',');
  const mergeIdx = fields.findIndex(f => f.includes(' '));
  if (mergeIdx === -1) return [];

  const [lastDate, firstVal] = fields[mergeIdx].trim().split(/\s+/);
  const dates = [...fields.slice(0, mergeIdx), lastDate];
  const values = [firstVal, ...fields.slice(mergeIdx + 1)];

  const n = Math.min(dates.length, values.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = dates[i];
    const v = parseFloat(values[i]);
    if (!/^\d{8}$/.test(d) || isNaN(v)) continue;
    const iso = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
    out.push({ date: iso, nav: v });
  }
  return out;
}

/* 抓取指定日期範圍的完整淨值歷史（用於一次性回填，7年約可回溯到2019年） */
async function fetchNavHistory(fundId, fromDate, toDate) {
  const src = FUND_SOURCES[fundId];
  if (!src) throw new Error(`未知的基金 ID: ${fundId}`);

  let url;
  if (src.template === 'cardif') {
    url = `https://cardif.moneydj.com/w/bcd/custBCDNavList.djbcd?a=${src.code}&b=1&c=${fromDate}&d=${toDate}`;
  } else if (src.template === 'yp010001') {
    // 境外基金版型：端點名稱少一個開頭的 t，且多一個空的 D 參數
    url = `https://www.moneydj.com/funddj/bcd/BCDNavList.djbcd?a=${src.code}&B=${fromDate}&C=${toDate}&D=`;
  } else {
    // 境內基金版型（yp010000）
    url = `https://www.moneydj.com/funddj/bcd/tBCDNavList.djbcd?a=${src.code}&B=${fromDate}&C=${toDate}`;
  }

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  let text = await res.text();
  text = text.split('<!--')[0].trim(); // cardif 格式結尾會有HTML註解，去掉

  const points = parseDateValueBlob(text);
  points.sort((a, b) => a.date.localeCompare(b.date)); // 統一由舊到新排序（cardif是新到舊）
  return points;
}

module.exports = { FUND_SOURCES, fetchFundData, fetchNavHistory };
