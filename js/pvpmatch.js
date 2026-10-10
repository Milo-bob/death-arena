// PvP-Arena, Schritt 2: ein Kampf 1 gegen 1. Jeder Spieler spielt sein NORMALES Spiel auf dem eigenen Geraet (eigener Spieler, eigene Waffen,
// ALLE Meta-Upgrades, Held, Implants, Ausruestungsstufen, Cosmetics ...); nur Gegner und Director fehlen. Der Gegner ist ein "Fernspieler":
// ein Enemy, der seine Position aus dem Netz bekommt (RemotePlayer in G.enemies). Dadurch treffen ALLE Waffen ihn so wie einen Gegner.
//
//   Treffer: Angreifer rechnet (seine Waffen, sein Doppeltreffer-Wert, sein Schadensboost) und schickt 'hit' { n }.
//            Der Getroffene wendet n ueber Player.hit an (seine Ruestung, Max-Leben, Heldenwerte, Schildblase, Trefferpause ...).
//   Bild:    alle ~15 Hz 'state' (Position, Blickrichtung, Leben, Schwert-Klingen und Schuesse als Geisterbild zum Ausweichen).
//   Ende:    wer stirbt, schickt 'dead'; der andere gewinnt. Verlaesst der Gegner die Lobby, gewinnt man.
//
// Waffen-Geister gibt es erst fuer Plasma Blade und Blaster (Schritt 2); alle anderen Angriffe (und Abilities) kommen in Schritt 3.

class RemotePlayer extends Enemy {
  constructor(info) {
    super('circle', info.x, info.y, false);
    this.isRemote = true;
    this.name = info.name; this.pid = info.id; this.spr = 'player';
    this.hitsLeft = this.maxHits = 1e9;
    this.nx = info.x; this.ny = info.y; this.nd = info.dir || 0; this.vx = 0; this.vy = 0; this.at = G.realTime;
    this.hp = 100; this.mhp = 100; this.blink = false; this.shield = false;
    this.ghosts = [];                                  // Angriffe des Gegners als reines Bild (kein Schaden)
    this.hitGap = 0; this.dieGap = 0;
  }
  hasteFor() { return 1; }                             // damit SwordSwing-Geister laufen (sie fragen player.hasteFor)

  // Nur Bewegung aus dem Netz, keine KI. Der Treffer-Test steht hier wie bei jedem Gegner (Enemy.update fragt die Waffen ab).
  update(dt) {
    this.alive = true; this.stun = 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hitGap = Math.max(0, this.hitGap - dt); this.dieGap = Math.max(0, this.dieGap - dt);
    const age = Math.min(0.3, G.realTime - this.at), f = framesOf(age);
    const tx = this.nx + this.vx * f, ty = this.ny + this.vy * f, k = Math.min(1, dt * 14);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    const dd = ((this.nd - this.dir + 540) % 360) - 180; this.dir += dd * Math.min(1, dt * 14);
    for (const g of this.ghosts) g.update(dt);
    this.ghosts = this.ghosts.filter((g) => g.alive);
    if (G.pvp && !G.pvp.over && G.pvp.cd <= 0 && this.hitGap <= 0 && !this.blink) {
      const w = weaponHit(this.x, this.y, this.radius);
      if (w) this.takeHit(true, w.kind);
    }
  }

  // Ein Treffer: Einheiten wie bei einem Gegner (Doppeltreffer-Chance) mal Schadensboost, dann an den Gegner schicken
  takeHit(stun = true, src = null) {
    const P = G.pvp;
    if (!P || P.over || P.cd > 0 || this.hitGap > 0) return;
    this.hitGap = CFG.pvp.hitGap;
    const n = this.hitUnits() * damageBoost();
    PvpMatch.send('hit', { n: Math.round(n * 100) / 100, s: src || 'other' });
    this.hitFlash = 0.14;
    Juice.sparks(this.x, this.y, STYLE.pal.yellow, 4, 2.5);
    Sfx.play('hit');
    Cos2.hit(this.x, this.y);
  }
  // Ultimate & Co. rufen die() auf: im PvP ein schwerer Treffer (hoechstens einmal pro Sekunde)
  die() {
    this.alive = true;
    if (this.dieGap > 0 || !G.pvp || G.pvp.over) return;
    this.dieGap = 1;
    PvpMatch.send('hit', { n: CFG.pvp.dieUnits, s: 'ultimate' });
    this.hitFlash = 0.3; Juice.sparks(this.x, this.y, STYLE.pal.yellow, 8, 3.5); Sfx.play('killBig');
  }

