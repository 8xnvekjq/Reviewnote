import type { PixelItem } from './types';

// Existing CC0 atlas art only. Keep IDs stable for server ownership; prices come from the server.
// Asset selection and zero-based rows are documented in docs/pixel-world-content.md.
export const PIXEL_CATALOG: readonly PixelItem[] = [
  { itemId: 'top_sage', category: 'avatar', slot: 'top', price: 25, assetKey: 'sage', displayName: '세이지 티셔츠', tier: 1, stackable: false },
  { itemId: 'top_blue', category: 'avatar', slot: 'top', price: 25, assetKey: 'blue', displayName: '블루 티셔츠', tier: 1, stackable: false },
  { itemId: 'top_necktie', category: 'avatar', slot: 'top', price: 80, assetKey: 'necktie', displayName: '단정한 넥타이 셔츠', tier: 2, stackable: false },
  { itemId: 'top_stripe', category: 'avatar', slot: 'top', price: 80, assetKey: 'stripe', displayName: '마린 스트라이프', tier: 2, stackable: false },
  { itemId: 'top_vest', category: 'avatar', slot: 'top', price: 120, assetKey: 'vest', displayName: '브라운 니트 조끼', tier: 2, stackable: false },
  { itemId: 'top_sleeveless', category: 'avatar', slot: 'top', price: 50, assetKey: 'sleeveless', displayName: '시원한 민소매', tier: 1, stackable: false },
  { itemId: 'hair_buns', category: 'avatar', slot: 'hair', price: 150, assetKey: 'buns', displayName: '동글 양갈래 번', tier: 2, stackable: false },
  { itemId: 'hair_bob', category: 'avatar', slot: 'hair', price: 120, assetKey: 'bob', displayName: '차분한 단발', tier: 2, stackable: false },
  { itemId: 'hair_long', category: 'avatar', slot: 'hair', price: 180, assetKey: 'long', displayName: '찰랑 긴 머리', tier: 2, stackable: false },
  { itemId: 'hair_swept', category: 'avatar', slot: 'hair', price: 120, assetKey: 'swept', displayName: '옆으로 넘긴 머리', tier: 2, stackable: false },
  { itemId: 'bottom_denim', category: 'avatar', slot: 'bottom', price: 80, assetKey: 'denim', displayName: '일자 데님 팬츠', tier: 2, stackable: false },
  { itemId: 'shoes_low', category: 'avatar', slot: 'shoes', price: 30, assetKey: 'low', displayName: '블랙 로우 슈즈', tier: 1, stackable: false },
  // 실루엣이 달라지는 아이템 우선 — 상의 리본은 기존 카탈로그에 전혀 없던 새 실루엣, 하의 반바지도
  // 마찬가지(기존엔 긴바지형인 데님 하나뿐이었음). vest_black/pants_black은 이미 있는 실루엣의 저채도
  // 대비 색상 1개씩만 추가(무분별한 색상 증식 방지).
  { itemId: 'top_ribbon_red', category: 'avatar', slot: 'top', price: 90, assetKey: 'ribbon_red', displayName: '레드 리본 블라우스', tier: 2, stackable: false },
  { itemId: 'top_ribbon_blue', category: 'avatar', slot: 'top', price: 90, assetKey: 'ribbon_blue', displayName: '블루 리본 블라우스', tier: 2, stackable: false },
  { itemId: 'top_ribbon_black', category: 'avatar', slot: 'top', price: 90, assetKey: 'ribbon_black', displayName: '블랙 리본 블라우스', tier: 2, stackable: false },
  { itemId: 'top_vest_black', category: 'avatar', slot: 'top', price: 120, assetKey: 'vest_black', displayName: '블랙 니트 조끼', tier: 2, stackable: false },
  { itemId: 'bottom_shorts_blue', category: 'avatar', slot: 'bottom', price: 45, assetKey: 'shorts_blue', displayName: '블루 반바지', tier: 1, stackable: false },
  { itemId: 'bottom_shorts_black', category: 'avatar', slot: 'bottom', price: 45, assetKey: 'shorts_black', displayName: '블랙 반바지', tier: 1, stackable: false },
  { itemId: 'bottom_pants_black', category: 'avatar', slot: 'bottom', price: 80, assetKey: 'pants_black', displayName: '블랙 슬랙스', tier: 2, stackable: false },
  // 헤어는 형태(번/단발/긴머리/옆머리) 4종이 전부 같은 갈색 한 색으로만 팔리고 있었다 — 형태를
  // 구매해도 색은 다 똑같아 보이는 게 "구분이 잘 안 됨"의 큰 원인이라, 형태별로 블론드/블랙 두
  // 색을 추가한다(전 색상 대신 대비가 큰 2색만 — 카탈로그를 과하게 불리지 않는다).
  { itemId: 'hair_buns_blonde', category: 'avatar', slot: 'hair', price: 150, assetKey: 'buns_blonde', displayName: '블론드 양갈래 번', tier: 2, stackable: false },
  { itemId: 'hair_buns_black', category: 'avatar', slot: 'hair', price: 150, assetKey: 'buns_black', displayName: '블랙 양갈래 번', tier: 2, stackable: false },
  { itemId: 'hair_bob_blonde', category: 'avatar', slot: 'hair', price: 120, assetKey: 'bob_blonde', displayName: '블론드 단발', tier: 2, stackable: false },
  { itemId: 'hair_bob_black', category: 'avatar', slot: 'hair', price: 120, assetKey: 'bob_black', displayName: '블랙 단발', tier: 2, stackable: false },
  { itemId: 'hair_long_blonde', category: 'avatar', slot: 'hair', price: 180, assetKey: 'long_blonde', displayName: '블론드 긴 머리', tier: 2, stackable: false },
  { itemId: 'hair_long_black', category: 'avatar', slot: 'hair', price: 180, assetKey: 'long_black', displayName: '블랙 긴 머리', tier: 2, stackable: false },
  { itemId: 'hair_swept_blonde', category: 'avatar', slot: 'hair', price: 120, assetKey: 'swept_blonde', displayName: '블론드 옆머리', tier: 2, stackable: false },
  { itemId: 'hair_swept_black', category: 'avatar', slot: 'hair', price: 120, assetKey: 'swept_black', displayName: '블랙 옆머리', tier: 2, stackable: false },
  { itemId: 'furniture_plant', category: 'furniture', slot: 'furniture', price: 25, assetKey: 'plant', displayName: '작은 화분', tier: 1, stackable: false },
  { itemId: 'furniture_decoration', category: 'furniture', slot: 'furniture', price: 40, assetKey: 'decoration', displayName: '작은 칠판', tier: 1, stackable: false },
  { itemId: 'furniture_chair', category: 'furniture', slot: 'furniture', price: 50, assetKey: 'chair', displayName: '나무 의자', tier: 1, stackable: false },
  { itemId: 'furniture_bookshelf', category: 'furniture', slot: 'furniture', price: 80, assetKey: 'bookshelf', displayName: '슬림 책장', tier: 2, stackable: false },
  { itemId: 'furniture_desk', category: 'furniture', slot: 'furniture', price: 120, assetKey: 'desk', displayName: '수납 책상', tier: 2, stackable: false },
  { itemId: 'furniture_bed', category: 'furniture', slot: 'furniture', price: 200, assetKey: 'bed', displayName: '포근한 침대', tier: 2, stackable: false },
  { itemId: 'furniture_roundtable', category: 'furniture', slot: 'furniture', price: 150, assetKey: 'roundtable', displayName: '레이스 원형 테이블', tier: 2, stackable: false },
  { itemId: 'furniture_television', category: 'furniture', slot: 'furniture', price: 200, assetKey: 'television', displayName: '레트로 TV 장식장', tier: 2, stackable: false },
  { itemId: 'furniture_aquarium', category: 'furniture', slot: 'furniture', price: 600, assetKey: 'aquarium', displayName: '작은 바다 수조', tier: 3, stackable: false },
  { itemId: 'furniture_globe', category: 'furniture', slot: 'furniture', price: 120, assetKey: 'globe', displayName: '여행자의 지구본', tier: 2, stackable: false },
  { itemId: 'furniture_tallplant', category: 'furniture', slot: 'furniture', price: 80, assetKey: 'tallplant', displayName: '키 큰 초록 식물', tier: 2, stackable: false },
  { itemId: 'furniture_floorlamp', category: 'furniture', slot: 'furniture', price: 100, assetKey: 'floorlamp', displayName: '격자 갓 스탠드', tier: 2, stackable: false },
  { itemId: 'pet_dog', category: 'pet', slot: 'pet', price: 200, assetKey: 'dog', displayName: '우리 집 강아지', tier: 2, stackable: false },
  // 헤어가 긴머리/여성형 실루엣(번/단발/긴머리/옆머리)에 치우쳐 있어 짧은 스타일을 보강한다.
  // crop_*은 atlas에 이미 있던, 한 번도 팔지 않은 rows 0-4(볼륨 없는 단정한 숏컷) — 새 PNG 없음.
  // 다크브라운(row 0)은 다른 슬롯과 같은 이유로 팔지 않는다: hair:null일 때의 기본값이라 이미
  // 모든 유저가 공짜로 보고 있다. buzz_*은 그 실루엣을 침식해 만든 새 rows 25-28(진짜 버즈컷,
  // 두피가 비쳐 보이는 얇은 테두리).
  { itemId: 'hair_crop_blonde', category: 'avatar', slot: 'hair', price: 100, assetKey: 'crop_blonde', displayName: '블론드 숏컷', tier: 1, stackable: false },
  { itemId: 'hair_crop_black', category: 'avatar', slot: 'hair', price: 100, assetKey: 'crop_black', displayName: '블랙 숏컷', tier: 1, stackable: false },
  { itemId: 'hair_buzz', category: 'avatar', slot: 'hair', price: 90, assetKey: 'buzz', displayName: '까까머리', tier: 1, stackable: false },
  { itemId: 'hair_buzz_blonde', category: 'avatar', slot: 'hair', price: 90, assetKey: 'buzz_blonde', displayName: '블론드 까까머리', tier: 1, stackable: false },
  { itemId: 'hair_buzz_black', category: 'avatar', slot: 'hair', price: 90, assetKey: 'buzz_black', displayName: '블랙 까까머리', tier: 1, stackable: false },
  { itemId: 'hair_buzz_brown', category: 'avatar', slot: 'hair', price: 90, assetKey: 'buzz_brown', displayName: '브라운 까까머리', tier: 1, stackable: false },
];
