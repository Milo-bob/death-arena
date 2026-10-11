// PvP-Arena (Schritt 2 und 3): Kampf mit 2 bis 4 Spielern, jeder gegen jeden oder in zwei Teams. Jeder Spieler spielt sein NORMALES Spiel auf dem eigenen Geraet
// (eigener Spieler, ALLE Waffen, Abilities, Evolutionen, Meta-Upgrades, Held, Implants, Ausruestungsstufen ...); nur Gegner und Director fehlen.
// Jeder andere Spieler ist ein "Fernspieler": ein Enemy, der seine Position aus dem Netz bekommt (RemotePlayer in G.enemies). Dadurch treffen ALLE Waffen ihn wie einen Gegner.
//
//   Treffer: Angreifer rechnet (seine Waffen, Doppeltreffer, Schadensboost) und schickt 'hit' { to, n }. Der Getroffene wendet n ueber Player.hit an
//            (seine Ruestung, Max-Leben, Heldenwerte, Schildblase, Trefferpause ...).
//   Effekte: Rueckstoss und Betaeubung (Druckwelle, Schwarzes Loch, Frostring ...) wirken am Fernspieler nur als Verschiebung bzw. Betaeubung des Proxys; sie werden als
//            'fx' { to, dx, dy, st } an den echten Spieler weitergegeben (begrenzt, Betaeubung mit Schonfrist).
//   Bild:    ca. 10-15 Hz 'state' (Position, Richtung, Leben, Unsichtbarkeit, Schild) und alle eigenen Angriffe als Geisterbild: jeder Eintrag von G.attacks wird mit
//            seinen einfachen Feldern uebertragen und beim Empfaenger als Objekt derselben Klasse NUR GEZEICHNET (nie aktualisiert, ohne Schaden).
//   Ende:    wer stirbt, schickt 'dead' und schaut zu. Jeder gegen jeden: der Letzte gewinnt. Teams: das Team mit Ueberlebenden gewinnt. Verlaesst jemand die Lobby, gilt er als besiegt.

// Angriffsklassen, die als Geisterbild uebertragen werden (Name -> Klasse); fehlt eine, wird sie uebersprungen
function pvpAttackClasses() {
  const L = {}, add = (n, c) => { if (c) L[n] = c; };
  add('SwordSwing', typeof SwordSwing !== 'undefined' && SwordSwing); add('VortexRing', typeof VortexRing !== 'undefined' && VortexRing); add('Shot', typeof Shot !== 'undefined' && Shot);
  add('LanceThrust', typeof LanceThrust !== 'undefined' && LanceThrust); add('ImpulseWave', typeof ImpulseWave !== 'undefined' && ImpulseWave); add('Shield', typeof Shield !== 'undefined' && Shield);
  add('Pulse', typeof Pulse !== 'undefined' && Pulse); add('StunWave', typeof StunWave !== 'undefined' && StunWave); add('BlinkFlash', typeof BlinkFlash !== 'undefined' && BlinkFlash);
  add('DashTrail', typeof DashTrail !== 'undefined' && DashTrail); add('BeamAttack', typeof BeamAttack !== 'undefined' && BeamAttack); add('Ultimate', typeof Ultimate !== 'undefined' && Ultimate);
  add('Bloodburst', typeof Bloodburst !== 'undefined' && Bloodburst); add('PlasmaGrenade', typeof PlasmaGrenade !== 'undefined' && PlasmaGrenade); add('Bombard', typeof Bombard !== 'undefined' && Bombard);
  add('FirePatch', typeof FirePatch !== 'undefined' && FirePatch); add('ArcSlash', typeof ArcSlash !== 'undefined' && ArcSlash); add('GroundSlam', typeof GroundSlam !== 'undefined' && GroundSlam);
  add('Boomerang', typeof Boomerang !== 'undefined' && Boomerang); add('Molotov', typeof Molotov !== 'undefined' && Molotov); add('ChainLightning', typeof ChainLightning !== 'undefined' && ChainLightning);
  add('BlackHole', typeof BlackHole !== 'undefined' && BlackHole); add('Drone', typeof Drone !== 'undefined' && Drone); add('Storm', typeof Storm !== 'undefined' && Storm);
  add('OrbitBlades', typeof OrbitBlades !== 'undefined' && OrbitBlades); add('Rocket', typeof Rocket !== 'undefined' && Rocket); add('RiftTrail', typeof RiftTrail !== 'undefined' && RiftTrail);
  return L;
}
const PVP_SKIP = new Set(['player', 'lead', 'alive', 'damaging', 'touched', 'passed', 'hit', 'hitSet', 'targets', 'owner', 'ghost']);

class RemotePlayer extends Enemy {
  constructor(info) {
    super('circle', info.x, info.y, false);
    this.isRemote = true;
    this.name = info.name; this.pid = info.id; this.spr = 'player'; this.team = info.team; this.friendly = !!info.friendly; this.dead = false;
    this.hitsLeft = this.maxHits = 1e9;
    this.nx = info.x; this.ny = info.y; this.nd = info.dir || 0; this.vx = 0; this.vy = 0; this.at = G.realTime;
    this.hp = 100; this.mhp = 100; this.blink = false; this.shield = false;
    this.ghosts = []; this.ghostAt = G.realTime;                  // Angriffe des Gegners als reines Bild (kein Schaden)
    this.hitGap = 0; this.dieGap = 0;
    this.px = undefined; this.py = undefined; this.kx = 0; this.ky = 0; this.stq = 0; this.fxT = 0;          // Rueckstoss und Betaeubung, die andere Waffen hier bewirken
  }
  hasteFor() { return 1; }                             // damit SwordSwing-Geister laufen (sie fragen player.hasteFor)
  velAlong() { return 0; }
  has() { return false; }

