-- Run only after 0000_preciso.sql. All stock commands execute in one database transaction.
CREATE TABLE IF NOT EXISTS preciso.commercial_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT '', base_unit text NOT NULL, valuation_method text NOT NULL CHECK(valuation_method='fifo'),
 minimum_stock numeric(20,6) NOT NULL DEFAULT 0 CHECK(minimum_stock>=0),
 minimum_margin numeric(8,4) NOT NULL DEFAULT 0 CHECK(minimum_margin BETWEEN 0 AND 100),
 maximum_discount numeric(8,4) NOT NULL DEFAULT 100 CHECK(maximum_discount BETWEEN 0 AND 100),
 enforce_discount boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 published boolean NOT NULL DEFAULT false, public_price boolean NOT NULL DEFAULT false,
 image_url text, example boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.commercial_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES preciso.commercial_products(id),
 name text NOT NULL, factor numeric(20,6) NOT NULL CHECK(factor>0), price numeric(16,2) CHECK(price>=0),
 UNIQUE(product_id,name)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, contact text NOT NULL DEFAULT '',
 profile text NOT NULL DEFAULT 'balcao', allow_credit boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS preciso.commercial_suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, contact text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS preciso.commercial_price_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid NOT NULL REFERENCES preciso.commercial_units(id),
 customer_id uuid REFERENCES preciso.commercial_customers(id), profile text,
 minimum_quantity numeric(20,6) NOT NULL DEFAULT 1 CHECK(minimum_quantity>0),
 price numeric(16,2) NOT NULL CHECK(price>=0), valid_from date, valid_until date, active boolean NOT NULL DEFAULT true,
 CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_operations (
 actor_id uuid NOT NULL REFERENCES preciso.users(id), request_key uuid NOT NULL,
 kind text NOT NULL, payload jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_key)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES preciso.users(id),
 opening numeric(16,2) NOT NULL CHECK(opening>=0), opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz, counted numeric(16,2), expected numeric(16,2), notes text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_one_open_cash ON preciso.commercial_cash_sessions((true)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS preciso.commercial_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES preciso.commercial_products(id),
 supplier_id uuid REFERENCES preciso.commercial_suppliers(id), reference text NOT NULL DEFAULT '',
 quantity numeric(20,6) NOT NULL CHECK(quantity>0), total numeric(16,2), paid numeric(16,2) NOT NULL DEFAULT 0,
 due_on date, purchased_at date NOT NULL DEFAULT current_date, actor_id uuid NOT NULL REFERENCES preciso.users(id),
 CHECK(total IS NULL OR (total>=0 AND paid BETWEEN 0 AND total)), CHECK(paid>=0)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES preciso.commercial_products(id),
 purchase_id uuid REFERENCES preciso.commercial_purchases(id), reference text NOT NULL DEFAULT '',
 received numeric(20,6) NOT NULL CHECK(received>0), remaining numeric(20,6) NOT NULL CHECK(remaining>=0),
 unit_cost numeric(24,10) CHECK(unit_cost>=0), received_at timestamptz NOT NULL DEFAULT now(),
 CHECK(remaining<=received)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES preciso.commercial_customers(id),
 actor_id uuid NOT NULL REFERENCES preciso.users(id), status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 delivery text NOT NULL DEFAULT 'pending' CHECK(delivery IN ('pending','delivered')),
 freight numeric(16,2), fees numeric(16,2), taxes numeric(16,2), other_costs numeric(16,2),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(freight>=0 AND fees>=0 AND taxes>=0 AND other_costs>=0)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_sale_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES preciso.commercial_sales(id),
 product_id uuid NOT NULL REFERENCES preciso.commercial_products(id), unit_id uuid NOT NULL REFERENCES preciso.commercial_units(id),
 product_name text NOT NULL, unit_name text NOT NULL, factor numeric(20,6) NOT NULL,
 quantity numeric(20,6) NOT NULL CHECK(quantity>0), returned numeric(20,6) NOT NULL DEFAULT 0 CHECK(returned>=0 AND returned<=quantity),
 price numeric(16,2) NOT NULL CHECK(price>=0), list_price numeric(16,2) NOT NULL CHECK(list_price>=0),
 revenue numeric(16,2) NOT NULL CHECK(revenue>=0), cost numeric(24,10), warnings jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS preciso.commercial_allocations (
 item_id uuid NOT NULL REFERENCES preciso.commercial_sale_items(id), lot_id uuid NOT NULL REFERENCES preciso.commercial_lots(id),
 quantity numeric(20,6) NOT NULL CHECK(quantity>0), returned numeric(20,6) NOT NULL DEFAULT 0 CHECK(returned>=0 AND returned<=quantity),
 unit_cost numeric(24,10), PRIMARY KEY(item_id,lot_id)
);
CREATE TABLE IF NOT EXISTS preciso.commercial_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES preciso.commercial_products(id),
 lot_id uuid REFERENCES preciso.commercial_lots(id), sale_id uuid REFERENCES preciso.commercial_sales(id),
 quantity numeric(20,6) NOT NULL CHECK(quantity<>0), kind text NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES preciso.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.commercial_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES preciso.commercial_sales(id),
 cash_id uuid NOT NULL REFERENCES preciso.commercial_cash_sessions(id), method text NOT NULL CHECK(method IN ('dinheiro','pix','cartao')),
 amount numeric(16,2) NOT NULL CHECK(amount<>0), reference text NOT NULL DEFAULT '',
 actor_id uuid NOT NULL REFERENCES preciso.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preciso.commercial_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text NOT NULL, amount numeric(16,2) NOT NULL CHECK(amount>0),
 due_on date NOT NULL, paid_on date, method text CHECK(method IN ('dinheiro','pix','cartao')),
 cash_id uuid REFERENCES preciso.commercial_cash_sessions(id), actor_id uuid NOT NULL REFERENCES preciso.users(id)
);
CREATE INDEX IF NOT EXISTS commercial_stock_fifo ON preciso.commercial_lots(product_id,received_at,id);
CREATE INDEX IF NOT EXISTS commercial_sales_date ON preciso.commercial_sales(created_at);
CREATE INDEX IF NOT EXISTS commercial_movements_product ON preciso.commercial_movements(product_id,created_at);

