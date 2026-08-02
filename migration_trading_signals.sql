-- ══════════════════════════════════════════
-- 盯盤智能助理：技術面訊號表
-- 技術指標（RSI/均線/布林通道/ATR/支撐壓力）由規則計算出客觀錨點，
-- AI 只在錨點基礎上做文字判讀與微調，避免止盈止損價位是模型幻覺。
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists trading_signals (
  symbol text primary key,          -- Yahoo Finance 代碼，例如 2330.TW / NVDA / ^TWII
  name text not null,
  market text not null,             -- TW / US / INDEX / FX / METAL
  price numeric,
  change_percent numeric,
  trend text,                       -- 多頭 / 空頭 / 盤整
  rsi14 numeric,
  sma20 numeric,
  sma50 numeric,
  atr14 numeric,
  support numeric,                  -- 近60日支撐
  resistance numeric,               -- 近60日壓力
  signal text,                      -- 買進區間 / 觀望 / 避免追高 / 跌破止損 / 盤整
  rationale text,                   -- AI 判讀說明（繁中）
  entry_low numeric,
  entry_high numeric,
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  updated_at timestamptz default now()
);
alter table trading_signals enable row level security;
-- 公開只讀（儀表板頁面直接讀取），只有後端 service_role 能寫入
create policy "ts_select_public" on trading_signals for select using (true);
