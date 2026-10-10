// Bosse (Werte in config.js, Abschnitt [10], Reihenfolge dort unter boss.order):
//   Oktagon   schießt zielsuchende Bolzen              Kite     wirft Mörser, tut bei Berührung viel Schaden
//   Beschwörer hält Abstand und ruft Minions           Laser-Turm steht in der Mitte, dreht Laser durch die Arena
//   Zwillinge zwei Bosse, heilen sich gegenseitig      Arena-Boss verkleinert die Karte in Stufen
// Zeitplan wie im Original: Oktagon bei 120, 240, 480, 720 ... Kite bei 360, 600, 840 ... (Spielzeit in Sekunden).

// Boss-Stärke (CFG.boss.power); im Tutorial neutral, damit die Lernkämpfe leicht bleiben
function bossBlast(kind, x, y, src) { return Object.assign(new Blast(kind, x, y, false, src), { mul: bossPower().dmg }); }       // Boss-Explosion mit Boss-Schadensfaktor
function bossPower() { return Tutorial.active ? { hp: 1, fire: 1, speed: 1, dmg: 1 } : { hp: CFG.boss.power.hp * G.diff.boss.hp * Hero.world().bossHp, fire: CFG.boss.power.fire * G.diff.boss.fire, speed: CFG.boss.power.speed * G.diff.boss.speed, dmg: CFG.boss.power.dmg * G.diff.boss.dmg }; }

class Boss {
  constructor(type, x = 0, y = 0, role = null) {
    this.type = type;
    this.cfg = CFG.boss[type];
    this.isBoss = true;
    this.x = x;
    this.y = y;
    this.dir = 0;
    this.alive = true;
    this.age = 0;
    this.stun = 0;
    this.hitCd = 0;                     // Unverwundbarkeit nach einem Treffer (frueher hat die Betaeubung das miterledigt)
    this.stunImmune = 0;                // solange > 0 wird der Boss von Treffern nicht mehr betaeubt (Schockresistenz)
    this.phase2 = false;
    this.cn = { nearT: 0, farT: 0, cd: CFG.boss.counter.firstCd, act: null };   // Konter-Faehigkeiten (Schockwelle / Sog)
    this.bar = 0;                       // Zeit seit Hit, für das Wippen der Lebensanzeige
    // Lebenspunkte wachsen mit der Stufe (auch der Kite nutzt die Oktagon-Stufe, wie im Original)
    this.maxHp = (this.cfg.hpBase + this.cfg.hpPerStage * G.bossStageOctagon) * G.diff.bossHp * bossPower().hp;
    this.killedByBurst = false;
    this.hp = this.maxHp;
    this.shootT = type === 'octagon' ? 1.5 : type === 'summoner' ? this.cfg.summonFirst : 2.0;
    this.side = Math.random() < 0.5 ? 1 : -1;     // Umlaufrichtung des Beschwörers
    this.summonFlash = 0;
    // Zwillinge: role 'bolt' (Oktagon-Körper) oder 'mortar' (Kite-Körper), twin = der Partner
    this.role = role;
    this.twin = null;
    this.enraged = false;               // Zwilling, dessen Partner gefallen ist
    this.sprite = this.cfg.sprite || (type === 'twin' ? (role === 'mortar' ? 'kite' : 'octagon') : type === 'turret' ? 'turret' : type === 'arena' || type === 'reaper' ? 'octagon' : type);     // Karten-Bosse: sprite/hue aus der Config
    this.hue = this.cfg.hue !== undefined ? this.cfg.hue : type === 'arena' ? 40 : type === 'reaper' ? 275 : 0;
    // Karten-Bosse (forge, colossus, spore, plague, frost, wraith): eigene Takte
    this.spT = type === 'forge' ? this.cfg.rainFirst : type === 'spore' ? this.cfg.cloudFirst : type === 'frost' ? this.cfg.spiralFirst : 0;     // Schlackenregen / Giftwolken / Spiralfeuer
    this.sp2T = type === 'spore' ? this.cfg.spawnFirst : type === 'plague' ? this.cfg.trailEvery : type === 'frost' ? this.cfg.novaFirst : type === 'wraith' ? this.cfg.blinkFirst : 0;   // Sporen rufen / Wolkenspur / Frostring / Sprung
    this.fx = { spiral: 0, shot: 0, ang: 0, nova: 0, blink: 0, bx: 0, by: 0 };       // Frost-Bosse: Restzeit Spiralfeuer, Salventakt, Drehwinkel, Frostring-Vorwarnung, Sprung-Vorwarnung und Ziel
    this.ch = { phase: 'walk', t: type === 'colossus' ? this.cfg.chargeFirst : 0, ang: 0 };            // Slag Colossus: walk -> tele -> dash
    if (this.cfg.name) G.notice(this.cfg.name + '!', STYLE.pal.red, STYLE.type.h1);
    // Laser-Turm: Zustand der Laser
    this.ls = { phase: 'rest', t: type === 'turret' ? this.cfg.restFirst : 0, n: 0, ang: 0, sign: 1, count: 1 };
    // Arena-Boss: Zeit bis zur nächsten Verkleinerung
    this.shrinkT = type === 'arena' || type === 'reaper' ? this.cfg.shrinkFirst : 0;
    // Finaler Boss: Ring-Salven und Minions in eigenen Takten
    this.ringT = type === 'reaper' ? this.cfg.ringFirst : 0; this.ringOff = 0;
    this.sumT = type === 'reaper' ? this.cfg.summonFirst : 0;
    if (type === 'reaper') G.notice('DEATH HIMSELF!', STYLE.pal.red, STYLE.type.h1);
    // Beschwörer: zu Kampfbeginn kommt einmal ein Nekromanten-Miniboss als Minion dazu (belebt gefallene Minions wieder). Stirbt er, kommt kein neuer.
    if (type === 'summoner') {
      const a = rand(0, 360), m = new Enemy('necro', x + fwdX(a) * 45, y + fwdY(a) * 45, true);
      m.minion = true; m.bossNecro = true;
      m.hitsLeft = m.maxHits = Math.round(m.hitsLeft * this.cfg.necro.hitsMul);
      G.enemies.push(m);
    }
  }

