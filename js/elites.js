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
    if (e.type === 'umbra') e.bashT = rand(C.bashMin, C.bashMax);
    if (C.tele !== undefined && !e.dmgInit) { e.actT = undefined; e.actWarn = 0; e.actPos = null; e.actDir = 0; e.charge = 0; e.dmgInit = true; }
    if (e.type === 'compactor') { e.dropT = C.first; e.dropWarn = 0; e.dropN = 0; e.dropPos = null; }
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
  // Eigene Koerper der Karten-Elite (28 x 28, Blickrichtung Osten): Umbra, Compactor, Glitch, Emberlord, Miasma, Glacier
  mapSprite(type) {
    const body = (name, paint) => this.custom(name, 28, 28, paint);
    const circ = (px, cx, cy, r, col) => { for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) px(x, y, col); };
    const rng = (a, b) => ((a * 73856093) ^ (b * 19349663)) >>> 0;
    if (type === 'umbra') return body('eliteUmbra', ({ px }) => {                                // dunkle Kugel mit Schleier und zwei gelben Augen
      circ(px, 14, 14, 12.5, '#0b0420'); circ(px, 14, 14, 11, '#1a0b3a'); circ(px, 13, 14, 8, '#2c1566');
      for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { const r = Math.hypot(x + 0.5 - 14, y + 0.5 - 14); if (r > 10.2 && r <= 11.4) px(x, y, '#5b2bd0'); if (r <= 11 && rng(x, y) % 9 === 0) px(x, y, '#3d1f8a'); }
      for (const ey of [9.5, 17.5]) { circ(px, 19.5, ey, 2.2, '#ffe14a'); circ(px, 20, ey, 1, '#ffffff'); }
      for (let k = 0; k < 4; k++) px(2 + k, 7 + k * 4, '#5b2bd0');                                // Schweif
    });
    if (type === 'compactor') return body('eliteCompactor', ({ px, poly }) => {                    // Schrottpresse: rostiger Block mit Pressplatte vorn
      poly([[3, 4], [20, 4], [20, 24], [3, 24]], '#4a2512'); poly([[4, 5], [19, 5], [19, 23], [4, 23]], '#8a4a22'); poly([[4, 5], [19, 5], [19, 8], [4, 8]], '#c8743a');
      poly([[19, 3], [26, 3], [26, 25], [19, 25]], '#2b2b30'); poly([[20, 4], [25, 4], [25, 24], [20, 24]], '#9aa0a8');
      for (let y = 5; y < 24; y++) if (Math.floor(y / 3) % 2 === 0) for (let x = 21; x < 25; x++) px(x, y, '#ffd91f');         // Warnstreifen
      for (const [x, y] of [[6, 11], [6, 17], [14, 11], [14, 17]]) { px(x, y, '#2b1608'); px(x + 1, y, '#2b1608'); }                   // Nieten
      poly([[7, 12], [13, 12], [13, 16], [7, 16]], '#4a2512'); poly([[8, 13], [12, 13], [12, 15], [8, 15]], '#ffd91f');              // Sichtfenster
      px(2, 9, '#7a808a'); px(1, 9, '#7a808a'); px(2, 18, '#7a808a'); px(1, 18, '#7a808a');                                              // Auspuff
    });
    if (type === 'glitch') return body('eliteGlitch', ({ px, poly }) => {                          // Raute mit verschobenen Streifen (Datenfehler)
      poly([[14, 1], [27, 14], [14, 27], [1, 14]], '#06403a'); poly([[14, 3.5], [24.5, 14], [14, 24.5], [3.5, 14]], '#12a88c'); poly([[14, 6], [22, 14], [14, 22], [6, 14]], '#2bffb0');
      for (let y = 1; y < 27; y += 5) for (let x = 0; x < 28; x++) { px(x + (y % 10 === 1 ? 2 : -2), y, '#ff3dd0'); px(x, y + 1, '#06403a'); }
      circ(px, 14, 14, 3, '#ffffff'); circ(px, 14, 14, 1.5, '#06403a');
    });
    if (type === 'emberlord') return body('eliteEmberlord', ({ px, poly }) => {                    // Schmelzofen: dunkle Kugel mit gluehenden Rissen, Hoerner nach vorn
      poly([[17, 4], [27, 1], [22, 10]], '#2b1008'); poly([[17, 24], [27, 27], [22, 18]], '#2b1008'); poly([[19, 5], [26, 2.5], [22, 9]], '#c8743a'); poly([[19, 23], [26, 25.5], [22, 19]], '#c8743a');
      circ(px, 13, 14, 12, '#2b1008'); circ(px, 13, 14, 10.5, '#4a1a0c');
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.4; for (let r = 3; r < 10; r++) { const x = Math.floor(13 + Math.cos(a) * r), y = Math.floor(14 + Math.sin(a) * r * 1.0 + ((r * k) % 3 - 1)); px(x, y, r < 6 ? '#ffd91f' : '#ff8a1f'); } }
      circ(px, 13, 14, 4, '#ff8a1f'); circ(px, 13, 14, 2.5, '#ffd91f'); circ(px, 13, 14, 1.2, '#ffffff');
    });
    if (type === 'miasma') return body('eliteMiasma', ({ px }) => {                                // Giftblase: gruener Beutel mit Blasen und violetten Flecken
      circ(px, 14, 14, 12.5, '#0f3a1a'); circ(px, 14, 14, 11, '#2a7a3a'); circ(px, 12, 13, 8, '#3fae4f');
      for (const [x, y, r] of [[9, 9, 3], [17, 17, 3.4], [18, 8, 2], [8, 18, 2.2], [13, 14, 2.4]]) { circ(px, x, y, r, '#8aff7a'); circ(px, x - 0.6, y - 0.6, r * 0.4, '#e6ffe0'); }
      for (const [x, y, r] of [[21, 13, 2], [14, 22, 1.8], [6, 12, 1.6]]) circ(px, x, y, r, '#7a3fb0');
      for (let k = 0; k < 6; k++) { const a = k * 1.05; px(Math.floor(14 + Math.cos(a) * 13), Math.floor(14 + Math.sin(a) * 13), '#8aff7a'); }
    });
    if (type === 'glacier') return body('eliteGlacier', ({ px, poly }) => {                        // Eiskristall: Sechseck mit Facetten
      const hx = (r) => { const pts = []; for (let k = 0; k < 6; k++) pts.push([14 + Math.cos(k * 1.0472) * r, 14 + Math.sin(k * 1.0472) * r]); return pts; };
      poly(hx(13.5), '#1d5f82'); poly(hx(12), '#6fc8ee'); poly(hx(8.5), '#bfefff');
      poly([[14, 14], [14 + 12 * Math.cos(-1.0472), 14 + 12 * Math.sin(-1.0472)], [14 + 12 * Math.cos(0), 14], [14 + 12 * Math.cos(1.0472), 14 + 12 * Math.sin(1.0472)]], '#2a7fa8');
      poly([[14, 14], [14 + 8.5 * Math.cos(-2.0944), 14 + 8.5 * Math.sin(-2.0944)], [14 + 8.5 * Math.cos(-1.0472), 14 + 8.5 * Math.sin(-1.0472)]], '#ffffff');
      circ(px, 14, 14, 2.5, '#ffffff');
      for (const [x, y] of [[5, 9], [22, 20], [9, 21]]) { px(x, y, '#ffffff'); px(x + 1, y, '#bfefff'); px(x, y + 1, '#bfefff'); }
    });
    // Phantom und Bastion: gemalt wie die Karten-Elite, aber achsensymmetrisch (nur die obere Haelfte wird gemalt und nach unten gespiegelt)
    const half = (g, w, h, paint) => {
      g.save(); g.beginPath(); g.rect(0, 0, w, h / 2); g.clip(); paint(); g.restore();
      g.save(); g.translate(0, h); g.scale(1, -1); g.drawImage(g.canvas, 0, 0, w, h / 2, 0, 0, w, h / 2); g.restore();
    };
    if (type === 'phantom') return body('elitePhantom2', ({ px, poly, g }) => half(g, 28, 28, () => {      // Geisterklinge: Umhang-Fluegel, Kapuze, zwei Augen
      poly([[27.5, 14], [19, 5.5], [8, 1.5], [0.5, 5], [5.5, 8.5], [1, 11.5], [8, 13.6], [13, 14]], '#1b0a40');
      poly([[26.5, 14], [19, 6.8], [9, 3.2], [3, 5.6], [7, 9], [3.5, 11.2], [10, 13], [14, 14]], '#4a22b8');
      poly([[26.5, 14], [19, 6.8], [14, 8.6], [20, 14]], '#a98aff');
      poly([[25, 14], [20, 9.5], [13, 11], [11, 14]], '#12062e');
      poly([[22, 14], [19, 10.8], [15, 11.6], [14, 14]], '#2a1470');
      for (const [x, y, c] of [[20, 11, '#ffffff'], [21, 11, '#ffffff'], [20, 12, '#ffffff'], [21, 12, '#ffffff'], [21, 11, '#6ff0ff']]) px(x, y, c);
      for (const [x, y] of [[2, 6], [4, 8], [6, 10], [9, 12]]) px(x, y, '#a98aff');
    }));
    if (type === 'bastion') return body('eliteBastion3', ({ px, poly, g }) => half(g, 28, 28, () => {       // Festung: Stahlachteck mit gluehendem Kern und dreifach geplattetem Schildbogen vorn
      const oct = (r, col) => poly(Array.from({ length: 8 }, (_, k) => [12 + Math.cos(k * 0.7854 + 0.3927) * r, 14 + Math.sin(k * 0.7854 + 0.3927) * r]), col);
      oct(11, '#141a26'); oct(9.8, '#3a4660'); oct(7.6, '#5d6b88'); oct(5.6, '#8696b4');
      for (let k = 0; k < 8; k++) { const a = k * 0.7854; for (let r = 4; r < 10; r += 1) px(12 + Math.cos(a) * r, 14 + Math.sin(a) * r, '#2a3448'); }               // Plattenfugen
      for (let y = 0; y < 14; y++) for (let x = 0; x < 28; x++) { const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 14), a = Math.atan2(y + 0.5 - 14, x + 0.5 - 12); if (d <= 14 && d > 11.2 && Math.abs(a) < 1.05) px(x, y, d > 13.1 ? '#eef4fc' : d > 12.2 ? '#9aaac4' : '#46546e'); }
      for (const a of [0, 0.42, 0.84]) px(12 + Math.cos(a) * 12.7, 14 + Math.sin(a) * 12.7, '#fff0c0');                                                                       // Nieten im Schild
      for (let y = 0; y < 14; y++) for (let x = 0; x < 28; x++) { const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 14); if (d <= 4) px(x, y, d <= 2 ? '#ffe9b0' : d <= 3 ? '#ff9a2d' : '#141a26'); }
      for (let x = 17; x < 21; x++) px(x, 13, '#ff3d3d');                                                                                                                      // Sehschlitz
      for (const x of [1, 3]) px(x, 11, '#2a3448');                                                                                                                            // Lueftung hinten
    }));
    return null;
  },
  // Umgefaerbtes Sprite des Typs (Cos.tinted merkt es sich, ein Farbfilter pro Bild waere in Edge sehr langsam); Lanzenreiter und Magnetar haben eigene Koerper
  sprite(e) {
    if (e.type === 'lancer') { const n = this.lancerSprite(); if (n) return n; }
    if (e.type === 'magnetar') { const n = this.magnetSprite(); if (n) return n; }
    const mapN = this.mapSprite(e.type); if (mapN) return mapN;                            // Karten-Elite (Karten 1-6)
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

  // ---------- Umbra (Karte 5) ----------
  umbraSteer(e, dt, tg) {
    const C = CFG.elite.umbra, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.umbra.speed * this.speedMul(e);
    e.bashT -= dt;
    if (e.bashT <= 0 && d < C.range) { e.bashT = rand(C.bashMin, C.bashMax); e.ov = Patterns.dashOv(e, C.tele, C.go, C.speed, true); }       // Rammstoss mit Vorwarnung
    return { step, touch: true, move: toP };
  },
  // Dimmt das Licht einer Figur oder eines Spawners p (x, y): kleinster Faktor aller Umbras in Reichweite (1 = nichts)
  umbraDim(p) {
    let f = 1;
    for (const e of G.enemies) {
      if (!e.alive || e.type !== 'umbra') continue;
      const C = CFG.elite.umbra, R = e.mk === 2 ? C.dimRange2 : C.dimRange;
      if (dist2(e.x, e.y, p.x, p.y) < R * R) f = Math.min(f, C.dim);
    }
    return f;
  },

  // ---------- Compactor (Karte 6) ----------
  compactorSteer(e, dt, tg) {
    const C = CFG.elite.compactor, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.compactor.speed * this.speedMul(e);
    e.dir = toP; e.dropT -= dt;
    if (e.dropWarn > 0) {                                                            // wirft: steht still, Ring zeigt die Landestelle
      e.dropWarn -= dt;
      if (e.dropWarn <= 0) this.drop(e);
      return { step: 0, touch: true };
    }
    if (e.dropT <= 0 && d < C.range && !SafeSpot.inside) {
      e.dropN = mk2 ? 2 : 1; e.dropWarn = mk2 ? C.tele2 : C.tele; e.dropPos = [tg.x, tg.y]; Sfx.play('ventWarn');
    }
    if (d > C.keepDist + C.band) return { step, touch: true, move: toP };
    if (d < C.keepDist - C.band) return { step: step * 0.6, touch: true, move: toP + 180 };
    return { step: step * 0.5, touch: true, move: toP + e.side * 90 };
  },
  // Schrott landet: Schaden im Ring, dann eine neue Barrikade (wenn Platz ist)
  drop(e) {
    const C = CFG.elite.compactor, mk2 = e.mk === 2, R = mk2 ? C.radius2 : C.radius, [x, y] = e.dropPos;
    G.blasts.push(new Pop(x, y, R, STYLE.pal.yellow));
    Juice.shake(2); Sfx.play('ventBlast'); Juice.sparks(x, y, STYLE.pal.orange, 12, 4); Juice.sparks(x, y, STYLE.pal.grey, 8, 3);
    for (const q of playersList()) if (dist2(q.x, q.y, x, y) <= (R + q.radius) ** 2) q.hit('shoot', e.dmgMul, Stats.enemyName(e));
    if (!G.obstacles.some((o) => o.alive && dist2(o.x, o.y, x, y) < 30 * 30)) {
      const o = new Obstacle(x, y); o.maxHp = o.hp = C.obstHp; G.obstacles.push(o);
    }
    if (--e.dropN > 0) { e.dropPos = [G.player.target.x + rand(-40, 40), G.player.target.y + rand(-40, 40)]; e.dropWarn = C.tele2; }
    else { e.dropT = mk2 ? C.every2 : C.every; e.dropPos = null; }
  },
  // Eisenpanzer: lenkt Schuesse (Spieler und Gegner) im Umkreis ab, o = Geschoss mit dir/x/y, f = Bilder
  repel(o, f) {
    const C = CFG.elite.compactor;
    for (const e of G.enemies) {
      if (!e.alive || e.type !== 'compactor') continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d > C.repelRange || d < e.radius) continue;
      const away = dirTo(e.x, e.y, o.x, o.y), turn = C.repelTurn * (1 - d / C.repelRange) * f;
      o.dir += clamp(angleDiff(away, o.dir), -turn, turn);
    }
  },

  // ---------- Karten-Elite der Karten 1-4 ----------
  // Gemeinsamer Abstandsgang: ran, weg oder seitlich kreisen
  keep(e, step, toP, d, C) {
    if (d > C.keepDist + C.band) return { step, touch: true, move: toP };
    if (d < C.keepDist - C.band) return { step: step * 0.6, touch: true, move: toP + 180 };
    return { step: step * 0.5, touch: true, move: toP + e.side * 90 };
  },
  bolts(e, n, spread, speed, frames, chill, around) {                           // n Bolzen: im Ring (around) oder als Faecher zum Spieler
    const aim = dirTo(e.x, e.y, G.player.target.x, G.player.target.y);
    for (let i = 0; i < n; i++) G.shots.push(Object.assign(new EnemyBolt(e.x, e.y, around ? e.phase * 57 + (360 / n) * i : aim + (i - (n - 1) / 2) * spread, speed, frames), { src: Stats.enemyName(e), mul: e.dmgMul, chill }));
  },
  // Glitch (Neon Void): blinkt neben den Spieler und schiesst dort einen Ring
  glitchSteer(e, dt, tg) {
    const C = CFG.elite.glitch, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.glitch.speed * this.speedMul(e);
    e.dir = toP; e.actT = (e.actT === undefined ? C.first : e.actT) - dt;
    if (e.actWarn > 0) {
      e.actWarn -= dt;
      if (e.actWarn <= 0) {
        Juice.sparks(e.x, e.y, STYLE.pal.cyan, 8, 3); [e.x, e.y] = clampToMap(e.actPos[0], e.actPos[1], 20); Juice.sparks(e.x, e.y, STYLE.pal.cyan, 12, 4); Sfx.play('blink');
        this.bolts(e, mk2 ? C.n2 : C.n, 0, C.boltSpeed, C.boltFrames, false, true); e.actT = mk2 ? C.every2 : C.every; e.actPos = null;
      }
      return { step: 0, touch: false };
    }
    if (e.actT <= 0 && !SafeSpot.inside) { const a = rand(0, 360); e.actPos = [tg.x + fwdX(a) * C.hop, tg.y + fwdY(a) * C.hop]; e.actWarn = mk2 ? C.tele2 : C.tele; Sfx.play('ventWarn'); }
    return this.keep(e, step, toP, d, C);
  },
  // Emberlord (Ember Foundry): Sturmangriff mit Lavapfuetzen
  emberSteer(e, dt, tg) {
    const C = CFG.elite.emberlord, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.emberlord.speed * this.speedMul(e);
    e.actT = (e.actT === undefined ? C.first : e.actT) - dt;
    if (e.actWarn > 0) {                                                             // Vorwarnung: steht, Richtung festgelegt
      e.actWarn -= dt; e.dir = e.actDir;
      if (e.actWarn <= 0) { e.charge = C.dist; e.trailAcc = 0; Sfx.play('enemyShot'); }
      return { step: 0, touch: false };
    }
    if (e.charge > 0) {                                                              // Sturm: Lavapfuetzen im Abstand `step`
      const sp = mk2 ? C.speed2 : C.speed, mv = sp * framesOf(dt);
      e.charge -= mv; e.trailAcc += mv; e.dir = e.actDir;
      while (e.trailAcc >= C.step) { e.trailAcc -= C.step; G.blasts.push(new HeatPool(e.x, e.y, C.pool, mk2 ? C.life2 : C.life, e.dmgMul, Stats.enemyName(e))); }
      return { step: sp, touch: true, move: e.actDir };
    }
    e.dir = toP;
    if (e.actT <= 0 && d < 330 && !SafeSpot.inside) { e.actDir = toP; e.actWarn = mk2 ? C.tele2 : C.tele; e.actT = mk2 ? C.every2 : C.every; Sfx.play('ventWarn'); return { step: 0, touch: false }; }
    return this.keep(e, step, toP, d, C);
  },
  // Miasma (Toxic Core): wirft Giftwolken um den Spieler
  miasmaSteer(e, dt, tg) {
    const C = CFG.elite.miasma, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.miasma.speed * this.speedMul(e);
    e.dir = toP; e.actT = (e.actT === undefined ? C.first : e.actT) - dt;
    if (e.actWarn > 0) {
      e.actWarn -= dt;
      if (e.actWarn <= 0) {
        for (let i = 0; i < (mk2 ? C.n2 : C.n); i++) dropCloud(clamp(e.actPos[0] + rand(-C.spread, C.spread), -CFG.map.halfW, CFG.map.halfW), clamp(e.actPos[1] + rand(-C.spread, C.spread), -CFG.map.halfH, CFG.map.halfH));
        Juice.sparks(e.x, e.y, STYLE.pal.green, 10, 3); Sfx.play('acidBurp'); e.actT = mk2 ? C.every2 : C.every; e.actPos = null;
      }
      return { step: 0, touch: true };
    }
    if (e.actT <= 0 && d < 320 && !SafeSpot.inside) { e.actPos = [tg.x, tg.y]; e.actWarn = mk2 ? C.tele2 : C.tele; Sfx.play('ventWarn'); }
    return this.keep(e, step, toP, d, C);
  },
  // Glacier (Cryo Station): Frostnova, danach Eisbolzen
  glacierSteer(e, dt, tg) {
    const C = CFG.elite.glacier, mk2 = e.mk === 2, toP = dirTo(e.x, e.y, tg.x, tg.y), d = Math.hypot(tg.x - e.x, tg.y - e.y), step = CFG.enemy.glacier.speed * this.speedMul(e);
    e.dir = toP; e.actT = (e.actT === undefined ? C.first : e.actT) - dt;
    if (e.actWarn > 0) {
      e.actWarn -= dt;
      if (e.actWarn <= 0) {
        const R = mk2 ? C.radius2 : C.radius;
        G.blasts.push(new Pop(e.x, e.y, R, STYLE.pal.ice)); Juice.shake(2); Sfx.play('ventBlast'); Juice.sparks(e.x, e.y, STYLE.pal.ice, 14, 4);
        hurtPlayersAt(e.x, e.y, R, 'shoot', e.dmgMul, Stats.enemyName(e), true);                                    // kuehlt (Frost)
        this.bolts(e, mk2 ? C.n2 : C.n, C.spreadDeg, C.boltSpeed, C.boltFrames, true, false);
        e.actT = mk2 ? C.every2 : C.every;
      }
      return { step: 0, touch: true };
    }
    if (e.actT <= 0 && d < 300 && !SafeSpot.inside) { e.actWarn = mk2 ? C.tele2 : C.tele; Sfx.play('ventWarn'); }
    return this.keep(e, step, toP, d, C);
  },

  // ---------- Zeichnen (unter dem Gegner): Schein, Ringe, Schildfront, Nachbilder, Mk-Markierung ----------
  drawFx(ctx, e) {
    const P = STYLE.pal, r = e.radius, cx = STAGE_W / 2 + e.x, cy = STAGE_H / 2 - e.y, t = G.realTime, col = e.type === 'phantom' ? P.purple : e.type === 'magnetar' ? P.green : e.type === 'lancer' ? P.cyan : e.type === 'umbra' ? P.violet : e.type === 'compactor' ? P.yellow : e.type === 'glitch' ? P.cyan : e.type === 'emberlord' ? P.orange : e.type === 'miasma' ? P.green : e.type === 'glacier' ? P.ice : P.orange, mk2 = e.mk === 2;
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
    if (e.actWarn > 0 && (e.type === 'glitch' || e.type === 'miasma' || e.type === 'glacier')) {                // Vorwarnung der Karten-Elite: Ring an der Zielstelle (Glitch: Sprungziel, Miasma: Wurfziel, Glacier: Nova um ihn)
      const C = CFG.elite[e.type], tele = mk2 ? C.tele2 : C.tele, tl = 1 - e.actWarn / tele, R = e.type === 'glacier' ? (mk2 ? C.radius2 : C.radius) : e.type === 'glitch' ? 14 : C.spread;
      const gx = e.type === 'glacier' ? cx : STAGE_W / 2 + e.actPos[0], gy = e.type === 'glacier' ? cy : STAGE_H / 2 - e.actPos[1];
      ctx.globalAlpha = 0.14 + 0.12 * Math.sin(t * 24); ctx.fillStyle = e.type === 'miasma' ? P.green : P.red; pxGlow(ctx, gx, gy, R);
      ctx.globalAlpha = 0.9; ctx.fillStyle = e.type === 'glitch' ? P.cyan : e.type === 'miasma' ? P.green : P.ice; pxRing(ctx, gx, gy, R, 2, 22, 0);
      ctx.globalAlpha = 0.7; ctx.fillStyle = P.yellow; pxRing(ctx, gx, gy, R * Math.min(1, tl), 1, 22, 0);
    }
    if (e.type === 'emberlord') {                                                              // Emberlord: Warnlinie des Sturms, Glut
      const C = CFG.elite.emberlord;
      if (e.actWarn > 0) { ctx.globalAlpha = 0.3 + 0.5 * (1 - e.actWarn / (mk2 ? C.tele2 : C.tele)); ctx.fillStyle = P.red; pxLine(ctx, cx, cy, cx + fwdX(e.actDir) * C.dist, cy - fwdY(e.actDir) * C.dist, 1); }
      for (let k = 0; k < 5; k++) { const ph = (t * 1.2 + k / 5) % 1; ctx.globalAlpha = 0.8 * (1 - ph); ctx.fillStyle = k % 2 ? P.orange : P.yellow; pxFill(ctx, cx + Math.sin(k * 2.7 + t) * r * 0.8, cy - ph * r * 2, 1); }
    }
    if (e.type === 'umbra') {                                                                  // Umbra: dunkle Schleier, Rammstoss-Warnung
      for (let k = 0; k < 6; k++) { const ph = (t * 0.6 + k / 6) % 1, a = k * 1.05 + t; ctx.globalAlpha = 0.5 * (1 - ph); ctx.fillStyle = P.violetDark; pxFill(ctx, cx + Math.cos(a) * r * (1 + ph * 1.5), cy + Math.sin(a) * r * (1 + ph * 1.5), 3); }
      if (e.ov && e.ov.phase === 'tele') { ctx.globalAlpha = 0.9; ctx.fillStyle = P.red; pxLine(ctx, cx, cy, cx + fwdX(e.ov.dir) * 70, cy - fwdY(e.ov.dir) * 70, 1); }
    }
    if (e.type === 'compactor') {                                                              // Compactor: Eisenfeld (Ring der Ablenkung), Wurf-Ring an der Landestelle
      const C = CFG.elite.compactor, R = mk2 ? C.radius2 : C.radius;
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 4); ctx.fillStyle = P.grey; pxRing(ctx, cx, cy, C.repelRange, 1, 24, t * 0.2);
      if (e.dropWarn > 0 && e.dropPos) {
        const gx = STAGE_W / 2 + e.dropPos[0], gy = STAGE_H / 2 - e.dropPos[1], tl = 1 - e.dropWarn / (mk2 ? C.tele2 : C.tele);
        ctx.globalAlpha = 0.15 + 0.15 * Math.sin(t * 24); ctx.fillStyle = P.red; pxGlow(ctx, gx, gy, R);
        ctx.globalAlpha = 0.9; ctx.fillStyle = P.red; pxRing(ctx, gx, gy, R, 2, 22, 0);
        ctx.globalAlpha = 0.7; ctx.fillStyle = P.yellow; pxRing(ctx, gx, gy, R * Math.min(1, tl), 1, 22, 0);
      }
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
