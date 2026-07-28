-- ══════════════════════════════════════════
-- 月配息現金流：基金配息率自動更新
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists fund_dividend_rate (
  fund_id text primary key,
  rate numeric not null,            -- 年化配息率（%），例如 9.12 代表 9.12%
  dividend_date text,               -- 資料來源的最新一次配息基準日（原始字串，例如 2026/07/14）
  source_url text,
  updated_at timestamptz default now()
);

alter table fund_dividend_rate enable row level security;

-- 任何登入使用者（含前台匿名 anon key）皆可讀取，僅後端 service role 可寫入
create policy "fund_dividend_rate_select_all" on fund_dividend_rate for select using (true);
