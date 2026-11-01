// Hindernisse der dynamischen Arena (Zahlen in CFG.obstacles). Zerstörbare Barrikaden mit Leben: niemand nimmt Schaden von ihnen,
// aber Spieler, normale Gegner und Bosse kommen nicht durch (Spieler nur, solange er nicht unsichtbar ist: Phase). Waffen des Spielers beschädigen sie.
// Sie dienen als Deckung: Gegnerschüsse, Raketen und Explosionen treffen sie statt dich und beschädigen sie (hitObstacle, hurtObstaclesInRadius). Eigene Schüsse fliegen hindurch.
// Der Director hält die Anzahl (wächst pro Welle) und stellt zerstörte Barrikaden nach einer Weile an neuer Stelle wieder auf. Im Bosskampf verschwinden alle.

// Diese Angriffsarten beschädigen auch dann, wenn sie selbst nicht "damaging" sind (Flächenschaden, den sie sonst selbst verteilen)
const OBSTACLE_HURTERS = ['rocket', 'grenade', 'impulse', 'bombard', 'fire', 'blood', 'ult', 'chain', 'blackhole'];

class Obstacle {
  constructor(x, y) {
    const C = Object.assign({}, CFG.obstacles, (G.map && G.map.obstacles) || {});            // Karte 6 Scrapyard: kleinere, schwaechere Schrotthaufen
    this.x = x; this.y = y; this.r = C.radius;
    this.maxHp = this.hp = randInt(C.hpMin, C.hpMax);
    this.scrap = C.style === 'scrap'; this.look = randInt(0, 4);                          // look: Reifenstapel / Fassgruppe / Autowrack / Schrotthaufen / Kiste
    this.alive = true;
    this.age = 0;
    this.hitCd = 0;
    this.flash = 0;
    this.cracks = [];                                     // Risse: Winkel, Länge, Knick
    for (let i = 0; i < 6; i++) this.cracks.push([(i / 6) * 6.283 + rand(-0.4, 0.4), rand(0.5, 1), rand(-0.7, 0.7)]);
  }

  update(dt) {
    const C = CFG.obstacles;
    if (G.bossFight) { this.vanish(); return; }            // im Bosskampf ist die Arena frei
    this.age += dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.hitCd > 0) return;
    const hit = G.attacks.find((a) => a.alive && a.kind !== 'shield' && a.hitsCircle && (a.damaging || OBSTACLE_HURTERS.includes(a.kind)) && a.hitsCircle(this.x, this.y, this.r));
    if (!hit) return;
    this.hitCd = C.hitCd;
    this.hurt(1);
  }

  // Schaden von außen (Waffe, Gegnerschuss, Explosion): n Leben abziehen
  hurt(n) {
    if (!this.alive) return;
    this.hp -= n;
    this.flash = 0.12;
    Juice.sparks(this.x, this.y, STYLE.pal.grey, 3, 2);
    if (this.hp <= 0) this.destroy(); else Sfx.play('crateHit');
  }

  destroy() {
    this.alive = false;
    Sfx.play('crateBreak');
    Juice.sparks(this.x, this.y, STYLE.pal.grey, 12, 4.5);
    Juice.sparks(this.x, this.y, STYLE.pal.ice, 5, 3);
    Juice.shake(1.5);
    G.blasts.push(new Pop(this.x, this.y, this.r * 2.4, STYLE.pal.grey));
    if (typeof Tutorial !== 'undefined' && Tutorial.active) G.powerups.push(new PowerUp(this.x, this.y, 8));         // Tutorial: immer ein kleines Heilkreuz
    else { this.dropLoot(); Ach.add('crates'); }
  }

  // Beute: nach den Gewichten in CFG.obstacles.loot (nichts, Cores, kleines Heilen, schwacher Buff)
  dropLoot() {
    const L = CFG.obstacles.loot, roll = Math.random() * (L.none + L.cores + L.heal + L.buff);
    if (roll < L.none) return;
    if (roll < L.none + L.cores) {
      const n = randInt(L.coresMin, L.coresMax);
      G.lootCores += n;
      Juice.sparks(this.x, this.y, STYLE.pal.yellow, 8, 3.5);
      if (G.noticeT <= 0) G.notice('+' + n + ' CREDITS', STYLE.pal.yellow, STYLE.type.body);
    } else if (roll < L.none + L.cores + L.heal) G.powerups.push(new PowerUp(this.x, this.y, L.healAmount));
    else G.drops.push(new Drop(this.x, this.y, L.buffs[randInt(0, L.buffs.length - 1)]));
  }
  vanish() { this.alive = false; G.blasts.push(new Pop(this.x, this.y, this.r * 1.6, STYLE.pal.greyMid)); }

  draw(ctx) {
    if (this.scrap) { this.drawScrap(ctx); return; }
    const P = STYLE.pal, G2 = PIXEL, cx = Math.round((STAGE_W / 2 + this.x) / G2) * G2, cy = Math.round((STAGE_H / 2 - this.y) / G2) * G2;
    const k = Math.min(1, this.age / 0.35), r = this.r * (0.6 + 0.4 * k);
    const ghost = G.player && G.player.blinkT > 0;                      // unsichtbar = man geht hindurch: Barrikaden werden durchscheinend
    const al = (ghost ? 0.35 : 1) * k;
    // Achteck-Test: Zelle (u, v) relativ zur Mitte, rad = Radius
    const inside = (u, v, rad) => Math.max(Math.abs(u), Math.abs(v)) <= rad * 0.924 && Math.abs(u) + Math.abs(v) <= rad * 1.307;
    const ring = (rad, col) => {                                        // Rand = Zellen innen, die einen Nachbarn außen haben
      ctx.fillStyle = col;
      const n = Math.ceil(rad / G2) + 1;
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        const u = (i + 0.5) * G2, v = (j + 0.5) * G2;
        if (inside(u, v, rad) && !(inside(u + G2, v, rad) && inside(u - G2, v, rad) && inside(u, v + G2, rad) && inside(u, v - G2, rad))) ctx.fillRect(cx + i * G2, cy + j * G2, G2, G2);
      }
    };
    ctx.save();
    ctx.globalAlpha = al;
    const n = Math.ceil(r / G2) + 1;
    ctx.fillStyle = this.flash > 0 ? P.white : P.greyDark;              // Füllung
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if (inside((i + 0.5) * G2, (j + 0.5) * G2, r)) ctx.fillRect(cx + i * G2, cy + j * G2, G2, G2);
    ring(r, this.flash > 0 ? P.white : P.grey);
    ring(r * 0.62, P.greyMid);
    ctx.fillStyle = P.greyMid;
    pxLine(ctx, cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4);
    pxLine(ctx, cx + r * 0.4, cy - r * 0.4, cx - r * 0.4, cy + r * 0.4);
    pxCracks(ctx, cx, cy, this.cracks, r, Math.ceil((1 - this.hp / this.maxHp) * this.cracks.length));       // je weniger Leben, desto mehr Risse
    ctx.restore();
  }
}

