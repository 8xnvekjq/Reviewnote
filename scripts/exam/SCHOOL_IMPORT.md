# PDF와 최소 설정으로 내신 가져오기

Python 3.10+, PyMuPDF, Pillow가 필요합니다 (`python -m pip install pymupdf pillow`). 텍스트 정보가 있는 PDF용이며 AI/API/DB를 호출하지 않습니다.

1. PDF를 `reference/school-exams/`에 넣고 아래처럼 시험 메타데이터만 설정합니다. 저장소 밖 원본은 `referenceRoot`로 해당 폴더를 지정하거나 `pdf`에 절대경로를 적습니다. 실제 예시는 `school-configs/`의 동북/영파 파일, 명세는 `schema.json`입니다.

```json
{
  "schemaVersion": 1,
  "pdf": "reference/school-exams/new-school.pdf",
  "slug": "new_school",
  "migrationTimestamp": "20261003120000",
  "curriculumGrade": "공통수학2",
  "pointScale": 1,
  "paper": {
    "id": "2026-new-school-mid",
    "title": "2026 새학교 1학년 2학기 중간 공통수학2",
    "kind": "school",
    "schoolName": "새학교",
    "year": 2026,
    "grade": 1,
    "semester": 2,
    "examTerm": "mid",
    "subject": "공통수학2",
    "source": "새학교",
    "schoolGrade": "고1",
    "examDate": null,
    "timeLimitMinutes": 50,
    "maxScore": 100,
    "electives": [],
    "published": false
  }
}
```

`paper.questionCount`는 선택 사항입니다. 표지의 원본 문항 수에 분리 예외를 반영해 계산하며, 표기가 없으면 감지값을 쓰고 확인 경고를 표시합니다. 설정값이 표지에서 계산한 최종값과 다르거나 표지 배점 합계 × `pointScale`이 `maxScore`와 다르면 실패합니다.

2. `python scripts/exam/import_school.py 설정.json --out-dir .orca-task/review --sheet`를 실행합니다. 문제/정답 쪽, 중앙 세로선이나 문항 x 분포를 이용한 1단/2단, 반복 머리말/꼬리말 및 첫 쪽 표는 자동 감지합니다. 번호 1..N과 정답/배점도 자동 생성합니다. 원본 25점→100점은 `pointScale: 4`로 지정합니다. 일반 객관식은 `choice5`, 숫자 서답형은 `digits`입니다.
3. 수식 서답형처럼 애매한 문항은 번호와 **“이 문항은 설정에 예외로 적어 주세요”** 안내로 멈춥니다. 이때 파일은 생성하지 않습니다. 일반 문항의 해석 개수는 안내에 표시합니다. `questions`에는 그 예외만 추가하고 다시 실행합니다. AI가 필요한 경우 아래 프롬프트에 해당 문항 이미지 한 장과 원래 정답만 제공합니다.
4. `review-<id>.html`에서 맨 위 자동/적용 레이아웃 표, 빨간 경고, 번호·원래 번호·답 유형·정답·배점·단원 및 이미지를 확인합니다. `chapters: {"1": "평면좌표"}`처럼 최종 번호별 단원만 별도 입력할 수 있습니다. 단원 입력은 선택입니다. 화면은 정답을 포함하므로 공개하지 않습니다.
5. 확인 후 `--out-dir` 없이 실행하면 저장소에 PNG·JSON·비공개 시드·별도 공개 SQL을 씁니다. 같은 paperId의 JSON이 이미 있으면 차단합니다. 의도한 재생성만 `--force`를 붙이고 diff를 확인하세요. 신규 시험에는 기존 파일명과 겹치지 않는 `migrationTimestamp`를 씁니다. DB 적용·공개 SQL 실행은 코디네이터가 검증 후 진행합니다.

예외 하나의 예 (`questions`는 생략 가능):

```json
"questions": [{
  "number": 18,
  "answerType": "choice10",
  "answer": "7",
  "originalAnswer": "\\sqrt{23}",
  "choices": ["선지 1", "선지 2", "선지 3", "선지 4", "선지 5", "선지 6", "\\sqrt{23}", "선지 8", "선지 9", "선지 10"],
  "distractorReasons": ["이유 1", "이유 2", "이유 3", "이유 4", "이유 5", "이유 6", "정답", "이유 8", "이유 9", "이유 10"]
}]
```

`original`을 생략하면 `number`를 원본 번호로 사용합니다. 분리는 `original: 19, number: 19, sourcePart: 1`과 `original: 19, number: 20, sourcePart: 2`로 적습니다. 이후 원본 20번을 새 21번으로 바꾸는 예외도 적을 수 있습니다. `imageSegments: [[null,159],[211,238]]`는 자동 시작부터 y=159까지의 본문과 y=211~238의 (2)만 합성합니다(PDF 좌표). 표시용 `originalNumber`도 지정할 수 있습니다.

파싱 실패 시 `answer`/`points` 수동값을 예외에 넣습니다. 배점은 배율 적용 전 값입니다. 읽힌 원본 값과 수동값이 다르면 실패하며, 분리 배점도 원본의 세부 배점 및 합계와 비교합니다. `sourceAnswerText`에 원본 정답의 추출 텍스트를 넣으면 수식 정답 원문 변경을 감지합니다. `includeOriginalNumber`, `includeOriginalPoints`는 기존 데이터의 원래 번호/배점 필드를 보존할 때 사용합니다.

자동 감지가 틀린 경우에만 `layout`의 필요한 값만 덮어씁니다. 예: `"layout": {"bodyBottom": 760, "pageBodyTop": {"1": 80}}`. 쪽 번호는 1부터이며 `columns`는 `[[좌x,우x]]` 또는 두 열입니다. 본문 위아래는 `bodyTop`/`bodyBottom`, 쪽별 예외는 `pageBodyTop`/`pageBodyBottom`입니다. HTML에서 자동값과 적용값을 비교할 수 있습니다.

AI 요청 예시:

> 첨부한 문항 이미지 한 장의 원래 정답은 `<LaTeX 정답>`이다. 정답 1개와 실제 계산 실수에서 나온 오답 9개를 만들고 선지별 이유를 한 줄씩 적어라. 정답은 한 개여야 한다. 출력은 `{"number":18,"answerType":"choice10","choices":["LaTeX 선지 10개"],"answer":"1~10 정답 위치","originalAnswer":"원래 정답","distractorReasons":["이유 10개"]}` JSON 하나만 반환하라.

검증: `python scripts/exam/test_import_school.py`. 스캔 PDF/OCR과 수식 의미 증명은 미지원이며, 낯선 답안 형식이나 복잡한 배치는 예외/레이아웃 설정이 필요할 수 있습니다.
