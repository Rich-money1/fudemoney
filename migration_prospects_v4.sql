-- ══════════════════════════════════════════
-- 準客戶名單：LINE ID 改為「聯絡方式」選項(Line/Instagram/Phone)
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
alter table prospects alter column line_id drop not null;
alter table prospects add column if not exists contact_method text; -- 'line' / 'instagram' / 'phone'
