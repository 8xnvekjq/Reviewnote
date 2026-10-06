export type AudioFlushResult = { ok: boolean; failed: number };

/** 업로드가 멈춰도 제출을 계속할 수 있게 대기 시간을 제한한다. */
export async function waitForAudioUploads(
  flush: () => Promise<AudioFlushResult>,
  continueRequested: Promise<'continue'>,
  timeoutMs = 30000,
): Promise<AudioFlushResult | 'continue'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      flush().catch(() => ({ ok: false, failed: 1 })),
      continueRequested,
      new Promise<AudioFlushResult>(resolve => {
        timer = setTimeout(() => resolve({ ok: false, failed: 1 }), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export type AudioGateState = 'uploading' | 'done' | 'failed';
export interface AudioGateUi {
  /** 진행 창 상태. null이면 창을 닫는다. */
  show: (state: AudioGateState | null) => void;
  /** 업로드 중 "그래도 계속"을 누르면 끝나는 약속. */
  continueRequested: () => Promise<'continue'>;
  /** 실패 뒤 "다시 시도"(true) / "그래도 계속"(false). */
  retryRequested: () => Promise<boolean>;
  /** "음성 업로드 완료!"를 잠깐 보여 준다. */
  pause: () => Promise<void>;
}

/** 제출·선생님 채점해 보기에서 함께 쓰는 음성 업로드 진행 창 흐름(30초 제한, 다시 시도 / 그래도 계속). */
export async function runAudioUploadGate(
  flush: () => Promise<AudioFlushResult>,
  ui: AudioGateUi,
  timeoutMs?: number,
): Promise<'uploaded' | 'skipped'> {
  try {
    for (;;) {
      ui.show('uploading');
      const outcome = await waitForAudioUploads(flush, ui.continueRequested(), timeoutMs);
      if (outcome === 'continue') return 'skipped';
      if (outcome.ok) {
        ui.show('done');
        await ui.pause();
        return 'uploaded';
      }
      ui.show('failed');
      if (!await ui.retryRequested()) return 'skipped';
    }
  } finally { ui.show(null); }
}

/** 선생님이 채점해 보기 전에 그 문항 풀이를 학생에게 공개할 준비: 녹음 멈춤 → 필기 저장 → 녹음 업로드 대기.
 *  필기 저장이 실패해도 채점은 막지 않는다(필기는 계속 다시 저장되고, 저장되는 대로 학생에게 보인다). */
export async function prepareTeacherCheck(steps: {
  stopRecording: () => Promise<void>;
  flushInk: () => Promise<boolean>;
  uploadAudio: () => Promise<'uploaded' | 'skipped'>;
}): Promise<{ inkSaved: boolean; audio: 'uploaded' | 'skipped' }> {
  await steps.stopRecording().catch(() => {});
  const inkSaved = await steps.flushInk().catch(() => false);
  const audio = await steps.uploadAudio();
  return { inkSaved, audio };
}
