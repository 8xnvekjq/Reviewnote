-- AI 진단(classify+extract+solve) 소요 시간 통계를 오답 카드(mistakes)와 완전히 분리해서
-- 영구적으로 누적 저장하기 위한 테이블입니다.
-- 기존에는 durationMs를 mistakes.analysis(JSONB) 안에 저장했는데, 오답 카드를 삭제하면
-- 그 진단 시간 기록도 같이 사라져서 "평균 대기시간"이 계속 3건 미만으로 리셋되는 문제가 있었습니다.
-- 이 테이블은 오답 카드가 삭제되어도 통계가 남아있도록 완전히 독립적으로 누적됩니다.

CREATE TABLE IF NOT EXISTS public.diagnosis_stats (
  id smallint PRIMARY KEY DEFAULT 1,
  total_count bigint NOT NULL DEFAULT 0,
  total_duration_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnosis_stats_single_row CHECK (id = 1)
);

-- 이 테이블은 항상 딱 1개의 행만 존재하는 전역 누적 카운터입니다.
-- 평균 대기시간(ms) = total_duration_ms / total_count 로 계산합니다.
INSERT INTO public.diagnosis_stats (id, total_count, total_duration_ms)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.diagnosis_stats ENABLE ROW LEVEL SECURITY;

-- 로그인한 모든 사용자가 평균 대기시간을 조회할 수 있도록 허용 (민감 정보 없는 단순 통계)
DROP POLICY IF EXISTS "Authenticated users can read diagnosis stats" ON public.diagnosis_stats;
CREATE POLICY "Authenticated users can read diagnosis stats" ON public.diagnosis_stats
  FOR SELECT USING (auth.role() = 'authenticated');

-- 클라이언트가 total_count/total_duration_ms를 직접 UPDATE하도록 허용하면 동시 진단 시
-- read-then-write 경쟁 상태(lost update)가 생길 수 있어서, 원자적으로 누적시키는 함수를
-- 대신 만들고 이 함수를 통해서만 갱신하도록 합니다 (직접 UPDATE 정책은 만들지 않음).
CREATE OR REPLACE FUNCTION public.record_diagnosis_duration(duration_ms bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.diagnosis_stats
  SET total_count = total_count + 1,
      total_duration_ms = total_duration_ms + duration_ms,
      updated_at = now()
  WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.record_diagnosis_duration(bigint) TO authenticated;
