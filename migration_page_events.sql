-- ══════════════════════════════════════════
-- 客戶專屬網站流量分析（自建，免第三方帳號）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists page_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,   -- 'page_view' / 'lead_start_click' / 'lead_submitted'
  meta jsonb,                 -- 額外資訊，例如 {"contact_method":"line"}
  created_at timestamptz default now()
);
create index if not exists idx_page_events_type_time on page_events(event_type, created_at);
alter table page_events enable row level security;

-- 任何人（包含未登入的客戶端網站）都能新增一筆事件，但不能讀取/修改/刪除
create policy "page_events_insert_public" on page_events for insert with check (true);

-- 只有登入的員工/管理者能看到分析數據
create policy "page_events_select_auth" on page_events for select using (auth.uid() is not null);
