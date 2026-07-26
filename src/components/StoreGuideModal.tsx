import React from 'react';

interface StoreGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToStore: () => void;
}

export const StoreGuideModal: React.FC<StoreGuideModalProps> = ({
  isOpen,
  onClose,
  onGoToStore,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🎁</span>
            <div>
              <h3 className="text-sm font-black text-white">럭키상점 100% 활용법 가이드</h3>
              <p className="text-[10px] text-amber-400 font-bold">오답 노트 복습하고 전설 보물 획득하기!</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* 4 Steps Guide */}
        <div className="space-y-3 text-xs">
          {/* Step 1 */}
          <div className="p-3 rounded-2xl bg-slate-955 border border-slate-850 space-y-1">
            <div className="flex items-center space-x-2">
              <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                Step 1
              </span>
              <span className="font-black text-white text-xs">복습으로 콤보 포인트 쌓기 ⚡</span>
            </div>
            <p className="text-[11px] text-slate-300 pl-1 leading-relaxed">
              오답 노트 3차 복습 완주 및 연속 복습 스트릭(Streak) 달성 시 콤보 포인트를 차곡차곡 획득합니다.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-3 rounded-2xl bg-slate-955 border border-slate-850 space-y-1">
            <div className="flex items-center space-x-2">
              <span className="bg-emerald-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                Step 2
              </span>
              <span className="font-black text-white text-xs">매일 1회 & 웰컴 10연속 무료 뽑기 🎰</span>
            </div>
            <p className="text-[11px] text-slate-300 pl-1 leading-relaxed">
              <strong>매일 1회 무료 싱글 뽑기</strong> + <strong>계정당 최초 1회 10연속 무료 혜택</strong>으로 보물을 노려보세요!
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-3 rounded-2xl bg-slate-955 border border-slate-850 space-y-1">
            <div className="flex items-center space-x-2">
              <span className="bg-purple-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                Step 3
              </span>
              <span className="font-black text-white text-xs">영롱한 39종 보물 수집 & 커스텀 🎨</span>
            </div>
            <ul className="text-[10.5px] text-slate-300 space-y-1 pl-1 pt-1">
              <li>• <strong>👑 칭호</strong>: 명예의 전당 & 상단바 무지개 글로우 발광 이펙트</li>
              <li>• <strong>🐾 스탬프</strong>: 3차 복습 완료 시 냥발, 로켓, 다이아 도장 찍힘</li>
              <li>• <strong>🎨 테마</strong>: 오로라, 코랄, 레전드 골드 등 앱 전체 색상 변환</li>
              <li>• <strong>🤖 AI 말투</strong>: 츤데레, 명탐정 셜록, 훈장님 톤 해설</li>
              <li>• <strong>🎴 행운 부적</strong>: 전과목 100점, 1등급 선택권 행운 기원</li>
              <li>• <strong>🛡️ 소모품</strong>: 닉네임 변경권, 스트릭 방어권, 콤보 2배 부스터</li>
            </ul>
          </div>

          {/* Step 4 */}
          <div className="p-3 rounded-2xl bg-slate-955 border border-slate-850 space-y-1">
            <div className="flex items-center space-x-2">
              <span className="bg-pink-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                Step 4
              </span>
              <span className="font-black text-white text-xs">실시간 SSR/UR 획득 전광판 🌟</span>
            </div>
            <p className="text-[11px] text-slate-300 pl-1 leading-relaxed">
              초희귀 보물(SSR/UR) 당첨 시 뽑기 머신 하단 전광판 피드에 내 이름과 보물이 라이브 생중계됩니다!
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-all"
          >
            닫기
          </button>
          <button
            onClick={() => {
              onClose();
              onGoToStore();
            }}
            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 text-xs font-black transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-1"
          >
            <span>🎁</span>
            <span>상점으로 이동</span>
          </button>
        </div>
      </div>
    </div>
  );
};
