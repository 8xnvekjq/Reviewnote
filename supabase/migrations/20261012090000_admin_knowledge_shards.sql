-- 관리자 집 앞 자판기(Pixel World 앞마당)의 '지식의 조각 현황'. 읽기 전용, 관리자만.
-- 학생별 잔액·누적·최근 7일 적립·사용 합계·마지막 적립 시각과 최근 조각 사용 내역을 돌려준다.
create or replace function public.admin_knowledge_shard_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'students', coalesce((select jsonb_agg(row_to_json(s)::jsonb order by s.balance desc, s.name) from (
      select w.user_id as "userId",
        coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.display_name), ''), '이름 없음') as name,
        w.balance, w.earned_total as "earnedTotal",
        coalesce((select sum(g.amount) from public.knowledge_shard_grants g
          where g.user_id = w.user_id and g.source = 'review' and g.granted_at >= now() - interval '7 days'), 0) as "earnedWeek",
        coalesce((select sum(sp.amount) from public.knowledge_shard_spends sp where sp.user_id = w.user_id), 0) as spent,
        (select max(g.granted_at) from public.knowledge_shard_grants g where g.user_id = w.user_id and g.source = 'review') as "lastEarnedAt"
      from public.knowledge_shard_wallets w
      left join public.profiles p on p.id = w.user_id
      where not exists (select 1 from private.app_admins a where a.user_id = w.user_id)) s), '[]'::jsonb),
    'recentSpends', coalesce((select jsonb_agg(row_to_json(r)::jsonb order by r."spentAt" desc) from (
      select coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.display_name), ''), '이름 없음') as name,
        coalesce(c.display_name, case sp.item_id when 'bait_crystal' then '결정 미끼 (30회)' else sp.item_id end) as item,
        sp.amount, sp.spent_at as "spentAt"
      from public.knowledge_shard_spends sp
      left join public.profiles p on p.id = sp.user_id
      left join public.pixel_item_catalog c on c.item_id = sp.item_id
      order by sp.spent_at desc limit 20) r), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_knowledge_shard_board() from public, anon, authenticated;
grant execute on function public.admin_knowledge_shard_board() to authenticated;
