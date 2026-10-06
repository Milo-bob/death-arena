// Elite-Gegner: Phantom und Bastion. Sie umgehen die schnellen Endgame-Waffen (Plasma Blade mit vielen Klingen, Dreifach-Blaster), sind auf allen Karten gleich,
// sehr stark und kommen ab dem Mittelspiel (CFG.extraSpawn). Ab CFG.elite.upgradeAt bekommen alle ein Upgrade (Mk II).
//
//  Gemeinsam: nie betaeubt, kein Rueckstoss, nehmen nur alle `gate` Sekunden einen Treffer (Enemy.takeHit) - wer extrem oft trifft, gewinnt dadurch nichts.
//  PHANTOM: haelt Abstand, springt weg, sobald ein Nahkampf-Angriff (Schwert, Lanze) nahe kommt, schiesst Salven. Mk II weicht auch Schuessen aus.
//  BASTION: dreht langsam zum Spieler, seine Schildfront haelt Schuesse ab (nur von hinten/seitlich verletzbar), stoesst mit Vorwarnung zu.
//           Starke Waffen (Beam, Granate ...) wirken ueber CFG.elite.bastion.dmgTable mehrfach. Mk II: breitere Front, schneller gedreht.
//  Alle Zahlen: CFG.elite und CFG.enemy.phantom/bastion in config.js. Alles Gezeichnete aus Pixel-Helfern (style.js).