// Schrotthaufen der Karte 6 (Scrapyard): fuenf Looks in DRAUFSICHT (Reifenstapel, Fassgruppe, Autowrack, Schrotthaufen, Kiste), rostig, mit dunkler Kontur und Lichtkante.
// Das Bild fuellt die ganze Kollisionsflaeche (Radius CFG.maps[].obstacles.radius).
Obstacle.prototype.drawScrap = function (ctx) {
  const P = STYLE.pal, g = PIXEL, cx = Math.round((STAGE_W / 2 + this.x) / g) * g, cy = Math.round((STAGE_H / 2 - this.y) / g) * g;
  const k = Math.min(1, this.age / 0.35), r = this.r * (0.6 + 0.4 * k), ghost = G.player && G.player.blinkT > 0, f = this.flash > 0;
  const RD = '#5a2a12', RM = '#b0622c', RL = '#f09a50', ST = '#6a707a', SL = '#c4cad2', BK = '#120d09', GL = '#3a5f78', YL = '#ffd91f', WD = '#8a6a3a', WL = '#c8a064';
  const A = (ghost ? 0.35 : 1) * k, snap = (v) => Math.round(v / g) * g;
  const box = (x, y, w, h, col) => { ctx.fillStyle = f ? P.white : col; ctx.fillRect(snap(cx + x), snap(cy + y), Math.max(g, snap(w)), Math.max(g, snap(h))); };
  const disc = (x, y, rr, col) => {                                                // vollflaechige Scheibe aus Pixelzeilen (pxDisc ist gerastert und wirkt hohl)
    ctx.fillStyle = f ? P.white : col;
    for (let yy = -Math.floor(rr / g); yy <= Math.floor(rr / g); yy++) { const hw = Math.sqrt(Math.max(0, rr * rr - (yy * g + g / 2) ** 2)); if (hw > 0) ctx.fillRect(snap(cx + x - hw), snap(cy + y) + yy * g, Math.max(g, snap(hw * 2)), g); }
  };
  const ring = (x, y, rr, col, w = 1) => {                                          // duenner Ring, ebenfalls aus Pixelzeilen
    ctx.fillStyle = f ? P.white : col;
    for (let yy = -Math.floor(rr / g); yy <= Math.floor(rr / g); yy++) {
      const dy = (yy * g + g / 2) ** 2, ho = Math.sqrt(Math.max(0, rr * rr - dy)), hi = Math.sqrt(Math.max(0, (rr - w * g) ** 2 - dy));
      if (ho <= 0) continue; ctx.fillRect(snap(cx + x - ho), snap(cy + y) + yy * g, Math.max(g, snap(ho - hi)), g); if (hi > 0) ctx.fillRect(snap(cx + x + hi), snap(cy + y) + yy * g, Math.max(g, snap(ho - hi)), g);
    }
  };
  const poly = (pts, col) => { ctx.fillStyle = f ? P.white : col; pxPolyFill(ctx, pts.map(([x, y]) => [cx + x, cy + y])); };
  const plate = (x, y, w, h, ang, body, edge) => {                                 // gedrehte Platte: Kontur, Flaeche, Lichtkante
    const co = Math.cos(ang), si = Math.sin(ang), pts = (hw, hh) => [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [x + u * co - v * si, y + u * si + v * co]);
    poly(pts(w / 2 + g, h / 2 + g), BK); poly(pts(w / 2, h / 2), body);
    const e = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + g], [-w / 2, -h / 2 + g]].map(([u, v]) => [x + u * co - v * si, y + u * si + v * co]); poly(e, edge);
  };
  ctx.save(); ctx.globalAlpha = A * 0.4; disc(g, g * 1.5, r * 0.98, BK); ctx.globalAlpha = A;               // Schatten (Licht von links oben)
  const l = this.look % 5;
  if (l === 0) {                                                                      // Reifenstapel von oben: drei Reifen
    for (const [x, y, q] of [[-0.42, -0.36, 0.58], [0.44, -0.1, 0.56], [-0.04, 0.46, 0.58]]) {
      const rr = r * q; disc(x * r, y * r, rr + g, BK); disc(x * r, y * r, rr, '#34343c'); ring(x * r, y * r, rr - g, '#5c5c68', 2); disc(x * r, y * r, rr * 0.56, '#17171c'); disc(x * r, y * r, rr * 0.3, '#8a8a95'); disc(x * r, y * r, rr * 0.12, BK);
      for (let a = 0; a < 6.28; a += 0.8) box(x * r + Math.cos(a) * rr * 0.8 - 1, y * r + Math.sin(a) * rr * 0.8 - 1, 2, 2, '#1c1c22');             // Profil
    }
  } else if (l === 1) {                                                               // Fassgruppe von oben: drei Deckel
    for (const [x, y, q, body, lit] of [[-0.42, -0.36, 0.56, RM, RL], [0.46, -0.08, 0.56, '#b8892a', '#f2c94c'], [-0.04, 0.46, 0.56, '#8a3a1a', '#c85a2a']]) {
      const rr = r * q; disc(x * r, y * r, rr + g, BK); disc(x * r, y * r, rr, body); ring(x * r, y * r, rr - g, lit, 2); disc(x * r, y * r, rr * 0.62, RD); ring(x * r, y * r, rr * 0.62, lit);
      box(x * r - rr * 0.3, y * r - 1, rr * 0.6, 2, BK); disc(x * r + rr * 0.35, y * r - rr * 0.3, rr * 0.14, SL);                                    // Spund
    }
  } else if (l === 2) {                                                               // Autowrack von oben: lange Karosserie, Dach, Scheiben, Raeder
    for (const [x, y] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) { box(x * r - r * 0.18, y * r - r * 0.16, r * 0.36, r * 0.32, BK); box(x * r - r * 0.12, y * r - r * 0.1, r * 0.24, r * 0.2, '#34343c'); }
    box(-r - g, -r * 0.62 - g, r * 2 + 2 * g, r * 1.24 + 2 * g, BK); box(-r, -r * 0.62, r * 2, r * 1.24, RM); box(-r, -r * 0.62, r * 2, g, RL); box(-r, -r * 0.62, g, r * 1.24, RL);
    box(-r * 0.78, -r * 0.22, r * 0.5, r * 0.5, RD); box(r * 0.55, r * 0.2, r * 0.32, r * 0.3, RD);                                                  // Rostflecken
    box(-r * 0.42, -r * 0.5, r * 0.78, r * 1.0, ST); box(-r * 0.42, -r * 0.5, r * 0.78, g, SL); box(-r * 0.34, -r * 0.4, r * 0.2, r * 0.8, GL); box(r * 0.16, -r * 0.4, r * 0.2, r * 0.8, GL);      // Dach + Scheiben
    box(r * 0.82, -r * 0.5, g * 2, g * 2, YL); box(r * 0.82, r * 0.34, g * 2, g * 2, YL); box(-r * 0.96, -r * 0.5, g * 2, g * 2, '#c0392b'); box(-r * 0.96, r * 0.34, g * 2, g * 2, '#c0392b');         // Scheinwerfer / Ruecklichter
  } else if (l === 3) {                                                               // Schrotthaufen von oben: uebereinander liegende Platten, Rohr, Zahnrad
    plate(-r * 0.2, -r * 0.05, r * 1.35, r * 0.8, -0.35, RD, RM); plate(r * 0.25, r * 0.28, r * 1.2, r * 0.62, 0.5, ST, SL); plate(-r * 0.1, -r * 0.45, r * 1.0, r * 0.55, 0.2, RM, RL); plate(r * 0.3, -r * 0.2, r * 0.65, r * 0.45, -0.6, '#8a8f98', SL);
    ctx.fillStyle = BK; pxLine(ctx, cx - r * 0.85, cy + r * 0.55, cx + r * 0.2, cy - r * 0.8, 3); ctx.fillStyle = '#9aa0a8'; pxLine(ctx, cx - r * 0.85, cy + r * 0.55, cx + r * 0.2, cy - r * 0.8, 1);           // Rohr
    disc(-r * 0.55, r * 0.5, r * 0.26, BK); disc(-r * 0.55, r * 0.5, r * 0.2, '#7a808a'); disc(-r * 0.55, r * 0.5, r * 0.08, BK);
    box(r * 0.55, -r * 0.55, g * 2, g * 2, YL);
  } else {                                                                            // Kiste von oben: Holzdeckel mit Latten, Metallecken, Strebe, Schablone
    box(-r - g, -r * 0.9 - g, r * 2 + 2 * g, r * 1.8 + 2 * g, BK); box(-r, -r * 0.9, r * 2, r * 1.8, WD); box(-r, -r * 0.9, r * 2, g, WL); box(-r, -r * 0.9, g, r * 1.8, WL);
    for (const u of [-0.5, 0, 0.5]) box(u * r - 1, -r * 0.9, 2, r * 1.8, '#4a3a20');                                                                                  // Latten
    ctx.fillStyle = '#4a3a20'; pxLine(ctx, cx - r * 0.9, cy - r * 0.8, cx + r * 0.9, cy + r * 0.8, 2);                                                                      // Strebe
    for (const [x, y] of [[-1, -0.9], [1, -0.9], [-1, 0.9], [1, 0.9]]) { box(x * r - (x < 0 ? 0 : r * 0.3), y * r - (y < 0 ? 0 : r * 0.3), r * 0.3, r * 0.3, ST); box(x * r - (x < 0 ? -r * 0.1 : r * 0.2), y * r - (y < 0 ? -r * 0.1 : r * 0.2), g, g, SL); }
    box(-r * 0.25, -r * 0.2, r * 0.5, r * 0.4, YL); box(-r * 0.2, -r * 0.14, r * 0.4, r * 0.28, WD); box(-r * 0.06, -r * 0.1, r * 0.12, r * 0.2, BK);
  }
  pxCracks(ctx, cx, cy, this.cracks, r, Math.ceil((1 - this.hp / this.maxHp) * this.cracks.length));
  ctx.restore();
};

