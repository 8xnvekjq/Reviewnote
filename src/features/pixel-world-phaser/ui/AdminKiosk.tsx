// 관리자 집 앞 자판기 — 앞마당 문 옆. 학생들의 지식의 조각 현황과 전역 날씨 설정을 한곳에서 본다(관리자만 보인다).
import { useCallback, useEffect, useState } from 'react';
import { Window } from './GamePanels';
import { WeatherControls } from './WeatherControls';
import { KnowledgeShardIcon } from '../../../components/KnowledgeShardIcon';
import { fetchAdminShardBoard, formatShards, type AdminShardBoard } from '../../../utils/knowledgeShards';
import type { FishingAdapter } from './fishingAdapter';
import type { ServerWorldClock } from '../logic/worldClock';

type KioskTab = 'shards' | 'weather';
type SortKey = 'balance' | 'earnedWeek' | 'spent';
const SORTS: readonly (readonly [SortKey, string])[] = [['balance', '보유'], ['earnedWeek', '이번 주'], ['spent', '사용']];

const ago = (iso: string | null) => {
  if (!iso) return '복습 적립 없음';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? `${minutes}분 전` : minutes < 60 * 24 ? `${Math.round(minutes / 60)}시간 전` : `${Math.round(minutes / 60 / 24)}일 전`;
};

export function AdminKiosk({ load = fetchAdminShardBoard, weather, onClose }: {
  load?: () => Promise<AdminShardBoard>;
  weather: { adapter?: FishingAdapter; clock: ServerWorldClock | null; refresh: () => Promise<void> };
  onClose: () => void;
}) {
  const [tab, setTab] = useState<KioskTab>('shards');
  const [board, setBoard] = useState<AdminShardBoard | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortKey>('balance');
  const refresh = useCallback(() => {
    setError(false);
    load().then(setBoard).catch(() => setError(true));
  }, [load]);
  useEffect(() => { refresh(); }, [refresh]);

  const students = [...(board?.students ?? [])].sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name, 'ko'));
  const total = (key: SortKey) => (board?.students ?? []).reduce((sum, s) => sum + s[key], 0);

  return <Window title="관리자 자판기" onClose={onClose}
    top={<nav className="pwp-tabs" aria-label="자판기 메뉴">
      <button type="button" aria-pressed={tab === 'shards'} onClick={() => setTab('shards')}>지식의 조각 현황</button>
      <button type="button" aria-pressed={tab === 'weather'} onClick={() => setTab('weather')}>날씨 관리</button>
    </nav>}>
    <div className="pwp-panel-content pwp-kiosk" data-testid="admin-kiosk">
      {tab === 'weather' ? <WeatherControls adapter={weather.adapter} clock={weather.clock} refresh={weather.refresh} />
        : error ? <div role="alert"><p>조각 현황을 불러오지 못했어요.</p><button type="button" onClick={refresh}>다시 시도</button></div>
        : !board ? <p role="status">조각 현황을 불러오는 중…</p>
        : <>
          <div className="pwp-kiosk-summary">
            <span>학생 <strong>{board.students.length}</strong>명</span>
            <span>이번 주 적립 <strong>{formatShards(total('earnedWeek'))}</strong></span>
            <span>전체 보유 <strong>{formatShards(total('balance'))}</strong></span>
            <button type="button" onClick={refresh}>새로고침</button>
          </div>
          <nav className="pwp-tabs" aria-label="정렬">{SORTS.map(([key, label]) => <button type="button" key={key} aria-pressed={sort === key} onClick={() => setSort(key)}>{label}순</button>)}</nav>
          {students.length === 0 ? <p>아직 조각을 받은 학생이 없어요.</p> : <ol className="pwp-kiosk-list" aria-label="학생별 지식의 조각">
            {students.map(s => <li key={s.userId} data-testid="kiosk-student">
              <strong className="pwp-kiosk-name">{s.name}</strong>
              <span className="pwp-price pwp-shard-price"><KnowledgeShardIcon size={14} />{formatShards(s.balance)}</span>
              <small>이번 주 +{formatShards(s.earnedWeek)} · 사용 {formatShards(s.spent)} · 누적 {formatShards(s.earnedTotal)} · {ago(s.lastEarnedAt)}</small>
            </li>)}
          </ol>}
          <h3 className="pwp-kiosk-heading">최근 조각 사용</h3>
          {board.recentSpends.length === 0 ? <p>아직 조각으로 산 학생이 없어요.</p> : <ul className="pwp-kiosk-list">
            {board.recentSpends.map((s, i) => <li key={`${s.spentAt}:${i}`}><strong className="pwp-kiosk-name">{s.name}</strong><span>{s.item}</span><small>−{formatShards(s.amount)} · {ago(s.spentAt)}</small></li>)}
          </ul>}
        </>}
    </div>
  </Window>;
}