  // Nur Bewegung aus dem Netz, keine KI. Der Treffer-Test steht hier wie bei jedem Gegner (Enemy.update fragt die Waffen ab).
  update(dt) {
    this.alive = true;
    const P = G.pvp, live = P && !P.over && !P.out && P.cd <= 0 && !this.dead && !this.friendly;
    // was andere Waffen seit dem letzten Bild mit diesem Gegner gemacht haben: verschoben (Rueckstoss, Sog) oder betaeubt
    if (this.px !== undefined && live) {
      this.kx += this.x - this.px; this.ky += this.y - this.py;
      if (this.stun > 0) this.stq = Math.max(this.stq, this.stun);
    }
    this.stun = 0;
    this.fxT -= dt;
    if (this.fxT <= 0 && live && (Math.hypot(this.kx, this.ky) > 1 || this.stq > 0)) {
      PvpMatch.send('fx', { to: this.pid, dx: Math.round(this.kx * 10) / 10, dy: Math.round(this.ky * 10) / 10, st: Math.round(this.stq * 100) / 100 });
      this.kx = this.ky = this.stq = 0; this.fxT = 1 / CFG.pvp.fxHz;
    }
    if (Math.hypot(this.kx, this.ky) > 120) this.kx = this.ky = 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hitGap = Math.max(0, this.hitGap - dt); this.dieGap = Math.max(0, this.dieGap - dt);
    const age = Math.min(0.3, G.realTime - this.at), f = framesOf(age);
    const tx = this.nx + this.vx * f, ty = this.ny + this.vy * f, k = Math.min(1, dt * 14);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    const dd = ((this.nd - this.dir + 540) % 360) - 180; this.dir += dd * Math.min(1, dt * 14);
    this.px = this.x; this.py = this.y;
    if (live && this.hitGap <= 0 && !this.blink) {
      const w = weaponHit(this.x, this.y, this.radius);
      if (w) this.takeHit(true, w.kind);
    }
  }

  // Ein Treffer: Einheiten wie bei einem Gegner (Doppeltreffer-Chance) mal Schadensboost, dann an diesen Spieler schicken
  takeHit(stun = true, src = null) {
    const P = G.pvp;
    if (!P || P.over || P.out || P.cd > 0 || this.hitGap > 0 || this.friendly || this.dead || this.blink) return;
    this.hitGap = CFG.pvp.hitGap;
    const n = this.hitUnits() * damageBoost();
    PvpMatch.send('hit', { to: this.pid, n: Math.round(n * 100) / 100, s: src || 'other' });
    this.hitFlash = 0.14;
    Juice.sparks(this.x, this.y, STYLE.pal.yellow, 4, 2.5);
    Sfx.play('hit');
    Cos2.hit(this.x, this.y);
    if (!PvpMatch.botSwap) G.addUlt(0.4 * n);                // Treffer laden das Ultimate (Kills gibt es im PvP nicht)
  }
  // Ultimate & Co. rufen die() auf: im PvP ein schwerer Treffer (hoechstens einmal pro Sekunde)
  die() {
    this.alive = true;
    const P = G.pvp;
    if (this.dieGap > 0 || !P || P.over || P.out || P.cd > 0 || this.friendly || this.dead || this.blink) return;
    this.dieGap = 1;
    PvpMatch.send('hit', { to: this.pid, n: CFG.pvp.dieUnits, s: 'ultimate' });
    this.hitFlash = 0.3; Juice.sparks(this.x, this.y, STYLE.pal.yellow, 8, 3.5); Sfx.play('killBig');
  }

  draw(ctx) {
    if (this.dead) return;
    const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, P = STYLE.pal, age = Math.min(0.3, G.realTime - this.ghostAt), fr = framesOf(age);
    for (const g of this.ghosts) PvpMatch.drawGhost(ctx, g, fr);
    if (this.cs) CoopMate.prototype.drawLook.call(this, ctx, cx, cy);                // Skin, Aura und Gear des Spielers (wie im Koop)
    else drawSprite(ctx, Cos.tinted(this.spr, this.friendly ? '' : 'hue-rotate(150deg)'), this.x, this.y, this.dir, CFG.player.size, { brightness: this.hitFlash > 0 ? 2 : 0, alpha: this.blink ? 0.18 : 1 });       // umgefaerbte Kopie statt Farbfilter in jedem Bild (haengt in Edge)
    if (this.cs && this.hitFlash > 0) drawSprite(ctx, Cos.tinted(this.spr, ''), this.x, this.y, this.dir, CFG.player.size, { brightness: 2, alpha: 0.5 });
    if (this.shield) { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = P.cyan; pxRing(ctx, cx, cy, 20, 1, 14, G.realTime); ctx.restore(); }
    if (this.friendly) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = P.cyan; pxRing(ctx, cx, cy, 14, 1, 10, G.realTime * 0.3); ctx.restore(); }
    // Name und Lebensbalken ueber dem Spieler (Gegner rot, Teamkameraden tuerkis)
    const w = 28, f = clamp(this.hp / Math.max(1, this.mhp), 0, 1), col = this.friendly ? P.cyan : P.red;
    ctx.save();
    ctx.fillStyle = P.greyDark; ctx.fillRect(Math.round(cx - w / 2) - 1, Math.round(cy - 24) - 1, w + 2, 5);
    ctx.fillStyle = f > 0.35 ? col : P.orange; ctx.fillRect(Math.round(cx - w / 2), Math.round(cy - 24), Math.round(w * f), 3);
    ctx.restore();
    uiText(ctx, this.name, cx, cy - 29, { size: STYLE.type.small, color: col, align: 'center' });
  }
}

