// 레이저 도구 아이콘: 비스듬한 레이저 포인터에서 빨간 빛줄기가 나가 점에 맺힌 모양(빨간 동그라미만으로는 무슨 도구인지 알기 어려웠다).
export function LaserIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ display: 'block' }}>
    <circle cx="18.5" cy="5.5" r="4.2" fill="#ff2d46" opacity=".22" />
    <path d="M12.2 11.8 18.5 5.5" stroke="#ff2d46" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 2" />
    <path d="M3.6 20.4 11.4 12.6" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
    <path d="M10.2 13.8 12.2 11.8" stroke="#94a3b8" strokeWidth="3.6" strokeLinecap="round" />
    <circle cx="18.5" cy="5.5" r="2" fill="#ff2d46" />
    <circle cx="18.5" cy="5.5" r=".8" fill="#fff" />
  </svg>;
}
