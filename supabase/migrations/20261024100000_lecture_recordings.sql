-- 교재 수업 녹음(음성 + 슬라이드·필기 기록). 화면 녹화는 하지 않는다.
-- 파일은 비공개 버킷 lecture-recordings/<녹음 uuid>/ 아래에만 두고, DB에는 목록용 작은 행만 둔다.
--   manifest.json      덱 id, 슬라이드 목록, 형식 버전, 음성 클립(시작 위치·길이·형식·파일), 필기 기록 파일 목록
--   ink-0001.json …    슬라이드 넘김·필기 기록(gzip 여부는 manifest에 적는다)
--   audio-0001.webm …  음성 조각(같은 클립의 조각을 순서대로 이으면 한 녹음)
-- 지금은 관리자만 읽고 쓴다.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lecture-recordings', 'lecture-recordings', false, 52428800,
  array['application/json', 'application/gzip', 'audio/webm', 'audio/mp4'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.lecture_recordings (
  id uuid primary key,
  deck_id uuid not null references public.lecture_decks(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  created_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  status text not null default 'recording' check (status in ('recording', 'done'))
);
create index lecture_recordings_deck_idx on public.lecture_recordings (deck_id, created_at desc);
alter table public.lecture_recordings enable row level security;
revoke all on public.lecture_recordings from public, anon, authenticated;
grant select, insert, update, delete on public.lecture_recordings to authenticated;
create policy "수업 녹음 관리자 전용" on public.lecture_recordings for all to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

-- 경로: <녹음 uuid>/(manifest.json | ink-0001.json | audio-0001.webm | audio-0001.m4a)
create policy "수업 녹음 읽기" on storage.objects for select to authenticated
using (bucket_id = 'lecture-recordings' and (select private.is_current_user_admin()));
create policy "수업 녹음 추가" on storage.objects for insert to authenticated
with check (bucket_id = 'lecture-recordings' and (select private.is_current_user_admin()) and
  name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(manifest\.json|ink-[0-9]{4,6}\.json|audio-[0-9]{4,6}\.(webm|m4a))$');
-- manifest.json은 저장할 때마다 덮어쓰고, 실패한 조각은 같은 이름으로 다시 올린다(upsert).
create policy "수업 녹음 수정" on storage.objects for update to authenticated
using (bucket_id = 'lecture-recordings' and (select private.is_current_user_admin()))
with check (bucket_id = 'lecture-recordings' and (select private.is_current_user_admin()) and
  name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(manifest\.json|ink-[0-9]{4,6}\.json|audio-[0-9]{4,6}\.(webm|m4a))$');
create policy "수업 녹음 삭제" on storage.objects for delete to authenticated
using (bucket_id = 'lecture-recordings' and (select private.is_current_user_admin()));

commit;
