// Run-Statistik: woran der Spieler gestorben ist, wie viel Schaden von welcher Quelle kam, womit die Gegner fielen.
// Quellen sind einfache Namen (Text). Wer den Spieler verletzt, gibt ihn bei Player.hit(kind, mul, src) mit,
// Geschosse und Explosionen tragen ihn im Feld `src`. Am Laufende speichert Stats.finish() eine Zusammenfassung
// fuer den Todesbildschirm und schreibt einen kurzen Eintrag ins Tod-Protokoll des Spielstands (zum Balancing).

const STAT_ENEMY_NAMES = {
  circle: 'CIRCLE', triangle: 'TRIANGLE', square: 'SQUARE', rhombus: 'RHOMBUS', guard: 'SHIELD GUARD', support: 'SUPPORT',
  bomber: 'BOMBER', splitter: 'SPLITTER', leech: 'BLOODSUCKER', teleporter: 'TELEPORTER', sniper: 'SNIPER', miner: 'MINELAYER',
  tank: 'TANK', necro: 'NECROMANCER', phantom: 'PHANTOM', bastion: 'BASTION', magnetar: 'MAGNETAR',
};
const STAT_BOSS_NAMES = {
  octagon: 'OCTAGON', kite: 'KITE', summoner: 'SUMMONER', turret: 'LASER TURRET', twin: 'TWINS', arena: 'ARENA BOSS', reaper: 'DEATH',
  forge: 'FORGE WARDEN', colossus: 'SLAG COLOSSUS', plague: 'PLAGUE DRONE', spore: 'SPORE MOTHER',
  frost: 'FROST SENTINEL', wraith: 'FROST WRAITH',
};
// Angriffsart (takeHit-Quelle) -> Anzeigename. 'grenade' ist die gemeinsame Quelle aller Flaechenschaeden (Granate, Rakete, Meteorit, Druckwelle ...)
const STAT_WEAPON_NAMES = {
  sword: 'PLASMA BLADE', vortex: 'VORTEX BLADES', shot: 'BLASTER', lance: 'PULSE LANCE', impulse: 'SHOCK EMITTER', beam: 'BEAM',
  molotov: 'THERMITE FLASK', chain: 'TESLA CHAIN', blackhole: 'SINGULARITY', rocket: 'ROCKET BLASTER', fire: 'FIRE',
  blades: 'ORBIT BLADES', blade: 'ORBIT BLADES', drone: 'COMBAT DRONE', storm: 'STORM', ally: 'ALLIES', ult: 'ULTIMATE', blood: 'BLOODBURST',
  dash: 'DASH', rift: 'RIFT STEP', lava: 'LAVA VENTS', grenade: 'BLAST DAMAGE', bombard: 'ORBITAL STRIKE', pulse: 'SHOCKWAVE',
};

