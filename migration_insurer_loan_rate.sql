-- ══════════════════════════════════════════
-- 保單借款利率資料庫（原本寫死在網站首頁 JS 的 INSURERS 陣列，改存資料庫，
-- 之後利率調整直接改這張表即可，不必改程式碼重新部署）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
create table if not exists insurer_loan_rate (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric not null,       -- 借款利率（%）
  max_pct numeric not null,    -- 最高借款比例（%）
  rating text not null,        -- 內部評級標示，例如 'AAA' / 'AA+'
  sort_order int not null default 0,
  updated_at timestamptz default now()
);
alter table insurer_loan_rate enable row level security;
-- 任何人（含未登入）都能讀取，只是公開參考資訊；寫入交給後台 service_role
create policy "ilr_select_public" on insurer_loan_rate for select using (true);

insert into insurer_loan_rate (name, rate, max_pct, rating, sort_order) values
  ('富邦人壽', 3.25, 90, 'AAA', 1),
  ('國泰人壽', 3.50, 90, 'AAA', 2),
  ('南山人壽', 3.75, 85, 'AA+', 3),
  ('中國人壽', 3.00, 90, 'AA',  4),
  ('台灣人壽', 3.25, 80, 'AA',  5),
  ('新光人壽', 3.50, 85, 'AA-', 6),
  ('遠雄人壽', 3.25, 80, 'A+',  7),
  ('三商美邦', 3.75, 80, 'A',   8)
on conflict do nothing;
