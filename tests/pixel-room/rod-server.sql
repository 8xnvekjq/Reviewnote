-- 낚싯대(v4) 실서버 검증: 구매(차감만)·장착/해제·소유 확인·캐스트에 효과 기록·피티 건너뛰기. 모든 변경은 롤백한다.
begin;
do $$
declare a uuid; b uuid; before_points integer; r jsonb; c jsonb; k record; denied boolean;
begin
  select id into a from public.profiles where greatest(0,bonus_points+point_adjustment)>=1000
    and not exists(select 1 from public.pixel_item_ownership where user_id=profiles.id and item_id like 'rod_%') limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_item_ownership where user_id=profiles.id and item_id='rod_gold') limit 1;
  if a is null or b is null then raise exception 'Eligible test profiles needed'; end if;
  select greatest(0,bonus_points+point_adjustment) into before_points from public.profiles where id=a;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';

  -- 장착 전: 기본 낚싯대
  if public.get_pixel_fishing_state()->'rod' <> '{"id": null, "tier": 0}'::jsonb then raise exception 'default rod %', public.get_pixel_fishing_state()->'rod'; end if;
  r:=public.equip_pixel_rod('rod_gold');
  if r->>'reason'<>'not_owned' then raise exception 'unowned rod equipped %',r; end if;
  r:=public.equip_pixel_rod('top_sage');
  if r->>'reason'<>'not_found' then raise exception 'non-rod accepted %',r; end if;

  -- 구매: 정확히 가격만큼 차감, 중복 구매 막힘
  r:=public.purchase_pixel_item('rod_gold');
  if r->>'ok'<>'true' or (r->>'newBalance')::int<>before_points-700 then raise exception 'rod purchase/price %',r; end if;
  r:=public.purchase_pixel_item('rod_gold');
  if r->>'reason'<>'already_owned' then raise exception 'duplicate rod purchase %',r; end if;

  r:=public.equip_pixel_rod('rod_gold');
  if r->'rod' <> '{"id": "rod_gold", "tier": 4}'::jsonb then raise exception 'equip %',r; end if;
  if public.get_pixel_fishing_state()->'rod' <> '{"id": "rod_gold", "tier": 4}'::jsonb then raise exception 'state rod'; end if;

  -- 직접 쓰기는 막힘
  denied:=false;
  begin update public.pixel_rod_equipment set rod_id=null where user_id=a; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'direct rod equipment write allowed'; end if;

  -- 캐스트: 새 필드(덧붙이기), 효과가 행에 기록됨
  c:=public.start_pixel_cast(null);
  if c->>'ok'<>'true' or (c->>'speed')::numeric<>1.35 or c->'rod'->>'id'<>'rod_gold' or jsonb_typeof(c->'trophy')<>'boolean'
     or c->>'castId' is null or c->>'biteDelayMs' is null or c->>'difficulty' is null or c->>'pattern' is null then raise exception 'cast %',c; end if;
  if (c->>'biteDelayMs')::int > round(5000/1.35) or (c->>'difficulty')::numeric < 1 then raise exception 'speed/difficulty %',c; end if;
  -- 중간에 해제해도 이 캐스트 값은 그대로
  r:=public.equip_pixel_rod(null);
  if r->'rod' <> '{"id": null, "tier": 0}'::jsonb then raise exception 'unequip %',r; end if;
  execute 'reset role';
  select * into k from public.pixel_fish_casts where id=(c->>'castId')::uuid;
  if k.rod_id<>'rod_gold' or k.rod_speed<>1.35 or k.difficulty<>(c->>'difficulty')::numeric then raise exception 'cast row %',row_to_json(k); end if;
  execute 'set local role authenticated';
  r:=public.finish_pixel_cast((c->>'castId')::uuid, true);   -- 너무 빠름 → landed=false
  if r->>'landed'<>'false' then raise exception 'early land accepted %',r; end if;

  -- 다른 학생은 남의 낚싯대를 장착할 수 없다
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  r:=public.equip_pixel_rod('rod_gold');
  if r->>'reason'<>'not_owned' then raise exception 'other user equipped %',r; end if;
  if exists(select 1 from public.pixel_rod_equipment where user_id=a) then raise exception 'RLS leaked another user row'; end if;
  execute 'reset role';
end $$;
select 'PASS rod purchase exact debit, duplicate blocked, equip/unequip/not_owned/not_found, state.rod, direct write denied, cast fields + row effects, early finish rejected, RLS; rollback follows' as result;
rollback;
