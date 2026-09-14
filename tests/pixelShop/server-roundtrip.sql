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
SELECT 'PASS: 39 catalog purchases/duplicate prevention, all avatar slot equipment persisted, wrong slot and direct write denied; rolled back' AS result;

-- save_pixel_room_layout — 가구 배치 서버 저장(place/move/remove/ownership/bounds/duplicate/
-- direct-write guard). 위 블록과 별개 트랜잭션이라 그 블록의 롤백에 의존하지 않는다.
BEGIN;
UPDATE public.profiles SET point_adjustment = point_adjustment + 10000
WHERE id = '50b0db29-89b6-4601-bfd9-a17c5c81137b';
SET LOCAL request.jwt.claim.sub = '50b0db29-89b6-4601-bfd9-a17c5c81137b';
SET LOCAL ROLE authenticated;
DO $furniture_test$
DECLARE result jsonb; denied boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pixel_item_ownership WHERE user_id=auth.uid() AND item_id='furniture_chair') THEN
    result := public.purchase_pixel_item('furniture_chair');
    IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'purchase failed: %', result; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pixel_item_ownership WHERE user_id=auth.uid() AND item_id='furniture_plant') THEN
    result := public.purchase_pixel_item('furniture_plant');
    IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'purchase failed: %', result; END IF;
  END IF;

  result := public.save_pixel_room_layout('[{"itemId":"furniture_chair","x":1,"y":2},{"itemId":"furniture_plant","x":3,"y":4}]'::jsonb);
  IF result->>'ok' <> 'true' OR (result->>'count')::int <> 2 THEN RAISE EXCEPTION 'save failed: %', result; END IF;
  IF (SELECT count(*) FROM public.pixel_furniture_placement WHERE user_id=auth.uid()) <> 2 THEN RAISE EXCEPTION 'row count wrong'; END IF;

  -- move one, remove the other (only chair remains, moved) — place/move/remove all go through
  -- this one whole-layout RPC.
  result := public.save_pixel_room_layout('[{"itemId":"furniture_chair","x":5,"y":5}]'::jsonb);
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'move/remove failed: %', result; END IF;
  IF (SELECT count(*) FROM public.pixel_furniture_placement WHERE user_id=auth.uid()) <> 1 THEN RAISE EXCEPTION 'remove did not shrink rows'; END IF;
  IF (SELECT x FROM public.pixel_furniture_placement WHERE user_id=auth.uid() AND item_id='furniture_chair') <> 5 THEN RAISE EXCEPTION 'move did not persist'; END IF;

  result := public.save_pixel_room_layout('[{"itemId":"furniture_bed","x":0,"y":0}]'::jsonb);
  IF result->>'reason' <> 'not_owned' THEN RAISE EXCEPTION 'unowned furniture was not rejected: %', result; END IF;
  IF (SELECT count(*) FROM public.pixel_furniture_placement WHERE user_id=auth.uid()) <> 1 THEN RAISE EXCEPTION 'rejected call mutated state'; END IF;

  result := public.save_pixel_room_layout('[{"itemId":"furniture_chair","x":10,"y":0}]'::jsonb);
  IF result->>'reason' <> 'out_of_bounds' THEN RAISE EXCEPTION 'out-of-bounds not rejected: %', result; END IF;

  result := public.save_pixel_room_layout('[{"itemId":"top_sage","x":0,"y":0}]'::jsonb);
  IF result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'avatar item accepted as furniture: %', result; END IF;

  result := public.save_pixel_room_layout('[{"itemId":"furniture_chair","x":0,"y":0},{"itemId":"furniture_chair","x":1,"y":1}]'::jsonb);
  IF result->>'reason' <> 'duplicate_item' THEN RAISE EXCEPTION 'duplicate not rejected: %', result; END IF;

  result := public.save_pixel_room_layout('[]'::jsonb);
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'empty save failed: %', result; END IF;
  IF (SELECT count(*) FROM public.pixel_furniture_placement WHERE user_id=auth.uid()) <> 0 THEN RAISE EXCEPTION 'empty save did not clear'; END IF;

  PERFORM set_config('reviewnote.pixel_rpc', '', true);
  BEGIN
    INSERT INTO public.pixel_furniture_placement (user_id, item_id, x, y) VALUES (auth.uid(), 'furniture_chair', 0, 0);
    denied := false;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'direct writes to %' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'direct insert unexpectedly allowed'; END IF;
END
$furniture_test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: save_pixel_room_layout place/move/remove/ownership/bounds/duplicate/direct-write-guard all verified; rolled back' AS result;
