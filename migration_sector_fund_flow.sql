-- ══════════════════════════════════════════
-- 類股資金流向：每日抓取富邦e點通「資金流向表」，記錄各類股當日資金流向率(%)
-- 每天一筆快照，同一天同一類股會覆蓋，不同天則累積成歷史，供之後追蹤「資金連續流入」趨勢
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists sector_fund_flow (
  id uuid primary key default gen_random_uuid(),
  market text not null,          -- TSE(上市) / OTC(上櫃)
  sector text not null,          -- 類股名稱，例如「半導體」「電子零組件」
  flow_rate numeric not null,    -- 資金流向率(%)：該類股成交金額佔當日大盤總成交金額比重
  recorded_date date not null default current_date,
  created_at timestamptz default now(),
  unique (market, sector, recorded_date)
);
create index if not exists idx_sector_fund_flow_date on sector_fund_flow(recorded_date);

alter table sector_fund_flow enable row level security;
-- 比照盯盤訊號：只有已登入且繳費開通(status=active)的顧問能讀取，只有後端service_role能寫入
create policy "sff_select_active" on sector_fund_flow for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
  );
