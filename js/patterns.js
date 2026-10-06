// Gegner-Muster (Patterns) und Gegner-Events.
//
//  1. BASIS-MUSTER (Patterns.base): jeder Gegnertyp hat ein eigenes Bewegungsmuster, das immer läuft.
//       circle = Zickzack-Anlauf | triangle = umkreist den Spieler | square = bleibt auf Abstand stehen (Artillerie)
//       rhombus = Stop-and-Go | guard = Rammstoß aus der Nähe | support = hält Abstand und wirkt eine Aura
//       bomber = zündet in der Nähe | sniper = Laserlinie, dann Schuss | miner = Minen | leech = haftet | necro = belebt Leichen
//       teleporter = springt hinter den Spieler | splitter/tank = laufen gerade (Splitter zerfällt, Tank hat viele Leben)
//  2. GLOBALE EVENTS (Patterns.startGlobal): betreffen alle Gegner, der Director löst sie aus (CFG.events.global)
//       scatter (Gegner zerstreuen sich, dann Angriff von allen Seiten) | formation (Gruppe in Form marschiert an)
//       charge (alle stehen kurz, dann Sturmangriff in einer Linie) | surround (Ring aus Gegnern zieht sich zu, mit Lücke)
//  3. LOKALE EVENTS (Patterns.localEvent): betreffen alle Gegner EINES Typs gleichzeitig (CFG.events.local)
//       circle RUSH | triangle VOLLEY | square BARRAGE | rhombus CHAIN | guard SWITCH | support AMPLIFY
//       bomber DETONATE | splitter DIVIDE | sniper CROSSFIRE | miner MINEFIELD | leech LEAP | necro RAISE | teleporter AMBUSH | tank STOMP
//
//  Technik: Jeder Gegner kann einen `ov` (Override der Bewegung: Sturmangriff, Zerstreuen, Formation, Ring) und
//  einen `act` (Aktion mit Vorwarnung: Salve, Raketen, Welle ...) haben. Enemy.update fragt Patterns.steer(e, dt),
//  das liefert { mul } (Tempofaktor für die normale Bewegung) oder { step, touch } (komplett eigene Bewegung).
//  Alle Zahlen stehen in config.js ([7] Gegner: patterns, events).

// ---------- Gruppen, die der Director pro Bild aktualisiert ----------

// Formation: ein Anker läuft auf den Spieler zu, die Mitglieder kleben an ihren Plätzen. Kommt der Anker nah genug
// (oder stirbt ein Mitglied), löst sich die Formation auf. Bei Ankunft stürmen alle Mitglieder gleichzeitig los.
class Formation {
  constructor(type, shape, sx, sy) {
    const C = CFG.events.global.formation;
    this.done = false;
    this.x = sx; this.y = sy;
    this.heading = dirTo(sx, sy, G.player.x, G.player.y);
    this.offsets = Patterns.shapeOffsets(shape, C.spacing);
    this.members = this.offsets.map((o, i) => {
      const m = new Enemy(type, sx, sy, false);
      m.ov = { kind: 'formation', g: this, i, global: true };
      G.enemies.push(m);
      return m;
    });
    this.members.forEach((m, i) => { const s = this.slot(i); m.x = s[0]; m.y = s[1]; m.dir = this.heading; });
  }
  // Platz von Mitglied i: ox nach rechts, oy nach vorn (relativ zur Marschrichtung)
  slot(i) {
    const [ox, oy] = this.offsets[i], fx = fwdX(this.heading), fy = fwdY(this.heading);
    return [this.x + fx * oy + fy * ox, this.y + fy * oy - fx * ox];
  }
  update(dt) {
    if (this.done) return;
    const C = CFG.events.global.formation, p = G.player, f = framesOf(dt);
    if (this.members.some((m) => !m.alive || !m.ov || m.ov.g !== this)) { this.release(false); return; }
    this.heading += clamp(angleDiff(dirTo(this.x, this.y, p.x, p.y), this.heading), -C.turn * f, C.turn * f);
    this.x += fwdX(this.heading) * C.speed * f;
    this.y += fwdY(this.heading) * C.speed * f;
    if (Math.hypot(p.x - this.x, p.y - this.y) < C.breakDist) this.release(true);
  }
  release(charge) {
    const C = CFG.events.global.formation;
    this.done = true;
    for (const m of this.members) {
      if (!m.alive) continue;
      m.ov = charge ? Patterns.dashOv(m, C.chargeTele, C.chargeGo, C.chargeSpeed, true, true) : null;
    }
  }
}

