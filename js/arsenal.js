// Neue Waffen und Abilities (Vorbild: Survivor.io). Werte in config.js, Abschnitt [3] (Waffen) und [5] (Abilities).
//   Nahkampf:  ArcSlash (Peitsche, Katana), GroundSlam (Hammer)
//   Fernkampf: Boomerang, Molotov (Schrotflinte nutzt Shot aus weapons.js)
//   Stark:     ChainLightning (Kettenblitz), BlackHole (Schwarzes Loch)
//   Abilities: Drone (Kampfdrohne), Storm (Blitzsturm); Schockschritt, Adrenalin, Ueberladung, Rausch stehen in player.js
// Jede Klasse hat wie die anderen Angriffe: kind, damaging, alive, update(dt), hitsCircle(x, y, r), draw(ctx).

const toScreen = (x, y) => [STAGE_W / 2 + x, STAGE_H / 2 - y];

// Naechster lebender Gegner/Boss (Ziel fuer Drohne, Blitze); optional nur innerhalb von range
function nearestTarget(x, y, range, skip) {
  let best = null, bd = range * range;
  for (const t of G.enemies.concat(G.bossList())) {
    if (!t.alive || (skip && skip.has(t))) continue;
    const d = dist2(x, y, t.x, t.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// Schaden eines Spezialangriffs: Bosse verlieren Leben direkt, Gegner nehmen n Treffer (wie Granate: Tank 6x, Raetsel-Rüstung ignoriert)
function specialDamage(t, hits, bossDmg) {
  if (t.isBoss) { t.hp -= bossDmg * damageBoost(); t.bar = 0; return; }
  for (let i = 0; i < hits && t.alive; i++) t.takeHit(i === 0, 'grenade');
}

// ---------- Aufleucht-Marker: Ring(e), Text und (optional) ein stehender Schutzring, wenn ein Effekt ausloest ----------
// o: radius (Endgroesse der Ringe), rings (Anzahl), life (Sekunden), hold (stehender Ring um den Spieler, solange der Marker lebt)
class TriggerFx {
  constructor(player, label, color, o = {}) {
    this.kind = 'fx';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.label = label; this.color = color;
    this.radius = o.radius || 60; this.rings = o.rings || 2; this.life = o.life || 1.4; this.hold = !!o.hold;
    this.age = 0;
  }
  hitsCircle() { return false; }
  update(dt) { this.age += dt; if (this.age >= this.life) this.alive = false; }
  draw(ctx) {
    const p = this.player, [cx, cy] = toScreen(p.x, p.y), t = this.age / this.life, T = STYLE.type;
    ctx.save();
    ctx.fillStyle = this.color;
    const burst = Math.min(1, this.age / 0.7);                                   // Ringe laufen in den ersten 0.7 s nach aussen
    for (let i = 0; i < this.rings; i++) {
      const k = clamp(burst * 1.5 - i * 0.3, 0, 1);
      if (k <= 0 || k >= 1) continue;
      ctx.globalAlpha = 1 - k;
      pxRing(ctx, cx, cy, 10 + this.radius * k, 2);
    }
    if (this.age < 0.35) { ctx.globalAlpha = 0.5 * (1 - this.age / 0.35); pxGlow(ctx, cx, cy, 16 + 30 * this.age / 0.35); }
    if (this.hold) {                                                             // Schutzring: pulsiert, blinkt kurz vor dem Ende
      const blink = t > 0.8 && Math.floor(this.age * 10) % 2 === 0;
      ctx.globalAlpha = blink ? 0.25 : 0.55 + 0.25 * Math.sin(this.age * 12);
      pxRing(ctx, cx, cy, 20, 1, 8);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    uiText(ctx, this.label, cx, cy - 30 - 18 * Math.min(1, this.age * 3), { size: T.h2, color: this.color, align: 'center', glow: this.color });
    ctx.restore();
  }
}

// ---------- Peitsche / Katana: kurzer Hieb in einem Kreisbogen vor (oder hinter) dem Spieler ----------
// o: range, arc (halber Winkel), life, delay. Zaehlt wie das Schwert (blockt Geschosse, Spiegel-Rüstung prallt ab).
class ArcSlash {
  constructor(player, dir, o) {
    this.kind = 'sword';
    this.damaging = true;
    this.alive = true;
    this.player = player;
    this.dir = dir;
    this.range = o.range * (1 + Save.bonus('sword'));       // der Meilenstein "Schwert-Groesse" gilt auch hier
    this.arc = o.arc; this.life = o.life; this.delay = o.delay || 0;
    this.chevron = !!o.chevron;                             // abgerundetes V, das vom Spieler wegzeigt (Katana); width/curve/thick siehe CFG.katana
    this.width = (o.width || 0) * (1 + Save.bonus('sword')); this.curve = o.curve || 1.5; this.thick = o.thick || 14; this.gap = o.gap || 0;
    this.age = 0;
  }
  get active() { return this.age >= this.delay && this.age <= this.delay + this.life; }
  update(dt) {
    this.age += dt * this.player.hasteFactor;
    if (this.age > this.delay + this.life) this.alive = false;
  }
  hitsCircle(cx, cy, r) {
    if (!this.active) return false;
    if (this.chevron) return this.hitsChevron(cx, cy, r);
    const p = this.player, d = Math.hypot(cx - p.x, cy - p.y);
    if (d > this.range + r) return false;
    if (d <= r + 8) return true;
    const diff = Math.abs(angleDiff(dirTo(p.x, p.y, cx, cy), this.dir));
    if (diff > this.arc + Math.asin(Math.min(1, r / d)) / DEG) return false;
    return true;
  }
  // Abgerundetes V: Spitze liegt range vor dem Spieler, die Arme laufen nach hinten/aussen bis width seitlich. Treffer = alles im Keil bis zur Spitzenlinie.
  hitsChevron(cx, cy, r) {
    const p = this.player, a = this.dir * DEG, dx = cx - p.x, dy = cy - p.y;
    const f = dx * Math.sin(a) + dy * Math.cos(a), l = dx * Math.cos(a) - dy * Math.sin(a);       // vorwaerts / seitlich zur Blickrichtung
    const s = Math.abs(l) / this.width;
    if (s > 1 + r / this.width) return false;
    return f >= this.gap - r && f <= this.gap + (this.range - this.gap) * (1 - Math.pow(Math.min(1, s), this.curve)) + r + 4;
  }
  draw(ctx) {
    if (!this.active) return;
    const P = STYLE.pal, p = this.player, [cx, cy] = toScreen(p.x, p.y), t = (this.age - this.delay) / this.life;
    if (this.chevron) { this.drawChevron(ctx, cx, cy, t); return; }
    ctx.save();
    ctx.globalAlpha = 1 - 0.7 * t;
    ctx.fillStyle = P.cyan;
    pxArc(ctx, cx, cy, this.range * (0.65 + 0.35 * t), (this.dir - this.arc - 90) * DEG, (this.dir + this.arc - 90) * DEG, 2);
    ctx.fillStyle = P.ice;
    pxArc(ctx, cx, cy, this.range * (0.65 + 0.35 * t), (this.dir - this.arc - 90) * DEG, (this.dir + this.arc - 90) * DEG, 1);
    ctx.fillStyle = P.white;
    pxArc(ctx, cx, cy, this.range * (0.5 + 0.5 * t), (this.dir - this.arc * 0.8 - 90) * DEG, (this.dir + this.arc * 0.8 - 90) * DEG, 1);
    ctx.restore();
  }
}

ArcSlash.prototype.drawChevron = function (ctx, cx, cy, t) {
  const P = STYLE.pal, N = 16, grow = 0.75 + 0.25 * Math.min(1, t * 2), a = this.dir * DEG;
  const fx = Math.sin(a), fy = Math.cos(a), rx = Math.cos(a), ry = -Math.sin(a);       // vorwaerts- und rechts-Vektor (Spielsystem)
  const pt = (F, Lt) => [cx + fx * F + rx * Lt, cy - (fy * F + ry * Lt)];               // Bildschirm: y nach unten
  const center = (s) => this.gap + (this.range - this.gap) * grow * (1 - Math.pow(Math.abs(s), this.curve));    // Mittellinie: V (curve 1) bis U (curve 2), beginnt gap vor dem Spieler
  const thick = (s) => this.thick * Math.pow(1 - Math.abs(s), 0.75);                   // an den Armenden duenn, an der Spitze dick
  ctx.save();
  ctx.globalAlpha = 1 - 0.65 * t;
  const pts = [];
  for (let i = -N; i <= N; i++) { const s = i / N; pts.push(pt(center(s) + thick(s) / 2, s * this.width * grow)); }
  for (let i = N; i >= -N; i--) { const s = i / N; pts.push(pt(center(s) - thick(s) / 2, s * this.width * grow)); }
  ctx.fillStyle = P.cyanMid; pxPolyFill(ctx, pts);
  ctx.fillStyle = P.white; pxPoly(ctx, pts, true, 1);
  ctx.restore();
};

// ---------- Hammer: Bodenschlag vor dem Spieler, schiebt Gegner weg, Bosse nehmen doppelten Schaden ----------
class GroundSlam {
  constructor(player, dir) {
    const C = CFG.hammer;
    this.kind = 'sword';
    this.damaging = true;
    this.alive = true;
    this.bossMul = C.bossMul;                              // Boss.takeDamage liest das
    this.x = player.x + fwdX(dir) * C.offset;
    this.y = player.y + fwdY(dir) * C.offset;
    this.radius = C.radius * (1 + Save.bonus('sword'));
    this.age = 0;
    for (const e of G.enemies) {                           // Rueckstoss einmalig beim Aufprall
      if (!e.alive || e.type === 'tank' || !circlesOverlap(this.x, this.y, this.radius, e.x, e.y, e.radius)) continue;
      const a = dirTo(this.x, this.y, e.x, e.y);
      e.x += fwdX(a) * C.push; e.y += fwdY(a) * C.push;
    }
    Juice.shake(2.5); Juice.sparks(this.x, this.y, STYLE.pal.ice, 8, 4);        // Aufprall
  }
  hitsCircle(cx, cy, r) { return this.age < CFG.hammer.life && circlesOverlap(this.x, this.y, this.radius, cx, cy, r); }
  update(dt) { this.age += dt; if (this.age >= CFG.hammer.life + 0.15) this.alive = false; }
  draw(ctx) {
    const P = STYLE.pal, [cx, cy] = toScreen(this.x, this.y), t = Math.min(1, this.age / (CFG.hammer.life + 0.15));
    ctx.save();
    ctx.globalAlpha = 1 - t;
    const R = this.radius * (0.5 + 0.5 * Math.min(1, t * 3));
    ctx.fillStyle = P.cyanDark; pxDisc(ctx, cx, cy, R);
    ctx.fillStyle = P.ice; pxRing(ctx, cx, cy, R, 1);
    ctx.restore();
  }
}

// ---------- Bumerang: fliegt hinaus, kehrt zum Spieler zurueck und trifft auf beiden Wegen ----------
class Boomerang {
  constructor(player, dir) {
    this.kind = 'shot';
    this.damaging = true;
    this.alive = true;
    this.player = player;
    this.x = player.x; this.y = player.y; this.dir = dir;
    this.out = CFG.boomerang.outFrames;
    this.age = 0;
    this.spin = 0;
    this.addSpeed = player.velAlong ? player.velAlong(dir) : 0;      // Eigentempo des Spielers in Wurfrichtung
  }
  update(dt) {
    const C = CFG.boomerang, f = framesOf(dt), p = this.player;
    this.age += dt; this.spin += 900 * dt;
    if (this.out > 0) { moveForward(this, Math.max(1, C.speed + this.addSpeed) * f); this.out -= f; }
    else {
      this.dir = dirTo(this.x, this.y, p.x, p.y);
      moveForward(this, C.speed * 1.15 * f);
      if (dist2(this.x, this.y, p.x, p.y) < 14 * 14) this.alive = false;
    }
    if (this.age > C.maxLife) this.alive = false;
  }
  hitsCircle(cx, cy, r) { return circlesOverlap(this.x, this.y, CFG.boomerang.radius, cx, cy, r); }
  draw(ctx) {
    const P = STYLE.pal, [cx, cy] = toScreen(this.x, this.y), R = CFG.boomerang.radius + 2;
    ctx.save();
    const pts = [], sp = this.spin * DEG;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + sp, b = a + Math.PI / 4;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R], [cx + Math.cos(b) * R * 0.35, cy + Math.sin(b) * R * 0.35]);
    }
    ctx.fillStyle = P.cyanMid; pxPolyFill(ctx, pts);
    ctx.fillStyle = P.ice; pxPoly(ctx, pts, true, 1);
    ctx.restore();
  }
}

// ---------- Molotov: Flasche fliegt nach vorn und zerplatzt zu einem Feuerteppich (FirePatch) ----------
class Molotov {
  constructor(player, dir) {
    this.kind = 'molotov';
    this.damaging = false;
    this.alive = true;
    this.x = player.x; this.y = player.y; this.dir = dir;
    this.left = CFG.molotov.flightFrames;
    this.age = 0;
    this.evo = false;                           // Evolution Inferno Flask (Player.useWeapon setzt das)
    this.addSpeed = player.velAlong ? player.velAlong(dir) : 0;      // Eigentempo des Spielers in Wurfrichtung
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = CFG.molotov, f = Math.min(framesOf(dt), this.left);
    this.age += dt;
    moveForward(this, Math.max(1, C.speed + this.addSpeed) * f);
    this.left -= f;
    const hit = G.enemies.some((e) => e.alive && circlesOverlap(this.x, this.y, 5, e.x, e.y, e.radius)) || G.bossList().some((b) => circlesOverlap(this.x, this.y, 5, b.x, b.y, b.radius));
    if (this.left <= 0 || hit) {
      this.alive = false;
      G.attacks.push(new FirePatch(this.x, this.y));
      const E = CFG.evolutions.inferno, n = Math.round(C.patches + (this.evo ? E.patches : 0)), spread = C.spread * (this.evo ? E.spread : 1);
      for (let i = 0; i < n; i++) {
        const a = (360 / n) * i;
        G.attacks.push(new FirePatch(this.x + fwdX(a) * spread, this.y + fwdY(a) * spread));
      }
    }
  }
  draw(ctx) {
    const P = STYLE.pal, [cx, cy] = toScreen(this.x, this.y);
    ctx.save();
    const a = this.age * 14, c = Math.cos(a), s = Math.sin(a);
    const pts = [[-2, -3], [2, -3], [2, 3], [-2, 3]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
    ctx.fillStyle = P.orange; pxPolyFill(ctx, pts);
    ctx.fillStyle = P.yellow; pxPoly(ctx, pts, true, 1);
    ctx.restore();
  }
}

// ---------- Kettenblitz (starke Waffe): springt von Gegner zu Gegner, wirkt sofort ----------
class ChainLightning {
  constructor(player, evo = false) {
    const C = CFG.chain, E = CFG.evolutions.storm;
    this.kind = 'chain';
    this.damaging = false;
    this.alive = true;
    this.age = 0;
    this.pts = [{ x: player.x, y: player.y }];
    const hit = new Set();
    let cur = { x: player.x, y: player.y }, range = C.range * (evo ? E.range : 1);
    for (let i = 0; i < C.jumps + (evo ? E.jumps : 0); i++) {
      const t = nearestTarget(cur.x, cur.y, range, hit);
      if (!t) break;
      hit.add(t);
      this.pts.push({ x: t.x, y: t.y });
      specialDamage(t, C.hits, C.bossDmg);
      cur = t; range = C.link * (evo ? E.range : 1);
    }
  }
  get count() { return this.pts.length - 1; }
  hitsCircle() { return false; }
  update(dt) { this.age += dt; if (this.age >= CFG.chain.life) this.alive = false; }
  draw(ctx) {
    const P = STYLE.pal, k = 1 - this.age / CFG.chain.life;
    ctx.save();
    ctx.globalAlpha = k;
    for (let i = 1; i < this.pts.length; i++) {
      const [x1, y1] = toScreen(this.pts[i - 1].x, this.pts[i - 1].y), [x2, y2] = toScreen(this.pts[i].x, this.pts[i].y);
      const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 10)), pts = [[x1, y1]];
      for (let j = 1; j < n; j++) pts.push([x1 + (x2 - x1) * j / n + rand(-4, 4), y1 + (y2 - y1) * j / n + rand(-4, 4)]);
      pts.push([x2, y2]);
      ctx.fillStyle = P.yellow; pxPoly(ctx, pts, false, 2);            // gelber Kern-Schein
      ctx.fillStyle = P.white; pxPoly(ctx, pts, false, 1);
    }
    ctx.restore();
  }
}

