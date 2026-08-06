-- ================================================
-- HARDEN record_diagnosis_duration AGAINST GARBAGE/ABUSE VALUES
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- Supabase 보안 어드바이저(get_advisors)에서 발견: 이 SECURITY DEFINER 함수는
-- 로그인한 사용자 누구나 /rest/v1/rpc/record_diagnosis_duration로 직접 호출할 수
-- 있는데, duration_ms 값에 대한 검증이 전혀 없었다. 음수/0/터무니없이 큰 값을 넣으면
-- 모든 학생에게 보이는 "평균 진단 소요시간" 통계(diagnosis_stats)가 오염될 수 있었다.
-- 실제 진단 소요시간은 몇 초~몇 분 사이가 정상이므로, 0 < duration_ms < 600000(10분)
-- 범위 밖의 값은 조용히 무시(WHERE 조건에 안 걸려 0 rows 업데이트)하도록 방어했다.

CREATE OR REPLACE FUNCTION public.record_diagnosis_duration(duration_ms bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.diagnosis_stats
  SET total_count = total_count + 1,
      total_duration_ms = total_duration_ms + duration_ms,
      updated_at = now()
  WHERE id = 1
    AND duration_ms > 0
    AND duration_ms < 600000;
$function$;
