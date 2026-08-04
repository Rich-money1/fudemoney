/* 選TW卻忘記加.TW後綴時自動補上，避免Yahoo Finance查無此代碼(404) */
function normalizeSymbol(symbol, market) {
  let s = (symbol || '').trim();
  if (market === 'TW' && s && !/\.TW$/i.test(s)) s += '.TW';
  return s;
}