CREATE OR REPLACE VIEW preciso.commercial_stock AS
 SELECT p.id,COALESCE(sum(l.remaining),0) AS balance,
 CASE WHEN bool_or(l.unit_cost IS NULL AND l.remaining>0) THEN NULL ELSE COALESCE(sum(l.remaining*l.unit_cost),0) END AS stock_cost
 FROM preciso.commercial_products p LEFT JOIN preciso.commercial_lots l ON l.product_id=p.id GROUP BY p.id;

CREATE OR REPLACE VIEW preciso.commercial_results AS
 SELECT s.*, COALESCE(i.gross,0) AS revenue, COALESCE(i.refund_value,0) AS returned_revenue,
 i.cost AS goods_cost, COALESCE(pay.received,0) AS received,
 COALESCE(i.gross,0)-COALESCE(i.refund_value,0)-COALESCE(pay.received,0) AS receivable,
 COALESCE(i.gross,0)-COALESCE(i.refund_value,0)-i.cost-s.freight-s.fees-s.taxes-s.other_costs AS contribution,
 (i.cost IS NULL OR s.freight IS NULL OR s.fees IS NULL OR s.taxes IS NULL OR s.other_costs IS NULL) AS partial
 FROM preciso.commercial_sales s
 LEFT JOIN LATERAL (
   SELECT sum(revenue) gross, sum(round(price*returned,2)) refund_value,
     CASE WHEN EXISTS(SELECT 1 FROM preciso.commercial_allocations a JOIN preciso.commercial_sale_items si ON si.id=a.item_id WHERE si.sale_id=s.id AND a.returned<a.quantity AND a.unit_cost IS NULL)
       THEN NULL ELSE (SELECT COALESCE(sum((a.quantity-a.returned)*a.unit_cost),0) FROM preciso.commercial_allocations a JOIN preciso.commercial_sale_items si ON si.id=a.item_id WHERE si.sale_id=s.id) END cost
   FROM preciso.commercial_sale_items WHERE sale_id=s.id
 ) i ON true
 LEFT JOIN LATERAL (SELECT sum(amount) received FROM preciso.commercial_payments WHERE sale_id=s.id) pay ON true;

