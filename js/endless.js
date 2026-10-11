// Endlos-Modus: Anreiz zum Spielen (Zahlen: CFG.endless in config.js).
// 1) Credit-Multiplikator, der mit der Spielzeit waechst (Endless.ramp), 2) Mutationen, die immer wieder fuer ein paar Minuten die Welt haerter machen und dafuer mehr Credits geben.
// Die Mutationen legen sich ueber die Held-Modifier: Hero.world() / Hero.mods() rufen worldFor() / modsFor() auf (heroes.js), alle Stellen, die Hero.world() lesen, wirken also automatisch.
// Credits werden live gesammelt (Endless.credit, pro Sekunde mal aktuellem Multiplikator), settleRun (game.js) zahlt sie aus.

const Endless = {
  credit: 0, active: [], until: 0, nextAt: 0, last: [], _wk: '', _w: null,

  on() { return !!G.infinite && !G.sr && !G.pvp && !Tutorial.active; },
  reset() { this.credit = 0; this.active = []; this.until = 0; this.nextAt = CFG.endless.first; this.last = []; this._wk = ''; this._w = null; },

  // Multiplikator aus der Zeit allein (Voyager: Wachstum und Obergrenze x infRamp)
  ramp(t) {
    const C = CFG.endless, h = Hero.mods().infRamp;
    return Math.min(C.creditMax * h, C.creditBase + C.creditPerMin * (t / 60) * h);
  },
  // Aufschlag der laufenden Mutationen (addieren sich; Voyager: Aufschlag x infMut)
  bonus() {
    let b = 0;
    for (const id of this.active) b += (CFG.endless.mutations[id].bonus - 1);
    return 1 + b * Hero.mods().infMut;
  },
  mult(t) { return this.ramp(t === undefined ? G.time : t) * this.bonus(); },

  // Wie viele Mutationen gleichzeitig laufen (steigt mit der Zeit)
  stack(t) { return 1 + CFG.endless.stackAt.filter((s) => t >= s).length; },

  tick(dt) {
    if (!this.on() || G.bossFight) return;                         // die Uhr steht im Bosskampf, dann auch Credits und Mutationen
    const C = CFG.endless;
    this.credit += dt * CFG.meta.perSecond * this.mult();
    if (this.active.length && G.time >= this.until) {
      this.active = []; this._wk = ''; this.nextAt = G.time + C.gap;
      G.notice('MUTATION OVER', STYLE.pal.grey, STYLE.type.h2);
    } else if (!this.active.length && G.time >= this.nextAt) this.start();
  },

  start() {
    const C = CFG.endless, ids = Object.keys(C.mutations);
    let pool = ids.filter((id) => !this.last.includes(id));
    const n = Math.min(this.stack(G.time), pool.length), pick = [];
    while (pick.length < n) pick.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
    this.active = pick; this.last = pick.slice(); this.until = G.time + C.lasts; this._wk = '';
    G.notice('MUTATION: ' + pick.map((id) => C.mutations[id].name).join(' + '), STYLE.pal.orange, STYLE.type.h1);
    Sfx.play('event'); Juice.shake && Juice.shake(3, 0.25);
  },

  // Gegnerwelt: Held-Welt (base) mal die Welten der laufenden Mutationen (nur Faktoren, multiplikativ). Gleiches Ergebnis wird zwischengespeichert.
  worldFor(base) {
    if (!this.active.length) return base;
    const key = Hero.id() + '|' + this.active.join() + '|' + (base === HERO_WORLD_NEUTRAL ? 'n' : 'h');
    if (this._wk === key && this._w) return this._w;
    const w = Object.assign({}, base, { types: Object.assign({}, base.types) });
    for (const id of this.active) {
      const m = CFG.endless.mutations[id].world;
      if (!m) continue;
      for (const k of ['rate', 'allRate', 'cap', 'hits', 'speed', 'bossHp']) if (m[k] !== undefined) w[k] *= m[k];
      for (const t of Object.keys(m.types || {})) {
        const cur = Object.assign({}, HERO_TYPE_NEUTRAL, w.types[t]);
        for (const k of ['hits', 'speed', 'wait']) if (m.types[t][k] !== undefined) cur[k] *= m.types[t][k];
        w.types[t] = cur;
      }
    }
    this._wk = key; this._w = w;
    return w;
  },
  // Spieler-Faktoren der Mutationen (Schaden an dich, Drops, XP)
  modsFor(base) {
    if (!this.active.length) return base;
    const m = Object.assign({}, base);
    for (const id of this.active) {
      const mod = CFG.endless.mutations[id].mod;
      if (!mod) continue;
      for (const k of Object.keys(mod)) m[k] = (m[k] === undefined ? 1 : m[k]) * mod[k];
    }
    return m;
  },

  // Anzeige rechts unter der Uhr: Credit-Multiplikator und laufende Mutationen mit Restzeit
  drawHud(ctx) {
    if (!this.on() || G.mode === 'ending') return;
    const P = STYLE.pal, T = STYLE.type, X = STAGE_W - 10, C = CFG.endless;
    let y = 100;
    uiText(ctx, 'CREDITS x' + this.mult().toFixed(2), X, y, { size: T.body, color: P.yellow, align: 'right' });
    y += 13;
    if (this.active.length) {
      const left = Math.max(0, this.until - G.time);
      for (const id of this.active) { uiText(ctx, C.mutations[id].name, X, y, { size: T.small, color: P.orange, align: 'right' }); y += 10; uiText(ctx, C.mutations[id].desc, X, y, { size: T.small, color: P.grey, align: 'right' }); y += 11; }
      uiBar(ctx, X - 80, y - 4, 80, 4, left / C.lasts, P.orange);
    } else {
      uiText(ctx, 'NEXT MUTATION ' + Math.max(0, Math.ceil(this.nextAt - G.time)) + 'S', X, y, { size: T.small, color: P.grey, align: 'right' });
    }
  },
};
Endless.reset();
