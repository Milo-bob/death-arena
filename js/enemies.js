// Gegner, ihre Geschosse, Spawner und Heil-Powerups.
// Grundidee: jedes Ding hat update(dt) und draw(ctx), und alive = false heißt "weg damit".

// ---------- Kollisions-Abfragen gegen die Spieler-Waffen ----------

// Erste Waffe, die einen Gegner verletzt (Schwert, Schuss, Dash-Spur, Beam)
function weaponHit(x, y, r) {
  for (const a of G.attacks) if (a.alive && a.damaging && a.hitsCircle(x, y, r)) return a;
  return null;
}

// Wie weaponHit, aber nur für bestimmte Angriffsarten (Schild-Gegner: was verletzt ihn, was prallt ab)
function weaponHitOf(x, y, r, kinds) {
  for (const a of G.attacks) if (a.alive && a.damaging && kinds.includes(a.kind) && a.hitsCircle(x, y, r)) return a;
  return null;
}

// Geschosse werden von Schwert, Schuss, Schild und Beam gestoppt
function blockedByPlayerGear(x, y, r) {
  for (const a of G.attacks) {
    if (a.alive && (a.kind === 'sword' || a.kind === 'lance' || a.kind === 'shot' || a.kind === 'shield' || a.kind === 'beam') && a.hitsCircle(x, y, r)) return true;
  }
  return false;
}

// Schadensfaktor gegen Bosse (Artefakt Schadensboost)
function damageBoost() {
  return (Save.equipped('artifact') === 'damage' ? 1 + CFG.items.damage.boss * Save.gearMul('damage') : 1) + Save.bonus('power') + Xp.val('power', 'boss') + (G.player && G.player.buffs.power > 0 ? CFG.drops.types.power.boss : 0);
}

function touchesShield(x, y, r) {
  const sh = G.player.shield;
  return !!(sh && sh.alive && sh.hitsCircle(x, y, r));
}

function touchesPlayer(x, y, r) {
  return circlesOverlap(x, y, r, G.player.x, G.player.y, G.player.radius);
}

// ---------- Normale Gegner ----------
// Gruppen von Typen: wer läuft einfach auf den Spieler zu (CHASERS), wer tut bei Berührung weh (TOUCHERS), wer schießt über Enemy.attack (SHOOTERS),
// wer zählt beim Besiegen doppelt für das Ultimate (HEAVY), von wem bleibt eine Leiche für den Nekromanten (CORPSE_TYPES).
const CHASERS = ['circle', 'bomber', 'splitter', 'leech', 'teleporter', 'tank'];
const TOUCHERS = ['circle', 'splitter', 'teleporter', 'tank'];
const SHOOTERS = ['triangle', 'square', 'rhombus'];
const HEAVY = ['square', 'rhombus', 'guard', 'support', 'sniper', 'miner', 'necro', 'tank', 'teleporter', 'phantom', 'bastion'];
const CORPSE_TYPES = ['circle', 'triangle', 'square', 'rhombus', 'guard', 'bomber', 'teleporter'];
class Enemy {
  // type: 'circle' | 'triangle' | 'square' | 'rhombus'; mini = Miniboss (größer, mehr Leben)
  constructor(type, x, y, mini, variant = null) {      // variant: kartenspezifische Variante aus CFG.variants (Basistyp = type, siehe mapspecial.js)
    this.type = type;
    this.mini = mini;
    this.x = x;
    this.y = y;
    this.dir = 0;
    this.alive = true;
    const V = this.V = variant && !mini ? CFG.variants[variant] : null;
    this.size = mini ? CFG.enemy.miniSize : (CFG.enemy[type].size || CFG.enemy.size) * (V ? V.size : 1);
    this.hitsLeft = mini ? CFG.enemy.miniHits : V && V.hits ? V.hits : CFG.enemy[type].hits ? CFG.enemy[type].hits : (type === 'square' || type === 'rhombus') ? 2 : 1;
    if (!Tutorial.active) this.hitsLeft = Math.max(this.hitsLeft, Math.round(this.hitsLeft * CFG.enemy.hitsMul * (G.diff.hits || 1) * Hero.world().hits * Hero.type(type).hits));     // Zähigkeit (CFG.enemy.hitsMul x Kartenfaktor diff.hits, Karte 1 = unverändert)
    this.armor = type === 'guard' ? (Math.random() < 0.5 ? 'plate' : 'mirror') : null;   // Schild-Gegner: Rüstungsart
    this.blockFlash = 0;                // kurzes Aufblitzen, wenn ein Angriff abprallt
    this.hitFlash = 0;                  // kurzes Aufblitzen bei einem Treffer, der nicht tötet
    this.cracks = null;                 // Risse (cracks): beim ersten Bedarf erzeugt
    this.maxHits = this.hitsLeft;       // Obergrenze fürs Heilen (Unterstützer: mend)
    this.minion = false;                // vom Beschwörer-Boss gerufen: verschwindet mit dem Boss
    this.ov = null;                     // Bewegungs-Override eines Events (siehe patterns.js)
    this.act = null;                    // Aktion mit Vorwarnung (lokale Events)
    this.age = 0;
    this.phase = rand(0, 6.28);         // Versatz für Zickzack und Stop-and-Go, damit nicht alle im Gleichtakt laufen
    this.side = Math.random() < 0.5 ? 1 : -1;      // Umlaufrichtung (Dreieck) bzw. Ausweichseite (Unterstützer)
    this.bashT = rand(CFG.patterns.guard.bashMin, CFG.patterns.guard.bashMax);
    this.hasteT = 0;                    // > 0: von einem Unterstützer beschleunigt
    this.amp = 0;                       // > 0: Unterstützer-Aura verstärkt (AMPLIFY)
    this.mendT = 0;
    this.fuse = null;                   // Bomber: Sekunden bis zur Explosion (null = noch nicht gezündet)
    this.hitCd = 0;                     // Tank: Pause zwischen zwei Treffern
    this.attached = false;              // Blutsauger: haftet am Spieler
    this.reattachCd = 0;
    this.aimDir = null;                 // Sniper: Zielrichtung
    this.snipeT = rand(1.5, 3);
    this.mineT = rand(1, 2);
    this.raiseT = rand(2, 4);
    this.tpT = rand(2, 4);
    this.splitlet = false;              // kleiner Kreis aus einem Splitter (keine Drops, keine Leiche)
    this.raised = false;                // vom Nekromanten wiederbelebt
    this.kind = type === 'support' ? ['haste', 'mend', 'curse'][randInt(0, 2)] : null;   // Art der Aura
    this.blooded = false;               // vom Blutmond gestärkt
    if (G.bloodMoon) this.makeBlooded();
    this.stun = 0;                      // nach einem Treffer: Gegner bleibt kurz stehen
    this.dashFrames = type === 'triangle' && !mini ? CFG.enemy.triangle.dashFrames : 0;
    const e = CFG.enemy;
    this.shootT = type === 'triangle' ? e.triangle.shootFirst
      : type === 'square' ? e.square.missileFirst
      : type === 'rhombus' ? e.rhombus.waveFirst : 0;
    this.dmgMul = 1;                    // Schadensfaktor dieses Gegners (Elite-Gegner machen mehr Schaden, siehe elites.js)
    this.elite = false;
    if (CFG.elite[type]) Elite.init(this);
  }

