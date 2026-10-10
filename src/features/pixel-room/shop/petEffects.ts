// 상점·옷장 펫 카드에 보이는 효과 설명. 실제 효과는 서버(start_pixel_cast·get_pixel_fishing_state)가 정한다 —
// 숫자를 바꾸면 이 글도 함께 고친다(tests/pixel-world-phaser/pet-effects.test.ts가 서버 SQL과 대조).
const PET_EFFECTS: Record<string, string> = {
  pet_dog: '희귀·전설 물고기가 물면 반짝여서 알려 줘요',
  pet_pigeon: '아직 못 낚은 물고기 힌트를 하루 하나 알려 줘요(거북이)',
  pet_bear: '낚은 물고기 크기 +8% · 타고 다니기(1.4배 빠르게)',
  pet_duck: '특별한 효과 없이 졸졸 따라다녀요',
};
export function petEffectText(id: string) { return PET_EFFECTS[id] ?? ''; }
