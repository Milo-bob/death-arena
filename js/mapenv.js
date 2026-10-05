// Umgebungsmechanik der Karten (nur Karte 2 Ember Foundry und Karte 3 Toxic Core, Zahlen in CFG.maps[].env, Anzeige in CFG.maps[].hazards).
// Karte 2: Lava-Schlote (LavaVent: Ruhe -> Vorwarnung -> Ausbruch, trifft Spieler UND Gegner) und Schlackenbänder (SlagBelt: schieben Figuren, kehren
// nach einer Vorwarnung um). Karte 3: Säurepfützen (AcidPool: bremsen und schaden, stoßen von Zeit zu Zeit eine Giftwolke aus, siehe mapspecial.js).
// Alle Gefahren stehen in G.hazards und werden über MapEnv gesteuert. Im Bosskampf, im Tutorial und in der Siegphase ruhen sie (gedimmt, ohne Wirkung).
// Im Endlos-Modus werden sie um den Spieler herum aufgestellt und still umgesetzt, wenn sie weit weg sind.
// Gezeichnet wird mit den Pixel-Helfern aus style.js.

// ---------- Lava-Schlot (Karte 2) ----------
class LavaVent {
  constructor() {
    const V = G.map.env.vents;
    this.reach = V.radius; this.gap = V.minGap;
    this.x = 0; this.y = 0;
    this.cracks = [];                                     // Risse im Boden: Winkel, Länge
    for (let i = 0; i < 6; i++) this.cracks.push([(i / 6) * 6.283 + rand(-0.35, 0.35), rand(0.55, 1)]);
    this.hit = new Set();
    this.reset();
    this.t = rand(2, V.idle[1]);                          // Start versetzt, damit nicht alle gleichzeitig ausbrechen
  }
  reset() { this.state = 'idle'; this.age = 0; this.hitPlayer = false; this.hit.clear(); this.t = this.idleTime(); }
  get idle() { return this.state === 'idle'; }
  idleTime() {
    const V = G.map.env.vents, wave = Math.floor(G.time / CFG.waves.length);
    return rand(V.idle[0], V.idle[1]) * Math.max(V.minIdleFactor, 1 - V.waveFaster * wave);       // pro Welle kürzere Pausen
  }
  near() { return dist2(this.x, this.y, G.player.x, G.player.y) < 300 * 300; }

  update(dt, on) {
    const V = G.map.env.vents;
    if (!on) { if (this.state !== 'idle') this.reset(); return; }
    this.age += dt; this.t -= dt;
    if (this.state === 'idle') {
      if (this.t <= 0) { this.state = 'warn'; this.t = V.warn; this.age = 0; if (this.near()) Sfx.play('ventWarn'); }
    } else if (this.state === 'warn') {
      if (this.t <= 0) {
        this.state = 'erupt'; this.t = V.erupt; this.age = 0; this.hitPlayer = false; this.hit.clear();
        if (this.near()) { Sfx.play('ventBlast'); Juice.shake(2); }
        Juice.sparks(this.x, this.y, STYLE.pal.orange, 14, 5);
      }
    } else {
      this.damage(V);
      if (this.t <= 0) this.reset();
    }
  }

  // Ein Treffer pro Ausbruch für den Spieler (wiederholt den Versuch, solange er wegen Unverwundbarkeit nicht zählt), Gegner im Radius nehmen enemyHits Treffer
  damage(V) {
    const p = G.player;
    if (!this.hitPlayer && circlesOverlap(this.x, this.y, V.radius, p.x, p.y, p.radius) && p.hit('touch', V.dmg, 'LAVA VENT')) this.hitPlayer = true;
    for (const e of G.enemies) {
      if (!e.alive || this.hit.has(e) || !circlesOverlap(this.x, this.y, V.radius, e.x, e.y, e.radius)) continue;
      this.hit.add(e);
      for (let i = 0; i < V.enemyHits && e.alive; i++) e.takeHit(i === 0, 'lava');
    }
  }

