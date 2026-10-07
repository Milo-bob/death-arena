// Hauptdatei: Spielzustand (G), Game-Loop, Update und Zeichnen.
// Spielzustände: loading -> start -> keys -> play -> dead -> (Leertaste) -> play ...

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = STAGE_W * SCALE;
canvas.height = STAGE_H * SCALE;

// Begrenzt eine Position auf die Karte (bei unendlicher Karte unverändert). margin = Abstand zum Rand.
function clampToMap(x, y, margin = 0) {
  if (CFG.map.infinite) return [x, y];
  const hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale;      // Arena-Boss verkleinert die Karte (G.arenaScale)
  return [clamp(x, -(hw - margin), hw - margin), clamp(y, -(hh - margin), hh - margin)];
}

// Hintergrund: eine Kachel (assets/img_new/ground.png), die sich wiederholt und mit der Kamera mitscrollt,
// plus bei endlicher Karte der Rand (außerhalb dunkel, Rahmenlinie)
function drawGround(ctx) {
  const im = IMG[G.map.ground], c = G.cam;
  if (!im || !im.ok) return;
  const tile = im.w / im.res;                                   // Kachelgröße in Bühneneinheiten
  const [mx, my] = Juice.margin;                                // beim Rauszoomen/Wackeln wird mehr Boden sichtbar
  const x0 = Math.floor((c.x - STAGE_W / 2 - mx) / tile) * tile, y0 = Math.floor((c.y - STAGE_H / 2 - my) / tile) * tile;
  for (let wx = x0; wx < c.x + STAGE_W / 2 + mx; wx += tile) {
    for (let wy = y0; wy < c.y + STAGE_H / 2 + my; wy += tile) {
      const sx = Math.round((STAGE_W / 2 + wx - c.x) * SCALE) / SCALE;
      const sy = Math.round((STAGE_H / 2 - (wy + tile) + c.y) * SCALE) / SCALE;
      ctx.drawImage(im.img, sx, sy, tile, tile);
    }
  }
  if (CFG.map.infinite) return;
  const M = { halfW: CFG.map.halfW * G.arenaScale, halfH: CFG.map.halfH * G.arenaScale }, P = STYLE.pal;
  const L = STAGE_W / 2 + (-M.halfW - c.x), R = STAGE_W / 2 + (M.halfW - c.x);
  const T = STAGE_H / 2 - (M.halfH - c.y), B = STAGE_H / 2 - (-M.halfH - c.y);
  ctx.save();
  ctx.fillStyle = P.ink;
  if (L > -mx) ctx.fillRect(-mx, -my, L + mx, STAGE_H + 2 * my);
  if (R < STAGE_W + mx) ctx.fillRect(R, -my, STAGE_W + mx - R, STAGE_H + 2 * my);
  if (T > -my) ctx.fillRect(-mx, -my, STAGE_W + 2 * mx, T + my);
  if (B < STAGE_H + my) ctx.fillRect(-mx, B, STAGE_W + 2 * mx, STAGE_H + my - B);
  const hot = G.collapse && !G.bossFight, pulse = hot ? 0.55 + 0.45 * Math.sin(G.realTime * (G.collapseWarn ? 14 : 6)) : 1;      // Kollaps-Event: Rand glüht rot, in der Warnung schnell
  ctx.fillStyle = hot ? P.red : G.map.frame; ctx.globalAlpha = pulse;
  const th = hot ? 4 : 2, w = R - L, h = B - T;                                       // Rahmen aus harten Rechtecken (kein Leuchten)
  ctx.fillRect(L, T, w, th); ctx.fillRect(L, B - th, w, th); ctx.fillRect(L, T, th, h); ctx.fillRect(R - th, T, th, h);
  ctx.globalAlpha = pulse * 0.3; ctx.fillRect(L + th, T + th, w - 2 * th, 2); ctx.fillRect(L + th, B - th - 2, w - 2 * th, 2); ctx.fillRect(L + th, T + th, 2, h - 2 * th); ctx.fillRect(R - th - 2, T + th, 2, h - 2 * th);
  ctx.restore();
}

const MENU_ITEMS = ['play', 'inventory', 'cosmetics', 'upgrades', 'achievements', 'settings'];
const menuItems = () => (Save.data.dev ? MENU_ITEMS.concat(['stats']) : MENU_ITEMS);       // der Statistik-Bildschirm gehoert zum Dev-Modus
const MODE_ITEMS = ['regular', 'infinite', 'tutorial', 'back'];        // Auswahl nach PLAY
const MENU_MUSIC_MODES = ['start', 'stats', 'modeselect', 'infsetup', 'mapselect', 'keys', 'binds', 'inventory', 'cosmetics', 'upgrades', 'achievements', 'settings'];       // hier läuft die Menümusik (Tasten-Menü aus der Pause heraus nicht)
// Upgrade-Menü: drei Reiter. Jede Zeile ist { kind: 'up' | 'ability', id }
const UPGRADE_TABS = [
  { id: 'stats', label: 'STATS' },
  { id: 'weapons', label: 'ITEMS' },
  { id: 'abilities', label: 'ABILITIES' },
  { id: 'heroes', label: 'HEROES' },
  { id: 'milestones', label: 'MILESTONES' },
];
// Reihenfolge im Upgrade-Menue: immer nach Gruppen sortiert, innerhalb einer Gruppe nach Preis bzw. Ziel.
// Neue Eintraege landen automatisch in ihrer Gruppe (Werte: hier eintragen, sonst unter SONSTIGES).
const STAT_GROUPS = [
  { label: 'SURVIVAL', ids: ['health', 'resist', 'regen', 'heal', 'recovery', 'blood'] },
  { label: 'COMBAT', ids: ['power', 'attackSpeed'] },
  { label: 'SPEED', ids: ['speed', 'cooldown'] },
  { label: 'ULTIMATE', ids: ['ult', 'startUlt'] },
  { label: 'LOOT', ids: ['souls', 'coreDrop', 'bounty', 'luck', 'magnet', 'buffTime'] },
];
const ABILITY_GROUPS = [{ id: 'weak', label: 'WEAK ABILITIES' }, { id: 'medium', label: 'MEDIUM ABILITIES' }, { id: 'strong', label: 'STRONG ABILITIES' }];
const MILESTONE_GROUPS = [{ id: 'best', label: 'SURVIVAL TIME' }, { id: 'bosses', label: 'BOSSES' }, { id: 'kills', label: 'ENEMIES' }, { id: 'runs', label: 'RUNS' }, { id: 'endless', label: 'ENDLESS MODE' }, { id: 'tutorial', label: 'TUTORIAL' }, { id: 'heroes', label: 'HERO UNLOCKS' }, { id: 'cryo', label: 'CRYO STATION' }];

// Gruppe einer Zeile: { idx (Reihenfolge, fuer Farbe), label }
function upgradeGroup(r) {
  if (r.kind === 'up') {
    let i = STAT_GROUPS.findIndex((g) => g.ids.includes(r.id));
    return i < 0 ? { idx: STAT_GROUPS.length, label: 'OTHER' } : { idx: i, label: STAT_GROUPS[i].label };
  }
  if (r.kind === 'ability') {
    const i = ABILITY_GROUPS.findIndex((g) => g.id === CFG.loadout.abilities[r.id].tier);
    return { idx: i, label: ABILITY_GROUPS[i].label };
  }
  if (r.kind === 'hero') return { idx: CFG.heroes.order.indexOf(r.id), label: 'HEROES' };
  if (r.kind === 'milestone') {
    const i = MILESTONE_GROUPS.findIndex((g) => g.id === (CFG.milestones.find((m) => m.id === r.id).cat || CFG.milestones.find((m) => m.id === r.id).stat));
    return { idx: i, label: MILESTONE_GROUPS[i].label };
  }
  const i = CFG.items.slots.findIndex((s) => s.id === CFG.items.catalog[r.id].slot);
  return { idx: i, label: CFG.items.slots[i].label };
}

