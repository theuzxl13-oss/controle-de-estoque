-- Movimentações de estoque, pedidos de compra e recebimentos parciais.
begin;

select tests.create_user('c0000000-0000-0000-0000-00000000000a', 'admin.c@teste.com');
select tests.create_user('c0000000-0000-0000-0000-0000000000e0', 'estoque.c@teste.com');

set role authenticated;
select tests.login('c0000000-0000-0000-0000-00000000000a');
select public.create_company('Comercial C Ltda', '11222333000181') as company \gset
insert into public.company_members (company_id, user_id, role)
values (:'company', 'c0000000-0000-0000-0000-0000000000e0', 'stockist');

insert into public.products (company_id, name, sale_price) values (:'company', 'Parafuso', 1) returning id as p1 \gset
insert into public.products (company_id, name, sale_price) values (:'company', 'Porca', 1) returning id as p2 \gset
insert into public.suppliers (company_id, document, legal_name)
values (:'company', '11444777000161', 'Distribuidora Fornecedora') returning id as supplier \gset

-- -------------------------------------------------------------- Movimentações
select tests.login('c0000000-0000-0000-0000-0000000000e0');
select public.register_stock_movement(:'company', :'p1', 'manual_entry', 10, 'Saldo inicial');
select public.register_stock_movement(:'company', :'p1', 'manual_exit', 3, 'Avaria');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 7.000, 'entrada 10 e saída 3 → saldo 7');
select tests.throws(format($$select public.register_stock_movement(%L, %L, 'manual_exit', 20, 'Perda')$$, :'company', :'p1'),
  'Estoque insuficiente', 'saída maior que o saldo é bloqueada');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 7.000, 'saldo intacto após bloqueio');
select tests.throws(format($$select public.register_stock_movement(%L, %L, 'adjustment', 5, 'Contagem')$$, :'company', :'p1'),
  'Permissão negada', 'estoquista não faz ajuste direto de saldo');
select tests.throws(format($$select public.register_stock_movement(%L, %L, 'manual_entry', 1, '')$$, :'company', :'p1'),
  'motivo', 'motivo é obrigatório');
select tests.throws(format($$select public.register_stock_movement(%L, %L, 'sale', 1, 'Venda manual')$$, :'company', :'p1'),
  'não permitido manualmente', 'tipos de sistema não podem ser lançados manualmente');

select tests.login('c0000000-0000-0000-0000-00000000000a');
select public.register_stock_movement(:'company', :'p1', 'adjustment', 5, 'Ajuste após conferência');
select tests.eq((select quantity from public.stock_movements where product_id = :'p1' and type = 'adjustment'), -2.000,
  'ajuste para 5 registra movimentação de −2');
select tests.eq((select count(*) from public.stock_movements where product_id = :'p1' and user_id is not null)::int, 3,
  'toda movimentação registra o usuário');
select tests.eq((select count(*) from public.audit_logs where action like 'stock.%')::int, 3, 'movimentações auditadas');

update public.companies set allow_negative_stock = true where id = :'company';
select public.register_stock_movement(:'company', :'p2', 'manual_exit', 2, 'Saída com estoque negativo autorizado');
select tests.eq((select stock_quantity from public.products where id = :'p2'), -2.000, 'estoque negativo quando configurado');
update public.companies set allow_negative_stock = false where id = :'company';
select public.register_stock_movement(:'company', :'p2', 'adjustment', 0, 'Zerar');

-- ---------------------------------------------------------------- Inventário
select tests.login('c0000000-0000-0000-0000-0000000000e0');
insert into public.inventory_counts (company_id, description) values (:'company', 'Inventário mensal') returning id as inv \gset
insert into public.inventory_count_items (company_id, inventory_id, product_id, counted_quantity)
values (:'company', :'inv', :'p1', 6), (:'company', :'inv', :'p2', 0);
select tests.eq(public.close_inventory_count(:'inv'), 1, 'inventário ajusta apenas itens divergentes');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 6.000, 'saldo igual à contagem');
select tests.throws(format($$update public.inventory_count_items set counted_quantity = 1 where inventory_id = %L$$, :'inv'),
  'encerrado', 'inventário fechado é imutável');

-- ---------------------------------------------------------- Pedido de compra
select tests.login('c0000000-0000-0000-0000-00000000000a');
insert into public.purchase_orders (company_id, supplier_id, discount, freight, payment_due_days, payment_terms)
values (:'company', :'supplier', 1.00, 5.00, 28, '28 dias') returning id as po, number as po_number \gset
insert into public.purchase_order_items (company_id, purchase_order_id, product_id, quantity, unit_price)
values (:'company', :'po', :'p1', 10, 2.50) returning id as poi1 \gset
insert into public.purchase_order_items (company_id, purchase_order_id, product_id, quantity, unit_price)
values (:'company', :'po', :'p2', 5, 3.333) returning id as poi2 \gset
select tests.eq((select array[subtotal, total] from public.purchase_orders where id = :'po'),
  array[41.67, 45.67]::numeric[], 'subtotal (25 + 16,67) e total (− 1 + 5) calculados');
