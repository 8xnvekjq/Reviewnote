# Reviewnote UI 리뉴얼: Focus & collect

이 문서는 기존 코드 감사, 선택한 디자인 방향, 1차 구현 범위와 보존 계약을 기록한다. 감사의 ‘기존’은 작업 시작 시 Git HEAD의 UI를 뜻한다. 시각적 인상과 사용성 평가는 JSX·CSS에서 도출한 디자인 판단이며, 실제 학생 사용성 조사나 실기기 관찰 결과로 표현하지 않는다. 브라우저 검증·성능 수치·최종 커밋은 마지막 검증 섹션에서 별도로 확정한다.

## 1. 기존 UI 감사

각 화면을 요청한 8개 관점으로 검토했다. 넓은 표가 읽기 어려워 1–4번, 5–8번으로 나누었다. 아래 파일 링크는 실제 구현 위치이며, 동일 컴포넌트 안의 체크리스트·복습·이미지 확대는 각각 독립된 사용 흐름으로 평가했다.

### 관점 1–4: 장점, 오래된 시각 표현, 웹사이트 느낌, 앱 경험의 부족

| 화면 / 코드 근거 | 1. 현재 장점 | 2. 오래된 시각 표현 | 3. 웹사이트처럼 느껴지는 부분 | 4. 앱처럼 느껴지지 않는 이유 |
|---|---|---|---|---|
| 로그인 이후 첫 화면 — [App.tsx](../src/App.tsx), [Header.tsx](../src/components/Header.tsx), [AppShell.tsx](../src/app/AppShell.tsx) | `notes`가 첫 탭이며 학생의 문제 기록으로 바로 진입한다. 순위·점수·복습 보상이 연결되어 있다. | 작은 텍스트와 장식 배지, 다수 강조색이 한 화면에서 경쟁한다. | 상단 기능, 랭킹 배너, 목록, 하단 부유 배지가 각자 별도 블록처럼 구성된다. | 머리·본문·하단이 하나의 안정된 앱 프레임으로 느껴지도록 하는 공통 계층이 약하다. |
| MistakeList — [MistakeList.tsx](../src/components/MistakeList.tsx) | 과목·단원 필터, 선택 인쇄, 화면별 스크롤 복원이 있다. | 조밀한 작은 제목·필터·버튼이 반복된다. | 목록과 필터가 데이터 조회 페이지처럼 놓인다. | 현재 화면의 목적과 학생의 다음 행동이 상단에서 강하게 안내되지 않는다. |
| 문제 카드 — [MistakeCard.tsx](../src/components/MistakeCard.tsx) | 문제 이미지, 과목, 복습 결과, 도움 여부와 장착 스탬프를 보여준다. | 이미지 위 작은 다색 배지와 hover 장식이 많다. | 이미지 `object-cover`, hover 확대, hover 때만 보이는 삭제가 갤러리 카드에 가깝다. | 학생이 ‘다시 풀 문제’로 인지할 명확한 행동 영역이 부족하다. |
| 상세 — [MistakeDetailModal.tsx](../src/components/MistakeDetailModal.tsx) | 목록 위 overlay, 이미지 확대, 복습·풀이·재풀이가 한 맥락에 있다. | 작은 텍스트·다양한 박스·강한 버튼이 긴 본문에 섞인다. | 길게 이어지는 스크롤 문서에 기능별 패널을 추가한 형태다. | 문제를 연 다음 학습 단계가 시각적으로 명확하게 구분되지 않는다. |
| 체크리스트 — [MistakeDetailModal.tsx](../src/components/MistakeDetailModal.tsx), [useChecklistGeneration.ts](../src/features/checklist/useChecklistGeneration.ts) | 생성 진행·실패·재시도, 기존 자료와 새 체크리스트를 구분하는 처리가 있다. | 여러 레거시 박스 표현과 작은 설명문이 함께 존재한다. | 긴 해설 문서 중 하나의 추가 폼처럼 보일 수 있다. | 풀이 전 준비라는 역할을 가진 독립 학습 단계의 시각적 구분이 약하다. |
| 풀이노트 / handwriting — [HandwritingOverlay.tsx](../src/components/HandwritingOverlay.tsx), [MistakeDetailModal.tsx](../src/components/MistakeDetailModal.tsx) | 문제 위 필기와 추가 필기장이 독립되어 있고 이동·크기 조절·저장 잠금이 있다. | 작은 펜 색상 원과 조밀한 두 줄 툴바가 데스크톱 유틸리티처럼 보인다. | 떠 있는 편집창의 기능을 작은 화면에 그대로 압축했다. | 캔버스는 직접적이지만 진입·툴바·저장 버튼의 크기와 표현이 앱 본체와 다르다. |
| 복습 O/X/★ — [MistakeDetailModal.tsx](../src/components/MistakeDetailModal.tsx), [useReviewState.ts](../src/features/mistakes/useReviewState.ts) | 3회 복습, 결과 상태와 장착 스탬프가 연결된다. | 작은 기호 버튼과 등급·진행 표식이 조밀하게 배치된다. | 반복된 작은 폼 컨트롤을 눌러 상태를 저장하는 느낌이 강하다. | 기호의 의미와 선택 피드백이 주 행동에 걸맞은 공간을 확보하지 못한다. |
| Lucky Store landing — [GachaStore.tsx](../src/components/GachaStore.tsx) | 무료 횟수·보유 점수·확률·최근 획득 소식이 제공된다. | 상자 glow, 다색 gradient, pulse, 두 개의 강한 CTA가 경쟁한다. | 좁은 중앙 열에 상자·버튼·확률·피드가 차례로 쌓인다. | ‘오늘 받을 보상’과 수집 동기가 첫 화면의 하나의 흐름으로 묶이지 않는다. |
| 수집·가챠 — [GachaStore.tsx](../src/components/GachaStore.tsx), [ItemSynthesisPanel.tsx](../src/components/ItemSynthesisPanel.tsx) | 인벤토리·장착·도감·합성이 분리되어 있고 희귀도 표현이 있다. | 작은 등급 배지·다색 카드·좁은 버튼이 많다. | 가로스크롤 탭과 반복된 정보 카드 목록이 기능 메뉴처럼 보인다. | 현재 컬렉션의 진행과 보물 획득 행동 간 연결이 약하다. |
| 하단 navigation — [BottomNavigation.tsx](../src/components/BottomNavigation.tsx), [AppShell.tsx](../src/app/AppShell.tsx) | 상점이 1차 메뉴이며 복습은 별도 바로가기다. safe-area 대응 기반이 있다. | glow 배지·돌출 촬영 버튼·다양한 emoji가 섞인다. | `fixed` 하단 위에 복습·온라인·자료 배지를 겹쳐 놓는다. | 본문이 하단 높이를 추정해야 하고 조작 요소가 여러 높이로 흩어진다. |
| 관리자 — [AdminPanel.tsx](../src/components/AdminPanel.tsx) | 통계·학생 현황·활동 내역·로딩·실패 표시가 있다. | 작은 다열 통계와 색이 다른 지표 카드가 많다. | 관리 대시보드와 밀도 높은 표가 중심이다. | 학생 화면과 다른 업무 목적의 정보 밀도이며 이를 학생 표준으로 사용하면 복잡해진다. |
| overlay / modal / sheet — [OverlayHost.tsx](../src/app/OverlayHost.tsx), [CustomNoticeModal.tsx](../src/components/CustomNoticeModal.tsx), [BottomNavigation.tsx](../src/components/BottomNavigation.tsx) | 전역 overlay가 모이고 상세와 알림의 책임이 나뉘어 있다. | backdrop·radius·닫기 버튼 크기가 모달별로 다르다. | 가운데 dialog와 오른쪽 drawer를 기능마다 개별 구성한다. | 메뉴·짧은 선택·긴 편집에 맞는 공통 sheet 문법이 없다. |
| loading / empty / error — [LazyScreenBoundary.tsx](../src/app/LazyScreenBoundary.tsx), [MistakeList.tsx](../src/components/MistakeList.tsx), [GachaStore.tsx](../src/components/GachaStore.tsx), [OverlayHost.tsx](../src/app/OverlayHost.tsx) | 지연 청크 실패가 전체 앱을 덮지 않도록 격리되고 재시도가 제공된다. | spinner·단문·pulse 카드가 화면마다 다르다. | 콘텐츠 없이 ‘불러오는 중’ 문구만 놓이는 구간이 있다. | 기다림 후 어떤 화면이 올지, 비어 있을 때 무엇을 할지 일관된 안내가 부족하다. |

