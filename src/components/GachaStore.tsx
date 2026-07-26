import React, { useState, useEffect, useRef } from 'react';
import type { GachaItem, EquippedItems } from '../types';
import { GACHA_ITEMS, drawGachaItem, getRarityTheme } from '../utils/gachaCatalog';
import { supabase } from '../services/supabase';
import { getKSTDateString } from '../utils/streak';

export interface ExtendedGachaItem extends GachaItem {
  isDuplicate?: boolean;
  refundPoints?: number;
}

export interface GachaLogEntry {
  id: string;
  user_id: string;
  item_name: string;
  item_icon: string;
  rarity: string;
  created_at: string;
  user_name?: string;
  user_title?: string;
  profiles?: {
    nickname?: string;
    display_name?: string;
    equipped_title?: string;
    email?: string;
    is_admin?: boolean;
  };
}

const getRefundPointsForRarity = (rarity: string): number => {
  switch (rarity) {
    case 'UR': return 50;
    case 'SSR': return 30;
    case 'SR': return 15;
    case 'R': return 5;
    default: return 5;
  }
};

interface GachaStoreProps {
  userId: string;
  userPoints: number;
  onDeductPoints: (amount: number) => void;
  equippedItems: EquippedItems;
  onEquipItem: (category: keyof EquippedItems, value: string | undefined) => void;
  onUseNameChangeTicket?: () => void; // 닉네임 변경권 사용 콜백
}

