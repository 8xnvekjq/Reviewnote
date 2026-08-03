-- mistakes 테이블에 선생님 전용 스캐폴딩 힌트 컬럼 추가
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS teacher_scaffolding_hint TEXT;
