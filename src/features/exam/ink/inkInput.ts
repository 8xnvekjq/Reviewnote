/** 겹쳐 전달된 coalesced 샘플은 원시 시각으로 거른다. 거리로 버릴 점도 수신 시각은 전진한다. */
export function freshPointerSamples<T extends { timeStamp: number }>(
  event: T & { getCoalescedEvents?: () => T[] }, lastTimeStamp: number,
): { samples: T[]; lastTimeStamp: number } {
  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  const samples: T[] = [];
  for (const sample of coalesced.length ? coalesced : [event]) {
    if (sample.timeStamp <= lastTimeStamp) continue;
    lastTimeStamp = sample.timeStamp;
    samples.push(sample);
  }
  return { samples, lastTimeStamp };
}
