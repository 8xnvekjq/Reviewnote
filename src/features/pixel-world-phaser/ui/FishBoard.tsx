import { useEffect, useState } from 'react';
import { PEER_ANIMAL_FACES, peerSolutionLabelParts } from '../../exam/ui/peerSolution';
import { fishById } from '../logic/fishCatalog';
import type { ClassFishBoard, FishingAdapter } from './fishingAdapter';
import { FishIcon } from './FishAlbum';
import { Window } from './GamePanels';

export function fishBoardFace(animal: string): string {
  return (PEER_ANIMAL_FACES as readonly string[]).includes(animal) ? animal : peerSolutionLabelParts({ character: animal, title: null, grade: null, isTeacher: false }).face;
}
export function fishRelativeTime(caughtAt: string, now = Date.now()): string {
  const timestamp = Date.parse(caughtAt);
  if (!Number.isFinite(timestamp)) return '이번 주';
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
  return minutes < 1 ? '방금' : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`;
}
export function FishBoard({ adapter, onClose }: { adapter?: FishingAdapter; onClose: () => void }) {
  const [board, setBoard] = useState<ClassFishBoard | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let cancelled = false;
    setBoard(null); setError(false);
    if (adapter) void adapter.board().then(value => { if (!cancelled) setBoard(value); }).catch(() => { if (!cancelled) setError(true); });
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [adapter, retry]);
  // 같은 종이 중복되더라도 가장 큰 한 마리만 보여 준다.
  const rows = [...(board?.rows ?? [])].sort((a, b) => b.lengthCm - a.lengthCm).filter((row, index, all) => all.findIndex(value => value.speciesId === row.speciesId) === index);
  return <Window title="이번 주 우리 반 물고기" onClose={onClose}><div className="pwp-panel-content pwp-fishing-content">
    <p>이번 주에 만난 가장 큰 친구들이에요.</p>
    {!adapter ? <p role="status">낚시 정보를 준비하고 있어요.</p> : error ? <div role="alert">게시판을 불러오지 못했어요. <button onClick={() => setRetry(value => value + 1)}>다시 시도</button></div> : !board ? <p role="status">게시판을 읽는 중…</p> : <>
      <p className="pwp-fish-progress">우리 반이 찾은 물고기 {board.classSpecies}/12</p>
      {!rows.length ? <p>아직 기록이 없어요. 첫 물고기를 기다리고 있어요!</p> : <ul className="pwp-fish-board">{rows.map(row => <li key={row.speciesId} data-species={row.speciesId}>
        <span className="pwp-fish-face" role="img" aria-label="익명 동물 얼굴">{fishBoardFace(row.animal)}</span><FishIcon speciesId={row.speciesId}/>
        <strong>{fishById(row.speciesId)?.name ?? '물고기'}</strong><span className="pwp-fish-length">{row.lengthCm.toFixed(1)}cm</span><time dateTime={row.caughtAt}>{fishRelativeTime(row.caughtAt, now)}</time>
      </li>)}</ul>}
    </>}
  </div></Window>;
}
