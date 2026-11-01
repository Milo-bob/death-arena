// Bindung der Spieler: Ascension (Schwierigkeitsstufen nach dem Sieg), tägliche/wöchentliche Challenge, Ziel-Hinweis am Todesbildschirm
// und die ersten drei Läufe (Anfänger-Hilfe, Ziele, Hinweise). Zahlen in CFG.asc / CFG.chal / CFG.onb (config.js [14]).
// Alles gilt nur für den normalen Einzelspieler-Lauf (nicht Tutorial, Koop, PvP). Eingriffspunkte:
//   Ret.setup(...)   in G.begin: wählt die Schwierigkeit des Laufs (G.diff wird eine Kopie mit den Faktoren), G.healMul, G.asc, G.chal, G.rookie
//   Ret.settle(g)    in G.settleRun: zahlt Challenge-/Ziel-Belohnungen und schaltet nach einem Sieg die nächste Ascension-Stufe frei (liefert die Zusatz-Credits)
//   Ret.tick(dt)     in G.updatePlay: Hinweise, Ziele und Challenge-Ziel beobachten
//   Ret.drawHud(ctx) kleine Zielanzeige oben, Ret.lines() Zeilen für Todes-/Sieg-Bildschirm, Goal.line() der Satz "als Nächstes ..." am Todesbildschirm

// Text je nach Sprache (dynamisch zusammengesetzte Saetze mit Namen/Zeiten lassen sich nicht als Woerterbuch-Eintrag abbilden)
const L = (en, de) => (typeof I18n !== 'undefined' && I18n.lang === 'de' ? de : en);
const Ret0 = { hits: 1, spawn: 1, heal: 1, bossHp: 1, damage: 1, bossFire: 1, speed: 1, bossSpeed: 1, credits: 0 };
function retMerge(a, b) {
  const o = Object.assign({}, a);
  for (const k of ['hits', 'spawn', 'heal', 'bossHp', 'damage', 'bossFire', 'speed', 'bossSpeed']) if (b[k]) o[k] *= b[k];
  o.credits += b.credits || 0;
  return o;
}
// Faktoren in eine Kopie der Karten-Schwierigkeit einrechnen (die Karte selbst bleibt unverändert). spawn = Gegneranzahl (Abstände werden entsprechend kürzer)
function retApply(diff, m) {
  const d = Object.assign({}, diff);
  d.hits = (d.hits || 1) * m.hits; d.rate = (d.rate || 1) / m.spawn; d.allRate = (d.allRate || 1) / m.spawn; d.capMul = (d.capMul || 1) * m.spawn;
  d.damage = (d.damage || 1) * m.damage; d.speed = (d.speed || 1) * m.speed; d.cores = (d.cores || 1) * (1 + m.credits);
  d.boss = Object.assign({}, d.boss, { hp: (diff.boss.hp || 1) * m.bossHp, fire: (diff.boss.fire || 1) / m.bossFire, speed: (diff.boss.speed || 1) * m.bossSpeed });
  return d;
}

// ---------------------------------------------------------------- Ascension
const Asc = {
  data() { return Save.data.asc || (Save.data.asc = { max: 0, sel: 0, cleared: {} }); },
  max() { return clamp(this.data().max | 0, 0, CFG.asc.max); },
  sel() { return clamp(this.data().sel | 0, 0, this.max()); },
  set(n) { this.data().sel = clamp(n, 0, this.max()); Save.write(); },
  // Summe der Stufen 1..lv
  mods(lv) {
    let m = Object.assign({}, Ret0);
    for (let i = 1; i <= lv; i++) m = retMerge(m, CFG.asc.levels[i]);
    m.credits = lv * CFG.asc.credits;
    return m;
  },
  // Sieg auf Stufe lv: naechste Stufe frei, einmalig Credits pro neu gemeisterter Stufe. Gibt { lv, unlocked, bonus } zurueck.
  onWin(lv) {
    const D = this.data(), res = { lv, unlocked: 0, bonus: 0 };
    if (lv < CFG.asc.max && lv + 1 > this.max()) { D.max = lv + 1; res.unlocked = lv + 1; }
    if (lv >= 1 && !(D.cleared || (D.cleared = {}))[lv]) { D.cleared[lv] = true; res.bonus = CFG.asc.firstClear * lv; }
    return res;
  },
};

