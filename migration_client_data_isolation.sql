-- ══════════════════════════════════════════
-- 客戶管理資料互不關聯：管理者跟一般顧問一樣，只能看到自己名下的客戶
-- （員工帳號管理 profiles 表不受影響，管理者仍可確認繳費/開通/停權員工帳號）
-- 使用方式：Supabase 專案 → SQL Editor → 貼上全部內容 → Run
-- ══════════════════════════════════════════

-- clients：移除 is_admin() 例外，只留 owner_id = auth.uid()
drop policy if exists "clients_select" on clients;
drop policy if exists "clients_insert" on clients;
drop policy if exists "clients_update" on clients;
drop policy if exists "clients_delete" on clients;
create policy "clients_select" on clients for select
  using (owner_id = auth.uid());
create policy "clients_insert" on clients for insert
  with check (owner_id = auth.uid());
create policy "clients_update" on clients for update
  using (owner_id = auth.uid());
create policy "clients_delete" on clients for delete
  using (owner_id = auth.uid());

-- dividend_groups：跟著對應客戶的擁有者走，同樣移除 is_admin() 例外
drop policy if exists "dg_select" on dividend_groups;
drop policy if exists "dg_insert" on dividend_groups;
drop policy if exists "dg_update" on dividend_groups;
drop policy if exists "dg_delete" on dividend_groups;
create policy "dg_select" on dividend_groups for select
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
create policy "dg_insert" on dividend_groups for insert
  with check (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
create policy "dg_update" on dividend_groups for update
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
create policy "dg_delete" on dividend_groups for delete
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));

-- growth_holdings：同樣邏輯
drop policy if exists "gh_select" on growth_holdings;
drop policy if exists "gh_insert" on growth_holdings;
drop policy if exists "gh_update" on growth_holdings;
drop policy if exists "gh_delete" on growth_holdings;
create policy "gh_select" on growth_holdings for select
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
create policy "gh_insert" on growth_holdings for insert
  with check (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
create policy "gh_update" on growth_holdings for update
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
create policy "gh_delete" on growth_holdings for delete
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));

-- notification_log：同樣邏輯（只能看，寫入仍由後端 service_role 處理）
drop policy if exists "nl_select" on notification_log;
create policy "nl_select" on notification_log for select
  using (exists(select 1 from clients c where c.id = client_id and c.owner_id = auth.uid()));