function upgradeRows(tab) {
  let rows;
  if (tab === 'abilities') {
    rows = Object.keys(CFG.loadout.abilities).map((id) => ({ kind: 'ability', id }));
    rows.sort((a, b) => upgradeGroup(a).idx - upgradeGroup(b).idx || CFG.loadout.abilities[a.id].unlock - CFG.loadout.abilities[b.id].unlock);
  } else if (tab === 'milestones') {
    rows = CFG.milestones.map((m) => ({ kind: 'milestone', id: m.id }));
    const need = (r) => CFG.milestones.find((m) => m.id === r.id).need;
    rows.sort((a, b) => upgradeGroup(a).idx - upgradeGroup(b).idx || String(CFG.milestones.find((m) => m.id === a.id).stat).localeCompare(CFG.milestones.find((m) => m.id === b.id).stat) || need(a) - need(b));
  } else if (tab === 'heroes') {
    rows = CFG.heroes.order.map((id) => ({ kind: 'hero', id }));
  } else if (tab === 'weapons') {
    rows = Object.keys(CFG.items.catalog).map((id) => ({ kind: 'item', id }));
    rows.sort((a, b) => upgradeGroup(a).idx - upgradeGroup(b).idx || CFG.items.catalog[a.id].cost - CFG.items.catalog[b.id].cost);
  } else {
    rows = Object.keys(CFG.meta.upgrades).filter((id) => CFG.meta.upgrades[id].tab === tab).map((id) => ({ kind: 'up', id }));
    const pos = (r) => { const g = STAT_GROUPS.find((q) => q.ids.includes(r.id)); return g ? g.ids.indexOf(r.id) : 0; };
    rows.sort((a, b) => upgradeGroup(a).idx - upgradeGroup(b).idx || pos(a) - pos(b));
  }
  return rows;
}
const SETTINGS_PAGES = [                      // Einstellungen in Seiten; Zeile 0 jeder Seite ist die Seitenwahl ('tabs', A/D wechselt), unten immer 'back'
  { label: 'SOUND & VIDEO', items: ['music', 'sfx', 'fx', 'fullscreen'] },
  { label: 'GAME', items: ['mouseaim', 'slot', 'controls', 'binds'] },
  { label: 'DATA', items: ['transfer', 'resetAll'] },
];
const settingsList = () => ['tabs'].concat(SETTINGS_PAGES[G.settingsPage || 0].items, ['back']);
const PAUSE_ITEMS = ['resume', 'abilities', 'music', 'sfx', 'binds', 'quit'];

