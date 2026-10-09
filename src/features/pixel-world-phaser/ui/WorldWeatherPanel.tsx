import { useState } from 'react';
import { Window } from './GamePanels';
import type { FishingAdapter, FishPhase, FishWeather } from './fishingAdapter';
import type { ServerWorldClock } from '../logic/worldClock';

const WEATHER = [['', '자동'], ['clear', '☀ 맑음'], ['cloudy', '☁ 흐림'], ['rain', '🌧 비']] as const;
const PHASE = [['', '자동'], ['morning', '아침'], ['day', '낮'], ['evening', '저녁'], ['night', '밤']] as const;
export function WorldWeatherPanel({ adapter, clock, refresh, onClose }: { adapter?: FishingAdapter; clock: ServerWorldClock | null; refresh: () => Promise<void>; onClose: () => void }) {
  const [weather, setWeather] = useState<FishWeather | ''>(clock?.override?.weather ?? '');
  const [phase, setPhase] = useState<FishPhase | ''>(clock?.override?.phase ?? '');
  const [hours, setHours] = useState(3);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const apply = async (reset = false) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const ok = await adapter?.adminSetWorldOverride?.(reset ? null : weather || null, reset ? null : phase || null, hours);
      if (!ok) { setMessage('설정을 저장하지 못했어요. 다시 시도해 주세요.'); return; }
      if (reset) { setWeather(''); setPhase(''); }
      await refresh();
      setMessage(reset ? '모두 자동으로 돌아왔어요.' : '모두에게 적용했어요.');
    } catch { setMessage('설정을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const o = clock?.override;
  const expiry = o ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(o.expiresAt)) : '';
  return <Window title="전역 날씨" compact onClose={onClose}>
    <div className="pwp-world-weather" style={{ overflowY: 'auto', display: 'grid', gap: 12 }}>
      <fieldset disabled={busy}><legend>날씨</legend><div className="pwp-tabs">{WEATHER.map(([id, label]) => <button type="button" key={id} aria-pressed={weather === id} onClick={() => setWeather(id)}>{label}</button>)}</div></fieldset>
      <fieldset disabled={busy}><legend>시간대</legend><div className="pwp-tabs" style={{ flexWrap: 'wrap' }}>{PHASE.map(([id, label]) => <button type="button" key={id} aria-pressed={phase === id} onClick={() => setPhase(id)}>{label}</button>)}</div></fieldset>
      <label>유지 시간 <select aria-label="유지 시간" value={hours} disabled={busy} onChange={event => setHours(Number(event.target.value))}><option value={1}>1시간</option><option value={3}>3시간</option><option value={0}>오늘 끝까지</option></select></label>
      <div className="pwp-tabs"><button type="button" disabled={busy || !clock} onClick={() => { void apply(); }}>적용</button><button type="button" disabled={busy} onClick={() => { void apply(true); }}>모두 자동으로</button></div>
      <p role="status">{!clock ? '서버 시계를 확인하는 중…' : o ? `${WEATHER.find(([id]) => id === o.weather)?.[1] ?? '자동'} · ${PHASE.find(([id]) => id === o.phase)?.[1] ?? '자동'} · ${expiry}까지 (한국 시간)` : '날씨와 시간대가 자동이에요.'}</p>
      {message && <p role="status">{message}</p>}
    </div>
  </Window>;
}