### 관점 5–8: 정보 계층, 터치, 컴포넌트 일관성, 학생의 복잡도

| 화면 | 5. 정보 hierarchy 문제 | 6. 터치 UX 문제 | 7. 일관성 없는 컴포넌트 | 8. 학생 관점에서 복잡한 부분 |
|---|---|---|---|---|
| 로그인 이후 첫 화면 | 계정·점수·랭킹·기능 링크·문제 목록이 동시에 강조된다. | 좁은 상단/부유 링크의 높이가 작다. | 헤더·배너·목록 제목이 각각 다른 타이포 체계를 쓴다. | 첫 문제를 열기 전에 확인해야 할 정보가 많아 보인다. |
| MistakeList | 화면 제목보다 필터·보조 기능이 눈에 들어오기 쉽다. | 인쇄 선택·필터가 모바일 손가락 입력 기준으로 충분히 분리되지 않는다. | 필터·추가·인쇄 버튼의 높이와 강조 방식이 다르다. | 일반 문제 목록과 완료 기록의 목적 차이가 약하다. |
| 문제 카드 | 이미지 위 상태·날짜·과목·도움·삭제가 경쟁한다. | 숨김 24px·삭제 28px, hover 의존 삭제는 모바일에서 발견하기 어렵다. | 카드 자체는 clickable `div`, 자식은 개별 버튼이다. | 기록 메타정보가 학습 상태보다 먼저 보이고 주 행동이 암묵적이다. |
| 상세 | 문제·체크리스트·대책·풀이·재풀이·복습의 읽기 계층이 고르지 않다. | 기존 닫기 버튼 32px, 여러 작은 본문 action이 있다. | 접기 영역과 독립 패널의 제목·여백·테두리가 다르다. | 긴 내용에서 다음에 해야 할 행동을 찾아야 한다. |
| 체크리스트 | 준비 과정과 풀이 내용의 중요도 차이가 약하다. | 작은 항목과 주변 action이 조밀하다. | 생성 상태, 새 체크리스트, 레거시 단계형 체크리스트가 서로 다르게 보인다. | 여러 종류의 체크리스트가 데이터 이력에 따라 나타나 용도 설명이 필요하다. |
| 풀이노트 / handwriting | 저장과 보조 편집 도구의 위계가 약하다. | 색상 선택 원 24px, 촘촘한 undo·닫기 영역이 있다. | 본문 입력과 필기 toolbar의 버튼 언어가 다르다. | 두 독립 창을 구별하면서 이동·도구·저장을 이해해야 한다. |
| O/X/★ | 회차·선택 결과·기호의 의미가 좁은 영역에 몰린다. | 한 줄에 작은 선택지가 반복되어 오터치 위험이 있다. | 기본 기호와 장착 스탬프의 시각 크기가 다르다. | X·★의 의미를 기억해야 하며 결과와 다음 행동의 연결이 약하다. |
| Store landing | 무료 1회와 10회의 강조가 동급이고 진행도는 도감 탭에 묻힌다. | 클릭 가능한 상자 `div`는 버튼 의미·키보드 접근이 부족하다. | 1회·10회·가이드·탭이 각각 다른 gradient 버튼이다. | 무료 여부·가격·계정 혜택을 여러 작은 문구에서 해석해야 한다. |
| 수집·가챠 | 아이템 이름보다 등급·한정·종류 배지가 경쟁한다. | 작은 장착 버튼과 가로스크롤 탭의 선택 영역이 조밀하다. | 장착 요약·인벤토리·도감의 간격/글자 크기가 다르다. | 보유 여부·장착 여부·희귀도·소모품 개수가 한꺼번에 제시된다. |
| 하단 navigation | 주 메뉴와 여러 부유 바로가기가 각각 강조된다. | 부유 온라인/자료 배지의 글자와 높이가 작다. | 주 탭 emoji, 촬영 원형, glow 복습 배지가 혼재한다. | 일일 복습과 상단 정보·주 메뉴의 역할을 구분해야 한다. |
| 관리자 | 지표·클리닉·학생 목록·일별 표가 다층적이다. | 작은 표 글자·행과 보조 버튼은 좁은 화면에 부담이 있다. | 학생 화면과 별도의 통계 카드·표 스타일이다. | 학생에게 불필요한 정보이므로 권한과 메뉴 경계를 유지해야 한다. |
| overlay / modal / sheet | 동일한 중요도의 선택도 서로 다른 큰 overlay로 열린다. | 닫기 영역·safe-area·내부 스크롤 규칙이 제각각이다. | 공통 header/handle/focus 처리 primitive가 없었다. | 화면이 바뀐 것인지 임시 선택 창인지 예측하기 어렵다. |
| loading / empty / error | 빈 데이터와 필터 결과 없음의 차이를 더 명확히 안내할 수 있다. | 일부 재시도 버튼 높이가 작다. | skeleton·spinner·empty 카드와 error action 체계가 다르다. | 다음 행동 없이 상태 문구만 나오면 사용 흐름이 끊긴다. |