  get radius() { return this.cfg.radius; }

  // Schussart und Berührungsschaden je Boss
  get shootKind() {
    if (this.type === 'kite' || (this.type === 'twin' && this.role === 'mortar')) return 'mortar';
    if (this.type === 'plague' || this.type === 'wraith') return 'fan';
    return this.type === 'summoner' ? 'summon' : 'bolt';
  }
  get speedNow() {
    const C = this.cfg;
    return (this.type === 'twin' && this.role === 'mortar' ? C.partnerSpeed : C.speed) * (this.enraged ? C.enrageMul : 1) * (this.phase2 ? CFG.boss.counter.phase2Speed : 1);
  }

  update(dt) {
    const f = framesOf(dt);
    const p = G.player, tg = p.target;          // tg = wohin der Boss zielt (bei Phase/Koeder nicht der echte Spieler)
    Cos.bossTick(Juice.particles, this, dt);    // Cosmetic: Flammen um den Boss
    Cos2.bossWatch(this);                       // Cosmetic HITS: Schaden am Boss erkennen
    this.age += dt;
    this.bar += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.stunImmune = Math.max(0, this.stunImmune - dt);
    this.dir = dirTo(this.x, this.y, tg.x, tg.y);

    // Zwillinge: der Partner wird von diesem Boss mitaktualisiert, beide heilen sich langsam gegenseitig
    if (this.twin && G.boss === this) {
      this.twin.update(dt);
      if (this.twin && this.twin.alive) {
        const h = this.cfg.healRate * dt;
        this.hp = Math.min(this.maxHp, this.hp + h);
        this.twin.hp = Math.min(this.twin.maxHp, this.twin.hp + h);
      }
    }

    // Bewegung: nur wenn nicht betäubt und kein Ultimate läuft (außer das Schild berührt ihn)
    const windup = this.type === 'octagon' && this.age < this.cfg.windup;
    const canMove = !windup && !(this.type === 'frost' && this.fx.spiral > 0) && this.stun <= 0 && !(this.cn.act && this.cn.act.kind === 'shock') && (!G.clearing || touchesShield(this.x, this.y, this.radius));
    if (this.type === 'summoner' || this.type === 'spore') {
      // Beschwörer (und Spore Mother): weicht zurück, wenn man nah kommt, nähert sich, wenn man weit weg ist, sonst kreist er
      this.summonFlash = Math.max(0, this.summonFlash - dt);
      const d = Math.hypot(tg.x - this.x, tg.y - this.y), C = this.cfg, face = this.dir;
      let mul = 0.6;
      if (d < C.keepDist - 20) { this.dir = face + 180; mul = 1; }
      else if (d > C.keepDist + 30) { this.dir = face; mul = 1; }
      else this.dir = face + 90 * this.side;
      if (canMove) { moveForward(this, C.speed * mul * bossPower().speed * f); [this.x, this.y] = clampToMap(this.x, this.y, 25); }
      this.dir = face;
    } else if (this.type === 'turret') {
      this.updateLasers(dt, p, tg);
    } else if (this.type === 'colossus' && this.updateCharge(dt, tg)) {
      if (canMove && this.ch.phase === 'dash') { const face = this.dir; this.dir = this.ch.ang; moveForward(this, this.cfg.dashSpeed * bossPower().speed * f); this.dir = face; }       // Anlauf: gerade durch
    } else if (canMove) {
      moveForward(this, this.speedNow * bossPower().speed * f);
      if (this.type === 'arena' || this.type === 'twin' || this.type === 'reaper') [this.x, this.y] = clampToMap(this.x, this.y, 22);
    }
    [this.x, this.y] = clampToMap(this.x, this.y, this.radius + 4);        // alle Bosse bleiben in der Arena
    if (this.type === 'arena' || this.type === 'reaper') this.updateArena(dt);

    // Schießen (der Laser-Turm schießt nur in der Ruhephase)
    if (this.type !== 'turret' || this.ls.phase === 'rest') this.shootT -= dt;
    if (this.shootT <= 0) {
      const kind = this.shootKind, C = this.cfg, fast = (this.enraged ? 1 / C.enrageMul : 1) * (this.phase2 ? CFG.boss.counter.phase2Fire : 1) * bossPower().fire;
      if (kind === 'summon') {
        this.shootT += this.hp < this.maxHp * C.rageBelow ? C.rageEvery : C.summonEvery;
        this.summon();
      } else if (kind === 'mortar') {
        this.shootT += C.mortarEvery * fast;
        G.bossShots.push(Object.assign(new Mortar(this.x, this.y, this.dir), { src: Stats.bossName(this) }));
      } else if (kind === 'fan') {                                  // Plague Drone: Dreierfächer
        this.shootT += C.shootEvery * fast;
        for (const off of [-C.fanSpread, 0, C.fanSpread]) G.bossShots.push(Object.assign(new BossBolt(this.x, this.y, this.dir + off), { src: Stats.bossName(this), chill: !!C.chill }));
      } else {
        this.shootT += (C.shootEvery || C.boltEvery) * fast;
        G.bossShots.push(Object.assign(new BossBolt(this.x, this.y, this.dir), { src: Stats.bossName(this), chill: !!C.chill }));
      }
    }

    if (this.type === 'reaper') this.updateReaper(dt);
    else if (this.cfg.name) this.updateMapBoss(dt, tg);
    this.updateCounters(dt, p, tg);

    // Berührung = Schaden am Spieler
    if (touchesPlayer(this.x, this.y, this.radius)) { p.hit(this.shootKind === 'mortar' ? 'higher' : 'touch', bossPower().dmg, Stats.bossName(this)); if (this.cfg.chill) p.chill(CFG.chill.dur); }

    if (this.hitCd <= 0) this.takeDamage();
    if (this.hp < 1) this.defeat();
  }

