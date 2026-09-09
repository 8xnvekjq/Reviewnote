import React, { useEffect, useRef } from 'react';
import { Sheet } from './ui/Sheet';

export interface NoticeModalState {
  isOpen: boolean;
  title: string;
  message: string;
  badge?: string;
  icon?: string;
  buttonText?: string;
  onConfirm?: () => void;
  secondaryButtonText?: string;
  onSecondaryAction?: () => void;
}

interface CustomNoticeModalProps {
  notice: NoticeModalState;
  onClose: () => void;
}

export const CustomNoticeModal: React.FC<CustomNoticeModalProps> = ({
  notice,
  onClose,
}) => {
  // 모달이 열릴 때마다 리셋: 버튼을 빠르게 연타하거나 두 버튼을 번갈아 눌러도
  // 액션이 두 번 이상 실행되지 않도록 막는다 (예: 재시도 두 번 트리거).
  const hasActedRef = useRef(false);
  useEffect(() => {
    if (notice.isOpen) hasActedRef.current = false;
  }, [notice.isOpen]);

  if (!notice.isOpen) return null;

  const {
    title,
    message,
    badge = '알림',
    icon = '✨',
    buttonText = '확인',
    onConfirm,
    secondaryButtonText,
    onSecondaryAction,
  } = notice;

  const runOnce = (action?: () => void) => {
    if (hasActedRef.current) return;
    hasActedRef.current = true;
    onClose();
    action?.();
  };

  const handleConfirm = () => runOnce(onConfirm);
  const handleSecondary = () => runOnce(onSecondaryAction);

  return (
    <Sheet open={notice.isOpen} onClose={onClose} title={title}>
      <div className="rn-notice space-y-4 text-center">
        {/* Top Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-inner">
          <span className="text-3xl">{icon}</span>
        </div>

        {/* Badge tag */}
        {badge && (
          <span className="inline-block text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full uppercase tracking-wider">
            {badge}
          </span>
        )}

        {/* Content */}
        <div className="space-y-1.5">
          <p className="rn-caption whitespace-pre-line px-1">
            {message}
          </p>
        </div>

        {/* Action Button(s) */}
        <div className="pt-2 flex flex-col space-y-2">
          {secondaryButtonText && (
            <button
              onClick={handleSecondary}
              className="rn-button rn-button-primary w-full"
            >
              <span>{secondaryButtonText}</span>
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={
              secondaryButtonText
                ? 'rn-button rn-button-secondary w-full'
                : 'rn-button rn-button-primary w-full'
            }
          >
            <span>{buttonText}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
};
