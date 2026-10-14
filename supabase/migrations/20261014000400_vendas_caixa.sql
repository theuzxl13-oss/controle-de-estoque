-- =============================================================================
-- 0400 — Caixa (abertura/fechamento, sangria, suprimento) e vendas (PDV),
-- itens, pagamentos e devoluções.
--
-- Vendas, itens e pagamentos são gravados exclusivamente pela função
-- public.finalize_sale (transação única). Não há políticas de escrita via API.
-- =============================================================================

create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_movement_type as enum (
  'opening',     -- fundo de troco
  'sale',        -- recebimento em dinheiro
  'supply',      -- suprimento (+)
  'withdrawal',  -- sangria (−)
  'refund'       -- estorno em dinheiro por cancelamento/devolução (−)
);
create type public.sale_status as enum ('completed', 'cancelled', 'partially_returned', 'returned');
create type public.payment_method as enum (
  'cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'store_credit'
);

-- -----------------------------------------------------------------------------
-- Sessões de caixa
-- -----------------------------------------------------------------------------
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  operator_id uuid not null references public.profiles (id) on delete restrict,
  status public.cash_session_status not null default 'open',
  opening_amount numeric(14,2) not null default 0 check (opening_amount >= 0),
  opened_at timestamptz not null default now(),
  expected_cash_amount numeric(14,2),        -- calculado no fechamento
  declared_cash_amount numeric(14,2) check (declared_cash_amount >= 0),
  difference numeric(14,2) generated always as (declared_cash_amount - expected_cash_amount) stored,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  notes text,
  unique (company_id, number)
);

-- Um operador só pode ter um caixa aberto por empresa.
create unique index cash_sessions_one_open_uq on public.cash_sessions (company_id, operator_id)
  where status = 'open';

create trigger cash_sessions_assign_number before insert or update of number on public.cash_sessions
  for each row execute function app.tg_assign_number('number', 'cash_session');

-- Movimentos do dinheiro físico da gaveta (valores com sinal).
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,
  type public.cash_movement_type not null,
  amount numeric(14,2) not null check (amount <> 0 or type = 'opening'),
  description text,
  reference_type text,
  reference_id uuid,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cash_movements_sign check (
    (type in ('opening', 'sale', 'supply') and amount >= 0) or
    (type in ('withdrawal', 'refund') and amount < 0)
  )
);

create index cash_movements_session_idx on public.cash_movements (cash_session_id, created_at);

-- -----------------------------------------------------------------------------
-- Vendas
-- -----------------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  customer_id uuid references public.customers (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,
  status public.sale_status not null default 'completed',
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  total numeric(14,2) not null check (total >= 0),
  change_amount numeric(14,2) not null default 0 check (change_amount >= 0),
  notes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,
  unique (company_id, number),
  unique (company_id, idempotency_key),
  constraint sales_total check (total = subtotal - discount_total)
);

create index sales_company_created_idx on public.sales (company_id, created_at desc);
create index sales_customer_idx on public.sales (customer_id, created_at desc);
create index sales_seller_idx on public.sales (company_id, seller_id, created_at desc);
create index sales_cash_session_idx on public.sales (cash_session_id);

create trigger sales_assign_number before insert or update of number on public.sales
  for each row execute function app.tg_assign_number('number', 'sale');

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  line_number smallint not null,
  product_id uuid not null references public.products (id) on delete restrict,
  description text not null,                 -- snapshot do nome do produto
  unit text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),  -- inclui rateio do desconto geral
  total numeric(14,2) not null check (total >= 0),
  unit_cost numeric(14,4) not null default 0,  -- custo no momento da venda (lucro bruto)
  returned_quantity numeric(14,3) not null default 0,
  unique (sale_id, line_number),
  constraint sale_items_total check (total = round(quantity * unit_price, 2) - discount),
  constraint sale_items_returned check (returned_quantity between 0 and quantity)
);

create index sale_items_product_idx on public.sale_items (product_id);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14,2) not null check (amount > 0),        -- valor abatido da venda
  tendered_amount numeric(14,2),                            -- valor entregue (dinheiro)
  installments smallint not null default 1 check (installments between 1 and 48),
  first_due_date date,                                      -- crediário
  created_at timestamptz not null default now(),
  constraint sale_payments_tendered check (
    tendered_amount is null or (method = 'cash' and tendered_amount >= amount)
  )
);

create index sale_payments_sale_idx on public.sale_payments (sale_id);

-- -----------------------------------------------------------------------------
-- Devoluções (fluxo implementado na Etapa 5)
-- -----------------------------------------------------------------------------
create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  sale_id uuid not null references public.sales (id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) >= 3),
  refund_method public.payment_method,
  total numeric(14,2) not null check (total >= 0),
  idempotency_key text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, number),
  unique (company_id, idempotency_key)
);

create trigger sale_returns_assign_number before insert or update of number on public.sale_returns
  for each row execute function app.tg_assign_number('number', 'sale_return');

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_return_id uuid not null references public.sale_returns (id) on delete cascade,
  sale_item_id uuid not null references public.sale_items (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount >= 0),
  unique (sale_return_id, sale_item_id)
);