  draw(ctx) {
    const cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y;
    for (const g of this.ghosts) g.draw(ctx);
    drawSprite(ctx, this.spr, this.x, this.y, this.dir, CFG.player.size, { hue: 150, brightness: this.hitFlash > 0 ? 2 : 0, alpha: this.blink ? 0.18 : 1 });
    if (this.shield) {
      const P = STYLE.pal; ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = P.cyan; pxRing(ctx, cx, cy, 20, 1, 14, G.realTime); ctx.restore();
    }
    // Name und Lebensbalken ueber dem Gegner
    const P = STYLE.pal, w = 28, f = clamp(this.hp / Math.max(1, this.mhp), 0, 1);
    ctx.save();
    ctx.fillStyle = P.greyDark; ctx.fillRect(Math.round(cx - w / 2) - 1, Math.round(cy - 24) - 1, w + 2, 5);
    ctx.fillStyle = f > 0.35 ? P.red : P.orange; ctx.fillRect(Math.round(cx - w / 2), Math.round(cy - 24), Math.round(w * f), 3);
    ctx.restore();
    uiText(ctx, this.name, cx, cy - 29, { size: STYLE.type.small, color: P.red, align: 'center' });
  }
}

const PvpMatch = {
  rid: null,                                                 // Netz-Id des Gegners

  // Lobby -> Kampf. Erste Runde: beide Seiten starten, sobald 'start' da ist (Gaeste) bzw. nach dem Knopf (Host).
  begin() {
    const ch = Pvp.ch, list = Pvp.players;
    const opp = list.find((p) => ch && p.id !== ch.id);
    if (!ch || !opp) return false;
    G.begin(false, false, 'pvp');
    const host = Pvp.isHost, C = CFG.pvp;
    G.pvp = { over: false, result: null, endAt: 0, cd: C.countdown, sendT: 0, lastState: G.realTime, gone: 0, escAt: 0, opp: { id: opp.id, name: opp.name } };
    this.rid = opp.id;
    CFG.map.halfW = C.camHalf[0]; CFG.map.halfH = C.camHalf[1];
    const P = G.player;
    P.x = host ? -C.spawnX : C.spawnX; P.y = 0; P.dir = host ? 90 : 270;
    G.cam = { x: 0, y: 0 };
    G.time = C.startTime; Loadout.updateByTime(G.time);
    // Waffenstufe wie im Kampf gegen Death: alle Bosse davor besiegt (leise, ohne Auswahl). Die Zeit der Siege zaehlt mit, denn die 3. und 4. Klinge
    // kommen nur, wenn ein Upgrade in ihr Zeitfenster faellt (Loadout.upgradeStats).
    const step = CFG.finalBoss.at / (C.weaponUps + 1);
    for (let i = 1; i <= C.weaponUps; i++) Loadout.upgradeStats(step * i + 0.5);
    this.applyLoadout(P);
    P.hp = P.maxHp;
    G.enemies = [new RemotePlayer({ x: host ? C.spawnX : -C.spawnX, y: 0, dir: host ? 270 : 90, name: opp.name, id: opp.id })];
    G.enemies[0].dir = G.enemies[0].nd;
    Pvp.say('');
    return true;
  },

  // Abilities aus der Lobby (Save.data.pvpLoadout: je Gruppe eine gekaufte Ability), nur was wirklich freigeschaltet ist
  applyLoadout(P) {
    const L = Pvp.loadout();
    P.slots = { weak: L.weak, medium: L.medium, strong: L.strong };
    P.owned = [L.weak, L.medium, L.strong].filter(Boolean);
  },

  get remote() { return G.enemies.find((e) => e.isRemote) || null; },
  send(ev, payload) { if (Pvp.ch) Pvp.ch.send(ev, payload); },

  // Netz -> Spiel
  onMessage(ev, p) {
    const P = G.pvp; if (!P || p.from !== this.rid) return;
    const r = this.remote;
    if (ev === 'state' && r) {
      r.nx = p.x; r.ny = p.y; r.nd = p.d; r.vx = p.vx; r.vy = p.vy; r.at = G.realTime; r.hp = p.hp; r.mhp = p.mh;
      r.spr = p.spr || 'player'; r.blink = !!p.bl; r.shield = !!p.sh;
      this.ghostsFrom(r, p.a || []);
      P.lastState = G.realTime;
    } else if (ev === 'hit') {
      if (P.over || P.cd > 0) return;
      const n = Math.min(CFG.pvp.maxUnits, Math.max(0, +p.n || 0));
      if (n > 0) G.player.hit('pvp', n * CFG.pvp.dmgMul, 'OPPONENT');
    } else if (ev === 'dead') {
      if (!P.over) this.finish('win');
      else if (P.result === 'lose' && G.realTime - P.endAt < 0.6) P.result = 'draw';      // beide fast gleichzeitig
    }
  },

  // Angriffe des Gegners als Bild: Plasma-Blade-Klingen (k 's') und Blaster-Schuesse (k 'b')
  ghostsFrom(r, list) {
    r.ghosts = [];
    for (const a of list.slice(0, CFG.pvp.maxGhosts)) {
      let g = null;
      if (a.k === 's') { g = new SwordSwing(r, a.d); g.sizePct = a.z; g.hold = true; g.damaging = false; }
      else if (a.k === 'b') { g = new Shot(a.x, a.y, a.d); g.sizePct = a.z; g.speed = a.v; g.damaging = false; g.framesLeft = a.f; }
      if (g) r.ghosts.push(g);
    }
  },
  // eigene Angriffe fuer das Bild des Gegners
  snapshot() {
    const out = [], r1 = (v) => Math.round(v * 10) / 10;
    for (const a of G.attacks) {
      if (!a.alive) continue;
      if (a.kind === 'sword') out.push({ k: 's', d: r1(a.dir), z: Math.round(a.sizePct) });
      else if (a.kind === 'shot') out.push({ k: 'b', x: r1(a.x), y: r1(a.y), d: r1(a.dir), z: Math.round(a.sizePct), v: r1(a.speed), f: Math.round(a.framesLeft) });
    }
    return out;
  },

  // pro Bild (aus G.updatePlay): Zaehler, Senden, Ende
  update(dt) {
    const P = G.pvp, C = CFG.pvp;
    if (!P) return;
    if (P.over) { if (G.realTime - P.endAt > C.endDelay) { G.mode = 'pvpend'; } return; }
    const opp = Pvp.ch && Pvp.players.some((p) => p.id === this.rid);
    P.gone = opp ? 0 : P.gone + dt;
    if (P.gone > 1.5 && !P.over) { this.finish('win', 'THE OPPONENT LEFT'); return; }
    if (P.cd > 0) { P.cd = Math.max(0, P.cd - dt); if (P.cd <= 0) P.startShown = G.realTime; }
    P.sendT -= dt;
    if (P.sendT <= 0) {
      P.sendT = 1 / C.sendHz;
      const pl = G.player, r1 = (v) => Math.round(v * 10) / 10;
      this.send('state', { x: r1(pl.x), y: r1(pl.y), d: r1(pl.dir), vx: r1(pl.velX || 0), vy: r1(pl.velY || 0), hp: Math.round(pl.hp), mh: Math.round(pl.maxHp),
        spr: Hero.sprite(), bl: pl.blinkT > 0 ? 1 : 0, sh: pl.shield ? 1 : 0, a: this.snapshot() });
    }
    if (G.realTime - P.lastState > 6 && P.cd <= 0) this.finish('win', 'THE OPPONENT LEFT');       // keine Nachricht mehr: Verbindung weg
  },
  // Vor dem Start laeuft ein Zaehler: alle stehen still. true = dieses Bild nicht spielen
  frozen(dt) {
    const P = G.pvp;
    if (!P) return false;
    if (P.cd > 0) { this.update(dt); return P.cd > 0; }
    return false;
  },

  localDeath() {
    const P = G.pvp;
    if (!P || P.over) return;
    this.send('dead', {});
    this.finish('lose');
  },
  finish(result, why) {
    const P = G.pvp;
    if (!P || P.over) return;
    P.over = true; P.result = result; P.endAt = G.realTime; P.why = why || '';
    if (result === 'win' && Pvp.scores) Pvp.scores.me = (Pvp.scores.me || 0) + 1;
    if (result === 'lose' && Pvp.scores) Pvp.scores.opp = (Pvp.scores.opp || 0) + 1;
    Sfx.play(result === 'win' ? 'levelUp' : 'death');
    Juice.shake(3);
    if (result === 'lose') G.player.hp = 0;
  },
  // ESC im Kampf: zweimal schnell = aufgeben (eine Pause gibt es online nicht)
  escape() {
    const P = G.pvp;
    if (!P || P.over) return;
    if (G.realTime - P.escAt < 1.6) { this.send('dead', {}); this.finish('lose', 'YOU GAVE UP'); }
    else { P.escAt = G.realTime; G.notice('PRESS ESC AGAIN TO GIVE UP', STYLE.pal.orange); }
  },

  updateEnd() {
    if (Input.pressed('Space') || Input.pressed('Enter')) { Sfx.play('select'); this.leaveMatch(); }
  },
  leaveMatch() { G.pvp = null; this.rid = null; G.mode = 'pvp'; if (Pvp.st === 'lobby') Pvp.sel = 0; },

  // Zaehler, Name des Gegners, Punktestand
  drawOverlay(ctx) {
    const P = G.pvp, T = STYLE.type, S = STYLE.pal;
    if (!P) return;
    const sc = Pvp.scores || {};
    uiText(ctx, Pvp.name() + '  ' + (sc.me || 0) + ' : ' + (sc.opp || 0) + '  ' + P.opp.name, STAGE_W / 2, 20, { size: T.small, color: S.ice, align: 'center' });
    if (P.cd > 0) uiText(ctx, String(Math.ceil(P.cd)), STAGE_W / 2, STAGE_H / 2 - 20, { size: T.title, color: S.yellow, align: 'center', glow: S.yellow });
    else if (P.startShown !== undefined && G.realTime - P.startShown < 0.8) uiText(ctx, 'FIGHT!', STAGE_W / 2, STAGE_H / 2 - 20, { size: T.h1, color: S.red, align: 'center' });
    if (P.over) {
      const win = P.result === 'win', draw = P.result === 'draw';
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
      uiText(ctx, draw ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOSE', STAGE_W / 2, STAGE_H / 2, { size: T.title, color: draw ? S.ice : win ? S.green : S.red, align: 'center', glow: win ? S.green : S.red });
      if (P.why) uiText(ctx, P.why, STAGE_W / 2, STAGE_H / 2 + 20, { size: T.body, color: S.grey, align: 'center' });
    }
  },
  // Ergebnis-Bildschirm nach dem Kampf (die Welt steht dahinter)
  drawEnd(ctx) {
    const P = G.pvp, T = STYLE.type, S = STYLE.pal;
    if (!P) return;
    ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
    const win = P.result === 'win', draw = P.result === 'draw', sc = Pvp.scores || {};
    uiText(ctx, draw ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOSE', STAGE_W / 2, 120, { size: T.title, color: draw ? S.ice : win ? S.green : S.red, align: 'center', glow: win ? S.green : S.red });
    if (P.why) uiText(ctx, P.why, STAGE_W / 2, 146, { size: T.body, color: S.grey, align: 'center' });
    uiText(ctx, Pvp.name() + '  ' + (sc.me || 0) + ' : ' + (sc.opp || 0) + '  ' + P.opp.name, STAGE_W / 2, 190, { size: T.h2, color: S.ice, align: 'center' });
    uiText(ctx, 'BACK TO THE LOBBY [SPACE]', STAGE_W / 2, 250, { size: T.h2, color: S.cyan, align: 'center' });
    UIHit.add(STAGE_W / 2 - 110, 232, 220, 26, () => {}, { act: () => this.leaveMatch() });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'YOU WIN!': 'DU GEWINNST!', 'YOU LOSE': 'DU VERLIERST', 'DRAW': 'UNENTSCHIEDEN', 'FIGHT!': 'KAMPF!', 'THE OPPONENT LEFT': 'DER GEGNER IST WEG', 'YOU GAVE UP': 'DU HAST AUFGEGEBEN',
  'PRESS ESC AGAIN TO GIVE UP': 'ESC NOCHMAL DRÜCKEN ZUM AUFGEBEN', 'BACK TO THE LOBBY [SPACE]': 'ZURÜCK ZUR LOBBY [LEERTASTE]',
  'ROUND STARTING': 'RUNDE STARTET', 'A ROUND NEEDS EXACTLY 2 PLAYERS FOR NOW': 'EINE RUNDE BRAUCHT VORERST GENAU 2 SPIELER',
});
