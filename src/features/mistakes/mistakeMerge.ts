// 오답노트 실시간 동기화: 바뀐 줄만 반영하는 순수 함수(useMistakes에서 쓴다).
/** 실시간으로 바뀐 줄만 반영: ids 중 rows에 없는 것은 지워진(또는 볼 수 없게 된) 줄, 새 줄은 날짜 순 자리에. */
export function mergeChangedMistakes<T extends { id: string; date?: string }>(prev: T[], ids: string[], rows: Map<string, T>): T[] {
  const kept = prev.filter(m => !ids.includes(m.id) || rows.has(m.id)).map(m => rows.get(m.id) ?? m);
  const added = [...rows.values()].filter(entry => !prev.some(m => m.id === entry.id));
  if (!added.length) return kept;
  return [...added, ...kept].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
