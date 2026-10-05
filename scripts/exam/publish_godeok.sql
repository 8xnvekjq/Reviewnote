update public.exam_papers
set published = true
where id = '2025-godeok-m3-s2-final'
  and kind = 'school'
  and published = false
returning id, title, grade, published;
