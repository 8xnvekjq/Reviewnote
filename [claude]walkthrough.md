# [Claude] AI 진단 속도 개선 작업 기록

이 문서는 **Claude**가 수행한 변경 이력만 별도로 기록합니다. (기존 `walkthrough.md`는 다른 작업 기록이며, 이 파일과는 독립적입니다.)

작업 배경: "AI로 호출해서 진단하는 과정이 너무 오래 걸린다"는 문제 제기에 따라 원인을 분석하고, 커밋 히스토리(`f29d42d`, `1c36660`)를 확인해 **2단계(classify→solve) 분리 호출 자체는 의도된 설계**임을 확인한 뒤, 그 설계를 유지하면서 **의도되지 않은 중복 작업만 제거**하는 방향으로 수정했습니다.

---

## 1. 문제 진단 요약

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| 1 | `classifyMistakeWithGemini`와 `solveMistakeWithGemini`가 각자 독립적으로 이미지를 CDN에서 재다운로드 + 재압축(Canvas 리사이즈) | `src/services/gemini.ts` | 같은 이미지를 두 번 받고 두 번 압축 → 진단 1건당 네트워크 왕복/CPU 압축 시간이 사실상 2배 |
| 2 | 무료 API 키 실패 시 `runAnalysisFlow` 전체(=classify+solve)를 유료 키로 처음부터 재실행 | `src/App.tsx` `handleStartAnalysis` | 이미 성공한 1차 분류(classify)까지 버리고 재실행 → 최악의 경우 이미지 다운로드/압축 4회, API 호출 4회 |
| 3 | Gemini API 호출 및 이미지 다운로드 fetch에 타임아웃이 없음 | `src/services/gemini.ts` | 네트워크가 지연되면 사용자는 무한정 로딩 스피너만 보게 됨 |

