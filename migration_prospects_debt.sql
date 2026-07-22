-- ══════════════════════════════════════════
-- 準客戶名單：新增負債狀況欄位（信貸/車貸/都有/都沒有）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
alter table prospects add column if not exists debt_status text; -- 'credit' / 'car' / 'both' / 'none'
