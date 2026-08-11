-- ══════════════════════════════════════════
-- 虛擬倉：每次進場固定10萬台幣名目部位，用來實測盯盤智能助理訊號的勝率/報酬
-- 出現「買進區間」訊號且該標的目前沒有未平倉的虛擬倉時，自動以當下價格開一筆新倉；
-- 之後每次排程更新訊號時，用最新價格比對進場當時記錄的止損/止盈，觸發就平倉。
-- 止損/止盈皆用「進場當下」算出的錨點，不會因為之後訊號重新計算而變動。
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists virtual_trades (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text not null,
  market text not null,
  entry_date date not null default current_date,
  entry_price numeric not null,
  position_twd numeric not null default 100000,   -- 固定名目部位：10萬台幣/倉
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  status text not null default 'open' check (status in ('open','win_tp1','win_tp2','loss_stop')),
  exit_date date,
  exit_price numeric,
  pnl_percent numeric,   -- (出場價-進場價)/進場價 * 100
  pnl_twd numeric,       -- position_twd * pnl_percent / 100
  created_at timestamptz default now(),
  closed_at timestamptz
);
create index if not exists idx_virtual_trades_symbol on virtual_trades(symbol);
-- 同一標的同一時間只能有一筆未平倉的虛擬倉，避免訊號連續好幾天都是買進區間就一直重複開倉
create unique index if not exists idx_virtual_trades_open_symbol on virtual_trades(symbol) where status = 'open';

alter table virtual_trades enable row level security;
-- 跟盯盤訊號一樣限定：只有已登入且繳費開通(status=active)的顧問能讀取，只有後端service_role能寫入
create policy "vt_select_active" on virtual_trades for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
  );
