-- 맵을 다시 들어오면 잠자리가 안 나오던 문제(2026-10-12): 앞 방문에서 받은 잠자리 2마리가 서버에 살아 있어(2분)
-- spawn_bug가 'full'로 거절했다. next_bug_spawn은 아직 살아 있는 내 잠자리 중 지금 화면에 없는 것(p_holding 밖)을
-- 먼저 돌려준다 — 같은 잠자리라 다시 뽑기는 안 된다. 없을 때만 새로 정한다(최대 2마리, 20초에 한 번).
-- 지금 앱이 쓰는 spawn_bug(text, uuid)는 그대로 둔다(겹치는 이름이면 PostgREST가 고르지 못한다). 아무것도 지우지 않는다.
create or replace function public.next_bug_spawn(p_scene text, p_release uuid, p_holding uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz; s public.pixel_bug_spawns%rowtype; b public.pixel_bug_species%rowtype; v_id uuid; roll double precision;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bug:' || u::text, 0));
  if p_scene is null or p_scene not in ('yard', 'plaza', 'river') then return jsonb_build_object('ok', false, 'reason', 'error'); end if;
  t := clock_timestamp();
  if p_release is not null then
    update public.pixel_bug_spawns set used_at = t where id = p_release and user_id = u and used_at is null;
  end if;
  -- 아직 살아 있는데 화면에 없는 내 잠자리(맵을 다시 들어온 경우)를 먼저 돌려준다.
  update public.pixel_bug_spawns set scene = p_scene
    where id = (select id from public.pixel_bug_spawns where user_id = u and used_at is null and expires_at > t
                  and id <> all(coalesce(p_holding, '{}')) order by created_at limit 1)
    returning * into s;
  if s.id is not null then
    select * into b from public.pixel_bug_species where id = s.bug_id;
    return jsonb_build_object('ok', true, 'spawnId', s.id, 'bugId', b.id, 'stars', b.stars);
  end if;
  if (select count(*) from public.pixel_bug_spawns where user_id = u and used_at is null and expires_at > t) >= 2 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  if exists (select 1 from public.pixel_bug_spawns where user_id = u and created_at > t - interval '20 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'wait');
  end if;
  select random() * sum(weight) into roll from public.pixel_bug_species;
  select x.* into b from public.pixel_bug_species x join
    (select id, sum(weight) over (order by sort_order, id) cumulative from public.pixel_bug_species) w using (id)
    where w.cumulative > roll order by x.sort_order, x.id limit 1;
  insert into public.pixel_bug_spawns(user_id, bug_id, scene, created_at, expires_at)
    values (u, b.id, p_scene, t, t + interval '2 minutes') returning id into v_id;
  return jsonb_build_object('ok', true, 'spawnId', v_id, 'bugId', b.id, 'stars', b.stars);
end $$;
revoke all on function public.next_bug_spawn(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.next_bug_spawn(text, uuid, uuid[]) to authenticated;
