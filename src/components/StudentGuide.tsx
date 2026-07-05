import React from 'react';

export const StudentGuide: React.FC = () => {
  const guideItems = [
    {
      emoji: '📷',
      title: '오답 사진 등록',
      desc: '하단 카메라 버튼을 누르고 오답을 정밀 촬영한 뒤, 원하는 문제 영역만 깔끔하게 사각형으로 조절해 오려내어 저장하세요.'
    },
    {
      emoji: '🤖',
      title: 'AI 수학 클리닉 진단',
      desc: '등록된 오답을 터치하고 [AI 분석 시작하기]를 누르면 수식 인식과 분류를 거쳐 정석 풀이, 실수 요인, 대책, 3단계 힌트가 자동 처방됩니다.'
    },
    {
      emoji: '📺',
      title: '선생님 추천 강의 딥링크',
      desc: '진단된 단원에 매핑되는 선생님의 개념 개념 강의 유튜브 영상 및 정확한 챕터 시작점(타임라인) 바로가기가 매칭되어 제공됩니다.'
    },
    {
      emoji: '✏️',
      title: '3단계 누적 복습 시스템',
      desc: '기억이 흐려질 때마다 O/X/★ 버튼으로 복습 성공 여부를 체크하세요. 3회 완료(O 세 번) 시 자동으로 복습 완료함으로 안전하게 분리 보관됩니다.'
    }
  ];

  const changeLogs = [
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

      {/* 2. Main Feature Guides */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-wider">주요 기능 이용법</h3>
        <div className="grid gap-3">
          {guideItems.map((item, idx) => (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-start space-x-3.5 shadow-sm">
              <span className="text-2xl flex-none bg-slate-950 w-11 h-11 rounded-xl flex items-center justify-center border border-slate-800/80">{item.emoji}</span>
              <div className="space-y-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-200">{item.title}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Patch Notes / Change Log */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">업데이트 소식 (Change Log)</h3>
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
  );
};
