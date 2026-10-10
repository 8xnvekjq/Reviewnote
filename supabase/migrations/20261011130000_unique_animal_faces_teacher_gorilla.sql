-- 학생 동물 이모지가 겹치지 않게 다시 배분(배호진 🐰, 박예진 🐱 등 교사가 지정한 것은 그대로).
-- 선생님은 🦍. 물고기 랭킹도 학사모 대신 선생님 동물(🦍)을 보여 준다.
begin;
alter table public.profiles drop constraint if exists profiles_animal_face_check;
alter table public.profiles add constraint profiles_animal_face_check
  check (animal_face is null or (char_length(animal_face) <= 16 and animal_face in (
  '🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐻', '🐹', '🐧', '🐥', '🐸', '🐵', '🐷', '🐮', '🐙', '🦄',
  '🐭', '🦔', '🦦', '🦥', '🐳', '🐬', '🦭', '🐢', '🦋', '🐝', '🐞', '🦉', '🦆', '🐤', '🐣', '🦒', '🦍')));

update public.profiles set animal_face = case id
  when '50b0db29-89b6-4601-bfd9-a17c5c81137b'::uuid then '🦍' -- 선생님
  when 'b5cb7196-d979-4e00-86be-3517d8c813c3'::uuid then '🐶' -- 🐙 겹침
  when '9705e0ac-d552-403e-98e2-604d4f46a992'::uuid then '🦊' -- 🐙 겹침
  when '96d5792b-646a-4944-9ff7-7a74738561c5'::uuid then '🐨' -- 🐰 겹침
  when '5888a1b5-5d18-4dfa-a64a-bba88118d98b'::uuid then '🐻' -- 🐰 겹침
  when '4825dce7-f05b-4029-b5da-d80075852804'::uuid then '🐧' -- 🐱 겹침
  when 'e8bca5f8-a3f9-4696-8b98-1dcb85db4337'::uuid then '🐥' -- 🐱 겹침
  when '3d5873a6-4133-4bb3-81ce-ca781c273518'::uuid then '🐸' -- 🐭 겹침
  when '6c82518c-3a99-4b76-b695-2a5433fae2ae'::uuid then '🦄' -- 🐳 겹침
  when '3c0dccb5-78b2-4235-bac0-456155e925d6'::uuid then '🦥' -- 🦁 겹침
  end
where id in ('50b0db29-89b6-4601-bfd9-a17c5c81137b','b5cb7196-d979-4e00-86be-3517d8c813c3','9705e0ac-d552-403e-98e2-604d4f46a992',
  '96d5792b-646a-4944-9ff7-7a74738561c5','5888a1b5-5d18-4dfa-a64a-bba88118d98b','4825dce7-f05b-4029-b5da-d80075852804',
  'e8bca5f8-a3f9-4696-8b98-1dcb85db4337','3d5873a6-4133-4bb3-81ce-ca781c273518','6c82518c-3a99-4b76-b695-2a5433fae2ae',
  '3c0dccb5-78b2-4235-bac0-456155e925d6');

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
               'animal', private.user_animal_face(b.user_id),
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
