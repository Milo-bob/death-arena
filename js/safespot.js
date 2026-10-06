// Safe Spot: kleine Schutzzone, die zu Beginn jedes Welt-Events (Swarm Surge, Crimson Eclipse, Meteoritenhagel) erscheint. Zahlen: CFG.safeSpot.
// Im Spot ist der Spieler unverwundbar und kann nicht angreifen, alle Gegner bremsen und weichen langsam zurück. Das Zeitbudget (`left`)
// läuft nur ab, solange der Spieler im Spot steht; der Spot bleibt, bis das Budget leer ist oder alle Events vorbei sind (oder ein Bosskampf beginnt).
const SafeSpot = {
  spot: null,        // { x, y, left, age } oder null
  fading: null,      // { x, y, t } verschwindender Spot (nur Optik)
  inside: false,     // steht der Spieler gerade im Spot? (wirkt auf Player.invincible, Angriffe und Gegner)
  hintT: 0,          // Hinweis "no attacks" nach einem Angriffsversuch im Spot
  prev: { flood: false, moon: false, meteor: false },

  reset() { this.spot = null; this.fading = null; this.inside = false; this.hintT = 0; this.prev = { flood: false, moon: false, meteor: false }; },

  get on() { return !G.bossFight && !Tutorial.active && !(G.victory > 0); },

  // Zufällige freie Stelle in der Nähe des Spielers (nicht in einer Barrikade), null wenn nichts gefunden
  place() {
    const C = CFG.safeSpot, p = G.player;
    for (let n = 0; n < 30; n++) {
      const a = rand(0, 360), d = rand(C.minDist, C.maxDist);
      let x = p.x + fwdX(a) * d, y = p.y + fwdY(a) * d;
      if (!CFG.map.infinite) [x, y] = clampToMap(x, y, C.radius + 6);
      if (G.obstacles.some((o) => o.alive && dist2(x, y, o.x, o.y) < (o.r + C.radius + 6) ** 2)) continue;
      return [x, y];
    }
    return null;
  },

  end() {
    if (this.spot) this.fading = { x: this.spot.x, y: this.spot.y, t: 0.4 };
    this.spot = null; this.inside = false;
  },

  update(dt) {
    const C = CFG.safeSpot, flags = { flood: !!G.flood, moon: !!G.bloodMoon, meteor: !!G.meteorShower };
    if (this.fading) { this.fading.t -= dt; if (this.fading.t <= 0) this.fading = null; }
    this.hintT = Math.max(0, this.hintT - dt);
    if (!this.on) { this.prev = flags; this.end(); this.fading = null; return; }
    const anyEvent = flags.flood || flags.moon || flags.meteor;
    const started = (flags.flood && !this.prev.flood) || (flags.moon && !this.prev.moon) || (flags.meteor && !this.prev.meteor);
    this.prev = flags;
    if (started) {                                          // neues Event: neuer Spot mit frischem Zeitbudget (ersetzt einen alten)
      this.end();
      const pos = this.place();
      if (pos) { this.spot = { x: pos[0], y: pos[1], left: C.budget, age: 0 }; Sfx.play('drop'); }
    }
    const s = this.spot;
    if (!s) { this.inside = false; return; }
    if (!anyEvent) { this.end(); return; }
    s.age += dt;
    if (!CFG.map.infinite) [s.x, s.y] = clampToMap(s.x, s.y, C.radius + 6);          // z. B. bei verkleinerter Arena
    const p = G.player;
    this.inside = dist2(p.x, p.y, s.x, s.y) <= C.radius * C.radius;
    if (!this.inside) return;
    s.left -= dt;
    if (Input.actDown('attack') || Input.actDown('beam')) this.hintT = C.hintTime;
    if (s.left <= 0) { Juice.sparks(s.x, s.y, STYLE.pal.green, 10, 3); this.end(); }
  },

  // Gegner: bremsen und weichen zurück, solange der Spieler im Spot steht (aufgerufen aus Enemy.update)
  slow() { return this.inside ? CFG.safeSpot.enemySlow : 1; },
  retreat(e, dt) {
    if (!this.inside || !this.spot) return;
    const s = this.spot, dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1, k = CFG.safeSpot.retreat * framesOf(dt);
    e.x += dx / d * k; e.y += dy / d * k;
  },

  // Treffer, der im Spot abgefangen wurde (Statistik)
  blocked(src, amount) { Stats.saved(src, amount); Juice.sparks(G.player.x, G.player.y, STYLE.pal.green, 3, 2); },

  draw(ctx) {
    const C = CFG.safeSpot, P = STYLE.pal, t = G.realTime;
    const s = this.spot || (this.fading && { x: this.fading.x, y: this.fading.y, left: 0, age: 9, out: this.fading.t / 0.4 });
    if (!s) return;
    const cx = STAGE_W / 2 + s.x, cy = STAGE_H / 2 - s.y, R = C.radius;
    const fade = s.out !== undefined ? s.out : Math.min(1, s.age / 0.3);
    const low = this.spot && s.left < C.warnAt && Math.floor(t * 8) % 2 === 0;       // Rest knapp: blinken
    ctx.save();
    ctx.globalAlpha = (this.inside ? 0.3 : 0.18) * fade; ctx.fillStyle = P.green; pxGlow(ctx, cx, cy, R);
    ctx.globalAlpha = (low ? 0.35 : 0.9) * fade; ctx.fillStyle = this.inside ? P.white : P.green; pxRing(ctx, cx, cy, R, 2, 14, t * 0.15);
    if (this.spot) {                                                                  // Zeitbogen: Restzeit des Budgets
      const frac = clamp(s.left / C.budget, 0, 1);
      ctx.globalAlpha = (low ? 0.4 : 0.95) * fade; ctx.fillStyle = frac < 0.3 ? P.yellow : P.green;
      pxArc(ctx, cx, cy, R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, 1);
    }
    ctx.globalAlpha = fade;
    if (this.hintT > 0) uiText(ctx, 'NO ATTACKS IN SAFE SPOT', cx, cy - R - 16, { size: STYLE.type.small, color: P.yellow, align: 'center' });
    ctx.restore();
  },
};
