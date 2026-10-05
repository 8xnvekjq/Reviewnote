import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SolutionAudioClip } from '../contract';
import { clipPosition } from './audioMath';

/** 하나의 오디오 요소를 재사용하여 사용자가 누른 음성 허용 동작을 다음 클립에도 유지한다. */
function AudioLane({ clips, time, playing, speed, shift, muted, setNotice }: {
  clips: SolutionAudioClip[]; time: number; playing: boolean; speed: number; shift: number;
  muted: boolean; setNotice: (notice: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const clipRef = useRef<string | null>(null);
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
  }, [clips, time, playing, speed, shift, muted, setNotice]);
  useEffect(() => { sync(); }, [sync]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && clips.some(clip => !audio.canPlayType(clip.mime))) setNotice('이 기기에서는 일부 음성 형식을 재생할 수 없어요.');
    return () => { audio?.pause(); };
  }, [clips, setNotice]);
  return <audio ref={audioRef} preload="metadata" muted={muted} data-testid="exam-audio-player" onLoadedMetadata={() => sync()}
    onError={() => setNotice('음성을 재생하지 못했어요. 연결을 확인하고 풀이를 다시 열어 주세요.')} />;
}

/** 겹치는 녹음은 별도 요소로 끝까지 재생하고, 이어지는 클립은 같은 요소를 재사용한다. */
export function ReplayAudio({ clips, time, playing, speed, shift }: {
  clips: SolutionAudioClip[]; time: number; playing: boolean; speed: number; shift: number;
}) {
  const [muted, setMuted] = useState(true);
  const [notice, setNotice] = useState('');
  const containerRef = useRef<HTMLSpanElement>(null);
  const lanes = useMemo(() => {
    const result: SolutionAudioClip[][] = [];
    for (const clip of [...clips].sort((a, b) => a.offsetMs - b.offsetMs)) {
      const lane = result.find(rows => rows.at(-1)!.offsetMs + rows.at(-1)!.durationMs <= clip.offsetMs);
      if (lane) lane.push(clip); else result.push([clip]);
    }
    return result;
  }, [clips]);
  return <span ref={containerRef} className="exam-replay-audio" data-testid="exam-replay-audio" data-muted={muted ? 'true' : 'false'}>
    {lanes.map((lane, index) => <AudioLane key={index} clips={lane} time={time} playing={playing} speed={speed}
      shift={shift} muted={muted} setNotice={setNotice} />)}
    <button type="button" className="exam-audio-toggle" data-testid="exam-audio-sound" aria-pressed={!muted}
      aria-label={muted ? '소리 켜기' : '소리 끄기'}
      onClick={() => {
        const next = !muted;
        setMuted(next); setNotice('');
        // 소리 허용은 사용자 동작 안에서 모든 녹음 요소에 바로 적용한다.
        containerRef.current?.querySelectorAll('audio').forEach((audio, index) => {
          audio.muted = next;
          if (playing && lanes[index].some(clip => clipPosition(clip, time, shift).active)) {
            void audio.play().catch(() => setNotice('음성 재생을 허용하려면 소리 버튼을 다시 눌러 주세요.'));
          }
        });
      }}>
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span><span>{muted ? '소리 켜기' : '소리 끄기'}</span>
    </button>
    {notice && <span role="status" className="exam-peer-note">{notice}</span>}
  </span>;
}
