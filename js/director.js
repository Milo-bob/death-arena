// Der "Spielleiter": entscheidet, wann welche Gegner, Spawner, Powerups und Bosse erscheinen.

class Director {
  constructor() {
    this.timers = { c: null, t: null, r: null, s: null, g: null, p: null };   // Wartezeit bis zum nächsten Gegner je Typ (g = Schild-Gegner, p = Unterstützer)
    this.mapFoeT = {};                                      // Wartezeit je kartenspezifischer Variante (CFG.maps[].foes)
    this.extraT = {};                                    // Wartezeit je neuem Gegnertyp (CFG.extraSpawn)
    this.corpses = [];                                      // gefallene Gegner, die der Nekromant wiederbeleben kann
    this.groups = [];                                       // laufende Formationen und Ringe (Gegner-Events)
    this.eventT = null;                                     // Wartezeit bis zum nächsten globalen Gegner-Event
    this.localT = {};                                       // Wartezeit je Gegnertyp bis zum nächsten lokalen Event
    this.spawnerStage = 'first';                            // first -> wait -> afterBoss
    this.spawnerT = 0;
    this.afterBossHold = 0;
    this.powerT = CFG.powerup.firstAt;
    this.moonWave = -1;                                     // Welle, für die der Blutmond schon ausgewürfelt wurde
    this.moonStart = null;                                  // Start in Sekunden seit Wellenbeginn (oder null = kein Blutmond)
    this.meteorWave = -1;                                   // wie beim Blutmond: Welle, für die der Meteoritenhagel ausgewürfelt wurde
    this.meteorStart = null;
    this.meteorT = 0;                                       // Wartezeit bis zum nächsten Meteoriten
    this.collapseWave = -1;                                 // Welle, für die die schrumpfende Arena ausgewürfelt wurde
    this.collapseStart = null;
    this.obstT = 0;                                         // Wartezeit bis zur nächsten neuen Barrikade
    this.obstFill = true;                                   // true: alle fehlenden Barrikaden sofort aufstellen (Lauf-Beginn, nach einem Boss)
  }

  // Wartezeit-Faktor für alle Gegner außer den vier Grundtypen (die laufen über waves()): CFG.spawnAll.rate mal Kartenfaktor
  get spawnAllFactor() { return CFG.spawnAll.rate * G.diff.allRate * G.diff.spawn * this.infRate * Hero.world().allRate; }
  get infRate() { return G.infinite ? CFG.infinite.spawnRate : 1; }       // Endlos-Modus: mehr Gegner (kuerzere Wartezeiten)
  get infCap() { return G.infinite ? CFG.infinite.capMul : 1; }

  // Spawn-Intervalle zur aktuellen Spielzeit (Sekunden zwischen zwei Gegnern)
  waves(time) {
    const W = CFG.waves;
    const phase = time < W.length ? W.phase1 : time < 2 * W.length ? W.phase2 : W.phase3;
    const w = Object.assign({ rMin: 0, rMax: 0, sMin: 0, sMax: 0 }, phase);
    if (time >= 2 * W.length) {
      let n = W.shrinkTimes.filter((t) => time >= t).length;
      if (time >= W.shrinkFrom) n += Math.floor((time - W.shrinkFrom) / W.shrinkEvery) + 1;
      for (const k of Object.keys(w)) w[k] -= n * W.shrinkStep;
    }
    const fl = W.floors;
    for (const k of Object.keys(fl)) w[k] = Math.max(w[k], fl[k]);
    // Quadrat: Untergrenze 2.5 für das Maximum (wie im Original)
    if (w.sMin < 2.5) w.sMax = 2.5;
    w.sMin = Math.max(0, w.sMin);
    // insgesamt etwas schneller spawnen, im Blutmond noch einmal
    const factor = W.rateFactor * G.diff.rate * (G.bloodMoon ? CFG.bloodMoon.spawnFactor : 1) * G.diff.spawn * this.infRate * Hero.world().rate;
    const trim = G.map.trim || {};                         // Kartenspezifisch: manche normale Gegner seltener (c/t/r/s), weil Karten-Gegner sie ersetzen
    const TYPE_OF = { c: 'circle', t: 'triangle', r: 'rhombus', s: 'square' };
    for (const k of Object.keys(w)) w[k] *= factor * (trim[k[0]] || 1) * Hero.type(TYPE_OF[k[0]]).wait;       // Held-Modifier (Harbinger): Wartezeit je Typ
    return w;
  }

