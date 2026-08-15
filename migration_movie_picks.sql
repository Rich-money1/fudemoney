-- ══════════════════════════════════════════
-- AI 電影頻道 · 每日精選片單（AI每日重新生成，公開頁面使用）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists daily_movie_picks (
  id int primary key default 1,
  picks jsonb not null default '[]',  -- [{title, original_title, year, genres:[...], hook, availability}, ...] 共6筆
  theme text,                         -- 當天的選片主題（例如「療癒系」），純展示用
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
alter table daily_movie_picks enable row level security;
-- 公開頁面，任何人（含未登入）都能讀取；只有後端 service_role 能寫入
create policy "dmp_select_public" on daily_movie_picks for select using (true);
