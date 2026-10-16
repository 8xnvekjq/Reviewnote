-- 2026-10-16 DB 부하·보안 정리(운영 적용: rls_initplan_and_admin_email_fix, exam_progress_lock_timeout)
-- 1) RLS 정책의 auth.uid()/auth.role()/private.is_current_user_admin()을 (select …)로 감싸 질의당 한 번만 계산
--    (advisor auth_rls_initplan 21건 — mistakes·profiles·user_items 등). 의미는 그대로.
-- 2) user_items·mistake_comments의 '이메일이 8xnvekjq로 시작하면 관리자' 판정을 private.is_current_user_admin()으로
--    (같은 접두어 아이디로 가입하면 모두의 아이템·코멘트를 볼 수 있던 구멍). 해당 정책은 authenticated에만.
-- 3) save_exam_progress에 lock_timeout 2s(필기 저장과 같은 시험 기록 잠금을 오래 기다리며 쌓이지 않게)
begin;
do $$
declare
  r record; q text; c text; sql text; email_admin boolean;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where coalesce(qual, '') || coalesce(with_check, '') ~ '(auth\.(uid|role|jwt)\(\)|private\.is_current_user_admin\(\))'
  loop
    q := r.qual; c := r.with_check;
    email_admin := coalesce(q, '') || coalesce(c, '') like '%8xnvekjq%';
    q := regexp_replace(q, '\(\(auth\.jwt\(\) ->> ''email''::text\) ~~ ''8xnvekjq%''::text\)', 'private.is_current_user_admin()', 'g');
    c := regexp_replace(c, '\(\(auth\.jwt\(\) ->> ''email''::text\) ~~ ''8xnvekjq%''::text\)', 'private.is_current_user_admin()', 'g');
    q := regexp_replace(q, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid() AS uid)', 'g');
    c := regexp_replace(c, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid() AS uid)', 'g');
    q := regexp_replace(q, '(?<!SELECT )auth\.role\(\)', '( SELECT auth.role() AS role)', 'g');
    c := regexp_replace(c, '(?<!SELECT )auth\.role\(\)', '( SELECT auth.role() AS role)', 'g');
    q := regexp_replace(q, '(?<!SELECT )private\.is_current_user_admin\(\)', '( SELECT private.is_current_user_admin() AS is_current_user_admin)', 'g');
    c := regexp_replace(c, '(?<!SELECT )private\.is_current_user_admin\(\)', '( SELECT private.is_current_user_admin() AS is_current_user_admin)', 'g');
    if q is distinct from r.qual or c is distinct from r.with_check then
      sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      if email_admin then sql := sql || ' to authenticated'; end if;
      if q is not null then sql := sql || format(' using (%s)', q); end if;
      if c is not null then sql := sql || format(' with check (%s)', c); end if;
      execute sql;
    end if;
  end loop;
end $$;
alter function public.save_exam_progress(uuid, jsonb, integer[]) set lock_timeout = '2s';
commit;

-- 운영: revoke_anon_save_pixel_room_layout — 로그인 확인이 함수 안에 있지만 anon 실행 권한도 뺀다.
revoke execute on function public.save_pixel_room_layout(jsonb) from anon, public;
grant execute on function public.save_pixel_room_layout(jsonb) to authenticated;