// ---------- Schwarzes Loch (starke Waffe): zieht Gegner zusammen und explodiert dann ----------
class BlackHole {
  constructor(player, dir, evo = false) {
    const E = CFG.evolutions.horizon;
    const C = this.C = evo ? Object.assign({}, CFG.blackhole, { pullRadius: CFG.blackhole.pullRadius * E.pull, radius: CFG.blackhole.radius * E.radius, hits: CFG.blackhole.hits + E.hits }) : CFG.blackhole;      // Evolution Event Horizon
    this.kind = 'blackhole';
    this.damaging = false;
    this.alive = true;
    [this.x, this.y] = clampToMap(player.x + fwdX(dir) * C.distance, player.y + fwdY(dir) * C.distance, 20);
    this.age = 0;
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = this.C, f = framesOf(dt);
    this.age += dt;
    for (const e of G.enemies) {                          // Sog: Gegner im Zugradius rutschen zur Mitte
      if (!e.alive || e.type === 'tank' || dist2(this.x, this.y, e.x, e.y) > C.pullRadius * C.pullRadius) continue;
      const a = dirTo(e.x, e.y, this.x, this.y), step = Math.min(C.pull * f, Math.hypot(this.x - e.x, this.y - e.y));
      e.x += fwdX(a) * step; e.y += fwdY(a) * step;
    }
    G.shots = G.shots.filter((s) => !circlesOverlap(this.x, this.y, 14, s.x, s.y, 4));     // schluckt gegnerische Geschosse
    if (this.age >= C.life) {
      this.alive = false;
      for (const t of G.enemies.concat(G.bossList())) {
        if (t.alive && circlesOverlap(this.x, this.y, C.radius, t.x, t.y, t.radius)) specialDamage(t, C.hits, C.bossDmg);
      }
      G.attacks.push(new BlinkFlash(this.x, this.y));
      Juice.shake(4); Juice.flash(STYLE.pal.purple, 0.18, 0.12);
    }
  }
  draw(ctx) {
    const C = this.C, P = STYLE.pal, [cx, cy] = toScreen(this.x, this.y), t = this.age / C.life;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.2 * t; ctx.fillStyle = P.violet;
    pxGlow(ctx, cx, cy, C.pullRadius);
    ctx.globalAlpha = 0.9; ctx.fillStyle = P.purple;
    for (let i = 0; i < 3; i++) {                         // drehende, schrumpfende Ringe
      const k = (t * 2 + i / 3) % 1;
      pxArc(ctx, cx, cy, C.pullRadius * (1 - k), this.age * 6 + i, this.age * 6 + i + 4, 1);
    }
    ctx.fillStyle = P.ink; pxDisc(ctx, cx, cy, 6 + 6 * t);
    ctx.fillStyle = P.white; pxRing(ctx, cx, cy, 6 + 6 * t, 1);
    ctx.restore();
  }
}

