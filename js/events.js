// Zeitevents (z. B. WINTER FEST zu Weihnachten): laufen in einem festen Zeitraum (deutscher Kalendertag wie die Tagesbelohnung), zeigen im Hauptmenü ein Banner
// mit Fortschritt und lassen leicht Schnee fallen. Wer das Eventziel schafft, bekommt ein exklusives Cosmetic (CFG.seasonEvents[].reward, Item mit `event`-Marke in CFG.cosmetics).
// Es gibt bewusst keine Credits/Shards als Belohnung (der Anticheat zählt Zuwächse ohne Lauf als Verstoß). Fortschritt: Save.data.ev[eventId + Jahr] = { runs, claimed }.
// Eingriffspunkte: Events.runDone(...) in G.settleRun, Events.drawHome(ctx) im Hauptmenü (ui.js drawHomeScreen). Neue Events: nur einen Eintrag in CFG.seasonEvents ergänzen.

const Events = {
  // JJJJ-MM-TT von heute (deutscher Kalendertag)
  today() { return (typeof Daily !== 'undefined' ? Daily.today() : new Date().toISOString().slice(0, 10)); },
  // Läuft ein Event? Zeitraum from/to als [Monat, Tag], darf über den Jahreswechsel gehen. Gibt { def, year } zurück (year = Jahr, in dem das Event begann).
  active(day = this.today()) {
    const [y, m, d] = day.split('-').map(Number), n = m * 100 + d;
    for (const def of CFG.seasonEvents) {
      const a = def.from[0] * 100 + def.from[1], b = def.to[0] * 100 + def.to[1];
      if (a <= b) { if (n >= a && n <= b) return { def, year: y }; }
      else if (n >= a) return { def, year: y };
      else if (n <= b) return { def, year: y - 1 };
    }
    return null;
  },
  state(ev) { const E = Save.data.ev || (Save.data.ev = {}), k = ev.def.id + ev.year; return E[k] || (E[k] = { runs: 0, claimed: false }); },
  reward(ev) { const [cat, id] = ev.def.reward.split(':'); return CFG.cosmetics.items[cat].find((i) => i.id === id); },

  // Lauf zu Ende: zählt, wenn er lang genug war (normaler Einzel- oder Koop-Lauf, nicht im Tutorial/Cheat). Gibt true zurück, wenn dadurch die Belohnung freigeschaltet wurde.
  runDone(time) {
    const ev = this.active();
    if (!ev) return false;
    const st = this.state(ev);
    if (st.claimed || time < ev.def.minTime) return false;
    st.runs++;
    if (st.runs >= ev.def.runs) {
      st.claimed = true;
      const [cat, id] = ev.def.reward.split(':');
      Save.data.cosmetics.owned[cat + ':' + id] = true;
      G.eventReward = { name: this.reward(ev).name, event: ev.def.name };
      return true;
    }
    return false;
  },

  // Banner links unten im Hauptmenü + Schneefall. Schnee ohne Zustand: Position aus der Zeit berechnet.
  drawHome(ctx) {
    const ev = this.active();
    if (!ev) return;
    const P = STYLE.pal, T = STYLE.type, t = G.realTime, st = this.state(ev), def = ev.def;
    if (def.snow) {
      ctx.save(); ctx.fillStyle = P.ice;
      for (let i = 0; i < 46; i++) {
        const sp = 14 + (i * 37 % 22), x = ((i * 83.7 + Math.sin(t * 0.6 + i) * 12) % STAGE_W + STAGE_W) % STAGE_W, y = (i * 53.3 + t * sp) % (STAGE_H + 8) - 4;
        ctx.globalAlpha = 0.35 + (i % 4) * 0.12; ctx.fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
      }
      ctx.restore();
    }
    const w = 176, h = 34, x = Math.round((STAGE_W - w) / 2), y = STAGE_H - 42;
    ctx.save();
    uiPanel(ctx, x, y, w, h, { color: st.claimed ? P.green : P.cyan, fill: P.void, alpha: 0.92 });
    uiText(ctx, def.name, x + 8, y + 12, { size: T.small, color: P.yellow, maxW: w - 16 });
    const line = st.claimed ? 'REWARD UNLOCKED: ' + this.reward(ev).name : 'PLAY ' + def.runs + ' RUNS (' + formatTime(def.minTime) + '+): ' + st.runs + '/' + def.runs;
    uiText(ctx, line, x + 8, y + 25, { size: T.small, color: st.claimed ? P.green : P.ice, maxW: w - 16 });
    ctx.restore();
  },
};
