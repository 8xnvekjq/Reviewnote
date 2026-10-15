import type { HelpLabel as Label } from '../api';
import { peerSolutionLabelParts } from '../../exam/ui/peerSolution';

export function HelpLabel({ label }: { label: Label }) {
  const parts = peerSolutionLabelParts({ ...label, isTeacher: false });
  return <span className="inline-flex flex-wrap items-center gap-1 text-sm">
    <span className="text-xl">{parts.face}</span>
    {parts.title ? <span className={`rounded px-1.5 py-0.5 text-xs ${parts.title.style}`}>{parts.title.icon} {parts.title.text}</span> : <span>익명 학생</span>}
    <span className="text-slate-400">{parts.grade}</span>
  </span>;
}
