// Helden: ausgewaehlter Held (Save.heroSelected), sein Run-Modifier und sein Artefakt (Zahlen in CFG.heroes, CFG.fortress/rift/chrono).
// Im Tutorial gelten nur Aussehen, kein Modifier und kein Artefakt (damit die Lektionen immer gleich bleiben).

// cores = Faktor auf die Cores eines Laufs, xp = Faktor auf XP-Kugeln, luck = Faktor auf die Drop-Chance
const HERO_NEUTRAL = { hp: 0, speed: 1, atk: 1, ult: 1, startUlt: 0, dmgTaken: 1, cores: 1, xp: 1, luck: 1 };
// World = Run-Modifier, der die Gegnerwelt veraendert (Harbinger): rate / allRate = Faktor auf die Wartezeiten (kleiner = mehr Gegner), cap = Faktor auf die Obergrenzen,
// hits / speed = Faktor auf Leben und Tempo aller Gegner, bossHp = Faktor auf Boss-Leben, types = pro Gegnertyp { hits, speed, wait } (wait = Faktor auf die Wartezeit dieses Typs)
const HERO_WORLD_NEUTRAL = { rate: 1, allRate: 1, cap: 1, hits: 1, speed: 1, bossHp: 1, types: {} };
const HERO_TYPE_NEUTRAL = { hits: 1, speed: 1, wait: 1 };

const Hero = {
  id() { return Save.heroSelected(); },
  cfg() { return CFG.heroes[this.id()]; },
  // Sprite eines Helden (Standard: der ausgewaehlte). Mit Skin: Cos.sprite(Hero.sprite(), 'skin')
  sprite(id) { return CFG.heroes[id || this.id()].sprite; },
  live() { return !(typeof Tutorial !== 'undefined' && Tutorial.active); },
  mods() { return this.live() ? Object.assign({}, HERO_NEUTRAL, this.cfg().mod) : HERO_NEUTRAL; },
  world() { return this.live() && this.cfg().mod.world ? Object.assign({}, HERO_WORLD_NEUTRAL, this.cfg().mod.world) : HERO_WORLD_NEUTRAL; },
  type(t) { const W = this.world(); return W.types[t] ? Object.assign({}, HERO_TYPE_NEUTRAL, W.types[t]) : HERO_TYPE_NEUTRAL; },
  artifact() { return this.live() ? this.cfg().artifact || null : null; },
};

// Rift Step: kurze helle Spur zwischen Start und Ziel
class RiftTrail {
  constructor(x0, y0, x1, y1) { this.kind = 'rift'; this.damaging = false; this.alive = true; this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1; this.age = 0; }
  update(dt) { this.age += dt; if (this.age >= 0.3) this.alive = false; }
  hitsCircle() { return false; }
  draw(ctx) {
    const t = this.age / 0.3, P = STYLE.pal, ox = STAGE_W / 2, oy = STAGE_H / 2;
    ctx.save();
    ctx.globalAlpha = 1 - t; ctx.fillStyle = P.ice;
    pxLine(ctx, ox + this.x0, oy - this.y0, ox + this.x1, oy - this.y1);
    ctx.globalAlpha = (1 - t) * 0.5; ctx.fillStyle = P.cyan;
    pxLine(ctx, ox + this.x0 + 2, oy - this.y0 + 2, ox + this.x1 + 2, oy - this.y1 + 2);
    ctx.restore();
  }
}