  randomSpawnPoint() {
    // feste Spawnpunkte am Rand des Startbildes (siehe CFG.spawnPoints)
    const list = G.spawnPointList();
    return list[randInt(0, list.length - 1)];
  }

  // Leichen (für den Nekromanten): verschwinden nach einer Weile und sofort, wenn kein Nekromant mehr lebt (auch im Bosskampf)
  updateCorpses(dt) {
    for (const c of this.corpses) c.t -= dt;
    this.corpses = this.corpses.filter((c) => c.t > 0);
    if (!G.enemies.some((n) => n.alive && n.type === 'necro')) this.corpses = [];
  }

  update(dt) {
    this.updateCorpses(dt);
    this.updateSpawner(dt);
    this.updatePowerups();
    this.updateCoreDrops(dt);
    this.updateBloodMoon();
    this.updateMeteors(dt);
    this.updateCollapse(dt);
    this.updateObstacles(dt);
    if (G.bossFight) {
      this.timers = { c: null, t: null, r: null, s: null, g: null, p: null };
      this.groups = [];
      return;
    }
    const time = G.time;
    this.updateEvents(dt);
    if (this.updateFlood(dt)) return;     // während der Flut ruht der normale Takt
    const w = this.waves(time);
    const active = { c: true, t: true, r: time > CFG.waves.length, s: time >= 2 * CFG.waves.length };
    const ranges = { c: [w.cMin, w.cMax], t: [w.tMin, w.tMax], r: [w.rMin, w.rMin], s: [w.sMin, w.sMax] };
    const types = { c: 'circle', t: 'triangle', r: 'rhombus', s: 'square', g: 'guard', p: 'support' };
    const GD = CFG.guardSpawn;
    const gShrink = time >= GD.shrinkFrom ? Math.floor((time - GD.shrinkFrom) / 60) + 1 : 0;
    active.g = time >= GD.from;
    const SS = CFG.supportSpawn;
    active.p = time >= SS.from && G.enemies.filter((e) => e.alive && e.type === 'support').length < Math.ceil(SS.maxAlive * CFG.spawnAll.capMul * G.diff.capMul * this.infCap * Hero.world().cap);
    ranges.p = [SS.min, SS.max];
    ranges.g = [Math.max(GD.floor, GD.min - gShrink), Math.max(GD.floor, GD.max - gShrink)];
    const sa = this.spawnAllFactor;
    this.spawnExtra(dt);
    this.spawnMapFoes(dt);
    for (const k of ['c', 't', 'r', 's', 'g', 'p']) {
      if (!active[k]) continue;
      if (this.timers[k] === null) this.timers[k] = rand(ranges[k][0], ranges[k][1]) * (k === 'g' || k === 'p' ? sa : 1);       // Schild/Unterstützer: Spawn-Faktor aller Gegner
      this.timers[k] -= dt;
      if (this.timers[k] <= 0) {
        this.timers[k] = null;
        const [x, y] = this.randomSpawnPoint();
        G.enemies.push(new Enemy(types[k], x, y, false));
      }
    }
  }

  // Kartenspezifische Gegner (CFG.maps[].foes, Varianten in CFG.variants): je Variante ein eigener Takt, nur auf Karte 2 und 3
  spawnMapFoes(dt) {
    for (const F of G.map.foes || []) {
      if (G.time < F.from || G.enemies.filter((e) => e.alive && e.V === CFG.variants[F.v]).length >= Math.ceil(F.maxAlive * Hero.world().cap)) continue;
      if (this.mapFoeT[F.v] === undefined) this.mapFoeT[F.v] = rand(F.min, F.max) * this.spawnAllFactor * Hero.type(CFG.variants[F.v].base).wait;
      this.mapFoeT[F.v] -= dt;
      if (this.mapFoeT[F.v] > 0) continue;
      delete this.mapFoeT[F.v];
      const [x, y] = this.randomSpawnPoint();
      G.enemies.push(new Enemy(CFG.variants[F.v].base, x, y, false, F.v));
    }
  }

