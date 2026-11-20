-- Folhas da loja: retiradas do caixa, gastos fixos/variáveis, débitos da empresa,
-- fechamentos (dia e semana, automático ou manual) e conferência de entregas.
ALTER TABLE preciso.commercial_expenses ADD COLUMN category text NOT NULL DEFAULT 'despesa';
ALTER TABLE preciso.commercial_expenses ADD CONSTRAINT commercial_expenses_category_check
  CHECK (category IN ('despesa','retirada','vale'));
ALTER TABLE preciso.commercial_expenses ADD COLUMN expense_type text NOT NULL DEFAULT 'variavel';
ALTER TABLE preciso.commercial_expenses ADD CONSTRAINT commercial_expenses_type_check
  CHECK (expense_type IN ('fixo','variavel'));
ALTER TABLE preciso.commercial_expenses ADD COLUMN person text NOT NULL DEFAULT '';

ALTER TABLE preciso.staff_permissions DROP CONSTRAINT IF EXISTS staff_permissions_permission_check;
ALTER TABLE preciso.staff_permissions ADD CONSTRAINT staff_permissions_permission_check
  CHECK (permission IN ('service_requests','service_catalogue','service_agenda','service_projects','finance_cfo','store_closing'));

CREATE TABLE preciso.commercial_company_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('boleto','divida','credito','aluguel','outro','fiado')),
  person text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  amount numeric(16,2) CHECK (amount IS NULL OR amount >= 0),
  due_on date,
  paid_on date,
  example boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  actor_id uuid NOT NULL REFERENCES preciso.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commercial_company_debts_due ON preciso.commercial_company_debts (kind, due_on);

CREATE TABLE preciso.commercial_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period IN ('dia','semana')),
  start_on date NOT NULL,
  end_on date NOT NULL CHECK (end_on >= start_on),
  source text NOT NULL CHECK (source IN ('automatico','manual')),
  actor_id uuid REFERENCES preciso.users(id),
  notes text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source = 'automatico' OR actor_id IS NOT NULL)
);
CREATE UNIQUE INDEX commercial_closings_auto ON preciso.commercial_closings (period, start_on)
  WHERE source = 'automatico';
CREATE INDEX commercial_closings_recent ON preciso.commercial_closings (start_on DESC, created_at DESC);

CREATE TABLE preciso.commercial_supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES preciso.commercial_suppliers(id),
  reference text NOT NULL DEFAULT '',
  ordered_on date NOT NULL,
  expected_on date,
  due_on date,
  freight numeric(16,2) NOT NULL DEFAULT 0 CHECK (freight >= 0),
  other_costs numeric(16,2) NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','chegou','conferido')),
  arrived_at timestamptz,
  checked_at timestamptz,
  check_result jsonb,
  delivery_id uuid,
  notes text NOT NULL DEFAULT '',
  actor_id uuid NOT NULL REFERENCES preciso.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commercial_supplier_orders_status ON preciso.commercial_supplier_orders (status, expected_on);

