begin;
create or replace function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  k public.pixel_fish_casts%rowtype;
  s public.pixel_fish_species%rowtype;
  v_prev_count integer;
  v_prev_best numeric;
  v_difficulty numeric;
  v_xp integer;
  v_percentile numeric;
  v_xp_gain jsonb;
  v_points jsonb;
  v_spot pixel_private.fish_spot_state%rowtype;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  delete from public.pixel_fish_casts where id = p_cast_id and user_id = u returning * into k;
  if k.id is not null and k.pity then
    insert into pixel_private.fish_pity_state (user_id, skip_next) values (u, true)
    on conflict (user_id) do update set skip_next = true;
  end if;
  if k.id is null or k.expires_at <= now() then return jsonb_build_object('ok', false); end if;
  select * into s from public.pixel_fish_species where id = k.species_id;
  v_difficulty := coalesce(k.difficulty, pixel_private.fish_difficulty(k.species_id, k.length_cm));
  if not coalesce(p_landed, false) or clock_timestamp() < k.created_at + make_interval(secs => (k.bite_delay_ms + (1500 + (v_difficulty - 1) * 375) / k.rod_speed) / 1000.0) then
    return jsonb_build_object('ok', true, 'landed', false);
  end if;
  if k.pity then update pixel_private.fish_pity_state set skip_next = false where user_id = u; end if;
  if k.junk is not null then
    insert into public.pixel_fish_junk(user_id, junk_id) values (u, k.junk);
    v_xp_gain := pixel_private.award_pixel_xp(u, 1);
    if k.junk = 'junk_coin' then
      v_points := pixel_private.award_game_points(u, 1, 'junk');
    else
      select jsonb_build_object('awarded',0,'todayEarned',coalesce(d.earned,0),'cap',50,'capped',coalesce(d.earned,0)>=50)
        into v_points from (select 1) x left join pixel_private.game_point_days d
          on d.user_id=u and d.kst_date=(now() at time zone 'Asia/Seoul')::date;
    end if;
    return jsonb_build_object('points', v_points, 'ok', true, 'landed', true, 'junk', k.junk, 'remaining', -1, 'xpGain', v_xp_gain);
  end if;
  -- 잡동사니·도망·만료는 위에서 끝나므로 실제 물고기만 포인트를 소모한다.
  if k.spot_bonus and k.spot_id between 0 and 3 then
    update pixel_private.fish_spot_state
      set "left"=greatest(0,"left"-1),
          ready_at=case when "left"=1 then now()+make_interval(secs => 180+random()*120) else ready_at end
      where user_id=u and spot_id=k.spot_id returning * into v_spot;
  end if;
  select count(*), max(length_cm) into v_prev_count, v_prev_best
    from public.pixel_fish_catches where user_id = u and species_id = k.species_id;
  insert into public.pixel_fish_catches (user_id, species_id, length_cm, kst_date, phase, weather, pet)
  values (u, k.species_id, k.length_cm, k.kst_date, k.phase, k.weather, k.pet);

  select round(100.0 * count(*) filter (where length_cm >= k.length_cm) / count(*), 1)
    into v_percentile from public.pixel_fish_catches where species_id = k.species_id;

  v_xp := (case s.rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 25 when 'mythic' then 120 else 60 end) + case when k.trophy then 15 else 0 end;
  -- 강아지: 낚시 경험치 +10%(던질 때 데리고 있던 펫 기준, 반올림).
  if k.pet = 'pet_dog' then v_xp := round(v_xp * 1.1); end if;
  v_xp_gain := pixel_private.award_pixel_xp(u, v_xp);

  v_points := pixel_private.award_game_points(u,
    case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'legendary' then 15 when 'mythic' then 40 end,
    case when s.rarity in ('legendary','mythic') then 'full' else 'normal' end);
  return jsonb_build_object('points', v_points, 'ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', -1, 'xpGain', v_xp_gain, 'percentile', v_percentile)
    || case when v_spot.spot_id is not null then jsonb_build_object('spot', jsonb_build_object('id', v_spot.spot_id, 'left', v_spot."left", 'readyAt', v_spot.ready_at)) else '{}'::jsonb end;
