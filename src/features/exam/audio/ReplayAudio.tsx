import { useCallback, useEffect, useRef, useState } from 'react';
import type { SolutionAudioClip } from '../contract';
import { clipPosition } from './audioMath';

/** 하나의 오디오 요소를 재사용하여 사용자가 누른 음성 허용 동작을 다음 클립에도 유지한다. */
export function ReplayAudio({ clips, time, playing, speed, shift }: {
  clips: SolutionAudioClip[]; time: number; playing: boolean; speed: number; shift: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const clipRef = useRef<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [notice, setNotice] = useState('');
  const sync = useCallback((soundMuted = muted) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clip = [...clips].reverse().find(candidate => clipPosition(candidate, time, shift).active);
    audio.muted = soundMuted;
    audio.playbackRate = speed;
    if (!clip) { audio.pause(); return; }
    if (!audio.canPlayType(clip.mime)) {
      audio.pause(); setNotice('이 기기에서는 이 음성 형식을 재생할 수 없어요.'); return;
    }
    if (!clip.url) { audio.pause(); setNotice('음성을 불러오지 못했어요. 풀이를 다시 열어 주세요.'); return; }
    const changed = clipRef.current !== clip.id;
    if (changed) { audio.pause(); clipRef.current = clip.id; audio.src = clip.url; audio.load(); }
    const position = clipPosition(clip, time, shift).seconds;
    if (audio.readyState > 0 && (changed || !playing || Math.abs(audio.currentTime - position) > .35)) audio.currentTime = position;
    if (playing && audio.paused) {
      void audio.play().catch(() => { setNotice('음성 재생을 허용하려면 소리 버튼을 다시 눌러 주세요.'); });
    } else if (!playing) audio.pause();
  }, [clips, time, playing, speed, shift, muted]);
  useEffect(() => { sync(); }, [sync]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && clips.some(clip => !audio.canPlayType(clip.mime))) setNotice('이 기기에서는 일부 음성 형식을 재생할 수 없어요.');
    return () => { audio?.pause(); };
  }, [clips]);
  return <span className="exam-replay-audio" data-testid="exam-replay-audio" data-muted={muted ? 'true' : 'false'}>
    <audio ref={audioRef} preload="metadata" muted={muted} data-testid="exam-audio-player" onLoadedMetadata={() => sync()}
      onError={() => setNotice('음성을 재생하지 못했어요. 연결을 확인하고 풀이를 다시 열어 주세요.')} />
    <button type="button" className="exam-tool exam-tool-text exam-audio-toggle" data-testid="exam-audio-sound" aria-pressed={!muted}
      onClick={() => { const next = !muted; setMuted(next); setNotice(''); sync(next); }}>
      {muted ? '🔇 해설을 들으려면 탭하세요' : '🔊 해설 소리 켜짐'}
    </button>
    {notice && <span role="status" className="exam-peer-note">{notice}</span>}
  </span>;
}
