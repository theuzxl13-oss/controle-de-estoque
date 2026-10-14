-- =============================================================================
-- 0500 — Financeiro: categorias, títulos (contas a pagar/receber) e
-- lançamentos (fluxo de caixa realizado).
--
-- Conceitos:
--   * Faturamento  = soma das vendas concluídas (tabela sales).
--   * Recebimentos = lançamentos de entrada (financial_transactions 'in').
--   * Lucro bruto  = Σ (total do item − custo × quantidade) das vendas.
--   * Saldo de caixa = soma dos cash_movements da sessão (dinheiro físico).
-- =============================================================================

create type public.financial_category_kind as enum ('income', 'expense');
create type public.financial_title_kind as enum ('payable', 'receivable');
create type public.financial_title_status as enum ('open', 'partially_paid', 'paid', 'cancelled');
create type public.transaction_direction as enum ('in', 'out');

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind public.financial_category_kind not null,
  system_key text,             -- categorias usadas automaticamente pelo sistema
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, system_key)
);

create unique index financial_categories_name_uq on public.financial_categories (company_id, kind, lower(name));

-- Categorias padrão para toda nova empresa.
create function app.tg_seed_company_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financial_categories (company_id, name, kind, system_key) values
    (new.id, 'Vendas', 'income', 'sales'),
    (new.id, 'Outras receitas', 'income', null),
    (new.id, 'Compras de mercadorias', 'expense', 'purchases'),
    (new.id, 'Devoluções e estornos', 'expense', 'refunds'),
    (new.id, 'Despesas operacionais', 'expense', null),
    (new.id, 'Impostos e taxas', 'expense', null);
  return null;
end;
$$;

create trigger companies_seed_defaults after insert on public.companies
  for each row execute function app.tg_seed_company_defaults();

create function app.category_id(p_company uuid, p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.financial_categories where company_id = p_company and system_key = p_key;
$$;

-- -----------------------------------------------------------------------------
-- Títulos: contas a pagar e a receber
-- -----------------------------------------------------------------------------
create table public.financial_titles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.financial_title_kind not null,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  category_id uuid references public.financial_categories (id) on delete set null,
  customer_id uuid references public.customers (id) on delete restrict,
  supplier_id uuid references public.suppliers (id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  paid_amount numeric(14,2) not null default 0,
  issue_date date not null default current_date,
  due_date date not null,
  status public.financial_title_status not null default 'open',
  installment smallint not null default 1 check (installment >= 1),
  installments_total smallint not null default 1 check (installments_total >= 1),
  -- Origem automática (venda, recebimento de compra…). A unicidade impede
  -- lançamentos duplicados para a mesma origem.
  source_type text,
  source_id uuid,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint financial_titles_paid check (paid_amount between 0 and amount),
  constraint financial_titles_source check ((source_type is null) = (source_id is null))
);

create unique index financial_titles_source_uq on public.financial_titles
  (company_id, source_type, source_id, installment) where source_type is not null;
create index financial_titles_due_idx on public.financial_titles (company_id, kind, status, due_date);

create trigger financial_titles_updated_at before update on public.financial_titles
  for each row execute function app.tg_set_updated_at();
create trigger financial_titles_same_company before insert or update on public.financial_titles
  for each row execute function app.tg_check_company_refs(
    'category_id:financial_categories', 'customer_id:customers', 'supplier_id:suppliers');
create trigger financial_titles_audit after insert or update or delete on public.financial_titles
  for each row execute function app.tg_audit();

-- Pela API: títulos automáticos não podem ter valor/origem alterados e a baixa
-- (paid_amount/status) é feita somente pela função de liquidação.
create function app.tg_financial_titles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.is_api_client() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.source_type is not null or new.paid_amount <> 0 or new.status <> 'open' then
      raise exception 'Títulos manuais devem ser criados em aberto e sem origem.' using errcode = 'P0001';
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.source_type is not null or old.paid_amount > 0 then
      raise exception 'Este título não pode ser excluído; cancele-o.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if new.paid_amount <> old.paid_amount
     or (new.status <> old.status and new.status <> 'cancelled')
     or old.status in ('paid', 'cancelled')
     or (old.source_type is not null and (new.amount, new.kind, new.source_type, new.source_id)
         is distinct from (old.amount, old.kind, old.source_type, old.source_id)) then
    raise exception 'Alteração não permitida neste título.' using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' then
    if old.paid_amount > 0 then
      raise exception 'Título com pagamentos não pode ser cancelado.' using errcode = 'P0001';
    end if;
    new.cancelled_at := now();
  end if;
  return new;
end;
$$;

create trigger financial_titles_guard before insert or update or delete on public.financial_titles
  for each row execute function app.tg_financial_titles_guard();

-- -----------------------------------------------------------------------------
-- Lançamentos financeiros realizados (imutáveis; correções por estorno)
-- -----------------------------------------------------------------------------
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  direction public.transaction_direction not null,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method,
  occurred_at timestamptz not null default now(),
  description text not null,
  category_id uuid references public.financial_categories (id) on delete set null,
  title_id uuid references public.financial_titles (id) on delete restrict,
  sale_id uuid references public.sales (id) on delete restrict,
  cash_session_id uuid references public.cash_sessions (id) on delete restrict,
  reversal_of uuid unique references public.financial_transactions (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index financial_transactions_company_date_idx on public.financial_transactions (company_id, occurred_at desc);
create index financial_transactions_sale_idx on public.financial_transactions (sale_id);
create index financial_transactions_title_idx on public.financial_transactions (title_id);
