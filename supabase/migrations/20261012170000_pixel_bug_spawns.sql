-- 잠자리가 나타날 때 서버가 종류를 미리 정한다(2026-10-12). 그래야 날아다니는 잠자리의 별을 화면에 보여 주고
-- 별3 이상은 사람이 다가오면 도망가게 할 수 있다. 클라이언트는 종류를 고를 수 없다.
-- · spawn_bug(scene, release): 내 잠자리 한 마리를 정한다. 살아 있는 건 최대 2마리, 새로 정하는 건 20초에 한 번.
--   release: 날아가 버린(또는 잡힌) 자리의 이전 잠자리를 놓아 준다(내 것만).
-- · start_bug_catch(scene, spawn): 그 잠자리로 잡기를 시작한다(한 번 쓰면 사라짐). 예전 1인자 함수는 그대로 둔다.
begin;

create table if not exists public.pixel_bug_spawns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bug_id text not null references public.pixel_bug_species(id),
  scene text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);
create index if not exists pixel_bug_spawns_user on public.pixel_bug_spawns(user_id);
alter table public.pixel_bug_spawns enable row level security;
revoke all on public.pixel_bug_spawns from anon, authenticated;

create or replace function public.spawn_bug(p_scene text, p_release uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz; b public.pixel_bug_species%rowtype; v_id uuid; roll double precision;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text, 0));
  if p_scene is null or p_scene not in ('yard', 'plaza', 'river') then return jsonb_build_object('ok', false, 'reason', 'error'); end if;
  t := clock_timestamp();
  delete from public.pixel_bug_spawns where user_id = u and (expires_at <= t or id = p_release);
  if (select count(*) from public.pixel_bug_spawns where user_id = u) >= 2 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  if exists (select 1 from public.pixel_bug_spawns where user_id = u and created_at > t - interval '20 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'wait');
  end if;
  select random() * sum(weight) into roll from public.pixel_bug_species;
  select s.* into b from public.pixel_bug_species s join
    (select id, sum(weight) over (order by sort_order, id) cumulative from public.pixel_bug_species) w using (id)
    where w.cumulative > roll order by s.sort_order, s.id limit 1;
  insert into public.pixel_bug_spawns(user_id, bug_id, scene, created_at, expires_at)
    values (u, b.id, p_scene, t, t + interval '2 minutes') returning id into v_id;
  return jsonb_build_object('ok', true, 'spawnId', v_id, 'bugId', b.id, 'stars', b.stars);
end $$;

create or replace function public.start_bug_catch(p_scene text, p_spawn uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz; b public.pixel_bug_species%rowtype; v_id uuid; v_bug text;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text, 0));
  if not exists (select 1 from public.pixel_item_ownership where user_id = u and item_id = 'tool_net') then
    return jsonb_build_object('ok', false, 'reason', 'no_net');
  end if;
  if pixel_private.hand_of(u) <> 'net' then return jsonb_build_object('ok', false, 'reason', 'net_not_equipped'); end if;
  if p_scene is null or p_scene not in ('yard', 'plaza', 'river') then return jsonb_build_object('ok', false, 'reason', 'error'); end if;
  t := clock_timestamp();
  delete from public.pixel_bug_attempts where user_id = u and expires_at < t;
  if exists (select 1 from public.pixel_bug_attempts where user_id = u)
     or exists (select 1 from pixel_private.bug_start_throttle where user_id = u and started_at > t - interval '2 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;
  -- 대기 검사 뒤에 쓴다: 거절돼도 잠자리는 남는다.
  delete from public.pixel_bug_spawns where id = p_spawn and user_id = u and expires_at > t returning bug_id into v_bug;
  if v_bug is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  select * into b from public.pixel_bug_species where id = v_bug;
  insert into public.pixel_bug_attempts(user_id, bug_id, difficulty, scene, created_at, expires_at)
    values (u, b.id, b.stars, p_scene, t, t + interval '15 seconds') returning id into v_id;
  insert into pixel_private.bug_start_throttle values (u, t) on conflict (user_id) do update set started_at = excluded.started_at;
  return jsonb_build_object('ok', true, 'catchId', v_id, 'bugId', b.id, 'difficulty', b.stars);
end $$;
revoke all on function public.spawn_bug(text, uuid), public.start_bug_catch(text, uuid) from public, anon, authenticated;
grant execute on function public.spawn_bug(text, uuid), public.start_bug_catch(text, uuid) to authenticated;
commit;