// ---------- Kampfdrohne (mittlere Ability): kreist um den Spieler und schiesst auf Gegner in der Naehe ----------
class Drone {
  constructor(player) {
    this.kind = 'drone';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.age = 0;
    this.fireT = 0.4;
    this.x = player.x; this.y = player.y;
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = CFG.drone, p = this.player;
    this.age += dt;
    if (this.age >= C.duration) { this.alive = false; return; }
    const a = this.age * 200;
    this.x = p.x + fwdX(a) * C.orbit; this.y = p.y + fwdY(a) * C.orbit;
    this.fireT -= dt;
    if (this.fireT <= 0) {
      const t = nearestTarget(this.x, this.y, C.range);
      if (t) { this.fireT = C.every; G.attacks.push(new Shot(this.x, this.y, dirTo(this.x, this.y, t.x, t.y), false, { frames: 20 })); }
      else this.fireT = 0.1;
    }
  }
  draw(ctx) {
    const P = STYLE.pal, [cx, cy] = toScreen(this.x, this.y);
    ctx.save();
    ctx.globalAlpha = this.age > CFG.drone.duration - 1 && Math.floor(this.age * 8) % 2 === 0 ? 0.4 : 1;
    const pts = [[cx, cy - 5], [cx + 5, cy], [cx, cy + 5], [cx - 5, cy]];
    ctx.fillStyle = P.cyanMid; pxPolyFill(ctx, pts);
    ctx.fillStyle = P.ice; pxPoly(ctx, pts, true, 1);
    ctx.restore();
  }
}

