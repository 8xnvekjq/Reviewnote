-- 서로 도와주기: 학생이 오답에 '도움 요청'을 걸면 다른 학생이 필기(리플레이)로 풀이를 보내고,
-- 요청자가 👍 좋아요 / 🤔 이해 안 돼요로 답하면 서버가 포인트를 준다. 서로 익명(동물 얼굴 + 칭호).
--
-- 보안: 학생은 두 표를 직접 읽거나 쓰지 못하고 아래 함수로만 쓴다(상대 UUID·실명이 나가지 않게).
-- 포인트는 give_help_feedback 안에서만 profiles.point_adjustment에 더한다(클라이언트 지급 없음).
-- 짜고 치기 방지: 도우미 보상 하루 3번(KST), 같은 두 학생 사이 하루 1번, 요청자 보상 하루 5번.
--
-- 용량: 필기는 DB가 아니라 비공개 버킷 help-solutions에 gzip JSON으로 둔다(풀이 하나 수십 KB).
-- DB에는 작은 줄만. 파일 정리는 help-cleanup Edge Function(하루 한 번 pg_cron)이 한다:
--   선생님이 지운 풀이, 닫힌 지 7일 지난 요청의 '좋아요 아닌' 풀이, 완성·삭제된 오답의 모든 풀이,
--   제출되지 않은 업로드(하루 지난 고아 파일). 1년 지난 정리 끝난 줄은 지운다.
begin;

-- ── 표 ──────────────────────────────────────────────────────────────────────
create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  -- 오답을 지우면 null(파일 정리 대상이 되도록 줄은 남긴다)
  mistake_id uuid references public.mistakes(id) on delete set null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  solution_count integer not null default 0,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists help_requests_one_open on public.help_requests(mistake_id) where status = 'open';
create index if not exists help_requests_open_list on public.help_requests(solution_count, created_at) where status = 'open';
create index if not exists help_requests_requester on public.help_requests(requester_id, created_at desc);

create table if not exists public.help_solutions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.help_requests(id) on delete cascade,
  helper_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  stroke_count integer not null check (stroke_count >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  bytes integer not null check (bytes >= 0),
  created_at timestamptz not null default now(),
  feedback text check (feedback in ('like', 'unclear')),
  feedback_at timestamptz,
  helper_reward integer not null default 0,
  requester_reward integer not null default 0,
  removed_at timestamptz,
  file_deleted_at timestamptz,
  unique (request_id, helper_id)
);
create index if not exists help_solutions_request on public.help_solutions(request_id);
create index if not exists help_solutions_helper_feedback on public.help_solutions(helper_id, feedback_at);
create index if not exists help_solutions_files_pending on public.help_solutions(created_at) where file_deleted_at is null;

alter table public.help_requests enable row level security;
alter table public.help_solutions enable row level security;
revoke all on public.help_requests, public.help_solutions from public, anon, authenticated;

