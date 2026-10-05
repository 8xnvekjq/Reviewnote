begin;

-- 복습 완료 보관함과 동일한 앞 3칸 O 기준. 날짜 조건 없이 누적 집계한다.
create function public.admin_get_live_student_order(p_student_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(private.is_current_user_admin(), false) then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  if coalesce(cardinality(p_student_ids), 0) > 50 then raise exception 'EXAM_LIVE_STUDENT_LIMIT'; end if;
  if coalesce(cardinality(p_student_ids), 0) = 0 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('studentId', s.student_id, 'completedCount', coalesce(c.n, 0)) order by s.student_id)
    from (select distinct unnest(p_student_ids) student_id) s
    left join (
      select m.user_id, count(*) n from public.mistakes m
      where m.user_id = any(p_student_ids)
        and m.reviews->>0 = 'O' and m.reviews->>1 = 'O' and m.reviews->>2 = 'O'
      group by m.user_id
    ) c on c.user_id = s.student_id
    where s.student_id is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_get_live_student_order(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_get_live_student_order(uuid[]) to authenticated;

commit;