// Umzingelung: Ring aus Kreisen um den Spieler, der sich zuzieht. Eine Lücke bleibt offen (dort kann man entkommen).
class SurroundRing {
  constructor() {
    const C = CFG.events.global.surround, p = G.player;
    this.done = false;
    this.t = 0;
    this.r = C.startR;
    this.speed = C.speed;
    const gapCenter = rand(0, 360);
    this.members = [];
    for (let k = 0; k < C.count; k++) {
      const deg = (360 / C.count) * k;
      if (Math.abs(angleDiff(deg, gapCenter)) < C.gap / 2) continue;
      const a = deg * DEG, m = new Enemy('circle', p.x + C.startR * Math.cos(a), p.y + C.startR * Math.sin(a), false);
      m.ov = { kind: 'ring', ring: this, a, global: true };
      G.enemies.push(m);
      this.members.push(m);
    }
  }
  update(dt) {
    if (this.done) return;
    const C = CFG.events.global.surround;
    this.t += dt;
    const k = Math.min(1, this.t / C.time);
    this.r = C.startR + (C.endR - C.startR) * k;
    if (k >= 1 || this.members.every((m) => !m.alive)) {
      this.done = true;
      for (const m of this.members) if (m.alive) m.ov = null;        // danach laufen sie normal weiter auf den Spieler zu
    }
  }
}

// ---------- Muster und Events ----------