export const GachaStore: React.FC<GachaStoreProps> = ({
  userId,
  userPoints,
  onDeductPoints,
  equippedItems,
  onEquipItem,
  onUseNameChangeTicket,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'draw' | 'inventory' | 'catalog'>('draw');

  // Supabase 기반 인벤토리: { item_id: quantity }
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [inventoryLoading, setInventoryLoading] = useState(true);

  // 뽑기 연출 관련 상태
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStep, setDrawStep] = useState<'idle' | 'shaking' | 'opening' | 'result'>('idle');
  const [drawnItemsResult, setDrawnItemsResult] = useState<ExtendedGachaItem[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // 실시간 SSR/UR 전광판 전용 로그 상태
  const [recentLogs, setRecentLogs] = useState<GachaLogEntry[]>([]);

  // 무료 뽑기 사용 이력 (서버 기준 — 기기를 바꿔도 중복 수령 못 하도록)
  const [lastFreeDrawDate, setLastFreeDrawDate] = useState<string | null>(null);
  const [lastFreeWeeklyDrawDate, setLastFreeWeeklyDrawDate] = useState<string | null>(null);
  const todayKst = getKSTDateString();
  const canFreeDraw1 = lastFreeDrawDate !== todayKst;
  // 최초 3회까지 무료 10연속 가능 (0/1/2/3 횟수 저장, CLAIMED는 3으로 취급)
  const freeDrawUsedCount = lastFreeWeeklyDrawDate === 'CLAIMED' ? 3 : parseInt(lastFreeWeeklyDrawDate || '0', 10) || 0;
  const FREE_DRAW10_MAX = 3;
  const canFreeDraw10 = freeDrawUsedCount < FREE_DRAW10_MAX;
  const freeDraw10Remaining = FREE_DRAW10_MAX - freeDrawUsedCount;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── 최근 SSR/UR 전광판 피드 로드 ──────────────────────────
  const fetchRecentLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('gacha_logs')
        .select('id, user_id, item_name, item_icon, rarity, created_at, user_name, user_title, profiles(nickname, display_name, equipped_title, email, is_admin)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // 어드민 및 test/8xnvekjq 계정 필터링
      const filtered = (data || []).filter((log: any) => {
        const p = log.profiles;
        if (!p) return true;
        if (p.is_admin) return false;
        const email = (p.email || '').toLowerCase();
        if (email.startsWith('test') || email.startsWith('8xnvekjq')) return false;
        return true;
      });

      setRecentLogs(filtered as unknown as GachaLogEntry[]);
    } catch (err) {
      console.error('전광판 피드 로드 실패:', err);
    }
  };

  // ── 인벤토리 Supabase 로드 ──────────────────────────────
  const loadInventory = async () => {
    if (!userId) return;
    setInventoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_items')
        .select('item_id, quantity')
        .eq('user_id', userId);

      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: { item_id: string; quantity: number }) => { map[row.item_id] = row.quantity; });
      setInventory(map);
    } catch (e) {
      console.error('인벤토리 로드 실패:', e);
    } finally {
      setInventoryLoading(false);
    }
  };

  // ── 무료 뽑기(일일 1회/주간 10회) 사용 이력 Supabase 로드 ──────
  const loadFreeDrawStatus = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('last_free_draw_date, last_free_weekly_draw_date')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) {
      setLastFreeDrawDate(data.last_free_draw_date || null);
      setLastFreeWeeklyDrawDate(data.last_free_weekly_draw_date || null);
    }
  };

  useEffect(() => {
    // localStorage 구 데이터 제거
    localStorage.removeItem('reviewnote_unlocked_items');
    loadInventory();
    loadFreeDrawStatus();
    fetchRecentLogs();

    const handleInventoryUpdate = () => {
      loadInventory();
      fetchRecentLogs();
    };
    window.addEventListener('reviewnote_inventory_updated', handleInventoryUpdate);
    return () => {
      window.removeEventListener('reviewnote_inventory_updated', handleInventoryUpdate);
    };
  }, [userId]);

  // ── 아이템 추가 (뽑기 결과 → DB 저장 및 SSR/UR 전광판 로깅) ──────
  const addItemsToInventory = async (items: GachaItem[]) => {
    if (!userId) return;
    // 아이템별 카운트
    const counts: Record<string, number> = {};
    items.forEach(item => { counts[item.id] = (counts[item.id] || 0) + 1; });

    const upserts = Object.entries(counts).map(([item_id, qty]) => {
      const gachaObj = GACHA_ITEMS.find(g => g.id === item_id);
      const isConsumable = gachaObj?.category === 'SHIELD';
      return {
        user_id: userId,
        item_id,
        quantity: isConsumable ? (inventory[item_id] || 0) + qty : 1,
      };
    });

    const { error } = await supabase
      .from('user_items')
      .upsert(upserts, { onConflict: 'user_id,item_id' });

    if (error) { console.error('아이템 저장 실패:', error); return; }

    // 희귀 아이템 (SR / SSR / UR) 당첨 시 전광판 로그 기록 (어드민/테스트 계정 제외)
    const rareItems = items.filter(i => i.rarity === 'SR' || i.rarity === 'SSR' || i.rarity === 'UR');
    if (rareItems.length > 0) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('email, nickname, display_name, equipped_title, is_admin')
          .eq('id', userId)
          .maybeSingle();

        const email = (prof?.email || '').toLowerCase();
        const isTestOrAdmin = prof?.is_admin || email.startsWith('test') || email.startsWith('8xnvekjq');

        if (!isTestOrAdmin) {
          const nameToSave = prof?.nickname || prof?.display_name || '학생';
          const titleToSave = prof?.equipped_title || null;
          const logInserts = rareItems.map(item => ({
            user_id: userId,
            item_id: item.id,
            item_name: item.name,
            item_icon: item.icon,
            rarity: item.rarity,
            user_name: nameToSave,
            user_title: titleToSave,
          }));
          await supabase.from('gacha_logs').insert(logInserts);
          fetchRecentLogs();
        }
      } catch (logErr) {
        console.error('전광판 피드 저장 실패:', logErr);
      }
    }

    // 로컬 상태 갱신
    setInventory(prev => {
      const next = { ...prev };
      Object.entries(counts).forEach(([id, qty]) => {
        const gachaObj = GACHA_ITEMS.find(g => g.id === id);
        const isConsumable = gachaObj?.category === 'SHIELD';
        next[id] = isConsumable ? (next[id] || 0) + qty : 1;
      });
      return next;
    });

    // 방어권/콤보 부스터처럼 App 상단 로직이 참조하는 아이템 보유 여부를 즉시 재확인하도록 알림
    window.dispatchEvent(new CustomEvent('reviewnote_inventory_updated'));
  };

  // 보유 아이템 id 목록 (quantity > 0)
  const unlockedItemIds = Object.entries(inventory)
    .filter(([, qty]) => qty > 0)
    .map(([id]) => id);

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
        p.vy += 0.3;
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

  // 가챠 뽑기 시작 (count: 1 또는 10, isFree: 매일 무료 1회 / 매주 월요일 무료 10회)
  const handleStartDraw = (count: number, isFree: boolean = false) => {
    const cost = count * 10;

    if (isFree) {
      if (count === 1 && !canFreeDraw1) {
        alert('🎁 오늘의 무료 1회 뽑기는 이미 사용했어요! 내일 다시 도전해보세요.');
        return;
      }
      if (count === 10 && !canFreeDraw10) {
        alert(`🎁 계정 무료 10연속 뽑기 ${FREE_DRAW10_MAX}회를 모두 사용하셨습니다!`);
        return;
      }
    } else if (userPoints < cost) {
      alert(`⚡ 복습 점수가 부족합니다! (필요: ${cost}점, 현재: ${userPoints}점)\n오답 노트를 복습해서 콤보 점수를 쌓아보세요! 🐱`);
      return;
    }

    if (isFree) {
      // 무료 뽑기 사용 처리 — 서버에 기록해서 기기를 바꿔도 중복 수령 못 하게 함
      if (count === 1) {
        setLastFreeDrawDate(todayKst);
        if (userId) {
          supabase.from('profiles').update({ last_free_draw_date: todayKst }).eq('id', userId).then(({ error }) => {
            if (error) console.error('무료 1회 뽑기 기록 실패:', error);
          });
        }
      } else {
        const nextCount = String(freeDrawUsedCount + 1);
        setLastFreeWeeklyDrawDate(nextCount);
        if (userId) {
          supabase.from('profiles').update({ last_free_weekly_draw_date: nextCount }).eq('id', userId).then(({ error }) => {
            if (error) console.error('무료 10회 뽑기 기록 실패:', error);
          });
        }
      }
    } else {
      onDeductPoints(cost);
    }

    setIsDrawing(true);
    setDrawStep('shaking');
    setCurrentResultIndex(0);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 60, 40, 60]);
    }

    setTimeout(() => {
      setDrawStep('opening');

      setTimeout(() => {
        const drawnResults: ExtendedGachaItem[] = [];
        let totalRefundPoints = 0;
        const currentInventory = { ...inventory };

        for (let i = 0; i < count; i++) {
          const item = drawGachaItem();
          const isConsumable = item.category === 'SHIELD' || item.category === 'CHARM';
          const alreadyOwned = (currentInventory[item.id] || 0) > 0;

          if (!isConsumable && alreadyOwned) {
            // 영구 아이템 중복! 희귀도별 점수 환급 (페이백)
            const refund = getRefundPointsForRarity(item.rarity);
            totalRefundPoints += refund;
            drawnResults.push({
              ...item,
              isDuplicate: true,
              refundPoints: refund,
            });
          } else {
            // 신규 아이템이거나 소모품 -> 인벤토리에 추가
            currentInventory[item.id] = (currentInventory[item.id] || 0) + 1;
            drawnResults.push({
              ...item,
              isDuplicate: false,
            });
          }
        }

        // 신규/소모품만 Supabase user_items 에 저장
        const itemsToSave = drawnResults.filter(r => !r.isDuplicate);
        if (itemsToSave.length > 0) {
          addItemsToInventory(itemsToSave);
        }

        // 중복 환급 점수가 있으면 유저 보유 점수로 가산 (음수 차감 = 점수 플러스)
        if (totalRefundPoints > 0) {
          onDeductPoints(-totalRefundPoints);
        }

        setDrawnItemsResult(drawnResults);
        setDrawStep('result');

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
        <div className="flex items-center space-x-3 min-w-0">
          <span className="text-3xl animate-bounce flex-none">🎁</span>
          <div className="min-w-0">
            <h2 className="text-base font-black text-white flex items-center space-x-1.5 whitespace-nowrap">
              <span>행운의 럭키 상점</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono flex-none">
                BETA
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              복습으로 모은 콤보 점수로 레어 스탬프, 칭호, 테마를 뽑아보세요!
            </p>
          </div>
        </div>

        {/* 내 보유 점수 통장 & 이용 가이드 버튼 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('reviewnote_open_store_guide'))}
            className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 px-2.5 py-1.5 rounded-2xl text-[10.5px] font-extrabold flex items-center space-x-1 transition-all shadow-sm whitespace-nowrap flex-none shrink-0"
            title="럭키상점 활용법 가이드 열기"
          >
            <span>🎁</span>
            <span>가이드</span>
          </button>

          <div className="bg-slate-955/80 border border-amber-500/30 px-3.5 py-2 rounded-2xl flex flex-col items-end shadow-inner">
            <span className="text-[9px] text-slate-400 font-bold">보유 콤보 점수</span>
            <span className="text-sm font-black text-amber-400 flex items-center space-x-1">
              <span>⚡</span>
              <span>{userPoints}점</span>
            </span>
          </div>
        </div>
      </div>

      {/* 서브 탭 서브 네비게이션 */}
      <div className="flex items-center justify-center p-3 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="flex space-x-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveSubTab('draw')}
            className={`px-3 py-2 rounded-xl text-[11px] font-extrabold transition-all whitespace-nowrap ${
              activeSubTab === 'draw'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🎰 뽑기 머신
          </button>
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-3 py-2 rounded-xl text-[11px] font-extrabold transition-all relative whitespace-nowrap ${
              activeSubTab === 'inventory'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🎒 내 보물가방</span>
            {unlockedItemIds.length > 0 && (
              <span className="ml-1 text-[9px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">
                {unlockedItemIds.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('catalog')}
            className={`px-3 py-2 rounded-xl text-[11px] font-extrabold transition-all whitespace-nowrap ${
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
            <div className="relative group cursor-pointer" onClick={() => handleStartDraw(1, canFreeDraw1)}>
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 via-purple-500/30 to-pink-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-44 h-44 bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-3xl flex flex-col items-center justify-center shadow-2xl group-hover:scale-105 transition-transform duration-300">
                <span className="text-7xl group-hover:rotate-6 transition-transform">🧰</span>
                <span className="mt-3 text-xs font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                  럭키 보물상자
                </span>
              </div>
            </div>

            {/* 뽑기 버튼 패널 — 무료 뽑기가 남아있으면 무료로, 이미 썼으면 점수 차감으로 자동 전환 */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <button
                onClick={() => handleStartDraw(1, canFreeDraw1)}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl text-white border shadow-lg active:scale-95 transition-all ${
                  canFreeDraw1
                    ? 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border-emerald-400/40 shadow-emerald-600/30'
                    : 'bg-gradient-to-b from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border-indigo-400/30 shadow-indigo-600/30'
                }`}
              >
                <span className="text-sm font-black">{canFreeDraw1 ? '오늘의 무료 1회' : '1회 뽑기'}</span>
                <span className="text-xs font-bold text-amber-300 mt-1 flex items-center space-x-1">
                  <span>{canFreeDraw1 ? '무료' : '⚡ 10점'}</span>
                </span>
              </button>

              <button
                onClick={() => handleStartDraw(10, canFreeDraw10)}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl text-white border shadow-lg active:scale-95 transition-all relative overflow-hidden ${
                  canFreeDraw10
                    ? 'bg-gradient-to-b from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 border-sky-400/40 shadow-blue-600/30'
                    : 'bg-gradient-to-b from-amber-600 to-purple-700 hover:from-amber-500 hover:to-purple-600 border-amber-400/40 shadow-purple-600/30'
                }`}
              >
                <div className="absolute -right-6 -top-6 w-12 h-12 bg-amber-400/20 rotate-45" />
                <span className="text-sm font-black flex items-center space-x-1">
                  <span>{canFreeDraw10 ? `🎁 무료 10연속` : '🔥 10회 연속 뽑기'}</span>
                </span>
                <span className="text-xs font-bold text-amber-200 mt-1 flex items-center space-x-1">
                  <span>{canFreeDraw10 ? `무료 (${freeDraw10Remaining}회 남음)` : '⚡ 100점'}</span>
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

            {/* 🌟 실시간 SR / SSR / UR 전설 획득 전광판 피드 */}
            <div className="w-full max-w-sm bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-black text-amber-300 flex items-center space-x-1.5 uppercase tracking-wider">
                  <span>🎉</span>
                  <span>실시간 SR / SSR / UR 획득 전광판</span>
                </h3>
                <span className="text-[9.5px] text-slate-500 font-bold">라이브 피드</span>
              </div>

              {recentLogs.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-slate-500 font-medium">
                  아직 SR 이상 희귀 보물 획득 소식이 없습니다. 럭키 행운의 주인공이 되어보세요! ✨
                </div>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map(log => {
                    const p = log.profiles;
                    const userName = log.user_name || p?.nickname || p?.display_name || '학생';
                    const isUR = log.rarity === 'UR';
                    const rTheme = getRarityTheme(log.rarity as any);

                    const formatRelativeTime = (isoString: string) => {
                      try {
                        const date = new Date(isoString);
                        const now = new Date();
                        const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
                        if (diffSec < 60) return '방금 전';
                        const diffMin = Math.floor(diffSec / 60);
                        if (diffMin < 60) return `${diffMin}분 전`;
                        const diffHour = Math.floor(diffMin / 60);
                        if (diffHour < 24) return `${diffHour}시간 전`;
                        const diffDay = Math.floor(diffHour / 24);
                        return `${diffDay}일 전`;
                      } catch {
                        return '방금 전';
                      }
                    };

                    return (
                      <div
                        key={log.id}
                        className={`p-2.5 px-3 rounded-xl border flex items-center justify-between text-xs whitespace-nowrap transition-all ${
                          isUR
                            ? 'bg-slate-900/90 border-amber-500/40 shadow-sm'
                            : 'bg-slate-955/80 border-slate-850'
                        }`}
                      >
                        {/* 좌측: 유저 이름 */}
                        <span className="font-extrabold text-slate-200 text-xs truncate flex-none max-w-[100px] mr-2">
                          {userName}
                        </span>

                        {/* 우측 (오른쪽 완벽 정렬): 희귀도 배지 + 획득 아이템 명칭 + 상대 시간 */}
                        <div className="flex items-center justify-end space-x-1.5 flex-1 min-w-0 text-right overflow-hidden">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded flex-none ${rTheme.badge}`}>
                            {log.rarity}
                          </span>
                          <span className={`text-xs font-extrabold truncate text-right min-w-0 ${rTheme.textColor}`}>
                            {log.item_name}
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-bold whitespace-nowrap flex-none text-right pl-1">
                            {formatRelativeTime(log.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 🎒 내 보물가방 (획득한 아이템 장착) */}
        {activeSubTab === 'inventory' && (
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 flex items-center space-x-2">
              <span>🎒 보유 아이템 및 착용 상태</span>
            </h3>

            {/* 현재 장착된 아이템 요약 카드 */}
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

            {inventoryLoading ? (
              <div className="text-center py-8 text-slate-500 text-sm">로딩 중...</div>
            ) : unlockedItemIds.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-sm">
                <p>🎒 보물가방이 비어있어요!</p>
                <p className="text-xs mt-1">뽑기 머신에서 아이템을 획득해보세요.</p>
              </div>
            ) : (
              /* 획득한 아이템 목록 */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GACHA_ITEMS.filter(item => unlockedItemIds.includes(item.id)).map(item => {
                  const qty = inventory[item.id] || 0;
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
                        <div className="relative flex-none">
                          <span className="text-3xl">{item.icon}</span>
                          {item.category === 'SHIELD' && qty > 1 && (
                            <span className="absolute -top-1 -right-1 text-[9px] bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center font-black">
                              {qty}
                            </span>
                          )}
                        </div>
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

                      {/* SHIELD/CHARM 류 소모성 아이템 */}
                      {item.category === 'SHIELD' && item.id === 'item_name_change' && onUseNameChangeTicket && (
                        <button
                          onClick={onUseNameChangeTicket}
                          className="px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all bg-indigo-700 text-white hover:bg-indigo-600"
                        >
                          사용하기
                        </button>
                      )}

                      {/* 장착형 아이템 */}
                      {item.effectValue && item.category !== 'SHIELD' && item.category !== 'CHARM' && (
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
            )}
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
                const getCategoryLabel = (category: string) => {
                  switch (category) {
                    case 'TITLE': return '칭호';
                    case 'STAMP': return '스탬프';
                    case 'THEME': return '테마';
                    case 'AI_VOICE': return 'AI 말투';
                    case 'SHIELD': return '기능 아이템';
                    case 'CHARM': return '행운 부적';
                    default: return '보물';
                  }
                };
                const catLabel = getCategoryLabel(item.category);

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border flex items-center space-x-3 transition-all ${
                      isUnlocked
                        ? 'bg-slate-900/80 border-slate-800 text-white'
                        : 'bg-slate-950/60 border-slate-900 text-slate-500 opacity-70'
                    }`}
                  >
                    <span className="text-3xl flex-none select-none">{isUnlocked ? item.icon : '❓'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded flex-none ${isUnlocked ? `bg-gradient-to-r ${item.color} text-white` : 'bg-slate-800 text-slate-400'}`}>
                          {item.rarity}
                        </span>
                        <span className="text-[8.5px] font-extrabold px-1.5 py-0.2 rounded bg-slate-800/90 text-slate-300 border border-slate-700/60 flex-none">
                          {catLabel}
                        </span>
                        <h4 className="text-xs font-black truncate">{isUnlocked ? item.name : '미해금 보물'}</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 truncate">
                        {isUnlocked ? item.description : '뽑기를 통해 보물을 해금해보세요.'}
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

                  <div className="flex items-center space-x-1.5 justify-center flex-wrap gap-y-1 relative z-10">
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full text-white bg-gradient-to-r ${drawnItemsResult[currentResultIndex].color}`}>
                      {drawnItemsResult[currentResultIndex].rarity} 등급
                    </span>
                    {drawnItemsResult[currentResultIndex].isDuplicate && (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full text-amber-300 bg-amber-500/20 border border-amber-400/50 shadow-[0_0_8px_rgba(245,158,11,0.35)] animate-pulse">
                        ⚡ 중복 보물 페이백 (+{drawnItemsResult[currentResultIndex].refundPoints}점 환급)
                      </span>
                    )}
                  </div>

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
