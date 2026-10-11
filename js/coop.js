// Koop-Lauf (PLAY > MULTIPLAYER > CO-OP): bis zu 4 Spieler spielen gemeinsam einen Lauf auf einer der vier Standardkarten (Karte 1.7x so gross, Zahlen in CFG.coop).
// Lobby und Verbindung sind dieselben wie in der PvP-Arena (pvp.js, net.js).
//
//   Host   rechnet die ganze Welt wie im normalen Spiel (Director, Gegner, Bosse, Geschosse, Gefahren). Gegner und Bosse zielen auf den naechsten Spieler;
//          Treffer auf Mitspieler (touchesPlayer, playersList in enemies.js) gehen als 'chit' an den getroffenen Spieler, der sie mit seinen eigenen Werten anwendet.
//   Gast   spielt seinen eigenen Spieler und sieht die Welt als Bild: alle ~100 ms kommt 'world' (Gegner, Bosse, Geschosse ...) und wird als Geisterbilder angezeigt.
//          Seine Waffen treffen die Geisterbilder (CoopEnemy, Boss-Geist ...); die Treffer meldet er als 'cdmg' dem Host, der sie auf die echten Gegner anwendet.
//          Stirbt ein Gegner, schickt der Host 'edie': dann bekommt jeder Spieler selbst die Belohnungen (Ultimate, XP, Drops ...).
//   Alle   senden 'cstate' (Position, Leben, Angriffe als Geisterbild) und sehen sich als CoopMate (G.mates).
//   Lauf   endet, wenn alle ausgeschieden sind ('over') oder der Endboss faellt ('be' mit fin). Nach jedem besiegten Boss kommen ausgeschiedene Spieler zurueck.
// Nachrichten: cstate | world | cdmg | edie | chit | cchill | ev (k: n Meldung, bs Bosskampf Start, be Bosskampf Ende, over, cdead).

class CoopMate {
  constructor(info) {
    this.id = info.id; this.name = info.name;
    this.x = 0; this.y = 0; this.dir = 0; this.nx = 0; this.ny = 0; this.nd = 0; this.vx = 0; this.vy = 0; this.at = G.realTime;
    this.hp = 100; this.mhp = 100; this.spr = 'player'; this.blink = false; this.shield = false; this.dead = false; this.seen = 0; this.first = true;
    this.ghosts = []; this.ghostAt = G.realTime;
  }
  get radius() { return CFG.player.hitRadius; }
  hasteFor() { return 1; }
  velAlong() { return 0; }
  has() { return false; }
  // Treffer durch Gegner des Hosts: der Mitspieler wendet ihn mit seinen eigenen Werten an
  hit(kind, mul, src) { Coop.send('chit', { to: this.id, k: kind, m: Math.round(mul * 100) / 100, s: src || '' }); return true; }
  chill(dur) { Coop.send('cchill', { to: this.id, d: dur }); }
  update(dt) {
    const age = Math.min(0.3, G.realTime - this.at), f = framesOf(age);
    const tx = this.nx + this.vx * f, ty = this.ny + this.vy * f, k = Math.min(1, dt * 14);
    if (this.first) { this.x = tx; this.y = ty; this.dir = this.nd; this.first = false; } else { this.x += (tx - this.x) * k; this.y += (ty - this.y) * k; }
    const dd = ((this.nd - this.dir + 540) % 360) - 180; this.dir += dd * Math.min(1, dt * 14);
  }
  draw(ctx) {
    if (this.dead) return;
    const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, P = STYLE.pal, age = Math.min(0.3, G.realTime - this.ghostAt), fr = framesOf(age);
    for (const g of this.ghosts) PvpMatch.drawGhost(ctx, g, fr);
    this.drawLook(ctx, cx, cy);
    if (this.shield) { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = P.cyan; pxRing(ctx, cx, cy, 20, 1, 14, G.realTime); ctx.restore(); }
    const w = 28, f = clamp(this.hp / Math.max(1, this.mhp), 0, 1);
    ctx.save();
    ctx.fillStyle = P.greyDark; ctx.fillRect(Math.round(cx - w / 2) - 1, Math.round(cy - 24) - 1, w + 2, 5);
    ctx.fillStyle = f > 0.35 ? P.green : P.orange; ctx.fillRect(Math.round(cx - w / 2), Math.round(cy - 24), Math.round(w * f), 3);
    ctx.restore();
    uiText(ctx, this.name, cx, cy - 29, { size: STYLE.type.small, color: P.green, align: 'center' });
    // Ultimate-Ladung des Mitspielers: kleiner Balken unter dem Schiff (bereit = leuchtend, mit Anzahl)
    const uw = 24, uf = clamp(this.ult || 0, 0, 1);
    ctx.save();
    ctx.fillStyle = P.greyDark; ctx.fillRect(Math.round(cx - uw / 2) - 1, Math.round(cy + 17) - 1, uw + 2, 4);
    ctx.fillStyle = this.ultReady ? P.ice : P.teal; ctx.globalAlpha = this.ultReady ? 0.7 + 0.3 * Math.sin(G.realTime * 6) : 1;
    ctx.fillRect(Math.round(cx - uw / 2), Math.round(cy + 17), Math.round(uw * (this.ultReady ? 1 : uf)), 2);
    ctx.restore();
    if (this.ultReady) uiText(ctx, 'ULT' + (this.ultN > 1 ? ' x' + this.ultN : ''), cx, cy + 28, { size: STYLE.type.small, color: P.teal, align: 'center' });
  }
  // Schiff mit den Cosmetics des Mitspielers (Skin, Aura, Gear samt Farbe); ohne Angaben oder bei Fehlern das schlichte Schiff
  drawLook(ctx, cx, cy) {
    const plain = () => drawSprite(ctx, Cos.tinted(this.spr, 'hue-rotate(40deg)'), this.x, this.y, this.dir, CFG.player.size, { alpha: this.blink ? 0.18 : 1 });
    if (!this.cs) { plain(); return; }
    const prev = Cos.over, t = G.realTime, over = {};
    try {
      for (const cat of ['skin', 'aura', 'gear']) {
        const e = this.cs[cat], it = e && Cos.item(cat, e[0]);
        over[cat] = it ? Cos.colored(cat, it, e[1] || null) : Cos.items(cat)[0];
      }
      Cos.over = over;
      const moving = Math.hypot(this.vx, this.vy) > 0.5;
      Cos.drawAura(ctx, over.aura, this.x, this.y, t);
      Cos.gearMoving = moving; Cos.gearAlpha = this.blink ? 0.18 : 1;
      Cos.drawGear(ctx, over.gear, this.x, this.y, this.dir, t, 'back');
      Cos2.state.moving = moving; Cos2.state.dash = false; Cos2.state.hp = clamp(this.hp / Math.max(1, this.mhp), 0, 1);
      Cos.drawShip(ctx, Cos.sprite(this.spr, 'skin'), this.x, this.y, this.dir, CFG.player.size, { alpha: this.blink ? 0.18 : 1 }, over.skin, t);
      Cos.drawGear(ctx, over.gear, this.x, this.y, this.dir, t, 'front');
    } catch (e) { this.cs = null; plain(); }
    finally { Cos.over = prev; Cos.gearAlpha = undefined; }
  }
}