핵심 문제는 기능 수 자체보다 **기능별 장식과 메타정보가 학습 행동과 같은 강도로 노출되는 것**이다. 기존의 복습·보상 제품 구조는 유지하고, 학습 화면에서는 문제와 다음 행동, 상점에서는 보유 점수와 오늘의 보상을 우선한다.

## 2. 선택한 방향

**Focus & collect — 집중해서 풀고, 꾸준함을 모으는 앱.**

짙은 ink 배경 위에 선명한 문제 이미지와 담백한 학습 카드를 놓는다. Indigo는 탐색과 학습 행동, mint는 완료, rose는 다시 시도, amber는 보상과 관심 상태에 사용한다. 무지개 gradient·과도한 glow·반복 shadow를 주 계층 표현으로 사용하지 않는다. 장착 테마와 아이템 고유의 희귀도 표현은 제품 기능이므로 보존한다.

제품 참고점은 기능 계층이 명확한 모바일 탐색, 학생이 읽기 쉬운 진행 피드백, 수집을 통한 작은 보상, 안정된 간격과 타이포의 일관성이다. 특정 제품 화면을 복제하거나 해당 제품을 직접 사용해 비교 검증했다는 의미는 아니다.

학생 화면이 디자인 기준이다. 관리 화면은 기존 권한과 기능을 유지하고 핵심 학생 흐름을 복잡하게 만드는 계기를 만들지 않는다. 관리자 전용 내부 전체를 이번 1차 핵심 화면 리뉴얼 완료 범위로 주장하지 않는다.

