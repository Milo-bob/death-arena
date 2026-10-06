// Meilenstein-Fanfare: wird mitten im Lauf gezeigt, sobald ein Meilenstein erreicht ist (die Belohnung wird weiter am Laufende gutgeschrieben).
// Kein Textkasten: grosser goldener Text oben in der Mitte mit goldenen Pixel-Fluegeln links und rechts, Strahlen, Glanzstreifen und Funken.
// Dazu Bildschirmblitz, Wackeln und der Fanfarenklang Sfx 'milestone'. Mehrere gleichzeitig erreichte Meilensteine laufen nacheinander.
// Alles gezeichnet mit den Pixel-Helfern aus style.js.

const MsFx = {
  queue: [], cur: null, t: 0, seen: new Set(), parts: [], checkT: 0,
  TOTAL: 4.8, IN: 0.45, OUT: 0.6,

  reset() { this.queue = []; this.cur = null; this.t = 0; this.seen = new Set(); this.parts = []; this.checkT = 0; },

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
  check(dt) {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    if (Tutorial.active || G.cheated || G.victory > 0) return;
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

  draw(ctx) {
    for (const q of this.parts) {                                    // Funken (auch nach dem Ende des Textes noch sichtbar)
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.c; pxFill(ctx, q.x, q.y, q.s / 2); ctx.restore();
    }
    const m = this.cur;
    if (!m) return;
    const P = STYLE.pal, t = this.t, cx = STAGE_W / 2, T = STYLE.type;
    const fadeIn = Math.min(1, t / this.IN), fadeOut = Math.min(1, (this.TOTAL - t) / this.OUT), alpha = Math.min(fadeIn, fadeOut);
    const open = Math.min(1, Math.max(0, (t - 0.1) / 0.75)), eo = 1 + 2.2 * Math.pow(open - 1, 3) + 1.2 * Math.pow(open - 1, 2), flap = Math.sin(t * 5) * (open >= 1 ? 1 : 0);
    const size = 22, nameY = 62, scale = 1 + 0.7 * Math.pow(1 - fadeIn, 2);                 // der Name "schlaegt ein": gross und schnell auf Normalgroesse
    ctx.save();
    ctx.font = uiFont(size);
    const tw = ctx.measureText(m.name).width * scale;
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
