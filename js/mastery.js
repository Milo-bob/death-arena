// Heldenmeisterschaft: jeder Held sammelt eigene Punkte aus Läufen mit ihm (Zeit, Bosse, Kills, Sieg) und steigt in Stufen auf (CFG.mastery).
// Belohnung je Stufe: etwas mehr Leben (Hero.mods().hp, nicht im PvP). Punkte stehen im Spielstand (Save.data.mastery[heldenId]).
// Eingriffspunkte: Mastery.add(...) in G.settleRun, Mastery.hp(id) in Hero.mods (heroes.js), Anzeige im Todesbildschirm (ui.js) und in der Armory.

const Mastery = {
  data() { return Save.data.mastery || (Save.data.mastery = {}); },
  points(id) { return Math.floor(this.data()[id] || 0); },
  // Stufe (0 bis levels.length) und Fortschritt zur nächsten
  level(id) {
    const p = this.points(id), L = CFG.mastery.levels;
    let lv = 0; while (lv < L.length && p >= L[lv]) lv++;
    return lv;
  },
  hp(id) { return this.level(id) * CFG.mastery.hpPerLevel; },
  // Punkte eines Laufs gutschreiben; gibt { id, gained, from, to } zurück
  add(id, time, bosses, kills, won) {
    const C = CFG.mastery, from = this.level(id);
    const gained = Math.floor(time * C.perSecond + bosses * C.perBoss + kills * C.perKill + (won ? C.winBonus : 0));
    if (gained <= 0) return null;
    this.data()[id] = this.points(id) + gained;
    return { id, gained, from, to: this.level(id) };
  },
  // Text für Anzeigen: "MASTERY 3 (420/650)" bzw. "MASTERY MAX"
  text(id) {
    const lv = this.level(id), L = CFG.mastery.levels;
    return lv >= L.length ? 'MASTERY MAX' : 'MASTERY ' + lv + ' (' + this.points(id) + '/' + L[lv] + ')';
  },
};