CREATE FUNCTION preciso.store_command(p_actor uuid, p_kind text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,preciso AS $$
#variable_conflict use_column
<<store_state>>
DECLARE
  operation preciso.commercial_operations;
  request_id uuid := (p->>'request_key')::uuid;
  is_admin boolean;
  cash preciso.commercial_cash_sessions;
  ordered preciso.commercial_supplier_orders;
  entity uuid;
  detail jsonb;
  result jsonb;
  item record;
  checked jsonb;
  delivery_items jsonb := '[]';
  ok numeric;
  broken numeric;
  damaged numeric;
  quantity numeric;
  expected numeric;
  today date := (now() AT TIME ZONE 'America/Recife')::date;
BEGIN
  SELECT role='admin' INTO is_admin FROM preciso.users WHERE id=p_actor AND NOT disabled;
  IF is_admin IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT is_admin AND NOT (
    p_kind IN ('store_cash_open','store_cash_close','store_withdrawal','store_expense','store_closing')
    AND EXISTS (SELECT 1 FROM preciso.staff_permissions WHERE user_id=p_actor AND permission='store_closing')
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_KEY_REQUIRED'; END IF;
  INSERT INTO preciso.commercial_operations(actor_id,request_key,kind,payload)
    VALUES (p_actor,request_id,p_kind,p) ON CONFLICT DO NOTHING;
  SELECT * INTO operation FROM preciso.commercial_operations
    WHERE actor_id=p_actor AND request_key=request_id FOR UPDATE;
  IF operation.kind<>p_kind OR operation.payload<>p THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF operation.result IS NOT NULL THEN RETURN operation.result; END IF;

  IF p_kind='store_cash_open' THEN
    INSERT INTO preciso.commercial_cash_sessions(actor_id,opening) VALUES (p_actor,(p->>'opening')::numeric)
      RETURNING id INTO entity;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_cash_close' THEN
    -- Mesma conta do fechamento original: retiradas e vales são saídas em dinheiro do caixa.
    SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
    IF cash.id IS NULL THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
    expected := cash.opening
      + COALESCE((SELECT sum(amount) FROM preciso.commercial_payments WHERE cash_id=cash.id AND method='dinheiro'),0)
      - COALESCE((SELECT sum(amount) FROM preciso.commercial_expenses WHERE cash_id=cash.id AND paid_on IS NOT NULL AND method='dinheiro'),0)
      - COALESCE((SELECT sum(amount) FROM preciso.commercial_purchase_payments WHERE cash_id=cash.id AND method='dinheiro'),0);
    UPDATE preciso.commercial_cash_sessions SET closed_at=now(),counted=(p->>'counted')::numeric,
      expected=store_state.expected,notes=p->>'notes' WHERE id=cash.id;
    result := jsonb_build_object('id',cash.id,'expected',expected,'difference',(p->>'counted')::numeric-expected);
  ELSIF p_kind='store_withdrawal' THEN
    SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
    IF cash.id IS NULL THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
    INSERT INTO preciso.commercial_expenses(description,amount,due_on,paid_on,method,cash_id,actor_id,category,expense_type,person)
      VALUES (p->>'description',(p->>'amount')::numeric,today,today,'dinheiro',cash.id,p_actor,p->>'category','variavel',p->>'person')
      RETURNING id INTO entity;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_expense' THEN
    SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
    IF p->>'method'='dinheiro' AND (p->>'paid_on') IS NOT NULL AND cash.id IS NULL THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
    INSERT INTO preciso.commercial_expenses(description,amount,due_on,paid_on,method,cash_id,actor_id,category,expense_type,person)
      VALUES (p->>'description',(p->>'amount')::numeric,(p->>'due_on')::date,(p->>'paid_on')::date,p->>'method',
        CASE WHEN (p->>'paid_on') IS NOT NULL THEN cash.id END,p_actor,'despesa',p->>'expense_type',p->>'person')
      RETURNING id INTO entity;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_debt' THEN
    entity := COALESCE((p->>'id')::uuid,gen_random_uuid());
    INSERT INTO preciso.commercial_company_debts(id,kind,person,description,amount,due_on,paid_on,example,notes,actor_id)
      VALUES (entity,p->>'kind',p->>'person',p->>'description',(p->>'amount')::numeric,(p->>'due_on')::date,
        (p->>'paid_on')::date,(p->>'example')::boolean,p->>'notes',p_actor)
      ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,person=EXCLUDED.person,description=EXCLUDED.description,
        amount=EXCLUDED.amount,due_on=EXCLUDED.due_on,paid_on=EXCLUDED.paid_on,example=EXCLUDED.example,notes=EXCLUDED.notes;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_debt_remove' THEN
    DELETE FROM preciso.commercial_company_debts WHERE id=(p->>'id')::uuid RETURNING id INTO entity;
    IF entity IS NULL THEN RAISE EXCEPTION 'DEBT_NOT_FOUND'; END IF;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_closing' THEN
    INSERT INTO preciso.commercial_closings(period,start_on,end_on,source,actor_id,notes,snapshot)
      VALUES (p->>'period',(p->>'start_on')::date,(p->>'end_on')::date,'manual',p_actor,p->>'notes','{}'::jsonb)
      RETURNING id INTO entity;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_order' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
      IF NOT EXISTS (SELECT 1 FROM preciso.commercial_units u WHERE u.id=(item.value->>'unit_id')::uuid
        AND u.product_id=(item.value->>'product_id')::uuid) THEN RAISE EXCEPTION 'UNIT_NOT_FOUND'; END IF;
    END LOOP;
    INSERT INTO preciso.commercial_supplier_orders(supplier_id,reference,ordered_on,expected_on,due_on,freight,other_costs,items,notes,actor_id)
      VALUES ((p->>'supplier_id')::uuid,p->>'reference',(p->>'ordered_on')::date,(p->>'expected_on')::date,(p->>'due_on')::date,
        (p->>'freight')::numeric,(p->>'other_costs')::numeric,p->'items',p->>'notes',p_actor)
      RETURNING id INTO entity;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_order_arrived' THEN
    UPDATE preciso.commercial_supplier_orders SET status='chegou',arrived_at=now()
      WHERE id=(p->>'order_id')::uuid AND status='aguardando' RETURNING id INTO entity;
    IF entity IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_AVAILABLE'; END IF;
    result := jsonb_build_object('id',entity);
  ELSIF p_kind='store_order_check' THEN
    SELECT * INTO ordered FROM preciso.commercial_supplier_orders WHERE id=(p->>'order_id')::uuid FOR UPDATE;
    IF ordered.id IS NULL OR ordered.status='conferido' THEN RAISE EXCEPTION 'ORDER_NOT_AVAILABLE'; END IF;
    IF jsonb_array_length(p->'items')<>jsonb_array_length(ordered.items) THEN RAISE EXCEPTION 'ORDER_ITEMS_MISMATCH'; END IF;
    checked := '[]';
    FOR item IN SELECT o.value AS ordered_item, c.value AS counted, o.ordinality
      FROM jsonb_array_elements(ordered.items) WITH ORDINALITY o
      JOIN jsonb_array_elements(p->'items') WITH ORDINALITY c ON c.ordinality=o.ordinality
    LOOP
      quantity := (item.ordered_item->>'quantity')::numeric;
      ok := (item.counted->>'ok')::numeric;
      broken := (item.counted->>'broken')::numeric;
      damaged := (item.counted->>'damaged')::numeric;
      checked := checked || jsonb_build_object(
        'product_id',item.ordered_item->>'product_id','unit_id',item.ordered_item->>'unit_id',
        'ordered',quantity,'ok',ok,'broken',broken,'damaged',damaged,
        'missing',greatest(quantity-ok-broken-damaged,0),'note',item.counted->>'note');
      -- Só entra no estoque e na conta do fornecedor o que chegou em bom estado.
      IF ok>0 THEN
        delivery_items := delivery_items || jsonb_build_object(
          'product_id',item.ordered_item->>'product_id','unit_id',item.ordered_item->>'unit_id','quantity',ok,
          'goods_total',round((item.ordered_item->>'goods_total')::numeric*least(ok/quantity,1),2));
      END IF;
    END LOOP;
    IF jsonb_array_length(delivery_items)>0 THEN
      detail := preciso.commercial_delivery_command(p_actor,'purchase_delivery',jsonb_build_object(
        'request_key',md5(request_id::text||':entrega')::uuid,
        'items',delivery_items,'supplier_id',ordered.supplier_id,
        'reference',CASE WHEN ordered.reference='' THEN 'Pedido conferido' ELSE ordered.reference END,
        'reason','Entrega conferida','freight',ordered.freight,'other_costs',ordered.other_costs,
        'purchased_at',today,'due_on',ordered.due_on));
    END IF;
    UPDATE preciso.commercial_supplier_orders SET status='conferido',checked_at=now(),
      arrived_at=COALESCE(arrived_at,now()),delivery_id=(detail->>'id')::uuid,
      check_result=jsonb_build_object('items',checked,'notes',p->>'notes','by',p_actor)
      WHERE id=ordered.id;
    result := jsonb_build_object('id',ordered.id,'delivery_id',detail->>'id');
  ELSE
    RAISE EXCEPTION 'UNKNOWN_COMMAND';
  END IF;

  UPDATE preciso.commercial_operations SET result=store_state.result WHERE actor_id=p_actor AND request_key=request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION preciso.store_command(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON preciso.commercial_company_debts, preciso.commercial_closings, preciso.commercial_supplier_orders FROM PUBLIC;
