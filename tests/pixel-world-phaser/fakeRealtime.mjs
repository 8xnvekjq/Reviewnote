// 기존 tests/plaza처럼 transport만 바꾼다. BroadcastChannel로 두 페이지를 연결한다.
const bus = new BroadcastChannel('phaser-plaza-test');
const channels = new Set();
let removed = 0;
class Channel {
  constructor(id) { this.id = id; this.ref = crypto.randomUUID(); this.handlers = []; this.members = new Map(); this.active = true; this.player = null; }
  on(type, filter, cb) { this.handlers.push({ type, event: filter.event, cb }); return this; }
  emit(type, event, data = {}) { for (const h of this.handlers) if (h.type === type && h.event === event) h.cb(data); }
  subscribe(cb) { this.status = cb; queueMicrotask(() => { cb('SUBSCRIBED'); bus.postMessage({ kind: 'query', id: this.id }); }); return this; }
  presenceState() { return Object.fromEntries([...this.members].map(([id, p]) => [id, [p]])); }
  async track(p) { this.player = { ...p, presence_ref: this.ref }; this.members.set(this.id, this.player); this.emit('presence', 'sync'); bus.postMessage({ kind: 'track', player: this.player }); return 'ok'; }
  async send({ event, payload }) { bus.postMessage({ kind: 'broadcast', event, payload }); return 'ok'; }
  async untrack() { bus.postMessage({ kind: 'leave', player: this.player }); this.player = null; }
}
bus.onmessage = ({ data }) => {
  for (const ch of channels) if (ch.active) {
    if (data.kind === 'query' && ch.player) bus.postMessage({ kind: 'track', player: ch.player });
    else if (data.kind === 'track' && data.player.sessionId !== ch.id) {
      ch.members.set(data.player.sessionId, data.player); ch.emit('presence', 'join', { newPresences: [data.player] });
    } else if (data.kind === 'leave' && data.player) {
      ch.members.delete(data.player.sessionId); ch.emit('presence', 'leave', { leftPresences: [data.player] });
    } else if (data.kind === 'broadcast') ch.emit('broadcast', data.event, { payload: data.payload });
  }
};
export const supabase = {
  channel(_name, { config }) { const ch = new Channel(config.presence.key); channels.add(ch); return ch; },
  async removeChannel(ch) { ch.active = false; channels.delete(ch); removed++; },
  async rpc(name) {
    if (name !== 'get_weekly_crop_contest') throw new Error('예상하지 못한 RPC: ' + name);
    return { data: { top: [{ rank: 1, sizeScore: 87, submitterLabel: '토마토 친구' }], mine: { rank: null, sizeScore: null } }, error: null };
  },
};
window.plazaTransport = { audit: () => ({ active: [...channels].filter(ch => ch.active).map(ch => ch.id), removed }), last: () => [...channels][0]?.player };
