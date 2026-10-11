/** 지식의 조각 아이콘 — 세로로 긴 보라색 팔면체(옆에서 보면 다이아몬드). 왼쪽 위 면이 가장 밝다. */
export function KnowledgeShardIcon({ size = 16, className }: { size?: number; className?: string }) {
  return <svg className={className} width={size * 0.625} height={size} viewBox="0 0 10 16" aria-hidden="true" focusable="false">
    <polygon points="5,0 0,8 5,8" fill="#e6d6ff" />
    <polygon points="5,0 10,8 5,8" fill="#a878f0" />
    <polygon points="0,8 5,16 5,8" fill="#8a52e0" />
    <polygon points="10,8 5,16 5,8" fill="#5a2aa8" />
    <polygon points="5,0 10,8 5,16 0,8" fill="none" stroke="#3b1678" strokeWidth="0.7" strokeLinejoin="round" />
    <polygon points="3.6,3.4 4.4,2.6 4.4,4.2" fill="#fff" />
  </svg>;
}

