-- 주간 토마토 대회. 새 테이블은 필요 없다 — pixel_farm_crops의 submitted_at/size_score/status
-- (지난 라운드에서 이미 추가됨)만으로 "이번 주(KST 월요일 00:00 ~ 다음 월요일 00:00) 학생별
-- 최고 크기"를 매번 즉시 계산한다. 크롭 행은 절대 삭제/수정되지 않으므로 과거 주 데이터도 항상
-- 그대로 보존돼 있다 — p_week_start 파라미터로 임의의 과거 주도 같은 방식으로 재계산할 수 있게
-- 미리 대비해 뒀다(이번 라운드의 UI는 이번 주만 보여주지만, 나중에 과거 주 조회 화면을 붙일 때
-- 스키마 변경이 필요 없다). 순위 보상/시즌제/참가비/거래는 이번에 추가하지 않는다(요청대로).
--
-- 지난 라운드의 get_top_submitted_crop(전체 기간 통틀어 단일 최고 1개)을 대체한다 — 유일한
-- 소비자였던 CropExhibit.tsx가 이번에 새 RPC로 바뀌므로 여기서 정리한다.
drop function if exists public.get_top_submitted_crop();
drop function if exists pixel_private.get_top_submitted_crop();

-- 순위는 RANK()로 계산한다(ROW_NUMBER 아님) — 동점자는 같은 순위를 공유하고 그다음 순위가
-- 인원수만큼 건너뛴다(올림픽 메달 방식과 동일: 공동 1위 2명 다음은 3위). 상위 3"위"에 해당하는
-- 모든 행을 보여주므로 동점이면 3개보다 많이 나올 수 있다 — 억지로 한 명만 고르지 않는다.
-- 공개되는 건 순위/크기/표시명뿐이다: user_id도, 이메일도, 다른 학생의 복습/오답 데이터도 이
-- 함수를 거쳐서는 전혀 나가지 않는다(COALESCE(nickname, display_name) 표시명은 이미 주간 복습
-- 랭킹에서 cross-student로 공개해 온 것과 같은 값 — get_top_submitted_crop과 동일한 판단).
create or replace function pixel_private.get_weekly_crop_contest(p_week_start timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  u uuid := auth.uid();
  v_week_start timestamptz;
  v_week_end timestamptz;
  result jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  -- weekly_leaderboard와 동일한 KST 월요일 기준 이중 timezone() 관용구(그 마이그레이션에 적힌
  -- naive/timestamptz 비교 버그를 다시 만들지 않기 위해 그대로 재사용). p_week_start가 주어지면
  -- 그 주의 월요일로 스냅한다 — 화요일 등 임의 시각을 넘겨도 절반 주가 잘리지 않는다.
  v_week_start := timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', coalesce(p_week_start, now()))));
  v_week_end := v_week_start + interval '7 days';

  with weekly as (
    select c.user_id, max(c.size_score) as best_size
      from public.pixel_farm_crops c
     where c.status = 'submitted' and c.submitted_at >= v_week_start and c.submitted_at < v_week_end
     group by c.user_id
  ),
  ranked as (
    select w.user_id, w.best_size, rank() over (order by w.best_size desc) as rnk
      from weekly w
  ),
  top_rows as (
    select r.rnk, r.best_size,
      coalesce(nullif(trim(p.nickname), ''), nullif(trim(p.display_name), ''), '이름 없는 농부') as label
      from ranked r
      join public.profiles p on p.id = r.user_id
     where r.rnk <= 3
     order by r.rnk, r.user_id
     limit 10
  ),
  mine as (
    select r.best_size, r.rnk from ranked r where r.user_id = u
  )
  select jsonb_build_object(
    'weekStart', v_week_start,
    'top', coalesce(
      (select jsonb_agg(jsonb_build_object('rank', rnk, 'sizeScore', best_size, 'submitterLabel', label)) from top_rows),
      '[]'::jsonb
    ),
    'mine', jsonb_build_object(
      'sizeScore', (select best_size from mine),
      'rank', (select rnk from mine),
      'participantCount', (select count(*) from ranked)
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function pixel_private.get_weekly_crop_contest(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function pixel_private.get_weekly_crop_contest(timestamptz) to authenticated;

create or replace function public.get_weekly_crop_contest(p_week_start timestamptz default null)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  select pixel_private.get_weekly_crop_contest(p_week_start);
$function$;

revoke all on function public.get_weekly_crop_contest(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.get_weekly_crop_contest(timestamptz) to authenticated;

do $verify_weekly_contest_surface$
begin
  if has_function_privilege('anon', 'public.get_weekly_crop_contest(timestamptz)', 'EXECUTE') then
    raise exception 'Anonymous role can execute get_weekly_crop_contest';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'pixel_private') and p.proname = 'get_top_submitted_crop'
  ) then
    raise exception 'get_top_submitted_crop should have been dropped, replaced by get_weekly_crop_contest';
  end if;
end;
$verify_weekly_contest_surface$;
