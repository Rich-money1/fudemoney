const iconv = require('iconv-lite');

/* 每日投資觀點的參考新聞來源。部分頁面內容混雜大量選單/頁尾文字，
   交給 AI 摘要時已足夠讓它自行篩選出真正的財經內容，不強求乾淨的結構化擷取。 */
const NEWS_SOURCES = [
  { name: 'MoneyDJ 財經新聞', url: 'https://www.moneydj.com/iquote/iQuoteNewsMkt.djhtm', encoding: 'big5' },
  { name: '貝萊德 每週環球投資評論', url: 'https://www.blackrock.com/hk/zh/global-weekly-commentary', encoding: 'utf8' },
  { name: '群益期貨 每日投行機構觀點', url: 'https://www.capitalfutures.com.tw/zh-tw/financial/globalarticle', encoding: 'utf8' },
  { name: '滙豐 財富遠見', url: 'https://www.hsbc.com.tw/wealth/insights/', encoding: 'utf8' },
];

/* 鉅亨網「美股雷達」個股分析專欄：走結構化JSON API（非一般網頁），每天都有新的個股焦點新聞，
   title+summary本身就是乾淨的重點摘要，比其他來源的原始HTML雜訊少很多 */
const CNYES_RADAR = {
  name: '鉅亨網 美股雷達（個股分析）',
  apiUrl: 'https://api.cnyes.com/media/api/v1/newslist/category/us_stock?page=1&limit=8',
  url: 'https://news.cnyes.com/news/cat/us_stock',
};

async function fetchCnyesRadar() {
  try {
    const res = await fetch(CNYES_RADAR.apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = json?.items?.data || [];
    const text = items.map(it => {
      const summary = (it.summary || '').replace(/&#10;/g, '；').trim();
      return `【${it.title}】${summary}`;
    }).join('\n');
    return { name: CNYES_RADAR.name, url: CNYES_RADAR.url, text: text.slice(0, 2500) };
  } catch (err) {
    return { name: CNYES_RADAR.name, url: CNYES_RADAR.url, text: '', error: err.message };
  }
}

function stripHtmlToText(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

async function fetchSourceText(source) {
  try {
    const res = await fetch(source.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FudeWealthBot/1.0)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const html = source.encoding === 'big5' ? iconv.decode(buf, 'big5') : buf.toString('utf8');
    const text = stripHtmlToText(html);
    return { name: source.name, url: source.url, text: text.slice(0, 2500) };
  } catch (err) {
    return { name: source.name, url: source.url, text: '', error: err.message };
  }
}

async function fetchAllMarketNews() {
  const [htmlSources, radar] = await Promise.all([
    Promise.all(NEWS_SOURCES.map(fetchSourceText)),
    fetchCnyesRadar(),
  ]);
  return [...htmlSources, radar];
}

module.exports = { fetchAllMarketNews, NEWS_SOURCES, CNYES_RADAR };