## 3. 공통 design system

기준 파일: [design-system.css](../src/styles/design-system.css). 앱의 기존 장착 테마 변수를 의미 기반 alias로 연결하여 신규 표현 때문에 테마 선택이 무효화되지 않도록 한다.

| 체계 | 토큰 / primitive | 규칙 |
|---|---|---|
| App background | `--rn-bg` → `--theme-bg-main` | 화면의 바닥 |
| Card surface | `--rn-surface` → `--theme-bg-surface` | 카드·헤더·dock·sheet |
| Elevated surface | `--rn-elevated` → `--theme-bg-elevated` | 입력·보조 버튼·눌린 카드 |
| Text | `--rn-text: #f3f5fb`, `--rn-muted: #a7b2c7` | 본문과 보조 정보 분리 |
| Accent / line | `--rn-accent` → `--color-indigo-400`, `--rn-line: rgba(148,163,184,.18)` | 선택·focus와 차분한 경계 |
| Status | success `#78dbb5`, warning `#f2c777`, danger `#f59ba7` | 색 외에 기호·문구도 함께 사용 |
| Store reward | `--store-amber: #efc078` | 상점의 주 행동과 보유 점수 |
| Typography | display `clamp(26px,5vw,34px)`, title 22px, section 17px, body 15px, caption 12px | 화면·영역·본문 계층. 입력은 16px 기준 |
| Spacing | `--rn-space-1`…`8`: 4 / 8 / 12 / 16 / 20 / 24 / 28 / 32px | 작은 관계는 8–12, 카드 안은 16–24, 큰 영역은 24–32 |
| Radius | small 12px / medium 16px / large 24px / sheet 28px | 버튼·행·카드·sheet의 역할 구분 |
| Buttons | `rn-button` + primary / secondary / ghost / destructive | 최소 44px, 하나의 주 행동 우선 |
| Icon buttons | `rn-icon-button`, [AppIcon.tsx](../src/components/ui/AppIcon.tsx) | 44px 정사각형, 이름 있는 SVG 아이콘, 보상 아이템 이미지는 보존 |
| Empty / loading | `rn-empty`, `rn-skeleton` | 상태 설명과 가능한 다음 행동; 콘텐츠의 공간 관계를 유지하는 placeholder |
| Sheet | [Sheet.tsx](../src/components/ui/Sheet.tsx) | native `dialog`, 제목·닫기·handle·본문, 모바일 하단/넓은 화면 중앙 |
| Interaction | `--rn-fast: 140ms`, 짧은 색상·pressed transition | 라이브러리 추가 없이 CSS, reduced-motion 분기 |

