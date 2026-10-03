import { supabase } from '../../services/supabase';
import { createBroadcastTransport } from './broadcastTransport';
export type { LiveChannel, LiveTransport } from './broadcastTransport';

/** Reuses the application's singleton client/socket. No HTTP fallback for missed broadcasts. */
export const examLiveTransport = createBroadcastTransport(supabase);
