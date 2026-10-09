-- 학력평가: 선택과목 없이 30문항·100점·100분. 검토 후 별도로 공개한다.
begin;

alter table public.exam_papers drop constraint if exists exam_papers_kind_check;
alter table public.exam_papers add constraint exam_papers_kind_check check (kind in ('csat','mock','school','hanneung','worksheet'));

alter table public.exam_papers drop constraint if exists exam_papers_mock_check;
alter table public.exam_papers add constraint exam_papers_mock_check check (kind <> 'mock' or (grade in (1,2) and grade is not null and cardinality(electives)=0 and question_count=30 and max_score=100 and time_limit_minutes=100 and grade_cuts->'raw' is not null));

-- 최신 정의: 20261004115900_exam_school_question_validation.sql
create or replace function private.exam_validate_question()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_paper public.exam_papers%rowtype;
begin
  select * into v_paper from public.exam_papers where id = new.paper_id;
  if new.number > 50 and v_paper.practice_era is null and v_paper.kind <> 'worksheet' then raise exception 'EXAM_INVALID_QUESTION'; end if;
  if v_paper.practice_era is not null and (new.source_paper_id is null or new.number > v_paper.question_count) then raise exception 'EXAM_INVALID_QUESTION'; end if;
  if v_paper.kind = 'worksheet' then
    if new.section <> 'common' or new.answer_type not in ('choice5','digits') or new.number > v_paper.question_count then raise exception 'EXAM_INVALID_QUESTION'; end if;
  elsif v_paper.kind = 'mock' then
    if new.section <> 'common' or new.number > 30 or new.answer_type <> (case when new.number <= 21 then 'choice5' else 'digits' end) then raise exception 'EXAM_INVALID_QUESTION'; end if;
  elsif v_paper.kind = 'school' then
    if new.section <> 'common' or new.number > v_paper.question_count or new.answer_type not in ('choice5','choice10','digits') then
      raise exception 'EXAM_INVALID_QUESTION';
    end if;
  elsif v_paper.kind = 'hanneung' then
    if new.section <> 'common' or new.answer_type <> (case when v_paper.hanneung_level = 'basic' then 'choice4' else 'choice5' end) then
      raise exception 'EXAM_INVALID_QUESTION';
    end if;
  elsif new.number > 30 or ((new.section = 'common') <> (new.number <= 22)) then
    raise exception 'EXAM_INVALID_QUESTION';
  end if;
  return new;
end;
$function$;

revoke all on function private.exam_validate_question() from public, anon, authenticated;

-- 최신 정의: 20261003130000_exam_worksheets.sql
create or replace function private.exam_result_payload(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'attemptId', a.id,
    'round', private.exam_attempt_round(a.id),
    'paperId', a.paper_id,
    'paperTitle', p.title,
    'kind', p.kind, 'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level, 'unitName', p.unit_name, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
    'mode', a.mode,
    'elective', a.elective,
    'score', a.score,
    'correctCount', a.correct_count,
    'totalCount', a.total_count,
    'totalTimeMs', a.total_time_ms,
    'estimatedGrade', case when p.kind in ('school','worksheet') or p.practice_era is not null then null else a.estimated_grade end,
    'gradeCut', case when p.kind not in ('csat','mock') then null else jsonb_build_object(
      'rawByGrade', coalesce(p.grade_cuts->'rawByElective'->a.elective, case when a.elective is null then p.grade_cuts->'raw' end, '[]'::jsonb),
      'standardByGrade', coalesce(p.grade_cuts->'standardByElective'->a.elective, p.grade_cuts->'standard', '[]'::jsonb),
      'percentileByGrade', coalesce(p.grade_cuts->'percentileByElective'->a.elective, p.grade_cuts->'percentile', '[]'::jsonb),
      'topStandard', coalesce(p.grade_cuts->'topByElective'->a.elective->'standard', case when a.elective is null then p.grade_cuts->'top'->'standard' end, 'null'::jsonb),
      'topPercentile', coalesce(p.grade_cuts->'topByElective'->a.elective->'percentile', case when a.elective is null then p.grade_cuts->'top'->'percentile' end, 'null'::jsonb),
      'source', coalesce(p.grade_cuts->>'source', '')
    ) end,
    'submittedAt', a.submitted_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'questionId', q.id,
               'number', q.number, 'sourcePaperId', q.source_paper_id, 'sourceNumber', q.source_number, 'sourceRound', q.source_round, 'sourceLabel', q.source_label,
               'section', q.section,
               'imageUrl', q.image_url,
               'isChoice', q.is_choice, 'answerType', q.answer_type, 'choices', q.choices,
               'points', q.points,
               'answer', i.answer,
               'correctAnswer', k.answer,
               'isCorrect', coalesce(i.is_correct, false),
               'unsure', i.unsure,
               'timeSpentMs', i.time_spent_ms,
               'nationalWrongRate', s.wrong_rate,
               'nationalChoiceRates', s.choice_rates,
               'addedMistakeId', i.added_mistake_id
             ) order by q.number)
        from public.exam_attempt_items i
        join public.exam_questions q on q.id = i.question_id
        left join public.exam_answer_keys k on k.question_id = q.id
        left join public.exam_question_national_stats s
          on s.question_id = q.id and s.elective = a.elective
       where i.attempt_id = a.id
    ), '[]'::jsonb)
  )
  from public.exam_attempts a
  join public.exam_papers p on p.id = a.paper_id
  where a.id = p_attempt_id;
