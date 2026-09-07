export interface ProblemBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// 단계형 풀이 체크리스트 — "어디서 막혔는가" 축(향후 rootCauses="왜 틀렸는가", needsHelp="얼마나
// 심하게 막혔는가"와 조합해 통계용으로 쓸 수 있게 서로 다른 필드로 분리 유지).
export type StageType = 'CONDITION' | 'CONCEPT' | 'STRATEGY' | 'FORMULATION' | 'CALCULATION' | 'VERIFY';

export interface SolutionCheckpoint {
  stageType: StageType;
  label: string;   // 학생용 짧은 체크 문구
  detail: string;  // 선택 시 펼쳐지는 설명 — 정답/구체 수치 미노출
  hint: string;    // "여기서 막혔어요" 선택 시 함께 보여줄 힌트 — 역시 정답/구체 수치 미노출
  status: 'unanswered' | 'understood' | 'stuck'; // 기본 unanswered. 단순 미체크는 절대 약점 데이터로 취급하지 않음
}

export interface SolutionCheckpointStage {
  stage: 1 | 2 | 3 | 4; // 기존 4단계(문제이해/계획세우기/계획실행/돌아보기)에 대응. 제목 문자열은 상수로 관리
  checkpoints: SolutionCheckpoint[];
}

// 체크리스트 2.0 — solvingProcess(AI 풀이)에 종속되지 않는 새 구조. "AI 풀이를 이해했나요?"가 아니라
// "풀기 전에 기본적인 접근을 했나요?"를 확인하는 용도로 목적을 재정의하면서, 4단계 고정 구조 대신
// 평면 리스트로 단순화했다(고정 3개 + AI가 생성하는 문제별 맞춤 1~3개). 기존 SolutionCheckpointStage와
// 같은 필드를 재사용하면 신/구 shape이 섞여 판별이 어려워지므로 별도 필드(solutionChecklist)로 분리.
export interface SolutionChecklistItem {
  id: string;              // 'fixed-1'~'fixed-3' | 'ai-0'~'ai-2' — 재생성해도 fixed id는 안정적으로 유지
  text: string;
  source: 'fixed' | 'ai';  // 'fixed'는 매번 AI 호출 없이 클라이언트 상수로 렌더(토큰 절감)
  status: 'unanswered' | 'done' | 'stuck'; // 미응답은 막힘으로 간주하지 않음
}

export interface SolutionChecklist {
  items: SolutionChecklistItem[];
}

