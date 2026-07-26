-- 럭키상점(가챠)에서 장착한 테마/AI 말투를 저장하기 위한 컬럼 추가.
-- equipped_title/equipped_stamp는 이미 존재하는데, GachaStore.tsx가 'theme'/'aiVoice'
-- 카테고리 아이템도 이미 장착 가능하도록 구현되어 있어서 (onEquipItem('theme'/'aiVoice', ...))
-- App.tsx의 DB 동기화 로직이 이 두 컬럼을 사용하도록 먼저 확장되어 있었습니다.
-- 이 컬럼이 없으면 테마/AI 말투 장착 시 Supabase update가 조용히 실패합니다.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_theme text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_ai_voice text;

-- 기존 equipped_title/equipped_stamp와 동일하게, 본인 프로필 행에 대한 RLS UPDATE 정책이
-- 이미 있다면 이 두 컬럼도 자동으로 포함됩니다 (컬럼 단위 정책이 아니므로 별도 정책 불필요).