const Patterns = {

  // Gegner eines Typs, die gerade nichts Besonderes tun
  free(type) { return G.enemies.filter((e) => e.alive && e.type === type && !e.ov && !e.act); },

  // Override "Dash": kurze Vorwarnung (stehen bleiben, Aufblitzen), dann Sturm mit Tempo `speed`.
  // lock = Richtung wird zu Beginn festgelegt (Sturmangriff, ausweichbar), sonst zielt er laufend (Rush).
  dashOv(e, tele, go, speed, lock, global = false) {
    return { kind: 'dash', phase: 'tele', t: tele, tele, go, speed, lock, dir: dirTo(e.x, e.y, G.player.target.x, G.player.target.y), global };
  },

  // Plätze einer Formation: [nach rechts, nach vorn]
  shapeOffsets(shape, s) {
    const out = [];
    if (shape === 'line') for (let i = 0; i < 7; i++) out.push([(i - 3) * s, 0]);
    else if (shape === 'wedge') { out.push([0, 0]); for (let k = 1; k <= 3; k++) { out.push([k * s * 0.75, -k * s * 0.85]); out.push([-k * s * 0.75, -k * s * 0.85]); } }
    else for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push([(c - 1) * s, -r * s]);       // block 3 x 3
    return out;
  },

  // ---------- Bewegung ----------
  // Rückgabe: { mul } = Tempofaktor für die normale Bewegung des Typs, oder { step, touch } = eigene Bewegung
  // (step = Strecke pro Bild, touch = Berührung tut dem Spieler weh). Darf e.dir ändern.
  steer(e, dt) {
    if (e.ov) {
      const r = this.stepOverride(e, dt);
      if (r) return r;
    }
    const fn = this.base[e.type];
    return fn ? fn(e, dt, G.player.target) : { mul: 1 };
  },

  stepOverride(e, dt) {
    const o = e.ov, tg = G.player.target, p = G.player;
    o.t -= dt;
    if (o.kind === 'dash') {
      if (o.phase === 'tele') {
        e.dir = o.lock ? o.dir : dirTo(e.x, e.y, tg.x, tg.y);
        if (o.t <= 0) { o.phase = 'go'; o.t = o.go; }
        return { step: 0, touch: false };
      }
      if (o.t <= 0) { e.ov = null; return null; }
      e.dir = o.lock ? o.dir : dirTo(e.x, e.y, tg.x, tg.y);
      return { step: o.speed, touch: true };
    }
    if (o.kind === 'scatter') {
      const C = CFG.events.global.scatter;
      if (o.phase === 'out') {
        e.dir = o.dir;
        if (o.t <= 0) { o.phase = 'in'; o.t = C.in; }
        return { step: C.outSpeed, touch: false };
      }
      if (o.t <= 0) { e.ov = null; return null; }
      e.dir = dirTo(e.x, e.y, tg.x, tg.y);
      return { step: C.inSpeed, touch: true };
    }
    if (o.kind === 'ring') {
      if (o.ring.done) { e.ov = null; return null; }
      const sx = p.x + o.ring.r * Math.cos(o.a), sy = p.y + o.ring.r * Math.sin(o.a);
      e.dir = dirTo(e.x, e.y, sx, sy);
      return { step: Math.min(o.ring.speed, Math.hypot(sx - e.x, sy - e.y) / Math.max(0.001, framesOf(dt))), touch: true };
    }
    if (o.kind === 'formation') {
      if (o.g.done) { e.ov = null; return null; }
      const s = o.g.slot(o.i);
      e.x = s[0]; e.y = s[1]; e.dir = o.g.heading;
      return { step: 0, touch: true };
    }
    e.ov = null;
    return null;
  },

  // Basis-Muster je Typ (siehe CFG.patterns)
  base: {
    // Zickzack: schlängelt sich auf den Spieler zu
    phantom(e, dt, tg) { return Elite.phantomSteer(e, dt, tg); },
    bastion(e, dt, tg) { return Elite.bastionSteer(e, dt, tg); },
    circle(e) {
      const C = CFG.patterns.circle;
      e.dir += C.amp * Math.sin(G.realTime * C.freq + e.phase);
      return { mul: 1 };
    },
    // Umkreisen: hält Abstand orbitDist und läuft seitlich um den Spieler (schießt dabei wie bisher)
    triangle(e, dt, tg) {
      const C = CFG.patterns.triangle;
      if (e.dashFrames > 0 || e.mini) return { mul: 1 };
      const d = Math.hypot(tg.x - e.x, tg.y - e.y), bias = clamp((d - C.orbitDist) / 40, -1, 1) * C.pull;
      const toP = dirTo(e.x, e.y, tg.x, tg.y);
      e.dir = toP;                                                       // blickt immer auf den Spieler (bei Blink: auf die letzte Stelle)
      return { step: C.speed, touch: false, move: toP + e.side * (90 - bias) };
    },
    // Artillerie: rückt vor, bleibt ab anchorDist stehen
    square(e, dt, tg) {
      return { mul: Math.hypot(tg.x - e.x, tg.y - e.y) <= CFG.patterns.square.anchorDist ? 0 : 1 };
    },
    // Stop-and-Go: bewegt sich im Takt move / stop
    rhombus(e) {
      const C = CFG.patterns.rhombus;
      return { mul: (e.age + e.phase) % (C.move + C.stop) < C.move ? 1 : 0 };
    },
    // Rammstoß: läuft langsam, aus der Nähe stößt er nach kurzer Vorwarnung schnell vor
    guard(e, dt, tg) {
      const C = CFG.patterns.guard;
      e.bashT -= dt;
      if (e.bashT <= 0) {
        if (Math.hypot(tg.x - e.x, tg.y - e.y) < C.range) {
          e.ov = Patterns.dashOv(e, C.tele, C.go, C.speed, true);
        }
        e.bashT = rand(C.bashMin, C.bashMax);
      }
      return { mul: 1 };
    },
    // Bomber: läuft los, zündet in der Nähe (blinkt, wird langsamer) und explodiert
    bomber(e, dt, tg) {
      const C = CFG.patterns.bomber;
      if (e.fuse === null && Math.hypot(tg.x - e.x, tg.y - e.y) < C.triggerDist) e.fuse = C.fuse;
      if (e.fuse === null) return { mul: 1 };
      e.fuse -= dt;
      if (e.fuse <= 0) { e.alive = false; G.blasts.push(new Blast('bomb', e.x, e.y, false, Stats.enemyName(e))); return { mul: 0 }; }
      return { mul: C.fuseSpeed };
    },
    // Sniper: hält großen Abstand, zielt mit Laserlinie (folgt dem Spieler, bis kurz vor dem Schuss), schießt dann einen schnellen Bolzen
    sniper(e, dt, tg) {
      const C = CFG.patterns.sniper, toP = dirTo(e.x, e.y, tg.x, tg.y);
      if (e.act && e.act.kind === 'snipe') {
        if (e.aimDir === null || e.act.t > C.lockAt) e.aimDir = toP;
        e.dir = e.aimDir;
        return { step: 0, touch: false };
      }
      e.snipeT -= dt;
      if (e.snipeT <= 0 && Math.hypot(tg.x - e.x, tg.y - e.y) <= C.range) {
        e.act = { kind: 'snipe', t: C.tele, tele: C.tele };
        e.aimDir = toP;
        e.snipeT = rand(C.min, C.max);
      }
      return Patterns.kite(e, tg, C);
    },
    // Minenleger: hält Abstand und lässt im Takt Minen fallen
    miner(e, dt, tg) {
      const C = CFG.patterns.miner;
      e.mineT -= dt;
      if (e.mineT <= 0) { e.mineT = rand(C.min, C.max); G.shots.push(new Mine(e.x, e.y)); }
      return Patterns.kite(e, tg, C);
    },
    // Blutsauger: haftet nach Berührung am Spieler und saugt Leben. Dash, Blink, Druckwelle und Schildblase schütteln ihn ab.
    leech(e, dt, tg) {
      const C = CFG.patterns.leech, p = G.player;
      if (e.attached) {
        const shake = SafeSpot.inside || p.dashLeft > 0 || p.blinkT > 0 || p.shield || p.pulseCd > CFG.pulse.cooldown - 0.4;
        if (shake) {
          e.attached = false; e.stun = C.shakeStun; e.reattachCd = C.reattach;
          const a = rand(0, 360); e.x += fwdX(a) * 30; e.y += fwdY(a) * 30;
        } else {
          e.x = p.x + Math.cos(e.phase) * 9; e.y = p.y + Math.sin(e.phase) * 9;
          if (!G.god && !p.invincible) { p.hp -= C.drain * dt; Stats.dealt('BLOODSUCKER', C.drain * dt, false); }
          return { step: 0, touch: false };
        }
      }
      e.reattachCd -= dt;
      if (e.reattachCd <= 0 && e.stun <= 0 && !p.invincible && !p.shield && touchesPlayer(e.x, e.y, e.radius)) e.attached = true;
      return { mul: 1 };
    },
    // Nekromant: hält Abstand, belebt Leichen in Reichweite nach einer Kanalisierungszeit wieder
    necro(e, dt, tg) {
      const C = CFG.patterns.necro;
      if (e.act && e.act.kind === 'raise') return { step: 0, touch: false };
      e.raiseT -= dt;
      if (e.raiseT <= 0) {
        const c = Patterns.nearestCorpse(e, C.range);
        if (c) { e.act = { kind: 'raise', t: C.channel, tele: C.channel, corpse: c }; e.raiseT = rand(C.min, C.max); }
        else e.raiseT = 1;
      }
      return Patterns.kite(e, tg, C);
    },
    // Teleporter: läuft auf den Spieler zu, springt im Takt hinter ihn (Ring zeigt das Ziel)
    teleporter(e, dt, tg) {
      const C = CFG.patterns.teleporter;
      if (e.act && e.act.kind === 'tp') return { step: 0, touch: false };
      e.tpT -= dt;
      if (e.tpT <= 0 && Math.hypot(tg.x - e.x, tg.y - e.y) > C.minDist) { e.act = { kind: 'tp', t: C.tele, tele: C.tele }; e.tpT = rand(C.min, C.max); }
      return { mul: 1 };
    },
    // Unterstützer: hält Abstand (flieht, wenn man zu nah kommt) und wandert sonst seitlich
    support(e, dt, tg) {
      const C = CFG.patterns.support, d = Math.hypot(tg.x - e.x, tg.y - e.y), toP = dirTo(e.x, e.y, tg.x, tg.y);
      if (d < C.fleeDist) e.dir = toP + 180;
      else if (d > C.keepDist + 30) e.dir = toP;
      else e.dir = toP + e.side * 90;
      return { step: d >= C.fleeDist && d <= C.keepDist + 30 ? C.speed * 0.5 : C.speed, touch: false };
    },
  },

  // Abstand halten (Unterstützer, Sniper, Minenleger, Nekromant): flieht unter fleeDist, nähert sich über keepDist, kreist dazwischen
  kite(e, tg, C) {
    const d = Math.hypot(tg.x - e.x, tg.y - e.y), toP = dirTo(e.x, e.y, tg.x, tg.y);
    if (d < C.fleeDist) e.dir = toP + 180;
    else if (d > C.keepDist + 30) e.dir = toP;
    else e.dir = toP + e.side * 90;
    return { step: d >= C.fleeDist && d <= C.keepDist + 30 ? C.speed * 0.5 : C.speed, touch: false };
  },

  // Leiche in Reichweite (für den Nekromanten)
  nearestCorpse(e, range) {
    let best = null, bd = range;
    for (const c of G.director.corpses) { const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; best = c; } }
    return best;
  },

  // Ziel des Teleporters: hinter dem Spieler (bzw. hinter der Stelle, wo er verschwunden ist)
  tpDest(e) {
    const C = CFG.patterns.teleporter, p = G.player, tg = p.target;
    return clampToMap(tg.x - fwdX(p.dir) * C.behind, tg.y - fwdY(p.dir) * C.behind, 15);
  },

  // Splitter: n kleine Kreise an dieser Stelle
  splitlet(e, n) {
    const C = CFG.enemy.splitter;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 360), m = new Enemy('circle', e.x + fwdX(a) * 10, e.y + fwdY(a) * 10, false);
      m.size = C.splitSize; m.splitlet = true; m.minion = e.minion;
      G.enemies.push(m);
    }
  },

  // Aura des Unterstützers (jedes Bild): haste = Verbündete schneller, mend = heilt Verbündete, curse = bremst den Spieler
  supportAura(e, dt) {
    const S = CFG.patterns.support, p = G.player, amp = e.amp > 0;
    const R = S.radius * (amp ? S.ampRadius : 1);
    if (e.kind === 'haste') {
      for (const a of G.enemies) if (a !== e && a.alive && Math.hypot(a.x - e.x, a.y - e.y) < R) a.hasteT = 0.3;
    } else if (e.kind === 'mend') {
      e.mendT -= dt;
      if (e.mendT <= 0) {
        e.mendT = S.kinds.mend.every * (amp ? 0.5 : 1);
        for (const a of G.enemies) if (a !== e && a.alive && a.hitsLeft < a.maxHits && Math.hypot(a.x - e.x, a.y - e.y) < R) { a.hitsLeft++; a.blockFlash = 0.25; }
      }
    } else if (Math.hypot(p.x - e.x, p.y - e.y) < R) p.curseT = 0.3;
  },

  // ---------- Aktionen der lokalen Events (laufen nach der Vorwarnung) ----------
  acts: {
    volley(e) { const d = dirTo(e.x, e.y, G.player.target.x, G.player.target.y); for (const off of [-14, 0, 14]) G.shots.push(Object.assign(new EnemyBolt(e.x, e.y, d + off), { src: Stats.enemyName(e) })); },
    barrage(e) { const d = dirTo(e.x, e.y, G.player.target.x, G.player.target.y); for (const off of [-16, 16]) G.shots.push(Object.assign(new Missile(e.x, e.y, d + off), { src: Stats.enemyName(e) })); },
    chain(e) { G.blasts.push(new Blast('wave', e.x, e.y, false, Stats.enemyName(e))); },
    switch(e) { e.armor = e.armor === 'plate' ? 'mirror' : 'plate'; e.blockFlash = 0.4; },
    amplify(e) { e.amp = CFG.patterns.support.ampTime; },
    ignite(e) { if (e.fuse === null) e.fuse = CFG.patterns.bomber.fuse; },
    divide(e) { Patterns.splitlet(e, 1); },
    snipe(e) { const C = CFG.patterns.sniper; G.shots.push(Object.assign(new EnemyBolt(e.x, e.y, e.aimDir === null ? e.dir : e.aimDir, C.boltSpeed, C.boltFrames), { src: Stats.enemyName(e) })); },
    minefield(e) { const n = CFG.patterns.miner.count; for (let i = 0; i < n; i++) { const a = e.phase * 57 + (360 / n) * i; G.shots.push(new Mine(e.x + fwdX(a) * 28, e.y + fwdY(a) * 28)); } },
    raise(e, a) {
      const list = G.director.corpses;
      const c = a && a.corpse && list.includes(a.corpse) ? a.corpse : Patterns.nearestCorpse(e, CFG.patterns.necro.range);
      if (!c) return;
      list.splice(list.indexOf(c), 1);
      const m = new Enemy(c.type, c.x, c.y, false);
      m.raised = true;
      m.minion = G.bossFight;                                    // im Bosskampf zählt der Wiederbelebte als Minion (sonst würde er sofort entfernt)
      G.enemies.push(m);
    },
    tp(e) { const d = Patterns.tpDest(e); e.x = d[0]; e.y = d[1]; e.stun = 0.25; },
    stomp(e) { G.blasts.push(new Blast('bomb', e.x, e.y, false, Stats.enemyName(e))); },
  },

  // Lokales Event: alle freien Gegner dieses Typs gleichzeitig
  localEvent(type, list) {
    const C = CFG.events.local[type];
    for (const e of list) {
      if (C.act) e.act = { kind: C.act, t: C.tele, tele: C.tele };
      else e.ov = this.dashOv(e, C.tele, C.go, CFG.enemy[type].speed * C.speedMul, false);
    }
  },

  // ---------- Globale Events ----------
  canStart(kind) {
    const C = CFG.events.global[kind], free = G.enemies.filter((e) => e.alive && !e.ov && !e.act && !e.elite);
    if (G.enemies.some((e) => e.ov && e.ov.global)) return false;           // es läuft schon eins
    if (C.from && G.time < C.from) return false;
    if (C.minEnemies && free.length < C.minEnemies) return false;
    return true;
  },

  startGlobal(kind) {
    const C = CFG.events.global[kind], P = STYLE.pal, p = G.player;
    const free = G.enemies.filter((e) => e.alive && !e.ov && !e.act && !e.elite);
    if (kind === 'charge') {
      G.notice('CHARGE!', P.red, STYLE.type.h1);
      for (const e of free) e.ov = this.dashOv(e, C.tele, C.go, C.speed, true, true);
    } else if (kind === 'scatter') {
      G.notice('SCATTER!', P.yellow, STYLE.type.h1);
      const base = rand(0, 360);
      free.sort(() => Math.random() - 0.5).forEach((e, i) => {
        const deg = base + (360 / free.length) * i;
        e.ov = { kind: 'scatter', phase: 'out', t: C.out, dir: dirTo(0, 0, Math.cos(deg * DEG), Math.sin(deg * DEG)), global: true };
      });
    } else if (kind === 'formation') {
      G.notice('FORMATION!', P.orange, STYLE.type.h1);
      const types = C.types.filter((t) => t !== 'rhombus' || G.time > CFG.waves.length);
      const [sx, sy] = G.director.randomSpawnPoint();
      G.director.groups.push(new Formation(types[randInt(0, types.length - 1)], C.shapes[randInt(0, C.shapes.length - 1)], sx, sy));
    } else if (kind === 'surround') {
      G.notice('SURROUND!', P.red, STYLE.type.h1);
      G.director.groups.push(new SurroundRing());
    }
  },

  // Leichen, die der Nekromant wiederbeleben kann (blasse grüne Ringe, die ausblenden)
  drawCorpses(ctx) {
    const P = STYLE.pal;
    ctx.save();
    ctx.fillStyle = P.green;
    for (const c of G.director.corpses) {
      const cx = STAGE_W / 2 + c.x, cy = STAGE_H / 2 - c.y;
      ctx.globalAlpha = Math.min(1, c.t / 3) * 0.28;
      pxRing(ctx, cx, cy, 7, 1);
      pxLine(ctx, cx - 3, cy - 3, cx + 3, cy + 3, 1); pxLine(ctx, cx + 3, cy - 3, cx - 3, cy + 3, 1);
    }
    ctx.restore();
  },

  // ---------- Zeichnen: Vorwarnung und Auren (wird von Enemy.draw aufgerufen) ----------
  drawFx(ctx, e) {
    const P = STYLE.pal, cx = STAGE_W / 2 + e.x, cy = STAGE_H / 2 - e.y, o = e.ov;
    ctx.save();
    if (o && o.kind === 'dash' && o.phase === 'tele') {
      const k = 1 - o.t / o.tele, col = e.type === 'circle' ? P.yellow : P.red;
      if (o.lock) {                                                       // Linie zeigt die Angriffsrichtung
        ctx.globalAlpha = 0.25 + 0.4 * k; ctx.fillStyle = col;
        pxDashLine(ctx, cx, cy, cx + fwdX(o.dir) * 220, cy - fwdY(o.dir) * 220, 1, 3);
      }
      ctx.globalAlpha = 0.3 + 0.5 * k; ctx.fillStyle = col;
      pxRing(ctx, cx, cy, e.radius * (1.8 - 0.5 * k), 1);
    } else if (e.act) {
      const k = 1 - e.act.t / e.act.tele;
      ctx.globalAlpha = 0.3 + 0.6 * k; ctx.fillStyle = e.type === 'guard' ? P.ice : P.yellow;
      pxRing(ctx, cx, cy, e.radius * (2.2 - 1.1 * k), 1);
    }
    if (e.act && e.act.kind === 'snipe' && e.aimDir !== null) {            // Laserlinie des Snipers
      const C = CFG.patterns.sniper, k = 1 - e.act.t / e.act.tele, locked = e.act.t <= C.lockAt;
      ctx.globalAlpha = locked ? 0.95 : 0.25 + 0.4 * k; ctx.fillStyle = locked ? P.redHi : P.red;
      pxLine(ctx, cx, cy, cx + fwdX(e.aimDir) * C.range, cy - fwdY(e.aimDir) * C.range, 1);
    }
    if (e.act && e.act.kind === 'raise' && e.act.corpse) {                 // Nekromant verbindet sich mit der Leiche
      const c = e.act.corpse, k = 1 - e.act.t / e.act.tele;
      ctx.globalAlpha = 0.3 + 0.5 * k; ctx.fillStyle = P.green;
      pxDashLine(ctx, cx, cy, STAGE_W / 2 + c.x, STAGE_H / 2 - c.y, 1, 3);
      pxRing(ctx, STAGE_W / 2 + c.x, STAGE_H / 2 - c.y, 12 * (1.6 - 0.6 * k), 1);
    }
    if (e.act && e.act.kind === 'tp') {                                    // Ring am Sprungziel des Teleporters
      const d = Patterns.tpDest(e), k = 1 - e.act.t / e.act.tele;
      ctx.globalAlpha = 0.3 + 0.6 * k; ctx.fillStyle = P.yellow;
      pxRing(ctx, STAGE_W / 2 + d[0], STAGE_H / 2 - d[1], 14 * (1.5 - 0.5 * k), 1);
    }
    if (e.type === 'support') {                                           // Aura
      const S = CFG.patterns.support, col = S.kinds[e.kind].color, R = S.radius * (e.amp > 0 ? S.ampRadius : 1);
      ctx.globalAlpha = 0.10 + 0.04 * Math.sin(G.realTime * 4); ctx.fillStyle = col;
      pxGlow(ctx, cx, cy, R);
      ctx.globalAlpha = 0.45; pxRing(ctx, cx, cy, R, 1, Math.max(8, Math.round(R / 7)));
    }
    ctx.restore();
  },
};