// Geisterbild eines Gegners beim Gast: Aussehen und Position vom Host, Treffer durch die eigenen Waffen (werden gemeldet), keine eigene KI
class CoopEnemy extends Enemy {
  constructor(it) {
    super(it.t, it.x, it.y, !!(it.f & 1), it.v || null);
    this.gh = true; this.cid = it.i;
    this.nx = it.x; this.ny = it.y; this.lx = this.x; this.ly = this.y; this.nd = it.d || 0; this.dir = this.nd;
    this.kx = 0; this.ky = 0; this.stq = 0; this.dying = false; this.dyingT = 0; this.reported = false;
    this.apply(it);
    this.hl0 = this.hitsLeft;
  }
  apply(it) {
    const now = G.realTime, dtS = now - (this.snapAt || 0);
    if (this.snapAt && dtS > 0.03 && dtS < 0.5) { this.svx = clamp((it.x - this.snapX) / dtS, -500, 500); this.svy = clamp((it.y - this.snapY) / dtS, -500, 500); } else { this.svx = 0; this.svy = 0; }       // Geschwindigkeit zwischen zwei Bildern: damit laeuft er bis zum naechsten Bild weiter
    this.snapAt = now; this.snapX = it.x; this.snapY = it.y; this.extra = 0;
    this.nx = it.x; this.ny = it.y; this.nd = it.d || 0;
    this.hitsLeft = it.h; this.hl0 = it.h; this.maxHits = it.m;
    const f = it.f | 0;
    this.mini = !!(f & 1); this.blooded = !!(f & 2); this.minion = !!(f & 8); this.splitlet = !!(f & 32); this.raised = !!(f & 64); this.attached = !!(f & 128);
    if (f & 4) { this.stun = Math.max(this.stun, 0.2); this.hsRem = Math.max(this.hsRem || 0, 0.2); }       // Betaeubung vom Host: nicht als eigene Waffenwirkung zurueckmelden (sonst bleibt der Gegner ewig betaeubt)
    this.hasteT = f & 256 ? 1 : 0; this.amp = f & 512 ? 1 : 0;
    if (it.z) this.size = it.z;
    this.armor = it.a || null; this.kind = it.k || null; this.fuse = it.u === undefined ? null : it.u; this.aimDir = it.ai === undefined ? null : it.ai;
    if (it.mk) this.mk = it.mk;
    this.ov = it.ov || null; this.act = it.ac || null;
    if (it.x2) Object.assign(this, it.x2);                                  // Elite-Gegner: weitere einfache Felder
    if (this.dying && this.hitsLeft > 0 && !this.reported) this.dying = false;
  }
  update(dt) {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt); this.blockFlash = Math.max(0, this.blockFlash - dt);
    this.hitCd = Math.max(0, this.hitCd - dt); this.stun = Math.max(0, this.stun - dt);
    // was andere Waffen seit dem letzten Bild verschoben haben (Druckwelle, Sog, Rueckstoss): an den Host melden
    const dx = this.x - this.lx, dy = this.y - this.ly;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) { this.kx += dx; this.ky += dy; }
    this.hsRem = Math.max(0, (this.hsRem || 0) - dt);
    if (this.stun > this.hsRem + 0.02) this.stq = Math.max(this.stq, this.stun);        // nur was ueber die Host-Betaeubung hinausgeht kommt von den eigenen Waffen
    if (this.extra < 0.25) { this.extra += dt; this.nx += (this.svx || 0) * dt; this.ny += (this.svy || 0) * dt; }
    const k = Math.min(1, dt * 12);
    this.x += (this.nx - this.x) * k; this.y += (this.ny - this.y) * k;
    const dd = ((this.nd - this.dir + 540) % 360) - 180; this.dir += dd * Math.min(1, dt * 14);
    this.lx = this.x; this.ly = this.y;
    if (this.dying) { this.dyingT -= dt; if (this.dyingT <= 0) { this.dying = false; this.reported = false; } return; }
    if (G.clearing && !this.minion) { this.die(); return; }
    this.weaponContact(this.radius);
  }
  // Eigener Angriff haette ihn besiegt: dem Host melden und auf sein Urteil warten (er schickt 'edie')
  die() { if (this.dying) return; this.dying = true; this.dyingT = 1.5; this.reported = false; }
  // Der Host meldet den Tod: Belohnungen und Effekte wie bei einem echten Gegner (ohne Folgen fuer die Welt, siehe this.gh in Enemy.die)
  hostDied() { Enemy.prototype.die.call(this); }
  draw(ctx) {
    if (this.bad) { drawSprite(ctx, CFG.enemy[this.type].sprite || this.type, this.x, this.y, this.dir, this.size); return; }
    try { super.draw(ctx); } catch (e) { this.bad = true; Coop.fail('enemy ' + this.type, e); }
  }
}

const COOP_SKIP = new Set(['alive', 'twin', 'cfg', 'owner', 'player', 'V', 'hit', 'targets', 'ov', 'act', 'cid', 'gh', 'nx', 'ny', 'update', 'draw', 'contact', 'hp0']);
// Klassen, die nur wenige Felder zum Zeichnen brauchen (kleine Nachrichten); alle anderen werden mit allen einfachen Feldern uebertragen
const COOP_WL = {
  EnemyBolt: ['x', 'y', 'dir', 'ghost', 'chill'], Missile: ['x', 'y', 'dir', 'ghost', 'chill'], BossBolt: ['x', 'y', 'dir', 'ghost', 'chill'], Mortar: ['x', 'y', 'dir'],
  Blast: ['kind', 'x', 'y', 'age', 'chill'], Pop: ['x', 'y', 'r', 'color', 'age'], Mine: ['x', 'y', 'age'], TurretStrike: ['x', 'y', 'age'],
  ToxicCloud: ['x', 'y', 'boss', 'age', 'life'], Meteor: ['x', 'y', 'age', 'landed', 'side'], PowerUp: ['x', 'y', 'amount', 'age'],
};
const COOP_BOSS_SKIP = new Set([...COOP_SKIP, 'hitCd', 'stunImmune', 'bar', 'summonFlash']);

// Einfache Felder eines Objekts fuers Netz: Zahlen, Texte, kleine Listen und kleine einfache Objekte (Tiefe 2)
function coopPack(v, depth = 0) {
  const t = typeof v;
  if (t === 'number') return isFinite(v) ? (Math.abs(v) >= 20 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100) : undefined;
  if (t === 'boolean') return v;
  if (t === 'string') return v.length < 32 ? v : undefined;
  if (v === null) return null;
  if (t !== 'object' || depth > 2) return undefined;
  if (Array.isArray(v)) {
    if (v.length > 24) return undefined;
    const out = [];
    for (const e of v) { const q = coopPack(e, depth + 1); if (q === undefined) return undefined; out.push(q); }
    return out;
  }
  if (Object.getPrototypeOf(v) !== Object.prototype) return undefined;
  const out = {};
  for (const k of Object.keys(v)) { const q = coopPack(v[k], depth + 1); if (q !== undefined) out[k] = q; }
  return out;
}
function coopFields(o, skip) {
  const f = {};
  for (const k of Object.keys(o)) { if (skip.has(k) || k[0] === '_') continue; const q = coopPack(o[k]); if (q !== undefined) f[k] = q; }
  return f;
}

