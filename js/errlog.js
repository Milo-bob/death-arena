// Fehlermeldungen an den Entwickler (Admin-Seite > ERRORS). Anonym: nur Fehlertext, Ort im Spiel, Gerät und Datum der Seite, kein Name und kein Spielstand.
// Höchstens MAX Meldungen pro Start, jede Meldung nur einmal. Nicht gemeldet wird beim Öffnen als Datei, auf localhost und im Dev-Modus.
// Server: tools/supabase_admin2.sql (err_report). Fehlt die Funktion oder ist man offline, passiert nichts.

const ErrLog = {
  sent: 0, MAX: 5, seen: new Set(),
  skip() {
    try { return location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !!(typeof Save !== 'undefined' && Save.data && Save.data.dev); } catch (e) { return true; }
  },
  report(msg, where) {
    try {
      if (this.sent >= this.MAX || typeof Account === 'undefined' || !Account.configured || this.skip()) return;
      msg = String(msg || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!msg || /^script error\.?$/i.test(msg)) return;                          // fremde Skripte ohne Angaben
      const key = msg + '|' + where; if (this.seen.has(key)) return; this.seen.add(key); this.sent++;
      const ctx = (where || '?') + (typeof G !== 'undefined' && G ? ' mode=' + G.mode + ' t=' + Math.round(G.time || 0) : '');
      let ver = ''; try { ver = new Date(document.lastModified).toISOString().slice(0, 10); } catch (e) { /* egal */ }
      Account.http('POST', '/rest/v1/rpc/err_report', { p_msg: msg, p_ctx: ctx, p_ua: String(navigator.userAgent || '').slice(0, 160), p_ver: ver }).catch(() => {});
    } catch (e) { /* die Fehlermeldung darf nie selbst einen Fehler auslösen */ }
  },
};
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', (e) => ErrLog.report((e.message || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : ''), 'window'));
  window.addEventListener('unhandledrejection', (e) => ErrLog.report('promise: ' + ((e.reason && (e.reason.message || e.reason)) || 'rejected'), 'promise'));
}
