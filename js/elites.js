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
    if (e.type === 'lancer') { e.stabT = C.first; e.stabPh = 0; e.stabLeft = 0; e.stabDir = 0; e.stabHit = false; e.rush = false; }
    if (e.type === 'magnetar') { e.slamT = C.first; e.slamWarn = 0; e.slamN = 0; e.pullOff = 0; }
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
  // Eigene Koerper (Pixelgrafik per Code statt umgefaerbtem Sprite): Lanzenreiter (Pfeilspitze mit Panzerplatten) und Magnetar (Hufeisenmagnet). Blickrichtung Osten, Aufloesung wie alle Sprites (res 2).
  // Wird beim ersten Bedarf erzeugt und als IMG[name] abgelegt; ohne Canvas (Tests) bleibt es beim bisherigen Sprite.
  custom(name, w, h, paint) {
    if (IMG[name] && IMG[name].ok) return name;
    try {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
      const poly = (pts, col) => {                                      // Polygon pixelweise fuellen (Mittelpunkt des Pixels im Polygon)
        let inside = (x, y) => { let k = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) k = !k; } return k; };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) px(x, y, col);
      };
      paint({ px, poly, g, w, h });
      IMG[name] = { img: c, ok: true, res: 2, w, h, rcx: w / 2, rcy: h / 2 };
      return name;
    } catch (e) { return null; }
  },
  lancerSprite() {
    return this.custom('eliteLancer', 28, 20, ({ px, poly }) => {
      const D = '#0b2f3f', B = '#12556e', M = '#1aa9c9', L = '#35e0ff', H = '#e8ffff', Y = '#ffd23a', O = '#ff8a2d';
      poly([[0, 8], [4, 9.5], [3, 10.5], [0, 12]], O);                                                    // Schubduese
      poly([[1, 9], [4, 9.6], [4, 10.4], [1, 11]], Y);
      poly([[4, 1], [11, 0], [13, 5]], D); poly([[4, 19], [11, 20], [13, 15]], D);                       // Seitenfinnen
      poly([[5, 2], [10, 1.4], [12, 5]], M); poly([[5, 18], [10, 18.6], [12, 15]], M);
      poly([[3, 3], [17, 5.5], [27, 10], [17, 14.5], [3, 17], [7, 10]], D);                               // Rumpf: Pfeilspitze
      poly([[5, 4.2], [17, 6.4], [24, 9.6], [9, 9.6]], L);                                                // Oberplatte
      poly([[5, 15.8], [17, 13.6], [24, 10.4], [9, 10.4]], M);                                            // Unterplatte
      poly([[8, 9.2], [16, 7.6], [22, 9.6], [8, 9.8]], H);                                                // Glanzkante
      poly([[17, 8.4], [21, 9.6], [17, 10.8]], Y);                                                        // Visier
      poly([[9, 8.5], [12, 10], [9, 11.5], [7, 10]], B); px(9, 9, H); px(10, 10, Y);                      // Kern
    });
  },
  magnetSprite() {
    return this.custom('eliteMagnetar', 28, 28, ({ px, poly, w, h }) => {
      const cx = 11, cy = 14;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), west = dx <= 1;
        const arm = x + 0.5 > cx && x + 0.5 < 26 && Math.abs(dy) >= 5.5 && Math.abs(dy) <= 11;           // zwei Arme nach Osten (Oeffnung zum Spieler)
        if ((west && r >= 5.5 && r <= 11) || arm) {
          let col = r > 10 || Math.abs(dy) > 10 ? '#4b5568' : r < 6.5 || Math.abs(dy) < 6.5 ? '#6b778e' : '#98a4bb';
          if (arm && x + 0.5 > 20) col = dy < 0 ? (x + 0.5 > 23.5 ? '#ffd6d6' : '#ff3d5a') : (x + 0.5 > 23.5 ? '#d6ecff' : '#3a8bff');       // Polschuhe rot/blau mit weisser Kante
          px(x, y, col);
        }
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (r <= 3.6) px(x, y, r <= 1.8 ? '#e9ffe9' : r <= 2.8 ? '#4dff9a' : '#17a85b'); }       // gruener Kern
    });
  },
  // Umgefaerbtes Sprite des Typs (Cos.tinted merkt es sich, ein Farbfilter pro Bild waere in Edge sehr langsam); Lanzenreiter und Magnetar haben eigene Koerper
  sprite(e) {
    if (e.type === 'lancer') { const n = this.lancerSprite(); if (n) return n; }
    if (e.type === 'magnetar') { const n = this.magnetSprite(); if (n) return n; }
    return Cos.tinted(CFG.enemy[e.type].sprite, 'hue-rotate(' + CFG.elite[e.type].hue + 'deg)');
  },
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

  // ---------- Lanzenreiter ----------
  // Phasen: 0 laufen, 1 Vorwarnung (Richtung festgelegt, steht), 2 Stoss (Vorstoss, Schaden entlang der Lanze), 3 Pause
  lancerSteer(e, dt, tg) {
    const C = CFG.elite.lancer, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y);
    const ps = tg.moveSpeed ? tg.moveSpeed() : CFG.player.speed, base = ps * C.speed * (mk2 ? C.mk2Speed : 1);       // immer fast so schnell wie der Spieler (auch mit Thrustern)
    e.stabT -= dt;
    if (e.stabPh === 1) {
      e.dir = e.stabDir; e.stabLeft -= dt;
      if (e.stabLeft <= 0) { e.stabPh = 2; e.stabLeft = C.thrust; e.stabHit = false; Sfx.play('enemyShot'); }
      return { step: 0, touch: false };
    }
    if (e.stabPh === 2) {
      e.dir = e.stabDir; e.stabLeft -= dt;
      this.lanceCheck(e);
      if (e.stabLeft <= 0) { e.stabPh = 3; e.stabLeft = C.recover; }
      return { step: C.lunge, touch: false, move: e.stabDir };
    }
    if (e.stabPh === 3) {
      e.dir = toP; e.stabLeft -= dt;
      if (e.stabLeft <= 0) { e.stabPh = 0; e.stabT = mk2 ? C.every2 : C.every; }
      return { step: base * 0.3, touch: false, move: toP };
    }
    e.dir = toP;
    if (e.stabT <= 0 && d < C.range && !SafeSpot.inside) { e.stabPh = 1; e.stabLeft = mk2 ? C.tele2 : C.tele; e.stabDir = toP; Sfx.play('ventWarn'); return { step: 0, touch: false }; }
    e.rush = d > C.boostDist;                                                                                                  // Aufholschub (fuer Spur und Windlinien)
    if (d > C.keepDist + C.band) return { step: base * (d > C.boostDist ? C.boost : 1), touch: false, move: toP };            // ran, weit weg: Schub zum Aufholen
    if (d < C.keepDist - C.band) return { step: base * C.retreat, touch: false, move: toP + 180 };                          // zu nah: weicht nur schlecht zurueck
    return { step: base * 0.55, touch: false, move: toP + e.side * 70 };                                                    // in Stichweite: seitlich mitlaufen
  },
  // Trifft die Lanze (Strecke vom Gegner in Stossrichtung) einen Spieler? Pro Stoss hoechstens einmal.
  lanceCheck(e) {
    if (e.stabHit) return;
    const C = CFG.elite.lancer, L = e.radius + C.reach, ux = fwdX(e.stabDir), uy = fwdY(e.stabDir);
    for (const q of playersList()) {
      const t = clamp((q.x - e.x) * ux + (q.y - e.y) * uy, 0, L), px = e.x + ux * t, py = e.y + uy * t;
      if (Math.hypot(q.x - px, q.y - py) <= q.radius + C.width) { q.hit('shoot', e.dmgMul, Stats.enemyName(e)); e.stabHit = true; Juice.shake(1); Juice.sparks(q.x, q.y, STYLE.pal.cyan, 10, 4); return; }
    }
  },

  // ---------- Magnetar ----------
  magnetarSteer(e, dt, tg) {
    const C = CFG.elite.magnetar, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.magnetar.speed * this.speedMul(e);
    e.dir = toP; e.slamT -= dt; e.pullOff = Math.max(0, e.pullOff - dt);
    if (e.slamWarn > 0) {                                              // laedt die Erschuetterung: steht still
      e.slamWarn -= dt;
      if (e.slamWarn <= 0) this.slam(e);
      return { step: 0, touch: true };
    }
    if (e.slamT <= 0 && d < C.range && !SafeSpot.inside) { e.slamWarn = C.tele; e.slamN = mk2 ? 2 : 1; Sfx.play('ventWarn'); }
    if (d > C.keepDist + C.band) return { step, touch: true, move: toP };
    if (d < C.keepDist - C.band) return { step: step * 0.6, touch: true, move: toP + 180 };
    return { step: step * 0.5, touch: true, move: toP + e.side * 90 };
  },
  slam(e) {
    const C = CFG.elite.magnetar, mk2 = e.mk === 2, R = mk2 ? C.radius2 : C.radius, p = G.player;
    G.blasts.push(new Pop(e.x, e.y, R, STYLE.pal.green));
    Juice.shake(2); Sfx.play('ventBlast');
    Juice.sparks(e.x, e.y, STYLE.pal.green, 14, 5); Juice.sparks(e.x, e.y, STYLE.pal.ice, 8, 3);
    for (const q of playersList()) if (Math.hypot(q.x - e.x, q.y - e.y) <= R + q.radius) q.hit('shoot', e.dmgMul, Stats.enemyName(e));
    if (--e.slamN > 0) e.slamWarn = C.tele2;
    else { e.slamT = mk2 ? C.every2 : C.every; e.pullOff = C.rest; }
  },
  // Sog aller Magnetare auf den Spieler (Einheiten pro Bild, f = framesOf(dt)); im Dash und im Safe Spot wirkungslos
  pullPlayer(p, f) {
    if (SafeSpot.inside) return;
    const C = CFG.elite.magnetar;
    for (const e of G.enemies) {
      if (!e.alive || e.type !== 'magnetar' || e.pullOff > 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > C.range || d < e.radius + p.radius + 3) continue;
      const s = (C.minPull + (C.maxPull - C.minPull) * (1 - d / C.range)) * (e.mk === 2 ? C.mk2Pull : 1) * (e.slamWarn > 0 ? C.chargePull : 1) * f;
      p.x += (e.x - p.x) / d * s; p.y += (e.y - p.y) / d * s;
    }
  },

  // ---------- Zeichnen (unter dem Gegner): Schein, Ringe, Schildfront, Nachbilder, Mk-Markierung ----------
  drawFx(ctx, e) {
    const P = STYLE.pal, r = e.radius, cx = STAGE_W / 2 + e.x, cy = STAGE_H / 2 - e.y, t = G.realTime, col = e.type === 'phantom' ? P.purple : e.type === 'magnetar' ? P.green : e.type === 'lancer' ? P.cyan : P.orange, mk2 = e.mk === 2;
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
    if (e.type === 'magnetar') {                                                               // Magnetfeld: Feldlinien, nach innen laufende Funken, Blitzbogen zwischen den Polen, Aufladen und Stosswelle
      const C = CFG.elite.magnetar, R = mk2 ? C.radius2 : C.radius, ang = e.dir * DEG, ux = Math.sin(ang), uy = -Math.cos(ang), vx = -uy, vy = ux;
      if (e.pullOff <= 0) {
        for (let k = 0; k < 3; k++) { const ph = (t * 0.7 + k / 3) % 1; ctx.globalAlpha = 0.06 + 0.26 * ph; ctx.fillStyle = col; pxRing(ctx, cx, cy, C.range * (1 - ph) + r, 1, 18, 0); }
        for (let k = 0; k < 10; k++) {                                                        // Funken spiralen zum Magneten
          const ph = (t * 0.55 + k / 10) % 1, a = k * 0.628 + t * 0.9 + ph * 2.2, dd = r + (C.range * 0.85) * (1 - ph);
          ctx.globalAlpha = 0.15 + 0.7 * ph; ctx.fillStyle = k % 2 ? P.red : P.ice; pxFill(ctx, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd);
        }
      }
      for (let k = 0; k < 2; k++) {                                                           // Feldlinien: Boegen von Pol zu Pol (rot oben, blau unten), pulsierend
        const sgn = k ? 1 : -1, pulse = 0.5 + 0.5 * Math.sin(t * 3 + k * 2);
        for (let i = 1; i <= 3; i++) {
          const wid = r * (0.9 + i * 0.6) * (0.9 + 0.12 * pulse);
          ctx.globalAlpha = 0.5 - i * 0.1; ctx.fillStyle = k ? '#3a8bff' : '#ff3d5a';
          for (let s = 0; s <= 14; s++) { const f = s / 14, bx = Math.sin(f * Math.PI) * r * (1.5 + i * 0.9), by = sgn * wid * f * 0.35; pxFill(ctx, cx + ux * (r * 0.6 + bx) + vx * (sgn * r * 0.8 + by * 0), cy + uy * (r * 0.6 + bx) + vy * (sgn * r * 0.8)); }
        }
      }
      const tipA = [cx + ux * r * 1.1 + vx * r * 0.85, cy + uy * r * 1.1 + vy * r * 0.85], tipB = [cx + ux * r * 1.1 - vx * r * 0.85, cy + uy * r * 1.1 - vy * r * 0.85];
      if (e.slamWarn <= 0 && Math.sin(t * 13 + e.phase) > 0.3) {                              // Blitzbogen zwischen den Polen
        ctx.globalAlpha = 0.85; ctx.fillStyle = P.ice;
        let px0 = tipA[0], py0 = tipA[1];
        for (let s = 1; s <= 6; s++) { const f = s / 6, nx = tipA[0] + (tipB[0] - tipA[0]) * f + ux * Math.sin(f * Math.PI) * 7 + rand(-2, 2), ny = tipA[1] + (tipB[1] - tipA[1]) * f + uy * Math.sin(f * Math.PI) * 7 + rand(-2, 2); pxLine(ctx, px0, py0, nx, ny, 1); px0 = nx; py0 = ny; }
      }
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 5); ctx.fillStyle = '#ff3d5a'; pxGlow(ctx, tipA[0], tipA[1], 5);
      ctx.fillStyle = '#3a8bff'; pxGlow(ctx, tipB[0], tipB[1], 5);
      if (e.slamWarn > 0) {
        const tl = e.slamN > 0 && e.slamWarn < C.tele ? e.slamWarn / C.tele : 1;
        ctx.globalAlpha = 0.12 + 0.1 * Math.sin(t * 24); ctx.fillStyle = P.red; pxGlow(ctx, cx, cy, R);
        ctx.globalAlpha = 0.9; ctx.fillStyle = P.red; pxRing(ctx, cx, cy, R, 2, 22, 0);
        ctx.globalAlpha = 0.7; ctx.fillStyle = P.yellow; pxRing(ctx, cx, cy, R * (1 - Math.min(1, tl)), 1, 22, 0);
        ctx.globalAlpha = 0.9; ctx.fillStyle = P.white; pxGlow(ctx, cx, cy, r * (0.6 + 0.8 * (1 - Math.min(1, tl))));      // Kern leuchtet auf
      }
    }
    if (e.type === 'lancer') {                                                                 // Lanzenreiter: Spur beim Aufholen, verzierte Lanze, Aufladen, Stoss mit Stosswelle
      const C = CFG.elite.lancer, st = e.stabPh, dd = st >= 1 && st <= 2 ? e.stabDir : e.dir, ux = Math.sin(dd * DEG), uy = -Math.cos(dd * DEG), vx = -uy, vy = ux, full = r + C.reach, tele = mk2 ? C.tele2 : C.tele;
      const tr = e.trail || (e.trail = []);                                                   // Nachbilder: Positionen der letzten Bilder
      if (!tr.length || Math.hypot(tr[tr.length - 1].x - e.x, tr[tr.length - 1].y - e.y) > 4) { tr.push({ x: e.x, y: e.y }); if (tr.length > 5) tr.shift(); }
      if (e.rush || st === 2) tr.forEach((q, i) => drawSprite(ctx, this.sprite(e), q.x, q.y, e.dir, e.size, { alpha: 0.12 + 0.22 * (i / tr.length) }));
      if (e.rush) {                                                                           // Windlinien hinter ihm
        ctx.fillStyle = P.ice;
        for (let k = 0; k < 5; k++) {
          const off = (k - 2) * 5, ph = (t * 6 + k * 0.37) % 1, bx = cx - ux * (r + 6 + ph * 18) + vx * off, by = cy - uy * (r + 6 + ph * 18) + vy * off;
          ctx.globalAlpha = 0.7 * (1 - ph); pxLine(ctx, bx, by, bx - ux * 9, by - uy * 9, 1);
        }
      }
      const rest = r + 22, len = st === 2 ? full : st === 1 ? r + 8 : rest;                  // Laenge der Lanze: getragen / zurueckgezogen / ausgefahren
      const sx = cx + ux * r * 0.3, sy = cy + uy * r * 0.3, ex = cx + ux * len, ey = cy + uy * len;
      if (st === 1) {                                                                         // Vorwarnung: rote Zielline mit Spitzenmarke, Spitze laedt auf, Funken laufen zur Spitze
        const tl = 1 - e.stabLeft / tele;
        ctx.globalAlpha = 0.25 + 0.4 * tl; ctx.fillStyle = P.red; pxLine(ctx, cx + ux * r, cy + uy * r, cx + ux * full, cy + uy * full, 1);
        ctx.globalAlpha = 0.9; pxRing(ctx, cx + ux * full, cy + uy * full, 4, 1);
        ctx.globalAlpha = 0.15 + 0.3 * tl; ctx.fillStyle = P.cyan; pxGlow(ctx, ex, ey, 7 + 12 * tl);
        ctx.globalAlpha = 0.85; ctx.fillStyle = P.white; pxRing(ctx, ex, ey, 16 * (1 - tl) + 4, 1, 8, t * 4);
        for (let k = 0; k < 4; k++) { const ph = (t * 3 + k / 4) % 1; ctx.globalAlpha = 0.8 * (1 - ph); pxFill(ctx, ex + (cx + ux * r - ex) * ph - vx * (k % 2 ? 4 : -4) * (1 - ph), ey + (cy + uy * r - ey) * ph - vy * (k % 2 ? 4 : -4) * (1 - ph)); }
      }
      if (st === 2) {                                                                         // Stoss: Energieband entlang der Lanze, Schein, Stosswelle an der Spitze
        const tk = 1 - e.stabLeft / C.thrust;
        for (let k = -1; k <= 1; k++) { ctx.globalAlpha = k ? 0.35 : 0.9; ctx.fillStyle = k ? P.cyan : P.white; pxLine(ctx, sx + vx * k * 3, sy + vy * k * 3, ex + vx * k * 1.5, ey + vy * k * 1.5, 1); }
        ctx.globalAlpha = 0.3; ctx.fillStyle = P.cyan; pxGlow(ctx, (sx + ex) / 2, (sy + ey) / 2, full * 0.5);
        ctx.globalAlpha = 0.85 * (1 - tk); ctx.fillStyle = P.white; pxRing(ctx, ex, ey, 5 + 18 * tk, 2);
        ctx.globalAlpha = 0.5 * (1 - tk); ctx.fillStyle = P.cyan; pxRing(ctx, ex, ey, 3 + 28 * tk, 1, 14, 0);
      }
      // Lanze: Schaft mit Segmenten, Handschutz (Krone), Spitze als Raute, Wimpel
      ctx.globalAlpha = 1; ctx.fillStyle = '#16475a'; pxLine(ctx, sx, sy, ex, ey, 2);
      ctx.fillStyle = st === 2 ? P.white : P.ice; pxLine(ctx, sx, sy, ex, ey, 1);
      ctx.fillStyle = P.yellow; for (let k = 1; k <= 3; k++) { const f = 0.25 * k, mx = sx + (ex - sx) * f, my = sy + (ey - sy) * f; pxLine(ctx, mx - vx * 2, my - vy * 2, mx + vx * 2, my + vy * 2, 1); }
      const gx = sx + (ex - sx) * 0.28, gy = sy + (ey - sy) * 0.28;                           // Handschutz nahe am Koerper
      ctx.fillStyle = mk2 ? P.yellow : P.cyan; pxLine(ctx, gx - vx * 7, gy - vy * 7, gx + vx * 7, gy + vy * 7, 2);
      ctx.fillStyle = P.white; pxLine(ctx, gx - vx * 7 - ux * 2, gy - vy * 7 - uy * 2, gx - vx * 7 + ux * 2, gy - vy * 7 + uy * 2, 1); pxLine(ctx, gx + vx * 7 - ux * 2, gy + vy * 7 - uy * 2, gx + vx * 7 + ux * 2, gy + vy * 7 + uy * 2, 1);
      pxPolyFill(ctx, [[ex - ux * 8 - vx * 3.5, ey - uy * 8 - vy * 3.5], [ex + ux * 6, ey + uy * 6], [ex - ux * 8 + vx * 3.5, ey - uy * 8 + vy * 3.5], [ex - ux * 3, ey - uy * 3]]);   // Spitze (weiss)
      ctx.fillStyle = mk2 ? P.yellow : P.cyan; pxPolyFill(ctx, [[ex - ux * 6 - vx * 2, ey - uy * 6 - vy * 2], [ex + ux * 3, ey + uy * 3], [ex - ux * 6 + vx * 2, ey - uy * 6 + vy * 2]]);
      const fl = Math.sin(t * 14) * 2.5, wx = sx + (ex - sx) * 0.55, wy = sy + (ey - sy) * 0.55;       // Wimpel flattert
      ctx.fillStyle = P.red; pxPolyFill(ctx, [[wx, wy], [wx - ux * 12 + vx * (5 + fl), wy - uy * 12 + vy * (5 + fl)], [wx - ux * 4 + vx * 1, wy - uy * 4 + vy * 1]]);
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 10); ctx.fillStyle = P.cyan; pxGlow(ctx, ex, ey, 6);                 // Spitze glimmt
    }
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
