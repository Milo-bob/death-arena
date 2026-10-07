// XP im Lauf (Zahlen und Perks: CFG.xp in config.js, Abschnitt [9b]).
// Besiegte Gegner lassen XP-Kugeln (XpOrb) fallen, die zum Spieler fliegen. Genug XP = Level-up: das Spiel pausiert (Modus 'pick', Art 'xp') und man wählt
// 1 von 3 Perks, die nur für diesen Lauf gelten und sich stapeln. Zwischen den Bossen gibt es so Fortschritt; die Boss-Belohnungen (Waffen-Upgrade, Ability, Evolution) bleiben.
// Die Perks wirken über Xp.val(id, key) an den passenden Stellen (player.js, enemies.js, game.js). Im Tutorial gibt es keine XP.

class XpOrb {
  constructor(x, y, value) {
    this.x = x; this.y = y; this.value = value;
    this.alive = true; this.age = 0; this.homing = false; this.hs = 0;
    const a = rand(0, 6.28), s = rand(0.6, 1.8);                 // kleiner Sprung beim Fallenlassen
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
  }

  update(dt) {
    const C = CFG.xp.orb, p = G.player, f = framesOf(dt);
    this.age += dt;
    this.x += this.vx * f; this.y += this.vy * f;
    const damp = Math.pow(0.88, f); this.vx *= damp; this.vy *= damp;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (!this.homing && this.age > C.delay && (d < C.range * pickupRange() || this.age > C.life)) this.homing = true;       // nah genug (Sog) oder zu alt: fliegt von selbst zum Spieler
    if (this.homing && d > 0.5) {
      this.hs = Math.min(C.maxSpeed, (this.hs || C.speed) + C.accel * f);
      const k = Math.min(this.hs * f, d) / d;
      this.x += (p.x - this.x) * k; this.y += (p.y - this.y) * k;
    }
    if (d < p.radius + C.grab) {
      Xp.add(this.value);
      Sfx.play('xpGet');
      this.alive = false;
    }
  }

  draw(ctx) {
    const P = STYLE.pal, big = this.value >= 8 ? 2 : this.value >= 2.5 ? 1 : 0, col = big === 2 ? P.yellow : big === 1 ? P.teal : P.cyan;
    const bob = Math.sin(G.realTime * 6 + this.x * 0.1), cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y + bob, r = 1 + big;
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.fillStyle = col; pxGlow(ctx, cx, cy, 5 + big * 2);
    ctx.globalAlpha = 1; ctx.fillStyle = col;
    for (let j = -r; j <= r; j++) { const w = r - Math.abs(j); ctx.fillRect(Math.round((cx - w * PIXEL) / PIXEL) * PIXEL, Math.round((cy + j * PIXEL) / PIXEL) * PIXEL, (2 * w + 1) * PIXEL, PIXEL); }       // Raute aus Pixeln
    ctx.fillStyle = P.white; pxFill(ctx, cx, cy);
    ctx.restore();
  }
}

