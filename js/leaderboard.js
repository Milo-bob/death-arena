// Ranglisten (Hauptmenü-Symbol oben rechts oder Taste B). Berechnet und sortiert wird in der Datenbank (tools/supabase_leaderboard.sql):
// pro Konto zaehlt nur der beste Slot, Dev-Staende fehlen, mitmachen kann nur, wer sich eintraegt (Opt-in).
// Das Spiel fragt pro Liste die Funktionen lb_page (Top 100, fertig sortiert mit Platz) und lb_me (eigener Platz) ab.
// Bedienung: A/D oder Pfeile = Liste wechseln, W/S = scrollen, Leertaste = mitmachen/austreten, R = neu laden, ESC = zurueck.

const Board = {
  pages: {},                          // Liste-ID -> { rows: [{ rank, name, val, mine }], total, me: { rank, val } | null, error, at }
  loading: {}, optIn: null, busy: false, error: '', admin: false, banAsk: null,
  tab: 0, top: 0,
  LIMIT: 100, TTL: 60000,

  // Listen: id = Name der Liste in der Datenbank, fmt = Anzeige des Wertes
  tabs() {
    const f = (v) => String(Math.floor(v));
    const list = [
      { id: 'total', label: 'TOTAL', hint: 'SOLO WINS, PVP WINS AND ACHIEVEMENTS, A LITTLE FOR BOSSES AND KILLS (POINTS)', fmt: f, unit: 'PTS' },
      { id: 'wins', label: 'WINS', hint: 'DEATH DEFEATED IN SINGLEPLAYER', fmt: f },
      { id: 'pvp', label: 'PVP WINS', hint: 'PVP ROUNDS WON AGAINST OTHER PLAYERS', fmt: f },
      { id: 'ach', label: 'ACHIEVEMENTS', hint: 'ACHIEVEMENTS UNLOCKED', fmt: f },
      { id: 'plv', label: 'PLAYER LEVEL', hint: 'LEVEL OF THE SAVE FILE', fmt: (v) => 'LV ' + Save.levelInfo(v).lv },
    ];
    if (this.admin) list.push({ id: 'banned', label: 'BANNED', hint: 'HIDDEN FROM ALL LISTS  -  UNBAN TO BRING THEM BACK', fmt: () => '' });   // nur fuer Admins                                                          // alle Seed-Run-Listen = eine Kategorie, unten wechselt man zwischen ihnen (Q/E)
    return list;
  },
  cur() { return this.tabs()[this.tab]; },
  page() { return this.pages[this.cur().id] || null; },

  // Anzeigeliste: echte Eintraege, dazu der eigene Platz (falls ausserhalb der Top 100 oder ohne Wert) und unten aufgefuellte Bots,
  // damit die Liste lebendiger wirkt. Bots stehen immer unter allen echten Spielern und sind rein lokal (nichts davon geht an die Datenbank).
  BOT_NAMES: ['NIGHTFANG', 'xX_REAPER_Xx', 'PixelWitch', 'GrimTom', 'LunaBlade', 'ToxicToast', 'KRAKEN', 'Skelly99', 'VoidWalker', 'DarkMilk', 'FrostByte', 'ZombieZoe', 'ShadowFox', 'Mr_Bones', 'CritQueen', 'DashDemon', 'SoulSucker', 'OmegaNoob', 'BoneAppetit', 'NeonViper', 'Cinder', 'HexHunter', 'GhostPepper', 'RektRex', 'LootGoblin', 'Wraith_7', 'IceCold', 'Sir_Dies_A_Lot', 'MoonMage', 'Tankenstein', 'RedEye', 'Scythe', 'Bubblegum', 'DeathWish', 'Sparky', 'NoScope', 'Valkyra', 'EmberKid', 'Phantom', 'Slayzy'],
  view(pg, tb) {
    if (!pg || !pg.rows) return [];
    const rows = pg.rows.slice();
    if (tb.id === 'banned') return rows;
    if (Account.on && this.optIn && pg.me && !rows.some((r) => r.mine)) rows.push({ rank: pg.me.rank, name: (Account.meta && Account.meta.name) || 'YOU', val: pg.me.val, mine: true });    // eigener Platz ausserhalb der Top 100
    if (pg.rows.length < pg.total || pg.rows.length >= this.LIMIT) return rows;          // Liste nicht komplett: keine Bots
    // Bots reihen sich nach Wert ein (Werte decken die Spanne der echten Spieler ab), danach werden die Plaetze neu vergeben
    const vals = pg.rows.map((r) => r.val).sort((x, y) => x - y), med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    const total = tb.id === 'total', hi = Math.max(med * 1.3, total ? 900 : 3), lo = total ? 60 : 1, want = Math.max(0, 30 - rows.length);
    let seed = 0; for (const ch of tb.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pool = this.BOT_NAMES.slice().sort(() => rnd() - 0.5);
    for (let i = 0; i < want; i++) {
      const v = Math.max(lo, Math.round(hi * Math.pow(lo / hi, i / Math.max(1, want - 1)) * (0.9 + rnd() * 0.1)));
      rows.push({ rank: 0, name: pool[i % pool.length], val: v, mine: false, bot: true });
    }
    rows.sort((x, y) => y.val - x.val || (x.bot ? 1 : 0) - (y.bot ? 1 : 0));
    rows.forEach((r) => { r.rank = 1 + rows.filter((o) => o.val > r.val).length; });
    return rows;
  },

  open() { this.tab = Math.min(this.tab, this.tabs().length - 1); this.top = 0; this.error = ''; this.banAsk = null; this.loadAdmin(); this.loadOptIn().then(() => this.load(this.cur().id, true)); },

  // Eine Liste laden (hoechstens einmal pro Minute, ausser force)
  async load(id, force) {
    const old = this.pages[id];
    if (this.loading[id] || (!force && old && Date.now() - old.at < this.TTL)) return;
    if (!Account.configured) { this.error = 'CLOUD SAVES ARE NOT SET UP YET'; return; }
    this.loading[id] = true;
    try {
      const fnPage = id === 'banned' ? 'lb_banned' : 'lb_page', fnMe = 'lb_me';
      const a = await Account.http('POST', '/rest/v1/rpc/' + fnPage, Object.assign({ p_board: id, p_limit: this.LIMIT, p_offset: 0 }, this.admin ? { p_key: this.key() } : {}), Account.on ? await Account.token() : null);
      if (!a.ok) { this.pages[id] = old || { rows: null, total: 0, me: null, at: 0 }; this.pages[id].error = a.offline ? 'NO CONNECTION' : 'LEADERBOARD IS NOT SET UP YET'; return; }
      const rows = (a.json || []).map((r) => ({ rank: r.rank, name: r.name, val: +r.val, mine: !!r.mine, uid: r.uid || null }));
      let me = null;
      if (Account.on && id !== 'banned') { const b = await Account.rest('POST', '/rest/v1/rpc/' + fnMe, { p_board: id }); if (b.ok && b.json && b.json[0]) me = { rank: b.json[0].rank, val: +b.json[0].val, total: b.json[0].total }; }
      this.pages[id] = { rows, total: a.json && a.json[0] ? +a.json[0].total : 0, me, error: '', at: Date.now() };
    } finally { this.loading[id] = false; }
  },

  // Moderation haengt am SPIELSTAND, nicht am Konto: nur der Slot mit der Dev-Save-Datei hat den geheimen Schluessel (Save.data.devKey).
  // Der Server kennt nur dessen Hash (Tabelle lb_admin_key) und sagt, ob er stimmt. Nur dann gibt es BAN-Knoepfe und den Reiter BANNED.
  key() { return Save.data.dev === true && typeof Save.data.devKey === 'string' && Save.data.devKey.length >= 16 ? Save.data.devKey : null; },
  async loadAdmin() {
    const k = this.key();
    if (!k || !Account.configured) { this.admin = false; return; }
    const r = await Account.http('POST', '/rest/v1/rpc/lb_is_admin', { p_key: k }, null);
    const was = this.admin;
    this.admin = !!(r.ok && r.json === true);
    if (this.admin && !was) { this.pages = {}; this.load(this.cur().id, true); }          // erste Liste war ohne Schluessel geladen: jetzt mit Spieler-IDs fuer BAN
    if (!this.admin && this.tab >= this.tabs().length) this.tab = 0;
  },

  // Zweistufig: erst Klick = "SURE?", zweiter Klick auf denselben Eintrag fuehrt aus. Danach werden alle Listen neu geladen.
  async moderate(e, unban) {
    if (!this.admin || !e.uid || this.busy) return;
    if (this.banAsk !== e.uid) { this.banAsk = e.uid; return; }
    this.banAsk = null; this.busy = true;
    try {
      const r = await Account.http('POST', '/rest/v1/rpc/' + (unban ? 'lb_unban' : 'lb_ban'), { p_user: e.uid, p_key: this.key() }, null);
      if (r.ok) { this.pages = {}; this.error = ''; this.load(this.cur().id, true); }
      else this.error = Account.errText(r);
    } finally { this.busy = false; }
  },

  // Automatisch mitmachen: wer angemeldet ist, wird beim ersten Mal eingetragen. Nur wer selbst LEAVE LIST gedrueckt hat, bleibt draussen (Merker pro Konto im Browser).
  leftKey() { return 'da_lb_left_' + (Account.meta ? Account.meta.uid : ''); },
  hasLeft() { try { return localStorage.getItem(this.leftKey()) === '1'; } catch (e) { return false; } },
  setLeft(v) { try { if (v) localStorage.setItem(this.leftKey(), '1'); else localStorage.removeItem(this.leftKey()); } catch (e) { /* egal */ } },
  tick() {                                                                                 // jedes Bild; arbeitet nur einmal pro Konto und Sitzung
    if (!Account.on || !Account.meta || this.autoUid === Account.meta.uid || this.autoBusy) return;
    this.autoBusy = true;
    const uid = Account.meta.uid;
    this.loadOptIn().then(() => { if (this.optIn !== null) this.autoUid = uid; }).catch(() => {}).then(() => { this.autoBusy = false; });
  },
  async loadOptIn() {
    if (!Account.on) { this.optIn = null; return; }
    const r = await Account.rest('GET', '/rest/v1/lb_optin?select=user_id');
    if (!r.ok) return;
    this.optIn = (r.json || []).length > 0;
    if (!this.optIn && !this.hasLeft()) {
      const j = await Account.rest('POST', '/rest/v1/lb_optin', [{ user_id: Account.meta.uid }], { Prefer: 'resolution=ignore-duplicates,return=minimal' });
      if (j.ok) { this.optIn = true; this.pages = {}; }
    }
  },

  async toggle() {
    if (!Account.on) { Account.open(); return; }
    if (this.busy || this.optIn === null) return;
    this.busy = true;
    try {
      const r = this.optIn ? await Account.rest('DELETE', '/rest/v1/lb_optin?user_id=eq.' + Account.meta.uid)
        : await Account.rest('POST', '/rest/v1/lb_optin', [{ user_id: Account.meta.uid }], { Prefer: 'resolution=ignore-duplicates,return=minimal' });
      if (r.ok) { this.setLeft(this.optIn); this.optIn = !this.optIn; this.pages = {}; this.load(this.cur().id, true); }
      else this.error = Account.errText(r);
    } finally { this.busy = false; }
  },

  step(d) { const n = this.tabs().length; this.tab = (this.tab + d + n) % n; this.top = 0; this.banAsk = null; Sfx.play('tick'); this.load(this.cur().id); },
  setTab(i) { this.tab = i; this.top = 0; this.load(this.cur().id); },

  update() {
    const pg = this.page(), n = pg && pg.rows ? this.view(pg, this.cur()).length : 0, vis = 9;
    const tb = this.cur();
    if (Input.pressed('Escape')) { G.mode = 'start'; return; }
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.step(-1);
    if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.step(1);
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.top = Math.max(0, this.top - 1);
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.top = Math.max(0, Math.min(n - vis, this.top + 1));
    if (Input.pressed('KeyR')) { this.loadOptIn(); this.load(this.cur().id, true); }
    if (Input.pressed('Space') || Input.pressed('Enter')) this.toggle();
  },

  draw(ctx) {
    const P = STYLE.pal, T = STYLE.type, tabs = this.tabs(), tb = this.cur(), pg = this.page(), vis = 9, cx = STAGE_W / 2;
    const rows = this.view(pg, tb), loading = !!this.loading[tb.id];
    drawMenuBg(ctx, 'keysettings');
    drawEmbers(ctx);
    uiText(ctx, 'LEADERBOARD', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
    // Listenauswahl: < NAME >
    UIHit.add(cx - 200, 52, 40, 24, () => {}, { act: () => this.step(-1) });
    UIHit.add(cx + 160, 52, 40, 24, () => {}, { act: () => this.step(1) });
    uiText(ctx, '<', cx - 180, 70, { size: T.h1, color: P.cyan, align: 'center' });
    uiText(ctx, '>', cx + 180, 70, { size: T.h1, color: P.cyan, align: 'center' });
    uiText(ctx, tb.label, cx, 70, { size: T.h1, color: P.ice, align: 'center' });
    uiText(ctx, tb.hint, cx, 84, { size: T.small, color: P.grey, align: 'center', maxW: STAGE_W - 60, minK: 0.6 });
    for (let i = 0; i < tabs.length; i++) {                                             // Punkte: welche Liste ist gerade offen
      ctx.fillStyle = i === this.tab ? P.yellow : P.greyDark;
      ctx.fillRect(cx - tabs.length * 6 + i * 12, 92, 8, 4);
      UIHit.add(cx - tabs.length * 6 + i * 12 - 2, 88, 12, 12, () => {}, { act: () => this.setTab(i) });
    }
    // Tabelle
    const X = 90, W = STAGE_W - 180, Y0 = 106, DY = 22;
    uiPanel(ctx, X - 10, Y0 - 6, W + 20, vis * DY + 10, { color: P.greyMid, fill: P.void, alpha: 0.9 });
    if (!pg) uiText(ctx, 'LOADING...', cx, Y0 + 60, { size: T.h2, color: P.grey, align: 'center' });
    else if (pg.error && !pg.rows) uiText(ctx, pg.error, cx, Y0 + 60, { size: T.h2, color: P.red, align: 'center' });
    else if (!rows.length) uiText(ctx, 'NO ONE IN THIS LIST YET', cx, Y0 + 60, { size: T.h2, color: P.grey, align: 'center' });
    rows.slice(this.top, this.top + vis).forEach((e, i) => {
      const y = Y0 + i * DY, col = e.mine || e.rank === 1 ? P.yellow : e.rank <= 3 ? P.cyan : P.ice;
      if (e.mine) { ctx.fillStyle = P.voidLight; ctx.fillRect(X - 6, y - 2, W + 12, DY - 2); }
      uiText(ctx, '#' + e.rank, X, y + 13, { size: T.h2, color: e.rank <= 3 ? P.yellow : P.grey });
      uiText(ctx, e.name.toUpperCase(), X + 50, y + 13, { size: T.h2, color: col, maxW: W - 170 });
      uiText(ctx, tb.fmt(e.val) + (tb.unit ? ' ' + tb.unit : ''), X + W, y + 13, { size: T.h2, color: col, align: 'right' });
    });
    if (this.admin) rows.slice(this.top, this.top + vis).forEach((e, i) => {             // BAN / UNBAN je Zeile (nur Admins; zweiter Klick bestaetigt)
      if (!e.uid || e.mine) return;
      const y = Y0 + i * DY, bx = X + W + 22, ask = this.banAsk === e.uid, unban = tb.id === 'banned', col = unban ? P.green : P.red;
      UIHit.add(bx, y, 50, DY - 4, () => {}, { act: () => this.moderate(e, unban) });
      uiPanel(ctx, bx, y, 50, DY - 4, { color: ask ? P.yellow : col, fill: ask ? P.voidLight : P.void, alpha: 0.9 });
      uiText(ctx, ask ? 'SURE?' : unban ? 'UNBAN' : 'BAN', bx + 25, y + 13, { size: T.small, color: ask ? P.yellow : col, align: 'center' });
    });
    UIScroll.bar(ctx, 'board', X + W + 12, Y0, 6, vis * DY - 4, true, Math.max(rows.length, vis), vis, this.top, (v) => { this.top = v; });
    // eigener Platz (kommt direkt aus der Datenbank, auch wenn er ausserhalb der Top 100 liegt)
    let line = '', lc = P.grey;
    if (!Account.on) line = 'LOG IN (ACCOUNT ICON) TO TAKE PART';
    else if (this.optIn === null) line = '';
    else if (!this.optIn) { line = 'YOU ARE NOT ON THE LEADERBOARD  -  PRESS SPACE TO JOIN'; lc = P.orange; }
    else if (pg && pg.me) { line = 'YOUR RANK  #' + pg.me.rank + '  /  ' + pg.me.total; lc = P.yellow; }
    else if (pg) line = 'YOU HAVE NO ENTRY IN THIS LIST YET';
    if (line) uiText(ctx, line, cx, 322, { size: T.body, color: lc, align: 'center' });
    const err = this.error || (pg && pg.rows && pg.error);
    if (err) uiText(ctx, err, cx, 334, { size: T.small, color: P.red, align: 'center' });
    // Knoepfe
    const by = 338, bw = 130;
    if (Account.on && this.optIn !== null) {
      UIHit.add(24, by, bw, 18, () => {}, { act: () => this.toggle() });
      uiPanel(ctx, 24, by, bw, 18, { color: this.optIn ? P.red : P.green, fill: P.void, alpha: 0.9 });
      uiText(ctx, this.optIn ? 'LEAVE LIST' : 'JOIN LIST', 24 + bw / 2, by + 13, { size: T.body, color: this.optIn ? P.red : P.green, align: 'center' });
    }
    UIHit.add(STAGE_W - 24 - bw, by, bw, 18, () => {}, { act: () => { this.loadOptIn(); this.load(tb.id, true); } });
    uiPanel(ctx, STAGE_W - 24 - bw, by, bw, 18, { color: P.cyan, fill: P.void, alpha: 0.9 });
    uiText(ctx, loading ? 'LOADING...' : 'REFRESH [R]', STAGE_W - 24 - bw / 2, by + 13, { size: T.body, color: P.cyan, align: 'center' });
  },
};