  draw(ctx, dim) {
    const V = G.map.env.vents, P = STYLE.pal, R = V.radius, t = G.realTime, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    const warn = this.state === 'warn' ? 1 - this.t / V.warn : 0, erupt = this.state === 'erupt', fade = erupt ? Math.min(1, this.t / 0.25) : 1;
    ctx.save();
    // Boden: dunkle Mulde mit Rissen, beim Warnen glühen sie auf
    ctx.globalAlpha = 0.55 * dim; ctx.fillStyle = P.redDark; pxDisc(ctx, cx, cy, R * 0.6);
    const hot = erupt ? 1 : warn;
    for (const [a, len] of this.cracks) {
      ctx.fillStyle = hot > 0.6 ? P.yellow : hot > 0.2 ? P.orange : P.redMid;
      ctx.globalAlpha = (0.55 + 0.45 * hot) * dim;
      pxLine(ctx, cx, cy, cx + Math.cos(a) * R * len, cy + Math.sin(a) * R * len * 0.8);
    }
    if (this.state === 'warn') {                                                   // Warnung: Rand des Ausbruchsbereichs + wachsende Glut, blinkt zum Schluss
      const blink = warn > 0.7 && Math.floor(t * 14) % 2 === 0;
      ctx.globalAlpha = (0.16 + 0.26 * warn) * dim; ctx.fillStyle = P.red; pxDisc(ctx, cx, cy, R * warn);
      ctx.globalAlpha = dim; ctx.fillStyle = blink ? P.yellow : P.red; pxRing(ctx, cx, cy, R, 2, 12, t * 0.3);
      ctx.fillStyle = P.orange; ctx.globalAlpha = 0.8 * dim;
      for (let i = 0; i < 4; i++) pxFill(ctx, cx + Math.cos(i * 1.7 + this.x) * R * 0.4, cy + Math.sin(i * 2.3) * R * 0.25 - ((t * 20 + i * 7) % 14));       // aufsteigende Funken
    } else if (erupt) {                                                            // Ausbruch: Lava-Scheibe, helle Mitte, Feuersäule aus Pixeln
      ctx.globalAlpha = 0.85 * fade * dim; ctx.fillStyle = P.orange; pxDisc(ctx, cx, cy, R);
      ctx.globalAlpha = 0.9 * fade * dim; ctx.fillStyle = P.yellow; pxDisc(ctx, cx, cy, R * 0.65);
      ctx.fillStyle = P.white; pxDisc(ctx, cx, cy, R * (0.3 + 0.08 * Math.sin(t * 40)));
      ctx.globalAlpha = fade * dim; ctx.fillStyle = P.red; pxRing(ctx, cx, cy, R, 2);
      ctx.fillStyle = P.yellow;
      for (let i = 0; i < 9; i++) { const k = ((t * 3 + i * 0.37) % 1); pxFill(ctx, cx + Math.sin(i * 5.1 + t * 6) * R * 0.5, cy - k * R * 1.6, 1 + (k < 0.4 ? 1 : 0)); }
    }
    ctx.restore();
  }
}

// ---------- Schlackenband (Karte 2) ----------
// Förderband aus glühender Schlacke: schiebt Spieler und Gegner in Pfeilrichtung. Kehrt in unregelmäßigen Abständen um, davor steht es 1 s still (Chevrons blinken).
class SlagBelt {
  constructor() {
    const B = G.map.env.belts;
    this.x = 0; this.y = 0;
    this.horizontal = Math.random() < 0.5; this.dir = Math.random() < 0.5 ? 1 : -1;
    this.len = B.len; this.w = B.width; this.reach = Math.max(B.len, B.width) / 2; this.gap = B.minGap;
    this.phase = rand(0, 22);
    this.reset();
  }
  reset() { const B = G.map.env.belts; this.flipT = rand(B.flip[0], B.flip[1]); this.warn = false; }
  get idle() { return true; }

  update(dt, on) {
    const B = G.map.env.belts;
    if (!on) { this.warn = false; return; }
    this.flipT -= dt;
    this.warn = this.flipT <= B.flipWarn;
    if (this.flipT <= 0) {
      this.dir *= -1; this.reset();
      if (dist2(this.x, this.y, G.player.x, G.player.y) < 300 * 300) Sfx.play('beltFlip');
    }
    if (!this.warn) this.phase += this.dir * B.push * 30 * dt;                        // Chevrons laufen mit der Schubgeschwindigkeit
  }

  // Schub (Einheiten pro Bild) für eine Figur an (x, y) mit Radius r
  push(x, y, r) {
    if (this.warn) return [0, 0];
    const B = G.map.env.belts, hx = (this.horizontal ? this.len : this.w) / 2, hy = (this.horizontal ? this.w : this.len) / 2;
    if (Math.abs(x - this.x) > hx + r * 0.5 || Math.abs(y - this.y) > hy + r * 0.5) return [0, 0];
    return this.horizontal ? [this.dir * B.push, 0] : [0, this.dir * B.push];
  }

