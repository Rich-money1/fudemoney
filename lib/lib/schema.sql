-- ══════════════════════════════════════════
-- 個人投資分析網站 · Supabase 資料庫結構
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- 個人工具，無登入機制：所有寫入一律經由後端 API（service_role key，繞過RLS），
-- 讀取端點對外開放（RLS select policy 開放給任何人，因為前端沒有登入態）。
-- ══════════════════════════════════════════

-- ── 1. 持倉（我自己的部位）──
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,            -- Yahoo Finance代碼，例如 2330.TW / NVDA / 0050.TW
  name text not null,
  market text not null default 'OTHER',  -- TW / US / OTHER
  quantity numeric not null,
  cost_basis numeric not null,     -- 每股/每單位平均成本
  currency text not null default 'TWD',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table holdings enable row level security;
create policy "holdings_select_public" on holdings for select using (true);

-- ── 2. 自選股清單（不限於固定精選股，自己想追蹤什麼都能加）──
create table if not exists watchlist (
  symbol text primary key,
  name text not null,
  market text not null default 'OTHER',
  created_at timestamptz default now()
);
alter table watchlist enable row level security;
create policy "watchlist_select_public" on watchlist for select using (true);

-- ── 3. 技術面訊號（盯盤智能助理完整版：RSI/均線/布林通道/ATR/MACD/KD + AI判讀出的進場/止損/止盈）──
create table if not exists signals (
  symbol text primary key,
  name text,
  market text,
  price numeric,
  change_percent numeric,
  trend text,                      -- 多頭 / 空頭 / 盤整
  rsi14 numeric,
  sma20 numeric,
  sma50 numeric,
  atr14 numeric,
  macd numeric,
  macd_signal numeric,
  macd_histogram numeric,
  kd_k numeric,
  kd_d numeric,
  support numeric,                 -- 近60日支撐
  resistance numeric,              -- 近60日壓力
  tv_rating text,                  -- TradingView技術評級（非官方資料來源，僅供參考，可能為null）
  tv_score numeric,                -- TradingView技術評級原始分數（-1~1）
  signal text,                     -- 買進區間 / 觀望 / 避免追高 / 跌破止損 / 盤整
  rationale text,                  -- AI 判讀說明（繁中，若有持倉會提及未實現損益）
  entry_low numeric,
  entry_high numeric,
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  updated_at timestamptz default now()
);
alter table signals enable row level security;
create policy "signals_select_public" on signals for select using (true);

-- ── 4. 持倉每日快照（供風險指標/資產曲線用，從第一次執行排程開始累積，無法回溯過去）──
create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total_value numeric,
  total_cost numeric,
  total_pnl numeric,
  created_at timestamptz default now()
);
alter table portfolio_snapshots enable row level security;
create policy "portfolio_snapshots_select_public" on portfolio_snapshots for select using (true);
