begin;
alter table public.profiles add column if not exists animal_face text;
alter table public.profiles drop constraint if exists profiles_animal_face_check;
alter table public.profiles add constraint profiles_animal_face_check
  check (animal_face is null or (char_length(animal_face) <= 16 and animal_face in (
  '🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐻', '🐹', '🐧', '🐥', '🐸', '🐵', '🐷', '🐮', '🐙', '🦄',
  '🐭', '🦔', '🦦', '🦥', '🐳', '🐬', '🦭', '🐢', '🦋', '🐝', '🐞', '🦉', '🦆', '🐤', '🐣', '🦒')));

-- 교사가 지정한 동물만 저장한다. 이름이나 계정 UUID는 실시간 채널에 보내지 않는다.
update public.profiles set animal_face = case id
  when '7f91f87f-17a0-4d6f-8715-263663d00dc0'::uuid then '🦦'
  when 'f7df1fa8-8e97-49fc-a95b-b42e5fa28255'::uuid then '🦒'
  when 'cdf67bf0-5186-4810-98af-6591e87e8dfd'::uuid then '🐰'
  when '6dddcb5d-fb7b-4e41-b69e-6cc6770d280f'::uuid then '🐱' end
where id in ('7f91f87f-17a0-4d6f-8715-263663d00dc0','f7df1fa8-8e97-49fc-a95b-b42e5fa28255',
  'cdf67bf0-5186-4810-98af-6591e87e8dfd','6dddcb5d-fb7b-4e41-b69e-6cc6770d280f');

create or replace function private.user_animal_face(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.animal_face from public.profiles p where p.id = p_user_id),
    (array[
  '🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐻', '🐹', '🐧', '🐥', '🐸', '🐵', '🐷', '🐮', '🐙', '🦄',
  '🐭', '🦔', '🦦', '🦥', '🐳', '🐬', '🦭', '🐢', '🦋', '🐝', '🐞', '🦉', '🦆', '🐤', '🐣'
])[1 + (('x' || substr(md5('exam-peer-face:' || p_user_id::text),1,8))::bit(32)::bigint % 33)::integer]);
$$;
revoke all on function private.user_animal_face(uuid) from public, anon, authenticated;

create or replace function public.get_my_animal_face() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return private.user_animal_face(auth.uid());
end;
$$;
revoke all on function public.get_my_animal_face() from public, anon, authenticated;
grant execute on function public.get_my_animal_face() to authenticated;

-- 원본: 20261006120000_exam_teacher_audio.sql
create or replace function public.list_peer_solutions_v2(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🐭','🦔','🦦','🦥','🐳','🐬','🦭','🐢','🦋','🐝','🐞','🦉','🦆','🐤','🐣'];
  v_scope text := auth.uid()::text || ':' || p_question_id::text || ':' || p_attempt_id::text;
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'solutionKey', md5(v_scope || ':' || c.peer_id::text || ':' || c.revision::text),
    'label', jsonb_build_object(
      'face', case when c.teacher then '🎓' else private.user_animal_face(c.author_id) end,
      'title', case when not c.teacher then nullif(btrim(p.equipped_title),'') end,
      'grade', case when not c.teacher then nullif(btrim(p.school_grade),'') end, 'isTeacher', c.teacher),
    'timeSpentMs', c.time_spent_ms,
    'hasAudio', c.teacher and exists(select 1 from public.exam_solution_audio ac
      where ac.attempt_id=c.peer_id and ac.question_id=p_question_id)) order by c.sort_position)
    from private.exam_peer_candidates(p_attempt_id, p_question_id) c
    left join public.profiles p on p.id = c.author_id), '[]'::jsonb);
end;
$$;

-- 원본: 20261009190000_pixel_fish_board_with_teacher.sql
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
                 else private.user_animal_face(b.user_id) end,
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

revoke all on function public.list_peer_solutions_v2(uuid, uuid), pixel_private.get_class_fish_board() from public, anon, authenticated;
grant execute on function public.list_peer_solutions_v2(uuid, uuid), pixel_private.get_class_fish_board() to authenticated;

alter table public.pixel_avatar_equipment drop constraint if exists pixel_avatar_equipment_skin_tone_check;
alter table public.pixel_avatar_equipment add constraint pixel_avatar_equipment_skin_tone_check
  check (skin_tone is null or skin_tone in ('tan','sand','wheat','umber','porcelain','deep'));
CREATE OR REPLACE FUNCTION public.set_pixel_base_appearance(p_skin_tone text, p_eye_color text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_skin_tone IS NOT NULL AND p_skin_tone NOT IN ('tan', 'sand', 'wheat', 'umber', 'porcelain', 'deep') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_value', 'message', '알 수 없는 피부색이에요.');
  END IF;
  IF p_eye_color IS NOT NULL AND p_eye_color NOT IN ('navy', 'sky', 'olive', 'brown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_value', 'message', '알 수 없는 눈동자색이에요.');
  END IF;

  PERFORM set_config('reviewnote.pixel_rpc', 'true', true);

  INSERT INTO public.pixel_avatar_equipment (user_id, skin_tone, eye_color)
    VALUES (v_user, p_skin_tone, p_eye_color)
    ON CONFLICT (user_id) DO UPDATE
      SET skin_tone = EXCLUDED.skin_tone, eye_color = EXCLUDED.eye_color, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'skinTone', p_skin_tone, 'eyeColor', p_eye_color);
END;
$function$;

revoke all on function public.set_pixel_base_appearance(text, text) from public, anon, authenticated;
grant execute on function public.set_pixel_base_appearance(text, text) to authenticated;

-- 대머리는 무료 기본 선택지다. 기존 유료 헤어 소유권 검증은 그대로 둔다.
insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable)
values ('hair_bald','avatar','hair',0,'bald','대머리',1,false)
on conflict (item_id) do update set price=0,asset_key='bald',display_name='대머리';
create or replace function public.equip_pixel_bald() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform set_config('reviewnote.pixel_rpc','true',true);
  insert into public.pixel_avatar_equipment(user_id,hair) values (u,'hair_bald')
    on conflict (user_id) do update set hair=excluded.hair,updated_at=now();
  return jsonb_build_object('ok',true,'slot','hair','itemId','hair_bald');
end;
$$;
revoke all on function public.equip_pixel_bald() from public, anon, authenticated;
grant execute on function public.equip_pixel_bald() to authenticated;
commit;