  get radius() { return CFG.enemy[this.type].radius * this.size / CFG.enemy.size; }

  // Blutmond: schneller und mehr Leben (bleibt bis zum Tod, auch wenn der Blutmond endet)
  makeBlooded() {
    if (this.blooded) return;
    this.blooded = true;
    this.hitsLeft += CFG.bloodMoon.extraHits;
    this.maxHits += CFG.bloodMoon.extraHits;
  }
  // Quadrat und Raute bleiben stehen, wenn sie nur noch 1 Leben haben
  get halted() { return (this.type === 'square' || this.type === 'rhombus') && this.hitsLeft === 1; }

  update(dt) {
    // im Bosskampf und während Ultimate/Bloodburst verschwinden alle normalen Gegner
    if ((G.clearing || G.bossFight) && !this.minion) { this.alive = false; return; }
    if (this.minion && !G.bossFight) { this.alive = false; return; }       // Minions verschwinden mit dem Boss
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    let f = framesOf(dt) * (this.blooded ? CFG.bloodMoon.speedFactor : 1) * G.diff.speed * Hero.world().speed * Hero.type(this.type).speed * (this.V && this.V.speed ? this.V.speed : 1);       // Karten-Schwierigkeit, Variante
    if (this.hasteT > 0) { f *= CFG.patterns.support.kinds.haste.mult; this.hasteT -= dt; }
    const p = G.player;
    if (p.buffs.chrono > 0) f *= CFG.drops.types.chrono.slow;                // Chrono-Buff: Gegner laufen langsamer
    f *= SafeSpot.slow();                                                    // Safe Spot: alle Gegner bremsen (und weichen unten zurück)
    if (p.hasField && Math.hypot(this.x - p.x, this.y - p.y) <= CFG.field.radius + this.radius) {   // Kraftfeld: langsamer + kleiner Dauerschaden
      f *= 1 - (1 - CFG.field.slow) * Save.gearMul('field');
      this.fieldDmg = (this.fieldDmg || 0) + CFG.field.dps * Save.gearMul('field') * dt;
      if (this.fieldDmg >= 1) {
        this.fieldDmg -= 1;
        if (this.hitsLeft <= 1) { this.die(); return; }
        this.hitsLeft--;
      }
    }
    const e = CFG.enemy;
    this.stun = Math.max(0, this.stun - dt);
    if (this.elite) this.stun = 0;                                  // Elite-Gegner werden nie betaeubt
    this.blockFlash = Math.max(0, this.blockFlash - dt);
    this.amp = Math.max(0, this.amp - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    const tg = p.target, lost = tg !== p;                          // Blink: Gegner laufen zur letzten bekannten Stelle
    this.dir = dirTo(this.x, this.y, tg.x, tg.y);
    if (lost && Math.hypot(tg.x - this.x, tg.y - this.y) < 10) f = 0;   // dort angekommen: stehen bleiben
    const r = this.radius;
    if (G.hazards.length || MapEnv.gust) {                                 // Umgebung (mapenv.js): Schlackenband schiebt, Säurepfütze bremst
      const [bx, by] = MapEnv.pushAt(this.x, this.y, r), fr = framesOf(dt);
      this.x += bx * fr; this.y += by * fr;
      f *= MapEnv.slowAt(this.x, this.y, r, false);
    }
    const onShield = touchesShield(this.x, this.y, r);

    // Aktion mit Vorwarnung (lokales Event) und Bewegungsmuster (siehe patterns.js)
    if (this.act) {
      this.act.t -= dt;
      if (this.act.t <= 0) { const a = this.act; this.act = null; Patterns.acts[a.kind](this, a); }
    }
    const pat = Patterns.steer(this, dt);
    f *= pat.mul === undefined ? 1 : pat.mul;

    if (pat.step !== undefined) {                                  // eigene Bewegung (Event oder Muster)
      let step = this.stun <= 0 ? pat.step : 0;
      if (onShield) step -= CFG.enemy[this.type].push || 2;
      if (pat.move !== undefined) { const face = this.dir; this.dir = pat.move; moveForward(this, step * f); this.dir = face; }     // Laufrichtung getrennt von der Blickrichtung (Dreieck)
      else moveForward(this, step * f);
      if (pat.touch && touchesPlayer(this.x, this.y, r)) p.hit('touch', this.dmgMul, Stats.enemyName(this));
    } else if (CHASERS.includes(this.type)) {
      const C = e[this.type];
      let step = this.stun <= 0 || this.type === 'tank' ? C.speed : 0;       // der Tank wird nie betäubt
      if (this.mini && this.type === 'circle' && !onShield) step += C.miniExtraSpeed;
      if (onShield) step -= C.push;
      moveForward(this, step * f);
      if (TOUCHERS.includes(this.type) && touchesPlayer(this.x, this.y, r)) p.hit('touch', 1, Stats.enemyName(this));
    } else if (this.type === 'triangle') {
      if (this.dashFrames > 0) {
        moveForward(this, e.triangle.dashSpeed * f);
        this.dashFrames -= f;
      } else if (this.mini && !onShield) {
        moveForward(this, e.triangle.miniSpeed * f);
      }
    } else if (this.type === 'guard') {
      let step = this.stun <= 0 ? e.guard.speed : 0;
      if (onShield) step -= e.guard.push;
      moveForward(this, step * f);
      if (touchesPlayer(this.x, this.y, r)) p.hit('touch', 1, Stats.enemyName(this));
    } else if (this.type === 'square' || this.type === 'rhombus') {
      const c = e[this.type];
      if (!this.halted) {
        let step = this.stun <= 0 ? c.speed : 0;
        if (onShield) step -= c.push;
        moveForward(this, step * f);
      }
    }

    if (this.V && this.V.trail && !this.minion) {                   // Hazmat: lässt Giftwolken hinter sich fallen
      this.trailT = (this.trailT === undefined ? this.V.trail : this.trailT) - dt;
      if (this.trailT <= 0) { this.trailT = this.V.trail; dropCloud(this.x, this.y); }
    }
    if (this.stun <= 0 || this.type === 'tank') SafeSpot.retreat(this, dt);       // Safe Spot: Rückzug vom Spot
    [this.x, this.y] = clampToMap(this.x, this.y, this.radius);     // Gegner bleiben immer in der Arena (auch nach Rueckstoss, Sog oder Events)

    const busy = this.ov || this.act || SafeSpot.inside;           // Events pausieren das Schießen (im Safe Spot auch)
    if (!busy) this.shootT -= dt;
    if (!busy && this.shootT <= 0 && (SHOOTERS.includes(this.type) || this.type === 'phantom')) this.attack();
    if (this.type === 'support') Patterns.supportAura(this, dt);

    if (this.type === 'guard') {
      const A = e.guard.armor[this.armor];
      if (this.stun <= 0 && weaponHitOf(this.x, this.y, r, A.hurts)) this.takeHit();
      const bounced = weaponHitOf(this.x, this.y, r, A.blocks);
      if (bounced) {
        if (bounced.kind === 'shot') bounced.alive = false;     // der Schuss zerplatzt am Schild
        this.blockFlash = 0.15;
      }
    } else if (this.type === 'bastion') {
      Elite.bastionHit(this, r);                                      // Schildfront haelt Schuesse ab
    } else if (this.stun <= 0) {
      const w = weaponHit(this.x, this.y, r);
      if (w) { this.takeHit(true, w.kind); if (w.kind === 'sword' && this.alive) this.bladeKnock(); }
    }
  }

  // Plasma Blade haelt Gegner ab: kurze Betaeubung und Rueckstoss vom Spieler weg (Tanks und Bosse bleiben stehen)
  bladeKnock() {
    if (this.type === 'tank' || this.elite) return;
    const C = CFG.sword, p = G.player, dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
    this.stun = Math.min(this.stun, C.stun);
    [this.x, this.y] = clampToMap(this.x + dx / d * Loadout.sword.knock, this.y + dy / d * Loadout.sword.knock, this.radius);
  }

  attack() {
    const e = CFG.enemy;
    const p = G.player;
    if (this.type === 'phantom') { Elite.phantomFire(this); return; }
    const V = this.V, aim = dirTo(this.x, this.y, p.target.x, p.target.y), fan = V && V.fan ? V.fan : 1;       // Variante: Fächer aus mehreren Geschossen
    const off = (i) => (i - (fan - 1) / 2) * (V && V.fanSpread ? V.fanSpread : 0);
    if (this.type === 'triangle') {
      this.shootT += V && V.every ? V.every : e.triangle.shootEvery;
      Sfx.play('enemyShot');
      for (let i = 0; i < fan; i++) G.shots.push(Object.assign(new EnemyBolt(this.x, this.y, aim + off(i)), { src: Stats.enemyName(this), chill: !!(V && V.chill) }));
    } else if (this.type === 'square') {
      this.shootT += V && V.every ? V.every : e.square.missileEvery;
      Sfx.play('missile');
      for (let i = 0; i < fan; i++) G.shots.push(Object.assign(new Missile(this.x, this.y, aim + off(i)), { src: Stats.enemyName(this), chill: !!(V && V.chill) }));
    } else if (this.type === 'rhombus') {
      this.shootT += e.rhombus.waveEvery;
      G.blasts.push(Object.assign(new Blast('wave', this.x, this.y, false, Stats.enemyName(this)), { chill: !!(V && V.chill) }));
      if (V && V.drop) dropCloud(this.x, this.y);                  // Blighter: Giftwolke unter sich
    }
  }

  // stun = false: Dauerschaden (Feuer) betaeubt nicht. Artefakt Schadensboost: mit etwas Chance doppelter Schaden
  // src = Art des Angriffs (der Tank nimmt je nach Art unterschiedlich viel Schaden, siehe CFG.enemy.tank.dmg)
  takeHit(stun = true, src = null) {
    const dc = (Save.equipped('artifact') === 'damage' ? CFG.items.damage.chance * Save.gearMul('damage') : 0) + Save.bonus('power') + Xp.val('power', 'chance') + (G.player.buffs.power > 0 ? CFG.drops.types.power.chance : 0);       // Chance auf doppelten Treffer (Implant + Meta-Upgrade Power)
    let n = Math.random() < dc ? 2 : 1;
    this.killSrc = src;                                     // Run-Statistik: womit wurde zuletzt getroffen
    if (this.type === 'tank') {
      const T = CFG.enemy.tank;
      if (this.hitCd > 0) return;
      this.hitCd = T.hitCd; n *= T.dmg[src] || 1; stun = false;
    }
    if (this.elite) {                                       // Elite-Gegner: nur alle `gate` Sekunden ein Treffer, starke Waffen zaehlen mehrfach
      const E = CFG.elite[this.type];
      if (this.hitCd > 0) return;
      this.hitCd = this.mk === 2 ? E.gate2 : E.gate; n *= (E.dmgTable && E.dmgTable[src]) || 1; stun = false;
    }
    Cos2.hit(this.x, this.y);                               // Cosmetic HITS: bei jedem Treffer, egal womit
    if (this.hitsLeft <= n) { this.die(); return; }
    this.hitsLeft -= n;
    if (stun) this.stun = CFG.enemy.stun;
    if (this.hitFx) {                                       // sichtbares und hörbares Feedback: der Treffer hat gewirkt
      this.hitFlash = 0.14;
      Juice.sparks(this.x, this.y, this.hitFx === 'glitch' ? STYLE.pal.cyan : STYLE.pal.yellow, 3, 2);
      Sfx.play(this.hitFx === 'cracks' ? 'crack' : 'hit');
    }
  }

  // Art der Treffer-Anzeige (siehe CFG.enemy.hitFx) oder null, wenn der Gegner nur 1 Leben hat bzw. Quadrat/Raute ist
  get hitFx() {
    if (this.maxHits <= 1) return null;
    if (this.mini) return 'cracks';
    if (this.type === 'square' || this.type === 'rhombus') return null;
    return CFG.enemy.hitFx[this.type] || 'cracks';
  }
  get damageFrac() { return clamp(1 - this.hitsLeft / this.maxHits, 0, 1); }

  die() {
    this.alive = false;
    Sfx.play(this.mini || HEAVY.includes(this.type) ? 'killBig' : 'kill');
    Cos.killSparks(this.x, this.y, this.mini ? STYLE.pal.yellow : STYLE.pal.orange, this.mini ? 10 : HEAVY.includes(this.type) ? 6 : 4);
    G.player.heal(CFG.enemy.killHeal + Xp.val('leech') + (Save.equipped('artifact') === 'vampire' ? CFG.items.vampire.heal * Save.gearMul('vampire') : 0) + (G.player.buffs.vampire > 0 ? CFG.drops.types.vampire.heal : 0));
    G.addUlt((HEAVY.includes(this.type) ? 2 : 1) * (G.bloodMoon ? CFG.bloodMoon.ultFactor : 1) * Perk.mul('ultMul'));
    Perk.onKill(this);
    G.addCombo();
    G.kills++;
    Ach.kill(this);
    Stats.kill(this.killSrc);
    Xp.drop(this);
    if (!this.splitlet && !this.minion && !this.elite) noteFallen(this);
    if (this.type === 'splitter') Patterns.splitlet(this, CFG.enemy.splitter.splitCount);
    const D = G.director;
    if (!this.raised && !this.splitlet && CORPSE_TYPES.includes(this.type) && D.corpses.length < 12 && G.enemies.some((n) => n.alive && n.type === 'necro')) D.corpses.push({ x: this.x, y: this.y, type: this.type, t: CFG.patterns.necro.corpseLife });
    if (!this.splitlet && Math.random() < (this.mini || this.elite ? CFG.drops.miniChance : G.bloodMoon ? CFG.bloodMoon.dropChance : G.flood ? CFG.flood.dropChance : CFG.drops.chance) * (Save.equipped('artifact') === 'lucky' ? 1 + (CFG.items.lucky.mult - 1) * Save.gearMul('lucky') : 1) * (1 + Save.bonus('luck') + Xp.val('luck')) * Hero.mods().luck * Perk.mul('dropMul')) G.drops.push(new Drop(this.x, this.y));
    if (this.type === 'rhombus') G.blasts.push(new Blast('wave', this.x, this.y, false, Stats.enemyName(this)));
    if (this.V && !this.splitlet && !G.clearing) {                      // kartenspezifische Variante: Besonderheit beim Tod (Cinder: Funkenexplosion, Spore: Giftwolke)
      if (this.V.death === 'ember') G.blasts.push(new Blast('ember', this.x, this.y, false, Stats.enemyName(this)));
      else if (this.V.death === 'cloud') dropCloud(this.x, this.y);
      else if (this.V.death === 'frost') G.blasts.push(Object.assign(new Blast('ember', this.x, this.y, false, Stats.enemyName(this)), { chill: true }));       // Rime: Frostring
    }
    const fx = this.hitFx;                                  // Todesanimation passend zur Treffer-Anzeige
    if (fx === 'swell') { G.blasts.push(new Pop(this.x, this.y, this.radius * 3.2, STYLE.pal.orange)); Juice.sparks(this.x, this.y, STYLE.pal.orange, 14, 5); Juice.shake(1.5); }
    else if (fx === 'cracks') { G.blasts.push(new Pop(this.x, this.y, this.radius * 2, STYLE.pal.ice)); Juice.sparks(this.x, this.y, STYLE.pal.white, 10, 4.5); }
    else if (fx === 'glitch') Juice.sparks(this.x, this.y, STYLE.pal.cyan, 10, 4);
  }

  // Risse: 7 Linien aus der Mitte (zufälliger Winkel, Länge, ein Knick), je mehr Schaden, desto mehr werden sichtbar. Gezeichnet als Pixel (pxCracks).
  drawCracks(ctx, cx, cy) {
    if (!this.cracks) {
      this.cracks = [];
      for (let i = 0; i < 7; i++) this.cracks.push([(i / 7) * 6.283 + rand(-0.4, 0.4), rand(0.55, 1.05), rand(-0.7, 0.7)]);
    }
    pxCracks(ctx, cx, cy, this.cracks, this.radius * 1.05, Math.ceil(this.damageFrac * this.cracks.length));
  }

  draw(ctx) {
    let img = CFG.enemy[this.type].sprite || this.type;
    if (this.halted) img += '1hp';
    if (this.elite) img = Elite.sprite(this);                // umgefaerbte Kopie (einmal berechnet) statt Farbfilter in jedem Bild
    if (this.type === 'guard') img = this.armor === 'plate' ? 'guardPlate' : 'guardMirror';
    Patterns.drawFx(ctx, this);                              // Vorwarnung / Aura unter dem Gegner
    if (this.elite) Elite.drawFx(ctx, this);
    const hue = (this.mini ? -27 : 0) + (this.V ? this.V.hue : 0) + (this.stun > 0 ? -18 : 0) + (this.kind ? CFG.patterns.support.kinds[this.kind].hue : 0);
    if (this.blooded) {                                      // dunkelroter Schein unter gestärkten Gegnern
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(G.realTime * 6);
      ctx.fillStyle = STYLE.pal.red;
      pxGlow(ctx, STAGE_W / 2 + this.x, STAGE_H / 2 - this.y, this.radius * 1.55);
      ctx.restore();
    }
    let bright = this.blockFlash > 0 ? 1.9 : 0;
    if (this.fuse !== null && Math.floor(G.realTime * (5 + (1 - this.fuse) * 14)) % 2 === 0) bright = 1.7;     // Bomber blinkt immer schneller
    const fx = this.hitFx, frac = fx ? this.damageFrac : 0, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    let size = this.size, ox = 0, oy = 0;
    if (this.hitFlash > 0) bright = Math.max(bright, 2.2);                                   // Treffer: kurz weiß aufblitzen
    if (fx === 'swell' && frac > 0) {                                                        // schwillt an, pulsiert immer schneller, glüht
      const pulse = Math.sin(G.realTime * (8 + frac * 22));
      size *= 1 + 0.45 * frac + 0.05 * pulse * (0.4 + frac) + (this.hitFlash > 0 ? 0.12 : 0);
      if (this.hitFlash <= 0) bright = Math.max(bright, 1 + 0.6 * frac * (0.5 + 0.5 * pulse));
      ctx.save(); ctx.globalAlpha = 0.25 * frac; ctx.fillStyle = STYLE.pal.orange;
      pxGlow(ctx, cx, cy, this.radius * (1.2 + 0.7 * frac)); ctx.restore();
    } else if (fx === 'glitch' && frac > 0) {                                                // flackert, zuckt, zeigt einen versetzten Geist
      if (Math.random() < 0.25 + 0.4 * frac) { ox = rand(-2, 2) * (0.5 + frac); oy = rand(-1, 1) * (0.5 + frac); }
      drawSprite(ctx, img, this.x - ox * 2, this.y + oy, this.dir, this.size, { hue: 150, alpha: 0.35 + 0.3 * frac });
    }
    if (this.hitFlash > 0 && fx !== 'swell') size *= 1.08;                                   // kleiner Ruck beim Treffer
    drawSprite(ctx, Cos.enemySprite(img, this), this.x + ox, this.y - oy, this.dir, size, { hue, brightness: bright, alpha: this.act && this.act.kind === 'tp' ? 0.45 : 1 });
    Cos.drawEnemyFx(ctx, Cos.cur('enemy'), this, G.realTime, G.player);
    if (fx === 'cracks' && frac > 0) this.drawCracks(ctx, cx, cy);
  }
}

// Reiner Effekt ohne Schaden: ein Ring, der sich ausdehnt (Tod geschwollener oder zersplitterter Gegner)
class Pop {
  constructor(x, y, r, color) { this.x = x; this.y = y; this.r = r; this.color = color; this.age = 0; this.alive = true; }
  update(dt) { this.age += dt; if (this.age > 0.28) this.alive = false; }
  draw(ctx) {
    const k = this.age / 0.28, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, r = this.r * (0.3 + 0.7 * k);
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.3 * (1 - k); pxDisc(ctx, cx, cy, r);
    ctx.globalAlpha = 1 - k; pxRing(ctx, cx, cy, r, k < 0.5 ? 2 : 1);
    ctx.restore();
  }
}

// Risse als Pixel-Linien: zwei Segmente je Riss (mit Knick), weiß mit orangem Schatten einen Pixel versetzt.
// cracks = Liste [Winkel, Länge, Knick], r = Radius des Körpers, n = wie viele Risse sichtbar sind
function pxCracks(ctx, cx, cy, cracks, r, n) {
  const P = STYLE.pal;
  ctx.save();
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass === 0 ? P.orange : P.white;
    const o = pass === 0 ? PIXEL : 0;
    for (const [a, len, bend] of cracks.slice(0, n)) {
      const mx = Math.cos(a) * r * len * 0.5, my = Math.sin(a) * r * len * 0.5;
      const ex = mx + Math.cos(a + bend) * r * len * 0.5, ey = my + Math.sin(a + bend) * r * len * 0.5;
      pxLine(ctx, cx + o, cy + o, cx + mx + o, cy + my + o);
      pxLine(ctx, cx + mx + o, cy + my + o, cx + ex + o, cy + ey + o);
    }
  }
  ctx.restore();
}

