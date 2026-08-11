const { TW_PICKS, US_PICKS } = require('./stockPicks');

/* 大盤/匯率/貴金屬觀察清單（Yahoo Finance 代碼，與 marketIndex.js 的即時報價來源一致） */
const INDEX_WATCHLIST = [
  { symbol: '^TWII',    name: '加權指數',   market: 'INDEX' },
  { symbol: '^DJI',     name: '道瓊指數',   market: 'INDEX' },
  { symbol: '^GSPC',    name: 'S&P 500',    market: 'INDEX' },
  { symbol: '^IXIC',    name: '那斯達克',   market: 'INDEX' },
  { symbol: 'USDTWD=X', name: '美元/台幣', market: 'FX' },
  { symbol: 'GC=F',     name: '黃金',       market: 'METAL' },
  { symbol: 'SI=F',     name: '銀',         market: 'METAL' },
];

/* 加密貨幣觀察清單（Yahoo Finance 代碼），24小時交易，技術指標計算方式與個股相同 */
const CRYPTO_WATCHLIST = [
  { symbol: 'WLD-USD', name: 'Worldcoin', market: 'CRYPTO' },
  { symbol: 'ETH-USD', name: '以太幣(Ethereum)', market: 'CRYPTO' },
];

/* 盯盤智能助理的完整觀察清單：精選個股（沿用每日報告的 TW_PICKS/US_PICKS）+ 大盤/匯率/貴金屬/加密貨幣 */
function buildWatchlist() {
  const twStocks = TW_PICKS.map(s => ({ symbol: `${s.code}.TW`, name: s.name, market: 'TW' }));
  const usStocks = US_PICKS.map(s => ({ symbol: s.code, name: s.name, market: 'US' }));
  return [...twStocks, ...usStocks, ...INDEX_WATCHLIST, ...CRYPTO_WATCHLIST];
}

module.exports = { buildWatchlist, INDEX_WATCHLIST, CRYPTO_WATCHLIST };
