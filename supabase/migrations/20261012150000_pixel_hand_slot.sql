-- Pixel World 손 칸(장착)과 잠자리 업적(2026-10-12).
-- · 손에는 하나만 든다: 'rod'(낚싯대 — pixel_rod_equipment가 고른 것, 없으면 기본 낚싯대), 'net'(잠자리채), 'bare'(맨손).
--   줄이 없으면 'rod' — 예전처럼 낚싯대를 든 상태로 시작한다.
-- · 잠자리채를 들어야 잠자리를 잡고(start_bug_catch), 잠자리채를 들면 낚시를 못 한다(start_pixel_cast).
-- · 맨손 낚시: 난이도 +0.5, 속도 ×0.8(입질 기다림·최소 릴 시간이 25% 길어진다). 기본 낚싯대는 예전과 같다(난이도 0, 속도 1).
--   난이도는 최대 5(클라이언트 릴 게임도 5에서 자른다 — 서버 최소 릴 시간과 어긋나지 않게).
-- · 잠자리 업적: 새 규칙(2026-10-12 00:00 KST) 이후 잡은 별5만 센다.
--   잠자리 박사: 도감 5종 완성 + 별5 1마리 → 가방 30kg. 잠자리 명인: 별5 10마리 → 가방 60kg.
begin;

create table if not exists public.pixel_hand_equipment (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hand text not null check (hand in ('rod', 'net', 'bare')),
  updated_at timestamptz not null default now()
);
alter table public.pixel_hand_equipment enable row level security;
create policy own_read on public.pixel_hand_equipment for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.pixel_hand_equipment from anon, authenticated;
grant select on public.pixel_hand_equipment to authenticated;

create table if not exists public.pixel_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
alter table public.pixel_achievements enable row level security;
create policy own_read on public.pixel_achievements for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.pixel_achievements from anon, authenticated;
grant select on public.pixel_achievements to authenticated;

create or replace function pixel_private.hand_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select hand from public.pixel_hand_equipment where user_id = p_user), 'rod');
$$;

create or replace function pixel_private.hand_summary(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'hand', pixel_private.hand_of(p_user),
    'rod', jsonb_build_object('id', r.id, 'tier', coalesce(r.tier, 0)),
    'netOwned', exists (select 1 from public.pixel_item_ownership where user_id = p_user and item_id = 'tool_net'),
    'rods', coalesce((select jsonb_agg(f.id order by f.tier) from pixel_private.fish_rods f
      join public.pixel_item_ownership o on o.item_id = f.id and o.user_id = p_user), '[]'::jsonb))
  from (select 1) one left join pixel_private.fish_rods r on r.id = pixel_private.fish_active_rod(p_user);
$$;

-- 업적 규칙. 새 규칙 이후 잡은 별5 수와 도감 종류 수로 판단한다.
create or replace function pixel_private.bug_achievement_state(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'star5', (select count(*) from public.pixel_bug_catches c join public.pixel_bug_species s on s.id = c.bug_id
      where c.user_id = p_user and s.stars = 5 and c.caught_at >= timestamptz '2026-10-12 00:00+09'),
    'species', (select count(distinct bug_id) from public.pixel_bug_catches where user_id = p_user),
    'speciesTotal', (select count(*) from public.pixel_bug_species),
    'earned', coalesce((select jsonb_agg(achievement_id order by earned_at, achievement_id) from public.pixel_achievements
      where user_id = p_user and achievement_id like 'bug_%'), '[]'::jsonb));
$$;

-- 새로 이룬 업적을 기록하고, 이번 거래에서 얻은 것을 돌려준다.
create or replace function pixel_private.check_bug_achievements(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s jsonb := pixel_private.bug_achievement_state(p_user);
begin
  if (s->>'star5')::int >= 1 and (s->>'species')::int >= (s->>'speciesTotal')::int then
    insert into public.pixel_achievements(user_id, achievement_id) values (p_user, 'bug_doctor') on conflict do nothing;
  end if;
  if (s->>'star5')::int >= 10 then
    insert into public.pixel_achievements(user_id, achievement_id) values (p_user, 'bug_master') on conflict do nothing;
  end if;
  return coalesce((select jsonb_agg(achievement_id order by achievement_id) from public.pixel_achievements
    where user_id = p_user and achievement_id like 'bug_%' and earned_at = now()), '[]'::jsonb);
end $$;

create or replace function pixel_private.bag_capacity(p_user uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.pixel_achievements where user_id = p_user and achievement_id = 'bug_master') then 60.0
    when exists (select 1 from public.pixel_achievements where user_id = p_user and achievement_id = 'bug_doctor') then 30.0
    else 20.0 end;
$$;
revoke all on function pixel_private.hand_of(uuid), pixel_private.hand_summary(uuid), pixel_private.bug_achievement_state(uuid),
  pixel_private.check_bug_achievements(uuid), pixel_private.bag_capacity(uuid) from public, anon, authenticated;

-- 손에 들기. null = 맨손, 'rod_basic' = 기본 낚싯대, 'rod_*' = 산 낚싯대, 'tool_net' = 잠자리채.
create or replace function public.equip_pixel_hand(p_item_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); v_hand text; v_rod jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_item_id is null then v_hand := 'bare';
  elsif p_item_id = 'tool_net' then
    if not exists (select 1 from public.pixel_item_ownership where user_id = u and item_id = 'tool_net') then
      return jsonb_build_object('ok', false, 'reason', 'not_owned');
    end if;
    v_hand := 'net';
  else
    v_rod := pixel_private.equip_pixel_rod(case when p_item_id = 'rod_basic' then null else p_item_id end);
    if not (v_rod->>'ok')::boolean then return v_rod; end if;
    v_hand := 'rod';
  end if;
  insert into public.pixel_hand_equipment(user_id, hand, updated_at) values (u, v_hand, now())
    on conflict (user_id) do update set hand = excluded.hand, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true) || pixel_private.hand_summary(u);
