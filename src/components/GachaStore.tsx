import React, { useState, useEffect, useRef } from 'react';
import '../styles/store.css';
import type { GachaItem, EquippedItems } from '../types';
import { GACHA_ITEMS, drawGachaItem, getRarityTheme, getRarityBadgeTextColor, getTitleBadgeStyle } from '../utils/gachaCatalog';
import { CatPawIcon } from './CatPawIcon';
import { supabase } from '../services/supabase';
import { getKSTDateString } from '../utils/streak';
import { CustomNoticeModal, type NoticeModalState } from './CustomNoticeModal';
import { ItemSynthesisPanel } from './ItemSynthesisPanel';
import { getScreenState, setScreenState } from '../app/screenStateStore';

type GachaSubTab = 'draw' | 'synthesis' | 'inventory' | 'catalog';

interface StoredGachaStoreState {
  activeSubTab: GachaSubTab;
  scrollTopBySubTab: Record<GachaSubTab, number>;
}

const initialScrollTopBySubTab: Record<GachaSubTab, number> = {
  draw: 0,
  synthesis: 0,
  inventory: 0,
  catalog: 0,
};

function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

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
}

const getRefundPointsForRarity = (rarity: string): number => {
  switch (rarity) {
    case 'UR': return 20;
    case 'SSR': return 12;
    case 'SR': return 6;
    case 'R': return 2;
    default: return 2;
  }
};

interface GachaStoreProps {
  userId: string;
  userPoints: number;
  onDeductPoints: (amount: number) => void;
  equippedItems: EquippedItems;
  onEquipItem: (category: keyof EquippedItems, value: string | undefined) => void;
  onUseNameChangeTicket?: () => void; // 닉네임 변경권 사용 콜백
  onUseAiNameChangeTicket?: () => void; // AI 이름 변경권 사용 콜백
  aiPersonaName?: string; // AI 이름 변경권으로 바꾼 커스텀 AI 페르소나 이름 (없으면 기본값 '밤티')
  comboBoosterExpiresAt?: string | null; // 콤보 부스터 5배 버프 만료시각 (서버 profiles 기준, App.tsx에서 전달)
  cheerLine?: string; // 최근 복습 체크(O/X/★) 결과 + 장착 AI 말투에 맞춘 응원 한 줄 (App.tsx에서 전달)
}

