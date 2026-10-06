// Alles, was der Spieler "in die Welt stellt": Schwert, Schuss, Schild, Dash-Spur, Beam,
// Ultimate und Bloodburst. Jede Klasse hat:
//   kind        - Art (Gegner prüfen damit, was sie getroffen hat)
//   alive       - false = wird aufgeräumt
//   update(dt)  - bewegen / altern
//   hitsCircle(x, y, r) - trifft das Ding einen Kreis? (ersetzt Scratchs "berührt Sprite?")
//   draw(ctx)

// ---------- aktuelle Waffenwerte (wachsen mit WeaponUp nach jedem Boss) ----------
const Loadout = {
  sword: {}, shot: {}, shield: {}, dash: {}, lance: {}, impulse: {}, beamSize: 250, swordTimeUpgrade: false,

  // Startwerte der Waffen mit CFG.weaponUps (einmalig gesichert), damit jeder Lauf wieder bei null beginnt
  base: null,
  resetUps() {
    if (!this.base) { this.base = {}; for (const w of Object.keys(CFG.weaponUps)) this.base[w] = Object.assign({}, CFG[w]); }
    for (const w of Object.keys(CFG.weaponUps)) Object.assign(CFG[w], this.base[w]);
  },
  applyUps() {
    for (const [w, keys] of Object.entries(CFG.weaponUps)) {
      for (const [k, U] of Object.entries(keys)) {
        let v = CFG[w][k] + U.step;
        if (U.max !== undefined) v = Math.min(v, U.max);
        if (U.min !== undefined) v = Math.max(v, U.min);
        CFG[w][k] = Math.round(v * 1000) / 1000;
      }
    }
  },

  reset() {
    this.resetUps();
    this.sword = { speed: CFG.sword.baseSpeed, size: CFG.sword.baseSize, number: CFG.sword.baseNumber, knock: CFG.sword.knock };
    this.shot = { speed: CFG.shot.baseSpeed, size: CFG.shot.baseSize, cooldown: CFG.shot.baseCooldown, lvl: 0 };
    this.shield = { duration: CFG.shield.duration, cooldown: CFG.shield.cooldown };
    this.dash = { lvl: 1, cooldown: CFG.dash.baseCooldown };
    this.lance = { reach: CFG.lance.reach, cooldown: CFG.lance.cooldown, offsets: [0] };      // offsets = Stossrichtungen relativ zur Blickrichtung
    this.impulse = { width: CFG.impulse.width, cooldown: CFG.impulse.cooldown };
    this.beamSize = CFG.beam.beamSizes[0];
    this.swordTimeUpgrade = false;
  },

  // Stufen, die an die Spielzeit gekoppelt sind
  updateByTime(time) {
    if (!this.swordTimeUpgrade && time > 45) {
      this.swordTimeUpgrade = true;
      this.sword.number = 2;
      this.sword.speed = 15;
    }
    this.shot.lvl = Math.min(2, (time > 120 ? 1 : 0) + (time > 300 ? 1 : 0) + (time > 480 ? 1 : 0));
    // Lanze: zusaetzliche Stoesse nach hinten und zu den Seiten kommen mit der Spielzeit (Reichweite/Tempo steigen mit jedem Boss, unabhaengig davon)
    this.lance.offsets = time >= CFG.lance.sidesAtTime ? [0, 90, 180, 270] : time >= CFG.lance.backAtTime ? [0, 180] : [0];
    const bs = CFG.beam.beamSizes;
    this.beamSize = time > 300 ? bs[2] : time > 120 ? bs[1] : bs[0];
    if (this.sword.size > CFG.sword.maxSize) this.sword.size = CFG.sword.maxSize;
  },

  // Nach jedem besiegten Boss
  weaponUp(time) {
    G.notice('WEAPON UPGRADE', STYLE.pal.yellow);
    Sfx.play('upgrade');
    G.player.levelFlash = 0.25;
    G.bosses++;
    G.later(0.6, () => { if (!G.offerEvolution()) G.offerAbility(); });      // erst Evolution (falls ein Rezept passt), danach Ability-Wahl für den nächsten leeren Slot
    this.upgradeStats(time);
  },

  // Perk "Weapon Tuning" (XP-Level-up): derselbe Stufenschritt wie nach einem Boss, aber ohne Meldung, Boss-Zähler und Auswahl. time = 0: keine zeitgebundenen Klingen-Sprünge.
  tune() { this.upgradeStats(0); },

  // Die eigentliche Verbesserung aller Waffenwerte um einen Schritt
  upgradeStats(time) {
    this.applyUps();                           // Peitsche, Katana, Hammer, Schrotflinte, Bumerang, Molotov und die starken Waffen
    const s = this.sword;
    s.size += CFG.sword.upSize;
    s.speed += 1;
    s.knock = Math.min(CFG.sword.maxKnock, s.knock + CFG.sword.upKnock);
    if (time > 239.9 && time < 250) s.number = 3;          // mehr Klingen, aber Tempo und Groesse werden nie kleiner (das Original bremste hier auf 11.25 und schrumpfte)
    if (time > 479.9 && time < 500) s.number = 4;

    const p = this.shot;
    p.speed = Math.min(CFG.shot.maxSpeed, p.speed + 1);
    p.size = Math.min(CFG.shot.maxSize, p.size + 1);
    p.cooldown = Math.max(CFG.shot.minCooldown, p.cooldown - 0.0625);

    const l = this.lance;
    l.reach = Math.min(CFG.lance.maxReach, l.reach + 3);
    l.cooldown = Math.max(CFG.lance.minCooldown, l.cooldown - 0.02);
    const im = this.impulse;
    im.width = Math.min(CFG.impulse.maxWidth, im.width + 3);
    im.cooldown = Math.max(CFG.impulse.minCooldown, im.cooldown - 0.04);

    const sh = this.shield;
    sh.cooldown = Math.max(CFG.shield.minCooldown, sh.cooldown - CFG.shield.upCooldown);
    sh.duration = Math.min(CFG.shield.maxDuration, sh.duration + CFG.shield.upDuration);

    const d = this.dash;
    d.lvl = Math.min(CFG.dash.maxLevel, d.lvl + 1);
    d.cooldown = Math.max(CFG.dash.minCooldown, d.cooldown - CFG.dash.upCooldown);
  },
};

