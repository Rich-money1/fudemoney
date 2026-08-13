-- ══════════════════════════════════════════
-- 台股/美股精選 TOP 20 每日股價與進場建議（AI依真實收盤價+市場新聞每日重寫）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists daily_stock_picks (
  id int primary key default 1,
  tw_notes jsonb not null default '{}',  -- { "2330": "7/17收盤2,290元...", ... } key為股票代號
  us_notes jsonb not null default '{}',  -- { "NVDA": "最新收盤202.81美元...", ... } key為Ticker
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
alter table daily_stock_picks enable row level security;
create policy "dsp_select_public" on daily_stock_picks for select using (true);