`notes.css`, `detail.css`, `store.css`는 이 시스템을 각 화면 구조에 적용한다. 의미 없는 전역 덮어쓰기보다 `rn-notes`, `rn-detail-*`, `rn-store` 범위에서 화면별 레이아웃을 다룬다. 기존 모든 모달·관리 도구·아이템 배지를 신규 primitive로 일괄 변환했다고 주장하지 않는다.

## 4. 핵심 before / after

| 범위 | Before | After / 구현 근거 |
|---|---|---|
| App shell | fixed 하단과 본문 사이에 높이 추정이 필요 | 헤더·스크롤 main·dock을 flex의 독립 영역으로 구성. `100dvh`, safe-area 기반 padding. [AppShell](../src/app/AppShell.tsx) |
| Header / menu | 계정 관련 기능과 작은 정보가 조밀하게 노출 | 브랜드·점수·계정 진입을 단순한 헤더에 모으고 메뉴를 sheet에서 제공. [Header](../src/components/Header.tsx), [Sheet](../src/components/ui/Sheet.tsx) |
| Bottom navigation | 돌출 촬영과 부유 glow 배지가 섞임 | 일정한 5열 dock과 분리된 일일 복습 바로가기, selected/pressed 상태, safe-area. [BottomNavigation](../src/components/BottomNavigation.tsx) |
| MistakeList | 조회 폼 같은 제목·필터·행 | 화면 목적을 안내하는 header, 복습 현황, 정돈된 필터, 문제 카드/완료 기록의 역할 구분. [MistakeList](../src/components/MistakeList.tsx) |
| Mistake card | 잘리는 이미지, 이미지 위 배지, hover 의존 삭제 | `object-fit: contain` 이미지 → 단원/상태 → 제목/최근 활동 → 3회 진행/이어 풀기 순서. 숨김·삭제는 별도 44px 보조 영역. [MistakeCard](../src/components/MistakeCard.tsx), [notes.css](../src/styles/notes.css) |
| Detail | 작은 패널이 이어지는 긴 문서 | 대비가 분리된 header/body/footer, 일정한 섹션 표면과 간격, 확장된 입력/버튼 높이. 기존 list 위 overlay 구조 유지. [MistakeDetailModal](../src/components/MistakeDetailModal.tsx), [detail.css](../src/styles/detail.css) |
| Checklist / sections | 풀이 내용과 혼합된 작은 제목·단계 | 풀이 전 체크리스트 독립 surface와 일정한 섹션 제목/접기 영역. 생성·실패·레거시 데이터 분기 보존. [CollapsibleSection](../src/components/CollapsibleSection.tsx) |
| O/X/★ | 조밀한 회차별 기호 선택 | 모바일 세로 회차, 의미 라벨, 48px 이상 선택 영역과 결과색. 넓은 화면에서는 3회차 나란히 표시. [detail.css](../src/styles/detail.css) |
| Handwriting 진입/도구 | 작은 색상 원과 편집 버튼 | 기존 독립 필기창 유지, toolbar와 색 선택 44px, 저장 버튼을 공통 primary로 표현. 캔버스 좌표/입력/저장 구현 보존. [HandwritingOverlay](../src/components/HandwritingOverlay.tsx) |
| Store landing | 상자 중심의 좁은 단일 열·동급 두 CTA | 점수 wallet → 4개 탭 → 컬렉션 진행 → 보상 hero → 무료 primary/10회 secondary. 확률과 획득 소식은 보조 카드. [GachaStore](../src/components/GachaStore.tsx), [store.css](../src/styles/store.css) |
| Collection | 도감 내부에서만 진행 확인 | 상점 전체에서 collection progress 노출, 인벤토리/도감의 글자·카드 여백·장착 터치 영역 보강 |
| Empty / loading | 짧은 상태 문구 | 목록의 ‘아직 없음’과 ‘필터 결과 없음’ 안내 구분, 첫 촬영 CTA, 인벤토리 skeleton 및 무료 혜택 확인 중 상태 |

