const { supabase } = require('./supabase');

const POSITION_TWD = 100000; // 每倉固定名目部位：10萬台幣，用比例(%)換算損益，不用實際股數，也不用處理美股匯率換算

/* 用當天收盤價比對「進場當時」記錄的止損/止盈錨點（不是用當天重新算出的最新錨點），
   同一天若同時觸及止損與止盈，優先判定止損（保守假設）；止盈則取有觸及的較高目標。 */
function decideExit(trade, price) {
  if (price == null) return null;
  if (trade.stop_loss != null && price <= trade.stop_loss) return { status: 'loss_stop', exitPrice: price };
  if (trade.take_profit_2 != null && price >= trade.take_profit_2) return { status: 'win_tp2', exitPrice: price };
  if (trade.take_profit_1 != null && price >= trade.take_profit_1) return { status: 'win_tp1', exitPrice: price };
  return null;
}

/* 平倉檢查：用這次排程剛算出的最新價格(signalRows)比對所有未平倉虛擬倉 */
async function closeMaturedTrades(signalRows) {
  const priceMap = new Map(signalRows.map(r => [r.symbol, r.price]));
  const { data: openTrades, error } = await supabase.from('virtual_trades').select('*').eq('status', 'open');
  if (error) throw error;
  if (!openTrades || openTrades.length === 0) return [];

  const closed = [];
  for (const trade of openTrades) {
    const price = priceMap.get(trade.symbol);
    const exit = decideExit(trade, price);
    if (!exit) continue;

    const pnlPercent = +(((exit.exitPrice - trade.entry_price) / trade.entry_price) * 100).toFixed(4);
    const pnlTwd = +((POSITION_TWD * pnlPercent) / 100).toFixed(2);
    const { error: updateError } = await supabase.from('virtual_trades').update({
      status: exit.status,
      exit_date: new Date().toISOString().slice(0, 10),
      exit_price: exit.exitPrice,
      pnl_percent: pnlPercent,
      pnl_twd: pnlTwd,
      closed_at: new Date().toISOString(),
    }).eq('id', trade.id);
    if (updateError) throw updateError;
    closed.push({ symbol: trade.symbol, status: exit.status, pnl_percent: pnlPercent });
  }
  return closed;
}

/* 開新倉：訊號為「買進區間」且該標的目前沒有未平倉倉位時，以當下收盤價開一筆新虛擬倉 */
async function openNewTrades(signalRows) {
  const candidates = signalRows.filter(r => r.signal === '買進區間' && r.price != null);
  if (candidates.length === 0) return [];

  const { data: openTrades, error } = await supabase.from('virtual_trades').select('symbol').eq('status', 'open');
  if (error) throw error;
  const openSymbols = new Set((openTrades || []).map(t => t.symbol));

  const toInsert = candidates
    .filter(r => !openSymbols.has(r.symbol))
    .map(r => ({
      symbol: r.symbol,
      name: r.name,
      market: r.market,
      entry_date: new Date().toISOString().slice(0, 10),
      entry_price: r.price,
      position_twd: POSITION_TWD,
      stop_loss: r.stop_loss ?? null,
      take_profit_1: r.take_profit_1 ?? null,
      take_profit_2: r.take_profit_2 ?? null,
      status: 'open',
    }));
  if (toInsert.length === 0) return [];

  const { error: insertError } = await supabase.from('virtual_trades').insert(toInsert);
  if (insertError) throw insertError;
  return toInsert.map(t => ({ symbol: t.symbol, entry_price: t.entry_price }));
}

/* 排程每次更新完盯盤訊號後呼叫：先結算到期的舊倉，再用最新訊號開新倉 */
async function processVirtualTrades(signalRows) {
  const closed = await closeMaturedTrades(signalRows);
  const opened = await openNewTrades(signalRows);
  return { closed, opened };
}

module.exports = { processVirtualTrades };
