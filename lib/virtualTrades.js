const { supabase } = require('./supabase');

const POSITION_TWD = 100000; // 每倉固定名目部位：10萬台幣，用比例(%)換算損益，不用實際股數，也不用處理美股匯率換算

/* 用當天收盤價比對「進場當時」記錄的止損/止盈錨點（不是用當天重新算出的最新錨點），
   同一天若同時觸及止損與止盈，優先判定止損（保守假設）；止盈則取有觸及的較高目標。
   空單方向相反：止損是價格漲破，止盈是價格跌破。 */
function decideExit(trade, price) {
  if (price == null) return null;
  if (trade.direction === 'short') {
    if (trade.stop_loss != null && price >= trade.stop_loss) return { status: 'loss_stop', exitPrice: price };
    if (trade.take_profit_2 != null && price <= trade.take_profit_2) return { status: 'win_tp2', exitPrice: price };
    if (trade.take_profit_1 != null && price <= trade.take_profit_1) return { status: 'win_tp1', exitPrice: price };
    return null;
  }
  if (trade.stop_loss != null && price <= trade.stop_loss) return { status: 'loss_stop', exitPrice: price };
  if (trade.take_profit_2 != null && price >= trade.take_profit_2) return { status: 'win_tp2', exitPrice: price };
  if (trade.take_profit_1 != null && price >= trade.take_profit_1) return { status: 'win_tp1', exitPrice: price };
  return null;
}

/* 平倉檢查：用這次排程剛算出的最新價格(signalRows)比對所有未平倉虛擬倉（多單+空單都在同一張表） */
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

    // 多單：跌價賠、漲價賺。空單方向相反：跌價賺、漲價賠。
    const rawPnlPercent = trade.direction === 'short'
      ? ((trade.entry_price - exit.exitPrice) / trade.entry_price) * 100
      : ((exit.exitPrice - trade.entry_price) / trade.entry_price) * 100;
    const pnlPercent = +rawPnlPercent.toFixed(4);
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
    closed.push({ symbol: trade.symbol, direction: trade.direction, status: exit.status, pnl_percent: pnlPercent });
  }
  return closed;
}

/* 開新倉：多方訊號為「買進區間」開多單，空方訊號為「放空區間」開空單，
   兩個方向各自獨立判斷是否已有未平倉倉位（同一標的可以同時有一筆多單+一筆空單）。 */
async function openNewTrades(signalRows) {
  const longCandidates = signalRows.filter(r => r.signal === '買進區間' && r.price != null);
  const shortCandidates = signalRows.filter(r => r.short_signal === '放空區間' && r.price != null);
  if (longCandidates.length === 0 && shortCandidates.length === 0) return [];

  const { data: openTrades, error } = await supabase.from('virtual_trades').select('symbol, direction').eq('status', 'open');
  if (error) throw error;
  const openKeys = new Set((openTrades || []).map(t => `${t.symbol}|${t.direction}`));

  const toInsert = [
    ...longCandidates
      .filter(r => !openKeys.has(`${r.symbol}|long`))
      .map(r => ({
        symbol: r.symbol,
        name: r.name,
        market: r.market,
        direction: 'long',
        entry_date: new Date().toISOString().slice(0, 10),
        entry_price: r.price,
        position_twd: POSITION_TWD,
        stop_loss: r.stop_loss ?? null,
        take_profit_1: r.take_profit_1 ?? null,
        take_profit_2: r.take_profit_2 ?? null,
        status: 'open',
      })),
    ...shortCandidates
      .filter(r => !openKeys.has(`${r.symbol}|short`))
      .map(r => ({
        symbol: r.symbol,
        name: r.name,
        market: r.market,
        direction: 'short',
        entry_date: new Date().toISOString().slice(0, 10),
        entry_price: r.price,
        position_twd: POSITION_TWD,
        stop_loss: r.short_stop_loss ?? null,
        take_profit_1: r.short_take_profit_1 ?? null,
        take_profit_2: r.short_take_profit_2 ?? null,
        status: 'open',
      })),
  ];
  if (toInsert.length === 0) return [];

  const { error: insertError } = await supabase.from('virtual_trades').insert(toInsert);
  if (insertError) throw insertError;
  return toInsert.map(t => ({ symbol: t.symbol, direction: t.direction, entry_price: t.entry_price }));
}

/* 排程每次更新完盯盤訊號後呼叫：先結算到期的舊倉，再用最新訊號開新倉 */
async function processVirtualTrades(signalRows) {
  const closed = await closeMaturedTrades(signalRows);
  const opened = await openNewTrades(signalRows);
  return { closed, opened };
}

module.exports = { processVirtualTrades };
