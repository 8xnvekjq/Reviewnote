-- 한능검 79회 심화: 원본 페이지 통째(page-NN.png) 대신 문항별로 자른 이미지(q-NN.jpg)를 쓴다.
-- 생성: python scripts/exam/crop_hanneung_questions.py <문제 PDF> 2026-hanneung-79-advanced
-- 바뀌는 것은 이 시험지 50문항의 image_url뿐이다(정답·배점·응시 기록은 그대로). 기본(basic)은 페이지 통째 유지.
-- 다시 적용해도 같은 결과(멱등).
update public.exam_questions q
   set image_url = '/exams/2026-hanneung-79-advanced/q-' || lpad(q.number::text, 2, '0') || '.jpg'
 where q.paper_id = '2026-hanneung-79-advanced'
   and q.section = 'common'
   and q.number between 1 and 50;
