# 📜 프로젝트 전용 스크립트 도록 및 명세서 (Scripts Registry)

이 디렉토리(`scripts/`)에는 반복적이고 일관된 데이터 처리 및 자동화를 위한 공용 대표 스크립트들이 보관됩니다.
**모든 AI 에이전트는 유사한 작업을 할 때 임시 `.js` 파일들을 무분별하게 생성하지 않고, 여기에 등록된 스크립트를 우선적으로 재사용 및 수정 관리해야 합니다.**

---

## 🛠️ 보유 스크립트 목록

### 1. `extract_playlist.js`
* **파일 경로**: `scripts/extract_playlist.js`
* **주요 용도**: 유튜브 재생목록(Playlist) URL을 입력받아 모든 동영상 스크립트를 자동 추출 및 마크다운으로 변환하여 정돈 저장
* **동작 원리**:
  1. 유튜브 재생목록 HTML 파싱 -> 재생목록 제목 감지 (`meta og:title`)
  2. `youtube_scripts/[재생목록제목]/` 전용 서브 폴더 자동 생성
  3. 재생목록 내 모든 동영상 자막 텍스트(`youtube-transcript`) 순차 추출
  4. **화자 라벨링**: `>>` 자막 기호 및 구어체 문맥 파싱을 통해 **`[선생님]` / `[학생]`** 태그 부여
  5. **LaTeX 수식 변환**: 구어체 수식 표현(거듭제곱, 분수, 제곱근, 뿔마 등)을 **`$...$`** 문법으로 자동 치환
  6. 중복 표 없이 깔끔한 단일 본문 형식의 `.md` 마크다운 파일로 저장
* **실행 명령예시**:
  ```bash
  node scripts/extract_playlist.js "https://www.youtube.com/playlist?list=PLw8NENAKl4Hl7ephdZgre0XWAxjTmvbTo"
  ```

---

## 📌 규칙 준수 사항
- 새로운 기능이나 스크립트가 추가될 경우, 이 `README.md` 문서에 스크립트의 용도와 매개변수를 항상 갱신합니다.

## 한능검 심화 회차 추가

- `exam/add_hanneung_round.py`: `--round --year --exam-date --questions --answers`로 정답·배점 추출, 자동 문항 자르기, 비공개 시드와 시대 검토 PNG를 생성합니다. 선택: `--out-dir`, `--sheet`, `--force`. 절차는 `exam/HANNEUNG.md`를 참조합니다.
- `exam/test_add_hanneung_round.py`: 실제 79회 PDF 회귀 및 잘못된 입력 차단 unittest.

## 한능검 시대별 묶음 생성

`node scripts/exam/build_hanneung_era_sets.mjs`는 모든 `*-advanced.topics.json`에서 시대 묶음 공개 목록(정답 없음)과 `20261003100001_exam_era_seed.sql`을 재생성합니다. 적용 전에는 기본 명령을 사용하고, 이미 적용된 뒤 변경할 때는 `node scripts/exam/build_hanneung_era_sets.mjs supabase/migrations/<새 타임스탬프>_exam_era_seed.sql`로 새 시드를 만드세요. 운영 DB에 자동 적용하지 않습니다.

원본 시험지와 정답키가 모두 존재해야 하며, 원본이 모두 공개된 묶음만 학생에게 공개됩니다. 원본 공개 후 같은 시드를 다시 실행하면 묶음도 공개됩니다. 구성·이미지·정답이 바뀌면 새 버전 ID를 만들고 이전 묶음은 비공개로 전환하여 기존 응시·필기·결과는 보존합니다. 묶음은 문항당 1점(맞은 개수), 자유 모드만 허용합니다.