// ---------- Schwert ----------
// Trefferform: Bild-Pixel des Schwert-Bogens, Drehpunkt unten links (1,25)
const SWORD_LOCAL = [];
for (const [px, py] of [[0, 24], [10, 19], [25, 12], [38, 2], [41, 0], [45, 5], [48, 15], [49, 25], [0, 25]]) {
  SWORD_LOCAL.push(...pxToLocal(px, py, 1, 25, 2));
}

class SwordSwing {
  constructor(player, startDir) {
    this.kind = 'sword';
    this.damaging = true;
    this.alive = true;
    this.player = player;
    this.dir = startDir;
    this.hold = false;                         // Player.syncBlades setzt das jedes Bild: solange true, dreht die Klinge endlos weiter, sonst beendet sie die laufende Umdrehung
    // Im Original dauert ein Schritt "drehen + warte 0.033" real etwa 0.066 s (2 Bilder).
    // Dadurch dauert ein Schlag so lange wie die Pause zwischen zwei Schlägen: gleichmäßige Rotation.
    this.degPerSec = Loadout.sword.speed / CFG.sword.spawnTime;
    this.sizePct = 150 * Loadout.sword.size * (1 + Save.bonus('sword'));
    // Der Schlag lebt, bis er seinen Drehwinkel zurückgelegt hat (nicht nach fester Zeit). So bleibt der Abstand der
    // Klingen auch gleich, wenn sich das Tempo ändert (Raserei-Drop beschleunigt die Drehung über player.hasteFactor).
    this.sweepLeft = 360;                      // genau eine Umdrehung: die naechste Salve schliesst nahtlos an
  }
  update(dt) {
    if (this.lead) {                           // Folge-Klinge: kein eigenes Tempo, steht immer im festen Winkel (offset) zur ersten Klinge
      this.dir = this.lead.dir + this.offset;
      this.alive = this.lead.alive;
      Cos.swordTick(Juice.particles, Cos.cur('blade'), this.player.x, this.player.y, this.dir, this.sizePct, dt);
      return;
    }
    let step = this.degPerSec * this.player.hasteFor('sword') * dt;
    if (!this.hold) step = Math.min(step, this.sweepLeft);   // losgelassen: die laufende Umdrehung endet genau auf 360 Grad (kein Ueberdrehen)
    this.dir += step;                          // dreht im Uhrzeigersinn
    this.sweepLeft -= step;
    if (this.hold && this.sweepLeft <= 1e-6) this.sweepLeft += 360;   // gehalten: naechste Umdrehung beginnt nahtlos
    Cos.swordTick(Juice.particles, Cos.cur('blade'), this.player.x, this.player.y, this.dir, this.sizePct, dt);
    if (this.sweepLeft <= 1e-6) this.alive = false;
  }
  hitsCircle(cx, cy, r) {
    const s = this.sizePct / 100;
    const poly = [];
    for (let i = 0; i < SWORD_LOCAL.length; i += 2) {
      poly.push(...toWorld(this.player.x, this.player.y, this.dir, s, SWORD_LOCAL[i], SWORD_LOCAL[i + 1]));
    }
    return polyHitsCircle(poly, cx, cy, r);
  }
  draw(ctx) { Cos.drawSword(ctx, Cos.cur('blade'), this.player.x, this.player.y, this.dir, this.sizePct, G.realTime, this); }
}

