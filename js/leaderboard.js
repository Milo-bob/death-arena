// Ranglisten (Hauptmenü-Symbol oben rechts oder Taste B). Berechnet und sortiert wird in der Datenbank (tools/supabase_leaderboard.sql):
// pro Konto zaehlt nur der beste Slot, Dev-Staende fehlen, mitmachen kann nur, wer sich eintraegt (Opt-in).
// Das Spiel fragt pro Liste die Funktionen lb_page (Top 100, fertig sortiert mit Platz) und lb_me (eigener Platz) ab.
// Bedienung: A/D oder Pfeile = Liste wechseln, W/S = scrollen, Leertaste = mitmachen/austreten, R = neu laden, ESC = zurueck.

const Board = {
  pages: {},                          // Liste-ID -> { rows: [{ rank, name, val, mine }], total, me: { rank, val } | null, error, at }
  loading: {}, optIn: null, busy: false, error: '',
  tab: 0, top: 0,
  LIMIT: 100, TTL: 60000,

  // Listen: id = Name der Liste in der Datenbank, fmt = Anzeige des Wertes
  tabs() {
    const f = (v) => String(Math.floor(v));
    const list = [
      { id: 'total', label: 'TOTAL', hint: 'ALL LISTS COMBINED (POINTS)', fmt: f, unit: 'PTS' },
      { id: 'inf', label: 'ENDLESS TIME', hint: 'BEST TIME IN INFINITE MODE', fmt: formatTime },
      { id: 'wins', label: 'WINS', hint: 'DEATH DEFEATED', fmt: f },
      { id: 'ach', label: 'ACHIEVEMENTS', hint: 'ACHIEVEMENTS UNLOCKED', fmt: f },
      { id: 'plv', label: 'PLAYER LEVEL', hint: 'LEVEL OF THE SAVE FILE', fmt: (v) => 'LV ' + Save.levelInfo(v).lv },
      { id: 'rlv', label: 'RUN LEVEL', hint: 'HIGHEST LEVEL REACHED IN ONE RUN', fmt: f },
      { id: 'boss', label: 'BOSSES', hint: 'BOSSES DEFEATED IN TOTAL', fmt: f },
      { id: 'kill', label: 'KILLS', hint: 'ENEMIES DEFEATED IN TOTAL', fmt: f },
    ];
    for (const m of CFG.maps) list.push({ id: 'map:' + m.id, label: m.name, hint: 'BEST TIME ON THIS MAP', fmt: formatTime });
    // Speedrun: schnellste Zeit zuerst (Server: lb_sr_page). Zufalls-Seed = beste Zeit ueber alle Zufalls-Seeds, Daily = Seed des heutigen Tages, Fester Seed = die Zahl aus dem Speedrun-Setup (hier mit Ziffern aenderbar)
    list.push({ id: 'sr:rush', label: 'BOSS RUSH', hint: 'FASTEST TIME', fmt: srFmt, sr: true });
    list.push({ id: 'sr:gauntlet', label: 'GAUNTLET', hint: 'FASTEST TIME, PENALTY INCLUDED', fmt: srFmt, sr: true });
    list.push({ id: 'sr:rnd', label: 'SEED RUN: RANDOM SEED', hint: 'FASTEST TIME WITH ANY RANDOM SEED', fmt: srFmt, sr: true });
    list.push({ id: 'sr:daily:' + SpeedRun.today(), label: 'SEED RUN: DAILY SEED', hint: 'FASTEST TIME ON THE DAILY SEED (' + SpeedRun.today() + ')', fmt: srFmt, sr: true });
    list.push({ id: 'sr:seed:' + Math.max(1, Save.data.sr.seedNum), label: 'SEED RUN: SEED ' + Math.max(1, Save.data.sr.seedNum), hint: 'FASTEST TIME ON THIS SEED  -  TYPE DIGITS TO CHANGE THE SEED', fmt: srFmt, sr: true, typeSeed: true });
    return list;
  },
  cur() { return this.tabs()[this.tab]; },
  page() { return this.pages[this.cur().id] || null; },

  open() { this.tab = Math.min(this.tab, this.tabs().length - 1); this.top = 0; this.error = ''; this.loadOptIn(); this.load(this.cur().id); },

  // Eine Liste laden (hoechstens einmal pro Minute, ausser force)
  async load(id, force) {
    const old = this.pages[id];
    if (this.loading[id] || (!force && old && Date.now() - old.at < this.TTL)) return;
    if (!Account.configured) { this.error = 'CLOUD SAVES ARE NOT SET UP YET'; return; }
    this.loading[id] = true;
    try {
      const fnPage = id.startsWith('sr:') ? 'lb_sr_page' : 'lb_page', fnMe = id.startsWith('sr:') ? 'lb_sr_me' : 'lb_me';
      const a = await Account.http('POST', '/rest/v1/rpc/' + fnPage, { p_board: id, p_limit: this.LIMIT, p_offset: 0 }, Account.on ? await Account.token() : null);
      if (!a.ok) { this.pages[id] = old || { rows: null, total: 0, me: null, at: 0 }; this.pages[id].error = a.offline ? 'NO CONNECTION' : 'LEADERBOARD IS NOT SET UP YET'; return; }
      const rows = (a.json || []).map((r) => ({ rank: r.rank, name: r.name, val: +r.val, mine: !!r.mine }));
      let me = null;
      if (Account.on) { const b = await Account.rest('POST', '/rest/v1/rpc/' + fnMe, { p_board: id }); if (b.ok && b.json && b.json[0]) me = { rank: b.json[0].rank, val: +b.json[0].val, total: b.json[0].total }; }
      this.pages[id] = { rows, total: a.json && a.json[0] ? +a.json[0].total : 0, me, error: '', at: Date.now() };
    } finally { this.loading[id] = false; }
  },

  async loadOptIn() {
    if (!Account.on) { this.optIn = null; return; }
    const r = await Account.rest('GET', '/rest/v1/lb_optin?select=user_id');
    if (r.ok) this.optIn = (r.json || []).length > 0;
  },

  async toggle() {
    if (!Account.on) { Account.open(); return; }
    if (this.busy || this.optIn === null) return;
    this.busy = true;
    try {
      const r = this.optIn ? await Account.rest('DELETE', '/rest/v1/lb_optin?user_id=eq.' + Account.meta.uid)
        : await Account.rest('POST', '/rest/v1/lb_optin', [{ user_id: Account.meta.uid }], { Prefer: 'resolution=ignore-duplicates,return=minimal' });
      if (r.ok) { this.optIn = !this.optIn; this.pages = {}; this.load(this.cur().id, true); }
      else this.error = Account.errText(r);
    } finally { this.busy = false; }
  },

  step(d) { const n = this.tabs().length; this.tab = (this.tab + d + n) % n; this.top = 0; Sfx.play('tick'); this.load(this.cur().id); },
  setTab(i) { this.tab = i; this.top = 0; this.load(this.cur().id); },

  update() {
    const pg = this.page(), n = pg && pg.rows ? pg.rows.length : 0, vis = 9;
    const tb = this.cur();
    if (tb.typeSeed) {                                                                   // fester Seed: Ziffern tippen, Rueckschritt loescht (Liste laedt kurz nach der letzten Eingabe)
      const S = Save.data.sr; let typed = false;
      for (const c of Object.keys(Input.pressedNow)) { const m = /^(?:Digit|Numpad)([0-9])$/.exec(c); if (m) { S.seedNum = this.seedTyped ? Math.min(999999999, S.seedNum * 10 + Number(m[1])) : Number(m[1]); this.seedTyped = true; typed = true; } }
      if (Input.pressedNow.Backspace) { S.seedNum = Math.floor(S.seedNum / 10); this.seedTyped = true; typed = true; }
      if (typed) { Save.write(); this.seedAt = Date.now(); this.top = 0; if (Input.pressedNow.Backspace) return; }
      if (this.seedAt && Date.now() - this.seedAt > 600) { this.seedAt = 0; this.load(this.cur().id); }
    } else this.seedTyped = false;
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
    const rows = pg && pg.rows ? pg.rows : [], loading = !!this.loading[tb.id];
    drawMenuBg(ctx, 'keysettings');
    drawEmbers(ctx);
    uiText(ctx, 'LEADERBOARD', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
    // Listenauswahl: < NAME >
    UIHit.add(cx - 200, 52, 40, 24, () => {}, { act: () => this.step(-1) });
    UIHit.add(cx + 160, 52, 40, 24, () => {}, { act: () => this.step(1) });
    uiText(ctx, '<', cx - 180, 70, { size: T.h1, color: P.cyan, align: 'center' });
    uiText(ctx, '>', cx + 180, 70, { size: T.h1, color: P.cyan, align: 'center' });
    uiText(ctx, tb.label, cx, 70, { size: T.h1, color: P.ice, align: 'center' });
    uiText(ctx, tb.hint, cx, 84, { size: T.small, color: P.grey, align: 'center' });
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
