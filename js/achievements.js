// Achievements: kleine Aufgaben mit Icon, Namen (Minecraft-Stil: Gags/Anspielungen, verraten nicht direkt, was zu tun ist) und kurzer Beschreibung,
// die nur beim Ueberfahren/Auswaehlen im Baum gezeigt wird. Jedes gibt einmalig eine kleine Belohnung (Cores oder ein Cosmetic).
// Daten: ACH_BRANCHES + ACH_LIST (hier, damit Namen und Zahlen beieinander stehen). Spielstand: Save.data.ach = { done, cnt, seen }.
//
// Zaehler (key): entweder abgeleitet aus dem Spielstand (ACH_DERIVED) oder ein Zaehler in Save.data.ach.cnt, den Haken im Spiel fuellen:
//   Ach.add(key, n)   zaehlt hoch          Ach.max(key, v)   merkt den Hoechstwert          Ach.mark(key, item)   Menge verschiedener Dinge
// Ein Achievement ist erreicht, sobald value(key) >= need. Im Tutorial und in Cheat-Laeufen (G.cheated) zaehlen die Haken nicht.
// Neues Achievement = Eintrag in ACH_LIST (Zeile gehoert zu einem Zweig 'br'), ggf. einen Haken setzen. Bis zu 9 pro Zweig passen auf den Bildschirm.

const ACH_BRANCHES = [
  { id: 'run',   label: 'SURVIVAL' },
  { id: 'fight', label: 'COMBAT' },
  { id: 'boss',  label: 'BOSSES' },
  { id: 'grow',  label: 'GROWTH' },
  { id: 'odd',   label: 'DUMB WAYS' },
  { id: 'world', label: 'WORLD' },
];
const ACH_FAST_BOSS = 25;       // Sekunden fuer "Speedrun Strats"
const ACH_QUICK_DEATH = 30;     // Sekunden fuer "Skill Issue"

