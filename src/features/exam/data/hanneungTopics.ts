// 한능검 문항 시대 태그 레지스트리(paperId → 태그 파일). 다른 회차는 *.topics.json을 만들고 여기에 한 줄 추가한다.
// 태그 파일에는 정답·배점이 없다 — 정답이 든 시험지 JSON은 프런트엔드에서 import하지 않는다.
import type { HanneungTopicFile } from '../ui/hanneungEra.ts';
import advanced74 from './2025-hanneung-74-advanced.topics.json';
import advanced75 from './2025-hanneung-75-advanced.topics.json';
import advanced76 from './2025-hanneung-76-advanced.topics.json';
import advanced77 from './2026-hanneung-77-advanced.topics.json';
import advanced78 from './2026-hanneung-78-advanced.topics.json';
import advanced79 from './2026-hanneung-79-advanced.topics.json';

const TOPIC_FILES = [advanced74, advanced75, advanced76, advanced77, advanced78, advanced79] as HanneungTopicFile[];

const BY_PAPER = new Map(TOPIC_FILES.map(file => [file.paperId, file]));

export function hanneungTopicsFor(paperId: string | null): HanneungTopicFile | null {
  return paperId ? BY_PAPER.get(paperId) ?? null : null;
}
