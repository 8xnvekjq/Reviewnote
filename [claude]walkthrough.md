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
