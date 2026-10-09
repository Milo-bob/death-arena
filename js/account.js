// Konto + Cloud-Sync (Settings > ACCOUNT). Spielstände (die 3 Slots) liegen zusätzlich in einer Supabase-Datenbank, pro Konto.
// Der Code-Export/Import (transfer.js) bleibt unverändert daneben bestehen. Keine Fremdbibliothek: nur fetch gegen die Supabase-REST-Schnittstellen.
// Ohne URL/KEY unten (oder ohne Netz) läuft das Spiel genau wie vorher, der Menüpunkt zeigt dann nur einen Hinweis.
//
// Ablauf: Login mit Benutzername + Passwort (intern als <name>@players.holiday-games.com, damit niemand eine echte E-Mail braucht).
// Pro Slot merkt sich der Client die Prüfsumme des zuletzt abgeglichenen Standes (meta.base). Beim Abgleich:
//   nur lokal geändert -> hochladen, nur Cloud geändert -> herunterladen, beides geändert (oder erstes Verbinden) -> der Nutzer wählt.
// Danach lädt jedes Speichern (Save.write -> Account.dirty) den aktiven Slot nach 6 s Ruhe hoch. Heruntergeladen wird nur im Menü.

const Account = {
  URL: 'https://kqtjtagbhaaddfqibaxh.supabase.co',            // z. B. https://abcdefgh.supabase.co  (Supabase > Project Settings > API > Project URL)
  KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxdGp0YWdiaGFhZGRmcWliYXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NTAzMDQsImV4cCI6MjEwNzEyNjMwNH0.dqw0HzW7UNdr_xW7BzauWXzAMJaP7M8TcUQwe5IjC78',            // der öffentliche "anon"/"publishable" Key (darf im Spiel stehen, der Schutz kommt von den Zeilenregeln in tools/supabase_setup.sql)
  DOMAIN: 'players.holiday-games.com',
  META_KEY: 'deatharena.account',
  DELAY: 6000,

  meta: null,         // { name, uid, tok, ref, exp, base: { slot: Prüfsumme } } oder null (nicht angemeldet)
  changed: false,      // seit dem letzten Abgleich wurde etwas gespeichert -> beim naechsten Hauptmenue abgleichen
  syncing: 0, spinUntil: 0, doneAt: 0, doneOk: true, doneOffline: false, inMenu: false,
  status: '', statusColor: null, busy: false, pushing: false, timer: null, started: false,
  conflicts: {},      // slot -> { local, cloud } (Code-Texte), wartet auf die Wahl des Nutzers
  el: null, refresh: null,

  get configured() { return !!(this.URL && this.KEY); },
  get on() { return !!(this.meta && this.meta.ref); },

  load() {
    try { const raw = localStorage.getItem(this.META_KEY); if (raw) this.meta = JSON.parse(raw); } catch (e) { this.meta = null; }
    if (this.meta && !this.meta.base) this.meta.base = {};
  },
  saveMeta() { try { if (this.meta) localStorage.setItem(this.META_KEY, JSON.stringify(this.meta)); else localStorage.removeItem(this.META_KEY); } catch (e) { /* ignorieren */ } },
  say(text, color) { this.status = text; this.statusColor = color || null; if (this.refresh) this.refresh(); },

  // ---- Netz ----
  async http(method, path, body, token, extra) {
    try {
      const h = Object.assign({ apikey: this.KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || this.KEY) }, extra || {});
      const res = await fetch(this.URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      let json = null; try { json = await res.json(); } catch (e) { /* leere Antwort (204) */ }
      return { ok: res.ok, status: res.status, json };
    } catch (e) { return { ok: false, status: 0, offline: true, json: null }; }
  },
  errText(r) {
    if (r.offline) return 'NO CONNECTION';
    const m = String((r.json && (r.json.msg || r.json.error_description || r.json.message || r.json.error)) || '');
    if (/already registered|already exists/i.test(m)) return 'THIS NAME IS ALREADY TAKEN';
    if (/invalid login/i.test(m)) return 'WRONG NAME OR PASSWORD';
    if (/password/i.test(m) && /(least|short|weak)/i.test(m)) return 'PASSWORD TOO SHORT (6+ CHARACTERS)';
    if (/rate limit|too many/i.test(m)) return 'TOO MANY TRIES - WAIT A MINUTE';
    return m ? m.slice(0, 80).toUpperCase() : 'ERROR ' + r.status;
  },
  emailOf(name) { return name.toLowerCase() + '@' + this.DOMAIN; },
  validName(name) { return /^[a-z0-9_]{3,20}$/i.test(name); },

  setSession(j, name) {
    const prev = this.meta;
    this.meta = { name: name || (prev && prev.name) || '', uid: j.user.id, tok: j.access_token, ref: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000,
      base: prev && prev.name === name ? prev.base || {} : {} };
    this.saveMeta();
  },
  async auth(kind, name, pw) {
    if (!this.configured) return { ok: false, error: 'CLOUD SAVES ARE NOT SET UP YET' };
    if (!this.validName(name)) return { ok: false, error: 'NAME: 3-20 LETTERS, NUMBERS OR _' };
    if (String(pw).length < 6) return { ok: false, error: 'PASSWORD TOO SHORT (6+ CHARACTERS)' };
    const body = { email: this.emailOf(name), password: pw };
    const r = kind === 'signup' ? await this.http('POST', '/auth/v1/signup', body) : await this.http('POST', '/auth/v1/token?grant_type=password', body);
    if (!r.ok) return { ok: false, error: this.errText(r) };
    if (!r.json || !r.json.access_token) return { ok: false, error: 'ACCOUNT MADE, BUT E-MAIL CONFIRMATION IS STILL ON (SEE tools/supabase_setup.sql)' };
    this.setSession(r.json, name.toLowerCase());
    return { ok: true };
  },
  logout() { this.meta = null; this.conflicts = {}; this.saveMeta(); clearTimeout(this.timer); },

  // Gültiges Zugriffs-Token (bei Bedarf erneuern). Gibt null zurück, wenn man neu anmelden muss oder offline ist.
  async token() {
    const m = this.meta; if (!m) return null;
    if (m.exp - Date.now() > 60000) return m.tok;
    const r = await this.http('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: m.ref });
    if (r.ok && r.json && r.json.access_token) { m.tok = r.json.access_token; m.ref = r.json.refresh_token; m.exp = Date.now() + (r.json.expires_in || 3600) * 1000; this.saveMeta(); return m.tok; }
    if (r.status === 400 || r.status === 401) { this.meta.ref = null; this.saveMeta(); this.say('SESSION EXPIRED - PLEASE LOG IN AGAIN', 'red'); }
    return null;
  },
  async rest(method, path, body, extra) {
    const t = await this.token(); if (!t) return { ok: false, status: 0, offline: !this.meta || !!this.meta.ref, json: null };
    return this.http(method, path, body, t, extra);
  },

  // ---- Slots lokal lesen/schreiben (der Slot muss dafür kurz der aktive sein) ----
  withSlot(i, fn) {
    const prev = Save.slot, was = this.pushing; this.pushing = true;
    try { if (i !== prev) Save.switchSlot(i); return fn(); }
    finally { if (i !== prev) Save.switchSlot(prev); this.pushing = was; }
  },
  localCode(i) { return this.withSlot(i, () => (Save.slotInfo(i) ? Save.exportCode() : null)); },
  hash(code) { return code ? Save.checksum(code) : ''; },
  // Anzeige-Daten eines Codes (für den Konflikt-Dialog)
  peek(code) {
    try {
      const m = /^DA1:([A-Za-z0-9+/=]+):/.exec(code), d = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      return { best: d.best || 0, runs: d.runs || 0, souls: d.souls || 0, wins: d.wins || 0 };
    } catch (e) { return null; }
  },
  async upload(i, code) {
    const r = await this.rest('POST', '/rest/v1/saves?on_conflict=user_id,slot', [{ user_id: this.meta.uid, slot: i, code }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
    if (r.ok) { this.meta.base[i] = this.hash(code); this.saveMeta(); }
    return r;
  },
  // Cloud-Stand in Slot i übernehmen (ersetzt den Slot, Achievements werden zusammengeführt); das Ergebnis geht wieder hoch, damit beide Seiten gleich sind
  async download(i, cloudCode) {
    const res = this.withSlot(i, () => Save.importCode(cloudCode));
    if (!res.ok) return { ok: false, status: 0, json: { msg: res.error } };
    const after = this.localCode(i);
    if (after && this.hash(after) !== this.hash(cloudCode)) return this.upload(i, after);
    this.meta.base[i] = this.hash(cloudCode); this.saveMeta();
    return { ok: true };
  },

  // ---- Abgleich aller Slots (nur im Menü aufrufen) ----
  async syncAll() {
    if (!this.on || this.busy) return;
    this.busy = true; this.syncing++; this.spinUntil = Date.now() + 700; this.changed = false; this.say('SYNCING...', 'grey');
    let ok = false, offline = false;
    try {
      const r = await this.rest('GET', '/rest/v1/saves?select=slot,code');
      if (!r.ok) { offline = !!r.offline; if (this.on) this.say(this.errText(r), 'red'); return; }
      const cloud = {}; for (const row of r.json || []) cloud[row.slot] = row.code;
      let up = 0, down = 0;
      this.conflicts = {};
      for (let i = 0; i < Save.SLOTS; i++) {
        const lc = this.localCode(i), cc = cloud[i] || null, lh = this.hash(lc), ch = this.hash(cc), base = this.meta.base[i];
        if (!lc && !cc) continue;
        let res = null;
        if (lh === ch) { this.meta.base[i] = lh; this.saveMeta(); continue; }
        if (!lc) { res = await this.download(i, cc); down++; }
        else if (!cc) { res = await this.upload(i, lc); up++; }
        else if (base === ch) { res = await this.upload(i, lc); up++; }
        else if (base === lh) { res = await this.download(i, cc); down++; }
        else { this.conflicts[i] = { local: lc, cloud: cc }; continue; }
        if (res && !res.ok) { offline = !!res.offline; this.say(this.errText(res), 'red'); return; }
      }
      ok = true;
      const nc = Object.keys(this.conflicts).length;
      this.say(nc ? 'CHOOSE WHICH SAVE TO KEEP (' + nc + ' SLOT' + (nc > 1 ? 'S' : '') + ')' : (up || down ? 'SYNCED: ' + up + ' UPLOADED, ' + down + ' DOWNLOADED' : 'EVERYTHING IS UP TO DATE'), nc ? 'orange' : 'teal');
    } finally { this.busy = false; this.syncing--; this.doneAt = Date.now(); this.doneOk = ok; this.doneOffline = offline; if (!ok) this.changed = true; if (this.refresh) this.refresh(); }
  },
  async resolve(i, choice) {
    const c = this.conflicts[i]; if (!c || this.busy) return;
    this.busy = true;
    try {
      const res = choice === 'cloud' ? await this.download(i, c.cloud) : await this.upload(i, this.localCode(i) || c.local);
      if (res.ok) { delete this.conflicts[i]; this.say(Object.keys(this.conflicts).length ? 'CHOOSE WHICH SAVE TO KEEP' : 'SYNCED', Object.keys(this.conflicts).length ? 'orange' : 'teal'); }
      else this.say(this.errText(res), 'red');
    } finally { this.busy = false; if (this.refresh) this.refresh(); }
  },

  // ---- Laufendes Hochladen: Save.write meldet jede Änderung, nach DELAY Ruhe wird der aktive Slot gesendet ----
  dirty() {
    if (this.pushing || !this.on) return;
    this.changed = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pushActive(), this.DELAY);
  },
  async pushActive() {
    if (!this.on || this.busy) return;
    const i = Save.slot; if (this.conflicts[i]) return;
    this.pushing = true; let code = null;
    try { code = Save.slotInfo(i) ? Save.exportCode() : null; } finally { this.pushing = false; }
    if (!code || this.hash(code) === this.meta.base[i]) return;
    const r = await this.upload(i, code);
    if (r.ok) this.say('SAVED TO CLOUD', 'teal');
    else if (!r.offline) this.say(this.errText(r), 'red');
  },
  flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; this.pushActive(); } },

  // ---- Dialog (HTML wie transfer.js: echte Eingabefelder, klappt im iframe und auf Tablets) ----
  open() {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = I18n.t(text); return e; };
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;font-family:"Pixelify Sans",monospace;');
    root.setAttribute('data-nogame', '1');
    const box = mk('div', 'width:min(520px,92vw);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.cyan + ';color:' + P.ice + ';');
    const btn = (label, color, fn) => { const b = mk('button', 'flex:1 1 130px;padding:10px 8px;margin:3px;cursor:pointer;background:' + P.voidLight + ';color:' + color + ';border:2px solid ' + color + ';font:inherit;font-size:15px;', label); b.onclick = fn; return b; };
    const input = (type, ph) => { const e = mk('input', 'width:100%;box-sizing:border-box;margin:4px 0;padding:8px;background:' + P.ink + ';color:' + P.ice + ';border:2px solid ' + P.cyanDark + ';font:16px monospace;'); e.type = type; e.placeholder = I18n.t(ph); e.autocomplete = type === 'password' ? 'current-password' : 'username'; e.spellcheck = false; return e; };
    const colorOf = (c) => (c && P[c]) || P.grey;
    let nameIn = null, pwIn = null;

    const render = () => {
      const keepName = nameIn ? nameIn.value : '', keepPw = pwIn ? pwIn.value : '';
      box.textContent = '';
      box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:22px;margin-bottom:6px;', 'ACCOUNT'));
      const msg = mk('div', 'min-height:20px;margin:8px 2px;font-size:14px;color:' + colorOf(this.statusColor) + ';', this.status);
      const row = mk('div', 'display:flex;flex-wrap:wrap;');
      if (!this.configured) {
        box.appendChild(mk('div', 'color:' + P.grey + ';font-size:14px;line-height:1.4;', 'Cloud saves are not set up in this version yet. Use EXPORT / IMPORT SAVE to move your save between devices.'));
      } else if (!this.on) {
        box.appendChild(mk('div', 'color:' + P.grey + ';font-size:13px;line-height:1.4;margin-bottom:6px;',
          'Log in to keep your 3 save slots in the cloud and play with the same progress on every device. Choose any name and a password. There is NO password reset, so remember it. The code transfer keeps working too.'));
        nameIn = input('text', 'NAME'); pwIn = input('password', 'PASSWORD (6+ CHARACTERS)');
        nameIn.value = keepName || (this.meta && this.meta.name) || ''; pwIn.value = keepPw;
        box.appendChild(nameIn); box.appendChild(pwIn); box.appendChild(msg);
        const go = async (kind) => {
          this.say(kind === 'signup' ? 'CREATING ACCOUNT...' : 'LOGGING IN...', 'grey');
          const r = await this.auth(kind, nameIn.value.trim(), pwIn.value);
          if (!r.ok) { this.say(r.error, 'red'); return; }
          pwIn = null; nameIn = null; this.say('LOGGED IN', 'teal'); await this.syncAll();
        };
        row.appendChild(btn('LOG IN', P.cyan, () => go('login'))); row.appendChild(btn('CREATE ACCOUNT', P.orange, () => go('signup')));
        pwIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('login'); });
      } else {
        nameIn = null; pwIn = null;
        box.appendChild(mk('div', 'color:' + P.teal + ';font-size:16px;margin-bottom:4px;', 'LOGGED IN AS ' + this.meta.name.toUpperCase()));
        box.appendChild(mk('div', 'color:' + P.grey + ';font-size:13px;line-height:1.4;', 'Your slots are uploaded a few seconds after every save and compared when the game starts. If you play on two devices, the last one to save wins, so let a device finish saving before you switch.'));
        box.appendChild(msg);
        for (const i of Object.keys(this.conflicts).map(Number)) {
          const c = this.conflicts[i], fmt = (p) => (p ? 'BEST ' + (p.best > 0 ? formatTime(p.best) : '-') + '   RUNS ' + p.runs + '   CREDITS ' + p.souls + (p.wins ? '   WINS ' + p.wins : '') : '?');
          const card = mk('div', 'border:2px solid ' + P.orange + ';padding:8px;margin:6px 0;');
          card.appendChild(mk('div', 'color:' + P.orange + ';font-size:15px;', 'SLOT ' + (i + 1) + ': THIS DEVICE AND THE CLOUD DIFFER'));
          card.appendChild(mk('div', 'font-size:13px;margin:4px 0;color:' + P.ice + ';', 'THIS DEVICE:  ' + fmt(this.peek(c.local))));
          card.appendChild(mk('div', 'font-size:13px;margin:4px 0;color:' + P.ice + ';', 'CLOUD:  ' + fmt(this.peek(c.cloud))));
          const r2 = mk('div', 'display:flex;flex-wrap:wrap;');
          r2.appendChild(btn('KEEP THIS DEVICE', P.cyan, () => this.resolve(i, 'local'))); r2.appendChild(btn('KEEP CLOUD', P.yellow, () => this.resolve(i, 'cloud')));
          card.appendChild(r2); box.appendChild(card);
        }
        row.appendChild(btn('SYNC NOW', P.cyan, () => this.syncAll())); row.appendChild(btn('LOG OUT', P.red, () => { this.logout(); this.say('LOGGED OUT (YOUR SAVES STAY ON THIS DEVICE)', 'grey'); }));
      }
      row.appendChild(btn('CLOSE', P.grey, () => this.close()));
      box.appendChild(row);
      if (nameIn) nameIn.focus();
    };
    this.refresh = render;
    root.appendChild(box); render();
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    root.addEventListener('wheel', (e) => e.stopPropagation());
    root.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
    document.body.appendChild(root);
    this.el = root;
  },
  close() {
    if (!this.el) return;
    this.el.remove(); this.el = null; this.refresh = null;
    Input.keys = {}; Input.pressedNow = {};
    window.focus();
  },
};
Account.load();
// Jedes Bild aus G.update aufgerufen: beim Wechsel ins Hauptmenue (und beim ersten Mal nach dem Start) wird abgeglichen, wenn man angemeldet ist und etwas gespeichert wurde
// (gekauft, Skin, Einstellung, Lauf ...). Nie mitten im Lauf, weil ein Abgleich Slots ersetzen kann. Konflikte oeffnen den Dialog.
Account.menuTick = function (mode) {
  if (mode !== 'start') { this.inMenu = false; return; }
  if (this.inMenu) return;
  this.inMenu = true;
  if (!this.on || !this.configured || (this.started && !this.changed)) return;
  this.started = true;
  this.syncAll().then(() => { if (Object.keys(this.conflicts).length) this.open(); });
};
document.addEventListener('visibilitychange', () => { if (document.hidden) Account.flush(); });