export interface MistakeAnalysis {
  solvingProcess: string;   // [문제 풀이 과정]
  mistakeSummary?: string;  // [학생 풀이 기반 틀린 이유 1줄 요약] (레거시 필드 — 더 이상 생성/저장/렌더하지
                            // 않음. "AI 틀린 이유 진단" 기능 자체를 제거하면서 신규 분석은 이 필드를 채우지
                            // 않게 됐지만, 과거에 이미 저장된 값이 있는 기존 레코드와의 DB 호환을 위해 타입은
                            // 남겨둔다.)
  finalAnswer?: string;     // [최종 정답만 한 줄 — 복습 체크 전 스크롤 없이 바로 확인용]
  problemText?: string;     // [추출된 원본 문제 지문]
  problemBox?: ProblemBox;  // [인쇄된 문제 영역 바운딩 박스 (필기 제외)]
  matchedVideoId?: string;       // AI가 직접 매칭한 유튜브 Video ID
  matchedStartSeconds?: number;  // AI가 직접 매칭한 유튜브 시작 시간(초)
  matchedChapterTitle?: string;  // AI가 직접 매칭한 챕터 제목
  mistakeDetail?: string;   // [실수한 지점 상세 분석] (이전 데이터 호환용)
  rootCause?: string;       // [근본적인 틀린 이유] (이전 데이터 호환용)
  actionPlan?: string;      // [향후 재발 방지 대책] (이전 데이터 호환용)
  modelUsed?: string;       // 분석에 사용된 AI 모델 명
  printed?: boolean;        // 인쇄/출력 완료 여부
  reviewDates?: string[];   // 단계별 복습 완료 일자 배열 (['7/10', '', ''])
  reviewPoints?: number[];  // 단계별로 체크한 "그 순간" 영구 저장된 콤보 포인트 (1차 O=3/2차 O=7/3차 O=15, X·★=1) — 나중에 정리하기로 O가 다른 칸으로 옮겨가도 이 값은 안 바뀜
  pointLog?: { date: string; points: number }[]; // 포인트를 실제로 딴 "그 날짜"에 영구 귀속시키는 append-only 로그. reviewPoints는 정리하기로 슬롯이 합쳐지면 그 슬롯의 날짜(reviewDates[i])를 따라가 버려 원래 다른 날짜에 딴 점수가 엉뚱한 주(week)로 재배정될 수 있음 — 주간 랭킹 집계는 반드시 이 로그 기준으로 해야 정리하기가 몇 번 일어나도 안전함
  reviewLog?: { date: string; state: ReviewState; slot: number }[]; // 복습 체크 "결과"를 딴 그 순간에 영구 귀속시키는 append-only 로그. reviews/reviewDates는 "정리하기"로 X·★ 칸이 비워지는 게 정상 동작(다시 풀어보라고 슬롯을 리셋)이라, 그 슬롯 상태만으로는 당일 결과 이력을 재구성할 수 없음 — 관리자 어드민의 당일 정답률처럼 "정리하기와 무관하게 오늘 실제로 무슨 결과가 있었는지"가 필요한 집계는 이 로그를 써야 함. date는 pointLog(연도 없음)와 달리 ISO 문자열(연도 포함). slot은 같은 칸을 같은 날 다시 고친 경우 "그 칸의 최종 상태" 하나만 인정하기 위한 키(시도/정정 횟수는 별도로 세지 않음) — state:''는 되돌리기로 그 칸의 체크가 취소됐다는 뜻이라 집계에서 제외
  durationMs?: number;      // 이 진단(classify+extract+solve 전체)이 실제로 걸린 시간(ms) — 평균 대기시간 계산용
  needsHelp?: boolean;      // 복습 3칸이 모두 채워졌는데 O가 하나도 없었던 적이 있다는 영구 플래그("도움 필요").
                            // reviews/reviewDates만으로 판정하면 "정리하기"로 3칸이 비워지는 순간 신호가 사라지므로
                            // (정리하기는 의도된 리셋 — 다시 풀어보라는 것) 별도로 영속시킨다. App.tsx의
                            // handleUpdateReviews에서만 갱신: 3칸 완료 + O 없음 → true, 이후 그 문제에서 O가
                            // 하나라도 나오면 → false. 그 외(정리하기로 비워짐 포함)에는 이전 값 그대로 유지.
  solutionCheckpoints?: SolutionCheckpointStage[]; // (레거시 필드 — 체크리스트 2.0으로 대체되어 신규
                            // 분석에서는 더 이상 생성/저장하지 않는다. 과거에 이미 생성된 레코드와의
                            // DB 호환을 위해 타입/렌더 모두 그대로 유지.)
  solutionChecklist?: SolutionChecklist; // 체크리스트 2.0 — 이미지 기반 FAST 호출로 solve와 병렬 생성,
                            // 없으면 아직 생성 전이거나 실패.
  checkpointStuckLog?: { date: string; stage: 1 | 2 | 3 | 4; stageType: StageType }[]; // "여기서
                            // 막혔어요"를 선택할 때마다 append-only로 기록. 이후 understood로 바뀌어도
                            // 이 로그는 지우지 않음 — reviewLog와 동일한 이유(라이브 status만 보면
                            // 재선택으로 덮여써져 장기 통계가 불안정해짐).
}

// classify 완료 직후, solve가 아직 실질적인 텍스트를 스트리밍하기 전까지 잠깐 노출되는 placeholder 문구.
// App.tsx(classifyStep)에서 설정하고, MistakeDetailModal에서 "아직 진짜 풀이 내용이 아님"을 구분하는 데 사용.
export const SOLVING_PLACEHOLDER_TEXT = "### 1단계: 문제 이해하기\nAI가 정밀 문제 해설을 분석 중입니다... 잠시만 기다려 주세요.";

export type ReviewState = 'O' | 'X' | 'star' | '';

