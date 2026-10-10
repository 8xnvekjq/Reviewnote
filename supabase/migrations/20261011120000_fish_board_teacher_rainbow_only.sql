-- 이번주 물고기 랭킹: 선생님(어드민) 기록은 무지개 잉어(rainbow_koi)만 올라가게.
-- 기록 자체는 지우지 않고 랭킹 계산에서만 뺀다(도감·잡은 기록은 그대로).
begin;

create or replace function pixel_private.get_class_fish_board()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  v_week_start timestamptz := timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now())));
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', b.species_id, 'lengthCm', b.length_cm,
               'animal', case when b.teacher then '🎓'
                 else private.user_animal_face(b.user_id) end,
               'teacher', b.teacher,
               'caughtAt', b.caught_at) order by b.length_cm desc, b.caught_at)
        from (
          select * from (
            select distinct on (k.species_id) k.species_id, k.length_cm, k.user_id, k.caught_at, k.teacher
              from (
                select c.species_id, c.length_cm, c.user_id, c.caught_at,
                       exists (select 1 from private.app_admins ad where ad.user_id = c.user_id) as teacher
                  from public.pixel_fish_catches c
                 where c.caught_at >= v_week_start and c.caught_at < v_week_start + interval '7 days'
              ) k
             where not k.teacher or k.species_id = 'rainbow_koi'
             order by k.species_id, k.length_cm desc, k.caught_at
          ) best order by length_cm desc, caught_at limit 10
        ) b), '[]'::jsonb),
    'classSpecies', (select count(distinct k.species_id) from public.pixel_fish_catches k
                      where not exists (select 1 from private.app_admins ad where ad.user_id = k.user_id)));
end $function$;

commit;
