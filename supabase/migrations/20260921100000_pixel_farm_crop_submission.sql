-- 수확물 출품/전시. pixel_farm_crops를 그대로 재사용한다(새 테이블 없음) — 컬럼 3개만 추가:
--   status         : 'stored' -> 'submitted'로 넓힌다(향후 'sold'/'exhibited'도 CHECK만 넓히면 됨)
--   submitted_at   : 출품 시각
--   reward_points  : 그 시점에 지급된 보상(재계산 방지용 — 나중에 공식이 바뀌어도 과거 기록은 안 변함)
--
-- 두 방향 다 DB 레벨 CHECK로 잠근다(RPC 로직에만 기대지 않음):
--   1) submitted면 반드시 harvested_at이 있어야 한다 — 자라는 중인 크롭은 출품될 수 없다.
--      (참고: 현재 status 컬럼은 plant 시점 INSERT에도 DEFAULT 'stored'가 그대로 찍힌다 — 수확 전
--      에도 status='stored'인 채로 존재하는, 이전 라운드부터 있던 사소한 상태다. fetchHarvestedCrops/
--      get_pixel_farm 등 모든 소비자가 이미 harvested_at으로 걸러서 무해했지만, 이번에 status만
--      보고 'submitted'로 넘어갈 수 있는 통로가 새로 생기므로 이 CHECK로 명시적으로 막아 둔다.)
--   2) stored인 동안은 submitted_at/reward_points가 절대 채워지지 않는다.
alter table public.pixel_farm_crops
  drop constraint pixel_farm_crops_status_check;
alter table public.pixel_farm_crops
  add constraint pixel_farm_crops_status_check check (status in ('stored', 'submitted'));

alter table public.pixel_farm_crops
  add column submitted_at timestamptz,
  add column reward_points integer;

alter table public.pixel_farm_crops
  add constraint pixel_farm_crops_submitted_requires_harvest
    check (status <> 'submitted' or harvested_at is not null);
alter table public.pixel_farm_crops
  add constraint pixel_farm_crops_stored_has_no_submission
    check (status <> 'stored' or (submitted_at is null and reward_points is null));
alter table public.pixel_farm_crops
  add constraint pixel_farm_crops_reward_points_range
    check (reward_points is null or (reward_points between 0 and 200));