  // Weitere Gegnertypen (CFG.extraSpawn): je Typ ein eigener Takt
  spawnExtra(dt) {
    for (const type of Object.keys(CFG.extraSpawn)) {
      const C0 = CFG.extraSpawn[type], C = G.eliteUp && C0.up ? Object.assign({}, C0, C0.up) : C0;       // Elite-Gegner: nach dem Upgrade kuerzerer Takt und mehr gleichzeitig
      if (G.time < C.from || G.enemies.filter((e) => e.alive && e.type === type).length >= (C.fixedCap ? C.maxAlive : Math.ceil(C.maxAlive * CFG.spawnAll.capMul * G.diff.capMul * this.infCap * (C.fixedCap ? 1 : Hero.world().cap)))) continue;
      if (this.extraT[type] === undefined) this.extraT[type] = rand(C.min, C.max) * this.spawnAllFactor * ((G.map.trim || {})[type] || 1) * Hero.type(type).wait;
      this.extraT[type] -= dt;
      if (this.extraT[type] > 0) continue;
      delete this.extraT[type];
      const [x, y] = this.randomSpawnPoint();
      G.enemies.push(new Enemy(type, x, y, false));
    }
  }

  // Gegner-Events (Code der Events: patterns.js). Globale Events betreffen alle Gegner, lokale alle eines Typs.
  updateEvents(dt) {
    for (const g of this.groups) g.update(dt);
    this.groups = this.groups.filter((g) => !g.done);
    const E = CFG.events;
    if (G.time < E.from || G.flood) return;
    // global
    if (this.eventT === null) this.eventT = rand(E.min, E.max);
    this.eventT -= dt;
    if (this.eventT <= 0) {
      const opts = Object.keys(E.global).filter((k) => Patterns.canStart(k));
      if (!opts.length) this.eventT = 5;
      else {
        let roll = Math.random() * opts.reduce((a, k) => a + E.global[k].weight, 0), kind = opts[0];
        for (const k of opts) { if (roll < E.global[k].weight) { kind = k; break; } roll -= E.global[k].weight; }
        Patterns.startGlobal(kind);
        this.eventT = rand(E.min, E.max);
      }
    }
    // lokal
    for (const type of Object.keys(E.local)) {
      const C = E.local[type];
      if (G.time < C.from) continue;
      if (this.localT[type] === undefined) this.localT[type] = rand(C.min, C.max);
      this.localT[type] -= dt;
      if (this.localT[type] > 0) continue;
      const list = Patterns.free(type);
      if (list.length < C.minCount) { this.localT[type] = 2; continue; }
      Patterns.localEvent(type, list);
      this.localT[type] = rand(C.min, C.max);
    }
  }

  // Blutmond: pro Welle wird einmal gewürfelt, ob und wann (zwischen Ende der Flut und dem Boss) er kommt.
  // Wie bei der Flut ergibt sich der Zustand allein aus der Spielzeit.
  updateBloodMoon() {
    const B = CFG.bloodMoon, F = CFG.flood, L = CFG.waves.length;
    if (G.bossFight) { this.setBloodMoon(false); return; }
    const wave = Math.floor(G.time / L), into = G.time - wave * L;
    if (wave !== this.moonWave) {
      this.moonWave = wave;
      this.moonStart = null;
      const lo = F.at + F.duration + B.afterFlood, hi = L - B.duration - B.beforeBoss;
      if (wave >= B.fromWave && hi >= lo && Math.random() < B.chance) this.moonStart = rand(lo, hi);
    }
    const active = this.moonStart !== null && into >= this.moonStart && into < this.moonStart + B.duration;
    this.setBloodMoon(active, active ? this.moonStart + B.duration - into : 0);
  }

  setBloodMoon(active, left = 0) {
    G.bloodMoonLeft = left;
    if (active === G.bloodMoon) return;
    G.bloodMoon = active;
    if (active) {
      G.notice('CRIMSON ECLIPSE!', STYLE.pal.red, STYLE.type.h1);
      for (const e of G.enemies) e.makeBlooded();               // wer schon da ist, wird auch stärker
    } else {
      G.notice('ECLIPSE ENDED', STYLE.pal.green);
    }
  }