// ---------- Vortex-Ring (Evolution der Plasma Blade) ----------
// Wachsender Ring um den Spieler. Verletzt jeden Gegner, den er beruehrt (wie die Klingen), Schild-Gegner und Bosse ignorieren ihn.
class VortexRing {
  constructor(player) {
    this.kind = 'vortex';
    this.damaging = true;
    this.alive = true;
    this.x = player.x; this.y = player.y;
    this.r = 8;
  }
  update(dt) {
    const C = CFG.evolutions.vortex;
    this.r += C.speed * dt;
    if (this.r >= C.radius) this.alive = false;
  }
  hitsCircle(cx, cy, r) { return Math.abs(Math.hypot(cx - this.x, cy - this.y) - this.r) <= CFG.evolutions.vortex.width + r; }
  draw(ctx) {
    const P = STYLE.pal, k = 1 - this.r / CFG.evolutions.vortex.radius, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * k;
    ctx.fillStyle = P.cyan; pxRing(ctx, cx, cy, this.r, 2);
    ctx.fillStyle = P.ice; pxRing(ctx, cx, cy, this.r - 3, 1, 24, this.r / 60);
    ctx.restore();
  }
}

// ---------- Schuss ----------
class Shot {
  constructor(x, y, dir, bounce = false, o = {}) {       // o: frames/speed ueberschreiben (Schrotflinte, Drohne)
    this.kind = 'shot';
    this.bounce = bounce;                              // Prallschuss: prallt an den Kartenraendern ab
    this.damaging = true;
    this.alive = true;
    this.x = x; this.y = y; this.dir = dir;
    this.speed = o.speed || Loadout.shot.speed;
    this.growth = ((Loadout.shot.size - 1) * 5) / 15;   // Prozent pro Bild
    this.sizePct = 150;
    this.ghost = 0;
    this.framesLeft = o.frames || (bounce ? CFG.bounce.frames : CFG.shot.frames);
  }
  update(dt) {
    const f = framesOf(dt);
    if (this.seek) {                                   // Evolution Seeker Rounds: zum naechsten Gegner in Reichweite lenken
      const S = CFG.evolutions.seeker;
      let best = null, bd = S.range * S.range;
      for (const e of G.enemies.concat(G.bossList())) {
        if (!e.alive) continue;
        const d = dist2(this.x, this.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) steerTowards(this, best.x, best.y, S.turn * f);
    }
    moveForward(this, this.speed * f);
    if (this.bounce && !CFG.map.infinite) {
      const hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale;
      if (Math.abs(this.x) > hw) { this.x = clamp(this.x, -hw, hw); this.dir = -this.dir; }
      if (Math.abs(this.y) > hh) { this.y = clamp(this.y, -hh, hh); this.dir = 180 - this.dir; }
    }
    this.ghost += 2 * f;
    this.sizePct += this.growth * f;
    this.framesLeft -= f;
    if (this.framesLeft <= 0) this.alive = false;
  }
  hitsCircle(cx, cy, r) {
    const s = this.sizePct / 100;
    const a = toWorld(this.x, this.y, this.dir, s, -9, 0);
    const b = toWorld(this.x, this.y, this.dir, s, 5, 0);
    return segHitsCircle(a[0], a[1], b[0], b[1], CFG.shot.hitPad * s, cx, cy, r);
  }
  draw(ctx) { Cos.drawShot(ctx, Cos.cur('blade'), this.x, this.y, this.dir, this.sizePct, 1 - this.ghost / 100, G.realTime, this); }
}

// ---------- Lanze ----------
// Stoss in Blickrichtung: die Spitze fliegt schnell heraus und zieht sich wieder zurueck. Trifft alles auf der Linie.
class LanceThrust {
  constructor(player, offset = 0, baseDir = player.dir) {
    this.kind = 'lance';
    this.damaging = true;
    this.alive = true;
    this.player = player;
    this.dir = baseDir + offset;
    this.age = 0;
    this.scale = 1 + Save.bonus('sword');                // der Meilenstein "Schwert-Groesse" gilt auch fuer die Lanze
    this.reach = Loadout.lance.reach * this.scale;
  }
  // Laenge des Schafts: raus in den ersten 35 % der Zeit, dann zurueck
  get ext() {
    const t = this.age / CFG.lance.thrust;
    return this.reach * (t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.65));
  }
  update(dt) {
    this.age += dt * this.player.hasteFactor;
    if (this.age >= CFG.lance.thrust) this.alive = false;
  }
  hitsCircle(cx, cy, r) {
    const p = this.player, e = this.ext;
    const a = toWorld(p.x, p.y, this.dir, 1, 6, 0), b = toWorld(p.x, p.y, this.dir, 1, 6 + e, 0);
    return segHitsCircle(a[0], a[1], b[0], b[1], CFG.lance.width * this.scale, cx, cy, r);
  }
  draw(ctx) {
    const P = STYLE.pal, p = this.player, e = this.ext;
    if (e < 1) return;
    const pt = (l, s) => { const w = toWorld(p.x, p.y, this.dir, 1, l, s); return [STAGE_W / 2 + w[0], STAGE_H / 2 - w[1]]; };
    ctx.save();
    ctx.fillStyle = P.cyan;
    let a = pt(6, 0), b = pt(6 + e, 0);
    pxLine(ctx, a[0], a[1], b[0], b[1], 2);
    // Spitze und zwei Stacheln nach hinten
    ctx.fillStyle = P.ice;
    const tip = pt(6 + e + 7, 0), l1 = pt(6 + e - 1, 4), l2 = pt(6 + e - 1, -4);
    pxPolyFill(ctx, [tip, l1, l2]);
    for (const k of [0.45, 0.7]) for (const s of [-1, 1]) {
      const base = pt(6 + e * k, 0), barb = pt(6 + e * k - 4, 4.5 * s);
      pxLine(ctx, base[0], base[1], barb[0], barb[1], 1);
    }
    ctx.restore();
  }
}

