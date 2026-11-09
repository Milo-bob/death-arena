// Mitteilungen des Admins (Admin-Seite > GIFTS & NEWS). Erscheinen einmal pro Mitteilung als Fenster im Hauptmenü, auch ohne Anmeldung.
// Server: tools/supabase_admin2.sql (announce_get liefert die laufenden Mitteilungen). Gesehene IDs merkt sich das Gerät im localStorage.
// Bedienung: Leertaste / Enter / ESC / Klick = schließen. Fehlt die Funktion auf dem Server oder ist man offline, passiert nichts.

const Announce = {
  list: [], cur: null, open: false, busy: false, missing: false, loadedAt: 0, openedAt: 0, msgAt: 0, msgMissing: false,
  KEY: 'deatharena.announce.seen',

  seen() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  markSeen(id) { try { localStorage.setItem(this.KEY, JSON.stringify(this.seen().concat([id]).slice(-40))); } catch (e) { /* Speicher gesperrt: dann erscheint sie beim nächsten Start nochmal */ } },

  // jedes Bild im Hauptmenü: wartende Mitteilung zeigen (nicht über der Tagesbelohnung), sonst alle 10 Minuten nachsehen
  tick(mode) {
    if (mode !== 'start' || this.open) return;
    if (typeof Account !== 'undefined' && Account.on && !this.msgMissing && Date.now() - this.msgAt > 120000) { this.msgAt = Date.now(); this.loadMsgs(); }        // persoenliche Nachrichten vom Entwickler alle 2 Minuten
    if (this.list.length) { if (!Daily.open) this.show(); return; }
    if (this.busy || this.missing || typeof Account === 'undefined' || !Account.configured || Date.now() - this.loadedAt < 600000) return;
    this.busy = true;
    Account.http('POST', '/rest/v1/rpc/announce_get', {}).then((r) => {
      if (!r.ok) {
        if (r.status === 404 || /could not find the function|schema cache/i.test(String((r.json && r.json.message) || ''))) this.missing = true;
        else this.loadedAt = Date.now() - 540000;                                  // offline/Fehler: in einer Minute nochmal
        return;
      }
      this.loadedAt = Date.now();
      const seen = new Set(this.seen());
      this.list = this.list.filter((a) => a.msg).concat((Array.isArray(r.json) ? r.json : []).filter((a) => a && !seen.has(a.id)).sort((a, b) => a.id - b.id));        // schon geladene persoenliche Nachrichten bleiben
    }).catch(() => {}).then(() => { this.busy = false; });
  },
  // Persoenliche Nachrichten (Admin-Seite > Players > Message): kommen in dieselbe Warteschlange, werden nach dem Schliessen auf dem Server als gelesen markiert (tools/supabase_admin4.sql)
  loadMsgs() {
    Account.rest('POST', '/rest/v1/rpc/msg_poll', {}).then((r) => {
      if (!r.ok) { if (r.status === 404 || /could not find the function|schema cache/i.test(String((r.json && r.json.message) || ''))) this.msgMissing = true; return; }
      const seen = new Set(this.seen());
      for (const m of (Array.isArray(r.json) ? r.json : [])) { const id = 'm' + m.id; if (!m || seen.has(id) || this.list.some((a) => a.id === id) || (this.cur && this.cur.id === id)) continue; this.list.push({ id, mid: m.id, msg: true, title: m.title, body: m.body }); }
    }).catch(() => {});
  },
  show() { this.cur = this.list.shift(); if (!this.cur) return; this.open = true; this.openedAt = Date.now(); Input.pressedNow = {}; Sfx.play('levelUp'); },
  close() { if (this.cur) { this.markSeen(this.cur.id); if (this.cur.msg) Account.rest('POST', '/rest/v1/rpc/msg_ack', { p_id: this.cur.mid }).catch(() => {}); } this.cur = null; this.open = false; Input.pressedNow = {}; },
  update() {
    if (Date.now() - this.openedAt < 500) return;                                // Schonzeit, damit ein gerade gedrückter Menü-Knopf es nicht sofort schließt
    if (Input.pressed('Space') || Input.pressed('Enter') || Input.pressed('Escape')) this.close();
  },

  draw(ctx) {
    if (!this.open || !this.cur) return;
    const P = STYLE.pal, T = STYLE.type, a = this.cur, cx = STAGE_W / 2, w = 460, pulse = 0.55 + 0.45 * Math.sin(G.realTime * 4);
    const lines = Math.min(9, Math.max(1, Math.ceil(String(a.body).length / 52))), h = 118 + lines * 13, x = cx - w / 2, y = Math.max(20, Math.round((STAGE_H - h) / 2 - 10));
    UIHit.list.length = 0;                                                        // das Fenster liegt oben: darunter ist nichts klickbar
    UIHit.add(0, 0, STAGE_W, STAGE_H, () => {}, { noConfirm: true });
    ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = P.ink; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
    uiPanel(ctx, x, y, w, h, { color: P.cyan, fill: P.void, alpha: 0.98, glow: true });
    uiText(ctx, a.msg ? 'MESSAGE FROM THE DEVELOPER' : 'ANNOUNCEMENT', cx, y + 20, { size: T.small, color: P.grey, align: 'center' });
    uiText(ctx, String(a.title), cx, y + 42, { size: T.h1, color: P.yellow, align: 'center', glow: P.orange, maxW: w - 30 });
    uiWrap(ctx, String(a.body), cx, y + 66, w - 44, 13, { size: T.body, color: P.ice, align: 'center' });
    const bw = 150, bx = cx - bw / 2, by = y + h - 36;
    UIHit.add(bx, by, bw, 26, () => {}, { act: () => this.close() });
    uiPanel(ctx, bx, by, bw, 26, { color: P.green, fill: pulse > 0.7 ? P.voidLight : P.void, alpha: 0.95, glow: true });
    uiText(ctx, 'OK  [SPACE]', cx, by + 18, { size: T.h2, color: P.ice, align: 'center' });
  },
};
if (typeof I18n !== 'undefined') I18n.add({ 'ANNOUNCEMENT': 'MITTEILUNG', 'MESSAGE FROM THE DEVELOPER': 'NACHRICHT VOM ENTWICKLER' });