  // Barrikaden: Zielanzahl wächst pro Welle. Zu Beginn und nach einem Boss werden alle fehlenden auf einmal aufgestellt, sonst eine alle `respawn` Sekunden.
  updateObstacles(dt) {
    const C = CFG.obstacles;
    if (G.bossFight) { this.obstFill = true; return; }
    const target = Math.min(C.max, C.start + Math.floor(G.time / CFG.waves.length) * C.perWave), have = G.obstacles.filter((o) => o.alive).length;
    if (have >= target) { this.obstT = C.respawn; return; }
    this.obstT -= dt;
    if (this.obstT > 0 && !this.obstFill) return;
    for (let n = have; n < target; n++) {
      const pos = this.freeObstaclePos();
      if (pos) G.obstacles.push(new Obstacle(pos[0], pos[1]));
      if (!this.obstFill) break;
    }
    this.obstFill = false;
    this.obstT = C.respawn;
  }

  // Zufällige freie Stelle auf der Karte (Abstand zu Spieler, anderen Barrikaden und Spawnpunkten), null wenn nichts gefunden
  freeObstaclePos() {
    const C = CFG.obstacles, p = G.player;
    for (let t = 0; t < 30; t++) {
      let x, y;
      if (CFG.map.infinite) { const a = rand(0, 360), d = rand(150, 380); x = p.x + fwdX(a) * d; y = p.y + fwdY(a) * d; }          // unendliche Karte: in der Nähe des Spielers aufstellen
      else [x, y] = clampToMap(rand(-CFG.map.halfW, CFG.map.halfW), rand(-CFG.map.halfH, CFG.map.halfH), C.margin);
      if (dist2(x, y, p.x, p.y) < C.minPlayer * C.minPlayer) continue;
      if (G.obstacles.some((o) => o.alive && dist2(x, y, o.x, o.y) < C.minOther * C.minOther)) continue;
      if (G.spawnPointList().some(([sx, sy]) => dist2(x, y, sx, sy) < C.minSpawn * C.minSpawn)) continue;
      return [x, y];
    }
    return null;
  }

  // Meteoritenhagel: pro Welle einmal würfeln, ob und wann er vor der Flut kommt (Zustand ergibt sich aus der Spielzeit, wie beim Blutmond).
  // Während des Hagels fällt alle `every` Sekunden ein Meteorit (Code: meteors.js). Im Bosskampf ruht der Hagel.
  updateMeteors(dt) {
    const M = CFG.meteors, F = CFG.flood, L = CFG.waves.length;
    if (G.bossFight) { this.setMeteorShower(false); return; }
    const wave = Math.floor(G.time / L), into = G.time - wave * L;
    if (wave !== this.meteorWave) {
      this.meteorWave = wave;
      this.meteorStart = null;
      const hi = F.at - M.duration - M.beforeFlood;
      if (wave >= M.fromWave && hi >= M.startMin && Math.random() < M.chance) this.meteorStart = rand(M.startMin, hi);
    }
    const active = this.meteorStart !== null && into >= this.meteorStart && into < this.meteorStart + M.duration;
    this.setMeteorShower(active, active ? this.meteorStart + M.duration - into : 0);
    if (!active) return;
    this.meteorT -= dt;
    if (this.meteorT > 0) return;
    this.meteorT += Math.max(M.everyMin, M.every - wave * M.everyStep);
    let x, y;
    if (Math.random() < M.aimShare) [x, y] = clampToMap(G.player.x + rand(-M.aimJitter, M.aimJitter), G.player.y + rand(-M.aimJitter, M.aimJitter), 20);
    else [x, y] = clampToMap(G.cam.x + rand(-(STAGE_W / 2 - 10), STAGE_W / 2 - 10), G.cam.y + rand(-170, 170), 20);
    G.meteors.push(new Meteor(x, y));
  }