  draw(ctx, dim) {
    const B = G.map.env.belts, P = STYLE.pal, t = G.realTime, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, L = this.len / 2, W = this.w / 2;
    const pt = (u, v) => (this.horizontal ? [cx + u, cy + v] : [cx + v, cy - u]);         // u = entlang des Bandes (Welt-Richtung), v = quer
    const [x0, y0] = pt(-L, -W), [x1, y1] = pt(L, W), blink = this.warn && Math.floor(t * 8) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = 0.85 * dim; ctx.fillStyle = P.greyDark;
    ctx.fillRect(Math.round(Math.min(x0, x1) / PIXEL) * PIXEL, Math.round(Math.min(y0, y1) / PIXEL) * PIXEL, Math.round(Math.abs(x1 - x0) / PIXEL) * PIXEL, Math.round(Math.abs(y1 - y0) / PIXEL) * PIXEL);
    ctx.globalAlpha = dim; ctx.fillStyle = this.warn ? (blink ? P.yellow : P.redMid) : P.orange;
    for (const v of [-W, W]) { const [ax, ay] = pt(-L, v), [bx, by] = pt(L, v); pxLine(ctx, ax, ay, bx, by); }       // glühende Kanten
    ctx.fillStyle = P.redMid;
    for (const u of [-L, L]) { const [ax, ay] = pt(u, -W), [bx, by] = pt(u, W); pxLine(ctx, ax, ay, bx, by, 2); }    // Enden
    const sp = 22, off = ((this.phase % sp) + sp) % sp;                                                              // Chevrons (Pfeilspitzen) laufen in Richtung dir
    ctx.fillStyle = this.warn ? (blink ? P.yellow : P.redMid) : P.orange; ctx.globalAlpha = (this.warn ? 0.7 : 0.85) * dim;
    for (let u = -L + 6 + off; u < L - 4; u += sp) {
      const [tx, ty] = pt(u, 0), [ax, ay] = pt(u - 6 * this.dir, -W * 0.6), [bx, by] = pt(u - 6 * this.dir, W * 0.6);
      pxLine(ctx, ax, ay, tx, ty); pxLine(ctx, tx, ty, bx, by);
    }
    ctx.restore();
  }
}

// ---------- Säurepfütze (Karte 3) ----------
class AcidPool {
  constructor() {
    const A = G.map.env.pools;
    this.x = 0; this.y = 0;
    this.r = rand(A.radius[0], A.radius[1]); this.reach = this.r; this.gap = A.minGap;
    this.warn = 0;
    this.bt = rand(A.burp[0], A.burp[1]);
  }
  reset() { this.warn = 0; this.bt = rand(G.map.env.pools.burp[0], G.map.env.pools.burp[1]); }
  get idle() { return this.warn <= 0; }

  update(dt, on) {
    const A = G.map.env.pools;
    if (!on) { this.warn = 0; return; }
    if (this.warn > 0) { this.warn -= dt; if (this.warn <= 0) this.burp(); }
    else {
      this.bt -= dt;
      if (this.bt <= 0) { this.warn = A.burpWarn; if (dist2(this.x, this.y, G.player.x, G.player.y) < 300 * 300) Sfx.play('acidBurp'); }
    }
    const p = G.player;                                                           // Dauerschaden, solange man drin steht (Schildblase, Dash und Unsichtbarkeit schützen)
    if (!G.god && !p.invincible && !p.shield && dist2(this.x, this.y, p.x, p.y) <= (this.r + p.radius * 0.5) ** 2) {
      p.hp -= A.dps * dt; Stats.dealt('ACID POOL', A.dps * dt, false);
    }
  }

  // Giftwolke aus der Pfütze (Vorwarnung und Schaden der Wolke: ToxicCloud in mapspecial.js)
  burp() {
    this.bt = rand(G.map.env.pools.burp[0], G.map.env.pools.burp[1]);
    dropCloud(this.x, this.y);
    Juice.sparks(this.x, this.y, STYLE.pal.green, 8, 3);
  }

  // Tempofaktor für eine Figur an (x, y) mit Radius r (player = true: Spieler, sonst Gegner)
  slow(x, y, r, player) {
    const A = G.map.env.pools;
    return dist2(this.x, this.y, x, y) <= (this.r + r * 0.5) ** 2 ? (player ? A.slow : A.enemySlow) : 1;
  }

