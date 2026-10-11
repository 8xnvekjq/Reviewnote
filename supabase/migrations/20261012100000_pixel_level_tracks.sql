-- Pixel World 레벨 분리(낚시·농사·채집) + 지수형 경험치 곡선.
-- · 다음 레벨까지 필요 XP: Lv1→2는 50, 그 뒤로 레벨마다 12%씩(정수 내림) 늘어난다. 클라이언트 logic/levels.ts와 같은 계산.
-- · 활동마다 따로 쌓인다: 물고기·잡동사니 → 낚시, 수확 → 농사, 곤충 → 채집. 낚시 난이도 감소는 낚시 레벨로 계산한다.
-- · 기존 XP는 학생별 실제 누적 XP를 기록(잡은 물고기·곤충, 수확)으로 다시 계산한 비율대로 나눠 옮긴다.
--   (XP가 생기기 전의 기록도 섞여 있어 기록만으로는 실제 합과 맞지 않는다 — 합계는 그대로 두고 비율만 쓴다.)
-- · xp 열은 세 활동의 합(호환용)으로 계속 유지한다.
begin;

alter table public.pixel_player_level
  add column if not exists fishing_xp integer not null default 0 check (fishing_xp >= 0),
  add column if not exists farming_xp integer not null default 0 check (farming_xp >= 0),
  add column if not exists gathering_xp integer not null default 0 check (gathering_xp >= 0);

-- 기존 XP 나누기(아직 나누지 않은 줄만 — 다시 돌려도 안전).
with farm as (select user_id, count(*) * 40 as est from public.pixel_farm_crops where harvested_at is not null group by user_id),
bug as (select c.user_id, sum(s.xp) as est from public.pixel_bug_catches c join public.pixel_bug_species s on s.id = c.bug_id group by c.user_id),
fish as (select c.user_id, round(sum(case s.rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 25 when 'legendary' then 60 when 'mythic' then 120 else 0 end
    * case when c.pet = 'pet_dog' then 1.1 else 1 end)) as est
  from public.pixel_fish_catches c join public.pixel_fish_species s on s.id = c.species_id group by c.user_id),
junk as (select user_id, count(*) as est from public.pixel_fish_junk group by user_id),
est as (select l.user_id, l.xp, coalesce(farm.est, 0)::numeric as fa, coalesce(bug.est, 0)::numeric as bu,
    (coalesce(fish.est, 0) + coalesce(junk.est, 0))::numeric as fi
  from public.pixel_player_level l
  left join farm using (user_id) left join bug using (user_id) left join fish using (user_id) left join junk using (user_id)
  where l.fishing_xp = 0 and l.farming_xp = 0 and l.gathering_xp = 0 and l.xp > 0),
split as (select user_id, xp,
    case when fa + bu + fi = 0 then 0 else round(xp * fa / (fa + bu + fi))::int end as farming,
    case when fa + bu + fi = 0 then 0 else round(xp * bu / (fa + bu + fi))::int end as gathering
  from est)
update public.pixel_player_level l
  set farming_xp = s.farming, gathering_xp = s.gathering, fishing_xp = greatest(0, s.xp - s.farming - s.gathering)
  from split s where s.user_id = l.user_id;

-- 지수형 곡선. 반환 모양은 그대로(level, xp_into_level, xp_for_next).
create or replace function pixel_private.level_for_xp(p_xp integer)
returns table(level integer, xp_into_level integer, xp_for_next integer)
language plpgsql immutable security definer set search_path = '' as $$
declare
  max_level constant integer := 100;
  need integer := 50;
begin
  level := 1;
  xp_into_level := greatest(0, coalesce(p_xp, 0));
  while level < max_level and xp_into_level >= need loop
    xp_into_level := xp_into_level - need;
    level := level + 1;
    need := need * 112 / 100;
  end loop;
  xp_for_next := case when level = max_level then 0 else need end;
  return next;
end $$;

