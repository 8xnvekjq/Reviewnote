import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function RequesterDialog({ label, onClose, children, fullscreen = false }: {
  label: string; onClose: () => void; children: ReactNode; fullscreen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(<dialog ref={ref} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}
    className={`border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl backdrop:bg-black/70 ${fullscreen ? 'm-0 h-dvh max-h-none w-screen max-w-none' : 'm-auto w-[calc(100%-2rem)] max-w-md rounded-2xl p-5'}`}>
    {children}
  </dialog>, document.body);
}
