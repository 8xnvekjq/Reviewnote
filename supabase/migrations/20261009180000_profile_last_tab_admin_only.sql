-- 최근 탭은 선생님(관리자)만 본다 — 친구들 눈치에 Pixel World 등 활동이 위축되지 않도록 학생에게는 서버에서부터 null로 내려준다.
create or replace function private.get_profile_directory()
returns table(id uuid, username text, nickname text, display_name text, school_grade text, last_seen_at timestamptz,
              equipped_title text, equipped_stamp text, last_tab text)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    profiles.id,
    split_part(coalesce(profiles.email, ''), '@', 1) as username,
    profiles.nickname,
    profiles.display_name,
    profiles.school_grade,
    profiles.last_seen_at,
    profiles.equipped_title,
    profiles.equipped_stamp,
    case when private.is_current_user_admin() then profiles.last_tab end as last_tab
  from public.profiles as profiles
  where (select auth.uid()) is not null
    and profiles.is_admin is not true;
$function$;
