# 한능검 79회

- 출처: 국사편찬위원회 한국사능력검정시험 공식 자료실. 시행일 2026-08-09.
- 심화 50문항·100점·80분, 기본 50문항·100점·70분. 사전 안내 시간 제외.
- 심화 80/70/60점 이상은 예상 1/2/3급, 기본은 예상 4/5/6급. 공식 인증이 아닌 연습 결과.
- 기본: 문제 PDF를 자르지 않고 전체 12페이지씩 3배 해상도로 렌더링한다(원본 페이지 이동·확대).
- 심화: 선생님 결정(2026-10-03)으로 수능처럼 한 화면에 한 문항 — `python scripts/exam/crop_hanneung_questions.py <문제 PDF> 2026-hanneung-79-advanced`
  가 "[N점]" 표시로 문항 시작을 찾아 `q-NN.jpg`(3배, JPEG 85)로 자르고 데이터 JSON의 imageUrl을 바꾼다. DB는 `20261003040000_exam_hanneung_advanced_cropped.sql`.
  원본은 공공누리 4유형(변경 금지) 자료라, 문항을 잘라 쓰는 것은 선생님이 판단·결정한 사항이다.
- 화면은 시험지 종류가 아니라 "여러 문항이 한 이미지를 같이 쓰는지"(usesWholePages)로 페이지 모드를 정한다.
- 정답 PDF는 공개 자산에 넣지 않는다.
- 원본은 메인 체크아웃의 `reference/hanneung/2026-79/`에 보관하며 git에 추가하지 않는다.
- 생성: `python scripts/exam/import_hanneung.py <원본 폴더 절대경로>` → `python scripts/exam/build_hanneung_migration.py`.
- JSON의 정답은 SQL 생성·테스트에만 사용한다. 운영 프런트엔드에서 import하지 않는다.
- 학생 공개 요청에 따라 새 시드는 `published=true`, 재적용은 `on conflict do nothing`이다.
- 해설은 구현하지 않는다. 원본 사이트 추가 다운로드나 접수 자동화는 하지 않는다.

## 시대별 결과·개념 강의 (결과 화면)

- 문항 시대 태그: `src/features/exam/data/<paperId>.topics.json` — 번호·`era`(10개 시대 id)·`field`(정치/경제/사회/문화)·`keywords`·`confidence`·`note`.
  프런트엔드에 번들되므로 정답·배점·선지에서 뽑은 키워드는 넣지 않는다. 79회 심화는 문항 이미지를 하나씩 보고 태깅했다(`low`는 note에 이유).
- 다른 회차는 태그 파일을 만들고 `src/features/exam/data/hanneungTopics.ts` 목록에 한 줄 추가하면 결과 화면에 "시대별 결과"가 나온다(없으면 섹션 숨김).
- 시대별 무료 강의: `src/features/exam/data/hanneungLectures.ts`(데이터만). 지금은 YouTube 「최태성 1TV」 [심화별개념8] 재생목록.
  바꿀 때는 URL을 실제로 열어 제목·채널을 확인할 것. 집계·약한 시대(60% 미만, 없으면 최저 1개) 로직은 `ui/hanneungEra.ts`.

## 마이그레이션 영향

`20261003000000_exam_hanneung.sql`은 기존 배포 파일을 수정하지 않는다.
DROP은 번호·선지 제약 및 자체 트리거를 교체하는 용도뿐이며 테이블·문항·응시 기록은 삭제하지 않는다.
기존 수능/내신의 30문항·22번 공통 제약은 검증 트리거로 유지하고 한능검에만 50문항 공통을 허용한다.
새 급수 계산과 기존 RLS/정답 비공개·소유자 검사·자유 모드 채점 잠금을 유지한다.
브라우저 검증은 `tests/exam/practice.browser.mjs`에 작성만 하며 실행은 코디네이터가 맡는다.

공식 기준: https://www.historyexam.go.kr/pageLink.do?link=apyexmInfo
급수 기준: https://www.historyexam.go.kr/pageLink.do?link=examGuideline
자료실: https://www.historyexam.go.kr/pst/list.do?bbs=dat

## 새 심화 회차 추가 (AI 호출 없음)

1. 공식 문제·정답 PDF를 `reference/hanneung/<round>/`에 내려받습니다. Python 의존성은 `PyMuPDF`, `numpy`, `Pillow`입니다.
2. `python scripts/exam/add_hanneung_round.py --round 78 --year 2026 --exam-date 2026-05-23 --questions reference/hanneung/78/78-advanced-questions.pdf --answers reference/hanneung/78/78-advanced-answers.pdf --sheet`
   `--out-dir scratch/hanneung-78`로 저장소와 같은 구조의 별도 출력도 가능합니다. 기존 회차는 `--force` 없이는 중단하며, 이 옵션은 로컬 생성물을 덮어쓸 뿐 DB를 수정하지 않습니다.
3. 출력 루트의 `review.html`에서 쪽별 문항 수·매칭 점수·잘림/높이 경고와 50문항·정답·배점을 확인합니다. 정답이 포함된 HTML은 공개 자산으로 배포하지 않습니다. 이미지의 인쇄 번호가 페이지→왼쪽 단→오른쪽 단 순서로 1~50인지도 확인합니다.
4. `era-sheet-1.png`~`era-sheet-5.png`를 보고 `.topics.json`의 시대·분야·키워드를 고칩니다. 초기값은 79회 번호별 시대/분야를 사전값으로 사용하며 모두 low입니다. 키워드는 기존 태그 검사(1~4개)에 맞춘 `시대 검토 필요` 자리표시자이며 실제 문항 키워드로 교체합니다. 검토 후에만 코디네이터가 `hanneungTopics.ts`에 등록합니다.
5. 생성된 `*_exam_hanneung_<round>_advanced_seed.sql`은 기존 스키마를 전제로 INSERT만 하며 `published=false`입니다. 코디네이터가 검토 후 적용하고 `scripts/exam/publish_hanneung_<round>.sql`로 공개합니다. 도구는 DB 연결·공개·레지스트리 변경을 실행하지 않습니다.
6. 회귀 검사: `python scripts/exam/test_add_hanneung_round.py` (79회 PDF 기본 경로는 메인 체크아웃의 기존 원본 위치, `HANNEUNG_REFERENCE` 환경변수로 변경 가능).
- 자동 순서 검증은 쪽별 [N점] 개수 합 50과 정답 번호 1~50 검사로 합니다. 인쇄 번호의 숫자 모양을 대조하지 않으므로 확인 화면에서 페이지→왼쪽 단→오른쪽 단 순서를 확인합니다.
- `hanneung-marker.png`는 79회에서 추출한 34×31px 점] 정규 템플릿입니다. 첫 쪽은 제목 아래 긴 가로줄로 머리말 경계를 찾습니다. 배점이 다음 줄에 있는 머리말도 왼쪽 번호의 잉크 위치로 앞 문항 선지와 분리합니다(숫자 인식 없음).
- `opencv-python`이 있으면 동일한 정규화 상관계수 매칭을 빠르게 실행하며, 없으면 기존 numpy 방식으로 실행합니다. 74~78회 실물 PDF 성공 테스트는 `HANNEUNG_ROUNDS_REFERENCE`(기본: 79회 원본 폴더의 상위 폴더)의 `<year>-<round>/`를 사용하며 원본이 없으면 해당 회차만 skip합니다.
