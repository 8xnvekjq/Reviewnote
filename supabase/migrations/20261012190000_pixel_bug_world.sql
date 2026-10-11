-- 잠자리를 맵마다 서버가 기억한다(2026-10-12).
-- · 광장·강가: 모두가 같은 잠자리 8마리를 본다. 마당: 학생마다 자기 잠자리 4마리.
-- · 자리(slot)마다 한 줄. 잠자리 한 세대 = spawn_id·종류·씨앗(seed)·나타난 시각·떠나는 시각. 화면은 씨앗으로 같은 비행 경로를 계산한다.
-- · 잡히거나(caught_at) 떠나면(leave_at) 30~60초 뒤 그 자리에 새 잠자리(같은 줄을 고쳐 쓴다 — 아무것도 지우지 않는다).
-- · 맵을 나갔다 들어와도 서버의 잠자리 그대로라 리셋되지 않는다.
-- · start_world_bug_catch(scene, spawn): 먼저 시작한 한 명만 그 잠자리를 가진다(늦으면 'gone').
begin;

create table if not exists public.pixel_bug_world (
  scene text not null check (scene in ('yard', 'plaza', 'river')),
  owner uuid not null,                 -- 마당: 그 학생, 광장·강가: 00000000-0000-0000-0000-000000000000(모두)
  slot smallint not null,
  spawn_id uuid not null,
  bug_id text not null references public.pixel_bug_species(id),
  seed integer not null,
  born_at timestamptz not null,
  leave_at timestamptz not null,
  caught_at timestamptz,
  next_at timestamptz,
  primary key (scene, owner, slot)
);
alter table public.pixel_bug_world enable row level security;
revoke all on public.pixel_bug_world from anon, authenticated;

create or replace function pixel_private.roll_bug() returns text
language sql volatile security definer set search_path = '' as $$
  with r as (select random() * sum(weight) roll from public.pixel_bug_species)
  select s.id from public.pixel_bug_species s join
    (select id, sum(weight) over (order by sort_order, id) cumulative from public.pixel_bug_species) w using (id), r
   where w.cumulative > r.roll order by s.sort_order, s.id limit 1;
$$;
revoke all on function pixel_private.roll_bug() from public, anon, authenticated;

-- 지금 맵의 잠자리. 비어 있거나 다시 나올 때가 된 자리는 새 잠자리로 채운다.
create or replace function public.get_bug_world(p_scene text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); t timestamptz; v_owner uuid; v_slots int; i int; r public.pixel_bug_world%rowtype;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_scene is null or p_scene not in ('yard', 'plaza', 'river') then return jsonb_build_object('ok', false, 'reason', 'error'); end if;
  v_owner := case when p_scene = 'yard' then u else '00000000-0000-0000-0000-000000000000'::uuid end;
  v_slots := case when p_scene = 'yard' then 4 else 8 end;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bug_world:' || p_scene || ':' || v_owner::text, 0));
  t := clock_timestamp();
  for i in 0 .. v_slots - 1 loop
    select * into r from public.pixel_bug_world where scene = p_scene and owner = v_owner and slot = i;
    if not found then
      insert into public.pixel_bug_world(scene, owner, slot, spawn_id, bug_id, seed, born_at, leave_at)
        values (p_scene, v_owner, i, gen_random_uuid(), pixel_private.roll_bug(), floor(random() * 2147483647)::int,
                t, t + (45 + random() * 60) * interval '1 second');
      continue;
    end if;
    if r.next_at is null and (r.caught_at is not null or t >= r.leave_at) then
      r.next_at := coalesce(r.caught_at, r.leave_at) + (30 + random() * 30) * interval '1 second';
      update public.pixel_bug_world set next_at = r.next_at where scene = p_scene and owner = v_owner and slot = i;
    end if;
    if r.next_at is not null and t >= r.next_at then
      update public.pixel_bug_world set spawn_id = gen_random_uuid(), bug_id = pixel_private.roll_bug(),
        seed = floor(random() * 2147483647)::int, born_at = t, leave_at = t + (45 + random() * 60) * interval '1 second',
        caught_at = null, next_at = null
       where scene = p_scene and owner = v_owner and slot = i;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'serverNow', t, 'bugs', coalesce((
    select jsonb_agg(jsonb_build_object('spawnId', w.spawn_id, 'slot', w.slot, 'bugId', w.bug_id, 'stars', s.stars, 'seed', w.seed,
      'bornAt', w.born_at, 'leaveAt', w.leave_at) order by w.slot)
      from public.pixel_bug_world w join public.pixel_bug_species s on s.id = w.bug_id
     where w.scene = p_scene and w.owner = v_owner and w.caught_at is null and w.born_at <= t and w.leave_at > t), '[]'::jsonb));
end $$;

-- 그 잠자리로 잡기를 시작한다. 먼저 시작한 한 명만(잠자리 줄에 caught_at을 적는다).
create or replace function public.start_world_bug_catch(p_scene text, p_spawn uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz; v_owner uuid; b public.pixel_bug_species%rowtype; v_id uuid; v_bug text;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text, 0));
  if not exists (select 1 from public.pixel_item_ownership where user_id = u and item_id = 'tool_net') then
    return jsonb_build_object('ok', false, 'reason', 'no_net');
  end if;
  if pixel_private.hand_of(u) <> 'net' then return jsonb_build_object('ok', false, 'reason', 'net_not_equipped'); end if;
  if p_scene is null or p_scene not in ('yard', 'plaza', 'river') then return jsonb_build_object('ok', false, 'reason', 'error'); end if;
  v_owner := case when p_scene = 'yard' then u else '00000000-0000-0000-0000-000000000000'::uuid end;
  t := clock_timestamp();
  if exists (select 1 from public.pixel_bug_attempts where user_id = u and expires_at >= t)
     or exists (select 1 from pixel_private.bug_start_throttle where user_id = u and started_at > t - interval '2 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;
  update public.pixel_bug_world set caught_at = t
   where scene = p_scene and owner = v_owner and spawn_id = p_spawn and caught_at is null and born_at <= t and leave_at > t
   returning bug_id into v_bug;
  if v_bug is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  select * into b from public.pixel_bug_species where id = v_bug;
  insert into public.pixel_bug_attempts(user_id, bug_id, difficulty, scene, created_at, expires_at)
    values (u, b.id, b.stars, p_scene, t, t + interval '15 seconds')
    on conflict (user_id) do update set id = gen_random_uuid(), bug_id = excluded.bug_id, difficulty = excluded.difficulty,
      scene = excluded.scene, created_at = excluded.created_at, expires_at = excluded.expires_at
    returning id into v_id;
  insert into pixel_private.bug_start_throttle values (u, t) on conflict (user_id) do update set started_at = excluded.started_at;
  return jsonb_build_object('ok', true, 'catchId', v_id, 'bugId', b.id, 'difficulty', b.stars);
end $$;
revoke all on function public.get_bug_world(text), public.start_world_bug_catch(text, uuid) from public, anon, authenticated;
grant execute on function public.get_bug_world(text), public.start_world_bug_catch(text, uuid) to authenticated;
commit;
