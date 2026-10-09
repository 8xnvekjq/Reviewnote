// 관리자 전용 해설 영상(시험지 × 공통·선택과목, 한석만TV). 틀리거나 애매한 문항 줄의 걸린 시간 옆과 문항 크게 보기에
// 작은 유튜브 아이콘으로만 보여 준다. 링크는 DB(exam_paper_videos)에 미리 넣어 둔다.
import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react';
import type { AdminExamApi, ExamElective } from '../contract';

export type VideoSection = 'common' | ExamElective;
export type PaperVideos = Partial<Record<VideoSection, string>>;
export type VideoApi = Required<Pick<AdminExamApi, 'listPaperVideos'>>;

export function usePaperVideos(api: VideoApi | undefined, paperId: string | null): PaperVideos {
  const [videos, setVideos] = useState<PaperVideos>({});
  useEffect(() => {
    let alive = true;
    setVideos({});
    if (api && paperId) void api.listPaperVideos(paperId).then(v => { if (alive) setVideos(v); }).catch(() => {});
    return () => { alive = false; };
  }, [api, paperId]);
  return videos;
}

function YoutubeMark() {
  return <svg viewBox="0 0 24 17" width="22" height="16" aria-hidden="true" focusable="false">
    <rect width="24" height="17" rx="4" fill="#ff0033" /><path d="M9.6 4.6 16.4 8.5 9.6 12.4Z" fill="#fff" />
  </svg>;
}

/** 문항 크게 보기 머리줄용(일반 링크). */
export function SolutionVideoLink({ videos, section }: { videos: PaperVideos; section: VideoSection }) {
  const url = videos[section];
  if (!url) return null;
  return <a className="exam-video-icon" href={url} target="_blank" rel="noopener noreferrer" aria-label="해설 영상 보기" title="해설 영상" data-testid="exam-video-link"><YoutubeMark /></a>;
}

/** 결과 문항 줄(전체가 버튼) 안에 넣는 아이콘: 줄 클릭(크게 보기)과 따로 동작한다. */
export function SolutionVideoMark({ url }: { url: string | undefined }) {
  if (!url) return null;
  const open = (event: MouseEvent | KeyboardEvent) => { event.stopPropagation(); event.preventDefault(); window.open(url, '_blank', 'noopener,noreferrer'); };
  return <span className="exam-video-icon" role="link" tabIndex={0} aria-label="해설 영상 보기" title="해설 영상" data-testid="exam-video-mark" data-href={url}
    onClick={open} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') open(event); }}><YoutubeMark /></span>;
}
