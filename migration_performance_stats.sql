-- ══════════════════════════════════════════
-- 實戰績效公開統計：僅存總和數字，供 asset-assessment.html 等公開頁面讀取
-- 不含任何客戶姓名／明細，與 clients 等受保護資料表完全分離
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists performance_stats (
  id text primary key default 'overall',
  total_principal numeric not null default 0,
  total_received numeric not null default 0,
  total_value numeric not null default 0,
  updated_at timestamptz default now()
);

alter table performance_stats enable row level security;

-- 任何人（含公開頁面的 anon key）皆可讀取，僅後端 service role 可寫入
create policy "performance_stats_select_all" on performance_stats for select using (true);