const Stats = {
  reset() {
    this.dmg = {};          // Schaden pro Quelle (in Leben)
    this.hits = {};         // Anzahl Treffer pro Quelle
    this.kills = {};        // besiegte Gegner pro Waffe
    this.lastSrc = null;    // Quelle des letzten Schadens = Todesursache
    this.taken = 0;         // Gesamtschaden
    this.hitCount = 0;
    this.savedDmg = 0;      // im Safe Spot abgefangener Schaden (geschaetzt)
    this.savedHits = 0;     // im Safe Spot abgefangene Treffer
    this.summary = null;
    this.fight = null;      // laufender Bosskampf fuer das Protokoll (siehe bossStart/bossEnd)
  },

  enemyName(e) {
    if (!e) return 'ENEMY';
    const base = e.V && e.V.name ? e.V.name : STAT_ENEMY_NAMES[e.type] || String(e.type).toUpperCase();
    return e.mini ? 'MINIBOSS ' + base : base;
  },
  bossName(b) { return b && b.cfg && b.cfg.name ? b.cfg.name : STAT_BOSS_NAMES[b && b.type] || 'BOSS'; },
  weaponName(kind) { return kind ? STAT_WEAPON_NAMES[kind] || String(kind).toUpperCase() : 'OTHER'; },

  // Schaden am Spieler. counted = false: Dauerschaden (zaehlt nicht als eigener Treffer)
  dealt(src, amount, counted = true) {
    if (!this.dmg || !(amount > 0)) return;
    src = src || 'UNKNOWN';
    this.dmg[src] = (this.dmg[src] || 0) + amount;
    this.taken += amount;
    if (counted) { this.hits[src] = (this.hits[src] || 0) + 1; this.hitCount++; }
    this.lastSrc = src;
  },
  // Treffer, den der Safe Spot abgefangen hat (kein Schaden am Spieler)
  saved(src, amount) {
    if (!this.dmg) return;
    this.savedDmg += amount > 0 ? amount : 0; this.savedHits++;
  },
  kill(kind) {
    if (!this.kills) return;
    const n = this.weaponName(kind);
    this.kills[n] = (this.kills[n] || 0) + 1;
  },

  sorted(obj) { return Object.keys(obj || {}).map((k) => [k, obj[k]]).sort((a, b) => b[1] - a[1]); },

  // ---------- Protokoll (Save.data.deathLog / bossLog): Grundlage fuers Balancing, siehe statsscreen.js ----------
  // Kompakte Eintraege ohne persoenliche Daten. Tod: { i id, t Zeit, b Bosse, by Killer, map, inf, fy Boss im Kampf, k Kills, dm Schaden, h Treffer, win, w Waffen, ab Abilities }
  // Boss: { i, ty Typ, at Startzeit, d Dauer, r 'win'|'died'|'timeout', dm Schaden im Kampf, n Kampfnummer, map, inf, w, ab }
  // Nicht protokolliert: Tutorial. Laeufe mit Dev-Cheats (G.cheated) werden mit dv: true markiert (Dev-Lauf) und lassen sich in der Statistik ausblenden (Taste X), standardmaessig sind sie sichtbar.
  CAP: { deaths: 300, bosses: 600, impDeaths: 2000, impBosses: 4000 },
  newId() { return Math.random().toString(36).slice(2, 10); },
  logging() { return !Tutorial.active; },
  devRun() { return !!G.cheated; },
  push(list, entry, cap) { list.push(entry); if (list.length > cap) list.splice(0, list.length - cap); },
  loadout() {
    const s = (G.player && G.player.slots) || {};
    return { w: ['melee', 'ranged', 'heavy', 'artifact'].map((x) => Save.equipped(x) || null), ab: [s.weak || null, s.medium || null, s.strong || null] };
  },

  bossStart(type) {
    this.fight = this.logging() ? { ty: type, at: Math.round(G.time), dmg0: this.taken } : null;
  },
  bossEnd(result) {
    const f = this.fight; this.fight = null;
    if (!f || !this.logging()) return;
    this.push(Save.data.bossLog, Object.assign({ i: this.newId(), ty: f.ty, at: f.at, d: Math.round(G.bossTimer * 10) / 10, r: result, dm: Math.round(this.taken - f.dmg0), n: G.bossCount, map: G.map.id, inf: !!G.infinite }, this.devRun() ? { dv: true } : {}, this.loadout()), this.CAP.bosses);
  },

  // Lauf zu Ende (Tod, Aufgeben oder Sieg). Gibt die Zusammenfassung zurueck und merkt sie fuer den Todesbildschirm.
  finish(time, bosses, mapId, infinite, win = false) {
    const killer = win ? 'VICTORY' : this.lastSrc || 'UNKNOWN';
    this.summary = { killer, level: Xp.level, taken: this.taken, hitCount: this.hitCount, savedDmg: this.savedDmg, savedHits: this.savedHits, dmg: this.sorted(this.dmg), hits: this.hits, kills: this.sorted(this.kills) };
    const fy = this.fight ? this.fight.ty : null;
    this.bossEnd(win ? 'win' : 'died');
    if (this.logging()) {
      const e = { i: this.newId(), t: Math.round(time), b: bosses, by: killer, map: mapId, inf: !!infinite, k: G.kills, dm: Math.round(this.taken), h: this.hitCount, lv: Xp.level, win: !!win };
      if (fy) e.fy = fy;
      if (this.devRun()) e.dv = true;
      this.push(Save.data.deathLog, Object.assign(e, this.loadout()), this.CAP.deaths);
    }
    return this.summary;
  },

  // ---------- Auswertung ----------
  filterList() { return [{ id: 'all', label: 'ALL MAPS' }].concat(CFG.maps.map((m) => ({ id: m.id, label: m.name || m.id }))).concat([{ id: 'inf', label: 'ENDLESS' }]); },
  // Eintraege (eigene + importierte) passend zum Filter: 'all' = Standardmodus aller Karten, Karten-ID = diese Karte, 'inf' = Endlos
  // Protokolle aus ALLEN Slots dieses Geraets (auch aelteren, die das Protokoll noch im Slot-Spielstand selbst trugen, und Slots, in die importiert wurde),
  // ohne Duplikate (Eintrags-ID). Das aktive Slot-Objekt zaehlt aus dem Speicher, nicht von der Platte.
  slotLogs(kind, imported = false) {
    const key = kind === 'deaths' ? 'deathLog' : 'bossLog', out = [], seen = new Set();
    const add = (list) => { if (Array.isArray(list)) for (const e of list) if (e && !seen.has(e.i)) { seen.add(e.i); out.push(e); } };
    if (imported) add(Save.data.imported && Save.data.imported[kind]); else add(Save.data[key]);
    try {
      for (let i = 0; i < Save.SLOTS; i++) {
        const raw = localStorage.getItem(Save.keyFor(i)); if (!raw) continue;
        const d = JSON.parse(raw); if (imported) add(d.imported && d.imported[kind]); else add(d[key]);
      }
      const dev = localStorage.getItem(Save.DEVICE_KEY);
      if (dev) { const d = JSON.parse(dev); add(d[key]); if (d.imported) add(d.imported[kind]); }
    } catch (e) { /* unlesbaren Slot ueberspringen */ }
    return out;
  },
  pick(kind, filter, ownOnly, showDev = true) {
    const D = Save.data, own = this.slotLogs(kind), ownIds = new Set(own.map((e) => e.i)), imp = ownOnly ? [] : this.slotLogs(kind, true).filter((e) => !ownIds.has(e.i));
    return own.concat(imp).filter((e) => (showDev || !e.dv) && (filter === 'inf' ? e.inf : filter === 'all' ? !e.inf : !e.inf && e.map === filter));
  },
  pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0; },
  avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; },

  // Laeufe auswerten. Aufgegebene Laeufe zaehlen nicht als Tod (nur als Hinweis), Siege zaehlen als "ueberlebt".
  analyze(all) {
    const runs = all.filter((r) => r.by !== 'GAVE UP'), n = runs.length, gaveUp = all.length - n;
    const times = runs.map((r) => r.t).sort((a, b) => a - b);
    const killers = {};
    for (const r of runs) if (!r.win) (killers[r.by] = killers[r.by] || []).push(r.t);
    const killList = Object.keys(killers).map((k) => { const t = killers[k].slice().sort((a, b) => a - b); return { name: k, n: t.length, med: this.pct(t, 0.5) }; }).sort((a, b) => b.n - a.n);
    // Gefahr je Fenster (CFG.boss.steps Sekunden): Anteil der Laeufe, die das Fenster erreicht haben und darin gestorben sind
    const step = CFG.boss.steps, maxT = times.length ? times[times.length - 1] : 0, windows = [];
    for (let lo = 0; lo <= maxT; lo += step) {
      const risk = runs.filter((r) => r.win || r.t >= lo).length, dead = runs.filter((r) => !r.win && r.t >= lo && r.t < lo + step).length;
      windows.push({ lo, risk, dead, hazard: risk ? dead / risk : 0 });
    }
    return {
      n, gaveUp, wins: runs.filter((r) => r.win).length, times, killers: killList, windows, runs,
      median: this.pct(times, 0.5), p25: this.pct(times, 0.25), p75: this.pct(times, 0.75), avg: this.avg(times), best: times.length ? times[times.length - 1] : 0,
      bossAvg: this.avg(runs.map((r) => r.b)),
      lvAvg: this.avg(runs.filter((r) => typeof r.lv === 'number').map((r) => r.lv)),       // mittleres Level (XP im Lauf), 0 = keine Daten
      alive(t) { return n ? runs.filter((r) => r.win || r.t > t).length / n : 0; },
    };
  },
  // Bosskaempfe je Boss-Typ: Anzahl, Siegquote, Tode, Zeitlimit, mittlere Dauer/Schaden/Startzeit (nach Startzeit sortiert)
  analyzeBosses(list) {
    const by = {};
    for (const b of list) (by[b.ty] = by[b.ty] || []).push(b);
    return Object.keys(by).map((ty) => {
      const a = by[ty], c = (r) => a.filter((b) => b.r === r).length;
      return { ty, n: a.length, win: c('win'), died: c('died'), timeout: c('timeout'), rate: c('win') / a.length, dur: this.avg(a.map((b) => b.d)), dm: this.avg(a.map((b) => b.dm)), at: this.avg(a.map((b) => b.at)) };
    }).sort((x, y) => x.at - y.at);
  },
  // Ausruestung: je Item die Zahl der Laeufe und die mittlere Ueberlebenszeit (nur Laeufe mit Ausruestungsdaten); id = 'w:<Item>' oder 'a:<Ability>'
  analyzeBuilds(runs) {
    const items = {};
    for (const r of runs) {
      if (!r.w) continue;
      const ids = new Set(); (r.w || []).forEach((x) => x && ids.add('w:' + x)); (r.ab || []).forEach((x) => x && ids.add('a:' + x));
      for (const id of ids) (items[id] = items[id] || []).push(r.t);
    }
    return Object.keys(items).map((id) => { const t = items[id].slice().sort((a, b) => a - b); return { id, n: t.length, med: this.pct(t, 0.5), avg: this.avg(t) }; });
  },

  // ---------- Spieldaten teilen (anonym): das eigene Protokoll als Code; Importieren fuehrt es mit dem eigenen zusammen ----------
  exportData() {
    const D = Save.data, b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, deaths: D.deathLog || [], bosses: D.bossLog || [] }))));
    return 'DAD1:' + b64 + ':' + Save.checksum(b64);
  },
  mergeData(text) {
    try {
      const m = /DAD1:([A-Za-z0-9+/=]+):([0-9a-z]+)/.exec(String(text).replace(/\s+/g, ''));
      if (!m) return { ok: false, error: 'NOT A PLAY DATA CODE' };
      if (Save.checksum(m[1]) !== m[2]) return { ok: false, error: 'CODE IS DAMAGED OR INCOMPLETE' };
      const src = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      const D = Save.data, imp = D.imported && D.imported.deaths ? D.imported : (D.imported = { deaths: [], bosses: [] });
      const seen = new Set(); for (const e of (D.deathLog || []).concat(D.bossLog || [], imp.deaths, imp.bosses)) seen.add(e.i);
      const num = (x) => typeof x === 'number' && isFinite(x), str = (x) => typeof x === 'string' && x.length < 40;
      const ids = (a, n) => Array.isArray(a) && a.length <= n && a.every((x) => x === null || str(x));
      let nd = 0, nb = 0;
      for (const e of Array.isArray(src.deaths) ? src.deaths : []) {
        if (!e || !str(e.i) || seen.has(e.i) || !num(e.t) || !str(e.by) || !str(e.map)) continue;
        seen.add(e.i); nd++;
        this.push(imp.deaths, { i: e.i, t: e.t, b: num(e.b) ? e.b : 0, by: e.by, map: e.map, inf: !!e.inf, fy: str(e.fy) ? e.fy : undefined, k: num(e.k) ? e.k : 0, dm: num(e.dm) ? e.dm : 0, h: num(e.h) ? e.h : 0, lv: num(e.lv) ? e.lv : undefined, win: !!e.win, dv: e.dv ? true : undefined, w: ids(e.w, 4) ? e.w : undefined, ab: ids(e.ab, 3) ? e.ab : undefined }, this.CAP.impDeaths);
      }
      for (const e of Array.isArray(src.bosses) ? src.bosses : []) {
        if (!e || !str(e.i) || seen.has(e.i) || !str(e.ty) || !num(e.d) || !num(e.at) || !['win', 'died', 'timeout'].includes(e.r)) continue;
        seen.add(e.i); nb++;
        this.push(imp.bosses, { i: e.i, ty: e.ty, at: e.at, d: e.d, r: e.r, dm: num(e.dm) ? e.dm : 0, n: num(e.n) ? e.n : 0, map: str(e.map) ? e.map : '', inf: !!e.inf, dv: e.dv ? true : undefined, w: ids(e.w, 4) ? e.w : undefined, ab: ids(e.ab, 3) ? e.ab : undefined }, this.CAP.impBosses);
      }
      Save.write();
      return { ok: true, deaths: nd, bosses: nb };
    } catch (e) { return { ok: false, error: 'CODE COULD NOT BE READ' }; }
  },
};
Stats.reset();
