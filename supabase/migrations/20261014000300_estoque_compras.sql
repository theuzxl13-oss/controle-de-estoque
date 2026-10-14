-- =============================================================================
-- 0300 — Estoque (movimentações e inventário) e compras (pedidos a
-- fornecedores e recebimentos).
-- =============================================================================

create type public.stock_movement_type as enum (
  'purchase_receipt',   -- recebimento de pedido de compra (+)
  'sale',               -- venda finalizada (−)
  'sale_cancellation',  -- cancelamento de venda (+)
  'sale_return',        -- devolução de cliente (+)
  'manual_entry',       -- entrada avulsa (+)
  'manual_exit',        -- saída avulsa: perda, consumo, avaria (−)
  'adjustment',         -- ajuste de saldo (±)
  'inventory'           -- fechamento de inventário físico (±)
);

create type public.inventory_status as enum ('open', 'closed', 'cancelled');

create type public.purchase_status as enum (
  'draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'
);

-- -----------------------------------------------------------------------------
-- Movimentações de estoque (imutáveis)
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  type public.stock_movement_type not null,
  quantity numeric(14,3) not null check (quantity <> 0),   -- com sinal
  balance_before numeric(14,3) not null,
  balance_after numeric(14,3) not null,
  unit_cost numeric(14,4) check (unit_cost >= 0),
  reason text,
  reference_type text,
  reference_id uuid,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_balance check (balance_after = balance_before + quantity)
);

create index stock_movements_product_idx on public.stock_movements (company_id, product_id, created_at desc);
create index stock_movements_company_created_idx on public.stock_movements (company_id, created_at desc);
create index stock_movements_reference_idx on public.stock_movements (reference_type, reference_id);

-- -----------------------------------------------------------------------------
-- Inventário físico
-- -----------------------------------------------------------------------------
create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  status public.inventory_status not null default 'open',
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  unique (company_id, number)
);

create trigger inventory_counts_assign_number before insert or update of number on public.inventory_counts
  for each row execute function app.tg_assign_number('number', 'inventory');

create table public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  inventory_id uuid not null references public.inventory_counts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  expected_quantity numeric(14,3),            -- saldo registrado no fechamento
  counted_quantity numeric(14,3) check (counted_quantity >= 0),
  counted_by uuid references public.profiles (id) on delete set null,
  counted_at timestamptz,
  unique (inventory_id, product_id)
);

create trigger inventory_count_items_same_company before insert or update on public.inventory_count_items
  for each row execute function app.tg_check_company_refs('inventory_id:inventory_counts', 'product_id:products');

-- Inventário fechado/cancelado não pode mais ser alterado pela API.
create function app.tg_inventory_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.inventory_status;
begin
  if not app.is_api_client() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'inventory_counts' then
    if tg_op = 'INSERT' then
      if new.status <> 'open' then
        raise exception 'Inventários devem ser criados abertos.' using errcode = 'P0001';
      end if;
      new.created_by := coalesce(new.created_by, auth.uid());
      return new;
    end if;
    if old.status <> 'open' then
      raise exception 'Inventário encerrado não pode ser alterado.' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and new.status = 'closed' then
      raise exception 'Use a função de fechamento para encerrar o inventário.' using errcode = 'P0001';
    end if;
  else
    select status into v_status from public.inventory_counts
    where id = coalesce(new.inventory_id, old.inventory_id);
    if v_status <> 'open' then
      raise exception 'Inventário encerrado não pode ser alterado.' using errcode = 'P0001';
    end if;
    if tg_op <> 'DELETE' then
      new.expected_quantity := null;   -- definido apenas no fechamento
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger inventory_counts_guard before insert or update or delete on public.inventory_counts
  for each row execute function app.tg_inventory_guard();
create trigger inventory_count_items_guard before insert or update or delete on public.inventory_count_items
  for each row execute function app.tg_inventory_guard();

-- -----------------------------------------------------------------------------
-- Pedidos de compra
-- -----------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  status public.purchase_status not null default 'draft',
  issue_date date not null default current_date,
  expected_delivery_date date,
  payment_method text,
  payment_terms text,
  payment_due_days integer not null default 30 check (payment_due_days between 0 and 365),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),   -- mantido por trigger
  discount numeric(14,2) not null default 0 check (discount >= 0),
  freight numeric(14,2) not null default 0 check (freight >= 0),
  total numeric(14,2) generated always as (subtotal - discount + freight) stored,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  unique (company_id, number),
  constraint purchase_orders_total_non_negative check (discount <= subtotal + freight)
);

create index purchase_orders_company_status_idx on public.purchase_orders (company_id, status);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, issue_date desc);

create trigger purchase_orders_assign_number before insert or update of number on public.purchase_orders
  for each row execute function app.tg_assign_number('number', 'purchase_order');
