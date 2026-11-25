-- ══════════════════════════════════════════
-- 每日開門話題（AI依市場新聞找出可以跟客戶破冰聊天的話題，給顧問直接照著說）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists daily_talk_topics (
  id int primary key default 1,
  topics jsonb not null default '[]',  -- ["話題一句話...", "話題二句話...", ...]
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
alter table daily_talk_topics enable row level security;
create policy "dtt_select_public" on daily_talk_topics for select using (true);
