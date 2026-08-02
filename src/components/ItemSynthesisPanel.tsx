import React, { useState } from 'react';
import { GACHA_ITEMS, getRarityTheme } from '../utils/gachaCatalog';
import { supabase } from '../services/supabase';
import { CustomNoticeModal, type NoticeModalState } from './CustomNoticeModal';

interface ItemSynthesisPanelProps {
  userId: string;
  inventory: Record<string, number>;
  onInventoryUpdate: () => void;
}

export const ItemSynthesisPanel: React.FC<ItemSynthesisPanelProps> = ({
  userId,
  inventory,
  onInventoryUpdate,
}) => {
  // 선택된 합성 등급 (UR | SSR)
  const [selectedRarity, setSelectedRarity] = useState<'UR' | 'SSR'>('UR');

  // 선택된 2개 재료 슬롯 (item_id string 또는 null)
  const [slot1, setSlot1] = useState<string | null>(null);
  const [slot2, setSlot2] = useState<string | null>(null);

  // 합성 연출 / 진행 중 상태
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // 알림 모달 상태
  const [noticeModal, setNoticeModal] = useState<NoticeModalState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showNoticeModal = (info: Omit<NoticeModalState, 'isOpen'>) => {
    setNoticeModal({
      isOpen: true,
      ...info,
    });
  };

  const closeNoticeModal = () => {
    setNoticeModal((prev) => ({ ...prev, isOpen: false }));
  };

  // 등급 변경 시 슬롯 초기화
  const handleRarityChange = (rarity: 'UR' | 'SSR') => {
    setSelectedRarity(rarity);
    setSlot1(null);
    setSlot2(null);
  };

  // 해당 등급(UR 또는 SSR)의 전체 아이템 목록
  const targetRarityItems = GACHA_ITEMS.filter((g) => g.rarity === selectedRarity);

  // 보유 중인 해당 등급 아이템 목록 (quantity >= 1)
  const ownedRarityItems = targetRarityItems.filter((g) => (inventory[g.id] || 0) > 0);

  // 슬롯에 아이템 담기 / 빼기
  const handleSelectMaterial = (itemId: string) => {
    // 이미 슬롯 1에 있으면 제거
    if (slot1 === itemId) {
      setSlot1(null);
      return;
    }
    // 이미 슬롯 2에 있으면 제거
    if (slot2 === itemId) {
      setSlot2(null);
      return;
    }

    // 슬롯 1이 비어 있으면 1번 슬롯에 넣기
    if (!slot1) {
      setSlot1(itemId);
      return;
    }

    // 슬롯 1이 차있고 같은 아이템인 경우 보유 수량이 2개 이상일 때만 슬롯 2에도 가능
    if (slot1 === itemId) {
      const qty = inventory[itemId] || 0;
      if (qty >= 2) {
        setSlot2(itemId);
      } else {
        showNoticeModal({
          title: '수량 부족',
          message: '이 아이템은 1개만 보유하고 있어 중복 선택할 수 없습니다.',
          badge: '합성 안내',
          icon: '⚠️',
        });
      }
      return;
    }

    // 슬롯 2가 비어있으면 2번 슬롯에 넣기
    if (!slot2) {
      setSlot2(itemId);
      return;
    }

    // 2개 다 차있으면 2번 슬롯 교체
    setSlot2(itemId);
  };

  // 🔮 합성 실행 핸들러
  const handleExecuteSynthesis = async () => {
    if (!slot1 || !slot2) {
      showNoticeModal({
        title: '재료 부족',
        message: `${selectedRarity} 등급 재료 아이템 2개를 선택해 주세요!`,
        badge: '합성 안내',
        icon: '🔮',
      });
      return;
    }

    // 수량 검증
    const qty1 = inventory[slot1] || 0;
    const qty2 = inventory[slot2] || 0;

    if (slot1 === slot2 && qty1 < 2) {
      showNoticeModal({
        title: '수량 부족',
        message: '동일한 아이템을 합성하려면 최소 2개를 보유해야 합니다.',
        badge: '합성 안내',
        icon: '⚠️',
      });
      return;
    }

    if (qty1 < 1 || qty2 < 1) {
      showNoticeModal({
        title: '수량 부족',
        message: '선택한 재료 아이템의 수량이 부족합니다.',
        badge: '합성 안내',
        icon: '⚠️',
      });
      return;
    }

    // 제외 목록: 슬롯 1, 슬롯 2의 아이템 ID
    const excludedIds = new Set([slot1, slot2]);

    // 결과 후보군: 선택 등급 아이템 중 슬롯 1, 2를 제외한 아이템들
    let candidates = targetRarityItems.filter((g) => !excludedIds.has(g.id));

    // 혹시라도 후보군이 비어있으면 (예: 전체 등급 아이템 수가 2개 이하인 극단적 케이스) 전체 중 랜덤
    if (candidates.length === 0) {
      candidates = targetRarityItems;
    }

    // 1개 랜덤 추첨!
    const resultItem = candidates[Math.floor(Math.random() * candidates.length)];

    try {
      setIsSynthesizing(true);

      // 연출 대기 1.5초
      await new Promise((res) => setTimeout(res, 1500));

      // DB 처리 1: 슬롯 1 수량 1 차감
      const newQty1 = qty1 - 1;
      const { error: err1 } = await supabase
        .from('user_items')
        .update({ quantity: newQty1 })
        .eq('user_id', userId)
        .eq('item_id', slot1);

      if (err1) throw err1;

      // DB 처리 2: 슬롯 2 수량 1 차감 (슬롯1 != 슬롯2 인 경우)
      if (slot1 !== slot2) {
        const newQty2 = qty2 - 1;
        const { error: err2 } = await supabase
          .from('user_items')
          .update({ quantity: newQty2 })
          .eq('user_id', userId)
          .eq('item_id', slot2);

        if (err2) throw err2;
      } else {
        // 동일 아이템인 경우 1개 더 차감 (총 2개 차감)
        const finalQty = qty1 - 2;
        await supabase
          .from('user_items')
          .update({ quantity: finalQty })
          .eq('user_id', userId)
          .eq('item_id', slot1);
      }

      // DB 처리 3: 획득 결과 아이템 수량 1 증가 (RPC 또는 upsert)
      const currentResultQty = inventory[resultItem.id] || 0;
      if (currentResultQty === 0) {
        await supabase.from('user_items').insert({
          user_id: userId,
          item_id: resultItem.id,
          quantity: 1,
        });
      } else {
        await supabase
          .from('user_items')
          .update({ quantity: currentResultQty + 1 })
          .eq('user_id', userId)
          .eq('item_id', resultItem.id);
      }

      // DB 처리 4: 전광판 피드(gacha_logs) 등록
      try {
        await supabase.from('gacha_logs').insert({
          user_id: userId,
          item_id: resultItem.id,
          item_name: `[🔮합성] ${resultItem.name}`,
          item_icon: resultItem.icon,
          rarity: resultItem.rarity,
        });
      } catch (e) {
        console.error('전광판 등록 실패:', e);
      }

      // 인벤토리 동기화 및 슬롯 리셋
      setSlot1(null);
      setSlot2(null);
      onInventoryUpdate();

      // 결과 축하 모달 표출
      showNoticeModal({
        title: `🎉 ${resultItem.rarity} 연성 성공!`,
        message: `재료 2개를 연성하여 새로운 보물을 획득했습니다!\n\n✨ [${resultItem.name}]\n${resultItem.description}`,
        badge: `${resultItem.rarity} 합성 연성`,
        icon: resultItem.icon,
      });
    } catch (err: any) {
      console.error('합성 처리 실패:', err);
      showNoticeModal({
        title: '합성 실패',
        message: err.message || '연성 처리 중 오류가 발생했습니다.',
        badge: '오류',
        icon: '⚠️',
      });
    } finally {
      setIsSynthesizing(false);
    }
  };

  const item1Obj = GACHA_ITEMS.find((g) => g.id === slot1);
  const item2Obj = GACHA_ITEMS.find((g) => g.id === slot2);

  return (
    <div className="space-y-6 max-w-lg mx-auto p-4 animate-fade-in">
      {/* ── 상단 타이틀 안내 바 ────────────────────────────── */}
      <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-amber-950/60 border border-purple-500/30 p-5 rounded-3xl shadow-xl text-center space-y-2">
        <span className="text-3xl block animate-bounce">🔮</span>
        <h3 className="text-base font-black text-white flex items-center justify-center space-x-2">
          <span>연금술사의 고대의 연성진</span>
        </h3>
        <p className="text-[11.5px] text-slate-300 leading-relaxed px-2">
          동일 등급 아이템 2개를 연성진에 넣으면, <strong>넣은 2개를 제외한 나머지 {selectedRarity} 아이템</strong> 중 1개가 연성됩니다!
        </p>

        {/* UR vs SSR 등급 선택 탭 */}
        <div className="flex justify-center space-x-2 pt-2">
          <button
            onClick={() => handleRarityChange('UR')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center space-x-1.5 ${
              selectedRarity === 'UR'
                ? 'bg-gradient-to-r from-amber-400 to-purple-500 text-slate-950 shadow-lg shadow-purple-500/20 scale-105 border border-amber-300'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <span>💎</span>
            <span>UR 연성 (2 ➔ 1)</span>
          </button>
          <button
            onClick={() => handleRarityChange('SSR')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center space-x-1.5 ${
              selectedRarity === 'SSR'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-pink-500/20 scale-105 border border-pink-300'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <span>✨</span>
            <span>SSR 연성 (2 ➔ 1)</span>
          </button>
        </div>
      </div>

      {/* ── 연성진 마법 슬롯 2개 & 결과 화살표 ────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center relative overflow-hidden">
        {/* 마법 이펙트 배경 회전 링 */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-amber-500/5 to-pink-500/5 pointer-events-none" />

        <div className="flex items-center justify-around relative z-10">
          {/* Slot 1 */}
          <div
            onClick={() => slot1 && setSlot1(null)}
            className={`w-28 h-32 rounded-3xl border-2 transition-all flex flex-col items-center justify-center p-2 cursor-pointer shadow-lg group ${
              item1Obj
                ? 'bg-slate-950 border-amber-400/80 shadow-amber-500/20 animate-scale-up'
                : 'bg-slate-955/80 border-dashed border-slate-700 hover:border-purple-400'
            }`}
          >
            {item1Obj ? (
              <>
                <span className="text-3xl mb-1 group-hover:scale-110 transition-transform">
                  {item1Obj.icon}
                </span>
                <span className="text-[10.5px] font-bold text-slate-200 line-clamp-1">
                  {item1Obj.name.replace(/^[^:]+:\s*/, '')}
                </span>
                <span className="text-[8.5px] text-amber-400 font-extrabold mt-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  재료 1 (해제)
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl text-slate-600 mb-1">➕</span>
                <span className="text-[10px] font-bold text-slate-500">슬롯 1 선택</span>
              </>
            )}
          </div>

          {/* Plus / Magic Arrow */}
          <div className="flex flex-col items-center justify-center space-y-1">
            <span className="text-2xl font-black text-amber-400 animate-pulse">➕</span>
          </div>

          {/* Slot 2 */}
          <div
            onClick={() => slot2 && setSlot2(null)}
            className={`w-28 h-32 rounded-3xl border-2 transition-all flex flex-col items-center justify-center p-2 cursor-pointer shadow-lg group ${
              item2Obj
                ? 'bg-slate-955 border-amber-400/80 shadow-amber-500/20 animate-scale-up'
                : 'bg-slate-955/80 border-dashed border-slate-700 hover:border-purple-400'
            }`}
          >
            {item2Obj ? (
              <>
                <span className="text-3xl mb-1 group-hover:scale-110 transition-transform">
                  {item2Obj.icon}
                </span>
                <span className="text-[10.5px] font-bold text-slate-200 line-clamp-1">
                  {item2Obj.name.replace(/^[^:]+:\s*/, '')}
                </span>
                <span className="text-[8.5px] text-amber-400 font-extrabold mt-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  재료 2 (해제)
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl text-slate-600 mb-1">➕</span>
                <span className="text-[10px] font-bold text-slate-500">슬롯 2 선택</span>
              </>
            )}
          </div>
        </div>

        {/* 🔮 연성 실행 버튼 */}
        <button
          onClick={handleExecuteSynthesis}
          disabled={!slot1 || !slot2 || isSynthesizing}
          className={`w-full py-3.5 rounded-2xl font-black text-xs transition-all flex items-center justify-center space-x-2 shadow-xl ${
            slot1 && slot2 && !isSynthesizing
              ? 'bg-gradient-to-r from-amber-400 via-purple-500 to-pink-500 hover:from-amber-350 hover:to-pink-400 text-slate-950 shadow-purple-500/30 scale-100 active:scale-95 animate-pulse'
              : 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
          }`}
        >
          {isSynthesizing ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>고대의 마법 연성 진행 중...</span>
            </>
          ) : (
            <>
              <span>🔮</span>
              <span>
                {selectedRarity} 아이템 2개 ➔ 제외된 {selectedRarity} 1개 랜덤 연성 실행!
              </span>
            </>
          )}
        </button>
      </div>

      {/* ── 내가 보유한 해당 등급(UR/SSR) 재료선택 리스트 ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-black text-slate-300 flex items-center space-x-1.5">
            <span>🎒 연성 재료로 사용할 내 {selectedRarity} 보물 목록</span>
            <span className="text-[10px] text-amber-400 font-extrabold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {ownedRarityItems.length}개 보유 중
            </span>
          </h4>
          <span className="text-[10px] text-slate-500 font-bold">카드를 터치하여 슬롯에 담으세요</span>
        </div>

        {ownedRarityItems.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center text-xs text-slate-500 space-y-2">
            <span className="text-3xl block">📦</span>
            <p>보유 중인 {selectedRarity} 등급 보물이 없습니다.</p>
            <p className="text-[11px] text-slate-600">
              럭키 상점에서 복습 콤보 점수로 뽑기를 진행하여 {selectedRarity} 보물을 모아보세요!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {ownedRarityItems.map((item) => {
              const qty = inventory[item.id] || 0;
              const isSelectedSlot1 = slot1 === item.id;
              const isSelectedSlot2 = slot2 === item.id;
              const isSelected = isSelectedSlot1 || isSelectedSlot2;
              const rarityTheme = getRarityTheme(item.rarity);

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectMaterial(item.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center space-x-2.5 shadow-md relative overflow-hidden group ${
                    isSelected
                      ? 'bg-slate-900 border-amber-400 ring-2 ring-amber-400/40'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xl flex-none group-hover:scale-105 transition-transform">
                    {item.icon}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center space-x-1">
                      <span className={`text-[8px] font-black px-1.5 py-0.2 rounded border ${rarityTheme.badge} ${rarityTheme.textColor} ${rarityTheme.border}`}>
                        {item.rarity}
                      </span>
                      <span className="text-[9px] text-amber-400 font-extrabold flex-none">
                        x{qty}개
                      </span>
                    </div>
                    <h5 className="text-[11px] font-extrabold text-slate-200 truncate group-hover:text-white">
                      {item.name.replace(/^[^:]+:\s*/, '')}
                    </h5>
                  </div>

                  {/* Slot check indicator */}
                  {isSelected && (
                    <span className="absolute top-2 right-2 text-[9px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded-full shadow">
                      {isSelectedSlot1 && isSelectedSlot2 ? '슬롯1,2' : isSelectedSlot1 ? '슬롯1' : '슬롯2'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🔔 알림 모달 */}
      <CustomNoticeModal notice={noticeModal} onClose={closeNoticeModal} />
    </div>
  );
};