// ---------- Blitzsturm (starke Ability): Blitze schlagen nacheinander in Gegner der Umgebung ein ----------
class Storm {
  constructor(player) {
    this.kind = 'storm';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.age = 0;
    this.spawned = 0;
    this.bolts = [];
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = CFG.storm, p = this.player;
    this.age += dt;
    while (this.spawned < C.count && this.age >= this.spawned * C.interval) {
      this.spawned++;
      const t = nearestTargetRandom(p.x, p.y, C.range);
      if (t) { specialDamage(t, C.hits, C.bossDmg); this.bolts.push({ x: t.x, y: t.y, t: 0 }); Juice.shake(1); Juice.sparks(t.x, t.y, STYLE.pal.yellow, 3); }
    }
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < 0.3);
    if (this.spawned >= C.count && this.bolts.length === 0) this.alive = false;
  }
  draw(ctx) {
    const P = STYLE.pal;
    ctx.save();
    for (const b of this.bolts) {
      const [x, y] = toScreen(b.x, b.y);
      ctx.globalAlpha = 1 - b.t / 0.3;
      const pts = [[x + rand(-6, 6), y - 140]];
      for (let j = 1; j < 7; j++) pts.push([x + rand(-7, 7), y - 140 + (140 * j) / 7]);
      pts.push([x, y]);
      ctx.fillStyle = P.yellow; pxPoly(ctx, pts, false, 2);
      ctx.fillStyle = P.white; pxPoly(ctx, pts, false, 1);
    }
    ctx.restore();
  }
}

