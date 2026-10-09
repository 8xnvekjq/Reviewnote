import { SFX_EVENT } from './sfx';
import type { SoundEffect } from './sfx';
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
 * 첫 사용자 입력이 있을 때 그 핸들러 안에서 만든다(자동재생 정책). `scope`는 방·마당·광장을 모두
 * 감싸는 셸이라, 장면을 오가도 이 훅(=같은 재생기)이 그대로 살아 있다.
 *
 * 잠금 해제는 pointerup/keydown에서 한다 — HTML 표준상 터치의 pointerdown은 사용자 활성화가 아니라
 * (마우스일 때만 인정) 폰에서 pointerdown에 시작하면 컨텍스트가 suspended로 남는다. 그래도 어떤
 * 이유로든 막혔으면 이후 입력마다 ensureRunning()으로 다시 resume을 시도한다.
 */
export function useBgm(scope: RefObject<HTMLElement | null>) {
  const [enabled, setEnabled] = useState(readEnabled);
  const enabledRef = useRef(enabled);
  const playerRef = useRef<PixelBgm | null>(null);
  const unlockedRef = useRef(false);
  // 지금 진행 중인 입력(pointerdown→pointerup→click, 또는 keydown→click)이 잠금 해제로 재생을
  // 시작했는지. 켜짐 저장 상태에서 첫 입력이 🎵 클릭이면 그 클릭은 "재생 시작"이지 끄기가 아니다.
  const startedByThisInputRef = useRef(false);

  // 첫 입력 전에는 재생기(=AudioContext)를 만들지 않는다.
  const player = () => (playerRef.current ??= new PixelBgm());

  useEffect(() => {
    const element = scope.current;
    if (!element) return;
    function beginInput() { startedByThisInputRef.current = false; }
    function unlock() {
      if (unlockedRef.current) { if (enabledRef.current) playerRef.current?.ensureRunning(); return; }
      unlockedRef.current = true;
      if (enabledRef.current) { player().play(); startedByThisInputRef.current = true; }
    }
    function onKeyDown() { beginInput(); unlock(); }
    element.addEventListener('pointerdown', beginInput, true);
    element.addEventListener('pointerup', unlock, true);
    element.addEventListener('keydown', onKeyDown, true);
    return () => {
      element.removeEventListener('pointerdown', beginInput, true);
      element.removeEventListener('pointerup', unlock, true);
      element.removeEventListener('keydown', onKeyDown, true);
    };
  }, [scope]);

  useEffect(() => {
    const play = (event: Event) => { if (enabledRef.current) playerRef.current?.playEffect((event as CustomEvent<SoundEffect>).detail); };
    window.addEventListener(SFX_EVENT, play);
    return () => window.removeEventListener(SFX_EVENT, play);
  }, []);

  useEffect(() => {
    const sync = () => playerRef.current?.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // PixelRoom 언마운트 = Pixel World 퇴장: 정지하고 AudioContext를 닫는다.
  useEffect(() => () => { playerRef.current?.dispose(); playerRef.current = null; }, []);

  // 토글 버튼의 click 핸들러에서 직접 불린다 — 그 자체가 사용자 입력이라 바로 재생해도 된다.
  const toggle = useCallback(() => {
    // 켜짐 저장 상태에서 이 클릭이 첫 입력(같은 입력의 pointerup/keydown에서 막 잠금 해제됐거나,
    // 포인터 이벤트 없이 온 보조기기 클릭)이면 끄지 않고 재생만 시작한다.
    if (enabledRef.current && (startedByThisInputRef.current || !unlockedRef.current)) {
      startedByThisInputRef.current = false;
      unlockedRef.current = true;
      player().play();
      return;
    }
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