// reward: { cores: n } oder { cos: 'kategorie:id' }
const ACH_LIST = [
  // ---- SURVIVAL ----
  { id: 'student',   br: 'run', name: 'STUDENT OF PAIN',        desc: 'Complete the tutorial.',                         icon: 'shot',         key: 'tutorial',  need: 1,    reward: { cores: 10 } },
  { id: 'hello',     br: 'run', name: 'HELLO, VOID',            desc: 'Finish your first run.',                         icon: 'player',       key: 'runs',      need: 1,    reward: { cores: 10 } },
  { id: 'skill',     br: 'run', name: 'SKILL ISSUE',            desc: 'Die in under 30 seconds.',                       icon: 'circle',       key: 'quickDeath', need: 1,   reward: { cores: 10 } },
  { id: 'kicking',   br: 'run', name: 'STILL KICKING',         desc: 'Survive 2 minutes in one run.',                  icon: 'bubble',       key: 'time',      need: 120,  reward: { cores: 15 } },
  { id: 'halfway',   br: 'run', name: 'HALFWAY DECENT',        desc: 'Survive 7 minutes in one run.',                  icon: 'ult1',         key: 'time',      need: 420,  reward: { cores: 30 } },
  { id: 'beast',     br: 'run', name: 'NUMBER OF THE BEAST',   desc: 'Reach 666 seconds in one run.',                  icon: 'deathSecret1', key: 'time',      need: 666,  reward: { cores: 66 } },
  { id: 'date',      br: 'run', name: 'DATE WITH DEATH',       desc: 'Make it to the final boss.',                     icon: 'deathSecret2', key: 'finalBoss', need: 1,    reward: { cores: 50 } },
  { id: 'groundhog', br: 'run', name: 'GROUNDHOG DAY',         desc: 'Finish 25 runs.',                                icon: 'spawnPoint',   key: 'runs',      need: 25,   reward: { cores: 40 } },
  { id: 'grass',     br: 'run', name: 'TOUCH GRASS',           desc: 'Finish 100 runs.',                               icon: 'heal',         key: 'runs',      need: 100,  reward: { cores: 100 } },

  // ---- COMBAT ----
  { id: 'blood1',    br: 'fight', name: 'FIRST BLOOD',          desc: 'Defeat an enemy.',                               icon: 'circle',       key: 'kills',     need: 1,    reward: { cores: 5 } },
  { id: 'mosh',      br: 'fight', name: 'MOSH PIT',             desc: 'Defeat 100 enemies in one run.',                 icon: 'splitter',     key: 'killsRun',  need: 100,  reward: { cores: 25 } },
  { id: 'pest',      br: 'fight', name: 'PEST CONTROL',         desc: 'Defeat 250 enemies in total.',                   icon: 'triangle',     key: 'kills',     need: 250,  reward: { cores: 20 } },
  { id: 'combo',     br: 'fight', name: 'COMBO BREAKER',        desc: 'Defeat 15 enemies in a row without being hit.',  icon: 'sword',        key: 'combo',     need: 15,   reward: { cores: 25 } },
  { id: 'redbutton', br: 'fight', name: 'THE BIG RED BUTTON',   desc: 'Use your Ultimate 10 times.',                    icon: 'ult1',         key: 'ult',       need: 10,   reward: { cores: 15 } },
  { id: 'bloodyhell', br: 'fight', name: 'BLOODY HELL',         desc: 'Set off Bloodburst.',                            icon: 'blood1',       key: 'bloodburst', need: 1,   reward: { cores: 15 } },
  { id: 'annihil',   br: 'fight', name: 'TOTAL ANNIHILATION',   desc: 'Defeat 3000 enemies in total.',                  icon: 'square',       key: 'kills',     need: 3000, reward: { cores: 60 } },
  { id: 'elite',     br: 'fight', name: 'ELITE HUNTER',         desc: 'Defeat 5 elite enemies.',                        icon: 'tank',         key: 'elites',    need: 5,    reward: { cores: 40 } },
  { id: 'allfoes',   br: 'fight', name: "GOTTA KILL 'EM ALL",   desc: 'Defeat every kind of regular enemy.',            icon: 'necro',        key: 'types',     need: 14,   reward: { cos: 'skin:ghost' } },

  // ---- BOSSES ----
  { id: 'giant',     br: 'boss', name: 'GIANT SLAYER',          desc: 'Defeat a boss.',                                 icon: 'octagon',      key: 'bosses',    need: 1,    reward: { cores: 25 } },
  { id: 'hattrick',  br: 'boss', name: 'HAT TRICK',             desc: 'Defeat 3 bosses in one run.',                    icon: 'kite',         key: 'bossesRun', need: 3,    reward: { cores: 30 } },
  { id: 'speed',     br: 'boss', name: 'SPEEDRUN STRATS',       desc: 'Defeat a boss in under 25 seconds.',             icon: 'turret',       key: 'bossFast',  need: 1,    reward: { cores: 40 } },
  { id: 'untouch',   br: 'boss', name: 'CAN\'T TOUCH THIS',     desc: 'Defeat a boss without taking damage.',           icon: 'barrierIcon',  key: 'bossNoHit', need: 1,    reward: { cores: 50 } },
  { id: 'fullhouse', br: 'boss', name: 'FULL HOUSE',            desc: 'Defeat six bosses in one run.',                  icon: 'summoner',     key: 'bossesRun', need: 6,    reward: { cores: 60 } },
  { id: 'holiday',   br: 'boss', name: 'DEATH TAKES A HOLIDAY', desc: 'Defeat Death himself.',                          icon: 'deathSecret3', key: 'wins',      need: 1,    reward: { cores: 100 } },
  { id: 'encore',    br: 'boss', name: 'ENCORE!',               desc: 'Defeat Death 3 times.',                          icon: 'deathSecret4', key: 'wins',      need: 3,    reward: { cos: 'skin:glitch' } },

  // ---- GROWTH ----
  { id: 'inventory', br: 'grow', name: 'TAKING INVENTORY',      desc: 'Buy a new weapon or implant.',                   icon: 'beamIcon',     key: 'itemsOwned', need: 3,   reward: { cores: 10 } },
  { id: 'upgrade',   br: 'grow', name: 'GETTING AN UPGRADE',    desc: 'Buy a permanent stat upgrade.',                  icon: 'thrustersIcon', key: 'upgrades', need: 1,    reward: { cores: 10 } },
  { id: 'levelirl',  br: 'grow', name: 'LEVELING UP IRL',       desc: 'Level up a weapon, implant or ability.',         icon: 'overclockIcon', key: 'gearLv',   need: 1,    reward: { cores: 15 } },
  { id: 'drip',      br: 'grow', name: 'DRIP CHECK',            desc: 'Buy a cosmetic.',                                icon: 'luckyIcon',    key: 'cosBuy',    need: 1,    reward: { cores: 15 } },
  { id: 'levelhead', br: 'grow', name: 'LEVEL HEADED',          desc: 'Reach level 10 in one run.',                     icon: 'surgeIcon',    key: 'lvl',       need: 10,   reward: { cores: 20 } },
  { id: 'newskin',   br: 'grow', name: 'NEW SKIN, WHO DIS?',    desc: 'Unlock a new hero.',                             icon: 'heroSpecter',  key: 'heroes',    need: 1,    reward: { cores: 30 } },
  { id: 'evolve',    br: 'grow', name: 'EVOLVE OR DIE',         desc: 'Evolve a weapon in a run.',                      icon: 'bladesIcon',   key: 'evolved',   need: 1,    reward: { cores: 40 } },
  { id: 'maxed',     br: 'grow', name: 'MAXED OUT',             desc: 'Take any gear to its maximum level.',            icon: 'capacitorIcon', key: 'gearLv',   need: 5,    reward: { cores: 60 } },

  // ---- DUMB WAYS ----
  { id: 'statue',    br: 'odd', name: 'PROFESSIONAL STATUE',    desc: 'Get hurt for standing still.',                   icon: 'player',       key: 'afk',       need: 1,    reward: { cores: 10 } },
  { id: 'ragequit',  br: 'odd', name: 'RAGE QUIT',              desc: 'Give up a run.',                                 icon: 'dmg20',        key: 'gaveUp',    need: 1,    reward: { cores: 10 } },
  { id: 'lava',      br: 'odd', name: 'THE FLOOR IS LAVA',      desc: 'Be killed by a lava vent.',                      icon: 'fireIcon',     key: 'killLava',  need: 1,    reward: { cores: 15 } },
  { id: 'acid',      br: 'odd', name: 'EW, CHEMISTRY',          desc: 'Be killed by an acid pool.',                     icon: 'molotovIcon',  key: 'killAcid',  need: 1,    reward: { cores: 15 } },
  { id: 'meteor',    br: 'odd', name: 'WELL, THAT HAPPENED',    desc: 'Be killed by a meteor.',                         icon: 'bombardIcon',  key: 'killMeteor', need: 1,   reward: { cores: 15 } },
  { id: 'notoday',   br: 'odd', name: 'NOT TODAY',              desc: 'Get saved by the Revival Core.',                 icon: 'phoenixIcon',  key: 'revive',    need: 1,    reward: { cores: 25 } },
  { id: 'crates',    br: 'odd', name: "PANDORA'S BOX",          desc: 'Smash 25 crates.',                               icon: 'spawner',      key: 'crates',    need: 25,   reward: { cores: 20 } },
  { id: 'thread',    br: 'odd', name: 'HANGING BY A THREAD',    desc: 'Spend 10 seconds under 10 HP in one run.',       icon: 'aegisIcon',    key: 'edge',      need: 10,   reward: { cores: 30 } },

  // ---- WORLD ----
  { id: 'surge',     br: 'world', name: 'SWARM SWEEPER',        desc: 'Survive a Swarm Surge.',                         icon: 'circle',       key: 'evFlood',   need: 1,    reward: { cores: 20 } },
  { id: 'eclipse',   br: 'world', name: 'CRIMSON TIDE',         desc: 'Survive a Crimson Eclipse.',                     icon: 'blood1',       key: 'evMoon',    need: 1,    reward: { cores: 20 } },
  { id: 'rain',      br: 'world', name: 'RAIN CHECK',           desc: 'Survive a meteor shower.',                       icon: 'bombardIcon',  key: 'evMeteor',  need: 1,    reward: { cores: 20 } },
  { id: 'walls',     br: 'world', name: 'WALLS CLOSING IN',     desc: 'Survive the arena shrinking.',                   icon: 'barrierIcon',  key: 'evCollapse', need: 1,   reward: { cores: 20 } },
  { id: 'hotstuff',  br: 'world', name: 'HOT STUFF',            desc: 'Unlock Ember Foundry.',                          icon: 'fireIcon',     key: 'maps',      need: 2,    reward: { cores: 25 } },
  { id: 'chemrom',   br: 'world', name: 'CHEMICAL ROMANCE',     desc: 'Unlock Toxic Core.',                             icon: 'buffRegen',    key: 'maps',      need: 3,    reward: { cores: 40 } },
  { id: 'void',      br: 'world', name: 'INTO THE VOID',        desc: 'Finish an Endless Mode run.',                    icon: 'spawnPoint',   key: 'infRuns',   need: 1,    reward: { cores: 20 } },
  { id: 'neverend',  br: 'world', name: 'NEVER-ENDING STORY',   desc: 'Survive 15 minutes in Endless Mode.',            icon: 'ult2',         key: 'timeInf',   need: 900,  reward: { cores: 50 } },
];