const G = {
  mode: 'loading',
  realTime: 0,            // echte Zeit seit Programmstart (für Animationen)
  time: 0,                // Spielzeit in Sekunden (Original: Timer), steht still im Bosskampf
  deadAge: 0,
  endAge: 0,              // Sekunden seit Beginn der Ending-Sequenz

  player: null,
  director: null,
  lootCores: 0,           // Cores aus zerstoerten Kisten in diesem Lauf (werden am Ende gutgeschrieben)
  fallen: [],             // zuletzt gefallene Gegner {x,y,type,size,hits,t} (fuer Necromancy)
  attacks: [],            // Waffen des Spielers (Schwert, Schuss, Schild, Dash, Beam, Ultimate, Bloodburst)
  enemies: [],
  shots: [],              // Geschosse normaler Gegner
  blasts: [],             // Druckwellen und Explosionen
  meteors: [],            // Meteoriten des Meteoritenhagels
  obstacles: [],          // zerstörbare Barrikaden (obstacles.js)
  spawners: [],
  powerups: [],
  drops: [],              // Buff-Drops (Tempo, Raserei, Wächter, Ladung)
  texts: [],
  events: [],             // verzögerte Aktionen: { t, fn }

  boss: null,
  finalAt: CFG.finalBoss.at,   // Spielzeit, ab der der finale Boss erscheint (pro Lauf, null = nie)
  infinite: false,        // dieser Lauf ist ein Endlos-Lauf
  map: CFG.maps[0],       // gewählte Karte (CFG.maps)
  mapIdx: 0,
  diff: CFG.maps[0].diff, // Schwierigkeitsfaktoren der Karte
  finalStarted: false,    // der finale Boss ist schon erschienen
  victory: 0,             // > 0: finaler Boss besiegt, Restzeit bis zur Ending-Sequenz (Spieler unverwundbar)
  xpOrbs: [],             // XP-Kugeln am Boden (js/xp.js)
  hazards: [],            // Umgebungsmechanik der Karte (js/mapenv.js: Lava-Schlote, Schlackenbänder, Säurepfützen)
  bossCount: 0,           // wie viele Bosskämpfe in diesem Lauf schon gestartet wurden (für CFG.boss.order)
  arenaScale: 1,          // Arena-Boss: aktuelle Kartengröße (Faktor), arenaTarget = Ziel
  arenaTarget: 1,
  intro: null,            // Spawn-Animation des Bosses
  bossShots: [],
  bossFight: false,
  cam: { x: 0, y: 0 },    // Kamera-Mitte in Weltkoordinaten (friert im Bosskampf ein)
  bossTimer: 0,
  bossStageOctagon: 1,
  bossStageKite: 3,

  ultCharge: 0,
  ultStock: 0,           // zusätzlich gespeicherte, volle Ultimates (neben der großen Kugel)
  ultNext: 0,            // Fortschritt 0..1 der kleinen Kugel (nächstes gestapeltes Ultimate)
  combo: 0,
  comboPrev: 0,
  comboTimer: 0,
  clearing: false,        // true, solange ein Ultimate/Bloodburst alle Gegner wegwischt
  flood: false,           // true während einer Gegnerflut
  bloodMoon: false,       // true während eines Blutmonds
  bloodMoonLeft: 0,       // Restzeit des Blutmonds in Sekunden (für die Anzeige)
  meteorShower: false,    // true während eines Meteoritenhagels
  meteorLeft: 0,          // Restzeit des Hagels in Sekunden (für die Anzeige)
  collapse: false,        // true während der schrumpfenden Arena (Welt-Event)
  collapseWarn: false,    // erste Sekunden: Warnung, Karte schrumpft noch nicht
  collapseLeft: 0,        // Restzeit des Events in Sekunden (für die Anzeige)

  seenKeys: Save.data.seenKeys,   // Tastenübersicht schon gesehen? (gespeichert)
  cosTab: 0, cosSel: 0,   // Cosmetics-Menue: Kategorie und gewaehltes Item
  modeSel: 0,             // gewählter Punkt in der Modus-Auswahl nach PLAY
  menuSel: 0,           // gewählter Menüpunkt im Hauptmenü
  infSel: 0,             // gewählte Zeile im Endlos-Setup
  upgradeSel: 0,          // gewählte Zeile im Upgrade-Menü (die letzte Zeile ist Zurück)
  swapSel: 0,             // gewaehlte Zeile im Ability-Tausch
  pauseSel: 0,            // gewaehlte Zeile im Pausemenue
  pauseConfirm: false,    // Aufgeben wartet auf eine zweite Bestaetigung
  bindsBack: 'settings',  // wohin das Tasten-Menue zurueckfuehrt (settings oder pause)
  bindSel: 0,             // gewaehlte Zeile im Tasten-Menue
  bindWait: false,        // wartet auf die neue Taste
  invSel: 0,              // gewaehlter Slot im Inventar (letzte Zeile = Zurueck)
  resetConfirm: false,    // 'Alle Kaeufe zuruecksetzen' wartet auf zweite Bestaetigung
  invPick: null,          // offene Slot-Auswahl im Inventar: { slot, list, sel } oder null
  upgradeTab: 0,        // gewählter Reiter im Upgrade-Menü
  bosses: 0,              // in diesem Lauf besiegte Bosse
  kills: 0,               // in diesem Lauf besiegte Gegner
  newMilestones: [],      // im letzten Lauf neu erreichte Meilensteine
  earned: 0,              // Seelen, die der letzte Lauf gebracht hat
  settingsPage: 0,        // aktuelle Seite der Einstellungen (SETTINGS_PAGES)
  settingsSel: 0,         // gewählte Zeile in den Einstellungen
  newBest: false,         // aktueller Tod war eine neue Bestzeit
  god: false,             // unsterblich (nur noch für Tests/Smoke-Test, keine Taste mehr)

  // withTutorial: Hinweise im Lauf (erster Lauf automatisch, sonst über das Hauptmenü)
  // infinite: Endlos-Modus (unendliche Karte, finaler Boss nach der gewählten Zeit)
  begin(withTutorial = false, infinite = false) {
    this.mode = 'play';
    this.infinite = infinite && !withTutorial;
    CFG.map.infinite = this.infinite;                       // die Kartenregeln (Wände, Kamera, Boss-Kamera) hängen an diesem Schalter
    this.seenKeys = true;
    Save.data.seenKeys = true; Save.write();
    this.newBest = false;
    this.bosses = 0; this.kills = 0; this.earned = 0; this.newMilestones = [];
    Ach.beginRun(); Stats.reset(); this.deathDetails = false; this.cheated = !!this.god;       // Cheat-Laeufe werden als Dev-Lauf markiert (Statistik kann sie ausblenden)
    Xp.reset(); this.xpOrbs = [];                                              // XP und Perks beginnen jeden Lauf von vorn
    this.time = 0;
    this.deadAge = 0;
    Cos2.reset();                                                              // Cosmetics: Bodenmarken, Begleiter, Animationen zuruecksetzen
    this.lootCores = 0; this.fallen = []; this.attacks = []; this.enemies = []; this.shots = []; this.blasts = []; this.meteors = []; this.obstacles = [];
    this.spawners = []; this.powerups = []; this.drops = []; this.texts = []; this.events = [];
    this.boss = null; this.intro = null; this.bossShots = [];
    this.arenaScale = 1; this.arenaTarget = 1; this.bossCount = 0; this.eliteUp = false;
    const mi = withTutorial || !Save.mapUnlocked(Save.data.mapSel) ? 0 : Save.data.mapSel;          // gewählte Karte (Tutorial immer Karte 1)
    this.mapIdx = mi; this.map = CFG.maps[mi]; this.diff = this.map.diff;
    CFG.map.halfW = this.map.half[0]; CFG.map.halfH = this.map.half[1];
    const fm = CFG.infinite.finalMinutes[Save.data.infSel];
    this.finalAt = this.infinite ? (fm === null || fm === undefined ? null : fm * 60) : CFG.finalBoss.at; this.finalStarted = false; this.victory = 0;
    this.bossFight = false; this.bossTimer = 0;
    this.cam = { x: 0, y: 0 };
    this.bossStageOctagon = 1; this.bossStageKite = 3;
    this.ultCharge = Save.bonus('startUlt'); this.ultStock = 0; this.ultNext = 0; this.combo = 0; this.comboPrev = 0; this.comboTimer = 0;
    this.clearing = false;
    this.flood = false;
    this.bloodMoon = false; this.bloodMoonLeft = 0;
    this.meteorShower = false; this.meteorLeft = 0;
    this.collapse = false; this.collapseWarn = false; this.collapseLeft = 0;
    this.noticeT = 0;
    MsFx.reset();
    Loadout.reset();
    this.player = new Player();
    Juice.reset();
    this.director = new Director();
    MapEnv.init(); MapFx.reset(); SafeSpot.reset();                                         // Gefahren der gewählten Karte aufstellen (Karte 2 und 3)
    if (withTutorial) Tutorial.start(); else Tutorial.active = false;
    this.player.hp = this.player.maxHp; this.ultCharge += Hero.mods().startUlt;          // Held-Modifier (im Tutorial neutral, deshalb erst nach dem Tutorial-Flag)
  },

  // Finaler Boss besiegt: kurze Siegphase (CFG.ending.victoryDelay) bis zur Ending-Sequenz. In dieser Zeit ist der Spieler unverwundbar,
  // alle Gegner und Geschosse verschwinden und es spawnt nichts mehr, damit man nicht kurz vor dem Sieg noch sterben kann (Todesbildschirm statt Ende).
  startVictory() {
    if (this.victory > 0) return;
    this.victory = CFG.ending.victoryDelay;
    this.player.hp = Math.max(this.player.hp, 1);
    for (const list of [this.enemies, this.shots, this.bossShots, this.spawners, this.blasts, this.meteors]) for (const e of list) e.alive = false;
    this.notice('DEATH IS DEFEATED!', STYLE.pal.yellow, STYLE.type.h1);
  },

  die() {
    if (this.mode !== 'play' || this.victory > 0) return;
    if (Tutorial.active) { Tutorial.exit(); return; }                  // Tutorial verlassen: nichts wird gespeichert
    this.mode = 'dead';
    this.deadAge = 0;
    Cos2.dfx = Cos2.deathStart(this.player) || Cos2.deathPlain(this.player);       // Cosmetic DEATH: Animation vor dem Todesbildschirm (ohne Cosmetic eine kurze neutrale Phase)
    Sfx.play('death');
    this.settleRun(0);
    Stats.finish(this.time, this.bosses, this.map.id, this.infinite);       // Todesursache + Zusammenfassung (Save.write passiert unten in settleRun schon, daher hier nochmal)
    Ach.runEnd(false);
    Save.write();
    // Todesphase: Uhr steht (nur im Modus play zaehlt die Zeit), alle Gegner und Geschosse weg, nur die Todes-Animation laeuft
    for (const b of this.bossList()) b.alive = false;
    this.boss = null; this.intro = null; this.bossShots = [];
    for (const key of ['enemies', 'shots', 'spawners', 'blasts', 'meteors']) this[key] = [];
    hostMsg({ type: 'gameOver', score: Math.floor(this.time) });
  },

  // Lauf abrechnen (Tod und Sieg): Bestzeit, Statistik, Meilensteine, Cores. bonus = zusätzliche Cores (Sieg)
  settleRun(bonus) {
    const res = Save.finishRun(this.time, this.bosses, this.kills, this.infinite, Tutorial.active ? null : this.map.id);
    this.newBest = res.isBest; this.newMilestones = res.got;
    let run = Math.floor((this.time * CFG.meta.perSecond + this.bosses * CFG.meta.perBoss) * (1 + Save.bonus('souls') + Save.bonus('soulgain')) * (this.infinite ? CFG.infinite.coreFactor : 1) * this.diff.cores * Hero.mods().cores);
    const S = CFG.meta.starter, n = Save.data.runs - 1;                      // Save.finishRun hat den Lauf schon mitgezaehlt: n = 0 fuer den ersten Lauf
    this.starterBonus = null;
    if (!Tutorial.active && n >= 0 && n < S.mult.length) {                  // Starter-Bonus der ersten Laeufe
      const boosted = Math.max(Math.floor(run * S.mult[n]), S.min[n]);
      this.starterBonus = { run: n + 1, of: S.mult.length, extra: boosted - run };
      run = boosted;
    }
    this.earned = run + bonus + this.lootCores;
    Save.data.souls += this.earned; Save.write();
  },

  // Sieg (finaler Boss besiegt): kein Todesbildschirm, sondern die Ending-Sequenz (drawEndingScreen)
  win() {
    if (this.mode !== 'play' || Tutorial.active) return;
    this.mode = 'ending';
    this.endAge = 0;
    Sfx.play('ultimate');
    const first = !Save.data.wins;
    Save.data.wins = (Save.data.wins || 0) + 1;
    this.settleRun(first ? CFG.ending.firstWinCores : CFG.ending.winCores);
    Stats.finish(this.time, this.bosses, this.map.id, this.infinite, true);       // Sieg ins Protokoll
    Ach.runEnd(true);
    Save.write();
  },

  // Nach einem Boss: passt ein Evolutions-Rezept (CFG.evolutions), wird es zur Wahl angeboten (ESC = ueberspringen, kommt beim naechsten Boss wieder).
  // Gibt true zurueck, wenn die Wahl geoeffnet wurde. Danach folgt die Ability-Wahl (siehe updatePick).
  offerEvolution() {
    if (this.mode !== 'play' || Tutorial.active) return false;
    const E = CFG.evolutions, p = this.player;
    const ids = Object.keys(E.list).filter((id) => {
      const R = E.list[id];
      if (p.evolved[R.slot] || Save.equipped(R.slot) !== R.weapon || this.bosses < E.minUps) return false;
      return (!R.needs.ability || p.has(R.needs.ability)) && (!R.needs.implant || Save.equipped('artifact') === R.needs.implant);
    });
    if (!ids.length) return false;
    this.pick = { kind: 'evo', tier: null, ids, sel: 0, age: 0 };
    this.mode = 'pick';
    return true;
  },

  // Nach einem Boss: 3 Abilities zur Wahl (Spiel pausiert). Solange ein Slot leer ist, kommen sie aus dessen Gruppe und werden eingesetzt.
  // Sind alle Slots voll, kommen sie aus allen Gruppen (ohne schon gesammelte), die Wahl wird gesammelt und im Pausenmenue getauscht.
  offerAbility() {
    if (this.mode !== 'play') return;
    const tier = CFG.loadout.tiers.find((t) => !this.player.slots[t.id]) || null;
    let ids = Object.keys(CFG.loadout.abilities).filter((id) => (!tier || CFG.loadout.abilities[id].tier === tier.id) && Save.isUnlocked(id) && !this.player.owned.includes(id));
    if (!ids.length) return;
    for (let i = ids.length - 1; i > 0; i--) { const j = randInt(0, i); [ids[i], ids[j]] = [ids[j], ids[i]]; }      // gemischt, es werden bis zu 3 zur Wahl angeboten
    ids = ids.slice(0, 3);
    this.pick = { tier, ids, sel: 0, age: 0 };
    this.mode = 'pick';
  },

  // Hauptmenü: W/S oder Pfeile wählen, Leertaste/Enter bestätigt
  updateMenu() {
    const items = menuItems(), n = items.length;
    if (this.menuSel >= n) this.menuSel = 0;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.menuSel = (this.menuSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.menuSel = (this.menuSel + 1) % n;
    if (!(Input.pressed('Space') || Input.pressed('Enter'))) return;
    const item = items[this.menuSel];
    if (item === 'play') { this.mode = 'modeselect'; this.modeSel = Save.data.tutorialDone ? Math.max(0, MODE_ITEMS.indexOf(Save.data.lastMode)) : 2; }        // merkt sich den zuletzt gewaehlten Modus        // vor dem ersten Mal ist das Tutorial vorgewählt
    else if (item === 'inventory') { this.mode = 'inventory'; this.invSel = 0; this.invPick = null; }
    else if (item === 'cosmetics') { this.mode = 'cosmetics'; this.cosTab = 0; this.cosSel = Math.max(0, Cos.items('skin').findIndex((q) => q.id === Save.cosEquipped('skin'))); }
    else if (item === 'upgrades') { Save.data.upgradesSeen = true; Save.write(); this.mode = 'upgrades'; this.upgradeSel = 0; this.upgradeTab = 0; }
    else if (item === 'achievements') { this.mode = 'achievements'; Ach.open(); }
    else if (item === 'settings') { this.mode = 'settings'; this.settingsSel = 0; this.settingsPage = 0; }
    else if (item === 'stats') { this.mode = 'stats'; StatsScreen.open(); }
  },

  // Modus-Auswahl nach PLAY: Regular (-> Kartenwahl), Infinite (-> Endlos-Setup mit Karte), Tutorial (startet direkt), ESC zurück
  updateModeSelect() {
    const n = MODE_ITEMS.length;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.modeSel = (this.modeSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.modeSel = (this.modeSel + 1) % n;
    if (Input.pressed('Escape')) { this.mode = 'start'; return; }
    if (!(Input.pressed('Space') || Input.pressed('Enter'))) return;
    const item = MODE_ITEMS[this.modeSel];
    if (item !== 'back') { Save.data.lastMode = item; Save.write(); }
    if (item === 'regular') { this.mode = 'mapselect'; Save.data.mapSel = Save.mapUnlocked(Save.data.mapSel) ? Save.data.mapSel : 0; }
    else if (item === 'infinite') { this.mode = 'infsetup'; this.infSel = 0; }
    else if (item === 'tutorial') this.begin(true);
    else this.mode = 'start';
  },

  // Kartenauswahl nach PLAY: A/D wechselt, Leertaste startet (nur freigeschaltete Karten), ESC zurück
  updateMapSelect() {
    const n = CFG.maps.length;
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    if (dir) Save.data.mapSel = (Save.data.mapSel + dir + n) % n;
    if (Input.pressed('Space') || Input.pressed('Enter')) {
      if (Save.mapUnlocked(Save.data.mapSel)) { Save.write(); this.begin(false, false); } else Sfx.play('deny');
    } else if (Input.pressed('Escape')) { Save.write(); this.mode = 'modeselect'; }
  },

  // Endlos-Modus vor dem Start: Zeile 0 = Zeitpunkt des finalen Bosses (A/D oder Leertaste wechselt), Zeile 1 = Start, Zeile 2 = Zurück
  updateInfSetup() {
    const n = 4, opts = CFG.infinite.finalMinutes, nm = CFG.maps.length;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.infSel = (this.infSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.infSel = (this.infSel + 1) % n;
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (this.infSel === 0 && (dir || ok)) { Save.data.infSel = (Save.data.infSel + (dir || 1) + opts.length) % opts.length; Save.write(); }
    else if (this.infSel === 1 && (dir || ok)) {                       // Karte wählen (nur freigeschaltete)
      let m = Save.data.mapSel;
      for (let i = 0; i < nm; i++) { m = (m + (dir || 1) + nm) % nm; if (Save.mapUnlocked(m)) break; }
      Save.data.mapSel = m; Save.write();
    }
    else if (this.infSel === 2 && ok) { if (!Save.mapUnlocked(Save.data.mapSel)) Save.data.mapSel = 0; this.begin(false, true); }
    else if ((this.infSel === 3 && ok) || Input.pressed('Escape')) this.mode = 'modeselect';
  },

  // Cosmetics: A/D wechselt die Kategorie, W/S waehlt, Leertaste kauft (falls noetig) und ruestet aus, letzte Zeile / ESC zurueck
  updateCosmetics() {
    const cats = CFG.cosmetics.cats, cat = cats[this.cosTab], items = Cos.items(cat.id), n = items.length + 1;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.cosSel = (this.cosSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.cosSel = (this.cosSel + 1) % n;
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    if (dir) {
      this.cosTab = (this.cosTab + dir + cats.length) % cats.length;
      this.cosSel = Math.max(0, Cos.items(cats[this.cosTab].id).findIndex((q) => q.id === Save.cosEquipped(cats[this.cosTab].id)));
      return;
    }
    if (Input.pressed('Space') || Input.pressed('Enter')) {
      if (this.cosSel === n - 1) this.mode = 'start';
      else Sfx.play(Save.cosEquip(cat.id, items[this.cosSel].id) ? 'buy' : 'deny');
    }
    if (Input.pressed('Escape')) this.mode = 'start';
    const ck = cat.id + ':' + this.cosSel;                                         // Sound-Pakete: beim Auswaehlen eine Hoerprobe spielen
    if (ck !== this.cosKey) { this.cosKey = ck; if (cat.id === 'sound' && items[this.cosSel]) Cos2.sample(items[this.cosSel]); }
  },

  // Upgrade-Menü: A/D wechselt den Reiter, W/S wählt die Zeile, Leertaste kauft, letzte Zeile (oder ESC) geht zurück
  updateUpgrades() {
    const rows = upgradeRows(UPGRADE_TABS[this.upgradeTab].id), n = rows.length + 1;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.upgradeSel = (this.upgradeSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.upgradeSel = (this.upgradeSel + 1) % n;
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    if (dir) { this.upgradeTab = (this.upgradeTab + dir + UPGRADE_TABS.length) % UPGRADE_TABS.length; this.upgradeSel = 0; return; }
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (ok && this.upgradeSel === n - 1) this.mode = 'start';
    else if (ok) {
      const r = rows[this.upgradeSel];
      if (r.kind === 'up') Sfx.play(Save.buy(r.id) ? 'buy' : 'deny');
      else if (r.kind === 'ability') Sfx.play((Save.isUnlocked(r.id) ? Save.gearUp(r.id) : Save.unlock(r.id)) ? 'buy' : 'deny');        // gesperrt: freischalten, sonst Stufe kaufen
      else if (r.kind === 'milestone') { /* nur Anzeige */ }
      else if (r.kind === 'hero') Sfx.play((Save.heroOwned(r.id) ? Save.heroSelect(r.id) : Save.heroBuy(r.id)) ? 'buy' : 'deny');        // gehoert dir: waehlen, sonst kaufen (Meilenstein + Cores)
      else if (!Save.owns(r.id)) Sfx.play(Save.buyItem(r.id) ? 'buy' : 'deny');        // Item: erst kaufen, dann mit Leertaste aus-/ablegen
      else Save.equipItem(r.id);
    }
    if (Input.pressed('Escape')) this.mode = 'start';
  },

  // Inventar (eigener Menuepunkt): W/S waehlt den Slot, Leertaste oeffnet die Auswahl, letzte Zeile / ESC geht zurueck
  updateInventory() {
    if (this.invPick) { this.updateInvPick(); return; }
    const n = CFG.items.slots.length + 1;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.invSel = (this.invSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.invSel = (this.invSel + 1) % n;
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (Input.pressed('KeyU') && this.invSel < n - 1) {                       // U = Stufe der ausgeruesteten Waffe kaufen
      const id = Save.equipped(CFG.items.slots[this.invSel].id);
      if (id) { const ok = Save.gearUp(id); Sfx.play(ok ? 'buy' : 'deny'); if (ok) this.invFlashAt = this.realTime; }
    }
    if (ok && this.invSel === n - 1) this.mode = 'start';
    else if (ok) {
      const slot = CFG.items.slots[this.invSel].id, canEmpty = slot !== 'melee' && slot !== 'ranged';
      const list = (canEmpty ? [null] : []).concat(Save.ownedFor(slot)), cur = list.indexOf(Save.equipped(slot));
      this.invPick = { slot, list, sel: Math.max(0, cur) };
    }
    if (Input.pressed('Escape')) this.mode = 'start';
  },

  // Slot-Auswahl im Inventar: W/S waehlt, Leertaste ruestet aus und schliesst, ESC schliesst
  updateInvPick() {
    const P = this.invPick, n = P.list.length;
    if (Input.pressed('Escape')) { this.invPick = null; return; }
    if (!n) { if (Input.pressed('Space') || Input.pressed('Enter')) this.invPick = null; return; }
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) P.sel = (P.sel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) P.sel = (P.sel + 1) % n;
    if (Input.pressed('KeyU') && P.list[P.sel]) { const ok = Save.gearUp(P.list[P.sel]); Sfx.play(ok ? 'buy' : 'deny'); if (ok) this.invFlashAt = this.realTime; }
    if (Input.pressed('Space') || Input.pressed('Enter')) {
      const id = P.list[P.sel];
      if (id === null) Save.unequip(P.slot);
      else if (Save.equipped(P.slot) !== id) Save.equipItem(id);
      this.invPick = null;
    }
  },

  // Pause: ESC / P im Spiel, oder automatisch beim Verlassen des Fensters. Alles steht still, die Musik haelt an.
  pauseGame() {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.pauseSel = 0;
    this.pauseConfirm = false;
    Save.write();                                        // Komfort: Zwischenstand sichern (Waffen-/Ability-XP aus diesem Lauf)
    pauseMusic();
  },
  resumeGame() {
    this.mode = 'play';
    resumeMusic();
    Input.pressedNow = {};
  },
  updatePause() {
    const n = PAUSE_ITEMS.length;
    if (Input.pressed('Escape') || Input.pressed('KeyP')) { this.resumeGame(); return; }
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) { this.pauseSel = (this.pauseSel + n - 1) % n; this.pauseConfirm = false; }
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) { this.pauseSel = (this.pauseSel + 1) % n; this.pauseConfirm = false; }
    const item = PAUSE_ITEMS[this.pauseSel];
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (item === 'music' && dir) { setMusicVolume(Math.round((Save.data.musicVol + dir * 0.1) * 10) / 10); Save.write(); }
    else if (item === 'sfx' && dir) { Sfx.setVolume(Math.round((Save.data.sfxVol + dir * 0.1) * 10) / 10); Save.write(); Sfx.play('select'); }
    else if (item === 'resume' && ok) this.resumeGame();
    else if (item === 'abilities' && ok) { this.mode = 'swap'; this.swapSel = 0; Input.pressedNow = {}; }
    else if (item === 'binds' && ok) { this.mode = 'binds'; this.bindSel = 0; this.bindWait = false; this.bindsBack = 'pause'; }
    else if (item === 'quit' && ok) {
      if (!this.pauseConfirm) this.pauseConfirm = true;          // erst nochmal bestaetigen
      else { this.mode = 'play'; Stats.lastSrc = 'GAVE UP'; this.die(); }                   // Aufgeben zaehlt als Tod (Seelen, Statistik)
    }
  },

  // Tasten-Menue: Zeile waehlen, Leertaste/Enter, dann die neue Taste druecken (ESC bricht ab)
  updateBinds() {
    const A = Input.actions, n = A.length + 2;           // + Zuruecksetzen + Zurueck
    if (this.bindWait) {
      if (Input.pressed('Escape')) { this.bindWait = false; return; }
      const c = Input.firstPressed();
      if (c) { Input.bind(A[this.bindSel].id, c); this.bindWait = false; }
      return;
    }
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.bindSel = (this.bindSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.bindSel = (this.bindSel + 1) % n;
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (ok && this.bindSel < A.length) this.bindWait = true;
    else if (ok && this.bindSel === A.length) Input.resetBinds();
    else if ((ok && this.bindSel === n - 1) || Input.pressed('Escape')) { this.mode = this.bindsBack; Input.pressedNow = {}; }
  },

  // Einstellungen: Lautstärken (A/D), Effekte, Vollbild, Steuerung, Zurücksetzen, Zurück
  updateSettings() {
    const n = settingsList().length;
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.settingsSel = (this.settingsSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.settingsSel = (this.settingsSel + 1) % n;
    const item = settingsList()[this.settingsSel];
    const dir = (Input.pressed('ArrowRight') || Input.pressed('KeyD') ? 1 : 0) - (Input.pressed('ArrowLeft') || Input.pressed('KeyA') ? 1 : 0);
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (item === 'tabs' && (dir || ok)) { this.settingsPage = (this.settingsPage + (dir || 1) + SETTINGS_PAGES.length) % SETTINGS_PAGES.length; this.resetConfirm = false; }
    else if (item === 'music' && dir) { setMusicVolume(Math.round((Save.data.musicVol + dir * 0.1) * 10) / 10); Save.write(); }
    else if (item === 'sfx' && dir) { Sfx.setVolume(Math.round((Save.data.sfxVol + dir * 0.1) * 10) / 10); Save.write(); Sfx.play('select'); }
    else if (item === 'fx' && (dir || ok)) { Save.data.fx = (Juice.level + (dir || 1) + 3) % 3; Save.write(); }       // OFF / REDUCED / FULL
    else if (item === 'fullscreen' && (ok || dir)) { try { if (document.fullscreenElement) document.exitFullscreen(); else canvas.requestFullscreen(); } catch (e) { /* Browser verbietet Vollbild */ } }
    else if (item === 'mouseaim' && (dir || ok)) { Save.data.mouseAim = !Save.data.mouseAim; Save.write(); Sfx.play('select'); }
    else if (item === 'slot' && (dir || ok)) Save.switchSlot((Save.slot + (dir || 1) + Save.SLOTS) % Save.SLOTS);
    else if (item === 'controls' && ok) this.mode = 'keys';
    else if (item === 'binds' && ok) { this.mode = 'binds'; this.bindSel = 0; this.bindWait = false; this.bindsBack = 'settings'; }
    else if (item === 'transfer' && ok) SaveTransfer.open();
    else if (item === 'resetAll' && ok) {
      if (!this.resetConfirm) this.resetConfirm = true;           // erst nochmal bestaetigen
      else { Save.resetAll(); this.resetConfirm = false; }
    }
    else if (item === 'back' && ok) this.mode = 'start';
    if (item !== 'resetAll' || Input.pressed('ArrowUp') || Input.pressed('KeyW') || Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.resetConfirm = false;       // Bestaetigung verfaellt beim Weiterscrollen
    if (Input.pressed('Escape')) this.mode = 'start';
  },

  updatePick(dt) {
    const k = this.pick;
    k.age += dt;
    const n = k.ids.length;
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) k.sel = (k.sel + n - 1) % n;
    if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) k.sel = (k.sel + 1) % n;
    let confirm = Input.pressed('Space') || Input.pressed('Enter') || Input.clicked;
    for (let i = 0; i < n; i++) if (Input.pressed('Digit' + (i + 1))) { k.sel = i; confirm = true; }     // Ziffer wählt direkt
    if (k.kind === 'xp') {                                            // Level-up: ein Perk (kein Überspringen, kurze Sperre gegen versehentliches Bestätigen)
      if (k.age > 0.45 && confirm) { Xp.choose(k.ids[k.sel]); this.pick = null; this.mode = 'play'; }
      return;
    }
    if (k.kind === 'evo') {
      if (k.age > 0.6 && (confirm || Input.pressed('Escape'))) {
        const R = CFG.evolutions.list[k.ids[k.sel]];
        if (!Input.pressed('Escape')) {
          this.player.evolved[R.slot] = k.ids[k.sel];
          this.notice('EVOLVED: ' + R.name, STYLE.pal.yellow, STYLE.type.h1);
          Sfx.play('upgrade'); Juice.shake(3);
        }
        this.pick = null;
        this.mode = 'play';
        if (!Tutorial.active) this.offerAbility();                    // danach wie gewohnt die Ability-Wahl (im Tutorial nicht)
      }
      return;
    }
    if (k.age > 0.6 && confirm) {
      const id = k.ids[k.sel], A = CFG.loadout.abilities[id], p = this.player;
      p.owned.push(id);
      if (!p.slots[A.tier]) {                                         // freier Slot: gleich einsetzen
        p.slots[A.tier] = id;
        this.notice(A.name + (A.passive ? '' : ' [' + Input.label('ability_' + A.tier) + ']'), STYLE.pal.cyan);
      } else this.notice('COLLECTED: ' + A.name + ' (SWAP IN PAUSE MENU)', STYLE.pal.yellow);
      this.pick = null;
      this.mode = 'play';
    }
  },

  // Ability-Tausch (Pausenmenue): alle gesammelten Abilities, Leertaste setzt die gewaehlte in den Slot ihrer Gruppe
  swapRows() {
    const order = CFG.loadout.tiers.map((t) => t.id);
    return this.player.owned.slice().sort((a, b) => order.indexOf(CFG.loadout.abilities[a].tier) - order.indexOf(CFG.loadout.abilities[b].tier));
  },
  updateSwap() {
    const rows = this.swapRows(), n = rows.length + 1;                 // + Zurueck
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) this.swapSel = (this.swapSel + n - 1) % n;
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) this.swapSel = (this.swapSel + 1) % n;
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (Input.pressed('Escape') || (ok && this.swapSel === n - 1)) { this.mode = 'pause'; Input.pressedNow = {}; return; }
    if (ok) {
      const id = rows[this.swapSel], A = CFG.loadout.abilities[id];
      if (this.player.slots[A.tier] !== id) { this.player.slots[A.tier] = id; this.swapFlash = 0.4; }
    }
    this.swapFlash = Math.max(0, (this.swapFlash || 0) - 1 / 60);
  },

  // Bosskampf mit festem Bild (Kamera steht, Spieler bleibt im Bild): nur auf der unendlichen Karte nötig.
  // Auf der begrenzten Karte kann der Spieler eh nicht weglaufen, dort erscheint der Boss in der Kartenmitte.
  // Spawnpunkte der Gegner: auf der begrenzten Karte fest, auf der unendlichen Karte relativ zur Kamera (wandern mit)
  spawnPointList() { return CFG.map.infinite ? CFG.infinite.spawnPoints.map(([x, y]) => [x + this.cam.x, y + this.cam.y]) : CFG.spawnPoints; },
  get bossLock() { return this.bossFight && CFG.map.infinite; },

  addText(name, x, y) { this.texts.push(new FloatingText(name, x, y)); },
  // Schadenszahl am Spieler: echter Schaden als Pixelzahl, ab 15 orange und groesser
  addDamageText(amount, x, y) {
    const n = Math.max(1, Math.round(amount)), big = n >= 15;
    this.texts.push(new FloatingText(null, x, y, { text: '-' + n, color: big ? STYLE.pal.orange : STYLE.pal.red, size: big ? 15 : 12 }));
  },
  // Ladung kommt zuerst in die große Kugel; ist sie voll, füllt der Überschuss die kleine Kugel (gestapeltes Ultimate), jedes weitere lädt langsamer
  addUlt(n) {
    const U = CFG.ult, full = U.readyAt + 1;
    let pts = n * U.chargeFactor * Hero.mods().ult * (1 + Save.bonus('ult') + Xp.val('charge') + (this.player && this.player.has('capacitor') ? CFG.passives.capacitor.ult * Save.gearMul('capacitor') : 0));
    if (this.ultCharge < full) {
      const need = full - this.ultCharge;
      if (pts < need) { this.ultCharge += pts; return; }
      pts -= need; this.ultCharge = full;
    }
    let count = 1 + this.ultStock;                              // so viele Ultimates sind schon bereit
    if (count >= U.maxStack) return;
    this.ultNext += pts * this.ultStackRate(count) / full;
    while (this.ultNext >= 1 && count < U.maxStack) {
      const carry = (this.ultNext - 1) * this.ultStackRate(count + 1) / this.ultStackRate(count);
      this.ultStock++; count++; this.ultNext = carry;
      Sfx.play('ultReady');
    }
    if (count >= U.maxStack) this.ultNext = 0;
  },
  // Lade-Tempo des (count+1)-ten Ultimates: 1. Stapel stark gebremst, danach nur noch kleine Schritte
  ultStackRate(count) {
    const r = CFG.ult.stackRates;
    return count < r.length ? r[count] : r[r.length - 1] * Math.pow(CFG.ult.stackTail, count - r.length + 1);
  },
  addCombo() { this.combo++; },
  resetCombo() { this.combo = 0; this.comboPrev = 0; },
  later(seconds, fn) { this.events.push({ t: seconds, fn }); },
  // Meldung oben in der Mitte. color/size optional (Standard: Cyan, Größe h2)
  // Auffaelliger Marker, wenn ein Effekt ausloest (Revival Core, Aegis, ...): Ringe + Text am Spieler und kurzer Bildschirmblitz (flash = Sekunden, 0 = kein Blitz)
  trigger(label, color, o = {}) {
    this.attacks.push(new TriggerFx(this.player, label, color, o));
    const fl = o.flash === undefined ? 0.2 : o.flash;
    if (fl > 0) Juice.flash(color, 0.5, fl, true);
  },
  notice(text, color, size) { this.noticeText = text; this.noticeColor = color || STYLE.pal.cyan; this.noticeSize = size || STYLE.type.h2; this.noticeT = 2; },

  // Alle lebenden Boss-Körper (bei den Zwillingen zwei)
  bossList() {
    const b = this.boss;
    if (!b) return [];
    return [b].concat(b.twin ? [b.twin] : []).filter((x) => x.alive);
  },

  startBossFight(type) {
    this.bossFight = true;
    Stats.bossStart(type);
    Sfx.play('bossIntro');
    Cos2.introStart(type);                                      // Cosmetic INTRO: Titelkarte
    this.intro = new BossIntro(type);
    this.bossTimer = 0;
  },

  endBossFight(result = 'win') {       // result fuers Protokoll: 'win' | 'timeout'
    Stats.bossEnd(result);
    this.bossFight = false;
    this.boss = null;
    this.arenaScale = 1; this.arenaTarget = 1;
    this.intro = null;
    this.bossShots = [];
  },

  // Kamera: bleibt stehen, solange der Spieler im kleinen Mittelraum ist, sonst folgt sie weich.
  // Im Bosskampf steht sie still, damit der Spieler nicht wegläuft (siehe Player.update: er bleibt im Bild).
  updateCamera(dt) {
    if (this.bossLock) return;
    const C = CFG.camera, p = this.player, c = this.cam;
    const tx = p.x - clamp(p.x - c.x, -C.deadW, C.deadW);
    const ty = p.y - clamp(p.y - c.y, -C.deadH, C.deadH);
    const k = 1 - Math.exp(-C.follow * dt);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    if (!CFG.map.infinite) {
      c.x = clamp(c.x, -(CFG.map.halfW - STAGE_W / 2), CFG.map.halfW - STAGE_W / 2);
      c.y = clamp(c.y, -(CFG.map.halfH - STAGE_H / 2), CFG.map.halfH - STAGE_H / 2);
    }
  },

  // Menü-Klänge zentral: Auswahl bewegen, bestätigen, zurück (nicht im Spiel selbst und nicht, solange eine Taste belegt wird)
  menuSounds() {
    if (this.mode === 'play' || this.mode === 'loading' || this.bindWait) return;
    const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
    if (this.mode === 'dead') { if (Input.pressed('Space') && this.deadAge > 1) Sfx.play('select'); return; }       // (R = Retry spielt seinen Klang selbst)
    if (this.mode === 'ending') return;
    if (Input.pressed('Escape')) Sfx.play('back');
    else if (Input.pressed('Space') || Input.pressed('Enter')) Sfx.play('select');
    else if (nav.some((k) => Input.pressed(k))) Sfx.play('tick');
  },

  // Dev-Modus (Save.data.dev, freigeschaltet mit tools/dev-save.deatharena): F1 alle Karten, F2 unsterblich, F3 +60 s, F4 +500 Cores.
  // Laeufe mit F2/F3 gelten als Cheat-Lauf (G.cheated) und werden im Statistik-Protokoll als Dev-Lauf markiert (dv).
  devKeys() {
    if (Input.pressed('F1')) { Save.data.devUnlockAll = !Save.data.devUnlockAll; Save.write(); Sfx.play('select'); }
    if (Input.pressed('F2')) { this.god = !this.god; if (this.god) this.cheated = true; Sfx.play('select'); }
    if (Input.pressed('F3') && this.mode === 'play' && !this.bossFight && !Tutorial.active) { this.time += 60; this.cheated = true; Sfx.play('select'); }
    if (Input.pressed('F4')) { Save.data.souls += 500; Save.write(); Sfx.play('select'); }
  },

  update(dt) {
    this.realTime += dt;
    if (canvas.style) canvas.style.cursor = this.mode === 'play' ? 'none' : '';       // Komfort: im Spiel kein Mauszeiger
    if (this.mode !== 'play' && this.mode !== 'loading') UIHit.update();      // Maus in den Menues
    this.menuSounds();
    Ach.tick(dt);
    if (MENU_MUSIC_MODES.includes(this.mode) && !(this.mode === 'binds' && this.bindsBack === 'pause')) playMusic('menu');
    else if (this.mode === 'dead') playMusic('dead');
    else if (this.mode === 'ending') playMusic(this.endAge < ENDING_SPLIT ? 'dead' : 'menu');
    if (Save.data.dev) this.devKeys();
    if (this.mode === 'start') {
      this.updateMenu();
    } else if (this.mode === 'achievements') {
      Ach.updateScreen();
    } else if (this.mode === 'stats') {
      StatsScreen.update();
    } else if (this.mode === 'modeselect') {
      this.updateModeSelect();
    } else if (this.mode === 'cosmetics') {
      this.updateCosmetics();
    } else if (this.mode === 'infsetup') {
      this.updateInfSetup();
    } else if (this.mode === 'mapselect') {
      this.updateMapSelect();
    } else if (this.mode === 'keys') {
      if (Input.clicked || Input.pressed('Space') || Input.pressed('Enter') || Input.pressed('Escape')) this.mode = 'settings';      // Untermenü der Einstellungen: nur zurück
    } else if (this.mode === 'binds') {
      this.updateBinds();
    } else if (this.mode === 'inventory') {
      this.updateInventory();
    } else if (this.mode === 'upgrades') {
      this.updateUpgrades();
    } else if (this.mode === 'settings') {
      this.updateSettings();
    } else if (this.mode === 'ending') {
      this.endAge += dt;
      if (this.endAge > ENDING_MENU_AT && Input.pressed('Tab')) { this.deathDetails = !this.deathDetails; Sfx.play('select'); }
      if (Input.pressed('Space') || Input.pressed('Enter')) {
        if (this.endAge > ENDING_MENU_AT) { this.deathDetails = false; this.mode = 'start'; }
        else if (this.endAge > 3 && this.endAge < ENDING_SPLIT && Save.data.wins > 1) this.endAge = ENDING_SPLIT;       // ab dem zweiten Sieg darf man die Szene überspringen
      }
    } else if (this.mode === 'dead') {
      this.deadAge += dt;
      if (Cos2.dfx) Cos2.deathStep(Cos2.dfx, dt);
      if (Cos2.pet) Cos2.pet.hide = Math.min(1, Cos2.pet.hide + dt * 3);          // Begleiter versteckt sich
      if (this.deadAge > 0.6 && Input.pressed('Tab')) { this.deathDetails = !this.deathDetails; Sfx.play('select'); }
      const ready = this.deadAge > 1 && Cos2.deathFadeIn() >= 1;                // erst wenn die Todes-Animation vorbei und der Deathscreen eingeblendet ist
      if (ready && Input.pressed('Space')) this.mode = 'start';      // nach dem Tod zurück ins Menü (hier wird später Build/Leveln ausgebaut)
      else if (ready && Input.pressed('KeyR')) { Sfx.play('select'); this.begin(false, this.infinite); }      // Komfort: sofort noch ein Lauf, gleicher Modus und gleiche Karte
    } else if (this.mode === 'pick') {
      this.updatePick(dt);
    } else if (this.mode === 'swap') {
      this.updateSwap();
    } else if (this.mode === 'pause') {
      this.updatePause();
    } else if (this.mode === 'play') {
      if (Input.pressed('Escape') || Input.pressed('KeyP')) { Ach.add('pauses'); this.pauseGame(); }
      else if (Juice.hs > 0) Juice.hs -= dt;                      // Impact-Frame: die Welt steht kurz still
      else this.updatePlay(dt);
    }
  },

  updatePlay(dt) {
    playMusic('game');                                          // eine Spielmusik, deren Ebenen von Leben und Bosskampf abhängen (music.js)
    Music.setState(Tutorial.active ? 1 : this.player.hp / this.player.maxHp, this.bossFight);       // im Tutorial zählt das Leben nicht

    this.noticeT = Math.max(0, (this.noticeT || 0) - dt);
    this.flashT = Math.max(0, (this.flashT || 0) - dt);
    if (Tutorial.active && Tutorial.phase === 'brief') { Juice.update(dt); Tutorial.update(dt); return; }       // Tutorial-Textbox: das Spiel steht still, bis SPACE gedrueckt wird
    Juice.update(dt);
    Cos2.tick(dt);                                              // Cosmetics: Bodenmarken, Echos, Titelkarte, Siegerpose, Wiederbelebung
    MsFx.update(dt);
    Ach.update(dt);
    this.player.update(dt);
    if (this.mode !== 'play') return;
    Tutorial.update(dt);
    if (this.player.blinkT <= 0) pushOutOfObstacles(this.player, this.player.radius);      // unsichtbar (Phase) = man geht hindurch
    this.updateCamera(dt);

    for (const a of this.attacks) a.update(dt);
    this.attacks = this.attacks.filter((a) => a.alive);
    this.clearing = this.attacks.some((a) => a.clearing);

    if (this.victory > 0) { this.victory -= dt; if (this.victory <= 0) { this.win(); return; } }     // Siegphase: kein Director, keine neuen Gegner
    if (!this.bossFight && !Tutorial.active) this.time += dt;
    Loadout.updateByTime(this.time);
    if (!Tutorial.active && !(this.victory > 0)) { this.director.update(dt); this.director.updateBosses(); }       // im Tutorial führt Tutorial.update die Szenarien
    MapEnv.update(dt);
    Elite.update();
    SafeSpot.update(dt);
    MapFx.update(dt);

    if (this.intro) {
      this.intro.update(dt);
      if (!this.intro.alive) this.intro = null;
    }
    if (this.boss) {
      if (!Tutorial.active) this.bossTimer += dt;                      // im Tutorial gibt es kein Zeitlimit
      if (this.bossTimer > CFG.boss.timeout && this.boss.type !== 'reaper') {      // der finale Boss hat kein Zeitlimit
        this.later(0.25, () => Loadout.weaponUp(this.time));
        this.endBossFight('timeout');
      } else {
        this.boss.update(dt);
      }
    }

    for (const list of [this.enemies, this.obstacles, this.shots, this.blasts, this.meteors, this.bossShots, this.spawners, this.powerups, this.drops, this.xpOrbs, this.texts]) {
      for (const e of list) e.update(dt);
    }
    this.xpOrbs = this.xpOrbs.filter((e) => e.alive);
    Xp.update(dt);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.shots = this.shots.filter((e) => e.alive);
    this.blasts = this.blasts.filter((e) => e.alive);
    this.meteors = this.meteors.filter((e) => e.alive);
    this.obstacles = this.obstacles.filter((e) => e.alive);
    for (const e of this.enemies) pushOutOfObstacles(e, e.radius);                // Barrikaden sind für alle massiv
    for (const b of this.bossList()) pushOutOfObstacles(b, b.radius);
    this.bossShots = this.bossShots.filter((e) => e.alive);
    this.spawners = this.spawners.filter((e) => e.alive);
    this.powerups = this.powerups.filter((e) => e.alive);
    this.drops = this.drops.filter((e) => e.alive);
    this.texts = this.texts.filter((e) => e.alive);

    // Kombo: Kills müssen im Abstand von weniger als 1.5 s kommen, sonst fängt der Zähler neu an
    this.comboTimer += dt;
    if (this.comboTimer >= CFG.bloodburst.comboWindow) {
      this.comboTimer = 0;
      if (this.comboPrev < this.combo) this.comboPrev = this.combo;
      else this.resetCombo();
    }

    for (const ev of this.events) ev.t -= dt;
    const due = this.events.filter((ev) => ev.t <= 0);
    this.events = this.events.filter((ev) => ev.t > 0);
    for (const ev of due) ev.fn();

  },

  draw(ctx) {
    UIHit.list.length = 0;                  // klickbare Flächen werden beim Zeichnen neu gesammelt
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    if (this.mode === 'loading') {
      uiText(ctx, 'LOADING ...', 20, 30, { size: STYLE.type.h2, color: STYLE.pal.cyan });
    } else if (this.mode === 'start') {
      drawStartScreen(ctx);
    } else if (this.mode === 'achievements') {
      Ach.drawScreen(ctx);
    } else if (this.mode === 'stats') {
      StatsScreen.draw(ctx);
    } else if (this.mode === 'modeselect') {
      drawModeSelectScreen(ctx);
    } else if (this.mode === 'cosmetics') {
      drawCosmeticsScreen(ctx);
    } else if (this.mode === 'infsetup') {
      drawInfSetupScreen(ctx);
    } else if (this.mode === 'mapselect') {
      drawMapSelectScreen(ctx);
    } else if (this.mode === 'keys') {
      drawKeysScreen(ctx);
    } else if (this.mode === 'binds') {
      drawBindsScreen(ctx);
    } else if (this.mode === 'inventory') {
      drawInventoryScreen(ctx);
    } else if (this.mode === 'upgrades') {
      drawUpgradesScreen(ctx);
    } else if (this.mode === 'settings') {
      drawSettingsScreen(ctx);
    } else if (this.mode === 'ending') {
      drawEndingScreen(ctx);
    } else if (this.mode === 'dead') {
      if (Cos2.deathActive()) this.drawPlay(ctx);                           // Cosmetic DEATH: erst die Animation in der Welt, dann der Todesbildschirm
      else {
        drawDeathScreen(ctx);
        const fade = Cos2.deathFadeIn();
        if (fade < 1) { ctx.save(); ctx.globalAlpha = 1 - fade; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore(); }
      }
    } else if (this.mode === 'pick') {
      this.drawPlay(ctx);
      drawPickScreen(ctx);
    } else if (this.mode === 'swap') {
      this.drawPlay(ctx);
      drawSwapScreen(ctx);
    } else if (this.mode === 'pause') {
      this.drawPlay(ctx);
      drawPauseScreen(ctx);
    } else if (this.mode === 'play') {
      this.drawPlay(ctx);
    }
    Ach.drawToasts(ctx);
  },

  drawPlay(ctx) {
    Cos2.victorySync();
    Juice.begin(ctx);                       // Zoom-Puls und Wackeln um die Bildmitte (HUD bleibt fest)
    drawGround(ctx);
    if (this.infinite) { const [mx, my] = Juice.margin; Cos.drawEndlessGround(ctx, Cos.cur('endless'), this.cam, STAGE_W / 2 + mx, STAGE_H / 2 + my, this.realTime); }      // Endlos-Cosmetics: Raster/Sterne
    // Alles in der Welt wird um die Kamera verschoben gezeichnet, das HUD danach fest auf dem Bildschirm
    ctx.save();
    ctx.translate(-this.cam.x, this.cam.y);
    if (!CFG.map.infinite) for (const [x, y] of this.spawnPointList()) drawSprite(ctx, 'spawnPoint', x, y, 90, 200, { alpha: 0.8 });      // im Endlos-Modus sind die Spawnpunkte unsichtbar
    MapFx.drawBelow(ctx);
    MapEnv.draw(ctx);
    SafeSpot.draw(ctx);
    Cos2.drawDecals(ctx);                                                          // Cosmetics: Stempel, Spuren, Tinte, Grabsteine am Boden
    for (const e of this.meteors) e.drawGround(ctx);
    Tutorial.drawWorld(ctx);
    for (const e of this.obstacles) e.draw(ctx);
    for (const e of this.spawners) e.draw(ctx);
    for (const e of this.powerups) e.draw(ctx);
    for (const e of this.drops) e.draw(ctx);
    for (const e of this.xpOrbs) e.draw(ctx);
    Patterns.drawCorpses(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const b of this.bossList()) b.draw(ctx);
    if (this.intro) this.intro.draw(ctx);
    for (const e of this.blasts) e.draw(ctx);
    for (const e of this.shots) e.draw(ctx);
    for (const e of this.bossShots) e.draw(ctx);
    // Waffen liegen hinter dem Spieler, Ultimate und Bloodburst darüber
    const overlay = (a) => a.kind === 'ult' || a.kind === 'blood';
    Cos2.drawEchoes(ctx);                                                          // Cosmetic Slash Echo: eingefrorene Abbilder
    for (const a of this.attacks) if (!overlay(a)) Cos.drawAttack(ctx, a);          // Waffen mit dem ausgerüsteten Glow-Cosmetic
    Cos2.petDraw(ctx, Cos2.pet, Cos.cur('pet'), this.realTime);                    // Cosmetic PET
    Cos2.victoryDraw(ctx, Cos2.vic);                                               // Cosmetic WIN (Fanfare, Flagge)
    if (this.mode === 'dead' && Cos2.dfx) Cos2.deathDraw(ctx, Cos2.dfx);           // Cosmetic DEATH: statt des Spielers
    else this.player.draw(ctx);
    for (const a of this.attacks) if (overlay(a)) a.draw(ctx);
    MapFx.drawAbove(ctx);
    for (const e of this.meteors) e.drawSky(ctx);
    Juice.drawWorld(ctx);
    drawWorldHud(ctx);
    ctx.restore();
    ctx.restore();                          // Ende von Juice.begin
    Cos2.drawWeather(ctx, Cos.cur('weather'), this.realTime, 0, 0, STAGE_W, STAGE_H, this.cam.x, -this.cam.y);          // Cosmetic WEATHER
    if (this.bloodMoon) drawBloodMoonTint(ctx);
    MapFx.drawScreen(ctx);                  // Beleuchtung, Boss-Vignette, Blizzard (js/mapfx.js)
    Cos2.hudBegin(); try { drawHud(ctx); } finally { Cos2.hudEnd(); }              // Cosmetic HUD-Theme
    if (Cos2.intro) Cos2.introDraw(ctx, Cos2.intro, STAGE_W / 2, 96, 1);           // Cosmetic INTRO: Boss-Titelkarte
    if (Cos2.rev) Cos2.reviveDraw(ctx, Cos2.rev, STAGE_W / 2, STAGE_H / 2 - 10, 1);       // Cosmetic REVIVE: Totem of Undying
    if (Save.data.dev) uiText(ctx, 'DEV' + (this.god ? '  GOD' : '') + (this.cheated ? '  (DEV RUN)' : ''), 6, 10, { size: STYLE.type.small, color: STYLE.pal.yellow });
    if (Save.data.mouseAim && this.mode === 'play' && !(Tutorial.active && Tutorial.phase === 'brief') && Input.mouse.x > -900) {      // Fadenkreuz statt Mauszeiger
      const mx = Input.mouse.x, my = Input.mouse.y, P = STYLE.pal;
      ctx.save(); ctx.fillStyle = P.ink; pxFill(ctx, mx - 7, my - 1, 2); pxFill(ctx, mx + 5, my - 1, 2); pxFill(ctx, mx - 1, my - 7, 2); pxFill(ctx, mx - 1, my + 5, 2);
      ctx.fillStyle = P.cyan; pxFill(ctx, mx - 6, my, 1); pxFill(ctx, mx + 5, my, 1); pxFill(ctx, mx, my - 6, 1); pxFill(ctx, mx, my + 5, 1); pxFill(ctx, mx - 3, my, 1); pxFill(ctx, mx + 2, my, 1); pxFill(ctx, mx, my - 3, 1); pxFill(ctx, mx, my + 2, 1);
      ctx.fillStyle = P.ice; pxFill(ctx, mx, my, 1); ctx.restore();
    }
    // Ultimate: der ganze Bildschirm wird weiss, nichts (auch kein HUD, Text oder Effekt) liegt darueber
    let wa = 0;
    for (const a of this.attacks) if (a.kind === 'ult' && a.alive) wa = Math.max(wa, a.whiteAlpha);
    if (wa > 0) { ctx.save(); ctx.globalAlpha = wa; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore(); }
  },
};

// Fenster verlassen (Tab-Wechsel, anderes Programm): automatisch pausieren
window.addEventListener('blur', () => G.pauseGame());
window.addEventListener('beforeunload', () => Save.write());      // Fenster zu: Hintergrund-XP nicht verlieren
document.addEventListener('visibilitychange', () => { if (document.hidden) G.pauseGame(); });

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);   // Deckel, damit nach einem Tab-Wechsel nichts springt
  lastTime = now;
  // Ein Fehler darf das Spiel nicht einfrieren (sonst bleibt der Bildschirm schwarz): melden und weiterlaufen
  try {
    G.update(dt);
    G.draw(ctx);
  } catch (err) {
    console.error(err);
    G.lastError = String(err && err.message || err);
    G.errorT = 5;
  }
  if (G.errorT > 0) {
    G.errorT -= dt;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    uiText(ctx, 'ERROR: ' + G.lastError + ' (console: F12)', 6, 14, { size: STYLE.type.small, color: STYLE.pal.red });
  }
  if (Sfx.locked && Math.floor(G.realTime * 1.6) % 2 === 0) {                    // Ton noch gesperrt (iPad/Safari): Hinweis, der Tipp auf den Bildschirm schaltet ihn frei
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    uiText(ctx, 'SOUND IS LOCKED - TAP THE SCREEN', STAGE_W / 2, 14, { size: STYLE.type.small, color: STYLE.pal.yellow, align: 'center' });
  }
  Input.endFrame();
  requestAnimationFrame(loop);
}

// Nachrichten an die Host-Seite (holiday-games.com), wenn das Spiel eingebettet ist
const hostMsg = (msg) => { try { if (window.parent !== window) window.parent.postMessage(msg, '*'); } catch (e) { /* egal */ } };

loadAssets(() => { G.mode = 'start'; hostMsg({ type: 'ready' }); });
requestAnimationFrame(loop);