// Zufaelliges Ziel unter den Gegnern/Bossen in range (der Sturm trifft nicht immer denselben)
function nearestTargetRandom(x, y, range) {
  const list = G.enemies.concat(G.bossList()).filter((t) => t.alive && dist2(x, y, t.x, t.y) <= range * range);
  return list.length ? list[randInt(0, list.length - 1)] : null;
}

// ---------- Verbuendete (Neural Hack, Necromancy): Gegner-Koerper, die fuer den Spieler kaempfen ----------
// Laufen auf den naechsten Gegner/Boss zu (sonst hinter dem Spieler her), verletzen bei Beruehrung und verlieren selbst Leben.
class Ally {
  constructor(type, x, y, hits, life, size) {
    this.kind = 'ally';
    this.damaging = false;
    this.alive = true;
    this.type = type;
    this.x = x; this.y = y; this.dir = 0;
    this.hits = hits; this.maxHits = hits;
    this.life = life; this.age = 0;
    this.size = size || CFG.enemy.size;
    this.hitT = 0;
    this.spawnT = 0.35;                                    // kurzes Aufleuchten beim Erscheinen
  }
  get radius() { return CFG.enemy[this.type].radius * this.size / CFG.enemy.size; }
  hitsCircle() { return false; }
  hurt() {
    this.hits--; this.hitT = CFG.allies.hitEvery;
    Juice.sparks(this.x, this.y, STYLE.pal.cyan, 3, 2);
    if (this.hits <= 0) this.vanish();
  }
  vanish() { this.alive = false; G.blasts.push(new Pop(this.x, this.y, this.radius * 2, STYLE.pal.cyan)); }
  update(dt) {
    const C = CFG.allies, p = G.player;
    this.age += dt; this.hitT = Math.max(0, this.hitT - dt); this.spawnT = Math.max(0, this.spawnT - dt);
    if (this.age >= this.life) { this.vanish(); return; }
    const t = nearestTarget(this.x, this.y, C.seek);
    if (t) { this.dir = dirTo(this.x, this.y, t.x, t.y); moveForward(this, C.speed * framesOf(dt)); }
    else if (dist2(this.x, this.y, p.x, p.y) > C.follow * C.follow) { this.dir = dirTo(this.x, this.y, p.x, p.y); moveForward(this, C.speed * framesOf(dt)); }
    [this.x, this.y] = clampToMap(this.x, this.y, this.radius);
    if (this.hitT > 0) return;
    for (const e of G.enemies) {                           // Beruehrung: beide Seiten nehmen Schaden
      if (!e.alive || !circlesOverlap(this.x, this.y, this.radius, e.x, e.y, e.radius)) continue;
      e.takeHit(true, 'ally'); this.hurt(); return;
    }
    for (const b of G.bossList()) {
      if (!b.alive || !circlesOverlap(this.x, this.y, this.radius, b.x, b.y, b.radius)) continue;
      b.hp -= C.bossDmg * damageBoost(); b.bar = 0; this.hurt(); return;
    }
  }
  draw(ctx) {
    const [cx, cy] = toScreen(this.x, this.y), left = this.life - this.age;
    if (left < 2 && Math.floor(left * 8) % 2 === 0) return;                          // blinkt kurz vor dem Ende
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = STYLE.pal.cyan;
    pxGlow(ctx, cx, cy, this.radius * 1.5);                                            // cyaner Schein: gehoert zu dir
    ctx.restore();
    drawSprite(ctx, this.type, this.x, this.y, this.dir, this.size, { hue: 150, brightness: this.spawnT > 0 ? 2 : 1.1 });
  }
}

