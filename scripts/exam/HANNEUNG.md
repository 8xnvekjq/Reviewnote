# 한능검 79회

- 출처: 국사편찬위원회 한국사능력검정시험 공식 자료실. 시행일 2026-08-09.
- 심화 50문항·100점·80분, 기본 50문항·100점·70분. 사전 안내 시간 제외.
- 심화 80/70/60점 이상은 예상 1/2/3급, 기본은 예상 4/5/6급. 공식 인증이 아닌 연습 결과.
- 문제 PDF는 자르거나 내용을 바꾸지 않고 전체 12페이지씩 3배 해상도로 렌더링한다. 정답 PDF는 공개 자산에 넣지 않는다.
- 원본은 메인 체크아웃의 `reference/hanneung/2026-79/`에 보관하며 git에 추가하지 않는다.
- 생성: `python scripts/exam/import_hanneung.py <원본 폴더 절대경로>` → `python scripts/exam/build_hanneung_migration.py`.
- JSON의 정답은 SQL 생성·테스트에만 사용한다. 운영 프런트엔드에서 import하지 않는다.
- 학생 공개 요청에 따라 새 시드는 `published=true`, 재적용은 `on conflict do nothing`이다.
- 해설은 구현하지 않는다. 원본 사이트 추가 다운로드나 접수 자동화는 하지 않는다.

## 마이그레이션 영향

`20261003000000_exam_hanneung.sql`은 기존 배포 파일을 수정하지 않는다.
DROP은 번호·선지 제약 및 자체 트리거를 교체하는 용도뿐이며 테이블·문항·응시 기록은 삭제하지 않는다.
기존 수능/내신의 30문항·22번 공통 제약은 검증 트리거로 유지하고 한능검에만 50문항 공통을 허용한다.
새 급수 계산과 기존 RLS/정답 비공개·소유자 검사·자유 모드 채점 잠금을 유지한다.
브라우저 검증은 `tests/exam/practice.browser.mjs`에 작성만 하며 실행은 코디네이터가 맡는다.

공식 기준: https://www.historyexam.go.kr/pageLink.do?link=apyexmInfo
급수 기준: https://www.historyexam.go.kr/pageLink.do?link=examGuideline
자료실: https://www.historyexam.go.kr/pst/list.do?bbs=dat
