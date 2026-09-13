import type { PixelItem } from './types';

// Pixel World Phase 1 v1 카탈로그 — Integration Lead가 확정. 전부 이미 존재하는 에셋만 사용한다
// (새 그림 없음): 아바타 상의 색상 2종(기존 model.ts SHIRTS의 sage/blue — default는 시작 시
// 무료 기본값이라 카탈로그에 없음), 가구 6종(기존 model.ts FURNITURE 전체 — 예전엔 전부 무료였지만
// Phase 1부터는 구매해야 배치 가능).
//
// Worker A는 이 배열을 그대로 DB 카탈로그로 시드한다(직접 다른 값을 만들지 않는다).
// Worker B가 아바타 스프라이트 시트 감사에서 추가로 쓸 수 있는 에셋(예: hair/eyes/bottoms/shoes
// 색상 variant)을 발견하면, 이 배열에 새 항목을 직접 추가하지 말고 보고서에만 "추천 추가 항목"으로
// 남긴다 — Integration Lead가 통합 시점에 검토해서 이 파일과 시드를 함께 갱신한다.
export const PIXEL_CATALOG: readonly PixelItem[] = [
  // Tier 1 — 공용가(15~40P): 빠르게 살 수 있는 첫 구매
  { itemId: 'top_sage', category: 'avatar', slot: 'top', price: 30, assetKey: 'sage', displayName: '세이지 상의', tier: 1, stackable: false },
  { itemId: 'top_blue', category: 'avatar', slot: 'top', price: 30, assetKey: 'blue', displayName: '블루 상의', tier: 1, stackable: false },
  { itemId: 'furniture_plant', category: 'furniture', slot: 'furniture', price: 25, assetKey: 'plant', displayName: '화분', tier: 1, stackable: false },
  { itemId: 'furniture_decoration', category: 'furniture', slot: 'furniture', price: 40, assetKey: 'decoration', displayName: '소품 장식', tier: 1, stackable: false },

  // Tier 2 — 중가(80~200P): 며칠 모아서 사는 주력 카탈로그
  { itemId: 'furniture_chair', category: 'furniture', slot: 'furniture', price: 90, assetKey: 'chair', displayName: '의자', tier: 2, stackable: false },
  { itemId: 'furniture_bookshelf', category: 'furniture', slot: 'furniture', price: 90, assetKey: 'bookshelf', displayName: '책장', tier: 2, stackable: false },
  { itemId: 'furniture_desk', category: 'furniture', slot: 'furniture', price: 150, assetKey: 'desk', displayName: '책상', tier: 2, stackable: false },

  // Tier 2 상단 — 가장 크고 방의 중심이 되는 가구(v1에서는 진짜 400~800P 목표가 아이템은 없음 —
  // 새 그림 없이는 만들 수 없어 정직하게 비워둠. 진짜 Tier 3는 Phase 1.5+에서 새 에셋과 함께 추가)
  { itemId: 'furniture_bed', category: 'furniture', slot: 'furniture', price: 220, assetKey: 'bed', displayName: '침대', tier: 2, stackable: false },
] as const;