// ---------------------------------------------------------------- Challenge (taeglich / woechentlich)
const Chal = {
  data() { return Save.data.chal || (Save.data.chal = { sel: 'off', done: {}, streak: 0, streakDay: '' }); },
  day() { return Daily.today(); },
  // Kalenderwoche (Montag-Sonntag) nach der deutschen Tagesangabe: Schluessel "JJJJ-Wnn"
  week() {
    const [y, m, d] = this.day().split('-').map(Number), t = Date.UTC(y, m - 1, d), wd = (new Date(t).getUTCDay() + 6) % 7, mon = new Date(t - wd * 86400000);
    const th = new Date(mon.getTime() + 3 * 86400000), y0 = Date.UTC(th.getUTCFullYear(), 0, 4), w = 1 + Math.round(((th.getTime() - y0) / 86400000 - 3 + ((new Date(y0).getUTCDay() + 6) % 7)) / 7);
    return th.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
  },
  // gleiche Auswahl fuer alle Spieler am selben Tag: Zufall aus dem Datum
  pick(key, n) {
    let h = 2166136261; for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const pool = CFG.chal.mods.slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  },
  def(kind) {
    const C = CFG.chal;
    if (kind === 'weekly') { const id = this.week(); return { kind, id, mods: this.pick('w' + id, 3), goal: { type: 'bosses', v: C.weeklyBosses, text: L('DEFEAT ' + C.weeklyBosses + ' BOSSES', 'BESIEGE ' + C.weeklyBosses + ' BOSSE') }, label: 'WEEKLY' }; }
    const id = this.day();
    return { kind: 'daily', id, mods: this.pick('d' + id, 2), goal: { type: 'time', v: C.dailyTime, text: L('REACH ', 'ERREICHE ') + formatTime(C.dailyTime) }, label: 'DAILY' };
  },
  sel() { const s = this.data().sel; return s === 'daily' || s === 'weekly' ? s : 'off'; },
  cycle(dir = 1) { const o = ['off', 'daily', 'weekly'], D = this.data(); D.sel = o[(o.indexOf(this.sel()) + dir + 3) % 3]; Save.write(); },
  unlocked() { return (Save.data.runs | 0) >= CFG.onb.runs || Save.data.wins > 0; },
  doneNow(def) { return !!this.data().done[def.id]; },
  mods(def) { let m = Object.assign({}, Ret0); for (const x of def.mods) m = retMerge(m, x); return m; },
  reached(c, time, bosses) { return c.goal.type === 'time' ? time >= c.goal.v : bosses >= c.goal.v; },
  progressText(c, time, bosses) { return c.goal.type === 'time' ? formatTime(Math.min(time, c.goal.v)) + ' / ' + formatTime(c.goal.v) : Math.min(bosses, c.goal.v) + ' / ' + c.goal.v + L(' BOSSES', ' BOSSE'); },
  prevDay(day) { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); },
};

// ---------------------------------------------------------------- erste Laeufe
const Onb = {
  n() { return Save.data.runs | 0; },
  active() { return this.n() < CFG.onb.runs && !(Save.data.wins > 0); },
  assist(n) { const O = CFG.onb; return Object.assign({}, Ret0, { damage: O.damage[n], hits: O.hits[n], spawn: O.spawn[n] }); },
  goal(run) { return CFG.onb.goals[clamp(run, 0, CFG.onb.goals.length - 1)]; },
  seen() { const D = Save.data.onb || (Save.data.onb = { seen: {} }); return D.seen || (D.seen = {}); },
  // Hinweise, jeder hoechstens einmal pro Spielstand
  hint(id, text, color) { const s = this.seen(); if (s[id]) return; s[id] = true; Save.write(); G.notice(text, color || STYLE.pal.cyan, STYLE.type.body); },
};

// Comeback-Bonus: nach längerer Pause (CFG.comeback.days) bekommen die nächsten Läufe Hilfe. Zeitpunkt des letzten Laufbeginns steht im Spielstand (lastRun).
const Comeback = {
  arm() {
    const D = Save.data, now = Date.now(), last = Number(D.lastRun) || 0, C = CFG.comeback;
    if (last && D.tutorialDone && now - last >= C.days * 86400000) D.cbRuns = C.runs;
    D.lastRun = now; Save.write();
  },
  active() { return (Save.data.cbRuns | 0) > 0; },
  take() { Save.data.cbRuns = Math.max(0, (Save.data.cbRuns | 0) - 1); Save.write(); },
};

