-- ══════════════════════════════════════════
-- 富得財富管理 · Supabase 資料庫結構
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

-- ── 1. 員工資料表（角色：admin / advisor）──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'advisor' check (role in ('admin','advisor')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz default now()
);

-- ── 2. 客戶主表 ──
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  line_display_id text,
  line_user_id text,          -- 由 LINE webhook 自動綁定，發訊息用
  link_code text unique default substr(md5(random()::text),1,6),  -- 客戶加好友後傳這組代碼完成綁定
  remind_enabled boolean default true,
  created_at timestamptz default now()
);

-- ── 3. 配息投資組合（一位客戶可有多筆本金組）──
create table if not exists dividend_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  principal numeric not null default 0,
  fund_ids text[] not null default '{}',   -- 例如 ['allianz','eastspring']
  created_at timestamptz default now()
);

-- ── 4. 成長型持有（累積型基金，不配息）──
create table if not exists growth_holdings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  principal numeric not null default 0,
  fund_id text not null,
  rate numeric not null default 0,
  created_at timestamptz default now()
);

-- ── 5. 推播發送紀錄（避免重複發送＋追蹤）──
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  fund_id text,
  sent_date date not null default current_date,
  message_content text,
  created_at timestamptz default now(),
  unique (client_id, fund_id, sent_date)   -- 同一天同一檔基金不會重複發送
);

-- ══════════════════════════════════════════
-- Row Level Security（資料庫層強制權限隔離）
-- ══════════════════════════════════════════

alter table profiles enable row level security;
alter table clients enable row level security;
alter table dividend_groups enable row level security;
alter table growth_holdings enable row level security;
alter table notification_log enable row level security;

-- 判斷目前登入者是否為 admin 的小工具函數
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles：每個人都能看自己的資料；admin 能看全部
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin());
create policy "profiles_update_self" on profiles for update
  using (id = auth.uid() or is_admin());
create policy "profiles_insert_admin" on profiles for insert
  with check (is_admin());

-- clients：員工只能操作自己的客戶；admin 能操作全部
create policy "clients_select" on clients for select
  using (owner_id = auth.uid() or is_admin());
create policy "clients_insert" on clients for insert
  with check (owner_id = auth.uid() or is_admin());
create policy "clients_update" on clients for update
  using (owner_id = auth.uid() or is_admin());
create policy "clients_delete" on clients for delete
  using (owner_id = auth.uid() or is_admin());

-- dividend_groups：跟著對應客戶的擁有者走
create policy "dg_select" on dividend_groups for select
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));
create policy "dg_insert" on dividend_groups for insert
  with check (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));
create policy "dg_update" on dividend_groups for update
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));
create policy "dg_delete" on dividend_groups for delete
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));

-- growth_holdings：同樣邏輯
create policy "gh_select" on growth_holdings for select
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));
create policy "gh_insert" on growth_holdings for insert
  with check (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));
create policy "gh_update" on growth_holdings for update
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));
create policy "gh_delete" on growth_holdings for delete
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));

-- notification_log：只能看，不能改（發送紀錄由後端 service_role 寫入）
create policy "nl_select" on notification_log for select
  using (exists(select 1 from clients c where c.id = client_id and (c.owner_id = auth.uid() or is_admin())));

-- ══════════════════════════════════════════
-- 新使用者註冊時，自動建立 profiles 資料列
-- （預設角色 advisor，Eddie 要手動把自己那筆改成 admin）
-- ══════════════════════════════════════════
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'advisor');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
