-- ================================================
-- LOCKDOWN: system_config 테이블에서 Gemini API 키 클라이언트 노출 차단
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ⚠️ 반드시 아래 순서를 지켜서 실행하세요:
--   1) 먼저 Supabase 대시보드 > Edge Functions > gemini-proxy > Secrets 에서
--      GEMINI_API_KEY_PAID 시크릿을 등록 (system_config 테이블의 gemini_api_key_paid
--      값을 그대로 복사해서 넣으면 됨)
--   2) gemini-proxy 함수가 정상 동작하는지 앱에서 오답 진단을 한 번 실행해서 확인
--   3) 확인이 끝난 뒤에만 이 SQL을 실행 (먼저 실행하면 진단 기능이 즉시 멈춤)
-- ================================================
-- 배경: system_config 테이블의 SELECT 정책이 "Allow authenticated users to read
-- config" (roles: authenticated, qual: true)로 되어 있어서, 로그인한 학생 계정이면
-- 누구나 여기 저장된 Gemini 유료 API 키를 브라우저 개발자도구로 그대로 뽑아갈 수 있었음.
--
-- gemini-proxy Edge Function을 도입해 클라이언트가 더 이상 이 키 값을 직접 읽을
-- 필요가 없어졌으므로, 이 노출 경로 자체를 막는다.

DROP POLICY IF EXISTS "Allow authenticated users to read config" ON public.system_config;

-- (선택) 위 정책 제거 후 system_config를 읽는 클라이언트 코드가 하나도 남지 않았다면,
-- 이제 이미 노출됐던 구버전 키 값 자체도 더 이상 쓰이지 않으므로 정리해도 무방합니다:
-- delete from public.system_config where key in ('gemini_api_key', 'gemini_api_key_paid');
