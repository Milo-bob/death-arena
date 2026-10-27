// Spielstand im Browser (localStorage): Bestzeit, Anzahl Läufe, Lautstärke, Tastenübersicht gesehen.
// Jeder Zugriff in try/catch, falls der Browser Speichern verbietet (dann läuft das Spiel ohne Speicherung weiter).

const RETIRED_BONUS = ['sword', 'shot', 'beam', 'grenade', 'tough', 'soulgain'];

// Mobiles Geraet (Handy/Tablet, auch iPadOS, das sich als Mac meldet): Touch-Steuerung und Angriff-Umschalten sind dort von Anfang an an (nur Standard, die Einstellung bleibt aenderbar)
const IS_MOBILE = (() => {
  try {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches;
    return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  } catch (e) { return false; }
})();

const Save = {
  KEY: 'deatharena.save.v1',
  data: { ach: { done: {}, cnt: {}, seen: 0 }, upgradesSeen: false, settingsSeen: false,best: 0, runs: 0, lang: 'de', musicVol: 0.5, sfxVol: 0.6, mouseAim: false, attackMode: IS_MOBILE ? 'toggle' : 'hold', touch: IS_MOBILE, tutorialDone: false, wins: 0, last: null, mapSel: 0, lastMode: 'regular', mapBest: {}, mapWon: {}, seenKeys: false, souls: 0, upgrades: {}, unlocked: {},
    items: JSON.parse(JSON.stringify(CFG.items.start)),     // Inventar: besessene und ausgeruestete Items
    gear: {},       // Stufe und XP je Item/Ability
    cosmetics: { owned: {}, equipped: {}, color: {} },      // gekaufte Cosmetics ("kategorie:id"), ausgeruestete je Kategorie und gewaehlte Farbe je Kategorie (CFG.cosmetics.colors)
    hero: 'vanguard', heroes: {},               // gewaehlter Held und gekaufte Helden (CFG.heroes)
    stats: { bosses: 0, kills: 0 }, milestones: {}, msPaid: {},
    pxp: 0, pxpSeeded: false,                    // Spielerlevel: gesammelte XP gesamt (CFG.level), pxpSeeded = alter Spielstand wurde einmal umgerechnet
    pvpName: '', pvpLoadout: {}, pvpEquip: {}, pvpHeroSel: null, pvpSet: 'brawler',                 // PvP: Anzeigename des Gasts, gewaehlte Abilities je Gruppe { weak, medium, strong }
    devKey: '',                                  // geheimer Schluessel aus der Dev-Save-Datei: erlaubt Spieler in den Ranglisten zu sperren (Server prueft den Hash)
    dev: false,                                  // Dev-Modus (Cheat-Tasten + Statistik-Bildschirm), wird mit der Dev-Save-Datei freigeschaltet (tools/dev-save.deatharena)
    deathLog: [], bossLog: [],                   // Protokoll fuer das Balancing (siehe runstats.js), gilt fuer alle Slots
    imported: { deaths: [], bosses: [] },        // importierte Spieldaten anderer Spieler
    binds: {} },     // eigene Tastenbelegung (siehe Input.actions)
  // Geraetedaten, die bei Slot-Wechsel, Reset und Import bleiben (kein Teil eines einzelnen Spielstands)
  LOG_KEYS: ['deathLog', 'bossLog', 'imported'],       // nur diese Geraetedaten (anonyme Balancing-Protokolle, gross) wandern NICHT in Codes/Cloud; Einstellungen, Tasten und Dev-Modus schon
  KEEP: ['musicVol', 'sfxVol', 'mouseAim', 'attackMode', 'touch', 'fx', 'binds', 'deathLog', 'bossLog', 'imported'],       // 'dev' gehoert bewusst NICHT dazu: der Dev-Modus gilt nur fuer den Slot, in den die Dev-Datei importiert wurde

  // Abilities: frei, wenn Preis 0 oder gekauft
  isUnlocked(id) { return this.pvpKind() === 'all' || CFG.loadout.abilities[id].unlock === 0 || !!(this.data.unlocked && this.data.unlocked[id]); },
  unlock(id) {
    const price = CFG.loadout.abilities[id].unlock;
    if (this.isUnlocked(id) || this.data.souls < price) return false;
    this.data.souls -= price;
    this.data.unlocked[id] = true;
    this.write();
    return true;
  },

  // Stufe eines Meta-Upgrades und der Gesamtbonus (Stufe * Schritt)
  level(id) {
    const k = this.pvpKind();                                                                  // PvP: ALL = alle Upgrades auf Maximum, SET = keine Upgrades
    if (k === 'all') return CFG.meta.upgrades[id] ? CFG.meta.upgrades[id].max : 0;
    if (k === 'set') return 0;
    return (this.data.upgrades && this.data.upgrades[id]) || 0;
  },
  bonus(id) {
    if (RETIRED_BONUS.includes(id)) return 0;                // frühere Meilenstein-Waffenboni gibt es nicht mehr (Belohnung = Cores/Cosmetics)
    const E = CFG.meta.effects[id];                                                            // Teil eines Buendels: Stufe des Haupt-Stats mal eigener Schritt
    return E ? this.level(E.of) * E.step : this.level(id) * CFG.meta.upgrades[id].step;
  },

  // ---- Meilensteine ----
  statValue(stat) { if (String(stat).startsWith('mapbest:')) return this.data.mapBest[stat.slice(8)] || 0; return stat === 'wins' ? (this.data.wins || 0) : stat === 'tutorial' ? (this.data.tutorialDone ? 1 : 0) : stat === 'best' ? this.data.best : stat === 'runs' ? this.data.runs : (this.data.stats[stat] || 0); },
  milestoneDone(id) { return !!this.data.milestones[id]; },
  // Prueft alle Meilensteine, gibt die neu erreichten zurueck
  checkMilestones() {
    const got = [], paid = this.data.msPaid || (this.data.msPaid = {});
    for (const m of CFG.milestones) {
      if (!this.data.milestones[m.id] && this.statValue(m.stat) >= m.need) { this.data.milestones[m.id] = true; got.push(m); }
      if (this.data.milestones[m.id] && !paid[m.id]) {                     // Belohnung einmalig auszahlen (auch fuer Meilensteine aus alten Spielstaenden)
        paid[m.id] = true;
        if (m.reward.cores) this.data.souls += m.reward.cores;
      }
    }
    return got;
  },

  // ---- Inventar ----
  owns(id) { return !!this.data.items.owned[id]; },
  // ---- PvP-Regeln (Lobby-Einstellung): own = eigene Werte, set = festes Set ohne Upgrades, all = alles auf Maximum und alles frei ----
  // PVP-Staerke (Wertung der offenen Runde), siehe CFG.pvp.rating
  pvpRating() { const r = Number(this.data.pvpRating); return Number.isFinite(r) && r > 0 ? Math.round(r) : CFG.pvp.rating.start; },
  // Ausruestungsbonus auf die PVP-Staerke: Upgrade-Stufen plus Stufen des ausgeruesteten Gears (PvP-Ausruestung bzw. normales Inventar) und der gewaehlten Abilities
  pvpGearBonus() {
    const R = CFG.pvp.rating, d = this.data, ups = Object.values(d.upgrades || {}).reduce((s, v) => s + (v || 0), 0), E = d.pvpEquip || {}, lv = (id) => (id && d.gear && d.gear[id] && d.gear[id].lv) || 0;
    let g = 0;
    for (const S of CFG.items.slots) g += lv(S.id in E ? E[S.id] : d.items.equipped[S.id]);
    for (const id of Object.values(d.pvpLoadout || {})) g += lv(id);
    return Math.min(R.gearCap, Math.round(ups * R.perUpgrade + g * R.perGearLevel));
  },
  pvpStrength() { return this.pvpRating() + this.pvpGearBonus(); },          // fuer Matchmaking und Bots; der Spieler sieht sie nie
  pvpKind() { return typeof G !== 'undefined' && G.pvp ? G.pvp.rule || 'own' : null; },
  pvpRuleNow() { const k = this.pvpKind(); return k || (typeof Pvp !== 'undefined' ? Pvp.ruleKind() : 'own'); },
  pvpSet() { const id = typeof G !== 'undefined' && G.pvp ? G.pvp.setId : (typeof Pvp !== 'undefined' ? Pvp.setNow().id : null); return CFG.pvp.sets.find((s) => s.id === id) || CFG.pvp.sets[0]; },
  // Held im PvP: SET = Vanguard, sonst die in der Lobby gewaehlte (ALL: jeder, OWN: gekaufte), sonst der normale
  pvpHero(kind) { if (kind === 'set') return 'vanguard'; const id = this.data.pvpHeroSel; return CFG.heroes[id] && (kind === 'all' || this.heroOwned(id)) ? id : this.ownHero(); },
  equipped(slot) {
    if (typeof G !== 'undefined' && G.pvp) return this.pvpEquipped(slot);                       // PvP-Kampf: die in der Lobby gewaehlte Ausruestung
    return this.data.items.equipped[slot] || null;
  },
  // PvP-Ausruestung (data.pvpEquip, nur Slots, die in der Lobby geaendert wurden); sonst gilt das normale Inventar. Nur gekaufte Items zaehlen.
  pvpEquipped(slot) {
    const k = this.pvpRuleNow();
    if (k === 'set') return this.pvpSet()[slot] || null;
    const E = this.data.pvpEquip || {};
    if (slot in E) {
      const id = E[slot], C = id && CFG.items.catalog[id];
      if (id === null) return null;
      if (C && C.slot === slot && C.impl && (k === 'all' || this.owns(id))) return id;
    }
    return this.data.items.equipped[slot] || null;
  },
  buyItem(id) {
    const I = CFG.items.catalog[id];
    if (!I.impl || this.owns(id) || this.data.souls < I.cost) return false;
    this.data.souls -= I.cost;
    this.data.items.owned[id] = true;
    if (!this.equipped(I.slot)) this.data.items.equipped[I.slot] = id;
    this.write();
    return true;
  },
  // Ausruesten: Nah- und Fernkampf bleiben immer belegt, starke Waffe und Artefakt lassen sich wieder ablegen
  equipItem(id) {
    const I = CFG.items.catalog[id], e = this.data.items.equipped;
    if (!this.owns(id)) return false;
    if (e[I.slot] === id) { if (I.slot === 'melee' || I.slot === 'ranged') return false; e[I.slot] = null; }
    else e[I.slot] = id;
    this.write();
    return true;
  },
  // ---- Ausruestung leveln (siehe CFG.gear): data.gear[id] = { lv, xp }, xp zaehlt innerhalb der aktuellen Stufe ----
  gearKind(id) {
    const I = CFG.items.catalog[id];
    if (I) return I.slot === 'artifact' ? 'implant' : 'weapon';
    return CFG.loadout.abilities[id].passive ? 'passive' : 'ability';
  },
  gearLv(id) { const k = this.pvpKind(); if (k) return k === 'all' ? this.gearMax() : k === 'set' ? 0 : this.pvpOwnGear(id); return (id && this.data.gear[id] && this.data.gear[id].lv) || 0; },
  gearMax() { return CFG.gear.need.length; },
  gearMul(id) { return !id || !this.gearLv(id) ? 1 : 1 + this.gearLv(id) * CFG.gear.step[this.gearKind(id)]; },                // Faktor auf Staerke/Tempo
  gearFrac(id) { const lv = this.gearLv(id); return lv >= this.gearMax() ? 1 : Math.min(1, ((this.data.gear[id] && this.data.gear[id].xp) || 0) / CFG.gear.need[lv]); },
  // XP im Hintergrund sammeln (wird beim Laufende mit gespeichert); im Tutorial nichts
  gearXp(id, n) {
    if (!id || this.pvpKind() || (typeof Tutorial !== 'undefined' && Tutorial.active)) return;
    const lv = this.gearLv(id);
    if (lv >= this.gearMax()) return;
    const g = this.data.gear[id] || (this.data.gear[id] = { lv, xp: 0 });
    g.xp = Math.min(CFG.gear.need[lv], g.xp + n);
  },
  gearPrice(id) {
    const C = CFG.gear, I = CFG.items.catalog[id], A = CFG.loadout.abilities[id];
    const base = Math.max(I ? I.cost : A.unlock, C.priceBase) * C.priceMul * (this.gearLv(id) + 1);
    return Math.ceil(base * (C.minPriceFrac + (1 - C.minPriceFrac) * (1 - this.gearFrac(id))));
  },
  // Besitzt man es (Item gekauft bzw. Ability freigeschaltet)?
  gearOwned(id) { return CFG.items.catalog[id] ? this.owns(id) : this.isUnlocked(id); },
  gearUp(id) {
    if (!this.gearOwned(id) || this.gearLv(id) >= this.gearMax() || this.data.souls < this.gearPrice(id)) return false;
    this.data.souls -= this.gearPrice(id);
    this.data.gear[id] = { lv: this.gearLv(id) + 1, xp: 0 };
    this.write();
    return true;
  },

  // ---- Cosmetics (siehe CFG.cosmetics und js/cosmetics.js) ----
  cosEquipped(cat) { return (this.data.cosmetics.equipped && this.data.cosmetics.equipped[cat]) || CFG.cosmetics.items[cat][0].id; },
  cosOwned(cat, id) { const it = CFG.cosmetics.items[cat].find((i) => i.id === id); return !!it && ((it.cost === 0 && !it.secret) || !!this.data.cosmetics.owned[cat + ':' + id]); },
  // Farbwahl je Kategorie (kostenlos, siehe CFG.cosmetics.colors): null = die eigenen Farben des Items
  cosColor(cat) { const c = this.data.cosmetics.color && this.data.cosmetics.color[cat], list = CFG.cosmetics.colors[cat]; return c && list && list.some((q) => q.id === c) ? c : null; },
  cosSetColor(cat, id) {
    const list = CFG.cosmetics.colors[cat];
    if (!list || (id && !list.some((q) => q.id === id))) return false;
    const c = this.data.cosmetics, col = c.color || (c.color = {});
    if (id) col[cat] = id; else delete col[cat];
    this.write();
    return true;
  },
  // Kaufen (falls noetig, genug Cores) und ausruesten
  cosEquip(cat, id) {
    const it = CFG.cosmetics.items[cat].find((i) => i.id === id);
    if (!it) return false;
    if (!this.cosOwned(cat, id)) {
      if (it.secret || this.data.souls < it.cost) return false;                                                // Cosmetics gibt es nur fuer Credits
      this.data.souls -= it.cost; this.data.cosmetics.owned[cat + ':' + id] = true;
      if (typeof Ach !== 'undefined') Ach.add('cosBuy', 1, true);
    }
    this.data.cosmetics.equipped[cat] = id;
    this.write();
    return true;
  },

  // ---- Helden (siehe CFG.heroes und js/heroes.js): Meilenstein erreicht + Cores bezahlt = Held gehoert dir ----
  // Abilities fuer die Kaempfe (PvP, Armory): je Gruppe eine gekaufte Ability oder keine (gleiches System wie die Lobby-Ausruestung, Save.data.pvpLoadout)
  abilityChoices(tier) { return [null].concat(Object.keys(CFG.loadout.abilities).filter((id) => CFG.loadout.abilities[id].tier === tier && (CFG.loadout.abilities[id].unlock === 0 || (this.data.unlocked && this.data.unlocked[id])))); },
  abilityLoadout() { const S = this.data.pvpLoadout || {}, out = {}; for (const t of CFG.loadout.tiers) out[t.id] = S[t.id] && this.abilityChoices(t.id).includes(S[t.id]) ? S[t.id] : null; return out; },
  setAbility(tier, id) { this.data.pvpLoadout = Object.assign({}, this.abilityLoadout(), { [tier]: id }); this.write(); },
  heroOwned(id) { return id === 'vanguard' || !!(this.data.heroes && this.data.heroes[id]); },
  heroSelected() { const k = this.pvpKind(); return k ? this.pvpHero(k) : this.ownHero(); },
  ownHero() { const id = this.data.hero; return CFG.heroes[id] && this.heroOwned(id) ? id : 'vanguard'; },
  pvpOwnGear(id) { return (id && this.data.gear[id] && this.data.gear[id].lv) || 0; },
  heroOpen(id) { const H = CFG.heroes[id]; return !H.milestone || this.milestoneDone(H.milestone); },          // Meilenstein geschafft?
  heroSelect(id) { if (!CFG.heroes[id] || !this.heroOwned(id)) return false; this.data.hero = id; this.write(); return true; },
  // Kaufen (Meilenstein + Cores) und gleich auswaehlen
  heroBuy(id) {
    const H = CFG.heroes[id];
    if (!H || this.heroOwned(id) || !this.heroOpen(id) || this.data.souls < H.cost) return false;
    this.data.souls -= H.cost;
    if (!this.data.heroes) this.data.heroes = {};
    this.data.heroes[id] = true;
    this.data.hero = id;
    this.write();
    return true;
  },

  // Alle Kaeufe loeschen und von vorne anfangen (Seelen, Upgrades, Abilities, Items). Bestzeit, Statistik und Meilensteine bleiben.
  // Alles im aktiven Slot zurück auf Anfang (Bestzeiten, Statistik, Meilensteine, Käufe, Karten, Tutorial). Nur Lautstärken, Effekte und Tastenbelegung bleiben.
  resetAll() {
    const lang = this.data.lang, langSet = this.data.langSet;
    const keep = {}; for (const k of this.KEEP) keep[k] = this.data[k];
    this.data = JSON.parse(this.DEFAULTS);
    for (const k of Object.keys(keep)) if (keep[k] !== undefined) this.data[k] = keep[k];
    this.data.lang = lang; this.data.langSet = langSet;                // beim Zuruecksetzen bleibt die Sprache des Slots
    this.write();
  },
  resetPurchases() {
    this.data.souls = 0; this.data.upgrades = {}; this.data.unlocked = {}; this.data.gear = {}; this.data.cosmetics = { owned: {}, equipped: {}, color: {} }; this.data.heroes = {}; this.data.hero = 'vanguard';
    this.data.items = JSON.parse(JSON.stringify(CFG.items.start));
    this.write();
  },
  // Slot leeren (nur starke Waffe und Artefakt)
  unequip(slot) {
    if (slot === 'melee' || slot === 'ranged') return false;
    this.data.items.equipped[slot] = null; this.write();
    return true;
  },
  // Alle gekauften, umgesetzten Items eines Slots
  ownedFor(slot) { return Object.keys(CFG.items.catalog).filter((id) => CFG.items.catalog[id].slot === slot && CFG.items.catalog[id].impl && this.owns(id)); },
  cost(id) { return CFG.meta.upgrades[id].cost * (this.level(id) + 1); },
  // Kaufen, wenn genug Seelen da sind und die Höchststufe nicht erreicht ist
  buy(id) {
    const U = CFG.meta.upgrades[id];
    if (this.level(id) >= U.max || this.data.souls < this.cost(id)) return false;
    this.data.souls -= this.cost(id);
    this.data.upgrades[id] = this.level(id) + 1;
    this.write();
    return true;
  },

  // ---- Spielstände: bis zu 3 Slots (Slot 1 = alter Schlüssel, bestehende Spielstände bleiben erhalten), aktiver Slot in SLOT_KEY ----
  DEVICE_KEY: 'deatharena.device', SLOT_KEY: 'deatharena.slot', SLOTS: 3, slot: 0,
  keyFor(i) { return i === 0 ? this.KEY : this.KEY + '.slot' + (i + 1); },
  load() {
    try {
      const s = parseInt(localStorage.getItem(this.SLOT_KEY), 10);
      this.slot = s >= 0 && s < this.SLOTS ? s : 0;
      const raw = localStorage.getItem(this.keyFor(this.slot));
      if (raw) Object.assign(this.data, JSON.parse(raw));
      // Geraetedaten (Dev-Modus, Tasten, Lautstaerken, Protokolle) liegen getrennt von den Slots und gelten immer
      const dev = localStorage.getItem(this.DEVICE_KEY);
      if (dev) { const d = JSON.parse(dev); for (const k of this.KEEP) if (d[k] !== undefined) this.data[k] = d[k]; }
      this.migrate();
      I18n.set(this.data.lang);
    } catch (e) { /* ohne Speicher weiterspielen */ }
    // Safari/iPad raeumt Speicher sonst eher auf: dauerhaften Speicher anfragen (wird still abgelehnt, wenn nicht moeglich)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignorieren */ }
  },
  // Alte Spielstaende: die Bestzeit aus der Zeit vor den Karten gehoert zu Karte 1
  // Sprache je Slot: ein frischer Slot, der nur wegen des frueheren Standards Englisch hat, bekommt Deutsch (ein Slot mit Fortschritt oder bewusst gewaehltem Englisch bleibt)
  fixLang() { const d = this.data; if (!d.langSet && d.lang === 'en' && !d.tutorialDone && !d.runs) d.lang = 'de'; },
  migrate() {
    const d = this.data;
    this.fixLang();
    if (!d.statsMerged) {                                            // 18 Stats wurden zu 10: ein Buendel bekommt die hoechste Stufe seiner alten Teile (niemand verliert etwas)
      d.statsMerged = true;
      const U = d.upgrades || (d.upgrades = {}), merge = { resist: ['recovery'], regen: ['heal', 'blood'], ult: ['startUlt'], luck: ['buffTime', 'magnet'], souls: ['coreDrop', 'bounty'] };
      for (const to of Object.keys(merge)) for (const old of merge[to]) { U[to] = Math.max(U[to] || 0, U[old] || 0); delete U[old]; }
    }
    if (!d.pxpSeeded) {                                              // Spielerlevel gibt es erst seit kurzem: alte Spielstaende bekommen XP aus ihrer Statistik
      d.pxpSeeded = true;
      const L = CFG.level, s = d.stats || {};
      if (L.seedFromOldSave && d.runs > 0) d.pxp = Math.max(d.pxp || 0, Math.floor((d.best || 0) * L.perSecond * Math.max(1, d.runs / 3) + (s.bosses || 0) * L.perBoss + (s.kills || 0) * L.perKill));
      if (L.seedFromOldSave && d.tutorialDone) d.pxp = (d.pxp || 0) + L.tutorialXp;
    }
    if (!d.mapBest) d.mapBest = {};
    if (!d.mapWon) d.mapWon = {};
    if (!Object.keys(d.mapBest).length && d.best > 0) d.mapBest[CFG.maps[0].id] = d.best;
    // Cosmetics umgezogen: Stempel von HITS nach KILLS, Boden-Spuren von FLOOR nach TRAIL (gekaufte und ausgeruestete Items mitnehmen)
    const c = d.cosmetics;
    if (c && !c.color) c.color = {};
    if (c && c.owned) {
      // Farb-Skins gibt es nicht mehr als Items: ausgeruestete werden zur Farbwahl, gekaufte Funken-Spuren schalten das Item SPARKS frei
      const R = CFG.cosmetics.retired, eq0 = c.equipped || (c.equipped = {}), Mg = CFG.cosmetics.merged;
      // Effekt+Farbe-Items, die es nicht mehr gibt: ausgeruestetes wird zum Basis-Item (oder zum Standard, falls das nicht gekauft ist), gekauftes wird in Credits erstattet
      for (const cat of Object.keys(eq0)) {
        const m = Mg[cat + ':' + eq0[cat]];
        if (m) eq0[cat] = c.owned[cat + ':' + m.to] ? m.to : CFG.cosmetics.items[cat][0].id;
      }
      for (const k of Object.keys(c.owned)) if (Mg[k]) { this.data.souls += Mg[k].cost; delete c.owned[k]; }
      for (const cat of Object.keys(CFG.cosmetics.colors)) {
        const id = eq0[cat];
        if (id && R[cat + ':' + id]) { c.color[cat] = R[cat + ':' + id].color; eq0[cat] = cat === 'trail' ? 'sparks' : CFG.cosmetics.items[cat][0].id; }
      }
      if (Object.keys(c.owned).some((k) => k.startsWith('trail:') && R[k])) c.owned['trail:sparks'] = true;
      for (const k of Object.keys(c.owned)) if (R[k]) delete c.owned[k];
      const MOVED = { 'hit:claws': 'kill:claws', 'hit:skulls': 'kill:skulls', 'hit:stars': 'kill:stars', 'floor:boots': 'trail:boots', 'floor:paws': 'trail:paws', 'floor:flowers': 'trail:flowers', 'floor:ripple': 'trail:ripple' };
      for (const k of Object.keys(MOVED)) if (c.owned[k]) { c.owned[MOVED[k]] = true; delete c.owned[k]; }
      const eq = c.equipped || (c.equipped = {});
      for (const [oldCat, newCat] of [['hit', 'kill'], ['floor', 'trail']]) {
        const id = eq[oldCat];
        if (id && MOVED[oldCat + ':' + id] && (!eq[newCat] || eq[newCat] === CFG.cosmetics.items[newCat][0].id)) eq[newCat] = id;
        if (oldCat === 'floor' || (id && MOVED[oldCat + ':' + id])) delete eq[oldCat];
      }
    }
  },
  write() {
    try { localStorage.setItem(this.keyFor(this.slot), JSON.stringify(this.data)); } catch (e) { /* ignorieren */ }
    try { const d = {}; for (const k of this.KEEP) d[k] = this.data[k]; localStorage.setItem(this.DEVICE_KEY, JSON.stringify(d)); } catch (e) { /* ignorieren */ }
    if (typeof Account !== 'undefined') Account.dirty();       // Cloud-Konto: nach kurzer Ruhe hochladen (account.js)
  },
  // true, wenn mindestens ein Slot (egal welcher aktive) den Dev-Zugang hat; gilt fuer die reservierten Dev-Lobbys
  anyDev() {
    if (this.data.dev === true) return true;
    for (let i = 0; i < this.SLOTS; i++) {
      if (i === this.slot) continue;
      try { const raw = localStorage.getItem(this.keyFor(i)); if (raw && JSON.parse(raw).dev === true) return true; } catch (e) { /* leer */ }
    }
    return false;
  },
  // Zusammenfassung eines Slots fuer die Anzeige (null = leer)
  slotInfo(i) {
    let d = null;
    if (i === this.slot) d = this.data;
    else { try { const raw = localStorage.getItem(this.keyFor(i)); if (raw) d = JSON.parse(raw); } catch (e) { /* leer */ } }
    if (!d || !(d.runs || d.souls || d.tutorialDone || d.best)) return null;
    return { best: d.best || 0, runs: d.runs || 0, souls: d.souls || 0, wins: d.wins || 0 };
  },
  // Slot wechseln: aktuellen sichern, den anderen laden (leer = Startzustand). Lautstaerken, Effekte und Tasten gelten fuer alle Slots.
  switchSlot(i) {
    if (i === this.slot || i < 0 || i >= this.SLOTS) return false;
    this.write();
    const keep = {}; for (const k of this.KEEP) keep[k] = this.data[k];
    this.slot = i;
    this.data = JSON.parse(this.DEFAULTS);
    try { const raw = localStorage.getItem(this.keyFor(i)); if (raw) Object.assign(this.data, JSON.parse(raw)); } catch (e) { /* leer */ }
    for (const k of Object.keys(keep)) if (keep[k] !== undefined) this.data[k] = keep[k];
    this.fixLang(); try { I18n.set(this.data.lang); } catch (e) { /* egal */ }                // die Sprache gehoert zum Slot (neuer Slot: Deutsch)
    try { localStorage.setItem(this.SLOT_KEY, String(i)); } catch (e) { /* ignorieren */ }
    this.write();
    return true;
  },
  // ---- Übertragen: aktiver Slot als Code ("DA1:<base64>:<Prüfsumme>") oder Datei ----
  exportCode() {
    this.write();
    const out = Object.assign({}, this.data);
    for (const k of this.LOG_KEYS) delete out[k];        // alles andere (auch Einstellungen, Tasten, Dev-Modus) ist im Code; nur die grossen Protokolle nicht, sonst wird er riesig
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
    return 'DA1:' + b64 + ':' + this.checksum(b64);
  },
  // Zwei Achievement-Staende vereinigen: done = Vereinigung, cnt = Hoechstwert (Zahlen) bzw. Vereinigung (Mengen wie types/bossTypes), seen = kleinerer Wert
  mergeAch(a, b) {
    const out = { done: {}, cnt: {}, seen: 0 };
    const A = a && typeof a === 'object' ? a : {}, B = b && typeof b === 'object' ? b : {};
    for (const s of [A, B]) for (const k of Object.keys(s.done || {})) if (s.done[k]) out.done[k] = true;
    const merge = (x, y) => {
      if (typeof x === 'number' && typeof y === 'number') return Math.max(x, y);
      if (x && y && typeof x === 'object' && typeof y === 'object') { const o = Object.assign({}, x); for (const k of Object.keys(y)) o[k] = k in o ? merge(o[k], y[k]) : y[k]; return o; }
      return x !== undefined && x !== null ? x : y;
    };
    const ca = A.cnt || {}, cb = B.cnt || {};
    for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) if (k !== '__proto__') out.cnt[k] = merge(ca[k], cb[k]);
    out.seen = Math.min(A.seen || 0, B.seen || 0);
    return out;
  },
  // Einstellungen, die nicht jedes Bild neu gelesen werden (Lautstaerken), nach einem Import/Sync sofort anwenden
  applySettings() { try { if (typeof I18n !== 'undefined') I18n.set(this.data.lang); if (typeof setMusicVolume === 'function') setMusicVolume(this.data.musicVol); if (typeof Sfx !== 'undefined' && Sfx.setVolume) Sfx.setVolume(this.data.sfxVol); } catch (err) { /* egal */ } },
  checksum(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36); },
  // Code/Dateiinhalt prüfen und in den aktiven Slot übernehmen. Gibt { ok, error } zurück. Lautstärken, Effekte und Tastenbelegung dieses Geräts bleiben.
  importCode(text) {
    try {
      const m = /DA1:([A-Za-z0-9+/=]+):([0-9a-z]+)/i.exec(String(text).replace(/\s+/g, ''));
      if (!m) return { ok: false, error: 'NOT A DEATHARENA SAVE CODE' };
      if (this.checksum(m[1]) !== m[2].toLowerCase()) return { ok: false, error: 'CODE IS DAMAGED OR INCOMPLETE' };
      const src = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (!src || typeof src !== 'object' || Array.isArray(src)) return { ok: false, error: 'SAVE DATA IS INVALID' };
      const next = JSON.parse(this.DEFAULTS);
      for (const k of Object.keys(next)) if (src[k] !== undefined && typeof src[k] === typeof next[k]) next[k] = src[k];       // bekannte Felder mit passendem Typ
      for (const k of Object.keys(src)) {                                // Felder, die erst im Lauf entstehen und nicht in DEFAULTS stehen (z. B. devUnlockAll), gingen frueher verloren
        if (k in next || this.LOG_KEYS.includes(k) || k === 'dev' || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (src[k] !== null && ['string', 'number', 'boolean', 'object'].includes(typeof src[k])) next[k] = src[k];
      }
      // Achievements gehen nie verloren: Fortschritt dieses Geraets und des Codes werden zusammengefuehrt (erreichte Achievements vereinigt, Zaehler = Hoechstwert),
      // auch wenn man einen aelteren Code ueber einen neueren Stand importiert
      if (!(src.dev === true && this.data.dev !== true) && this.data.ach) next.ach = this.mergeAch(next.ach, this.data.ach);       // nur die Dev-Datei (schaltet Dev neu frei) ersetzt ohne Zusammenfuehren
      for (const k of this.KEEP) if (this.data[k] !== undefined && (this.LOG_KEYS.includes(k) || src[k] === undefined || typeof src[k] !== typeof this.data[k])) next[k] = this.data[k];       // Protokolle bleiben lokal, Einstellungen kommen aus dem Code (fehlen sie dort, bleiben die lokalen)
      next.devKey = (typeof src.devKey === 'string' && src.devKey) || (typeof this.data.devKey === 'string' && this.data.devKey) || '';
      next.dev = src.dev === true || this.data.dev === true;           // die Dev-Save-Datei schaltet den Dev-Modus fuer diesen Slot frei (bleibt dort auch nach einem normalen Import)
      this.data = next;
      this.migrate();
      this.applySettings();
      if (typeof Ach !== 'undefined') Ach.scan(true);                  // abgeleitete Achievements sofort neu pruefen, Belohnungs-Cosmetics nachtragen
      this.write();
      return { ok: true };
    } catch (e) { return { ok: false, error: 'CODE COULD NOT BE READ' }; }
  },

  // ---- Spielerlevel (CFG.level) ----
  levelNeed(lv) { const N = CFG.level.needs; return lv <= N.length ? N[lv - 1] : N[N.length - 1] + CFG.level.step * (lv - N.length); },          // XP von Level lv zu lv+1
  // Level, XP innerhalb des Levels und XP bis zum naechsten
  levelInfo(totalXp) {
    const L = CFG.level; let xp = Math.max(0, Math.floor(totalXp === undefined ? this.data.pxp || 0 : totalXp)), lv = 1;
    while (lv < L.max && xp >= this.levelNeed(lv)) { xp -= this.levelNeed(lv); lv++; }
    return { lv, xp, need: lv >= L.max ? 0 : this.levelNeed(lv) };
  },
  plevel() { return this.levelInfo().lv; },
  // Credits fuer das Erreichen von Level lv (CFG.level.reward)
  levelReward(lv) { const R = CFG.level.reward; return R.base + R.perLevel * lv; },
  // XP eines Laufs gutschreiben, gibt { xp, from, to, reward } zurueck (Level vorher/nachher, Credits fuer die erreichten Level; die Credits sind schon im Spielstand)
  addPlayerXp(n) {
    const from = this.plevel(); this.data.pxp = Math.floor((this.data.pxp || 0) + n);
    const to = this.plevel(); let reward = 0;
    for (let lv = from + 1; lv <= to; lv++) reward += this.levelReward(lv);
    this.data.souls += reward;
    return { xp: n, from, to, reward };
  },

  // Lauf zu Ende: gibt true zurück, wenn es eine neue Bestzeit ist
  // ---- Karten ----
  mapNeed(i) { return CFG.maps[i].unlockFrac ? CFG.maps[i].unlockFrac * CFG.finalBoss.at : 0; },        // Sekunden auf der vorherigen Karte
  mapWon(i) { return !!(this.data.mapWon && this.data.mapWon[CFG.maps[i].id]); },                    // finalen Boss auf dieser Karte besiegt (normaler Modus)
  mapUnlocked(i) { return i === 0 || (this.data.dev && this.data.devUnlockAll) || this.mapWon(i - 1); },
  mapBestTime(i) { return this.data.mapBest[CFG.maps[i].id] || 0; },

  finishRun(time, bosses, kills, mapId = null, coop = false) {
    this.data.runs++;
    if (mapId && !coop && time > (this.data.mapBest[mapId] || 0)) this.data.mapBest[mapId] = time;       // Koop-Laeufe zaehlen nicht fuer Bestzeit und Kartenfreischaltung        // Bestzeit je Karte (schaltet die nächste frei)
    this.data.last = { time, bosses, kills };            // fuer die Anzeige im Hauptmenue
    const isBest = !coop && time > (this.data.best || 0);
    if (isBest) this.data.best = time;
    this.data.stats.bosses += bosses;
    this.data.stats.kills += kills;
    if (mapId && !coop) { const S = this.data.stats; S['mapbosses:' + mapId] = (S['mapbosses:' + mapId] || 0) + bosses; S['mapkills:' + mapId] = (S['mapkills:' + mapId] || 0) + kills; }       // Karten-Meilensteine
    const got = this.checkMilestones();
    this.write();
    return { isBest, got };
  },
};
Save.DEFAULTS = JSON.stringify(Save.data);       // Startzustand für "Reset save file"
Save.load();
