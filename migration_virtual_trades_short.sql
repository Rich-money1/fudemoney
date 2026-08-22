-- ══════════════════════════════════════════
-- 虛擬倉：新增方向欄位，支援做空虛擬倉
-- 既有資料全部視為多單(long)；同一標的現在可以同時有一筆多單+一筆空單未平倉
-- （唯一索引改成「同標的+同方向」只能有一筆open，取代原本「同標的」只能有一筆open）。
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run（在原本 migration_virtual_trades.sql 之後執行）
-- ══════════════════════════════════════════
alter table virtual_trades add column if not exists direction text not null default 'long' check (direction in ('long','short'));

drop index if exists idx_virtual_trades_open_symbol;
create unique index if not exists idx_virtual_trades_open_symbol_direction on virtual_trades(symbol, direction) where status = 'open';