// ---------- Impuls ----------
// Breite Energiewelle (nach vorn gewoelbt). Stoesst getroffene Gegner schnell nach vorn, damit sie nicht mehrfach getroffen werden,
// und loescht gegnerische Geschosse, die sie beruehrt.
class ImpulseWave {
  constructor(player) {
    this.kind = 'impulse';
    this.damaging = false;                // Schaden verteilt die Welle selbst (siehe update), damit jeder nur einmal getroffen wird
    this.hit = new Set();
    this.alive = true;
    this.x = player.x; this.y = player.y;
    this.dir = player.dir;
    this.cryo = !!(player.evo && player.evo('cryowave'));        // Evolution Cryo Wave: breiter, friert Treffer ein
    this.width = Loadout.impulse.width * (this.cryo ? CFG.evolutions.cryowave.width : 1);
    this.framesLeft = CFG.impulse.frames;
    this.age = 0;
  }
  get pts() {          // linke Spitze, Mitte (vorn), rechte Spitze
    const w = this.width;
    return [toWorld(this.x, this.y, this.dir, 1, 0, -w), toWorld(this.x, this.y, this.dir, 1, 9, 0), toWorld(this.x, this.y, this.dir, 1, 0, w)];
  }
  update(dt) {
    const f = framesOf(dt), C = CFG.impulse;
    this.age += dt;
    moveForward(this, C.speed * f);
    this.framesLeft -= f;
    if (this.framesLeft <= 0) { this.alive = false; return; }
    for (const e of G.enemies) {
      if (!e.alive || !this.hitsCircle(e.x, e.y, e.radius)) continue;
      if (!this.hit.has(e)) {                                // jeder Gegner wird nur einmal getroffen
        this.hit.add(e);
        if (e.type === 'guard') {                            // Schild-Gegner: Ruestung entscheidet
          if (CFG.enemy.guard.armor[e.armor].hurts.includes('impulse')) e.takeHit(); else e.blockFlash = 0.15;
        } else if (e.stun <= 0) e.takeHit();
        if (!e.alive) continue;
        if (this.cryo && e.type !== 'guard') e.stun = Math.max(e.stun, CFG.evolutions.cryowave.stun);
      }
      e.x += fwdX(this.dir) * C.push * f; e.y += fwdY(this.dir) * C.push * f;     // nach vorn aus der Welle schieben
    }
    for (const sp of G.spawners) {
      if (!this.hit.has(sp) && this.hitsCircle(sp.x, sp.y, CFG.spawner.radius)) { this.hit.add(sp); sp.hp -= 1; }
    }
    for (const list of [G.shots, G.bossShots]) for (const s of list) if (this.hitsCircle(s.x, s.y, 4)) s.alive = false;
  }
  hitsCircle(cx, cy, r) {
    const [a, m, b] = this.pts, pad = CFG.impulse.thick;
    return segHitsCircle(a[0], a[1], m[0], m[1], pad, cx, cy, r) || segHitsCircle(m[0], m[1], b[0], b[1], pad, cx, cy, r);
  }
  draw(ctx) {
    const P = STYLE.pal, t = this.framesLeft / CFG.impulse.frames;
    const c = (p) => [STAGE_W / 2 + p[0], STAGE_H / 2 - p[1]];
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    for (const [back, col, lw, al] of [[0, P.cyan, 3, 1], [-6, P.cyanMid, 2, 0.6], [-12, P.cyanMid, 1, 0.3]]) {
      const w = this.width * (1 + back * 0.01);
      const a = c(toWorld(this.x, this.y, this.dir, 1, back, -w)), m = c(toWorld(this.x, this.y, this.dir, 1, 9 + back, 0)), b = c(toWorld(this.x, this.y, this.dir, 1, back, w));
      ctx.globalAlpha = Math.min(1, t * 2) * al; ctx.fillStyle = col;
      const pts = [];                                                  // quadratische Kurve a - m - b als Pixel-Linienzug
      for (let i = 0; i <= 12; i++) { const u = i / 12, v = 1 - u; pts.push([v * v * a[0] + 2 * v * u * m[0] + u * u * b[0], v * v * a[1] + 2 * v * u * m[1] + u * u * b[1]]); }
      pxPoly(ctx, pts, false, lw >= 3 ? 2 : 1);
    }
    ctx.restore();
  }
}

