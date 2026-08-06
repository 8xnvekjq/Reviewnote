import React from 'react';

interface CatPawIconProps {
  className?: string;
  size?: number;
}

export const CatPawIcon: React.FC<CatPawIconProps> = ({ className = "w-4 h-4", size }) => {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      className={`inline-block flex-none select-none drop-shadow-sm ${className}`}
      style={style}
    >
      <defs>
        {/* 말랑말랑한 젤리 광택을 위한 방사형 그라데이션 */}
        <radialGradient id="catPawJelly" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#FFD3EA" />
          <stop offset="55%" stopColor="#FF8FC7" />
          <stop offset="100%" stopColor="#F1529B" />
        </radialGradient>
      </defs>

      {/* 4 발가락 젤리 (동글동글한 원형으로 통일해 더 통통하고 귀엽게) */}
      <circle cx="21" cy="35" r="12.5" fill="url(#catPawJelly)" stroke="#D63384" strokeWidth="3" />
      <circle cx="39" cy="17" r="12" fill="url(#catPawJelly)" stroke="#D63384" strokeWidth="3" />
      <circle cx="61" cy="17" r="12" fill="url(#catPawJelly)" stroke="#D63384" strokeWidth="3" />
      <circle cx="79" cy="35" r="12.5" fill="url(#catPawJelly)" stroke="#D63384" strokeWidth="3" />

      {/* 메인 발바닥 젤리 (둥글넓적한 형태) */}
      <ellipse cx="50" cy="65" rx="30" ry="24" fill="url(#catPawJelly)" stroke="#D63384" strokeWidth="3.5" />

      {/* 반짝이는 젤리 광택 하이라이트 */}
      <ellipse cx="37" cy="54" rx="9" ry="5.5" transform="rotate(-25 37 54)" fill="#FFFFFF" opacity="0.65" />
      <ellipse cx="17" cy="30" rx="3.5" ry="2.5" transform="rotate(-20 17 30)" fill="#FFFFFF" opacity="0.7" />
      <ellipse cx="35" cy="12" rx="3.5" ry="2.5" transform="rotate(-20 35 12)" fill="#FFFFFF" opacity="0.7" />
    </svg>
  );
};
