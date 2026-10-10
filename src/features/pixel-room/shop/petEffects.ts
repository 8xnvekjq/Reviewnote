// 상점·옷장 펫 카드에 보이는 효과 설명. 실제 효과는 서버(start_pixel_cast·get_pixel_fishing_state)가 정한다 —
// 숫자를 바꾸면 이 글도 함께 고친다(tests/pixel-world-phaser/pet-effects.test.ts가 서버 SQL과 대조).
const PET_EFFECTS: Record<string, string> = {
  pet_dog: '낚시 경험치 +10%',
  pet_pigeon: '놓칠 뻔하면 1초 버텨 줘요(하루 2번)',
  pet_bear: '낚은 물고기 크기 +8% · 타고 다니기(1.4배 빠르게)',
  pet_duck: '릴 미니게임 원 크기 +10%',
};
export function petEffectText(id: string) { return PET_EFFECTS[id] ?? ''; }