// ---------- Geschosse ----------
// Gerader Schuss des Dreiecks
class EnemyBolt {
  constructor(x, y, dir, speed = CFG.enemy.bolt.speed, frames = CFG.enemy.bolt.frames) {     // Sniper schießt schneller und weiter
    this.x = x; this.y = y; this.dir = dir;
    this.alive = true;
    this.speed = speed;
    this.frames = frames;
    this.ghost = 0;
    this.src = 'TRIANGLE';          // Name der Quelle fuer die Run-Statistik (wird vom Schuetzen ueberschrieben)
  }
  update(dt) {
    if (G.clearing || G.bossFight) { this.alive = false; return; }
    const f = framesOf(dt);
    moveForward(this, this.speed * f);
    this.ghost += 3 * f;
    this.frames -= f;
    const r = CFG.enemy.bolt.radius;
    if (hitObstacle(this.x, this.y, r, CFG.obstacles.dmg.bolt)) this.alive = false;               // Deckung
    else if (touchesPlayer(this.x, this.y, r)) { G.player.hit('shoot', this.mul || 1, this.src); if (this.chill) G.player.chill(CFG.chill.dur); this.alive = false; }
    else if (blockedByPlayerGear(this.x, this.y, r) || this.frames <= 0) this.alive = false;
  }
  draw(ctx) { drawSprite(ctx, 'enemyShot', this.x, this.y, this.dir, 150, { alpha: 1 - this.ghost / 100, hue: this.chill ? 170 : 0 }); }
}

