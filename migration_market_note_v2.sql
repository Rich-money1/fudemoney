-- ══════════════════════════════════════════
-- 每日投資觀點：開放管理者從網站後台手動更新（免AI/免API金鑰的方案）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
drop policy if exists "dmn_insert_admin" on daily_market_note;
drop policy if exists "dmn_update_admin" on daily_market_note;

create policy "dmn_insert_admin" on daily_market_note for insert with check (is_admin());
create policy "dmn_update_admin" on daily_market_note for update using (is_admin()) with check (is_admin());
