// A로 말 걸기/살펴보기 했을 때 대화창에 띄울 말. 대상 id(장면 정의의 Interactable.id) → 화자 + 줄들.
// 순수 함수(허수아비 대사는 밭 상태를 아는 쪽이 함수로 넘겨준다).
import { FURNITURE } from '../../pixel-room/model';
import type { FurnitureType } from '../../pixel-room/model';
import { FURNITURE_LINES, FURNITURE_NAMES } from './roomLines';

export interface DialogueText { speaker: string; lines: string[] }
export interface DialogueContext { scarecrowLine: () => string }

export function dialogueFor(id: string, context: DialogueContext): DialogueText | null {
  if (id === 'scarecrow') {
    const first = context.scarecrowLine();
    let second = context.scarecrowLine();
    for (let i = 0; i < 4 && second === first; i++) second = context.scarecrowLine();
    return { speaker: '허수아비', lines: second === first ? [first] : [first, second] };
  }
  if (id === 'gate') return { speaker: '안내판', lines: ['↓ 광장 가는 길', '광장은 다음 베타에서 열려요. 조금만 기다려 주세요!'] };
  if (id.startsWith('furniture:')) {
    const type = id.slice('furniture:'.length);
    if (!Object.hasOwn(FURNITURE, type)) return null;
    return { speaker: FURNITURE_NAMES[type as FurnitureType], lines: [...FURNITURE_LINES[type as FurnitureType]] };
  }
  return null;
}