// Deckung: trifft ein Geschoss (Kreis x, y, r) ein Hindernis? Dann bekommt es dmg Schaden und das Geschoss soll verschwinden (true)
function hitObstacle(x, y, r, dmg = 1) {
  for (const o of G.obstacles) {
    if (o.alive && circlesOverlap(x, y, r, o.x, o.y, o.r)) { o.enemyHits = (o.enemyHits || 0) + 1; o.hurt(dmg); return true; }       // enemyHits: wie viele Gegnerschüsse sie abgefangen hat (Tutorial)
  }
  return false;
}
// Explosion: alle Hindernisse im Radius bekommen dmg Schaden
function hurtObstaclesInRadius(x, y, rad, dmg) {
  for (const o of G.obstacles) if (o.alive && circlesOverlap(x, y, rad, o.x, o.y, o.r)) o.hurt(dmg);
}

// Schiebt eine Figur (Kreis mit Radius) aus allen Hindernissen heraus
function pushOutOfObstacles(e, radius) {
  for (const o of G.obstacles) {
    if (!o.alive) continue;
    const dx = e.x - o.x, dy = e.y - o.y, min = o.r + radius, d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d < 0.01) { e.x = o.x + min; continue; }
    e.x = o.x + dx / d * min;
    e.y = o.y + dy / d * min;
  }
}
