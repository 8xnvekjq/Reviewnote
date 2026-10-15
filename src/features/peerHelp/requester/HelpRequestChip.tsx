import type { MyHelpRequest } from '../api';
import { requestChip } from './model';

export function HelpRequestChip({ request }: { request?: MyHelpRequest }) {
  const text = requestChip(request);
  return text ? <span className="inline-block rounded-lg bg-indigo-950 px-2 py-1 text-xs text-indigo-200">{text}</span> : null;
}