가장 큰 변화는 **‘기록을 조회하는 카드’에서 ‘다시 풀 문제와 진행을 안내하는 카드’로의 전환**, 그리고 **부유 버튼이 겹치는 하단에서 안정된 앱 dock으로의 전환**이다. 상점은 별개의 화려한 미니게임 화면에서 학습 앱의 수집 공간으로 연결한다.

## 5. 보존 계약

- 상세는 목록 위 modal/sheet이며 별도 상세 route를 만들지 않는다.
- Lucky Store의 primary navigation 지위를 유지한다. Review를 primary tab으로 승격하지 않는다.
- React Router, custom navigation stack, 추가 navigation state machine을 만들지 않는다. 기존 `AppShell` / `Screen` 조건부 화면 구조와 `screenStateStore`를 사용한다.
- `App.tsx`의 Hall of Fame banner 구조를 변경하지 않는다. 이 영역은 의도적으로 새 디자인 적용 대상에서 제외한다.
- 상세의 문제 이미지 클릭은 확대/zoom이다. 필기 진입과 확대를 결합하지 않는다.
- temporary drawing UI를 재도입하지 않는다. 문제 위 필기와 추가 필기장의 독립성, shared save lock, 캔버스 좌표와 저장 형식은 유지한다.
- 복습 O/X/★의 의미·횟수·점수 계산·정리하기·도움 상태, 체크리스트 생성·재시도와 레거시 데이터 분기를 디자인 변경으로 재정의하지 않는다.
- 상점의 확률·무료 횟수·가격·중복 환급·합성·장착·소모품 동작과 API/DB는 보존한다. UI에서 서버 혜택 확인이 끝나기 전 ‘무료 가능’으로 표시하지 않는다.
- 관리자 권한 분기, 인쇄 선택/형식, 숨김·삭제, 지연 로딩·오류 격리 책임을 유지한다.
- 무거운 animation library나 UI framework를 추가하지 않는다. 관련 파일만 stage하며 `git add -A`는 사용하지 않는다.