// ---------- Schildblase ----------
// Kreis um den Spieler. Player.hit() lässt währenddessen nichts durch, die Blase stoppt Geschosse
// und schiebt Gegner weg (touchesShield in enemies.js). Dauer und Abklingzeit verwaltet der Player.
class Shield {
  constructor(player) {
    this.kind = 'shield';
    this.damaging = false;
    this.alive = true;
    this.player = player;
  }
  update(dt) {}
  hitsCircle(cx, cy, r) {
    return circlesOverlap(this.player.x, this.player.y, CFG.shield.radius, cx, cy, r);
  }
  draw(ctx) {
    // in der letzten halben Sekunde blinkt die Blase, damit man das Ende kommen sieht
    const left = this.player.shieldLeft;
    if (left < 0.5 && Math.floor(left * 10) % 2 === 0) return;
    drawSprite(ctx, 'bubble', this.player.x, this.player.y, 90, 250);
  }
}

// ---------- Druckwelle (Ability) ----------
// Stößt alle Gegner im Radius vom Spieler weg (am Anfang stark, dann schwächer), betäubt sie kurz und löscht
// Gegnergeschosse im Radius. Bosse bekommen nur einen Teil des Rückstoßes.
class Pulse {
  constructor(player) {
    this.kind = 'pulse';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.age = 0;
  }
  update(dt) {
    const C = CFG.pulse;
    this.age += dt;
    if (this.age >= C.duration) { this.alive = false; return; }
    const f = framesOf(dt), k = 1 - this.age / C.duration;
    const px = this.player.x, py = this.player.y;
    const targets = G.enemies.concat(G.bossList());
    for (const e of targets) {
      if (Math.hypot(e.x - px, e.y - py) > C.radius) continue;
      const dir = dirTo(px, py, e.x, e.y) * DEG;                     // weg vom Spieler
      const s = C.push * k * f * (e.isBoss ? C.bossFactor : 1);
      e.x += Math.sin(dir) * s;
      e.y += Math.cos(dir) * s;
      if (!e.isBoss) e.stun = Math.max(e.stun || 0, C.stun);
    }
    if (C.clearShots) {
      for (const list of [G.shots, G.bossShots]) for (const s of list) if (Math.hypot(s.x - px, s.y - py) < C.radius) s.alive = false;
    }
  }
  hitsCircle() { return false; }
  draw(ctx) {
    const C = CFG.pulse, P = STYLE.pal;
    const t = this.age / C.duration;
    const r = C.radius * Math.min(1, t * 1.25);
    const cx = STAGE_W / 2 + this.player.x, cy = STAGE_H / 2 - this.player.y;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = P.cyan; pxRing(ctx, cx, cy, r, 2);
    ctx.fillStyle = P.ice; pxRing(ctx, cx, cy, r * 0.88, 1);
    ctx.globalAlpha = (1 - t) * 0.2; ctx.fillStyle = P.cyan; pxGlow(ctx, cx, cy, r);
    ctx.restore();
  }
}

// ---------- Frostring / Zeitstopp: Gegner im Radius bleiben stehen ----------
class StunWave {
  constructor(player, C) {
    this.kind = 'stunwave';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.C = C;
    this.age = 0;
    this.applied = false;
  }
  update(dt) {
    const C = this.C;
    this.age += dt;
    if (!this.applied) {
      this.applied = true;
      const { x, y } = this.player;
      for (const e of G.enemies) if (Math.hypot(e.x - x, e.y - y) <= C.radius) e.stun = Math.max(e.stun || 0, C.stun);
    }
    if (this.age >= C.duration) this.alive = false;
  }
  hitsCircle() { return false; }
  draw(ctx) {
    const C = this.C, P = STYLE.pal, t = this.age / C.duration;
    const r = Math.min(C.radius, 330) * Math.min(1, t * 1.4);
    const cx = STAGE_W / 2 + this.player.x, cy = STAGE_H / 2 - this.player.y;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = P.ice; pxRing(ctx, cx, cy, r, 1, Math.max(8, Math.round(r / 6)));
    ctx.globalAlpha = (1 - t) * 0.22; pxGlow(ctx, cx, cy, r);
    ctx.restore();
  }
}

// ---------- Blink: kurzer Lichtblitz am Start- und Zielpunkt ----------
class BlinkFlash {
  constructor(x, y) { this.kind = 'blink'; this.damaging = false; this.alive = true; this.x = x; this.y = y; this.age = 0; }
  update(dt) { this.age += dt; if (this.age >= 0.25) this.alive = false; }
  hitsCircle() { return false; }
  draw(ctx) {
    const t = this.age / 0.25, P = STYLE.pal;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = P.ice; pxRing(ctx, STAGE_W / 2 + this.x, STAGE_H / 2 - this.y, 6 + 14 * t, 1);
    ctx.restore();
  }
}

// ---------- Dash-Spur (bleibt kurz liegen und verletzt Gegner) ----------
class DashTrail {
  constructor(x, y, dir) {
    this.kind = 'dash';
    this.damaging = true;
    this.alive = true;
    this.x = x; this.y = y; this.dir = dir;
    this.sizePct = [0, 250, 275, 300][Loadout.dash.lvl];
    this.age = 0;
  }
  get active() { return this.age >= 0.125; }
  update(dt) {
    this.age += dt;
    if (this.age > 1.325) this.alive = false;
  }
  hitsCircle(cx, cy, r) {
    if (!this.active) return false;
    const s = this.sizePct / 100;
    const a = toWorld(this.x, this.y, this.dir, s, -7.5, 0);
    const b = toWorld(this.x, this.y, this.dir, s, 16, 0);
    return segHitsCircle(a[0], a[1], b[0], b[1], 1.5 * s, cx, cy, r);
  }
  draw(ctx) {
    if (!this.active) return;
    const steps = Math.floor((this.age - 0.125) / 0.15);
    const img = steps % 2 === 0 ? 'dash1' : 'dash2';
    drawSprite(ctx, img, this.x, this.y, this.dir, this.sizePct, { alpha: 1 - Math.min(steps, 8) * 0.05 });
  }
}

