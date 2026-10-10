import { useEffect, useState } from 'react';
import { peerSolutionLabelParts } from '../../exam/ui/peerSolution';
import { validAnimalFace } from '../../../utils/animalFace';
import { FISH_CATALOG, RARITY_STARS, fishById } from '../logic/fishCatalog';
import type { ClassFishBoard, FishingAdapter } from './fishingAdapter';
import { FishIcon } from './FishAlbum';
import { Window } from './GamePanels';
import { sizeScore } from '../logic/gamePoints';
import type { FishTierChampion } from '../logic/gamePoints';
import './fishAlbum.css';

export function fishSizeLabel(speciesId: string, lengthCm: number): string {
  const fish = fishById(speciesId);
  return fish ? `${sizeScore(lengthCm, fish.minCm, fish.maxCm)}%` : '—';
}
export function sortedChampions(champions: readonly FishTierChampion[]): FishTierChampion[] {
  return [...champions].sort((a, b) => RARITY_STARS[b.rarity] - RARITY_STARS[a.rarity])
    .filter((row, index, all) => all.findIndex(value => value.rarity === row.rarity) === index).slice(0, 5);
}
export function FishChampions({ champions }: { champions: readonly FishTierChampion[] }) {
  return <section className="pwp-fish-champions" aria-label="이번 주 등급별 챔피언">
    <h3>이번 주 등급별 챔피언</h3>
    <p className="pwp-fish-weekly-note">매주 월요일 0시에 지난주 챔피언에게 포인트를 줘요</p>
    {!champions.length ? <p>아직 챔피언이 없어요. 첫 기록을 기다려요!</p> : <ol>{sortedChampions(champions).map(row => <li key={row.rarity} data-rarity={row.rarity} data-teacher={row.teacher || undefined}>
      <span className="pwp-fish-stars" data-rarity={row.rarity} aria-label={`희귀도 ${RARITY_STARS[row.rarity]}별`}>{'★'.repeat(RARITY_STARS[row.rarity])}</span>
      <span className="pwp-fish-face" role="img" aria-label={row.teacher ? '선생님' : '익명 동물 얼굴'}>{fishBoardFace(row.animal)}</span>
      <FishIcon speciesId={row.speciesId} />
      <strong>{fishById(row.speciesId)?.name ?? '물고기'}</strong>
      <span className="pwp-fish-length">{row.lengthCm.toFixed(1)}cm <small>{row.score}%</small></span>
      <span className="pwp-fish-prize">{row.teacher ? '선생님 기록 · 보상 없음' : `${row.reward}P`}</span>
    </li>)}</ol>}
  </section>;
}

export function fishBoardFace(animal: string): string {
  return validAnimalFace(animal) ? animal : peerSolutionLabelParts({ character: animal, title: null, grade: null, isTeacher: false }).face;
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
  return <Window title="이번 주 물고기 랭킹" onClose={onClose}><div className="pwp-panel-content pwp-fishing-content">
    {!adapter ? <p role="status">낚시 정보를 준비하고 있어요.</p> : error ? <div role="alert">게시판을 불러오지 못했어요. <button onClick={() => setRetry(value => value + 1)}>다시 시도</button></div> : !board ? <p role="status">게시판을 읽는 중…</p> : <>
      <FishChampions champions={board.champions ?? []} />
      <p>이번 주에 잡은 가장 큰 물고기 순서예요. 월요일에 새로 시작해요.</p>
      <p className="pwp-fish-progress">우리 반이 찾은 물고기 {board.classSpecies}/{FISH_CATALOG.length}</p>
      {!rows.length ? <p>아직 기록이 없어요. 첫 물고기를 기다리고 있어요!</p> : <ol className="pwp-fish-board">{rows.map((row, index) => <li key={row.speciesId} data-species={row.speciesId} data-teacher={row.teacher || undefined}>
        <span className="pwp-fish-face" role="img" aria-label={row.teacher ? '선생님' : '익명 동물 얼굴'}>{fishBoardFace(row.animal)}</span><FishIcon speciesId={row.speciesId}/>
        <strong><span className="pwp-fish-rank">{index + 1}위</span> {fishById(row.speciesId)?.name ?? '물고기'} <span className="pwp-fish-stars" data-rarity={fishById(row.speciesId)?.rarity}>{'★'.repeat(RARITY_STARS[fishById(row.speciesId)?.rarity ?? 'common'])}</span></strong><span className="pwp-fish-length">{row.lengthCm.toFixed(1)}cm <small>{fishSizeLabel(row.speciesId, row.lengthCm)}</small></span><time dateTime={row.caughtAt}>{fishRelativeTime(row.caughtAt, now)}</time>
      </li>)}</ol>}
    </>}
  </div></Window>;
}