  draw(ctx, dim) {
    const A = G.map.env.pools, P = STYLE.pal, t = G.realTime, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, r = this.r;
    const k = this.warn > 0 ? 1 - this.warn / A.burpWarn : 0, wob = 1 + 0.03 * Math.sin(t * 2 + this.x);
    ctx.save();
    ctx.globalAlpha = 0.8 * dim; ctx.fillStyle = P.greenDark; pxDisc(ctx, cx, cy, r * wob);
    ctx.globalAlpha = 0.45 * dim; ctx.fillStyle = P.greenMid; pxDisc(ctx, cx, cy, r * 0.62);
    ctx.globalAlpha = 0.9 * dim; ctx.fillStyle = k > 0.6 && Math.floor(t * 14) % 2 === 0 ? P.yellow : P.green; pxRing(ctx, cx, cy, r * wob, 1, 14, t * 0.08);
    ctx.fillStyle = P.ice; ctx.globalAlpha = 0.75 * dim;                          // Blasen steigen auf und platzen, vor dem Ausstoß schneller
    for (let i = 0; i < 6; i++) {
      const sp = 0.35 + 0.9 * k, ph = (i * 0.37 + t * sp) % 1, a = i * 2.1 + this.x;
      pxFill(ctx, cx + Math.cos(a) * r * 0.65 * (0.4 + 0.6 * ((i * 0.53) % 1)), cy + Math.sin(a) * r * 0.4 - ph * 8, ph > 0.8 ? 2 : 1);
    }
    if (this.warn > 0) { ctx.globalAlpha = (0.2 + 0.3 * k) * dim; ctx.fillStyle = P.green; pxDisc(ctx, cx, cy, r * k); }
    ctx.restore();
  }
}

// ---------- Steuerung ----------
const MapEnv = {
  // Wirken die Gefahren gerade? (Im Bosskampf, Tutorial und in der Siegphase ruhen sie.)
  get on() { return !G.bossFight && !Tutorial.active && !(G.victory > 0); },

  // Zu Beginn eines Laufs: Gefahren der gewählten Karte aufstellen (G.hazards)
  init() {
    G.hazards = [];
    const E = G.map.env;
    if (!E || Tutorial.active) return;
    const make = (cls, n, minPlayer) => { for (let i = 0; i < n; i++) { const h = new cls(); const pos = this.spot(h, minPlayer); if (pos) { [h.x, h.y] = pos; G.hazards.push(h); } } };
    if (E.vents) make(LavaVent, E.vents.count, 90);
    if (E.belts) make(SlagBelt, E.belts.count, 70);
    if (E.pools) make(AcidPool, E.pools.count, 70);
  },

  // Freie Stelle: Abstand zum Spieler (minPlayer), zu anderen Gefahren (Radius + gap) und zu den Spawnpunkten. Endlos-Modus: im Ring um den Spieler. null = nichts gefunden
  spot(h, minPlayer) {
    const p = G.player;
    for (let n = 0; n < 40; n++) {
      let x, y;
      if (CFG.map.infinite) { const a = rand(0, 360), d = rand(150, 420); x = p.x + fwdX(a) * d; y = p.y + fwdY(a) * d; }
      else [x, y] = clampToMap(rand(-CFG.map.halfW, CFG.map.halfW), rand(-CFG.map.halfH, CFG.map.halfH), h.reach + 40);
      if (dist2(x, y, p.x, p.y) < minPlayer * minPlayer) continue;
      if (G.hazards.some((o) => o !== h && dist2(x, y, o.x, o.y) < (o.reach + h.reach + h.gap) ** 2)) continue;
      if (!CFG.map.infinite && G.spawnPointList().some(([sx, sy]) => dist2(x, y, sx, sy) < (h.reach + 30) ** 2)) continue;
      return [x, y];
    }
    return null;
  },

  update(dt) {
    if (!G.hazards.length) return;
    const on = this.on;
    for (const h of G.hazards) h.update(dt, on);
    if (!on || !CFG.map.infinite) return;
    for (const h of G.hazards) {                                                  // Endlos-Modus: weit entfernte, ruhende Gefahren nahe beim Spieler neu aufstellen
      if (!h.idle || dist2(h.x, h.y, G.player.x, G.player.y) < 650 * 650) continue;
      const pos = this.spot(h, 140);
      if (pos) { [h.x, h.y] = pos; h.reset(); }
    }
  },

  // Schub aller Bänder auf eine Figur (Einheiten pro Bild, mit framesOf(dt) malnehmen)
  pushAt(x, y, r) {
    let bx = 0, by = 0;
    if (!G.hazards.length || !this.on) return [0, 0];
    for (const h of G.hazards) if (h.push) { const v = h.push(x, y, r); bx += v[0]; by += v[1]; }
    return [bx, by];
  },

  // Tempofaktor aller Säurepfützen für eine Figur (1 = normal)
  slowAt(x, y, r, player) {
    let f = 1;
    if (!G.hazards.length || !this.on) return 1;
    for (const h of G.hazards) if (h.slow) f = Math.min(f, h.slow(x, y, r, player));
    return f;
  },

  draw(ctx) {
    if (!G.hazards.length) return;
    const dim = this.on ? 1 : 0.45;                                               // ruhend: blass
    for (const h of G.hazards) h.draw(ctx, dim);
  },
};
