// 관리자 전용 해설 영상 링크(시험지 × 공통·선택과목). 결과 화면 위쪽에 넣고 고치는 칸, 문항마다 "▶ 해설" 링크.
import { useEffect, useState } from 'react';
import type { AdminExamApi, ExamElective } from '../contract';

export type VideoSection = 'common' | ExamElective;
export type PaperVideos = Partial<Record<VideoSection, string>>;
export type VideoApi = Required<Pick<AdminExamApi, 'listPaperVideos' | 'setPaperVideo'>>;

const LABEL: Record<string, string> = { common: '공통', '확률과 통계': '확통', 미적분: '미적분', 기하: '기하' };
export const videoSectionLabel = (section: string) => LABEL[section] ?? section;
const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//;
export const isYoutubeUrl = (url: string) => YOUTUBE.test(url.trim()) && url.trim().length <= 500;

export function usePaperVideos(api: VideoApi | undefined, paperId: string | null) {
  const [videos, setVideos] = useState<PaperVideos>({});
  useEffect(() => {
    let alive = true;
    setVideos({});
    if (api && paperId) void api.listPaperVideos(paperId).then(v => { if (alive) setVideos(v); }).catch(() => {});
    return () => { alive = false; };
  }, [api, paperId]);
  const save = async (section: VideoSection, url: string | null) => {
    if (!api || !paperId) return;
    await api.setPaperVideo(paperId, section, url);
    setVideos(prev => { const next = { ...prev }; if (url) next[section] = url.trim(); else delete next[section]; return next; });
  };
  return { videos, save };
}

/** 문항 크게 보기 머리줄에 붙는 링크. 그 문항 구역의 영상이 있을 때만. */
export function SolutionVideoLink({ videos, section }: { videos: PaperVideos; section: VideoSection }) {
  const url = videos[section];
  if (!url) return null;
  return <a className="rn-button rn-button-compact exam-video-link" href={url} target="_blank" rel="noopener noreferrer" data-testid="exam-video-link">▶ 해설</a>;
}

export function SolutionVideoPanel({ videos, sections, onSave }: { videos: PaperVideos; sections: VideoSection[]; onSave: (section: VideoSection, url: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState<VideoSection | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (section: VideoSection, url: string | null) => {
    if (url !== null && !isYoutubeUrl(url)) { setMessage('유튜브 링크(https://youtube.com/… 또는 https://youtu.be/…)를 넣어 주세요.'); return; }
    setBusy(true); setMessage('');
    try { await onSave(section, url); setEditing(null); setDraft(''); }
    catch { setMessage('저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="exam-video-panel" aria-label="해설 영상" data-testid="exam-video-panel">
      <h3>해설 영상 <small>관리자</small></h3>
      <ul>
        {sections.map(section => (
          <li key={section} data-section={section}>
            <span className="exam-video-section">{videoSectionLabel(section)}</span>
            {editing === section ? <>
              <input type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" value={draft} onChange={e => setDraft(e.target.value)} aria-label={`${videoSectionLabel(section)} 해설 영상 링크`} disabled={busy} />
              <button type="button" className="rn-button rn-button-compact" disabled={busy || !draft.trim()} onClick={() => void submit(section, draft)}>저장</button>
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" disabled={busy} onClick={() => { setEditing(null); setMessage(''); }}>취소</button>
            </> : <>
              {videos[section]
                ? <a className="rn-button rn-button-compact" href={videos[section]} target="_blank" rel="noopener noreferrer">▶ 열기</a>
                : <span className="rn-caption">없음</span>}
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => { setEditing(section); setDraft(videos[section] ?? ''); setMessage(''); }}>{videos[section] ? '바꾸기' : '링크 넣기'}</button>
              {videos[section] && <button type="button" className="rn-button rn-button-ghost rn-button-compact" disabled={busy} onClick={() => void submit(section, null)}>지우기</button>}
            </>}
          </li>
        ))}
      </ul>
      {message && <p role="alert" className="rn-caption">{message}</p>}
    </section>
  );
}
