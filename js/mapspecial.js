// Kartenspezifisches (nur Ember Foundry und Toxic Core): Giftwolke, Spawn der Gegner-Varianten.
// Zahlen: CFG.cloud, CFG.variants (config.js, Abschnitt Gegner), Karten-Zuordnung in CFG.maps (foes, trim, bossOrder), Bosse in CFG.boss (forge, colossus, spore, plague).

// Giftwolke: Warnring, dann Gefahrenzone. Gegner-Wolken liegen in G.shots (verschwinden im Bosskampf und bei Ultimate/Bloodburst), Boss-Wolken in G.bossShots (nur im Bosskampf).
class ToxicCloud {
  constructor(x, y, boss = false) {
    this.x = x; this.y = y;
    this.boss = boss;
    this.alive = true;
    this.age = 0;
    this.life = boss ? CFG.cloud.bossLife : CFG.cloud.life;
  }
  update(dt) {
    if (this.boss ? !G.bossFight : (G.bossFight || G.clearing)) { this.alive = false; return; }
    const C = CFG.cloud;
    this.age += dt;
    if (this.age >= C.warn + this.life) { this.alive = false; return; }
    if (this.age >= C.warn && circlesOverlap(this.x, this.y, C.radius, G.player.x, G.player.y, G.player.radius)) G.player.hit('touch', C.dmg * (this.boss ? bossPower().dmg : 1), 'TOXIC CLOUD');
  }
  draw(ctx) {
    const C = CFG.cloud, P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    ctx.save();
    if (this.age < C.warn) {                                              // Warnung: Ring wächst zusammen
      const k = this.age / C.warn;
      ctx.fillStyle = P.green; ctx.globalAlpha = 0.9; pxRing(ctx, cx, cy, C.radius, 1, 18, 0);
      ctx.globalAlpha = 0.3 + 0.3 * k; pxRing(ctx, cx, cy, C.radius * k, 1);
    } else {
      const left = (C.warn + this.life - this.age) / this.life, fade = Math.min(1, left * 4), t = G.realTime;
      ctx.fillStyle = P.green; ctx.globalAlpha = 0.22 * fade; pxDisc(ctx, cx, cy, C.radius);
      ctx.globalAlpha = 0.85 * fade; pxRing(ctx, cx, cy, C.radius, 1, 20, t * 0.15);
      ctx.fillStyle = P.ice; ctx.globalAlpha = 0.7 * fade;                 // aufsteigende Blasen
      for (let i = 0; i < 6; i++) {
        const a = i * 1.9 + this.x, rr = C.radius * 0.7 * (0.3 + ((i * 0.37 + t * 0.4) % 1) * 0.7);
        ctx.fillRect(Math.round((cx + Math.cos(a) * rr) / PIXEL) * PIXEL, Math.round((cy + Math.sin(a) * rr * 0.6 - ((t * 14 + i * 9) % 12)) / PIXEL) * PIXEL, PIXEL, PIXEL);
      }
    }
    ctx.restore();
  }
}

// Wolke setzen (begrenzt, damit die Karte nicht zuwächst). boss = Boss-Wolke
function dropCloud(x, y, boss = false) {
  const list = boss ? G.bossShots : G.shots;
  if (list.filter((s) => s instanceof ToxicCloud && s.alive).length >= CFG.cloud.maxActive) return;
  list.push(new ToxicCloud(...clampToMap(x, y, CFG.cloud.radius * 0.6), boss));
}
