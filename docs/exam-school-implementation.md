# 내신 시험지 추가 작업 보고서

2026 동북고 1학년 2학기 중간 공통수학2를 관리자 검토용 비공개 시험지로 추가했다. 운영 적용과 학생 공개는 수행하지 않았다.

## 구현

- 시험지 종류 `csat | school | hanneung`과 학교·연도·학년·학기·중간/기말·문항 수·만점 메타를 추가했다. 기존 시험지는 `csat`이다.
- 시작 화면을 종류별 섹션으로 나누고 내신 카드에 연도와 학교 정보, `검토 중(학생 비공개)` 배지를 표시했다. 기록·결과에도 연도가 포함된 시험지 제목을 표시한다.
- 선택과목이 없는 시험지는 선택 UI를 생략하고 서버 시도의 선택과목을 null로 저장한다. 실전 시간은 시험지 데이터 기준 50분이다.
- 문항별 `choice5 | digits | choice10` 답 유형과 LaTeX 선지를 저장한다. 10지선다는 2줄×5개 버튼으로 선택·해제하며 기존 🤔·채점 잠금을 유지한다. 숫자 키 1~9와 0(10번째 선지)도 사용할 수 있다.
- OMR 검토·채점 정답 공개·결과·결과 확대에서 선지 번호와 실제 수식을 함께 표시한다. 기존 LaTeXRenderer에 inline 렌더링을 추가해 재사용했다.
- 내신 결과는 원점수/만점, 맞힌 개수, 정답률, 풀이 시간을 표시하며 등급·표준점수·백분위·등급컷을 숨긴다. 서버의 estimatedGrade와 gradeCut은 null이다.
- 새 마이그레이션에서 소수 배점/점수, 종류·메타·선지·기록 RPC를 지원한다. 기존 함수의 소유권 검사·잠금·실전 시간 유예·채점 잠금·검색 경로·실행 권한을 유지했다. 목록 RPC에서도 관리자에게만 비공개 시험지를 보여 준다.
- 10지선다 문항을 오답노트에 담으면 정답 번호 대신 원래 수식을 저장해 복습 채점에 사용한다.
- 정답 번호는 학생용 문항 payload에 포함하지 않는다. 원본 JSON은 데이터 작성용이며 실서비스 번들에서 가져오지 않는다. 정답은 기존 보호된 exam_answer_keys 테이블에서만 조회한다.

## 원본 구조 판단

원본 6쪽 전체와 잘라 낸 21개 PNG를 직접 열어 확인했다. 1~5쪽은 문제, 6쪽은 정답이다. 파일명의 `선택,공통`과 달리 실제 시험지는 선택과목 구분 없는 공통수학2 단일 시험지다.

| 항목 | 판단 |
|---|---|
| 문항 수 | 21문항, 모두 common |
| 원래 객관식 | 1~17번, 17문항 |
| 원래 서답형 | 18~21번, 4문항 |
| 입력 choice5 | 17문항 |
| 입력 choice10 | 18번, 1문항 |
| 입력 digits | 19~21번, 3문항(정답 10, 7, 15) |
| 배점 | 4.4~6.0점, 합계 100점 |
| 제한시간 | 데이터 기본 50분(원본에 제한시간 표기 없음) |
| 시행일 | 정확한 날짜 표기 없음. exam_date는 null, 연도 2026 별도 저장 |
| 단원 | MATH_CURRICULUM 공통수학2의 평면좌표·직선의 방정식·원의 방정식·도형의 이동·집합 |

배점 순서: 4.4, 4.4, 4.6, 4.5, 4.9, 4.6, 4.6, 4.5, 4.5, 4.6, 4.6, 4.6, 4.8, 4.6, 4.6, 4.4, 4.8, 5.0, 5.0, 6.0, 6.0.

PNG는 PyMuPDF 3배 렌더링으로 문항별 추출했고 머리말·꼬리말·정답표·다른 문항을 제외했다. 글자 크기를 유지하려고 열 너비를 일정하게 두고 세로 빈 여백을 정리했다. 원본 PDF는 복사하지 않았고 임시 전체 페이지 PNG도 제거했다.

## 10지선다 변환

변환한 문항은 **18번 하나**다. 정답은 **√23**, 고정 선지 번호는 **⑦('7')**이다.

두 자취는 중심 (-5,0), (0,-4), 반지름 4인 원이다. 중심 거리의 제곱은 41이고 공통현의 길이는 2√(16−41/4)=√23이다.

