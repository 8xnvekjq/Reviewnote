-- ================================================
-- 복습체크 AI 자동채점: DB 스키마 + 결과 캐시 + service_role 전용 배치 RPC
-- ================================================
-- 배경: review-check-grade Edge Function(학생이 devtools로 우회 불가능한 서버 경계)이 Gemini로
-- 판정한 결과를 여기 저장한다. 학생이 클라이언트에서 채점 결과를 조작해 직접 저장할 수 없도록,
-- 최종 저장 RPC는 service_role만 실행 가능하게 잠근다(authenticated/anon 전부 거부).
--
-- review_check_items.grade 는 이미 CHECK(grade IN ('correct','incorrect'))가 걸려 있으므로,
-- AI verdict가 'manual_review'인 항목은 grade를 NULL로 남겨(기존 "채점 대기" 의미를 그대로 재사용)
-- admin 화면의 기존 "채점 대기" 큐가 별도 코드 변경 없이 곧 "확인 필요" 큐가 되게 한다.

-- 1) review_check_items: AI 채점 메타데이터 컬럼 추가 -------------------------------------------
alter table public.review_check_items
  add column ai_verdict text,
  add column ai_confidence real,
  add column ai_reason text,
  add column ai_normalized_student_answer text,
  add column ai_canonical_answer text,
  add column ai_graded_at timestamptz,
  add column ai_grading_version smallint,
  add column graded_source text;

alter table public.review_check_items
  add constraint review_check_items_ai_verdict_check
    check (ai_verdict is null or ai_verdict in ('correct', 'incorrect', 'manual_review')),
  add constraint review_check_items_ai_confidence_check
    check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  add constraint review_check_items_graded_source_check
    check (graded_source is null or graded_source in ('ai', 'admin'));

comment on column public.review_check_items.ai_verdict is
  'review-check-grade Edge Function이 Gemini로 판정한 원 verdict(이미 clampAiGradeVerdict를 거친 값). manual_review여도 grade는 NULL로 남아 admin 확인 대상이 된다.';
comment on column public.review_check_items.graded_source is
  '이 문항의 최종 grade를 누가 확정했는지: ai=AI가 확신 있게 확정, admin=관리자가 직접(또는 AI 판정을 덮어써서) 확정. 기존(AI 도입 이전) admin 채점 RPC들은 이 컬럼을 건드리지 않으므로 NULL로 남을 수 있다(=UI에서 출처 표시를 생략).';

-- 2) review_check_ai_grade_cache: 동일 (문제+정답+학생답+프롬프트버전) 재채점 방지 ------------------
create table public.review_check_ai_grade_cache (
  id uuid primary key default gen_random_uuid(),
  mistake_id uuid not null references public.mistakes(id) on delete cascade,
  correct_answer_snapshot text not null,
  student_answer_raw text not null,
  grading_version smallint not null,
  verdict text not null check (verdict in ('correct', 'incorrect', 'manual_review')),
  normalized_student_answer text,
  canonical_answer text,
  reason text,
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  unique (mistake_id, correct_answer_snapshot, student_answer_raw, grading_version)
);

comment on table public.review_check_ai_grade_cache is
  '복습체크 AI 채점 결과 캐시 — service_role 전용(RLS는 켜져 있지만 정책을 하나도 만들지 않아 anon/authenticated는 완전히 차단됨). 정답 텍스트가 바뀌거나(correctAnswer 백필/정정) 프롬프트를 의미 있게 바꿔 grading_version을 올리면 자연스럽게 캐시가 무효화된다.';

-- RLS는 켜두되 정책을 하나도 만들지 않는다 = anon/authenticated는 무조건 0 rows,
-- service_role은 RLS를 우회하므로 정상적으로 읽고 쓸 수 있다.
alter table public.review_check_ai_grade_cache enable row level security;

revoke all on public.review_check_ai_grade_cache from public, anon, authenticated;