function coopGhostUpdate(dt) {
  if (typeof this.age === 'number') this.age += dt;
  this.nx += this.vx * dt; this.ny += this.vy * dt;                           // zwischen zwei Bildern entlang der letzten Bewegung weiterlaufen
  const k = Math.min(1, dt * 14);
  this.x += (this.nx - this.x) * k; this.y += (this.ny - this.y) * k;
  if (this.contact) this.contact(dt);
}
function coopBossUpdate(dt) {
  this.age += dt; this.bar += dt;
  this.stun = Math.max(0, this.stun - dt); this.hitCd = Math.max(0, (this.hitCd || 0) - dt); this.stunImmune = Math.max(0, (this.stunImmune || 0) - dt);
  const k = Math.min(1, dt * 12);
  this.x += (this.nx - this.x) * k; this.y += (this.ny - this.y) * k;
  if (this.twin && G.boss === this) this.twin.update(dt);
  if (this.hitCd <= 0) this.takeDamage();                                      // eigene Waffen treffen den Geist, der Host bekommt den Schaden ueber den Lebensverlust
}
// Hindernis-Geist: eigene Waffen treffen es (der Verlust wird gemeldet)
function coopObstacleContact(dt) {
  const C = CFG.obstacles;
  this.hitCd = Math.max(0, this.hitCd - dt); this.flash = Math.max(0, this.flash - dt);
  if (this.hitCd > 0) return;
  const hit = G.attacks.find((a) => a.alive && a.kind !== 'shield' && a.hitsCircle && (a.damaging || OBSTACLE_HURTERS.includes(a.kind)) && a.hitsCircle(this.x, this.y, this.r));
  if (!hit) return;
  this.hitCd = C.hitCd; this.hurt(1);
}
function coopSpawnerContact(dt) { this.age += dt; this.hitCd = Math.max(0, this.hitCd - dt); if (!this.arriving) this.weaponContact(dt); }

