// Meilenstein-Fanfare: wird mitten im Lauf gezeigt, sobald ein Meilenstein erreicht ist (die Belohnung wird weiter am Laufende gutgeschrieben).
// Kein Textkasten: grosser goldener Text oben in der Mitte mit goldenen Pixel-Fluegeln links und rechts, Strahlen, Glanzstreifen und Funken.
// Dazu Bildschirmblitz, Wackeln und der Fanfarenklang Sfx 'milestone'. Mehrere gleichzeitig erreichte Meilensteine laufen nacheinander.
// Alles gezeichnet mit den Pixel-Helfern aus style.js.

const MsFx = {
  queue: [], cur: null, t: 0, seen: new Set(), parts: [], checkT: 0,
  TOTAL: 4.8, IN: 0.45, OUT: 0.6,
  // Zeit-Hinweise (schlichte Variante der Fanfare): nach 5 / 10 / 15 Minuten Spielzeit. G.time zaehlt nur die Wellen, Bosskaempfe stehen still,
  // also zaehlen Bosse nicht mit. 15 Min. gibt es nur im Endlos-Modus (der Standardlauf endet bei CFG.finalBoss.at). Faellt ein Zeitpunkt mit einer
  // Meilenstein-Fanfare zusammen (laeuft oder steht an), entfaellt der Zeit-Hinweis, die Botschaft ist ja schon da.
  get TIME_MARKS() { return CFG.player.ramp.marks; }, TIME_TOTAL: 3.2, timeSeen: new Set(), tpop: null,

  reset() { this.queue = []; this.cur = null; this.t = 0; this.seen = new Set(); this.parts = []; this.checkT = 0; this.timeSeen = new Set(); this.tpop = null; },

  checkTime() {
    if (Tutorial.active || G.cheated || G.victory > 0 || Save.srOn) return;
    for (const mark of this.TIME_MARKS) {
      if (this.timeSeen.has(mark) || G.time < mark) continue;
      this.timeSeen.add(mark);
      this.check(0, true);                                           // Meilensteine zum selben Zeitpunkt sofort erkennen (sonst bis zu 0.5 s Verzug)
      if (this.cur || this.queue.length) continue;                   // Meilenstein-Fanfare vorhanden: Zeit-Hinweis entfaellt
      this.tpop = { text: (mark / 60) + ' MINUTES SURVIVED', lvl: this.TIME_MARKS.indexOf(mark), t: 0 };
      Sfx.play('upgrade');
    }
  },

  // Stand eines Meilenstein-Wertes mitten im Lauf (gespeicherter Wert plus aktueller Lauf). null = nur am Laufende pruefbar.
  liveValue(stat) {
    const d = Save.data, inf = G.infinite, st = d.stats || {};
    switch (stat) {
      case 'best': return inf ? d.best || 0 : Math.max(d.best || 0, G.time);
      case 'bestInf': return inf ? Math.max(d.bestInf || 0, G.time) : d.bestInf || 0;
      case 'bosses': return (st.bosses || 0) + G.bosses;
      case 'kills': return (st.kills || 0) + G.kills;
      case 'infBosses': return (st.infBosses || 0) + (inf ? G.bosses : 0);
      case 'infKills': return (st.infKills || 0) + (inf ? G.kills : 0);
      default: return null;
    }
  },
  // Zweimal pro Sekunde pruefen, ob im laufenden Lauf ein Meilenstein erreicht wurde
  check(dt, force) {
    this.checkT -= dt;
    if (this.checkT > 0 && !force) return;
    this.checkT = 0.5;
    if (Tutorial.active || G.cheated || G.victory > 0 || Save.srOn) return;
    for (const m of CFG.milestones) {
      if (this.seen.has(m.id) || Save.milestoneDone(m.id)) continue;
      const v = this.liveValue(m.stat);
      if (v !== null && v >= m.need) { this.seen.add(m.id); this.queue.push(m); }
    }
  },

  start(m) {
    this.cur = m; this.t = 0;
    Sfx.play('milestone');
    Juice.flash(STYLE.pal.yellow, 0.3, 0.55, true);
    Juice.shake(2.2);
    this.burst(0.5);
  },
  // Funken aus den Fluegelwurzeln (Bildschirmkoordinaten)
  burst(k) {
    const w = this.half || 70;
    for (const side of [-1, 1]) for (let i = 0; i < 26 * k * 2; i++) {
      const a = rand(-110, 40) * DEG, v = rand(30, 120);
      this.parts.push({ x: STAGE_W / 2 + side * (w + 6), y: 56, vx: Math.cos(a) * v * side, vy: Math.sin(a) * v - 14, life: rand(0.6, 1.4), t: 0, c: Math.random() < 0.3 ? STYLE.pal.ice : Math.random() < 0.5 ? STYLE.pal.yellow : STYLE.pal.orange, s: Math.random() < 0.3 ? 4 : 2 });
    }
  },

  update(dt) {
    this.check(dt);
    this.checkTime();
    if (this.tpop && (this.tpop.t += dt) >= this.TIME_TOTAL) this.tpop = null;
    for (const q of this.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 70 * dt; q.vx *= Math.exp(-1.2 * dt); }
    this.parts = this.parts.filter((q) => q.t < q.life);
    if (!this.cur) { if (this.queue.length) this.start(this.queue.shift()); return; }
    const was = this.t;
    this.t += dt;
    if (was < 0.9 && this.t >= 0.9) this.burst(0.4);                 // zweiter Funkenschub, wenn die Fluegel offen sind
    if (this.t >= this.TOTAL) this.cur = null;
  },

  // Ein Fluegel (Federn als Pixel-Flaechen). side = -1 links, 1 rechts. open 0..1 (aufgefaltet), flap = leichtes Schlagen.
  wing(ctx, rx, ry, side, open, flap, alpha) {
    const P = STYLE.pal;
    const feathers = [[-64, 54], [-48, 68], [-34, 76], [-20, 74], [-7, 66], [7, 54], [21, 40]];       // Winkel (Grad ueber der Waagerechten), Laenge
    ctx.save();
    ctx.globalAlpha = alpha;
    feathers.forEach(([deg, len], i) => {
      const fold = -92 + (deg + 92) * open + flap * (1 - i / feathers.length) * 5;     // beim Aufgehen faechern sich die Federn von "oben zusammengelegt" auf
      const a = fold * DEG, L = len * (0.35 + 0.65 * open), w = 6 + (i < 4 ? 2 : 0);
      const dx = Math.cos(a) * side, dy = -Math.sin(a), px = -dy * side, py = dx * side;       // Richtung der Feder und ihre Quer-Richtung
      const tip = [rx + dx * L, ry + dy * L], b1 = [rx + px * w * 0.5, ry + py * w * 0.5], b2 = [rx - px * w * 0.5, ry - py * w * 0.5];
      const mid1 = [rx + dx * L * 0.6 + px * w * 0.7, ry + dy * L * 0.6 + py * w * 0.7], mid2 = [rx + dx * L * 0.6 - px * w * 0.7, ry + dy * L * 0.6 - py * w * 0.7];
      const poly = [b1, mid1, tip, mid2, b2];
      ctx.fillStyle = P.orange; pxPolyFill(ctx, poly);                                      // dunkles Gold als Grundkoerper
      ctx.fillStyle = P.yellow; pxPolyFill(ctx, [b1, [rx + dx * L * 0.6 + px * w * 0.3, ry + dy * L * 0.6 + py * w * 0.3], [rx + dx * L * 0.92, ry + dy * L * 0.92], [rx + dx * L * 0.3, ry + dy * L * 0.3]]);
      ctx.fillStyle = P.ice; pxLine(ctx, rx + dx * L * 0.15, ry + dy * L * 0.15, rx + dx * L * 0.85, ry + dy * L * 0.85, 1);     // heller Federkiel
      ctx.fillStyle = '#7a4a00'; pxPoly(ctx, poly, true, 1);                                // Umriss
    });
    ctx.fillStyle = P.yellow; pxDisc(ctx, rx, ry, 5); ctx.fillStyle = P.ice; pxDisc(ctx, rx, ry, 2);       // Gelenk
    ctx.restore();
  },

  // Schlichter Zeit-Hinweis: kleines Feld mit gelbem Rahmen, gleitet kurz ein und blendet aus (keine Fluegel, kein Blitz, kein Wackeln)
  drawTimePop(ctx) {
    const k = this.tpop;
    if (!k) return;
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2, w = 212, h = 40, lvl = Math.min(2, k.lvl);
    const a = Math.min(1, k.t / 0.35, (this.TIME_TOTAL - k.t) / 0.6), y = 96 - (1 - a) * 8;
    const col = [P.yellow, P.orange, P.red][lvl];                      // der Totenkopf wird von Hinweis zu Hinweis boeser: Farbe, Hoerner, Glut, Flammen
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    uiPanel(ctx, cx - w / 2, y, w, h, { color: col, fill: P.void, alpha: 0.9 });
    this.drawSkull(ctx, cx - w / 2 + 24, y + h / 2 + 2, lvl, k.t);
    uiText(ctx, k.text, cx + 22, y + h / 2 + 5, { size: T.h2, color: col, align: 'center' });
    ctx.restore();
  },

  // Schwierigkeits-Totenkoepfe im Stil von Minecraft Dungeons (Default / Adventure / Apocalypse): ein schlichter Schaedel, ein "muskuloeser" Schaedel (breite Brauen,
  // Backenwuelste, schwerer Kiefer, Stacheln) und ein dreiaeugiger Mutanten-Schaedel mit riesigen Hoernern. Zeichen: X Knochen, D Schatten, H Horn/Stachel,
  // O Augenhoehle, E leuchtendes Auge, N Nase, T Zahnluecke, . leer. Farben wie bisher: Knochenweiss, Orange, Rot.
  SKULLS: [
    { rows: ['...XXXXX...', '.XXXXXXXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'XXOOOXOOOXX', 'XXOOOXOOOXX', 'XXXXXNXXXXX', '.XXXXXXXXX.', '..XTXTXTX..', '..XXXXXXX..', '...XXXXX...'],
      X: '#dfe7f2', D: '#9aa8b8', H: '#dfe7f2', E: '#dfe7f2' },
    { rows: ['.H.XXXXXXX.H.', '.XXXXXXXXXXX.', 'XXXXXXXXXXXXX', 'XDDDXXXXXDDDX', 'XXODEXXXEDOXX', 'XXOOOXXXOOOXX', 'XDXXXXNXXXXDX', 'XDXXXXXXXXXDX', '.XXXXXXXXXXX.', '.XXTXTXTXTXX.', '..XXXXXXXXX..', '...XXXXXXX...'],
      X: '#e6c9a0', D: '#b88a5a', H: '#ff9a2e', E: '#ff3b3b' },
    { rows: ['HH...........HH', '.HH..XXXXX..HH.', '.HHH.XXXXX.HHH.', '..HHXXXXXXXHH..', '..HXXXXEXXXXH..', '...XXXXXXXXX...', '..XXXXXXXXXXX..', '..XXOOXXXOOXX..', '..XXOEXXXEOXX..', '..XXXXXNXXXXX..', '...XXXXXXXXX...', '...XTXTXTXTX...', '...XXXXXXXXX...', '....X.X.X.X....'],
      X: '#c4584a', D: '#8a2c24', H: '#ffb02e', E: '#ff3b3b' },
  ],
  drawSkull(ctx, cx, cy, lvl, t) {
    const P = STYLE.pal, N = PIXEL, S = this.SKULLS[lvl], rows = S.rows, w = rows[0].length, h = rows.length;
    const x0 = Math.round((cx - w * N / 2) / N) * N, y0 = Math.round((cy - h * N / 2) / N) * N;
    const cell = (c, r, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + c * N, y0 + r * N, N, N); };
    if (lvl >= 1) { ctx.save(); ctx.globalAlpha = (lvl === 2 ? 0.3 : 0.16) * (0.8 + 0.2 * Math.sin(t * 9)); ctx.fillStyle = lvl === 2 ? P.red : P.orange; pxGlow(ctx, cx, cy, lvl === 2 ? 22 : 16); ctx.restore(); }
    const at = (c, r) => (r >= 0 && r < h && c >= 0 && c < w ? rows[r][c] : '.');
    for (let r = -1; r <= h; r++) for (let c = -1; c <= w; c++) {                      // dunkler Umriss um die Form, damit der Kopf auf jedem Hintergrund lesbar bleibt
      if (at(c, r) !== '.') continue;
      if (at(c - 1, r) !== '.' || at(c + 1, r) !== '.' || at(c, r - 1) !== '.' || at(c, r + 1) !== '.') cell(c, r, P.ink);
    }
    const flick = Math.sin(t * 14) > -0.3;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch = rows[r][c]; if (ch === '.') continue;
      let col = S.X;
      if (ch === 'D') col = S.D; else if (ch === 'H') col = S.H;
      else if (ch === 'O' || ch === 'N' || ch === 'T') col = P.ink;
      else if (ch === 'E') col = lvl === 0 ? P.ink : (flick || !(lvl === 2 && c === 7) ? S.E : P.red);        // leuchtende Augen flackern leicht, das dritte Auge am staerksten
      cell(c, r, col);
    }
    if (lvl === 2) for (let i = 0; i < 3; i++) {                                         // Flammen zwischen den Hoernern
      const f = (t * 2.2 + i * 0.37) % 1;
      ctx.globalAlpha = 1 - f; cell(5 + i * 2, -1 - Math.round(f * 4), i === 1 ? P.yellow : P.orange); ctx.globalAlpha = 1;
    }
  },

  draw(ctx) {
    for (const q of this.parts) {                                    // Funken (auch nach dem Ende des Textes noch sichtbar)
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.c; pxFill(ctx, q.x, q.y, q.s / 2); ctx.restore();
    }
    this.drawTimePop(ctx);
    const m = this.cur;
    if (!m) return;
    const P = STYLE.pal, t = this.t, cx = STAGE_W / 2, T = STYLE.type;
    const fadeIn = Math.min(1, t / this.IN), fadeOut = Math.min(1, (this.TOTAL - t) / this.OUT), alpha = Math.min(fadeIn, fadeOut);
    const open = Math.min(1, Math.max(0, (t - 0.1) / 0.75)), eo = 1 + 2.2 * Math.pow(open - 1, 3) + 1.2 * Math.pow(open - 1, 2), flap = Math.sin(t * 5) * (open >= 1 ? 1 : 0);
    const size = 22, nameY = 62, scale = 1 + 0.7 * Math.pow(1 - fadeIn, 2);                 // der Name "schlaegt ein": gross und schnell auf Normalgroesse
    ctx.save();
    ctx.font = uiFont(size);
    const tw = ctx.measureText(I18n.t(m.name)).width * scale;
    ctx.restore();
    this.half = tw / 2 + 4;
    // Strahlen und Schein hinter allem
    ctx.save();
    ctx.globalAlpha = 0.1 * alpha; ctx.fillStyle = P.yellow;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + t * 0.25, r = 120 + 25 * Math.sin(t * 2 + i), w = 0.07;
      pxPolyFill(ctx, [[cx, 54], [cx + Math.cos(a - w) * r * 1.6, 54 + Math.sin(a - w) * r], [cx + Math.cos(a + w) * r * 1.6, 54 + Math.sin(a + w) * r]]);
    }
    ctx.globalAlpha = 0.18 * alpha; pxGlow(ctx, cx, 54, 80 + 6 * Math.sin(t * 4));
    ctx.restore();
    // Fluegel links und rechts vom Text
    const ry = 58 + 2 * Math.sin(t * 3), gap = this.half + 8;
    this.wing(ctx, cx - gap, ry, -1, Math.max(0.001, eo), flap, alpha);
    this.wing(ctx, cx + gap, ry, 1, Math.max(0.001, eo), flap, alpha);
    // Text: Titel, Name, Belohnung
    ctx.save();
    ctx.globalAlpha = alpha;
    uiText(ctx, '- MILESTONE REACHED -', cx, nameY - 22, { size: T.small, color: P.yellow, align: 'center', glow: P.orange });
    ctx.translate(cx, nameY); ctx.scale(scale, scale);
    uiText(ctx, m.name, 0, 0, { size, color: P.yellow, align: 'center', glow: P.orange });
    // Glanzstreifen: laeuft einmal ueber den Namen
    const sx = -tw / scale / 2 - 20 + (t - 0.9) / 0.7 * (tw / scale + 40);
    if (t > 0.9 && t < 1.6) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx - 8, -size, 14, size + 6); ctx.clip();
      uiText(ctx, m.name, 0, 0, { size, color: P.white, align: 'center' });
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha * Math.min(1, Math.max(0, (t - 0.5) / 0.4));
    uiText(ctx, milestoneRewardText(m), cx, nameY + 16, { size: T.body, color: P.ice, align: 'center', glow: P.cyanMid });
    ctx.restore();
  },
};
