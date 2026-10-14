-- =============================================================================
-- 0700 — Row Level Security
--
-- Regras gerais:
--   * `anon` não acessa nenhuma tabela.
--   * Toda leitura exige vínculo ativo com a empresa da linha e, quando
--     aplicável, a permissão do módulo.
--   * Tabelas operacionais (movimentações, vendas, recebimentos, caixa,
--     lançamentos, documentos fiscais) não têm políticas de escrita: só podem
--     ser alteradas pelas funções SECURITY DEFINER (0900) ou pelo servidor com
--     service_role (integração fiscal).
-- =============================================================================

-- Visibilidade de vendas: todas (gerente/admin) ou apenas as próprias.
create function app.can_view_sale(p_company uuid, p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission(p_company, 'sales.view_all')
      or (p_seller = auth.uid() and app.has_permission(p_company, 'sales.view_own'));
$$;

create function app.can_view_cash_session(p_company uuid, p_operator uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission(p_company, 'cash.manage_all')
      or (p_operator = auth.uid() and app.has_permission(p_company, 'cash.operate'));
$$;

-- Habilita RLS em todas as tabelas do schema public.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
-- As tabelas operacionais só são escritas via funções; não há por que a API
-- ter privilégios de escrita nelas.
revoke insert, update, delete on
  public.company_counters, public.audit_logs, public.stock_movements,
  public.purchase_receipts, public.purchase_receipt_items,
  public.cash_sessions, public.cash_movements,
  public.sales, public.sale_items, public.sale_payments,
  public.sale_returns, public.sale_return_items,
  public.financial_transactions,
  public.fiscal_documents, public.fiscal_document_events,
  public.role_permissions
from authenticated;

-- -----------------------------------------------------------------------------
-- Núcleo
-- -----------------------------------------------------------------------------
create policy companies_select on public.companies for select to authenticated
  using (app.is_member(id));
create policy companies_update on public.companies for update to authenticated
  using (app.has_permission(id, 'company.configure'))
  with check (app.has_permission(id, 'company.configure'));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.company_members m
      where m.user_id = profiles.id and app.is_member(m.company_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy company_members_select on public.company_members for select to authenticated
  using (app.is_member(company_id));
create policy company_members_insert on public.company_members for insert to authenticated
  with check (app.has_permission(company_id, 'users.manage'));
create policy company_members_update on public.company_members for update to authenticated
  using (app.has_permission(company_id, 'users.manage'))
  with check (app.has_permission(company_id, 'users.manage'));
create policy company_members_delete on public.company_members for delete to authenticated
  using (app.has_permission(company_id, 'users.manage'));

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (true);

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.has_permission(company_id, 'audit.view'));

-- -----------------------------------------------------------------------------
-- Cadastros
-- -----------------------------------------------------------------------------
create policy categories_select on public.categories for select to authenticated
  using (app.is_member(company_id));
create policy categories_write on public.categories for all to authenticated
  using (app.has_permission(company_id, 'products.manage'))
  with check (app.has_permission(company_id, 'products.manage'));

create policy tax_rules_select on public.tax_rules for select to authenticated
  using (app.is_member(company_id));
create policy tax_rules_write on public.tax_rules for all to authenticated
  using (app.has_permission(company_id, 'fiscal.configure'))
  with check (app.has_permission(company_id, 'fiscal.configure'));

create policy suppliers_select on public.suppliers for select to authenticated
  using (app.has_permission(company_id, 'suppliers.view'));
create policy suppliers_write on public.suppliers for all to authenticated
  using (app.has_permission(company_id, 'suppliers.manage'))
  with check (app.has_permission(company_id, 'suppliers.manage'));

create policy supplier_products_select on public.supplier_products for select to authenticated
  using (app.has_permission(company_id, 'suppliers.view') or app.has_permission(company_id, 'products.view'));
create policy supplier_products_write on public.supplier_products for all to authenticated
  using (app.has_permission(company_id, 'products.manage') or app.has_permission(company_id, 'suppliers.manage'))
  with check (app.has_permission(company_id, 'products.manage') or app.has_permission(company_id, 'suppliers.manage'));

create policy customers_select on public.customers for select to authenticated
  using (app.has_permission(company_id, 'customers.view'));
create policy customers_insert on public.customers for insert to authenticated
  with check (app.has_permission(company_id, 'customers.manage'));
create policy customers_update on public.customers for update to authenticated
  using (app.has_permission(company_id, 'customers.manage'))
  with check (app.has_permission(company_id, 'customers.manage'));
create policy customers_delete on public.customers for delete to authenticated
  using (app.has_permission(company_id, 'customers.delete'));

create policy products_select on public.products for select to authenticated
  using (app.has_permission(company_id, 'products.view'));
create policy products_write on public.products for all to authenticated
  using (app.has_permission(company_id, 'products.manage'))
  with check (app.has_permission(company_id, 'products.manage'));

-- -----------------------------------------------------------------------------
-- Estoque e compras
-- -----------------------------------------------------------------------------
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (app.has_permission(company_id, 'stock.view'));

create policy inventory_counts_select on public.inventory_counts for select to authenticated
  using (app.has_permission(company_id, 'stock.view'));
create policy inventory_counts_write on public.inventory_counts for all to authenticated
  using (app.has_permission(company_id, 'stock.inventory'))
  with check (app.has_permission(company_id, 'stock.inventory'));

create policy inventory_count_items_select on public.inventory_count_items for select to authenticated
  using (app.has_permission(company_id, 'stock.view'));
create policy inventory_count_items_write on public.inventory_count_items for all to authenticated
  using (app.has_permission(company_id, 'stock.inventory'))
  with check (app.has_permission(company_id, 'stock.inventory'));

create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (app.has_permission(company_id, 'purchases.view'));
create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
  with check (app.has_permission(company_id, 'purchases.manage'));
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using (app.has_permission(company_id, 'purchases.manage'))
  with check (app.has_permission(company_id, 'purchases.manage'));
create policy purchase_orders_delete on public.purchase_orders for delete to authenticated
  using (status = 'draft' and app.has_permission(company_id, 'purchases.manage'));

create policy purchase_order_items_select on public.purchase_order_items for select to authenticated
  using (app.has_permission(company_id, 'purchases.view'));
create policy purchase_order_items_write on public.purchase_order_items for all to authenticated
  using (app.has_permission(company_id, 'purchases.manage'))
  with check (app.has_permission(company_id, 'purchases.manage'));

create policy purchase_receipts_select on public.purchase_receipts for select to authenticated
  using (app.has_permission(company_id, 'purchases.view'));
create policy purchase_receipt_items_select on public.purchase_receipt_items for select to authenticated
  using (app.has_permission(company_id, 'purchases.view'));

-- -----------------------------------------------------------------------------
-- Caixa e vendas
-- -----------------------------------------------------------------------------
create policy cash_sessions_select on public.cash_sessions for select to authenticated
  using (app.can_view_cash_session(company_id, operator_id));
create policy cash_movements_select on public.cash_movements for select to authenticated
  using (exists (select 1 from public.cash_sessions s where s.id = cash_session_id));

create policy sales_select on public.sales for select to authenticated
  using (app.can_view_sale(company_id, seller_id));
create policy sale_items_select on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy sale_payments_select on public.sale_payments for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy sale_returns_select on public.sale_returns for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy sale_return_items_select on public.sale_return_items for select to authenticated
  using (exists (select 1 from public.sale_returns r where r.id = sale_return_id));

-- -----------------------------------------------------------------------------
-- Financeiro
-- -----------------------------------------------------------------------------
create policy financial_categories_select on public.financial_categories for select to authenticated
  using (app.is_member(company_id));
create policy financial_categories_write on public.financial_categories for all to authenticated
  using (system_key is null and app.has_permission(company_id, 'finance.manage'))
  with check (system_key is null and app.has_permission(company_id, 'finance.manage'));

create policy financial_titles_select on public.financial_titles for select to authenticated
  using (app.has_permission(company_id, 'finance.view'));
create policy financial_titles_write on public.financial_titles for all to authenticated
  using (app.has_permission(company_id, 'finance.manage'))
  with check (app.has_permission(company_id, 'finance.manage'));

create policy financial_transactions_select on public.financial_transactions for select to authenticated
  using (app.has_permission(company_id, 'finance.view'));

-- -----------------------------------------------------------------------------
-- Fiscal e documentos
-- -----------------------------------------------------------------------------
create policy fiscal_settings_select on public.fiscal_settings for select to authenticated
  using (app.has_permission(company_id, 'fiscal.view'));
create policy fiscal_settings_write on public.fiscal_settings for all to authenticated
  using (app.has_permission(company_id, 'fiscal.configure'))
  with check (app.has_permission(company_id, 'fiscal.configure'));

create policy fiscal_documents_select on public.fiscal_documents for select to authenticated
  using (
    app.has_permission(company_id, 'fiscal.view')
    and (sale_id is null or exists (select 1 from public.sales s where s.id = sale_id))
  );
create policy fiscal_document_events_select on public.fiscal_document_events for select to authenticated
  using (exists (select 1 from public.fiscal_documents d where d.id = fiscal_document_id));

create policy generated_documents_select on public.generated_documents for select to authenticated
  using (app.is_member(company_id));
create policy generated_documents_insert on public.generated_documents for insert to authenticated
  with check (app.is_member(company_id) and created_by = auth.uid());