// "도움 필요" 판정의 유일한 기준점 — 학생 상단고정/MistakeCard 배지/ScaffoldingPanel이 전부 이
// 함수를 통해서만 판정해야 세 곳이 항상 같은 의미를 쓴다는 게 보장된다.
// analysis.needsHelp가 저장되어 있으면(true든 false든) 그 값을 최우선으로 신뢰한다 — 배포 이후
// 정리하기로 유지된 true, O 획득 이후의 false 모두 이 값에 이미 정확히 반영되어 있다.
// 값이 아직 없는(undefined) 경우에만 — 즉 이 기능이 배포되기 전부터 이미 3칸이 채워져 있던
// 레거시 데이터에 한해서만 — reviews를 즉석에서 훑어 "3칸 모두 채워짐 && O 없음"으로 판정한다.
// `??`를 써야 하는 이유: `||`를 쓰면 명시적으로 저장된 false(정리 후 유지 아님/이미 해결됨)가
// falsy로 취급되어 레거시 재계산으로 다시 true가 튀어나올 수 있다.
export function resolveNeedsHelp(reviews: ReviewState[] | undefined, needsHelp: boolean | undefined): boolean {
  return needsHelp ?? (
    !!reviews && reviews.length === 3 && reviews.every(r => r !== '') && !reviews.includes('O')
  );
}

// 날짜별 복습 정답률 한 행 — AdminUserStat.todayReviewedCount 등("오늘" 정답률)과 정의를
// 완전히 동일하게 날짜 축으로 확장한 것. date는 로컬 자정 기준 'YYYY-MM-DD'.
export interface DailyReviewStat {
  date: string;
  reviewedCount: number;
  correctCount: number;
  incorrectCount: number;
}

export interface AdminUserStat {
  userId: string;
  email: string;
  mistakeCount: number;      // 전체 오답노트 수
  completedCount: number;    // 복습완료(O 3회) 수
  lastActivity: string | null; // 최근 활동일 (ISO string)
  weeklyScore: number;       // 주간 복습 랭킹 점수
  weeklyTotalCount: number;  // 이번주 등록된 오답 수
  weeklyCompletedCount: number; // 이번주 복습완료(O 3회) 수
  schoolGrade?: string;      // 학년 정보 (예: 중3, 고1)
  nickname?: string;         // 커스텀 닉네임 (예: 성은성혁맘.❤️^^)
  equippedTitle?: string;   // 장착 중인 칭호 (예: 수학의 신)
  equippedStamp?: string;   // 장착 중인 스탬프 (effectValue)
  equippedTheme?: string;   // 장착 중인 테마 (effectValue, hex)
  equippedAiVoice?: string; // 장착 중인 AI 말투 (effectValue)
  lastReviewDate?: string | null; // 마지막 복습 일자
  comboPoints?: number;      // 럭키상점 콤보 포인트 잔액
  todayReviewedCount: number;   // 오늘 체크한 복습 건수 (O+X+★, reviewLog 기준)
  todayCorrectCount: number;    // 오늘 정답(O) 수
  todayIncorrectCount: number;  // 오늘 오답 처리 수 (X+★ 합산 — 코드 전반에서 "미채택" 취급과 동일 기준)
  dailyReviewStats?: DailyReviewStat[]; // 최근 14일치, 최신 날짜 먼저. 활동 없는 날짜는 행 자체가 없음(0행 생성 안 함)
}

// 5대 실수 원인 유형 (체크박스)
export const ROOT_CAUSE_OPTIONS = [
  { id: 'calc',     label: '🧮 계산 실수',       desc: '연산, 산수 오류' },
  { id: 'formula',  label: '📘 공식 오적용',      desc: '공식 암기 부족 / 혼동' },
  { id: 'misread',  label: '🔍 문제 오독',        desc: '조건 누락, 문제를 잘못 읽음' },
  { id: 'concept',  label: '🧠 개념 부족',        desc: '핵심 개념 이해 부족' },
  { id: 'strategy', label: '🎯 풀이 전략 실패',   desc: '어떻게 접근할지 방향을 잡지 못함' },
] as const;

export type RootCauseId = typeof ROOT_CAUSE_OPTIONS[number]['id'];

