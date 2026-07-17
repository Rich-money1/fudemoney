const iconv = require('iconv-lite');

/* 每日投資觀點的參考新聞來源。部分頁面內容混雜大量選單/頁尾文字，
   交給 AI 摘要時已足夠讓它自行篩選出真正的財經內容，不強求乾淨的結構化擷取。 */
const NEWS_SOURCES = [
  { name: 'MoneyDJ 財經新聞', url: 'https://www.moneydj.com/iquote/iQuoteNewsMkt.djhtm', encoding: 'big5' },
  { name: '貝萊德 每週環球投資評論', url: 'https://www.blackrock.com/hk/zh/global-weekly-commentary', encoding: 'utf8' },
  { name: '群益期貨 每日投行機構觀點', url: 'https://www.capitalfutures.com.tw/zh-tw/financial/globalarticle', encoding: 'utf8' },
  { name: '滙豐 財富遠見', url: 'https://www.hsbc.com.tw/wealth/insights/', encoding: 'utf8' },
];

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
  return Promise.all(NEWS_SOURCES.map(fetchSourceText));
}

module.exports = { fetchAllMarketNews, NEWS_SOURCES };
