-- public.profiles 테이블에 일일 무료 API 사용 카운트 및 최근 요청 날짜 컬럼 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_free_count integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_request_date text;

-- RLS 정책에 의해 일반 학생 본인이 자신의 프로필 행을 업데이트하여 카운트를 기록할 수 있습니다.