-- ── 저장 공간 ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('help-solutions', 'help-solutions', false, 1048576, array['application/gzip', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 파일을 읽을 수 있는 사람: 그 풀이를 쓴 도우미, 그 요청을 건 학생, 선생님. 지운 풀이는 선생님만.
create or replace function private.can_read_help_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_current_user_admin()) or exists (
    select 1 from public.help_solutions s join public.help_requests r on r.id = s.request_id
    where s.storage_path = p_name and s.removed_at is null and s.file_deleted_at is null
      and (s.helper_id = (select auth.uid()) or r.requester_id = (select auth.uid())));
$$;
revoke all on function private.can_read_help_file(text) from public, anon, authenticated;
grant execute on function private.can_read_help_file(text) to authenticated;

drop policy if exists "도움 풀이 올리기" on storage.objects;
create policy "도움 풀이 올리기" on storage.objects for insert to authenticated
with check (bucket_id = 'help-solutions'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json\.gz$'));
drop policy if exists "도움 풀이 읽기" on storage.objects;
create policy "도움 풀이 읽기" on storage.objects for select to authenticated
using (bucket_id = 'help-solutions' and (select private.can_read_help_file(name)));

-- ── 공용 조각 ───────────────────────────────────────────────────────────────
create or replace function private.help_kst_day(p_at timestamptz) returns date
language sql stable set search_path = '' as $$ select (p_at at time zone 'Asia/Seoul')::date; $$;

create or replace function private.help_label(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('face', private.user_animal_face(p_user), 'title', p.equipped_title, 'grade', p.school_grade)
  from public.profiles p where p.id = p_user;
$$;

create or replace function private.help_add_points(p_user uuid, p_amount integer) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set point_adjustment = coalesce(point_adjustment, 0) + p_amount where id = p_user;
$$;

-- 오답이 완성됐는가(복습 3칸 모두 O 또는 복습체크 O)
create or replace function private.help_mistake_mastered(p_mistake public.mistakes) returns boolean
language sql immutable set search_path = '' as $$
  select p_mistake.review_check_mastered_at is not null
    or (p_mistake.reviews->>0 = 'O' and p_mistake.reviews->>1 = 'O' and p_mistake.reviews->>2 = 'O');
$$;

-- 보상받을 수 있는 계정(새로 만든 부계정으로 자기 요청을 풀어 포인트를 모으지 못하게): 만든 지 3일, 오답 5개 이상
create or replace function private.help_trusted(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = p_user and u.created_at < now() - interval '3 days')
    and (select count(*) from public.mistakes m where m.user_id = p_user) >= 5;
$$;

revoke all on function private.help_kst_day(timestamptz), private.help_label(uuid), private.help_add_points(uuid, integer),
  private.help_mistake_mastered(public.mistakes), private.help_trusted(uuid) from public, anon, authenticated;

-- ── 학생: 요청 ──────────────────────────────────────────────────────────────
create or replace function public.request_help(p_mistake_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_req public.help_requests; v_open integer;
begin
  if v_uid is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if not exists (select 1 from public.mistakes m where m.id = p_mistake_id and m.user_id = v_uid) then
    raise exception '내 오답에만 도움을 요청할 수 있어요.' using errcode = '42501';
  end if;
  select * into v_req from public.help_requests where mistake_id = p_mistake_id and status = 'open';
  if found then return jsonb_build_object('id', v_req.id, 'status', v_req.status, 'solution_count', v_req.solution_count); end if;
  select count(*) into v_open from public.help_requests where requester_id = v_uid and status = 'open';
  if v_open >= 20 then raise exception '도움 요청은 한 번에 20개까지 걸 수 있어요.'; end if;
  insert into public.help_requests(mistake_id, requester_id) values (p_mistake_id, v_uid) returning * into v_req;
  return jsonb_build_object('id', v_req.id, 'status', v_req.status, 'solution_count', 0);
end;
$$;

create or replace function public.cancel_help_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.help_requests set status = 'cancelled', closed_at = now()
  where id = p_request_id and requester_id = auth.uid() and status = 'open';
end;
$$;

-- 내 요청 상태(오답 카드 표시용): 요청 줄 + 아직 피드백하지 않은 풀이 수
create or replace function public.my_help_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'mistake_id', r.mistake_id, 'status', r.status, 'created_at', r.created_at,
    'solution_count', (select count(*) from public.help_solutions s where s.request_id = r.id and s.removed_at is null),
    'unseen_count', (select count(*) from public.help_solutions s where s.request_id = r.id and s.removed_at is null and s.feedback is null)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.help_requests r
  where r.requester_id = auth.uid() and r.mistake_id is not null
    and (r.status = 'open' or r.closed_at > now() - interval '60 days');
$$;

-- ── 학생: 도와주기 목록 ──────────────────────────────────────────────────────
create or replace function public.list_help_requests(p_limit integer default 40) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.item order by x.solution_count, x.created_at), '[]'::jsonb) from (
    select r.solution_count, r.created_at, jsonb_build_object(
      'id', r.id, 'image_url', m.image_url, 'title', m.title, 'grade', m.grade, 'chapter', m.chapter,
      'created_at', r.created_at, 'solution_count', r.solution_count,
      'requester', private.help_label(r.requester_id),
      'mine_submitted', exists (select 1 from public.help_solutions s where s.request_id = r.id and s.helper_id = auth.uid())
    ) as item
    from public.help_requests r join public.mistakes m on m.id = r.mistake_id
    where r.status = 'open' and r.requester_id <> auth.uid() and auth.uid() is not null
    order by r.solution_count, r.created_at
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) x;
$$;

-- ── 학생: 풀이 제출(파일은 먼저 help-solutions/<내 uid>/<uuid>.json.gz로 올린다) ─────────
create or replace function public.submit_help_solution(p_request_id uuid, p_storage_path text, p_stroke_count integer, p_duration_ms integer, p_bytes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_req public.help_requests; v_id uuid;
begin
  if v_uid is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select * into v_req from public.help_requests where id = p_request_id for update;
  if not found or v_req.status <> 'open' then raise exception '이미 해결됐거나 취소된 요청이에요.'; end if;
  if v_req.requester_id = v_uid then raise exception '내 요청에는 풀이를 보낼 수 없어요.'; end if;
  if p_storage_path !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json\.gz$') then
    raise exception '풀이 파일 경로가 올바르지 않아요.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'help-solutions' and o.name = p_storage_path) then
    raise exception '풀이 파일이 올라가지 않았어요. 다시 보내 주세요.';
  end if;
  if coalesce(p_stroke_count, 0) < 5 or coalesce(p_duration_ms, 0) < 20000 then
    raise exception '풀이가 너무 짧아요. 과정을 조금 더 자세히 써 주세요.';
  end if;
  insert into public.help_solutions(request_id, helper_id, storage_path, stroke_count, duration_ms, bytes)
  values (p_request_id, v_uid, p_storage_path, p_stroke_count, p_duration_ms, greatest(coalesce(p_bytes, 0), 0))
  returning id into v_id;
  update public.help_requests set solution_count = solution_count + 1 where id = p_request_id;
  return jsonb_build_object('id', v_id);
exception when unique_violation then
  raise exception '이 요청에는 이미 풀이를 보냈어요.';
end;
$$;

-- ── 학생: 내 요청에 온 풀이 ─────────────────────────────────────────────────
create or replace function public.list_help_solutions(p_request_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'storage_path', s.storage_path, 'stroke_count', s.stroke_count, 'duration_ms', s.duration_ms,
    'created_at', s.created_at, 'feedback', s.feedback, 'helper', private.help_label(s.helper_id),
    'file_available', s.file_deleted_at is null
  ) order by s.created_at), '[]'::jsonb)
  from public.help_solutions s join public.help_requests r on r.id = s.request_id
  where s.request_id = p_request_id and s.removed_at is null and r.requester_id = auth.uid();
$$;

-- 내가 보낸 풀이와 받은 피드백·포인트(도우미 알림용)
create or replace function public.my_help_given(p_limit integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.item order by x.created_at desc), '[]'::jsonb) from (
    select s.created_at, jsonb_build_object(
      'id', s.id, 'request_id', s.request_id, 'created_at', s.created_at, 'feedback', s.feedback,
      'feedback_at', s.feedback_at, 'reward', s.helper_reward, 'image_url', m.image_url,
      'requester', private.help_label(r.requester_id)
    ) as item
    from public.help_solutions s join public.help_requests r on r.id = s.request_id left join public.mistakes m on m.id = r.mistake_id
    where s.helper_id = auth.uid() and s.removed_at is null
    order by s.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x;
$$;

-- ── 학생: 피드백 = 포인트 지급(유일한 지급 경로) ───────────────────────────────
create or replace function public.give_help_feedback(p_solution_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_sol public.help_solutions; v_req public.help_requests;
  v_today date := private.help_kst_day(now());
  v_helper integer := 0; v_requester integer := 0; v_closed boolean := false;
begin
  if v_uid is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_kind not in ('like', 'unclear') then raise exception '피드백 종류가 올바르지 않아요.'; end if;
  select * into v_sol from public.help_solutions where id = p_solution_id for update;
  if not found or v_sol.removed_at is not null then raise exception '풀이를 찾을 수 없어요.'; end if;
  select * into v_req from public.help_requests where id = v_sol.request_id for update;
  if v_req.requester_id <> v_uid then raise exception '내 요청의 풀이에만 답할 수 있어요.' using errcode = '42501'; end if;
  if v_sol.feedback is not null then raise exception '이미 답한 풀이예요.'; end if;
  -- 동시에 눌러도 하루 한도를 넘지 않게 두 학생을 같은 순서로 잠근다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('help:' || least(v_sol.helper_id::text, v_uid::text), 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('help:' || greatest(v_sol.helper_id::text, v_uid::text), 0));

  -- 도우미 보상: 하루 3번, 같은 두 학생 사이 하루 1번, 두 계정 모두 믿을 수 있을 때
  if private.help_trusted(v_sol.helper_id) and private.help_trusted(v_uid) and (select count(*) from public.help_solutions s
      where s.helper_id = v_sol.helper_id and s.helper_reward > 0 and private.help_kst_day(s.feedback_at) = v_today) < 3
     and not exists (select 1 from public.help_solutions s join public.help_requests r on r.id = s.request_id
      where s.helper_id = v_sol.helper_id and r.requester_id = v_uid and s.helper_reward > 0 and private.help_kst_day(s.feedback_at) = v_today) then
    v_helper := case when p_kind = 'like' then 30 else 10 end;
  end if;
  -- 요청자 보상: 하루 5번(부계정 도우미가 푼 것은 제외)
  if private.help_trusted(v_sol.helper_id) and private.help_trusted(v_uid) and (select count(*) from public.help_solutions s join public.help_requests r on r.id = s.request_id
      where r.requester_id = v_uid and s.requester_reward > 0 and private.help_kst_day(s.feedback_at) = v_today) < 5 then
    v_requester := 5;
  end if;

  update public.help_solutions set feedback = p_kind, feedback_at = now(), helper_reward = v_helper, requester_reward = v_requester
  where id = p_solution_id;
  if v_helper > 0 then perform private.help_add_points(v_sol.helper_id, v_helper); end if;
  if v_requester > 0 then perform private.help_add_points(v_uid, v_requester); end if;
  if p_kind = 'like' and v_req.status = 'open' then
    update public.help_requests set status = 'closed', closed_at = now() where id = v_req.id;
    v_closed := true;
  end if;
  return jsonb_build_object('helper_reward', v_helper, 'requester_reward', v_requester, 'closed', v_closed);
end;
$$;

-- ── 선생님 ──────────────────────────────────────────────────────────────────
create or replace function public.admin_list_help(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_current_user_admin() then raise exception '관리자만 볼 수 있어요.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x.item order by x.created_at desc), '[]'::jsonb) from (
    select s.created_at, jsonb_build_object(
      'solution_id', s.id, 'request_id', r.id, 'created_at', s.created_at, 'request_status', r.status,
      'image_url', m.image_url, 'mistake_title', m.title, 'storage_path', s.storage_path,
      'stroke_count', s.stroke_count, 'duration_ms', s.duration_ms, 'feedback', s.feedback,
      'helper_reward', s.helper_reward, 'requester_reward', s.requester_reward,
      'removed_at', s.removed_at, 'file_available', s.file_deleted_at is null,
      'helper', jsonb_build_object('id', s.helper_id, 'name', coalesce(hp.nickname, hp.display_name, hp.email), 'face', private.user_animal_face(s.helper_id)),
      'requester', jsonb_build_object('id', r.requester_id, 'name', coalesce(rp.nickname, rp.display_name, rp.email), 'face', private.user_animal_face(r.requester_id))
    ) as item
    from public.help_solutions s join public.help_requests r on r.id = s.request_id
    left join public.mistakes m on m.id = r.mistake_id
    left join public.profiles hp on hp.id = s.helper_id left join public.profiles rp on rp.id = r.requester_id
    order by s.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) x);
end;
$$;

-- 풀이 지우기 + 그 풀이로 준 포인트 회수(파일은 정리 작업이 지운다)
create or replace function public.admin_remove_help_solution(p_solution_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sol public.help_solutions; v_req public.help_requests;
begin
  if not private.is_current_user_admin() then raise exception '관리자만 할 수 있어요.' using errcode = '42501'; end if;
  select * into v_sol from public.help_solutions where id = p_solution_id for update;
  if not found or v_sol.removed_at is not null then return jsonb_build_object('removed', false); end if;
  select * into v_req from public.help_requests where id = v_sol.request_id for update;
  update public.help_solutions set removed_at = now() where id = p_solution_id;
  update public.help_requests set solution_count = greatest(solution_count - 1, 0) where id = v_req.id;
  if v_sol.helper_reward > 0 then perform private.help_add_points(v_sol.helper_id, -v_sol.helper_reward); end if;
  if v_sol.requester_reward > 0 then perform private.help_add_points(v_req.requester_id, -v_sol.requester_reward); end if;
  -- 좋아요로 닫힌 요청이었다면 다시 연다(다른 학생이 도울 수 있게)
  if v_sol.feedback = 'like' and v_req.status = 'closed' and v_req.mistake_id is not null
     and not exists (select 1 from public.help_requests o where o.mistake_id = v_req.mistake_id and o.status = 'open') then
    update public.help_requests set status = 'open', closed_at = null where id = v_req.id;
  end if;
  return jsonb_build_object('removed', true, 'helper_clawback', v_sol.helper_reward, 'requester_clawback', v_sol.requester_reward);
end;
$$;

-- ── 정리(서비스 역할 전용: help-cleanup Edge Function이 부른다) ─────────────────
-- 1) 완성됐거나 지워진 오답의 열린 요청은 닫는다. 2) 지울 파일 목록을 돌려준다(최대 p_limit).
create or replace function private.help_cleanup_due(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_paths jsonb;
begin
  update public.help_requests r set status = 'closed', closed_at = now()
  where r.status = 'open' and (r.mistake_id is null
    or exists (select 1 from public.mistakes m where m.id = r.mistake_id and private.help_mistake_mastered(m)));

  select coalesce(jsonb_agg(x.storage_path), '[]'::jsonb) into v_paths from (
    select s.storage_path from public.help_solutions s join public.help_requests r on r.id = s.request_id
    left join public.mistakes m on m.id = r.mistake_id
    where s.file_deleted_at is null and (
      s.removed_at is not null
      or r.mistake_id is null
      or (m.id is not null and private.help_mistake_mastered(m))
      or (r.status <> 'open' and r.closed_at < now() - interval '7 days' and s.feedback is distinct from 'like'))
    order by s.created_at limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  ) x;
  return v_paths;
end;
$$;

-- 지운 파일을 표시하고, 1년 지난 정리 끝난 줄은 지운다.
create or replace function private.help_mark_files_deleted(p_paths text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.help_solutions set file_deleted_at = now() where storage_path = any(p_paths) and file_deleted_at is null;
  get diagnostics v_count = row_count;
  delete from public.help_requests r where r.status <> 'open' and r.closed_at < now() - interval '365 days'
    and not exists (select 1 from public.help_solutions s where s.request_id = r.id and s.file_deleted_at is null);
  return v_count;
end;
$$;

-- 제출되지 않은 업로드(하루 지난 파일인데 풀이 줄이 없음)
create or replace function private.help_orphan_files(p_limit integer default 200) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.name), '[]'::jsonb) from (
    select o.name from storage.objects o
    where o.bucket_id = 'help-solutions' and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.help_solutions s where s.storage_path = o.name and s.file_deleted_at is null)
    order by o.created_at limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  ) x;