const Xp = {
  level: 1, xp: 0, total: 0, pending: 0, perks: {}, shown: 0, flash: 0, wait: 0,

  get on() { return !Tutorial.active; },
  reset() { this.level = 1; this.xp = 0; this.total = 0; this.pending = 0; this.perks = {}; this.shown = 0; this.flash = 0; this.wait = 0; },
  need() { return CFG.xp.base + CFG.xp.step * this.level; },
  stacks(id) { return this.perks[id] || 0; },
  // Gesamtwirkung eines Perks (Stapel mal Wert je Stapel, key = Feld in CFG.xp.perks[id], Standard 'per')
  val(id, key = 'per') { return (this.perks[id] || 0) * (CFG.xp.perks[id][key] || 0); },

  // XP, die ein besiegter Gegner gibt (Minions und Wiederbelebte nichts, damit man sie nicht farmen kann)
  valueOf(e) {
    const C = CFG.xp.value;
    if (e.minion || e.raised) return 0;
    if (e.splitlet) return C.splitlet;
    if (e.mini) return C.mini;
    if (e.elite) return C.elite;
    if (e.type === 'tank') return C.tank;
    return HEAVY.includes(e.type) ? C.heavy : C.normal;
  },
  drop(e) {
    if (!this.on) return;
    const v = this.valueOf(e) * Hero.mods().xp * Perk.mul('xpMul');       // Held-Modifier (Harbinger: mehr XP)
    if (v > 0) this.spawn(e.x, e.y, v);
  },
  // Kugel erzeugen; bei zu vielen verschmilzt sie mit der nächsten der letzten 30
  spawn(x, y, v) {
    const list = G.xpOrbs;
    if (list.length >= CFG.xp.orb.cap) {
      let best = null, bd = Infinity;
      for (let i = Math.max(0, list.length - 30); i < list.length; i++) { const o = list[i], d = dist2(o.x, o.y, x, y); if (o.alive && d < bd) { bd = d; best = o; } }
      if (best) { best.value += v; return; }
    }
    list.push(new XpOrb(x, y, v));
  },

  add(n) {
    if (!this.on || !(n > 0)) return;
    this.xp += n; this.total += n;
    let up = false;
    while (this.xp >= this.need()) { this.xp -= this.need(); this.level++; this.pending++; up = true; }
    if (up) {
      this.flash = 1; this.shown = 0;
      Sfx.play('levelUp');
      G.trigger('LEVEL ' + this.level + '!', STYLE.pal.cyan, { flash: 0.15, radius: 80, rings: 2 });
    }
  },
  // Boss besiegt: XP direkt, die Level-up-Wahl kommt erst nach den Boss-Belohnungen
  bossDefeated() {
    if (!this.on) return;
    this.add(CFG.xp.value.boss);
    this.wait = 1.6;
  },

  // Jedes Bild im Spiel: Balken gleitet, aufgeschobene Level-ups anbieten (nicht im Bosskampf, nicht während Ultimate/Dash, nicht mitten in einer anderen Wahl)
  update(dt) {
    if (!this.on) return;
    this.shown += (this.xp / this.need() - this.shown) * Math.min(1, dt * 12);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.wait = Math.max(0, this.wait - dt);
    const p = G.player;
    if (this.pending > 0 && this.wait <= 0 && G.mode === 'play' && !G.bossFight && !G.intro && !(G.victory > 0) && p.canMove !== 0 && p.hp > 0) this.offer();
  },

  // 3 verschiedene Perks, die noch nicht am Limit sind (sind alle am Limit: kleine Heilung statt Wahl)
  offer() {
    const P = CFG.xp.perks;
    let ids = Object.keys(P).filter((id) => this.stacks(id) < P[id].max);
    this.pending--;
    if (!ids.length) { G.player.heal(G.player.maxHp * 0.25); G.notice('ALL PERKS MAXED - HEALED', STYLE.pal.green); return; }
    for (let i = ids.length - 1; i > 0; i--) { const j = randInt(0, i); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    ids = ids.slice(0, 3);
    G.pick = { kind: 'xp', tier: null, ids, sel: 0, age: 0, level: this.level };
    G.mode = 'pick';
  },
  choose(id) {
    const P = CFG.xp.perks[id], p = G.player;
    this.perks[id] = this.stacks(id) + 1;
    if (id === 'health') p.hp = Math.min(p.maxHp, p.hp + P.hp);
    if (id === 'tune') Loadout.tune();
    G.notice(P.name + '  ' + this.stacks(id) + '/' + P.max, STYLE.pal.cyan);
    Sfx.play('upgrade');
    this.wait = CFG.xp.offerDelay;
  },

  // Kurztext der Wirkung eines Stapels (Karte im Level-up)
  effectText(id) {
    const P = CFG.xp.perks[id], pc = (v) => Math.round(v * 100) + '%';
    switch (id) {
      case 'power': return '+' + pc(P.chance) + ' DOUBLE HITS, +' + pc(P.boss) + ' BOSS DAMAGE';
      case 'rapid': return '+' + pc(P.per) + ' ATTACK SPEED';
      case 'speed': return '+' + pc(P.per) + ' MOVE SPEED';
      case 'health': return '+' + P.hp + ' MAX HEALTH';
      case 'regen': return '+' + P.per + ' HEALTH PER SECOND';
      case 'armor': return '-' + pc(P.per) + ' DAMAGE TAKEN';
      case 'magnet': return '+' + pc(P.per) + ' PICKUP RANGE';
      case 'charge': return '+' + pc(P.per) + ' ULTIMATE CHARGE';
      case 'cooldown': return '+' + pc(P.per) + ' COOLDOWN SPEED';
      case 'luck': return '+' + pc(P.per) + ' DROP CHANCE';
      case 'leech': return '+' + P.per + ' HEALTH PER KILL';
      case 'recovery': return '+' + P.per + ' S INVULNERABILITY AFTER A HIT';
      default: return '';
    }
  },

  // XP-Balken oben über die ganze Breite, links "LV n" (bei aufgeschobenem Level-up "LEVEL UP READY" blinkend)
  drawHud(ctx) {
    if (!this.on) return;
    const P = STYLE.pal, T = STYLE.type, W = STAGE_W, h = 4, frac = clamp(this.shown, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.fillStyle = P.void; ctx.fillRect(0, 0, W, h);
    ctx.globalAlpha = 1; ctx.fillStyle = this.flash > 0 && Math.floor(G.realTime * 16) % 2 === 0 ? P.white : P.cyan;
    ctx.fillRect(0, 0, Math.round(W * frac), h - 1);
    ctx.fillStyle = P.cyanDark; ctx.fillRect(0, h - 1, W, 1);
    ctx.globalAlpha = 0.5; ctx.fillStyle = P.void; for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(W * i / 10), 0, 1, h);
    ctx.restore();
    uiText(ctx, 'LV ' + this.level, 4, 14, { size: T.small, color: P.cyan });
    if (this.pending > 0) { ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.realTime * 8); uiText(ctx, 'LEVEL UP READY', 34, 14, { size: T.small, color: P.yellow }); ctx.restore(); }
  },

  // Pausenmenü: gewählte Perks rechts neben dem Menü
  drawPause(ctx) {
    const P = STYLE.pal, T = STYLE.type, ids = Object.keys(CFG.xp.perks).filter((id) => this.stacks(id) > 0);
    if (!this.on) return;
    const x = 386, w = 92;
    uiText(ctx, 'LEVEL ' + this.level, x, 112, { size: T.small, color: P.cyan });
    uiBar(ctx, x, 116, w - 6, 4, clamp(this.xp / this.need(), 0, 1), P.cyan);
    if (!ids.length) { uiText(ctx, 'NO PERKS YET', x, 134, { size: T.small, color: P.greyMid }); return; }
    ids.forEach((id, i) => {
      const y = 128 + i * 13, K = CFG.xp.perks[id];
      drawIcon(ctx, K.icon, x + 6, y + 5, 11, 1);
      uiText(ctx, uiFit(ctx, K.name, w - 34, T.small), x + 15, y + 8, { size: T.small, color: P.ice });
      uiText(ctx, 'x' + this.stacks(id), x + w - 6, y + 8, { size: T.small, color: this.stacks(id) >= K.max ? P.yellow : P.grey, align: 'right' });
    });
  },
};

