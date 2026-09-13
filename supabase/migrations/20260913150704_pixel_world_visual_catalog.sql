-- Existing art only; no schema/RLS/RPC changes. Existing ownership and price_paid remain untouched.
INSERT INTO public.pixel_item_catalog (item_id, category, slot, price, asset_key, display_name, tier, stackable)
VALUES
('top_sage', 'avatar', 'top', 25, 'sage', '세이지 티셔츠', 1, false),
('top_blue', 'avatar', 'top', 25, 'blue', '블루 티셔츠', 1, false),
('top_necktie', 'avatar', 'top', 80, 'necktie', '단정한 넥타이 셔츠', 2, false),
('top_stripe', 'avatar', 'top', 80, 'stripe', '마린 스트라이프', 2, false),
('top_vest', 'avatar', 'top', 120, 'vest', '브라운 니트 조끼', 2, false),
('top_sleeveless', 'avatar', 'top', 50, 'sleeveless', '시원한 민소매', 1, false),
('hair_buns', 'avatar', 'hair', 150, 'buns', '동글 양갈래 번', 2, false),
('hair_bob', 'avatar', 'hair', 120, 'bob', '차분한 단발', 2, false),
('hair_long', 'avatar', 'hair', 180, 'long', '찰랑 긴 머리', 2, false),
('hair_swept', 'avatar', 'hair', 120, 'swept', '옆으로 넘긴 머리', 2, false),
('bottom_denim', 'avatar', 'bottom', 80, 'denim', '일자 데님 팬츠', 2, false),
('shoes_low', 'avatar', 'shoes', 30, 'low', '블랙 로우 슈즈', 1, false),
('furniture_plant', 'furniture', 'furniture', 25, 'plant', '작은 화분', 1, false),
('furniture_decoration', 'furniture', 'furniture', 40, 'decoration', '작은 칠판', 1, false),
('furniture_chair', 'furniture', 'furniture', 50, 'chair', '나무 의자', 1, false),
('furniture_bookshelf', 'furniture', 'furniture', 80, 'bookshelf', '슬림 책장', 2, false),
('furniture_desk', 'furniture', 'furniture', 120, 'desk', '수납 책상', 2, false),
('furniture_bed', 'furniture', 'furniture', 200, 'bed', '포근한 침대', 2, false),
('furniture_roundtable', 'furniture', 'furniture', 150, 'roundtable', '레이스 원형 테이블', 2, false),
('furniture_television', 'furniture', 'furniture', 200, 'television', '레트로 TV 장식장', 2, false),
('furniture_aquarium', 'furniture', 'furniture', 600, 'aquarium', '작은 바다 수조', 3, false),
('furniture_globe', 'furniture', 'furniture', 120, 'globe', '여행자의 지구본', 2, false),
('furniture_tallplant', 'furniture', 'furniture', 80, 'tallplant', '키 큰 초록 식물', 2, false),
('furniture_floorlamp', 'furniture', 'furniture', 100, 'floorlamp', '격자 갓 스탠드', 2, false)
ON CONFLICT (item_id) DO UPDATE SET
  price = EXCLUDED.price, display_name = EXCLUDED.display_name, tier = EXCLUDED.tier;
