-- Integration test against existing RPCs. Every mutation is rolled back.
BEGIN;
UPDATE public.profiles SET point_adjustment = point_adjustment + 10000
WHERE id = '50b0db29-89b6-4601-bfd9-a17c5c81137b';
SET LOCAL request.jwt.claim.sub = '50b0db29-89b6-4601-bfd9-a17c5c81137b';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE item record; result jsonb; before_balance integer; after_balance integer; equipped text; denied boolean := false; affected integer;
BEGIN
  FOR item IN SELECT * FROM public.pixel_item_catalog LOOP
    IF NOT EXISTS (SELECT 1 FROM public.pixel_item_ownership WHERE user_id=auth.uid() AND item_id=item.item_id) THEN
      SELECT bonus_points + point_adjustment INTO before_balance FROM public.profiles WHERE id=auth.uid();
      result := public.purchase_pixel_item(item.item_id);
      IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'purchase failed: % %',item.item_id,result; END IF;
      IF (result->>'newBalance')::integer <> before_balance-item.price THEN RAISE EXCEPTION 'wrong charge'; END IF;
    END IF;
    SELECT bonus_points + point_adjustment INTO before_balance FROM public.profiles WHERE id=auth.uid();
    result := public.purchase_pixel_item(item.item_id);
    SELECT bonus_points + point_adjustment INTO after_balance FROM public.profiles WHERE id=auth.uid();
    IF result->>'reason' <> 'already_owned' OR before_balance <> after_balance THEN RAISE EXCEPTION 'duplicate charged'; END IF;
    IF item.category='avatar' THEN
      result := public.equip_pixel_item(item.slot,item.item_id);
      IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'equip failed: %',item.item_id; END IF;
      SELECT to_jsonb(e)->>item.slot INTO equipped FROM public.pixel_avatar_equipment e WHERE user_id=auth.uid();
      IF equipped IS DISTINCT FROM item.item_id THEN RAISE EXCEPTION 'server equipment mismatch'; END IF;
      result := public.equip_pixel_item('eyes',item.item_id);
      IF result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'wrong slot accepted'; END IF;
    END IF;
  END LOOP;
  -- RPC flags are transaction-local; reset to model a new REST request.
  PERFORM set_config('reviewnote.pixel_rpc', '', true);
  BEGIN
    UPDATE public.pixel_avatar_equipment SET top=NULL WHERE user_id=auth.uid();
    GET DIAGNOSTICS affected = ROW_COUNT;
    denied := affected = 0;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'direct writes to %' THEN denied := true; ELSE RAISE; END IF;
  WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'direct equipment update unexpectedly allowed'; END IF;
END
$test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: 24 catalog purchases/duplicate prevention, all avatar slot equipment persisted, wrong slot and direct write denied; rolled back' AS result;