select tests.throws(format($$update public.purchase_orders set status = 'received' where id = %L$$, :'po'),
  'Transição de status inválida', 'status de recebimento não pode ser forçado');
select tests.throws(format($$select public.receive_purchase(%L, '[]'::jsonb, 'chave-rascunho-1')$$, :'po'),
  'não pode receber', 'rascunho não pode ser recebido');

update public.purchase_orders set status = 'sent' where id = :'po';
update public.purchase_orders set status = 'confirmed' where id = :'po';
select tests.eq((select sent_at is not null and confirmed_at is not null from public.purchase_orders where id = :'po'),
  true, 'datas de envio e confirmação registradas');
select tests.throws(format($$update public.purchase_order_items set quantity = 20 where id = %L$$, :'poi1'),
  'rascunho ou enviado', 'itens não mudam após confirmação');
select tests.throws(format($$update public.purchase_orders set discount = 0 where id = %L$$, :'po'),
  'só podem ser alterados em rascunho', 'valores não mudam após confirmação');

-- Recebimento parcial (feito pelo estoquista)
select tests.login('c0000000-0000-0000-0000-0000000000e0');
select public.receive_purchase(:'po', jsonb_build_array(jsonb_build_object('order_item_id', :'poi1', 'quantity', 4)),
  'receb-000000001', 'NF 1234') as r1 \gset
select tests.eq((select status::text from public.purchase_orders where id = :'po'), 'partially_received', 'status parcialmente recebido');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 10.000, 'estoque +4 após recebimento parcial');
select tests.eq((select cost_price from public.products where id = :'p1'), 1.0000, 'custo médio ponderado (6 × 0 + 4 × 2,50) / 10');

select tests.eq(public.receive_purchase(:'po', jsonb_build_array(jsonb_build_object('order_item_id', :'poi1', 'quantity', 4)),
  'receb-000000001'), :'r1'::uuid, 'reenvio com mesma chave não duplica');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 10.000, 'estoque não duplicado no reenvio');
select tests.throws(format($$select public.receive_purchase(%L, jsonb_build_array(jsonb_build_object('order_item_id', %L, 'quantity', 7)), 'receb-000000002')$$, :'po', :'poi1'),
  'excede o saldo pendente', 'não recebe mais que o pedido');
select tests.throws(format($$select public.receive_purchase(%L, jsonb_build_array(jsonb_build_object('order_item_id', %L, 'quantity', 1), jsonb_build_object('order_item_id', %L, 'quantity', 1)), 'receb-000000003')$$, :'po', :'poi1', :'poi1'),
  'repetidos', 'itens repetidos são rejeitados');

-- Recebimento do restante
select public.receive_purchase(:'po', jsonb_build_array(
  jsonb_build_object('order_item_id', :'poi1', 'quantity', 6),
  jsonb_build_object('order_item_id', :'poi2', 'quantity', 5)), 'receb-000000004');
select tests.eq((select status::text from public.purchase_orders where id = :'po'), 'received', 'pedido totalmente recebido');
select tests.eq((select stock_quantity from public.products where id = :'p2'), 5.000, 'estoque do segundo item');
select tests.throws(format($$select public.receive_purchase(%L, jsonb_build_array(jsonb_build_object('order_item_id', %L, 'quantity', 1)), 'receb-000000005')$$, :'po', :'poi1'),
  'não pode receber', 'pedido recebido não aceita novo recebimento');

select tests.login('c0000000-0000-0000-0000-00000000000a');
select tests.eq((select array_agg(amount order by created_at, amount) from public.financial_titles where supplier_id = :'supplier'),
  array[10.96, 34.71]::numeric[], 'contas a pagar proporcionais ao recebido');
select tests.eq((select sum(amount) from public.financial_titles where supplier_id = :'supplier'),
  (select total from public.purchase_orders where id = :'po'), 'soma das contas a pagar = total do pedido');
select tests.eq((select bool_and(due_date = current_date + 28) from public.financial_titles where supplier_id = :'supplier'),
  true, 'vencimento conforme prazo do pedido');
select tests.eq((select last_cost from public.supplier_products where product_id = :'p2'), 3.3330, 'último custo por fornecedor');

-- Baixa da conta a pagar
select public.settle_title((select id from public.financial_titles where amount = 10.96), 10.96, 'pix');
select tests.eq((select status::text from public.financial_titles where amount = 10.96), 'paid', 'título liquidado');
select tests.eq((select direction::text from public.financial_transactions where title_id is not null), 'out',
  'pagamento de fornecedor gera saída');
select tests.throws($$update public.financial_titles set paid_amount = 1 where amount = 34.71$$,
  'não permitida', 'baixa direta pela API é bloqueada');

reset role;
rollback;