const Ret = {
  setup(withTutorial, kind) {
    Ghost.start(false); G.eventReward = null;
    G.asc = 0; G.chal = null; G.healMul = 1; G.rookie = 0; G.comeback = false; G.ascResult = null; G.chalResult = null; G.goalResult = null; G.goal = null; G.hintT = 0;
    if (withTutorial || kind !== null) return;
    let m = null;
    if (Onb.active()) { G.rookie = Onb.n() + 1; m = Onb.assist(Onb.n()); G.goal = Object.assign({ run: Onb.n() }, Onb.goal(Onb.n()), { done: false }); }
    else {
      m = Asc.mods(Asc.sel()); G.asc = Asc.sel();
      const s = Chal.unlocked() ? Chal.sel() : 'off';
      if (s !== 'off') { const def = Chal.def(s); G.chal = Object.assign({}, def, { reached: false }); const cm = Chal.mods(def); m = retMerge(m, cm); m.credits += cm.credits; }
      Comeback.arm();
      if (Comeback.active() && G.asc === 0 && !G.chal) { m = retMerge(m, CFG.comeback.mods); G.comeback = true; Comeback.take(); }
    }
    this.cbShown = false;
    Ghost.start(true);                                                     // normaler Einzellauf: Geist des besten Laufs auf dieser Karte (ghost.js)
    G.diff = retApply(G.map.diff, m); G.healMul = m.heal;
  },

  // pro Bild im Lauf
  tick(dt) {
    if (G.mode !== 'play' || Tutorial.active || G.coop || G.pvp) return;
    Ghost.tick(dt);
    const c = G.chal;
    if (c && !c.reached && Chal.reached(c, G.time, G.bosses)) { c.reached = true; G.notice(c.label + ' CHALLENGE COMPLETE!', STYLE.pal.green, STYLE.type.h1); Sfx.play('levelUp'); }
    const g = G.goal;
    if (G.rookie && g && !g.done) {
      const v = g.type === 'time' ? G.time : G.bosses;
      if (v >= g.v) { g.done = true; G.notice('GOAL REACHED! +' + g.credits + ' CREDITS WHEN THE RUN ENDS', STYLE.pal.green, STYLE.type.h2); Sfx.play('levelUp'); }
    }
    if (G.comeback && G.time > 1.5 && !this.cbShown) { this.cbShown = true; G.notice('WELCOME BACK! LESS DAMAGE, MORE HEALING THIS RUN', STYLE.pal.green, STYLE.type.h2); }
    if (!G.rookie) return;
    const p = G.player, key = (a) => tkeys(a);
    if (G.time > 25) Onb.hint('xp', 'DEFEAT ENEMIES FOR XP - EACH LEVEL UP LETS YOU PICK A PERK', STYLE.pal.cyan);
    if (G.time > 85 && !G.bossFight) Onb.hint('boss', 'A BOSS IS COMING. BEAT IT FOR A NEW ABILITY AND STRONGER WEAPONS', STYLE.pal.yellow);
    if (p.hp < p.maxHp * 0.35) Onb.hint('low', 'LOW HP! KEEP MOVING AND DASH AWAY - ULTIMATE: ' + key('ultimate'), STYLE.pal.red);
    if (G.ultCharge > CFG.ult.readyAt) Onb.hint('ult', 'ULTIMATE READY - PRESS ' + key('ultimate') + ' TO CLEAR THE SCREEN', STYLE.pal.teal);
    if (G.bossFight) Onb.hint('bossfight', 'BOSS FIGHT: DODGE ITS SHOTS AND KEEP HITTING IT', STYLE.pal.orange);
  },

  // Belohnungen beim Laufende (Tod, Aufgeben, Sieg). Gibt die zusaetzlichen Credits zurueck (schon dem Spielstand gutgeschrieben)
  settle(g) {
    let extra = 0;
    const win = g.mode === 'ending', solo = !Tutorial.active && !g.coop && !g.pvp && !g.cheated;
    if (!solo) return 0;
    const D = Chal.data();
    if (g.chal && Chal.reached(g.chal, g.time, g.bosses) && !D.done[g.chal.id]) {
      const C = CFG.chal, res = { kind: g.chal.label, credits: 0, shards: 0, streak: 0 };
      D.done[g.chal.id] = true;
      for (const k of Object.keys(D.done)) if (Object.keys(D.done).length > 24) delete D.done[k];
      if (g.chal.kind === 'daily') {
        D.streak = D.streakDay === Chal.prevDay(g.chal.id) ? (D.streak | 0) + 1 : 1; D.streakDay = g.chal.id;
        res.streak = D.streak; res.credits = C.dailyBase + C.dailyStreak * Math.min(D.streak - 1, C.streakMax);
      } else { res.credits = C.weeklyBase; res.shards = C.weeklyShards; Save.addShards(res.shards); }
      extra += res.credits; g.chalResult = res;
    }
    const goal = g.goal;
    if (g.rookie && goal && goal.done && !Onb.seen()['goal' + goal.run]) {
      Onb.seen()['goal' + goal.run] = true; extra += goal.credits; g.goalResult = { credits: goal.credits, text: goal.text };
    }
    if (win) { const r = Asc.onWin(g.asc | 0); g.ascResult = r; extra += r.bonus; }
    Save.data.souls += extra;
    return extra;
  },

  // Zeilen fuer Todes- und Sieg-Bildschirm: { text, color }
  lines() {
    const P = STYLE.pal, out = [];
    if (G.rookie) out.push({ text: 'ROOKIE ASSIST ACTIVE (RUN ' + G.rookie + '/' + CFG.onb.runs + ')', color: P.green });
    if (G.goal && G.rookie) {
      if (G.goalResult) out.push({ text: 'GOAL REACHED: ' + G.goal.text + '  +' + G.goalResult.credits, color: P.green });
      else if (G.goal.done) out.push({ text: 'GOAL REACHED: ' + G.goal.text, color: P.green });
      else out.push({ text: 'GOAL: ' + G.goal.text + ' (' + (G.goal.type === 'time' ? formatTime(Math.min(G.time, G.goal.v)) + ' / ' + formatTime(G.goal.v) : Math.min(G.bosses, G.goal.v) + ' / ' + G.goal.v) + ')', color: P.yellow });
    }
    if (G.asc) out.push({ text: 'ASCENSION ' + G.asc + ': ' + CFG.asc.levels[G.asc].name, color: P.orange });
    if (G.chal) {
      const r = G.chalResult;
      if (r) out.push({ text: r.kind + ' CHALLENGE COMPLETE  +' + r.credits + (r.shards ? ' +' + r.shards + ' SHARDS' : '') + (r.streak > 1 ? '  (STREAK ' + r.streak + ')' : ''), color: P.green });
      else if (Chal.reached(G.chal, G.time, G.bosses)) out.push({ text: G.chal.label + ' CHALLENGE ALREADY DONE', color: P.grey });
      else out.push({ text: G.chal.label + ' CHALLENGE: ' + Chal.progressText(G.chal, G.time, G.bosses), color: P.yellow });
    }
    const a = G.ascResult;
    if (a && a.unlocked) out.push({ text: 'ASCENSION ' + a.unlocked + ' UNLOCKED!', color: P.yellow });
    if (a && a.bonus) out.push({ text: 'ASCENSION ' + a.lv + ' CLEARED  +' + a.bonus + ' CREDITS', color: P.yellow });
    return out;
  },

  // kleine Anzeige oben Mitte: Ziel der ersten Laeufe bzw. Challenge-Fortschritt
  drawHud(ctx) {
    if (G.mode !== 'play' || Tutorial.active || G.coop || G.pvp) return;
    Ghost.hud(ctx);
    const P = STYLE.pal, T = STYLE.type;
    let text = null, col = P.yellow;
    if (G.rookie && G.goal) { text = G.goal.done ? 'GOAL REACHED!' : 'GOAL: ' + G.goal.text + '  ' + (G.goal.type === 'time' ? formatTime(Math.min(G.time, G.goal.v)) + ' / ' + formatTime(G.goal.v) : Math.min(G.bosses, G.goal.v) + ' / ' + G.goal.v); if (G.goal.done) col = P.green; }
    else if (G.chal) { const done = G.chal.reached; text = G.chal.label + ': ' + (done ? 'COMPLETE!' : G.chal.goal.text + '  ' + Chal.progressText(G.chal, G.time, G.bosses)); col = done ? P.green : P.orange; }
    if (text) uiText(ctx, text, STAGE_W / 2, STAGE_H - 50, { size: T.small, color: col, align: 'center', maxW: 280 });
  },
};