> 참고: 2단계 분리 호출(classify→solve) 구조 자체는 커밋 [`f29d42d`](https://github.com/8xnvekjq/Reviewnote/commit/f29d42d) *"refactor: Migrate Gemini API to 2-Pass async request for faster classification & deep-link matching"* 에서 의도적으로 도입된 UX 설계(과목/단원/영상 매칭을 먼저 빠르게 보여주고 상세 해설은 뒤이어 채우는 progressive reveal)입니다. 이번 수정은 이 설계를 **그대로 유지**했습니다.

---

## 2. 변경 내용

### 2-1. 이미지 준비 과정 1회 공유 (`src/services/gemini.ts`)

- 기존: `classifyMistakeWithGemini(imageUrl, ...)` / `solveMistakeWithGemini(imageUrl, ...)` 각각이 내부에서 `imageUrlToBase64(imageUrl)`을 호출.
- 변경: 두 함수의 첫 번째 파라미터를 `imageUrl: string` → `image: { mimeType: string; base64Data: string }`로 변경. 함수 내부의 재다운로드/재압축 로직을 제거하고 전달받은 값을 그대로 사용.
- 새 함수 `prepareGeminiImage(imageUrl)`를 export하여, **호출부(App.tsx)에서 진단 1건당 딱 한 번만** 이미지를 다운로드/압축하도록 함.

```ts
// Before
export async function classifyMistakeWithGemini(imageUrl: string, apiKey: string, ...) {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl); // 매번 재다운로드+재압축
  ...
}
export async function solveMistakeWithGemini(imageUrl: string, apiKey: string, ...) {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl); // 위와 동일한 이미지를 또 다운로드+압축
  ...
}

// After
export async function prepareGeminiImage(imageUrl: string) {
  return imageUrlToBase64(imageUrl); // 진단당 1회만 호출
}
export async function classifyMistakeWithGemini(image: { mimeType: string; base64Data: string }, apiKey: string, ...) {
  const { mimeType, base64Data } = image; // 재사용
  ...
}
export async function solveMistakeWithGemini(image: { mimeType: string; base64Data: string }, apiKey: string, ...) {
  const { mimeType, base64Data } = image; // 동일 이미지 재사용, 재다운로드 없음
  ...
}
```

### 2-2. 폴백(무료→유료 키) 재시도 범위 축소 (`src/App.tsx`)

- 기존: `runAnalysisFlow(entry, apiKey, studentGrade)` 하나가 classify+solve 전체를 수행. 무료 키 실패 시 이 함수 전체를 유료 키로 재호출 → classify까지 이미 성공했어도 처음부터 다시 실행.
- 변경: `runAnalysisFlow`를 `classifyStep` / `solveStep` 두 단계로 분리하고, `handleStartAnalysis`에서 `classifiedEntry` 성공 여부를 추적. 무료 키로 classify는 성공했는데 solve에서 실패한 경우, **solve 단계만** 유료 키로 재시도(1차 분류 결과 재사용). classify 자체가 실패했을 때만 처음부터 재시도.

```ts
// Before
try {
  await runAnalysisFlow(entry, freeKey, studentGrade); // classify+solve 전체
} catch (err) {
  if (paidKey) await runAnalysisFlow(entry, paidKey, studentGrade); // 전체 재실행
}

// After
let classifiedEntry: MistakeEntry | null = null;
try {
  classifiedEntry = await classifyStep(entry, freeKey, studentGrade, image);
  await solveStep(classifiedEntry, freeKey, studentGrade, image);
} catch (err) {
  if (paidKey) {
    if (classifiedEntry) {
      await solveStep(classifiedEntry, paidKey, studentGrade, image); // solve만 재시도
    } else {
      const retryEntry = await classifyStep(entry, paidKey, studentGrade, image);
      await solveStep(retryEntry, paidKey, studentGrade, image);
    }
  }
}
```

- 위 두 케이스 모두 `image`(2-1에서 한 번만 준비한 값)를 그대로 재사용하므로, 재시도 시에도 이미지 재다운로드/재압축은 발생하지 않습니다.

### 2-3. fetch 타임아웃 추가 (`src/services/gemini.ts`)

- `fetchWithTimeout()` 헬퍼를 추가해 `AbortController` 기반 타임아웃을 적용.
  - CDN 이미지 다운로드: 20초
  - Gemini `generateContent` 호출: 45초 (2차 solve 단계가 긴 해설 텍스트를 생성하는 점을 감안해 여유 있게 설정)
- 타임아웃 발생 시 `AbortError`를 사용자 친화적인 한국어 오류 메시지로 변환("이미지 다운로드 시간이 초과되었습니다." / "Gemini API 응답 시간이 초과되었습니다.")하여 무한 대기 대신 명확한 실패 피드백을 제공.

---

## 3. 변경하지 않은 것 (의도적으로 유지)

- **2단계(classify→solve) 분리 구조**: 커밋 `f29d42d`에서 의도한 progressive reveal UX(과목/단원/영상 매칭을 먼저 보여주는 것)를 그대로 유지했습니다. 두 API 호출을 병렬화하거나 하나로 합치지 않았습니다.
- **Canvas 기반 이미지 압축(1200px, JPEG 0.82)**: 커밋 `1c36660`에서 비용 절감 목적으로 의도된 로직이므로 값/방식을 그대로 유지하고, "중복 호출"만 제거했습니다.
- **크롭 단계(`ImageCropper.tsx`)의 원본 해상도 유지**: 이번 작업 범위에서 제외했습니다. (검토 시 언급했던 별도 개선 후보이며, 스토리지/업로드 용량에 영향을 주는 부분이라 별도 논의 후 진행하는 것을 권장합니다.)
- **`streamGenerateContent`로의 전환**: 응답 스키마 파싱 방식이 크게 바뀌어야 하는 더 큰 리팩터링이라 이번 작업에는 포함하지 않았습니다.

---

## 4. 기대 효과

- 진단 1건당 이미지 다운로드+압축 횟수: **2회 → 1회**
- 무료→유료 키 폴백 시나리오에서 classify가 이미 성공한 경우: classify 재실행 **1회 → 0회** (solve만 재시도)
- 네트워크 지연 시 무한 대기 대신 20~45초 내 명확한 오류 메시지로 실패 처리

## 5. 변경 파일

- [src/services/gemini.ts](src/services/gemini.ts) — `prepareGeminiImage` 추가, `classifyMistakeWithGemini`/`solveMistakeWithGemini` 시그니처 변경, `fetchWithTimeout` 추가
- [src/App.tsx](src/App.tsx) — `runAnalysisFlow`를 `classifyStep`/`solveStep`으로 분리, `handleStartAnalysis`에서 이미지 1회 준비 및 폴백 재시도 로직 개선

## 6. 검증

- `npx tsc -b --noEmit` 통과 (타입 오류 없음)
- UI 동작(브라우저 실사용) 검증은 별도로 진행되지 않았으므로, 실제 진단 흐름(무료키 성공/실패 각각) 테스트를 권장합니다.

---

## 7. 2차 개선 — 무료키 배제 + thinking 설정 + 프롬프트 정리

배경: 1차 개선 이후에도 "AI 진단 누르고 풀이가 뜨기까지 1분이 넘고, 간혹 응답시간초과 에러가 뜬다"는 문제가 계속 보고되었습니다. 조사 결과, 무료 API 키가 **앱 전체 사용자가 공유하는 단일 키**([App.tsx](src/App.tsx) `fetchGeminiApiKeys`)이고, Gemini 무료 티어는 분당 10~15회(RPM)로 제한되며 2025년 12월에 Google이 무료 할당량을 추가로 50~80% 축소한 사실을 확인했습니다. 여러 학생이 동시에 진단을 요청하면 이 낮은 공유 RPM에 걸려 지연/오류가 발생할 가능성이 높다고 판단했습니다.

### 7-1. 무료 키 완전 배제, 유료 키만 사용 ([App.tsx](src/App.tsx))
- `freeGeminiKey` 상태와 무료→유료 폴백 분기, `daily_free_count`/`last_request_date` 조회·갱신 로직을 모두 제거했습니다.
- `handleStartAnalysis`는 이제 `paidGeminiKey`가 없으면 즉시 안내 후 중단하고, 있으면 바로 `classifyStep` → `solveStep` 순으로 진행합니다.
- 참고: `profiles.daily_free_count`/`last_request_date` DB 컬럼과 `system_config`의 `gemini_api_key`(무료키) 값 자체는 그대로 두었습니다 — 스키마 삭제는 이번 범위에 포함하지 않았고, 필요시 나중에 되돌리거나 정리할 수 있습니다.

### 7-2. classify 단계만 thinking 비활성화 ([gemini.ts](src/services/gemini.ts))
- `classifyMistakeWithGemini`의 `generationConfig`에 `thinkingConfig: { thinkingBudget: 0 }`을 추가했습니다. 이 단계는 정해진 과목/단원 목록(enum) 중에서 고르는 분류 작업이라 깊은 추론이 필요 없어 안전하게 지연시간을 줄일 수 있습니다.
- **`solveMistakeWithGemini`는 의도적으로 그대로 두었습니다.** 실제 수학 문제를 계산해서 풀어야 하는 단계라 thinking을 끄면 검산 없이 한 번에 답을 써내려가게 되어, 특히 미적분/확통/기하 등 다단계 연산에서 오답 위험이 커질 수 있다고 판단했기 때문입니다. (사용자 확인 후 결정)

### 7-3. solve 프롬프트 경미한 중복 제거 ([gemini.ts](src/services/gemini.ts))
- `solveMistakeWithGemini`의 `studentInfoPrompt` 중 `[Curriculum Locking]` 항목에서 이미 메인 프롬프트 상단에 명시된 `resolvedGrade`/`resolvedChapter`를 다시 반복 언급하던 부분만 제거했습니다. 지침의 실질 내용(선행 개념 사용 금지)은 그대로 유지했습니다.
- 이 변경은 지연시간에 미치는 영향이 미미합니다(입력 토큰 수 감소는 적음). 실제 1분 이상 걸리는 원인은 주로 solve 단계가 한 번의 비-스트리밍 호출에서 OCR 추출·바운딩박스 계산·실제 풀이·정형 포맷팅·힌트 생성까지 한꺼번에 처리하기 때문이며, 이는 스트리밍 전환 등 더 큰 변경 없이는 근본적으로 해결하기 어렵다는 점을 사용자에게 별도로 안내했습니다 (이번 라운드에는 미포함).

### 7-4. 변경하지 않은 것 (검토했으나 보류)
- **스트리밍(`streamGenerateContent`) 전환**: 체감 속도 개선 효과가 가장 크지만, `responseSchema` 기반 구조화 JSON 출력을 스트리밍으로 받으면 완성되기 전까지는 유효한 JSON이 아니어서 부분 파싱이 필요합니다. 이 프롬프트/파서는 과거에도 LaTeX 백슬래시 이스케이프 문제로 버그가 난 이력이 있어(`6f4e884` "Eliminate double escape legacy parser"), 리스크가 있다고 판단해 별도 논의 후 진행하기로 보류했습니다.

### 검증
- `npx tsc -b --noEmit` 통과
- `npx oxlint src/App.tsx` 결과, 기존에도 있던 `rules-of-hooks` 관련 오탐(35건, 이번 변경 전 커밋에서도 동일하게 발생 확인)은 이번 변경과 무관하며, 변경 후 34건으로 오히려 1건 감소(제거된 `freeGeminiKey` 훅 1개만큼 자연 감소) — 새로 추가된 lint 오류 없음.

---

## 8. 3차 개선 — 힌트(hints) 기능 완전 제거

배경: "힌트는 아무도 안 보더라, 힌트는 제거하자"는 피드백에 따라, 학생 학습에 실사용되지 않는 3단계 힌트 기능을 프롬프트·타입·UI 전 영역에서 제거했습니다. 사용하지 않는 출력 필드를 없애면 solve 단계가 생성해야 할 텍스트 양이 줄어 부수적으로 지연시간에도 소폭 도움이 됩니다.

### 변경 파일
- **[gemini.ts](src/services/gemini.ts)** — `solveMistakeWithGemini`의 반환 타입·프롬프트 지시문·`responseSchema`·`required` 배열에서 `hints` 관련 내용을 모두 제거. classify 단계 프롬프트에 남아있던 "힌트" 언급(원래 단일 프롬프트였던 시절의 잔재 문구)도 함께 정리.
- **[types/index.ts](src/types/index.ts)** — `MistakeAnalysis.hints?: string[]` 필드 제거.
- **[App.tsx](src/App.tsx)** — `classifyStep`의 1차 placeholder 분석과 `solveStep`의 최종 분석 조립부에서 `hints` 대입 제거, 관련 주석 문구 정리.
- **[MistakeDetailModal.tsx](src/components/MistakeDetailModal.tsx)** — "💡 단계별 힌트" 공개 UI 블록 전체 삭제, 이 UI에서만 쓰이던 `revealedHintCount` state(및 리셋 호출 2곳)와 `hasStruggled` 변수도 함께 제거.
- **[StudentGuide.tsx](src/components/StudentGuide.tsx)**, **[AdminPanel.tsx](src/components/AdminPanel.tsx)** — 사용법 안내 문구에서 "3단계 힌트가 자동 처방됩니다" → "대책이 자동 처방됩니다"로 수정.

### 변경하지 않은 것
- DB(`mistakes.analysis` JSONB)에 이미 저장된 과거 `hints` 데이터는 그대로 둡니다. 앱이 더 이상 이 필드를 읽지 않으므로 화면에는 노출되지 않고, 별도 마이그레이션 없이도 안전합니다.
- `src/services/tmp/(기존)gemini.txt`는 코드에서 import되지 않는 과거 백업 텍스트라 손대지 않았습니다.

### 검증
- `npx tsc -b --noEmit` 통과
- `npx oxlint src` — hook 관련 기존 오탐(36건) 및 그 외 경고(10건) 모두 이번 변경 전과 동일 — 새로 추가된 lint 오류 없음
- 활성 소스 전체에서 `hints`/`힌트` 문자열 재검색 결과 없음 (아카이브 파일 제외)

---

## 9. 4차 개선 — 실측 기반 검증 + 스트리밍 전환 + problemText/problemBox 병렬화

배경: 사용자가 제공한 실제 수능 문제 사진 1장과 유료 API 키로, 매 단계 코드 변경을 실제 Gemini API 호출로 검증하며 진행했습니다 (스크립트는 세션 스크래치패드에 위치, 저장소에는 포함 안 됨). 이 과정에서 처음의 가설(무료키 rate limit이 주범)이 실측으로 뒷받침됐고, 추가로 두 가지 실제 개선 기회와 버그 하나를 발견했습니다.

### 9-1. 실측으로 확인된 것
- 유료키 단독 호출 시 classify(2.7초, thinking 0)+solve(29.1초, thinking 4,606) = **총 31.9초** — 사용자가 보고한 "1분 넘게"보다 훨씬 빠름. 무료키 rate limit이 실제 원인이었을 가능성을 뒷받침.
- 힌트 유/무 A/B 비교: 힌트 추가 시 +8.8초(37% 느려짐), thinking 토큰 +142% — 힌트 텍스트 자체(≈130 토큰)보다 훨씬 큰 비율로 thinking을 소모함을 확인. 힌트 제거가 실제로 유의미한 개선이었음을 검증.
- solve의 dynamic thinking은 동일 문제·동일 프롬프트에도 호출마다 편차가 큼(관측: 1,173 / 2,834 / 4,606 토큰). thinkingBudget을 0으로 끄면 안 되는 이유(계산 정확도)와, 대신 상한선만 걸어 안전판으로 쓰는 방안을 논의했으나 이번 라운드에는 적용하지 않음 (사용자가 4번 항목 진행을 요청).
- **Gemini 쪽 실제 503 "model is currently experiencing high demand" 오류를 스트리밍 테스트 중 2연속으로 직접 관측함.** 이건 앱 코드와 무관한 Google 서버 과부하이며, "가끔 에러 뜬다"는 문제의 또 다른 실제 원인일 수 있음 → 재시도 로직 추가로 대응 (9-2 참고).

### 9-2. Gemini API 503(일시적 과부하) 자동 재시도 ([gemini.ts](src/services/gemini.ts))
- `callGeminiApi`(non-streaming)와 신규 `streamGeminiApi`(streaming) 양쪽에 동일하게, HTTP 503 응답을 받으면 2초 간격으로 최대 2회 재시도하는 로직을 추가했습니다.
- 401/400 등 재시도해도 의미 없는 에러는 즉시 실패 처리하고, 503만 선별적으로 재시도합니다.

### 9-3. `problemText`/`problemBox`를 classify와 병렬 실행하는 `extractProblemWithGemini` 신설 ([gemini.ts](src/services/gemini.ts))
- 기존에는 solve 호출 하나가 풀이 계산 + OCR 지문 추출 + 바운딩박스 계산을 전부 담당해서 solve의 출력량과 처리 시간이 늘어나고 있었습니다.
- OCR/바운딩박스 추출은 과목·단원 확정과 무관한 작업이라, 별도 함수 `extractProblemWithGemini(image, apiKey)`로 분리해서 **classify와 완전히 동시에** 시작하도록 [App.tsx](src/App.tsx)의 `handleStartAnalysis`를 수정했습니다.
- **버그 발견 및 수정**: 처음에 이 함수도 classify처럼 `thinkingBudget: 0`을 걸었더니, `problemBox`(0~100 백분율이어야 함)가 `{top:86, bottom:841, left:73, right:923}`처럼 범위를 완전히 벗어난 값으로 나오는 걸 실측으로 발견했습니다. 같은 프롬프트를 기본 thinking으로 다시 호출하니 `{top:11.67, bottom:94.47, ...}`처럼 정상 범위로 돌아옴을 확인 — **바운딩박스 좌표 추정은 공간 추론이 필요해서 thinking을 끄면 안 된다는 것**을 실측으로 확인하고, `thinkingConfig` 오버라이드를 제거해 기본값(dynamic thinking)으로 되돌렸습니다. (problemText 자체는 0 thinking으로도 정확했지만 problemBox 때문에 유지)
- 실측 결과, extract 호출(~3~10초)이 solve의 thinking 단계(~12초 이상) 안에 완전히 가려져서 **파이프라인 전체 시간에 추가 지연이 거의 없었습니다.**

### 9-4. `solveMistakeWithGemini`를 스트리밍 순수 텍스트로 전환 ([gemini.ts](src/services/gemini.ts))
- 지난 라운드에 보류했던 스트리밍을 프로토타입으로 먼저 검증한 뒤 적용했습니다. `responseSchema` 기반 JSON을 스트리밍하면 완성 전까지 유효한 JSON이 아니라서 부분 파싱이 위험하다는 우려가 있었는데, **JSON 모드를 아예 쓰지 않고 순수 텍스트 + 구분자(`%%MISTAKE_SUMMARY%%`) 방식**으로 바꿔서 이 문제를 원천 차단했습니다.
  - solve는 이제 `responseMimeType`/`responseSchema` 없이 4개 마크다운 헤더로 된 해설을 그대로 스트리밍하고, 맨 마지막 줄에 구분자 + `mistakeSummary` 한 줄을 덧붙이도록 프롬프트를 수정했습니다.
  - `problemText`/`problemBox`는 9-3에서 분리했으므로 solve의 반환 타입은 `{ solvingProcess, mistakeSummary }`로 단순화됐습니다.
  - 실측 검증: LaTeX 명령어(`\int`, `\frac`, `\ln` 등 73개)가 청크 경계에서 전혀 깨지지 않고 완전하게 보존됨을 확인했습니다 — 과거 `6f4e884` 커밋에서 겪었던 이중 이스케이프 버그 유형이 이 방식에서는 애초에 발생할 수 없는 구조입니다.
  - **SSE 파싱 버그 발견 및 수정**: Gemini 스트리밍 응답의 이벤트 구분자가 `\n\n`이 아니라 `\r\n\r\n`이라는 걸 처음에 놓쳐서 청크가 0개로 파싱되는 문제가 있었습니다. 정규식 `/\r?\n\r?\n/`으로 분리하도록 고쳐서 해결했습니다.
- [App.tsx](src/App.tsx)의 `solveStep`은 이제 `onProgress` 콜백으로 스트리밍 중간 텍스트를 받아 `selectedEntry`(상세 모달)를 실시간 갱신합니다. `mistakes` 목록 상태는 기존과 동일하게 최종 완료 시 1회만 갱신합니다 (목록 카드는 풀이 전문을 안 보여주므로 매 청크 갱신할 필요 없음).
- solve와 extract는 `Promise.all`로 동시에 진행되고, 둘 다 끝난 뒤 결과를 합쳐 DB에 1회만 기록합니다.

### 9-5. 실측 파이프라인 전체 시간
동일 이미지로 새 구조(classify+extract 병렬 → solve 스트리밍) 전체를 실행: classify 2.2초 → (extract는 그 사이 3.2초 만에 완료, 지연에 기여 안 함) → solve 스트리밍 첫 청크 12.2초 후 도착 → 전체 완료 **17.5초**. 이전 순차 구조 실측(31.9초)과 사용자가 원래 보고한 "1분 넘게"에 비해 큰 폭으로 개선되었습니다.

### 9-6. 변경하지 않은 것 / 참고
- LaTeXRenderer는 스트리밍 도중 아직 안 닫힌 `$...$`/`$$...$$`를 만나면 기존 `sanitizeLatex`의 홀수-달러 보정 로직이 임시로 plain text로 보여주다가, 닫는 기호가 도착하면 정상 렌더링됩니다. 즉 스트리밍 중 수식이 잠깐 깨져 보이다 완성되는 건 정상 동작이며 별도 수정이 필요 없습니다.
- 테스트에 사용한 이미지 파일과 유료 API 키는 세션 스크래치패드/`.env.test`에만 있고 저장소에는 포함되지 않았습니다.

### 검증
- `npx tsc -b --noEmit` 통과
- `npx oxlint src` — 새로 추가된 오류/경고 없음 (기존 pre-existing 항목과 동일)
- 실제 Gemini API 호출로 classify/extract/solve 각각과 전체 파이프라인을 검증 완료 (브라우저 UI를 통한 실사용 테스트는 별도로 필요)

---

## 10. 5차 개선 — 스트리밍이 화면에 실제로 안 보이던 버그 수정

배경: 사용자가 실제 배포된 앱에서 테스트해보니 "병렬 처리는 단계적으로 나오는 게 좋다"고 확인했지만, **정작 풀이(solvingProcess)는 스트리밍이 아니라 다 끝난 뒤 한 번에 나타난다**고 피드백을 주었습니다. 9번 항목에서 만든 스트리밍 로직 자체(`onProgress` 콜백, `setSelectedEntry` 실시간 갱신)는 정상 동작하고 있었는데, **UI 쪽에 이걸 실제로 보여줄 경로가 없었던 게 원인**이었습니다.

### 원인
[MistakeDetailModal.tsx:488-534](src/components/MistakeDetailModal.tsx:488)에 `isAnalyzing`이 `true`인 동안 실제 데이터와 무관하게 시간 기반으로만 0→99.5%까지 올라가는 "가상 진행률 타이머"가 있고, [852번째 줄](src/components/MistakeDetailModal.tsx:852)의 렌더링 분기가:

```
{(!showResult && (isAnalyzing || ...)) ? (로딩 스피너) : (실제 결과 UI)}
```

즉 `isAnalyzing`이 `true`인 동안은 무조건 로딩 스피너만 그리고, `showResult`는 전체 분석(solve+extract+DB 저장)이 **완전히 끝난 뒤**에야 `true`가 되도록 설계되어 있었습니다. `selectedEntry.analysis.solvingProcess`는 스트리밍 청크마다 실제로 갱신되고 있었지만, 화면에는 그 상태를 보여줄 조건 분기 자체가 없어서 항상 스피너만 보이다가 끝나야 결과가 "띡" 나타난 것입니다.

### 수정 ([MistakeDetailModal.tsx](src/components/MistakeDetailModal.tsx))
- 로딩 스피너 표시 조건에 `&& !selectedEntry.analysis?.solvingProcess`를 추가해서, **`solvingProcess`에 내용이 생기는 순간부터는(classify 직후 플레이스홀더 텍스트든, solve 스트리밍 중 실제 내용이든) 스피너 대신 실제 콘텐츠 뷰를 즉시 보여주도록** 변경했습니다.
- classify 완료 직후 표시되는 플레이스홀더("AI가 정밀 문제 해설을 분석 중입니다...")도 이미 `### 1단계` 헤더 포맷을 갖추고 있어서, 그대로 실제 콘텐츠 뷰에 자연스럽게 표시되다가 solve 스트리밍이 시작되면 실시간으로 내용이 교체되는 자연스러운 전환이 됩니다.
- "정석 풀이 과정" 카드 제목 옆에 `isAnalyzing`인 동안만 "✍️ 밤티가 실시간으로 작성 중..." pulse 표시를 추가해서, 아직 생성이 끝나지 않았음을 알 수 있게 했습니다.

### 타자기(글자 단위) 애니메이션은 적용하지 않음
사용자와 논의 후, 청크 단위(문장/구 단위, 실측상 200~500ms 간격) 표시로 충분하다고 판단해 별도의 글자 단위 타이핑 애니메이션은 추가하지 않았습니다. (이유: 이 앱은 LaTeX 수식이 많아 글자 단위로 자르면 KaTeX가 매 글자마다 재파싱해야 해서 화면 깜빡임과 저사양 기기 성능 저하 우려가 있었음)

### 검증
- `npx tsc -b --noEmit` 통과
- `npx oxlint src` — 새로 추가된 오류/경고 없음 (기존 pre-existing 10건과 동일)

---

## 11. 6차 개선 — 인사말 일관성 + 학생 통계 기반 격려 멘트

배경: 사용자가 실제 화면 캡처 두 장을 비교하며 "해설 풀이 느낌이 이전과 많이 달라졌다, 페르소나가 바뀐 것 같다"고 지적했습니다. 하나는 "### 1단계"로 바로 시작했고, 다른 하나는 "안녕하세요, 밤티예요!" 인사말로 시작했습니다.

### 원인
9번 항목에서 solve를 `responseMimeType: 'application/json'`(JSON 모드)에서 순수 텍스트 스트리밍으로 전환하면서, `solvingProcess`가 더 이상 스키마로 강제되는 문자열 필드가 아니게 되어 모델이 응답을 어떻게 시작할지에 대한 자유도가 커졌습니다. 프롬프트에 "인사말을 넣어라/넣지 마라"는 지침이 아예 없었기 때문에, 호출마다 인사말 포함 여부가 랜덤하게 갈리고 있었습니다. (밤티 페르소나·말투 자체는 바뀐 적 없음 — 인사말 유무만 불안정했던 것)

### 수정 ([gemini.ts](src/services/gemini.ts), [App.tsx](src/App.tsx))
- 사용자와 상의해 **"매번 인사말 포함 + 학생의 학습 통계를 자연스럽게 녹여 격려/환영 멘트를 추가"**하는 방향으로 결정했습니다.
- `solveMistakeWithGemini`에 `sameChapterMistakeCount`(이 학생이 같은 단원에서 이번 건 포함 몇 번째 오답인지) 파라미터를 추가하고, 프롬프트에 값에 따라 다른 격려 지침을 주입합니다:
  - 1건(처음): "새로운 단원에 도전하는 것을 반갑게 환영"
  - 2건 이상: "반복 실수를 다그치지 않고 꾸준함을 칭찬"
- 가이드라인에 **"본문 시작 전 2~3문장 인사말은 절대 생략 금지"** 항목을 명시적으로 추가해서 매번 일관되게 포함되도록 고정했습니다.
- [App.tsx](src/App.tsx) `solveStep`에서 `mistakes`(이미 로드된 목록)로 `sameChapterMistakeCount`를 즉시 계산해서 넘겨줍니다 — **추가 DB 조회 없음.**
- 실측 검증: count=1(처음)/count=3(세 번째) 두 시나리오 모두 인사말이 빠짐없이 포함되고, 통계 언급도 자연스럽게 녹아드는 것을 확인했습니다 (예: "벌써 세 번째 문제를 만났지만, 계속해서 도전하고 있다는 건 정말 대단한 꾸준함이에요").

### 검증 (11번)
- `npx tsc -b --noEmit` 통과
- `npx oxlint src` — 새로 추가된 오류/경고 없음

---

## 12. 7차 개선 — 대기 화면: 회전 통계 문구 복원 + 실측 평균 대기시간 기반 진행률

배경: 사용자가 "AI 진단 누르면 고정된 텍스트로 'AI가 풀이 작성중' 이라고만 뜬다, 원래처럼 통계 문구가 돌아가면서 뜨는 게 낫지 않냐"고 지적했습니다.

### 원인
[MistakeDetailModal.tsx](src/components/MistakeDetailModal.tsx)에는 원래 3초마다 누적 오답 개수·복습 완료율·오늘 등록량·실수 유형 비율·동료 활동 등을 무작위로 순환 표시하는 `loadingText` 로직이 이미 잘 만들어져 있었습니다. 그런데 10번 항목에서 "스트리밍 콘텐츠를 실제로 보여주자"고 고친 조건(`!selectedEntry.analysis?.solvingProcess`)이, classify 완료 직후 세팅되는 **placeholder 문구**("AI가 정밀 문제 해설을 분석 중입니다...")까지 "진짜 콘텐츠"로 취급해버려서, classify가 끝나자마자(2~3초 만에) 회전 통계 스피너를 벗어나 이 정적 placeholder 문구만 계속 보여주고 있었습니다. 정작 회전 통계가 필요한 구간(solve의 thinking~스트리밍 시작 전, 보통 10초 이상)에는 아무것도 안 돌아가고 있었던 것입니다.

### 수정
- **[types/index.ts](src/types/index.ts)**: placeholder 문구를 매직 스트링 중복 없이 공유하도록 `SOLVING_PLACEHOLDER_TEXT` 상수로 추출.
- **[MistakeDetailModal.tsx](src/components/MistakeDetailModal.tsx)**: 스피너 표시 조건을 `(!solvingProcess || solvingProcess === SOLVING_PLACEHOLDER_TEXT)`로 수정해서, **placeholder 상태에서는 회전 통계 스피너를 계속 보여주고, solve가 실제 텍스트를 스트리밍하기 시작하는 순간에만** 실제 콘텐츠 뷰로 전환되도록 고쳤습니다.

### 평균 대기시간 실측 + 진행률 반영
- **[types/index.ts](src/types/index.ts)**: `MistakeAnalysis.durationMs` 필드 추가 (진단 1건의 classify+extract+solve 전체 소요 시간).
- **[App.tsx](src/App.tsx)**: `handleStartAnalysis`에서 시작 시각을 기록하고, `solveStep` 완료 시 `durationMs`를 계산해 `analysis`에 함께 저장합니다. DB 스키마 변경 없음 (`analysis`는 이미 스키마리스 JSONB).
- **[MistakeDetailModal.tsx](src/components/MistakeDetailModal.tsx)**: 이미 로드된 `allEntries`에서 `durationMs`가 있는 항목들의 평균을 `useMemo`로 계산(3건 미만이면 아직 신뢰 못 할 데이터로 보고 `null` 처리, 추가 DB 조회 없음). 이 평균값(`averageWaitMs`)으로:
  - 기존의 "8초/20초" 하드코딩 곡선 대신, 실제 평균을 기준으로 비례 조정된 곡선으로 원형 진행률 링을 채웁니다 (데이터가 3건 미만이면 기존 20초 가정 곡선으로 자연스럽게 폴백).
  - "예상 대기 시간" 문구의 기준값도 하드코딩된 30초 대신 실제 평균으로 계산합니다.
  - 진행률 링 아래에 "(최근 진단 평균 소요 시간: 약 N초)" 참고 문구를 추가로 표시합니다.
- 별도의 새 도넛/파이 차트를 만들지 않고, **기존에 이미 있던 원형 진행률 링을 실측 데이터 기반으로 다시 캘리브레이션**하는 방식을 택했습니다 — UI를 더 늘리지 않으면서 요청하신 "원그래프로 평균 대기시간 표시"를 만족합니다.

### 검증
- `npx tsc -b --noEmit` 통과
- `npx oxlint src` — 새로 추가된 오류/경고 없음 (기존 pre-existing 10건과 동일)
- 실제 Gemini API 호출로 두 통계 시나리오(처음/반복) 모두 인사말 포함 여부와 톤을 확인 완료

---

## 13. 8차 개선 — 쉬운 계산 과정 압축 (군더더기 없는 서술)

배경: 사용자가 "풀이에서 단순 계산·사칙연산·이항 같은 쉬운 부분이 쓸데없이 길게 늘어져 있다, 너무 쉬우면 생략해서 가독성 좋게 바꿔달라"고 지적했습니다.

### 수정 ([gemini.ts](src/services/gemini.ts))
- solve 프롬프트의 "### 3단계: 계획 실행하기" 섹션 지시문에서 "차근차근 전개해 계산" 문구를 제거했습니다 — 이 표현 자체가 모든 미세 단계를 하나하나 풀어 쓰도록 유도하고 있었습니다.
- 가이드라인에 **"단순 사칙연산·이항·대입·기계적 미분 전개는 디스플레이 수식을 연속 2줄 이상 나열하지 말고 시작식·결과식만 1~2줄로 압축"** 하라는 구체적 수치 제약을 추가했습니다. 개념 적용/공식 선택 등 실제 사고가 필요한 부분은 기존대로 자세히 설명하도록 명시했습니다.

### 실측 검증 결과 (부분적 개선)
같은 문제로 재테스트한 결과:
- **개선된 부분**: $f(-2)$, $f'(-2)$ 계산이 기존 4~5줄의 디스플레이 수식에서 인라인 수식 한 줄(`$f(-2) = ... = -29-16k$`)로 압축됨. 이항해서 $k$ 구하는 부분도 6줄 → 3줄+결론 문장으로 축소.
- **개선 안 된 부분**: 마지막 $f(0)$ 대입 계산은 여전히 5줄의 디스플레이 수식으로 그대로 나열됨.
- 결론: LLM이 지침을 100% 일관되게 따르지는 않아서 부분적 개선에 그쳤습니다. 사용자와 상의 후 "이 정도면 우선 반영하고 실사용하면서 판단"하기로 결정, 추가로 더 세게 못박는 건 보류했습니다.

### 검증
- `npx tsc -b --noEmit` 통과
- `npx oxlint src` — 새로 추가된 오류/경고 없음