// Zielsuchende Rakete des Quadrats
class Missile {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.dir = dir;
    this.alive = true;
    this.frames = CFG.enemy.missile.frames;
    this.ghost = 0;
    this.src = 'SQUARE';
  }
  update(dt) {
    if (G.clearing || G.bossFight) { this.alive = false; return; }
    const f = framesOf(dt);
    const tg = G.player.target;                              // wie die Gegner: Phase und Köder lenken die Rakete ab
    steerTowards(this, tg.x, tg.y, CFG.enemy.missile.turn * f);
    moveForward(this, CFG.enemy.missile.speed * f);
    this.ghost += 0.5 * f;
    this.frames -= f;
    const r = CFG.enemy.missile.radius;
    if (hitObstacle(this.x, this.y, r, CFG.obstacles.dmg.missile)) this.alive = false;            // Deckung
    else if (touchesPlayer(this.x, this.y, r)) { G.player.hit('shoot', 1, this.src); if (this.chill) G.player.chill(CFG.chill.dur); this.alive = false; }
    else if (blockedByPlayerGear(this.x, this.y, r) || this.frames <= 0) this.alive = false;
  }
  draw(ctx) { drawSprite(ctx, 'missile', this.x, this.y, this.dir, 175, { alpha: 1 - this.ghost / 100, hue: this.chill ? 170 : 0 }); }
}

