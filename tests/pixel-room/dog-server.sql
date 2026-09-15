-- Run as database administrator; every mutation is rolled back, including purchase.
begin;
do $$
declare a uuid; b uuid; result jsonb; before_balance integer; after_balance integer; denied boolean;
begin
  select id into a from public.profiles where greatest(0,bonus_points+point_adjustment)>=200
    and not exists(select 1 from public.pixel_item_ownership o where o.user_id=profiles.id and o.item_id='pet_dog') limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_item_ownership o where o.user_id=profiles.id and o.item_id='pet_dog') limit 1;
  if a is null or b is null then raise exception 'Two eligible test profiles required'; end if;
  select greatest(0,bonus_points+point_adjustment) into before_balance from public.profiles where id=a;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  result := public.purchase_pixel_item('pet_dog');
  if result->>'ok'<>'true' then raise exception 'purchase failed: %',result; end if;
  if (result->>'newBalance')::int <> before_balance-200 then raise exception 'wrong price'; end if;
  result := public.purchase_pixel_item('pet_dog');
  if result->>'reason'<>'already_owned' then raise exception 'duplicate purchase accepted'; end if;
  insert into public.pixel_pet_equipment(user_id,active_pet) values(a,'pet_dog') on conflict(user_id) do update set active_pet=excluded.active_pet;
  if not exists(select 1 from public.pixel_pet_equipment where user_id=a and active_pet='pet_dog') then raise exception 'active readback failed'; end if;
  update public.pixel_pet_equipment set active_pet=null where user_id=a;
  update public.pixel_pet_equipment set active_pet='pet_dog' where user_id=a;
  execute 'reset role';
  select greatest(0,bonus_points+point_adjustment) into after_balance from public.profiles where id=a;
  if after_balance<>before_balance-200 then raise exception 'duplicate debit'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.pixel_pet_equipment where user_id=a) then raise exception 'cross-user read'; end if;
  denied := false;
  begin
    insert into public.pixel_pet_equipment(user_id,active_pet) values(b,'pet_dog') on conflict(user_id) do update set active_pet=excluded.active_pet;
  exception when foreign_key_violation then denied:=true; end;
  if not denied then raise exception 'unowned pet accepted'; end if;
  denied := false;
  begin
    insert into public.pixel_pet_equipment(user_id,active_pet) values(a,null) on conflict(user_id) do update set active_pet=null;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'cross-user write accepted'; end if;
  execute 'reset role';
  execute 'set local role anon';
  denied := false;
  begin perform 1 from public.pixel_pet_equipment; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anonymous read accepted'; end if;
  execute 'reset role';
end $$;
select 'PASS purchase/debit/dedup, activation, ownership FK, cross-user RLS, anonymous denial; rollback follows' as result;
rollback;
