// Transport-only double. Production hooks/reducer/smoothing run unchanged. Keep the peer
// visible across replacement, as when Presence leave+join lands in one React commit.
const channels=[];
const presence=new Map();
class Channel {
  constructor(id) { this.id=id; this.handlers=[]; this.active=true; }
  on(kind,filter,callback) {this.handlers.push({kind,event:filter.event,callback});return this;}
  emit(kind,event,payload={}) {for(const h of this.handlers) if(h.kind===kind && h.event===event) h.callback(payload);}
  subscribe(callback) {this.status=callback;queueMicrotask(()=>callback('SUBSCRIBED'));return this;}
  presenceState() {return Object.fromEntries([...presence].map(([id,p])=>[id,[p]]));}
  async track(player) {
    presence.set(this.id,player);
    for(const ch of channels) if(ch.active && ch!==this) ch.emit('presence','join',{newPresences:[player]});
    this.emit('presence','sync');
  }
  async send({payload}) {for(const ch of channels) if(ch.active && ch!==this) ch.emit('broadcast','move',{payload});}
  async untrack() {}
}
export const supabase={channel(_name,{config}) {const ch=new Channel(config.presence.key);channels.push(ch);return ch;},async removeChannel(ch) {ch.active=false;}};
Object.assign(window,{plazaTransport:{
  fail(id) {const ch=channels.findLast(ch=>ch.id===id && ch.active);ch.active=false;ch.status('CHANNEL_ERROR');},
  last(id) {return presence.get(id);},
  broadcast(player) {for(const ch of channels) if(ch.active && ch.id!==player.sessionId) ch.emit('broadcast','move',{payload:player});},
}});
