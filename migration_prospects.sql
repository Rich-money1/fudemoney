-- ══════════════════════════════════════════
-- 準客戶名單（來自客戶專屬網站 client.html 的意向表單）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  line_id text not null,
  principal numeric,                  -- 試算時輸入的本金
  monthly_expense numeric,            -- 每月開支
  invested_options text[] default '{}', -- 已投資選項，例如 ['stock','etf']
  desired_monthly_dividend numeric,    -- 期望月配息
  created_at timestamptz default now()
);
alter table prospects enable row level security;

-- 任何人（包含未登入的客戶端網站）都能新增一筆意向資料，但不能讀取/修改/刪除
create policy "prospects_insert_public" on prospects for insert with check (true);

-- 只有登入的員工/管理者能看到名單（尚未分派給特定員工，全員共用名單）
create policy "prospects_select_auth" on prospects for select using (auth.uid() is not null);
