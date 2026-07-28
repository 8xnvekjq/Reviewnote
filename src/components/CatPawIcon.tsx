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
      {/* 4 Toe Beans (핑크 젤리 발가락 4개) */}
      <ellipse cx="25" cy="28" rx="10" ry="14" transform="rotate(-20 25 28)" fill="#F472B6" stroke="#DB2777" strokeWidth="2.5" />
      <ellipse cx="43" cy="18" rx="9.5" ry="14.5" transform="rotate(-6 43 18)" fill="#F472B6" stroke="#DB2777" strokeWidth="2.5" />
      <ellipse cx="61" cy="18" rx="9.5" ry="14.5" transform="rotate(6 61 18)" fill="#F472B6" stroke="#DB2777" strokeWidth="2.5" />
      <ellipse cx="78" cy="28" rx="10" ry="14" transform="rotate(20 78 28)" fill="#F472B6" stroke="#DB2777" strokeWidth="2.5" />
      {/* Main Big Paw Pad (메인 하트모양 발바닥 젤리) */}
      <path
        d="M 27 64 C 20 44, 42 41, 51 46 C 60 41, 82 44, 75 64 C 68 84, 34 84, 27 64 Z"
        fill="#F472B6"
        stroke="#DB2777"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Soft highlight (젤리 반짝임 하이라이트) */}
      <ellipse cx="38" cy="56" rx="6" ry="3.5" transform="rotate(-15 38 56)" fill="#FFFFFF" opacity="0.75" />
    </svg>
  );
};
