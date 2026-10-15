-- 같은 교재 슬라이드를 두 반(월수금반·수토반)이 따로 듣는다: 녹음마다 반을 적는다.
-- 반을 고르기 전에 만든 녹음은 null(목록에서 '반 미지정').
begin;
alter table public.lecture_recordings add column if not exists class_name text;
alter table public.lecture_recordings drop constraint if exists lecture_recordings_class_name_check;
alter table public.lecture_recordings add constraint lecture_recordings_class_name_check
  check (class_name is null or class_name in ('월수금반', '수토반'));
commit;
