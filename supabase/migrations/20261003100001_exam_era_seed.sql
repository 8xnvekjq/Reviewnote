begin;
-- prehistory: 14 questions
update public.exam_papers set published = false where practice_era = 'prehistory' and id <> 'hanneung-era-prehistory-32b4e9281717';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-prehistory-32b4e9281717','선사·초기 국가 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',14,14,'advanced','prehistory') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 1, 74),
(2, '2025-hanneung-74-advanced', 2, 74),
(3, '2025-hanneung-75-advanced', 1, 75),
(4, '2025-hanneung-75-advanced', 2, 75),
(5, '2025-hanneung-76-advanced', 1, 76),
(6, '2025-hanneung-76-advanced', 2, 76),
(7, '2026-hanneung-77-advanced', 1, 77),
(8, '2026-hanneung-77-advanced', 2, 77),
(9, '2026-hanneung-77-advanced', 3, 77),
(10, '2026-hanneung-78-advanced', 1, 78),
(11, '2026-hanneung-78-advanced', 2, 78),
(12, '2026-hanneung-78-advanced', 3, 78),
(13, '2026-hanneung-79-advanced', 1, 79),
(14, '2026-hanneung-79-advanced', 2, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 14 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: prehistory';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-prehistory-32b4e9281717',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 1, 74),
(2, '2025-hanneung-74-advanced', 2, 74),
(3, '2025-hanneung-75-advanced', 1, 75),
(4, '2025-hanneung-75-advanced', 2, 75),
(5, '2025-hanneung-76-advanced', 1, 76),
(6, '2025-hanneung-76-advanced', 2, 76),
(7, '2026-hanneung-77-advanced', 1, 77),
(8, '2026-hanneung-77-advanced', 2, 77),
(9, '2026-hanneung-77-advanced', 3, 77),
(10, '2026-hanneung-78-advanced', 1, 78),
(11, '2026-hanneung-78-advanced', 2, 78),
(12, '2026-hanneung-78-advanced', 3, 78),
(13, '2026-hanneung-79-advanced', 1, 79),
(14, '2026-hanneung-79-advanced', 2, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-prehistory-32b4e9281717' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-prehistory-32b4e9281717' and not p.published) where id='hanneung-era-prehistory-32b4e9281717';
-- three-kingdoms: 21 questions
update public.exam_papers set published = false where practice_era = 'three-kingdoms' and id <> 'hanneung-era-three-kingdoms-b848df210086';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-three-kingdoms-b848df210086','삼국·가야 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',21,21,'advanced','three-kingdoms') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 3, 74),
(2, '2025-hanneung-74-advanced', 4, 74),
(3, '2025-hanneung-74-advanced', 5, 74),
(4, '2025-hanneung-75-advanced', 3, 75),
(5, '2025-hanneung-75-advanced', 4, 75),
(6, '2025-hanneung-75-advanced', 5, 75),
(7, '2025-hanneung-75-advanced', 7, 75),
(8, '2025-hanneung-75-advanced', 9, 75),
(9, '2025-hanneung-76-advanced', 3, 76),
(10, '2025-hanneung-76-advanced', 4, 76),
(11, '2026-hanneung-77-advanced', 4, 77),
(12, '2026-hanneung-77-advanced', 5, 77),
(13, '2026-hanneung-77-advanced', 6, 77),
(14, '2026-hanneung-77-advanced', 8, 77),
(15, '2026-hanneung-78-advanced', 4, 78),
(16, '2026-hanneung-78-advanced', 5, 78),
(17, '2026-hanneung-78-advanced', 6, 78),
(18, '2026-hanneung-78-advanced', 7, 78),
(19, '2026-hanneung-79-advanced', 3, 79),
(20, '2026-hanneung-79-advanced', 4, 79),
(21, '2026-hanneung-79-advanced', 6, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 21 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: three-kingdoms';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-three-kingdoms-b848df210086',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 3, 74),
(2, '2025-hanneung-74-advanced', 4, 74),
(3, '2025-hanneung-74-advanced', 5, 74),
(4, '2025-hanneung-75-advanced', 3, 75),
(5, '2025-hanneung-75-advanced', 4, 75),
(6, '2025-hanneung-75-advanced', 5, 75),
(7, '2025-hanneung-75-advanced', 7, 75),
(8, '2025-hanneung-75-advanced', 9, 75),
(9, '2025-hanneung-76-advanced', 3, 76),
(10, '2025-hanneung-76-advanced', 4, 76),
(11, '2026-hanneung-77-advanced', 4, 77),
(12, '2026-hanneung-77-advanced', 5, 77),
(13, '2026-hanneung-77-advanced', 6, 77),
(14, '2026-hanneung-77-advanced', 8, 77),
(15, '2026-hanneung-78-advanced', 4, 78),
(16, '2026-hanneung-78-advanced', 5, 78),
(17, '2026-hanneung-78-advanced', 6, 78),
(18, '2026-hanneung-78-advanced', 7, 78),
(19, '2026-hanneung-79-advanced', 3, 79),
(20, '2026-hanneung-79-advanced', 4, 79),
(21, '2026-hanneung-79-advanced', 6, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-three-kingdoms-b848df210086' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-three-kingdoms-b848df210086' and not p.published) where id='hanneung-era-three-kingdoms-b848df210086';
-- north-south: 25 questions
update public.exam_papers set published = false where practice_era = 'north-south' and id <> 'hanneung-era-north-south-9232b10c1bac';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-north-south-9232b10c1bac','남북국 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',25,25,'advanced','north-south') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 6, 74),
(2, '2025-hanneung-74-advanced', 7, 74),
(3, '2025-hanneung-74-advanced', 8, 74),
(4, '2025-hanneung-74-advanced', 9, 74),
(5, '2025-hanneung-74-advanced', 10, 74),
(6, '2025-hanneung-75-advanced', 6, 75),
(7, '2025-hanneung-75-advanced', 8, 75),
(8, '2025-hanneung-75-advanced', 10, 75),
(9, '2025-hanneung-76-advanced', 5, 76),
(10, '2025-hanneung-76-advanced', 6, 76),
(11, '2025-hanneung-76-advanced', 7, 76),
(12, '2025-hanneung-76-advanced', 8, 76),
(13, '2025-hanneung-76-advanced', 9, 76),
(14, '2025-hanneung-76-advanced', 10, 76),
(15, '2026-hanneung-77-advanced', 7, 77),
(16, '2026-hanneung-77-advanced', 9, 77),
(17, '2026-hanneung-77-advanced', 10, 77),
(18, '2026-hanneung-78-advanced', 8, 78),
(19, '2026-hanneung-78-advanced', 9, 78),
(20, '2026-hanneung-78-advanced', 10, 78),
(21, '2026-hanneung-79-advanced', 5, 79),
(22, '2026-hanneung-79-advanced', 7, 79),
(23, '2026-hanneung-79-advanced', 8, 79),
(24, '2026-hanneung-79-advanced', 9, 79),
(25, '2026-hanneung-79-advanced', 10, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 25 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: north-south';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-north-south-9232b10c1bac',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 6, 74),
(2, '2025-hanneung-74-advanced', 7, 74),
(3, '2025-hanneung-74-advanced', 8, 74),
(4, '2025-hanneung-74-advanced', 9, 74),
(5, '2025-hanneung-74-advanced', 10, 74),
(6, '2025-hanneung-75-advanced', 6, 75),
(7, '2025-hanneung-75-advanced', 8, 75),
(8, '2025-hanneung-75-advanced', 10, 75),
(9, '2025-hanneung-76-advanced', 5, 76),
(10, '2025-hanneung-76-advanced', 6, 76),
(11, '2025-hanneung-76-advanced', 7, 76),
(12, '2025-hanneung-76-advanced', 8, 76),
(13, '2025-hanneung-76-advanced', 9, 76),
(14, '2025-hanneung-76-advanced', 10, 76),
(15, '2026-hanneung-77-advanced', 7, 77),
(16, '2026-hanneung-77-advanced', 9, 77),
(17, '2026-hanneung-77-advanced', 10, 77),
(18, '2026-hanneung-78-advanced', 8, 78),
(19, '2026-hanneung-78-advanced', 9, 78),
(20, '2026-hanneung-78-advanced', 10, 78),
(21, '2026-hanneung-79-advanced', 5, 79),
(22, '2026-hanneung-79-advanced', 7, 79),
(23, '2026-hanneung-79-advanced', 8, 79),
(24, '2026-hanneung-79-advanced', 9, 79),
(25, '2026-hanneung-79-advanced', 10, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-north-south-9232b10c1bac' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-north-south-9232b10c1bac' and not p.published) where id='hanneung-era-north-south-9232b10c1bac';
-- goryeo: 47 questions
update public.exam_papers set published = false where practice_era = 'goryeo' and id <> 'hanneung-era-goryeo-8f9e8092aad9';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-goryeo-8f9e8092aad9','고려 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',47,47,'advanced','goryeo') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 11, 74),
(2, '2025-hanneung-74-advanced', 12, 74),
(3, '2025-hanneung-74-advanced', 13, 74),
(4, '2025-hanneung-74-advanced', 14, 74),
(5, '2025-hanneung-74-advanced', 15, 74),
(6, '2025-hanneung-74-advanced', 16, 74),
(7, '2025-hanneung-74-advanced', 17, 74),
(8, '2025-hanneung-74-advanced', 18, 74),
(9, '2025-hanneung-75-advanced', 11, 75),
(10, '2025-hanneung-75-advanced', 12, 75),
(11, '2025-hanneung-75-advanced', 13, 75),
(12, '2025-hanneung-75-advanced', 14, 75),
(13, '2025-hanneung-75-advanced', 15, 75),
(14, '2025-hanneung-75-advanced', 16, 75),
(15, '2025-hanneung-75-advanced', 17, 75),
(16, '2025-hanneung-75-advanced', 18, 75),
(17, '2025-hanneung-76-advanced', 11, 76),
(18, '2025-hanneung-76-advanced', 12, 76),
(19, '2025-hanneung-76-advanced', 13, 76),
(20, '2025-hanneung-76-advanced', 14, 76),
(21, '2025-hanneung-76-advanced', 15, 76),
(22, '2025-hanneung-76-advanced', 16, 76),
(23, '2025-hanneung-76-advanced', 17, 76),
(24, '2025-hanneung-76-advanced', 18, 76),
(25, '2026-hanneung-77-advanced', 11, 77),
(26, '2026-hanneung-77-advanced', 13, 77),
(27, '2026-hanneung-77-advanced', 14, 77),
(28, '2026-hanneung-77-advanced', 15, 77),
(29, '2026-hanneung-77-advanced', 16, 77),
(30, '2026-hanneung-77-advanced', 17, 77),
(31, '2026-hanneung-77-advanced', 18, 77),
(32, '2026-hanneung-78-advanced', 11, 78),
(33, '2026-hanneung-78-advanced', 12, 78),
(34, '2026-hanneung-78-advanced', 13, 78),
(35, '2026-hanneung-78-advanced', 14, 78),
(36, '2026-hanneung-78-advanced', 15, 78),
(37, '2026-hanneung-78-advanced', 16, 78),
(38, '2026-hanneung-78-advanced', 17, 78),
(39, '2026-hanneung-78-advanced', 18, 78),
(40, '2026-hanneung-79-advanced', 11, 79),
(41, '2026-hanneung-79-advanced', 12, 79),
(42, '2026-hanneung-79-advanced', 13, 79),
(43, '2026-hanneung-79-advanced', 14, 79),
(44, '2026-hanneung-79-advanced', 15, 79),
(45, '2026-hanneung-79-advanced', 16, 79),
(46, '2026-hanneung-79-advanced', 17, 79),
(47, '2026-hanneung-79-advanced', 18, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 47 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: goryeo';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-goryeo-8f9e8092aad9',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 11, 74),
(2, '2025-hanneung-74-advanced', 12, 74),
(3, '2025-hanneung-74-advanced', 13, 74),
(4, '2025-hanneung-74-advanced', 14, 74),
(5, '2025-hanneung-74-advanced', 15, 74),
(6, '2025-hanneung-74-advanced', 16, 74),
(7, '2025-hanneung-74-advanced', 17, 74),
(8, '2025-hanneung-74-advanced', 18, 74),
(9, '2025-hanneung-75-advanced', 11, 75),
(10, '2025-hanneung-75-advanced', 12, 75),
(11, '2025-hanneung-75-advanced', 13, 75),
(12, '2025-hanneung-75-advanced', 14, 75),
(13, '2025-hanneung-75-advanced', 15, 75),
(14, '2025-hanneung-75-advanced', 16, 75),
(15, '2025-hanneung-75-advanced', 17, 75),
(16, '2025-hanneung-75-advanced', 18, 75),
(17, '2025-hanneung-76-advanced', 11, 76),
(18, '2025-hanneung-76-advanced', 12, 76),
(19, '2025-hanneung-76-advanced', 13, 76),
(20, '2025-hanneung-76-advanced', 14, 76),
(21, '2025-hanneung-76-advanced', 15, 76),
(22, '2025-hanneung-76-advanced', 16, 76),
(23, '2025-hanneung-76-advanced', 17, 76),
(24, '2025-hanneung-76-advanced', 18, 76),
(25, '2026-hanneung-77-advanced', 11, 77),
(26, '2026-hanneung-77-advanced', 13, 77),
(27, '2026-hanneung-77-advanced', 14, 77),
(28, '2026-hanneung-77-advanced', 15, 77),
(29, '2026-hanneung-77-advanced', 16, 77),
(30, '2026-hanneung-77-advanced', 17, 77),
(31, '2026-hanneung-77-advanced', 18, 77),
(32, '2026-hanneung-78-advanced', 11, 78),
(33, '2026-hanneung-78-advanced', 12, 78),
(34, '2026-hanneung-78-advanced', 13, 78),
(35, '2026-hanneung-78-advanced', 14, 78),
(36, '2026-hanneung-78-advanced', 15, 78),
(37, '2026-hanneung-78-advanced', 16, 78),
(38, '2026-hanneung-78-advanced', 17, 78),
(39, '2026-hanneung-78-advanced', 18, 78),
(40, '2026-hanneung-79-advanced', 11, 79),
(41, '2026-hanneung-79-advanced', 12, 79),
(42, '2026-hanneung-79-advanced', 13, 79),
(43, '2026-hanneung-79-advanced', 14, 79),
(44, '2026-hanneung-79-advanced', 15, 79),
(45, '2026-hanneung-79-advanced', 16, 79),
(46, '2026-hanneung-79-advanced', 17, 79),
(47, '2026-hanneung-79-advanced', 18, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-goryeo-8f9e8092aad9' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-goryeo-8f9e8092aad9' and not p.published) where id='hanneung-era-goryeo-8f9e8092aad9';
-- joseon-early: 25 questions
update public.exam_papers set published = false where practice_era = 'joseon-early' and id <> 'hanneung-era-joseon-early-af779d7deace';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-joseon-early-af779d7deace','조선 전기 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',25,25,'advanced','joseon-early') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 19, 74),
(2, '2025-hanneung-74-advanced', 20, 74),
(3, '2025-hanneung-74-advanced', 21, 74),
(4, '2025-hanneung-74-advanced', 23, 74),
(5, '2025-hanneung-75-advanced', 19, 75),
(6, '2025-hanneung-75-advanced', 20, 75),
(7, '2025-hanneung-75-advanced', 21, 75),
(8, '2025-hanneung-75-advanced', 22, 75),
(9, '2025-hanneung-75-advanced', 23, 75),
(10, '2025-hanneung-76-advanced', 19, 76),
(11, '2025-hanneung-76-advanced', 20, 76),
(12, '2025-hanneung-76-advanced', 21, 76),
(13, '2025-hanneung-76-advanced', 22, 76),
(14, '2026-hanneung-77-advanced', 19, 77),
(15, '2026-hanneung-77-advanced', 20, 77),
(16, '2026-hanneung-77-advanced', 21, 77),
(17, '2026-hanneung-77-advanced', 22, 77),
(18, '2026-hanneung-78-advanced', 19, 78),
(19, '2026-hanneung-78-advanced', 20, 78),
(20, '2026-hanneung-78-advanced', 21, 78),
(21, '2026-hanneung-78-advanced', 22, 78),
(22, '2026-hanneung-79-advanced', 19, 79),
(23, '2026-hanneung-79-advanced', 20, 79),
(24, '2026-hanneung-79-advanced', 22, 79),
(25, '2026-hanneung-79-advanced', 24, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 25 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: joseon-early';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-joseon-early-af779d7deace',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 19, 74),
(2, '2025-hanneung-74-advanced', 20, 74),
(3, '2025-hanneung-74-advanced', 21, 74),
(4, '2025-hanneung-74-advanced', 23, 74),
(5, '2025-hanneung-75-advanced', 19, 75),
(6, '2025-hanneung-75-advanced', 20, 75),
(7, '2025-hanneung-75-advanced', 21, 75),
(8, '2025-hanneung-75-advanced', 22, 75),
(9, '2025-hanneung-75-advanced', 23, 75),
(10, '2025-hanneung-76-advanced', 19, 76),
(11, '2025-hanneung-76-advanced', 20, 76),
(12, '2025-hanneung-76-advanced', 21, 76),
(13, '2025-hanneung-76-advanced', 22, 76),
(14, '2026-hanneung-77-advanced', 19, 77),
(15, '2026-hanneung-77-advanced', 20, 77),
(16, '2026-hanneung-77-advanced', 21, 77),
(17, '2026-hanneung-77-advanced', 22, 77),
(18, '2026-hanneung-78-advanced', 19, 78),
(19, '2026-hanneung-78-advanced', 20, 78),
(20, '2026-hanneung-78-advanced', 21, 78),
(21, '2026-hanneung-78-advanced', 22, 78),
(22, '2026-hanneung-79-advanced', 19, 79),
(23, '2026-hanneung-79-advanced', 20, 79),
(24, '2026-hanneung-79-advanced', 22, 79),
(25, '2026-hanneung-79-advanced', 24, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-joseon-early-af779d7deace' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-joseon-early-af779d7deace' and not p.published) where id='hanneung-era-joseon-early-af779d7deace';
-- joseon-late: 29 questions
update public.exam_papers set published = false where practice_era = 'joseon-late' and id <> 'hanneung-era-joseon-late-325575954f50';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-joseon-late-325575954f50','조선 후기 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',29,29,'advanced','joseon-late') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 22, 74),
(2, '2025-hanneung-74-advanced', 24, 74),
(3, '2025-hanneung-74-advanced', 25, 74),
(4, '2025-hanneung-74-advanced', 26, 74),
(5, '2025-hanneung-74-advanced', 27, 74),
(6, '2025-hanneung-75-advanced', 24, 75),
(7, '2025-hanneung-75-advanced', 25, 75),
(8, '2025-hanneung-75-advanced', 26, 75),
(9, '2025-hanneung-75-advanced', 27, 75),
(10, '2025-hanneung-76-advanced', 23, 76),
(11, '2025-hanneung-76-advanced', 24, 76),
(12, '2025-hanneung-76-advanced', 25, 76),
(13, '2025-hanneung-76-advanced', 26, 76),
(14, '2025-hanneung-76-advanced', 27, 76),
(15, '2026-hanneung-77-advanced', 23, 77),
(16, '2026-hanneung-77-advanced', 24, 77),
(17, '2026-hanneung-77-advanced', 25, 77),
(18, '2026-hanneung-77-advanced', 26, 77),
(19, '2026-hanneung-77-advanced', 28, 77),
(20, '2026-hanneung-78-advanced', 23, 78),
(21, '2026-hanneung-78-advanced', 24, 78),
(22, '2026-hanneung-78-advanced', 25, 78),
(23, '2026-hanneung-78-advanced', 26, 78),
(24, '2026-hanneung-78-advanced', 27, 78),
(25, '2026-hanneung-79-advanced', 21, 79),
(26, '2026-hanneung-79-advanced', 23, 79),
(27, '2026-hanneung-79-advanced', 25, 79),
(28, '2026-hanneung-79-advanced', 26, 79),
(29, '2026-hanneung-79-advanced', 27, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 29 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: joseon-late';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-joseon-late-325575954f50',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 22, 74),
(2, '2025-hanneung-74-advanced', 24, 74),
(3, '2025-hanneung-74-advanced', 25, 74),
(4, '2025-hanneung-74-advanced', 26, 74),
(5, '2025-hanneung-74-advanced', 27, 74),
(6, '2025-hanneung-75-advanced', 24, 75),
(7, '2025-hanneung-75-advanced', 25, 75),
(8, '2025-hanneung-75-advanced', 26, 75),
(9, '2025-hanneung-75-advanced', 27, 75),
(10, '2025-hanneung-76-advanced', 23, 76),
(11, '2025-hanneung-76-advanced', 24, 76),
(12, '2025-hanneung-76-advanced', 25, 76),
(13, '2025-hanneung-76-advanced', 26, 76),
(14, '2025-hanneung-76-advanced', 27, 76),
(15, '2026-hanneung-77-advanced', 23, 77),
(16, '2026-hanneung-77-advanced', 24, 77),
(17, '2026-hanneung-77-advanced', 25, 77),
(18, '2026-hanneung-77-advanced', 26, 77),
(19, '2026-hanneung-77-advanced', 28, 77),
(20, '2026-hanneung-78-advanced', 23, 78),
(21, '2026-hanneung-78-advanced', 24, 78),
(22, '2026-hanneung-78-advanced', 25, 78),
(23, '2026-hanneung-78-advanced', 26, 78),
(24, '2026-hanneung-78-advanced', 27, 78),
(25, '2026-hanneung-79-advanced', 21, 79),
(26, '2026-hanneung-79-advanced', 23, 79),
(27, '2026-hanneung-79-advanced', 25, 79),
(28, '2026-hanneung-79-advanced', 26, 79),
(29, '2026-hanneung-79-advanced', 27, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-joseon-late-325575954f50' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-joseon-late-325575954f50' and not p.published) where id='hanneung-era-joseon-late-325575954f50';
-- opening: 41 questions
update public.exam_papers set published = false where practice_era = 'opening' and id <> 'hanneung-era-opening-a2abe1fc4183';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-opening-a2abe1fc4183','개항기·대한제국 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',41,41,'advanced','opening') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 28, 74),
(2, '2025-hanneung-74-advanced', 29, 74),
(3, '2025-hanneung-74-advanced', 30, 74),
(4, '2025-hanneung-74-advanced', 31, 74),
(5, '2025-hanneung-74-advanced', 32, 74),
(6, '2025-hanneung-74-advanced', 34, 74),
(7, '2025-hanneung-74-advanced', 35, 74),
(8, '2025-hanneung-75-advanced', 28, 75),
(9, '2025-hanneung-75-advanced', 29, 75),
(10, '2025-hanneung-75-advanced', 30, 75),
(11, '2025-hanneung-75-advanced', 31, 75),
(12, '2025-hanneung-75-advanced', 32, 75),
(13, '2025-hanneung-75-advanced', 33, 75),
(14, '2025-hanneung-76-advanced', 28, 76),
(15, '2025-hanneung-76-advanced', 29, 76),
(16, '2025-hanneung-76-advanced', 30, 76),
(17, '2025-hanneung-76-advanced', 31, 76),
(18, '2025-hanneung-76-advanced', 32, 76),
(19, '2025-hanneung-76-advanced', 33, 76),
(20, '2025-hanneung-76-advanced', 34, 76),
(21, '2025-hanneung-76-advanced', 35, 76),
(22, '2026-hanneung-77-advanced', 29, 77),
(23, '2026-hanneung-77-advanced', 30, 77),
(24, '2026-hanneung-77-advanced', 31, 77),
(25, '2026-hanneung-77-advanced', 33, 77),
(26, '2026-hanneung-77-advanced', 35, 77),
(27, '2026-hanneung-78-advanced', 28, 78),
(28, '2026-hanneung-78-advanced', 29, 78),
(29, '2026-hanneung-78-advanced', 30, 78),
(30, '2026-hanneung-78-advanced', 31, 78),
(31, '2026-hanneung-78-advanced', 32, 78),
(32, '2026-hanneung-78-advanced', 33, 78),
(33, '2026-hanneung-78-advanced', 34, 78),
(34, '2026-hanneung-79-advanced', 28, 79),
(35, '2026-hanneung-79-advanced', 29, 79),
(36, '2026-hanneung-79-advanced', 30, 79),
(37, '2026-hanneung-79-advanced', 31, 79),
(38, '2026-hanneung-79-advanced', 32, 79),
(39, '2026-hanneung-79-advanced', 33, 79),
(40, '2026-hanneung-79-advanced', 34, 79),
(41, '2026-hanneung-79-advanced', 35, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 41 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: opening';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-opening-a2abe1fc4183',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 28, 74),
(2, '2025-hanneung-74-advanced', 29, 74),
(3, '2025-hanneung-74-advanced', 30, 74),
(4, '2025-hanneung-74-advanced', 31, 74),
(5, '2025-hanneung-74-advanced', 32, 74),
(6, '2025-hanneung-74-advanced', 34, 74),
(7, '2025-hanneung-74-advanced', 35, 74),
(8, '2025-hanneung-75-advanced', 28, 75),
(9, '2025-hanneung-75-advanced', 29, 75),
(10, '2025-hanneung-75-advanced', 30, 75),
(11, '2025-hanneung-75-advanced', 31, 75),
(12, '2025-hanneung-75-advanced', 32, 75),
(13, '2025-hanneung-75-advanced', 33, 75),
(14, '2025-hanneung-76-advanced', 28, 76),
(15, '2025-hanneung-76-advanced', 29, 76),
(16, '2025-hanneung-76-advanced', 30, 76),
(17, '2025-hanneung-76-advanced', 31, 76),
(18, '2025-hanneung-76-advanced', 32, 76),
(19, '2025-hanneung-76-advanced', 33, 76),
(20, '2025-hanneung-76-advanced', 34, 76),
(21, '2025-hanneung-76-advanced', 35, 76),
(22, '2026-hanneung-77-advanced', 29, 77),
(23, '2026-hanneung-77-advanced', 30, 77),
(24, '2026-hanneung-77-advanced', 31, 77),
(25, '2026-hanneung-77-advanced', 33, 77),
(26, '2026-hanneung-77-advanced', 35, 77),
(27, '2026-hanneung-78-advanced', 28, 78),
(28, '2026-hanneung-78-advanced', 29, 78),
(29, '2026-hanneung-78-advanced', 30, 78),
(30, '2026-hanneung-78-advanced', 31, 78),
(31, '2026-hanneung-78-advanced', 32, 78),
(32, '2026-hanneung-78-advanced', 33, 78),
(33, '2026-hanneung-78-advanced', 34, 78),
(34, '2026-hanneung-79-advanced', 28, 79),
(35, '2026-hanneung-79-advanced', 29, 79),
(36, '2026-hanneung-79-advanced', 30, 79),
(37, '2026-hanneung-79-advanced', 31, 79),
(38, '2026-hanneung-79-advanced', 32, 79),
(39, '2026-hanneung-79-advanced', 33, 79),
(40, '2026-hanneung-79-advanced', 34, 79),
(41, '2026-hanneung-79-advanced', 35, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-opening-a2abe1fc4183' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-opening-a2abe1fc4183' and not p.published) where id='hanneung-era-opening-a2abe1fc4183';
-- colonial: 57 questions
update public.exam_papers set published = false where practice_era = 'colonial' and id <> 'hanneung-era-colonial-402c2cff5418';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-colonial-402c2cff5418','일제 강점기 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',57,57,'advanced','colonial') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 33, 74),
(2, '2025-hanneung-74-advanced', 36, 74),
(3, '2025-hanneung-74-advanced', 37, 74),
(4, '2025-hanneung-74-advanced', 38, 74),
(5, '2025-hanneung-74-advanced', 39, 74),
(6, '2025-hanneung-74-advanced', 40, 74),
(7, '2025-hanneung-74-advanced', 41, 74),
(8, '2025-hanneung-74-advanced', 42, 74),
(9, '2025-hanneung-74-advanced', 43, 74),
(10, '2025-hanneung-75-advanced', 34, 75),
(11, '2025-hanneung-75-advanced', 35, 75),
(12, '2025-hanneung-75-advanced', 36, 75),
(13, '2025-hanneung-75-advanced', 37, 75),
(14, '2025-hanneung-75-advanced', 39, 75),
(15, '2025-hanneung-75-advanced', 40, 75),
(16, '2025-hanneung-75-advanced', 41, 75),
(17, '2025-hanneung-75-advanced', 42, 75),
(18, '2025-hanneung-75-advanced', 43, 75),
(19, '2025-hanneung-75-advanced', 44, 75),
(20, '2025-hanneung-76-advanced', 36, 76),
(21, '2025-hanneung-76-advanced', 37, 76),
(22, '2025-hanneung-76-advanced', 38, 76),
(23, '2025-hanneung-76-advanced', 39, 76),
(24, '2025-hanneung-76-advanced', 40, 76),
(25, '2025-hanneung-76-advanced', 41, 76),
(26, '2025-hanneung-76-advanced', 42, 76),
(27, '2025-hanneung-76-advanced', 43, 76),
(28, '2026-hanneung-77-advanced', 32, 77),
(29, '2026-hanneung-77-advanced', 34, 77),
(30, '2026-hanneung-77-advanced', 36, 77),
(31, '2026-hanneung-77-advanced', 37, 77),
(32, '2026-hanneung-77-advanced', 38, 77),
(33, '2026-hanneung-77-advanced', 39, 77),
(34, '2026-hanneung-77-advanced', 40, 77),
(35, '2026-hanneung-77-advanced', 41, 77),
(36, '2026-hanneung-77-advanced', 42, 77),
(37, '2026-hanneung-77-advanced', 43, 77),
(38, '2026-hanneung-77-advanced', 44, 77),
(39, '2026-hanneung-78-advanced', 35, 78),
(40, '2026-hanneung-78-advanced', 36, 78),
(41, '2026-hanneung-78-advanced', 37, 78),
(42, '2026-hanneung-78-advanced', 38, 78),
(43, '2026-hanneung-78-advanced', 39, 78),
(44, '2026-hanneung-78-advanced', 40, 78),
(45, '2026-hanneung-78-advanced', 41, 78),
(46, '2026-hanneung-78-advanced', 42, 78),
(47, '2026-hanneung-78-advanced', 43, 78),
(48, '2026-hanneung-79-advanced', 36, 79),
(49, '2026-hanneung-79-advanced', 37, 79),
(50, '2026-hanneung-79-advanced', 38, 79),
(51, '2026-hanneung-79-advanced', 39, 79),
(52, '2026-hanneung-79-advanced', 40, 79),
(53, '2026-hanneung-79-advanced', 41, 79),
(54, '2026-hanneung-79-advanced', 42, 79),
(55, '2026-hanneung-79-advanced', 43, 79),
(56, '2026-hanneung-79-advanced', 44, 79),
(57, '2026-hanneung-79-advanced', 46, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 57 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: colonial';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-colonial-402c2cff5418',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 33, 74),
(2, '2025-hanneung-74-advanced', 36, 74),
(3, '2025-hanneung-74-advanced', 37, 74),
(4, '2025-hanneung-74-advanced', 38, 74),
(5, '2025-hanneung-74-advanced', 39, 74),
(6, '2025-hanneung-74-advanced', 40, 74),
(7, '2025-hanneung-74-advanced', 41, 74),
(8, '2025-hanneung-74-advanced', 42, 74),
(9, '2025-hanneung-74-advanced', 43, 74),
(10, '2025-hanneung-75-advanced', 34, 75),
(11, '2025-hanneung-75-advanced', 35, 75),
(12, '2025-hanneung-75-advanced', 36, 75),
(13, '2025-hanneung-75-advanced', 37, 75),
(14, '2025-hanneung-75-advanced', 39, 75),
(15, '2025-hanneung-75-advanced', 40, 75),
(16, '2025-hanneung-75-advanced', 41, 75),
(17, '2025-hanneung-75-advanced', 42, 75),
(18, '2025-hanneung-75-advanced', 43, 75),
(19, '2025-hanneung-75-advanced', 44, 75),
(20, '2025-hanneung-76-advanced', 36, 76),
(21, '2025-hanneung-76-advanced', 37, 76),
(22, '2025-hanneung-76-advanced', 38, 76),
(23, '2025-hanneung-76-advanced', 39, 76),
(24, '2025-hanneung-76-advanced', 40, 76),
(25, '2025-hanneung-76-advanced', 41, 76),
(26, '2025-hanneung-76-advanced', 42, 76),
(27, '2025-hanneung-76-advanced', 43, 76),
(28, '2026-hanneung-77-advanced', 32, 77),
(29, '2026-hanneung-77-advanced', 34, 77),
(30, '2026-hanneung-77-advanced', 36, 77),
(31, '2026-hanneung-77-advanced', 37, 77),
(32, '2026-hanneung-77-advanced', 38, 77),
(33, '2026-hanneung-77-advanced', 39, 77),
(34, '2026-hanneung-77-advanced', 40, 77),
(35, '2026-hanneung-77-advanced', 41, 77),
(36, '2026-hanneung-77-advanced', 42, 77),
(37, '2026-hanneung-77-advanced', 43, 77),
(38, '2026-hanneung-77-advanced', 44, 77),
(39, '2026-hanneung-78-advanced', 35, 78),
(40, '2026-hanneung-78-advanced', 36, 78),
(41, '2026-hanneung-78-advanced', 37, 78),
(42, '2026-hanneung-78-advanced', 38, 78),
(43, '2026-hanneung-78-advanced', 39, 78),
(44, '2026-hanneung-78-advanced', 40, 78),
(45, '2026-hanneung-78-advanced', 41, 78),
(46, '2026-hanneung-78-advanced', 42, 78),
(47, '2026-hanneung-78-advanced', 43, 78),
(48, '2026-hanneung-79-advanced', 36, 79),
(49, '2026-hanneung-79-advanced', 37, 79),
(50, '2026-hanneung-79-advanced', 38, 79),
(51, '2026-hanneung-79-advanced', 39, 79),
(52, '2026-hanneung-79-advanced', 40, 79),
(53, '2026-hanneung-79-advanced', 41, 79),
(54, '2026-hanneung-79-advanced', 42, 79),
(55, '2026-hanneung-79-advanced', 43, 79),
(56, '2026-hanneung-79-advanced', 44, 79),
(57, '2026-hanneung-79-advanced', 46, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-colonial-402c2cff5418' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-colonial-402c2cff5418' and not p.published) where id='hanneung-era-colonial-402c2cff5418';
-- modern: 31 questions
update public.exam_papers set published = false where practice_era = 'modern' and id <> 'hanneung-era-modern-2b5b12af802c';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-modern-2b5b12af802c','현대 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',31,31,'advanced','modern') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 44, 74),
(2, '2025-hanneung-74-advanced', 45, 74),
(3, '2025-hanneung-74-advanced', 46, 74),
(4, '2025-hanneung-74-advanced', 47, 74),
(5, '2025-hanneung-74-advanced', 48, 74),
(6, '2025-hanneung-74-advanced', 49, 74),
(7, '2025-hanneung-75-advanced', 45, 75),
(8, '2025-hanneung-75-advanced', 46, 75),
(9, '2025-hanneung-75-advanced', 47, 75),
(10, '2025-hanneung-75-advanced', 48, 75),
(11, '2025-hanneung-75-advanced', 49, 75),
(12, '2025-hanneung-76-advanced', 44, 76),
(13, '2025-hanneung-76-advanced', 45, 76),
(14, '2025-hanneung-76-advanced', 47, 76),
(15, '2025-hanneung-76-advanced', 48, 76),
(16, '2025-hanneung-76-advanced', 49, 76),
(17, '2026-hanneung-77-advanced', 45, 77),
(18, '2026-hanneung-77-advanced', 46, 77),
(19, '2026-hanneung-77-advanced', 47, 77),
(20, '2026-hanneung-77-advanced', 48, 77),
(21, '2026-hanneung-77-advanced', 49, 77),
(22, '2026-hanneung-78-advanced', 44, 78),
(23, '2026-hanneung-78-advanced', 45, 78),
(24, '2026-hanneung-78-advanced', 46, 78),
(25, '2026-hanneung-78-advanced', 47, 78),
(26, '2026-hanneung-78-advanced', 48, 78),
(27, '2026-hanneung-78-advanced', 49, 78),
(28, '2026-hanneung-79-advanced', 45, 79),
(29, '2026-hanneung-79-advanced', 47, 79),
(30, '2026-hanneung-79-advanced', 48, 79),
(31, '2026-hanneung-79-advanced', 49, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 31 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: modern';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-modern-2b5b12af802c',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 44, 74),
(2, '2025-hanneung-74-advanced', 45, 74),
(3, '2025-hanneung-74-advanced', 46, 74),
(4, '2025-hanneung-74-advanced', 47, 74),
(5, '2025-hanneung-74-advanced', 48, 74),
(6, '2025-hanneung-74-advanced', 49, 74),
(7, '2025-hanneung-75-advanced', 45, 75),
(8, '2025-hanneung-75-advanced', 46, 75),
(9, '2025-hanneung-75-advanced', 47, 75),
(10, '2025-hanneung-75-advanced', 48, 75),
(11, '2025-hanneung-75-advanced', 49, 75),
(12, '2025-hanneung-76-advanced', 44, 76),
(13, '2025-hanneung-76-advanced', 45, 76),
(14, '2025-hanneung-76-advanced', 47, 76),
(15, '2025-hanneung-76-advanced', 48, 76),
(16, '2025-hanneung-76-advanced', 49, 76),
(17, '2026-hanneung-77-advanced', 45, 77),
(18, '2026-hanneung-77-advanced', 46, 77),
(19, '2026-hanneung-77-advanced', 47, 77),
(20, '2026-hanneung-77-advanced', 48, 77),
(21, '2026-hanneung-77-advanced', 49, 77),
(22, '2026-hanneung-78-advanced', 44, 78),
(23, '2026-hanneung-78-advanced', 45, 78),
(24, '2026-hanneung-78-advanced', 46, 78),
(25, '2026-hanneung-78-advanced', 47, 78),
(26, '2026-hanneung-78-advanced', 48, 78),
(27, '2026-hanneung-78-advanced', 49, 78),
(28, '2026-hanneung-79-advanced', 45, 79),
(29, '2026-hanneung-79-advanced', 47, 79),
(30, '2026-hanneung-79-advanced', 48, 79),
(31, '2026-hanneung-79-advanced', 49, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-modern-2b5b12af802c' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-modern-2b5b12af802c' and not p.published) where id='hanneung-era-modern-2b5b12af802c';
-- cross: 10 questions
update public.exam_papers set published = false where practice_era = 'cross' and id <> 'hanneung-era-cross-633402719aae';
insert into public.exam_papers (id,title,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,question_count,max_score,hanneung_level,practice_era)
values ('hanneung-era-cross-633402719aae','시대 통합 모아 풀기','국사편찬위원회','한국사','전 학년',80,'{}',null,false,'hanneung',10,10,'advanced','cross') on conflict (id) do nothing;
do $seed$ begin
  if (select count(*) from (values (1, '2025-hanneung-74-advanced', 50, 74),
(2, '2025-hanneung-75-advanced', 38, 75),
(3, '2025-hanneung-75-advanced', 50, 75),
(4, '2025-hanneung-76-advanced', 46, 76),
(5, '2025-hanneung-76-advanced', 50, 76),
(6, '2026-hanneung-77-advanced', 12, 77),
(7, '2026-hanneung-77-advanced', 27, 77),
(8, '2026-hanneung-77-advanced', 50, 77),
(9, '2026-hanneung-78-advanced', 50, 78),
(10, '2026-hanneung-79-advanced', 50, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common' join public.exam_answer_keys k on k.question_id=q.id) <> 10 then
    raise exception 'EXAM_ERA_SOURCE_MISSING: cross';
  end if;
end $seed$;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,answer_type,source_paper_id,source_number,source_round)
select 'hanneung-era-cross-633402719aae',m.n,'common',q.image_url,true,1,q.answer_type,m.p,m.num,m.r
from (values (1, '2025-hanneung-74-advanced', 50, 74),
(2, '2025-hanneung-75-advanced', 38, 75),
(3, '2025-hanneung-75-advanced', 50, 75),
(4, '2025-hanneung-76-advanced', 46, 76),
(5, '2025-hanneung-76-advanced', 50, 76),
(6, '2026-hanneung-77-advanced', 12, 77),
(7, '2026-hanneung-77-advanced', 27, 77),
(8, '2026-hanneung-77-advanced', 50, 77),
(9, '2026-hanneung-78-advanced', 50, 78),
(10, '2026-hanneung-79-advanced', 50, 79)) m(n,p,num,r) join public.exam_questions q on q.paper_id=m.p and q.number=m.num and q.section='common'
on conflict (paper_id,section,number) do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id,k.answer from public.exam_questions q join public.exam_questions original on original.paper_id=q.source_paper_id and original.number=q.source_number and original.section='common'
join public.exam_answer_keys k on k.question_id=original.id where q.paper_id='hanneung-era-cross-633402719aae' on conflict (question_id) do nothing;
-- Never expose unpublished source material. Run again after coordinator publishes all source papers.
update public.exam_papers set published = not exists (select 1 from public.exam_questions q join public.exam_papers p on p.id=q.source_paper_id where q.paper_id='hanneung-era-cross-633402719aae' and not p.published) where id='hanneung-era-cross-633402719aae';
commit;
