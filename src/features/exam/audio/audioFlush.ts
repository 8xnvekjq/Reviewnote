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
