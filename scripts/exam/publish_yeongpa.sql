update public.exam_papers
set published = true
where id = '2024-yeongpa-g2-s2-mid-calc1'
  and kind = 'school'
  and published = false
returning id, title, grade, published;
