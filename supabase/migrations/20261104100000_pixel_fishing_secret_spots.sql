-- Extend the installed cast implementation so subsequent rod/bait/hand/level patches survive.
-- No location claim is trusted beyond the declared spot; precise position is not server observable.
begin;
insert into public.pixel_fish_species(id,name,rarity,phases,weather,min_cm,max_cm,shadow,sort_order) values
 ('eddy_dragon','소용돌이 용어','mythic',null,null,180,600,'L',15),
 ('bridge_moon_eel','그늘 달장어','legendary',array['night'],null,60,140,'L',16),
 ('rain_reed_koi','빗방울 갈대잉어','legendary',null,array['rain'],35,85,'M',17)
on conflict(id) do update set name=excluded.name,rarity=excluded.rarity,phases=excluded.phases,weather=excluded.weather,
 min_cm=excluded.min_cm,max_cm=excluded.max_cm,shadow=excluded.shadow,sort_order=excluded.sort_order;

create or replace function pixel_private.secret_fish_allowed(p_species text,p_spot text,p_duck boolean)
returns boolean language sql immutable set search_path='' as $$
 select case p_species
 when 'eddy_dragon' then coalesce(p_duck and p_spot='secret_whirlpool',false)
 when 'bridge_moon_eel' then coalesce(p_duck and p_spot='secret_bridge_shade',false)
 when 'rain_reed_koi' then coalesce(p_duck and p_spot='secret_reed_isle',false)
 else true end;
$$;
revoke all on function pixel_private.secret_fish_allowed(text,text,boolean) from public,anon,authenticated,service_role;

-- Generate a six-argument implementation from the current four-argument body.
-- Fail closed on unexpected source instead of silently dropping existing validation.
do $patch$
declare d text; header text; source regprocedure;
begin
 source := coalesce(to_regprocedure('pixel_private.start_pixel_cast(text,text,text,integer,text,boolean)'),
                    to_regprocedure('pixel_private.start_pixel_cast(text,text,text,integer)'));
 d := pg_get_functiondef(source);
 if position('p_secret_spot text' in d)>0 then return; end if;
 header := split_part(d,E'\n',1);
 if position('p_spot integer' in header)=0 or position('  v_spot_bonus boolean := false;' in d)=0
 or position('from public.pixel_fish_species s' in d)=0 or position('from public.pixel_fish_species t' in d)=0 then
   raise exception 'Secret spots: unexpected installed cast body';
 end if;
 d := replace(d,header,regexp_replace(header,'\)$',', p_secret_spot text DEFAULT NULL::text, p_mounted_duck boolean DEFAULT false)'));
 d := replace(d,'  v_spot_bonus boolean := false;',E'  v_spot_bonus boolean := false;\n  v_secret_duck boolean := false;');
 d := replace(d,'  v_pet := pixel_private.fish_active_pet(u);',
 E'  v_secret_duck := coalesce(p_mounted_duck,false) and pixel_private.fish_active_pet(u) = ''pet_duck'' and p_pet = ''pet_duck'';\n  if p_secret_spot is not null and (p_secret_spot not in (''secret_whirlpool'',''secret_bridge_shade'',''secret_reed_isle'') or not coalesce(v_secret_duck,false)) then raise exception ''Invalid secret fishing spot or mount'' using errcode=''22023''; end if;\n  v_pet := pixel_private.fish_active_pet(u);');
 -- All selection branches, including pity and fallback, must exclude other secret pools.
 d := replace(d,'from public.pixel_fish_species s',
 'from (select * from public.pixel_fish_species where pixel_private.secret_fish_allowed(id,p_secret_spot,v_secret_duck)) s');
 d := replace(d,'from public.pixel_fish_species t',
 'from (select * from public.pixel_fish_species where pixel_private.secret_fish_allowed(id,p_secret_spot,v_secret_duck)) t');
 d := replace(d,'else 0.5 end as w','else case when s.id = ''eddy_dragon'' then 0.05 else 0.5 end end as w');
 -- Phase/weather are still filtered by the original fish_clock-based queries, including admin overrides.
 execute d;
end $patch$;

-- Replace both old endpoints with one defaulted signature (avoids PostgREST overload ambiguity).
drop function if exists public.start_pixel_cast(text,text,text,integer);
drop function if exists pixel_private.start_pixel_cast(text,text,text,integer);
create or replace function public.start_pixel_cast(p_pet text,p_override_clock text default null,
 p_override_weather text default null,p_spot integer default null,p_secret_spot text default null,p_mounted_duck boolean default false)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select pixel_private.start_pixel_cast(p_pet,p_override_clock,p_override_weather,p_spot,p_secret_spot,p_mounted_duck);
$$;
revoke all on function pixel_private.start_pixel_cast(text,text,text,integer,text,boolean),
 public.start_pixel_cast(text,text,text,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function pixel_private.start_pixel_cast(text,text,text,integer,text,boolean),
 public.start_pixel_cast(text,text,text,integer,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