| 번호 | 선지 | 생성 근거 |
|---|---|---|
| ① | √23/2 | 현의 반길이를 답함 |
| ② | √41 | 중심 사이 거리를 답함 |
| ③ | √105 | 피타고라스에서 빼기 대신 더하기 |
| ④ | 23 | 제곱근 누락 |
| ⑤ | √39 | 중심 거리의 y성분 누락 |
| ⑥ | 4√3 | 중심 거리의 x성분 누락 |
| ⑦ | √23 | 정답 |
| ⑧ | 2√23 | 현 길이에 2를 다시 곱함 |
| ⑨ | √23/4 | 중점/반현 처리에서 추가로 두 번 나누기 |
| ⑩ | 8 | 공통현을 지름으로 생각함 |

선지 10개·문자열 중복 없음·수학적으로 동치인 중복 정답 없음·정답 번호와 원래 정답 일치를 단위 테스트로 검증했다. 다른 객관식의 음수/분수 정답은 원래 5지선다이므로 변경하지 않았다.

## 변경 파일

기존 파일 수정:

- src/components/LaTeXRenderer.tsx
- src/features/exam/contract.ts
- src/features/exam/examClient.ts
- src/features/exam/examMappers.ts
- src/features/exam/ExamPracticeScreen.tsx
- src/features/exam/ui/AnswerBar.tsx
- src/features/exam/ui/ExamStartView.tsx
- src/features/exam/ui/ExamHistoryView.tsx
- src/features/exam/ui/ExamSolveView.tsx
- src/features/exam/ui/OmrCard.tsx
- src/features/exam/ui/OmrResultView.tsx
- src/features/exam/ui/examLogic.ts
- src/features/exam/ui/mockExamClient.ts
- src/styles/examPractice.css
- tests/exam/examMigration.test.ts
- tests/exam/practice.tsx
- tests/exam/practice.browser.mjs

새 파일:

- supabase/migrations/20261002210000_exam_school_papers.sql
- src/features/exam/data/2026-dongbuk-g1-s2-mid-common2.json
- src/features/exam/ui/ExamAnswer.tsx
- public/exams/2026-dongbuk-g1-s2-mid-common2/q-01.png ~ q-21.png (21개)
- tests/exam/examSchool.test.ts
- scripts/exam/import_dongbuk.py
- scripts/exam/build_school_migration.py
- docs/exam-school-implementation.md

## 검증 결과

| 명령 | 결과 |
|---|---|
| npx tsc -b | PASS |
| npx oxlint src/features/exam tests/exam | PASS: 오류 0개, 기존 Fast Refresh 경고 2개 |
| npm run build | PASS |
| node --test tests/exam/*.test.ts | PASS: 62개, 실패 0개, 건너뜀 0개 |
| node --test tests/exam/examMigration.test.ts | PASS: PGlite 실제 실행. 이후 전체 테스트에서도 최신 마이그레이션 재검증 |
| node --check tests/exam/practice.browser.mjs | PASS: 문법 검증만 |
| git diff --check | PASS |

PGlite에서 기존 마이그레이션 4개 다음에 새 마이그레이션을 두 번 적용했다. 학생 RLS·목록·시작 차단, 관리자 조회·시작, 정답 비노출, 10번째 선지 채점과 입력 범위, 채점 잠금, 소수 배점 9.4점, 내신 100점, 등급 null, 선택과목 null, 50분, 기록 메타/선지, 오답노트 수식 저장/중복 방지, 기존 수능 30문항·100점·1등급·최고 표준점수·기존 회차 보존을 검증했다.

브라우저 시나리오는 학생 비공개, 관리자 검토 배지, 선택과목 생략, 50분, 10지선다 선택·해제·KaTeX·2줄×5열, OMR 선지 내용, 채점 잠금/새로고침, 등급 없는 결과·21문항 기록, 아이패드 가로/세로와 390px 폰의 가로 넘침 검사를 작성했다. 실행하지 않았다.

## 수행하지 않은 것과 커밋 상태

- Vite 개발 서버·브라우저 실행, 운영 DB 접근/마이그레이션 적용, 학생 공개, push를 하지 않았다.
- package.json/package-lock.json, 기존 운영 마이그레이션 4개, 외부 원본 PDF를 변경하지 않았다.
- git add와 git commit을 모두 시도했으나 `C:/Users/8xnve/Documents/ReviewNotes/.git/worktrees/exam-school-codex/index.lock` 생성이 Permission denied로 실패했다. 변경 사항은 작업 디렉터리에 남아 있으며 코디네이터가 커밋해야 한다.
- 정확한 시행일은 원본에 없어 기록하지 않았다. 브라우저에서의 실제 화면·상호작용 검증은 코디네이터가 수행한다.
