-- Run as database administrator. All test data is inserted and rolled back inside this single
-- transaction — no need for pre-existing "profile without X" lookups like farm-server.sql, since
-- nothing here persists.
begin;
do $$
declare
  a uuid;              -- test student 1 (scenarios 1-3, 6)
  a2 uuid;             -- test student 2 (scenario 4 — needs its own clean slate since s2 stays
                       -- 'submitted'/active through scenario 4, and a student may only have one
                       -- active review_check_sessions row at a time)
  admin_uid uuid;       -- existing admin (private.app_admins)
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid;
  r jsonb;
  denied boolean;
  v_status text; v_correct int; v_total int; v_graded_by uuid;
  v_grade text; v_ai_verdict text; v_graded_source text; v_ai_reason text;
  v_reviews jsonb; v_mastered_at timestamptz;
  v_reviews_before jsonb;
begin
  select id into a from public.profiles p
    where not exists (select 1 from public.review_check_sessions s where s.student_id = p.id) limit 1;
  select id into a2 from public.profiles p
    where p.id <> a and not exists (select 1 from public.review_check_sessions s where s.student_id = p.id) limit 1;
  select user_id into admin_uid from private.app_admins limit 1;
  if a is null or a2 is null or admin_uid is null then
    raise exception 'need two profiles with no existing review_check_sessions, and one existing admin';
  end if;

  -- ============================================================================================
  -- Scenario 1: 전부 확신 있는 AI 채점 -> 세션이 곧바로 'graded'로, graded_by는 NULL(AI 전용 표시),
  -- graded_source='ai', private.apply_review_check_outcome이 실제로 mistakes.reviews/mastery를 갱신.
  -- ============================================================================================
  insert into public.mistakes (id, user_id, title, image_url, analysis, reviews)
    values (gen_random_uuid(), a, 'AI 채점 테스트 1', 'https://example.com/1.png',
            '{"finalAnswer":"1/2","solvingProcess":"분수로 정리하면 1/2"}'::jsonb, '["O","O","O"]'::jsonb)
    returning id into m1;
  insert into public.review_check_sessions (id, student_id, grade, start_chapter, end_chapter, status, total_count)
    values (gen_random_uuid(), a, '공통수학2', 'ch1', 'ch1', 'submitted', 1)
    returning id into s1;
  insert into public.review_check_items (session_id, mistake_id, position, submitted_answer)
    values (s1, m1, 0, '0.5');

  execute 'set local role service_role';
  r := public.apply_review_check_ai_grade_batch(s1, jsonb_build_array(jsonb_build_object(
    'mistakeId', m1, 'gradingVersion', 1, 'verdict', 'correct',
    'normalizedStudentAnswer', '0.5', 'canonicalAnswer', '1/2', 'reason', '분수와 소수 동치', 'confidence', 0.95
  )));
  execute 'reset role';

  if (r->>'allGraded')::boolean is distinct from true or (r->>'gradedCount')::int <> 1 or (r->>'manualReviewCount')::int <> 0 then
    raise exception 'scenario1: unexpected batch result %', r;
  end if;
  select status, correct_count, total_count, graded_by into v_status, v_correct, v_total, v_graded_by
    from public.review_check_sessions where id = s1;
  if v_status <> 'graded' or v_correct <> 1 or v_total <> 1 or v_graded_by is not null then
    raise exception 'scenario1: session not finalized as AI-only graded (status=%, correct=%, total=%, graded_by=%)', v_status, v_correct, v_total, v_graded_by;
  end if;
  select grade, ai_verdict, graded_source, ai_reason into v_grade, v_ai_verdict, v_graded_source, v_ai_reason
    from public.review_check_items where session_id = s1 and mistake_id = m1;
  if v_grade <> 'correct' or v_ai_verdict <> 'correct' or v_graded_source <> 'ai' or v_ai_reason is null then
    raise exception 'scenario1: item not stamped correctly (grade=%, ai_verdict=%, source=%)', v_grade, v_ai_verdict, v_graded_source;
  end if;
  select reviews, review_check_mastered_at into v_reviews, v_mastered_at from public.mistakes where id = m1;
  if v_reviews->>2 <> 'O' or v_mastered_at is null then
    raise exception 'scenario1: apply_review_check_outcome side-effect missing (reviews=%, mastered_at=%)', v_reviews, v_mastered_at;
  end if;

  -- ============================================================================================
  -- Scenario 2: 일부는 확신 오답, 일부는 manual_review -> 세션은 'submitted'로 남고(admin의 기존
  -- "채점 대기" 큐 = "확인 필요" 큐), 확신 문항은 grade가 이미 반영되어 있다(부분 진행 보존).
  -- ============================================================================================
  insert into public.mistakes (id, user_id, title, image_url, analysis, reviews)
    values (gen_random_uuid(), a, 'AI 채점 테스트 2-정오답', 'https://example.com/2.png', '{"finalAnswer":"5"}'::jsonb, '["O","O","O"]'::jsonb)
    returning id into m2;
  insert into public.mistakes (id, user_id, title, image_url, analysis, reviews)
    values (gen_random_uuid(), a, 'AI 채점 테스트 2-애매', 'https://example.com/3.png', '{"finalAnswer":"y=2x+1"}'::jsonb, '["O","O","O"]'::jsonb)
    returning id into m3;
  insert into public.review_check_sessions (id, student_id, grade, start_chapter, end_chapter, status, total_count)
    values (gen_random_uuid(), a, '공통수학2', 'ch1', 'ch1', 'submitted', 2)
    returning id into s2;
  insert into public.review_check_items (session_id, mistake_id, position, submitted_answer) values (s2, m2, 0, '3');
  insert into public.review_check_items (session_id, mistake_id, position, submitted_answer) values (s2, m3, 1, '모르겠어요');

  execute 'set local role service_role';
  r := public.apply_review_check_ai_grade_batch(s2, jsonb_build_array(
    jsonb_build_object('mistakeId', m2, 'gradingVersion', 1, 'verdict', 'incorrect',
      'normalizedStudentAnswer', '3', 'canonicalAnswer', '5', 'reason', '값이 다름', 'confidence', 0.9),
    jsonb_build_object('mistakeId', m3, 'gradingVersion', 1, 'verdict', 'manual_review',
      'normalizedStudentAnswer', null, 'canonicalAnswer', null, 'reason', '학생 답이 모호함', 'confidence', 0.3)
  ));
  execute 'reset role';

  if (r->>'allGraded')::boolean is distinct from false or (r->>'gradedCount')::int <> 1 or (r->>'manualReviewCount')::int <> 1 then
    raise exception 'scenario2: unexpected batch result %', r;
  end if;
  select status into v_status from public.review_check_sessions where id = s2;
  if v_status <> 'submitted' then raise exception 'scenario2: session should stay submitted while manual_review remains, got %', v_status; end if;
  select grade, graded_source into v_grade, v_graded_source from public.review_check_items where session_id = s2 and mistake_id = m2;
  if v_grade <> 'incorrect' or v_graded_source <> 'ai' then raise exception 'scenario2: confident item not persisted (grade=%, source=%)', v_grade, v_graded_source; end if;
  select grade, ai_verdict, graded_source into v_grade, v_ai_verdict, v_graded_source from public.review_check_items where session_id = s2 and mistake_id = m3;
  if v_grade is not null or v_ai_verdict <> 'manual_review' or v_graded_source is not null then
    raise exception 'scenario2: manual_review item must keep grade NULL (grade=%, ai_verdict=%, source=%)', v_grade, v_ai_verdict, v_graded_source;
  end if;

  -- ============================================================================================
  -- Scenario 3: 재시도(동일 세션에 동일 payload로 다시 호출)해도 이미 grade가 채워진 문항은
  -- 절대 다시 건드리지 않는다 — mistakes.reviews가 중복 갱신되지 않고, correct_count가 중복
  -- 증가하지 않는다(idempotent by construction, grade IS NULL 가드).
  -- ============================================================================================
  select reviews into v_reviews_before from public.mistakes where id = m1;
  execute 'set local role service_role';
  r := public.apply_review_check_ai_grade_batch(s1, jsonb_build_array(jsonb_build_object(
    'mistakeId', m1, 'gradingVersion', 1, 'verdict', 'incorrect', -- 일부러 반대 verdict를 줘도
    'normalizedStudentAnswer', '0.5', 'canonicalAnswer', '1/2', 'reason', '재시도', 'confidence', 0.99
  )));
  execute 'reset role';
  select status, correct_count, total_count into v_status, v_correct, v_total from public.review_check_sessions where id = s1;
  select grade, ai_reason into v_grade, v_ai_reason from public.review_check_items where session_id = s1 and mistake_id = m1;
  if v_status <> 'graded' or v_correct <> 1 or v_total <> 1 or v_grade <> 'correct' or v_ai_reason = '재시도' then
    raise exception 'scenario3: retry mutated an already-graded item (status=%, correct=%, grade=%, reason=%)', v_status, v_correct, v_grade, v_ai_reason;
  end if;
  select reviews into v_reviews from public.mistakes where id = m1;
  if v_reviews <> v_reviews_before then raise exception 'scenario3: retry double-applied review outcome (before=%, after=%)', v_reviews_before, v_reviews; end if;

  -- ============================================================================================
  -- Scenario 4: admin이 이미 확정한 문항은 AI 배치가 절대 덮어쓰지 않는다(admin 최종 우선 원칙).
  -- ============================================================================================
  insert into public.mistakes (id, user_id, title, image_url, analysis, reviews)
    values (gen_random_uuid(), a2, 'AI 채점 테스트 4-admin선점', 'https://example.com/4.png', '{"finalAnswer":"7"}'::jsonb, '["O","O","O"]'::jsonb)
    returning id into m4;
  insert into public.review_check_sessions (id, student_id, grade, start_chapter, end_chapter, status, total_count)
    values (gen_random_uuid(), a2, '공통수학2', 'ch1', 'ch1', 'submitted', 1)
    returning id into s3;
  -- admin이 이미 수동으로 확정해 둔 상태를 직접 시뮬레이션(세션은 아직 'submitted' — 실서비스에서는
  -- 이 조합이 grade_review_check_session 경로로는 안 나오지만, 배치 RPC 자체의 방어를 독립적으로 검증).
  insert into public.review_check_items (session_id, mistake_id, position, submitted_answer, grade)
    values (s3, m4, 0, '7', 'incorrect');

  execute 'set local role service_role';
  r := public.apply_review_check_ai_grade_batch(s3, jsonb_build_array(jsonb_build_object(
    'mistakeId', m4, 'gradingVersion', 1, 'verdict', 'correct',
    'normalizedStudentAnswer', '7', 'canonicalAnswer', '7', 'reason', 'AI는 정답이라 생각함', 'confidence', 0.99
  )));
  execute 'reset role';
  select grade, ai_verdict into v_grade, v_ai_verdict from public.review_check_items where session_id = s3 and mistake_id = m4;
  if v_grade <> 'incorrect' or v_ai_verdict is not null then
    raise exception 'scenario4: AI batch overwrote an admin-decided item (grade=%, ai_verdict=%)', v_grade, v_ai_verdict;
  end if;

  -- ============================================================================================
  -- Scenario 5: service_role 전용 권한 — anon/authenticated는 GRANT 자체가 없어 함수 호출도,
  -- 캐시 테이블 접근도 전부 거부된다.
  -- ============================================================================================
  if exists (select 1 where has_function_privilege('anon', 'public.apply_review_check_ai_grade_batch(uuid,jsonb)', 'EXECUTE'))
     or exists (select 1 where has_function_privilege('authenticated', 'public.apply_review_check_ai_grade_batch(uuid,jsonb)', 'EXECUTE'))
  then
    raise exception 'scenario5: anon/authenticated must not have EXECUTE on apply_review_check_ai_grade_batch';
  end if;
  if not has_function_privilege('service_role', 'public.apply_review_check_ai_grade_batch(uuid,jsonb)', 'EXECUTE') then
    raise exception 'scenario5: service_role must have EXECUTE on apply_review_check_ai_grade_batch';
  end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin
    perform public.apply_review_check_ai_grade_batch(s2, '[]'::jsonb);
  exception when insufficient_privilege then denied := true;
  end;
  execute 'reset role';
  if not denied then raise exception 'scenario5: authenticated caller was able to invoke the service_role-only batch RPC'; end if;

  if has_table_privilege('anon', 'public.review_check_ai_grade_cache', 'SELECT')
     or has_table_privilege('authenticated', 'public.review_check_ai_grade_cache', 'SELECT')
  then
    raise exception 'scenario5: anon/authenticated must not have any grant on review_check_ai_grade_cache';
  end if;

  -- ============================================================================================
  -- Scenario 6: 기존 admin RPC 회귀 — manual_review로 남은 문항을 admin이 마무리 채점하면 여전히
  -- 정상 동작하고(graded_source는 이 경로에서 건드리지 않으므로 NULL로 남음), 세션이 정상적으로
  -- 'graded'(graded_by=admin uid)로 전이된다. update_review_check_item_grade로 덮어쓰기도 여전히 동작.
  -- ============================================================================================
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  execute 'set local role authenticated';
  r := public.grade_review_check_session(s2, jsonb_build_array(
    jsonb_build_object('mistakeId', m2, 'grade', 'incorrect'),
    jsonb_build_object('mistakeId', m3, 'grade', 'correct')
  ));
  execute 'reset role';
  if (r->>'alreadyGraded')::boolean is distinct from false or (r->>'totalCount')::int <> 2 or (r->>'correctCount')::int <> 1 then
    raise exception 'scenario6: existing grade_review_check_session regressed, got %', r;
  end if;
  select status, graded_by into v_status, v_graded_by from public.review_check_sessions where id = s2;
  if v_status <> 'graded' or v_graded_by <> admin_uid then raise exception 'scenario6: session not finalized by admin (status=%, graded_by=%)', v_status, v_graded_by; end if;
  select grade, graded_source into v_grade, v_graded_source from public.review_check_items where session_id = s2 and mistake_id = m3;
  if v_grade <> 'correct' or v_graded_source is not null then
    raise exception 'scenario6: admin-finalized manual_review item unexpected state (grade=%, source=%)', v_grade, v_graded_source;
  end if;

  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  execute 'set local role authenticated';
  r := public.update_review_check_item_grade(s2, m2, 'correct');
  execute 'reset role';
  if (r->>'changed')::boolean is distinct from true then raise exception 'scenario6: update_review_check_item_grade regressed, got %', r; end if;
  select grade into v_grade from public.review_check_items where session_id = s2 and mistake_id = m2;
  if v_grade <> 'correct' then raise exception 'scenario6: override did not persist'; end if;
end $$;
select 'PASS: AI 전부확신 배치(세션 graded, graded_by NULL, reviews/mastery 갱신), 부분 manual_review(세션 submitted 유지, 확신 문항만 반영), 재시도 idempotent(중복 미반영), admin 선점 문항 보호, service_role 전용 권한(anon/authenticated 함수+캐시 전부 거부), 기존 admin RPC 2종 무회귀; all rolled back' as result;
rollback;
