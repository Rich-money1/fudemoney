-- ══════════════════════════════════════════
-- 客戶新增「每月負債總額」欄位，供客戶計畫頁計算負債比／成長比與加碼規劃
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
alter table clients add column if not exists monthly_debt numeric not null default 0;
