// Der Spieler: Bewegung (WASD), Waffen (Leertaste), Leben, Boost, Bloodburst.

class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.dir = 0;              // Blickrichtung (Scratch: PlayerLooking)
    this.moveDir = 0;          // gewünschte Richtung aus den WASD-Tasten (Scratch: PlayerDirection)
    this.hp = this.maxHp;
    this.hitCd = 0;            // Schutzzeit nach einem Treffer
    this.flash = 0;            // Farbblitz nach einem Treffer
    this.invincibleT = CFG.player.startInvincible;
    this.weapon = 0;           // 0 Schwert, 1 Schuss (siehe WEAPON in config.js). Der Beam liegt separat auf E
    this.attackCd = 0;
    this.shotMag = 0; this.reloadT = 0; this.reloadMax = 1; this.lastShotT = -9;      // Blaster (nur er): Salven im Magazin, Nachladepause (Restzeit/Gesamt), Zeit des letzten Schusses
    this.dashCd = 0;           // Abilities (Slots in CFG.loadout): Dash und Schildblase
    this.shieldLeft = 0;
    this.shieldCd = 0;
    this.pulseCd = 0;          // Abklingzeit der Druckwelle
    this.bloodCd = 0;
    this.slots = Object.assign({}, CFG.loadout.start);   // gewählte Ability je Gruppe (weak/medium/strong) oder null
    this.cds = { blink: 0, frost: 0, surge: 0, decoy: 0, bombard: 0, shockstep: 0, adrenaline: 0, drone: 0, overcharge: 0, storm: 0, berserk: 0, hack: 0, necromancy: 0, stims: 0, fortress: 0, rift: 0, chrono: 0, catalyst: 0 };   // fortress/rift/chrono = Helden-Artefakte (CFG.heroes)
    this.fortressT = 0;        // Bulwark: Restzeit der Schadensminderung nach Fortress Slam
    this.sinceHit = 99;        // Sekunden seit dem letzten Treffer (Nano Regen)
    this.aegisCd = 0;          // Aegis-Protokoll (passiv): Pause bis zum naechsten Schutz
    this.owned = [];           // gesammelte Abilities dieses Laufs (IDs), im Pausenmenue gegen die Slots tauschbar
    this.evolved = {};         // Evolutionen dieses Laufs je Waffenslot (melee/ranged/heavy -> Evolutions-ID), siehe CFG.evolutions
    this.vortexT = 0;          // Vortex Blades: Zeit bis zur nächsten Welle
    this.heavyCd = 0;          // Abklingzeit von Kettenblitz / Schwarzem Loch
    this.surgeT = 0;           // Sprint: Restzeit
    this.decoyT = 0;           // Koeder: Restzeit, decoy = Position des Trugbilds
    this.decoy = null;
    this.blinkT = 0;           // Restzeit von Blink (unsichtbar und unverwundbar)       // Abklingzeiten der neueren Abilities
    this.swordBase = 0;        // Richtung, in die ein neuer Schwertschlag startet
    this.blades = [];          // aktuell vorhandene Schwertklingen (siehe syncBlades)
    this.shield = null;        // die aktive Schildblase (oder null)
    this.beam = { state: 'none', clock: 0 };   // none | load | fire
    this.grenadeCd = 0;        // Abklingzeit der Plasmagranate
    this.fire = { on: false, fuel: 1, dropT: 0 };   // Feuerpfad: umschaltbar, Brennstoff 0..1
    this.dashLeft = 0;         // verbleibende Dash-Bilder
    this.ult = null;
    this.blood = null;
    this.bloodArmed = true;
    this.boosted = false;
    this.ultHealed = false;    // Heilung beim ersten Aufladen des Ultimates schon bekommen?
    this.afk = 0;
    this.afkTick = 0;
    this.chillT = 0;           // > 0: gekuehlt (Frost-Gegner, Karte 4): Lauftempo x CFG.chill.slow
    this.slideX = 0; this.slideY = 0;       // Eis: Geschwindigkeit pro Bild
    this.curseT = 0;           // > 0: von einem Fluch-Unterstützer gebremst
    this.buffs = { haste: 0, rapid: 0, guard: 0, power: 0, magnet: 0, regen: 0, vampire: 0, chrono: 0, coolant: 0 };   // verbleibende Sekunden der Drop-Buffs
  }

  // Abklingzeiten laufen schneller ab: Meta-Upgrade und Coolant-Buff
  get cdRate() { return (1 + Save.bonus('cooldown') + Xp.val('cooldown')) * (this.buffs.coolant > 0 ? CFG.drops.types.coolant.rate : 1); }
  // Angriffstempo durch den Raserei-Drop: Schwert dreht schneller (siehe SwordSwing), Schuss feuert schneller
  get hasteFactor() { return (this.buffs.rapid > 0 ? 1 / CFG.drops.types.rapid.mult : 1) * (this.has('overclock') ? 1 + (CFG.passives.overclock.rate - 1) * Save.gearMul('overclock') : 1) * (1 + Save.bonus('attackSpeed') + Xp.val('rapid')) * Hero.mods().atk; }
  // Angriffstempo je Waffe: alle Tempo-Boni (Rapid-Buff, Overclock, Attack Speed, Quick Hands, Helden) wirken auf die Plasma Blade staerker als auf den Blaster (CFG.hasteScale)
  hasteFor(kind) { const h = this.hasteFactor, k = CFG.hasteScale[kind]; return k === undefined ? h : 1 + (h - 1) * k; }
  evo(id) { return this.evolved[CFG.evolutions.list[id].slot] === id; }       // Evolution dieses Laufs aktiv?
  has(id) { return this.slots.weak === id || this.slots.medium === id || this.slots.strong === id; }       // Ability (auch passive) ausgewaehlt?

  get invincibleBase() { return G.victory > 0 || this.dashLeft > 0 || this.invincibleT > 0 || this.blinkT > 0; }
  get invincible() { return this.invincibleBase || SafeSpot.inside; }       // im Safe Spot ist man unverwundbar
  // Wohin Gegner zielen: auf den Spieler, bei Blink auf die Stelle, wo er verschwunden ist
  get target() { return this.blinkT > 0 && this.blinkFrom ? this.blinkFrom : this.decoyT > 0 && this.decoy ? this.decoy : this; }
  get hasField() { return this.slots.strong === 'field'; }
  get radius() { return CFG.player.hitRadius; }
  get maxHp() { return Math.max(20, CFG.player.maxHp + Save.bonus('health') + Xp.val('health', 'hp') + Hero.mods().hp); }      // Meta-Upgrade Leben + Perk Vitality
  get hpPct() { return this.hp * 100 / this.maxHp; }                    // Leben in Prozent (Basis 100): Balken, Schadensfaktor und Warnrand rechnen damit

  // 0 = gesperrt, 1 = frei, 2 = nur drehen (Beam lädt/feuert)
  get canMove() {
    const locked = this.dashLeft > 0 || (this.ult && this.ult.alive && this.ult.locksPlayer) ||
                   (this.blood && this.blood.alive && this.blood.locksPlayer);
    if (locked) return 0;
    return this.beam.state !== 'none' ? 2 : 1;
  }

  // Schadensfaktor hängt vom Leben ab: je weniger Leben, desto weniger Schaden pro Treffer
  get damageFactor() {
    if (this.blood && this.blood.alive && this.blood.protecting) return 0.1;
    for (const [above, factor] of CFG.player.damageTiers) if (this.hpPct > above) return factor;
    return 0.15;
  }

  // Wie stark soll der rote Warnrand sein (0..1)? Steigt gleichmäßig von `from` bis `full` Leben, unter `pulseBelow` pulsiert er.
  get overlayAlpha() {
    const W = CFG.player.warn;
    const hp = this.hpPct;
    if (hp >= W.from) return 0;
    const k = clamp((W.from - hp) / (W.from - W.full), 0, 1);       // 0 = gerade sichtbar, 1 = volle Stärke
    let a = W.minAlpha + (W.maxAlpha - W.minAlpha) * k;
    if (hp < W.pulseBelow) {
      const p = clamp((W.pulseBelow - hp) / W.pulseBelow, 0, 1);    // je weniger Leben, desto schneller
      const hz = W.pulseHz + (W.pulseHzMax - W.pulseHz) * p;
      a *= 1 - W.pulseDepth * (0.5 + 0.5 * Math.sin(G.realTime * hz * 2 * Math.PI));
    }
    return a;
  }

  heal(amount) {
    amount *= 1 + Save.bonus('heal');                         // Meta-Upgrade Healing
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (amount >= 10) G.addText('dmgHeal', this.x, this.y);
  }

  pickup(amount) {
    this.heal(amount);
    this.levelFlash = 0.25;
    Sfx.play('heal');
  }

  // Buff-Drop eingesammelt (siehe CFG.drops)
  applyBuff(kind) {
    const T = CFG.drops.types[kind];
    const dur = (T.dur || 0) * (1 + Save.bonus('buffTime'));          // Meta-Upgrade Buff Duration
    if (kind === 'guard') this.invincibleT = Math.max(this.invincibleT, dur), this.buffs.guard = dur;
    else if (kind === 'charge') G.addUlt(T.amount);
    else if (kind === 'nova') { G.attacks.push(new StunWave(this, T)); Juice.shake(1.5); }
    else if (T.dur) this.buffs[kind] = dur;                   // alle zeitlich begrenzten Buffs: Restzeit merken (Wirkung siehe jeweilige Stelle)
    this.levelFlash = 0.25;
    G.notice(T.label + '!', T.color);
    Sfx.play('drop');
  }

  // Zuschlag auf den Schadensfaktor nach Spielzeit (CFG.player.ramp): ab 5 / 10 / 15 Min. Wellenzeit machen Gegner mehr Schaden. Bosskaempfe zaehlen nicht zur Zeit, der Zuschlag bleibt aber.
  // Gesamtfaktor = G.diff.damage (Karte) + dmgRamp() (Zeit).
  dmgRamp() {
    if (Tutorial.active) return 0;
    const R = CFG.player.ramp; let m = 0;
    R.marks.forEach((t, i) => { if (G.time >= t) m = R.add[i]; });
    return m;
  }

  // kind: 'touch' | 'shoot' | 'higher'
  hit(kind, mul = 1, src = null) {          // mul: zusätzlicher Schadensfaktor (Bosse: CFG.boss.power.dmg); src: Name der Quelle fuer die Run-Statistik
    if (G.god || this.hitCd > 0 || this.invincibleBase || this.shield) return false;     // die Schildblase blockt alle Treffer
    if (SafeSpot.inside) {                                        // Safe Spot: Treffer abgefangen, fuer die Statistik mit geschaetztem Schaden
      const est = kind === 'higher' ? CFG.player.kiteBaseDamage + G.bossStageKite : (CFG.player.hitDamageMin + CFG.player.hitDamageMax) / 2 * this.damageFactor;
      SafeSpot.blocked(src, est * (G.diff.damage + this.dmgRamp()) * mul);
      this.hitCd = 0.2;                                           // kurze Pause, damit ein Dauerkontakt nicht jedes Bild zaehlt
      return false;
    }
    let amount;
    if (kind === 'higher') {
      amount = CFG.player.kiteBaseDamage + G.bossStageKite;
    } else {
      const base = randInt(CFG.player.hitDamageMin, CFG.player.hitDamageMax);
      amount = base * this.damageFactor * (G.bloodMoon ? CFG.bloodMoon.damageFactor : 1);
      if (Save.equipped('artifact') === 'armor') amount *= 1 - CFG.items.armor.reduce * Save.gearMul('armor');
    }
    amount *= (G.diff.damage + this.dmgRamp()) * mul * Hero.mods().dmgTaken * Perk.mul('dmgTaken') * (this.fortressT > 0 ? 1 - CFG.fortress.reduce : 1);                          // Karten-Schwierigkeit, Boss-Stärke
    amount *= Math.max(0.2, 1 - Save.bonus('resist') - Save.bonus('tough') - Xp.val('armor') - (this.has('barrier') ? CFG.passives.barrier.reduce * Save.gearMul('barrier') : 0));     // Meta-Upgrade Abwehr + Meilenstein Schadensabwehr
    G.addDamageText(amount, this.x, this.y);                      // die Zahl zeigt den echten Schaden (nach Karte, Zeit, Boss, Ruestung ...)
    if (Save.equipped('artifact') === 'thorns') this.thornBurst();
    if (this.has('aegis') && this.aegisCd <= 0 && this.hp - amount < CFG.passives.aegis.hp) {    // Aegis-Protokoll: Notschutz
      this.invincibleT = Math.max(this.invincibleT, CFG.passives.aegis.protect * Save.gearMul('aegis'));
      this.aegisCd = CFG.passives.aegis.cooldown;
      G.trigger('AEGIS PROTOCOL!', STYLE.pal.cyan, { flash: 0.3, radius: 90, rings: 2, life: CFG.passives.aegis.protect, hold: true });
    }
    this.hp -= amount;
    Stats.dealt(src, amount);
    Sfx.play('hurt');
    this.sinceHit = 0;
    this.hitCd = CFG.player.hitCooldown + Save.bonus('recovery') + Xp.val('recovery');
    this.flash = 0.25;
    G.resetCombo();
    Juice.sparks(this.x, this.y, STYLE.pal.red, 5);
    Juice.flash(STYLE.pal.red, 0.2, 0.12);
    Juice.shake(kind === 'higher' ? 3 : 1.6);
    if (kind === 'higher') Juice.hitStop(0.05);
    return true;
  }

  update(dt) {
    const f = framesOf(dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.surgeT = Math.max(0, this.surgeT - dt);
    this.aegisCd = Math.max(0, this.aegisCd - dt * Save.gearMul('aegis'));
    this.decoyT = Math.max(0, this.decoyT - dt);
    this.levelFlash = Math.max(0, (this.levelFlash || 0) - dt);
    this.invincibleT = Math.max(0, this.invincibleT - dt);
    this.fortressT = Math.max(0, this.fortressT - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.chillT = Math.max(0, this.chillT - dt);
    const cdDt = dt * this.cdRate;          // Meta-Upgrade: Abklingzeiten laufen schneller ab
    this.dashCd = Math.max(0, this.dashCd - cdDt * Save.gearMul('dash'));          // Ability-Stufe: Abklingzeit laeuft schneller ab
    this.pulseCd = Math.max(0, this.pulseCd - cdDt * Save.gearMul('pulse'));
    this.bloodCd = Math.max(0, this.bloodCd - dt);
    for (const k of Object.keys(this.cds)) this.cds[k] = Math.max(0, this.cds[k] - cdDt * Save.gearMul(k));
    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    this.curseT = Math.max(0, this.curseT - dt);

    this.selectWeapon();
    this.useAbilities(dt);
    this.useArtifact();
    this.move(f);
    if (this.dashLeft <= 0) { const [bx, by] = MapEnv.pushAt(this.x, this.y, this.radius); this.x += bx * f; this.y += by * f; }       // Schlackenband schiebt (nicht im Dash)
    if (this.dashLeft > 0 || this.surgeT > 0) Juice.ghost(this);   // Nachbilder bei Dash und Boost
    this.useWeapon(dt, f);
    this.updateUltimate();
    this.updateBloodburst();
    this.updateAfk(dt);
    this.gearTick(dt);
    {                                                                       // Cosmetics: Spur, Aura-Flammen, Jetpack
      const moving = (this.canMove === 1 && this.anyMoveKey() && this.moveGo) || this.dashLeft > 0, tr = Cos.cur('trail');
      if (tr.shape === 'echo') { if (moving) Juice.ghost(this, 0.5); } else Cos.trailTick(Juice.particles, tr, this, dt, moving, G.realTime);
      Cos.auraTick(Juice.particles, Cos.cur('aura'), this.x, this.y, dt);
      Cos.gearTick(Juice.particles, Cos.cur('gear'), this.x, this.y, this.dir, dt, moving);
      if (G.infinite) Cos.endlessTick(Juice.particles, Cos.cur('endless'), this, dt, moving);
      this.cosMoving = moving;
      Cos2.floorTick(dt, this, moving);                                      // Spuren am Boden (FLOOR)
      Cos2.petTick(dt, this, moving);                                        // Begleiter (PET)
    }
    if (this.has('blades') && !(this.bladesObj && this.bladesObj.alive)) { this.bladesObj = new OrbitBlades(this); G.attacks.push(this.bladesObj); }
    this.sinceHit += dt;

    if (G.bossLock) {
      // Kamera steht still: der Spieler bleibt im Bild und kann nicht vor dem Boss davonlaufen
      this.x = clamp(this.x, G.cam.x - 235, G.cam.x + 235);
      this.y = clamp(this.y, G.cam.y - 175, G.cam.y + 175);
    } else if (!CFG.map.infinite) {
      [this.x, this.y] = clampToMap(this.x, this.y, 12);
    }
    if (this.buffs.regen > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + CFG.drops.types.regen.hps * dt);       // Repair-Buff
    const regen = (Save.equipped('artifact') === 'regen' ? CFG.items.regen.perSecond * Save.gearMul('regen') : 0) + Save.bonus('regen') + Xp.val('regen') + (this.has('nano') ? CFG.nano.perSecond * Save.gearMul('nano') * (this.sinceHit >= CFG.nano.calmAfter ? CFG.nano.calmMul : 1) : 0);
    if (regen > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + regen * dt);
    if (this.hp < 0.1) {
      if (Save.equipped('artifact') === 'phoenix' && !this.phoenixUsed) {       // Artefakt Extra-Leben: einmal pro Lauf zurueck
        this.phoenixUsed = true; Ach.add('revive');
        this.hp = Math.min(this.maxHp, CFG.items.phoenix.hp * Save.gearMul('phoenix'));
        this.invincibleT = Math.max(this.invincibleT, CFG.items.phoenix.protect);
        Juice.hitStop(0.1); Juice.zoomPulse(1.05, 0.4);
        G.trigger('REVIVAL CORE!', STYLE.pal.yellow, { flash: 0.5, radius: 140, rings: 3, life: CFG.items.phoenix.protect, hold: true });
        Cos2.reviveStart();                                                  // Cosmetic REVIVE (z. B. Totem of Undying)
      } else G.die();
    }
  }

  selectWeapon() {
    const n = WEAPON_NAMES_LIST.length;
    for (let i = 1; i <= n; i++) if (Input.actDown('weapon' + i)) this.weapon = i - 1;
    if (Input.wheel) this.weapon = (this.weapon + Input.wheel + n) % n;
  }

  anyMoveKey() {
    return Input.actDown('up') || Input.actDown('left') || Input.actDown('down') || Input.actDown('right');
  }

  move(f) {
    const px0 = this.x, py0 = this.y;
    const w = Input.actDown('up'), a = Input.actDown('left'), s = Input.actDown('down'), d = Input.actDown('right');
    // gleiche Reihenfolge der Bedingungen wie im Original (gegenüberliegende Tasten behalten die alte Richtung)
    if (w && !a) this.moveDir = 0;
    if (s && !d) this.moveDir = 180;
    if (a && !s) this.moveDir = -90;
    if (d && !w) this.moveDir = 90;
    if (w && a) this.moveDir = -45;
    if (w && d) this.moveDir = 45;
    if (s && a) this.moveDir = -135;
    if (s && d) this.moveDir = 135;

    const can = this.canMove, P = CFG.player, anyKey = this.anyMoveKey();
    if (Save.data.mouseAim) {                                                  // Maus-Zielen: Blickrichtung = zur Maus, Laufen unabhaengig davon in die Tastenrichtung (Tippen-zum-Drehen entfaellt)
      this.moveGraceT = 0; this.keyHeldT = anyKey ? 1 : 0; this.moveArmed = anyKey; this.moveGo = anyKey;
      if (can > 0 && Input.mouse.x > -900) {
        const mx = Input.mouse.x - STAGE_W / 2 + G.cam.x, my = STAGE_H / 2 - Input.mouse.y + G.cam.y;
        if (Math.hypot(mx - this.x, my - this.y) > 4) this.dir = dirTo(this.x, this.y, mx, my);
      }
      if (can === 1 && anyKey) {
        const sp = this.moveSpeed() * f;
        this.x += fwdX(this.moveDir) * sp; this.y += fwdY(this.moveDir) * sp;
      }
      this.iceStep(px0, py0, f);
      this.moveDash(f);
      return;
    }
    // Tippen = nur drehen: Ein neuer Tastendruck laesst den Spieler zuerst nur in die Richtung zeigen (sofort, in alle 8 Richtungen).
    // Er laeuft erst los, wenn die Taste laenger als P.tapSeconds gehalten wird, er schon in diese Richtung schaut oder er gerade erst gelaufen ist.
    // Fuer den AFK-Schaden zaehlt schon das Tippen als Bewegen (anyMoveKey).
    this.moveGraceT = Math.max(0, (this.moveGraceT || 0) - f / 30);
    if (!anyKey) { this.keyHeldT = 0; this.moveArmed = false; this.moveGo = false; }
    else {
      const first = !this.keyHeldT;
      this.keyHeldT = (this.keyHeldT || 0) + f / 30;
      if (!this.moveArmed && (this.keyHeldT >= P.tapSeconds || (first && (this.moveGraceT > 0 || Math.abs(angleDiff(this.moveDir, this.dir)) <= P.faceTolerance)))) this.moveArmed = true;
      this.moveGo = this.moveArmed;
    }
    if (can > 0) {
      const turn = angleDiff(this.moveDir, this.dir);
      if (anyKey && !this.moveArmed) this.dir = this.moveDir;                  // Tippen: sofort ausrichten, kein Laufen
      else {                                                                   // sanft in Laufrichtung drehen (Original: 20 % pro Bild), grosse Wenden schneller
        const k = 1 - Math.pow(1 - (Math.abs(turn) > 90 ? P.turnSmoothingBig : P.turnSmoothing), f);
        this.dir += Math.sign(turn) * Math.min(Math.abs(turn), Math.max(Math.abs(turn * k), P.turnMinStep * f));
      }
      if (can === 1 && anyKey && this.moveArmed) {
        this.moveGraceT = P.moveGrace;
        moveForward(this, this.moveSpeed() * f);
      }
    }
    this.iceStep(px0, py0, f);
    this.moveDash(f);
  }

  // Frost-Treffer: kuehlt den Spieler (Schild, Unverwundbarkeit und Phase schuetzen)
  chill(sec) {
    if (G.god || this.shield || this.invincible) return;
    if (this.chillT <= 0) { Sfx.play('crack'); Juice.sparks(this.x, this.y, STYLE.pal.ice, 8, 3); }
    this.chillT = Math.max(this.chillT, sec);
  }
  // Eis: auf einem Eisfeld folgt die Geschwindigkeit der Eingabe nur langsam (Ausrutschen), danach klingt sie schnell ab. (px0, py0) = Position vor der Bewegung dieses Bildes.
  iceStep(px0, py0, f) {
    const I = CFG.ice, dx = this.x - px0, dy = this.y - py0, on = MapEnv.iceAt(px0, py0, this.radius);
    if (on) {
      const k = 1 - Math.pow(1 - I.grip, f), vx = dx / f, vy = dy / f;
      this.slideX += (vx - this.slideX) * k; this.slideY += (vy - this.slideY) * k;
      this.x = px0 + this.slideX * f; this.y = py0 + this.slideY * f;
    } else if (this.slideX || this.slideY) {
      const d = Math.pow(I.decay, f);
      this.slideX *= d; this.slideY *= d;
      if (Math.abs(this.slideX) < 0.05 && Math.abs(this.slideY) < 0.05) this.slideX = this.slideY = 0;
      this.x += this.slideX * f; this.y += this.slideY * f;
    }
  }
  // Lauftempo pro Bild mit allen Boni und Bremsen (gemeinsam fuer Tasten- und Maus-Steuerung)
  moveSpeed() {
    let speed = this.boosted ? CFG.player.boostSpeed : CFG.player.speed;
    const melee = Save.equipped('melee');
    if (this.weapon === WEAPON.SWORD && Input.actDown('attack') && !this.shield) speed *= (CFG[melee] || CFG.sword).moveFactor;
    if (this.buffs.haste > 0) speed *= CFG.drops.types.haste.mult;
    if (this.surgeT > 0) speed *= CFG.surge.mult;
    if (this.has('thrusters')) speed *= 1 + CFG.passives.thrusters.speed * Save.gearMul('thrusters');
    speed *= (1 + Save.bonus('speed') + Xp.val('speed')) * Hero.mods().speed;
    if (this.curseT > 0) speed *= CFG.patterns.support.kinds.curse.slow;
    speed *= MapEnv.slowAt(this.x, this.y, this.radius, true);          // Säurepfütze bremst
    if (this.chillT > 0) speed *= CFG.chill.slow;                       // Frost-Treffer kuehlen
    return speed;
  }
  // Dash-Bewegung. Bei Maus-Zielen geht der Dash in die gehaltene Tastenrichtung (ohne Taste zur Maus), sonst in Blickrichtung.
  moveDash(f) {
    if (this.dashLeft <= 0) return;
    const step = Math.min(this.dashLeft, f), d = Save.data.mouseAim && this.dashDir !== undefined ? this.dashDir : this.dir;
    this.x += fwdX(d) * CFG.dash.stepsPerFrame * step; this.y += fwdY(d) * CFG.dash.stepsPerFrame * step;
    this.dashLeft -= step;
    if (this.dashLeft <= 0) { this.dashLeft = 0; this.dashCd = Loadout.dash.cooldown; }
  }

  // Abilities laufen unabhängig von der Waffe. Welche Taste welche Fähigkeit auslöst, steht in CFG.loadout.slots.
  useAbilities(dt) {
    for (const tier of CFG.loadout.tiers) {
      const id = this.slots[tier.id];
      if (!id || !Input.actPressed('ability_' + tier.id)) continue;
      const was = this.abilityBusy(id);
      this.castAbility(id);
      if (!was && this.abilityBusy(id)) Save.gearXp(id, CFG.gear.xp.ability);          // erfolgreicher Einsatz: Hintergrund-XP
    }
    // Schildblase: läuft ab, danach Abklingzeit. Die Abklingzeit zählt nur, solange keine Blase da ist.
    if (this.shield) {
      this.shieldLeft -= dt;
      if (this.shieldLeft <= 0) this.endShield();
    } else {
      this.shieldCd = Math.max(0, this.shieldCd - dt * this.cdRate * Save.gearMul('shield'));
    }
  }

  castAbility(id) {
    {
      if (id === 'dash') this.tryDash();
      else if (id === 'shield') this.toggleShield();
      else if (id === 'pulse') this.tryPulse();
      else if (id === 'blink') this.tryBlink();
      else if (id === 'frost') this.tryStunWave(id);
      else if (id === 'surge') this.trySurge();
      else if (id === 'decoy') this.tryDecoy();
      else if (id === 'bombard') this.tryBombard();
      else if (id === 'shockstep') this.tryStunWave(id);
      else if (id === 'adrenaline') this.tryCast(id, () => { this.buffs.rapid = Math.max(this.buffs.rapid, CFG.adrenaline.duration); this.levelFlash = 0.25; G.trigger('COMBAT SPEED!', STYLE.pal.yellow, { flash: 0, radius: 50, rings: 2 }); });
      else if (id === 'drone') this.tryCast(id, () => { this.drone = new Drone(this); G.attacks.push(this.drone); });
      else if (id === 'overcharge') this.tryCast(id, () => { G.addUlt(CFG.overcharge.amount); this.levelFlash = 0.25; G.trigger('POWER SURGE!', STYLE.pal.cyan, { flash: 0.15, radius: 70, rings: 2 }); });
      else if (id === 'hack') this.tryHack();
      else if (id === 'necromancy') this.tryNecromancy();
      else if (id === 'stims') this.tryCast(id, () => { for (const k of ['haste', 'rapid', 'guard']) this.applyStim(k); G.trigger('COMBAT STIMS!', STYLE.pal.yellow, { flash: 0.15, radius: 70, rings: 2 }); });
      else if (id === 'storm') this.tryCast(id, () => G.attacks.push(new Storm(this)));
      else if (id === 'berserk') this.tryCast(id, () => {
        const B = CFG.berserk;
        this.buffs.rapid = Math.max(this.buffs.rapid, B.duration); this.buffs.haste = Math.max(this.buffs.haste, B.duration);
        this.invincibleT = Math.max(this.invincibleT, B.protect); this.levelFlash = 0.25;
        G.trigger('OVERDRIVE!', STYLE.pal.red, { flash: 0.2, radius: 80, rings: 2, life: B.duration, hold: true });
      });
    }
  }

  // Kampf-Stims: ein Drop-Buff mit verkuerzter Dauer (ohne Meldung/Sound je Buff)
  applyStim(kind) {
    const dur = CFG.drops.types[kind].dur * CFG.stims.durMul * (1 + Save.bonus('buffTime'));
    if (kind === 'guard') { this.invincibleT = Math.max(this.invincibleT, dur); this.buffs.guard = dur; } else this.buffs[kind] = dur;
    this.levelFlash = 0.25;
  }

  // Held-Artefakt (Taste Input 'artifact'): Fortress Slam (Bulwark), Rift Step (Specter), Chrono Lock (Archon); Abklingzeiten in this.cds
  useArtifact() {
    const A = Hero.artifact();
    if (!A || !Input.actPressed('artifact')) return;
    if (A.id === 'fortress') this.tryCast('fortress', () => {
      G.attacks.push(new Pulse(this)); this.fortressT = CFG.fortress.duration; Juice.shake(2.5); Juice.zoomPulse(0.97, 0.3);
      G.trigger('FORTRESS SLAM!', STYLE.pal.orange, { flash: 0.15, radius: 90, rings: 2, life: CFG.fortress.duration, hold: true });
    });
    else if (A.id === 'rift') this.tryRift();
    else if (A.id === 'chrono') this.tryCast('chrono', () => {
      G.attacks.push(new StunWave(this, CFG.chrono)); Juice.zoomPulse(1.04, 0.4);
      G.trigger('CHRONO LOCK!', STYLE.pal.ice, { flash: 0.25, radius: 120, rings: 3 });
    });
    else if (A.id === 'catalyst') this.tryCast('catalyst', () => {                         // Alchemist: Heilung + Betaeubung + Buffs
      const C = CFG.catalyst;
      this.heal(C.heal); G.attacks.push(new StunWave(this, C));
      for (const k of C.buffs) { const dur = CFG.drops.types[k].dur * (1 + Save.bonus('buffTime')); this.buffs[k] = Math.max(this.buffs[k] || 0, dur); }
      this.levelFlash = 0.25; Juice.zoomPulse(1.03, 0.3);
      G.trigger('CATALYST!', STYLE.pal.green, { flash: 0.2, radius: 100, rings: 3 });
    });
  }

  // Rift Step: springt in Blickrichtung und trifft alles auf der Strecke (Gegner C.hits mal, Bosse C.bossDmg)
  tryRift() {
    const C = CFG.rift;
    if (this.cds.rift > 0 || this.canMove === 0) return;
    const x0 = this.x, y0 = this.y;
    this.x += fwdX(this.dir) * C.distance; this.y += fwdY(this.dir) * C.distance;
    if (G.bossLock) { this.x = clamp(this.x, G.cam.x - 235, G.cam.x + 235); this.y = clamp(this.y, G.cam.y - 175, G.cam.y + 175); }
    else if (!CFG.map.infinite) [this.x, this.y] = clampToMap(this.x, this.y, 12);
    pushOutOfObstacles(this, this.radius);
    for (const e of G.enemies) {
      if (!e.alive || !segHitsCircle(x0, y0, this.x, this.y, C.width, e.x, e.y, e.radius)) continue;
      for (let i = 0; i < C.hits && e.alive; i++) e.takeHit(i === 0, 'rift');
    }
    for (const b of G.bossList()) if (segHitsCircle(x0, y0, this.x, this.y, C.width, b.x, b.y, b.radius)) { b.hp -= C.bossDmg * damageBoost(); b.bar = 0; }
    for (const o of G.obstacles) if (o.alive && segHitsCircle(x0, y0, this.x, this.y, C.width, o.x, o.y, o.r)) o.hurt(1);
    G.attacks.push(new RiftTrail(x0, y0, this.x, this.y), new BlinkFlash(x0, y0), new BlinkFlash(this.x, this.y));
    this.invincibleT = Math.max(this.invincibleT, C.protect);
    Juice.sparks(this.x, this.y, STYLE.pal.ice, 8, 3); Juice.zoomPulse(CFG.juice.dashZoom, 0.25);
    Sfx.play('blink');
    this.cds.rift = C.cooldown;
  }

  // Neural Hack: die naechsten Gegner (keine Bosse) laufen zu dir ueber
  tryHack() {
    const C = CFG.hack;
    if (this.cds.hack > 0 || this.canMove === 0) return;
    const list = G.enemies.filter((e) => e.alive && !e.minion && !e.elite && dist2(this.x, this.y, e.x, e.y) <= C.radius * C.radius).sort((a, b) => dist2(this.x, this.y, a.x, a.y) - dist2(this.x, this.y, b.x, b.y)).slice(0, C.count);
    if (!list.length) { Sfx.play('deny'); return; }
    for (const e of list) { G.attacks.push(new Ally(e.type, e.x, e.y, e.hitsLeft + C.bonusHits, C.life, e.size)); e.alive = false; Juice.sparks(e.x, e.y, STYLE.pal.purple, 6, 3); }
    Sfx.play('blink'); G.trigger('NEURAL HACK!', STYLE.pal.purple, { flash: 0.1, radius: C.radius, rings: 2 });
    this.cds.hack = C.cooldown;
  }

  // Necromancy: gerade gefallene Gegner in der Naehe stehen als deine Diener wieder auf
  tryNecromancy() {
    const C = CFG.necromancy;
    if (this.cds.necromancy > 0 || this.canMove === 0) return;
    const list = G.fallen.filter((f) => G.time - f.t <= C.window && dist2(this.x, this.y, f.x, f.y) <= C.radius * C.radius).slice(-C.count);
    if (!list.length) { Sfx.play('deny'); return; }
    for (const f of list) { G.attacks.push(new Ally(f.type, f.x, f.y, C.hits, C.life, f.size)); Juice.sparks(f.x, f.y, STYLE.pal.purple, 6, 3); G.fallen.splice(G.fallen.indexOf(f), 1); }
    Sfx.play('blink'); G.trigger('NECROMANCY!', STYLE.pal.purple, { flash: 0.1, radius: C.radius * 0.5, rings: 2 });
    this.cds.necromancy = C.cooldown;
  }

  // Ist die Ability gerade in Abklingzeit/aktiv? (Hilfe, um einen erfolgreichen Einsatz fuer die Hintergrund-XP zu erkennen)
  abilityBusy(id) {
    if (id === 'dash') return this.dashLeft > 0 || this.dashCd > 0;
    if (id === 'shield') return !!this.shield;
    if (id === 'pulse') return this.pulseCd > 0;
    return (this.cds[id] || 0) > 0;
  }

  // Hintergrund-XP fuer Dinge, die dauerhaft wirken: passive Abilities und das ausgeruestete Implant (nur Zeit im Lauf)
  gearTick(dt) {
    const xp = CFG.gear.xp.perSecond * dt;
    for (const tier of CFG.loadout.tiers) { const id = this.slots[tier.id]; if (id && CFG.loadout.abilities[id].passive) Save.gearXp(id, xp); }
    Save.gearXp(Save.equipped('artifact'), xp);
  }

  tryDash() {
    if (this.dashCd <= 0 && this.dashLeft <= 0 && this.canMove > 0) {
      this.dashDir = Save.data.mouseAim && this.anyMoveKey() ? this.moveDir : this.dir;
      G.attacks.push(new DashTrail(this.x, this.y, this.dashDir));
      Sfx.play('dash');
      Juice.zoomPulse(CFG.juice.dashZoom, 0.3);                     // kurz rauszoomen: der Dash wirkt schneller
      this.dashLeft = Math.round(2.5 + Loadout.dash.lvl);
      this.beam.state = 'none';
    }
  }

  tryPulse() {
    if (this.pulseCd > 0 || this.canMove === 0) return;
    G.attacks.push(new Pulse(this));
    Sfx.play('pulse');
    this.pulseCd = CFG.pulse.cooldown;
  }

  tryBlink() {
    const C = CFG.blink;
    if (this.cds.blink > 0 || this.blinkT > 0 || this.canMove === 0) return;
    G.attacks.push(new BlinkFlash(this.x, this.y));
    Sfx.play('blink');
    this.blinkT = C.duration;
    this.blinkFrom = { x: this.x, y: this.y };     // dorthin laufen die Gegner weiter (sie haben dich verloren)
    this.cds.blink = C.cooldown;
  }

  // Ability mit Abklingzeit auslösen (cds[id], Zahlen in CFG[id])
  tryCast(id, fn) {
    if (this.cds[id] > 0 || this.canMove === 0) return;
    fn();
    Sfx.play('buff');
    this.cds[id] = CFG[id].cooldown;
  }

  trySurge() {
    if (this.cds.surge > 0 || this.surgeT > 0 || this.canMove === 0) return;
    Juice.zoomPulse(0.97, 0.3);
    Sfx.play('buff');
    this.surgeT = CFG.surge.duration;
    this.cds.surge = CFG.surge.cooldown;
    this.levelFlash = 0.25;
  }

  // Koeder: Trugbild an der aktuellen Stelle, Gegner laufen und zielen dorthin (wie bei Blink), du bleibst aber sichtbar und verwundbar
  tryDecoy() {
    if (this.cds.decoy > 0 || this.decoyT > 0 || this.canMove === 0) return;
    Sfx.play('blink');
    this.decoy = { x: this.x, y: this.y, dir: this.dir };
    this.decoyT = CFG.decoy.duration;
    this.cds.decoy = CFG.decoy.cooldown;
    G.attacks.push(new BlinkFlash(this.x, this.y));
  }

  tryBombard() {
    if (this.cds.bombard > 0 || this.canMove === 0) return;
    G.attacks.push(new Bombard(this));
    Sfx.play('event');
    this.cds.bombard = CFG.bombard.cooldown;
  }

  // Artefakt Dornenpanzer: Gegner und Bosse in der Naehe nehmen Schaden, wenn du getroffen wirst
  thornBurst() {
    const C = Object.assign({}, CFG.items.thorns, { radius: CFG.items.thorns.radius * Save.gearMul('thorns') });
    for (const e of G.enemies) {
      if (!e.alive || !circlesOverlap(this.x, this.y, C.radius, e.x, e.y, e.radius)) continue;
      for (let i = 0; i < C.hits && e.alive; i++) e.takeHit(i === 0, 'grenade');
    }
    for (const b of G.bossList()) if (circlesOverlap(this.x, this.y, C.radius, b.x, b.y, b.radius)) { b.hp -= C.bossDmg * damageBoost(); b.bar = 0; }
    G.trigger('SPIKES!', STYLE.pal.orange, { flash: 0, radius: C.radius, rings: 1, life: 0.8 });
  }

  // Frostring: Gegner im Radius bleiben stehen
  tryStunWave(id) {
    if (this.cds[id] > 0 || this.canMove === 0) return;
    G.attacks.push(new StunWave(this, CFG[id]));
    Sfx.play('frost');
    this.cds[id] = CFG[id].cooldown;
  }

  // Ein Druck startet die Blase, ein zweiter beendet sie früher (die Abklingzeit startet in beiden Fällen)
  toggleShield() {
    if (this.shield) { this.endShield(); return; }
    if (this.shieldCd <= 0 && this.canMove !== 0) {
      this.shield = new Shield(this);
      G.attacks.push(this.shield);
      Sfx.play('shieldOn');
      this.shieldLeft = Loadout.shield.duration;
      this.beam.state = 'none';
    }
  }

  endShield() {
    Sfx.play('shieldOff');
    this.shield.alive = false;
    this.shield = null;
    this.shieldCd = Loadout.shield.cooldown;
  }

  // Anzeige-Daten für das HUD: frac (0..1), ready, active, label
  abilityStatus(id) {
    const A = CFG.loadout.abilities[id];
    if (this.cds[id] !== undefined) {                       // alle Abilities mit eigener Abklingzeit; aktiv = noch in der Wirkzeit
      const cd = this.cds[id], C = CFG[id];
      return { label: A.name, icon: A.icon, iconW: A.iconW, frac: 1 - cd / C.cooldown, left: cd, ready: cd <= 0, active: !!C.duration && id !== 'frost' && id !== 'shockstep' && cd > C.cooldown - C.duration };
    }
    if (A.passive) {                                         // passiv: immer bereit (Aegis zeigt seine Pause)
      const cd = id === 'aegis' ? this.aegisCd : 0;
      return { label: A.name, icon: A.icon, iconW: A.iconW, frac: 1 - cd / CFG.passives.aegis.cooldown, left: cd, ready: cd <= 0, active: false };
    }
    if (id === 'dash') {
      return { label: 'Dash', icon: 'dash1', iconW: 20, frac: this.dashLeft > 0 ? 0 : 1 - this.dashCd / Math.max(0.01, Loadout.dash.cooldown), left: this.dashLeft > 0 ? 0 : this.dashCd, ready: this.dashCd <= 0, active: this.dashLeft > 0 };
    }
    if (id === 'pulse') {
      return { label: 'Shockwave', icon: 'pulseIcon', iconW: 18, frac: 1 - this.pulseCd / CFG.pulse.cooldown, left: this.pulseCd, ready: this.pulseCd <= 0, active: false };
    }
    return {
      label: 'Force Bubble', icon: 'bubble', iconW: 16, active: !!this.shield, ready: !this.shield && this.shieldCd <= 0, left: this.shield ? 0 : this.shieldCd,
      frac: this.shield ? this.shieldLeft / Loadout.shield.duration : 1 - this.shieldCd / Math.max(0.01, Loadout.shield.cooldown),
    };
  }

  // Starke Waffen ausser dem Beam: Plasmagranate (Druck = werfen) und Feuerpfad (Druck = ein/aus, wirkt dann von allein)
  useHeavyItems(dt) {
    const heavy = Save.equipped('heavy'), F = this.fire;
    const press = () => Input.actPressed('beam') && !SafeSpot.inside;          // im Safe Spot keine starke Waffe (Feuerpfad schaltet sich ab)
    if (SafeSpot.inside) F.on = false;
    this.grenadeCd = Math.max(0, this.grenadeCd - dt * this.cdRate * Save.gearMul('grenade'));
    if (heavy === 'grenade' && press() && this.grenadeCd <= 0 && this.canMove !== 0 && !this.shield && this.dashLeft <= 0) {
      G.attacks.push(new PlasmaGrenade(this));
      Sfx.play('throw');
      this.grenadeCd = CFG.grenade.cooldown;
      Save.gearXp('grenade', CFG.gear.xp.heavy);
    }
    this.heavyCd = Math.max(0, this.heavyCd - dt * this.cdRate * Save.gearMul(heavy));
    if ((heavy === 'chain' || heavy === 'blackhole') && press() && this.heavyCd <= 0 && this.canMove !== 0 && !this.shield && this.dashLeft <= 0) {
      if (heavy === 'chain') {
        const bolt = new ChainLightning(this, this.evo('storm'));
        if (bolt.count > 0) { G.attacks.push(bolt); Sfx.play('chain'); this.heavyCd = CFG.chain.cooldown; Save.gearXp('chain', CFG.gear.xp.heavy); } else this.heavyCd = 0.4;     // kein Ziel: nur kurze Pause
      } else {
        Sfx.play('blackhole');
        G.attacks.push(new BlackHole(this, this.aimAssist({ aimAssistDeg: 25, aimAssistRange: CFG.blackhole.distance + 80 }), this.evo('horizon')));
        this.heavyCd = CFG.blackhole.cooldown;
        Save.gearXp('blackhole', CFG.gear.xp.heavy);
      }
    }
    if (heavy !== 'firetrail') { F.on = false; return; }
    const C = CFG.fire;
    if (press()) { F.on = F.on ? false : F.fuel >= C.minStart; Sfx.play(F.on ? 'fire' : 'shieldOff'); }
    if (F.on) {
      F.fuel -= dt / (C.burnTime * Save.gearMul('firetrail') * (this.evo('wildfire') ? CFG.evolutions.wildfire.fuel : 1));          // Stufe/Evolution: Brennstoff haelt laenger
      Save.gearXp('firetrail', CFG.gear.xp.perSecond * dt);
      if (F.fuel <= 0) { F.fuel = 0; F.on = false; }
      F.dropT -= dt;
      if (F.dropT <= 0) { F.dropT = C.dropEvery; G.attacks.push(new FirePatch(this.x, this.y, this.evo('wildfire'))); }
    } else F.fuel = Math.min(1, F.fuel + dt / C.rechargeTime);
  }

  useWeapon(dt, f) {
    const space = Input.actDown('attack') && !SafeSpot.inside;          // im Safe Spot kein Angriff
    if (!space) this.swordBase = this.dir;

    // Beam (Taste E): laden bei gehaltener Taste, nach dem Loslassen feuern
    const b = this.beam;
    const beamKey = Input.actDown('beam') && Save.equipped('heavy') === 'beam' && !SafeSpot.inside;     // der Beam ist eine ausruestbare starke Waffe (im Safe Spot gesperrt)
    if (this.shield || this.dashLeft > 0 || (SafeSpot.inside && b.state === 'load')) {
      b.state = 'none';
    } else if (beamKey) {
      if (b.state !== 'load') { b.state = 'load'; b.clock = 0; Sfx.play('beamCharge'); }
      b.clock += CFG.beam.loadPerFrame * f * (1 + Save.bonus('beam')) * Save.gearMul('beam') * (this.evo('overload') ? CFG.evolutions.overload.load : 1);
    } else if (b.state === 'load') {
      b.state = 'fire';
      b.clock = Math.min(b.clock, CFG.beam.maxClock);
      Save.gearXp('beam', CFG.gear.xp.heavy);
      G.attacks.push(new BeamAttack(this));
      Sfx.play('beam');
    }
    if (b.state === 'fire') {
      b.clock -= CFG.beam.decayPerSecond * dt;
      if (b.clock < 0) b.state = 'none';
    }

    this.useHeavyItems(dt);

    // Mit Schild, mitten im Dash oder beim Beam-Laden/Feuern kann man nicht mit Schwert/Schuss angreifen
    const blocked = this.dashLeft > 0 || this.shield || b.state !== 'none';
    const slotItem = Save.equipped(this.weapon === WEAPON.SWORD ? 'melee' : 'ranged');       // was in Waffenslot 1 (Nahkampf) / 2 (Fernkampf) liegt
    this.syncBlades(space && !blocked && slotItem === 'sword');
    if (this.evo('vortex') && this.blades.length) {                                   // Evolution: drehende Klingen schicken regelmäßig einen Ring los
      this.vortexT -= dt * this.hasteFor('sword');
      if (this.vortexT <= 0) { this.vortexT = CFG.evolutions.vortex.every; G.attacks.push(new VortexRing(this)); Sfx.play('impulse'); }
    } else this.vortexT = 0.8;                                                        // kurze Anlaufzeit nach dem Start des Drehens
    if (!space || blocked || slotItem === 'sword' || this.attackCd > 0) return;
    if (slotItem === 'lance') {
      const aim = this.aimAssist(CFG.lance);       // vorderer Stoss zielt leicht auf Gegner, die anderen sind daran ausgerichtet
      Sfx.play('stab');
      for (const off of Loadout.lance.offsets) {
        G.attacks.push(new LanceThrust(this, off, aim));
        if (this.evo('railspear')) G.attacks.push(new Shot(this.x, this.y, aim + off, false, { frames: CFG.evolutions.railspear.frames }));      // Evolution: Begleit-Bolzen
      }
      this.attackCd = Loadout.lance.cooldown / this.hasteFactor;
    } else if (slotItem === 'impulse') {
      G.attacks.push(new ImpulseWave(this));
      Sfx.play('impulse');
      this.attackCd = Loadout.impulse.cooldown / this.hasteFactor;
    } else if (slotItem === 'shot') {
      const lvl = Loadout.shot.lvl;
      const spread = lvl === 0 ? [0] : lvl === 1 ? [10, -10] : [0, 20, -20];
      const aim = this.aimAssist();
      Sfx.play('shoot');
      for (const off of spread) { const s = new Shot(this.x, this.y, aim + off); s.seek = this.evo('seeker'); s.stopOnHit = true; s.pierce = Loadout.shotPierce(); G.attacks.push(s); }
      this.attackCd = Loadout.shot.cooldown * (1 - Save.bonus('shot')) / this.hasteFor('shot');
      const R = CFG.shot.reload[lvl];                                                 // Nachladepause nur beim Blaster, ab Doppelschuss; mit dem dritten Schuss etwas laenger
      if (G.realTime - this.lastShotT > CFG.shot.idleRefill) this.shotMag = 0;       // laenger nicht geschossen: Magazin ist wieder voll
      this.lastShotT = G.realTime;
      if (R && ++this.shotMag >= R.mag) {
        this.shotMag = 0; this.reloadMax = R.time / this.hasteFor('shot'); this.reloadT = this.reloadMax;
        this.attackCd = Math.max(this.attackCd, this.reloadMax);
        Sfx.play('tick');
      } else if (!R) this.shotMag = 0;
    } else if (slotItem === 'whip') {
      Sfx.play('swing');
      const wAim = this.aimAssist(CFG.whip);
      G.attacks.push(new ArcSlash(this, wAim, CFG.whip));
      if (this.evo('echowhip')) G.attacks.push(new ArcSlash(this, wAim, Object.assign({}, CFG.whip, { delay: CFG.evolutions.echowhip.delay })));      // Evolution: zweiter Hieb
      this.attackCd = CFG.whip.cooldown / this.hasteFactor;
    } else if (slotItem === 'katana') {
      const aim = this.aimAssist(CFG.katana), K = CFG.katana;
      Sfx.play('swing');
      G.attacks.push(new ArcSlash(this, aim, K), new ArcSlash(this, aim + 180, Object.assign({}, K, { delay: K.backDelay })));
      if (this.evo('eclipse')) for (const off of [90, -90]) G.attacks.push(new ArcSlash(this, aim + off, Object.assign({}, K, { delay: K.backDelay + CFG.evolutions.eclipse.delay })));      // Evolution: Seiten
      this.attackCd = K.cooldown / this.hasteFactor;
    } else if (slotItem === 'hammer') {
      Sfx.play('slam');
      G.attacks.push(new GroundSlam(this, this.dir));
      if (this.evo('quake')) G.attacks.push(new Pulse(this));                  // Evolution: Druckwelle bei jedem Schlag
      this.attackCd = CFG.hammer.cooldown / this.hasteFactor;
    } else if (slotItem === 'shotgun') {
      const S = CFG.shotgun, aim = this.aimAssist();
      Sfx.play('shotgun');
      const dd = this.evo('doomspread') ? CFG.evolutions.doomspread : null, np = S.pellets + (dd ? dd.pellets : 0);      // Evolution: mehr Schrote, weiter
      for (let i = 0; i < np; i++) G.attacks.push(new Shot(this.x, this.y, aim + (np === 1 ? 0 : -S.spread + (2 * S.spread * i) / (np - 1)) + rand(-3, 3), false, { speed: S.speed, frames: S.frames * (dd ? dd.frames : 1) }));
      this.attackCd = S.cooldown * (1 - Save.bonus('shot')) / this.hasteFactor;
    } else if (slotItem === 'boomerang') {
      if (!G.attacks.some((a) => a.alive && a instanceof Boomerang)) { Sfx.play('throw'); const bAim = this.aimAssist(); if (this.evo('twindisc')) { const ta = CFG.evolutions.twindisc.angle; G.attacks.push(new Boomerang(this, bAim + ta), new Boomerang(this, bAim - ta)); } else G.attacks.push(new Boomerang(this, bAim)); this.attackCd = CFG.boomerang.cooldown * (1 - Save.bonus('shot')) / this.hasteFactor; }
    } else if (slotItem === 'molotov') {
      Sfx.play('throw');
      const fl = new Molotov(this, this.aimAssist()); fl.evo = this.evo('inferno'); G.attacks.push(fl);
      this.attackCd = CFG.molotov.cooldown * (1 - Save.bonus('shot')) / this.hasteFactor;
    } else if (slotItem === 'rocket') {
      Sfx.play('missile');
      const rk = new Rocket(this, this.aimAssist(CFG.rocket)); rk.napalm = this.evo('napalm'); G.attacks.push(rk);
      this.attackCd = CFG.rocket.cooldown * (1 - Save.bonus('shot')) / this.hasteFactor;
    } else if (slotItem === 'bounce') {
      const lvl = Loadout.shot.lvl;
      const spread = lvl === 0 ? [0] : lvl === 1 ? [10, -10] : [0, 20, -20];
      const aim = this.aimAssist();
      Sfx.play('shoot');
      const pr = this.evo('prism') ? CFG.evolutions.prism : null;                // Evolution: weiter, zwei Zusatzschuesse
      const offs = pr ? spread.concat([pr.angle, -pr.angle]) : spread;
      for (const off of offs) G.attacks.push(new Shot(this.x, this.y, aim + off, true, pr ? { frames: CFG.bounce.frames * pr.frames } : {}));
      this.attackCd = Loadout.shot.cooldown * CFG.bounce.cdMul * (1 - Save.bonus('shot')) / this.hasteFor('shot');
    }
    if (this.attackCd > 0) {                                                    // es wurde angegriffen: Waffenstufe verkuerzt die Pause, Hintergrund-XP
      this.attackCd /= Save.gearMul(slotItem);
      Save.gearXp(slotItem, CFG.gear.xp.attack);
    }
  }

  // Schwertklingen: es gibt nie mehr Klingen als freigeschaltet (Loadout.sword.number). Neue entstehen nur, wenn das Drehen beginnt.
  // Wird die Taste gehalten, drehen die vorhandenen weiter (hold), losgelassen beenden sie ihre Umdrehung. Kommt eine Klinge
  // durch Freischalten dazu, werden alle gleichmaessig an der ersten (vordersten) ausgerichtet.
  syncBlades(active) {
    this.blades = (this.blades || []).filter((a) => a.alive);
    for (const bl of this.blades) bl.hold = active;
    if (!active) return;
    const n = Loadout.sword.number;
    if (this.blades.length >= n) return;
    const lead = this.blades[0];
    if (!lead) Save.gearXp('sword', CFG.gear.xp.attack), Sfx.play('swing');
    while (this.blades.length < n) {
      const bl = new SwordSwing(this, lead ? lead.dir : this.swordBase);
      bl.hold = true;
      this.blades.push(bl);
      G.attacks.push(bl);
    }
    // Die erste Klinge gibt Winkel und Tempo vor, alle anderen stehen im festen Abstand 360/n dazu (bei 2: gegenueber, bei 3: 120 Grad usw.)
    const first = this.blades[0];
    this.blades.forEach((bl, i) => { if (i > 0) { bl.lead = first; bl.offset = (360 / n) * i; } });
  }

  // Zielhilfe: nächster Gegner im Kegel vor dem Spieler, sonst einfach die Blickrichtung
  aimAssist(S = CFG.shot) {       // S = Einstellungen mit aimAssistDeg und aimAssistRange (Schuss oder Lanze)
    const sc = this.has('scanner') ? CFG.passives.scanner : null;      // Zielscanner (passiv) erweitert Kegel und Reichweite
    if (sc) { const m = Save.gearMul('scanner'); S = { aimAssistDeg: S.aimAssistDeg * (1 + (sc.deg - 1) * m), aimAssistRange: S.aimAssistRange * (1 + (sc.range - 1) * m) }; }
    let best = null, bestScore = Infinity;
    const targets = G.enemies.concat(G.bossList(), G.spawners);
    for (const t of targets) {
      const d = Math.sqrt(dist2(this.x, this.y, t.x, t.y));
      if (d > S.aimAssistRange || d < 1) continue;
      const diff = Math.abs(angleDiff(dirTo(this.x, this.y, t.x, t.y), this.dir));
      if (diff > S.aimAssistDeg) continue;
      const score = diff * 4 + d * 0.1;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best ? dirTo(this.x, this.y, best.x, best.y) : this.dir;
  }

  updateUltimate() {
    // Aufgeladen: einmalig heilen, schneller laufen
    if (G.ultCharge > CFG.ult.readyAt && !this.boosted) {
      this.boosted = true;
      Sfx.play('ultReady');
      if (CFG.ult.boostHeal > 0 && !this.ultHealed) { this.ultHealed = true; this.heal(CFG.ult.boostHeal); }      // nur beim ersten Aufladen im Lauf (Heal-Meta)
    } else if (G.ultCharge <= CFG.ult.readyAt && this.boosted) {
      this.boosted = false;
    }
    if (Input.actPressed('ultimate') && G.ultCharge > CFG.ult.readyAt && !(this.ult && this.ult.alive)) {
      if (G.bossFight && !CFG.ult.usableInBossFight) return;
      if (G.ultStock > 0) G.ultStock--;                         // gespeichertes Ultimate verbrauchen, große Kugel bleibt voll
      else {                                                    // letztes Ultimate: große Kugel übernimmt den Stand der kleinen (mindestens der übliche Rest)
        G.ultCharge = Math.max(G.ultCharge - CFG.ult.cost, Math.min(G.ultNext * CFG.ult.readyAt, CFG.ult.readyAt));
        G.ultNext = 0;
      }
      this.ult = new Ultimate(this);
      Ach.add('ult');
      Sfx.play('ultimate');
      G.attacks.push(this.ult);
    }
  }

  updateBloodburst() {
    const active = (this.blood && this.blood.alive) || this.bloodCd > 0;
    if (this.bloodArmed && this.hp < CFG.bloodburst.triggerHp && !active) {
      this.bloodArmed = false;
      this.startBloodburst();
    }
    if (!this.bloodArmed && this.hp > CFG.bloodburst.rearmHp) this.bloodArmed = true;
    if (G.combo > CFG.bloodburst.comboNeeded && !active) {
      G.resetCombo();
      this.startBloodburst();
    }
  }

  startBloodburst() {
    Juice.zoomPulse(0.95, 0.6); Juice.shake(3); Juice.flash(STYLE.pal.red, 0.25, 0.2);
    this.blood = new Bloodburst(this);
    Ach.add('bloodburst');
    Sfx.play('bloodburst');
    G.attacks.push(this.blood);
    this.bloodCd = CFG.bloodburst.cooldown * (1 - Save.bonus('blood'));
    this.heal(CFG.bloodburst.heal);
  }

  updateAfk(dt) {
    if (SafeSpot.inside || this.anyMoveKey()) { this.afk = 0; this.afkTick = 0; return; }
    this.afk += dt;
    if (this.afk > CFG.player.afkSeconds) {
      this.afkTick -= dt;
      if (this.afkTick <= 0) {
        this.afkTick = 1;
        if (!G.god && !(G.victory > 0)) { this.hp -= CFG.player.afkDamage; Stats.dealt('STANDING STILL', CFG.player.afkDamage); }
        this.flash = 0.25;
        G.addText('dmg1', this.x, this.y);
        G.resetCombo();
      }
    }
  }

  draw(ctx) {
    const hue = (this.flash > 0 ? 90 : 0) + (this.boosted ? -90 : 0);
    const brightness = this.levelFlash > 0 ? 1.5 : 0;
    if (this.decoyT > 0 && this.decoy) {                    // Koeder: durchsichtiges Trugbild, blinkt kurz vor dem Ende
      const blink = this.decoyT < 1 && Math.floor(this.decoyT * 8) % 2 === 0;
      drawSprite(ctx, Hero.sprite(), this.decoy.x, this.decoy.y, this.decoy.dir, CFG.player.size, { hue: 90, alpha: blink ? 0.2 : 0.55 });
    }
    if (this.reloadT > 0) {                                 // Blaster laedt nach: kleiner Balken unter dem Schiff, fuellt sich bis zum naechsten Schuss
      const bx = Math.round(STAGE_W / 2 + this.x) - 8, by = Math.round(STAGE_H / 2 - this.y) + 15, f = 1 - this.reloadT / this.reloadMax;
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = STYLE.pal.greyDark; ctx.fillRect(bx - 1, by - 1, 18, 4);
      ctx.fillStyle = STYLE.pal.yellow; ctx.fillRect(bx, by, Math.round(16 * f), 2); ctx.restore();
    }
    if (this.chillT > 0) {                                  // gekuehlt: blasser, gestrichelter Eisring
      const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = STYLE.pal.ice; pxRing(ctx, cx, cy, 13, 1, 10, G.realTime * 0.4); ctx.restore();
    }
    {                                                       // aktive Buffs: je ein pulsierender Ring in der Buff-Farbe um den Spieler (damit man sieht, dass sie wirken)
      const act = Object.keys(this.buffs).filter((k) => this.buffs[k] > 0 && CFG.drops.types[k]);
      if (act.length) {
        const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
        ctx.save();
        act.forEach((k, i) => {
          const left = this.buffs[k], R = 15 + i * 4 + Math.sin(G.realTime * 6 + i) * 1.2;
          ctx.globalAlpha = left < 2 && Math.floor(left * 8) % 2 === 0 ? 0.15 : 0.7;          // blinkt kurz vor dem Ende
          ctx.fillStyle = CFG.drops.types[k].color; pxRing(ctx, cx, cy, R, 1, Math.max(8, Math.round(R / 2)));
        });
        ctx.restore();
      }
    }
    if (this.hasField) {                                    // Kraftfeld: dezenter Ring um den Spieler
      const P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, R = CFG.field.radius;
      ctx.save();
      ctx.globalAlpha = 0.1; ctx.fillStyle = P.cyan;
      pxGlow(ctx, cx, cy, R);
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(G.realTime * 3); pxRing(ctx, cx, cy, R, 1, Math.max(8, Math.round(R / 7)));
      ctx.restore();
    }
    const t = G.realTime, gear = Cos.cur('gear');
    Cos.drawAura(ctx, Cos.cur('aura'), this.x, this.y, t);
    if (G.infinite) Cos.drawEndless(ctx, Cos.cur('endless'), this.x, this.y, t, { homeX: 0, homeY: 0, mins: G.time / 60 });
    Cos.drawGear(ctx, gear, this.x, this.y, this.dir, t, 'back');
    Cos2.state.moving = !!this.cosMoving; Cos2.state.dash = this.dashLeft > 0; Cos2.state.hp = clamp(this.hp / this.maxHp, 0, 1);       // Zustand fuer Skins mit Verhalten (Cosmetics)
    const vm = Cos2.victoryMod(Cos2.vic);                                    // Cosmetic Siegerpose "Victory Spin": huepft und dreht sich kurz
    Cos.drawShip(ctx, Cos.player(), this.x, this.y + vm.hop, this.dir + vm.spin, CFG.player.size + (this.boosted ? 30 : 0), { hue, brightness, alpha: this.blinkT > 0 ? 0.18 : 1 }, Cos.cur('skin'), t);
    Cos.drawGear(ctx, gear, this.x, this.y, this.dir, t, 'front');
  }
}
