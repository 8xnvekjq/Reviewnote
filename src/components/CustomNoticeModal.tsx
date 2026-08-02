import React from 'react';

export interface NoticeModalState {
  isOpen: boolean;
  title: string;
  message: string;
  badge?: string;
  icon?: string;
  buttonText?: string;
  onConfirm?: () => void;
}

interface CustomNoticeModalProps {
  notice: NoticeModalState;
  onClose: () => void;
}

export const CustomNoticeModal: React.FC<CustomNoticeModalProps> = ({
  notice,
  onClose,
}) => {
  if (!notice.isOpen) return null;

  const {
    title,
    message,
    badge = '알림',
    icon = '✨',
    buttonText = '확인',
    onConfirm,
  } = notice;

  const handleConfirm = () => {
    onClose();
    if (onConfirm) onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-4 text-center animate-scale-up">
        {/* Top Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-inner">
          <span className="text-3xl animate-bounce">{icon}</span>
        </div>

        {/* Badge tag */}
        {badge && (
          <span className="inline-block text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full uppercase tracking-wider">
            {badge}
          </span>
        )}

        {/* Content */}
        <div className="space-y-1.5">
          <h3 className="text-base font-black text-white leading-tight">
            {title}
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line px-1">
            {message}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={handleConfirm}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center space-x-1"
          >
            <span>{buttonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