end $$;

create or replace function public.get_pixel_bag() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return pixel_private.bag_summary(auth.uid()) || pixel_private.hand_summary(auth.uid());
end $$;
revoke all on function public.equip_pixel_hand(text), public.get_pixel_bag() from public, anon, authenticated;
grant execute on function public.equip_pixel_hand(text), public.get_pixel_bag() to authenticated;

-- 기존 함수는 정확히 그 부분만 바꾼다(못 찾으면 실패, 이미 바뀌었으면 그대로).
do $$
declare patch record; v_def text;
begin
  for patch in select * from (values
    -- 옷장·거북이 상점에서 낚싯대를 고르면 손에도 낚싯대를 든다.
    ('pixel_private.equip_pixel_rod(text)',
     E'  return jsonb_build_object(''ok'', true, ''rod''',
     E'  insert into public.pixel_hand_equipment(user_id, hand, updated_at) values (u, ''rod'', now())\n  on conflict (user_id) do update set hand = excluded.hand, updated_at = excluded.updated_at;\n  return jsonb_build_object(''ok'', true, ''rod'''),
    -- 잠자리채를 들고 있으면 낚시하지 않는다(미끼를 쓰기 전에 거절).
    ('pixel_private.start_pixel_cast(text,text,text,integer)',
     E'  if p_spot between 0 and 3 then\n',
     E'  if pixel_private.hand_of(u) = ''net'' then return jsonb_build_object(''ok'', false, ''reason'', ''net_equipped''); end if;\n  if p_spot between 0 and 3 then\n'),
    -- 맨손: 낚싯대 효과 없이 난이도 +0.5, 속도 ×0.8.
    ('pixel_private.start_pixel_cast(text,text,text,integer)',
     E'    v_speed := v_rod.speed; v_down := v_rod.difficulty_down; v_bonus := v_rod.rare_bonus;\n  end if;\n',
     E'    v_speed := v_rod.speed; v_down := v_rod.difficulty_down; v_bonus := v_rod.rare_bonus;\n  end if;\n  if pixel_private.hand_of(u) = ''bare'' then v_rod := null; v_speed := 0.8; v_down := -0.5; v_bonus := 0; end if;\n'),
    ('pixel_private.start_pixel_cast(text,text,text,integer)',
     E'  if v_fish.rarity = ''mythic'' then v_difficulty := 5; end if;',
     E'  v_difficulty := least(5, v_difficulty);\n  if v_fish.rarity = ''mythic'' then v_difficulty := 5; end if;'),
    -- 잠자리는 잠자리채를 손에 들어야 잡는다.
    ('public.start_bug_catch(text)',
     E'  return jsonb_build_object(''ok'',false,''reason'',''no_net'');\n end if;\n',
     E'  return jsonb_build_object(''ok'',false,''reason'',''no_net'');\n end if;\n if pixel_private.hand_of(u) <> ''net'' then return jsonb_build_object(''ok'',false,''reason'',''net_not_equipped''); end if;\n'),
    ('public.get_bug_state()',
     E'''album'',album);',
     E'''album'',album) || jsonb_build_object(''hand'',pixel_private.hand_of(u),''achievements'',pixel_private.bug_achievement_state(u));'),
    -- 잡으면 업적을 먼저 확인해 가방 용량이 바로 반영되게 한다.
    ('public.finish_bug_catch(uuid,boolean)',
     E'v_points := pixel_private.bag_add(u, ''bug'', b.id);',
     E'perform pixel_private.check_bug_achievements(u);\n v_points := pixel_private.bag_add(u, ''bug'', b.id);'),
    ('public.finish_bug_catch(uuid,boolean)',
     E'''points'',v_points);',
     E'''points'',v_points,''achievements'',coalesce((select jsonb_agg(achievement_id order by achievement_id) from public.pixel_achievements where user_id=u and achievement_id like ''bug_%'' and earned_at=now()),''[]''::jsonb));'),
    ('pixel_private.bag_summary(uuid)',
     E'''capacity'', 20.0,',
     E'''capacity'', pixel_private.bag_capacity(p_user),')
  ) as t(sig, find, repl) loop
    v_def := pg_get_functiondef(patch.sig::regprocedure);
    if position(patch.repl in v_def) > 0 then continue; end if;
    if position(patch.find in v_def) = 0 then raise exception 'hand slot patch: target not found in % (%)', patch.sig, left(patch.find, 40); end if;
    execute replace(v_def, patch.find, patch.repl);
  end loop;
end $$;
commit;