  // Finaler Boss: alle ringEvery s ein Ring aus Bolzen (jeder Ring um eine halbe Lücke gedreht), dazu Minions. Phase 2 = alles schneller.
  updateReaper(dt) {
    const C = this.cfg, fast = (this.phase2 ? 0.75 : 1) * bossPower().fire;
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = C.ringEvery * fast;
      const gap = 360 / C.ringCount;
      for (let i = 0; i < C.ringCount; i++) G.bossShots.push(Object.assign(new BossBolt(this.x, this.y, this.ringOff + gap * i, 0.7), { src: Stats.bossName(this) }));
      this.ringOff += gap / 2;
      Sfx.play('missile'); Juice.shake(1.5);
    }
    this.sumT -= dt;
    if (this.sumT <= 0) { this.sumT = C.summonEvery * fast; this.summon(); }
  }

  // Karten-Bosse: eigene Angriffe neben den Bolzen. Phase 2 = alles etwas häufiger/mehr.
  updateMapBoss(dt, tg) {
    const C = this.cfg, fast = (this.phase2 ? 0.75 : 1) * bossPower().fire, s = C.cloudSpread || C.rainSpread;
    const near = (spread) => (spread ? [tg.x + rand(-s, s), tg.y + rand(-s, s)] : [tg.x, tg.y]);       // erste Stelle genau auf dem Spieler, die anderen daneben
    if (this.type === 'forge') {                                    // Schlackenregen: Einschlagkreise um den Spieler (der erste genau auf ihn)
      this.spT -= dt;
      if (this.spT <= 0) {
        this.spT += C.rainEvery * fast;
        const n = C.rainCount + (this.phase2 ? 2 : 0);
        for (let i = 0; i < n; i++) { const [sx, sy] = near(i > 0); G.bossShots.push(new TurretStrike(...clampToMap(sx, sy, 20), Stats.bossName(this))); }
        Sfx.play('missile'); Juice.shake(1);
      }
    } else if (this.type === 'spore') {                             // Giftwolken um den Spieler + Sporen als Minions
      this.spT -= dt;
      if (this.spT <= 0) {
        this.spT += C.cloudEvery * fast;
        const n = C.cloudCount + (this.phase2 ? 1 : 0);
        for (let i = 0; i < n; i++) { const [sx, sy] = near(i > 0); dropCloud(sx, sy, true); }
        this.summonFlash = 0.4;
      }
      this.sp2T -= dt;
      if (this.sp2T <= 0) {
        this.sp2T += C.spawnEvery * fast;
        const room = C.maxMinions - G.enemies.filter((m) => m.minion && m.alive).length;
        for (let i = 0; i < Math.min(C.spawnCount, room); i++) {
          const a = rand(0, 360), m = new Enemy('circle', this.x + fwdX(a) * 30, this.y + fwdY(a) * 30, false, 'spore');
          m.minion = true;
          G.enemies.push(m);
        }
      }
    } else if (this.type === 'plague') {                            // Wolkenspur hinter der Drohne
      this.sp2T -= dt;
      if (this.sp2T <= 0) { this.sp2T += C.trailEvery * fast; dropCloud(this.x, this.y, true); }
    } else if (this.type === 'frost') this.updateFrost(dt, fast);
    else if (this.type === 'wraith') this.updateWraith(dt, tg, fast);
  }

  // Gekühlter Bolzen (Frost-Bosse): Lenkung kaum, damit Ringe und Spiralen ihre Form behalten
  frostBolt(dir, turn) { G.bossShots.push(Object.assign(new BossBolt(this.x, this.y, dir, turn), { src: Stats.bossName(this), chill: true })); }

  // Frost Sentinel: Spiralfeuer (steht still, mehrere Arme drehen sich) und Frostring mit Vorwarnung
  updateFrost(dt, fast) {
    const C = this.cfg, F = this.fx, arms = C.spiralArms + (this.phase2 ? 1 : 0);
    if (F.spiral > 0) {
      F.spiral -= dt; F.shot -= dt;
      if (F.shot <= 0) {
        F.shot += C.spiralRate;
        for (let i = 0; i < arms; i++) this.frostBolt(F.ang + (360 / arms) * i, 0.4);
        F.ang += C.spiralTurn;
        Sfx.play('enemyShot');
      }
    } else {
      this.spT -= dt;
      if (this.spT <= 0) { this.spT += C.spiralEvery * fast; F.spiral = C.spiralTime; F.shot = 0; F.ang = rand(0, 360); }
    }
    if (F.nova > 0) {
      F.nova -= dt;
      if (F.nova <= 0) {
        const n = C.novaCount + (this.phase2 ? 4 : 0), off = rand(0, 360);
        for (let i = 0; i < n; i++) this.frostBolt(off + (360 / n) * i, 0.3);
        Sfx.play('missile'); Juice.shake(2); this.summonFlash = 0.4;
      }
    } else {
      this.sp2T -= dt;
      if (this.sp2T <= 0) { this.sp2T += C.novaEvery * fast; F.nova = C.novaTele; }
    }
  }

  // Frost Wraith: markiert eine Stelle nahe dem Spieler, springt nach der Vorwarnung dorthin und feuert beim Auftauchen einen Ring
  updateWraith(dt, tg, fast) {
    const C = this.cfg, F = this.fx;
    if (F.blink > 0) {
      F.blink -= dt;
      if (F.blink <= 0) {
        Juice.sparks(this.x, this.y, STYLE.pal.ice, 8, 3);
        this.x = F.bx; this.y = F.by;
        const n = C.arrivalCount + (this.phase2 ? 4 : 0), off = rand(0, 360);
        for (let i = 0; i < n; i++) this.frostBolt(off + (360 / n) * i, 0.3);
        Juice.sparks(this.x, this.y, STYLE.pal.ice, 10, 4); Sfx.play('missile'); Juice.shake(1.5); this.summonFlash = 0.4;
      }
    } else {
      this.sp2T -= dt;
      if (this.sp2T <= 0) {
        this.sp2T += C.blinkEvery * fast;
        const a = rand(0, 360), d = rand(C.blinkDist[0], C.blinkDist[1]);
        [F.bx, F.by] = clampToMap(tg.x + fwdX(a) * d, tg.y + fwdY(a) * d, 25);
        F.blink = C.blinkTele;
      }
    }
  }

  // Slag Colossus: läuft, nach chargeEvery s bleibt er stehen und zeigt eine Linie (tele), rast dann los (dash) und schlägt am Ende ein.
  // Gibt true zurück, solange er steht oder rast (dann übernimmt diese Funktion die Bewegung).
  updateCharge(dt, tg) {
    const C = this.cfg, ch = this.ch, fast = (this.phase2 ? 0.75 : 1) * bossPower().fire;
    ch.t -= dt;
    if (ch.phase === 'walk') {
      if (ch.t > 0) return false;
      ch.phase = 'tele'; ch.t = C.tele; ch.ang = dirTo(this.x, this.y, tg.x, tg.y);
    } else if (ch.phase === 'tele') {
      if (ch.t > 0.25) ch.ang = dirTo(this.x, this.y, tg.x, tg.y);           // zielt nach, die letzte Viertelsekunde steht die Richtung fest
      if (ch.t <= 0) { ch.phase = 'dash'; ch.t = C.dashTime; Sfx.play('blast'); }
    } else if (ch.t <= 0) {
      ch.phase = 'walk'; ch.t = C.chargeEvery * fast;
      G.blasts.push(bossBlast('bomb', this.x, this.y, Stats.bossName(this))); Juice.shake(3);       // Einschlag am Ende des Anlaufs
    }
    return true;
  }

  // Beschwörer: ruft Minions (Kreise, manchmal Dreiecke) rund um sich. Sie verschwinden, wenn der Kampf endet.
  summon() {
    const C = this.cfg, rage = this.hp < this.maxHp * C.rageBelow;
    const room = C.maxMinions - G.enemies.filter((m) => m.minion && m.alive).length;
    const n = Math.min(rage ? C.rageCount : C.summonCount, room);
    for (let i = 0; i < n; i++) {
      const a = rand(0, 360), m = new Enemy(Math.random() < C.triangleChance ? 'triangle' : 'circle', this.x + fwdX(a) * 30, this.y + fwdY(a) * 30, false);
      m.minion = true;
      G.enemies.push(m);
    }
    this.summonFlash = 0.4;
  }

  // Laser-Turm: Ruhe (verwundbar, schießt) -> Vorwarnung (dünne Linien) -> Laser dreht sich -> Ruhe ... Mit der Zeit mehr Laser
  updateLasers(dt, p, tg) {
    const C = this.cfg, L = this.ls;
    L.t -= dt;
    // Einschlaege: markieren die Stelle, an der der Spieler gerade steht, und schlagen kurz danach dort ein. Wer stehen bleibt, wird getroffen.
    L.strikeT = (L.strikeT === undefined ? C.strikeFirst : L.strikeT) - dt;
    if (L.strikeT <= 0) {
      L.strikeT += C.strikeEvery;
      const n = Math.min(C.maxStrikes, 1 + Math.floor(L.n / C.strikeStep));
      for (let i = 0; i < n; i++) {
        const [sx, sy] = i === 0 ? [tg.x, tg.y] : [tg.x + rand(-C.strikeSpread, C.strikeSpread), tg.y + rand(-C.strikeSpread, C.strikeSpread)];
        G.bossShots.push(new TurretStrike(...clampToMap(sx, sy, 20), Stats.bossName(this)));
      }
    }
    if (L.phase === 'rest') {
      if (L.t <= 0) {
        L.phase = 'tele'; L.t = C.tele;
        L.count = Math.min(C.maxLasers + (this.phase2 ? 1 : 0), 1 + Math.floor(L.n / 2) + (this.phase2 ? 1 : 0));
        L.ang = dirTo(this.x, this.y, tg.x, tg.y);
        L.sign = L.n % 2 ? -1 : 1;
      }
    } else if (L.phase === 'tele') {
      if (L.t <= 0) { L.phase = 'fire'; L.t = C.fire; }
    } else {
      L.ang += C.spin * L.sign * dt;
      for (let i = 0; i < L.count; i++) {
        const a = L.ang + (360 / L.count) * i;
        if (segHitsCircle(this.x, this.y, this.x + fwdX(a) * C.len, this.y + fwdY(a) * C.len, C.width, p.x, p.y, p.radius)) p.hit('touch', bossPower().dmg, Stats.bossName(this));
      }
      if (L.t <= 0) { L.phase = 'rest'; L.t = C.rest; L.n++; }
    }
  }

  // Konter gegen "von weitem beschiessen" und "um den Boss kreisen":
  //  - Schockwelle: bleibt der Spieler nearTime Sekunden in nearDist, zeigt der Boss einen roten Ring (Vorwarnung), dann trifft die Welle alles im Radius.
  //  - Sog: bleibt der Spieler farTime Sekunden weiter als farDist weg, markiert der Boss eine Linie und zieht ihn danach heran.
  //  - Phase 2 (unter 50 % Leben): schneller, feuert schneller, Konter kommen oefter, dazu eine sofortige Schockwelle.
  updateCounters(dt, p, tg) {
    const K = CFG.boss.counter, cn = this.cn, d = Math.hypot(tg.x - this.x, tg.y - this.y), dReal = Math.hypot(p.x - this.x, p.y - this.y);
    if (!this.phase2 && this.hp < this.maxHp * K.phase2At) {
      this.phase2 = true;
      G.notice('PHASE 2!', STYLE.pal.red, STYLE.type.h1);
      Juice.hitStop(0.08); Juice.shake(4); Juice.flash(STYLE.pal.red, 0.25, 0.2);
      cn.act = { kind: 'shock', t: K.shockDelay };
    }
    if (G.clearing) return;
    const rate = this.phase2 ? K.phase2Rate : 1;
    cn.cd = Math.max(0, cn.cd - dt);
    if (cn.act) {
      const a = cn.act;
      a.t -= dt;
      if (a.kind === 'pull') {                                    // nach der Vorwarnung wird der Spieler zum Boss gezogen
        if (a.t <= 0 && a.t > -K.pullTime && dReal > this.radius + 14 && p.blinkT <= 0) {      // unsichtbar = auch vom Sog nicht erfasst
          const ang = dirTo(p.x, p.y, this.x, this.y), step = K.pullSpeed * framesOf(dt);
          [p.x, p.y] = clampToMap(p.x + fwdX(ang) * step, p.y + fwdY(ang) * step, 10);
        }
        if (a.t <= -K.pullTime) cn.act = null;
      } else if (a.t <= 0) {                                      // Schockwelle trifft
        if (dReal < K.shockRadius + 8) p.hit('touch', bossPower().dmg, Stats.bossName(this));           // Schaden nach der echten Position
        G.blasts.push(bossBlast('bomb', this.x, this.y, Stats.bossName(this)));
        cn.act = null;
      }
      return;
    }
    cn.nearT = d < K.nearDist ? cn.nearT + dt : Math.max(0, cn.nearT - dt);
    cn.farT = d > K.farDist ? cn.farT + dt : 0;
    if (cn.cd > 0) return;
    if (cn.nearT >= K.nearTime * (this.phase2 ? 0.7 : 1)) {
      cn.act = { kind: 'shock', t: K.shockDelay }; cn.cd = K.cd * rate; cn.nearT = 0;
    } else if (cn.farT >= K.farTime * (this.phase2 ? 0.7 : 1)) {
      cn.act = { kind: 'pull', t: K.pullDelay }; cn.cd = K.cd * rate; cn.farT = 0;
    }
  }

  drawCounters(ctx, cx, cy) {
    const a = this.cn.act, K = CFG.boss.counter, P = STYLE.pal;
    if (!a) return;
    ctx.save();
    if (a.kind === 'shock') {
      const k = Math.max(0, 1 - a.t / K.shockDelay);
      ctx.fillStyle = P.red;
      ctx.globalAlpha = 0.1 + 0.25 * k; pxGlow(ctx, cx, cy, K.shockRadius);
      ctx.globalAlpha = 0.9; pxRing(ctx, cx, cy, K.shockRadius, 1);
      pxRing(ctx, cx, cy, K.shockRadius * (1 - k), 1);
    } else {
      const p = G.player.target, px = STAGE_W / 2 + p.x, py = STAGE_H / 2 - p.y;
      ctx.fillStyle = a.t > 0 ? P.yellow : P.redHi;
      ctx.globalAlpha = a.t > 0 ? 0.4 + 0.4 * Math.abs(Math.sin(G.realTime * 14)) : 0.95;
      if (a.t > 0) pxDashLine(ctx, cx, cy, px, py, 1, 3); else pxLine(ctx, cx, cy, px, py, 2);
    }
    ctx.restore();
  }

  // Arena-Boss: die Karte schrumpft in Stufen (G.arenaScale, siehe clampToMap), der Spieler wird nach innen geschoben
  updateArena(dt) {
    const C = this.cfg;
    this.shrinkT -= dt;
    if (this.shrinkT <= 0) {
      this.shrinkT = C.shrinkEvery;
      if (G.arenaTarget > C.minScale) { G.arenaTarget = Math.max(C.minScale, G.arenaTarget - C.shrinkStep); G.notice('ARENA COLLAPSING!', STYLE.pal.red, STYLE.type.h1); Juice.shake(3); }
    }
    G.arenaScale += clamp(G.arenaTarget - G.arenaScale, -C.shrinkSpeed * dt, C.shrinkSpeed * dt);
  }

  takeDamage() {
    let dmg = 0, stun = 0;
    this.killedByBurst = false;
    if (this.type === 'summoner' && this.phase2) {               // Blasterschild: Schüsse zerplatzen am Schild, bevor sie den Boss erreichen
      for (const a of G.attacks) {
        if (a.alive && a.kind === 'shot' && a.hitsCircle(this.x, this.y, this.cfg.shieldRadius)) {
          a.alive = false; this.shieldFlash = 0.15;
          Juice.sparks(a.x, a.y, STYLE.pal.cyan, 2, 2);
        }
      }
    }
    for (const a of G.attacks) {
      if (!a.alive) continue;
      if ((a.kind === 'sword' || a.kind === 'lance' || a.kind === 'shot' || a.kind === 'impulse' || a.kind === 'dash') && a.hitsCircle(this.x, this.y, this.radius)) {
        dmg = a.bossMul || 1; stun = this.cfg.hitStun;
        break;
      }
    }
    if (!dmg) {
      for (const a of G.attacks) {
        if (a.alive && (a.kind === 'ult' || a.kind === 'blood') && !a.hit.has(this) && a.hitsCircle(this.x, this.y, this.radius)) {
          a.hit.add(this);
          this.killedByBurst = true;
          dmg = CFG.boss.ultDamage; stun = this.cfg.hitStun;
          break;
        }
      }
    }
    if (!dmg) {
      for (const a of G.attacks) {
        if (a.alive && a.kind === 'beam' && a.hitsCircle(this.x, this.y, this.radius)) {
          dmg = 1.5 * a.power; stun = 1;
          break;
        }
      }
    }
    if (dmg) {
      Juice.sparks(this.x, this.y, STYLE.pal.yellow, 3, 3.5);
      this.hp -= dmg * damageBoost();
      this.hitCd = stun;                                           // kurze Unverwundbarkeit wie bisher
      if (this.stunImmune <= 0) {                                  // betaeubt (steht still) nur, wenn nicht gerade resistent
        this.stun = stun;
        this.stunImmune = stun + CFG.boss.counter.stunResist;
      }
      this.bar = 0;
    }
  }

  defeat() {
    this.alive = false;
    // Zwillinge: lebt der Partner noch, geht der Kampf weiter (er wird wütend und heilt nicht mehr)
    const partner = this.twin;
    if (partner && partner.alive) {
      if (G.boss === this) G.boss = partner;
      partner.twin = null; partner.enraged = true; this.twin = null;
      return;
    }
    Sfx.play('bossDown');
    Tutorial.bossDown = true;                                   // Tutorial: Aufgabe erledigt
    Juice.hitStop(0.12); Juice.shake(5); Juice.zoomPulse(1.06, 0.5); Juice.flash(STYLE.pal.white, 0.3, 0.15);
    Juice.sparks(this.x, this.y, STYLE.pal.yellow, 24, 5);
    if (!this.killedByBurst) G.addUlt(CFG.boss.killUlt);
    if (this.type !== 'reaper') Xp.bossDefeated();
    G.powerups.push(new PowerUp(this.x, this.y, CFG.boss.killHeal));
    if (this.type === 'reaper') { G.bosses++; G.startVictory(); }   // finaler Boss: Sieg, kein Upgrade
    else if (G.sr && SpeedRun.lastBoss()) { G.bosses++; G.startVictory('BOSS DEFEATED!'); }       // Speedrun (Gauntlet, Seed Run): dieser Boss beendet den Lauf
    else if (!Tutorial.active) G.later(0.25, () => Loadout.weaponUp(G.time));      // im Tutorial kein Upgrade und keine Ability-Wahl
    Ach.bossDown(this);
    if (G.victory > 0) {                                        // Siegerpose (WIN-Cosmetic) nur nach dem letzten Boss; Siegphase dauert mindestens so lang wie die Pose
      Cos2.vic = Cos2.victoryStart(G.player);
      if (Cos2.vic) { Cos2.vic.live = G.realTime; G.victory = Math.max(G.victory, VICTORY_DUR[Cos2.vic.type] + 0.2); }
    }
    Cos2.petCheer(Cos2.pet, Juice.particles);                   // Cosmetics: Freude des Begleiters
    G.endBossFight();
  }

  // Lebensanzeige-Stufe (0 = voll ... 6 = leer)
  get barFrame() {
    const m = this.maxHp;
    if (this.hp > m - 1) return 0;
    if (this.hp < 0.1) return 6;
    let i = 1;
    for (const k of [5, 4, 3, 2, 1]) if (this.hp < m * k / 6) i = 7 - k;
    return i;
  }

  draw(ctx) {
    const hit = this.hitCd > 0 || this.stun > 0, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, P = STYLE.pal;
    if (this.type === 'turret') this.drawLasers(ctx, cx, cy);
    this.drawCounters(ctx, cx, cy);
    Cos.drawBoss(ctx, this.sprite + (hit ? 'Hit' : ''), this, this.type === 'turret' ? 90 : this.dir, this.cfg.drawSize || 300, { hue: this.hue }, G.realTime);
    if (this.type === 'colossus' && this.ch.phase === 'tele') {  // Warnlinie des Anlaufs
      const C = this.cfg, len = C.dashSpeed * bossPower().speed * 30 * C.dashTime;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.5 * (1 - this.ch.t / C.tele); ctx.fillStyle = P.red;
      pxDashLine(ctx, cx, cy, cx + fwdX(this.ch.ang) * len, cy - fwdY(this.ch.ang) * len, 2, 4);
      ctx.restore();
    }
    if (this.type === 'frost' && this.fx.nova > 0) {             // Frostring-Vorwarnung: wachsender Ring um den Boss
      const k = 1 - this.fx.nova / this.cfg.novaTele;
      ctx.save(); ctx.fillStyle = P.ice;
      ctx.globalAlpha = 0.15 + 0.3 * k; pxGlow(ctx, cx, cy, this.radius * 2.2 * k);
      ctx.globalAlpha = 0.5 + 0.4 * k; pxRing(ctx, cx, cy, this.radius * (1.2 + 1.4 * k), 2, 14, G.realTime * 0.3);
      ctx.restore();
    }
    if (this.type === 'wraith' && this.fx.blink > 0) {            // Sprungziel: schrumpfender Ring
      const k = this.fx.blink / this.cfg.blinkTele, bx = STAGE_W / 2 + this.fx.bx, by = STAGE_H / 2 - this.fx.by;
      ctx.save(); ctx.fillStyle = P.ice;
      ctx.globalAlpha = 0.2 + 0.3 * (1 - k); pxGlow(ctx, bx, by, 24);
      ctx.globalAlpha = 0.9; pxRing(ctx, bx, by, 14 + 26 * k, 2, 10, G.realTime * 0.4);
      ctx.restore();
    }
    if (this.type === 'summoner' && this.phase2) {               // Blasterschild (Phase 2)
      this.shieldFlash = Math.max(0, (this.shieldFlash || 0) - 0.016);
      ctx.save();
      ctx.fillStyle = P.cyan;
      ctx.globalAlpha = 0.12 + 0.2 * (this.shieldFlash / 0.15); pxGlow(ctx, cx, cy, this.cfg.shieldRadius);
      ctx.globalAlpha = 0.55 + 0.4 * (this.shieldFlash / 0.15); pxRing(ctx, cx, cy, this.cfg.shieldRadius, 2, 14, G.realTime * 0.5);
      ctx.restore();
    }
    if (this.summonFlash > 0) {                                  // Aufleuchten beim Beschwören
      ctx.save();
      ctx.globalAlpha = this.summonFlash / 0.4;
      ctx.fillStyle = P.yellow; pxRing(ctx, cx, cy, this.radius * (1.2 + (0.4 - this.summonFlash) * 3), 2);
      ctx.restore();
    }
    if (this.enraged) {                                          // wütender Zwilling: roter Ring
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(G.realTime * 10); ctx.fillStyle = P.red;
      pxRing(ctx, cx, cy, this.radius * 1.4, 1);
      ctx.restore();
    }
    if (this.twin && G.boss === this) {                          // Heilverbindung zwischen den Zwillingen
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = P.green;
      pxDashLine(ctx, cx, cy, STAGE_W / 2 + this.twin.x, STAGE_H / 2 - this.twin.y, 1, 3);
      ctx.restore();
    }
  }

  drawLasers(ctx, cx, cy) {
    const C = this.cfg, L = this.ls, P = STYLE.pal;
    if (L.phase === 'rest') return;
    ctx.save();
    for (let i = 0; i < L.count; i++) {
      const a = L.ang + (360 / L.count) * i, ex = cx + fwdX(a) * C.len, ey = cy - fwdY(a) * C.len;
      if (L.phase === 'tele') {
        const k = 1 - L.t / C.tele;
        ctx.globalAlpha = 0.2 + 0.5 * k; ctx.fillStyle = P.red;
        pxDashLine(ctx, cx, cy, ex, ey, 1, 4);
      } else {
        const w = Math.max(2, Math.round(C.width)), o = w + 2;                                   // Dicke in Pixeln; Linie wird um die halbe Dicke versetzt, damit sie mittig liegt
        ctx.globalAlpha = 0.5; ctx.fillStyle = P.red; pxLine(ctx, cx - o, cy - o, ex - o, ey - o, w + 2);          // harter roter Rand statt Leuchten
        ctx.globalAlpha = 0.95; ctx.fillStyle = P.redHi; pxLine(ctx, cx - w, cy - w, ex - w, ey - w, w);
      }
    }
    ctx.restore();
  }

  drawBar(ctx) {
    if (this.age < 0.5) return;
    const t = this.bar;
    const lift = t < 0.1 ? 5 + 45 * (t / 0.1) : t < 0.2 ? 50 - 15 * ((t - 0.1) / 0.1) : t < 0.25 ? 35 + 5 * ((t - 0.2) / 0.05) : 40;
    drawSprite(ctx, 'bosshp' + this.barFrame, this.x, this.y + lift, 90, 350);
    if (this.twin && G.boss === this && this.twin.alive) this.twin.drawBar(ctx);
  }
}

