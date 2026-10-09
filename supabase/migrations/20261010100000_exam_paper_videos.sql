-- 관리자 전용 해설 영상 링크: 시험지 × 구역(공통·확률과 통계·미적분·기하)마다 유튜브 링크 하나.
-- 학생은 읽지도 못한다(테이블 직접 접근 금지, 관리자 RPC로만).
create table if not exists public.exam_paper_videos (
  paper_id text not null references public.exam_papers(id) on delete cascade,
  section text not null check (section in ('common', '확률과 통계', '미적분', '기하')),
  url text not null check (url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/' and length(url) <= 500),
  updated_at timestamptz not null default now(),
  primary key (paper_id, section)
);
alter table public.exam_paper_videos enable row level security;
revoke all on table public.exam_paper_videos from public, anon, authenticated;

create or replace function public.admin_list_exam_paper_videos(p_paper_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_object_agg(v.section, v.url) from public.exam_paper_videos v where v.paper_id = p_paper_id), '{}'::jsonb);
end;
$function$;

create or replace function public.admin_set_exam_paper_video(p_paper_id text, p_section text, p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_url), '') is null then
    delete from public.exam_paper_videos where paper_id = p_paper_id and section = p_section;
    return;
  end if;
  insert into public.exam_paper_videos (paper_id, section, url) values (p_paper_id, p_section, btrim(p_url))
  on conflict (paper_id, section) do update set url = excluded.url, updated_at = now();
end;
$function$;

revoke all on function public.admin_list_exam_paper_videos(text) from public, anon;
revoke all on function public.admin_set_exam_paper_video(text, text, text) from public, anon;
grant execute on function public.admin_list_exam_paper_videos(text) to authenticated;
grant execute on function public.admin_set_exam_paper_video(text, text, text) to authenticated;

-- 첫 링크: 2026학년도 6월 모의평가 미적분 해설(영상 제목 "2026대비 6월 모의평가 수학영역 미적분 분석").
insert into public.exam_paper_videos (paper_id, section, url)
values ('2026-06-math', '미적분', 'https://www.youtube.com/watch?v=zBWOAOh0amQ')
on conflict (paper_id, section) do update set url = excluded.url, updated_at = now();
