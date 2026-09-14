-- Pixel World 전체 오픈 + 아바타 아이템 확장. 새 PNG/스키마 변경 없음 — 기존 캐릭터 atlas의
-- 미사용 행만 더 쓴다(행 근거는 docs/pixel-world-content.md 갱신분 참고). client-side
-- src/features/pixel-room/shop/catalog.ts와 item_id/slot/asset_key가 정확히 일치해야
-- usePixelShop.ts의 서버 카탈로그 필터를 통과한다.
INSERT INTO public.pixel_item_catalog (item_id, category, slot, price, asset_key, display_name, tier, stackable)
VALUES
('top_ribbon_red', 'avatar', 'top', 90, 'ribbon_red', '레드 리본 블라우스', 2, false),
('top_ribbon_blue', 'avatar', 'top', 90, 'ribbon_blue', '블루 리본 블라우스', 2, false),
('top_ribbon_black', 'avatar', 'top', 90, 'ribbon_black', '블랙 리본 블라우스', 2, false),
('top_vest_black', 'avatar', 'top', 120, 'vest_black', '블랙 니트 조끼', 2, false),
('bottom_shorts_blue', 'avatar', 'bottom', 45, 'shorts_blue', '블루 반바지', 1, false),
('bottom_shorts_black', 'avatar', 'bottom', 45, 'shorts_black', '블랙 반바지', 1, false),
('bottom_pants_black', 'avatar', 'bottom', 80, 'pants_black', '블랙 슬랙스', 2, false),
('hair_buns_blonde', 'avatar', 'hair', 150, 'buns_blonde', '블론드 양갈래 번', 2, false),
('hair_buns_black', 'avatar', 'hair', 150, 'buns_black', '블랙 양갈래 번', 2, false),
('hair_bob_blonde', 'avatar', 'hair', 120, 'bob_blonde', '블론드 단발', 2, false),
('hair_bob_black', 'avatar', 'hair', 120, 'bob_black', '블랙 단발', 2, false),
('hair_long_blonde', 'avatar', 'hair', 180, 'long_blonde', '블론드 긴 머리', 2, false),
('hair_long_black', 'avatar', 'hair', 180, 'long_black', '블랙 긴 머리', 2, false),
('hair_swept_blonde', 'avatar', 'hair', 120, 'swept_blonde', '블론드 옆머리', 2, false),
('hair_swept_black', 'avatar', 'hair', 120, 'swept_black', '블랙 옆머리', 2, false)
ON CONFLICT (item_id) DO UPDATE SET
  price = EXCLUDED.price, display_name = EXCLUDED.display_name, tier = EXCLUDED.tier;