// 수학 교육과정 과목 및 하위 단원 체계 (중3 + 고교 2022 개정 세분화 버전)
export const MATH_CURRICULUM: Record<string, string[]> = {
  '중3-1':    ['제곱근과 실수', '근호를 포함한 식의 계산', '다항식의 곱셈과 인수분해', '이차방정식', '이차함수와 그래프'],
  '중3-2':    ['삼각비', '원과 직선', '원주각', '통계(대푯값과 산포도)'],
  '공통수학1': ['다항식의 연산', '나머지정리와 인수분해', '복소수', '이차방정식', '이차방정식과 이차함수', '여러 가지 방정식', '여러 가지 부등식', '경우의 수', '순열과 조합', '행렬과 그 연산'],
  '공통수학2': ['평면좌표', '직선의 방정식', '원의 방정식', '도형의 이동', '집합', '명제', '함수', '유리함수', '무리함수'],
  '대수':      ['지수와 로그', '지수함수와 로그함수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)', '삼각함수의 활용 (사인법칙, 코사인법칙 등)', '등차수열과 등비수열', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'],
  '미적분Ⅰ':   ['함수의 극한', '함수의 연속', '미분계수와 도함수', '접선의 방정식과 평균값 정리', '극대·극소와 그래프', '방정식·부등식과 미분', '부정적분과 정적분', '정적분의 활용'],
  '미적분Ⅱ':   ['수열의 극한', '급수', '지수함수와 로그함수의 미분', '삼각함수의 미분', '여러 가지 미분법', '초월함수의 도함수 활용', '여러 가지 적분법', '초월함수 정적분의 활용'],
  '확률과 통계': ['여러 가지 순열과 조합', '이항정리', '확률의 뜻과 성질', '조건부확률', '확률분포', '통계적 추정'],
  '기하':      ['이차곡선', '평면벡터의 연산과 성분', '평면벡터의 내적', '공간도형과 공간좌표'],
  '기타':      ['기타'],
};

export const GRADE_LIST = Object.keys(MATH_CURRICULUM);

export interface MistakeEntry {
  id: string;
  userId?: string;          // Supabase user_id (admin 조회 시 사용)
  title: string;
  imageUrl: string;
  date: string;             // ISO date string
  updatedAt?: string;       // ISO date string
  analysis?: MistakeAnalysis;
  reviews?: ReviewState[];
  grade?: string;
  chapter?: string;
  rootCauses?: string[];
  userActionPlan?: string;
  teacherScaffoldingHint?: string;
  isHidden?: boolean;       // 시험범위 제외 등으로 메인 리스트에서 숨김 처리됐는지 (구버전 데이터는 undefined -> false 취급)
  answerImageUrl?: string;  // 학생이 AI 진단 이후 직접 다시 풀어본 풀이 사진(선택, 1장). 원본 문제
                            // 이미지(imageUrl)와 별개 Storage 버킷(answer-images)에 저장되며 의미도 다름
                            // — 섞이지 않도록 필드/버킷 모두 분리.
}

export type ActiveTab = 'notes' | 'completed' | 'camera' | 'stats' | 'admin' | 'guide' | 'store' | 'activity' | 'scaffolding' | 'hidden';

export type GachaRarity = 'MR' | 'UR' | 'SSR' | 'SR' | 'R';
export type GachaCategory = 'STAMP' | 'TITLE' | 'THEME' | 'SHIELD' | 'AI_VOICE' | 'CHARM';

export interface GachaItem {
  id: string;
  name: string;
  description: string;
  rarity: GachaRarity;
  category: GachaCategory;
  icon: string;
  imageUrl?: string;
  effectValue?: string; // e.g. '#10B981', '🐾', '수학의 연금술사'
  gradient?: string; // e.g. 'linear-gradient(135deg, #10B981 0%, #047857 50%, #6EE7B7 100%)'
  themeAccentValue?: string; // THEME 전용: 테두리/액센트에 별도로 쓰이는 2번째 hex (예: 골드 배경 + 은하수 보라 테두리)
  color: string;
  isLimited?: boolean; // 🔒 한정판/특수지급 전용 (가챠 뽑기Pool 제외 여부)
  visualVariant?: 'rainbow_wave'; // 🌈 개별 특별 칭호 전용 시각 이펙트 변형 플래그
}

export interface EquippedItems {
  stamp?: string;     // stamp emoji e.g. '🐾'
  title?: string;     // title string e.g. '수학의 연금술사'
  theme?: string;     // theme color name/hex e.g. 'emerald'
  aiVoice?: string;   // AI persona type e.g. 'tsundere'
}

