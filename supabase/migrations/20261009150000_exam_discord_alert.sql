-- 시험 응시 디스코드 알림: 응시 시작·이어 풀기·제출을 선생님 디스코드 채널로 보낸다.
-- 웹훅 주소는 Vault 비밀 'discord_exam_webhook'에서만 읽는다(코드·Git에 남기지 않음). 없으면 조용히 건너뛴다.
-- 관리자 계정(private.app_admins)의 응시는 보내지 않는다. 알림이 실패해도 응시·제출은 절대 막지 않는다.
create extension if not exists pg_net;

create table if not exists private.exam_discord_notices (
  id bigint generated always as identity primary key,
  attempt_id uuid not null,
  event text not null check (event in ('start', 'resume', 'submit')),
  sent_at timestamptz not null default now()
);
create index if not exists exam_discord_notices_attempt_idx on private.exam_discord_notices (attempt_id, sent_at desc);
alter table private.exam_discord_notices enable row level security;
revoke all on table private.exam_discord_notices from public, anon, authenticated;

-- 점수 표기: 만점이 100점이 아닌 내신·학습지는 100점 환산(소수 첫째 자리, .0 생략) + 원점수 (src/features/exam/ui/scoreDisplay.ts와 같은 규칙).
create or replace function private.exam_discord_message(p_attempt_id uuid, p_event text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_name text;
  v_title text;
  v_kind text;
  v_era text;
  v_max numeric;
  v_mode text;
  v_score numeric;
  v_grade int;
  v_correct int;
  v_total int;
  v_answered int;
  v_question_count int;
  v_time_ms bigint;
  v_student uuid;
  v_when text;
  v_score_text text;
  v_grade_text text;
  v_secs bigint;
begin
  select a.student_id, a.mode, a.score, a.estimated_grade, a.correct_count, a.total_count, a.total_time_ms,
         p.title, p.kind, p.practice_era, p.max_score, p.question_count,
         coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(pr.nickname), ''),
           nullif(split_part(coalesce(pr.email, u.email, ''), '@', 1), ''), left(a.student_id::text, 8))
    into v_student, v_mode, v_score, v_grade, v_correct, v_total, v_time_ms,
         v_title, v_kind, v_era, v_max, v_question_count, v_name
    from public.exam_attempts a
    join public.exam_papers p on p.id = a.paper_id
    left join public.profiles pr on pr.id = a.student_id
    left join auth.users u on u.id = a.student_id
   where a.id = p_attempt_id;

  if v_student is null or exists (select 1 from private.app_admins ad where ad.user_id = v_student) then
    return null;
  end if;

  v_name := regexp_replace(v_name, '\s+', ' ', 'g');
  v_when := to_char(now() at time zone 'Asia/Seoul', 'FMMM/FMDD HH24:MI');

  if p_event = 'start' then
    return format('🟢 **%s** 응시 시작 — %s (%s · %s문항) · %s',
      v_name, v_title, case v_mode when 'real' then '실전' else '자유' end, coalesce(v_question_count::text, '?'), v_when);
  elsif p_event = 'resume' then
    select count(*) filter (where i.answer is not null)::int, count(*)::int into v_answered, v_total
      from public.exam_attempt_items i where i.attempt_id = p_attempt_id;
    return format('🔄 **%s** 이어 풀기 — %s (답 %s/%s) · %s', v_name, v_title, v_answered, v_total, v_when);
  elsif p_event = 'submit' then
    if v_era is null and v_kind in ('school', 'worksheet') and coalesce(v_max, 100) > 0 and coalesce(v_max, 100) <> 100 then
      v_score_text := format('**%s점** (원점수 %s / %s점)',
        trim_scale(round(coalesce(v_score, 0) / v_max * 100, 1)), trim_scale(coalesce(v_score, 0)), trim_scale(v_max));
    else
      v_score_text := format('**%s점** / %s점', trim_scale(coalesce(v_score, 0)), trim_scale(coalesce(v_max, 100)));
    end if;
    v_grade_text := case
      when v_era is not null or v_kind in ('school', 'worksheet') then null
      when v_kind = 'hanneung' then coalesce(v_grade || '급', '급수 없음(60점 미만)')
      when v_grade is not null then '추정 ' || v_grade || '등급'
    end;
    v_secs := coalesce(v_time_ms, 0) / 1000;
    return array_to_string(array[
      format('✅ **%s** 제출 — %s', v_name, v_title), v_score_text, v_grade_text,
      format('정답 %s/%s', coalesce(v_correct, 0), coalesce(v_total, 0)),
      '풀이 ' || case when v_secs >= 60 then (v_secs / 60) || '분 ' || (v_secs % 60) || '초' else v_secs || '초' end,
      v_when], ' · ');
  end if;
  return null;