// Zuletzt gefallene Gegner merken (fuer Necromancy)
function noteFallen(e) {
  G.fallen.push({ x: e.x, y: e.y, type: e.type, size: e.size, hits: e.maxHits, t: G.time });
  if (G.fallen.length > 16) G.fallen.shift();
}

// ---------- Orbit-Klingen (passive Ability): kreisen um den Spieler und verletzen jedes Ziel regelmaessig ----------
class OrbitBlades {
  constructor(player) {
    this.kind = 'blades';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.angle = 0;
    this.cd = new Map();                                    // Ziel -> Pause bis zum naechsten Treffer
  }
  hitsCircle() { return false; }
  positions() {
    const C = CFG.blades, m = Save.gearMul('blades'), p = this.player, out = [];
    for (let i = 0; i < C.count; i++) { const a = this.angle + (360 / C.count) * i; out.push([p.x + fwdX(a) * C.orbit * (1 + (m - 1) * 0.5), p.y + fwdY(a) * C.orbit * (1 + (m - 1) * 0.5)]); }
    return out;
  }
  update(dt) {
    const C = CFG.blades, p = this.player;
    if (!p.has('blades')) { this.alive = false; return; }              // Ability getauscht
    this.angle += C.speed * dt;
    for (const [k, v] of this.cd) { if (v - dt <= 0 || !k.alive) this.cd.delete(k); else this.cd.set(k, v - dt); }
    const every = C.hitEvery / Save.gearMul('blades');
    for (const [bx, by] of this.positions()) {
      for (const t of G.enemies.concat(G.bossList())) {
        if (!t.alive || this.cd.has(t) || !circlesOverlap(bx, by, C.radius, t.x, t.y, t.radius)) continue;
        this.cd.set(t, every);
        if (t.isBoss) { t.hp -= C.bossDmg * damageBoost(); t.bar = 0; } else t.takeHit(false, 'blade');
        Juice.sparks(bx, by, STYLE.pal.white, 2, 2);
      }
    }
  }
  draw(ctx) {
    const P = STYLE.pal;
    ctx.save();
    for (const [bx, by] of this.positions()) {
      const [cx, cy] = toScreen(bx, by), pts = [[cx, cy - 8], [cx + 3.5, cy], [cx, cy + 8], [cx - 3.5, cy]];
      ctx.fillStyle = P.white; pxPolyFill(ctx, pts);
      ctx.fillStyle = P.cyan; pxPoly(ctx, pts, true, 1);
    }
    ctx.restore();
  }
}

