-- ══════════════════════════════════════════
-- 準客戶名單欄位擴充：每月收入區間、方便聯繫時間
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
alter table prospects add column if not exists monthly_income text;         -- 每月收入區間，例如 '30000-35000' / '50000+'
alter table prospects add column if not exists preferred_contact_time text; -- 方便聯繫時間，例如 '9-12' / '12-17' / '17-21'
