import React from 'react';

export const StudentGuide: React.FC = () => {
  const guideItems = [
    {
      step: '01',
      emoji: '📷',
      title: '오답 사진 등록',
      desc: '하단 카메라 버튼을 누르고 오답을 정밀 촬영한 뒤, 원하는 문제 영역만 깔끔하게 사각형으로 조절해 오려내어 저장하세요.',
      colorClass: 'from-indigo-500/20 via-indigo-500/5 to-slate-900/40 border-indigo-500/30 text-indigo-400 bg-indigo-950/60 shadow-indigo-950/50'
    },
    {
      step: '02',
      emoji: '🤖',
      title: 'AI 수학 클리닉 진단',
      desc: '등록된 오답을 터치하고 [AI 분석 시작하기]를 누르면 수식 인식과 분류를 거쳐 정석 풀이, 실수 요인, 대책, 3단계 힌트가 자동 처방됩니다.',
      colorClass: 'from-purple-500/20 via-purple-500/5 to-slate-900/40 border-purple-500/30 text-purple-400 bg-purple-950/60 shadow-purple-950/50'
    },
    {
      step: '03',
      emoji: '📺',
      title: '선생님 추천 강의 딥링크',
      desc: '진단된 단원에 매핑되는 선생님의 개념 강의 유튜브 영상 및 정확한 챕터 시작점(타임라인) 바로가기가 매칭되어 제공됩니다.',
      colorClass: 'from-amber-500/20 via-amber-500/5 to-slate-900/40 border-amber-500/30 text-amber-400 bg-amber-950/60 shadow-amber-950/50'
    },
    {
      step: '04',
      emoji: '✏️',
      title: '3단계 누적 복습 시스템',
      desc: '기억이 흐려질 때마다 O/X/★ 버튼으로 복습 성공 여부를 체크하세요. 3회 완료(O 세 번) 시 자동으로 복습 완료함으로 안전하게 분리 보관됩니다.',
      colorClass: 'from-emerald-500/20 via-emerald-500/5 to-slate-900/40 border-emerald-500/30 text-emerald-400 bg-emerald-950/60 shadow-emerald-950/50'
    }
  ];

  const changeLogs = CHRONOLOGICAL_CHANGELOGS;

  return (
    <div className="space-y-6 animate-scale-up pb-20">
      
      {/* 1. Header */}
      <div>
        <h2 className="text-lg font-extrabold text-white flex items-center">
          <span className="mr-2">💡</span> 더쿠키수학 오답클리닉 가이드
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          주요 기능 사용법과 업데이트 기록을 한눈에 볼 수 있습니다.
        </p>
      </div>

      {/* 2. Patch Notes / Change Log 패널 */}
      <div className="space-y-6 pt-2 border-t border-slate-800">
        
        {/* 오답클리닉 이용방법 (큰 이모지 디자인) */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-black text-indigo-400 uppercase tracking-wider pl-1">오답클리닉 이용방법</h3>
          <div className="grid gap-4">
            {guideItems.map((item, idx) => (
              <div 
                key={idx} 
                className={`relative bg-gradient-to-br ${item.colorClass} border rounded-3xl p-5 flex items-center space-x-5 shadow-lg backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 group`}
              >
                {/* 우상단 네온 스타일 스텝 인덱스 배지 */}
                <span className="absolute top-4 right-5 text-2xl font-black text-slate-800/50 select-none tracking-tighter group-hover:text-slate-700/60 transition-colors font-mono">
                  {item.step}
                </span>
                
                {/* 커다란 이모지 블록 */}
                <span className="text-4xl flex-none w-16 h-16 rounded-2xl flex items-center justify-center border border-slate-800/60 bg-slate-950/80 shadow-inner group-hover:scale-105 transition-transform duration-300 select-none">
                  {item.emoji}
                </span>
                
                {/* 텍스트 설명 영역 */}
                <div className="space-y-1.5 min-w-0 pr-6">
                  <h4 className="text-sm font-extrabold text-white tracking-tight">{item.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 더쿠키수학 오답클리닉 변경 이력 */}
        <div className="space-y-4 pt-6 border-t border-slate-800">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pl-1">더쿠키수학 오답클리닉 변경 이력</h3>
          <div className="space-y-3">
            {changeLogs.map((log, idx) => (
              <div key={idx} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-400">{log.version}</span>
                  <span className="text-[10px] text-slate-500 font-bold">{log.date}</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside">
                  {log.changes.map((change, cIdx) => (
                    <li key={cIdx} className="text-[11px] text-slate-400 leading-relaxed pl-1.5 -indent-4 list-none flex items-start">
                      <span className="text-emerald-500/80 mr-1.5 select-none">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};

export const CHRONOLOGICAL_CHANGELOGS = [
  {
    version: 'v1.12.9',
    date: '2026.07.12',
    changes: [
      '3차 복습 도장을 찍었으나 오답이 섞여있어 미완료된 오답(예: XOO, OXO)에 대해 "맞춘 오답 제외하고 복습 기록 정리하기" 기능 완전 자동화',
      '3번째 도장이 찍히자마자 자동으로 1.5초 딜레이 타이머가 작동하며 사용자 안내용 경고/넛지 보드가 모달 하단에 화사하게 노출',
      '1.5초 후 기존의 O 도장들만 맨 앞으로 밀려 정렬(예: O O 빈칸)되고 날짜 스탬프까지 완벽하게 자동 정돈되는 똑똑한 애니메이션 연출 제공'
    ]
  },
  {
    version: 'v1.12.8',
    date: '2026.07.12',
    changes: [
      '주간 명예의 전당 점수 알고리즘을 3단 콤보 단계별 가중치 배점제(1차: 2점, 2차: 3점, 3차 완료: 15점)로 전면 리팩토링 완료',
      '신규 등록 오답 수가 분모로 작용하여 생기던 무임승차 얌체 1등(신규 0개, 기존 1개 완료) 버그 원천 차단',
      '복습 완료 시각(reviewDates) 스탬프를 정교하게 대조하여 이번 주에 실질적으로 획득한 단계만 KST 시간대로 역산 합산하는 고도화 구현',
      'Supabase DB 단의 weekly_leaderboard 및 last_weekly_leaderboard SQL 뷰를 콤보 스코어 기준으로 완벽 매핑 이식'
    ]
  },
  {
    version: 'v1.12.7',
    date: '2026.07.11',
    changes: [
      '오답 진단 대기 영역의 아이콘을 직관적이고 심플한 텍스트 형태의 노란 고양이 이모지(🐱)로 최종 복구 적용'
    ]
  },
  {
    version: 'v1.12.6',
    date: '2026.07.11',
    changes: [
      '오답 진단 대기 패널의 고양이 아이콘을 화사한 핑크-퍼플 입체 광택 고양이 앱 아이콘 이미지(/clinic_cat_icon.png)로 원상 복구 완료'
    ]
  },
  {
    version: 'v1.12.5',
    date: '2026.07.11',
    changes: [
      '오답클리닉 대표 아이콘(더쿠키수학 초록색 한 입 베어문 쿠키 로고)을 귀여운 AI 로봇 고양이 스타일로 자연스럽게 변형 및 합성한 정밀 진단 이미지(/clinic_cat_icon.png) 업로드 완료'
    ]
  },
  {
    version: 'v1.12.4',
    date: '2026.07.11',
    changes: [
      '인스타그램 로고 디자인의 그라데이션 및 둥근 스퀘어 감성을 접목한 맞춤형 AI 수학 클리닉 고양이 아이콘 이미지(/clinic_cat_icon.png) 전격 탑재'
    ]
  },
  {
    version: 'v1.12.3',
    date: '2026.07.11',
    changes: [
      '미진단 오답 분석 대기 뷰 영역의 아이콘을 귀여운 고양이 이모지(🐱) 단독 표기로 심플하게 수정'
    ]
  },
  {
    version: 'v1.12.2',
    date: '2026.07.11',
    changes: [
      '미진단 오답 분석 대기 뷰 영역의 로봇 아이콘을 귀여운 로봇 고양이 아이콘(🤖🐱)으로 변경 적용'
    ]
  },
  {
    version: 'v1.12.1',
    date: '2026.07.11',
    changes: [
      '일일 무료 API 키 사용 한도(10회) 설정 및 한도 초과 시 유료 API 키 자동 즉시 전환 로직 구현 (과도한 무료 할당량 소진 방지 및 레이트 리밋 차단)'
    ]
  },
  {
    version: 'v1.12.0',
    date: '2026.07.11',
    changes: [
      '오답 분석 격자형 매트릭스 내에 \'풀이전략실패\' 원인을 추가한 5컬럼 스마트폰 비율 고정 레이아웃(PC/태블릿 대응) 전면 개편',
      '오답 빈도 절대치 대신 학생별 최대 실수 횟수 대비 상대적 비율(0~100%) 기반 오답 농도 계산 알고리즘 적용',
      '취약점 진단 강화를 위해 5단계 신호등 온도 스펙트럼(초록➔노랑➔주황➔빨강) 네온 글로우 발광 기능 탑재',
      '실제 데이터 통계 일치성을 위한 \'최근 30일 이내 오답 데이터\' 엄격 필터링 계산 연동 완료',
      '모바일 기기 가로 슬라이드 튕김 방지를 위한 관리자 필터 세로형 배치 및 가로 오버플로우 잠금 조치'
    ]
  },
  {
    version: 'v1.11.0',
    date: '2026.07.11',
    changes: [
      '공통수학1·2 및 미적분Ⅰ·Ⅱ 교과과정을 직관적이고 세분화된 조밀 중단원 목록(총 35개 단원)으로 전면 개편',
      '유튜브 개념 강의 딥링크 매칭 속도 및 리소스 최적화를 위한 AI 2-Pass 비동기 연쇄 호출 구현',
      '단원명 보정 알고리즘 내 과목 카테고리 락(Lock) 메커니즘을 추가하여 타 과목 단원 가로채기 오류 전면 차단',
      '주간 명예의 전당 점수 집계 공식을 최종 완료일 기준으로 변경하여 과거 오답의 이번 주 복습 완료건 누락 버그 해결',
      '명예의 전당 최상단 배너에 2위, 3위 랭킹 영역 확장 및 점수 0점 시 대기 이모티콘(\'-\')? 노출 적용'
    ]
  },
  {
    version: 'v1.10.3',
    date: '2026.07.10',
    changes: [
      '선생님 추천 강의 알고리즘 내 동의어 가점 범위 누출 버그 패치 (선택된 단원 외의 타 과목/단원 가점 중복 획득 차단)'
    ]
  },
  {
    version: 'v1.10.2',
    date: '2026.07.10',
    changes: [
      '주간 명예의 전당(Leaderboard) 집계 대상에서 관리자 계정(8xnvekjq) 및 테스트 계정(test) 제외 필터링 적용'
    ]
  },
  {
    version: 'v1.10.1',
    date: '2026.07.10',
    changes: [
      '유튜브 동영상 강의 매칭 알고리즘 고도화 (한 글자 짧은 음절의 가점 매칭 배제)',
      '유튜브 과목(grade) 자동 분류 시 범용 키워드(고1, 고2 등) 의존성을 배제하고 설명 문서(description) 명시값을 기반으로 대폭 개선'
    ]
  },
  {
    version: 'v1.10.0',
    date: '2026.07.10',
    changes: [
      '복습 완료 보관함 내 인쇄용 체크박스 탑재 및 출력 개수 표시 기능 구현',
      '인쇄창 종료 시점에 연동되는 인쇄 완료 상태 추적 및 목록 내 🖨️ 인쇄완료 배지 표시',
      '인쇄 및 웹 화면 상의 LaTeX 수식 외 텍스트 폰트 서체 및 크기(9.5pt) 일관성 단일화',
      '복습 완료(1~3차) 체크 시 스탬프 바로 하단에 복습 수행 일자(📅 월/일) 기록 및 노출',
      '어드민 계정의 학생 오답 분류 수정 권한(RLS 정책) 패치 배포 및 Gemini 자동 분류 유연성 개선',
      '주간 복습 챔피언 산출 방식을 등록 기준에서 실제 복습 수행 시간(updated_at) 기준으로 고도화 개편'
    ]
  },
  {
    version: 'v1.9.0',
    date: '2026.07.09',
    changes: [
      '대수, 미적분Ⅰ, 미적분Ⅱ, 확률과 통계 고등 수학 4대 전과목 유튜브 개념 강의 및 챕터 매칭 이식 완료',
      '공통수학1과 확률과 통계의 경우의 수 오인 매칭을 완벽 방지하는 과목 격리 매칭 알고리즘 구현',
      'AI 문제풀이 분석에 G.Polya의 4단계 문제 해결 흐름 및 선생님 특유의 강의 화법(어투) 페르소나 적용',
      '상단 헤더 영역의 최신 업데이트 빌드 날짜가 좁은 화면에서 잘리던 레이아웃 버그 수정'
    ]
  },
  {
    version: 'v1.8.4',
    date: '2026.07.06',
    changes: [
      '주간 복습왕 1주 롤오버(지난주 우승자 이월 표기) 및 공백기 자동 초기화 기능 배포',
      '화면 하단 네비게이션 위에 나의 실시간 복습 진척도 및 주간 점수 플로팅 리본 탑재'
    ]
  },
  {
    version: 'v1.8.3',
    date: '2026.07.05',
    changes: [
      '오답 카드 세로 길이 추가 다이어트 개편',
      '대책 내용(좌측 정렬)과 AI 분석 요약/미완료 지표(우측 정렬)를 단일 1개 행으로 결합하여 줄 개수 압축',
      '여백 조절 및 줄바꿈 수직 간격 감소 조정을 통해 하단의 불필요한 공백 영역 제거'
    ]
  },
  {
    version: 'v1.8.2',
    date: '2026.07.05',
    changes: [
      '오답 카드 우하단 실수 원인 배지에 이모지와 함께 직관적인 두 글자 분류어(실수, 공식, 오독, 개념, 전략) 병합 출력'
    ]
  },
  {
    version: 'v1.8.1',
    date: '2026.07.05',
    changes: [
      '오답 카드 레이아웃 고밀도 개편 (카드 세로 길이 증축 억제)',
      '오답 카드 내부에서 즉각적인 1~3차 복습 진척도 현황판 렌더링',
      '오답 카드 우하단에 체크된 실수 원인(Root Cause)의 이모지만 컴팩트 나열',
      '오답 카드 제목 하단에 직접 수립한 "💡대책 내용" 앞 18글자 짤막 노출 추가',
      '가독성 개선을 위해 우하단 "상세보기 ->" 텍스트 링크 제거'
    ]
  },
  {
    version: 'v1.8.0',
    date: '2026.07.05',
    changes: [
      'Gemini 2.5-Flash 기반 고정밀 동영상 개념 매칭 기술 도입 (매칭률 비약적 상승)',
      'AI 분석 시 등록된 모든 강의 인덱스를 실시간 비교 분석하여 정확한 강의 및 타임라인 자동 판정',
      '기존 분석 완료 오답과의 하위 호환성을 위해 키워드 매칭(Fallback) 병행 지원'
    ]
  },
  {
    version: 'v1.7.5',
    date: '2026.07.05',
    changes: [
      '오답노트 카드 이미지 좌하단 영역에 과목(📚) 및 단원(📌) 동그라미 배지 추가'
    ]
  },
  {
    version: 'v1.7.4',
    date: '2026.07.05',
    changes: [
      '명예의 전당 배너 내 학생 아이디 은닉 및 이름 단독 표기 간소화',
      '명예의 전당 실명 우측 주간 MVP 데코레이션 배지 적용'
    ]
  },
  {
    version: 'v1.7.3',
    date: '2026.07.05',
    changes: [
      '주간 최다 오답 완료 명예의 전당 배너 전체 학생에게 전면 오픈',
      '어드민 패널 학생 카드 레이아웃 정리 (순위 배지 제거 및 이름/아이디 표시 분리 개선)'
    ]
  },
  {
    version: 'v1.7.2',
    date: '2026.07.05',
    changes: [
      '명예의 전당 학생 아이디 개인정보 보호 마스킹 자동 포맷터 도입 (앞 3글자 제외 별표 대체)',
      '어드민 패널 학생 정렬 기준을 주간 랭킹 스코어 순으로 전격 교체',
      '어드민 패널 학생 카드에 실시간 주간 점수 배지 노출 추가'
    ]
  },
  {
    version: 'v1.7.1',
    date: '2026.07.05',
    changes: [
      '오답노트 최상단 명예의 전당 주간 최다 오답 완료 챔피언 배너 추가 (test 학생 카나리 적용)',
      '주간 복습 스코어 알고리즘 자동 산출 DB 뷰 연동'
    ]
  },
  {
    version: 'v1.7.0',
    date: '2026.07.05',
    changes: [
      '어드민 패널 통계 대시보드 및 전체 오답 뷰 탭 전환 기능 제공',
      '학생 이메일 정보 누락 복구 및 아이디(이름) 명단 정밀 정렬 개선',
      '일반 학생용 서비스 설명서 및 업데이트 안내판(이용안내 탭) 추가'
    ]
  },
  {
    version: 'v1.6.0',
    date: '2026.07.04',
    changes: [
      '공통수학 55개 강의 유튜브 자막 타임라인 연동 개시',
      '오답노트 챕터 연관성 스캔 및 고정밀 매칭 알고리즘 튜닝',
      '오답 요약 상세 아코디언 컴포넌트 추가 (기본 닫힘 설정)'
    ]
  },
  {
    version: 'v1.5.0',
    date: '2026.07.02',
    changes: [
      '3단계 복습 성공 추적 시스템(O / X / ★) 릴리즈',
      '마스터 오답 전용 복습완료함 탭 및 카운팅 기능 탑재',
      '수식 깨짐 방지용 LaTeX 렌더링 무결성 전처리 탑재'
    ]
  }
];