// ---------- Raketenwerfer: grosse Rakete, verletzt alles auf ihrem Weg und explodiert nach der Zuendzeit oder an einem starken Gegner ----------
class Rocket {
  constructor(player, dir) {
    this.kind = 'rocket';
    this.damaging = false;                      // Schaden macht sie selbst (Beruehrung + Explosion)
    this.alive = true;
    this.x = player.x; this.y = player.y; this.dir = dir;
    this.age = 0;
    this.exploded = false;
    this.blastAge = 0;
    this.touched = new Set();                   // jeden Gegner nur einmal im Vorbeiflug verletzen
    this.addSpeed = player.velAlong ? player.velAlong(dir) : 0;      // Eigentempo des Spielers in Flugrichtung
  }
  hitsCircle(cx, cy, r) { return this.exploded ? circlesOverlap(this.x, this.y, CFG.rocket.blast, cx, cy, r) : circlesOverlap(this.x, this.y, CFG.rocket.radius, cx, cy, r); }
  update(dt) {
    const C = CFG.rocket;
    if (this.exploded) { this.blastAge += dt; if (this.blastAge >= C.blastTime) this.alive = false; return; }
    this.age += dt;
    moveForward(this, Math.max(1, C.speed + this.addSpeed) * framesOf(dt));
    if (Math.random() < 0.6) Juice.sparks(this.x - fwdX(this.dir) * 8, this.y - fwdY(this.dir) * 8, STYLE.pal.yellow, 1, 1);
    if (!CFG.map.infinite) { const [cx, cy] = clampToMap(this.x, this.y, C.radius); if (cx !== this.x || cy !== this.y) { this.explode(); return; } }
    for (const e of G.enemies) {
      if (!e.alive || this.touched.has(e) || !circlesOverlap(this.x, this.y, C.radius, e.x, e.y, e.radius)) continue;
      if (e.hitsLeft > C.strongHits) { this.explode(); return; }          // starker Gegner: Einschlag
      this.touched.add(e);
      for (let i = 0; i < C.touchHits && e.alive; i++) e.takeHit(true, 'rocket');
    }
    if (G.bossList().some((b) => b.alive && circlesOverlap(this.x, this.y, C.radius, b.x, b.y, b.radius)) || G.spawners.some((s) => s.alive && circlesOverlap(this.x, this.y, C.radius, s.x, s.y, CFG.spawner.radius))) { this.explode(); return; }
    if (this.age >= C.fuse) this.explode();
  }
  explode() {
    const C = CFG.rocket;
    this.exploded = true;
    Sfx.play('blast'); Juice.shake(3); Juice.flash(STYLE.pal.cyan, 0.15, 0.1);
    for (const e of G.enemies) {
      if (!e.alive || !circlesOverlap(this.x, this.y, C.blast, e.x, e.y, e.radius)) continue;
      for (let i = 0; i < C.blastHits && e.alive; i++) e.takeHit(i === 0, 'grenade');
    }
    for (const b of G.bossList()) if (circlesOverlap(this.x, this.y, C.blast, b.x, b.y, b.radius)) { b.hp -= C.bossDmg * damageBoost(); b.bar = 0; }
    for (const s of G.spawners) if (s.alive && circlesOverlap(this.x, this.y, C.blast, s.x, s.y, CFG.spawner.radius)) s.hp -= C.spawnerDmg;
    G.shots = G.shots.filter((q) => !circlesOverlap(this.x, this.y, C.blast, q.x, q.y, 4));
    hurtObstaclesInRadius(this.x, this.y, C.blast, 2);
    Juice.sparks(this.x, this.y, STYLE.pal.white, 12, 5);
    if (this.napalm) {                                                    // Evolution Napalm Rockets: Feuerring um die Einschlagstelle
      const N = CFG.evolutions.napalm;
      for (let i = 0; i < N.patches; i++) { const a = (360 / N.patches) * i; G.attacks.push(new FirePatch(this.x + fwdX(a) * N.radius, this.y + fwdY(a) * N.radius)); }
    }
  }
  draw(ctx) {
    const C = CFG.rocket, P = STYLE.pal, [cx, cy] = toScreen(this.x, this.y);
    ctx.save();
    if (!this.exploded) {
      const R = C.radius, a = this.dir * DEG, ca = Math.cos(a), sa = Math.sin(a);
      const T = (pts) => pts.map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);            // lokal (Spitze nach oben) -> Bildschirm
      ctx.fillStyle = P.yellow; pxPolyFill(ctx, T([[-R * 0.45, R], [0, R * 2.1 + Math.random() * 4], [R * 0.45, R]]));      // Flamme
      ctx.fillStyle = P.cyanDark;                                                                                            // Flossen
      pxPolyFill(ctx, T([[-R * 0.55, R * 0.4], [-R * 1.1, R * 1.1], [-R * 0.4, R * 0.9]]));
      pxPolyFill(ctx, T([[R * 0.55, R * 0.4], [R * 1.1, R * 1.1], [R * 0.4, R * 0.9]]));
      const body = T([[0, -R * 1.5], [R * 0.6, -R * 0.6], [R * 0.6, R], [-R * 0.6, R], [-R * 0.6, -R * 0.6]]);
      ctx.fillStyle = P.ice; pxPolyFill(ctx, body);
      ctx.fillStyle = P.white; pxPoly(ctx, body, true, 1);
      ctx.fillStyle = P.cyan; pxPolyFill(ctx, T([[-R * 0.6, -R * 0.1], [R * 0.6, -R * 0.1], [R * 0.6, R * 0.25], [-R * 0.6, R * 0.25]]));       // Streifen
    } else {
      const t = this.blastAge / C.blastTime, r = C.blast * (0.4 + 0.6 * Math.min(1, t * 2));
      ctx.globalAlpha = 0.5 * (1 - t); ctx.fillStyle = P.cyan; pxDisc(ctx, cx, cy, r);
      ctx.globalAlpha = 1 - t; ctx.fillStyle = P.white; pxRing(ctx, cx, cy, r, 2);
    }
    ctx.restore();
  }
}