export const GachaStore: React.FC<GachaStoreProps> = ({
  userId,
  userPoints,
  onDeductPoints,
  equippedItems,
  onEquipItem,
  onUseNameChangeTicket,
  onUseAiNameChangeTicket,
  aiPersonaName,
  comboBoosterExpiresAt,
  cheerLine,
}) => {
  const screenKey = 'gachaStore';
  const saved = useRef(getScreenState<StoredGachaStoreState>(screenKey)).current;
  const [activeSubTab, setActiveSubTab] = useState<GachaSubTab>(() => saved?.activeSubTab ?? 'draw');
  const rootRef = useRef<HTMLDivElement>(null);
  const activeSubTabRef = useRef(activeSubTab);
  activeSubTabRef.current = activeSubTab;
  const scrollTopBySubTabRef = useRef<Record<GachaSubTab, number>>({
    ...initialScrollTopBySubTab,
    ...saved?.scrollTopBySubTab,
  });
  const pendingRestoreSubTabRef = useRef<GachaSubTab | null>(activeSubTab);

  // Supabase 기반 인벤토리: { item_id: quantity }
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const inventoryLoadingRef = useRef(inventoryLoading);
  inventoryLoadingRef.current = inventoryLoading;

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
  // 서버에서 실제 사용 이력을 확인하기 전까지는 "무료 가능"으로 잘못 보여주지 않도록 하는 로딩 가드.
  // 이게 없으면 lastFreeDrawDate/lastFreeWeeklyDrawDate의 초기값(null)이 "아직 안 씀"으로 잘못
  // 해석되어, 로딩이 끝나기 전 짧은 순간에 빠르게 클릭하면 이미 다 쓴 무료 뽑기를 다시 받아갈 수 있었다.
  const [freeDrawStatusLoaded, setFreeDrawStatusLoaded] = useState(false);
  const todayKst = getKSTDateString();
  const canFreeDraw1 = freeDrawStatusLoaded && lastFreeDrawDate !== todayKst;
  // 최초 3회까지 무료 10연속 가능 (0/1/2/3 횟수 저장).
  // 'CLAIMED'(옛 "평생 1회" 방식)나 순수 숫자가 아닌 값(더 예전의 "매주 월요일" 날짜 문자열 잔재)은
  // 전부 "최소 1회는 이미 사용함"으로만 취급한다 — 3으로 취급하면 옛날에 1번 썼던 계정이 남은 2회를
  // 영영 못 받게 되므로, 새로운 "계정당 3회" 정책이 기존 계정에도 공평하게 적용되도록 한다.
  const freeDrawUsedCount = /^\d+$/.test(lastFreeWeeklyDrawDate || '')
    ? parseInt(lastFreeWeeklyDrawDate as string, 10)
    : lastFreeWeeklyDrawDate
      ? 1
      : 0;
  const FREE_DRAW10_MAX = 3;
  const canFreeDraw10 = freeDrawStatusLoaded && freeDrawUsedCount < FREE_DRAW10_MAX;
  const freeDraw10Remaining = FREE_DRAW10_MAX - freeDrawUsedCount;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 🔔 커스텀 알림 모달 상태
  const [noticeModal, setNoticeModal] = useState<NoticeModalState>({
    isOpen: false,
    title: '',
    message: '',
  });

  // 🔮 최초 1회 보물 연성 합성 안내 모달 상태 (서버 DB 기준)
  const [showSynthesisNotice, setShowSynthesisNotice] = useState(false);

  // AppShell의 실제 스크롤 컨테이너를 ref로만 추적해 서브탭별 위치를 독립적으로 기억한다.
  // 서브탭 전환이나 GachaStore 언마운트 시 현재 위치를 잡고, 새 서브탭은 렌더 뒤 복원한다.
  useEffect(() => {
    const container = findScrollableAncestor(rootRef.current);
    if (!container) return;
    const scrollTopBySubTab = scrollTopBySubTabRef.current;

    pendingRestoreSubTabRef.current = activeSubTab;
    const restoreScroll = () => {
      if (activeSubTab === 'inventory' && inventoryLoadingRef.current) return;
      container.scrollTop = scrollTopBySubTab[activeSubTab];
      pendingRestoreSubTabRef.current = null;
    };
    const raf = requestAnimationFrame(restoreScroll);

    const handleScroll = () => {
      scrollTopBySubTab[activeSubTab] = container.scrollTop;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [activeSubTab]);

  // inventory는 마운트 직후 로딩 UI가 먼저 렌더되므로 데이터가 채워진 다음 위치를 복원한다.
  useEffect(() => {
    if (inventoryLoading || pendingRestoreSubTabRef.current !== 'inventory') return;
    const container = findScrollableAncestor(rootRef.current);
    if (!container) return;

    const raf = requestAnimationFrame(() => {
      container.scrollTop = scrollTopBySubTabRef.current.inventory;
      pendingRestoreSubTabRef.current = null;
    });
    return () => cancelAnimationFrame(raf);
  }, [inventoryLoading]);

  // DB/localStorage가 아닌 세션 메모리 저장소에 unmount 시점의 UI 상태만 남긴다.
  useEffect(() => () => {
    setScreenState<StoredGachaStoreState>(screenKey, {
      activeSubTab: activeSubTabRef.current,
      scrollTopBySubTab: { ...scrollTopBySubTabRef.current },
    });
  }, [screenKey]);

  const closeSynthesisNotice = async (shouldNavigateToSynthesis = false) => {
    setShowSynthesisNotice(false);
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ has_seen_synthesis_notice: true })
        .eq('id', userId);
      if (error) console.error('연성 알림 이력 DB 저장 오류:', error);
    } catch (e) {
      console.error('연성 알림 이력 DB 저장 예외:', e);
    } finally {
      if (shouldNavigateToSynthesis) {
        setActiveSubTab('synthesis');
      }
    }
  };

  const showNoticeModal = (info: Omit<NoticeModalState, 'isOpen'>) => {
    setNoticeModal({
      isOpen: true,
      ...info,
    });
  };

  const closeNoticeModal = () => {
    setNoticeModal((prev) => ({ ...prev, isOpen: false }));
  };

  // ── 최근 SSR/UR 전광판 피드 로드 ──────────────────────────
  const fetchRecentLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('gacha_logs')
        .select('id, user_id, item_name, item_icon, rarity, created_at, user_name, user_title')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      // 표시 이름/칭호는 로그 생성 시 저장된 안전한 스냅샷을 사용한다.
      setRecentLogs((data || []) as GachaLogEntry[]);
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

      // 🧪 test 계정 전용 자동 전체 아이템 99개 풀해금 보장
      if (userId === '945dd787-7606-4244-9056-43ab32c21d93') {
        GACHA_ITEMS.forEach((item) => {
          if (!map[item.id] || map[item.id] < 1) {
            map[item.id] = 99;
          }
        });
      }

      setInventory(map);
    } catch (e) {
      console.error('인벤토리 로드 실패:', e);
    } finally {
      setInventoryLoading(false);
    }
  };

  // ── 무료 뽑기 및 프로필 알림 이력 Supabase 로드 ──────
  const loadFreeDrawStatus = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('last_free_draw_date, last_free_weekly_draw_date, has_seen_synthesis_notice')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setLastFreeDrawDate(data.last_free_draw_date || null);
      setLastFreeWeeklyDrawDate(data.last_free_weekly_draw_date || null);
      // 서버 DB 기준 최초 1회 연성 안내 모달 노출 판단 (어떤 기기든 딱 1회만 노출)
      if (!data.has_seen_synthesis_notice) {
        setShowSynthesisNotice(true);
      }
    }
    setFreeDrawStatusLoaded(true);
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

  // ── 실시간 SSR/UR 전광판: 다른 학생이 뽑기를 해도 새로고침 없이 즉시 반영 ──────
  useEffect(() => {
    const channel = supabase
      .channel('gacha_logs_live_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gacha_logs' },
        () => {
          fetchRecentLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

    // 희귀 아이템 (SR / SSR / UR / MR) 당첨 시 전광판 로그 기록 (어드민/테스트 계정 제외)
    const rareItems = items.filter(i => i.rarity === 'SR' || i.rarity === 'SSR' || i.rarity === 'UR' || i.rarity === 'MR');
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

  // 가챠 뽑기 시작 (count: 1 또는 10, isFree: 매일 무료 1회 / 계정당 3회 무료 10연속)
  const handleStartDraw = (count: number, isFree: boolean = false) => {
    const cost = count === 10 ? 70 : count * 10; // 10연속 30% 할인 (100점 → 70점)

    if (isFree) {
      if (count === 1 && !canFreeDraw1) {
        showNoticeModal({
          title: '🎁 무료 1회 뽑기 완료',
          message: '오늘의 무료 1회 뽑기는 이미 사용했어요! 내일 다시 도전해보세요.',
          badge: '무료 뽑기',
          icon: '🎁',
        });
        return;
      }
      if (count === 10 && !canFreeDraw10) {
        showNoticeModal({
          title: '🎁 웰컴 10연속 무료 뽑기 완료',
          message: `계정 무료 10연속 뽑기 ${FREE_DRAW10_MAX}회를 모두 사용하셨습니다!`,
          badge: '무료 뽑기',
          icon: '🎁',
        });
        return;
      }
    } else if (userPoints < cost) {
      showNoticeModal({
        title: '⚡ 콤보 점수 부족',
        message: `복습 점수가 부족합니다! (필요: ${cost}점, 현재: ${userPoints}점)\n오답 노트를 복습해서 콤보 점수를 쌓아보세요! 🐱`,
        badge: '점수 부족',
        icon: '⚡',
      });
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

  // 숙제 면제권 사용 (입력이 필요 없어 App/Header까지 갈 것 없이 여기서 바로 소모)
  const handleUseHomeworkExemptTicket = async () => {
    const currentQty = inventory['item_homework_exempt'] || 0;
    if (currentQty < 1) return;

    const newQty = currentQty - 1;
    const { error } = await supabase
      .from('user_items')
      .update({ quantity: newQty })
      .eq('user_id', userId)
      .eq('item_id', 'item_homework_exempt');

    if (error) {
      showNoticeModal({
        title: '사용 실패',
        message: `숙제 면제권 사용에 실패했습니다: ${error.message}`,
        badge: '오류',
        icon: '⚠️',
      });
      return;
    }

    setInventory(prev => ({ ...prev, item_homework_exempt: newQty }));
    showNoticeModal({
      title: '📝 숙제 면제권 사용 완료!',
      message: `이 화면을 선생님께 보여주세요.\n(잔여 ${newQty}개)`,
      badge: '숙제 면제권 사용',
      icon: '📝',
    });
  };

  // ⚡ 콤보 부스터 (5배 버프 3시간권) 사용
  // "실제로 아이템을 소유했는지"와 "만료시각 설정"을 서버 RPC(activate_combo_booster) 하나로
  // 원자적으로 처리한다 — 클라이언트가 localStorage 등으로 만료시각을 직접 조작해서 아이템 없이도
  // 버프를 위조하는 것을 막기 위함 (profiles.combo_booster_expires_at은 이 RPC로만 설정 가능).
  const handleUsePointBoosterTicket = async () => {
    const currentQty = inventory['item_point_booster'] || 0;
    if (currentQty < 1) return;

    const { data, error } = await supabase.rpc('activate_combo_booster', { user_id_param: userId });

    if (error || !data) {
      showNoticeModal({
        title: '사용 실패',
        message: `콤보 부스터 사용에 실패했습니다: ${error?.message || '보유 수량을 확인해 주세요.'}`,
        badge: '오류',
        icon: '⚠️',
      });
      return;
    }

    setInventory(prev => ({ ...prev, item_point_booster: currentQty - 1 }));
    window.dispatchEvent(new Event('reviewnote_inventory_updated'));

    showNoticeModal({
      title: '⚡ 콤보 부스터 5배 버프 발동!',
      message: '지금부터 3시간 동안 모든 복습 완료 시 얻는 콤보 포인트를 5배로 획득합니다! 🔥',
      badge: '3시간 5배 버프 발동',
      icon: '⚡',
    });
  };

  // 🎫 UR 확정 뽑기권 사용 — 즉시 UR 등급 아이템 중 하나를 100% 확정으로 지급 (자기 자신은 보상 후보에서 제외)
  const handleUseUrTicket = async () => {
    const currentQty = inventory['item_ur_ticket'] || 0;
    if (currentQty < 1) return;

    const newQty = currentQty - 1;
    const { error } = await supabase
      .from('user_items')
      .update({ quantity: newQty })
      .eq('user_id', userId)
      .eq('item_id', 'item_ur_ticket');

    if (error) {
      showNoticeModal({
        title: '사용 실패',
        message: `UR 확정 뽑기권 사용에 실패했습니다: ${error.message}`,
        badge: '오류',
        icon: '⚠️',
      });
      return;
    }

    setInventory(prev => ({ ...prev, item_ur_ticket: newQty }));

    const urPool = GACHA_ITEMS.filter(g => g.rarity === 'UR' && !g.isLimited && g.id !== 'item_ur_ticket');
    const wonItem = urPool[Math.floor(Math.random() * urPool.length)];
    const isConsumable = wonItem.category === 'SHIELD' || wonItem.category === 'CHARM';
    const alreadyOwned = (inventory[wonItem.id] || 0) > 0;

    if (!isConsumable && alreadyOwned) {
      // 영구 아이템 중복이면 일반 뽑기와 동일하게 희귀도별 점수로 자동 환급
      const refund = getRefundPointsForRarity(wonItem.rarity);
      onDeductPoints(-refund);
      showNoticeModal({
        title: '🎫 UR 확정 뽑기권 사용!',
        message: `${wonItem.icon} ${wonItem.name}\n이미 보유 중인 아이템이라 ${refund}점으로 자동 환급되었습니다!`,
        badge: 'UR 확정 뽑기 (중복 환급)',
        icon: '🎫',
      });
    } else {
      await addItemsToInventory([wonItem]);
      showNoticeModal({
        title: '🎫 UR 확정 뽑기권 사용!',
        message: `${wonItem.icon} ${wonItem.name}\n을(를) 획득했습니다!`,
        badge: 'UR 확정 뽑기',
        icon: '🎫',
      });
    }

    window.dispatchEvent(new Event('reviewnote_inventory_updated'));
  };

  // 🎫 SSR 확정 뽑기권 사용 — 즉시 SSR 등급 아이템 중 하나를 100% 확정으로 지급 (자기 자신은 보상 후보에서 제외)
  const handleUseSsrTicket = async () => {
    const currentQty = inventory['item_ssr_ticket'] || 0;
    if (currentQty < 1) return;

    const newQty = currentQty - 1;
    const { error } = await supabase
      .from('user_items')
      .update({ quantity: newQty })
      .eq('user_id', userId)
      .eq('item_id', 'item_ssr_ticket');

    if (error) {
      showNoticeModal({
        title: '사용 실패',
        message: `SSR 확정 뽑기권 사용에 실패했습니다: ${error.message}`,
        badge: '오류',
        icon: '⚠️',
      });
      return;
    }

    setInventory(prev => ({ ...prev, item_ssr_ticket: newQty }));

    const ssrPool = GACHA_ITEMS.filter(g => g.rarity === 'SSR' && !g.isLimited && g.id !== 'item_ssr_ticket');
    const wonItem = ssrPool[Math.floor(Math.random() * ssrPool.length)];
    const isConsumable = wonItem.category === 'SHIELD' || wonItem.category === 'CHARM';
    const alreadyOwned = (inventory[wonItem.id] || 0) > 0;

    if (!isConsumable && alreadyOwned) {
      const refund = getRefundPointsForRarity(wonItem.rarity);
      onDeductPoints(-refund);
      showNoticeModal({
        title: '🎫 SSR 확정 뽑기권 사용!',
        message: `${wonItem.icon} ${wonItem.name}\n이미 보유 중인 아이템이라 ${refund}점으로 자동 환급되었습니다!`,
        badge: 'SSR 확정 뽑기 (중복 환급)',
        icon: '🎫',
      });
    } else {
      await addItemsToInventory([wonItem]);
      showNoticeModal({
        title: '🎫 SSR 확정 뽑기권 사용!',
        message: `${wonItem.icon} ${wonItem.name}\n을(를) 획득했습니다!`,
        badge: 'SSR 확정 뽑기',
        icon: '🎫',
      });
    }

    window.dispatchEvent(new Event('reviewnote_inventory_updated'));
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

  // ⚡ 콤보 부스터 잔여 시간 계산 (App.tsx가 서버 profiles.combo_booster_expires_at에서 전달한 값 기준)
  const getBoosterRemainingTimeStr = () => {
    if (!comboBoosterExpiresAt) return null;
    const expiresAt = new Date(comboBoosterExpiresAt).getTime();
    if (isNaN(expiresAt) || Date.now() >= expiresAt) return null;

    const remainingMs = expiresAt - Date.now();
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours > 0 ? `${hours}시간 ` : ''}${mins}분 남음`;
  };

  const boosterRemainingStr = getBoosterRemainingTimeStr();

  return (
    <div ref={rootRef} className="rn-store flex-1 flex flex-col min-h-full pb-6 animate-fade-in">
      {/* 캔버스 파티클 레이어 */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />

      <header className="rn-store-header">
        <div>
          <p className="rn-eyebrow">REWARDS / 나를 위한 작은 보상</p>
          <h2 className="rn-title">럭키 상점</h2>
          <p className="rn-caption">꾸준히 쌓은 복습을, 나만의 컬렉션으로.</p>
        </div>
        <div className="rn-store-wallet">
          <div><span className="rn-caption">보유 콤보 점수</span><strong>{userPoints.toLocaleString()}<small>점</small></strong></div>
          <button onClick={() => window.dispatchEvent(new CustomEvent('reviewnote_open_store_guide'))} className="rn-button rn-button-secondary" title="럭키상점 활용법 가이드 열기">이용 가이드</button>
          {boosterRemainingStr && <p className="rn-store-booster">⚡ 5배 부스터 · {boosterRemainingStr}</p>}
          {cheerLine && <p className="rn-store-cheer">{cheerLine}</p>}
        </div>
      </header>

      <nav className="rn-store-tabs" aria-label="럭키 상점 메뉴">
        {([
          ['draw', '보물 뽑기'], ['synthesis', '아이템 합성'],
          ['inventory', '내 보물가방'], ['catalog', '수집 도감'],
        ] as const).map(([tab, label]) => (
          <button key={tab} type="button" aria-current={activeSubTab === tab ? 'page' : undefined} onClick={() => setActiveSubTab(tab)} className={`rn-store-tab ${activeSubTab === tab ? 'is-active' : ''}`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="rn-store-progress">
        <span>나의 컬렉션</span>
        <progress aria-label="아이템 수집 진행" value={unlockedItemIds.length} max={GACHA_ITEMS.length} />
        <strong>{inventoryLoading ? '확인 중' : `${unlockedItemIds.length} / ${GACHA_ITEMS.length}`}</strong>
      </div>

      <div className="rn-store-content flex-1">
        {activeSubTab === 'draw' && (
          <div className="rn-store-draw">
            <section className="rn-store-hero">
              <div className="rn-store-hero-copy">
                <p className="rn-eyebrow">TODAY’S LITTLE LUCK</p>
                <h3>꾸준함이 쌓여,<br />나만의 보물로.</h3>
                <p>스탬프, 칭호, 테마로<br />나의 학습 공간을 채워보세요.</p>
                <span className="rn-store-availability">{!freeDrawStatusLoaded ? '무료 혜택 확인 중' : canFreeDraw1 ? '오늘의 무료 보상이 기다려요' : '내일 새로운 무료 보상을 만나요'}</span>
              </div>
              <div className="rn-store-chest" aria-hidden="true"><span>🧰</span><small>LUCKY COLLECTION</small></div>
              <div className="rn-store-draw-actions">
                <button type="button" disabled={!freeDrawStatusLoaded || isDrawing} onClick={() => handleStartDraw(1, canFreeDraw1)} className="rn-store-draw-primary">
                  <span>{!freeDrawStatusLoaded ? '혜택 확인 중…' : canFreeDraw1 ? '오늘의 무료 1회 열기' : '보물상자 1회 열기'}</span>
                  <small>{!freeDrawStatusLoaded ? '잠시 기다려주세요' : canFreeDraw1 ? '매일 한 번, 무료' : '10점'}</small>
                </button>
                <button type="button" disabled={!freeDrawStatusLoaded || isDrawing} onClick={() => handleStartDraw(10, canFreeDraw10)} className="rn-store-draw-secondary">
                  <span>{canFreeDraw10 ? '무료 10연속 열기' : '10회 연속 열기'}</span>
                  <small>{!freeDrawStatusLoaded ? '혜택 확인 중' : canFreeDraw10 ? `무료 혜택 ${freeDraw10Remaining}회 남음` : '70점 · 30% 할인'}</small>
                </button>
              </div>
            </section>

            {/* 확률 표 안내 */}
            <div className="rn-store-odds rn-surface p-5 space-y-3 text-xs">
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
            <div className="rn-store-feed rn-surface p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-black text-amber-300 flex items-center space-x-1.5 uppercase tracking-wider">
                  <span>🎉</span>
                  <span>함께 모으는 보물</span>
                </h3>
                <span className="text-[9.5px] text-slate-500 font-bold">라이브 피드</span>
              </div>

              {recentLogs.length === 0 ? (
                <div className="rn-empty text-center py-6 text-sm">
                  아직 SR 이상 희귀 보물 획득 소식이 없습니다. 럭키 행운의 주인공이 되어보세요! ✨
                </div>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map(log => {
                    const userName = log.user_name || '학생';
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

        {/* TAB 1.5: 🔮 보물 합성 (UR / SSR 2->1 합성) */}
        {activeSubTab === 'synthesis' && (
          <ItemSynthesisPanel
            userId={userId || ''}
            inventory={inventory}
            onInventoryUpdate={loadInventory}
          />
        )}

        {/* TAB 2: 🎒 내 보물가방 (획득한 아이템 장착) */}
        {activeSubTab === 'inventory' && (
          <div className="rn-store-collection space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 flex items-center space-x-2">
              <span>🎒 보유 아이템 및 착용 상태</span>
            </h3>

            {/* 현재 장착된 아이템 요약 카드 */}
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 space-y-2.5 shadow-lg">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider block">현재 장착된 설정</span>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">스탬프</span>
                  <span className="text-amber-300 font-extrabold flex items-center">
                    {equippedItems.stamp === '🐾' ? <CatPawIcon className="w-5 h-5" /> : (equippedItems.stamp || '기존 O 스탬프')}
                  </span>
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
                  <span className="text-purple-400 font-extrabold">{equippedItems.aiVoice || `기본 ${aiPersonaName || '밤티'} 쌤`}</span>
                </div>
              </div>
            </div>

            {inventoryLoading ? (
              <div className="rn-skeleton h-32" role="status" aria-label="보물가방 불러오는 중"><span className="sr-only">보물가방 불러오는 중</span></div>
            ) : unlockedItemIds.length === 0 ? (
              <div className="rn-empty text-center py-8 text-sm">
                <p>🎒 보물가방이 비어있어요!</p>
                <p className="text-xs mt-1">보물 뽑기에서 첫 번째 컬렉션을 만나보세요.</p>
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
                        <div className="relative flex-none flex items-center justify-center">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-full object-cover border border-amber-400/60 shadow" />
                          ) : item.icon === '🐾' ? (
                            <CatPawIcon className="w-7 h-7" />
                          ) : (
                            <span className="text-3xl">{item.icon}</span>
                          )}
                          {item.category === 'SHIELD' && qty > 1 && (
                            <span className="absolute -top-1 -right-1 text-[9px] bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center font-black">
                              {qty}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded bg-gradient-to-r ${item.color} ${getRarityBadgeTextColor(item.rarity)}`}>
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

                      {item.category === 'SHIELD' && item.id === 'item_ai_name_change' && onUseAiNameChangeTicket && (
                        <button
                          onClick={onUseAiNameChangeTicket}
                          className="px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all bg-amber-600 text-white hover:bg-amber-500"
                        >
                          사용하기
                        </button>
                      )}

                      {item.category === 'SHIELD' && item.id === 'item_homework_exempt' && (
                        <button
                          onClick={handleUseHomeworkExemptTicket}
                          className="px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950 hover:brightness-110"
                        >
                          사용하기
                        </button>
                      )}

                      {item.category === 'SHIELD' && item.id === 'item_point_booster' && (
                        <button
                          onClick={handleUsePointBoosterTicket}
                          className="px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 hover:brightness-110 shadow"
                        >
                          사용하기
                        </button>
                      )}

                      {item.category === 'SHIELD' && item.id === 'item_ur_ticket' && (
                        <button
                          onClick={handleUseUrTicket}
                          className="px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 text-slate-950 hover:brightness-110 shadow"
                        >
                          사용하기
                        </button>
                      )}

                      {item.category === 'SHIELD' && item.id === 'item_ssr_ticket' && (
                        <button
                          onClick={handleUseSsrTicket}
                          className="px-3 py-1.5 rounded-xl text-[10px] font-black flex-none transition-all bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 hover:brightness-110 shadow"
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
          <div className="rn-store-collection space-y-4">
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
                    <div className="text-3xl flex-none select-none flex items-center justify-center">
                      {isUnlocked ? (
                        item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-full object-cover border border-amber-400/60 shadow" />
                        ) : item.icon === '🐾' ? (
                          <CatPawIcon className="w-7 h-7" />
                        ) : (
                          item.icon
                        )
                      ) : (
                        '❓'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded flex-none ${isUnlocked ? `bg-gradient-to-r ${item.color} ${getRarityBadgeTextColor(item.rarity)}` : 'bg-slate-800 text-slate-400'}`}>
                          {item.rarity}
                        </span>
                        {item.isLimited && (
                          <span className="text-[8.5px] font-extrabold px-1.5 py-0.2 rounded bg-red-950/80 text-rose-300 border border-rose-500/40 flex-none animate-pulse">
                            🔒 한정판
                          </span>
                        )}
                        <span className="text-[8.5px] font-extrabold px-1.5 py-0.2 rounded bg-slate-800/90 text-slate-300 border border-slate-700/60 flex-none">
                          {catLabel}
                        </span>
                        <h4 className="text-xs font-black truncate">{isUnlocked ? item.name : '미해금 보물'}</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 truncate">
                        {isUnlocked ? item.description : '뽑기를 통해 보물을 해금해보세요.'}
                      </p>
                      {/* 칭호 아이템은 헤더에 실제로 장착됐을 때와 동일한 스타일로 미리보기를 보여줌 */}
                      {isUnlocked && item.category === 'TITLE' && item.effectValue && (() => {
                        const badge = getTitleBadgeStyle(item.effectValue);
                        return (
                          <div className="mt-1.5">
                            <span className={`text-[9px] px-2 py-0.5 rounded-full border inline-flex items-center space-x-1 ${badge.style}`}>
                              <span>{badge.icon}</span>
                              <span>{item.effectValue}</span>
                            </span>
                          </div>
                        );
                      })()}
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

                  <span className="text-6xl relative z-10 animate-bounce flex items-center justify-center">
                    {drawnItemsResult[currentResultIndex].icon === '🐾'
                      ? <CatPawIcon className="w-14 h-14" />
                      : drawnItemsResult[currentResultIndex].icon}
                  </span>

                  <div className="flex items-center space-x-1.5 justify-center flex-wrap gap-y-1 relative z-10">
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${getRarityBadgeTextColor(drawnItemsResult[currentResultIndex].rarity)} bg-gradient-to-r ${drawnItemsResult[currentResultIndex].color}`}>
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

      {/* 🔮 최초 1회 보물 연성 합성 안내 모달 */}
      {showSynthesisNotice && (
        <div className="fixed inset-0 z-50 bg-slate-955/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in text-center relative overflow-hidden">
            {/* 오로라 글로우 배경 */}
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

            {/* 헤더 아이콘 */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-purple-500/30">
              🔮
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 inline-block">
                NEW FEATURE
              </span>
              <h3 className="text-lg font-black text-white">보물 연성 합성 시스템 오픈!</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 text-left">
              잠자고 있는 중복 보물 2개를 합쳐서 <strong className="text-purple-300">상위 등급(UR / SSR) 보물 1개</strong>로 새로 연성할 수 있습니다!
              <br /><br />
              상점의 <strong className="text-amber-400">[🔮 합성!]</strong> 서브 탭에서 지금 바로 연성해 보세요!
            </p>

            <button
              onClick={() => closeSynthesisNotice(true)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-black text-sm hover:from-purple-400 hover:to-indigo-500 transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2"
            >
              <span>🔮 보물 합성하러 가기</span>
            </button>

            <button
              onClick={() => closeSynthesisNotice(false)}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-300 transition-colors block mx-auto underline pt-1"
            >
              다음에 보기
            </button>
          </div>
        </div>
      )}

      {/* 🔔 커스텀 알림 모달 */}
      <CustomNoticeModal
        notice={noticeModal}
        onClose={closeNoticeModal}
      />
    </div>
  );
};
