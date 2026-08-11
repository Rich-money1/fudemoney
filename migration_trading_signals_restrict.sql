-- ══════════════════════════════════════════
-- 盯盤智能助理改為帳號限定：只有已登入且繳費開通(status=active)的顧問能讀取
-- 原本trading_signals是公開只讀，現在收回，比照系統其他資料的RLS權限模式
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
drop policy if exists "ts_select_public" on trading_signals;
create policy "ts_select_active" on trading_signals for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
  );