  // Schrumpfende Arena: pro Welle einmal würfeln (Zustand ergibt sich aus der Spielzeit). G.arenaScale wird hier weich verändert;
  // im Bosskampf gehört sie dem Arena-Boss (endBossFight setzt sie zurück), im Endlos-Modus gibt es keine Wände.
  updateCollapse(dt) {
    const C = CFG.collapse, L = CFG.waves.length;
    if (CFG.map.infinite || G.bossFight) { this.setCollapse(false); return; }
    const wave = Math.floor(G.time / L), into = G.time - wave * L;
    if (wave !== this.collapseWave) {
      this.collapseWave = wave;
      this.collapseStart = null;
      const hi = L - C.duration - C.beforeBoss;
      if (wave >= C.fromWave && hi >= C.startMin && Math.random() < C.chance) this.collapseStart = rand(C.startMin, hi);
    }
    const active = this.collapseStart !== null && into >= this.collapseStart && into < this.collapseStart + C.duration;
    const sinceStart = active ? into - this.collapseStart : 0;
    this.setCollapse(active, active ? this.collapseStart + C.duration - into : 0);
    G.collapseWarn = active && sinceStart < C.warn;
    G.arenaTarget = active && !G.collapseWarn ? C.minScale : 1;
    G.arenaScale += clamp(G.arenaTarget - G.arenaScale, -C.speed * dt, C.speed * dt);
    if (G.arenaScale >= 1) return;
    // Alles, was außerhalb der kleineren Karte liegt: Barrikaden brechen weg, Pickups werden hereingezogen
    const hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale;
    for (const o of G.obstacles) if (o.alive && (Math.abs(o.x) > hw - 4 || Math.abs(o.y) > hh - 4)) o.alive = false;
    for (const list of [G.powerups, G.drops]) for (const it of list) [it.x, it.y] = clampToMap(it.x, it.y, 10);
  }

  setCollapse(active, left = 0) {
    G.collapseLeft = left;
    if (!active) G.collapseWarn = false;
    if (active === G.collapse) return;
    G.collapse = active;
    if (active) {
      G.notice('ARENA COLLAPSING!', STYLE.pal.red, STYLE.type.h1);
      Sfx.play('event');
      Juice.shake(3);
    } else if (!G.bossFight) G.notice('ARENA RESTORED', STYLE.pal.green);
  }

  setMeteorShower(active, left = 0) {
    G.meteorLeft = left;
    if (active === G.meteorShower) return;
    G.meteorShower = active;
    if (active) {
      this.meteorT = 0.5;
      G.notice('METEOR SHOWER!', STYLE.pal.orange, STYLE.type.h1);
      Sfx.play('event');
    } else if (!G.bossFight) G.notice('SHOWER OVER', STYLE.pal.green);
  }

  // Gegnerflut: läuft zur Mitte jeder Welle. Gibt true zurück, solange sie aktiv ist.
  // Der Zustand ergibt sich allein aus der Spielzeit, es gibt keinen eigenen Timer für Beginn/Ende.
  updateFlood(dt) {
    const F = CFG.flood;
    const wave = Math.floor(G.time / CFG.waves.length);          // 0 = erste Welle
    const into = G.time - wave * CFG.waves.length;               // Sekunden seit Wellenbeginn
    const active = into >= F.at && into < F.at + F.duration;
    if (active !== G.flood) {
      G.flood = active;
      if (active) { G.notice('SWARM SURGE!', STYLE.pal.red, STYLE.type.h1); this.floodT = 0; }
      else G.notice('SURGE SURVIVED', STYLE.pal.green);
    }
    if (!active) return false;
    this.floodT -= dt;
    if (this.floodT <= 0) {
      this.floodT += Math.max(F.everyMin, F.every - wave * F.everyStep) * this.spawnAllFactor;
      const w = Object.assign({}, F.weights);
      if (wave < 1) w.rhombus = 0;
      if (wave < 2) w.square = 0;
      if (G.time < CFG.guardSpawn.from) w.guard = 0;
      if (G.time < CFG.supportSpawn.from) w.support = 0;
      for (const k of Object.keys(CFG.extraSpawn)) if (G.time < CFG.extraSpawn[k].from) w[k] = 0;
      let roll = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
      let type = 'circle';
      for (const [k, v] of Object.entries(w)) { if (roll < v) { type = k; break; } roll -= v; }
      const [x, y] = this.randomSpawnPoint();
      G.enemies.push(new Enemy(type, x, y, false));
    }
    return true;
  }