// Waffen-Perks (CFG.items.perks): gelten nur, solange die Nahkampf-/Fernkampfwaffe im Slot gerade gewaehlt ist (Taste 1 / 2)
const Perk = {
  cur() {
    const p = G.player;
    if (!p || Tutorial.active) return null;
    return CFG.items.perks[Save.equipped(p.weapon === WEAPON.SWORD ? 'melee' : 'ranged')] || null;
  },
  mul(k) { const c = this.cur(); return c && c[k] ? c[k] : 1; },
  add(k) { const c = this.cur(); return c && c[k] ? c[k] : 0; },
  // Pro Kill: Core-Chance und Abklingzeit-Abzug (nicht fuer Minions, Wiederbelebte, Splitter-Kleine, damit man damit nicht farmen kann)
  onKill(e) {
    if (e.minion || e.raised || e.splitlet) return;
    if (Math.random() < this.add('coreChance')) { G.lootCores += 1; Juice.sparks(e.x, e.y, STYLE.pal.yellow, 5); }
    const cd = this.add('cdOnKill');
    if (cd > 0) {
      const p = G.player;
      for (const k of Object.keys(p.cds)) p.cds[k] = Math.max(0, p.cds[k] - cd);
      p.dashCd = Math.max(0, p.dashCd - cd); p.shieldCd = Math.max(0, p.shieldCd - cd);
    }
  },
};