## 6. 최종 검증 기록

- 기준 커밋: `62ec993` (작업 시작 시 origin/main과 일치 확인).
- `npm run build`, `npx tsc -p tests/ui/tsconfig.json --noEmit`: 통과.
- 실제 컴포넌트 기반 로컬 fixture / Chromium: 320×568, 375×667, 390×844, 430×932, 360×800, 800×1280, 844×390 검증 통과. 하단 겹침·화면 이탈·수평 overflow·44px nav/복습 터치·시트 열고 닫기·포커스 복귀·O/X/★·체크리스트 순차 잠금·필기창·상점·empty/loading을 확인했다.
- 추가 통합 검사: 이미지 클릭은 확대만 수행, 키보드 가용 공간을 모사한 390×420에서 대책 입력, 긴 텍스트, 두 필기창 독립성, 획 보존/실행취소, 상점 하위 탭 복원, 긴 닉네임 계정 시트, reduced motion 통과. JavaScript page error 0건.
- 마지막 작은 화면 상점 밀도 보정은 CSS만 변경했으며, 전체 viewport 재실행은 사용자의 작업 마무리 요청에 따라 생략했다.
- 실제 iPhone/Android PWA standalone, OS 키보드, stylus와 서버 저장·포인트 차감은 미검증. fixture는 외부 HTTP를 모사하며 자동 검증은 외부 요청과 realtime을 차단했다. 실제 학생 데이터를 사용하지 않았다.
- 수정 UI 파일 대상 oxlint: 오류 0개. 기존 effect 의존성 경고는 유지. 저장소 전체 `npm run lint`는 기존 App.tsx/SlideListModal.tsx 조건부 Hook 오류 및 scratch/seed_youtube_data.js UTF-8 오류 때문에 실패한다. App.tsx의 이번 변경은 루트 클래스 추가 1줄뿐이며 기존 Hook 오류는 이번 변경에서 발생하지 않았다.

### 성능

새 패키지/애니메이션 라이브러리 없이 CSS와 React로 구현했다. 버전 1.16.0 유지.
최종 빌드 측정:

| 항목 | 이전 | 이후 |
|---|---:|---:|
| 메인 JS | 365.23 KB / gzip 108.44 KB | 351.22 KB / gzip 107.64 KB |
| 상점 JS | 46.09 KB / gzip 11.89 KB | 42.07 KB / gzip 11.56 KB |
| 메인 CSS | 98.22 KB / gzip 15.44 KB | 109.47 KB / gzip 18.68 KB |
| 상점 CSS | 메인에 포함 | 6.15 KB / gzip 1.65 KB |

상점 CSS는 지연 청크로 분리된다. CSS 증가는 공통 토큰·컴포넌트·반응형 처리 비용이다. 실기기 FPS/메모리 벤치마크는 수행하지 않았다.

### 자체 검토와 변경 범위

- App.tsx의 명예의 전당 및 데이터 흐름 무수정 확인. Router/stack 미추가.
- AppShell, Header, BottomNavigation, LazyScreenBoundary, CustomNoticeModal: 공통 shell/시트/상태.
- MistakeCard, MistakeList: 카드·목록·인쇄 선택 표현.
- MistakeDetailModal, CollapsibleSection, MistakeScaffoldingDrawer: 학습 단계·대책 우선 배치·분류 편집 접힘·접근성.
- HandwritingOverlay: 화면 안 초기 크기/위치, 최소 높이, 도구 터치 영역. 캔버스 문서 좌표·저장 알고리즘은 보존.
- src/components/ui, src/styles, src/main.tsx: 공통 아이콘·시트·디자인 시스템.
- tests/ui: 재실행 가능한 검증 화면·스크립트·설명.
- 관리자 내부 화면 전체, 로그인 화면, 나머지 보조 overlay의 전면 재작성은 1차 범위 밖이다.
- 커밋 SHA는 최종 사용자 보고에 기록. 원격 push/배포는 수행하지 않는다.