// Der Spieler als Ziel fuer Bot-Angriffe: sieht fuer Waffen wie ein Gegner aus (Position, Radius, takeHit, Rueckstoss, Betaeubung), reicht alles an den echten Spieler weiter.
// Der Schaden wird nur vorgemerkt (q) und nach dem Angriffsbild des Bots angewendet, weil Player.hit waehrenddessen die Ausruestung des Bots statt deiner lesen wuerde.
class MeTarget extends Enemy {
  constructor(bot) {
    super('circle', 0, 0, false);
    this.bot = bot; this.isMeT = true; this.hitsLeft = this.maxHits = 1e9; this.hitGap = 0; this.dieGap = 0; this.q = []; this.blink = false; this.friendly = false; this.dead = false;
    const shove = (axis) => (v) => {
      const pl = G.player, P = G.pvp;
      if (!pl || !P || P.out || P.over || pl.shield || pl.blinkT > 0 || pl.dashLeft > 0) return;
      const m = CFG.pvp.maxPush, d = clamp(v - pl[axis], -m, m);
      const np = axis === 'x' ? clampToMap(pl.x + d, pl.y, 12) : clampToMap(pl.x, pl.y + d, 12);
      pl.x = np[0]; pl.y = np[1];
    };
    Object.defineProperties(this, {
      x: { get: () => G.player.x, set: shove('x'), configurable: true },
      y: { get: () => G.player.y, set: shove('y'), configurable: true },
      radius: { get: () => G.player.radius, set: () => {}, configurable: true },
    });
  }
  takeHit(stun = true, src = null) {
    const P = G.pvp;
    if (!P || P.over || P.out || P.cd > 0 || this.hitGap > 0) return;
    this.hitGap = CFG.pvp.hitGap;
    this.q.push(this.bot.hitUnits() * damageBoost());                       // Einheiten wie bei einem Gegner (Doppeltreffer, Schadensverstaerker des Bots)
  }
  die() { this.alive = true; if (this.dieGap > 0) return; this.dieGap = 1; this.q.push(CFG.pvp.dieUnits); }
  // nach dem Angriffsbild: vorgemerkten Schaden und Betaeubung auf den echten Spieler anwenden
  flush() {
    const pl = G.player, lv = this.bot.lv;
    for (const n of this.q) pl.hit('pvp', Math.min(CFG.pvp.maxUnits, n) * CFG.pvp.dmgMul * lv.dmg, this.bot.name);
    this.q = [];
    if (this.stun > 0) { if (!(pl.shield || pl.blinkT > 0 || pl.dashLeft > 0)) pl.pvpStun(Math.min(this.stun, CFG.pvp.maxStun)); this.stun = 0; }
  }
}