// Kurze Druckwelle: 'wave' (Raute) oder 'boom' (Explosion des Boss-Mörsers)
const BLAST_STAGES = {
  wave: [
    { t: 0.15, img: 'wave1', size: 500, r: 12.5 }, { t: 0.1, img: 'wave2', size: 515, r: 15.5 },
    { t: 0.05, img: 'wave3', size: 530, r: 18.5 }, { t: 0.1, img: 'wave4', size: 545, r: 21.8 },
  ],
  bomb: [                                   // Bomber, Minen und Tank-Stampfen: größere Explosion
    { t: 0.15, img: 'wave2', size: 600, r: 26 }, { t: 0.1, img: 'wave3', size: 700, r: 36 }, { t: 0.1, img: 'wave4', size: 800, r: 46 },
  ],
  ember: [                                  // Cinder-Tod: kleine Funkenexplosion
    { t: 0.12, img: 'wave2', size: 380, r: 12 }, { t: 0.1, img: 'wave3', size: 480, r: 20 }, { t: 0.1, img: 'wave4', size: 580, r: 28 },
  ],
  boom: [
    { t: 0.15, img: 'wave2', size: 300, r: 9 }, { t: 0.1, img: 'wave2', size: 350, r: 10.5 },
    { t: 0.05, img: 'wave3', size: 400, r: 14 }, { t: 0.1, img: 'wave4', size: 500, r: 20 },
  ],
};

