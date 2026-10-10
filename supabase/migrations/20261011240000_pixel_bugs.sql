begin;

-- 잠자리채는 소유만 하면 사용할 수 있다.
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_category_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_category_check check (category in ('avatar','furniture','pet','rod','bait','tool'));
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_slot_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_slot_check check (slot in ('top','bottom','shoes','hair','eyes','furniture','pet','rod','bait','tool'));
insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable)
values ('tool_net','tool','tool',150,'tool_net','잠자리채',1,false)
on conflict(item_id) do update set category=excluded.category,slot=excluded.slot,price=excluded.price,asset_key=excluded.asset_key,display_name=excluded.display_name,tier=excluded.tier,stackable=excluded.stackable;

create table if not exists public.pixel_bug_species (
  id text primary key, name text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','legendary','mythic')),
  stars integer not null check (stars between 1 and 5),
  points integer not null check (points >= 0), xp integer not null check (xp >= 0),
  weight integer not null check (weight > 0), sort_order integer not null
);
insert into public.pixel_bug_species values
 ('dragonfly_red','고추잠자리','common',1,2,5,50,0),
 ('dragonfly_wheat','밀잠자리','uncommon',2,3,10,28,1),
 ('damselfly','실잠자리','rare',3,6,25,14,2),
 ('dragonfly_king','왕잠자리','legendary',4,15,60,6,3),
 ('dragonfly_gold','황금 잠자리','mythic',5,40,120,2,4)
on conflict(id) do update set name=excluded.name,rarity=excluded.rarity,stars=excluded.stars,points=excluded.points,xp=excluded.xp,weight=excluded.weight,sort_order=excluded.sort_order;

create table if not exists public.pixel_bug_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 bug_id text not null references public.pixel_bug_species(id),
 difficulty integer not null check (difficulty between 1 and 5),
 scene text not null check (scene in ('yard','plaza','river')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '15 seconds'
);
create index if not exists pixel_bug_attempts_bug_idx on public.pixel_bug_attempts(bug_id);
create table if not exists public.pixel_bug_catches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 bug_id text not null references public.pixel_bug_species(id),
 scene text not null check (scene in ('yard','plaza','river')),
 caught_at timestamptz not null default clock_timestamp()
);
create index if not exists pixel_bug_catches_album_idx on public.pixel_bug_catches(user_id,bug_id,caught_at);
create index if not exists pixel_bug_catches_bug_idx on public.pixel_bug_catches(bug_id);
create table if not exists pixel_private.bug_start_throttle (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 started_at timestamptz not null
);
alter table public.pixel_bug_species enable row level security;
alter table public.pixel_bug_attempts enable row level security;
alter table public.pixel_bug_catches enable row level security;
alter table pixel_private.bug_start_throttle enable row level security;
revoke all on public.pixel_bug_species,public.pixel_bug_attempts,public.pixel_bug_catches,pixel_private.bug_start_throttle from public,anon,authenticated,service_role;

create or replace function public.start_bug_catch(p_scene text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz; b public.pixel_bug_species%rowtype; v_id uuid; roll double precision;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text,0));
 if not exists(select 1 from public.pixel_item_ownership where user_id=u and item_id='tool_net') then
  return jsonb_build_object('ok',false,'reason','no_net');
 end if;
 if p_scene is null or p_scene not in ('yard','plaza','river') then return jsonb_build_object('ok',false,'reason','error'); end if;
 t := clock_timestamp();
 delete from public.pixel_bug_attempts where user_id=u and expires_at<t;
 if exists(select 1 from public.pixel_bug_attempts where user_id=u)
 or exists(select 1 from pixel_private.bug_start_throttle where user_id=u and started_at>t-interval '2 seconds') then
  return jsonb_build_object('ok',false,'reason','pending');
 end if;
 select random()*sum(weight) into roll from public.pixel_bug_species;
 select s.* into b from public.pixel_bug_species s join
  (select id,sum(weight) over(order by sort_order,id) cumulative from public.pixel_bug_species) w using(id)
  where w.cumulative>roll order by s.sort_order,s.id limit 1;
 insert into public.pixel_bug_attempts(user_id,bug_id,difficulty,scene,created_at,expires_at)
 values(u,b.id,b.stars,p_scene,t,t+interval '15 seconds') returning id into v_id;
 insert into pixel_private.bug_start_throttle values(u,t) on conflict(user_id) do update set started_at=excluded.started_at;
 return jsonb_build_object('ok',true,'catchId',v_id,'bugId',b.id,'difficulty',b.stars);
end $$;

create or replace function public.finish_bug_catch(p_catch_id uuid,p_caught boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz; a public.pixel_bug_attempts%rowtype; b public.pixel_bug_species%rowtype; v_new boolean; v_xp jsonb; v_points jsonb;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text,0));
 t := clock_timestamp();
 delete from public.pixel_bug_attempts where id=p_catch_id and user_id=u returning * into a;
 if not found or t>a.expires_at or t>a.created_at+interval '15 seconds' then return jsonb_build_object('ok',false); end if;
 if p_caught is distinct from true or t<a.created_at+interval '0.6 seconds' then return jsonb_build_object('ok',true,'caught',false); end if;
 select * into b from public.pixel_bug_species where id=a.bug_id;
 v_new := not exists(select 1 from public.pixel_bug_catches where user_id=u and bug_id=b.id);
 insert into public.pixel_bug_catches(user_id,bug_id,scene,caught_at) values(u,b.id,a.scene,t);
 v_xp := pixel_private.award_pixel_xp(u,b.xp);
 v_points := pixel_private.award_game_points(u,b.points,case when b.stars>=4 then 'full' else 'normal' end);
 return jsonb_build_object('ok',true,'caught',true,'bugId',b.id,'isNew',v_new,'xpGain',v_xp,'points',v_points);
end $$;

create or replace function public.get_bug_state()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); album jsonb;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text,0));
 select coalesce(jsonb_agg(jsonb_build_object('bugId',a.bug_id,'count',a.n,'firstAt',a.first_at) order by s.sort_order,s.id),'[]'::jsonb)
 into album from (select bug_id,count(*) n,min(caught_at) first_at from public.pixel_bug_catches where user_id=u group by bug_id) a
 join public.pixel_bug_species s on s.id=a.bug_id;
 return jsonb_build_object('netOwned',exists(select 1 from public.pixel_item_ownership where user_id=u and item_id='tool_net'),'album',album);
end $$;
revoke all on function public.start_bug_catch(text),public.finish_bug_catch(uuid,boolean),public.get_bug_state() from public,anon,authenticated,service_role;
grant execute on function public.start_bug_catch(text),public.finish_bug_catch(uuid,boolean),public.get_bug_state() to authenticated;
commit;
