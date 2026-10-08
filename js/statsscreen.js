// Statistik-Bildschirm (nur im Dev-Modus, Hauptmenue > STATISTICS): wertet das Protokoll aus (Stats.pick/analyze in runstats.js)
// und zeigt es als Diagramme: Ueberlebenskurve + Tode pro Minute mit Boss-Markern, Killer, Bosse, Ausruestung, letzte Laeufe.
// Bedienung: A/D oder Pfeile links/rechts = Reiter, W/S oder Pfeile hoch/runter = Karten-Filter, TAB = nur eigene Daten, ESC = zurueck.
// Gezeichnet wird mit Rechtecken (reines UI, keine Spielobjekte), Farben aus STYLE.pal.

const StatsScreen = {
  tab: 0, filter: 0, ownOnly: false, showDev: true,       // showDev: Dev-Laeufe (mit Cheat-Tasten gespielt) mitzaehlen; Taste X blendet sie aus
  TABS: ['OVERVIEW', 'KILLERS', 'BOSSES', 'BUILDS', 'RECENT'],
  A: null, B: [], builds: [], curve: [], recent: [],

  open() { this.refresh(); },

  // Daten neu auswerten (beim Oeffnen und wenn Filter oder Quelle wechseln)
  refresh() {
    const f = Stats.filterList()[this.filter].id;
    this.A = Stats.analyze(Stats.pick('deaths', f, this.ownOnly, this.showDev));
    this.B = Stats.analyzeBosses(Stats.pick('bosses', f, this.ownOnly, this.showDev));
    this.builds = Stats.analyzeBuilds(this.A.runs);
    this.recent = Stats.pick('deaths', f, true, this.showDev).slice(-12).reverse();
    this.own = Stats.pick('deaths', f, true, this.showDev).length;
    this.devRuns = Stats.pick('deaths', f, this.ownOnly, true).filter((e) => e.dv).length;       // Dev-Laeufe im Filter (auch wenn ausgeblendet)
    this.endless = f === 'inf';
    this.xmax = Math.max(this.endless ? 600 : CFG.finalBoss.at + CFG.boss.steps / 2, Math.ceil((this.A.best + 1) / CFG.boss.steps) * CFG.boss.steps);       // Standardmodus: die Zeitachse reicht bis kurz nach dem finalen Boss
    this.bw = Math.max(1, Math.ceil(this.xmax / 40 / 30)) * 30;                       // Balkenbreite in Sekunden (hoechstens 40 Balken)
    const n = Math.ceil(this.xmax / this.bw);
    this.bins = new Array(n).fill(0);
    for (const r of this.A.runs) if (!r.win) this.bins[Math.min(n - 1, Math.floor(r.t / this.bw))]++;
    // Ueberlebenskurve: Anteil der Laeufe, die Zeit t ueberstanden haben (Siege zaehlen immer)
    this.curve = [];
    for (let i = 0; i <= 139; i++) this.curve.push(this.A.alive(i / 139 * this.xmax));
  },

  update() {
    const L = Input.pressed('ArrowLeft') || Input.pressed('KeyA'), R = Input.pressed('ArrowRight') || Input.pressed('KeyD');
    const U = Input.pressed('ArrowUp') || Input.pressed('KeyW'), D = Input.pressed('ArrowDown') || Input.pressed('KeyS');
    const nf = Stats.filterList().length;
    if (L) this.tab = (this.tab + this.TABS.length - 1) % this.TABS.length;
    if (R) this.tab = (this.tab + 1) % this.TABS.length;
    if (U) { this.filter = (this.filter + nf - 1) % nf; this.refresh(); }
    if (D) { this.filter = (this.filter + 1) % nf; this.refresh(); }
    if (Input.pressed('Tab')) { this.ownOnly = !this.ownOnly; this.refresh(); }
    if (Input.pressed('KeyX')) { this.showDev = !this.showDev; this.refresh(); }
    if (Input.pressed('Escape')) G.mode = 'start';
  },

  // ---------- Hilfen ----------
  name(id) {
    const [k, x] = id.split(':');
    return ((k === 'w' ? CFG.items.catalog[x] : CFG.loadout.abilities[x]) || {}).name || x.toUpperCase();
  },
  bossName(ty) { return STAT_BOSS_NAMES[ty] || String(ty).toUpperCase(); },
  mapName(id) { const m = CFG.maps.find((q) => q.id === id); return m ? m.name : String(id).toUpperCase(); },
  rateColor(r) { const P = STYLE.pal; return r >= 0.75 ? P.green : r >= 0.5 ? P.yellow : r >= 0.3 ? P.orange : P.red; },
  bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = STYLE.pal.greyDark; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, Math.max(frac > 0 ? 2 : 0, Math.round(w * Math.min(1, frac))), h);
  },
  tile(ctx, x, y, w, label, value, color) {
    const P = STYLE.pal, T = STYLE.type;
    uiPanel(ctx, x, y, w, 26, { color: P.greyMid, fill: P.void, alpha: 0.92 });
    uiText(ctx, label, x + 6, y + 10, { size: T.small, color: P.grey });
    uiText(ctx, value, x + 6, y + 22, { size: T.h2, color: color || P.ice });
  },

  // ---------- Zeichnen ----------
  draw(ctx) {
    const P = STYLE.pal, T = STYLE.type, A = this.A;
    drawMenuBg(ctx, 'keysettings');
    ctx.fillStyle = 'rgba(5,6,15,0.82)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    uiText(ctx, 'STATISTICS', STAGE_W / 2, 24, { size: T.h1, color: P.yellow, align: 'center', glow: P.yellow });

    // Reiter
    const tw = 84, tg = 4, tx0 = STAGE_W / 2 - (this.TABS.length * tw + (this.TABS.length - 1) * tg) / 2;
    this.TABS.forEach((name, i) => {
      const x = tx0 + i * (tw + tg), on = i === this.tab;
      UIHit.add(x, 32, tw, 16, () => { this.tab = i; }, { noConfirm: true });
      uiPanel(ctx, x, 32, tw, 16, { color: on ? P.cyan : P.greyMid, fill: on ? P.voidLight : P.void, alpha: 0.95, glow: on });
      uiText(ctx, name, x + tw / 2, 44, { size: T.small, color: on ? P.ice : P.grey, align: 'center' });
    });
    // Kartenfilter
    const fl = Stats.filterList(), fg = 4, fw = Math.min(88, Math.floor((STAGE_W - 16) / fl.length) - fg), fx0 = STAGE_W / 2 - (fl.length * fw + (fl.length - 1) * fg) / 2;
    fl.forEach((f, i) => {
      const x = fx0 + i * (fw + fg), on = i === this.filter;
      UIHit.add(x, 52, fw, 14, () => { if (this.filter !== i) { this.filter = i; this.refresh(); } }, { noConfirm: true });
      uiPanel(ctx, x, 52, fw, 14, { color: on ? P.yellow : P.greyMid, fill: on ? P.voidLight : P.void, alpha: 0.95 });
      uiText(ctx, uiFit(ctx, f.label, fw - 6, T.small), x + fw / 2, 62, { size: T.small, color: on ? P.yellow : P.grey, align: 'center' });
    });
    // Schalter oben rechts: Dev-Laeufe anzeigen/ausblenden
    const dx = STAGE_W - 168, dy = 12, dOn = this.showDev;
    UIHit.add(dx, dy, 120, 16, () => { this.showDev = !this.showDev; this.refresh(); }, { noConfirm: true });
    uiPanel(ctx, dx, dy, 120, 16, { color: dOn ? P.green : P.orange, fill: P.void, alpha: 0.95 });
    uiText(ctx, 'DEV RUNS: ' + (dOn ? 'SHOWN' : 'HIDDEN') + (this.devRuns ? ' (' + this.devRuns + ')' : ''), dx + 60, dy + 12, { size: T.small, color: dOn ? P.green : P.orange, align: 'center' });
    const imp = A.n - Math.min(A.n, this.own);
    uiText(ctx, A.n + ' RUNS' + (this.ownOnly ? ' (OWN DATA ONLY)' : ' (' + this.own + ' OWN, ' + Math.max(0, imp) + ' IMPORTED)') + (A.gaveUp ? '   ' + A.gaveUp + ' GAVE UP (NOT COUNTED)' : '') + (A.n > 0 && A.n < 10 ? '   FEW RUNS - ROUGH NUMBERS' : ''), STAGE_W / 2, 79, { size: T.small, color: A.n < 10 ? P.orange : P.grey, align: 'center' });

    if (!A.n && !this.B.length) {
      uiPanel(ctx, STAGE_W / 2 - 200, 120, 400, 120, { color: P.greyMid, fill: P.void, alpha: 0.92 });
      uiText(ctx, 'NO DATA YET FOR THIS FILTER', STAGE_W / 2, 150, { size: T.h2, color: P.ice, align: 'center' });
      uiWrap(ctx, 'Every finished run is logged (not the tutorial). Runs with F2/F3 cheats are marked as dev runs (X hides them). Play some runs, or merge other players\' data: Settings > EXPORT / IMPORT SAVE > PLAY DATA.', STAGE_W / 2 - 180, 170, 360, 11, { size: T.small, color: P.grey });
    } else {
      [this.drawOverview, this.drawKillers, this.drawBosses, this.drawBuilds, this.drawRecent][this.tab].call(this, ctx);
    }
    uiText(ctx, 'BALANCE IN js/config.js: ' + this.CONFIG_NOTES[this.tab], STAGE_W / 2, 347, { size: T.small, color: P.yellow, align: 'center' });
    uiText(ctx, 'A/D = TAB    W/S = MAP    TAB = ' + (this.ownOnly ? 'INCLUDE IMPORTED' : 'OWN ONLY') + '    X = DEV RUNS    ESC = BACK', STAGE_W / 2, 357, { size: T.small, color: P.grey, align: 'center' });
  },

  // Wo man an den Zahlen dreht: alle Balance-Werte stehen in js/config.js (Regel des Projekts), je Reiter die passenden Abschnitte
  CONFIG_NOTES: [
    'CFG.waves, CFG.maps[].diff, CFG.boss.steps, CFG.spawnAll',
    'CFG.enemy, CFG.patterns, CFG.events, CFG.spawnAll',
    'CFG.boss (order, power, timeout), CFG.maps[].diff.boss',
    'CFG.items, CFG.loadout.abilities, CFG.weaponUps, CFG.gear',
    'CFG.waves, CFG.enemy, CFG.boss, CFG.maps[].diff',
  ],

  drawOverview(ctx) {
    const P = STYLE.pal, T = STYLE.type, A = this.A, fmt = formatTime, E = STAGE_W - 480;       // E = zusaetzliche Breite gegenueber 4:3
    const tiles = [['RUNS', String(A.n)], ['MEDIAN TIME', fmt(A.median)], ['AVERAGE TIME', fmt(A.avg)], ['BEST TIME', fmt(A.best)], ['BOSSES / RUN', A.bossAvg.toFixed(1)]];
    tiles.forEach(([l, v], i) => this.tile(ctx, 22 + i * Math.round((STAGE_W - 44 + 4) / 5), 86, Math.round((STAGE_W - 44 + 4) / 5) - 4, l, v, i === 1 ? P.yellow : P.ice));

    // Diagramm: Tode pro Zeitfenster (Balken) und Ueberlebenskurve (Linie), rote Striche = Beginn eines Bosskampfs
    const px = 22, py = 118, pw = 318 + Math.round(E * 0.62), ph = 218, gx = px + 30, gy = py + 14, gw = pw - 40, gh = 156;
    uiPanel(ctx, px, py, pw, ph, { color: P.greyMid, fill: P.void, alpha: 0.92 });
    uiText(ctx, 'SURVIVAL OVER TIME', px + 8, py + 10, { size: T.small, color: P.yellow });
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {                                          // Gitter + Beschriftung der Prozentachse
      const y = Math.round(gy + gh - f * gh);
      ctx.fillStyle = f === 0.5 ? P.greyMid : P.greyDark; ctx.fillRect(gx, y, gw, 1);
      uiText(ctx, Math.round(f * 100) + '%', gx - 3, y + 3, { size: T.small, color: P.grey, align: 'right' });
    }
    const maxBin = Math.max(1, ...this.bins), bwPx = gw / this.bins.length;
    this.bins.forEach((c, i) => {                                                        // Balken: Tode je Fenster
      const h = Math.round(c / maxBin * gh * 0.55), x = Math.round(gx + i * bwPx);
      ctx.fillStyle = P.cyanDark; ctx.fillRect(x + 1, gy + gh - h, Math.max(1, Math.round(bwPx) - 2), h);
      if (c) { ctx.fillStyle = P.cyan; ctx.fillRect(x + 1, gy + gh - h, Math.max(1, Math.round(bwPx) - 2), 1); }
    });
    // Boss-Marker: im Standardmodus bis zum finalen Boss (orange), im Endlos-Modus alle steps Sekunden
    for (let t = CFG.boss.steps; t < this.xmax; t += CFG.boss.steps) {
      if (!this.endless && t > CFG.finalBoss.at) break;
      const x = Math.round(gx + t / this.xmax * gw);
      ctx.fillStyle = !this.endless && t >= CFG.finalBoss.at ? P.orange : P.redMid; for (let y = gy; y < gy + gh; y += 4) ctx.fillRect(x, y, 1, 2);
    }
    let prevY = null;                                                                    // Ueberlebenskurve als Treppenlinie
    this.curve.forEach((f, i) => {
      const x = Math.round(gx + i / (this.curve.length - 1) * gw), y = Math.round(gy + gh - f * gh);
      ctx.fillStyle = P.yellow;
      if (prevY !== null && prevY !== y) ctx.fillRect(x, Math.min(y, prevY), 2, Math.abs(y - prevY) + 2);
      ctx.fillRect(x, y, 2, 2);
      prevY = y;
    });
    const mx = Math.round(gx + Math.min(1, A.median / this.xmax) * gw);                  // Median-Marke
    ctx.fillStyle = P.white; ctx.fillRect(mx, gy + gh + 1, 1, 4);
    uiText(ctx, 'MEDIAN', mx, gy + gh + 13, { size: T.small, color: P.white, align: 'center' });
    for (let t = 0; t <= this.xmax; t += CFG.boss.steps * (this.xmax > 1500 ? 4 : this.xmax > 800 ? 2 : 1)) {   // Zeitachse
      uiText(ctx, formatTime(t), Math.round(gx + t / this.xmax * gw), py + ph - 22, { size: T.small, color: P.grey, align: 'center' });
    }
    ctx.fillStyle = P.yellow; ctx.fillRect(px + 10, py + ph - 10, 8, 2);
    uiText(ctx, 'STILL ALIVE', px + 22, py + ph - 7, { size: T.small, color: P.grey });
    ctx.fillStyle = P.cyan; ctx.fillRect(px + 92, py + ph - 11, 6, 4);
    uiText(ctx, 'DEATHS', px + 102, py + ph - 7, { size: T.small, color: P.grey });
    ctx.fillStyle = P.redMid; ctx.fillRect(px + 148, py + ph - 11, 1, 4); ctx.fillRect(px + 148, py + ph - 6, 1, 3);
    uiText(ctx, 'BOSS FIGHT', px + 154, py + ph - 7, { size: T.small, color: P.grey });

    // Auswertung in Worten
    const ix = px + pw + 8, iw = STAGE_W - 22 - ix;
    uiPanel(ctx, ix, py, iw, ph, { color: P.greyMid, fill: P.void, alpha: 0.92 });
    uiText(ctx, 'READING THE DATA', ix + 8, py + 10, { size: T.small, color: P.yellow });
    const lines = this.insights();
    let y = py + 24;
    for (const [color, text] of lines) { const n = uiWrap(ctx, text, ix + 8, y, iw - 14, 9, { size: T.small, color }); y += n * 9 + 5; }
  },

  insights() {
    const P = STYLE.pal, A = this.A, f = formatTime, out = [];
    if (A.n) {
      out.push([P.ice, 'HALF OF ALL RUNS ARE OVER BY ' + f(A.median) + '.']);
      out.push([P.ice, '1 IN 4 DIE BEFORE ' + f(A.p25) + ', 3 IN 4 BEFORE ' + f(A.p75) + '.']);
      const w = A.windows.filter((q) => q.risk >= 3).sort((a, b) => b.hazard - a.hazard)[0];
      if (w) out.push([P.orange, 'RISKIEST WINDOW ' + f(w.lo) + '-' + f(w.lo + CFG.boss.steps) + ': ' + Math.round(w.hazard * 100) + '% OF THOSE ALIVE DIE HERE.']);
      const k = A.killers[0], deaths = A.killers.reduce((s, q) => s + q.n, 0);
      if (A.lvAvg) out.push([P.cyan, 'AVERAGE LEVEL AT THE END OF A RUN: ' + A.lvAvg.toFixed(1) + '.']);
      if (k) out.push([P.red, 'TOP KILLER: ' + k.name + ' (' + Math.round(100 * k.n / Math.max(1, deaths)) + '% OF DEATHS).']);
    }
    const hard = this.B.filter((b) => b.n >= 3).sort((a, b) => a.rate - b.rate)[0];
    if (hard) out.push([P.orange, 'HARDEST BOSS: ' + this.bossName(hard.ty) + ', ONLY ' + Math.round(hard.rate * 100) + '% BEATEN.']);
    if (this.A.wins) out.push([P.green, this.A.wins + ' RUN' + (this.A.wins > 1 ? 'S' : '') + ' BEAT THE GAME.']);
    if (!out.length) out.push([P.grey, 'NOT ENOUGH DATA YET.']);
    return out;
  },

  drawKillers(ctx) {
    const P = STYLE.pal, T = STYLE.type, A = this.A, x = 22, y = 86, w = STAGE_W - 44, e = w - 436;
    uiPanel(ctx, x, y, w, 250, { color: P.greyMid, fill: P.void, alpha: 0.92 });
    uiText(ctx, 'WHAT KILLS YOU', x + 8, y + 12, { size: T.small, color: P.yellow });
    uiText(ctx, 'DEATHS', x + 330 + e * 0.6, y + 12, { size: T.small, color: P.grey, align: 'right' });
    uiText(ctx, 'MEDIAN TIME', x + w - 8, y + 12, { size: T.small, color: P.grey, align: 'right' });
    const total = A.killers.reduce((s, k) => s + k.n, 0) || 1, max = A.killers.length ? A.killers[0].n : 1;
    if (!A.killers.length) uiText(ctx, 'NO DEATHS LOGGED', x + 12, y + 40, { size: T.small, color: P.grey });
    A.killers.slice(0, 12).forEach((k, i) => {
      const ry = y + 28 + i * 17;
      uiText(ctx, uiFit(ctx, k.name, 120, T.small), x + 10, ry + 8, { size: T.small, color: i === 0 ? P.ice : P.grey });
      this.bar(ctx, x + 138, ry + 1, 140 + e * 0.5, 8, k.n / max, i === 0 ? P.red : P.redMid);
      uiText(ctx, k.n + ' (' + Math.round(100 * k.n / total) + '%)', x + 330 + e * 0.6, ry + 8, { size: T.small, color: i === 0 ? P.yellow : P.grey, align: 'right' });
      uiText(ctx, formatTime(k.med), x + w - 8, ry + 8, { size: T.small, color: P.ice, align: 'right' });
    });
    if (A.killers.length > 12) uiText(ctx, '+' + (A.killers.length - 12) + ' MORE', x + 10, y + 28 + 12 * 17 + 6, { size: T.small, color: P.grey });
  },

  drawBosses(ctx) {
    const P = STYLE.pal, T = STYLE.type, B = this.B, x = 22, y = 86, w = STAGE_W - 44, e = w - 436;
    uiPanel(ctx, x, y, w, 250, { color: P.greyMid, fill: P.void, alpha: 0.92 });
    const col = { name: x + 10, n: x + 150, bar: x + 160, pct: x + 258 + e * 0.3, died: x + 288 + e * 0.45, to: x + 322 + e * 0.6, dur: x + 358 + e * 0.75, dm: x + 392 + e * 0.9, at: x + w - 8 };
    const head = (t, cx, al) => uiText(ctx, t, cx, y + 12, { size: T.small, color: P.grey, align: al || 'right' });
    head('BOSS', col.name, 'left'); head('FIGHTS', col.n); head('BEATEN', col.bar, 'left'); head('DIED', col.died); head('TIME UP', col.to); head('LENGTH', col.dur); head('DMG', col.dm); head('STARTS', col.at);
    if (!B.length) uiText(ctx, 'NO BOSS FIGHTS LOGGED', x + 12, y + 40, { size: T.small, color: P.grey });
    B.slice(0, 11).forEach((b, i) => {
      const ry = y + 24 + i * 16, c = this.rateColor(b.rate);
      uiText(ctx, uiFit(ctx, this.bossName(b.ty), 130, T.small), col.name, ry + 8, { size: T.small, color: P.ice });
      uiText(ctx, String(b.n), col.n, ry + 8, { size: T.small, color: P.grey, align: 'right' });
      this.bar(ctx, col.bar, ry + 1, 70 + e * 0.3, 8, b.rate, c);
      uiText(ctx, Math.round(b.rate * 100) + '%', col.pct, ry + 8, { size: T.small, color: c, align: 'right' });
      uiText(ctx, String(b.died), col.died, ry + 8, { size: T.small, color: b.died ? P.red : P.greyMid, align: 'right' });
      uiText(ctx, String(b.timeout), col.to, ry + 8, { size: T.small, color: b.timeout ? P.orange : P.greyMid, align: 'right' });
      uiText(ctx, formatTime(b.dur), col.dur, ry + 8, { size: T.small, color: P.ice, align: 'right' });
      uiText(ctx, String(Math.round(b.dm)), col.dm, ry + 8, { size: T.small, color: P.ice, align: 'right' });
      uiText(ctx, formatTime(b.at), col.at, ry + 8, { size: T.small, color: P.ice, align: 'right' });
    });
    uiWrap(ctx, 'BEATEN = share of fights won. DIED / TIME UP = fights that ended with your death or with the time limit. LENGTH = average fight length, DMG = average damage you took, STARTS = average run time when the fight began.', x + 10, y + 24 + 11 * 16 + 8, w - 20, 9, { size: T.small, color: P.grey });
  },

  drawBuilds(ctx) {
    const P = STYLE.pal, T = STYLE.type, items = this.builds;
    const w = Math.floor((STAGE_W - 44 - 8) / 2), e = w - 214, cols = [['WEAPONS & IMPLANTS', 'w:', 22], ['ABILITIES', 'a:', 22 + w + 8]];
    for (const [title, prefix, x] of cols) {
      const y = 86, list = items.filter((q) => q.id.startsWith(prefix)).sort((a, b) => b.n - a.n).slice(0, 11), max = list.length ? list[0].n : 1;
      uiPanel(ctx, x, y, w, 238, { color: P.greyMid, fill: P.void, alpha: 0.92 });
      uiText(ctx, title, x + 8, y + 12, { size: T.small, color: P.yellow });
      uiText(ctx, 'RUNS', x + 148 + e * 0.7, y + 12, { size: T.small, color: P.grey, align: 'right' });
      uiText(ctx, 'MEDIAN', x + w - 8, y + 12, { size: T.small, color: P.grey, align: 'right' });
      if (!list.length) uiText(ctx, 'NO LOADOUT DATA', x + 10, y + 36, { size: T.small, color: P.grey });
      list.forEach((q, i) => {
        const ry = y + 26 + i * 20;
        uiText(ctx, uiFit(ctx, this.name(q.id), 100, T.small), x + 8, ry + 7, { size: T.small, color: P.ice });
        this.bar(ctx, x + 8, ry + 10, 130 + e * 0.7, 4, q.n / max, prefix === 'w:' ? P.cyan : P.violet);
        uiText(ctx, String(q.n), x + 148 + e * 0.7, ry + 7, { size: T.small, color: P.grey, align: 'right' });
        uiText(ctx, formatTime(q.med), x + w - 8, ry + 7, { size: T.small, color: P.yellow, align: 'right' });
      });
    }
    uiText(ctx, 'MEDIAN = typical survival time of runs that carried the item (not proof that it is stronger).', STAGE_W / 2, 336, { size: T.small, color: P.grey, align: 'center' });
  },

  drawRecent(ctx) {
    const P = STYLE.pal, T = STYLE.type, x = 22, y = 86, w = STAGE_W - 44, f = w / 436;
    uiPanel(ctx, x, y, w, 250, { color: P.greyMid, fill: P.void, alpha: 0.92 });
    const head = (t, cx, al) => uiText(ctx, t, cx, y + 12, { size: T.small, color: P.grey, align: al || 'left' });
    head('TIME', x + 10); head('BOSSES', x + 50); head('KILLED BY', x + 96); head('MAP', x + 196 * f); head('MELEE', x + 282 * f); head('RANGED', x + 356 * f);
    if (!this.recent.length) uiText(ctx, 'NO OWN RUNS LOGGED FOR THIS FILTER (IMPORTED RUNS ARE NOT LISTED HERE)', x + 12, y + 40, { size: T.small, color: P.grey });
    this.recent.forEach((r, i) => {
      const ry = y + 28 + i * 18, col = r.win ? P.green : r.by === 'GAVE UP' ? P.greyMid : P.ice;
      uiText(ctx, formatTime(r.t), x + 10, ry + 8, { size: T.small, color: col });
      uiText(ctx, String(r.b), x + 62, ry + 8, { size: T.small, color: P.grey, align: 'center' });
      uiText(ctx, uiFit(ctx, r.by + (r.fy ? ' (' + this.bossName(r.fy) + ' FIGHT)' : ''), 94 * f, T.small), x + 96, ry + 8, { size: T.small, color: r.win ? P.green : P.red });
      uiText(ctx, uiFit(ctx, (r.inf ? 'ENDLESS ' : '') + this.mapName(r.map), 82 * f, T.small), x + 196 * f, ry + 8, { size: T.small, color: P.grey });
      const nm = (id) => (id ? this.name('w:' + id) : '-');
      uiText(ctx, uiFit(ctx, r.w ? nm(r.w[0]) : '-', 70 * f, T.small), x + 282 * f, ry + 8, { size: T.small, color: P.grey });
      uiText(ctx, uiFit(ctx, r.w ? nm(r.w[1]) : '-', 70 * f, T.small), x + 356 * f, ry + 8, { size: T.small, color: P.grey });
    });
  },
};
