-- Pixel World 가구 배치 서버 저장. 기존에는 구매/소유(pixel_item_ownership)만 서버에 있고
-- 방 안 x/y 배치는 계정별 localStorage뿐이라 다른 기기에서 접속하면 사라졌다. 이 마이그레이션은
-- 기존 pixel_* 패턴(SELECT-only RLS + SECURITY DEFINER RPC + guard 트리거)을 그대로 따른다.

CREATE TABLE public.pixel_furniture_placement (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.pixel_item_catalog(item_id),
  x smallint NOT NULL,
  y smallint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE public.pixel_furniture_placement ENABLE ROW LEVEL SECURITY;

-- 다른 학생의 방을 구경하는 기능은 없다(현재 Plaza/Room 구조에 없음) — 본인 또는 관리자만 조회.
CREATE POLICY "Users can view own pixel furniture placement"
  ON public.pixel_furniture_placement FOR SELECT
  USING (auth.uid() = user_id OR private.is_current_user_admin());

-- pixel_avatar_equipment/pixel_item_ownership과 동일한 guard: RPC를 거치지 않은 직접 쓰기를 막는다.
CREATE TRIGGER guard_pixel_furniture_placement_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.pixel_furniture_placement
  FOR EACH ROW EXECUTE FUNCTION private.guard_pixel_direct_write();

-- 방 전체 배치를 한 번에 교체한다 — 클라이언트의 RoomState.furniture 배열과 1:1로 대응하므로
-- 배치/이동/제거 모두 이 RPC 하나로 처리된다(제거는 그 아이템을 배열에서 뺀 뒤 다시 호출).
-- 소유하지 않은 가구, 존재하지 않는 item_id, 방 범위(10x8) 밖 좌표, 중복 item_id는 전부 거부하고
-- 아무것도 바꾸지 않는다(all-or-nothing) — 검증 실패 시 기존 서버 배치는 그대로 남는다.
CREATE OR REPLACE FUNCTION public.save_pixel_room_layout(p_placements jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_room_width CONSTANT smallint := 10;  -- src/features/pixel-room/model.ts ROOM_WIDTH와 동기화
  v_room_height CONSTANT smallint := 8;  -- src/features/pixel-room/model.ts ROOM_HEIGHT와 동기화
  v_max_items CONSTANT integer := 40;    -- 넉넉한 상한(현재 가구 카탈로그 12종) — 손상된 대량 payload만 차단
  v_entry jsonb;
  v_item_id text;
  v_x integer;
  v_y integer;
  v_seen text[] := '{}';
  v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload', 'message', '잘못된 배치 데이터예요.');
  END IF;
  IF jsonb_array_length(p_placements) > v_max_items THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload', 'message', '가구 개수가 너무 많아요.');
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_placements) LOOP
    v_item_id := v_entry->>'itemId';
    BEGIN
      v_x := (v_entry->>'x')::integer;
      v_y := (v_entry->>'y')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload', 'message', '잘못된 배치 데이터예요.');
    END;

    IF v_item_id IS NULL OR v_x IS NULL OR v_y IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload', 'message', '잘못된 배치 데이터예요.');
    END IF;
    IF v_item_id = ANY(v_seen) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_item', 'message', '같은 가구가 중복으로 들어있어요.');
    END IF;
    v_seen := array_append(v_seen, v_item_id);

    IF v_x < 0 OR v_x >= v_room_width OR v_y < 0 OR v_y >= v_room_height THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'out_of_bounds', 'message', '방 밖에는 가구를 놓을 수 없어요.');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pixel_item_catalog
      WHERE item_id = v_item_id AND category = 'furniture'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found', 'message', '존재하지 않는 가구예요.');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pixel_item_ownership
      WHERE user_id = v_user AND item_id = v_item_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_owned', 'message', '보유하지 않은 가구는 배치할 수 없어요.');
    END IF;
  END LOOP;

  PERFORM set_config('reviewnote.pixel_rpc', 'true', true);

  DELETE FROM public.pixel_furniture_placement WHERE user_id = v_user;

  INSERT INTO public.pixel_furniture_placement (user_id, item_id, x, y)
  SELECT v_user, entry->>'itemId', (entry->>'x')::integer, (entry->>'y')::integer
  FROM jsonb_array_elements(p_placements) AS entry;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$function$;
