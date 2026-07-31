-- ══════════════════════════════════════════
-- 準客戶名單依顧問歸屬：每位顧問（含管理者）只看得到自己專屬連結帶來的名單
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

-- 1. 新增 owner_id 欄位，記錄這筆名單是透過哪位顧問的專屬連結填寫的
alter table prospects add column if not exists owner_id uuid references profiles(id);

-- 2. 讀取／刪除權限改為只看自己名下的名單；
--    owner_id 是空值（例如舊資料、或沒有帶推廣代碼的連結）則歸管理者可見，避免名單遺失
drop policy if exists "prospects_select_auth" on prospects;
create policy "prospects_select_auth" on prospects for select
  using (owner_id = auth.uid() or (owner_id is null and is_admin()));

drop policy if exists "prospects_delete_auth" on prospects;
create policy "prospects_delete_auth" on prospects for delete
  using (owner_id = auth.uid() or (owner_id is null and is_admin()));

-- 3. 新增更新權限（例如「轉為客戶」後可能需要標記狀態），同樣依歸屬限制
drop policy if exists "prospects_update_auth" on prospects;
create policy "prospects_update_auth" on prospects for update
  using (owner_id = auth.uid() or (owner_id is null and is_admin()));

-- insert 政策維持原本 with check (true)，因為客戶專屬網站的表單是公開未登入的訪客填寫，
-- owner_id 由前端依網址中的推廣代碼帶入