create trigger purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function app.tg_set_updated_at();
create trigger purchase_orders_same_company before insert or update on public.purchase_orders
  for each row execute function app.tg_check_company_refs('supplier_id:suppliers');
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders
  for each row execute function app.tg_audit();

-- Fluxo de status permitido pela API:
--   draft → sent | confirmed | cancelled
--   sent → draft | confirmed | cancelled
--   confirmed → cancelled
--   partially_received → cancelled  (encerra o saldo não entregue)
-- partially_received/received são definidos apenas pela função de recebimento.
create function app.tg_purchase_orders_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if app.is_api_client() and new.status <> 'draft' then
      raise exception 'Pedidos devem ser criados como rascunho.' using errcode = 'P0001';
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    if app.is_api_client() and not (
      (old.status = 'draft' and new.status in ('sent', 'confirmed', 'cancelled')) or
      (old.status = 'sent' and new.status in ('draft', 'confirmed', 'cancelled')) or
      (old.status = 'confirmed' and new.status = 'cancelled') or
      (old.status = 'partially_received' and new.status = 'cancelled')
    ) then
      raise exception 'Transição de status inválida: % → %.', old.status, new.status
        using errcode = 'P0001';
    end if;

    if new.status = 'sent' then new.sent_at := now(); end if;
    if new.status = 'confirmed' then new.confirmed_at := now(); end if;
    if new.status = 'cancelled' then
      if coalesce(char_length(btrim(new.cancel_reason)), 0) < 3 then
        raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
      end if;
      new.cancelled_at := now();
    end if;
  elsif app.is_api_client() and old.status in ('received', 'cancelled') then
    raise exception 'Pedido % não pode mais ser alterado.', old.status using errcode = 'P0001';
  end if;

  -- Valores e fornecedor só podem mudar enquanto o pedido é editável.
  if app.is_api_client()
     and old.status not in ('draft', 'sent')
     and (new.supplier_id, new.discount, new.freight)
         is distinct from (old.supplier_id, old.discount, old.freight) then
    raise exception 'Valores do pedido só podem ser alterados em rascunho.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger purchase_orders_status before insert or update on public.purchase_orders
  for each row execute function app.tg_purchase_orders_status();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  received_quantity numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  unique (purchase_order_id, product_id),
  constraint purchase_order_items_received check (received_quantity between 0 and quantity)
);

create index purchase_order_items_product_idx on public.purchase_order_items (product_id);

create trigger purchase_order_items_same_company before insert or update on public.purchase_order_items
  for each row execute function app.tg_check_company_refs('purchase_order_id:purchase_orders', 'product_id:products');

-- Itens só podem ser alterados pela API enquanto o pedido estiver em
-- rascunho ou enviado (antes da confirmação do fornecedor).
create function app.tg_purchase_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.purchase_status;
begin
  if app.is_api_client() then
    select status into v_status from public.purchase_orders
    where id = coalesce(new.purchase_order_id, old.purchase_order_id);
    if v_status not in ('draft', 'sent') then
      raise exception 'Itens só podem ser alterados com o pedido em rascunho ou enviado.'
        using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' and new.received_quantity <> 0
       or tg_op = 'UPDATE' and new.received_quantity <> old.received_quantity then
      raise exception 'A quantidade recebida é registrada pelo recebimento.' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger purchase_order_items_guard before insert or update or delete on public.purchase_order_items
  for each row execute function app.tg_purchase_items_guard();

-- Recalcula o subtotal do pedido após alterações nos itens.
create function app.tg_purchase_items_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.purchase_orders po
     set subtotal = coalesce((
       select sum(total) from public.purchase_order_items where purchase_order_id = po.id
     ), 0)
   where po.id = coalesce(new.purchase_order_id, old.purchase_order_id);
  return null;
end;
$$;

create trigger purchase_order_items_subtotal after insert or update or delete on public.purchase_order_items
  for each row execute function app.tg_purchase_items_subtotal();

-- -----------------------------------------------------------------------------
-- Recebimentos de mercadorias (parciais ou totais)
-- -----------------------------------------------------------------------------
create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  supplier_invoice_number text,           -- nº da NF do fornecedor
  notes text,
  idempotency_key text not null,
  received_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz not null default now(),
  unique (company_id, number),
  unique (company_id, idempotency_key)
);

create index purchase_receipts_order_idx on public.purchase_receipts (purchase_order_id);

create trigger purchase_receipts_assign_number before insert or update of number on public.purchase_receipts
  for each row execute function app.tg_assign_number('number', 'purchase_receipt');

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  receipt_id uuid not null references public.purchase_receipts (id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  unique (receipt_id, purchase_order_item_id)
);
