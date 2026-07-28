-- ══════════════════════════════════════════
-- 顧問帳號改為繳費制：新註冊預設「待繳費」，管理者確認收款後才開通
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

-- 1. 放寬 status 欄位的 check 限制，新增 'pending'（待繳費）狀態
alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in ('active','pending','disabled'));

-- 2. 新註冊帳號預設狀態改為「待繳費」，需管理者手動開通才會是 active
alter table profiles alter column status set default 'pending';

-- 3. 既有帳號不受影響（維持原本 active/disabled 狀態，只有「新註冊」的帳號會走待繳費流程）
