-- ══════════════════════════════════════════
-- 每日投資觀點（AI依市場新聞來源自動彙整，取代原本寫死的靜態文字）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists daily_market_note (
  id int primary key default 1,
  content text not null,       -- HTML片段(含<strong>/<em>等既有格式)，直接注入 jn-body
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
alter table daily_market_note enable row level security;
create policy "dmn_select_public" on daily_market_note for select using (true);
