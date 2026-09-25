-- Live RPC integration test. All account/point changes roll back.
begin;
do $test$
declare actor uuid; item record; result jsonb; before_balance integer; actual text; count_items integer := 0;
begin
  select id into actor from public.profiles limit 1;
  if actor is null then raise exception 'Test needs an existing profile'; end if;
  update public.profiles set point_adjustment=point_adjustment+10000 where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  for item in select * from public.pixel_item_catalog where item_id like 'top_blouse_%' or item_id like 'bottom_bootcut_%' loop
    count_items := count_items+1;
    if not exists(select 1 from public.pixel_item_ownership where user_id=actor and item_id=item.item_id) then
      select bonus_points+point_adjustment into before_balance from public.profiles where id=actor;
      result := public.purchase_pixel_item(item.item_id);
      if result->>'ok' is distinct from 'true' or (result->>'newBalance')::integer is distinct from before_balance-item.price then raise exception 'Purchase/charge failed: %',result; end if;
    end if;
    result := public.equip_pixel_item(item.slot,item.item_id);
    if result->>'ok' is distinct from 'true' then raise exception 'Equip failed: %',result; end if;
    select to_jsonb(e)->>item.slot into actual from public.pixel_avatar_equipment e where user_id=actor;
    if actual is distinct from item.item_id then raise exception 'Equipment not persisted'; end if;
    result := public.purchase_pixel_item(item.item_id);
    if result->>'reason' is distinct from 'already_owned' then raise exception 'Duplicate accepted'; end if;
    result := public.equip_pixel_item('eyes',item.item_id);
    if result->>'reason' is distinct from 'not_found' then raise exception 'Wrong slot accepted'; end if;
  end loop;
  if count_items<>6 then raise exception 'Expected six garments, found %',count_items; end if;
end $test$;
rollback;
select 'PASS: six garment purchases/charges/equipment/duplicates/wrong-slot; all rolled back' as result;