class Blast {
  constructor(kind, x, y, silent = false, src = null) {       // silent: der Erzeuger spielt seinen eigenen Klang (Meteorit); src: Name der Quelle fuer die Run-Statistik
    this.kind = kind;
    this.src = src || ({ wave: 'RHOMBUS', ember: 'CINDER', boom: 'KITE MORTAR' })[kind] || 'EXPLOSION';
    this.mul = 1;                       // Schadensfaktor (Boss-Explosionen: bossPower().dmg, siehe bossBlast in bosses.js)
    this.x = x; this.y = y;
    this.dir = 0;
    this.alive = true;
    this.age = 0;
    if (!silent) Sfx.play(kind === 'wave' ? 'wave' : 'blast');
    if (kind !== 'wave') {                                  // Explosionen beschädigen Barrikaden im Radius (auch die der Meteoriten und Bomber)
      const st = BLAST_STAGES[kind];
      hurtObstaclesInRadius(x, y, st[st.length - 1].r, CFG.obstacles.dmg[kind]);
    }
    if (kind !== 'wave' && dist2(x, y, G.player.x, G.player.y) < 160 * 160) Juice.shake(kind === 'bomb' ? 2 : 1);      // Explosionen in der Naehe wackeln leicht
    this.damageKind = kind === 'wave' ? 'touch' : 'shoot';
  }
  stage() {
    let t = this.age;
    const stages = BLAST_STAGES[this.kind];
    for (let i = 0; i < stages.length; i++) {
      if (t < stages[i].t) return i;
      t -= stages[i].t;
    }
    return -1;
  }
  update(dt) {
    if (G.clearing && this.kind === 'wave') { this.alive = false; return; }
    this.age += dt;
    const i = this.stage();
    if (i < 0) { this.alive = false; return; }
    const st = BLAST_STAGES[this.kind][i];
    if (this.kind === 'wave' && this.age > 0.1) {
      // wandert langsam auf den Spieler zu, das Schild drückt sie zurück
      const tg = G.player.target;
      this.dir = dirTo(this.x, this.y, tg.x, tg.y);
      let step = CFG.enemy.wave.drift;
      if (touchesShield(this.x, this.y, st.r)) step -= CFG.enemy.wave.push;
      moveForward(this, step * framesOf(dt));
    }
    if (touchesPlayer(this.x, this.y, st.r)) { G.player.hit(this.damageKind, this.mul, this.src); if (this.chill) G.player.chill(CFG.chill.dur); }
  }
  draw(ctx) {
    const i = this.stage();
    if (i < 0) return;
    const st = BLAST_STAGES[this.kind][i];
    drawSprite(ctx, st.img, this.x, this.y, 90, st.size, { alpha: 1 - 0.05 * i, hue: this.chill ? 170 : 0 });
  }
}

