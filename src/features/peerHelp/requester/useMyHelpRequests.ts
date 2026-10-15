import { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { myHelpRequests, type MyHelpRequest } from '../api';
import { requestMap } from './model';

const changedEvent = 'peer-help-requester-changed';
const pending = new Map<string, Promise<MyHelpRequest[]>>();

export function refreshHelpRequests() {
  window.dispatchEvent(new Event(changedEvent));
}

export function useMyHelpRequests(userId?: string) {
  const [requests, setRequests] = useState<Record<string, MyHelpRequest>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!userId);
  useEffect(() => {
    let active = true;
    setRequests({});
    if (!userId) { setLoading(false); return; }
    const load = () => {
      setLoading(true);
      let task = pending.get(userId);
      if (!task) {
        task = myHelpRequests(supabase).finally(() => { pending.delete(userId); });
        pending.set(userId, task);
      }
      void task.then(rows => {
        if (active) { setRequests(requestMap(rows)); setError(''); }
      }, reason => { if (active) setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    };
    load();
    window.addEventListener(changedEvent, load);
    return () => { active = false; window.removeEventListener(changedEvent, load); };
  }, [userId]);
  return { requests, error, loading };
}
