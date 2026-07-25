import React, { useState, useEffect, useRef } from 'react';
import type { GachaItem, EquippedItems } from '../types';
import { GACHA_ITEMS, drawGachaItem } from '../utils/gachaCatalog';

interface GachaStoreProps {
  userPoints: number;
  onDeductPoints: (amount: number) => void;
  equippedItems: EquippedItems;
  onEquipItem: (category: keyof EquippedItems, value: string | undefined) => void;
}

export const GachaStore: React.FC<GachaStoreProps> = ({
  userPoints,
  onDeductPoints,
  equippedItems,
  onEquipItem,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'draw' | 'inventory' | 'catalog'>('draw');

  // 해금된 아이템 ID 리스트 (LocalStorage 연동)
  const [unlockedItemIds, setUnlockedItemIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('reviewnote_unlocked_items');
      return saved ? JSON.parse(saved) : ['item_name_change'];
    } catch {
      return ['item_name_change'];
    }
  });

  // 뽑기 연출 관련 상태
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStep, setDrawStep] = useState<'idle' | 'shaking' | 'opening' | 'result'>('idle');
  const [drawnItemsResult, setDrawnItemsResult] = useState<GachaItem[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // LocalStorage 저장
  useEffect(() => {
    try {
      localStorage.setItem('reviewnote_unlocked_items', JSON.stringify(unlockedItemIds));
    } catch (e) {
      console.error(e);
    }
  }, [unlockedItemIds]);

  // 파티클 폭죽 연출 (Canvas Confetti)
  const triggerConfetti = (rarity: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particleCount = rarity === 'UR' ? 120 : rarity === 'SSR' ? 80 : 40;
    const colors = rarity === 'UR'
      ? ['#F59E0B', '#EC4899', '#8B5CF6', '#3B82F6', '#10B981']
      : rarity === 'SSR'
      ? ['#F59E0B', '#FBBF24', '#FCD34D', '#FFFFFF']
      : ['#8B5CF6', '#A855F7', '#C084FC', '#38BDF8'];

    const particles: { x: number; y: number; vx: number; vy: number; color: string; size: number; alpha: number }[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16 - 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        alpha: 1
      });
    }

    let animationFrameId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        if (p.alpha <= 0) return;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // 중력
        p.alpha -= 0.015;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      if (alive) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  };

  // 가챠 뽑기 시작 (count: 1 또는 10)
  const handleStartDraw = (count: number) => {
    const cost = count * 10;
    if (userPoints < cost) {
      alert(`⚡ 복습 점수가 부족합니다! (필요: ${cost}점, 현재: ${userPoints}점)\n오답 노트를 복습해서 콤보 점수를 쌓아보세요! 🐱`);
      return;
    }

    // 점수 차감
    onDeductPoints(cost);

    // 가챠 뽑기 연출 준비
    setIsDrawing(true);
    setDrawStep('shaking');
    setCurrentResultIndex(0);

    // 햅틱 진동 (지원 단말)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 60, 40, 60]);
    }

    // 1초 후 상자 열림 연출
    setTimeout(() => {
      setDrawStep('opening');

      // 0.8초 후 결과 공개
      setTimeout(() => {
        const drawnResults: GachaItem[] = [];
        const newUnlocked = [...unlockedItemIds];

        for (let i = 0; i < count; i++) {
          const item = drawGachaItem();
          drawnResults.push(item);
          if (!newUnlocked.includes(item.id)) {
            newUnlocked.push(item.id);
          }
        }

        setUnlockedItemIds(newUnlocked);
        setDrawnItemsResult(drawnResults);
        setDrawStep('result');

        // 희귀도 최고 등급에 맞춰 폭죽 터뜨리기
        const highestRarity = drawnResults.some(r => r.rarity === 'UR')
          ? 'UR'
          : drawnResults.some(r => r.rarity === 'SSR')
          ? 'SSR'
          : 'SR';

        triggerConfetti(highestRarity);
      }, 800);
    }, 1000);
  };

  // 가챠 연출 닫기
  const handleCloseDrawModal = () => {
    setIsDrawing(false);
    setDrawStep('idle');
    setDrawnItemsResult([]);
  };

  // 아이템 장착/해제 토글
  const handleToggleEquip = (item: GachaItem) => {
    if (item.category === 'STAMP') {
      const isEquipped = equippedItems.stamp === item.effectValue;
      onEquipItem('stamp', isEquipped ? undefined : item.effectValue);
    } else if (item.category === 'TITLE') {
      const isEquipped = equippedItems.title === item.effectValue;
      onEquipItem('title', isEquipped ? undefined : item.effectValue);
    } else if (item.category === 'THEME') {
      const isEquipped = equippedItems.theme === item.effectValue;
      onEquipItem('theme', isEquipped ? undefined : item.effectValue);
    } else if (item.category === 'AI_VOICE') {
      const isEquipped = equippedItems.aiVoice === item.effectValue;
      onEquipItem('aiVoice', isEquipped ? undefined : item.effectValue);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-full pb-32 animate-fade-in select-none">
      {/* 캔버스 파티클 레이어 */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />

      {/* 헤더 안내 및 내 점수 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800 p-5 shadow-lg flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-3xl animate-bounce">🎁</span>
          <div>
            <h2 className="text-base font-black text-white flex items-center space-x-1.5">
              <span>행운의 럭키 상점</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                BETA
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              복습으로 모은 콤보 점수로 레어 스탬프, 칭호, 테마를 뽑아보세요!
            </p>
          </div>
        </div>

        {/* 내 보유 점수 통장 */}
        <div className="bg-slate-950/80 border border-amber-500/30 px-3.5 py-2 rounded-2xl flex flex-col items-end shadow-inner">
          <span className="text-[9px] text-slate-400 font-bold">보유 콤보 점수</span>
          <span className="text-sm font-black text-amber-400 flex items-center space-x-1">
            <span>⚡</span>
            <span>{userPoints}점</span>
          </span>
        </div>
      </div>

      {/* 서브 탭 서브 네비게이션 */}
      <div className="flex items-center justify-center p-3 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="flex space-x-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveSubTab('draw')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
              activeSubTab === 'draw'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🎰 뽑기 머신
          </button>
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all relative ${
              activeSubTab === 'inventory'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🎒 내 보물가방</span>
            {unlockedItemIds.length > 1 && (
              <span className="ml-1 text-[9px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">
                {unlockedItemIds.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
              activeSubTab === 'catalog'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📜 수집 도감 ({Math.round((unlockedItemIds.length / GACHA_ITEMS.length) * 100)}%)
          </button>
        </div>
      </div>

      {/* main content area */}
      <div className="p-4 flex-1">
        {/* TAB 1: 🎰 뽑기 메인 */}
        {activeSubTab === 'draw' && (
          <div className="flex flex-col items-center justify-center py-6 space-y-6">
            {/* 보물 상자 비주얼 뷰 */}
            <div className="relative group cursor-pointer" onClick={() => handleStartDraw(1)}>
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 via-purple-500/30 to-pink-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-44 h-44 bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-3xl flex flex-col items-center justify-center shadow-2xl group-hover:scale-105 transition-transform duration-300">
                <span className="text-7xl group-hover:rotate-6 transition-transform">🧰</span>
                <span className="mt-3 text-xs font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                  럭키 보물상자
                </span>
              </div>
            </div>

            {/* 뽑기 버튼 패널 */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <button
                onClick={() => handleStartDraw(1)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white border border-indigo-400/30 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
              >
                <span className="text-sm font-black">1회 뽑기</span>
                <span className="text-xs font-bold text-amber-300 mt-1 flex items-center space-x-1">
                  <span>⚡ 10점</span>
                </span>
              </button>

              <button
                onClick={() => handleStartDraw(10)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-amber-600 to-purple-700 hover:from-amber-500 hover:to-purple-600 text-white border border-amber-400/40 shadow-lg shadow-purple-600/30 active:scale-95 transition-all relative overflow-hidden"
              >
                <div className="absolute -right-6 -top-6 w-12 h-12 bg-amber-400/20 rotate-45" />
                <span className="text-sm font-black flex items-center space-x-1">
                  <span>🔥 10회 연속 뽑기</span>
                </span>
                <span className="text-xs font-bold text-amber-200 mt-1 flex items-center space-x-1">
                  <span>⚡ 100점</span>
                </span>
              </button>
            </div>

            {/* 확률 표 안내 */}
            <div className="w-full max-w-sm bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2 text-[10.5px]">
              <div className="flex items-center justify-between text-slate-400 font-bold border-b border-slate-800 pb-2">
                <span>🎰 획득 가능 등급</span>
                <span className="text-amber-400 font-mono">100% 랜덤 당첨</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center font-black pt-1">
                <span className="text-pink-400 bg-pink-500/10 py-1 rounded-lg border border-pink-500/20">UR 1%</span>
                <span className="text-amber-400 bg-amber-500/10 py-1 rounded-lg border border-amber-500/20">SSR 7%</span>
                <span className="text-purple-400 bg-purple-500/10 py-1 rounded-lg border border-purple-500/20">SR 22%</span>
                <span className="text-sky-400 bg-sky-500/10 py-1 rounded-lg border border-sky-500/20">R 70%</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 🎒 내 보물가방 (획득한 아이템 장착) */}
        {activeSubTab === 'inventory' && (
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 flex items-center space-x-2">
              <span>🎒 보유 아이템 및 착용 상태</span>
            </h3>

            {/* 현재 장착된 아이템 요약 카트 */}
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 space-y-2.5 shadow-lg">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider block">현재 장착된 설정</span>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">스탬프</span>
                  <span className="text-amber-300 font-extrabold">{equippedItems.stamp || '기존 O 스탬프'}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">칭호</span>
                  <span className="text-amber-300 font-extrabold truncate max-w-[100px]">{equippedItems.title || '칭호 없음'}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">테마</span>
                  <span className="text-emerald-400 font-extrabold">{equippedItems.theme || '기본 테마'}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">AI 말투</span>
                  <span className="text-purple-400 font-extrabold">{equippedItems.aiVoice || '기본 밤티 쌤'}</span>
                </div>
              </div>
            </div>

            {/* 획득한 아이템 목록 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GACHA_ITEMS.filter(item => unlockedItemIds.includes(item.id)).map(item => {
                const isEquipped =
                  (item.category === 'STAMP' && equippedItems.stamp === item.effectValue) ||
                  (item.category === 'TITLE' && equippedItems.title === item.effectValue) ||
                  (item.category === 'THEME' && equippedItems.theme === item.effectValue) ||
                  (item.category === 'AI_VOICE' && equippedItems.aiVoice === item.effectValue);

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between bg-slate-900/60 transition-all ${
                      isEquipped ? 'border-amber-400/80 bg-amber-500/10 shadow-lg shadow-amber-500/10' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="text-3xl flex-none">{item.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded bg-gradient-to-r ${item.color} text-white`}>
                            {item.rarity}
                          </span>
                          <h4 className="text-xs font-black text-white truncate">{item.name}</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.description}</p>
                      </div>
                    </div>

                    {item.effectValue && (
                      <button
                        onClick={() => handleToggleEquip(item)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all ${
                          isEquipped
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {isEquipped ? '착용 중 ✓' : '장착하기'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: 📜 수집 도감 */}
        {activeSubTab === 'catalog' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-400">📜 전체 럭키 수집 도감</h3>
              <span className="text-xs font-black text-amber-400 font-mono">
                {unlockedItemIds.length} / {GACHA_ITEMS.length} 수집 완료
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GACHA_ITEMS.map(item => {
                const isUnlocked = unlockedItemIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border flex items-center space-x-3 transition-all ${
                      isUnlocked
                        ? 'bg-slate-900/80 border-slate-800 text-white'
                        : 'bg-slate-950/60 border-slate-900 text-slate-600 opacity-60'
                    }`}
                  >
                    <span className="text-3xl flex-none select-none">{isUnlocked ? item.icon : '❓'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${isUnlocked ? `bg-gradient-to-r ${item.color} text-white` : 'bg-slate-800 text-slate-500'}`}>
                          {item.rarity}
                        </span>
                        <h4 className="text-xs font-black truncate">{isUnlocked ? item.name : '미해금 보물'}</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {isUnlocked ? item.description : '뽑기를 통해 얻을 수 있습니다.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 가챠 연출 팝업 모달 */}
      {isDrawing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/90 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-6 shadow-2xl flex flex-col items-center">
            {/* 1. 상자 흔들림 단계 */}
            {drawStep === 'shaking' && (
              <div className="py-8 space-y-4 animate-bounce">
                <span className="text-8xl block animate-pulse">🧰</span>
                <p className="text-sm font-black text-amber-300">보물상자가 두근두근 흔들립니다...!</p>
              </div>
            )}

            {/* 2. 상자 열림 & 빛줄기 단계 */}
            {drawStep === 'opening' && (
              <div className="py-8 space-y-4">
                <span className="text-8xl block animate-ping">✨</span>
                <p className="text-base font-black text-purple-300 animate-pulse">황금빛 보물이 터져나옵니다!</p>
              </div>
            )}

            {/* 3. 당첨 결과 카드 단계 */}
            {drawStep === 'result' && drawnItemsResult.length > 0 && (
              <div className="w-full space-y-5 animate-scale-up">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">🎉 럭키 당첨 축하합니다!</span>
                  <h3 className="text-sm font-extrabold text-white">새로운 보물을 획득했습니다</h3>
                </div>

                {/* 당첨 아이템 뷰 카셀 */}
                <div className="bg-slate-955 border border-slate-800 rounded-2xl p-6 flex flex-col items-center space-y-3 shadow-inner relative overflow-hidden">
                  <div className={`absolute inset-0 opacity-15 bg-gradient-to-b ${drawnItemsResult[currentResultIndex].color}`} />
                  
                  <span className="text-6xl relative z-10 animate-bounce">
                    {drawnItemsResult[currentResultIndex].icon}
                  </span>

                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full text-white bg-gradient-to-r ${drawnItemsResult[currentResultIndex].color}`}>
                    {drawnItemsResult[currentResultIndex].rarity} 등급
                  </span>

                  <h4 className="text-base font-black text-white relative z-10">
                    {drawnItemsResult[currentResultIndex].name}
                  </h4>

                  <p className="text-xs text-slate-400 relative z-10 text-center leading-relaxed">
                    {drawnItemsResult[currentResultIndex].description}
                  </p>
                </div>

                {/* 10연속 뽑기 시 이전/다음 내비 */}
                {drawnItemsResult.length > 1 && (
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-2">
                    <button
                      disabled={currentResultIndex === 0}
                      onClick={() => setCurrentResultIndex(prev => Math.max(0, prev - 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg disabled:opacity-30"
                    >
                      ◀ 이전
                    </button>
                    <span>{currentResultIndex + 1} / {drawnItemsResult.length}</span>
                    <button
                      disabled={currentResultIndex === drawnItemsResult.length - 1}
                      onClick={() => setCurrentResultIndex(prev => Math.min(drawnItemsResult.length - 1, prev + 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg disabled:opacity-30"
                    >
                      다음 ▶
                    </button>
                  </div>
                )}

                {/* 확인 / 닫기 버튼 */}
                <button
                  onClick={handleCloseDrawModal}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-sm hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                >
                  보물가방에 보관하기
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