-- 활동별 지급. 결과의 xp/level은 그 활동의 값이다(track으로 구분).
create or replace function pixel_private.award_pixel_xp(p_user uuid, p_gained integer, p_track text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_before integer; v_xp integer; v_old record; v_new record;
begin
  if p_user is distinct from auth.uid() or p_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_track not in ('fishing', 'farming', 'gathering') then raise exception 'unknown xp track %', p_track; end if;
  insert into public.pixel_player_level(user_id) values (p_user) on conflict do nothing;
  select case p_track when 'fishing' then fishing_xp when 'farming' then farming_xp else gathering_xp end
    into v_before from public.pixel_player_level where user_id = p_user for update;
  update public.pixel_player_level set
      xp = xp + p_gained,
      fishing_xp = fishing_xp + case when p_track = 'fishing' then p_gained else 0 end,
      farming_xp = farming_xp + case when p_track = 'farming' then p_gained else 0 end,
      gathering_xp = gathering_xp + case when p_track = 'gathering' then p_gained else 0 end,
      updated_at = now()
    where user_id = p_user
    returning case p_track when 'fishing' then fishing_xp when 'farming' then farming_xp else gathering_xp end into v_xp;
  select * into v_old from pixel_private.level_for_xp(v_before);
  select * into v_new from pixel_private.level_for_xp(v_xp);
  return jsonb_build_object('gained', p_gained, 'xp', v_xp, 'level', v_new.level, 'leveledUp', v_new.level > v_old.level, 'track', p_track);
end $$;
revoke all on function pixel_private.award_pixel_xp(uuid, integer, text) from public, anon, authenticated;

-- 예전 2인자 호출이 남아 있어도 낚시로 쌓이게(아래에서 호출부를 모두 바꾼다).
create or replace function pixel_private.award_pixel_xp(p_user uuid, p_gained integer)
returns jsonb language sql security definer set search_path = '' as $$
  select pixel_private.award_pixel_xp(p_user, p_gained, 'fishing');
$$;

-- 맨 위 값은 낚시 레벨(낚시 화면 호환), tracks에 세 활동을 모두 담는다.
create or replace function pixel_private.get_pixel_level()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); r public.pixel_player_level%rowtype; v_max record; v_tracks jsonb := '{}'::jsonb;
  v_track text; v_xp integer; v_level record;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into r from public.pixel_player_level where user_id = u;
  select * into v_max from pixel_private.level_for_xp(2147483647);
  foreach v_track in array array['fishing', 'farming', 'gathering'] loop
    v_xp := coalesce(case v_track when 'fishing' then r.fishing_xp when 'farming' then r.farming_xp else r.gathering_xp end, 0);
    select * into v_level from pixel_private.level_for_xp(v_xp);
    v_tracks := v_tracks || jsonb_build_object(v_track, jsonb_build_object('xp', v_xp, 'level', v_level.level,
      'xpIntoLevel', v_level.xp_into_level, 'xpForNext', v_level.xp_for_next));
  end loop;
  return (v_tracks->'fishing') || jsonb_build_object('maxLevel', v_max.level, 'tracks', v_tracks);
end $$;

-- 지급 호출부와 낚시 난이도의 레벨 읽기를 활동별로 바꾼다. 함수 본문 전체를 옮겨 적지 않고, 바꿀 한 줄만
-- 정확히 찾아 바꾼다(찾지 못하면 실패 — 조용히 넘어가지 않는다). 이미 바뀌었으면 건너뛴다.
do $$
declare
  patch record; v_def text;
begin
  for patch in select * from (values
    ('pixel_private.farm_action(integer,text,bigint)', 'award_pixel_xp(u, 40)', 'award_pixel_xp(u, 40, ''farming'')'),
    ('pixel_private.finish_pixel_cast(uuid,boolean)', 'award_pixel_xp(u, 1)', 'award_pixel_xp(u, 1, ''fishing'')'),
    ('pixel_private.finish_pixel_cast(uuid,boolean)', 'award_pixel_xp(u, v_xp)', 'award_pixel_xp(u, v_xp, ''fishing'')'),
    ('public.finish_bug_catch(uuid,boolean)', 'award_pixel_xp(u,b.xp)', 'award_pixel_xp(u,b.xp,''gathering'')'),
    ('pixel_private.start_pixel_cast(text,text,text,integer)', '(select xp from public.pixel_player_level where user_id=u)',
      '(select fishing_xp from public.pixel_player_level where user_id=u)')
  ) as t(sig, find, repl) loop
    v_def := pg_get_functiondef(patch.sig::regprocedure);
    if position(patch.repl in v_def) > 0 then continue; end if;
    if position(patch.find in v_def) = 0 then raise exception 'level track patch: % not found in %', patch.find, patch.sig; end if;
    execute replace(v_def, patch.find, patch.repl);
  end loop;
end $$;
commit;