// ---------- Mine (vom Minenleger): wird nach arm Sekunden scharf, explodiert bei Berührung oder wenn eine Waffe sie trifft ----------
// Liegt in G.shots (wird von Druckwelle und Granate weggeräumt wie Geschosse).
class Mine {
  constructor(x, y) { this.x = x; this.y = y; this.alive = true; this.age = 0; }
  update(dt) {
    const C = CFG.patterns.miner;
    if (G.clearing || G.bossFight) { this.alive = false; return; }
    this.age += dt;
    if (this.age > C.life) { this.alive = false; return; }
    if ((this.age >= C.arm && touchesPlayer(this.x, this.y, C.triggerR)) || weaponHit(this.x, this.y, 8)) this.explode();
  }
  explode() { this.alive = false; G.blasts.push(new Blast('bomb', this.x, this.y, false, 'MINE')); }
  draw(ctx) {
    const P = STYLE.pal, C = CFG.patterns.miner, armed = this.age >= C.arm, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    ctx.save();
    if (this.age > C.life - 2 && Math.floor(this.age * 8) % 2 === 0) ctx.globalAlpha = 0.4;      // blinkt kurz vor dem Verschwinden
    ctx.fillStyle = P.redDark; pxDisc(ctx, cx, cy, 6);
    ctx.fillStyle = armed ? P.red : P.greyMid; pxRing(ctx, cx, cy, 6, 1);
    ctx.fillStyle = armed && Math.floor(G.realTime * 4) % 2 === 0 ? P.yellow : P.red;
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.restore();
  }
}

// ---------- Spawner = "Breach Gate" (zerstörbares Tor, das Gegner in Schüben ausspuckt) ----------
// Ablauf: Auftauchen (unverwundbar) -> alle paar Sekunden Schub (Kern leuchtet, Ring zieht sich zusammen, dann kommen die Gegner)
// -> zerstören: Heilung + Ultimate + Miniboss; sonst bricht das Tor nach lifetime Sekunden zusammen (kleine Heilung).
// Zahlen in CFG.spawner, Sprite 'spawner' (tools/gen_art.js), Kern/Ringe/Lebensleiste werden hier aus Pixeln gezeichnet.
class Spawner {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.alive = true;
    this.maxHp = this.hp = randInt(CFG.spawner.hpMin, CFG.spawner.hpMax);
    this.age = 0;
    this.hitCd = 0;
    this.pulseT = CFG.spawner.arrive + 1.2;        // Zeit bis zum ersten Schub
    this.warn = 0;                                 // > 0: Schub angekündigt, Restzeit
    G.notice('BREACH OPENED!', STYLE.pal.red);
    Sfx.play('warn');
    Juice.sparks(x, y, STYLE.pal.red, 14, 3);
  }
  get arriving() { return this.age < CFG.spawner.arrive; }
  burstSize() { const s = CFG.spawner; return Math.min(s.burstMax, s.burstBase + Math.floor(G.time / s.burstEvery)); }
  update(dt) {
    if (G.bossFight) { this.alive = false; return; }     // im Bosskampf verschwinden Spawner ohne Belohnung
    this.age += dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    const s = CFG.spawner;
    const r = s.radius;

    if (this.arriving) { this.hp = this.maxHp; return; }      // noch nicht angreifbar

    if (this.hitCd <= 0 && weaponHit(this.x, this.y, r)) { this.hp -= 1; this.hitCd = s.hitCooldown; Juice.sparks(this.x, this.y, STYLE.pal.red, 3, 2.5); Sfx.play('crateHit'); }
    for (const a of G.attacks) {
      if (a.alive && (a.kind === 'ult') && a.hitsCircle(this.x, this.y, r)) this.hp -= s.ultDamage * framesOf(dt);
    }
    if (this.hp < 1) {
      G.addUlt(s.rewardUlt);
      G.powerups.push(new PowerUp(this.x, this.y, s.rewardHeal));
      if (!G.clearing) spawnMiniboss(this.x, this.y);
      Juice.sparks(this.x, this.y, STYLE.pal.red, 26, 5); Juice.sparks(this.x, this.y, STYLE.pal.yellow, 10, 3); Juice.shake(3);
      Sfx.play('crateBreak');
      this.alive = false;
      return;
    }
    if (this.age > s.arrive + s.lifetime) {
      G.powerups.push(new PowerUp(this.x, this.y, s.timeoutHeal));
      Juice.sparks(this.x, this.y, STYLE.pal.grey, 14, 2);
      this.alive = false;
      return;
    }

    if (this.warn > 0) {                                         // Schub angekündigt: nach telegraph s kommen die Gegner
      this.warn -= dt;
      if (this.warn <= 0) this.burst();
    } else {
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.warn = s.telegraph; Sfx.play('tick'); }
    }
  }
  burst() {
    const s = CFG.spawner;
    this.pulseT = this.hp < this.maxHp * s.pulseFastBelow ? s.pulseFast : s.pulseEvery;
    if (G.enemies.length >= s.enemyCap) return;
    const n = this.burstSize(), a0 = rand(0, 360);
    for (let i = 0; i < n; i++) {
      const roll = Math.random() * 100, type = roll < 90 ? (randInt(1, 2) === 1 ? 'circle' : 'triangle') : (randInt(1, 3) < 3 ? 'square' : 'rhombus');
      const a = (a0 + i * 360 / n) * DEG;
      G.enemies.push(new Enemy(type, this.x + Math.cos(a) * 24, this.y + Math.sin(a) * 24, false));
    }
    Juice.sparks(this.x, this.y, STYLE.pal.orange, 8, 3);
    Juice.shake(1);
    Sfx.play('wave');
  }
  draw(ctx) {
    const P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, S = CFG.spawner, t = G.realTime;
    const k = this.arriving ? clamp(this.age / S.arrive, 0, 1) : 1;               // Auftauchen: wächst und wird sichtbar
    const left = S.arrive + S.lifetime - this.age, dying = !this.arriving && left < 8;
    const shake = dying && Math.floor(t * 20) % 2 === 0 ? PIXEL : 0;              // kurz vorm Zusammenbruch zittert das Tor
    ctx.save();
    // Bodenschein + langsam drehender Außenring
    ctx.globalAlpha = 0.35 * k; ctx.fillStyle = P.redDark; pxGlow(ctx, cx, cy, 34);
    ctx.globalAlpha = k; ctx.fillStyle = dying ? P.yellow : P.redMid; pxRing(ctx, cx, cy, 27, 1, 8, t * 0.12);
    if (this.arriving) {                                                          // Auftauchen: Ring zieht sich zum Tor zusammen
      ctx.globalAlpha = 1 - k; ctx.fillStyle = P.red; pxRing(ctx, cx, cy, 46 - 26 * k, 2);
    } else {                                                                      // Restzeit-Bogen (leert sich im Uhrzeigersinn)
      ctx.globalAlpha = 0.9; ctx.fillStyle = dying ? (Math.floor(t * 6) % 2 ? P.yellow : P.red) : P.red;
      pxArc(ctx, cx, cy, 31, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * clamp(left / S.lifetime, 0, 1), 1);
    }
    ctx.restore();
    drawSprite(ctx, this.hitCd > 0 ? 'spawnerHit' : 'spawner', this.x + shake, this.y, 0, 200 * k, { alpha: k });
    if (this.arriving) return;
    ctx.save();
    // Kern in der Fassung: pulsiert, vor einem Schub schnell und hell, Ring zieht sich zusammen
    const w = this.warn > 0 ? 1 - this.warn / S.telegraph : 0, pulse = 0.5 + 0.5 * Math.sin(t * (this.warn > 0 ? 24 : 4));
    ctx.fillStyle = w > 0.7 ? P.white : this.warn > 0 ? P.yellow : P.redHi;
    pxDisc(ctx, cx + shake, cy, 2 + 2 * pulse + 2 * w);
    ctx.fillStyle = P.white; pxFill(ctx, cx + shake - 1, cy - 1, 1);
    if (this.warn > 0) { ctx.globalAlpha = 0.55 + 0.45 * w; ctx.fillStyle = P.orange; pxRing(ctx, cx, cy, 40 - 22 * w, 2, 12, t * 0.4); }
    // Lebensleiste über dem Tor
    const bw = 30, bx = cx - bw / 2, by = cy - 30, f = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.ink; ctx.fillRect(bx - 2, by - 2, bw + 4, 8);
    ctx.fillStyle = P.redDark; ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = this.hitCd > 0 ? P.ice : P.red; ctx.fillRect(bx, by, Math.round(bw * f / PIXEL) * PIXEL, 4);
    ctx.restore();
  }
}

