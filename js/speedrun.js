// Speedrun-Modus (Hauptmenue > PLAY > SPEEDRUN). Zahlen: CFG.speedrun in config.js [13].
// Drei Karten: BOSS RUSH (alle Bosse hintereinander), GAUNTLET (Streifen mit festen Gegnern, Strafzeit fuer Uebriggelassene, Boss am Ende),
// SEED RUN (Welt und Handel aus einer Seed-Zahl: Schluessel sammeln, Portal finden, Ember Core eintauschen, Boss).
// Alle Laeufe nutzen das Standard-Loadout (Save.srOn, siehe save.js): nur die Waffen sind waehlbar. Tod = Abbruch. Keine Credits, kein XP, keine Erfolge.
// Die Uhr (G.sr.t) laeuft in Echtzeit ab der ersten Eingabe, auch in Auswahlbildschirmen, und steht nur im Pausenmenue.

// Zufallsgenerator mit Seed (mulberry32): gleicher Seed = gleiche Folge
function srRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Zeit als m:ss.cc
function srFmt(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}

const SR_BOSS_NAMES = { octagon: 'OCTAGON', kite: 'KITE', summoner: 'SUMMONER', turret: 'LASER TOWER', twin: 'TWINS', arena: 'ARENA BOSS', reaper: 'DEATH', forge: 'FORGE WARDEN', colossus: 'SLAG COLOSSUS', spore: 'SPORE MOTHER', plague: 'PLAGUE DRONE', frost: 'FROST SENTINEL', wraith: 'FROST WRAITH' };

// Schluessel-Pickup (Seed Run): bleibt liegen, bis man ihn einsammelt
class SrKey {
  constructor(x, y) { this.x = x; this.y = y; this.alive = true; this.age = 0; }
  update(dt) {
    this.age += dt;
    if (touchesPlayer(this.x, this.y, 14 * pickupRange())) {
      this.alive = false;
      G.sr.keys++;
      Sfx.play('buy'); Juice.sparks(this.x, this.y, STYLE.pal.yellow, 10, 4);
      G.notice('KEY ' + G.sr.keys + ' / ' + CFG.speedrun.seed.keysNeed, STYLE.pal.yellow, STYLE.type.h1);
    }
  }
  draw(ctx) {
    const P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y + Math.sin(G.realTime * 5) * 1.5;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = P.yellow; pxGlow(ctx, cx, cy, 16);
    ctx.globalAlpha = 1; ctx.fillStyle = P.yellow; pxDisc(ctx, cx - 2, cy - 2, 5);
    ctx.fillStyle = P.void; pxDisc(ctx, cx - 2, cy - 2, 2);
    ctx.fillStyle = P.yellow; pxLine(ctx, cx + 1, cy + 1, cx + 9, cy + 9, 2); pxFill(ctx, cx + 6, cy + 9, 2); pxFill(ctx, cx + 9, cy + 6, 2);
    ctx.restore();
    outlinedText(ctx, 'KEY', cx, cy - 16, STYLE.type.small, P.yellow);
  }
}

// Heilung im Gauntlet: verschwindet nicht von selbst
class SrHeal extends PowerUp {
  update(dt) { this.age = 0; super.update(dt); }
}

