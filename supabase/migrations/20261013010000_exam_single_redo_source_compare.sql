-- 원래 응시의 집계는 유지하고 관리자 비교 문항에만 다시 풀기를 반영한다.
begin;

alter table public.exam_attempts add column source_attempt_id uuid
  references public.exam_attempts(id) on delete set null;
alter table public.exam_attempts add constraint exam_attempts_redo_source_kind
  check (source_attempt_id is null or (attempt_kind = 'single_redo' and source_attempt_id <> id));
create index exam_attempts_redo_source on public.exam_attempts
  (source_attempt_id, submitted_at desc, id desc) where attempt_kind = 'single_redo';

update public.exam_attempts r set source_attempt_id = (
  select a.id from public.exam_attempts a
  where a.student_id = r.student_id and a.paper_id = r.paper_id
    and a.attempt_kind = 'regular' and a.status = 'submitted'
  order by (a.submitted_at <= r.started_at) desc nulls last,
    a.submitted_at desc nulls last, a.id desc limit 1
)
where r.attempt_kind = 'single_redo' and r.source_attempt_id is null
  and exists(select 1 from private.app_admins ad where ad.user_id = r.student_id);

-- 운영 최신 정의에 필요한 부분만 치환한다. 정의가 달라졌으면 조용히 누락하지 않고 실패한다.
do $$
declare patch record; def text;
begin
  for patch in select * from (values
    ('public.admin_start_single_redo(uuid,uuid)',
     'a.id = p_source_attempt_id and a.student_id',
     'a.attempt_kind = ''regular'' and a.id = p_source_attempt_id and a.student_id'),
    ('public.admin_start_single_redo(uuid,uuid)',
     'and a.attempt_kind = ''single_redo'' and a.status = ''in_progress''',
     'and a.source_attempt_id = source.id and a.attempt_kind = ''single_redo'' and a.status = ''in_progress'''),
    ('public.admin_start_single_redo(uuid,uuid)',
     'mode, elective, attempt_kind)', 'mode, elective, attempt_kind, source_attempt_id)'),
    ('public.admin_start_single_redo(uuid,uuid)',
     'source.elective, ''single_redo'')', 'source.elective, ''single_redo'', source.id)'),
    ('public.admin_list_paper_submissions(text)',
     '''answer'', i.answer, ''isCorrect'', coalesce(i.is_correct, false)',
     '''answer'', case when redo.id is not null then redo.answer else i.answer end,
        ''isCorrect'', coalesce(case when redo.id is not null then redo.is_correct else i.is_correct end, false),
        ''replayAttemptId'', coalesce(redo.id, a.id), ''isSingleRedo'', redo.id is not null'),
    ('public.admin_list_paper_submissions(text)',
     'where i.attempt_id = a.id),',
     'left join lateral (
          select r.id, ri.answer, ri.is_correct
          from public.exam_attempts r
          join public.exam_attempt_items ri on ri.attempt_id = r.id and ri.question_id = i.question_id
          where r.source_attempt_id = a.id and r.student_id = a.student_id and r.paper_id = p_paper_id
            and r.attempt_kind = ''single_redo'' and r.status = ''submitted''
            and exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)
          order by r.submitted_at desc nulls last, r.id desc limit 1
        ) redo on true
        where i.attempt_id = a.id),')
  ) as t(sig, needle, replacement) loop
    def := replace(pg_get_functiondef(patch.sig::regprocedure), E'\r', '');
    if position(patch.needle in def) = 0 then raise exception '다시 풀기 연결 수정 대상이 없습니다: %', patch.sig; end if;
    execute replace(def, patch.needle, patch.replacement);
  end loop;
end $$;
commit;
