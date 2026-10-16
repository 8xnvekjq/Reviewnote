export const CHARM_VISIBILITY_EVENT = 'reviewnote_charm_visibility_updated';
export const charmVisibilityKey = (id: string) => `reviewnote:charm:hidden:${id}`;

export function isCharmShown(id: string): boolean {
  try { return localStorage.getItem(charmVisibilityKey(id)) !== 'true'; }
  catch { return true; }
}

export function saveCharmShown(id: string, shown: boolean): void {
  try { localStorage.setItem(charmVisibilityKey(id), String(!shown)); }
  catch { /* Keep the current session usable when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent(CHARM_VISIBILITY_EVENT, { detail: { id, shown } }));
}
