-- 이번 주 물고기 랭킹에 선생님(관리자) 기록도 올린다. 선생님 줄은 teacher=true로 표시하고(🎓), 학생은 기존처럼 익명 동물 얼굴.
-- "우리 반이 찾은 물고기" 종 수(classSpecies)는 학생 기록만 센다(선생님 시험 낚시로 부풀지 않게).
create or replace function pixel_private.get_class_fish_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  v_week_start timestamptz := timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now())));
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🐭','🦔','🦦','🦥','🐳','🐬','🦭','🐢','🦋','🐝','🐞','🦉','🦆','🐤','🐣'];
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', b.species_id, 'lengthCm', b.length_cm,
               'animal', case when b.teacher then '🎓'
                 else v_faces[1 + (('x' || substr(md5('exam-peer-face:' || b.user_id::text), 1, 8))::bit(32)::bigint % array_length(v_faces, 1))::integer] end,
               'teacher', b.teacher,
               'caughtAt', b.caught_at) order by b.length_cm desc, b.caught_at)
        from (
          select * from (
            select distinct on (k.species_id) k.species_id, k.length_cm, k.user_id, k.caught_at,
                   exists (select 1 from private.app_admins ad where ad.user_id = k.user_id) as teacher
              from public.pixel_fish_catches k
             where k.caught_at >= v_week_start and k.caught_at < v_week_start + interval '7 days'
             order by k.species_id, k.length_cm desc, k.caught_at
          ) best order by length_cm desc, caught_at limit 10
        ) b), '[]'::jsonb),
    'classSpecies', (select count(distinct k.species_id) from public.pixel_fish_catches k
                      where not exists (select 1 from private.app_admins ad where ad.user_id = k.user_id)));
end $function$;