CREATE OR REPLACE FUNCTION preciso.commercial_price(p_unit uuid,p_customer uuid,p_quantity numeric)
RETURNS numeric LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT r.price FROM preciso.commercial_price_rules r
 LEFT JOIN preciso.commercial_customers c ON c.id=p_customer
 WHERE r.active AND r.unit_id=p_unit AND r.minimum_quantity<=p_quantity
 AND (r.customer_id=p_customer OR (r.customer_id IS NULL AND (r.profile IS NULL OR r.profile=c.profile)))
 AND (r.valid_from IS NULL OR r.valid_from<=current_date) AND (r.valid_until IS NULL OR r.valid_until>=current_date)
 ORDER BY (r.customer_id IS NOT NULL) DESC,(r.profile IS NOT NULL) DESC,r.minimum_quantity DESC,r.id LIMIT 1),
 (SELECT price FROM preciso.commercial_units WHERE id=p_unit))
$$;

-- A command is atomic even over Neon's HTTP driver. Locks are acquired in product-id order.
CREATE OR REPLACE FUNCTION preciso.commercial_command(p_actor uuid,p_kind text,p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,preciso AS $$
#variable_conflict use_column
<<command_state>>
DECLARE
 op preciso.commercial_operations; product preciso.commercial_products; unit preciso.commercial_units;
 lot preciso.commercial_lots; item preciso.commercial_sale_items; sale preciso.commercial_sales;
 cash preciso.commercial_cash_sessions; purchase preciso.commercial_purchases;
 allocation preciso.commercial_allocations; value jsonb; result jsonb; warnings jsonb;
 entity uuid; sale_id uuid; item_id uuid; request_key uuid; customer_id uuid;
 qty numeric; needed numeric; take numeric; unit_price numeric; list_price numeric; cost numeric;
 total numeric; paid numeric; expected numeric; cost_known boolean; check_payload jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM preciso.users WHERE id=p_actor AND role='admin' AND NOT disabled) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 request_key:=(p->>'request_key')::uuid;
 IF request_key IS NULL THEN RAISE EXCEPTION 'REQUEST_KEY_REQUIRED'; END IF;
 INSERT INTO preciso.commercial_operations(actor_id,request_key,kind,payload) VALUES(p_actor,request_key,p_kind,p) ON CONFLICT DO NOTHING;
 SELECT * INTO op FROM preciso.commercial_operations WHERE actor_id=p_actor AND commercial_operations.request_key=command_state.request_key FOR UPDATE;
 IF op.kind<>p_kind OR op.payload<>p THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 IF op.result IS NOT NULL THEN RETURN op.result; END IF;

 IF p_kind='product' THEN
   entity:=COALESCE((p->>'id')::uuid,gen_random_uuid());
   SELECT * INTO product FROM preciso.commercial_products WHERE id=entity FOR UPDATE;
   IF FOUND AND product.base_unit<>p->>'base_unit' AND EXISTS(SELECT 1 FROM preciso.commercial_movements WHERE product_id=entity) THEN RAISE EXCEPTION 'UNIT_IN_USE'; END IF;
   INSERT INTO preciso.commercial_products(id,name,description,category,base_unit,valuation_method,minimum_stock,minimum_margin,maximum_discount,enforce_discount,active,published,public_price,image_url)
   VALUES(entity,p->>'name',p->>'description',p->>'category',p->>'base_unit','fifo',(p->>'minimum_stock')::numeric,(p->>'minimum_margin')::numeric,(p->>'maximum_discount')::numeric,(p->>'enforce_discount')::boolean,(p->>'active')::boolean,(p->>'published')::boolean,(p->>'public_price')::boolean,p->>'image_url')
   ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,base_unit=EXCLUDED.base_unit,
     minimum_stock=EXCLUDED.minimum_stock,minimum_margin=EXCLUDED.minimum_margin,maximum_discount=EXCLUDED.maximum_discount,enforce_discount=EXCLUDED.enforce_discount,
     active=EXCLUDED.active,published=EXCLUDED.published,public_price=EXCLUDED.public_price,image_url=EXCLUDED.image_url,example=false;
   FOR value IN SELECT * FROM jsonb_array_elements(p->'units') LOOP
     SELECT * INTO unit FROM preciso.commercial_units WHERE product_id=entity AND name=value->>'name';
     IF FOUND AND unit.factor<>(value->>'factor')::numeric AND EXISTS(SELECT 1 FROM preciso.commercial_movements WHERE product_id=entity) THEN RAISE EXCEPTION 'UNIT_IN_USE'; END IF;
     INSERT INTO preciso.commercial_units(product_id,name,factor,price) VALUES(entity,value->>'name',(value->>'factor')::numeric,(value->>'price')::numeric)
       ON CONFLICT(product_id,name) DO UPDATE SET factor=EXCLUDED.factor,price=EXCLUDED.price;
   END LOOP;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='import_products' THEN
   -- Serialize import batches so equal normalized names cannot race each other.
   LOCK TABLE preciso.commercial_products IN SHARE ROW EXCLUSIVE MODE;
   result:='[]';
   FOR value IN SELECT * FROM jsonb_array_elements(p->'rows') LOOP
     IF EXISTS(SELECT 1 FROM preciso.commercial_products WHERE lower(trim(name))=lower(trim(value->>'name'))) THEN RAISE EXCEPTION 'DUPLICATE_PRODUCT'; END IF;
     INSERT INTO preciso.commercial_products(name,category,base_unit,valuation_method,active)
       VALUES(value->>'name',value->>'category',value->>'base_unit','fifo',false) RETURNING id INTO entity;
     INSERT INTO preciso.commercial_units(product_id,name,factor,price) VALUES(entity,value->>'unit_name',(value->>'factor')::numeric,(value->>'price')::numeric);
     result:=result||jsonb_build_object('id',entity);
   END LOOP;
   result:=jsonb_build_object('id',request_key,'products',result);
 ELSIF p_kind='customer' THEN
   entity:=COALESCE((p->>'id')::uuid,gen_random_uuid());
   INSERT INTO preciso.commercial_customers(id,name,contact,profile,allow_credit) VALUES(entity,p->>'name',p->>'contact',p->>'profile',(p->>'allow_credit')::boolean)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,contact=EXCLUDED.contact,profile=EXCLUDED.profile,allow_credit=EXCLUDED.allow_credit;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='supplier' THEN
   INSERT INTO preciso.commercial_suppliers(name,contact) VALUES(p->>'name',p->>'contact') RETURNING id INTO entity;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='price_rule' THEN
   INSERT INTO preciso.commercial_price_rules(unit_id,customer_id,profile,minimum_quantity,price,valid_from,valid_until)
   VALUES((p->>'unit_id')::uuid,(p->>'customer_id')::uuid,p->>'profile',(p->>'minimum_quantity')::numeric,(p->>'price')::numeric,(p->>'valid_from')::date,(p->>'valid_until')::date) RETURNING id INTO entity;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='price_rule_status' THEN
   UPDATE preciso.commercial_price_rules SET active=(p->>'active')::boolean WHERE id=(p->>'id')::uuid RETURNING id INTO entity;
   IF entity IS NULL THEN RAISE EXCEPTION 'RULE_NOT_FOUND'; END IF;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='cash_open' THEN
   INSERT INTO preciso.commercial_cash_sessions(actor_id,opening) VALUES(p_actor,(p->>'opening')::numeric) RETURNING id INTO entity;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='cash_close' THEN
   SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
   SELECT cash.opening+COALESCE((SELECT sum(amount) FROM preciso.commercial_payments WHERE cash_id=cash.id AND method='dinheiro'),0)
     -COALESCE((SELECT sum(amount) FROM preciso.commercial_expenses WHERE cash_id=cash.id AND paid_on IS NOT NULL AND method='dinheiro'),0)
     -COALESCE((SELECT sum(amount) FROM preciso.commercial_purchase_payments WHERE cash_id=cash.id AND method='dinheiro'),0) INTO expected;
   UPDATE preciso.commercial_cash_sessions SET closed_at=now(),counted=(p->>'counted')::numeric,expected=command_state.expected,notes=p->>'notes' WHERE id=cash.id;
   result:=jsonb_build_object('id',cash.id,'expected',expected,'difference',(p->>'counted')::numeric-expected);
 ELSIF p_kind IN ('purchase','adjustment') THEN
   SELECT * INTO product FROM preciso.commercial_products WHERE id=(p->>'product_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
   SELECT * INTO unit FROM preciso.commercial_units WHERE id=(p->>'unit_id')::uuid AND product_id=product.id;
   IF NOT FOUND THEN RAISE EXCEPTION 'UNIT_NOT_FOUND'; END IF;
   qty:=(p->>'quantity')::numeric*unit.factor;
   IF qty<>round(qty,6) THEN RAISE EXCEPTION 'INVALID_PRECISION'; END IF;
   IF p_kind='adjustment' AND p->>'mode'='inventory' THEN
     SELECT qty-COALESCE(sum(remaining),0) INTO qty FROM preciso.commercial_lots WHERE product_id=product.id;
   ELSIF p_kind='adjustment' AND p->>'mode' IN ('loss','out') THEN qty:=-qty;
   END IF;
   IF qty=0 THEN RAISE EXCEPTION 'NO_STOCK_CHANGE'; END IF;
   entity:=NULL;
   IF p_kind='purchase' THEN
     total:=(p->>'goods_total')::numeric+(p->>'freight')::numeric+(p->>'other_costs')::numeric;
     INSERT INTO preciso.commercial_purchases(product_id,supplier_id,reference,quantity,total,paid,due_on,purchased_at,actor_id)
       VALUES(product.id,(p->>'supplier_id')::uuid,p->>'reference',qty,total,0,(p->>'due_on')::date,(p->>'purchased_at')::date,p_actor) RETURNING id INTO entity;
     cost:=total/qty;
   ELSE cost:=(p->>'base_unit_cost')::numeric;
   END IF;
   IF qty>0 THEN
     INSERT INTO preciso.commercial_lots(product_id,purchase_id,reference,received,remaining,unit_cost)
       VALUES(product.id,entity,p->>'reference',qty,qty,cost) RETURNING * INTO lot;
     INSERT INTO preciso.commercial_movements(product_id,lot_id,quantity,kind,reason,actor_id)
       VALUES(product.id,lot.id,qty,p_kind,p->>'reason',p_actor);
   ELSE
     needed:=-qty;
     FOR lot IN SELECT * FROM preciso.commercial_lots WHERE product_id=product.id AND remaining>0 ORDER BY received_at,id FOR UPDATE LOOP
       take:=LEAST(needed,lot.remaining);
       UPDATE preciso.commercial_lots SET remaining=remaining-take WHERE id=lot.id;
       INSERT INTO preciso.commercial_movements(product_id,lot_id,quantity,kind,reason,actor_id) VALUES(product.id,lot.id,-take,p_kind,p->>'reason',p_actor);
       needed:=needed-take; EXIT WHEN needed=0;
     END LOOP;
     IF needed>0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
   END IF;
   result:=jsonb_build_object('id',COALESCE(entity,lot.id),'base_quantity',qty);
 ELSIF p_kind='sale' THEN
   customer_id:=(p->>'customer_id')::uuid;
   IF customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM preciso.commercial_customers WHERE id=customer_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
   -- Lock each product once, before consuming any lot. Avoids lost updates and deadlocks.
   PERFORM 1 FROM preciso.commercial_products WHERE id IN (
     SELECT u.product_id FROM preciso.commercial_units u JOIN jsonb_array_elements(p->'items') v ON u.id=(v->>'unit_id')::uuid
   ) ORDER BY id FOR UPDATE;
   SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
   INSERT INTO preciso.commercial_sales(customer_id,actor_id,freight,fees,taxes,other_costs)
   VALUES(customer_id,p_actor,(p->>'freight')::numeric,(p->>'fees')::numeric,(p->>'taxes')::numeric,(p->>'other_costs')::numeric) RETURNING id INTO sale_id;
   total:=0;
   FOR value IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
     SELECT * INTO unit FROM preciso.commercial_units WHERE id=(value->>'unit_id')::uuid;
     IF NOT FOUND THEN RAISE EXCEPTION 'UNIT_NOT_FOUND'; END IF;
     SELECT * INTO product FROM preciso.commercial_products WHERE id=unit.product_id;
     IF NOT product.active THEN RAISE EXCEPTION 'PRODUCT_INACTIVE'; END IF;
     qty:=(value->>'quantity')::numeric; needed:=qty*unit.factor;
     IF needed<>round(needed,6) THEN RAISE EXCEPTION 'INVALID_PRECISION'; END IF;
     list_price:=preciso.commercial_price(unit.id,customer_id,qty);
     unit_price:=COALESCE((value->>'price')::numeric,list_price);
     IF list_price IS NULL OR unit_price IS NULL THEN RAISE EXCEPTION 'PRICE_REQUIRED'; END IF;
     IF product.enforce_discount AND unit_price<list_price*(1-product.maximum_discount/100) THEN RAISE EXCEPTION 'DISCOUNT_LIMIT'; END IF;
     IF unit_price<>list_price AND length(trim(COALESCE(value->>'reason','')))<3 THEN RAISE EXCEPTION 'NEGOTIATION_REASON_REQUIRED'; END IF;
     cost:=0; cost_known:=true; warnings:='[]';
     INSERT INTO preciso.commercial_sale_items(sale_id,product_id,unit_id,product_name,unit_name,factor,quantity,price,list_price,revenue)
       VALUES(sale_id,product.id,unit.id,product.name,unit.name,unit.factor,qty,unit_price,list_price,round(qty*unit_price,2)) RETURNING id INTO item_id;
     FOR lot IN SELECT * FROM preciso.commercial_lots WHERE product_id=product.id AND remaining>0 ORDER BY received_at,id FOR UPDATE LOOP
       take:=LEAST(needed,lot.remaining);
       UPDATE preciso.commercial_lots SET remaining=remaining-take WHERE id=lot.id;
       INSERT INTO preciso.commercial_allocations(item_id,lot_id,quantity,unit_cost) VALUES(item_id,lot.id,take,lot.unit_cost);
       INSERT INTO preciso.commercial_movements(product_id,lot_id,sale_id,quantity,kind,reason,actor_id) VALUES(product.id,lot.id,sale_id,-take,'sale',COALESCE(value->>'reason','Venda confirmada'),p_actor);
       cost:=cost+take*COALESCE(lot.unit_cost,0); cost_known:=cost_known AND lot.unit_cost IS NOT NULL;
       needed:=needed-take; EXIT WHEN needed=0;
     END LOOP;
     IF needed>0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
     IF NOT cost_known THEN warnings:=warnings||'"Custo parcial: existe lote sem custo cadastrado."'::jsonb;
     ELSIF unit_price*qty=0 OR (unit_price*qty-cost)/(unit_price*qty)*100<product.minimum_margin THEN warnings:=warnings||'"Margem abaixo do mínimo desejado."'::jsonb;
     END IF;
     IF unit_price<list_price*(1-product.maximum_discount/100) THEN warnings:=warnings||'"Desconto acima da referência configurada."'::jsonb; END IF;
     UPDATE preciso.commercial_sale_items SET cost=CASE WHEN cost_known THEN command_state.cost ELSE NULL END,warnings=command_state.warnings WHERE id=item_id;
     total:=total+round(qty*unit_price,2);
   END LOOP;
   paid:=0;
   FOR value IN SELECT * FROM jsonb_array_elements(p->'payments') LOOP
     INSERT INTO preciso.commercial_payments(sale_id,cash_id,method,amount,reference,actor_id) VALUES(sale_id,cash.id,value->>'method',(value->>'amount')::numeric,value->>'reference',p_actor);
     paid:=paid+(value->>'amount')::numeric;
   END LOOP;
   IF paid>total THEN RAISE EXCEPTION 'OVERPAYMENT'; END IF;
   IF paid<total AND NOT COALESCE((SELECT allow_credit FROM preciso.commercial_customers WHERE id=customer_id),false) THEN RAISE EXCEPTION 'CREDIT_NOT_ALLOWED'; END IF;
   result:=jsonb_build_object('id',sale_id);
 ELSIF p_kind IN ('return','cancel') THEN
   SELECT * INTO sale FROM preciso.commercial_sales WHERE id=(p->>'sale_id')::uuid FOR UPDATE;
   IF NOT FOUND OR sale.status<>'confirmed' THEN RAISE EXCEPTION 'SALE_NOT_ACTIVE'; END IF;
   PERFORM 1 FROM preciso.commercial_products WHERE id IN (SELECT product_id FROM preciso.commercial_sale_items WHERE commercial_sale_items.sale_id=sale.id) ORDER BY id FOR UPDATE;
   IF p_kind='cancel' THEN check_payload:=(SELECT jsonb_agg(jsonb_build_object('item_id',id,'quantity',quantity-returned)) FROM preciso.commercial_sale_items WHERE commercial_sale_items.sale_id=sale.id AND returned<quantity);
   ELSE check_payload:=p->'items'; END IF;
   FOR value IN SELECT * FROM jsonb_array_elements(COALESCE(check_payload,'[]')) LOOP
     SELECT * INTO item FROM preciso.commercial_sale_items WHERE id=(value->>'item_id')::uuid AND commercial_sale_items.sale_id=sale.id FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
     qty:=(value->>'quantity')::numeric;
     IF qty<=0 OR qty>item.quantity-item.returned THEN RAISE EXCEPTION 'RETURN_QUANTITY'; END IF;
     needed:=qty*item.factor;
     FOR allocation IN SELECT * FROM preciso.commercial_allocations WHERE commercial_allocations.item_id=item.id AND returned<quantity ORDER BY lot_id FOR UPDATE LOOP
       take:=LEAST(needed,allocation.quantity-allocation.returned);
       UPDATE preciso.commercial_lots SET remaining=remaining+take WHERE id=allocation.lot_id;
       UPDATE preciso.commercial_allocations SET returned=returned+take WHERE commercial_allocations.item_id=item.id AND lot_id=allocation.lot_id;
       INSERT INTO preciso.commercial_movements(product_id,lot_id,sale_id,quantity,kind,reason,actor_id) VALUES(item.product_id,allocation.lot_id,sale.id,take,'return',p->>'reason',p_actor);
       needed:=needed-take; EXIT WHEN needed=0;
     END LOOP;
     IF needed<>0 THEN RAISE EXCEPTION 'RETURN_ALLOCATION'; END IF;
     UPDATE preciso.commercial_sale_items SET returned=returned+qty WHERE id=item.id;
   END LOOP;
   IF p_kind='cancel' THEN UPDATE preciso.commercial_sales SET status='cancelled' WHERE id=sale.id; END IF;
   -- Financial refund is recorded separately, only when it actually occurs.
   result:=jsonb_build_object('id',sale.id);
 ELSIF p_kind IN ('payment','refund') THEN
   SELECT * INTO sale FROM preciso.commercial_sales WHERE id=(p->>'sale_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
   SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
   SELECT receivable INTO total FROM preciso.commercial_results WHERE id=sale.id;
   qty:=(p->>'amount')::numeric;
   IF p_kind='payment' AND (sale.status<>'confirmed' OR qty>total) THEN RAISE EXCEPTION 'OVERPAYMENT'; END IF;
   IF p_kind='refund' AND qty> -total THEN RAISE EXCEPTION 'REFUND_LIMIT'; END IF;
   INSERT INTO preciso.commercial_payments(sale_id,cash_id,method,amount,reference,actor_id)
     VALUES(sale.id,cash.id,p->>'method',CASE WHEN p_kind='refund' THEN -qty ELSE qty END,p->>'reference',p_actor) RETURNING id INTO entity;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='delivery' THEN
   UPDATE preciso.commercial_sales SET delivery=p->>'delivery' WHERE id=(p->>'sale_id')::uuid AND status='confirmed' RETURNING id INTO entity;
   IF entity IS NULL THEN RAISE EXCEPTION 'SALE_NOT_ACTIVE'; END IF;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='sale_costs' THEN
   UPDATE preciso.commercial_sales SET freight=(p->>'freight')::numeric,fees=(p->>'fees')::numeric,taxes=(p->>'taxes')::numeric,other_costs=(p->>'other_costs')::numeric
     WHERE id=(p->>'sale_id')::uuid RETURNING id INTO entity;
   IF entity IS NULL THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='expense' THEN
   SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
   IF (p->>'paid_on') IS NOT NULL AND cash.id IS NULL THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
   INSERT INTO preciso.commercial_expenses(description,amount,due_on,paid_on,method,cash_id,actor_id)
   VALUES(p->>'description',(p->>'amount')::numeric,(p->>'due_on')::date,(p->>'paid_on')::date,p->>'method',cash.id,p_actor) RETURNING id INTO entity;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='purchase_costs' THEN
   SELECT * INTO purchase FROM preciso.commercial_purchases WHERE id=(p->>'purchase_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_NOT_FOUND'; END IF;
   IF purchase.total IS NOT NULL THEN RAISE EXCEPTION 'COST_ALREADY_DEFINED'; END IF;
   PERFORM 1 FROM preciso.commercial_products WHERE id=purchase.product_id FOR UPDATE;
   total:=(p->>'goods_total')::numeric+(p->>'freight')::numeric+(p->>'other_costs')::numeric;
   cost:=total/purchase.quantity;
   UPDATE preciso.commercial_purchases SET total=command_state.total WHERE id=purchase.id;
   UPDATE preciso.commercial_lots SET unit_cost=command_state.cost WHERE purchase_id=purchase.id;
   UPDATE preciso.commercial_allocations SET unit_cost=command_state.cost WHERE lot_id IN (SELECT id FROM preciso.commercial_lots WHERE purchase_id=purchase.id) AND unit_cost IS NULL;
   UPDATE preciso.commercial_sale_items i SET cost=(SELECT CASE WHEN bool_or(a.unit_cost IS NULL) THEN NULL ELSE sum(a.quantity*a.unit_cost) END FROM preciso.commercial_allocations a WHERE a.item_id=i.id)
     WHERE i.id IN (SELECT a.item_id FROM preciso.commercial_allocations a JOIN preciso.commercial_lots l ON l.id=a.lot_id WHERE l.purchase_id=purchase.id);
   result:=jsonb_build_object('id',purchase.id);
 ELSIF p_kind='purchase_payment' THEN
   SELECT * INTO purchase FROM preciso.commercial_purchases WHERE id=(p->>'purchase_id')::uuid FOR UPDATE;
   IF NOT FOUND OR purchase.total IS NULL THEN RAISE EXCEPTION 'PURCHASE_NOT_FOUND'; END IF;
   qty:=(p->>'amount')::numeric;
   IF purchase.paid+qty>purchase.total THEN RAISE EXCEPTION 'OVERPAYMENT'; END IF;
   SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
   UPDATE preciso.commercial_purchases SET paid=paid+qty WHERE id=purchase.id;
   -- This expense is a cash-flow settlement, excluded from economic operating costs by its purchase link in the ledger below.
   INSERT INTO preciso.commercial_purchase_payments(purchase_id,amount,method,cash_id,actor_id)
   VALUES(purchase.id,qty,p->>'method',cash.id,p_actor) RETURNING id INTO entity;
   result:=jsonb_build_object('id',entity);
 ELSIF p_kind='expense_payment' THEN
   SELECT * INTO cash FROM preciso.commercial_cash_sessions WHERE closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASH_CLOSED'; END IF;
   UPDATE preciso.commercial_expenses SET paid_on=(p->>'paid_on')::date,method=p->>'method',cash_id=cash.id
     WHERE id=(p->>'expense_id')::uuid AND paid_on IS NULL RETURNING id INTO entity;
   IF entity IS NULL THEN RAISE EXCEPTION 'EXPENSE_ALREADY_PAID'; END IF;
   result:=jsonb_build_object('id',entity);
 ELSE RAISE EXCEPTION 'UNKNOWN_COMMAND';
 END IF;
 UPDATE preciso.commercial_operations SET result=command_state.result WHERE actor_id=p_actor AND commercial_operations.request_key=command_state.request_key;
 RETURN result;
END $$;

CREATE TABLE IF NOT EXISTS preciso.commercial_purchase_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES preciso.commercial_purchases(id),
 amount numeric(16,2) NOT NULL CHECK(amount>0), method text NOT NULL CHECK(method IN ('dinheiro','pix','cartao')),
 cash_id uuid NOT NULL REFERENCES preciso.commercial_cash_sessions(id), actor_id uuid NOT NULL REFERENCES preciso.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON FUNCTION preciso.commercial_command(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA preciso FROM PUBLIC;

-- An unpublished draft only. The owner must confirm the real sack weight and prices.
INSERT INTO preciso.commercial_products(name,description,category,base_unit,valuation_method,active,example)
SELECT 'Gesso em saco — exemplo para configurar','Confirme o peso real do saco e cadastre as conversões antes de ativar.','Gesso','kg','fifo',false,true
WHERE NOT EXISTS(SELECT 1 FROM preciso.commercial_products WHERE example);
INSERT INTO preciso.commercial_units(product_id,name,factor,price)
SELECT id,'kg',1,NULL FROM preciso.commercial_products WHERE example
ON CONFLICT(product_id,name) DO NOTHING;
