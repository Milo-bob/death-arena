// Fehler melden / Ideen schicken (Settings > REPORT A BUG / FEEDBACK): ein HTML-Dialog über dem Spiel, damit Tastatur und Textfelder auch auf dem Handy und in der PWA gehen.
// Die Meldung landet in der Admin-Seite (Bugs & errors > REPORTS). Das Spiel hängt Version, Gerät, Bildschirm, Karte und Zeit automatisch an,
// den Namen nur, wenn man angemeldet ist. Server: tools/supabase_admin3.sql (bug_report). Fehlt die Funktion oder ist man offline, bleibt der Text im Feld
// und es gibt einen Knopf zur Holiday-Games-Seite.

const BugReport = {
  el: null, busy: false, kind: 'bug',
  WEB: 'https://www.holiday-games.com/games/death-arena-remake',

  deviceId() {
    try { let d = localStorage.getItem('deatharena.did'); if (!d) { d = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem('deatharena.did', d); } return d; } catch (e) { return ''; }
  },
  version() { try { return new Date(document.lastModified).toISOString().slice(0, 10); } catch (e) { return ''; } },
  context() {
    const c = { ver: this.version(), did: this.deviceId(), ua: String(navigator.userAgent || '').slice(0, 160), scr: window.innerWidth + 'x' + window.innerHeight, dpr: window.devicePixelRatio || 1, lang: (typeof Save !== 'undefined' && Save.data && Save.data.lang) || '' };
    try { c.pwa = !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { /* egal */ }
    try { c.touch = !!(typeof IS_MOBILE !== 'undefined' && IS_MOBILE); } catch (e) { /* egal */ }
    try { if (typeof G !== 'undefined' && G) { c.mode = G.mode; if (G.map && G.map.id) c.map = G.map.id; c.t = Math.round(G.time || 0); if (typeof Save !== 'undefined') c.slot = Save.slot; } } catch (e) { /* egal */ }
    return c;
  },
  openSite() {
    let w = null; try { w = window.open(this.WEB, '_blank'); if (w) w.opener = null; } catch (e) { w = null; }
    return !!w;
  },

  open() {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }       // sonst bleibt der Dialog unsichtbar
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = I18n.t(text); return e; };
    const font = 'font-family:"Pixel Digits","Pixelify Sans",monospace;';
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;' + font);
    root.setAttribute('data-nogame', '1');
    const box = mk('div', 'width:min(520px,94vw);max-height:94vh;overflow:auto;box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.cyan + ';color:' + P.ice + ';');
    const btn = (label, color) => mk('button', 'flex:1 1 130px;padding:10px 8px;margin:3px;cursor:pointer;background:' + P.voidLight + ';color:' + color + ';border:2px solid ' + color + ';font:inherit;font-size:15px;', label);
    const field = 'width:100%;box-sizing:border-box;background:' + P.ink + ';color:' + P.ice + ';border:2px solid ' + P.cyanDark + ';padding:8px;font:16px monospace;';
    box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:22px;margin-bottom:6px;', 'REPORT A BUG / FEEDBACK'));
    box.appendChild(mk('div', 'color:' + P.grey + ';font-size:13px;line-height:1.4;margin-bottom:8px;', 'Tell us what went wrong or what you would like to see. Game version, device and current screen are sent along' + (Account.on ? ', and your name.' : ' (no name, you are not logged in).')));
    const kinds = [['bug', 'BUG', P.red], ['idea', 'IDEA', P.yellow], ['other', 'OTHER', P.cyan]], kRow = mk('div', 'display:flex;flex-wrap:wrap;margin-bottom:4px;'), kb = {};
    const pick = (k) => { this.kind = k; kinds.forEach(([id, , col]) => { kb[id].style.background = id === k ? col : P.voidLight; kb[id].style.color = id === k ? P.ink : col; }); };
    kinds.forEach(([id, label, col]) => { const b = btn(label, col); b.onclick = () => pick(id); kb[id] = b; kRow.appendChild(b); });
    box.appendChild(kRow);
    const title = mk('input', field + 'margin-top:4px;'); title.type = 'text'; title.maxLength = 80; title.placeholder = I18n.t('SHORT TITLE'); title.autocomplete = 'off';
    const body = mk('textarea', field + 'height:130px;resize:vertical;margin-top:6px;font-size:14px;'); body.maxLength = 1000; body.placeholder = I18n.t('WHAT HAPPENED? WHAT DID YOU DO BEFORE IT?'); body.spellcheck = false;
    const msg = mk('div', 'min-height:20px;margin:6px 2px;font-size:14px;color:' + P.grey + ';');
    const say = (t, color) => { msg.textContent = I18n.t(t); msg.style.color = color || P.grey; };
    const row = mk('div', 'display:flex;flex-wrap:wrap;'), bSend = btn('SEND', P.green), bWeb = btn('OPEN WEBSITE', P.yellow), bClose = btn('CLOSE', P.grey);
    bWeb.style.display = 'none';
    bSend.onclick = () => this.send(title, body, say, bSend, bWeb);
    bWeb.onclick = () => { if (!this.openSite()) say('COULD NOT OPEN THE WEBSITE', P.red); };
    bClose.onclick = () => this.close();
    [bSend, bWeb, bClose].forEach((b) => row.appendChild(b));
    [title, body, msg, row].forEach((e) => box.appendChild(e));
    root.appendChild(box);
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });         // Tasten im Dialog gehören dem Dialog, nicht dem Spiel
    root.addEventListener('keyup', (e) => e.stopPropagation());
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    root.addEventListener('wheel', (e) => e.stopPropagation());
    root.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
    document.body.appendChild(root);
    this.el = root; pick(this.kind); title.focus();
  },

  async send(title, body, say, bSend, bWeb) {
    if (this.busy) return;
    const P = STYLE.pal, t = title.value.trim(), b = body.value.trim();
    if (t.length < 3) { say('PLEASE ADD A SHORT TITLE', P.orange); title.focus(); return; }
    if (typeof Account === 'undefined' || !Account.configured) { say('SENDING IS NOT AVAILABLE HERE - USE THE WEBSITE', P.orange); bWeb.style.display = ''; return; }
    this.busy = true; bSend.disabled = true; say('SENDING ...', P.grey);
    const args = { p_kind: this.kind, p_title: t, p_body: b, p_ctx: this.context() };
    let r = null;
    try { r = Account.on ? await Account.rest('POST', '/rest/v1/rpc/bug_report', args) : { ok: false }; if (!r.ok) r = await Account.http('POST', '/rest/v1/rpc/bug_report', args); } catch (e) { r = { ok: false, offline: true, json: null }; }
    this.busy = false; bSend.disabled = false;
    if (r.ok) { say('THANK YOU! YOUR REPORT WAS SENT', P.teal); title.value = ''; body.value = ''; setTimeout(() => this.close(), 1600); return; }
    const m = String((r.json && (r.json.message || r.json.msg)) || '');
    if (/too many reports/i.test(m)) say('TOO MANY REPORTS - TRY AGAIN LATER', P.orange);
    else if (r.status === 404 || /could not find the function|schema cache/i.test(m)) { say('REPORTS ARE NOT SET UP YET - USE THE WEBSITE', P.orange); bWeb.style.display = ''; }
    else if (r.offline) say('NO CONNECTION - YOUR TEXT IS KEPT, TRY AGAIN', P.red);
    else say('COULD NOT SEND (' + (r.status || '?') + ') - USE THE WEBSITE', P.red), bWeb.style.display = '';
  },

  close() {
    if (!this.el) return;
    this.el.remove(); this.el = null; this.busy = false;
    try { Input.pressedNow = {}; } catch (e) { /* egal */ }
  },
};
