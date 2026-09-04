-- ══════════════════════════════════════════
-- 準客戶名單擴充：支援資產評估頁（asset-assessment.html）的三情境表單
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

-- 姓名／稱呼（資產評估頁有問，原本的意向表單沒有這欄）
alter table prospects add column if not exists name text;

-- 使用者選擇的情境：'a' 擁有資產(優化資產) / 'b' 貸款規劃(根除債務) / 'c' 定期累積(複利資產)
alter table prospects add column if not exists path text;

-- 各情境的完整選填內容（區間、狀態等），完整保留原始選項文字，不做四捨五入或換算，
-- 例如 {"fund_range":"100-300萬","fund_state":"定存","fund_timing":"1-3年","cashflow_need":"非常需要"}
alter table prospects add column if not exists details jsonb;
