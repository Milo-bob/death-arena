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
    G.addUlt(0.4 * n);                                       // Treffer laden das Ultimate (Kills gibt es im PvP nicht)
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
    drawSprite(ctx, this.spr, this.x, this.y, this.dir, CFG.player.size, { hue: this.friendly ? 0 : 150, brightness: this.hitFlash > 0 ? 2 : 0, alpha: this.blink ? 0.18 : 1 });
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
    if (!order.includes(ch.id) || order.length < 2) return false;
    const byId = {}; for (const p of Pvp.players) byId[p.id] = p;
    if (order.some((id) => !byId[id])) return false;
    const mode = info && info.mode === 'teams' ? 'teams' : 'ffa', C = CFG.pvp, n = order.length;
    const players = order.map((id, i) => ({ id, name: byId[id].name, team: mode === 'teams' ? i % 2 : i }));
    G.begin(false, false, 'pvp');
    // Startplaetze im Kreis, Teamkameraden nebeneinander; der Host (Index 0) beginnt links
    const spawn = players.slice().sort((a, b) => a.team - b.team || order.indexOf(a.id) - order.indexOf(b.id));
    spawn.forEach((p, i) => { const a = Math.PI + i * 2 * Math.PI / n; p.x = Math.cos(a) * C.spawnX; p.y = Math.sin(a) * C.spawnX; p.dir = dirTo(p.x, p.y, 0, 0); });
    const me = players.find((p) => p.id === ch.id);
    G.pvp = { over: false, result: null, endAt: 0, cd: C.countdown, sendT: 0, t0: G.realTime, escAt: 0, mode, players, me: ch.id, dead: {}, out: false, spec: 0, winTeam: null, gone: {}, lastSeen: {}, why: '', scored: false };
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
    G.enemies = players.filter((p) => p.id !== ch.id).map((p) => new RemotePlayer({ x: p.x, y: p.y, dir: p.dir, name: p.name, id: p.id, team: p.team, friendly: mode === 'teams' && p.team === me.team }));
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
    const r = this.remoteOf(p.from);
    if (!r) return;
    if (ev === 'state') {
      r.nx = p.x; r.ny = p.y; r.nd = p.d; r.vx = p.vx; r.vy = p.vy; r.at = G.realTime; r.hp = p.hp; r.mhp = p.mh;
      r.spr = p.spr || 'player'; r.blink = !!p.bl; r.shield = !!p.sh;
      this.ghostsFrom(r, p.a || []);
      P.lastSeen[p.from] = G.realTime;
    } else if (ev === 'hit') {
      if (p.to !== P.me || P.over || P.out || P.cd > 0 || r.friendly || r.dead) return;
      const n = Math.min(CFG.pvp.maxUnits, Math.max(0, +p.n || 0));
      if (n > 0) G.player.hit('pvp', n * CFG.pvp.dmgMul, r.name);
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
  snapshot() {
    if (!this.classes) this.classes = pvpAttackClasses();
    const out = [], rd = (v) => Math.round(v * 100) / 100, num = (v) => typeof v === 'number' && isFinite(v);
    const isPlain = (e) => e && typeof e === 'object' && !Array.isArray(e) && Object.keys(e).length <= 4 && Object.values(e).every(num);
    for (const a of G.attacks) {
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
      if (pl.id === P.me || P.dead[pl.id]) continue;
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
        spr: Hero.sprite(), bl: pl.blinkT > 0 ? 1 : 0, sh: pl.shield ? 1 : 0, a: this.snapshot() });
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