// Zielsuchender Bolzen des Oktagons
class BossBolt {
  constructor(x, y, dir, turn = CFG.boss.bolt.turn) {         // turn = Lenkung pro Bild (Ring-Bolzen des finalen Bosses lenken kaum)
    this.x = x; this.y = y; this.dir = dir; this.turn = turn;
    this.alive = true;
    this.frames = CFG.boss.bolt.frames;
    this.ghost = 0;
    this.src = 'BOSS';              // Name der Quelle fuer die Run-Statistik (der Boss ueberschreibt ihn)
  }
  update(dt) {
    if (G.clearing || !G.bossFight) { this.alive = false; return; }
    const f = framesOf(dt);
    const tg = G.player.target;
    steerTowards(this, tg.x, tg.y, this.turn * f);
    moveForward(this, CFG.boss.bolt.speed * f);
    this.ghost += 2 * f;
    this.frames -= f;
    const r = CFG.boss.bolt.radius;
    if (touchesPlayer(this.x, this.y, r)) { G.player.hit('shoot', bossPower().dmg, this.src); if (this.chill) G.player.chill(CFG.chill.dur); this.alive = false; }
    else if (blockedByPlayerGear(this.x, this.y, r) || this.frames <= 0) this.alive = false;
  }
  draw(ctx) { drawSprite(ctx, 'enemyShot', this.x, this.y, this.dir, 175, { alpha: 1 - this.ghost / 100, hue: this.chill ? 170 : 0 }); }
}