-- 3) apply_review_check_ai_grade_batch: service_role 전용 배치 저장 RPC --------------------------
-- p_results 형태(review-check-grade Edge Function이 보내는 그대로):
--   [{ mistakeId, gradingVersion, verdict, normalizedStudentAnswer, canonicalAnswer, reason, confidence }, ...]
--
-- 안전 불변식:
--   - grade가 이미 NOT NULL인 문항(admin이 이미 채점했거나 이전 AI 배치가 이미 확정한 문항)은
--     이 함수가 절대 건드리지 않는다 — 재시도/경쟁 호출에도 안전(idempotent by construction).
--   - verdict='manual_review'인 문항은 grade를 NULL로 남긴다 — admin의 기존 "채점 대기" 큐에
--     그대로 남아 "확인 필요" 항목이 된다.
--   - 확신 있게(grade가 정해진) 채점된 문항마다 기존 private.apply_review_check_outcome을 그대로
--     호출해, admin의 O/X 채점과 오답노트 reviews/mastery 갱신 로직을 한 곳으로 유지한다.
--   - 세션의 모든 문항이 확정된 시점(이번 호출로든, admin이 먼저 일부를 처리해서든)에만 세션
--     status를 'graded'로 전이한다 — graded_by는 NULL로 남겨 "AI 전용 채점"을 표시한다(사람이
--     채점하면 기존 RPC가 그대로 자신의 uid를 채운다).
create or replace function public.apply_review_check_ai_grade_batch(p_session_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_r jsonb;
  v_mistake_id uuid;
  v_verdict text;
  v_grade text;
  v_item_id uuid;
  v_existing_grade text;
  v_item_total int;
  v_item_resolved int;
  v_item_correct int;
begin
  select status into v_status from public.review_check_sessions where id = p_session_id for update;
  if v_status is null then
    raise exception 'session not found';
  end if;

  if v_status = 'submitted' then
    for v_r in select * from jsonb_array_elements(p_results) loop
      v_verdict := v_r->>'verdict';
      if v_verdict not in ('correct', 'incorrect', 'manual_review') then
        continue; -- 방어적 이중 검증: 서버 clamp를 거쳤어야 하지만 알 수 없는 값은 조용히 무시
      end if;
      v_mistake_id := (v_r->>'mistakeId')::uuid;
      v_grade := case when v_verdict in ('correct', 'incorrect') then v_verdict else null end;

      select id, grade into v_item_id, v_existing_grade
        from public.review_check_items
        where session_id = p_session_id and mistake_id = v_mistake_id
        for update;

      if v_item_id is null then
        continue; -- 이 세션 소속이 아닌 mistake_id 조용히 무시
      end if;
      if v_existing_grade is not null then
        continue; -- 이미 확정된 문항은 절대 덮어쓰지 않음(admin 우선 원칙)
      end if;

      update public.review_check_items
        set grade = v_grade,
            ai_verdict = v_verdict,
            ai_confidence = nullif(v_r->>'confidence', '')::real,
            ai_reason = v_r->>'reason',
            ai_normalized_student_answer = v_r->>'normalizedStudentAnswer',
            ai_canonical_answer = v_r->>'canonicalAnswer',
            ai_graded_at = now(),
            ai_grading_version = nullif(v_r->>'gradingVersion', '')::smallint,
            graded_source = case when v_grade is not null then 'ai' else graded_source end
        where id = v_item_id;

      if v_grade is not null then
        perform private.apply_review_check_outcome(v_mistake_id, v_grade);
      end if;
    end loop;
  end if;

  select count(*), count(*) filter (where grade is not null), count(*) filter (where grade = 'correct')
    into v_item_total, v_item_resolved, v_item_correct
    from public.review_check_items
    where session_id = p_session_id;

  if v_status = 'submitted' and v_item_total > 0 and v_item_resolved = v_item_total then
    update public.review_check_sessions
      set status = 'graded', correct_count = v_item_correct, total_count = v_item_total,
          graded_at = now(), graded_by = null
      where id = p_session_id;
  end if;

  return jsonb_build_object(
    'allGraded', v_item_total > 0 and v_item_resolved = v_item_total,
    'gradedCount', v_item_resolved,
    'manualReviewCount', v_item_total - v_item_resolved
  );
end;
$function$;

comment on function public.apply_review_check_ai_grade_batch(uuid, jsonb) is
  'review-check-grade Edge Function(service_role)만 호출한다. 학생/관리자 클라이언트에서 직접 호출 불가(REVOKE) — AI 채점 결과의 최종 저장 경로를 서버가 신뢰하는 단일 경로로 강제한다.';

revoke all on function public.apply_review_check_ai_grade_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_review_check_ai_grade_batch(uuid, jsonb) to service_role;
