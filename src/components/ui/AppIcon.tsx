import type { SVGProps } from 'react';

export type AppIconName = 'notes' | 'camera' | 'gift' | 'menu' | 'activity' | 'close' | 'arrow' | 'user' | 'chart' | 'check' | 'help' | 'eye' | 'book';
const paths: Record<AppIconName, string> = {
  notes: 'M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h4',
  camera: 'M8 6l2-3h4l2 3h5v14H3V6z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  gift: 'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8C4 8 5 1 9 3c2 1 3 5 3 5 M12 8s1-4 3-5c4-2 5 5-3 5',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  activity: 'M12 8v5l3 2 M4 5a9 9 0 1 1-1 11 M3 3v5h5',
  close: 'M6 6l12 12 M18 6L6 18',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  chart: 'M4 20V10 M12 20V4 M20 20v-7',
  check: 'M4 12l5 5L20 6',
  help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  book: 'M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1z M12 5v16',
};

export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AppIconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