$function$;

revoke all on function private.exam_result_payload(uuid) from public, anon, authenticated;

-- 최신 정의: 20261003130000_exam_worksheets.sql
create or replace function public.submit_exam_attempt(p_attempt_id uuid, p_items jsonb, p_visit_order int[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
  v_cuts jsonb;
  v_score numeric;
  v_kind text;
  v_level text;
  v_correct int;
  v_total int;
  v_time bigint;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status = 'submitted' then
    return private.exam_result_payload(p_attempt_id);
  end if;

  if v_attempt.mode = 'free'
     or now() <= v_attempt.started_at
                 + make_interval(mins => v_attempt.time_limit_minutes)
                 + private.exam_grace_interval() then
    perform private.exam_apply_items(p_attempt_id, p_items, p_visit_order);
  end if;

  update public.exam_attempt_items i
     set is_correct = coalesce(
           private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(k.answer), false),
         updated_at = now()
    from public.exam_answer_keys k
   where i.attempt_id = p_attempt_id and k.question_id = i.question_id;

  select coalesce(sum(q.points) filter (where i.is_correct), 0),
         count(*) filter (where i.is_correct)::int,
         count(*)::int,
         coalesce(sum(i.time_spent_ms), 0)::bigint
    into v_score, v_correct, v_total, v_time
    from public.exam_attempt_items i
    join public.exam_questions q on q.id = i.question_id
   where i.attempt_id = p_attempt_id;

  select p.kind, p.hanneung_level, coalesce(p.grade_cuts->'rawByElective'->v_attempt.elective, case when v_attempt.elective is null then p.grade_cuts->'raw' end) into v_kind, v_level, v_cuts
    from public.exam_papers p where p.id = v_attempt.paper_id;

  update public.exam_attempts
     set status = 'submitted',
         submitted_at = now(),
         score = v_score,
         correct_count = v_correct,
         total_count = v_total,
         total_time_ms = v_time,
         estimated_grade = case when v_kind in ('school','worksheet') or exists (select 1 from public.exam_papers p where p.id = v_attempt.paper_id and p.practice_era is not null) then null when v_kind = 'hanneung' then private.exam_hanneung_grade(v_score, v_level) else private.exam_estimate_grade(v_cuts, v_score::int) end,
         updated_at = now()
   where id = p_attempt_id;

  return private.exam_result_payload(p_attempt_id);
end;
$function$;

revoke all on function public.submit_exam_attempt(uuid,jsonb,int[]) from public, anon;
grant execute on function public.submit_exam_attempt(uuid,jsonb,int[]) to authenticated;

insert into public.exam_papers (id,title,exam_date,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,year,grade,question_count,max_score) values ('2025-10-g1-math','2025년 10월 고1 전국연합학력평가 수학','2025-10-14','시·도 교육청(서울특별시교육청 주관) 전국연합학력평가','수학','고1',100,'{}'::text[],'{"source": "종로학원 확정 등급컷 — 2025년 10월 14일 시행 전국연합학력평가. 원점수·표준점수·백분위. https://b.jongro.co.kr/exam/ex251014/go1_cut.asp", "raw": [88, 73, 58, 46, 33, 21, 14, 11], "standard": [140, 127, 114, 104, 92, 82, 76, 73], "percentile": [96, 89, 76, 61, 40, 22, 11, 4], "top": {"raw": 100, "standard": 151, "percentile": 100}}'::jsonb,false,'mock',2025,1,30,100) on conflict (id) do nothing;

insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type) values
('2025-10-g1-math',1,'common','/exams/2025-10-g1-math/c-01.png',true,2,'공통수학1','다항식의 연산','choice5'),
('2025-10-g1-math',2,'common','/exams/2025-10-g1-math/c-02.png',true,2,'공통수학2','평면좌표','choice5'),
('2025-10-g1-math',3,'common','/exams/2025-10-g1-math/c-03.png',true,2,'공통수학1','행렬과 그 연산','choice5'),
('2025-10-g1-math',4,'common','/exams/2025-10-g1-math/c-04.png',true,3,'공통수학1','나머지정리와 인수분해','choice5'),
('2025-10-g1-math',5,'common','/exams/2025-10-g1-math/c-05.png',true,3,'공통수학2','도형의 이동','choice5'),
('2025-10-g1-math',6,'common','/exams/2025-10-g1-math/c-06.png',true,3,'공통수학1','다항식의 연산','choice5'),
('2025-10-g1-math',7,'common','/exams/2025-10-g1-math/c-07.png',true,3,'공통수학1','행렬과 그 연산','choice5'),
('2025-10-g1-math',8,'common','/exams/2025-10-g1-math/c-08.png',true,3,'공통수학1','여러 가지 방정식','choice5'),
('2025-10-g1-math',9,'common','/exams/2025-10-g1-math/c-09.png',true,3,'공통수학1','나머지정리와 인수분해','choice5'),
('2025-10-g1-math',10,'common','/exams/2025-10-g1-math/c-10.png',true,3,'공통수학1','경우의 수','choice5'),
('2025-10-g1-math',11,'common','/exams/2025-10-g1-math/c-11.png',true,3,'공통수학2','직선의 방정식','choice5'),
('2025-10-g1-math',12,'common','/exams/2025-10-g1-math/c-12.png',true,3,'공통수학1','복소수','choice5'),
('2025-10-g1-math',13,'common','/exams/2025-10-g1-math/c-13.png',true,3,'공통수학1','여러 가지 부등식','choice5'),
('2025-10-g1-math',14,'common','/exams/2025-10-g1-math/c-14.png',true,4,'공통수학2','도형의 이동','choice5'),
('2025-10-g1-math',15,'common','/exams/2025-10-g1-math/c-15.png',true,4,'공통수학1','행렬과 그 연산','choice5'),
('2025-10-g1-math',16,'common','/exams/2025-10-g1-math/c-16.png',true,4,'공통수학1','순열과 조합','choice5'),
('2025-10-g1-math',17,'common','/exams/2025-10-g1-math/c-17.png',true,4,'공통수학1','이차방정식과 이차함수','choice5'),
('2025-10-g1-math',18,'common','/exams/2025-10-g1-math/c-18.png',true,4,'공통수학1','나머지정리와 인수분해','choice5'),
('2025-10-g1-math',19,'common','/exams/2025-10-g1-math/c-19.png',true,4,'공통수학1','다항식의 연산','choice5'),
('2025-10-g1-math',20,'common','/exams/2025-10-g1-math/c-20.png',true,4,'공통수학2','평면좌표','choice5'),
('2025-10-g1-math',21,'common','/exams/2025-10-g1-math/c-21.png',true,4,'공통수학1','여러 가지 방정식','choice5'),
('2025-10-g1-math',22,'common','/exams/2025-10-g1-math/c-22.png',false,3,'공통수학2','직선의 방정식','digits'),
('2025-10-g1-math',23,'common','/exams/2025-10-g1-math/c-23.png',false,3,'공통수학1','순열과 조합','digits'),
('2025-10-g1-math',24,'common','/exams/2025-10-g1-math/c-24.png',false,3,'공통수학1','행렬과 그 연산','digits'),
('2025-10-g1-math',25,'common','/exams/2025-10-g1-math/c-25.png',false,3,'공통수학1','순열과 조합','digits'),
('2025-10-g1-math',26,'common','/exams/2025-10-g1-math/c-26.png',false,4,'공통수학1','여러 가지 방정식','digits'),
('2025-10-g1-math',27,'common','/exams/2025-10-g1-math/c-27.png',false,4,'공통수학1','이차방정식','digits'),
('2025-10-g1-math',28,'common','/exams/2025-10-g1-math/c-28.png',false,4,'공통수학1','여러 가지 방정식','digits'),
('2025-10-g1-math',29,'common','/exams/2025-10-g1-math/c-29.png',false,4,'공통수학1','다항식의 연산','digits'),
('2025-10-g1-math',30,'common','/exams/2025-10-g1-math/c-30.png',false,4,'공통수학1','이차방정식과 이차함수','digits')
on conflict (paper_id,section,number) do nothing;

insert into public.exam_answer_keys (question_id,answer) select q.id,k.answer from (values
(1,'4'),(2,'2'),(3,'3'),(4,'1'),(5,'1'),(6,'2'),(7,'5'),(8,'3'),(9,'5'),(10,'4'),(11,'1'),(12,'4'),(13,'3'),(14,'4'),(15,'2'),(16,'5'),(17,'4'),(18,'2'),(19,'5'),(20,'3'),(21,'1'),(22,'2'),(23,'13'),(24,'6'),(25,'144'),(26,'18'),(27,'20'),(28,'40'),(29,'133'),(30,'16')) as k(number,answer) join public.exam_questions q on q.paper_id='2025-10-g1-math' and q.section='common' and q.number=k.number on conflict (question_id) do nothing;

insert into public.exam_papers (id,title,exam_date,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,year,grade,question_count,max_score) values ('2025-10-g2-math','2025년 10월 고2 전국연합학력평가 수학','2025-10-14','시·도 교육청(서울특별시교육청 주관) 전국연합학력평가','수학','고2',100,'{}'::text[],'{"source": "종로학원 확정 등급컷 — 2025년 10월 14일 시행 전국연합학력평가. 원점수·표준점수·백분위. https://b.jongro.co.kr/exam/ex251014/go2_cut.asp", "raw": [88, 76, 58, 39, 25, 18, 12, 9], "standard": [141, 131, 116, 101, 89, 84, 79, 76], "percentile": [96, 89, 77, 61, 40, 24, 11, 5], "top": {"raw": 100, "standard": 150, "percentile": 100}}'::jsonb,false,'mock',2025,2,30,100) on conflict (id) do nothing;

insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type) values
('2025-10-g2-math',1,'common','/exams/2025-10-g2-math/c-01.png',true,2,'대수','지수와 로그','choice5'),
('2025-10-g2-math',2,'common','/exams/2025-10-g2-math/c-02.png',true,2,'미적분Ⅰ','미분계수와 도함수','choice5'),
('2025-10-g2-math',3,'common','/exams/2025-10-g2-math/c-03.png',true,2,'대수','등차수열과 등비수열','choice5'),
('2025-10-g2-math',4,'common','/exams/2025-10-g2-math/c-04.png',true,3,'미적분Ⅰ','함수의 극한','choice5'),
('2025-10-g2-math',5,'common','/exams/2025-10-g2-math/c-05.png',true,3,'대수','삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)','choice5'),
('2025-10-g2-math',6,'common','/exams/2025-10-g2-math/c-06.png',true,3,'미적분Ⅰ','함수의 연속','choice5'),
('2025-10-g2-math',7,'common','/exams/2025-10-g2-math/c-07.png',true,3,'대수','수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)','choice5'),
('2025-10-g2-math',8,'common','/exams/2025-10-g2-math/c-08.png',true,3,'대수','지수와 로그','choice5'),
('2025-10-g2-math',9,'common','/exams/2025-10-g2-math/c-09.png',true,3,'대수','삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)','choice5'),
('2025-10-g2-math',10,'common','/exams/2025-10-g2-math/c-10.png',true,3,'미적분Ⅰ','함수의 극한','choice5'),
('2025-10-g2-math',11,'common','/exams/2025-10-g2-math/c-11.png',true,3,'대수','지수와 로그','choice5'),
('2025-10-g2-math',12,'common','/exams/2025-10-g2-math/c-12.png',true,3,'미적분Ⅰ','함수의 극한','choice5'),
('2025-10-g2-math',13,'common','/exams/2025-10-g2-math/c-13.png',true,3,'대수','삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)','choice5'),
('2025-10-g2-math',14,'common','/exams/2025-10-g2-math/c-14.png',true,4,'대수','수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)','choice5'),
('2025-10-g2-math',15,'common','/exams/2025-10-g2-math/c-15.png',true,4,'대수','지수와 로그','choice5'),
('2025-10-g2-math',16,'common','/exams/2025-10-g2-math/c-16.png',true,4,'미적분Ⅰ','함수의 극한','choice5'),
('2025-10-g2-math',17,'common','/exams/2025-10-g2-math/c-17.png',true,4,'대수','등차수열과 등비수열','choice5'),
('2025-10-g2-math',18,'common','/exams/2025-10-g2-math/c-18.png',true,4,'대수','삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)','choice5'),
('2025-10-g2-math',19,'common','/exams/2025-10-g2-math/c-19.png',true,4,'대수','지수와 로그','choice5'),
('2025-10-g2-math',20,'common','/exams/2025-10-g2-math/c-20.png',true,4,'대수','등차수열과 등비수열','choice5'),
('2025-10-g2-math',21,'common','/exams/2025-10-g2-math/c-21.png',true,4,'대수','지수와 로그','choice5'),
('2025-10-g2-math',22,'common','/exams/2025-10-g2-math/c-22.png',false,3,'대수','지수와 로그','digits'),
('2025-10-g2-math',23,'common','/exams/2025-10-g2-math/c-23.png',false,3,'대수','삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)','digits'),
('2025-10-g2-math',24,'common','/exams/2025-10-g2-math/c-24.png',false,3,'대수','지수와 로그','digits'),
('2025-10-g2-math',25,'common','/exams/2025-10-g2-math/c-25.png',false,3,'대수','수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)','digits'),
('2025-10-g2-math',26,'common','/exams/2025-10-g2-math/c-26.png',false,4,'미적분Ⅰ','미분계수와 도함수','digits'),
('2025-10-g2-math',27,'common','/exams/2025-10-g2-math/c-27.png',false,4,'대수','삼각함수의 활용 (사인법칙, 코사인법칙 등)','digits'),
('2025-10-g2-math',28,'common','/exams/2025-10-g2-math/c-28.png',false,4,'미적분Ⅰ','함수의 연속','digits'),
('2025-10-g2-math',29,'common','/exams/2025-10-g2-math/c-29.png',false,4,'대수','수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)','digits'),
('2025-10-g2-math',30,'common','/exams/2025-10-g2-math/c-30.png',false,4,'미적분Ⅰ','함수의 연속','digits')
on conflict (paper_id,section,number) do nothing;

insert into public.exam_answer_keys (question_id,answer) select q.id,k.answer from (values
(1,'3'),(2,'1'),(3,'4'),(4,'5'),(5,'1'),(6,'2'),(7,'5'),(8,'1'),(9,'3'),(10,'4'),(11,'2'),(12,'3'),(13,'2'),(14,'5'),(15,'3'),(16,'4'),(17,'1'),(18,'5'),(19,'2'),(20,'3'),(21,'3'),(22,'3'),(23,'20'),(24,'7'),(25,'13'),(26,'9'),(27,'12'),(28,'5'),(29,'28'),(30,'50')) as k(number,answer) join public.exam_questions q on q.paper_id='2025-10-g2-math' and q.section='common' and q.number=k.number on conflict (question_id) do nothing;

commit;
