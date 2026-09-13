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
];