// ---------- Beam ----------
// Der Spieler lädt bei gedrückter Leertaste (Player.beam.clock steigt) und feuert nach dem Loslassen.
class BeamAttack {
  constructor(player) {
    this.kind = 'beam';
    this.damaging = true;
    this.alive = true;
    this.player = player;
    const ov = player.evo && player.evo('overload') ? CFG.evolutions.overload : null;        // Evolution Overload Beam
    this.sizePct = Loadout.beamSize * (ov ? ov.size : 1);
    this.powerMul = ov ? ov.power : 1;
    this.age = 0;
    Juice.shake(1.5);
  }
  get power() { return this.player.beam.clock * this.powerMul; }
  update(dt) {
    this.age += dt;
    if (this.player.beam.state !== 'fire') this.alive = false;
  }
  hitsCircle(cx, cy, r) {
    const s = this.sizePct / 100;
    const p = this.player;
    const a = toWorld(p.x, p.y, p.dir, s, -1, 0);
    const b = toWorld(p.x, p.y, p.dir, s, 136, 0);
    return segHitsCircle(a[0], a[1], b[0], b[1], 2.5 * s, cx, cy, r);
  }
  draw(ctx) {
    const p = this.player;
    const img = Math.floor(this.age * FPS) % 2 === 0 ? 'beam1' : 'beam2';
    drawSprite(ctx, img, p.x, p.y, p.dir, this.sizePct, { alpha: 1 - Math.min(1, this.age * FPS * 2 / 100) });
  }
}

// ---------- Ultimate (Taste V) ----------
// Ablauf wie im Original: kurzes Aufladen, dann wächst ein riesiger Kreis, danach ein Blitz.
class Ultimate {
  constructor(player) {
    this.kind = 'ult';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.age = 0;
    this.sizePct = 400;
    this.hit = new Set();              // Ziele, die schon Schaden bekommen haben (nur einmal)
    this.growthFrames = 0;
    this.flashAge = 0;
    this.phase = 'windup';             // windup -> grow -> flash
    Juice.zoomPulse(0.93, 0.9); Juice.shake(2);
  }
  get clearing() { return this.phase === 'grow' || this.phase === 'flash'; }   // löscht alle Gegner
  get locksPlayer() { return this.phase === 'grow'; }
  get radius() {
    const stage = this.phase === 'windup' ? [10, 12, 14, 16][this.stageIndex()] : 16;
    return (stage / 2 / 2) * this.sizePct / 100;
  }
  stageIndex() { return this.age < 0.15 ? 0 : this.age < 0.25 ? 1 : this.age < 0.3 ? 2 : 3; }
  update(dt) {
    this.age += dt;
    if (this.phase === 'windup' && this.age >= 0.4) this.phase = 'grow';
    if (this.phase === 'grow') {
      this.growthFrames += framesOf(dt);
      const n = Math.min(40, Math.floor(this.growthFrames));
      this.growN = n;
      // 20x +100, 10x +150, 5x +200, 5x +500 Prozent
      this.sizePct = 400 + Math.min(n, 20) * 100 + clamp(n - 20, 0, 10) * 150 + clamp(n - 30, 0, 5) * 200 + clamp(n - 35, 0, 5) * 500;
      if (n >= 40) { this.phase = 'flash'; this.flashAge = 0; }
    } else if (this.phase === 'flash') {
      this.flashAge += dt;
      if (this.flashAge > 0.5) this.alive = false;
    }
  }
  // Deckkraft des weissen Vollbild-Blitzes: steigt am Ende des Wachsens auf 1, bleibt voll weiss und blendet dann aus. Gezeichnet wird er ganz zuletzt (game.js), nichts liegt darueber.
  get whiteAlpha() {
    if (this.phase === 'grow') return clamp(((this.growN || 0) - 33) / 6, 0, 1);
    if (this.phase === 'flash') return this.flashAge < 0.3 ? 1 : clamp(1 - (this.flashAge - 0.3) / 0.2, 0, 1);
    return 0;
  }
  hitsCircle(cx, cy, r) {
    if (this.phase === 'flash') return true;       // der Blitz deckt den ganzen Bildschirm ab
    return circlesOverlap(this.player.x, this.player.y, this.radius, cx, cy, r);
  }
  draw(ctx) {
    if (this.phase === 'windup') {
      drawSprite(ctx, 'ult' + (this.stageIndex() + 1), this.player.x, this.player.y, 90, 400);
    } else if (this.phase === 'grow') {
      drawSprite(ctx, 'ult4', this.player.x, this.player.y, 90, this.sizePct);
    }                                     // die Flash-Phase wird als Vollbild-Weiss am Ende von G.drawPlay gezeichnet
  }
}