const Coop = {
  focus: null, _classes: null, errs: [],
  fail(what, e) { if (this.errs.length < 30) this.errs.push(what + ': ' + String((e && e.message) || e)); },

  get on() { return !!G.coop; },
  get host() { return !!(G.coop && G.coop.role === 'host'); },
  get guest() { return !!(G.coop && G.coop.role === 'guest'); },
  send(ev, payload) { if (Pvp.ch) Pvp.ch.send(ev, payload); },
  classes() {
    if (this._classes) return this._classes;
    const L = {}, add = (n, c) => { if (c) L[n] = c; };
    add('Pop', typeof Pop !== 'undefined' && Pop); add('EnemyBolt', typeof EnemyBolt !== 'undefined' && EnemyBolt); add('Missile', typeof Missile !== 'undefined' && Missile);
    add('Blast', typeof Blast !== 'undefined' && Blast); add('Mine', typeof Mine !== 'undefined' && Mine); add('Spawner', typeof Spawner !== 'undefined' && Spawner);
    add('PowerUp', typeof PowerUp !== 'undefined' && PowerUp); add('BossBolt', typeof BossBolt !== 'undefined' && BossBolt); add('Mortar', typeof Mortar !== 'undefined' && Mortar);
    add('TurretStrike', typeof TurretStrike !== 'undefined' && TurretStrike); add('Meteor', typeof Meteor !== 'undefined' && Meteor); add('ToxicCloud', typeof ToxicCloud !== 'undefined' && ToxicCloud);
    add('Obstacle', typeof Obstacle !== 'undefined' && Obstacle); add('LavaVent', typeof LavaVent !== 'undefined' && LavaVent); add('SlagBelt', typeof SlagBelt !== 'undefined' && SlagBelt);
    add('AcidPool', typeof AcidPool !== 'undefined' && AcidPool); add('IcePatch', typeof IcePatch !== 'undefined' && IcePatch);
    return (this._classes = L);
  },

  // ---------------------------------------------------------------- Start
  // info = { game: 'coop', order: [Spieler-Ids], map: Kartennummer } (vom Host). Alle Spieler rufen das auf.
  begin(info) {
    const ch = Pvp.ch, C = CFG.coop;
    if (!ch) return false;
    const order = (info && info.order ? info.order : Pvp.players.map((p) => p.id)).slice(0, C.maxPlayers);
    if (!order.includes(ch.id)) return false;
    const byId = {}; for (const p of Pvp.players) byId[p.id] = p;
    if (order.some((id) => !byId[id])) return false;
    const role = Pvp.isHost ? 'host' : 'guest', mapIdx = clamp((info && info.map) | 0, 0, CFG.maps.length - 1), n = order.length, mult = C.mult(n);
    G.coopMap = mapIdx; G.begin(false, false, 'coop'); G.coopMap = undefined;
    const base = CFG.maps[mapIdx];
    G.map = Object.assign({}, base, { half: base.half.map((v) => Math.round(v * C.mapScale)) });          // gleiche Karte, groesser
    CFG.map.halfW = G.map.half[0]; CFG.map.halfH = G.map.half[1];
    G.diff = this.scaleDiff(base.diff, mult);
    G.coop = { role, n, mult, order, me: ch.id, t: 0, cd: C.countdown, stateT: 0, worldT: 0, dmgT: 0, seq: 0, out: false, over: false, dead: {}, gone: new Map(), fwdNotice: false,
      pend: {}, pendFx: {}, startShown: undefined, hostGone: 0, spec: 0, defeat: null, pre: 0 };
    G.mates = order.filter((id) => id !== ch.id).map((id) => new CoopMate({ id, name: byId[id].name }));
    const me = order.indexOf(ch.id), a = me * 2 * Math.PI / Math.max(2, n);
    G.player.x = Math.cos(a) * 36; G.player.y = Math.sin(a) * 36;
    G.cam = { x: G.player.x, y: G.player.y };
    if (role === 'host') { G.director = new Director(); MapEnv.init(); }
    else { G.director = this.stubDirector(); MapEnv.init(); G.hazards = []; MapEnv.blz = null; G.obstacles = []; }
    if (n >= 2) Ach.add('coop');                                          // Achievement TWO'S COMPANY
    Pvp.say('');
    return true;
  },
  // Schwierigkeit: Faktor m wird auf zaehere Gegner, mehr Gegner und Boss-Leben verteilt (siehe CFG.coop)
  scaleDiff(d, m) {
    const C = CFG.coop, h = Math.pow(m, C.hpExp), s = Math.pow(m, C.spawnExp);
    return Object.assign({}, d, {
      hits: (d.hits || 1) * h, rate: (d.rate || 1) / s, allRate: (d.allRate || 1) / s, capMul: (d.capMul || 1) * s,
      boss: Object.assign({}, d.boss, { hp: (d.boss.hp || 1) * Math.pow(m, C.bossExp) }), cores: (d.cores || 1) * Math.pow(m, C.coreExp),
    });
  },
  // Der Gast hat keinen Director: Gegner, Ereignisse und Bosse kommen vom Host
  stubDirector() {
    return { corpses: [], groups: [], obstFill: false, timers: {}, update() {}, updateBosses() {}, updateCorpses() {}, randomSpawnPoint() { return [0, 0]; }, nextBossType() { return 'octagon'; } };
  },
  noticesOn(on) { if (G.coop && G.coop.role === 'host') G.coop.fwdNotice = on; },
  noticeSent(text, color, size) { if (G.coop && G.coop.role === 'host' && G.coop.fwdNotice && G.mates.length) this.send('ev', { k: 'n', t: text, c: color || null, s: size || null }); },

  // ---------------------------------------------------------------- Ziele und Orte (Host)
  // Gegner (this.focus) zielen auf den naechsten Spieler: der eigene (oder seine Koeder-Stelle t) oder ein sichtbarer Mitspieler
  nearestTarget(t) {
    const e = this.focus;
    if (!e || !G.mates || !G.mates.length || !G.coop || G.coop.role !== 'host') return t;
    let best = G.coop.out ? null : t, bd = best ? (best.x - e.x) ** 2 + (best.y - e.y) ** 2 : Infinity;
    for (const m of G.mates) {
      if (m.dead || m.blink) continue;
      const d = (m.x - e.x) ** 2 + (m.y - e.y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best || t;
  },
  livePlayers() { const out = []; if (!(G.coop && G.coop.out)) out.push(G.player); for (const m of G.mates || []) if (!m.dead) out.push(m); return out; },
  randomPlayer() { const l = this.livePlayers(); return l.length ? l[randInt(0, l.length - 1)] : G.player; },
  // Spawnpunkte rund um alle lebenden Spieler (ausserhalb des Bildes), auf die Karte begrenzt
  spawnPoints() {
    const pts = [], off = CFG.infinite.spawnPoints;
    for (const q of this.livePlayers()) for (const [dx, dy] of off) pts.push(clampToMap(q.x + dx, q.y + dy, 10));
    return pts.length ? pts : CFG.spawnPoints;
  },

  // ---------------------------------------------------------------- pro Bild
  frozen(dt) {
    const C = G.coop;
    if (!C || C.cd <= 0) return false;
    C.cd = Math.max(0, C.cd - dt);
    if (C.cd <= 0) C.startShown = G.realTime;
    return C.cd > 0;
  },
  update(dt) {
    const C = G.coop, K = CFG.coop;
    if (!C || C.over) return;
    C.t += dt;
    if (!Pvp.ch) { this.abort('CONNECTION LOST'); return; }
    // Mitspieler: wer laenger weg ist, wird entfernt; ist der Host weg, endet der Lauf fuer die Gaeste
    const present = (id) => Pvp.players.some((q) => q.id === id);
    if (C.role === 'guest') { C.hostGone = Pvp.players.some((p) => p.host) ? 0 : C.hostGone + dt; if (C.hostGone > 4) { this.abort('THE HOST LEFT'); return; } }
    for (const m of G.mates) {
      m.gone = present(m.id) ? 0 : (m.gone || 0) + dt;
      if (m.gone > 2) { m.dead = true; m.left = true; }
      m.update(dt);
    }
    if (G.mates.some((m) => m.left)) { G.mates = G.mates.filter((m) => !m.left); this.check(); }
    if (!G.mates.length && C.role === 'guest') { this.abort('THE HOST LEFT'); return; }
    // eigener Zustand
    C.stateT -= dt;
    if (C.stateT <= 0) {
      C.stateT = 1 / K.stateHz;
      const pl = G.player, r1 = (v) => Math.round(v * 10) / 10;
      this.send('cstate', { x: r1(pl.x), y: r1(pl.y), d: r1(pl.dir), vx: r1(pl.velX || 0), vy: r1(pl.velY || 0), hp: Math.round(pl.hp), mh: Math.round(pl.maxHp),
        spr: Hero.sprite(), bl: pl.blinkT > 0 ? 1 : 0, sh: pl.shield ? 1 : 0, dd: C.out ? 1 : 0, a: C.out ? [] : PvpMatch.snapshot(),
        ul: Math.round(clamp(G.ultCharge / (CFG.ult.readyAt + 1), 0, 1) * 100) / 100, ur: G.ultCharge > CFG.ult.readyAt ? 1 : 0, un: 1 + (G.ultStock || 0),
        cs: this.lookPack(), sp: SafeSpot.inside && SafeSpot.spot ? [Math.round(SafeSpot.spot.x), Math.round(SafeSpot.spot.y)] : 0 });
    }
    if (C.role === 'host') {
      C.worldT -= dt;
      if (C.worldT <= 0) { C.worldT = 1 / K.worldHz; this.send('world', this.packWorld()); }
    }
    if (C.out) this.spectate();
  },
  // eigene Cosmetics fuer die Mitspieler: je Kategorie [Item-ID, Farb-ID]
  lookPack() {
    const o = {};
    for (const cat of ['skin', 'aura', 'gear']) { const it = Cos.cur(cat); o[cat] = [it.id, Save.cosColor(cat) || 0]; }
    return o;
  },
  // Zuschauer: die Kamera folgt einem lebenden Mitspieler
  spectate() {
    const C = G.coop, alive = G.mates.filter((m) => !m.dead);
    G.player.hp = 0;
    if (!alive.length) return;
    if (Input.pressed('Space') || Input.pressed('ArrowRight') || Input.pressed('KeyD')) C.spec++;
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) C.spec += alive.length - 1;
    const t = alive[C.spec % alive.length];
    C.watching = t.name;
    G.player.x = t.x; G.player.y = t.y;
  },
  // nach der Welt-Aktualisierung des Bildes (Gast): Schaden an den Geisterbildern an den Host melden
  afterWorld(dt) {
    const C = G.coop;
    if (!C || C.role !== 'guest' || C.over) return;
    const add = (k, i, n, s) => { const key = k + i; const o = C.pend[key] || (C.pend[key] = { k, i, n: 0, s: s || 'other' }); o.n += n; };
    for (const e of G.enemies) {
      if (!e.gh) continue;
      if (e.dying && !e.reported) { e.reported = true; add('e', e.cid, Math.max(1, e.hl0), e.killSrc); e.hl0 = 0; continue; }
      const d = e.hl0 - e.hitsLeft;
      if (d > 0.001 && !e.dying) { add('e', e.cid, d, e.killSrc); e.hl0 = e.hitsLeft; }
      if (Math.hypot(e.kx, e.ky) > 0.5 || e.stq > 0) {
        const o = C.pendFx[e.cid] || (C.pendFx[e.cid] = { i: e.cid, dx: 0, dy: 0, st: 0 });
        o.dx += e.kx; o.dy += e.ky; o.st = Math.max(o.st, e.stq); e.kx = e.ky = e.stq = 0;
      } else { e.kx = e.ky = e.stq = 0; }
    }
    for (const b of G.bossList()) if (b.gh) { const d = b.hp0 - b.hp; if (d > 0.001) { add('b', b.cid, d); b.hp0 = b.hp; } }
    for (const s of G.spawners) if (s.gh) { const d = s.hp0 - s.hp; if (d > 0.001) { add('s', s.cid, d); s.hp0 = s.hp; } }
    for (const o of G.obstacles) if (o.gh) { const d = o.hp0 - o.hp; if (d > 0.001) { add('o', o.cid, d); o.hp0 = o.hp; } if (!o.alive) C.gone.set(o.cid, G.realTime); }
    for (const s of G.spawners) if (s.gh && !s.alive) C.gone.set(s.cid, G.realTime);
    for (const p of G.powerups) if (p.gh && !p.alive) C.gone.set(p.cid, G.realTime);
    C.dmgT -= dt;
    if (C.dmgT <= 0) {
      const a = Object.values(C.pend), f = Object.values(C.pendFx);
      if (a.length || f.length) {
        C.dmgT = 0.05;
        this.send('cdmg', { a: a.slice(0, 60).map((o) => [o.k, o.i, Math.round(o.n * 100) / 100, o.s]), f: f.slice(0, 40).map((o) => [o.i, Math.round(o.dx * 10) / 10, Math.round(o.dy * 10) / 10, Math.round(o.st * 100) / 100]) });
        C.pend = {}; C.pendFx = {};
      }
    }
  },

  // ---------------------------------------------------------------- Host: Bild der Welt
  packWorld() {
    const C = G.coop, K = CFG.coop, now = G.realTime, r1 = (v) => Math.round(v * 10) / 10;
    const id = (o) => o.cid || (o.cid = ++C.seq);
    // Geschwindigkeit seit dem letzten Bild (Einheiten pro Sekunde): der Gast laeuft damit zwischen zwei Bildern weiter
    const vel = (o) => {
      let vx = 0, vy = 0;
      if (o._pt !== undefined && now > o._pt) { vx = (o.x - o._px) / (now - o._pt); vy = (o.y - o._py) / (now - o._pt); }
      o._px = o.x; o._py = o.y; o._pt = now;
      return [Math.round(vx), Math.round(vy)];
    };
    const gen = (list, max, skip = COOP_SKIP, withVel = true) => {
      const out = [];
      for (const o of list) {
        if (o.alive === false || out.length >= max) continue;       // (Gefahren haben kein alive)
        const c = o.constructor.name;
        if (!this.classes()[c]) continue;
        const wl = COOP_WL[c];
        let fl;
        if (wl) { fl = {}; for (const k of wl) { const q = coopPack(o[k]); if (q !== undefined) fl[k] = k === 'x' || k === 'y' ? Math.round(o[k] * 10) / 10 : q; } } else fl = coopFields(o, skip);
        const it = { i: id(o), c, f: fl };
        if (withVel) { const v = vel(o); if (v[0] || v[1]) { it.vx = v[0]; it.vy = v[1]; } }
        out.push(it);
      }
      return out;
    };
    const flag = (e) => (e.mini ? 1 : 0) | (e.blooded ? 2 : 0) | (e.stun > 0 ? 4 : 0) | (e.minion ? 8 : 0) | (e.elite ? 16 : 0) | (e.splitlet ? 32 : 0) | (e.raised ? 64 : 0) | (e.attached ? 128 : 0) | (e.hasteT > 0 ? 256 : 0) | (e.amp > 0 ? 512 : 0);
    const enemies = [];
    for (const e of G.enemies) {
      if (!e.alive || enemies.length >= K.maxEnemies) continue;
      const ex = {};
      if (e.vKey) ex.v = e.vKey;
      if (e.armor) ex.a = e.armor;
      if (e.kind) ex.k = e.kind;
      if (e.fuse !== null && e.fuse !== undefined) ex.u = Math.round(e.fuse * 100) / 100;
      if (e.aimDir !== null && e.aimDir !== undefined) ex.ai = Math.round(e.aimDir);
      if (e.ov) { const q = coopPack(e.ov); if (q) ex.ov = q; }
      if (e.act) { const q = coopPack(e.act); if (q) ex.ac = q; }
      if (e.elite) { ex.mk = e.mk; ex.x2 = coopFields(e, new Set([...COOP_SKIP, 'x', 'y', 'dir', 'hitsLeft', 'maxHits', 'size', 'type', 'mini', 'age'])); }
      const row = [id(e), e.type, r1(e.x), r1(e.y), Math.round(e.dir), e.hitsLeft, e.maxHits, flag(e), e.size];
      if (Object.keys(ex).length) row.push(ex);
      enemies.push(row);
    }
    const bosses = G.bossList().map((b, i) => ({ i: id(b), ty: b.type, f: coopFields(b, COOP_BOSS_SKIP), main: b === G.boss ? 1 : 0, tw: b.twin ? 1 : 0 }));
    const w = {
      t: Math.round(G.time * 100) / 100, q: C.seq, e: enemies, b: bosses,
      sh: gen(G.shots, K.maxShots), bs: gen(G.bossShots, K.maxShots), bl: gen(G.blasts, K.maxShots), me: gen(G.meteors, 24), sp: gen(G.spawners, 8, new Set([...COOP_SKIP, 'warn']), false),
      ob: gen(G.obstacles, 30, COOP_SKIP, false), pu: gen(G.powerups, 8, COOP_SKIP, false), hz: gen(G.hazards, 40, new Set([...COOP_SKIP, 'hit', 'hitPlayer']), false),
      fl: { fl: G.flood ? 1 : 0, bm: G.bloodMoon ? 1 : 0, bml: Math.round(G.bloodMoonLeft || 0), ms: G.meteorShower ? 1 : 0, mll: Math.round(G.meteorLeft || 0), co: G.collapse ? 1 : 0, cw: G.collapseWarn ? 1 : 0,
        cl: Math.round(G.collapseLeft || 0), as: Math.round(G.arenaScale * 1000) / 1000, at: G.arenaTarget, bf: G.bossFight ? 1 : 0, bc: G.bossCount, fs: G.finalStarted ? 1 : 0, eu: G.eliteUp ? 1 : 0, bt: Math.round(G.bossTimer * 10) / 10 },
      bz: MapEnv.blz ? coopPack(MapEnv.blz) : null,
    };
    return w;
  },

  // ---------------------------------------------------------------- Gast: Bild der Welt anwenden
  applyWorld(w) {
    const C = G.coop;
    if (!C || C.role !== 'guest' || C.over || !w) return;
    G.time = w.t;
    const f = w.fl || {};
    if (!!f.fl !== G.flood) { G.flood = !!f.fl; G.notice(G.flood ? 'SWARM SURGE!' : 'SURGE SURVIVED', G.flood ? STYLE.pal.red : STYLE.pal.green, G.flood ? STYLE.type.h1 : undefined); }
    if (!!f.bm !== G.bloodMoon) { G.bloodMoon = !!f.bm; G.notice(G.bloodMoon ? 'CRIMSON ECLIPSE!' : 'ECLIPSE ENDED', G.bloodMoon ? STYLE.pal.red : STYLE.pal.green, G.bloodMoon ? STYLE.type.h1 : undefined); }
    G.bloodMoonLeft = f.bml || 0;
    if (!!f.ms !== G.meteorShower) { G.meteorShower = !!f.ms; G.notice(G.meteorShower ? 'METEOR SHOWER!' : 'SHOWER OVER', G.meteorShower ? STYLE.pal.orange : STYLE.pal.green, G.meteorShower ? STYLE.type.h1 : undefined); }
    G.meteorLeft = f.mll || 0;
    if (!!f.co !== G.collapse) { G.collapse = !!f.co; G.notice(G.collapse ? 'ARENA COLLAPSING!' : 'ARENA RESTORED', G.collapse ? STYLE.pal.red : STYLE.pal.green, G.collapse ? STYLE.type.h1 : undefined); }
    G.collapseWarn = !!f.cw; G.collapseLeft = f.cl || 0; G.arenaScale = f.as === undefined ? 1 : f.as; G.arenaTarget = f.at === undefined ? 1 : f.at;
    G.bossCount = f.bc || 0; G.finalStarted = !!f.fs; G.eliteUp = !!f.eu;
    if (G.bossFight) G.bossTimer = f.bt || 0;
    if (MapEnv && w.bz) MapEnv.blz = w.bz; else if (MapEnv && !w.bz) MapEnv.blz = null;
    // Gegner
    const cur = new Map(); for (const e of G.enemies) if (e.gh) cur.set(e.cid, e);
    const next = [];
    for (const row of w.e || []) {
      const it = { i: row[0], t: row[1], x: row[2], y: row[3], d: row[4], h: row[5], m: row[6], f: row[7], z: row[8] };
      if (row[9]) Object.assign(it, row[9]);
      let g = cur.get(it.i);
      if (!g) { try { g = new CoopEnemy(it); } catch (e) { continue; } } else g.apply(it);
      next.push(g);
    }
    G.enemies = next;
    // Bosse
    this.applyBosses(w.b || []);
    // einfache Listen
    this.syncList('shots', w.sh); this.syncList('bossShots', w.bs); this.syncList('blasts', w.bl); this.syncList('meteors', w.me);
    this.syncList('spawners', w.sp, (g) => { g.update = coopSpawnerContact; g.hp0 = g.hp; });
    this.syncList('obstacles', w.ob, (g) => { g.update = coopGhostUpdate; g.contact = coopObstacleContact; g.hp0 = g.hp; g.flash = 0; g.hitCd = 0; });
    this.syncList('powerups', w.pu, (g) => { delete g.update; });
    this.syncHazards(w.hz || []);
    if (f.bf && !G.bossFight && G.boss) G.startBossFight(G.boss.type);              // falls die Meldung 'Bosskampf beginnt' verloren ging
    const now = G.realTime; for (const [k, t] of C.gone) if (now - t > 2) C.gone.delete(k);
  },
  mkGhost(it, hook) {
    const Cl = this.classes()[it.c];
    if (!Cl) return null;
    const g = Object.create(Cl.prototype);
    Object.assign(g, it.f);
    g.cid = it.i; g.gh = true; g.alive = true; g.nx = g.x; g.ny = g.y; g.vx = it.vx || 0; g.vy = it.vy || 0;
    g.update = coopGhostUpdate;
    const draw = Cl.prototype.draw;
    const nm = it.c;
    g.draw = function (ctx) { try { draw.call(this, ctx); } catch (e) { Coop.fail('draw ' + nm, e); this.draw = () => {}; } };
    if (hook) hook(g);
    return g;
  },
  // Liste aus dem Bild des Hosts ersetzen: vorhandene Geister behalten ihre Identitaet (weiche Bewegung), eigene Effekte (nicht gh) bleiben
  syncList(name, arr, hook) {
    const C = G.coop;
    if (!arr) return;
    const cur = new Map(); for (const o of G[name]) if (o.gh) cur.set(o.cid, o);
    const next = G[name].filter((o) => !o.gh);
    for (const it of arr) {
      if ((name === 'obstacles' || name === 'spawners' || name === 'powerups') && C.gone.has(it.i)) continue;
      let g = cur.get(it.i);
      if (!g) { g = this.mkGhost(it, hook); if (!g) continue; }
      else {
        const x = g.x, y = g.y, age = g.age;
        Object.assign(g, it.f);
        g.nx = it.f.x; g.ny = it.f.y; g.vx = it.vx || 0; g.vy = it.vy || 0; g.x = x; g.y = y;
        if (typeof age === 'number' && typeof it.f.age === 'number' && Math.abs(age - it.f.age) < 0.25) g.age = age;
        if (g.hp0 !== undefined) g.hp0 = g.hp;
      }
      next.push(g);
    }
    G[name] = next;
  },
  syncHazards(arr) {
    const cur = G.hazards;
    const next = [];
    arr.forEach((it, i) => {
      const Cl = this.classes()[it.c];
      if (!Cl) return;
      let h = cur[i] && cur[i].constructor === Cl && cur[i].cid === it.i ? cur[i] : null;
      if (!h) { try { h = new Cl(); } catch (e) { return; } h.cid = it.i; }
      const keep = { hit: h.hit };
      Object.assign(h, it.f);
      if (keep.hit) h.hit = keep.hit;
      next.push(h);
    });
    G.hazards = next;
  },
  applyBosses(list) {
    const old = G.bossList().filter((b) => b.gh);
    const out = [];
    for (const it of list) {
      const Cl = typeof Boss !== 'undefined' ? Boss : null;
      if (!Cl) return;
      let g = old.find((b) => b.cid === it.i);
      if (!g) {
        g = Object.create(Cl.prototype);
        Object.assign(g, it.f);
        g.cfg = CFG.boss[it.ty]; g.type = it.ty; g.isBoss = true; g.gh = true; g.cid = it.i; g.alive = true; g.twin = null;
        g.nx = g.x; g.ny = g.y; g.bar = 1; g.hitCd = 0; g.stunImmune = 0; g.summonFlash = 0;
        g.update = coopBossUpdate;
        const draw = Cl.prototype.draw;
        g.draw = function (ctx) { try { draw.call(this, ctx); } catch (e) { Coop.fail('draw boss ' + this.type, e); drawSprite(ctx, this.sprite || 'octagon', this.x, this.y, this.dir, 300); } };
      } else {
        const x = g.x, y = g.y, hc = g.hitCd, st = g.stun, bar = g.bar;
        Object.assign(g, it.f);
        g.nx = it.f.x; g.ny = it.f.y; g.x = x; g.y = y; g.hitCd = hc; g.bar = bar;
        if (st > g.stun) g.stun = st;
      }
      g.hp0 = g.hp; g.alive = true;
      out.push([g, it]);
    }
    if (out.length === 2) { out[0][0].twin = out[1][0]; out[1][0].twin = out[0][0]; } else for (const [g] of out) g.twin = null;
    const main = out.find(([g, it]) => it.main) || out[0];
    G.boss = main ? main[0] : null;
    if (out.length === 2 && main) { const o = out.find(([g]) => g !== main[0]); if (o) main[0].twin = o[0]; }
  },

  // ---------------------------------------------------------------- Nachrichten
  onMessage(ev, p) {
    const C = G.coop;
    if (!C || !p) return;
    if (ev === 'cstate') {
      const m = G.mates.find((q) => q.id === p.from);
      if (!m) return;
      m.nx = p.x; m.ny = p.y; m.nd = p.d; m.vx = p.vx; m.vy = p.vy; m.at = G.realTime; m.hp = p.hp; m.mhp = p.mh; m.spr = p.spr || 'player'; m.blink = !!p.bl; m.shield = !!p.sh; m.dead = !!p.dd;
      m.ult = p.ul || 0; m.ultReady = !!p.ur; m.ultN = p.un || 1; if (p.cs) m.cs = p.cs; m.sp = p.sp || null;
      m.seen = G.realTime;
      if (!m.dead) PvpMatch.ghostsFrom(m, p.a || []); else m.ghosts = [];
      m.ghostAt = G.realTime;
    } else if (ev === 'world') this.applyWorld(p);
    else if (ev === 'cdmg') { if (C.role === 'host') this.applyDamage(p); }
    else if (ev === 'edie') this.onEnemyDied(p);
    else if (ev === 'chit') { if (p.to === C.me && !C.over) G.player.hit(p.k, p.m, p.s); }
    else if (ev === 'cchill') { if (p.to === C.me && !C.over) G.player.chill(p.d || CFG.chill.dur); }
    else if (ev === 'ev') this.onEvent(p);
  },
  // Host: Schaden und Verschiebungen, die die Gaeste an den Geisterbildern verursacht haben
  applyDamage(p) {
    const byId = new Map();
    for (const e of G.enemies) if (e.cid && e.alive) byId.set(e.cid, e);
    for (const [k, i, n, s] of p.a || []) {
      if (!(n > 0) || n > 400) continue;
      if (k === 'e') {
        const e = byId.get(i);
        if (!e || !e.alive) continue;
        e.killSrc = s || 'other';
        if (e.hitsLeft <= n + 0.001) e.die(); else { e.hitsLeft -= n; e.hitFlash = 0.14; if (!e.elite && e.type !== 'tank') e.stun = Math.max(e.stun, CFG.enemy.stun); }
      } else if (k === 'b') {
        const b = G.bossList().find((q) => q.cid === i);
        if (b) { b.hp -= n; b.bar = 0; b.hitCd = Math.max(b.hitCd, 0.1); }
      } else if (k === 's') {
        const sp = G.spawners.find((q) => q.cid === i);
        if (sp && !sp.arriving) sp.hp -= n;
      } else if (k === 'o') {
        const o = G.obstacles.find((q) => q.cid === i);
        if (o) o.hurt(n);
      }
    }
    for (const [i, dx, dy, st] of p.f || []) {
      const e = byId.get(i);
      if (!e || !e.alive || e.type === 'tank' || e.elite) continue;
      const m = Math.hypot(dx, dy), cap = 60;
      const k = m > cap ? cap / m : 1;
      if (m > 0) [e.x, e.y] = clampToMap(e.x + dx * k, e.y + dy * k, e.radius);
      if (st > 0) e.stun = Math.max(e.stun, Math.min(st, 1.5));
    }
  },
  // Gast: ein Gegner ist gestorben (Host hat entschieden)
  onEnemyDied(p) {
    if (!G.coop || G.coop.role !== 'guest') return;
    const e = G.enemies.find((q) => q.gh && q.cid === p.i);
    if (!e || !e.alive) return;
    e.x = e.nx; e.y = e.ny;
    e.hostDied();
  },
  // Host: ein Gegner ist gestorben -> alle Gaeste bekommen die Belohnungen
  enemyDied(e) {
    const C = G.coop;
    if (!C || C.role !== 'host' || !e.cid || !G.mates.length) return;
    this.send('edie', { i: e.cid });
  },
  onEvent(p) {
    const C = G.coop;
    if (p.k === 'n') G.notice(p.t, p.c || undefined, p.s || undefined);
    else if (p.k === 'bs' && C.role === 'guest') { if (!G.bossFight) G.startBossFight(p.ty); }
    else if (p.k === 'be' && C.role === 'guest') this.onBossEnd(p);
    else if (p.k === 'cdead') { const m = G.mates.find((q) => q.id === p.from); if (m) { m.dead = true; m.ghosts = []; } this.check(); }
    else if (p.k === 'over') this.runOver(p.why);
    else if (p.k === 'fin' && C.role === 'guest') { /* Siegphase beginnt beim Boss-Ende */ }
  },

  // ---------------------------------------------------------------- Bosskampf
  bossStarted(type) { if (G.coop && G.coop.role === 'host' && G.mates.length) this.send('ev', { k: 'bs', ty: type }); },
  bossDefeated(b) { if (G.coop && G.coop.role === 'host') G.coop.defeat = { type: b.type, fin: b.type === 'reaper' }; },
  bossEnded(result) {
    const C = G.coop;
    if (!C || C.role !== 'host') return;
    const d = C.defeat; C.defeat = null;
    if (G.mates.length) this.send('ev', { k: 'be', r: d ? 'win' : result, ty: d ? d.type : null, fin: d ? d.fin : false });
    if (d && !d.fin) this.reviveSelf();
  },
  // Gast: Boss besiegt oder Zeit abgelaufen
  onBossEnd(p) {
    if (p.r === 'win') {
      Sfx.play('bossDown'); Juice.hitStop(0.12); Juice.shake(5); Juice.flash(STYLE.pal.white, 0.3, 0.15);
      if (!p.fin) { Xp.bossDefeated(); G.addUlt(CFG.boss.killUlt); G.later(0.25, () => Loadout.weaponUp(G.time)); }
      else { G.bosses++; G.startVictory(); }
    } else if (p.r === 'timeout') G.later(0.25, () => Loadout.weaponUp(G.time));
    if (G.bossFight) G.endBossFight(p.r);
    if (p.r === 'win' && !p.fin) this.reviveSelf();
  },
  reviveSelf() {
    const C = G.coop;
    if (!C || !C.out) return;
    C.out = false; C.dead[C.me] = false;
    const p = G.player;
    p.hp = Math.max(1, Math.round(p.maxHp * CFG.coop.reviveFrac)); p.invincibleT = Math.max(p.invincibleT || 0, 2);
    G.notice('REVIVED!', STYLE.pal.green);
    Sfx.play('levelUp');
  },

  // ---------------------------------------------------------------- Tod und Ende
  localDeath() {
    const C = G.coop;
    if (!C || C.over || C.out) return;
    C.out = true; C.dead[C.me] = true; G.attacks = [];
    G.player.hp = 0;
    Sfx.play('death'); Juice.shake(3);
    this.send('ev', { k: 'cdead' });
    this.check();
    if (!C.over) G.notice('YOU ARE OUT - WATCH, YOU RETURN AFTER THE NEXT BOSS', STYLE.pal.orange);
  },
  // Host: sind alle ausgeschieden, endet der Lauf fuer alle
  check() {
    const C = G.coop;
    if (!C || C.role !== 'host' || C.over) return;
    if (C.out && G.mates.every((m) => m.dead)) {
      this.send('ev', { k: 'over', why: 'ALL PLAYERS ARE DOWN' });
      this.runOver('ALL PLAYERS ARE DOWN');
    }
  },
  runOver(why) {
    const C = G.coop;
    if (!C || C.over) return;
    C.over = true; C.why = why || '';
    G.pick = null;
    if (G.mode === 'pick') G.mode = 'play';
    if (G.mode === 'play') G.die();
  },
  escape() {
    const C = G.coop;
    if (!C || C.over) return;
    if (G.realTime - (C.escAt || -9) < 1.6) { if (C.out) this.abort('YOU LEFT THE RUN'); else this.localDeath(); }
    else { C.escAt = G.realTime; G.notice(C.out ? 'PRESS ESC AGAIN TO LEAVE' : 'PRESS ESC AGAIN TO GIVE UP', STYLE.pal.orange); }
  },
  // Verbindung weg, Host weg oder freiwillig raus: zurueck ins Menue
  abort(why) {
    if (!G.coop) return;
    G.coop = null; G.mates = []; this.focus = null;
    try { Pvp.leave(true); } catch (e) { /* egal */ }
    G.pick = null; G.mode = 'start';
    G.notice(why || '', STYLE.pal.orange);
  },
  // Nach dem Tod- oder Siegbildschirm: zurueck in die Lobby (die Verbindung bleibt), nicht ins Hauptmenue
  toLobby() {
    G.coop = null; G.mates = []; this.focus = null;
    if (!Pvp.ch) { G.mode = 'start'; return; }
    G.mode = 'pvp'; Pvp.st = 'lobby'; Pvp.sel = 0; Pvp.pick = null; Pvp.say('');
  },
  exit() { if (G.coop) { G.coop = null; G.mates = []; } this.focus = null; try { Pvp.leave(true); } catch (e) { /* egal */ } },

  // ---------------------------------------------------------------- Anzeige
  drawMates(ctx) { for (const m of G.mates || []) m.draw(ctx); },
  drawOverlay(ctx) {
    const C = G.coop, T = STYLE.type, S = STYLE.pal;
    if (!C) return;
    const all = [{ name: Pvp.name(), hp: G.player.hp, mhp: G.player.maxHp, dead: C.out, me: true }].concat(G.mates.map((m) => ({ name: m.name, hp: m.hp, mhp: m.mhp, dead: m.dead })));
    // rechts unter der XP-Leiste: Schwierigkeit und je Spieler Name mit Lebensbalken
    uiText(ctx, 'CO-OP x' + C.mult.toFixed(1), STAGE_W - 8, 44, { size: T.small, color: S.orange, align: 'right' });
    all.forEach((p, i) => {
      const y = 58 + i * 17, f = clamp(p.hp / Math.max(1, p.mhp), 0, 1), col = p.dead ? S.greyMid : p.me ? S.cyan : S.green;
      uiText(ctx, p.name, STAGE_W - 8, y, { size: T.small, color: col, align: 'right', maxW: 90 });
      ctx.fillStyle = S.greyDark; ctx.fillRect(STAGE_W - 8 - 60, y + 3, 60, 4);
      if (!p.dead) { ctx.fillStyle = f > 0.35 ? col : S.orange; ctx.fillRect(STAGE_W - 8 - 60, y + 3, Math.round(60 * f), 4); }
    });
    if (C.cd > 0) uiText(ctx, String(Math.ceil(C.cd)), STAGE_W / 2, STAGE_H / 2 - 20, { size: T.title, color: S.yellow, align: 'center', glow: S.yellow });
    else if (C.startShown !== undefined && G.realTime - C.startShown < 0.8) uiText(ctx, 'GO!', STAGE_W / 2, STAGE_H / 2 - 20, { size: T.h1, color: S.green, align: 'center' });
    if (C.out && !C.over) uiText(ctx, 'WATCHING ' + (C.watching || '') + '  [SPACE: NEXT]', STAGE_W / 2, STAGE_H - 24, { size: T.body, color: S.orange, align: 'center' });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'CO-OP': 'KOOP', 'AUTO-PICK IN #S': 'AUTO-WAHL IN #S', 'Play a co-op run together with another player.': 'Spiele einen Koop-Lauf zusammen mit einem anderen Spieler.', 'CONNECTION LOST': 'VERBINDUNG VERLOREN', 'THE HOST LEFT': 'DER HOST IST WEG', 'YOU LEFT THE RUN': 'DU HAST DEN LAUF VERLASSEN', 'ALL PLAYERS ARE DOWN': 'ALLE SPIELER SIND AUSGESCHIEDEN',
  'Play a run together with up to 3 friends on the standard maps, only bigger. Create a lobby and share the code.': 'Spielt einen Lauf zusammen mit bis zu 3 Freunden auf den Standardkarten, nur größer. Erstelle eine Lobby und teile den Code.',
  'Everyone keeps their own gear, upgrades and hero. More players means a much harder run: 2 players are about 2.7x, 4 players about 8x as hard. Fallen players come back after the next boss.': 'Jeder behält seine eigene Ausrüstung, Upgrades und seinen Helden. Mehr Spieler bedeuten einen viel härteren Lauf: 2 Spieler sind etwa 2,7x, 4 Spieler etwa 8x so schwer. Gefallene Spieler kommen nach dem nächsten Boss zurück.',
  'Share the code. Everyone plays together on the bigger map; more players make the run harder. Choose the map, then start.': 'Teile den Code. Alle spielen zusammen auf der größeren Karte; mehr Spieler machen den Lauf härter. Wähle die Karte und starte.',
  'Your own gear, upgrades and hero count. Only the host can start the run.': 'Deine eigene Ausrüstung, Upgrades und dein Held zählen. Nur der Host kann den Lauf starten.',
  'PRESS ESC AGAIN TO GIVE UP': 'ESC NOCHMAL DRÜCKEN ZUM AUFGEBEN', 'PRESS ESC AGAIN TO LEAVE': 'ESC NOCHMAL DRÜCKEN ZUM VERLASSEN',
  'YOU ARE OUT - WATCH, YOU RETURN AFTER THE NEXT BOSS': 'DU BIST RAUS - SCHAU ZU, NACH DEM NÄCHSTEN BOSS BIST DU WIEDER DABEI', 'REVIVED!': 'WIEDERBELEBT!', 'GO!': 'LOS!',
});
if (typeof I18n !== 'undefined' && I18n.phrases) I18n.phrases([['MAP:', 'KARTE:'], ['DIFFICULTY x', 'SCHWIERIGKEIT x'], ['CO-OP x', 'KOOP x'], ['WATCHING', 'DU SIEHST ZU:'], ['[SPACE: NEXT]', '[LEERTASTE: WEITER]']]);
