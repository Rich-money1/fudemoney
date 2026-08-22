-- ══════════════════════════════════════════
-- 盯盤智能助理：新增空方（做空）判讀欄位
-- 跟原本多方欄位鏡射：short_signal / short_rationale / short_entry_low / short_entry_high /
-- short_stop_loss / short_take_profit_1 / short_take_profit_2
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run（在原本 migration_trading_signals.sql 之後執行）
-- ══════════════════════════════════════════
alter table trading_signals add column if not exists short_signal text;          -- 放空區間 / 觀望 / 避免追空 / 軋空止損 / 盤整
alter table trading_signals add column if not exists short_rationale text;       -- AI 判讀說明（繁中）
alter table trading_signals add column if not exists short_entry_low numeric;
alter table trading_signals add column if not exists short_entry_high numeric;
alter table trading_signals add column if not exists short_stop_loss numeric;
alter table trading_signals add column if not exists short_take_profit_1 numeric;
alter table trading_signals add column if not exists short_take_profit_2 numeric;
