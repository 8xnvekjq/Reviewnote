-- 문항·정답 검토 뒤에만. 개편판 1차·2차 공개 + 기존 18문항 학습지 비공개 전환.
begin;
update public.exam_papers set published=true where id in ('2026-g3m-trig-creative-1','2026-g3m-trig-creative-2') and kind='worksheet';
update public.exam_papers set published=false where id='2026-g3m-trig-creative' and kind='worksheet';
commit;