end $function$;



-- 등급별 크기 점수로 학생 챔피언을 고르고, 게시판에서만 선생님을 보여 준다.
create or replace function pixel_private.fish_tier_leaders(p_week_start timestamptz, p_teacher boolean default false)
returns table(user_id uuid, rarity text, species_id text, length_cm numeric, score numeric, teacher boolean, reward integer)
language sql stable security definer set search_path = '' as $$
  select distinct on (s.rarity) c.user_id, s.rarity, c.species_id, c.length_cm,
    round((c.length_cm-s.min_cm)/coalesce(nullif(s.max_cm-s.min_cm,0),1)*100,1),
    exists(select 1 from private.app_admins a where a.user_id=c.user_id),
    case when exists(select 1 from private.app_admins a where a.user_id=c.user_id) then 0
      else case s.rarity when 'mythic' then 150 when 'legendary' then 100 when 'rare' then 60 when 'uncommon' then 40 else 25 end end
  from public.pixel_fish_catches c join public.pixel_fish_species s on s.id=c.species_id
  where c.caught_at>=p_week_start and c.caught_at<p_week_start+interval '7 days'
    -- 선생님 기록은 게시판(p_teacher)에서도 무지개 잉어만(2026-10-11 결정), 보상 정산에서는 아예 제외.
    and (not exists(select 1 from private.app_admins a where a.user_id=c.user_id) or (p_teacher and c.species_id='rainbow_koi'))
  order by s.rarity, exists(select 1 from private.app_admins a where a.user_id=c.user_id),
    (c.length_cm-s.min_cm)/coalesce(nullif(s.max_cm-s.min_cm,0),1) desc, c.caught_at, c.id;
$$;

create table if not exists pixel_private.weekly_settlements (
  week_start timestamptz primary key, settled_at timestamptz not null default now()
);
create table if not exists public.pixel_weekly_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start timestamptz not null,
  kind text not null check(kind in ('fish_tier','crop_rank','crop_entry')),
  label text not null, points integer not null check(points>0),
  created_at timestamptz not null default now(), seen_at timestamptz,
  reward_key text not null,
  unique(week_start, user_id, reward_key)
);
create index if not exists pixel_weekly_rewards_unseen on public.pixel_weekly_rewards(user_id,week_start) where seen_at is null;
alter table pixel_private.weekly_settlements enable row level security;
alter table public.pixel_weekly_rewards enable row level security;
revoke all on pixel_private.weekly_settlements,public.pixel_weekly_rewards from public,anon,authenticated,service_role;