// Zaehler, die direkt aus dem Spielstand folgen (kein eigener Haken noetig)
const ACH_DERIVED = {
  runs: () => Save.data.runs || 0,
  wins: () => Save.data.wins || 0,
  tutorial: () => (Save.data.tutorialDone ? 1 : 0),
  kills: () => ((Save.data.stats && Save.data.stats.kills) || 0) + (Ach.running() ? G.kills : 0),
  bosses: () => ((Save.data.stats && Save.data.stats.bosses) || 0) + (Ach.running() ? G.bosses : 0),
  itemsOwned: () => Object.keys(Save.data.items.owned).length,                                           // Start: Schwert + Blaster
  upgrades: () => Object.values(Save.data.upgrades || {}).reduce((s, v) => s + v, 0),
  gearLv: () => Math.max(0, ...Object.values(Save.data.gear || {}).map((g) => g.lv || 0)),
  heroes: () => Object.keys(Save.data.heroes || {}).length,
  maps: () => CFG.maps.reduce((n, m, i) => n + (i === 0 || Save.mapBestTime(i - 1) >= Save.mapNeed(i) ? 1 : 0), 0),
  types: () => Object.keys(Ach.data().cnt.types || {}).length,
};

const Ach = {
  toasts: [], dirty: false, scanT: 0, lowT: 0, prev: {}, sel: { r: 0, c: 0 },
  TOAST_LIFE: 4.2,

  data() {
    const d = Save.data;
    if (!d.ach) d.ach = { done: {}, cnt: {}, seen: 0 };
    return d.ach;
  },
  running() { return G.mode === 'play' && this.ok(); },
  ok() { return !(typeof Tutorial !== 'undefined' && Tutorial.active) && !G.cheated; },       // Tutorial und Cheat-Laeufe zaehlen nicht
  done(id) { return !!this.data().done[id]; },
  total() { return ACH_LIST.length; },
  doneCount() { return ACH_LIST.filter((a) => this.done(a.id)).length; },
  unseen() { return Math.max(0, this.doneCount() - (this.data().seen || 0)); },
  value(key) { return ACH_DERIVED[key] ? ACH_DERIVED[key]() : this.data().cnt[key] || 0; },
  rows() { return ACH_BRANCHES.map((b) => ACH_LIST.filter((a) => a.br === b.id)); },

  // ---- Haken ----
  add(key, n = 1, force = false) {
    if (!force && !this.ok()) return;
    const c = this.data().cnt; c[key] = (c[key] || 0) + n; this.dirty = true;
  },
  max(key, v) {
    if (!this.ok()) return;
    const c = this.data().cnt;
    if (v > (c[key] || 0)) { c[key] = v; this.dirty = true; }
  },
  mark(key, item) {
    if (!this.ok()) return;
    const c = this.data().cnt, s = c[key] || (c[key] = {});
    if (!s[item]) { s[item] = 1; this.dirty = true; }
  },
  kill(e) { if (e && e.elite) this.add('elites'); else if (e && e.type) this.mark('types', e.type); },       // Elite-Gegner zaehlen nicht zu "jede Art" (types)
  bossDown(b) {                                           // Boss besiegt (vor G.endBossFight): Dauer und Schaden im Kampf
    if (!this.ok() || !b || b.type === 'reaper') return;
    if (G.bossTimer > 0 && G.bossTimer < ACH_FAST_BOSS) this.add('bossFast');
    if (Stats.fight && Stats.taken <= Stats.fight.dmg0) this.add('bossNoHit');
  },
  // Lauf zu Ende (Tod, Aufgeben, Sieg), aufgerufen aus G.die / G.win nach der Abrechnung
  runEnd(win) {
    if (!this.ok()) return;
    const k = Stats.lastSrc;
    if (!win) {
      if (k === 'GAVE UP') this.add('gaveUp');
      else if (G.time < ACH_QUICK_DEATH) this.add('quickDeath');
      if (k === 'LAVA VENT') this.add('killLava');
      if (k === 'ACID POOL') this.add('killAcid');
      if (k === 'METEOR') this.add('killMeteor');
    }
    if (Stats.dmg && Stats.dmg['STANDING STILL'] > 0) this.add('afk');
    if (G.infinite) this.add('infRuns');
    this.scan();
  },

  beginRun() { this.lowT = 0; this.prev = {}; },

  // Pro Bild im Lauf: Hoechstwerte und Welt-Events beobachten
  update(dt) {
    if (!this.ok()) return;
    const p = G.player;
    this.max('combo', G.combo); this.max('killsRun', G.kills); this.max('bossesRun', G.bosses); this.max('lvl', Xp.level);
    this.max('time', G.time); if (G.infinite) this.max('timeInf', G.time);
    if (G.finalStarted) this.max('finalBoss', 1);
    if (p) {
      if (p.evolved && Object.values(p.evolved).some(Boolean)) this.max('evolved', 1);
      if (p.hp > 0 && p.hp < 10) { this.lowT += dt; this.max('edge', this.lowT); }
    }
    // Event beendet, waehrend man noch lebt = ueberlebt
    const ev = { flood: 'evFlood', bloodMoon: 'evMoon', meteorShower: 'evMeteor', collapse: 'evCollapse' };
    for (const f of Object.keys(ev)) {
      if (this.prev[f] && !G[f] && G.mode === 'play' && p && p.hp > 0 && !G.bossFight) this.add(ev[f]);
      this.prev[f] = !!G[f];
    }
  },

  // ---- Pruefen und freischalten ----
  scan() {
    for (const a of ACH_LIST) if (!this.done(a.id) && this.value(a.key) >= a.need) this.unlock(a);
  },
  unlock(a) {
    const d = this.data();
    d.done[a.id] = true;
    if (a.reward.cores) Save.data.souls += a.reward.cores;
    else if (a.reward.cos) Save.data.cosmetics.owned[a.reward.cos] = true;
    Save.write();
    this.toasts.push({ a, age: 0 });
    try { Sfx.play('buy'); } catch (e) { /* kein Ton */ }
  },
  rewardText(a) {
    if (a.reward.cores) return '+' + a.reward.cores + ' CORES';
    const [cat, id] = a.reward.cos.split(':'), C = CFG.cosmetics;
    return C.cats.find((c) => c.id === cat).label + ': ' + C.items[cat].find((i) => i.id === id).name;
  },

  // Jedes Bild (auch in Menues): Pruefung bei Aenderung bzw. einmal pro Sekunde, Hinweise ablaufen lassen
  tick(dt) {
    this.scanT -= dt;
    if (this.dirty || this.scanT <= 0) { this.dirty = false; this.scanT = 1; this.scan(); }
    for (const t of this.toasts) t.age += dt;
    this.toasts = this.toasts.filter((t) => t.age < this.TOAST_LIFE);
  },

  // Hinweis unten rechts: "ACHIEVEMENT MADE!" mit Icon, Name und Belohnung, faehrt von rechts ein und wieder aus
  drawToasts(ctx) {
    if (!this.toasts.length) return;
    const P = STYLE.pal, T = STYLE.type, w = 176, h = 32;
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    this.toasts.slice(0, 3).forEach((t, i) => {
      const inn = Math.min(1, t.age / 0.35), out = Math.min(1, (this.TOAST_LIFE - t.age) / 0.35), k = Math.min(inn, out), e = 1 - Math.pow(1 - k, 3);
      const x = STAGE_W - w - 8 + (1 - e) * (w + 12), y = STAGE_H - 74 - i * (h + 4);
      uiPanel(ctx, x, y, w, h, { color: P.yellow, fill: P.void, alpha: 0.95, glow: true });
      uiPanel(ctx, x + 4, y + 4, 24, 24, { color: P.yellow, fill: P.voidLight, alpha: 1 });
      drawIcon(ctx, t.a.icon, x + 16, y + 16, 16, 1);
      uiText(ctx, 'ACHIEVEMENT MADE!', x + 34, y + 12, { size: T.small, color: P.yellow });
      uiText(ctx, uiFit(ctx, t.a.name, w - 40, T.body), x + 34, y + 23, { size: T.body, color: P.ice });
      uiText(ctx, this.rewardText(t.a), x + w - 6, y + 12, { size: T.small, color: P.cyan, align: 'right' });
    });
    ctx.restore();
  },

  // ---- Menue ----
  open() { this.sel = { r: 0, c: 0 }; this.data().seen = this.doneCount(); Save.write(); },
  updateScreen() {
    const rows = this.rows(), n = rows.length, s = this.sel;
    if (Input.pressed('Escape')) { G.mode = 'start'; return; }
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) { s.r = (s.r + n) % (n + 1); if (s.r < n) s.c = Math.min(s.c, rows[s.r].length - 1); }
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) { s.r = (s.r + 1) % (n + 1); if (s.r < n) s.c = Math.min(s.c, rows[s.r].length - 1); }
    if (s.r < n) {
      if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) s.c = Math.min(rows[s.r].length - 1, s.c + 1);
      if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) s.c = Math.max(0, s.c - 1);
    }
    if ((Input.pressed('Space') || Input.pressed('Enter')) && s.r >= n) G.mode = 'start';
  },

  drawScreen(ctx) {
    const P = STYLE.pal, T = STYLE.type, rows = this.rows(), s = this.sel;
    drawSprite(ctx, 'keysettings', 0, 0, 90, 100);
    drawEmbers(ctx);
    uiText(ctx, 'ACHIEVEMENTS', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
    uiText(ctx, this.doneCount() + ' / ' + this.total(), STAGE_W - 24, 38, { size: T.h2, color: P.yellow, align: 'right', glow: P.yellow });
    const X0 = 108, DX = 38, NS = 28, Y0 = 56, DY = 41;
    let tip = null;
    rows.forEach((row, r) => {
      const y = Y0 + r * DY, B = ACH_BRANCHES[r], got = row.filter((a) => this.done(a.id)).length;
      uiText(ctx, B.label, 24, y + 13, { size: T.body, color: got === row.length ? P.yellow : P.ice });
      uiText(ctx, got + '/' + row.length, 24, y + 25, { size: T.small, color: P.grey });
      row.forEach((a, c) => {                                                     // Verbindungslinie zum vorigen Knoten
        if (c === 0) return;
        ctx.fillStyle = this.done(row[c - 1].id) ? P.cyan : P.greyDark;
        ctx.fillRect(X0 + (c - 1) * DX + NS, y + NS / 2 - 1, DX - NS, 2);
      });
      row.forEach((a, c) => {
        const x = X0 + c * DX, d = this.done(a.id), sel = s.r === r && s.c === c;
        UIHit.add(x, y, NS, NS, () => { s.r = r; s.c = c; }, { noConfirm: true });
        uiPanel(ctx, x, y, NS, NS, { color: d ? P.yellow : sel ? P.cyan : P.greyMid, fill: d ? P.voidLight : P.void, alpha: 0.95, glow: d || sel });
        drawIcon(ctx, a.icon, x + NS / 2, y + NS / 2, 18, d ? 1 : 0.55, !d);
        if (sel) { ctx.strokeStyle = P.ice; ctx.strokeRect(x - 1.5, y - 1.5, NS + 3, NS + 3); tip = { a, x, y, r }; }
      });
    });
    // Zurueck
    const by = Y0 + rows.length * DY + 2, backSel = s.r >= rows.length;
    UIHit.add(24, by, 120, 22, () => { s.r = rows.length; });
    uiPanel(ctx, 24, by, 120, 22, { color: backSel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: backSel });
    uiText(ctx, 'BACK', 84, by + 15, { size: T.h2, color: backSel ? P.ice : P.grey, align: 'center' });
    uiText(ctx, 'W/S/A/D OR MOUSE = SELECT    HOVER = SEE WHAT TO DO    ESC = BACK', STAGE_W / 2, 352, { size: T.small, color: P.grey, align: 'center' });
    if (tip) this.drawTip(ctx, tip);
  },

  // Beschreibung nur fuer den gewaehlten bzw. ueberfahrenen Knoten
  drawTip(ctx, tip) {
    const P = STYLE.pal, T = STYLE.type, a = tip.a, d = this.done(a.id), w = 200, h = 66;
    const x = clamp(tip.x + 14 - w / 2, 8, STAGE_W - w - 8), y = tip.r < 3 ? tip.y + 34 : tip.y - h - 6;
    uiPanel(ctx, x, y, w, h, { color: d ? P.yellow : P.cyan, fill: P.void, alpha: 0.97, glow: true });
    uiText(ctx, uiFit(ctx, a.name, w - 20, T.h2), x + 10, y + 17, { size: T.h2, color: d ? P.yellow : P.ice });
    uiWrap(ctx, a.desc, x + 10, y + 31, w - 20, 11, { size: T.small, color: P.grey });
    uiText(ctx, d ? 'DONE  -  ' + this.rewardText(a) : 'REWARD  ' + this.rewardText(a), x + 10, y + h - 7, { size: T.small, color: d ? P.cyan : P.yellow });
  },
};
