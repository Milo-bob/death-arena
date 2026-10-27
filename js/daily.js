// Tagesbelohnung (erscheint im Hauptmenü, wenn man angemeldet ist und heute noch nichts abgeholt hat). Alles entscheidet der Server (tools/supabase_anticheat.sql:
// daily_status / daily_claim): Serverdatum in deutscher Zeit, Serie (wer gestern abgeholt hat, macht weiter, sonst beginnt sie bei Tag 1), 7er-Zyklus.
// Das Spiel schreibt die Credits nur gut, die der Server zurückgibt; sie zählen in der Obergrenze des Anticheats mit.
// Bedienung: Leertaste / Enter / Klick = abholen, ESC = später (der kleine Knopf DAILY REWARD unter dem Profil im Hauptmenü öffnet es wieder).

const Daily = {
  st: null,                 // { streak, claimed, next, rewards: [..], cycle }
  open: false, dismissed: false, busy: false, loadedAt: 0, missing: false, result: null, resultAt: 0, day: '',

  get on() { return typeof Account !== 'undefined' && Account.configured && Account.on && !this.missing; },
  today() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }); } catch (e) { return new Date().toISOString().slice(0, 10); } },       // JJJJ-MM-TT, deutscher Kalendertag

  // Jedes Bild im Hauptmenü: Stand holen (beim ersten Mal, alle 10 Minuten und nach Mitternacht)
  tick(mode) {
    if (mode !== 'start' || !this.on || this.busy) return;
    const now = Date.now(), day = this.today();
    if (this.st && now - this.loadedAt < 600000 && day === this.day) return;
    this.busy = true;
    Account.rest('POST', '/rest/v1/rpc/daily_status', {}).then((r) => {
      if (!r.ok && (r.status === 404 || /could not find the function/i.test(String((r.json && r.json.message) || '')))) { this.missing = true; return; }
      if (r.ok && r.json && typeof r.json === 'object') {
        this.st = r.json; this.loadedAt = Date.now(); if (day !== this.day) this.dismissed = false; this.day = day;
        if (!this.st.claimed && !this.dismissed) { this.open = true; this.result = null; }
      } else this.loadedAt = Date.now() - 540000;                      // Fehler/offline: in einer Minute nochmal
    }).catch(() => {}).then(() => { this.busy = false; });
  },
  available() { return !!(this.on && this.st && !this.st.claimed); },

  async claim() {
    if (this.busy || !this.st || this.st.claimed) { this.close(); return; }
    this.busy = true;
    try {
      const r = await Account.rest('POST', '/rest/v1/rpc/daily_claim', {});
      if (r.ok && r.json && r.json.ok) {
        const cr = Number(r.json.credits) || 0;
        Save.data.souls = (Save.data.souls || 0) + cr; Save.write();
        this.st.claimed = true; this.st.streak = r.json.streak; this.st.next = r.json.streak + 1;
        this.result = { credits: cr, streak: r.json.streak, index: r.json.index }; this.resultAt = Date.now();
        Sfx.play('levelUp');
      } else if (r.ok && r.json && r.json.ok === false) { this.st.claimed = true; this.close(); }          // heute schon abgeholt (anderes Gerät)
      else { this.error = Account.errText(r); Sfx.play('deny'); }
    } finally { this.busy = false; }
  },
  close() { this.open = false; this.dismissed = true; this.error = ''; },

  update() {
    if (this.result && Date.now() - this.resultAt > 4000) { this.close(); return; }
    if (Input.pressed('Escape')) { this.close(); return; }
    if (Input.pressed('Space') || Input.pressed('Enter')) { if (this.result) this.close(); else this.claim(); }
  },

  // kleiner Knopf im Hauptmenü, solange die Belohnung offen ist
  drawChip(ctx) {
    if (!this.available() || this.open) return;
    const P = STYLE.pal, T = STYLE.type, x = PWA.visible ? 62 : 8, y = 122, w = 112, h = 18, pulse = 0.55 + 0.45 * Math.sin(G.realTime * 4);
    UIHit.add(x, y, w, h, () => {}, { act: () => { this.open = true; this.dismissed = false; this.result = null; } });
    uiPanel(ctx, x, y, w, h, { color: P.yellow, fill: P.void, alpha: 0.9, glow: pulse > 0.8 });
    uiText(ctx, 'DAILY REWARD', x + w / 2, y + 13, { size: T.body, color: P.yellow, align: 'center' });
  },

  draw(ctx) {
    this.drawChip(ctx);
    if (!this.open || !this.st) return;
    const P = STYLE.pal, T = STYLE.type, st = this.st, n = st.cycle || 7, rew = st.rewards || [], idx = (Math.max(1, st.next) - 1) % n, cx = STAGE_W / 2;
    const w = 440, h = 200, x = cx - w / 2, y = 70;
    UIHit.list.length = 0;                                                              // das Fenster liegt oben: darunter ist nichts klickbar
    ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = P.ink; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
    uiPanel(ctx, x, y, w, h, { color: P.yellow, fill: P.void, alpha: 0.98, glow: true });
    uiText(ctx, 'DAILY REWARD', cx, y + 28, { size: T.h1, color: P.yellow, align: 'center', glow: P.yellow });
    const got = this.result, done = got ? (got.index + 1) : idx;                          // wie viele Kästchen des Zyklus schon erledigt sind
    const bw = 54, gap = 8, bx0 = cx - (n * bw + (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
      const bx = bx0 + i * (bw + gap), by = y + 50, isDone = i < done, isToday = !got && i === idx, col = isDone ? P.green : isToday ? P.yellow : P.greyMid;
      uiPanel(ctx, bx, by, bw, 66, { color: col, fill: isToday ? P.voidLight : P.void, alpha: 0.95, glow: isToday });
      uiText(ctx, 'DAY ' + (i + 1), bx + bw / 2, by + 14, { size: T.small, color: col, align: 'center' });
      uiText(ctx, '+' + (rew[i] || 0), bx + bw / 2, by + 40, { size: T.h2, color: isDone || isToday ? P.ice : P.grey, align: 'center' });
      uiText(ctx, 'CREDITS', bx + bw / 2, by + 56, { size: T.small, color: P.grey, align: 'center' });
      if (isDone) { ctx.fillStyle = P.green; [[-6, 0], [-4, 2], [-2, 4], [0, 2], [2, 0], [4, -2], [6, -4]].forEach(([dx, dy]) => ctx.fillRect(bx + bw - 12 + dx, by + 6 + dy, 3, 3)); }
    }
    const streak = got ? got.streak : st.streak;
    uiText(ctx, streak > 0 ? 'STREAK: ' + streak + (streak === 1 ? ' DAY' : ' DAYS') : 'START YOUR STREAK TODAY', cx, y + 136, { size: T.body, color: P.cyan, align: 'center' });
    if (got) uiText(ctx, '+' + got.credits + ' CREDITS', cx, y + 160, { size: T.h2, color: P.yellow, align: 'center', glow: P.yellow });
    else uiText(ctx, 'COME BACK TOMORROW TO KEEP YOUR STREAK  -  MISS A DAY AND IT STARTS OVER', cx, y + 150, { size: T.small, color: P.grey, align: 'center' });
    const bwid = 150, bxx = cx - bwid / 2, byy = y + h - 34;
    UIHit.add(bxx, byy, bwid, 22, () => {}, { act: () => (got ? this.close() : this.claim()) });
    uiPanel(ctx, bxx, byy, bwid, 22, { color: got ? P.cyan : P.green, fill: P.void, alpha: 0.95, glow: true });
    uiText(ctx, got ? 'OK' : this.busy ? '...' : 'CLAIM', cx, byy + 15, { size: T.h2, color: got ? P.cyan : P.green, align: 'center' });
    if (!got) { UIHit.add(x + w - 62, y + 6, 56, 16, () => {}, { act: () => this.close() }); uiText(ctx, 'LATER [ESC]', x + w - 34, y + 17, { size: T.small, color: P.grey, align: 'center' }); }
    if (this.error) uiText(ctx, this.error, cx, y + h + 14, { size: T.body, color: P.red, align: 'center' });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'DAILY REWARD': 'TAGESBELOHNUNG', 'CLAIM': 'ABHOLEN', 'DAY': 'TAG', 'LATER [ESC]': 'SPÄTER [ESC]', 'DAY #': 'TAG #', 'STREAK: # DAYS': 'SERIE: # TAGE', 'STREAK: # DAY': 'SERIE: # TAG', 'CREDITS': 'CREDITS', 'START YOUR STREAK TODAY': 'STARTE HEUTE DEINE SERIE',
  'COME BACK TOMORROW TO KEEP YOUR STREAK  -  MISS A DAY AND IT STARTS OVER': 'KOMM MORGEN WIEDER, UM DEINE SERIE ZU HALTEN  -  VERPASSE EINEN TAG UND SIE BEGINNT NEU',
});