// Bot (DEV02): die KI laeuft nur auf dem Host-Geraet. Er spielt mit den ECHTEN Waffen: jeder Bot hat einen eigenen Player (`o`) mit Ausruestung aus einem der PvP-Sets
// (Waffen, Implant, Abilities -> Evolutionen), und Player.useWeapon laeuft mit Bot-Eingaben; die Angriffe landen in bot.attacks, werden dort aktualisiert und treffen
// alle Gegner der Bot-Mannschaft (Fernspieler, andere Bots, dich ueber MeTarget). Werte wie bei dir (Upgrades, Ausruestungsstufen, Held). Gaeste sehen Bot und Angriffe als Geisterbild.
// Nicht dabei: Ultimate, Bloodburst, aktive Abilities (der Bot hat nur Dash und Schildblase in eigener, einfacher Form).
const BOT_MELEE_REACH = { sword: 56, lance: 90, whip: 72, katana: 70, hammer: 56 };
class BotPlayer extends RemotePlayer {
  constructor(info) {
    super(info);
    this.isBot = true; this.lv = CFG.pvp.bot.levels[clamp(Pvp.botLevel | 0, 0, CFG.pvp.bot.levels.length - 1)];
    this.set = info.set || CFG.pvp.sets[0];
    this.items = { melee: this.set.melee, ranged: this.set.ranged, heavy: this.set.heavy, artifact: this.set.artifact };
    this.tag = this.set.name;
    this.close = this.set.id !== 'gunner';                                  // Nahkaempfer halten sich nah, der Gunner auf Abstand
    const o = this.o = new Player();
    o.slots = { weak: this.set.weak, medium: this.set.medium, strong: this.set.strong }; o.invincibleT = 0; o.aimAssist = (S) => this.aimFor();
    for (const id of Object.keys(CFG.evolutions.list)) {                      // Evolutionen: Waffe und Partner (Ability/Implant) passen
      const R = CFG.evolutions.list[id];
      if (o.evolved[R.slot] || this.items[R.slot] !== R.weapon) continue;
      if ((!R.needs.ability || o.has(R.needs.ability)) && (!R.needs.implant || this.items.artifact === R.needs.implant)) o.evolved[R.slot] = id;
    }
    this.meT = new MeTarget(this);
    this.attacks = []; this.heavyWait = 2; this.beamPh = 'idle'; this.beamT = 0; this.gearErr = 0;
    this.atkCd = 1; this.dashCd = 2; this.shieldCd = 3; this.shieldT = 0; this.dashT = 0; this.dashDir = 0; this.curTarget = null;
    this.side = Math.random() < 0.5 ? 1 : -1; this.sideT = 1 + Math.random() * 2;
  }
  // Gegner dieses Bots: Fernspieler und Bots anderer Mannschaften, dazu der echte Spieler (als MeTarget), wenn er nicht im Team des Bots ist
  hostile() {
    const P = G.pvp, out = [];
    for (const e of G.enemies) if (e.isRemote && e !== this && !e.dead && e.team !== this.team) out.push(e);
    if (!P.out && PvpMatch.teamOf(P.me) !== this.team) out.push(this.meT);
    return out;
  }
  aimFor() {
    const t = this.curTarget, o = this.o;
    return t ? dirTo(o.x, o.y, t.x, t.y) + (Math.random() * 2 - 1) * this.lv.aim : o.dir;
  }
  update(dt) {
    this.alive = true;
    const P = G.pvp;
    if (!P || this.dead) { this.attacks = []; return; }
    const C = CFG.pvp.bot, L = this.lv, I = { attack: false, beamHold: false, press: false };
    this.hitFlash = Math.max(0, this.hitFlash - dt); this.hitGap = Math.max(0, this.hitGap - dt); this.dieGap = Math.max(0, this.dieGap - dt); this.meT.hitGap = Math.max(0, this.meT.hitGap - dt); this.meT.dieGap = Math.max(0, this.meT.dieGap - dt);
    this.dashCd -= dt; this.shieldCd -= dt; this.dashT -= dt; this.shieldT -= dt; this.heavyWait -= dt;
    this.shield = this.shieldT > 0;
    if (!P.over && !P.out && P.cd <= 0 && this.hitGap <= 0) { const w = weaponHit(this.x, this.y, this.radius); if (w) this.takeHit(true, w.kind); }
    if (this.dead) { this.attacks = []; return; }
    let act = !(P.cd > 0 || P.over);
    if (this.stun > 0) { this.stun = Math.max(0, this.stun - dt); act = false; }
    if (act) this.think(dt, I);
    this.runGear(dt, I, act);
  }
  // Ziel waehlen, bewegen, ausweichen/schuetzen und die Eingaben fuer diesen Frame festlegen (I: attack/beamHold/press)
  think(dt, I) {
    const C = CFG.pvp.bot, L = this.lv, P = G.pvp, list = this.hostile();
    let best = null, bd = 1e9;
    for (const t of list) { const d = Math.hypot(t.x - this.x, t.y - this.y); if (d < bd) { bd = d; best = t; } }
    this.curTarget = best;
    if (this.dashT > 0) { const s = C.dashSpeed * framesOf(dt); this.x += fwdX(this.dashDir) * s; this.y += fwdY(this.dashDir) * s; [this.x, this.y] = clampToMap(this.x, this.y, 12); return; }
    const f = framesOf(dt) * C.speed * L.speed;
    if (!best) {                                                       // niemand mehr zu bekaempfen: die Mannschaft des Spielers begleiten
      const me = G.player, d = Math.hypot(me.x - this.x, me.y - this.y);
      if (PvpMatch.teamOf(P.me) === this.team && d > 90) { const w = dirTo(this.x, this.y, me.x, me.y); this.x += fwdX(w) * f; this.y += fwdY(w) * f; }
      return;
    }
    const d = bd, want = dirTo(this.x, this.y, best.x, best.y), reach = BOT_MELEE_REACH[this.items.melee] || 60;
    this.dir += (((want - this.dir + 540) % 360) - 180) * Math.min(1, dt * 8);
    this.sideT -= dt; if (this.sideT <= 0) { this.side = -this.side; this.sideT = 1 + Math.random() * 2; }
    // Ausweichen: ein Projektil der Gegner fliegt knapp heran -> seitlicher Dash
    if (this.dashCd <= 0 && Math.random() < L.dodge * dt * 8) {
      for (const a of G.attacks) {
        if (!a.alive || a.constructor.name !== 'Shot' || typeof a.x !== 'number') continue;
        if (Math.hypot(a.x - this.x, a.y - this.y) < 80) { this.dashDir = dirTo(this.x, this.y, a.x, a.y) + 90 * this.side; this.dashT = C.dashTime; this.dashCd = C.dashCd; Sfx.play('dash'); return; }
      }
    }
    if (this.shieldCd <= 0 && this.hp < this.mhp * 0.5 && d < 150 && Math.random() < L.shield * dt * 4) { this.shieldT = C.shieldTime; this.shieldCd = C.shieldCd; }
    // Bewegung: Nahkaempfer ran, Gunner auf Abstand; dazwischen seitlich laufen
    const prefer = this.close ? reach * 0.8 : 150;
    if (d > prefer + 25) { const a = want + (d > prefer + 90 ? 0 : 35 * this.side); this.x += fwdX(a) * f; this.y += fwdY(a) * f; }
    else if (!this.close && d < prefer - 40) { this.x -= fwdX(want) * f * 0.8; this.y -= fwdY(want) * f * 0.8; }
    else { this.x += fwdX(want + 90 * this.side) * f * 0.7; this.y += fwdY(want + 90 * this.side) * f * 0.7; }
    [this.x, this.y] = clampToMap(this.x, this.y, 12);
    // Eingaben: nah = Nahkampfwaffe, sonst Fernkampfwaffe; die starke Waffe nach Art
    const melee = d < reach + 22;
    this.o.weapon = melee ? WEAPON.SWORD : WEAPON.SHOT;
    I.attack = !this.shield && d < (melee ? reach + 22 : C.shootMax);
    const hv = this.items.heavy;
    if (hv === 'beam') {
      if (this.beamPh === 'idle' && this.heavyWait <= 0 && d > 60 && d < 300) { this.beamPh = 'hold'; this.beamT = 0.8 + Math.random() * 0.4; I.press = true; }
      if (this.beamPh === 'hold') { I.beamHold = true; this.beamT -= dt; if (this.beamT <= 0) { this.beamPh = 'idle'; this.heavyWait = 4; } }
    } else if (hv === 'firetrail') {
      const F = this.o.fire;
      if (!F.on && d < 220 && F.fuel >= CFG.fire.minStart) I.press = true; else if (F.on && (d > 320 || F.fuel < 0.1)) I.press = true;
    } else if (hv && this.heavyWait <= 0 && d < 260) { I.press = true; this.heavyWait = 0.8; }
  }
  // Angriffsbild: Player.useWeapon mit Bot-Eingaben und Bot-Ausruestung, danach die Angriffe des Bots aktualisieren und auf seine Gegner anwenden.
  // Eingaben, Save.equipped, Save.gearXp, G.attacks und G.enemies werden nur fuer diesen Aufruf ersetzt (try/finally).
  runGear(dt, I, act) {
    const o = this.o, P = G.pvp, f = framesOf(dt);
    o.x = this.x; o.y = this.y; o.dir = this.dir; o.stunT = this.stun; o.dashLeft = this.dashT > 0 ? 1 : 0; o.shield = this.shield ? { alive: true } : null;
    o.attackCd = Math.max(0, o.attackCd - dt / this.lv.react); o.reloadT = Math.max(0, o.reloadT - dt);
    if (this.gearErr > 5) { this.attacks = []; return; }
    const hostile = this.hostile(), S = { ad: Input.actDown, ap: Input.actPressed, eq: Save.equipped, gx: Save.gearXp, at: G.attacks, en: G.enemies };
    PvpMatch.botSwap = true;
    try {
      Input.actDown = (a) => a === 'attack' ? !!I.attack : a === 'beam' ? !!I.beamHold : false;
      Input.actPressed = (a) => a === 'beam' && !!I.press;
      Save.equipped = (slot) => this.items[slot] || null;
      Save.gearXp = () => {};
      G.attacks = this.attacks; G.enemies = hostile;
      if (act) Player.prototype.useWeapon.call(o, dt, f);
      for (const a of this.attacks) a.update(dt);
      for (const a of this.attacks) if (a.alive && a.damaging) for (const t of hostile) if (a.hitsCircle(t.x, t.y, t.radius)) t.takeHit(true, a.kind);
      this.attacks = this.attacks.filter((a) => a.alive);
    } catch (e) { this.gearErr++; this.attacks = []; if (this.gearErr === 1) console.warn('bot gear error', e); }
    finally { Input.actDown = S.ad; Input.actPressed = S.ap; Save.equipped = S.eq; Save.gearXp = S.gx; G.attacks = S.at; G.enemies = S.en; PvpMatch.botSwap = false; }
    this.meT.flush();
  }
  takeHit(stun = true, src = null) {
    const P = G.pvp;
    if (!P || P.over || P.cd > 0 || this.hitGap > 0 || this.dead || this.blink) return;
    this.hitGap = CFG.pvp.hitGap;
    const n = this.hitUnits() * damageBoost();
    this.hurt(n);
    if (!PvpMatch.botSwap) G.addUlt(0.4 * n);
  }
  die() { this.alive = true; if (this.dieGap > 0) return; this.dieGap = 1; this.hurt(CFG.pvp.dieUnits); }
  hurt(units) {
    if (this.dead || this.shield) { if (this.shield) { this.hitFlash = 0.1; Sfx.play('hit'); } return; }
    this.hp -= units * CFG.pvp.bot.hpPerUnit; this.hitFlash = 0.14;
    Juice.sparks(this.x, this.y, STYLE.pal.yellow, 4, 2.5); Sfx.play('hit'); Cos2.hit(this.x, this.y);
    if (this.hp <= 0) { this.hp = 0; Sfx.play('killBig'); this.attacks = []; PvpMatch.markDead(this.pid, ''); }
  }
  draw(ctx) {
    if (this.dead) return;
    for (const a of this.attacks) { try { a.draw(ctx); } catch (e) { /* ein Zeichenfehler darf das Bild nicht stoeren */ } }
    super.draw(ctx);
    uiText(ctx, this.tag, STAGE_W / 2 + this.x, STAGE_H / 2 - this.y + 22, { size: STYLE.type.small, color: STYLE.pal.grey, align: 'center' });
  }
}

