// Freunde einladen: persoenlicher Link (?ref=<Name>), Belohnung fuer beide, sobald der Eingeladene einen echten Lauf geschafft hat.
// Alles entscheidet der Server (tools/supabase_referral.sql: ref_claim / ref_status / ref_collect); das Spiel schreibt nur gut, was der Server zurueckgibt.
// Ablauf: Link oeffnen -> Spiel merkt sich den Namen (localStorage) -> sobald ein Konto angemeldet ist, wird er eingetragen -> nach dem ersten Lauf abholen.
// Fenster (HTML wie pwa.js) ueber das Symbol im Hauptmenue (menuQuick 'invite'); Teilen per Teilen-Menue des Geraets (WhatsApp, Signal ...), WhatsApp-Knopf oder Link kopieren.

const Ref = {
  KEY: 'da_ref',
  st: null, busy: false, loadedAt: 0, missing: false, el: null, msg: '', msgCol: '', claiming: false, dirty: true,

  init() {
    try { const m = /[?&]ref=([A-Za-z0-9_.-]{1,40})/.exec(location.search); if (m) localStorage.setItem(this.KEY, m[1].toLowerCase()); } catch (e) { /* ohne Speicher kein Merken */ }
  },
  get stored() { try { return localStorage.getItem(this.KEY) || ''; } catch (e) { return ''; } },
  forget() { try { localStorage.removeItem(this.KEY); } catch (e) { /* egal */ } },
  get on() { return typeof Account !== 'undefined' && Account.configured && Account.on && !this.missing; },
  get ready() { return this.on && this.st ? this.st.ready | 0 : 0; },
  get name() { return String((this.st && this.st.name) || (Account.meta && Account.meta.name) || '').toLowerCase(); },
  get link() { return 'https://' + (typeof Share !== 'undefined' ? Share.url : 'death-arena.holiday-games.com') + '/' + (this.name ? '?ref=' + encodeURIComponent(this.name) : ''); },
  get text() { return (typeof I18n !== 'undefined' && I18n.lang === 'de' ? 'Spiel DeathArena mit mir! Ein Arcade-Shooter direkt im Browser, kostenlos. Leg ein Konto an und schaff einen Lauf, dann bekommen wir beide eine Belohnung: ' : 'Play DeathArena with me! A free arcade shooter right in your browser. Make an account and finish one run, then we both get a reward: ') + this.link; },

  isMissing(r) { return !r.ok && (r.status === 404 || /could not find the function/i.test(String((r.json && r.json.message) || ''))); },

  // Jedes Bild im Hauptmenue: gemerkten Einladungsnamen eintragen (einmal) und den Stand holen (beim ersten Mal, danach alle 5 Minuten oder nach einer Aenderung)
  tick(mode) {
    if (mode !== 'start' || !this.on || this.busy) return;
    const now = Date.now();
    if (this.stored && !this.claiming) {
      this.claiming = true;
      Account.rest('POST', '/rest/v1/rpc/ref_claim', { p_name: this.stored }).then((r) => {
        if (this.isMissing(r)) { this.missing = true; return; }
        if (r.ok && r.json) { this.forget(); this.dirty = true; if (r.json.ok) this.say('INVITE ACCEPTED - FINISH A RUN TO GET YOUR BONUS', 'green'); }
      }).catch(() => {}).then(() => { this.claiming = false; });
      return;
    }
    if (this.st && !this.dirty && now - this.loadedAt < 300000) return;
    this.load();
  },
  say(text, col) { this.msg = text; this.msgCol = col || ''; if (this.el && this.refresh) this.refresh(); },
  async load() {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await Account.rest('POST', '/rest/v1/rpc/ref_status', {});
      if (this.isMissing(r)) { this.missing = true; return; }
      if (r.ok && r.json && typeof r.json === 'object') { this.st = r.json; this.dirty = false; this.loadedAt = Date.now(); }
      else this.loadedAt = Date.now() - 240000;                                  // Fehler/offline: in einer Minute nochmal
    } catch (e) { /* egal */ } finally { this.busy = false; if (this.el && this.refresh) this.refresh(); }
  },
  async collect() {
    if (this.busy || !this.ready) return;
    this.busy = true;
    try {
      const r = await Account.rest('POST', '/rest/v1/rpc/ref_collect', {});
      if (r.ok && r.json && r.json.ok) {
        const cr = Math.max(0, Number(r.json.credits) || 0), sh = Math.max(0, Math.floor(Number(r.json.shards) || 0));
        Save.data.souls = (Save.data.souls || 0) + cr; Save.addShards(sh); Save.write();
        Sfx.play('levelUp'); this.msg = '+' + cr + ' CREDITS  +' + sh + ' SHARDS'; this.msgCol = 'yellow';
      } else { this.msg = r.ok ? 'NOTHING TO COLLECT YET' : Account.errText(r); this.msgCol = 'red'; Sfx.play('deny'); }
    } catch (e) { this.msg = 'CONNECTION FAILED'; this.msgCol = 'red'; } finally { this.busy = false; this.dirty = true; this.load(); }
  },

  async share() {
    const msg = { title: 'DeathArena', text: this.text };
    try {
      if (navigator.share) { await navigator.share(msg); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    this.copy();
  },
  whatsapp() { try { window.open('https://wa.me/?text=' + encodeURIComponent(this.text), '_blank', 'noopener'); } catch (e) { this.copy(); } },
  copy() {
    const done = () => this.say('LINK COPIED!', 'green'), fail = () => this.say('PRESS AND HOLD THE LINK TO COPY IT', 'red');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(this.link).then(done, fail);
      else { const t = document.createElement('textarea'); t.value = this.link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
    } catch (e) { fail(); }
  },

  // ---- Fenster ----
  open() {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }
    this.msg = ''; this.dirty = true; if (this.on) this.load();
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = I18n.t(text); return e; };
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;font-family:"Pixel Digits","Pixelify Sans",monospace;');
    root.setAttribute('data-nogame', '1');
    const box = mk('div', 'width:min(480px,92vw);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.orange + ';color:' + P.ice + ';');
    const btn = (label, col, fn, off) => {
      const b = mk('button', 'display:block;box-sizing:border-box;width:100%;text-align:center;padding:10px 8px;margin:8px 0 0;cursor:' + (off ? 'default' : 'pointer') + ';background:' + P.voidLight + ';color:' + (off ? P.grey : col) + ';border:2px solid ' + (off ? P.grey : col) + ';font:inherit;font-size:16px;', label);
      if (!off) b.onclick = fn;
      return b;
    };
    const render = () => {
      box.textContent = '';
      box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:22px;margin-bottom:8px;', 'INVITE FRIENDS'));
      const st = this.st, info = mk('div', 'border:2px solid ' + P.cyanDark + ';background:' + P.ink + ';padding:10px 12px;font-size:14px;line-height:1.5;color:' + P.ice + ';');
      if (!this.on) {
        info.textContent = I18n.t(Account.configured ? 'Log in to get your own invite link.' : 'Invites need an account (not set up here).');
        box.appendChild(info);
        if (Account.configured) box.appendChild(btn('LOG IN', P.green, () => { this.close(); Account.open(); }));
      } else {
        const per = st ? st.per_credits + ' CREDITS + ' + st.per_shards + ' SHARDS' : '';
        info.textContent = I18n.t('Send your link to a friend. When they have an account and finish their first run, you BOTH get a reward.') + (st ? ' ' + per + ' (' + I18n.t('UP TO') + ' ' + st.max + ' ' + I18n.t('FRIENDS') + ').' : '');
        box.appendChild(info);
        const link = mk('div', 'margin-top:10px;padding:8px;border:2px solid ' + P.greyMid + ';color:' + P.cyan + ';font-size:13px;word-break:break-all;user-select:all;', '');
        link.textContent = this.link; box.appendChild(link);
        box.appendChild(btn('SHARE LINK', P.green, () => this.share()));
        box.appendChild(btn('WHATSAPP', P.green, () => this.whatsapp()));
        box.appendChild(btn('COPY LINK', P.cyan, () => this.copy()));
        if (st) {
          if (st.by) box.appendChild(mk('div', 'margin-top:12px;font-size:14px;color:' + (st.by_ready ? P.green : P.yellow) + ';', st.by_claimed ? 'INVITE BONUS COLLECTED' : st.by_ready ? 'YOUR INVITE BONUS IS READY!' : 'YOU WERE INVITED: FINISH A RUN TO GET YOUR BONUS'));
          if (st.invited && st.invited.length) {
            box.appendChild(mk('div', 'margin-top:12px;font-size:14px;color:' + P.grey + ';', 'YOUR FRIENDS'));
            st.invited.forEach((f) => {
              const row = mk('div', 'display:flex;justify-content:space-between;font-size:14px;margin-top:4px;');
              row.appendChild(mk('span', 'color:' + P.ice + ';', '')); row.firstChild.textContent = String(f.name).toUpperCase();
              row.appendChild(mk('span', 'color:' + (f.state === 'ready' ? P.green : f.state === 'claimed' ? P.cyan : P.grey) + ';', f.state === 'ready' ? 'READY TO COLLECT' : f.state === 'claimed' ? 'BONUS COLLECTED' : 'WAITING FOR THEIR FIRST RUN'));
              box.appendChild(row);
            });
          }
          const n = st.ready | 0;
          box.appendChild(btn(n ? 'COLLECT: ' + st.credits + ' CREDITS + ' + st.shards + ' SHARDS' : 'NOTHING TO COLLECT YET', P.yellow, () => this.collect(), !n || this.busy));
        } else box.appendChild(mk('div', 'margin-top:10px;font-size:14px;color:' + P.grey + ';', 'LOADING...'));
      }
      if (this.msg) box.appendChild(mk('div', 'margin-top:10px;font-size:15px;text-align:center;color:' + (P[this.msgCol] || P.ice) + ';', this.msg));
      const c = mk('button', 'display:block;box-sizing:border-box;width:100%;text-align:center;padding:10px 8px;margin:10px 0 0;cursor:pointer;background:' + P.voidLight + ';color:' + P.grey + ';border:2px solid ' + P.grey + ';font:inherit;font-size:15px;', 'CLOSE'); c.onclick = () => this.close(); box.appendChild(c);
    };
    this.refresh = render; render();
    root.appendChild(box);
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
Ref.init();

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'INVITE FRIENDS': 'FREUNDE EINLADEN', 'INVITE ACCEPTED - FINISH A RUN TO GET YOUR BONUS': 'EINLADUNG ANGENOMMEN - SPIELE EINEN LAUF FÜR DEINEN BONUS',
  'Log in to get your own invite link.': 'Melde dich an, um deinen eigenen Einladungslink zu bekommen.', 'Invites need an account (not set up here).': 'Einladungen brauchen ein Konto (hier nicht eingerichtet).',
  'Send your link to a friend. When they have an account and finish their first run, you BOTH get a reward.': 'Schick deinen Link an einen Freund. Wenn er ein Konto hat und seinen ersten Lauf schafft, bekommt ihr BEIDE eine Belohnung.',
  'UP TO': 'BIS ZU', 'SHARE LINK': 'LINK TEILEN', 'LINK COPIED!': 'LINK KOPIERT!',
  'PRESS AND HOLD THE LINK TO COPY IT': 'HALTE DEN LINK GEDRÜCKT, UM IHN ZU KOPIEREN', 'LOG IN': 'ANMELDEN',
  'INVITE BONUS COLLECTED': 'EINLADUNGSBONUS ABGEHOLT', 'YOUR INVITE BONUS IS READY!': 'DEIN EINLADUNGSBONUS IST BEREIT!', 'YOU WERE INVITED: FINISH A RUN TO GET YOUR BONUS': 'DU WURDEST EINGELADEN: SPIELE EINEN LAUF FÜR DEINEN BONUS',
  'YOUR FRIENDS': 'DEINE FREUNDE', 'READY TO COLLECT': 'ZUM ABHOLEN BEREIT', 'BONUS COLLECTED': 'BONUS ABGEHOLT', 'WAITING FOR THEIR FIRST RUN': 'WARTET AUF DEN ERSTEN LAUF',
  'NOTHING TO COLLECT YET': 'NOCH NICHTS ZUM ABHOLEN', 'CONNECTION FAILED': 'VERBINDUNG FEHLGESCHLAGEN',
  'INVITE A FRIEND': 'FREUND EINLADEN', 'YOU WERE INVITED - LOG IN OR CREATE AN ACCOUNT FOR YOUR BONUS': 'DU WURDEST EINGELADEN - MELDE DICH AN FÜR DEINEN BONUS',
});
if (typeof I18n !== 'undefined' && I18n.phrases) I18n.phrases([['COLLECT: ', 'ABHOLEN: '], [' CREDITS + ', ' CREDITS + '], [' SHARDS', ' SHARDS']]);
