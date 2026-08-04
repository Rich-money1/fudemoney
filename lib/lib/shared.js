const GROUP_LABELS = { TW: '台股', US: '美股', OTHER: '其他', INDEX: '大盤指數', FX: '匯率', METAL: '貴金屬', CRYPTO: '加密貨幣' };
const SIGNAL_CLASS = { '買進區間': 'buy', '觀望': 'wait', '避免追高': 'avoid', '跌破止損': 'stopped', '盤整': 'range' };

const NAV_LINKS = [
  { href: '/index.html', label: '總覽', match: 'index' },
  { href: '/portfolio.html', label: '持倉', match: 'portfolio' },
  { href: '/watchlist.html', label: '自選股 / 盯盤', match: 'watchlist' },
  { href: '/income.html', label: '現金流', match: 'income' },
];

function renderNavbar(active) {
  const links = NAV_LINKS.map(l => `<a href="${l.href}" class="${l.match === active ? 'active' : ''}">${l.label}</a>`).join('');
  return `
    <div class="nav-brand">
      <div class="nav-logo">投</div>
      <div>
        <div class="nav-title">投資分析網站</div>
        <div class="nav-sub">個人使用 · 非投資建議</div>
      </div>
    </div>
    <ul class="nav-links">${links}</ul>`;
}

function mountNavbar(active) {
  const el = document.getElementById('navbarSlot');
  if (el) el.innerHTML = renderNavbar(active);
}

function fmtNum(v, opts) {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  return n.toLocaleString('zh-TW', { maximumFractionDigits: (opts && opts.digits != null) ? opts.digits : (n < 10 ? 4 : 2) });
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2)}%`;
}

function changeClass(v) {
  if (v == null) return '';
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}

async function fetchHoldingsWithQuotes() {
  const res = await fetch('/api/holdings');
  const { holdings } = await res.json();
  if (!holdings || holdings.length === 0) return [];
  const symbols = holdings.map(h => h.symbol).join(',');
  const qRes = await fetch('/api/quotes?symbols=' + encodeURIComponent(symbols));
  const { quotes } = await qRes.json();
  const quoteMap = new Map((quotes || []).map(q => [q.symbol, q]));
  return holdings.map(h => {
    const q = quoteMap.get(h.symbol) || {};
    const price = q.price != null ? q.price : null;
    const marketValue = price != null ? price * h.quantity : null;
    const costValue = h.cost_basis * h.quantity;
    const pnl = marketValue != null ? marketValue - costValue : null;
    const pnlPct = (marketValue != null && costValue) ? (pnl / costValue) * 100 : null;
    return { ...h, price, change_percent: q.changePercent, marketValue, costValue, pnl, pnlPct };
  });
}

function signalCardHtml(row) {
  const badgeCls = SIGNAL_CLASS[row.signal] || 'wait';
  const entryText = (row.entry_low != null && row.entry_high != null)
    ? `${fmtNum(row.entry_low)} ~ ${fmtNum(row.entry_high)}` : '目前無明確進場區間';
  return `
    <div class="card">
      <div class="card-top">
        <div><span class="card-name">${row.name}</span><span class="card-symbol">${row.symbol}</span></div>
      </div>
      <div class="price-row">
        <span class="price">${fmtNum(row.price)}</span>
        <span class="change ${changeClass(row.change_percent)}">${fmtPct(row.change_percent)}</span>
        <span class="muted" style="font-size:12px;">${row.trend || ''} · RSI ${fmtNum(row.rsi14)}</span>
      </div>
      <span class="badge ${badgeCls}">${row.signal || '—'}</span>
      <div class="levels">
        進場區間：<b>${entryText}</b><br>
        止損：<b>${fmtNum(row.stop_loss)}</b>　止盈1：<b>${fmtNum(row.take_profit_1)}</b>　止盈2：<b>${fmtNum(row.take_profit_2)}</b><br>
        MACD柱狀圖：<b>${fmtNum(row.macd_histogram)}</b>　KD：<b>${fmtNum(row.kd_k,{digits:1})}/${fmtNum(row.kd_d,{digits:1})}</b>
      </div>
      ${row.tv_rating ? `<div class="tv-line">TradingView評級（非官方，僅供參考）：<b>${row.tv_rating}</b>（${fmtNum(row.tv_score,{digits:2})}）</div>` : ''}
      ${row.rationale ? `<div class="rationale">${row.rationale}</div>` : ''}
      <div class="card-link"><a href="/chart.html?symbol=${encodeURIComponent(row.symbol)}">看K線圖與完整指標 →</a></div>
    </div>`;
/* 選TW卻忘記加.TW後綴時自動補上，並統一轉大寫，避免同一檔因大小寫不同（2347.tw vs 2347.TW）
   在資料庫裡被當成兩檔不同標的（symbol欄位是區分大小寫的） */
function normalizeSymbol(symbol, market) {
  let s = (symbol || '').trim().toUpperCase();
  if (market === 'TW' && s && !/\.TW$/i.test(s)) s += '.TW';
  return s;
}
