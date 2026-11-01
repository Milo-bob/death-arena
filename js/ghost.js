// Geist deines besten Laufs und der Geist deiner Freunde (Settings > BEST-RUN GHOST: OFF / OWN / FRIENDS, Standard OFF).
// Auf jeder Karte zeigt ein durchsichtiges Schiff, wo du in deinem längsten Lauf zur gleichen Zeit warst (bis er endete). Im Modus FRIENDS kommt der beste Geist unter deinen
// Freunden dazu (orange, mit Namen), und dein eigener bester Geist wird für sie hochgeladen (tools/supabase_ghost.sql; der Server prüft die Zeit gegen das Anticheat-Ledger).
// Gilt nur für normale Einzelläufe (kein Tutorial, Koop, PvP, Cheat). Aufnahme alle STEP Sekunden (x, y, Blickrichtung), gespeichert wird nur, wenn der Lauf länger war als der alte Geist.
// Der eigene Geist liegt bewusst NICHT im Spielstand (Save.data wird ins Konto hochgeladen), sondern pro Gerät in localStorage (Schlüssel da_ghost_<Slot>_<Karte>).
// Eingriffspunkte: Ghost.start() in Ret.setup, Ghost.tick(dt) in Ret.tick, Ghost.finish() in G.settleRun (nach Anticheat.end), Ghost.draw(ctx) in G.drawPlay, Ghost.hud(ctx) in Ret.drawHud.

const Ghost = {
  STEP: 0.5, MIN_TIME: 20, MAX_POINTS: 6000,
  rec: null, own: null, friend: null, acc: 0, mapId: '', on: false, friendCache: {},

  // 0 = aus, 1 = nur eigener Geist, 2 = eigener Geist + Freunde (Save.data.ghostOn war früher true/false)
  mode() { const v = Save.data.ghostOn; return v === true ? 1 : v === 2 ? 2 : v === 1 ? 1 : 0; },
  cycle() {
    const old = this.mode(), next = (old + 1) % 3;
    Save.data.ghostOn = next; Save.write();
    if (old === 2) this.clearRemote();                                        // Freunde-Option aus: eigene Geister auf dem Server löschen
    return next;
  },
  online() { return typeof Social !== 'undefined' && Social.on && !Social.missing && typeof Anticheat !== 'undefined' && Anticheat.on; },

  key(map) { return 'da_ghost_' + (typeof Save !== 'undefined' ? Save.slot : 0) + '_' + map; },
  load(map) {
    try { const raw = localStorage.getItem(this.key(map)); const g = raw ? JSON.parse(raw) : null; return g && g.pts && g.pts.length > 2 ? g : null; } catch (e) { return null; }
  },

  // Lauf beginnt: Aufnahme starten, eigenen Geist laden, im Modus FRIENDS den Freunde-Geist der Karte holen (im Hintergrund)
  start(active) {
    this.on = !!active && this.mode() > 0;
    this.rec = this.on ? [] : null; this.acc = 0; this.mapId = this.on ? G.map.id : '';
    this.own = this.on ? this.load(this.mapId) : null;
    this.friend = null;
    if (this.on && this.mode() === 2 && this.online()) this.fetchFriend(this.mapId);
  },

  fetchFriend(map) {
    const c = this.friendCache[map];
    if (c && Date.now() - c.at < 5 * 60000) { this.friend = c.g; return; }
    Social.rpc('ghost_get', { p_map: map }).then((r) => {
      if (!r.ok) return;
      const g = r.json && r.json.pts && r.json.pts.length > 2 ? { name: String(r.json.name || '?').toUpperCase(), time: Number(r.json.time) || 0, step: Number(r.json.step) || this.STEP, pts: r.json.pts } : null;
      this.friendCache[map] = { at: Date.now(), g };
      if (this.on && this.mapId === map) this.friend = g;
    }).catch(() => {});
  },

  tick(dt) {
    if (!this.on || !this.rec || G.mode !== 'play') return;
    this.acc += dt;
    while (this.acc >= this.STEP) {
      this.acc -= this.STEP;
      if (this.rec.length >= this.MAX_POINTS) continue;
      const p = G.player;
      this.rec.push([Math.round(p.x), Math.round(p.y), Math.round(p.dir)]);
    }
  },

  // Lauf zu Ende (Tod oder Sieg). Danach, wenn der Lauf ein neuer eigener Bestwert ist und FRIENDS an ist: nach dem Anticheat-Bericht hochladen.
  finish() {
    if (!this.on || !this.rec || G.cheated || this.rec.length < this.MIN_TIME / this.STEP) { this.on = false; return; }
    const time = Math.min(G.time, this.rec.length * this.STEP), old = this.own;
    if (!old || time > old.time) {
      const g = { time: Math.round(time * 10) / 10, step: this.STEP, pts: this.rec };
      try { localStorage.setItem(this.key(this.mapId), JSON.stringify(g)); } catch (e) { /* Speicher voll/gesperrt: kein Geist */ }
      if (this.mode() === 2 && this.online()) this.upload(this.mapId, g, Save.slot);
    }
    this.on = false;
  },

  // Erst den Lauf-Bericht des Anticheats abwarten (das Ledger muss die Zeit schon kennen), dann den Geist melden. Fehler sind egal (kommt beim nächsten Bestlauf wieder).
  upload(map, g, slot) {
    Promise.resolve(Anticheat.flush()).then(() => Social.rpc('ghost_put', { p_slot: slot, p_map: map, p_time: g.time, p_pts: g.pts })).catch(() => {});
  },
  clearRemote() { if (this.online()) Social.rpc('ghost_clear').catch(() => {}); this.friendCache = {}; },

  // Position eines Geists zur Laufzeit t (linear zwischen den Punkten); null, wenn sein Lauf schon vorbei war
  at(t, g) {
    g = g || this.own;
    if (!g || t > g.time) return null;
    const f = t / g.step, i = Math.floor(f), a = g.pts[Math.min(i, g.pts.length - 1)], b = g.pts[Math.min(i + 1, g.pts.length - 1)], k = f - i;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dir: a[2] };
  },

  draw(ctx) {
    if (!this.on || G.mode !== 'play') return;
    const q = this.at(G.time);
    if (q) drawSprite(ctx, Hero.sprite(), q.x, q.y, q.dir, CFG.player.size, { hue: 160, alpha: 0.35 });
    const f = this.friend && this.at(G.time, this.friend);
    if (f) {
      drawSprite(ctx, Hero.sprite(), f.x, f.y, f.dir, CFG.player.size, { hue: 300, alpha: 0.4 });
      uiText(ctx, this.friend.name, STAGE_W / 2 + f.x, STAGE_H / 2 - f.y - 16, { size: STYLE.type.small, color: STYLE.pal.orange, align: 'center', maxW: 80 });
    }
  },

  hud(ctx) {
    if (!this.on || G.mode !== 'play') return;
    const T = STYLE.type, P = STYLE.pal;
    let y = STAGE_H - 8;
    if (this.friend) {
      const over = G.time > this.friend.time;
      uiText(ctx, over ? this.friend.name + ': BEATEN!' : this.friend.name + ': ' + formatTime(this.friend.time), STAGE_W - 8, y, { size: T.small, color: over ? P.green : P.orange, align: 'right' }); y -= 11;
    }
    if (this.own) {
      const over = G.time > this.own.time;
      uiText(ctx, over ? 'NEW BEST PACE!' : 'GHOST: ' + formatTime(this.own.time), STAGE_W - 8, y, { size: T.small, color: over ? P.green : P.cyanMid, align: 'right' });
    }
  },
};
