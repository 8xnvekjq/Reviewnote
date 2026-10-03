update public.exam_papers
set published = true
where id = '2025-daedong-g1-s2-mid-common2'
  and kind = 'school'
  and published = false
returning id, title, grade, published;
