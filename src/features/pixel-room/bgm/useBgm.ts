import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { PixelBgm } from './engine';

// 켜짐/꺼짐만 기기별로 기억한다. 저장소가 막혀 있어도(사생활 모드 등) 음악은 이번 방문 동안만
// 기억 못 할 뿐 앱은 그대로 동작해야 하므로 읽기/쓰기 모두 삼킨다.
export const BGM_STORAGE_KEY = 'pixelWorld:bgm:v1';
function readEnabled(): boolean { try { return window.localStorage.getItem(BGM_STORAGE_KEY) === 'on'; } catch { return false; } }
function writeEnabled(on: boolean) { try { window.localStorage.setItem(BGM_STORAGE_KEY, on ? 'on' : 'off'); } catch { /* 저장 못 해도 이번 세션 토글은 유효 */ } }

/**
 * Pixel World 배경음악. 기본값은 꺼짐. 켜짐으로 저장돼 있어도 AudioContext는 Pixel World 안에서
 * 첫 사용자 입력(pointerdown/keydown)이 있을 때 그 핸들러 안에서 만든다(자동재생 정책). `scope`는
 * 방·마당·광장을 모두 감싸는 셸이라, 장면을 오가도 이 훅(=같은 재생기)이 그대로 살아 있다.
 */
export function useBgm(scope: RefObject<HTMLElement | null>) {
  const [enabled, setEnabled] = useState(readEnabled);
  const enabledRef = useRef(enabled);
  const playerRef = useRef<PixelBgm | null>(null);
  const unlockedRef = useRef(false);

  // 첫 입력 전에는 재생기(=AudioContext)를 만들지 않는다.
  const player = () => (playerRef.current ??= new PixelBgm());

  useEffect(() => {
    const element = scope.current;
    if (!element) return;
    function unlock() {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      if (enabledRef.current) player().play();
    }
    element.addEventListener('pointerdown', unlock, true);
    element.addEventListener('keydown', unlock, true);
    return () => { element.removeEventListener('pointerdown', unlock, true); element.removeEventListener('keydown', unlock, true); };
  }, [scope]);

  useEffect(() => {
    const sync = () => playerRef.current?.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // PixelRoom 언마운트 = Pixel World 퇴장: 정지하고 AudioContext를 닫는다.
  useEffect(() => () => { playerRef.current?.dispose(); playerRef.current = null; }, []);

  // 토글 버튼의 click 핸들러에서 직접 불린다 — 그 자체가 사용자 입력이라 바로 재생해도 된다.
  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    unlockedRef.current = true;
    setEnabled(next);
    writeEnabled(next);
    if (next) {
      const bgm = player();
      bgm.setHidden(document.visibilityState === 'hidden');
      bgm.play();
    } else playerRef.current?.stop();
  }, []);

  return { enabled, toggle };
}
