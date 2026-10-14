-- =============================================================================
-- 0900 — Operações transacionais (RPC)
--
-- Cada função roda em uma única transação: ou tudo é gravado, ou nada é.
-- Todas validam autenticação e permissão antes de qualquer escrita.
-- Para evitar deadlocks, produtos são sempre travados em ordem de id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Núcleo de estoque (uso interno)
-- -----------------------------------------------------------------------------
create function app.apply_stock_movement(
  p_company uuid,
  p_product uuid,
  p_type public.stock_movement_type,
  p_quantity numeric,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid,
  p_unit_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before numeric;
  v_after numeric;
  v_name text;
  v_allow boolean;
  v_id uuid;
  v_qty numeric := round(p_quantity, 3);
begin
  if v_qty = 0 then
    raise exception 'A quantidade da movimentação deve ser diferente de zero.' using errcode = '22023';
  end if;

  select stock_quantity, name into v_before, v_name
  from public.products
  where id = p_product and company_id = p_company
  for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;

  v_after := v_before + v_qty;

  if v_qty < 0 and v_after < 0 then
    select allow_negative_stock into v_allow from public.companies where id = p_company;
    if not coalesce(v_allow, false) then
      raise exception 'Estoque insuficiente para "%": disponível %, solicitado %.',
        v_name, v_before, abs(v_qty)
        using errcode = 'P0001', hint = 'insufficient_stock';
    end if;
  end if;

  update public.products set stock_quantity = v_after where id = p_product;

  insert into public.stock_movements (
    company_id, product_id, type, quantity, balance_before, balance_after,
    unit_cost, reason, reference_type, reference_id, user_id
  ) values (
    p_company, p_product, p_type, v_qty, v_before, v_after,
    p_unit_cost, p_reason, p_reference_type, p_reference_id, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Movimentação manual: entrada, saída e ajuste de saldo
--   manual_entry / manual_exit: p_quantity = quantidade (> 0)
--   adjustment:                 p_quantity = novo saldo desejado (>= 0)
-- -----------------------------------------------------------------------------
create function public.register_stock_movement(
  p_company uuid,
  p_product uuid,
  p_type public.stock_movement_type,
  p_quantity numeric,
  p_reason text,
  p_unit_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current numeric;
  v_delta numeric;
  v_id uuid;
begin
  if p_type in ('manual_entry', 'manual_exit') then
    perform app.require_permission(p_company, 'stock.move');
  elsif p_type = 'adjustment' then
    perform app.require_permission(p_company, 'stock.adjust');
  else
    raise exception 'Tipo de movimentação não permitido manualmente.' using errcode = '22023';
  end if;

  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'Informe o motivo da movimentação.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or (p_type <> 'adjustment' and round(p_quantity, 3) = 0) then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Custo unitário inválido.' using errcode = '22023';
  end if;

  if p_type = 'adjustment' then
    select stock_quantity into v_current
    from public.products where id = p_product and company_id = p_company
    for update;
    if not found then
      raise exception 'Produto não encontrado.' using errcode = 'P0002';
    end if;
    v_delta := round(p_quantity, 3) - v_current;
    if v_delta = 0 then
      raise exception 'O saldo informado é igual ao saldo atual.' using errcode = '22023';
    end if;
  elsif p_type = 'manual_entry' then
    v_delta := p_quantity;
  else
    v_delta := -p_quantity;
  end if;

  v_id := app.apply_stock_movement(
    p_company, p_product, p_type, v_delta, btrim(p_reason), 'manual', null, p_unit_cost
  );

  perform app.log_event(p_company, 'stock.' || p_type::text, 'stock_movements', v_id::text,
    jsonb_build_object('product_id', p_product, 'quantity', v_delta, 'reason', p_reason));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fechamento de inventário físico: ajusta o saldo dos itens contados.
-- -----------------------------------------------------------------------------
create function public.close_inventory_count(p_inventory uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.inventory_counts;
  v_item record;
  v_current numeric;
  v_adjusted integer := 0;
begin
  select * into v_inv from public.inventory_counts where id = p_inventory for update;
  if not found then
    raise exception 'Inventário não encontrado.' using errcode = 'P0002';
  end if;
  perform app.require_permission(v_inv.company_id, 'stock.inventory');
  if v_inv.status <> 'open' then
    raise exception 'Inventário já encerrado.' using errcode = 'P0001';
  end if;

  for v_item in
    select i.id, i.product_id, i.counted_quantity
    from public.inventory_count_items i
    where i.inventory_id = p_inventory and i.counted_quantity is not null
    order by i.product_id
  loop
    select stock_quantity into v_current from public.products
    where id = v_item.product_id for update;

    update public.inventory_count_items set expected_quantity = v_current where id = v_item.id;

    if v_item.counted_quantity <> v_current then
      perform app.apply_stock_movement(
        v_inv.company_id, v_item.product_id, 'inventory',
        v_item.counted_quantity - v_current,
        'Inventário nº ' || v_inv.number, 'inventory', p_inventory
      );
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;

  update public.inventory_counts
     set status = 'closed', closed_by = auth.uid(), closed_at = now()
   where id = p_inventory;

  perform app.log_event(v_inv.company_id, 'inventory.closed', 'inventory_counts', p_inventory::text,
    jsonb_build_object('adjusted_items', v_adjusted));
  return v_adjusted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recebimento de pedido de compra (parcial ou total)
--   p_items: [{ "order_item_id": uuid, "quantity": number }]
-- Atualiza estoque (entrada), custo médio, status do pedido e gera a conta a
-- pagar proporcional ao que foi efetivamente recebido.
-- -----------------------------------------------------------------------------
create function public.receive_purchase(
  p_order uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_supplier_invoice text default null,
  p_notes text default null,
  p_generate_payable boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.purchase_orders;
  v_receipt uuid;
  v_receipt_number bigint;
  v_line record;
  v_count integer;
  v_goods numeric := 0;
  v_goods_before numeric;
  v_goods_after numeric;
  v_extra numeric;
  v_alloc numeric;
  v_amount numeric;
  v_all_received boolean;
begin
  select * into v_order from public.purchase_orders where id = p_order for update;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;
  perform app.require_permission(v_order.company_id, 'purchases.receive');

  if coalesce(char_length(p_idempotency_key), 0) < 8 then
    raise exception 'Chave de idempotência obrigatória.' using errcode = '22023';
  end if;
  select id into v_receipt from public.purchase_receipts
  where company_id = v_order.company_id and idempotency_key = p_idempotency_key;
  if found then
    return v_receipt;   -- requisição repetida: não lança novamente
  end if;

  if v_order.status not in ('sent', 'confirmed', 'partially_received') then
    raise exception 'Pedido com status "%" não pode receber mercadorias.', v_order.status
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um item recebido.' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count <> (
    select count(distinct poi.id)
    from jsonb_to_recordset(p_items) as x(order_item_id uuid, quantity numeric)
    join public.purchase_order_items poi
      on poi.id = x.order_item_id and poi.purchase_order_id = p_order
  ) then
    raise exception 'Itens inválidos ou repetidos para este pedido.' using errcode = '22023';
  end if;

  select coalesce(sum(round(received_quantity * unit_price, 2)), 0) into v_goods_before
  from public.purchase_order_items where purchase_order_id = p_order;

  insert into public.purchase_receipts (
    company_id, purchase_order_id, supplier_invoice_number, notes, idempotency_key, received_by
  ) values (
    v_order.company_id, p_order, nullif(btrim(p_supplier_invoice), ''), p_notes,
    p_idempotency_key, auth.uid()
  )
  returning id, number into v_receipt, v_receipt_number;

  for v_line in
    select poi.id, poi.product_id, poi.quantity, poi.received_quantity, poi.unit_price,
           round(x.quantity, 3) as qty
    from jsonb_to_recordset(p_items) as x(order_item_id uuid, quantity numeric)
    join public.purchase_order_items poi on poi.id = x.order_item_id
    order by poi.product_id
    for update of poi
  loop
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Quantidade recebida deve ser maior que zero.' using errcode = '22023';
    end if;
    if v_line.qty > v_line.quantity - v_line.received_quantity then
      raise exception 'Quantidade recebida (%) excede o saldo pendente (%) do item.',
        v_line.qty, v_line.quantity - v_line.received_quantity
        using errcode = 'P0001';
    end if;

    update public.purchase_order_items
       set received_quantity = received_quantity + v_line.qty
     where id = v_line.id;

    insert into public.purchase_receipt_items (
      company_id, receipt_id, purchase_order_item_id, product_id, quantity, unit_cost
    ) values (
      v_order.company_id, v_receipt, v_line.id, v_line.product_id, v_line.qty, v_line.unit_price
    );

    -- Custo médio ponderado (saldo negativo é tratado como zero).
    update public.products
       set cost_price = case
         when greatest(stock_quantity, 0) + v_line.qty > 0 then round(
           (greatest(stock_quantity, 0) * cost_price + v_line.qty * v_line.unit_price)
           / (greatest(stock_quantity, 0) + v_line.qty), 4)
         else v_line.unit_price
       end
     where id = v_line.product_id;

    perform app.apply_stock_movement(
      v_order.company_id, v_line.product_id, 'purchase_receipt', v_line.qty,
      'Recebimento nº ' || v_receipt_number || ' do pedido nº ' || v_order.number,
      'purchase_receipt', v_receipt, v_line.unit_price
    );

    insert into public.supplier_products (company_id, supplier_id, product_id, last_cost)
    values (v_order.company_id, v_order.supplier_id, v_line.product_id, v_line.unit_price)
    on conflict (supplier_id, product_id) do update set last_cost = excluded.last_cost;
  end loop;

  select coalesce(sum(round(received_quantity * unit_price, 2)), 0),
         bool_and(received_quantity = quantity)
    into v_goods_after, v_all_received
  from public.purchase_order_items where purchase_order_id = p_order;

  update public.purchase_orders
     set status = case when v_all_received then 'received' else 'partially_received' end::public.purchase_status
   where id = p_order;

  -- Valor a pagar: mercadorias recebidas + rateio proporcional de frete e
  -- desconto. O cálculo cumulativo garante que a soma dos títulos de todos os
  -- recebimentos feche exatamente no total do pedido.
  if p_generate_payable then
    v_goods := v_goods_after - v_goods_before;
    v_extra := v_order.freight - v_order.discount;
    if v_order.subtotal > 0 then
      v_alloc := round(v_goods_after / v_order.subtotal * v_extra, 2)
               - round(v_goods_before / v_order.subtotal * v_extra, 2);
    else
      v_alloc := case when v_all_received then v_extra else 0 end;
    end if;
    v_amount := v_goods + v_alloc;

    if v_amount > 0 then
      insert into public.financial_titles (
        company_id, kind, description, category_id, supplier_id, amount,
        due_date, source_type, source_id, created_by
      ) values (
        v_order.company_id, 'payable',
        'Pedido de compra nº ' || v_order.number || ' — recebimento nº ' || v_receipt_number,
        app.category_id(v_order.company_id, 'purchases'), v_order.supplier_id, v_amount,
        current_date + v_order.payment_due_days, 'purchase_receipt', v_receipt, auth.uid()
      );
    end if;
  end if;

  perform app.log_event(v_order.company_id, 'purchase.received', 'purchase_receipts', v_receipt::text,
    jsonb_build_object('purchase_order_id', p_order, 'complete', v_all_received));
  return v_receipt;
end;
$$;

-- -----------------------------------------------------------------------------
-- Caixa
-- -----------------------------------------------------------------------------
create function public.open_cash_session(
  p_company uuid,
  p_opening_amount numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_permission(p_company, 'cash.operate');
  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'Valor de abertura inválido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.cash_sessions
    where company_id = p_company and operator_id = auth.uid() and status = 'open'
  ) then
    raise exception 'Você já possui um caixa aberto.' using errcode = 'P0001';
  end if;

  insert into public.cash_sessions (company_id, operator_id, opening_amount, notes)
  values (p_company, auth.uid(), round(p_opening_amount, 2), p_notes)
  returning id into v_id;

  insert into public.cash_movements (company_id, cash_session_id, type, amount, description, user_id)
  values (p_company, v_id, 'opening', round(p_opening_amount, 2), 'Abertura de caixa', auth.uid());

  perform app.log_event(p_company, 'cash.opened', 'cash_sessions', v_id::text,
    jsonb_build_object('opening_amount', p_opening_amount));
  return v_id;
end;
$$;

-- Sangria (withdrawal) ou suprimento (supply). p_amount sempre positivo.
create function public.register_cash_movement(
  p_session uuid,
  p_type public.cash_movement_type,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_balance numeric;
  v_amount numeric := round(p_amount, 2);
  v_id uuid;
begin
  select * into v_session from public.cash_sessions where id = p_session for update;
  if not found then
    raise exception 'Caixa não encontrado.' using errcode = 'P0002';
  end if;
  perform app.require_permission(v_session.company_id, 'cash.operate');
  if v_session.operator_id <> auth.uid()
     and not app.has_permission(v_session.company_id, 'cash.manage_all') then
    raise exception 'Permissão negada (cash.manage_all).' using errcode = '42501';
  end if;
  if v_session.status <> 'open' then
    raise exception 'O caixa está fechado.' using errcode = 'P0001';
  end if;
  if p_type not in ('withdrawal', 'supply') then
    raise exception 'Use sangria ou suprimento.' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_description)), 0) < 3 then
    raise exception 'Informe a descrição da movimentação.' using errcode = '22023';
  end if;

  if p_type = 'withdrawal' then
    select coalesce(sum(amount), 0) into v_balance
    from public.cash_movements where cash_session_id = p_session;
    if v_amount > v_balance then
      raise exception 'Saldo em dinheiro insuficiente no caixa (disponível: %).', v_balance
        using errcode = 'P0001';
    end if;
    v_amount := -v_amount;
  end if;

  insert into public.cash_movements (company_id, cash_session_id, type, amount, description, user_id)
  values (v_session.company_id, p_session, p_type, v_amount, btrim(p_description), auth.uid())
  returning id into v_id;

  perform app.log_event(v_session.company_id, 'cash.' || p_type::text, 'cash_movements', v_id::text,
    jsonb_build_object('amount', v_amount));
  return v_id;
end;
$$;

-- Fecha o caixa e devolve o resumo (esperado × declarado e totais por forma
-- de pagamento das vendas concluídas na sessão).
create function public.close_cash_session(
  p_session uuid,
  p_declared_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_expected numeric;
  v_by_method jsonb;
begin
  select * into v_session from public.cash_sessions where id = p_session for update;
  if not found then
    raise exception 'Caixa não encontrado.' using errcode = 'P0002';
  end if;
  perform app.require_permission(v_session.company_id, 'cash.operate');
  if v_session.operator_id <> auth.uid()
     and not app.has_permission(v_session.company_id, 'cash.manage_all') then
    raise exception 'Permissão negada (cash.manage_all).' using errcode = '42501';
  end if;
  if v_session.status <> 'open' then
    raise exception 'O caixa já está fechado.' using errcode = 'P0001';
  end if;
  if p_declared_amount is null or p_declared_amount < 0 then
    raise exception 'Valor declarado inválido.' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_expected
  from public.cash_movements where cash_session_id = p_session;

  select coalesce(jsonb_object_agg(method, total), '{}'::jsonb) into v_by_method
  from (
    select sp.method, sum(sp.amount) as total
    from public.sale_payments sp
    join public.sales s on s.id = sp.sale_id
    where s.cash_session_id = p_session and s.status <> 'cancelled'
    group by sp.method
  ) t;

  update public.cash_sessions
     set status = 'closed',
         expected_cash_amount = v_expected,
         declared_cash_amount = round(p_declared_amount, 2),
         closed_by = auth.uid(),
         closed_at = now(),
         notes = coalesce(p_notes, notes)
   where id = p_session;

  perform app.log_event(v_session.company_id, 'cash.closed', 'cash_sessions', p_session::text,
    jsonb_build_object('expected', v_expected, 'declared', p_declared_amount));

  return jsonb_build_object(
    'expected_cash_amount', v_expected,
    'declared_cash_amount', round(p_declared_amount, 2),
    'difference', round(p_declared_amount, 2) - v_expected,
    'sales_by_method', v_by_method
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Finalização de venda (PDV)
--   p_items:    [{ "product_id": uuid, "quantity": number, "discount": number? }]
--   p_payments: [{ "method": payment_method, "amount": number,
--                  "tendered_amount": number?, "installments": int?,
--                  "first_due_date": date? }]
--   p_discount: desconto geral (rateado proporcionalmente entre os itens)
-- Preços vêm do cadastro (nunca do cliente). A soma de "amount" deve ser igual
-- ao total; em dinheiro, "tendered_amount" − "amount" é o troco.
-- -----------------------------------------------------------------------------
create function public.finalize_sale(
  p_company uuid,
  p_cash_session uuid,
  p_items jsonb,
  p_payments jsonb,
  p_idempotency_key text,
  p_customer uuid default null,
  p_discount numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_company public.companies;
  v_sale uuid;
  v_sale_number bigint;
  v_item jsonb;
  v_pay jsonb;
  v_product public.products;
  v_qty numeric;
  v_disc numeric;
  v_gross numeric;
  v_subtotal numeric := 0;
  v_line_discounts numeric := 0;
  v_general numeric := round(coalesce(p_discount, 0), 2);
  v_net_before numeric;
  v_discount_total numeric;
  v_total numeric;
  v_max_idx integer := 0;
  v_max_net numeric := -1;
  v_idx integer := 0;
  v_alloc numeric;
  v_alloc_sum numeric := 0;
  v_method public.payment_method;
  v_amount numeric;
  v_tendered numeric;
  v_installments integer;
  v_first_due date;
  v_paid numeric := 0;
  v_change numeric := 0;
  v_seq integer := 0;
  v_part numeric;
  v_line record;
  v_desc text;
begin
  perform app.require_permission(p_company, 'sales.create');

  if coalesce(char_length(p_idempotency_key), 0) < 8 then
    raise exception 'Chave de idempotência obrigatória.' using errcode = '22023';
  end if;
  select id into v_sale from public.sales
  where company_id = p_company and idempotency_key = p_idempotency_key;
  if found then
    return v_sale;   -- requisição repetida (duplo clique, reenvio): mesma venda
  end if;

  select * into v_company from public.companies where id = p_company;

  if not exists (
    select 1 from public.cash_sessions
    where id = p_cash_session and company_id = p_company
      and operator_id = v_user and status = 'open'
  ) then
    raise exception 'Abra o seu caixa antes de vender.' using errcode = 'P0001';
  end if;

  if p_customer is not null and not exists (
    select 1 from public.customers where id = p_customer and company_id = p_company and active
  ) then
    raise exception 'Cliente inválido.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa de ao menos um item.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Quantidade de itens acima do limite (500).' using errcode = '22023';
  end if;

  -- 1ª passagem: validação e totais
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and company_id = p_company and active;
    if not found then
      raise exception 'Produto inválido ou inativo no item %.', v_idx using errcode = '22023';
    end if;
    v_qty := round((v_item ->> 'quantity')::numeric, 3);
    v_disc := round(coalesce((v_item ->> 'discount')::numeric, 0), 2);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida no item %.', v_idx using errcode = '22023';
    end if;
    v_gross := round(v_qty * v_product.sale_price, 2);
    if v_disc < 0 or v_disc > v_gross then
      raise exception 'Desconto inválido no item %.', v_idx using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_gross;
    v_line_discounts := v_line_discounts + v_disc;
    if v_gross - v_disc > v_max_net then
      v_max_net := v_gross - v_disc;
      v_max_idx := v_idx;
    end if;
  end loop;

  v_net_before := v_subtotal - v_line_discounts;
  if v_general < 0 or v_general > v_net_before then
    raise exception 'Desconto geral inválido.' using errcode = '22023';
  end if;
  v_discount_total := v_line_discounts + v_general;
  v_total := v_subtotal - v_discount_total;

  -- Desconto autorizado
  if v_discount_total > 0 then
    perform app.require_permission(p_company, 'sales.discount');
    if v_subtotal > 0
       and v_discount_total / v_subtotal * 100 > v_company.max_seller_discount_percent
       and not app.has_permission(p_company, 'sales.discount_unlimited') then
      raise exception 'Desconto acima do limite permitido (% %%). Solicite autorização de um gerente.',
        v_company.max_seller_discount_percent
        using errcode = '42501', hint = 'discount_limit';
    end if;
  end if;

  -- Validação dos pagamentos
  if jsonb_typeof(p_payments) <> 'array' or (jsonb_array_length(p_payments) = 0 and v_total > 0) then
    raise exception 'Informe a forma de pagamento.' using errcode = '22023';
  end if;
  for v_pay in select value from jsonb_array_elements(p_payments) loop
    v_method := (v_pay ->> 'method')::public.payment_method;
    v_amount := round((v_pay ->> 'amount')::numeric, 2);
    v_tendered := round((v_pay ->> 'tendered_amount')::numeric, 2);
    v_installments := coalesce((v_pay ->> 'installments')::integer, 1);
    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor de pagamento inválido.' using errcode = '22023';
    end if;
    if v_tendered is not null and (v_method <> 'cash' or v_tendered < v_amount) then
      raise exception 'Valor recebido inválido.' using errcode = '22023';
    end if;
    if v_installments < 1 or v_installments > 48
       or (v_installments > 1 and v_method not in ('credit_card', 'store_credit')) then
      raise exception 'Número de parcelas inválido.' using errcode = '22023';
    end if;
    if v_method = 'store_credit' and p_customer is null then
      raise exception 'Venda a prazo exige cliente identificado.' using errcode = '22023';
    end if;
    v_paid := v_paid + v_amount;
    v_change := v_change + coalesce(v_tendered - v_amount, 0);
  end loop;
  if v_paid <> v_total then
    raise exception 'A soma dos pagamentos (%) difere do total da venda (%).', v_paid, v_total
      using errcode = '22023';
  end if;

  -- Gravação da venda
  insert into public.sales (
    company_id, customer_id, seller_id, cash_session_id, subtotal, discount_total,
    total, change_amount, notes, idempotency_key
  ) values (
    p_company, p_customer, v_user, p_cash_session, v_subtotal, v_discount_total,
    v_total, v_change, p_notes, p_idempotency_key
  )
  returning id, number into v_sale, v_sale_number;

  -- 2ª passagem: itens com rateio do desconto geral (resíduo no maior item)
  v_idx := 0;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    v_qty := round((v_item ->> 'quantity')::numeric, 3);
    v_disc := round(coalesce((v_item ->> 'discount')::numeric, 0), 2);
    v_gross := round(v_qty * v_product.sale_price, 2);
    if v_general > 0 and v_net_before > 0 and v_idx <> v_max_idx then
      v_alloc := round(v_general * (v_gross - v_disc) / v_net_before, 2);
    else
      v_alloc := 0;
    end if;
    v_alloc_sum := v_alloc_sum + v_alloc;

    insert into public.sale_items (
      company_id, sale_id, line_number, product_id, description, unit, quantity,
      unit_price, discount, total, unit_cost
    ) values (
      p_company, v_sale, v_idx, v_product.id, v_product.name, v_product.unit, v_qty,
      v_product.sale_price, v_disc + v_alloc, v_gross - v_disc - v_alloc, v_product.cost_price
    );
  end loop;

  update public.sale_items
     set discount = discount + (v_general - v_alloc_sum),
         total = total - (v_general - v_alloc_sum)
   where sale_id = v_sale and line_number = v_max_idx;

  -- Baixa de estoque (produtos agregados e em ordem de id)
  for v_line in
    select product_id, sum(quantity) as qty
    from public.sale_items where sale_id = v_sale
    group by product_id order by product_id
  loop
    perform app.apply_stock_movement(
      p_company, v_line.product_id, 'sale', -v_line.qty,
      'Venda nº ' || v_sale_number, 'sale', v_sale
    );
  end loop;

  -- Pagamentos e reflexos financeiros
  for v_pay in select value from jsonb_array_elements(p_payments) loop
    v_method := (v_pay ->> 'method')::public.payment_method;
    v_amount := round((v_pay ->> 'amount')::numeric, 2);
    v_tendered := round((v_pay ->> 'tendered_amount')::numeric, 2);
    v_installments := coalesce((v_pay ->> 'installments')::integer, 1);
    v_first_due := coalesce((v_pay ->> 'first_due_date')::date, current_date + 30);
    v_desc := 'Venda nº ' || v_sale_number;

    insert into public.sale_payments (
      company_id, sale_id, method, amount, tendered_amount, installments, first_due_date
    ) values (
      p_company, v_sale, v_method, v_amount, v_tendered, v_installments,
      case when v_method = 'store_credit' then v_first_due end
    );

    if v_method in ('cash', 'pix', 'debit_card', 'bank_transfer') then
      insert into public.financial_transactions (
        company_id, direction, amount, method, description, category_id, sale_id,
        cash_session_id, created_by
      ) values (
        p_company, 'in', v_amount, v_method, v_desc, app.category_id(p_company, 'sales'), v_sale,
        case when v_method = 'cash' then p_cash_session end, v_user
      );
      if v_method = 'cash' then
        insert into public.cash_movements (
          company_id, cash_session_id, type, amount, description, reference_type, reference_id, user_id
        ) values (
          p_company, p_cash_session, 'sale', v_amount, v_desc, 'sale', v_sale, v_user
        );
      end if;
    elsif v_method = 'credit_card' then
      v_seq := v_seq + 1;
      insert into public.financial_titles (
        company_id, kind, description, category_id, customer_id, amount, due_date,
        installment, installments_total, source_type, source_id, created_by
      ) values (
        p_company, 'receivable', v_desc || ' — cartão de crédito', app.category_id(p_company, 'sales'),
        p_customer, v_amount, current_date + v_company.credit_card_settlement_days,
        v_seq, 1, 'sale', v_sale, v_user
      );
    else -- store_credit (crediário): uma conta a receber por parcela
      for i in 1..v_installments loop
        v_seq := v_seq + 1;
        v_part := case
          when i < v_installments then trunc(v_amount / v_installments, 2)
          else v_amount - trunc(v_amount / v_installments, 2) * (v_installments - 1)
        end;
        insert into public.financial_titles (
          company_id, kind, description, category_id, customer_id, amount, due_date,
          installment, installments_total, source_type, source_id, created_by
        ) values (
          p_company, 'receivable', v_desc || ' — parcela ' || i || '/' || v_installments,
          app.category_id(p_company, 'sales'), p_customer, v_part,
          (v_first_due + make_interval(months => i - 1))::date,
          v_seq, v_installments, 'sale', v_sale, v_user
        );
      end loop;
    end if;
  end loop;

  perform app.log_event(p_company, 'sale.finalized', 'sales', v_sale::text,
    jsonb_build_object('number', v_sale_number, 'total', v_total));
  return v_sale;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelamento de venda
-- Devolve o estoque, estorna recebimentos, cancela contas a receber e registra
-- a saída do dinheiro no caixa aberto do usuário (ou no caixa original).
-- Exige que o documento fiscal, se houver, tenha sido cancelado antes.
-- -----------------------------------------------------------------------------
create function public.cancel_sale(p_sale uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_cash numeric;
  v_refund_session uuid;
  v_line record;
  v_desc text;
begin
  select * into v_sale from public.sales where id = p_sale for update;
  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0002';
  end if;
  perform app.require_permission(v_sale.company_id, 'sales.cancel');

  if v_sale.status <> 'completed' then
    raise exception 'Somente vendas concluídas e sem devoluções podem ser canceladas.'
      using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'Informe o motivo do cancelamento (mínimo 5 caracteres).' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.fiscal_documents
    where sale_id = p_sale and status in ('pending', 'processing', 'authorized', 'contingency')
  ) then
    raise exception 'Cancele o documento fiscal da venda antes de cancelá-la.'
      using errcode = 'P0001', hint = 'fiscal_document_active';
  end if;
  if exists (
    select 1 from public.financial_titles
    where source_type = 'sale' and source_id = p_sale and paid_amount > 0
  ) then
    raise exception 'A venda possui parcelas já recebidas; estorne-as no financeiro antes.'
      using errcode = 'P0001';
  end if;

  v_desc := 'Estorno — cancelamento da venda nº ' || v_sale.number;

  select coalesce(sum(amount), 0) into v_cash
  from public.sale_payments where sale_id = p_sale and method = 'cash';

  if v_cash > 0 then
    select id into v_refund_session from public.cash_sessions
    where company_id = v_sale.company_id and operator_id = auth.uid() and status = 'open';
    if v_refund_session is null then
      select id into v_refund_session from public.cash_sessions
      where id = v_sale.cash_session_id and status = 'open';
    end if;
    if v_refund_session is null then
      raise exception 'Abra um caixa para devolver o valor em dinheiro.' using errcode = 'P0001';
    end if;
  end if;

  -- Estoque de volta
  for v_line in
    select product_id, sum(quantity) as qty
    from public.sale_items where sale_id = p_sale
    group by product_id order by product_id
  loop
    perform app.apply_stock_movement(
      v_sale.company_id, v_line.product_id, 'sale_cancellation', v_line.qty,
      'Cancelamento da venda nº ' || v_sale.number, 'sale', p_sale
    );
  end loop;

  -- Contas a receber da venda
  update public.financial_titles
     set status = 'cancelled', cancelled_at = now()
   where source_type = 'sale' and source_id = p_sale and status <> 'cancelled';

  -- Estorno dos recebimentos
  insert into public.financial_transactions (
    company_id, direction, amount, method, description, category_id, sale_id,
    cash_session_id, reversal_of, created_by
  )
  select t.company_id, 'out', t.amount, t.method, v_desc,
         app.category_id(t.company_id, 'refunds'), t.sale_id,
         case when t.method = 'cash' then v_refund_session end, t.id, auth.uid()
  from public.financial_transactions t
  where t.sale_id = p_sale and t.direction = 'in' and t.reversal_of is null
    and not exists (select 1 from public.financial_transactions r where r.reversal_of = t.id);

  if v_cash > 0 then
    insert into public.cash_movements (
      company_id, cash_session_id, type, amount, description, reference_type, reference_id, user_id
    ) values (
      v_sale.company_id, v_refund_session, 'refund', -v_cash, v_desc, 'sale', p_sale, auth.uid()
    );
  end if;

  update public.sales
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = btrim(p_reason)
   where id = p_sale;

  perform app.log_event(v_sale.company_id, 'sale.cancelled', 'sales', p_sale::text,
    jsonb_build_object('number', v_sale.number, 'reason', p_reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- Baixa (total ou parcial) de conta a pagar/receber
-- -----------------------------------------------------------------------------
create function public.settle_title(
  p_title uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title public.financial_titles;
  v_amount numeric := round(p_amount, 2);
  v_id uuid;
begin
  select * into v_title from public.financial_titles where id = p_title for update;
  if not found then
    raise exception 'Título não encontrado.' using errcode = 'P0002';
  end if;
  perform app.require_permission(v_title.company_id, 'finance.manage');
  if v_title.status not in ('open', 'partially_paid') then
    raise exception 'Título % não pode receber baixa.', v_title.status using errcode = 'P0001';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > v_title.amount - v_title.paid_amount then
    raise exception 'Valor da baixa inválido (em aberto: %).', v_title.amount - v_title.paid_amount
      using errcode = '22023';
  end if;
  if p_method = 'store_credit' then
    raise exception 'Forma de pagamento inválida para baixa.' using errcode = '22023';
  end if;

  insert into public.financial_transactions (
    company_id, direction, amount, method, occurred_at, description, category_id,
    title_id, sale_id, created_by
  ) values (
    v_title.company_id,
    case when v_title.kind = 'receivable' then 'in' else 'out' end::public.transaction_direction,
    v_amount, p_method, coalesce(p_paid_at, now()),
    coalesce(nullif(btrim(p_notes), ''), 'Baixa: ' || v_title.description),
    v_title.category_id, p_title,
    case when v_title.source_type = 'sale' then v_title.source_id end,
    auth.uid()
  )
  returning id into v_id;

  update public.financial_titles
     set paid_amount = paid_amount + v_amount,
         status = case when paid_amount + v_amount = amount then 'paid' else 'partially_paid' end::public.financial_title_status
   where id = p_title;

  perform app.log_event(v_title.company_id, 'finance.settled', 'financial_titles', p_title::text,
    jsonb_build_object('amount', v_amount, 'transaction_id', v_id));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios das funções criadas nesta migration
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
-- Funções internas de escrita: somente chamadas por outras funções do sistema.
revoke execute on function app.apply_stock_movement(uuid, uuid, public.stock_movement_type, numeric, text, text, uuid, numeric) from authenticated;
revoke execute on function app.next_number(uuid, text) from authenticated;
revoke execute on function app.log_event(uuid, text, text, text, jsonb) from authenticated;
