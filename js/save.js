// Spielstand im Browser (localStorage): Bestzeit, Anzahl Läufe, Lautstärke, Tastenübersicht gesehen.
// Jeder Zugriff in try/catch, falls der Browser Speichern verbietet (dann läuft das Spiel ohne Speicherung weiter).

const RETIRED_BONUS = ['sword', 'shot', 'beam', 'grenade', 'tough', 'soulgain'];

const Save = {
  KEY: 'deatharena.save.v1',
  data: { best: 0, runs: 0, musicVol: 0.5, sfxVol: 0.6, tutorialDone: false, wins: 0, last: null, bestInf: 0, infSel: CFG.infinite.defaultSel, mapSel: 0, lastMode: 'regular', mapBest: {}, seenKeys: false, souls: 0, upgrades: {}, unlocked: {},
    items: JSON.parse(JSON.stringify(CFG.items.start)),     // Inventar: besessene und ausgeruestete Items
    gear: {},       // Stufe und XP je Item/Ability
    cosmetics: { owned: {}, equipped: {} },      // gekaufte Cosmetics ("kategorie:id") und ausgeruestete je Kategorie
    stats: { bosses: 0, kills: 0 }, milestones: {}, msPaid: {},
    binds: {} },     // eigene Tastenbelegung (siehe Input.actions)

  // Abilities: frei, wenn Preis 0 oder gekauft
  isUnlocked(id) { return CFG.loadout.abilities[id].unlock === 0 || !!(this.data.unlocked && this.data.unlocked[id]); },
  unlock(id) {
    const price = CFG.loadout.abilities[id].unlock;
    if (this.isUnlocked(id) || this.data.souls < price) return false;
    this.data.souls -= price;
    this.data.unlocked[id] = true;
    this.write();
    return true;
  },

  // Stufe eines Meta-Upgrades und der Gesamtbonus (Stufe * Schritt)
  level(id) { return (this.data.upgrades && this.data.upgrades[id]) || 0; },
  bonus(id) {
    if (RETIRED_BONUS.includes(id)) return 0;                  // frühere Meilenstein-Waffenboni gibt es nicht mehr (Belohnung = Cores/Cosmetics)
    return this.level(id) * CFG.meta.upgrades[id].step;
  },

  // ---- Meilensteine ----
  statValue(stat) { return stat === 'tutorial' ? (this.data.tutorialDone ? 1 : 0) : stat === 'best' ? this.data.best : stat === 'bestInf' ? this.data.bestInf || 0 : stat === 'runs' ? this.data.runs : (this.data.stats[stat] || 0); },
  milestoneDone(id) { return !!this.data.milestones[id]; },
  // Prueft alle Meilensteine, gibt die neu erreichten zurueck
  checkMilestones() {
    const got = [], paid = this.data.msPaid || (this.data.msPaid = {});
    for (const m of CFG.milestones) {
      if (!this.data.milestones[m.id] && this.statValue(m.stat) >= m.need) { this.data.milestones[m.id] = true; got.push(m); }
      if (this.data.milestones[m.id] && !paid[m.id]) {                     // Belohnung einmalig auszahlen (auch fuer Meilensteine aus alten Spielstaenden)
        paid[m.id] = true;
        if (m.reward.cores) this.data.souls += m.reward.cores;
        else if (m.reward.cos) { const [cat, id] = m.reward.cos.split(':'); this.data.cosmetics.owned[cat + ':' + id] = true; }
      }
    }
    return got;
  },

  // ---- Inventar ----
  owns(id) { return !!this.data.items.owned[id]; },
  equipped(slot) { return this.data.items.equipped[slot] || null; },
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
  gearLv(id) { return (id && this.data.gear[id] && this.data.gear[id].lv) || 0; },
  gearMax() { return CFG.gear.need.length; },
  gearMul(id) { return !id || !this.gearLv(id) ? 1 : 1 + this.gearLv(id) * CFG.gear.step[this.gearKind(id)]; },                // Faktor auf Staerke/Tempo
  gearFrac(id) { const lv = this.gearLv(id); return lv >= this.gearMax() ? 1 : Math.min(1, ((this.data.gear[id] && this.data.gear[id].xp) || 0) / CFG.gear.need[lv]); },
  // XP im Hintergrund sammeln (wird beim Laufende mit gespeichert); im Tutorial nichts
  gearXp(id, n) {
    if (!id || (typeof Tutorial !== 'undefined' && Tutorial.active)) return;
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
  cosOwned(cat, id) { const it = CFG.cosmetics.items[cat].find((i) => i.id === id); return !!it && (it.cost === 0 || !!this.data.cosmetics.owned[cat + ':' + id]); },
  // Endlos-Cosmetics brauchen eine Mindest-Bestzeit im Endlos-Modus (Item.needInf in Minuten)
  cosLocked(it) { return !!it.needInf && (this.data.bestInf || 0) < it.needInf * 60; },
  // Kaufen (falls noetig, genug Cores) und ausruesten
  cosEquip(cat, id) {
    const it = CFG.cosmetics.items[cat].find((i) => i.id === id);
    if (!it) return false;
    if (!this.cosOwned(cat, id)) {
      if (this.cosLocked(it) || this.data.souls < it.cost) return false;
      this.data.souls -= it.cost; this.data.cosmetics.owned[cat + ':' + id] = true;
    }
    this.data.cosmetics.equipped[cat] = id;
    this.write();
    return true;
  },

  // Alle Kaeufe loeschen und von vorne anfangen (Seelen, Upgrades, Abilities, Items). Bestzeit, Statistik und Meilensteine bleiben.
  // Alles im aktiven Slot zurück auf Anfang (Bestzeiten, Statistik, Meilensteine, Käufe, Karten, Tutorial). Nur Lautstärken, Effekte und Tastenbelegung bleiben.
  resetAll() {
    const keep = { musicVol: this.data.musicVol, sfxVol: this.data.sfxVol, fx: this.data.fx, binds: this.data.binds };
    this.data = JSON.parse(this.DEFAULTS);
    for (const k of Object.keys(keep)) if (keep[k] !== undefined) this.data[k] = keep[k];
    this.write();
  },
  resetPurchases() {
    this.data.souls = 0; this.data.upgrades = {}; this.data.unlocked = {}; this.data.gear = {}; this.data.cosmetics = { owned: {}, equipped: {} };
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
  SLOT_KEY: 'deatharena.slot', SLOTS: 3, slot: 0,
  keyFor(i) { return i === 0 ? this.KEY : this.KEY + '.slot' + (i + 1); },
  load() {
    try {
      const s = parseInt(localStorage.getItem(this.SLOT_KEY), 10);
      this.slot = s >= 0 && s < this.SLOTS ? s : 0;
      const raw = localStorage.getItem(this.keyFor(this.slot));
      if (raw) Object.assign(this.data, JSON.parse(raw));
      this.migrate();
    } catch (e) { /* ohne Speicher weiterspielen */ }
  },
  // Alte Spielstaende: die Bestzeit aus der Zeit vor den Karten gehoert zu Karte 1
  migrate() {
    const d = this.data;
    if (!d.mapBest) d.mapBest = {};
    if (!Object.keys(d.mapBest).length && d.best > 0) d.mapBest[CFG.maps[0].id] = d.best;
  },
  write() {
    try { localStorage.setItem(this.keyFor(this.slot), JSON.stringify(this.data)); } catch (e) { /* ignorieren */ }
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
    const keep = { musicVol: this.data.musicVol, sfxVol: this.data.sfxVol, fx: this.data.fx, binds: this.data.binds };
    this.slot = i;
    this.data = JSON.parse(this.DEFAULTS);
    try { const raw = localStorage.getItem(this.keyFor(i)); if (raw) Object.assign(this.data, JSON.parse(raw)); } catch (e) { /* leer */ }
    for (const k of Object.keys(keep)) if (keep[k] !== undefined) this.data[k] = keep[k];
    try { localStorage.setItem(this.SLOT_KEY, String(i)); } catch (e) { /* ignorieren */ }
    this.write();
    return true;
  },
  // Lauf zu Ende: gibt true zurück, wenn es eine neue Bestzeit ist
  // ---- Karten ----
  mapNeed(i) { return CFG.maps[i].unlockFrac ? CFG.maps[i].unlockFrac * CFG.finalBoss.at : 0; },        // Sekunden auf der vorherigen Karte
  mapUnlocked(i) { return i === 0 || (this.data.mapBest[CFG.maps[i - 1].id] || 0) >= this.mapNeed(i); },
  mapBestTime(i) { return this.data.mapBest[CFG.maps[i].id] || 0; },

  finishRun(time, bosses, kills, infinite = false, mapId = null) {
    this.data.runs++;
    if (!infinite && mapId && time > (this.data.mapBest[mapId] || 0)) this.data.mapBest[mapId] = time;        // Bestzeit je Karte (schaltet die nächste frei)
    this.data.last = { time, bosses, kills, infinite };            // fuer die Anzeige im Hauptmenue
    // Endlos-Modus hat eine eigene Bestzeit (sonst wären die Zeit-Meilensteine dort leichter zu holen)
    const key = infinite ? 'bestInf' : 'best', isBest = time > (this.data[key] || 0);
    if (isBest) this.data[key] = time;
    this.data.stats.bosses += bosses;
    this.data.stats.kills += kills;
    if (infinite) { this.data.stats.infBosses = (this.data.stats.infBosses || 0) + bosses; this.data.stats.infKills = (this.data.stats.infKills || 0) + kills; }       // Endlos-Meilensteine
    const got = this.checkMilestones();
    this.write();
    return { isBest, got };
  },
};
Save.DEFAULTS = JSON.stringify(Save.data);       // Startzustand für "Reset save file"
Save.load();