// ---------------------------------------------------------------- "als Naechstes ..." am Todesbildschirm
const Goal = {
  fmt(stat, v) { return stat === 'best' || String(stat).startsWith('mapbest:') ? formatTime(v) : String(Math.ceil(v)); },
  // ein Satz: was ist als Naechstes in Reichweite? Reihenfolge: jetzt kaufbar > fast fertiger Meilenstein > Credits bis zum naechsten Kauf > Challenge/Ascension
  line() {
    const gs = guideStep();
    if (gs) return 'TIP: BUY ' + (gs.kind === 'item' ? CFG.items.catalog[gs.id].name : CFG.meta.upgrades[gs.id].name) + ' UNDER HERO';
    if (UPGRADE_TABS.some((t) => upgradeRows(t.id).some(shopAffordable))) return 'TIP: SPEND YOUR CREDITS UNDER HERO TO GET STRONGER';
    let best = null;
    for (const m of CFG.milestones) {
      if (Save.milestoneDone(m.id)) continue;
      const v = Save.statValue(m.stat), f = v / m.need;
      if (f >= 0.5 && f < 1 && (!best || f > best.f)) best = { f, m, v };
    }
    if (best) return L('ALMOST THERE: ', 'FAST GESCHAFFT: ') + best.m.name + ' - ' + Goal.fmt(best.m.stat, best.m.need - best.v) + (best.m.stat === 'best' || String(best.m.stat).startsWith('mapbest:') ? L(' MORE', ' FEHLEN') : L(' TO GO', ' FEHLEN'));
    let cheap = null;
    for (const id of Object.keys(CFG.meta.upgrades)) {
      const U = CFG.meta.upgrades[id];
      if (Save.level(id) >= U.max) continue;
      const price = Save.cost(id);
      if (price > Save.data.souls && (!cheap || price < cheap.price)) cheap = { id, price, U };
    }
    if (cheap && cheap.price - Save.data.souls <= Math.max(60, cheap.price * 0.5)) return (cheap.price - Save.data.souls) + L(' CREDITS TO GO FOR ', ' CREDITS FEHLEN FÜR ') + cheap.U.name;
    if (Chal.unlocked() && !Chal.doneNow(Chal.def('daily'))) return L('DAILY CHALLENGE IS WAITING: ', 'TAGES-CHALLENGE WARTET: ') + Chal.def('daily').goal.text + L(' FOR BONUS CREDITS', ' FÜR BONUS-CREDITS');
    if (Asc.max() > Asc.sel() || (Save.data.wins > 0 && Asc.max() > 0)) return 'ASCENSION ' + Asc.max() + L(' IS OPEN - HARDER RUNS PAY MORE CREDITS', ' IST OFFEN - HÄRTERE LÄUFE BRINGEN MEHR CREDITS');
    return 'EVERY RUN EARNS CREDITS AND XP. KEEP GOING!';
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'DEFEAT ENEMIES FOR XP - EACH LEVEL UP LETS YOU PICK A PERK': 'BESIEGE GEGNER FÜR XP - JEDES LEVEL-UP LÄSST DICH EINEN PERK WÄHLEN',
  'A BOSS IS COMING. BEAT IT FOR A NEW ABILITY AND STRONGER WEAPONS': 'EIN BOSS KOMMT. BESIEGE IHN FÜR EINE NEUE ABILITY UND STÄRKERE WAFFEN',
  'BOSS FIGHT: DODGE ITS SHOTS AND KEEP HITTING IT': 'BOSSKAMPF: WEICH SEINEN SCHÜSSEN AUS UND TRIFF IHN WEITER',
  'REACH THE FIRST BOSS': 'ERREICHE DEN ERSTEN BOSS', 'DEFEAT THE FIRST BOSS': 'BESIEGE DEN ERSTEN BOSS', 'SURVIVE 5 MINUTES': 'ÜBERLEBE 5 MINUTEN',
});
if (typeof I18n !== 'undefined' && I18n.phrases) I18n.phrases([
  ['LOW HP! KEEP MOVING AND DASH AWAY - ULTIMATE: ', 'WENIG LEBEN! BEWEG DICH UND WEICH AUS - ULTIMATE: '], ['ULTIMATE READY - PRESS ', 'ULTIMATE BEREIT - DRÜCKE '], [' TO CLEAR THE SCREEN', ' UM DEN BILDSCHIRM ZU RÄUMEN'],
  ['GOAL REACHED! +', 'ZIEL ERREICHT! +'], [' CREDITS WHEN THE RUN ENDS', ' CREDITS AM ENDE DES LAUFS'], ['GOAL REACHED: ', 'ZIEL ERREICHT: '], ['GOAL: ', 'ZIEL: '], ['GOAL REACHED!', 'ZIEL ERREICHT!'],
]);