function spawnMiniboss(x, y) {
  let type;
  if (Math.random() * 100 < CFG.spawner.miniChance) type = randInt(1, 4) < 4 ? 'circle' : 'triangle';
  else type = randInt(1, 2) < 2 ? 'square' : 'rhombus';
  G.enemies.push(new Enemy(type, x, y, true));
}

// Aufsammelreichweite (Meta-Upgrade Magnet + Magnet-Buff) und Sog des Magnet-Buffs: Pickups in der Naehe wandern zum Spieler
function pickupRange() { return 1 + Save.bonus('magnet') + Xp.val('magnet') + Perk.add('magnet') + (G.player.buffs.magnet > 0 ? CFG.drops.types.magnet.range : 0); }
function magnetPull(o, dt) {
  const p = G.player, M = CFG.drops.types.magnet;
  if (p.buffs.magnet <= 0) return;
  const d = Math.hypot(p.x - o.x, p.y - o.y);
  if (d > 1 && d < M.pullRange) { o.x += (p.x - o.x) / d * M.pull * framesOf(dt); o.y += (p.y - o.y) / d * M.pull * framesOf(dt); }
}

// ---------- Heil-Powerup ----------
class PowerUp {
  constructor(x, y, amount) {
    this.x = x; this.y = y;
    this.amount = amount;
    this.alive = true;
    this.age = 0;
  }
  update(dt) {
    this.age += dt;
    if (this.age > CFG.powerup.life) { this.alive = false; return; }
    magnetPull(this, dt);
    if (touchesPlayer(this.x, this.y, CFG.powerup.radius * pickupRange())) {
      G.player.pickup(this.amount);
      Juice.sparks(this.x, this.y, STYLE.pal.green, 8);
      this.alive = false;
    }
  }
  draw(ctx) { drawSprite(ctx, 'heal', this.x, this.y, 90, 200); }
}

// ---------- Buff-Drop (neu): zufälliger temporärer Vorteil ----------
class Drop {
  constructor(x, y, kind) {
    if (!kind) {                                                    // zufaellig nach Gewicht (w)
      const T = CFG.drops.types, ids = Object.keys(T);
      let r = Math.random() * ids.reduce((s, k) => s + T[k].w, 0);
      kind = ids.find((k) => (r -= T[k].w) < 0) || ids[0];
    }
    this.kind = kind;
    [this.x, this.y] = clampToMap(x, y, 15);
    this.alive = true;
    this.age = 0;
  }
  update(dt) {
    this.age += dt;
    if (this.age > CFG.drops.life) { this.alive = false; return; }
    magnetPull(this, dt);
    if (touchesPlayer(this.x, this.y, CFG.drops.radius * pickupRange())) {
      G.player.applyBuff(this.kind);
      this.alive = false;
    }
  }
  draw(ctx) {
    // in den letzten 2 Sekunden blinken, damit man sieht, dass er gleich weg ist
    const left = CFG.drops.life - this.age;
    if (left < 2 && Math.floor(left * 8) % 2 === 0) return;
    const T = CFG.drops.types[this.kind];
    const bob = Math.sin(G.realTime * 5 + this.x) * 1.5, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y + bob;
    ctx.save();                                              // pulsierender Schein in der Buff-Farbe
    ctx.globalAlpha = 0.18 + 0.1 * Math.sin(G.realTime * 6 + this.x);
    ctx.fillStyle = T.color;
    pxGlow(ctx, cx, cy, 15);
    ctx.restore();
    drawSprite(ctx, T.icon, this.x, this.y - bob, 90, 85);
    outlinedText(ctx, T.label, cx, cy - 15, STYLE.type.small, T.color);
  }
}