// ---------- Bloodburst (Notfall-Explosion) ----------
class Bloodburst {
  constructor(player) {
    this.kind = 'blood';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.age = 0;
    this.hit = new Set();
    this.x = player.x; this.y = player.y;
    this.sizePct = 250;
    this.phase = 'charge';             // charge (0.5 s) -> burst (kurz) -> fade (4 s)
    this.growth = 0;
    this.life = 0;                     // Gesamtdauer seit dem Start
  }
  get clearing() { return this.phase === 'burst'; }
  get locksPlayer() { return this.phase === 'burst'; }
  get protecting() { return this.life < CFG.bloodburst.protectSeconds; }   // kaum Schaden, kurz nach dem Start
  get radius() {
    if (this.phase === 'charge') return 7.5;
    if (this.phase === 'burst') return (18 / 2) * this.sizePct / 100;
    return 22;
  }
  update(dt) {
    this.age += dt;
    this.life += dt;
    if (this.phase === 'charge') {
      this.x = this.player.x; this.y = this.player.y;
      if (this.age >= 0.5) { this.phase = 'burst'; this.growth = 0; }
    } else if (this.phase === 'burst') {
      this.growth += framesOf(dt);
      const n = Math.min(3, Math.floor(this.growth));
      this.sizePct = 250 * Math.pow(2.5, n);
      if (n >= 3 && this.growth >= 3.3) { this.phase = 'fade'; this.age = 0; this.sizePct = 250; }
    } else if (this.age > 4) {
      this.alive = false;
    }
  }
  hitsCircle(cx, cy, r) { return circlesOverlap(this.x, this.y, this.radius, cx, cy, r); }
  draw(ctx) {
    if (this.phase === 'charge') drawSprite(ctx, 'blood1', this.x, this.y, 90, 250);
    else if (this.phase === 'burst') drawSprite(ctx, 'blood2', this.x, this.y, 90, this.sizePct);
    else drawSprite(ctx, 'blood3', this.x, this.y, 90, 250, { alpha: Math.max(0.3, 1 - this.age / 2 * 0.7) });
  }
}

// ---------- Plasmagranate (starke Waffe, Taste E) ----------
// Fliegt ein Stueck nach vorn, explodiert bei Kontakt mit einem Gegner oder nach der Zuendzeit. Schaden im Radius, Spieler nimmt keinen.
class PlasmaGrenade {
  constructor(player) {
    const C = CFG.grenade;
    this.kind = 'grenade';
    this.damaging = false;                // Schaden nur bei der Explosion (siehe explode)
    this.alive = true;
    this.x = player.x; this.y = player.y; this.dir = player.dir;
    this.age = 0;
    this.flightLeft = C.flightFrames;
    this.exploded = false;
    this.blastAge = 0;
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = CFG.grenade;
    if (this.exploded) {
      this.blastAge += dt;
      if (this.blastAge >= C.blastTime) this.alive = false;
      return;
    }
    this.age += dt;
    if (this.flightLeft > 0) {
      const f = Math.min(framesOf(dt), this.flightLeft);
      moveForward(this, C.speed * f);
      this.flightLeft -= f;
      const hitEnemy = G.enemies.some((e) => e.alive && circlesOverlap(this.x, this.y, 5, e.x, e.y, e.radius));
      const hitBoss = G.bossList().some((b) => circlesOverlap(this.x, this.y, 5, b.x, b.y, b.radius));
      if (hitEnemy || hitBoss) { this.explode(); return; }
    }
    if (this.age >= C.fuse) this.explode();
  }
  explode() {
    const C = CFG.grenade, R = C.radius * (1 + Save.bonus('grenade'));      // Meilenstein vergroessert den Radius
    this.exploded = true;
    Juice.shake(3); Juice.flash(STYLE.pal.cyan, 0.15, 0.1);
    for (const e of G.enemies) {
      if (!e.alive || !circlesOverlap(this.x, this.y, R, e.x, e.y, e.radius)) continue;
      for (let i = 0; i < C.hits && e.alive; i++) e.takeHit(i === 0, 'grenade');
    }
    G.shots = G.shots.filter((s) => !circlesOverlap(this.x, this.y, R, s.x, s.y, 4));       // gegnerische Geschosse in der Naehe loeschen
    for (const b of G.bossList()) if (circlesOverlap(this.x, this.y, R, b.x, b.y, b.radius)) { b.hp -= C.bossDmg * damageBoost(); b.stun = Math.max(b.stun, 0.5); b.bar = 0; }
  }
  draw(ctx) {
    const C = CFG.grenade, P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    ctx.save();
    if (!this.exploded) {
      const blink = Math.floor(this.age * (4 + this.age * 10)) % 2 === 0;        // blinkt immer schneller
      ctx.fillStyle = blink ? P.white : P.cyan;
      pxDisc(ctx, cx, cy, 4);
    } else {
      const t = this.blastAge / C.blastTime, r = C.radius * (1 + Save.bonus('grenade')) * (0.4 + 0.6 * Math.min(1, t * 2));
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = P.cyanDark; pxDisc(ctx, cx, cy, r);
      ctx.fillStyle = P.ice; pxRing(ctx, cx, cy, r, 1);
    }
    ctx.restore();
  }
}

