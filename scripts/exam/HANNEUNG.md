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
