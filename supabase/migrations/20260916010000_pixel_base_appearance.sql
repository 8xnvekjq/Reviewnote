-- Pixel World 아바타 외형 구조 정리(Astra 제안): 장착 아이템(상의/하의/신발/헤어, 기존 그대로
-- item_id 기반 equip_pixel_item)과 무료 기본 appearance(피부색/눈동자색)를 분리한다. 헤어스타일은
-- 이미 형태+색이 한 상품(item_id)에 묶여 팔리고 있어 실제로 분리하지 않았다 — 기존 구매 이력을
-- 건드리지 않는 게 최우선이라, "헤어스타일 = 장착 아이템" 구조는 그대로 두고 UI에서만 형태별로
-- 묶어 보여준다(스키마/RPC 변경 없음).
--
-- eyes 컬럼(FK -> pixel_item_catalog)은 건드리지 않는다 — 예전부터 있었지만 그 슬롯으로 판 상품이
-- 하나도 없어 실사용이 없었다. 새 컬럼을 따로 만들어 그 FK 제약과 완전히 분리한다(무료 값이라
-- 카탈로그 조회 자체가 필요 없음).

ALTER TABLE public.pixel_avatar_equipment
  ADD COLUMN skin_tone text,
  ADD COLUMN eye_color text;

ALTER TABLE public.pixel_avatar_equipment
  ADD CONSTRAINT pixel_avatar_equipment_skin_tone_check
    CHECK (skin_tone IS NULL OR skin_tone IN ('tan', 'sand', 'wheat', 'umber', 'porcelain')),
  ADD CONSTRAINT pixel_avatar_equipment_eye_color_check
    CHECK (eye_color IS NULL OR eye_color IN ('navy', 'sky', 'olive', 'brown'));

COMMENT ON COLUMN public.pixel_avatar_equipment.skin_tone IS
  '무료 기본 appearance. NULL = row 0(기존 전체 사용자가 이미 보던 기본 모습). 가격/희귀도 없음 — 구매 대상 아님.';
COMMENT ON COLUMN public.pixel_avatar_equipment.eye_color IS
  '무료 기본 appearance. NULL = row 0(기존 기본 눈동자색). 가격/희귀도 없음 — 구매 대상 아님. 예전 eyes 컬럼(item_id, 미사용)과는 별개.';

-- 무료라 소유권 검증이 필요 없다 — 값 자체가 허용 목록(위 CHECK) 안에 있는지만 확인한다. 다른
-- pixel_* RPC와 동일한 패턴(SECURITY DEFINER + guard 트리거 우회)을 따른다.
CREATE OR REPLACE FUNCTION public.set_pixel_base_appearance(p_skin_tone text, p_eye_color text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_skin_tone IS NOT NULL AND p_skin_tone NOT IN ('tan', 'sand', 'wheat', 'umber', 'porcelain') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_value', 'message', '알 수 없는 피부색이에요.');
  END IF;
  IF p_eye_color IS NOT NULL AND p_eye_color NOT IN ('navy', 'sky', 'olive', 'brown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_value', 'message', '알 수 없는 눈동자색이에요.');
  END IF;

  PERFORM set_config('reviewnote.pixel_rpc', 'true', true);

  INSERT INTO public.pixel_avatar_equipment (user_id, skin_tone, eye_color)
    VALUES (v_user, p_skin_tone, p_eye_color)
    ON CONFLICT (user_id) DO UPDATE
      SET skin_tone = EXCLUDED.skin_tone, eye_color = EXCLUDED.eye_color, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'skinTone', p_skin_tone, 'eyeColor', p_eye_color);
END;
$function$;
