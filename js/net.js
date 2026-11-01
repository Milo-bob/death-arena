// Mehrspieler-Verbindung (PvP-Lobby): ein Kanal pro Lobby ueber Supabase Realtime (WebSocket, Phoenix-Protokoll Version 1.0.0).
// Keine Fremdbibliothek, kein eigener Server: der Lobby-Code ist der Kanalname ("pvp-ABCDE"). Der Kanal entsteht beim ersten Beitritt von selbst.
// Presence = wer ist in der Lobby (Name, Host-Flag), Broadcast = Nachrichten an alle anderen (spaeter Eingaben und Spielstand).
//   const ch = Net.open(code, { name, host }, { onPlayers(list), onMessage(event, payload, fromId), onStatus(status) });
//   ch.send(event, payload); ch.update({ ...meta }); ch.close();
// Status: 'connecting' | 'joined' | 'closed' | 'error'. players = [{ id, name, host, ... }] (Reihenfolge: Host zuerst, dann nach Beitritt).

const Net = {
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',           // ohne I, O, 0, 1 (leicht zu verwechseln)
  CODE_LEN: 5,
  MAX_PLAYERS: 6,

  // Reservierte Dev-Lobbys: enthalten 0/1 (nie in CODE_CHARS), also vergibt newCode sie nie und cleanCode laesst sie bei normalen Spielern nicht durch.
  DEV_CODES: ['DEV01', 'DEV02', 'DEV03'],
  isDevCode(c) { return this.DEV_CODES.includes(String(c || '').toUpperCase()); },
  newCode() { let c = ''; for (let i = 0; i < this.CODE_LEN; i++) c += this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)]; return c; },
  // Mit Dev-Zugang bleiben 0 und 1 erlaubt, damit DEV01-DEV03 eingegeben werden koennen
  cleanCode(s) { const ok = this.CODE_CHARS + (typeof Save !== 'undefined' && Save.anyDev && Save.anyDev() ? '01' : ''); return String(s || '').toUpperCase().split('').filter((ch) => ok.includes(ch)).join('').slice(0, this.CODE_LEN); },
  newId() { return Math.random().toString(36).slice(2, 10); },
  get available() { return typeof WebSocket !== 'undefined' && typeof Account !== 'undefined' && Account.configured; },

  open(code, me, cb) {
    const id = me.id || this.newId(), topic = 'realtime:pvp-' + code;
    const ch = { id, code, status: 'connecting', players: [], ws: null, ref: 0, hb: null, meta: Object.assign({}, me, { id }), closed: false };
    const emit = (name, ...a) => { try { if (cb && cb[name]) cb[name](...a); } catch (e) { /* ein Fehler im Spiel darf die Verbindung nicht abbrechen */ } };
    const setStatus = (s) => { if (ch.status !== s) { ch.status = s; emit('onStatus', s); } };
    const send = (event, payload, t) => { if (ch.ws && ch.ws.readyState === 1) ch.ws.send(JSON.stringify({ topic: t || topic, event, payload, ref: String(++ch.ref) })); };
    const state = {};                                               // presence-Schluessel -> meta
    // Stau im Sendepuffer (langsame Leitung): Zustandspakete verwerfen statt anzuhaeufen, sonst waechst die Verzoegerung immer weiter
    const LIVE = { world: 1, cstate: 1, state: 1, bots: 1, dm: 1, cping: 1, cpong: 1 };
    // Eingehende Nachricht (Relay oder direkter Kanal): Doppelte entfernen (dieselbe Nachricht kann auf beiden Wegen kommen), veraltete Zustandspakete verwerfen
    const seen = {};
    const accept = (event, payload) => {
      const f = payload && payload.from, n = payload && payload._n;
      if (f && n) {
        const d = seen[f] || (seen[f] = { s: new Set(), q: [], live: {} });
        if (d.s.has(n)) return;
        d.s.add(n); d.q.push(n); if (d.q.length > 400) d.s.delete(d.q.shift());
        if (LIVE[event]) { if (n < (d.live[event] || 0)) return; d.live[event] = n; }
      }
      emit('onMessage', event, payload, f);
    };
    if (cb && cb.p2p && typeof Net.Mesh === 'function' && Net.Mesh.supported && Net.p2p !== false) {
      try {
        ch.mesh = new Net.Mesh({ id, signal: (to, msg) => send('broadcast', { type: 'broadcast', event: 'rtc', payload: Object.assign({ from: id, to }, msg) }),
          deliver: (str) => { let m; try { m = JSON.parse(str); } catch (e) { return; } if (m && m.event) accept(m.event, m.payload); } });
      } catch (e) { ch.mesh = null; }
    }
    const publish = () => {
      const list = Object.values(state).sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0) || (a.at || 0) - (b.at || 0));
      ch.players = list; emit('onPlayers', list);
      if (ch.mesh) ch.mesh.setPeers(list.map((q) => q.id).filter((q) => q !== id));
    };
    const track = () => send('presence', { type: 'presence', event: 'track', payload: ch.meta });
    // Verbindungsabbrueche (Netz, Server, Ruhezustand) werden still durch erneutes Verbinden behoben: gleiche Kennung, Anwesenheit wird neu gemeldet.
    // Erst nach mehreren Fehlversuchen in Folge meldet der Kanal 'error'.
    let tries = 0;
    const lost = () => {
      if (ch.closed || ch.rt) return;
      clearInterval(ch.hb);
      if (tries >= (ch.joined || ch.wasJoined ? 8 : 2)) { setStatus('error'); return; }
      tries++; if (ch.joined) ch.wasJoined = true; ch.joined = false;
      if (ch.wasJoined) setStatus('reconnecting');
      ch.rt = setTimeout(() => { ch.rt = null; if (!ch.closed) connect(); }, Math.min(3000, 400 * tries));
    };
    const connect = () => {
      let ws;
      try {
        const url = Account.URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(Account.KEY) + '&vsn=1.0.0';
        ws = new WebSocket(url);
      } catch (e) { lost(); return; }
      ch.ws = ws;
      ws.onopen = () => {
        send('phx_join', { config: { broadcast: { self: false, ack: false }, presence: { key: id, enabled: true }, postgres_changes: [], private: false }, access_token: Account.KEY });
        ch.hb = setInterval(() => send('heartbeat', {}, 'phoenix'), 20000);
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.topic !== topic) return;
        const p = m.payload || {};
        if (m.event === 'phx_reply' && p.status === 'ok' && !ch.joined) { ch.joined = true; tries = 0; if (!ch.meta.at) ch.meta.at = Date.now(); track(); setStatus('joined'); }
        else if (m.event === 'phx_reply' && p.status === 'error') setStatus('error');
        else if (m.event === 'phx_error' || m.event === 'phx_close') { if (ch.closed) setStatus('closed'); else { try { ws.close(); } catch (e) { /* egal */ } lost(); } }
        else if (m.event === 'presence_state') { for (const k of Object.keys(state)) delete state[k]; for (const [k, v] of Object.entries(p)) if (v.metas && v.metas.length) state[k] = v.metas[v.metas.length - 1]; publish(); }
        else if (m.event === 'presence_diff') {
          for (const [k, v] of Object.entries(p.leaves || {})) {            // nur loeschen, wenn der gehende Eintrag der aktuelle ist (ein erneutes track() meldet erst 'leave' des alten, dann 'join' des neuen Eintrags, auch in getrennten Nachrichten)
            const cur = state[k];
            if (!cur || !cur.phx_ref || !v.metas || !v.metas.length || v.metas.some((q) => q.phx_ref === cur.phx_ref)) delete state[k];
          }
          for (const [k, v] of Object.entries(p.joins || {})) if (v.metas && v.metas.length) state[k] = v.metas[v.metas.length - 1];
          publish();
        } else if (m.event === 'broadcast' && p.event) { if (p.event === 'rtc') { if (ch.mesh) ch.mesh.signalIn(p.payload); } else accept(p.event, p.payload); }
      };
      ws.onerror = () => { /* onclose folgt, dort wird neu verbunden */ };
      ws.onclose = () => { if (ch.ws === ws) lost(); };
    };
    connect();
    // Senden: direkt an alle, mit denen ein Kanal offen ist; erreicht das nicht alle, zusaetzlich ueber den Relay (Rueckfall)
    ch.seq = 0;
    ch.send = (event, payload) => {
      const body = Object.assign({ from: id, _n: ++ch.seq }, payload || {});
      if (ch.mesh && ch.mesh.send(LIVE[event] ? 'live' : 'rel', JSON.stringify({ event, payload: body }))) return;
      if (LIVE[event] && ch.ws && ch.ws.bufferedAmount > 48000) return;
      send('broadcast', { type: 'broadcast', event, payload: body });
    };
    // Verbindungsart fuer die Anzeige: 'P2P' (alle direkt), 'MIX' (teils direkt), 'RELAY' (alles ueber den Server)
    ch.link = () => { if (!ch.mesh) return 'RELAY'; const st = ch.mesh.stats(); return !st.peers ? 'RELAY' : st.open === st.peers ? 'P2P' : st.open ? 'MIX' : 'RELAY'; };
    // Anwesenheit aktualisieren: schnelle Folgen (z. B. beim Durchblaettern der Sets) werden zu einer Nachricht zusammengefasst, sonst drosselt/beendet der Server die Verbindung
    ch.update = (meta) => {
      Object.assign(ch.meta, meta);
      if (!ch.joined || ch.updT) return;
      if (typeof setTimeout !== 'function') { track(); return; }
      ch.updT = setTimeout(() => { ch.updT = null; if (!ch.closed) track(); }, 350);
    };
    ch.close = () => {
      ch.closed = true; clearInterval(ch.hb); if (ch.mesh) ch.mesh.close(); if (ch.rt && typeof clearTimeout === 'function') clearTimeout(ch.rt); if (ch.updT && typeof clearTimeout === 'function') clearTimeout(ch.updT);
      try { send('phx_leave', {}); ch.ws.close(); } catch (e) { /* schon zu */ }
      setStatus('closed');
    };
    return ch;
  },
};
