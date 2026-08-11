-- ══════════════════════════════════════════
-- 移除 IG 內容管理功能建立的資料表與儲存空間
-- 僅在你先前已經執行過 migration_ig_posts.sql 時才需要跑這個
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

drop policy if exists "ig_media_auth_delete" on storage.objects;
drop policy if exists "ig_media_auth_upload" on storage.objects;
drop policy if exists "ig_media_public_read" on storage.objects;

delete from storage.objects where bucket_id = 'ig-media';
delete from storage.buckets where id = 'ig-media';

drop table if exists ig_posts;
