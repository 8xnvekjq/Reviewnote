import type { ReactNode } from 'react';

type CollapsibleSectionColor = 'indigo' | 'emerald' | 'amber' | 'purple' | 'slate';

interface CollapsibleSectionProps {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode; // 제목 옆에 붙는 짧은 보조 텍스트(예: "실시간 작성 중...") — 없으면 생략
  color: CollapsibleSectionColor;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const COLOR_STYLES: Record<CollapsibleSectionColor, { border: string; title: string; titleHover: string }> = {
  indigo: { border: 'border-indigo-500', title: 'text-indigo-400', titleHover: 'group-hover:text-indigo-300' },
  emerald: { border: 'border-emerald-500', title: 'text-emerald-400', titleHover: 'group-hover:text-emerald-300' },
  amber: { border: 'border-amber-500', title: 'text-amber-400', titleHover: 'group-hover:text-amber-300' },
  purple: { border: 'border-purple-500', title: 'text-purple-400', titleHover: 'group-hover:text-purple-300' },
  slate: { border: 'border-slate-400', title: 'text-slate-300', titleHover: 'group-hover:text-white' },
};

// Obsidian callout처럼 접힌 상태에서도 박스 배경/테두리가 항상 보이고, 펼치면 같은 박스 안에서
// 내용이 이어지는 접힘 섹션. MistakeDetailModal의 접힘 섹션들이 "접혔을 땐 테두리 없는 헤더
// 한 줄뿐이라 접힌 정보 블록인지 알아보기 어렵던" 문제를 이 컴포넌트로 통일해서 해결한다.
export function CollapsibleSection({ icon, title, subtitle, color, isOpen, onToggle, children }: CollapsibleSectionProps) {
  const style = COLOR_STYLES[color];
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden border-l-4 ${style.border}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left px-4 py-3 focus:outline-none group"
      >
        <h4 className={`text-sm font-extrabold flex items-center ${style.title} ${style.titleHover} transition-colors`}>
          <span className="mr-1.5 text-base">{icon}</span>
          {title}
          {subtitle}
        </h4>
        <span className="text-xs text-slate-500 font-bold ml-2 flex-none group-hover:text-slate-400 transition-colors">
          {isOpen ? '▲ 닫기' : '▼ 보기'}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-800/60 animate-scale-up">
          {children}
        </div>
      )}
    </div>
  );
}
