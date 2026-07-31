-- ══════════════════════════════════════════
-- 準客戶名單新增「貸款金額」欄位（選填）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
alter table prospects add column if not exists loan_amount numeric;
