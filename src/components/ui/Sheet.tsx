import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AppIcon } from './AppIcon';

/** Native modal focus/inert handling; no routing or navigation state. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      dialog.classList.remove('rn-sheet-closing');
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.classList.add('rn-sheet-closing');
      const timeout = window.setTimeout(() => dialog.close(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120);
      return () => window.clearTimeout(timeout);
    }
  }, [open]);
  return <dialog ref={ref} className="rn-sheet" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rn-sheet-panel">
      <div className="rn-sheet-handle" aria-hidden="true" />
      <div className="rn-sheet-heading"><h2 id={titleId}>{title}</h2><button type="button" className="rn-icon-button" onClick={onClose} aria-label="닫기"><AppIcon name="close" /></button></div>
      <div className="rn-sheet-content">{children}</div>
    </div>
  </dialog>;
}