// ---------- Bombardement (starke Ability) ----------
// Mehrere Einschlaege rund um den Spieler: jeder zeigt erst einen Ring (delay s), dann explodiert er und verletzt Gegner und Bosse.
class Bombard {
  constructor(player) {
    this.kind = 'bombard';
    this.damaging = false;
    this.alive = true;
    this.player = player;
    this.age = 0;
    this.spawned = 0;
    this.strikes = [];
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = CFG.bombard, p = this.player;
    this.age += dt;
    while (this.spawned < C.count && this.age >= this.spawned * C.interval) {
      const a = rand(0, 360), d = Math.sqrt(Math.random()) * C.spread;
      const [x, y] = clampToMap(p.x + fwdX(a) * d, p.y + fwdY(a) * d, 12);
      this.strikes.push({ x, y, t: 0, done: false });
      this.spawned++;
    }
    for (const s of this.strikes) {
      s.t += dt;
      if (!s.done && s.t >= C.delay) { s.done = true; this.explode(s); }
    }
    this.strikes = this.strikes.filter((s) => s.t < C.delay + 0.3);
    if (this.spawned >= C.count && this.strikes.length === 0) this.alive = false;
  }
  explode(s) {
    const C = CFG.bombard;
    for (const e of G.enemies) {
      if (!e.alive || !circlesOverlap(s.x, s.y, C.radius, e.x, e.y, e.radius)) continue;
      for (let i = 0; i < C.hits && e.alive; i++) e.takeHit(i === 0, 'grenade');
    }
    G.shots = G.shots.filter((q) => !circlesOverlap(s.x, s.y, C.radius, q.x, q.y, 4));
    Juice.shake(1.2); Juice.sparks(s.x, s.y, STYLE.pal.cyan, 4);
    for (const b of G.bossList()) if (circlesOverlap(s.x, s.y, C.radius, b.x, b.y, b.radius)) { b.hp -= C.bossDmg * damageBoost(); b.bar = 0; }
  }
  draw(ctx) {
    const C = CFG.bombard, P = STYLE.pal;
    ctx.save();
    for (const s of this.strikes) {
      const cx = STAGE_W / 2 + s.x, cy = STAGE_H / 2 - s.y;
      if (!s.done) {
        const k = s.t / C.delay;
        ctx.globalAlpha = 0.25 + 0.4 * k; ctx.fillStyle = P.cyan;
        pxRing(ctx, cx, cy, C.radius, 1, 12);
        pxRing(ctx, cx, cy, C.radius * (1 - k), 1);
      } else {
        const k = (s.t - C.delay) / 0.3, R = C.radius * (0.7 + 0.3 * k);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = P.cyanDark; pxDisc(ctx, cx, cy, R);
        ctx.fillStyle = P.ice; pxRing(ctx, cx, cy, R, 1);
      }
    }
    ctx.restore();
  }
}

// ---------- Feuerpfad (starke Waffe, Taste E = umschalten) ----------
// Ein Feuerfleck am Boden: brennt eine Weile und verletzt Gegner darin im Takt (ohne sie zu betaeuben).
class FirePatch {
  constructor(x, y, big = false) {       // big: Evolution Wildfire (groesser, brennt laenger)
    this.kind = 'fire';
    this.damaging = false;
    this.alive = true;
    this.x = x; this.y = y;
    this.age = 0;
    this.tickT = 0;
    this.radius = CFG.fire.radius * (big ? CFG.evolutions.wildfire.radius : 1);
    this.life = CFG.fire.life * (big ? CFG.evolutions.wildfire.life : 1);
  }
  hitsCircle() { return false; }
  update(dt) {
    const C = CFG.fire;
    this.age += dt;
    if (this.age >= this.life) { this.alive = false; return; }
    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT = C.tick;
    for (const e of G.enemies) if (e.alive && circlesOverlap(this.x, this.y, this.radius, e.x, e.y, e.radius)) e.takeHit(false, 'fire');
    for (const b of G.bossList()) if (circlesOverlap(this.x, this.y, this.radius, b.x, b.y, b.radius)) b.hp -= C.bossDmg * damageBoost();
  }
  draw(ctx) {
    const C = { radius: this.radius }, P = STYLE.pal, k = 1 - this.age / this.life;
    const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, flick = 1 + 0.15 * Math.sin(G.realTime * 18 + this.x);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.fillStyle = P.redMid; pxDisc(ctx, cx, cy, C.radius * flick);
    ctx.fillStyle = P.orange; pxDisc(ctx, cx, cy, C.radius * 0.65 * flick * (0.5 + 0.5 * k));
    ctx.fillStyle = P.yellow; pxDisc(ctx, cx, cy, C.radius * 0.28 * k);
    ctx.restore();
  }
}