  updateSpawner(dt) {
    const S = CFG.spawner;
    if (this.spawnerStage === 'first') {
      if (G.time > S.firstAt && !G.bossFight) {
        G.spawners.push(new Spawner(G.cam.x, G.cam.y));
        this.spawnerStage = 'wait';
        this.spawnerT = rand(S.respawnMin, S.respawnMax);
      }
    } else if (this.spawnerStage === 'wait') {
      this.spawnerT -= dt;
      if (this.spawnerT <= 0) {
        if (G.bossFight) { this.spawnerStage = 'afterBoss'; this.afterBossHold = 0; }
        else this.placeSpawner();
      }
    } else if (!G.bossFight) {
      // nach einem Bosskampf noch 10 s warten
      this.afterBossHold += dt;
      if (this.afterBossHold >= 10) this.placeSpawner();
    }
  }

  placeSpawner() {
    G.spawners.push(new Spawner(...clampToMap(G.cam.x + rand(-150, 150), G.cam.y + rand(-100, 100), 30)));
    this.spawnerStage = 'wait';
    this.spawnerT = rand(CFG.spawner.respawnMin, CFG.spawner.respawnMax);
  }

  // Core Emitter (Meta-Stat): alle X Sekunden bekommt der Spieler automatisch einen Core
  updateCoreDrops(dt) {
    const lv = Save.bonus('coreDrop'), C = CFG.coreDrop;
    if (!lv || Tutorial.active) return;
    this.coreT = (this.coreT === undefined ? C.base - lv : this.coreT) - dt;
    if (this.coreT > 0) return;
    this.coreT += C.base - lv;
    const p = G.player;                                       // wird automatisch eingesammelt: gelbes Zeichen + Impuls-Ring um den Spieler
    G.lootCores += C.value;
    G.addText('dmgCore', p.x, p.y + 12);
    G.trigger('', STYLE.pal.yellow, { radius: 46, rings: 1, life: 0.7, flash: 0 });
    Sfx.play('buy');
  }

  updatePowerups() {
    const P = CFG.powerup;
    const early = G.time < P.earlyUntil + 0.01;
    if (G.time > this.powerT && G.powerups.length === 0) {
      G.powerups.push(new PowerUp(...clampToMap(G.cam.x + rand(-(STAGE_W / 2 - 30), STAGE_W / 2 - 30), G.cam.y + rand(-150, 150), 20), early ? P.earlyHeal : P.lateHeal));
      this.powerT += early ? rand(P.earlyEveryMin, P.earlyEveryMax) : rand(P.lateEveryMin, P.lateEveryMax);
    }
  }

  // Welcher Boss kommt als Nächstes? Reihenfolge aus CFG.boss.order, nach dem letzten beginnt sie von vorn
  nextBossType() {
    const order = G.map.bossOrder || CFG.boss.order;       // Karte 2 und 3 ersetzen einzelne Kämpfe durch eigene Bosse (gleiche Anzahl und Zeitpunkte)
    return order[G.bossCount++ % order.length];
  }

  // Bosse: gleiche Rechnung wie im Original (BossStageOctagon / BossStageKite)
  updateBosses() {
    if (G.bossFight || G.finalStarted) return;
    if (G.finalAt !== null && G.time >= G.finalAt) { G.finalStarted = true; G.startBossFight('reaper'); return; }       // das Spiel endet nur über diesen Boss
    if (!G.infinite && G.bossCount >= (G.map.bossOrder || CFG.boss.order).length) return;       // Standardmodus: jeder Boss genau einmal, danach kommt direkt der finale Boss (Endlos-Modus loopt)
    const steps = CFG.boss.steps;
    if (G.time > steps * G.bossStageOctagon - 0.1) {
      if (G.time > 239.9) G.bossStageOctagon++;
      G.bossStageOctagon++;
      G.startBossFight(this.nextBossType());
    } else if (G.time > steps * G.bossStageKite - 0.1) {
      G.bossStageKite += 2;
      G.startBossFight(this.nextBossType());
    }
  }
}
