// Direkte Verbindung zwischen den Spielern einer Lobby (WebRTC-Datenkanaele, jeder mit jedem). Supabase (net.js) dient nur zum Aushandeln ('rtc'-Nachrichten)
// und als Rueckfall: ist zu einem Mitspieler kein Kanal offen (anderes Netz, Firewall, Schulnetz mit Geraeteisolation), laeuft alles wie bisher ueber den Relay.
// Im selben WLAN fehlt so der Umweg ueber den Server (Verzoegerung, Ruckeln beim Gast) und die Nachrichtengrenze des Servers.
// Zwei Kanaele je Paar: 'live' (unzuverlaessig, ungeordnet: Zustand und Welt, veraltete Pakete duerfen verloren gehen) und 'rel' (zuverlaessig, geordnet:
// Ereignisse, Schaden, Start). Wer die kleinere Kennung hat, macht das Angebot; kommt keins an, fragt der andere mit 'req' nach.
//   const m = new Net.Mesh({ id, signal(to, msg), deliver(rohtext) }); m.setPeers([ids]); m.signalIn({ from, to, kind, ... }); m.send('live'|'rel', text) -> true = alle erreicht
Net.ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
Net.Mesh = class {
  constructor(o) { this.id = o.id; this.signal = o.signal; this.deliver = o.deliver; this.ice = o.ice || Net.ICE; this.peers = new Map(); this.closed = false; }
  static get supported() { return typeof RTCPeerConnection !== 'undefined'; }
  ready(p) { return !!(p.live && p.live.readyState === 'open' && p.rel && p.rel.readyState === 'open'); }
  stats() { let open = 0; for (const p of this.peers.values()) if (this.ready(p)) open++; return { peers: this.peers.size, open }; }
  setPeers(ids) {
    if (this.closed) return;
    const want = new Set(ids);
    for (const pid of [...this.peers.keys()]) if (!want.has(pid)) this.drop(pid);
    for (const pid of ids) if (!this.peers.has(pid)) this.add(pid);
  }
  add(pid) {
    const p = { id: pid, pc: null, live: null, rel: null, gen: 0, tries: 0, pend: [], remoteSet: false, t: null, init: this.id < pid };
    this.peers.set(pid, p);
    if (p.init) this.start(p);
    else p.t = setTimeout(() => { if (!this.closed && this.peers.get(pid) === p && !this.ready(p)) this.signal(pid, { kind: 'req' }); }, 3500);
    return p;
  }
  drop(pid) {
    const p = this.peers.get(pid);
    if (!p) return;
    this.peers.delete(pid);
    clearTimeout(p.t); this.kill(p);
  }
  kill(p) {
    for (const k of ['live', 'rel']) { const c = p[k]; p[k] = null; if (c) { c.onmessage = c.onopen = c.onclose = null; try { c.close(); } catch (e) { /* schon zu */ } } }
    const pc = p.pc; p.pc = null;
    if (pc) { pc.onicecandidate = pc.ondatachannel = pc.onconnectionstatechange = null; try { pc.close(); } catch (e) { /* schon zu */ } }
  }
  mk(p) {
    this.kill(p);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    p.pc = pc; p.remoteSet = false; p.pend = [];
    const gen = p.gen;
    pc.onicecandidate = (e) => { if (e.candidate && p.pc === pc) this.signal(p.id, { kind: 'cand', gen, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ondatachannel = (e) => this.bind(p, e.channel);
    pc.onconnectionstatechange = () => {
      if (p.pc !== pc || this.closed || pc.connectionState !== 'failed') return;
      if (p.init) { if (p.tries < 6) { p.tries++; this.start(p); } } else this.signal(p.id, { kind: 'req' });
    };
    return pc;
  }
  bind(p, dc) {
    dc.onmessage = (e) => { if (typeof e.data === 'string') this.deliver(e.data); };
    if (dc.label === 'live') p.live = dc; else p.rel = dc;
  }
  start(p) {
    if (this.closed) return;
    p.gen++;
    const pc = this.mk(p), gen = p.gen;
    this.bind(p, pc.createDataChannel('live', { ordered: false, maxRetransmits: 0 }));
    this.bind(p, pc.createDataChannel('rel'));
    pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => { if (p.pc === pc) this.signal(p.id, { kind: 'offer', gen, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }); }).catch(() => {});
    clearTimeout(p.t);
    p.t = setTimeout(() => { if (!this.closed && this.peers.get(p.id) === p && !this.ready(p) && p.tries < 6) { p.tries++; this.start(p); } }, 9000);
  }
  // Aushandlungs-Nachricht eines Mitspielers ({ from, to, kind, gen, sdp | c })
  signalIn(m) {
    if (this.closed || !m || m.to !== this.id || !m.from) return;
    let p = this.peers.get(m.from);
    if (m.kind === 'req') { if (p && p.init && !this.ready(p)) this.start(p); return; }
    if (!p) { if (m.kind !== 'offer') return; p = this.add(m.from); }
    if (m.kind === 'offer') {
      if (p.init || m.gen < p.gen) return;
      p.gen = m.gen;
      const pc = this.mk(p);
      pc.setRemoteDescription(m.sdp).then(() => { p.remoteSet = true; return pc.createAnswer(); }).then((a) => pc.setLocalDescription(a)).then(() => {
        if (p.pc !== pc) return;
        this.signal(p.id, { kind: 'answer', gen: m.gen, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        for (const c of p.pend.splice(0)) pc.addIceCandidate(c).catch(() => {});
      }).catch(() => {});
    } else if (m.kind === 'answer') {
      if (!p.init || m.gen !== p.gen || !p.pc) return;
      const pc = p.pc;
      pc.setRemoteDescription(m.sdp).then(() => { p.remoteSet = true; for (const c of p.pend.splice(0)) pc.addIceCandidate(c).catch(() => {}); }).catch(() => {});
    } else if (m.kind === 'cand') {
      if (m.gen !== p.gen || !p.pc || !m.c) return;
      if (!p.remoteSet) p.pend.push(m.c); else p.pc.addIceCandidate(m.c).catch(() => {});
    }
  }
  // An alle Mitspieler ueber den Kanal der Art kind ('live' | 'rel'). true = jeder hat es bekommen (oder es wurde bei Stau absichtlich verworfen),
  // false = mindestens einer nicht (kein Kanal, zu gross, Fehler) -> der Aufrufer nimmt zusaetzlich den Relay (der Empfaenger entfernt Doppelte)
  send(kind, str) {
    if (!this.peers.size) return false;
    let all = true;
    for (const p of this.peers.values()) {
      const dc = kind === 'live' ? p.live : p.rel;
      if (!dc || dc.readyState !== 'open') { all = false; continue; }
      const max = p.pc && p.pc.sctp && p.pc.sctp.maxMessageSize ? Math.min(p.pc.sctp.maxMessageSize, 262144) : 16000;
      if (str.length * 2 > max - 512) { all = false; continue; }
      if (kind === 'live' && dc.bufferedAmount > 64000) continue;                  // Stau: Zustandspaket verwerfen
      try { dc.send(str); } catch (e) { all = false; }
    }
    return all;
  }
  close() { this.closed = true; for (const pid of [...this.peers.keys()]) this.drop(pid); }
};