const PvpMatch = {
  classes: null, bad: {},

  teamOf(id) { const p = G.pvp && G.pvp.players.find((q) => q.id === id); return p ? p.team : -1; },
  get remotes() { return G.enemies.filter((e) => e.isRemote); },
  remoteOf(id) { return G.enemies.find((e) => e.isRemote && e.pid === id) || null; },
  send(ev, payload) { if (Pvp.ch) Pvp.ch.send(ev, payload); },

  // Lobby -> Kampf. info = { mode: 'ffa' | 'teams', order: [Spieler-Ids] } (vom Host): Reihenfolge und Teams (Index gerade/ungerade = Team A/B) sind fuer alle gleich.
  begin(info) {
    const ch = Pvp.ch;
    if (!ch) return false;
    const order = (info && info.order && info.order.slice(0, CFG.pvp.maxPlayers)) || Pvp.players.slice(0, CFG.pvp.maxPlayers).map((p) => p.id);
    const nb = clamp((info && info.bots | 0) || 0, 0, Math.max(0, CFG.pvp.maxPlayers - order.length));             // Bots (DEV02): der Host rechnet sie, die Gaeste bekommen ihr Bild per 'bots'-Nachricht
    if (!order.includes(ch.id) || (order.length + nb < 2 && !Pvp.isDevLobby())) return false;
    const byId = {}; for (const p of Pvp.players) byId[p.id] = p;
    if (order.some((id) => !byId[id])) return false;
    const mode = info && info.mode === 'teams' ? 'teams' : 'ffa', C = CFG.pvp, n = order.length + nb;
    const players = order.map((id, i) => ({ id, name: byId[id].name, team: mode === 'teams' ? i % 2 : i }));
    const pool = CFG.pvp.sets.slice().sort(() => Math.random() - 0.5);
    for (let b = 0; b < nb; b++) { const i = order.length + b; players.push({ id: 'bot' + (b + 1), name: 'BOT ' + (b + 1), team: mode === 'teams' ? i % 2 : i, bot: true, set: pool[b % pool.length] }); }
    G.begin(false, false, 'pvp');
    // Startplaetze im Kreis, Teamkameraden nebeneinander; der Host (Index 0) beginnt links
    const spawn = players.slice().sort((a, b) => a.team - b.team || order.indexOf(a.id) - order.indexOf(b.id));
    spawn.forEach((p, i) => { const a = Math.PI + i * 2 * Math.PI / n; p.x = Math.cos(a) * C.spawnX; p.y = Math.sin(a) * C.spawnX; p.dir = dirTo(p.x, p.y, 0, 0); });
    const me = players.find((p) => p.id === ch.id);
    G.pvp = { over: false, result: null, endAt: 0, cd: C.countdown, sendT: 0, t0: G.realTime, escAt: 0, mode, rule: info && ['own', 'set', 'all'].includes(info.rule) ? info.rule : 'own', setId: info && info.rule === 'set' && info.setId ? info.setId : Save.data.pvpSet, players, me: ch.id, dead: {}, out: false, spec: 0, winTeam: null, gone: {}, lastSeen: {}, why: '', scored: false };
    CFG.map.halfW = C.camHalf[0]; CFG.map.halfH = C.camHalf[1];
    const P = G.player;
    P.x = me.x; P.y = me.y; P.dir = me.dir;
    G.cam = { x: 0, y: 0 };
    G.time = C.startTime; Loadout.updateByTime(G.time);
    // Waffenstufe wie im Kampf gegen Death: alle Bosse davor besiegt (leise, ohne Auswahl). Die Zeit der Siege zaehlt mit, denn die 3. und 4. Klinge
    // kommen nur, wenn ein Upgrade in ihr Zeitfenster faellt (Loadout.upgradeStats).
    const step = CFG.finalBoss.at / (C.weaponUps + 1);
    for (let i = 1; i <= C.weaponUps; i++) Loadout.upgradeStats(step * i + 0.5);
    this.applyLoadout(P);
    P.hp = P.maxHp;
    G.enemies = players.filter((p) => p.id !== ch.id).map((p) => new (p.bot && Pvp.isHost ? BotPlayer : RemotePlayer)({ set: p.set, x: p.x, y: p.y, dir: p.dir, name: p.name, id: p.id, team: p.team, friendly: mode === 'teams' && p.team === me.team }));
    G.enemies.forEach((e) => { e.dir = e.nd; });
    Pvp.say('');
    return true;
  },

  // Abilities aus der Lobby (Save.data.pvpLoadout: je Gruppe eine gekaufte Ability) und die Evolutionen, deren Waffe und Partner man hat
  applyLoadout(P) {
    const L = Pvp.loadout();
    P.slots = { weak: L.weak, medium: L.medium, strong: L.strong };
    P.owned = [L.weak, L.medium, L.strong].filter(Boolean);
    const E = CFG.evolutions;
    for (const id of Object.keys(E.list)) {
      const R = E.list[id];
      if (P.evolved[R.slot] || Save.equipped(R.slot) !== R.weapon) continue;
      if ((!R.needs.ability || P.has(R.needs.ability)) && (!R.needs.implant || Save.equipped('artifact') === R.needs.implant)) P.evolved[R.slot] = id;
    }
  },

  // ---- Netz -> Spiel ----
  onMessage(ev, p) {
    const P = G.pvp; if (!P || !p) return;
    if (ev === 'bots') {                                             // Gast: Bilder der Bots vom Host
      if (Pvp.isHost || !Array.isArray(p.l)) return;
      for (const b of p.l.slice(0, 3)) {
        const e = this.remoteOf(b.i); if (!e || e.isBot) continue;
        if (b.dd) { this.markDead(b.i, ''); continue; }
        e.nx = b.x; e.ny = b.y; e.nd = b.d; e.vx = 0; e.vy = 0; e.at = G.realTime; e.hp = b.hp; e.mhp = b.mh; e.blink = false; e.shield = !!b.sh;
        this.ghostsFrom(e, Array.isArray(b.a) ? b.a : []);
      }
      return;
    }
    const r = this.remoteOf(p.from);
    if (!r) return;
    if (ev === 'hit' && Pvp.isHost && typeof p.to === 'string' && p.to.startsWith('bot')) {          // ein Gast hat einen Bot getroffen
      const bot = this.remoteOf(p.to), n = Math.min(CFG.pvp.maxUnits, Math.max(0, +p.n || 0));
      if (bot && bot.isBot && n > 0) bot.hurt(n);
      return;
    }
    if (ev === 'state') {
      r.nx = p.x; r.ny = p.y; r.nd = p.d; r.vx = p.vx; r.vy = p.vy; r.at = G.realTime; r.hp = p.hp; r.mhp = p.mh;
      r.spr = p.spr || 'player'; r.blink = !!p.bl; r.shield = !!p.sh; if (p.cs && typeof p.cs === 'object') r.cs = p.cs;
      this.ghostsFrom(r, p.a || []);
      P.lastSeen[p.from] = G.realTime;
    } else if (ev === 'hit') {
      if (p.to !== P.me || P.over || P.out || P.cd > 0 || r.friendly || r.dead) return;
      const n = Math.min(CFG.pvp.maxUnits, Math.max(0, +p.n || 0));
      if (n > 0) G.player.hit('pvp', n * CFG.pvp.dmgMul, typeof p.sn === 'string' ? p.sn.slice(0, 14) : r.name);
    } else if (ev === 'fx') {
      if (p.to !== P.me || P.over || P.out || P.cd > 0 || r.friendly || r.dead) return;
      const pl = G.player;
      if (pl.shield || pl.blinkT > 0 || pl.dashLeft > 0) return;                            // Schildblase, Phase und Dash schuetzen vor Rueckstoss und Betaeubung
      let dx = +p.dx || 0, dy = +p.dy || 0; const m = Math.hypot(dx, dy);
      if (m > CFG.pvp.maxPush) { dx *= CFG.pvp.maxPush / m; dy *= CFG.pvp.maxPush / m; }
      if (m > 0) [pl.x, pl.y] = clampToMap(pl.x + dx, pl.y + dy, 12);
      if (+p.st > 0) pl.pvpStun(+p.st);
    } else if (ev === 'dead') {
      this.markDead(p.from, '');
    }
  },

  // ---- Angriffe des Gegners als Geisterbild ----
  snapshot(list = G.attacks) {
    if (!this.classes) this.classes = pvpAttackClasses();
    const out = [], rd = (v) => Math.round(v * 100) / 100, num = (v) => typeof v === 'number' && isFinite(v);
    const isPlain = (e) => e && typeof e === 'object' && !Array.isArray(e) && Object.keys(e).length <= 4 && Object.values(e).every(num);
    for (const a of list) {
      if (!a.alive || out.length >= CFG.pvp.maxGhosts) continue;
      const name = a.constructor.name;
      if (!this.classes[name]) continue;
      const f = {};
      for (const k of Object.keys(a)) {
        if (PVP_SKIP.has(k)) continue;
        const v = a[k], t = typeof v;
        if (t === 'number') { if (isFinite(v)) f[k] = rd(v); }
        else if (t === 'boolean' || (t === 'string' && v.length < 24)) f[k] = v;
        else if (Array.isArray(v) && v.length <= 24 && v.every((e) => num(e) || (Array.isArray(e) && e.length <= 4 && e.every(num)) || isPlain(e))) {
          f[k] = v.map((e) => (Array.isArray(e) ? e.map(rd) : num(e) ? rd(e) : Object.fromEntries(Object.entries(e).map(([kk, vv]) => [kk, rd(vv)]))));       // Zahlen, Zahlenlisten und kleine {x, y}-Punkte (Kettenblitz)
        }
      }
      out.push({ c: name, f });
    }
    return out;
  },
  ghostsFrom(r, list) {
    if (!this.classes) this.classes = pvpAttackClasses();
    r.ghosts = []; r.ghostAt = G.realTime;
    for (const a of list.slice(0, CFG.pvp.maxGhosts)) {
      const C = this.classes[a.c];
      if (!C || this.bad[a.c]) continue;
      const g = Object.create(C.prototype);
      Object.assign(g, a.f);
      g.player = r; g.alive = true; g.damaging = false; g.ghost = true;
      r.ghosts.push(g);
    }
  },
  drawBolts(ctx, list) {
    if (!list || !list.length) return;
    ctx.save(); ctx.fillStyle = STYLE.pal.orange;
    for (const b of list) ctx.fillRect(Math.round(STAGE_W / 2 + b.x) - 2, Math.round(STAGE_H / 2 - b.y) - 2, 4, 4);
    ctx.restore();
  },
  // Geisterbild zeichnen: nie aktualisieren; Geschosse und Klingen werden entlang ihrer Bewegung fortgeschrieben, ein Fehler sperrt nur diese Klasse
  drawGhost(ctx, g, fr) {
    const name = g.constructor.name;
    if (this.bad[name]) return;
    const x0 = g.x, y0 = g.y, d0 = g.dir;
    try {
      if (typeof g.speed === 'number' && typeof g.dir === 'number' && typeof g.x === 'number' && g.kind !== 'sword') { g.x += fwdX(g.dir) * g.speed * fr; g.y += fwdY(g.dir) * g.speed * fr; }
      if (g.kind === 'sword' && typeof g.degPerSec === 'number') g.dir += g.degPerSec * fr / FPS;
      g.draw(ctx);
    } catch (e) { this.bad[name] = String((e && e.message) || 'error'); }
    g.x = x0; g.y = y0; g.dir = d0;
  },

  // ---- Ablauf ----
  // pro Bild (aus G.updatePlay)
  update(dt) {
    const P = G.pvp, C = CFG.pvp;
    if (!P) return;
    if (P.over) { if (G.realTime - P.endAt > C.endDelay) { this.score(); G.mode = 'pvpend'; } return; }
    for (const pl of P.players) {                                  // wer ist noch da?
      if (pl.id === P.me || P.dead[pl.id] || pl.bot) continue;
      const present = Pvp.ch && Pvp.players.some((q) => q.id === pl.id);
      P.gone[pl.id] = present ? 0 : (P.gone[pl.id] || 0) + dt;
      if (P.gone[pl.id] > 1.5) this.markDead(pl.id, 'AN OPPONENT LEFT');
      else if (P.cd <= 0 && G.realTime - (P.lastSeen[pl.id] || P.t0) > 6) this.markDead(pl.id, 'AN OPPONENT LEFT');
      if (P.over) return;
    }
    if (P.cd > 0) { P.cd = Math.max(0, P.cd - dt); if (P.cd <= 0) P.startShown = G.realTime; }
    if (P.out) { this.spectate(); return; }
    P.sendT -= dt;
    if (P.sendT <= 0) {
      P.sendT = 1 / (P.players.length > 2 ? C.sendHzMany : C.sendHz);
      const pl = G.player, r1 = (v) => Math.round(v * 10) / 10;
      this.send('state', { x: r1(pl.x), y: r1(pl.y), d: r1(pl.dir), vx: r1(pl.velX || 0), vy: r1(pl.velY || 0), hp: Math.round(pl.hp), mh: Math.round(pl.maxHp),
        spr: Hero.sprite(), bl: pl.blinkT > 0 ? 1 : 0, sh: pl.shield ? 1 : 0, a: this.snapshot(), cs: (P.csN = (P.csN || 0) + 1) % 20 === 1 ? Coop.lookPack() : undefined });       // Cosmetics (Skin, Aura, Gear) nur alle 20 Pakete mitschicken
      if (Pvp.isHost && P.players.some((q) => q.bot)) {              // der Host schickt die Bots mit
        const r1b = (v) => Math.round(v * 10) / 10;
        this.send('bots', { l: this.remotes.filter((e) => e.isBot).map((e) => ({ i: e.pid, x: r1b(e.x), y: r1b(e.y), d: r1b(e.dir), hp: Math.round(e.hp), mh: Math.round(e.mhp), sh: e.shield ? 1 : 0, dd: e.dead ? 1 : 0, a: e.dead ? [] : this.snapshot(e.attacks) })) });
      }
    }
  },
  // Vor dem Start laeuft ein Zaehler: alle stehen still. true = dieses Bild nicht spielen
  frozen(dt) {
    const P = G.pvp;
    if (!P) return false;
    if (P.cd > 0) { this.update(dt); return P.cd > 0; }
    return false;
  },
  // Zuschauer: die Kamera folgt einem Spieler, der noch lebt (Leertaste / A / D wechselt)
  spectate() {
    const P = G.pvp, alive = this.remotes.filter((e) => !e.dead);
    if (!alive.length) return;
    if (Input.pressed('Space') || Input.pressed('ArrowRight') || Input.pressed('KeyD')) P.spec++;
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) P.spec += alive.length - 1;
    const t = alive[P.spec % alive.length];
    P.watching = t.name;
    G.player.x = t.x; G.player.y = t.y;
  },

  markDead(id, why) {
    const P = G.pvp;
    if (!P || P.dead[id]) return;
    P.dead[id] = true;
    const r = this.remoteOf(id); if (r) { r.dead = true; r.ghosts = []; }
    if (why && !P.why) P.why = why;
    this.check();
  },
  localDeath(why) {
    const P = G.pvp;
    if (!P || P.over || P.out) return;
    this.send('dead', {});
    P.dead[P.me] = true; P.out = true; G.attacks = []; G.player.hp = 0;
    Sfx.play('death'); Juice.shake(3);
    if (why) P.why = why;
    this.check();
    if (!P.over) G.notice('YOU ARE OUT - WATCH THE REST', STYLE.pal.orange);
  },
  // Rundenende: nur noch ein Spieler (jeder gegen jeden) bzw. ein Team uebrig
  check() {
    const P = G.pvp;
    if (!P) return;
    const alive = P.players.filter((p) => !P.dead[p.id]), teams = new Set(alive.map((p) => p.team));
    if (P.over) {                                                   // beide fast gleichzeitig: Unentschieden
      if (P.result === 'lose' && !alive.length && G.realTime - P.endAt < 0.6) { P.result = 'draw'; P.winTeam = null; }
      return;
    }
    if (teams.size > 1) return;
    const me = P.players.find((p) => p.id === P.me);
    if (!teams.size) this.finish('draw', null);
    else { const wt = [...teams][0]; this.finish(wt === me.team ? 'win' : 'lose', wt); }
  },
  finish(result, winTeam) {
    const P = G.pvp;
    if (!P || P.over) return;
    P.over = true; P.result = result; P.endAt = G.realTime; P.winTeam = winTeam;
    Sfx.play(result === 'win' ? 'levelUp' : 'death');
    Juice.shake(3);
  },
  // Punkte: alle Spieler des Siegerteams bekommen einen Punkt (einmal pro Runde)
  score() {
    const P = G.pvp;
    if (!P || P.scored) return;
    P.scored = true;
    if (P.winTeam === null || P.winTeam === undefined) return;
    Pvp.scores = Pvp.scores || {};
    for (const p of P.players) if (p.team === P.winTeam) Pvp.scores[p.id] = (Pvp.scores[p.id] || 0) + 1;
  },
  // ESC im Kampf: zweimal schnell = aufgeben bzw. (als Zuschauer) die Runde verlassen; eine Pause gibt es online nicht
  escape() {
    const P = G.pvp;
    if (!P || P.over) return;
    if (G.realTime - P.escAt < 1.6) {
      if (P.out) this.leaveMatch(); else this.localDeath('YOU GAVE UP');
    } else { P.escAt = G.realTime; G.notice(P.out ? 'PRESS ESC AGAIN TO LEAVE' : 'PRESS ESC AGAIN TO GIVE UP', STYLE.pal.orange); }
  },

  updateEnd() {
    if (Input.pressed('Space') || Input.pressed('Enter')) { Sfx.play('select'); this.leaveMatch(); }
  },
  leaveMatch() { G.pvp = null; G.mode = 'pvp'; if (Pvp.st === 'lobby') Pvp.sel = 0; },

  // ---- Anzeigen ----
  // Spieler-Leiste oben: Name, Punkte, ausgeschiedene Spieler grau; im Team-Modus Team A/B farbig
  drawBoard(ctx) {
    const P = G.pvp, T = STYLE.type, S = STYLE.pal, sc = Pvp.scores || {}, me = P.players.find((p) => p.id === P.me), w = 112, x0 = STAGE_W / 2 - P.players.length * w / 2;
    P.players.forEach((p, i) => {
      const mine = P.mode === 'teams' ? p.team === me.team : p.id === P.me, col = P.dead[p.id] ? S.greyMid : mine ? S.cyan : S.red, x = x0 + i * w + w / 2;
      uiText(ctx, p.name, x, 12, { size: T.small, color: col, align: 'center', maxW: w - 8 });
      uiText(ctx, (P.mode === 'teams' ? (p.team ? 'B' : 'A') + '  ' : '') + (sc[p.id] || 0) + (P.dead[p.id] ? '  OUT' : ''), x, 22, { size: T.small, color: col, align: 'center' });
    });
  },
  resultTexts() {
    const P = G.pvp, win = P.result === 'win', draw = P.result === 'draw';
    return { text: draw ? 'DRAW' : win ? (P.mode === 'teams' ? 'YOUR TEAM WINS!' : 'YOU WIN!') : (P.mode === 'teams' ? 'YOUR TEAM LOSES' : 'YOU LOSE'), col: draw ? STYLE.pal.ice : win ? STYLE.pal.green : STYLE.pal.red };
  },
  drawOverlay(ctx) {
    const P = G.pvp, T = STYLE.type, S = STYLE.pal;
    if (!P) return;
    this.drawBoard(ctx);
    if (P.cd > 0) uiText(ctx, String(Math.ceil(P.cd)), STAGE_W / 2, STAGE_H / 2 - 20, { size: T.title, color: S.yellow, align: 'center', glow: S.yellow });
    else if (P.startShown !== undefined && G.realTime - P.startShown < 0.8) uiText(ctx, 'FIGHT!', STAGE_W / 2, STAGE_H / 2 - 20, { size: T.h1, color: S.red, align: 'center' });
    if (P.out && !P.over) uiText(ctx, 'WATCHING ' + (P.watching || '') + '  [SPACE: NEXT]', STAGE_W / 2, STAGE_H - 24, { size: T.body, color: S.orange, align: 'center' });
    if (P.over) {
      const R = this.resultTexts();
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
      uiText(ctx, R.text, STAGE_W / 2, STAGE_H / 2, { size: T.title, color: R.col, align: 'center', glow: R.col });
      if (P.why) uiText(ctx, P.why, STAGE_W / 2, STAGE_H / 2 + 20, { size: T.body, color: S.grey, align: 'center' });
    }
  },
  // Ergebnis-Bildschirm nach dem Kampf (die Welt steht dahinter)
  drawEnd(ctx) {
    const P = G.pvp, T = STYLE.type, S = STYLE.pal;
    if (!P) return;
    ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
    const R = this.resultTexts();
    uiText(ctx, R.text, STAGE_W / 2, 100, { size: T.title, color: R.col, align: 'center', glow: R.col });
    if (P.why) uiText(ctx, P.why, STAGE_W / 2, 124, { size: T.body, color: S.grey, align: 'center' });
    this.drawBoard(ctx);
    uiText(ctx, 'BACK TO THE LOBBY [SPACE]', STAGE_W / 2, 250, { size: T.h2, color: S.cyan, align: 'center' });
    UIHit.add(STAGE_W / 2 - 110, 232, 220, 26, () => {}, { act: () => this.leaveMatch() });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'YOU WIN!': 'DU GEWINNST!', 'YOU LOSE': 'DU VERLIERST', 'DRAW': 'UNENTSCHIEDEN', 'FIGHT!': 'KAMPF!', 'AN OPPONENT LEFT': 'EIN GEGNER IST WEG', 'YOU GAVE UP': 'DU HAST AUFGEGEBEN',
  'PRESS ESC AGAIN TO GIVE UP': 'ESC NOCHMAL DRÜCKEN ZUM AUFGEBEN', 'PRESS ESC AGAIN TO LEAVE': 'ESC NOCHMAL DRÜCKEN ZUM VERLASSEN', 'BACK TO THE LOBBY [SPACE]': 'ZURÜCK ZUR LOBBY [LEERTASTE]',
  'YOUR TEAM WINS!': 'DEIN TEAM GEWINNT!', 'YOUR TEAM LOSES': 'DEIN TEAM VERLIERT', 'YOU ARE OUT - WATCH THE REST': 'DU BIST RAUS - SCHAU DEN REST AN', 'OUT': 'RAUS',
});
