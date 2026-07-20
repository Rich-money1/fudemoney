-- ══════════════════════════════════════════
-- 每日市場報告 PDF 儲存空間（公開可讀，供 LINE 推播連結下載）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('market-reports', 'market-reports', true)
on conflict (id) do nothing;

drop policy if exists "market_reports_public_read" on storage.objects;
create policy "market_reports_public_read" on storage.objects
  for select using (bucket_id = 'market-reports');