end;
$function$;
revoke all on function private.exam_discord_message(uuid, text) from public, anon, authenticated;

create or replace function private.exam_discord_notify(p_attempt_id uuid, p_event text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_url text;
  v_message text;
begin
  -- 새로고침 등으로 시작 RPC가 연달아 불려도 이어 풀기 알림은 3분에 한 번만.
  if p_event = 'resume' and exists (
    select 1 from private.exam_discord_notices n
     where n.attempt_id = p_attempt_id and n.event in ('start', 'resume') and n.sent_at > now() - interval '3 minutes'
  ) then
    return;
  end if;

  v_message := private.exam_discord_message(p_attempt_id, p_event);
  if v_message is null then return; end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'discord_exam_webhook' limit 1;
  if nullif(btrim(v_url), '') is null then return; end if;

  perform net.http_post(
    url := btrim(v_url),
    body := jsonb_build_object('content', left(v_message, 1900), 'username', 'ReviewNote',
                               'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  insert into private.exam_discord_notices (attempt_id, event) values (p_attempt_id, p_event);
exception when others then
  raise warning 'exam_discord_notify failed: %', sqlerrm;
end;
$function$;
revoke all on function private.exam_discord_notify(uuid, text) from public, anon, authenticated;

create or replace function private.exam_discord_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exam_discord_notify(new.id, 'submit');
  return null;
end;
$function$;
revoke all on function private.exam_discord_on_submit() from public, anon, authenticated;

drop trigger if exists exam_attempts_discord_submit on public.exam_attempts;
create trigger exam_attempts_discord_submit
  after update of status on public.exam_attempts
  for each row when (old.status = 'in_progress' and new.status = 'submitted')
  execute function private.exam_discord_on_submit();

-- 운영 본문(20261003130000_exam_worksheets.sql)과 같고, 시작·이어 풀기에서 알림만 보낸다.
create or replace function public.start_exam_attempt(p_paper_id text, p_mode text, p_elective text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_paper public.exam_papers%rowtype;
  v_attempt_id uuid;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_paper from public.exam_papers where id = p_paper_id;
  if v_paper.id is null or not (v_paper.published or private.is_current_user_admin()) then
    raise exception 'EXAM_PAPER_NOT_FOUND';
  end if;
  if (v_paper.practice_era is not null or v_paper.kind = 'worksheet') and p_mode <> 'free' then raise exception 'EXAM_INVALID_MODE'; end if;
  if p_mode is null or p_mode not in ('real', 'free') then
    raise exception 'EXAM_INVALID_MODE';
  end if;
  if cardinality(v_paper.electives) = 0 then
    p_elective := null;
  elsif p_elective is null or not (p_elective = any (v_paper.electives)) then
    raise exception 'EXAM_INVALID_ELECTIVE';
  end if;

  insert into public.exam_attempts (student_id, paper_id, mode, elective, time_limit_minutes)
  values (
    v_uid, p_paper_id, p_mode, p_elective,
    case when p_mode = 'real' then v_paper.time_limit_minutes end
  )
  on conflict (student_id, paper_id) where status = 'in_progress' do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    -- 이미 진행 중인 시도가 있었다(이어 풀기).
    select id into v_attempt_id
      from public.exam_attempts
     where student_id = v_uid and paper_id = p_paper_id and status = 'in_progress';
    perform private.exam_discord_notify(v_attempt_id, 'resume');
    return private.exam_attempt_payload(v_attempt_id);
  end if;

  insert into public.exam_attempt_items (attempt_id, question_id)
  select v_attempt_id, q.id
    from public.exam_questions q
   where q.paper_id = p_paper_id
     and (q.section = 'common' or q.section = p_elective);

  perform private.exam_discord_notify(v_attempt_id, 'start');
  return private.exam_attempt_payload(v_attempt_id);
end;
$function$;