$$;

-- 서비스 역할용 공개 진입점(private 스키마는 Data API에 노출하지 않는다)
create or replace function public.help_cleanup_due(p_limit integer default 200) returns jsonb
language sql security definer set search_path = '' as $$ select private.help_cleanup_due(p_limit); $$;
create or replace function public.help_mark_files_deleted(p_paths text[]) returns integer
language sql security definer set search_path = '' as $$ select private.help_mark_files_deleted(p_paths); $$;
create or replace function public.help_orphan_files(p_limit integer default 200) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.help_orphan_files(p_limit); $$;

-- ── 권한 ────────────────────────────────────────────────────────────────────
revoke all on function public.request_help(uuid), public.cancel_help_request(uuid), public.my_help_requests(),
  public.list_help_requests(integer), public.submit_help_solution(uuid, text, integer, integer, integer),
  public.list_help_solutions(uuid), public.my_help_given(integer), public.give_help_feedback(uuid, text),
  public.admin_list_help(integer), public.admin_remove_help_solution(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_help(uuid), public.cancel_help_request(uuid), public.my_help_requests(),
  public.list_help_requests(integer), public.submit_help_solution(uuid, text, integer, integer, integer),
  public.list_help_solutions(uuid), public.my_help_given(integer), public.give_help_feedback(uuid, text),
  public.admin_list_help(integer), public.admin_remove_help_solution(uuid)
  to authenticated;

revoke all on function private.help_cleanup_due(integer), private.help_mark_files_deleted(text[]), private.help_orphan_files(integer),
  public.help_cleanup_due(integer), public.help_mark_files_deleted(text[]), public.help_orphan_files(integer)
  from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.help_cleanup_due(integer), private.help_mark_files_deleted(text[]), private.help_orphan_files(integer),
  public.help_cleanup_due(integer), public.help_mark_files_deleted(text[]), public.help_orphan_files(integer)
  to service_role;

-- ── 정리 작업 열쇠·예약 ─────────────────────────────────────────────────────
-- 열쇠는 DB(private)에만 둔다: pg_cron이 읽어 help-cleanup에 보내고, 함수가 같은 값인지 확인한다.
create table if not exists private.app_settings (name text primary key, value text not null);
alter table private.app_settings enable row level security;
revoke all on private.app_settings from public, anon, authenticated;
insert into private.app_settings(name, value) values ('help_cleanup_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

create or replace function public.help_cleanup_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_settings where name = 'help_cleanup_key' and value = p_key and length(p_key) >= 32);
$$;
revoke all on function public.help_cleanup_key_ok(text) from public, anon, authenticated, service_role;
grant execute on function public.help_cleanup_key_ok(text) to service_role;

commit;

-- 하루 한 번 04:30 KST(19:30 UTC). 트랜잭션 밖에서 실행한다(운영에는 2026-10-16 적용, job 'help-solutions-cleanup').
select cron.schedule('help-solutions-cleanup', '30 19 * * *', $cmd$
  select net.http_post(
    url := 'https://wcvkmdvrowljypueucwx.supabase.co/functions/v1/help-cleanup',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cleanup-key', (select value from private.app_settings where name = 'help_cleanup_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$cmd$);