// Mörser des Kite: fliegt direkt auf den Spieler, bis er etwas trifft, und explodiert dann
class Mortar {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.dir = dir;
    this.alive = true;
    this.src = 'MORTAR';
  }
  update(dt) {
    if (!G.bossFight) { this.alive = false; return; }
    const p = G.player.target;
    this.dir = dirTo(this.x, this.y, p.x, p.y);
    moveForward(this, CFG.boss.mortar.speed * framesOf(dt));
    const r = CFG.boss.mortar.radius;
    if (touchesPlayer(this.x, this.y, r) || blockedByPlayerGear(this.x, this.y, r)) {
      G.blasts.push(bossBlast('boom', this.x, this.y, this.src));
      this.alive = false;
    }
  }
  draw(ctx) { drawSprite(ctx, 'wave1', this.x, this.y, this.dir, 300); }
}

// Einschlag des Laser-Turms: roter Ring zeigt die Stelle (waechst zusammen), dann explodiert sie
class TurretStrike {
  constructor(x, y, src = 'BOSS STRIKE') { this.x = x; this.y = y; this.alive = true; this.age = 0; this.src = src; }
  update(dt) {
    if (!G.bossFight) { this.alive = false; return; }
    this.age += dt;
    if (this.age >= CFG.boss.turret.strikeDelay) {
      G.blasts.push(bossBlast('bomb', this.x, this.y, this.src));
      this.alive = false;
    }
  }
  draw(ctx) {
    const C = CFG.boss.turret, P = STYLE.pal, k = Math.min(1, this.age / C.strikeDelay);
    const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, R = C.strikeRadius;
    ctx.save();
    ctx.fillStyle = P.red;
    ctx.globalAlpha = 0.12 + 0.25 * k; pxGlow(ctx, cx, cy, R);
    ctx.globalAlpha = 0.9; pxRing(ctx, cx, cy, R, 1);
    pxRing(ctx, cx, cy, R * (1 - k), 1);       // schrumpfender Ring = Countdown
    ctx.restore();
  }
}