const Elite = {
  MELEE: ['sword', 'lance'],      // Angriffsarten, denen der Phantom ausweicht
  RANGED: ['shot'],               // Angriffsarten, die die Schildfront des Bastions abfaengt (und denen der Phantom Mk II ausweicht)

  // Beim Erzeugen (Enemy-Konstruktor): Werte je nach Stufe setzen
  init(e) {
    const C = CFG.elite[e.type], M = CFG.elite.mk2;
    e.elite = true;
    e.mk = G.eliteUp ? 2 : 1;
    e.dmgMul = C.dmg * (e.mk === 2 ? M.dmg : 1);
    if (e.mk === 2) { e.hitsLeft = Math.round(e.hitsLeft * M.hits); e.maxHits = e.hitsLeft; }
    e.face = rand(0, 360);                        // Blickrichtung des Bastions (dreht nur langsam)
    e.hitCd = 0;
    e.dodgeCd = rand(0.5, 1.2); e.dodgeT = 0; e.dodgeDir = 0; e.ghostT = 0; e.ghostFrom = null;
    if (e.type === 'phantom') e.shootT = C.shootFirst;
    if (e.type === 'bastion') e.bashT = rand(C.bashMin, C.bashMax);
  },

  // Jedes Bild im Lauf: das Upgrade zum festen Zeitpunkt (alle Elite-Gegner, auch die schon da sind)
  update() {
    if (Tutorial.active || G.eliteUp || G.time < CFG.elite.upgradeAt) return;
    G.eliteUp = true;
    Sfx.play('bossIntro'); Juice.shake(2);
    for (const e of G.enemies) if (e.alive && e.elite) this.upgrade(e);
  },
  upgrade(e) {
    const M = CFG.elite.mk2, add = Math.round(e.maxHits * (M.hits - 1));
    e.mk = 2; e.dmgMul = CFG.elite[e.type].dmg * M.dmg;
    e.hitsLeft += add; e.maxHits += add;
    e.blockFlash = 0.6;
    Juice.sparks(e.x, e.y, STYLE.pal.red, 12, 4);
  },
  // Umgefaerbtes Sprite des Typs (Cos.tinted merkt es sich, ein Farbfilter pro Bild waere in Edge sehr langsam)
  sprite(e) { return Cos.tinted(CFG.enemy[e.type].sprite, 'hue-rotate(' + CFG.elite[e.type].hue + 'deg)'); },
  speedMul(e) { return e.mk === 2 ? CFG.elite.mk2.speed : 1; },

  // ---------- Phantom ----------
  // Bedroht ein Angriff den Phantom? Nahkampf im Umkreis dodgeRange, ab Mk II auch Schuesse im Umkreis shotRange
  threat(e, C) {
    for (const a of G.attacks) {
      if (!a.alive || !a.damaging) continue;
      if (this.MELEE.includes(a.kind)) { if (a.hitsCircle(e.x, e.y, e.radius + C.dodgeRange)) return true; }
      else if (e.mk === 2 && this.RANGED.includes(a.kind) && a.hitsCircle(e.x, e.y, e.radius + C.shotRange)) return true;
    }
    return false;
  },
  phantomSteer(e, dt, tg) {
    const C = CFG.elite.phantom, toP = dirTo(e.x, e.y, tg.x, tg.y), step = CFG.enemy.phantom.speed * this.speedMul(e);
    e.dodgeCd -= dt; e.ghostT = Math.max(0, e.ghostT - dt);
    e.dir = toP;                                                       // blickt immer auf den Spieler
    if (e.dodgeT > 0) {                                                // Ausweichsprung
      e.dodgeT -= dt;
      return { step: C.dodgeSpeed, touch: false, move: e.dodgeDir };
    }
    if (e.dodgeCd <= 0 && this.threat(e, C)) {
      e.dodgeDir = dirTo(G.player.x, G.player.y, e.x, e.y) + e.side * rand(35, 75);       // schraeg vom Spieler weg
      e.side = -e.side;
      e.dodgeT = C.dodgeTime; e.dodgeCd = e.mk === 2 ? C.dodgeCd2 : C.dodgeCd;
      e.ghostFrom = { x: e.x, y: e.y }; e.ghostT = 0.35;
      Sfx.play('blink');
      return { step: 0, touch: false };
    }
    const d = Math.hypot(tg.x - e.x, tg.y - e.y);
    if (d < C.keepDist - C.band) return { step, touch: false, move: toP + 180 + e.side * 30 };      // zu nah: absetzen
    if (d > C.keepDist + C.band) return { step, touch: false, move: toP };                            // zu weit: ran
    return { step: step * 0.7, touch: false, move: toP + e.side * 90 };                               // dazwischen: seitlich kreisen
  },
  phantomFire(e) {
    const C = CFG.elite.phantom, aim = dirTo(e.x, e.y, G.player.target.x, G.player.target.y), n = C.burst + (e.mk === 2 ? 2 : 0);
    e.shootT += C.shootEvery * (e.mk === 2 ? 0.8 : 1);
    Sfx.play('enemyShot');
    for (let i = 0; i < n; i++) G.shots.push(Object.assign(new EnemyBolt(e.x, e.y, aim + (i - (n - 1) / 2) * C.spread, C.boltSpeed, C.boltFrames), { src: Stats.enemyName(e), mul: e.dmgMul }));
  },

  // ---------- Bastion ----------
  bastionSteer(e, dt, tg) {
    const C = CFG.elite.bastion, toP = dirTo(e.x, e.y, tg.x, tg.y), turn = (e.mk === 2 ? C.turn2 : C.turn) * dt;
    e.face += clamp(angleDiff(toP, e.face), -turn, turn);
    e.bashT -= dt;
    if (e.bashT <= 0) {
      e.bashT = rand(C.bashMin, C.bashMax);
      if (Math.hypot(tg.x - e.x, tg.y - e.y) < C.range) e.ov = Patterns.dashOv(e, C.tele, C.go, C.speed, true);       // Rammstoss mit Vorwarnung
    }
    e.dir = e.face;
    return { step: CFG.enemy.bastion.speed * this.speedMul(e), touch: true, move: toP };
  },
  // Halbe Oeffnung der Schildfront in Grad
  arc(e) { const C = CFG.elite.bastion; return e.mk === 2 ? C.arc2 : C.arc; },
  // Trifft ein Schuss von dieser Position die Schildfront?
  frontBlocks(e, x, y) { return Math.abs(angleDiff(dirTo(e.x, e.y, x, y), e.face)) <= this.arc(e); },
  // Treffer-Auswertung des Bastions (ersetzt die allgemeine Waffenabfrage in Enemy.update): Schuesse von vorn werden abgefangen, alles andere verletzt (mit Pause)
  bastionHit(e, r) {
    const C = CFG.elite.bastion;
    for (const a of G.attacks) {
      if (!a.alive || !a.damaging) continue;
      if (this.RANGED.includes(a.kind)) {
        if (!a.hitsCircle(e.x, e.y, r + C.shield)) continue;
        if (this.frontBlocks(e, a.x, a.y)) { a.alive = false; e.blockFlash = 0.15; continue; }       // an der Schildfront zerplatzt
        if (a.hitsCircle(e.x, e.y, r)) e.takeHit(true, a.kind);                                       // von hinten/seitlich trifft er
      } else if (a.hitsCircle(e.x, e.y, r)) e.takeHit(true, a.kind);
    }
  },

  // ---------- Zeichnen (unter dem Gegner): Schein, Ringe, Schildfront, Nachbilder, Mk-Markierung ----------
  drawFx(ctx, e) {
    const P = STYLE.pal, r = e.radius, cx = STAGE_W / 2 + e.x, cy = STAGE_H / 2 - e.y, t = G.realTime, col = e.type === 'phantom' ? P.purple : P.orange, mk2 = e.mk === 2;
    ctx.save();
    if (e.type === 'phantom' && e.ghostT > 0 && e.ghostFrom) {                               // Nachbilder entlang des Ausweichsprungs
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        drawSprite(ctx, this.sprite(e), e.ghostFrom.x + (e.x - e.ghostFrom.x) * f, e.ghostFrom.y + (e.y - e.ghostFrom.y) * f, e.dir, e.size, { alpha: 0.4 * (e.ghostT / 0.35) * (1 - f * 0.6) });
      }
    }
    ctx.globalAlpha = (mk2 ? 0.22 : 0.14) + 0.05 * Math.sin(t * 5); ctx.fillStyle = mk2 ? P.red : col;
    pxGlow(ctx, cx, cy, r * 1.7);
    ctx.globalAlpha = mk2 ? 0.8 : 0.5; ctx.fillStyle = mk2 ? P.red : col;
    pxRing(ctx, cx, cy, r * 1.45, 1, 10, t * 0.25);
    if (mk2) { ctx.fillStyle = P.yellow; pxRing(ctx, cx, cy, r * 1.7, 1, 14, -t * 0.3); }
    if (e.type === 'bastion') {                                                                // Schildfront
      const th = Math.atan2(-Math.cos(e.face * DEG), Math.sin(e.face * DEG)), A = this.arc(e) * DEG;
      ctx.globalAlpha = 0.95; ctx.fillStyle = e.blockFlash > 0 ? P.white : mk2 ? P.yellow : P.ice;
      pxArc(ctx, cx, cy, r + CFG.elite.bastion.shield, th - A, th + A, 2);
      ctx.globalAlpha = 0.35; ctx.fillStyle = P.ice;
      pxArc(ctx, cx, cy, r + CFG.elite.bastion.shield - 3, th - A, th + A, 1);
    }
    if (mk2) {                                                                                 // Mk II: zwei gelbe Striche ueber dem Kopf
      ctx.globalAlpha = 1; ctx.fillStyle = P.yellow;
      ctx.fillRect(Math.round(cx / 2) * 2 - 5, Math.round((cy - r - 12) / 2) * 2, 4, 8);
      ctx.fillRect(Math.round(cx / 2) * 2 + 1, Math.round((cy - r - 12) / 2) * 2, 4, 8);
    }
    ctx.restore();
  },
};
