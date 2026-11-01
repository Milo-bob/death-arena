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
    this.scrap = C.style === 'scrap'; this.look = randInt(0, 3);                          // look: Reifenstapel / Fass / Autowrack / Schrotthaufen
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

// Schrotthaufen der Karte 6 (Scrapyard): vier Looks, rostig statt grau. Gleiche Groesse und Kollision wie eine Barrikade.
Obstacle.prototype.drawScrap = function (ctx) {
  const P = STYLE.pal, g = PIXEL, cx = Math.round((STAGE_W / 2 + this.x) / g) * g, cy = Math.round((STAGE_H / 2 - this.y) / g) * g;
  const k = Math.min(1, this.age / 0.35), r = this.r * (0.6 + 0.4 * k), ghost = G.player && G.player.blinkT > 0, f = this.flash > 0;
  const RD = '#6a3418', RM = '#b0622c', RL = '#f09a50', ST = '#7a808a', SL = '#c4cad2', BK = '#15110d';
  const box = (x, y, w, h, col) => { ctx.fillStyle = f ? P.white : col; ctx.fillRect(Math.round((cx + x) / g) * g, Math.round((cy + y) / g) * g, Math.max(g, Math.round(w / g) * g), Math.max(g, Math.round(h / g) * g)); };
  ctx.save(); ctx.globalAlpha = (ghost ? 0.35 : 1) * k;
  box(-r, r * 0.55, r * 2, 3, BK);                                                   // Schatten
  if (this.look === 0) {                                                             // Reifenstapel
    for (let i = 0; i < 3; i++) { const y = r * 0.35 - i * r * 0.62; box(-r * 0.95, y, r * 1.9, r * 0.6, BK); box(-r * 0.75, y + 2, r * 1.5, r * 0.4, i % 2 ? '#4a4a54' : '#5c5c68'); box(-r * 0.3, y + 3, r * 0.6, r * 0.2, '#6b6f78'); }
  } else if (this.look === 1) {                                                      // Oelfass
    box(-r * 0.7, -r * 0.9, r * 1.4, r * 1.8, RD); box(-r * 0.6, -r * 0.8, r * 1.2, r * 1.6, RM); box(-r * 0.6, -r * 0.35, r * 1.2, 3, RD); box(-r * 0.6, r * 0.3, r * 1.2, 3, RD); box(-r * 0.6, -r * 0.8, r * 1.2, 3, RL); box(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4, P.yellow);
  } else if (this.look === 2) {                                                      // Autowrack (Draufsicht-Block)
    box(-r, -r * 0.55, r * 2, r * 1.1, RD); box(-r * 0.9, -r * 0.45, r * 1.8, r * 0.9, RM); box(-r * 0.45, -r * 0.35, r * 0.9, r * 0.7, ST); box(-r * 0.35, -r * 0.25, r * 0.7, r * 0.2, SL); box(-r * 0.9, -r * 0.45, 3, r * 0.9, RL); box(r * 0.55, -r * 0.5, 3, 3, P.yellow);
  } else {                                                                           // Schrotthaufen: Platten, Trager, Rohr
    box(-r * 0.9, r * 0.05, r * 1.8, r * 0.55, RD); box(-r * 0.7, -r * 0.45, r * 1.2, r * 0.6, ST); box(-r * 0.5, -r * 0.8, r * 0.9, r * 0.45, RM); box(-r * 0.3, -r * 0.55, r * 1.1, 3, SL);
    box(r * 0.45, -r * 0.95, 3, r * 1.1, '#6b6f78'); box(-r * 0.85, -r * 0.2, 3, r * 0.5, RL);
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
