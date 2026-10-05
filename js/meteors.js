// Meteoritenhagel (Welt-Event, Zahlen in CFG.meteors). Der Director würfelt den Hagel und erzeugt die Meteoriten (Director.updateMeteors).
// Ablauf eines Meteoriten: Warnkreis am Boden (wächst zusammen), dann Einschlag, danach bleibt ein Krater liegen.
// Der Einschlag ist eine Explosion ('bomb', verletzt den Spieler) und nimmt Gegnern im Radius Treffer.

class Meteor {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.alive = true;
    this.age = 0;
    this.landed = false;
    this.side = Math.random() < 0.5 ? 1 : -1;       // aus welcher Richtung er herabstürzt
    Sfx.play('meteorWarn');
    Sfx.play('meteorFall', CFG.meteors.fall);
  }

  update(dt) {
    const C = CFG.meteors;
    this.age += dt;
    if (!this.landed && this.age >= C.fall) this.impact();
    if (this.age >= C.fall + C.scorch) this.alive = false;
  }

  impact() {
    const C = CFG.meteors;
    this.landed = true;
    G.blasts.push(new Blast('bomb', this.x, this.y, true, 'METEOR'));
    Sfx.play('meteorHit');
    Juice.sparks(this.x, this.y, STYLE.pal.orange, 14, 5);
    if (dist2(this.x, this.y, G.player.x, G.player.y) < 220 * 220) { Juice.shake(4); Juice.flash(STYLE.pal.orange, 0.2, 0.12); }
    for (const e of G.enemies) {
      if (!e.alive || !circlesOverlap(this.x, this.y, C.radius, e.x, e.y, e.radius)) continue;
      for (let i = 0; i < C.enemyHits && e.alive; i++) e.takeHit(i === 0, 'grenade');
    }
  }

  // Unter allen Figuren: Warnkreis (füllt sich bis zum Einschlag) bzw. Krater. Alles aus groben Pixeln (pxDisc/pxRing).
  drawGround(ctx) {
    const C = CFG.meteors, P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    ctx.save();
    if (!this.landed) {
      const p = clamp(this.age / C.fall, 0, 1), blink = p > 0.7 && Math.floor(this.age * 14) % 2 === 0;
      ctx.globalAlpha = 0.18 + 0.25 * p;
      ctx.fillStyle = P.red;
      pxDisc(ctx, cx, cy, C.radius * p);                                                  // wächst von innen nach außen
      ctx.globalAlpha = 1;
      ctx.fillStyle = blink ? P.yellow : P.red;
      pxRing(ctx, cx, cy, C.radius, 2, 10, G.realTime * 0.25);                           // gestrichelter, langsam drehender Rand
    } else {
      const k = 1 - (this.age - C.fall) / C.scorch;                                       // Krater verblasst
      ctx.globalAlpha = 0.6 * k; ctx.fillStyle = P.void; pxDisc(ctx, cx, cy, C.radius * 0.7);
      ctx.globalAlpha = 0.6 * k; ctx.fillStyle = P.orange; pxRing(ctx, cx, cy, C.radius * 0.7, 1);
    }
    ctx.restore();
  }

  // Über allem: der fallende Feuerball mit Pixel-Schweif, bis er einschlägt
  drawSky(ctx) {
    if (this.landed) return;
    const C = CFG.meteors, P = STYLE.pal, p = clamp(this.age / C.fall, 0, 1), k = (1 - p) * (1 - p);       // am Anfang schnell weg von der Zielstelle, zum Schluss dicht dran
    const mx = STAGE_W / 2 + this.x + this.side * 150 * k, my = STAGE_H / 2 - this.y - 360 * k;
    const d = Math.hypot(this.side * 150, 360), ux = this.side * 150 / d, uy = -360 / d, len = 70 * (0.4 + p);   // (ux, uy) = Richtung des Schweifs
    ctx.save();
    ctx.fillStyle = P.redDark; pxLine(ctx, mx - PIXEL * 2, my - PIXEL * 2, mx + ux * len * 1.2 - PIXEL * 2, my + uy * len * 1.2 - PIXEL * 2, 5);
    ctx.fillStyle = P.orange; pxLine(ctx, mx - PIXEL, my - PIXEL, mx + ux * len - PIXEL, my + uy * len - PIXEL, 3);
    ctx.fillStyle = P.yellow; pxLine(ctx, mx, my, mx + ux * len * 0.6, my + uy * len * 0.6, 1);
    for (let i = 1; i <= 4; i++) {                                                         // Funken im Schweif flackern
      const t = i / 5, w = Math.sin(this.age * 30 + i * 2.1) * 6;
      ctx.fillStyle = i % 2 ? P.orange : P.yellow;
      pxFill(ctx, mx + ux * len * t - uy * w, my + uy * len * t + ux * w);
    }
    ctx.fillStyle = P.orange; pxDisc(ctx, mx, my, 4 + 6 * p);
    ctx.fillStyle = P.white; pxDisc(ctx, mx, my, 2 + 3 * p);
    ctx.restore();
  }
}
