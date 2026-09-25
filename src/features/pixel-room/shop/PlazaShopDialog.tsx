import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function PlazaShopDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  // Do not use the native close event as application state: StrictMode's effect cleanup
  // closes/reopens the element, and its queued close event must not dismiss the new dialog.
  return <dialog ref={dialog} className="pr-plaza-shop-dialog" onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="plaza-shop-title">
    <header><div><small>광장의 작은 상점</small><h2 id="plaza-shop-title">오늘의 마음에 드는 것</h2></div><button type="button" autoFocus onClick={onClose} aria-label="상점 닫고 광장으로">✕</button></header>
    <div className="pr-plaza-shop-content">{children}</div>
  </dialog>;
}
