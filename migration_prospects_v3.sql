-- ══════════════════════════════════════════
-- 準客戶名單：開放已登入員工可以刪除資料（後台的叉叉刪除按鈕）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
drop policy if exists "prospects_delete_auth" on prospects;
create policy "prospects_delete_auth" on prospects for delete using (auth.uid() is not null);
