-- 공부 중인 친구들 팝업에 "가장 최근에 연 탭"을 작게 보여 준다.
-- 새 주기 작업 없음: 탭을 바꿀 때만 본인 행에 last_tab을 한 번 쓰고, 기존 30초 디렉터리 폴링이 함께 읽어 간다.
alter table public.profiles add column if not exists last_tab text
  check (last_tab is null or last_tab ~ '^[A-Za-z]{1,32}$');
grant update (last_tab) on public.profiles to authenticated;

-- 반환 열이 늘어나 함수를 다시 만든다(기존 열 순서 유지, last_tab은 맨 뒤).
drop function if exists public.get_profile_directory();
drop function if exists private.get_profile_directory();

create function private.get_profile_directory()
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
    profiles.last_tab
  from public.profiles as profiles
  where (select auth.uid()) is not null
    and profiles.is_admin is not true;
$function$;
revoke all on function private.get_profile_directory() from public, anon;
grant execute on function private.get_profile_directory() to authenticated;

create function public.get_profile_directory()
returns table(id uuid, username text, nickname text, display_name text, school_grade text, last_seen_at timestamptz,
              equipped_title text, equipped_stamp text, last_tab text)
language sql
stable
set search_path = ''
as $function$
  select * from private.get_profile_directory();
$function$;
revoke all on function public.get_profile_directory() from public, anon;
grant execute on function public.get_profile_directory() to authenticated;
