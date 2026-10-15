update public.exam_papers
set published = true
where id = '2024-myeongil-m3-s2-mid'
  and kind = 'school'
  and published = false
returning id, title, grade, published;
