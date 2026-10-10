// Mehrspieler-Verbindung (PvP-Lobby): ein Kanal pro Lobby ueber Supabase Realtime (WebSocket, Phoenix-Protokoll Version 1.0.0).
// Keine Fremdbibliothek, kein eigener Server: der Lobby-Code ist der Kanalname ("pvp-ABCDE"). Der Kanal entsteht beim ersten Beitritt von selbst.
// Presence = wer ist in der Lobby (Name, Host-Flag), Broadcast = Nachrichten an alle anderen (spaeter Eingaben und Spielstand).
//   const ch = Net.open(code, { name, host }, { onPlayers(list), onMessage(event, payload, fromId), onStatus(status) });
//   ch.send(event, payload); ch.update({ ...meta }); ch.close();
// Status: 'connecting' | 'joined' | 'closed' | 'error'. players = [{ id, name, host, ... }] (Reihenfolge: Host zuerst, dann nach Beitritt).

const Net = {
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',           // ohne I, O, 0, 1 (leicht zu verwechseln)
  CODE_LEN: 5,
  MAX_PLAYERS: 4,

  newCode() { let c = ''; for (let i = 0; i < this.CODE_LEN; i++) c += this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)]; return c; },
  cleanCode(s) { return String(s || '').toUpperCase().split('').filter((ch) => this.CODE_CHARS.includes(ch)).join('').slice(0, this.CODE_LEN); },
  newId() { return Math.random().toString(36).slice(2, 10); },
  get available() { return typeof WebSocket !== 'undefined' && typeof Account !== 'undefined' && Account.configured; },

  open(code, me, cb) {
    const id = me.id || this.newId(), topic = 'realtime:pvp-' + code;
    const ch = { id, code, status: 'connecting', players: [], ws: null, ref: 0, hb: null, meta: Object.assign({}, me, { id }), closed: false };
    const emit = (name, ...a) => { try { if (cb && cb[name]) cb[name](...a); } catch (e) { /* ein Fehler im Spiel darf die Verbindung nicht abbrechen */ } };
    const setStatus = (s) => { if (ch.status !== s) { ch.status = s; emit('onStatus', s); } };
    const send = (event, payload, t) => { if (ch.ws && ch.ws.readyState === 1) ch.ws.send(JSON.stringify({ topic: t || topic, event, payload, ref: String(++ch.ref) })); };
    const state = {};                                               // presence-Schluessel -> meta
    const publish = () => {
      const list = Object.values(state).sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0) || (a.at || 0) - (b.at || 0));
      ch.players = list; emit('onPlayers', list);
    };
    const track = () => send('presence', { type: 'presence', event: 'track', payload: ch.meta });
    try {
      const url = Account.URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(Account.KEY) + '&vsn=1.0.0';
      ch.ws = new WebSocket(url);
    } catch (e) { setStatus('error'); return ch; }
    ch.ws.onopen = () => {
      send('phx_join', { config: { broadcast: { self: false, ack: false }, presence: { key: id, enabled: true }, postgres_changes: [], private: false }, access_token: Account.KEY });
      ch.hb = setInterval(() => send('heartbeat', {}, 'phoenix'), 20000);
    };
    ch.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.topic !== topic) return;
      const p = m.payload || {};
      if (m.event === 'phx_reply' && p.status === 'ok' && !ch.joined) { ch.joined = true; ch.meta.at = Date.now(); track(); setStatus('joined'); }
      else if (m.event === 'phx_reply' && p.status === 'error') setStatus('error');
      else if (m.event === 'phx_error' || m.event === 'phx_close') setStatus(ch.closed ? 'closed' : 'error');
      else if (m.event === 'presence_state') { for (const k of Object.keys(state)) delete state[k]; for (const [k, v] of Object.entries(p)) if (v.metas && v.metas.length) state[k] = v.metas[v.metas.length - 1]; publish(); }
      else if (m.event === 'presence_diff') {
        for (const k of Object.keys(p.leaves || {})) delete state[k];
        for (const [k, v] of Object.entries(p.joins || {})) if (v.metas && v.metas.length) state[k] = v.metas[v.metas.length - 1];
        publish();
      } else if (m.event === 'broadcast' && p.event) emit('onMessage', p.event, p.payload, p.payload && p.payload.from);
    };
    ch.ws.onerror = () => { if (!ch.closed) setStatus('error'); };
    ch.ws.onclose = () => { clearInterval(ch.hb); setStatus(ch.closed ? 'closed' : 'error'); };
    ch.send = (event, payload) => send('broadcast', { type: 'broadcast', event, payload: Object.assign({ from: id }, payload || {}) });
    ch.update = (meta) => { Object.assign(ch.meta, meta); if (ch.joined) track(); };
    ch.close = () => {
      ch.closed = true; clearInterval(ch.hb);
      try { send('phx_leave', {}); ch.ws.close(); } catch (e) { /* schon zu */ }
      setStatus('closed');
    };
    return ch;
  },
};
