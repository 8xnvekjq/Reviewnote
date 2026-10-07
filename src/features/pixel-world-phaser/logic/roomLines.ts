// 방 가구를 A로 살펴볼 때 나오는 짧은 대사. 이름은 기존 방(PixelRoom.tsx)의 가구 이름과 같다. 순수 데이터.
import type { FurnitureType } from '../../pixel-room/model';

export const FURNITURE_NAMES: Record<FurnitureType, string> = {
  bed: '포근한 침대', desk: '나무 책상', chair: '작은 의자', bookshelf: '나의 책장', plant: '초록 화분', decoration: '작은 장식',
  roundtable: '레이스 원형 테이블', television: '레트로 TV 장식장', aquarium: '작은 바다 수조', globe: '여행자의 지구본',
  tallplant: '키 큰 초록 식물', floorlamp: '격자 갓 스탠드',
};

export const FURNITURE_LINES: Record<FurnitureType, readonly string[]> = {
  bed: ['이불이 햇볕 냄새로 보송보송해요.', '복습을 마치고 누우면 꿀잠 잘 것 같아요.'],
  desk: ['책상 위에 풀다 만 문제집이 펼쳐져 있어요.', '오늘 복습할 것부터 하나씩 해 볼까요?'],
  chair: ['딱 맞는 높이의 작은 의자예요.', '앉으면 집중이 조금 더 잘 될 것 같아요.'],
  bookshelf: ['손때 묻은 책들이 나란히 꽂혀 있어요.', '틀린 문제 노트도 여기 한 칸을 차지하고 있네요.'],
  plant: ['잎이 반짝반짝 윤이 나요.', '물을 잘 줘서 쑥쑥 자라고 있어요.'],
  decoration: ['방을 환하게 해 주는 작은 장식이에요.'],
  roundtable: ['레이스 테이블보가 곱게 깔려 있어요.', '친구가 놀러 오면 여기서 간식을 먹어야지!'],
  television: ['오래된 TV에서 지지직 소리가 나요.', '지금은 복습 시간! TV는 이따가 볼게요.'],
  aquarium: ['작은 물고기들이 뻐끔뻐끔 인사해요.', '물방울 소리를 들으니 마음이 편해져요.'],
  globe: ['지구본을 빙글 돌려 봤어요.', '언젠가 가 보고 싶은 나라에 손가락이 멈췄어요.'],
  tallplant: ['천장에 닿을 만큼 키가 컸어요.', '초록 잎을 보니 눈이 시원해져요.'],
  floorlamp: ['딸깍! 은은한 불빛이 방을 채워요.', '밤늦게 공부할 때 든든한 친구예요.'],
};
