// Transport-only double. Production hooks/reducer/smoothing run unchanged.
//
// presence is keyed the way real Phoenix Presence actually is: Map<presenceKey, Map<joinId, meta>>
// — a single key CAN hold more than one simultaneous meta (e.g. two different joins/connections
// briefly overlapping under the same key, exactly the shape usePlazaRealtime.ts's
// flattenPresenceState(entries[0]) has to cope with). Each `Channel` instance is one join/
// connection; untrack()/removeChannel() both remove THIS join's own meta (idempotent — whichever
// runs first "wins", matching leaveChannelSafely's untrack-then-removeChannel order) and, if that
// was the key's last remaining meta, emit a real 'presence','leave' to every other active channel.
// A channel whose connection is already gone (ch.active===false, e.g. after plazaTransport.fail())
// can no longer successfully untrack — matches a genuinely dead socket failing to deliver a
// graceful goodbye push, so leaveChannelSafely's try/catch swallows it exactly as it would in
// production, and no spurious extra leave fires during a plain reconnect test.
let joinCounter = 0;
const channels = [];
const presence = new Map(); // presenceKey -> Map<joinId, meta>

function entriesFor(key) {
  const metas = presence.get(key);
  return metas ? [...metas.values()] : [];
}

function removeJoin(channel) {
  const metas = presence.get(channel.id);
  if (!metas || !metas.has(channel.joinId)) return; // already removed (untrack + removeChannel race) — no-op
  const left = metas.get(channel.joinId);
  metas.delete(channel.joinId);
  if (metas.size === 0) presence.delete(channel.id);
  for (const ch of channels) if (ch.active && ch !== channel) ch.emit('presence', 'leave', { leftPresences: [left] });
}

class Channel {
  constructor(id) {
    this.id = id;
    this.joinId = `join-${++joinCounter}`;
    this.handlers = [];
    this.active = true;
    this.untrackDelayMs = 0; // test hook — see plazaTransport.delayUntrack
  }
  on(kind, filter, callback) { this.handlers.push({ kind, event: filter.event, callback }); return this; }
  emit(kind, event, payload = {}) { for (const h of this.handlers) if (h.kind === kind && h.event === event) h.callback(payload); }
  subscribe(callback) { this.status = callback; queueMicrotask(() => callback('SUBSCRIBED')); return this; }
  presenceState() {
    const state = {};
    for (const key of presence.keys()) {
      const entries = entriesFor(key);
      if (entries.length > 0) state[key] = entries;
    }
    return state;
  }
  async track(player) {
    // 실제 Supabase 서버가 하는 일: 클라이언트가 보낸 track() payload에는 presence_ref가 없다
    // (우리가 채우지 않는다) — 서버가 "이 join"에 대해 발급한 ref를 다른 클라이언트에게 보여줄
    // 때 얹어서 돌려준다. 여기서 그 역할을 흉내낸다: this.joinId가 곧 그 ref다.
    const withRef = { ...player, presence_ref: this.joinId };
    let metas = presence.get(this.id);
    if (!metas) { metas = new Map(); presence.set(this.id, metas); }
    metas.set(this.joinId, withRef);
    for (const ch of channels) if (ch.active && ch !== this) ch.emit('presence', 'join', { newPresences: [withRef] });
    this.emit('presence', 'sync');
  }
  async send({ payload, event }) { for (const ch of channels) if (ch.active && ch.id !== payload.sessionId) ch.emit('broadcast', event, { payload }); return 'ok'; }
  async untrack() {
    if (!this.active) throw new Error('untrack on a dead connection'); // matches a genuinely closed socket
    if (this.untrackDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.untrackDelayMs));
    removeJoin(this);
  }
}
export const supabase = {
  channel(_name, { config }) { const ch = new Channel(config.presence.key); channels.push(ch); return ch; },
  async removeChannel(ch) { removeJoin(ch); ch.active = false; },
};
Object.assign(window, { plazaTransport: {
  fail(id) { const ch = channels.findLast(ch => ch.id === id && ch.active); ch.active = false; ch.status('CHANNEL_ERROR'); },
  last(id) { const entries = entriesFor(id); return entries[entries.length - 1]; },
  entryCount(id) { return entriesFor(id).length; },
  broadcast(player) { for (const ch of channels) if (ch.active && ch.id !== player.sessionId) ch.emit('broadcast', 'move', { payload: player }); },
  reaction(payload) { for (const ch of channels) if (ch.active) ch.emit('broadcast', 'reaction', { payload }); },
  // Delays THIS session's next untrack() by ms — models real network latency on the leave push, to
  // stress the race between an old channel's async leave and a fast rejoin's new join.
  delayUntrack(id, ms) { const ch = channels.findLast(ch => ch.id === id && ch.active); if (ch) ch.untrackDelayMs = ms; },
} });