// Spawn-Animation in der Mitte (14 Bilder), danach erscheint der Boss
class BossIntro {
  // Der Boss erscheint in der Kartenmitte. Auf der unendlichen Karte stattdessen in der Bildmitte (Kamera steht dann still)
  constructor(type) {
    this.type = type; this.t = 0; this.alive = true; this.x = CFG.map.infinite ? G.cam.x : 0; this.y = CFG.map.infinite ? G.cam.y : 0;
    const spot = G.sr && SpeedRun.bossSpot(); if (spot) { this.x = spot[0]; this.y = spot[1]; }       // Speedrun (Gauntlet): Boss steht in der Arena am Ende des Streifens
  }
  update(dt) {
    this.t += dt;
    if (this.t >= CFG.boss.anim) {
      this.alive = false;
      if (this.type === 'twin') {                                   // zwei Körper links und rechts der Mitte
        const a = new Boss('twin', this.x - 45, this.y, 'bolt'), b = new Boss('twin', this.x + 45, this.y, 'mortar');
        a.twin = b; b.twin = a;
        G.boss = a;
      } else G.boss = new Boss(this.type, this.x, this.y);
      G.bossTimer = 0;
    }
  }
  draw(ctx) {
    const i = Math.min(13, Math.floor(this.t / 0.25));
    drawSprite(ctx, 'bossAnim' + (i + 1), this.x, this.y, 90, 500);
  }
}
