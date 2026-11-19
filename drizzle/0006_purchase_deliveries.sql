ALTER TABLE preciso.commercial_purchases ADD COLUMN delivery_id uuid;
ALTER TABLE preciso.commercial_purchase_payments ADD COLUMN delivery_payment_id uuid;
CREATE INDEX commercial_purchases_delivery_idx ON preciso.commercial_purchases(delivery_id) WHERE delivery_id IS NOT NULL;

CREATE FUNCTION preciso.commercial_delivery_command(p_actor uuid, p_kind text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,preciso AS $$
DECLARE
  operation preciso.commercial_operations;
  request_id uuid := (p->>'request_key')::uuid;
  group_id uuid := gen_random_uuid();
  delivery uuid;
  detail jsonb;
  item record;
  goods numeric;
  freight numeric;
  other_costs numeric;
  weight_total numeric;
  weight_before numeric := 0;
  weight_after numeric;
  remaining numeric;
  balance numeric;
  portion numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM preciso.users WHERE id=p_actor AND role='admin' AND NOT disabled) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_KEY_REQUIRED'; END IF;
  INSERT INTO preciso.commercial_operations(actor_id,request_key,kind,payload)
    VALUES(p_actor,request_id,p_kind,p) ON CONFLICT DO NOTHING;
  SELECT * INTO operation FROM preciso.commercial_operations
    WHERE actor_id=p_actor AND request_key=request_id FOR UPDATE;
  IF operation.kind<>p_kind OR operation.payload<>p THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF operation.result IS NOT NULL THEN RETURN operation.result; END IF;

  IF p_kind='purchase_delivery' THEN
    SELECT sum((value->>'goods_total')::numeric) INTO goods FROM jsonb_array_elements(p->'items');
    freight := (p->>'freight')::numeric;
    other_costs := (p->>'other_costs')::numeric;
    weight_total := CASE WHEN goods>0 THEN goods ELSE jsonb_array_length(p->'items') END;

    -- Lock products in the same order as sales, keeping original order for repeated products.
    FOR item IN SELECT value FROM jsonb_array_elements(p->'items') WITH ORDINALITY
      ORDER BY (value->>'product_id')::uuid, ordinality
    LOOP
      weight_after := weight_before + CASE WHEN goods>0 THEN (item.value->>'goods_total')::numeric ELSE 1 END;
      -- Differences of rounded cumulative shares recover every cent of each shared charge.
      detail := preciso.commercial_command(p_actor,'purchase',
        (p - 'items' - 'request_key') || item.value || jsonb_build_object(
          'request_key',gen_random_uuid(),
          'freight',round(freight*weight_after/weight_total,2)-round(freight*weight_before/weight_total,2),
          'other_costs',round(other_costs*weight_after/weight_total,2)-round(other_costs*weight_before/weight_total,2)
        ));
      UPDATE preciso.commercial_purchases SET delivery_id=group_id WHERE id=(detail->>'id')::uuid;
      weight_before := weight_after;
    END LOOP;
  ELSIF p_kind='purchase_delivery_payment' THEN
    delivery := (p->>'delivery_id')::uuid;
    remaining := (p->>'amount')::numeric;
    PERFORM 1 FROM preciso.commercial_purchases WHERE delivery_id=delivery ORDER BY id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_NOT_FOUND'; END IF;
    SELECT sum(total-paid) INTO balance FROM preciso.commercial_purchases WHERE delivery_id=delivery;
    IF remaining>balance THEN RAISE EXCEPTION 'OVERPAYMENT'; END IF;
    FOR item IN SELECT id,total-paid AS available FROM preciso.commercial_purchases
      WHERE delivery_id=delivery AND total>paid ORDER BY id
    LOOP
      EXIT WHEN remaining=0;
      portion := least(remaining,item.available);
      detail := preciso.commercial_command(p_actor,'purchase_payment',jsonb_build_object(
        'request_key',gen_random_uuid(),'purchase_id',item.id,'amount',portion,
        'method',p->>'method','confirmed',true
      ));
      UPDATE preciso.commercial_purchase_payments SET delivery_payment_id=group_id WHERE id=(detail->>'id')::uuid;
      remaining := remaining-portion;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_COMMAND';
  END IF;

  detail := jsonb_build_object('id',group_id);
  UPDATE preciso.commercial_operations SET result=detail WHERE actor_id=p_actor AND request_key=request_id;
  RETURN detail;
END $$;
REVOKE ALL ON FUNCTION preciso.commercial_delivery_command(uuid,text,jsonb) FROM PUBLIC;