-- 출품 보상 = 기본 10P + size_score(10~100) 비례 최대 40P => 총 14~50P. Pixel World 상점가(25P
-- 최저가 상의/화분 ~ 120P대 헤어/가구, 200P 강아지/침대)를 기준으로, 인플레 없이 "몇 번 부지런히
-- 수확하면 원하는 상품 하나" 정도 되도록 맞췄다. 클라이언트(farmModel.ts의 computeSubmitReward)와
-- 정확히 같은 공식 — 서버가 유일한 권위지만 양쪽을 동기화해서 클라이언트가 출품 전 미리보기로
-- 보여주는 값과 실제 지급액이 항상 일치한다.
--
-- 원자성: 크롭 행을 FOR UPDATE로 잠그고 status='stored'(+harvested_at is not null)일 때만
-- 진행한다 — 두 번째 호출은 첫 번째가 커밋된 뒤 같은 행을 다시 읽어 status<>'stored'를 보고
-- 그대로 거부하므로 재시도/중복 클릭이 두 번째 보상을 만들 수 없다(act_pixel_farm의 harvest
-- 분기와 동일한 잠금 패턴). 크롭 상태 갱신과 포인트 지급이 같은 함수 호출 = 같은 트랜잭션 안에서
-- 함께 일어나므로 "출품만 되고 포인트가 안 들어오는" 반쪽 실패가 있을 수 없다(예외 시 전체 롤백).
-- 포인트는 bonus_points가 아니라 point_adjustment에 더한다 — bonus_points는 "진짜 복습 활동"
-- 신호로 크롭의 reviewGained 계산에 쓰이므로(20260918110000 참고), 여기서 건드리면 지금 자라는
-- 중인 다른 크롭들의 복습 보너스 확률까지 오염된다.
create or replace function pixel_private.submit_farm_crop(p_crop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  u uuid := auth.uid();
  c public.pixel_farm_crops%rowtype;
  v_reward integer;
  t timestamptz;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_crop_id is null then raise exception 'Invalid crop id' using errcode = '22023'; end if;

  select * into c from public.pixel_farm_crops where id = p_crop_id and user_id = u for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', '작물을 찾을 수 없어요.');
  end if;
  if c.harvested_at is null or c.status <> 'stored' then
    return jsonb_build_object('ok', false,
      'reason', case when c.status = 'submitted' then 'already_submitted' else 'not_stored' end,
      'message', '이미 출품했거나 아직 보관 중인 작물이 아니에요.');
  end if;

  t := clock_timestamp();
  v_reward := 10 + round(c.size_score * 0.4);

  update public.pixel_farm_crops
     set status = 'submitted', submitted_at = t, reward_points = v_reward
   where id = c.id and status = 'stored';

  update public.profiles
     set point_adjustment = coalesce(point_adjustment, 0) + v_reward
   where id = u;

  return jsonb_build_object('ok', true, 'cropId', c.id, 'rewardPoints', v_reward,
    'submittedAt', t, 'status', 'submitted');
end;
$function$;

revoke all on function pixel_private.submit_farm_crop(uuid) from public, anon, authenticated, service_role;
grant execute on function pixel_private.submit_farm_crop(uuid) to authenticated;

create or replace function public.submit_farm_crop(p_crop_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path to ''
as $function$
  select pixel_private.submit_farm_crop(p_crop_id);
$function$;

revoke all on function public.submit_farm_crop(uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_farm_crop(uuid) to authenticated;

-- 광장 전시: 출품된 것 중 가장 큰 작물 1개 + 안전한 표시명만 반환한다. 실명(email/username)이
-- 아니라 weekly_leaderboard/recent_peer_activities가 이미 다른 학생에게 노출해 온 것과 똑같은
-- COALESCE(nickname, display_name) 표시명을 그대로 재사용 — 이 앱에서 "cross-student로 공개해도
-- 되는 이름"으로 이미 검증된 값이다. 광장의 실시간 캐릭터 이동 레이어(PlazaPlayerState)가 닉네임을
-- 전혀 안 보내는 것과는 별개 결정이다: 그건 "지금 어디서 움직이고 있는지"라 더 엄격하게 다루고,
-- 여기는 "누가 무엇을 출품했는지"라는 정적인 명예의 게시판이라 리더보드와 같은 수준으로 다룬다.
-- 둘 다 비어 있으면(둘 다 null이거나 공백) 완전 익명 라벨로 폴백한다. 동점이면 먼저 출품된 쪽이
-- 유지된다 — "더 큰 작물이 나와야만 교체"를 자연스럽게 만족한다.
create or replace function pixel_private.get_top_submitted_crop()
returns table (
  crop_id uuid,
  crop_type text,
  size_score smallint,
  submitted_at timestamptz,
  submitter_label text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select c.id, c.crop_type, c.size_score, c.submitted_at,
    coalesce(nullif(trim(p.nickname), ''), nullif(trim(p.display_name), ''), '이름 없는 농부')
    from public.pixel_farm_crops c
    join public.profiles p on p.id = c.user_id
   where (select auth.uid()) is not null
     and c.status = 'submitted'
   order by c.size_score desc, c.submitted_at asc
   limit 1;
$function$;

revoke all on function pixel_private.get_top_submitted_crop() from public, anon, authenticated, service_role;
grant execute on function pixel_private.get_top_submitted_crop() to authenticated;

create or replace function public.get_top_submitted_crop()
returns table (
  crop_id uuid,
  crop_type text,
  size_score smallint,
  submitted_at timestamptz,
  submitter_label text
)
language sql
stable
security invoker
set search_path to ''
as $function$
  select * from pixel_private.get_top_submitted_crop();
$function$;

revoke all on function public.get_top_submitted_crop() from public, anon, authenticated, service_role;
grant execute on function public.get_top_submitted_crop() to authenticated;

do $verify_submission_surface$
begin
  if has_function_privilege('anon', 'public.submit_farm_crop(uuid)', 'EXECUTE') then
    raise exception 'Anonymous role can execute submit_farm_crop';
  end if;
  if has_function_privilege('anon', 'public.get_top_submitted_crop()', 'EXECUTE') then
    raise exception 'Anonymous role can execute get_top_submitted_crop';
  end if;
  if has_table_privilege('authenticated', 'public.pixel_farm_crops', 'UPDATE') then
    raise exception 'authenticated role can write pixel_farm_crops directly';
  end if;
end;
$verify_submission_surface$;
