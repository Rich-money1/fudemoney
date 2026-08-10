-- ══════════════════════════════════════════
-- Instagram 內容排程／自動發文（富得財富管理官方 IG）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

create table if not exists ig_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id),
  caption text not null default '',
  image_path text not null,        -- storage 內的檔案路徑（ig-media bucket）
  image_url text not null,         -- 對外公開網址，IG Graph API 抓圖用
  scheduled_date date not null,    -- 排定發文日期（每日排程掃描時比對）
  status text not null default 'scheduled', -- scheduled / published / failed
  ig_media_id text,
  ig_permalink text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table ig_posts enable row level security;

-- 所有已登入顧問／管理者都能看到與管理排程內容（單一品牌帳號共用素材庫）
drop policy if exists "ig_posts_select" on ig_posts;
create policy "ig_posts_select" on ig_posts for select
  using (auth.uid() is not null);

drop policy if exists "ig_posts_insert" on ig_posts;
create policy "ig_posts_insert" on ig_posts for insert
  with check (auth.uid() is not null);

drop policy if exists "ig_posts_update" on ig_posts;
create policy "ig_posts_update" on ig_posts for update
  using (auth.uid() is not null);

drop policy if exists "ig_posts_delete" on ig_posts;
create policy "ig_posts_delete" on ig_posts for delete
  using (owner_id = auth.uid() or is_admin());

-- 圖片素材儲存空間（需公開讀取，IG Graph API 才能從網址抓圖發布）
insert into storage.buckets (id, name, public)
values ('ig-media', 'ig-media', true)
on conflict (id) do nothing;

drop policy if exists "ig_media_public_read" on storage.objects;
create policy "ig_media_public_read" on storage.objects
  for select using (bucket_id = 'ig-media');

drop policy if exists "ig_media_auth_upload" on storage.objects;
create policy "ig_media_auth_upload" on storage.objects
  for insert with check (bucket_id = 'ig-media' and auth.uid() is not null);

drop policy if exists "ig_media_auth_delete" on storage.objects;
create policy "ig_media_auth_delete" on storage.objects
  for delete using (bucket_id = 'ig-media' and auth.uid() is not null);