const SpeedRun = {
  // ---------- Hilfen ----------
  C: () => CFG.speedrun,
  unlocked(kind) { return Save.data.dev === true || Save.plevel() >= CFG.speedrun.kinds[kind].level; },
  bestKey(sr) { return sr.kind === 'seed' ? 'seed:' + sr.seed : sr.kind; },
  best(key) { return (Save.data.sr.best || {})[key] || null; },
  color(kind) { return STYLE.pal[CFG.speedrun.kinds[kind].color] || STYLE.pal.ice; },

  // Neuer Lauf (aus G.begin): Zustand, den es nur im Speedrun gibt
  create(kind) {
    const S = Save.data.sr;
    const sr = { kind, t: 0, started: false, done: false, ok: false, splits: [], penalty: 0, left: 0, leftList: [], infinite: kind === 'seed', finalAt: kind === 'rush' ? CFG.finalBoss.at : null,
      bounds: null, woken: {}, gap: 0, gateDone: false, age: 0, result: null, reason: '' };
    if (kind === 'seed') {
      let seed;
      if (S.seedMode === 'daily') seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
      else if (S.seedMode === 'fixed') seed = Math.max(1, Math.floor(S.seedNum) || 1);
      else seed = 1 + Math.floor(Math.random() * 999999);
      Object.assign(sr, { seed, rng: srRng(seed), barterRng: srRng((seed ^ 0x9e3779b9) >>> 0), stage: 0, keys: 0, scrap: 0, core: false, tradeT: 0, spawnT: 3, trades: 0, lastKills: 0,
        carriers: [], portal: null, merchant: null, bossType: 'octagon', tradeMsg: '', tradeMsgT: 0 });
    }
    return sr;
  },

  // Karte des Laufs: Karte 1 (Rush, Seed Run) bzw. eigener Streifen (Gauntlet)
  applyMap() {
    G.mapIdx = 0; G.map = CFG.maps[0]; G.diff = G.map.diff;
    if (G.sr.kind === 'gauntlet') G.map = Object.assign({}, CFG.maps[0], { id: 'gauntlet', name: 'GAUNTLET', half: CFG.speedrun.gauntlet.half.slice() });
    CFG.map.halfW = G.map.half[0]; CFG.map.halfH = G.map.half[1];
  },

  // Aufbau am Ende von G.begin: Gegner, Positionen
  setup() {
    const sr = G.sr, p = G.player;
    if (sr.kind === 'gauntlet') {
      const g = CFG.speedrun.gauntlet;
      p.x = g.startX; p.y = 0;
      G.cam.x = clamp(p.x, -(g.half[0] - STAGE_W / 2), g.half[0] - STAGE_W / 2); G.cam.y = 0;
      sr.bounds = { x0: -g.half[0], x1: g.half[0], y0: -g.half[1], y1: g.half[1] };
      G.bossStageOctagon = g.bossStage;
      g.groups.forEach(([x, y, type, n, spread], gi) => {
        for (let i = 0; i < n; i++) {
          const a = i * 2.4, r = spread * Math.sqrt((i + 0.5) / n);
          const e = new Enemy(type, x + Math.cos(a) * r, y + Math.sin(a) * r, false);
          e.dormant = true; e.grp = 'g' + gi;
          [e.x, e.y] = clampToMap(e.x, e.y, e.radius);
          G.enemies.push(e);
        }
      });
      for (const [x, y, amount] of g.heals) G.powerups.push(new SrHeal(x, y, amount));
    } else if (sr.kind === 'seed') {
      const S = CFG.speedrun.seed, R = sr.rng;
      G.bossStageOctagon = S.bossStage;
      const idx = []; for (let i = 0; i < S.carriers; i++) idx.push(i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const keyed = new Set(idx.slice(0, S.keysTotal));
      for (let i = 0; i < S.carriers; i++) {
        const ang = (i + R()) * Math.PI * 2 / S.carriers, d = S.carrierRing[0] + R() * (S.carrierRing[1] - S.carrierRing[0]);
        const type = S.carrierTypes[Math.floor(R() * S.carrierTypes.length)];
        const e = new Enemy(type, Math.cos(ang) * d, Math.sin(ang) * d, true);
        e.dormant = true; e.grp = 'c' + i; e.wake = S.carrierWake;
        G.enemies.push(e);
        sr.carriers.push({ e, key: keyed.has(i), done: false });
      }
      const pa = R() * Math.PI * 2, pd = S.portalDist[0] + R() * (S.portalDist[1] - S.portalDist[0]);
      sr.portal = { x: Math.cos(pa) * pd, y: Math.sin(pa) * pd };
      sr.merchant = { x: sr.portal.x + Math.cos(pa + Math.PI / 2) * S.merchantOffset, y: sr.portal.y + Math.sin(pa + Math.PI / 2) * S.merchantOffset };
      sr.bossType = S.bosses[Math.floor(R() * S.bosses.length)];
    }
  },

  // Schlafende Gegner (Gauntlet-Gruppen, Seed-Traeger): wachen auf, wenn der Spieler nah genug kommt; eine Gruppe wacht gemeinsam auf
  sleeping(e) {
    const sr = G.sr;
    if (!sr) { e.dormant = false; return false; }
    const wake = e.wake || (CFG.speedrun.gauntlet && CFG.speedrun.gauntlet.wake) || 300;
    if (sr.woken[e.grp] || Math.hypot(e.x - G.player.x, e.y - G.player.y) < wake) { sr.woken[e.grp] = true; e.dormant = false; return false; }
    return true;
  },

  bossSpot() {
    const sr = G.sr;
    if (sr && sr.kind === 'gauntlet') { const g = CFG.speedrun.gauntlet; return [(g.gateX + g.half[0]) / 2, 0]; }
    return null;
  },
  lastBoss() { return !!G.sr && G.sr.kind !== 'rush'; },

  // ---------- Uhr und Ablauf ----------
  tick(dt) { const sr = G.sr; if (sr && sr.started && !sr.done) sr.t += dt; },
  split(name) { const sr = G.sr; sr.splits.push({ name, t: sr.t }); },
  start() {
    const sr = G.sr;
    sr.started = true;
    sr.gap = sr.kind === 'rush' ? CFG.speedrun.rush.start : 0;
    G.notice('GO!', STYLE.pal.green, STYLE.type.h1);
    Sfx.play('select');
  },
  // Aus G.endBossFight: Zwischenzeit und (Boss Rush) Pause bis zum naechsten Kampf
  bossEnded(result, type) {
    const sr = G.sr;
    if (!sr || sr.done && sr.kind === 'rush' && type !== 'reaper') return;
    if (result === 'win') this.split(sr.kind === 'rush' ? (SR_BOSS_NAMES[type] || String(type).toUpperCase()) : 'BOSS');
    sr.gap = CFG.speedrun.rush.gap;
  },
  stop() {                                                   // letzter Boss gefallen: Uhr anhalten
    const sr = G.sr;
    if (!sr || sr.done) return;
    sr.done = true; sr.ok = true;
  },

  update(dt) {
    const sr = G.sr;
    if (sr.done) return;
    if (!sr.started) {
      if (G.player.anyMoveKey() || Input.actDown('attack')) this.start();
      return;
    }
    if (sr.kind === 'rush') this.updateRush(dt);
    else if (sr.kind === 'gauntlet') this.updateGauntlet(dt);
    else this.updateSeed(dt);
  },

  // Boss Rush: nach der Pause springt G.time auf den Zeitpunkt des naechsten Bosses im normalen Lauf (CFG.boss.steps), der Director startet ihn wie gewohnt.
  // So haben Waffenstufen, Klingenzahl und Boss-Leben die gleichen Werte wie im Regular-Modus.
  updateRush(dt) {
    if (G.bossFight || G.finalStarted) return;
    const sr = G.sr;
    sr.gap -= dt;
    if (sr.gap > 0) return;
    const order = G.map.bossOrder || CFG.boss.order;
    G.time = G.bossCount < order.length ? CFG.boss.steps * (G.bossCount + 1) + 0.2 : G.finalAt;
    G.director.updateBosses();
  },

  updateGauntlet() {
    const sr = G.sr, g = CFG.speedrun.gauntlet;
    if (sr.gateDone || G.bossFight) return;
    if (G.player.x < g.gateX) return;
    sr.gateDone = true;
    let n = 0, pen = 0;
    sr.leftList = [];
    for (const e of G.enemies) if (e.alive && !e.minion) { const w = g.weight[e.type] !== undefined ? g.weight[e.type] : g.defaultWeight; n++; pen += w; }
    sr.left = n; sr.penalty = pen;
    this.split('GATE');
    sr.bounds = { x0: g.gateX, x1: g.half[0], y0: -g.half[1], y1: g.half[1] };
    G.notice(n ? 'LEFT BEHIND: ' + n + '   +' + pen.toFixed(1) + 'S' : 'CLEAN RUN!', n ? STYLE.pal.orange : STYLE.pal.green, STYLE.type.h1);
    Sfx.play(n ? 'event' : 'upgrade');
    G.startBossFight(g.boss);
  },

  // Seed Run: Etappen 0 SALVAGE, 1 FIND, 2 TRADE, 3 PORTAL/BOSS
  updateSeed(dt) {
    const sr = G.sr, S = CFG.speedrun.seed, p = G.player;
    sr.tradeMsgT = Math.max(0, sr.tradeMsgT - dt);
    const dk = G.kills - sr.lastKills; sr.lastKills = G.kills; sr.scrap += dk * S.scrapKill;
    for (const c of sr.carriers) {
      if (c.done || c.e.alive) continue;
      c.done = true; sr.scrap += S.scrapCarrier;
      if (c.key) { G.powerups.push(new SrKey(c.e.x, c.e.y)); G.notice('KEY DROPPED!', STYLE.pal.yellow); }
      else G.notice('NO KEY HERE', STYLE.pal.grey);
    }
    if (G.bossFight) return;
    if (sr.stage === 0 && sr.keys >= S.keysNeed) { sr.stage = 1; this.split('KEYS'); G.notice('ALL KEYS! FOLLOW THE ARROW TO THE PORTAL', STYLE.pal.cyan, STYLE.type.h1); Sfx.play('upgrade'); }
    if (sr.stage === 1 && Math.hypot(p.x - sr.portal.x, p.y - sr.portal.y) < 170) { sr.stage = 2; this.split('PORTAL'); G.notice('TRADER FOUND: TRADE SCRAP FOR AN EMBER CORE', STYLE.pal.cyan, STYLE.type.h1); Sfx.play('upgrade'); }
    if (sr.stage === 2) this.updateTrade(dt);
    if (sr.stage === 3 && Math.hypot(p.x - sr.portal.x, p.y - sr.portal.y) < S.portalRadius) {
      sr.stage = 4;                                         // Portal betreten: Kamera friert am Portal ein (wie bei Endlos-Bosskaempfen), Spieler steht links vom Boss
      G.cam.x = sr.portal.x; G.cam.y = sr.portal.y;
      p.x = sr.portal.x - 110; p.y = sr.portal.y;
      G.startBossFight(sr.bossType);
      return;
    }
    // Druck: Gegner spawnen wie im Regular-Modus (ausserhalb des Bildes)
    sr.spawnT -= dt;
    if (sr.spawnT <= 0) {
      const st = Math.min(3, sr.stage);
      sr.spawnT = S.every[st] * rand(0.8, 1.2);
      const alive = G.enemies.filter((e) => e.alive && !e.dormant && !e.mini).length;
      if (alive < S.cap[st]) {
        const w = S.spawnTypes[st], keys = Object.keys(w);
        let roll = Math.random() * keys.reduce((a, k) => a + w[k], 0), type = keys[0];
        for (const k of keys) { if (roll < w[k]) { type = k; break; } roll -= w[k]; }
        const pts = G.spawnPointList(), [x, y] = pts[randInt(0, pts.length - 1)];
        G.enemies.push(new Enemy(type, x, y, false));
      }
    }
  },

  // Handel: im Ring um den Haendler stehen; jede Runde kostet Schrott, das Ergebnis der n-ten Runde steht mit dem Seed fest
  updateTrade(dt) {
    const sr = G.sr, S = CFG.speedrun.seed, p = G.player, m = sr.merchant;
    sr.near = Math.hypot(p.x - m.x, p.y - m.y) < S.tradeRadius;
    if (!sr.near) { sr.tradeT = Math.max(sr.tradeT, 0.4); return; }
    sr.tradeT -= dt;
    if (sr.tradeT > 0 || sr.scrap < S.tradeCost) return;
    sr.tradeT = S.tradeCooldown;
    sr.scrap -= S.tradeCost; sr.trades++;
    const total = S.barter.reduce((a, b) => a + b.w, 0);
    let roll = sr.barterRng() * total, got = S.barter[0].id;
    for (const b of S.barter) { if (roll < b.w) { got = b.id; break; } roll -= b.w; }
    const say = (t, c) => { sr.tradeMsg = t; sr.tradeMsgT = 2.2; G.notice(t, c || STYLE.pal.ice); };
    if (got === 'core') {
      sr.core = true; sr.stage = 3; this.split('CORE');
      G.notice('EMBER CORE! THE PORTAL IS OPEN', STYLE.pal.orange, STYLE.type.h1); Sfx.play('ultimate'); Juice.flash(STYLE.pal.orange, 0.4, 0.2);
      sr.tradeMsg = 'EMBER CORE!'; sr.tradeMsgT = 3;
    } else if (got === 'heal') { p.pickup(S.barterHeal); say('TRADE ' + sr.trades + ': HEALING', STYLE.pal.green); }
    else if (got === 'haste') { p.applyBuff('haste'); sr.tradeMsg = 'TRADE ' + sr.trades + ': SPEED'; sr.tradeMsgT = 2.2; }
    else if (got === 'rapid') { p.applyBuff('rapid'); sr.tradeMsg = 'TRADE ' + sr.trades + ': RAPID FIRE'; sr.tradeMsgT = 2.2; }
    else if (got === 'scrap') { sr.scrap += S.barterScrap; say('TRADE ' + sr.trades + ': +' + S.barterScrap + ' SCRAP', STYLE.pal.yellow); }
    else { say('TRADE ' + sr.trades + ': JUNK', STYLE.pal.grey); Sfx.play('deny'); }
  },

  // ---------- Ende ----------
  fail() {
    const sr = G.sr;
    if (!sr || sr.done) return;
    sr.done = true; sr.ok = false; sr.reason = Stats.lastSrc || 'UNKNOWN';
    this.toEnd(false);
    Sfx.play('death');
  },
  // Lauf gewonnen (nach der kurzen Siegphase)
  finish() {
    const sr = G.sr;
    sr.final = sr.t + sr.penalty;
    sr.result = this.record(sr);
    this.toEnd(true);
    Sfx.play('ultimate');
  },
  toEnd(ok) {
    const sr = G.sr;
    G.mode = 'srend'; sr.age = 0;
    for (const key of ['enemies', 'shots', 'spawners', 'blasts', 'meteors', 'bossShots']) G[key] = [];
    G.boss = null; G.intro = null;
    Save.write();
  },
  // Bestzeit speichern (nicht bei Dev-/Cheat-Laeufen)
  record(sr) {
    if (G.cheated) return { cheat: true, best: false };
    const B = Save.data.sr.best || (Save.data.sr.best = {}), key = this.bestKey(sr), old = B[key] || null;
    const isBest = !old || sr.final < old.time;
    if (isBest) {
      delete B[key];                                          // neu eintragen (ans Ende), damit die aeltesten Seeds zuerst verfallen
      B[key] = { time: sr.final, base: sr.t, penalty: sr.penalty, splits: sr.splits.map((s) => ({ name: s.name, t: s.t })) };
      const keys = Object.keys(B).filter((k) => k.startsWith('seed:'));
      for (let i = 0; i < keys.length - 40; i++) delete B[keys[i]];
    }
    return { best: isBest, old, cheat: false };
  },
  exit() { Save.srOn = false; G.sr = null; },

  // ---------- Setup-Bildschirm ----------
  openSetup() {
    const S = Save.data.sr;
    if (!CFG.speedrun.kinds[S.kind]) S.kind = 'rush';
    for (const slot of CFG.speedrun.loadoutSlots) if (S.loadout[slot] === undefined || (S.loadout[slot] && !CFG.items.catalog[S.loadout[slot]])) S.loadout[slot] = CFG.speedrun.loadoutStart[slot];
  },
  rows() { return ['kind'].concat(Save.data.sr.kind === 'seed' ? ['seed'] : [], CFG.speedrun.loadoutSlots, ['start', 'back']); },
  options(slot) {
    const list = Object.keys(CFG.items.catalog).filter((id) => CFG.items.catalog[id].slot === slot && CFG.items.catalog[id].impl);
    return slot === 'heavy' ? [null].concat(list) : list;
  },
  updateSetup() {
    const S = Save.data.sr, rows = this.rows(), n = rows.length;
    if (G.srSel >= n) G.srSel = n - 1;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) G.srSel = (G.srSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) G.srSel = (G.srSel + 1) % n;
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    const ok = Input.pressed('Space') || Input.pressed('Enter'), row = rows[G.srSel];
    if (row === 'kind' && (dir || ok)) { const o = CFG.speedrun.order; S.kind = o[(o.indexOf(S.kind) + (dir || 1) + o.length) % o.length]; Save.write(); }
    else if (row === 'seed') {                                   // drei Knoepfe nebeneinander: A/D waehlt, bei ENTER SEED tippt man die Zahl (Ziffern, Rueckschritt) oder Leertaste/Klick fragt danach
      const modes = ['random', 'daily', 'fixed'];
      if (dir) { S.seedMode = modes[clamp(modes.indexOf(S.seedMode) + dir, 0, 2)]; G.srTyped = false; Save.write(); }
      if (S.seedMode === 'fixed') {
        for (const c of Object.keys(Input.pressedNow)) {
          const m = /^(?:Digit|Numpad)(d)$/.exec(c);
          if (m) { S.seedNum = G.srTyped ? Math.min(999999999, S.seedNum * 10 + Number(m[1])) : Number(m[1]); G.srTyped = true; Save.write(); }
        }
        if (Input.pressedNow.Backspace) { S.seedNum = Math.floor(S.seedNum / 10); G.srTyped = true; Save.write(); return; }          // Rueckschritt loescht eine Ziffer (nicht "zurueck")
        if (ok) this.askSeed();
      }
    }
    else if (CFG.speedrun.loadoutSlots.includes(row) && (dir || ok)) {
      const list = this.options(row), i = Math.max(0, list.indexOf(S.loadout[row]));
      S.loadout[row] = list[(i + (dir || 1) + list.length) % list.length]; Save.write();
    }
    else if (row === 'start' && ok) {
      if (!this.unlocked(S.kind)) { Sfx.play('deny'); return; }
      G.begin(false, false, S.kind);
    }
    else if ((row === 'back' && ok) || Input.pressed('Escape')) G.mode = 'modeselect';
  },
  // Seed per Eingabefenster (fuer Touch/Maus); Abbruch oder Unsinn aendert nichts
  askSeed() {
    const S = Save.data.sr;
    try {
      const v = window.prompt(I18n.t('ENTER A SEED NUMBER'), String(S.seedNum));
      const n = Math.floor(Number(String(v === null ? '' : v).trim()));
      if (n >= 0 && n <= 999999999 && String(v).trim() !== '') { S.seedNum = n; G.srTyped = true; Save.write(); }
    } catch (e) { /* kein Eingabefenster (eingebettet): Ziffern per Tastatur */ }
  },
  seedLabel(S) { return S.seedMode === 'fixed' ? 'SEED ' + Math.max(1, S.seedNum) : 'ENTER SEED'; },
  drawSetup(ctx) {
    const P = STYLE.pal, T = STYLE.type, S = Save.data.sr, K = CFG.speedrun.kinds[S.kind], col = this.color(S.kind);
    drawMenuBg(ctx, 'keysettings');
    drawEmbers(ctx);
    uiText(ctx, 'SPEEDRUN', STAGE_W / 2, 40, { size: T.h1, color: P.orange, align: 'center', glow: P.orange });
    const rows = this.rows(), lw = 330, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX, top = 62, GAP = 38;
    const name = (id) => (id ? CFG.items.catalog[id].name : 'NONE');
    const label = (r) => {
      if (r === 'kind') return 'MAP: ' + K.name;
      if (r === 'melee') return 'MELEE: ' + name(S.loadout.melee);
      if (r === 'ranged') return 'RANGED: ' + name(S.loadout.ranged);
      if (r === 'heavy') return 'HEAVY: ' + name(S.loadout.heavy);
      return r === 'start' ? 'START' : 'BACK';
    };
    rows.forEach((r, i) => {
      if (r === 'seed') { this.drawSeedRow(ctx, top + i * GAP, 40, lw, 30, i); return; }
      drawMenuRow(ctx, top + i * GAP, label(r), G.srSel === i, { w: lw, h: 30, cx: 40 + lw / 2, hit: () => { G.srSel = i; }, lr: r !== 'start' && r !== 'back', locked: r === 'kind' && !this.unlocked(S.kind) ? K.level : 0 });
    });
    const h = 7 * GAP - 8;
    uiPanel(ctx, PX, top, PW, h, { color: col, fill: P.void, alpha: 0.92, glow: true });
    uiText(ctx, K.name, PX + 14, top + 22, { size: T.h1, color: col });
    uiText(ctx, K.short, PX + 14, top + 38, { size: T.small, color: P.grey });
    let ty = top + 56;
    for (const t of K.info) ty += 12 * uiWrap(ctx, t, PX + 14, ty, PW - 28, 12, { size: T.body, color: P.ice }) + 5;
    const B = this.best(S.kind === 'seed' ? (S.seedMode === 'fixed' ? 'seed:' + Math.max(1, S.seedNum) : S.seedMode === 'daily' ? 'seed:' + Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')) : null) : S.kind);
    uiText(ctx, 'BEST: ' + (B ? srFmt(B.time) : '-'), PX + 14, ty + 4, { size: T.h2, color: P.yellow });
    ty += 22;
    if (S.kind === 'seed') ty += 12 * uiWrap(ctx, S.seedMode === 'fixed' ? 'TYPE DIGITS (BACKSPACE DELETES) OR PRESS SPACE.' : S.seedMode === 'daily' ? 'DAILY SEED: the same world for everyone today.' : 'A / D: RANDOM, DAILY OR YOUR OWN SEED.', PX + 14, ty, PW - 28, 12, { size: T.small, color: P.grey }) + 4;
    uiWrap(ctx, 'STANDARD LOADOUT: no upgrades, gear levels, implants or hero. All abilities are free. No credits, no XP, death ends the run.', PX + 14, ty + 4, PW - 28, 11, { size: T.small, color: P.orange });
    if (!this.unlocked(S.kind)) uiText(ctx, 'LOCKED: PLAYER LEVEL ' + K.level + ' (YOU: ' + Save.plevel() + ')', PX + 14, top + h - 10, { size: T.body, color: P.red });
  },

  // Seed-Zeile: RANDOM SEED | DAILY SEED | ENTER SEED nebeneinander (Klick waehlt, ein zweiter Klick auf ENTER SEED oeffnet die Eingabe)
  drawSeedRow(ctx, y, x, w, h, i) {
    const P = STYLE.pal, T = STYLE.type, S = Save.data.sr, sel = G.srSel === i, gap = 6, bw = Math.floor((w - 2 * gap) / 3);
    const btn = [{ id: 'random', text: 'RANDOM SEED' }, { id: 'daily', text: 'DAILY SEED' }, { id: 'fixed', text: this.seedLabel(S) }];
    btn.forEach((b, k) => {
      const bx = x + k * (bw + gap), on = S.seedMode === b.id;
      UIHit.add(bx, y, bw, h, () => { G.srSel = i; if (b.id === 'fixed' && S.seedMode === 'fixed') this.askSeed(); S.seedMode = b.id; G.srTyped = false; Save.write(); });
      uiPanel(ctx, bx, y, bw, h, { color: on ? (sel ? P.cyan : P.yellow) : P.greyMid, fill: P.void, alpha: 0.9, glow: on && sel });
      const caret = b.id === 'fixed' && on && sel && Math.floor(G.realTime * 2) % 2 === 0 ? '_' : '';
      uiText(ctx, uiFit(ctx, b.text, bw - 8, T.small) + caret, bx + bw / 2, y + h / 2 + 4, { size: T.small, color: on ? P.ice : P.grey, align: 'center' });
    });
    if (sel) uiText(ctx, '>', x - 12, y + h / 2 + 5, { size: T.h2, color: P.cyan });
  },

  // ---------- Ergebnis-Bildschirm ----------
  updateEnd(dt) {
    const sr = G.sr;
    sr.age += dt;
    playMusic(sr.ok ? 'menu' : 'dead');
    if (sr.age < 0.8) return;
    if (Input.pressed('KeyR')) { Sfx.play('select'); G.begin(false, false, sr.kind); return; }
    if (Input.pressed('Space') || Input.pressed('Enter') || Input.pressed('Escape')) { this.exit(); G.mode = 'srsetup'; this.openSetup(); }
  },
  drawEnd(ctx) {
    const sr = G.sr, P = STYLE.pal, T = STYLE.type, K = CFG.speedrun.kinds[sr.kind], R = sr.result, col = sr.ok ? this.color(sr.kind) : P.red;
    drawMenuBg(ctx, 'keysettings');
    drawEmbers(ctx);
    uiText(ctx, sr.ok ? 'RUN COMPLETE' : 'RUN FAILED', STAGE_W / 2, 44, { size: T.title, color: col, align: 'center', glow: col });
    uiText(ctx, K.name + (sr.kind === 'seed' ? '   SEED ' + sr.seed : ''), STAGE_W / 2, 62, { size: T.h2, color: P.grey, align: 'center' });
    const shown = sr.ok ? sr.final : sr.t;
    uiText(ctx, srFmt(shown), STAGE_W / 2, 112, { size: T.title, color: P.ice, align: 'center', glow: col });
    let y = 132;
    if (sr.ok) {
      if (R && R.cheat) uiText(ctx, 'DEV RUN - NOT RECORDED', STAGE_W / 2, y, { size: T.body, color: P.yellow, align: 'center' });
      else if (R && R.best) uiText(ctx, R.old ? 'NEW BEST!  (BEFORE: ' + srFmt(R.old.time) + ')' : 'FIRST TIME - NEW BEST!', STAGE_W / 2, y, { size: T.h2, color: P.yellow, align: 'center' });
      else if (R && R.old) uiText(ctx, 'BEST: ' + srFmt(R.old.time) + '   (+' + (sr.final - R.old.time).toFixed(2) + ')', STAGE_W / 2, y, { size: T.body, color: P.grey, align: 'center' });
      if (sr.kind === 'gauntlet') uiText(ctx, 'TIME ' + srFmt(sr.t) + '   +   LEFT BEHIND ' + sr.left + ' ENEMIES = ' + sr.penalty.toFixed(1) + 'S', STAGE_W / 2, y + 16, { size: T.body, color: sr.left ? P.orange : P.green, align: 'center' });
    } else {
      uiText(ctx, 'KILLED BY: ' + sr.reason, STAGE_W / 2, y, { size: T.h2, color: P.red, align: 'center' });
    }
    // Zwischenzeiten (und Vergleich mit der Bestzeit)
    const old = R && R.old ? R.old : this.best(this.bestKey(sr)), n = sr.splits.length;
    if (n) {
      const x0 = STAGE_W / 2 - 150, w = 300, top = 168, rowH = 15, cols = n > 7 ? 2 : 1, per = Math.ceil(n / cols);
      uiPanel(ctx, x0 - 10, top - 14, w + 20, per * rowH + 20, { color: col, fill: P.void, alpha: 0.9 });
      sr.splits.forEach((s, i) => {
        const cx = x0 + Math.floor(i / per) * (w / cols), cy = top + (i % per) * rowH + 4, cw = w / cols - 8;
        uiText(ctx, s.name, cx, cy, { size: T.small, color: P.ice });
        const o = old && old.splits && old.splits[i] && old.splits[i].name === s.name ? old.splits[i].t : null;
        if (o !== null && !(R && R.best && !R.old)) { const d = s.t - o; uiText(ctx, (d <= 0 ? '' : '+') + d.toFixed(2), cx + cw - 56, cy, { size: T.small, color: d <= 0 ? P.green : P.red, align: 'right' }); }
        uiText(ctx, srFmt(s.t), cx + cw, cy, { size: T.small, color: P.yellow, align: 'right' });
      });
    }
    UIHit.add(STAGE_W / 2 - 100, 318, 200, 24, () => {});
    uiText(ctx, 'RETRY [R]      BACK [SPACE]', STAGE_W / 2, 332, { size: T.h2, color: P.cyan, align: 'center' });
  },

  // ---------- Anzeige im Lauf ----------
  // Pfeil in die Richtung eines Ziels (Welt-Koordinaten), um den Spieler herum
  arrow(ctx, tx, ty, color, label) {
    const p = G.player, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 70) return;
    const ux = dx / d, uy = dy / d, cx = STAGE_W / 2 + p.x + ux * 52, cy = STAGE_H / 2 - p.y - uy * 52, sx = ux, sy = -uy;
    ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = 0.9;
    pxPolyFill(ctx, [[cx + sx * 7, cy + sy * 7], [cx - sy * 5 - sx * 4, cy + sx * 5 - sy * 4], [cx + sy * 5 - sx * 4, cy - sx * 5 - sy * 4]]);
    ctx.restore();
    if (label) outlinedText(ctx, label + ' ' + Math.round(d), cx, cy - 11, STYLE.type.small, color);
  },
  drawWorld(ctx) {
    const sr = G.sr, P = STYLE.pal, t = G.realTime, ox = STAGE_W / 2, oy = STAGE_H / 2;
    ctx.save();
    if (sr.kind === 'gauntlet') {
      const g = CFG.speedrun.gauntlet, hy = g.half[1];
      ctx.fillStyle = P.green; ctx.globalAlpha = 0.6; pxDashLine(ctx, ox + g.startX + 40, oy - hy, ox + g.startX + 40, oy + hy, 2, 4);
      ctx.fillStyle = sr.gateDone ? P.red : P.cyan; ctx.globalAlpha = sr.gateDone ? 0.9 : 0.5 + 0.3 * Math.sin(t * 5);
      if (sr.gateDone) { ctx.fillRect(ox + g.gateX - 2, oy - hy, 4, hy * 2); ctx.globalAlpha = 0.3; ctx.fillRect(ox + g.gateX - 6, oy - hy, 12, hy * 2); }
      else { pxDashLine(ctx, ox + g.gateX, oy - hy, ox + g.gateX, oy + hy, 2, 4); }
      ctx.globalAlpha = 1;
      if (!sr.gateDone) outlinedText(ctx, 'BOSS GATE', ox + g.gateX, oy - 150, STYLE.type.h2, P.cyan);
      outlinedText(ctx, 'START', ox + g.startX + 40, oy - 150, STYLE.type.small, P.green);
    }
    if (sr.kind === 'seed') {
      for (const c of sr.carriers) if (!c.done && c.e.alive) {                   // Traeger: goldener Ring (traegt er einen Schluessel? Weiss man erst nach dem Kill)
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4 + c.e.x); ctx.fillStyle = P.yellow;
        pxRing(ctx, ox + c.e.x, oy - c.e.y, c.e.radius + 7, 1, 8, t * 0.2);
      }
      const pr = CFG.speedrun.seed.portalRadius, po = sr.portal, open = sr.stage >= 3;
      ctx.globalAlpha = 1;
      ctx.fillStyle = open ? P.orange : P.greyMid; pxRing(ctx, ox + po.x, oy - po.y, pr, 2, open ? 0 : 12, t * 0.3);
      ctx.globalAlpha = open ? 0.25 + 0.1 * Math.sin(t * 6) : 0.1; ctx.fillStyle = open ? P.orange : P.grey; pxGlow(ctx, ox + po.x, oy - po.y, pr);
      ctx.globalAlpha = 1;
      outlinedText(ctx, open ? 'PORTAL' : 'PORTAL (SEALED)', ox + po.x, oy - po.y - pr - 8, STYLE.type.small, open ? P.orange : P.grey);
      const m = sr.merchant;
      ctx.fillStyle = P.yellow; pxRing(ctx, ox + m.x, oy - m.y, CFG.speedrun.seed.tradeRadius, 1, 14, t * 0.15);
      ctx.fillStyle = P.yellow; pxDisc(ctx, ox + m.x, oy - m.y, 5); ctx.fillStyle = P.void; pxDisc(ctx, ox + m.x, oy - m.y, 2);
      outlinedText(ctx, 'TRADER', ox + m.x, oy - m.y - 12, STYLE.type.small, P.yellow);
      // Kompass
      if (sr.started && !G.bossFight) {
        let target = null, label = '';
        if (sr.stage === 0) { let best = 1e9; for (const c of sr.carriers) if (!c.done && c.e.alive) { const d = Math.hypot(c.e.x - G.player.x, c.e.y - G.player.y); if (d < best) { best = d; target = c.e; } } label = 'CARRIER'; }
        else if (sr.stage === 1 || sr.stage === 3) { target = po; label = 'PORTAL'; }
        else if (sr.stage === 2) { target = m; label = 'TRADER'; }
        if (target) this.arrow(ctx, target.x, target.y, P.yellow, label);
      }
    }
    ctx.restore();
  },
  drawHud(ctx) {
    const sr = G.sr, P = STYLE.pal, T = STYLE.type, X = STAGE_W - 10, col = this.color(sr.kind);
    uiText(ctx, srFmt(sr.t), X, 38, { size: T.title, color: sr.started ? P.ice : P.grey, align: 'right', glow: col });
    let y = 54;
    const line = (txt, c) => { uiText(ctx, txt, X, y, { size: T.small, color: c || P.grey, align: 'right' }); y += 11; };
    if (!sr.started) { line('MOVE OR ATTACK TO START THE CLOCK', P.yellow); return; }
    if (G.cheated) line('DEV RUN - NOT RECORDED', P.yellow);
    if (sr.kind === 'rush') {
      const total = (G.map.bossOrder || CFG.boss.order).length + 1;
      line('BOSS ' + Math.min(total, G.bossCount + (G.bossFight ? 0 : 1)) + ' / ' + total, col);
      if (!G.bossFight && !G.finalStarted && sr.gap > 0) line('NEXT BOSS IN ' + Math.ceil(sr.gap) + 'S', P.grey);
    } else if (sr.kind === 'gauntlet') {
      const g = CFG.speedrun.gauntlet;
      if (!sr.gateDone) {
        const alive = G.enemies.filter((e) => e.alive && !e.minion);
        let pen = 0; for (const e of alive) pen += g.weight[e.type] !== undefined ? g.weight[e.type] : g.defaultWeight;
        line('ENEMIES LEFT ' + alive.length + '   PENALTY +' + pen.toFixed(1) + 'S', pen ? P.orange : P.green);
        const f = clamp((G.player.x - g.startX) / (g.gateX - g.startX), 0, 1);
        uiBar(ctx, X - 120, y - 3, 120, 5, f, col); y += 9;
      } else line('LEFT BEHIND ' + sr.left + '   +' + sr.penalty.toFixed(1) + 'S', sr.left ? P.orange : P.green);
    } else {
      const S = CFG.speedrun.seed, names = ['COLLECT KEYS', 'FIND THE PORTAL', 'TRADE FOR AN EMBER CORE', 'ENTER THE PORTAL', 'BOSS'];
      line('SEED ' + sr.seed, P.grey);
      line(names[Math.min(4, sr.stage)], col);
      if (sr.stage === 0) line('KEYS ' + sr.keys + ' / ' + S.keysNeed, P.yellow);
      line('SCRAP ' + sr.scrap + (sr.stage === 2 ? '   (' + S.tradeCost + ' PER TRADE)' : ''), P.ice);
      if (sr.stage === 2) {
        line(sr.near ? (sr.scrap >= S.tradeCost ? 'TRADING ...' : 'NEED ' + S.tradeCost + ' SCRAP') : 'STAND NEXT TO THE TRADER', sr.near ? P.green : P.yellow);
      }
      if (sr.tradeMsgT > 0) line(sr.tradeMsg, P.orange);
    }
    for (const s of sr.splits.slice(-3)) line(s.name + '  ' + srFmt(s.t), P.grey);
  },
};