create or replace function pixel_private.settle_pixel_week(p_week_start timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  w timestamptz := timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',p_week_start)));
  r record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if w is null or w+interval '7 days'>now() then raise exception 'Week is not complete' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_week:'||extract(epoch from w)::text,0));
  if exists(select 1 from pixel_private.weekly_settlements where week_start=w) then return; end if;
  insert into public.pixel_weekly_rewards(user_id,week_start,kind,label,points,reward_key)
    select l.user_id,w,'fish_tier', '지난주 '||case l.rarity when 'mythic' then '★★★★★' when 'legendary' then '★★★★' when 'rare' then '★★★' when 'uncommon' then '★★' else '★' end
      ||' 챔피언 · '||s.name||' '||l.length_cm::text||'cm ('||l.score::text||'%)',l.reward,'fish:'||l.rarity
    from pixel_private.fish_tier_leaders(w,false) l join public.pixel_fish_species s on s.id=l.species_id
    on conflict do nothing;
  -- 기존 토마토 대회와 같은 공동 순위 규칙, 관리자 제외 후 순위를 다시 매긴다.
  with weekly as (
    select c.user_id,max(c.size_score) best_size from public.pixel_farm_crops c
    where c.status='submitted' and c.submitted_at>=w and c.submitted_at<w+interval '7 days'
      and not exists(select 1 from private.app_admins a where a.user_id=c.user_id)
    group by c.user_id
  ), ranked as (select user_id,rank() over(order by best_size desc) rnk from weekly)
  insert into public.pixel_weekly_rewards(user_id,week_start,kind,label,points,reward_key)
    select user_id,w,case when rnk<=3 then 'crop_rank' else 'crop_entry' end,
      case when rnk<=3 then '지난주 토마토 대회 '||rnk::text||'등' else '지난주 토마토 대회 참가상' end,
      case rnk when 1 then 100 when 2 then 70 when 3 then 50 else 10 end,'crop'
    from ranked on conflict do nothing;
  perform set_config('reviewnote.pixel_rpc','true',true);
  for r in select user_id,sum(points)::integer points from public.pixel_weekly_rewards where week_start=w group by user_id loop
    update public.profiles set point_adjustment=point_adjustment+r.points where id=r.user_id;
  end loop;
  insert into pixel_private.weekly_settlements(week_start) values(w);
end $$;

create or replace function public.get_pixel_rewards()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid:=auth.uid(); w timestamptz:=timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '7 days';
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pixel_private.settle_pixel_week(w);
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'weekStart',week_start,'kind',kind,'label',label,'points',points) order by week_start,created_at,id)
    from public.pixel_weekly_rewards where user_id=u and seen_at is null),'[]'::jsonb);
end $$;
create or replace function public.ack_pixel_rewards(p_ids uuid[])
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.pixel_weekly_rewards set seen_at=now() where user_id=u and id=any(p_ids) and seen_at is null;
  return true;
end $$;
create or replace function pixel_private.get_class_fish_board()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  v_week_start timestamptz := timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now())));
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'champions', coalesce((select jsonb_agg(jsonb_build_object('rarity',rarity,'speciesId',species_id,'lengthCm',length_cm,'score',score,'animal',private.user_animal_face(user_id),'teacher',teacher,'reward',reward) order by case rarity when 'mythic' then 1 when 'legendary' then 2 when 'rare' then 3 when 'uncommon' then 4 else 5 end) from pixel_private.fish_tier_leaders(v_week_start,true)), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', b.species_id, 'lengthCm', b.length_cm,
               'animal', private.user_animal_face(b.user_id),
               'teacher', b.teacher,
               'caughtAt', b.caught_at) order by b.length_cm desc, b.caught_at)
        from (
          select * from (
            select distinct on (k.species_id) k.species_id, k.length_cm, k.user_id, k.caught_at, k.teacher
              from (
                select c.species_id, c.length_cm, c.user_id, c.caught_at,
                       exists (select 1 from private.app_admins ad where ad.user_id = c.user_id) as teacher
                  from public.pixel_fish_catches c
                 where c.caught_at >= v_week_start and c.caught_at < v_week_start + interval '7 days'
              ) k
             where not k.teacher or k.species_id = 'rainbow_koi'
             order by k.species_id, k.length_cm desc, k.caught_at
          ) best order by length_cm desc, caught_at limit 10
        ) b), '[]'::jsonb),
    'classSpecies', (select count(distinct k.species_id) from public.pixel_fish_catches k
                      where not exists (select 1 from private.app_admins ad where ad.user_id = k.user_id)));
end $function$;

revoke all on function pixel_private.fish_tier_leaders(timestamptz,boolean),pixel_private.settle_pixel_week(timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.get_pixel_rewards(),public.ack_pixel_rewards(uuid[]),pixel_private.get_class_fish_board(),pixel_private.finish_pixel_cast(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_pixel_rewards(),public.ack_pixel_rewards(uuid[]),pixel_private.get_class_fish_board(),pixel_private.finish_pixel_cast(uuid,boolean) to authenticated;
commit;
