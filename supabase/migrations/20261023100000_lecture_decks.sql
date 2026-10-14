-- 개념원리 교재 스캔 슬라이드(수업자료 '교재' 덱). 저장소가 공개 저장소이므로 이미지는
-- 비공개 버킷에만 두고, DB에는 덱 정보와 슬라이드 목록(JSON)만 작게 저장한다.
-- 지금은 관리자만 읽고 쓴다(학생 공개는 이후 단계에서 published 기준으로 연다).
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lecture-slides', 'lecture-slides', false, 5242880, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- slides: [{ id, path, section, label, bookPage }] (배열 순서 = 슬라이드 순서).
-- id는 이후 수업 녹화(1920×1080 좌표의 필기)가 슬라이드를 가리키는 고정 키다.
create table public.lecture_decks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  grade text not null check (grade in ('예비고1', '고1', '고2', '고3')),
  book text not null default '' check (char_length(book) <= 100),
  chapter text not null default '' check (char_length(chapter) <= 100),
  slides jsonb not null default '[]'::jsonb
    check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) between 1 and 300),
  created_at timestamptz not null default now(),
  published boolean not null default false
);
alter table public.lecture_decks enable row level security;
revoke all on public.lecture_decks from public, anon, authenticated;
grant select, insert, update, delete on public.lecture_decks to authenticated;
create policy "교재 덱 관리자 전용" on public.lecture_decks for all to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

-- 경로: <덱 uuid>/<슬라이드 uuid>.(webp|png|jpg)
create policy "교재 슬라이드 읽기" on storage.objects for select to authenticated
using (bucket_id = 'lecture-slides' and (select private.is_current_user_admin()));
create policy "교재 슬라이드 추가" on storage.objects for insert to authenticated
with check (bucket_id = 'lecture-slides' and (select private.is_current_user_admin()) and
  name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$');
create policy "교재 슬라이드 수정" on storage.objects for update to authenticated
using (bucket_id = 'lecture-slides' and (select private.is_current_user_admin()))
with check (bucket_id = 'lecture-slides' and (select private.is_current_user_admin()));
create policy "교재 슬라이드 삭제" on storage.objects for delete to authenticated
using (bucket_id = 'lecture-slides' and (select private.is_current_user_admin()));

commit;
