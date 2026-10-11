// PvP-Arena: Menues fuer die Lobby (erstellen, per Code beitreten, Spielerliste, Modus, Abilities). Die Verbindung steckt in net.js, der Kampf in pvpmatch.js.
// Nur der Host (Ersteller) darf Modus waehlen und die Runde starten; alle Spieler duerfen ihre Abilities waehlen. Siehe Organise/CLAUDE.md "PvP-Arena".
// Zustaende (Pvp.st): menu (Lobby erstellen / beitreten / zurueck), join (Code eintippen), lobby (Code + Spieler).
// Bedienung: W/S + Leertaste (Maus geht ueberall), im Code-Feld Buchstaben/Ziffern tippen (Strg+V fuegt ein), Rueckschritt loescht, ESC = zurueck.

const Pvp = {
  st: 'menu', sel: 0, code: '', input: '', ch: null, players: [], me: null, isHost: false,
  msg: '', msgCol: null, msgAt: 0, joinAt: 0, hadHost: false, copied: 0, mode: 'ffa', scores: {}, rule: 'own', RULES: ['own', 'setfix', 'setpick', 'all'],

  // Anzeigename: Kontoname, sonst ein fester Gastname pro Geraet
  name() {
    if (typeof Account !== 'undefined' && Account.on && Account.meta.name) return String(Account.meta.name).toUpperCase().slice(0, 14);
    if (!Save.data.pvpName) { Save.data.pvpName = 'GUEST-' + String(Math.floor(1000 + Math.random() * 9000)); Save.write(); }
    return Save.data.pvpName;
  },

  open() { this.scores = {}; this.leave(true); this.st = 'menu'; this.sel = 0; this.input = ''; this.say(''); },
  say(t, col) { this.msg = t; this.msgCol = col || null; this.msgAt = Date.now(); },

  // Verbindung schliessen und zurueck ins Menue (silent = keine Meldung loeschen)
  leave(silent) {
    if (this.ch) { try { this.ch.close(); } catch (e) { /* egal */ } }
    this.ch = null; this.players = []; this.isHost = false; this.hadHost = false; this.code = '';
    if (!silent) { this.st = 'menu'; this.sel = 0; }
  },

  connect(code, host) {
    if (!Net.available) { this.say('NO CONNECTION POSSIBLE ON THIS DEVICE', STYLE.pal.red); return; }
    this.leave(true);
    this.scores = {}; this.mode = 'ffa'; this.rule = 'own';
    this.code = code; this.isHost = host; this.joinAt = Date.now(); this.hadHost = host; this.st = 'lobby'; this.sel = 0; this.say(host ? '' : 'JOINING...', STYLE.pal.grey);
    this.ch = Net.open(code, { name: this.name(), host, mode: 'ffa', rule: 'own', set: Save.data.pvpSet }, {
      onPlayers: (list) => this.onPlayers(list),
      onMessage: (ev, p) => { if (ev === 'start' && !this.isHost) this.roundStart(p); else PvpMatch.onMessage(ev, p); },
      onStatus: (s) => { if (s === 'error' && this.ch) { this.failBack('CONNECTION FAILED'); } },
    });
  },

  // Runde starten (nur der Host): alle in der Lobby bekommen 'start' { mode, order } (Reihenfolge und Modus legt der Host fest, damit Teams bei allen gleich sind)
  roundStart(info) {
    if (info && info.order && this.ch && !info.order.includes(this.ch.id)) { this.say('A ROUND IS RUNNING - YOU JOIN THE NEXT ONE', STYLE.pal.orange); return; }        // spaet beigetreten
    this.st = 'lobby';
    // Der Host bestimmt die Arena-Groesse: ein Geraet mit aelterem Spielstand (App noch nicht aktualisiert) soll sonst keine andere Arena haben
    if (info && !this.isHost && Number.isFinite(info.radius) && info.radius >= 100 && info.radius <= 1000) CFG.pvp.radius = info.radius;
    if (PvpMatch.begin(info)) Sfx.play('levelUp'); else this.say('CONNECTION FAILED', STYLE.pal.red);
  },
  startRound() {
    if (!this.isHost || !this.ch) return;
    if (this.players.length < 2) { this.say('YOU NEED AT LEAST 2 PLAYERS', STYLE.pal.orange); Sfx.play('deny'); return; }
    const info = { mode: this.mode, order: this.players.slice(0, Net.MAX_PLAYERS).map((p) => p.id), radius: CFG.pvp.radius, rule: this.ruleKind(), setId: this.ruleNow() === 'setfix' ? this.setNow().id : Save.data.pvpSet };
    this.ch.send('start', info); this.roundStart(info);
  },
  // Modus: der Host waehlt (jeder gegen jeden / Teams), alle sehen ihn ueber die Anwesenheit des Hosts
  modeNow() { if (this.isHost) return this.mode; const h = this.players.find((p) => p.host); return h && h.mode === 'teams' ? 'teams' : 'ffa'; },
  toggleMode() { if (!this.isHost || !this.ch) return; this.mode = this.mode === 'teams' ? 'ffa' : 'teams'; this.ch.update({ mode: this.mode }); Sfx.play('select'); },
  // Ausruestungs-Regel (der Host waehlt, alle sehen sie ueber seine Anwesenheit): own | setfix (ein Set fuer alle) | setpick (jeder waehlt ein Set) | all
  ruleNow() { if (this.isHost) return this.rule; const h = this.players.find((p) => p.host); return h && this.RULES.includes(h.rule) ? h.rule : 'own'; },
  ruleKind() { const r = this.ruleNow(); return r === 'setfix' || r === 'setpick' ? 'set' : r; },
  toggleRule(d) { if (!this.isHost || !this.ch) return; this.rule = this.RULES[(this.RULES.indexOf(this.rule) + d + this.RULES.length) % this.RULES.length]; this.ch.update({ rule: this.rule, set: Save.data.pvpSet }); Sfx.play('select'); },
  // Set fuer mich: bei "ein Set fuer alle" das des Hosts, sonst mein eigenes
  setNow() {
    const sets = CFG.pvp.sets;
    let id = Save.data.pvpSet;
    if (this.ruleNow() === 'setfix' && !this.isHost) { const h = this.players.find((p) => p.host); if (h && h.set) id = h.set; }
    return sets.find((s) => s.id === id) || sets[0];
  },
  cycleSet(d) {
    if (this.ruleNow() === 'setfix' && !this.isHost) return;
    const sets = CFG.pvp.sets, i = sets.findIndex((s) => s.id === this.setNow().id);
    Save.data.pvpSet = sets[(i + d + sets.length) % sets.length].id; Save.write(); Sfx.play('select');
    if (this.isHost && this.ch) this.ch.update({ set: Save.data.pvpSet });
  },
  lobbyRows() { return this.isHost ? ['start', 'mode', 'rule', 'equipment', 'copy', 'leave'] : ['equipment', 'copy', 'leave']; },

  // ---- Abilities fuer den Kampf: je Gruppe (weak/medium/strong) eine GEKAUFTE Ability oder keine ----
  tierList(tier) { const all = this.ruleKind() === 'all'; return [null].concat(Object.keys(CFG.loadout.abilities).filter((id) => CFG.loadout.abilities[id].tier === tier && (all || CFG.loadout.abilities[id].unlock === 0 || (Save.data.unlocked && Save.data.unlocked[id])))); },
  loadout() {
    if (this.ruleKind() === 'set') { const S = this.setNow(); return { weak: S.weak, medium: S.medium, strong: S.strong }; }
    const S = Save.data.pvpLoadout || {}, out = {};
    for (const t of CFG.loadout.tiers) out[t.id] = S[t.id] && this.tierList(t.id).includes(S[t.id]) ? S[t.id] : null;
    return out;
  },
  cycle(i, d) {
    const t = CFG.loadout.tiers[i], list = this.tierList(t.id), cur = this.loadout()[t.id], n = list.length;
    Save.data.pvpLoadout = Object.assign({}, this.loadout(), { [t.id]: list[(list.indexOf(cur) + d + n) % n] });
    Save.write(); Sfx.play('select');
  },

  // ---- Waffen und Implant fuer den Kampf (Slots melee/ranged/heavy/artifact): nur gekaufte Items; starke Waffe und Implant duerfen leer bleiben ----
  equipList(slot) { const l = this.ruleKind() === 'all' ? Object.keys(CFG.items.catalog).filter((id) => CFG.items.catalog[id].slot === slot && CFG.items.catalog[id].impl) : Save.ownedFor(slot); return slot === 'heavy' || slot === 'artifact' ? [null].concat(l) : l; },
  equipCycle(slot, d) {
    const list = this.equipList(slot), cur = Save.pvpEquipped(slot), n = list.length;
    if (n < 2) return;
    Save.data.pvpEquip = Object.assign({}, Save.data.pvpEquip, { [slot]: list[(Math.max(0, list.indexOf(cur)) + d + n) % n] });
    Save.write(); Sfx.play('select');
  },
  heroList() { const all = this.ruleKind() === 'all'; return Object.keys(CFG.heroes).filter((id) => all || Save.heroOwned(id)); },
  heroCycle(d) {
    const l = this.heroList(), cur = Save.pvpHero(this.ruleKind()), n = l.length;
    if (n < 2) return;
    Save.data.pvpHeroSel = l[(Math.max(0, l.indexOf(cur)) + d + n) % n]; Save.write(); Sfx.play('select');
  },
  // Zeilen des Ausruestungs-Bildschirms: SET = nur die Set-Wahl, sonst 4 Inventar-Slots, 3 Ability-Gruppen, Held
  eqRows() { return this.ruleKind() === 'set' ? ['set'] : [0, 1, 2, 3, 4, 5, 6, 7]; },
  cycleRow(i, d) { if (this.ruleKind() === 'set') this.cycleSet(d); else if (i < 4) this.equipCycle(CFG.items.slots[i].id, d); else if (i < 7) this.cycle(i - 4, d); else this.heroCycle(d); },

  RULE_NAMES: { own: 'OWN EQUIPMENT', setfix: 'ONE SET FOR ALL', setpick: 'PICK A SET', all: 'ALL EQUIPMENT' },

  failBack(text) { this.leave(); this.st = 'menu'; this.say(text, STYLE.pal.red); Sfx.play('deny'); },

  onPlayers(list) {
    this.players = list;
    if (this.isHost) return;
    const host = list.some((p) => p.host);
    if (host) this.hadHost = true;
    if (!this.hadHost) return;                                          // der Host kommt kurz nach dem Beitritt per Presence an (Pruefung in update)
    if (!host) { this.failBack('THE HOST CLOSED THE LOBBY'); return; }
    if (list.length > Net.MAX_PLAYERS && !list.slice(0, Net.MAX_PLAYERS).some((p) => p.id === this.ch.id)) { this.failBack('THE LOBBY IS FULL'); return; }
    this.say('');
  },

  type() {
    for (const c of Object.keys(Input.pressedNow)) {
      const m = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(c);
      if (m && this.input.length < Net.CODE_LEN) this.input = Net.cleanCode(this.input + (m[1] || m[2] || m[3]));
      if (c === 'KeyV' && (Input.keys.ControlLeft || Input.keys.ControlRight)) this.paste();
    }
  },
  paste() {
    try { navigator.clipboard.readText().then((t) => { this.input = Net.cleanCode(t); }).catch(() => {}); } catch (e) { /* kein Zugriff auf die Zwischenablage */ }
  },

  update() {
    const up = Input.pressed('ArrowUp') || Input.pressed('KeyW'), dn = Input.pressed('ArrowDown') || Input.pressed('KeyS');
    const go = Input.pressed('Space') || Input.pressed('Enter');
    if (this.st === 'menu') {
      const rows = this.rows(); if (up) this.sel = (this.sel + rows.length - 1) % rows.length; if (dn) this.sel = (this.sel + 1) % rows.length;
      if (Input.pressed('Escape')) { G.mode = 'multiselect'; return; }
      if (go) {
        const r = rows[this.sel];
        if (r === 'create') this.connect(Net.newCode(), true);
        else if (r === 'join') { this.st = 'join'; this.sel = 0; this.input = ''; this.say(''); }
        else G.mode = 'multiselect';
      }
    } else if (this.st === 'join') {
      if (Input.pressedNow.Backspace) { this.input = this.input.slice(0, -1); return; }       // Rueckschritt loescht (zaehlt sonst wie ESC)
      this.type();
      const rows = this.rows(); if (up) this.sel = (this.sel + rows.length - 1) % rows.length; if (dn) this.sel = (this.sel + 1) % rows.length;
      if (Input.pressed('Escape')) { this.st = 'menu'; this.sel = 1; return; }
      if (go) {
        if (this.sel === 0 || this.sel === 1) { if (this.input.length === Net.CODE_LEN) this.connect(this.input, false); else { this.say('A CODE HAS ' + Net.CODE_LEN + ' CHARACTERS', STYLE.pal.orange); Sfx.play('deny'); } }
        else { this.st = 'menu'; this.sel = 1; }
      }
    } else if (this.st === 'loadout') {
      const n = this.eqRows().length + 1;
      if (up) this.sel = (this.sel + n - 1) % n;
      if (dn) this.sel = (this.sel + 1) % n;
      if (this.sel < n - 1) {
        if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.cycleRow(this.sel, -1);
        if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.cycleRow(this.sel, 1);
      }
      if (Input.pressed('Escape') || (go && this.sel === n - 1)) { this.st = 'lobby'; this.sel = this.isHost ? 3 : 0; return; }
      if (go && this.sel < n - 1) this.cycleRow(this.sel, 1);
    } else if (this.st === 'lobby') {
      const lr = this.lobbyRows(); if (up) this.sel = (this.sel + lr.length - 1) % lr.length; if (dn) this.sel = (this.sel + 1) % lr.length;
      this.sel = Math.min(this.sel, lr.length - 1);
      if (!this.isHost && this.ch && this.ch.status === 'joined' && !this.hadHost && Date.now() - this.joinAt > 2500) { this.failBack('NO LOBBY WITH THIS CODE'); return; }       // niemand hat sich als Host eingetragen
      if (Input.pressed('Escape')) { this.leave(); return; }
      if (lr[this.sel] === 'mode' && (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('ArrowRight') || Input.pressed('KeyD'))) this.toggleMode();
      if (lr[this.sel] === 'rule') { if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.toggleRule(-1); if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.toggleRule(1); }
      if (go) {
        const r = lr[this.sel];
        if (r === 'start') this.startRound();
        else if (r === 'mode') this.toggleMode();
        else if (r === 'rule') this.toggleRule(1);
        else if (r === 'equipment') { this.st = 'loadout'; this.sel = 0; }
        else if (r === 'copy') { try { navigator.clipboard.writeText(this.code); } catch (e) { /* egal */ } this.copied = Date.now(); }
        else this.leave();
      }
    }
  },

  rows() { return this.st === 'menu' ? ['create', 'join', 'back'] : [0, 1, 2]; },

  draw(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2;
    drawMenuBg(ctx, 'keysettings');
    drawEmbers(ctx);
    uiText(ctx, 'PVP ARENA', cx, 56, { size: T.h1, color: P.red, align: 'center', glow: P.red });
    const top = 90, GAP = 46;
    if (this.st === 'menu') {
      const labels = ['CREATE LOBBY', 'JOIN LOBBY', 'BACK'], lw = 300, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX;
      labels.forEach((l, i) => drawMenuRow(ctx, top + i * GAP, l, this.sel === i, { w: lw, h: 36, cx: 40 + lw / 2, hit: () => { this.sel = i; } }));
      uiPanel(ctx, PX, top, PW, labels.length * GAP - 10, { color: P.red, fill: P.void, alpha: 0.92, glow: true });
      const d = [['Open a lobby and share the code with your friends (up to ' + Net.MAX_PLAYERS + ' players).', ''],
        ['Enter the code of a friend\'s lobby to join it.', ''], ['Back to the mode list.', '']][this.sel];
      uiText(ctx, labels[this.sel], PX + 14, top + 24, { size: T.h1, color: P.red });
      let ty = top + 48;
      ty += 13 * uiWrap(ctx, d[0], PX + 14, ty, PW - 28, 13, { size: T.body, color: P.ice }) + 6;
      if (d[1]) ty += 13 * uiWrap(ctx, d[1], PX + 14, ty, PW - 28, 13, { size: T.body, color: P.grey }) + 6;
      uiText(ctx, this.name(), PX + PW - 14, top + 24, { size: T.small, color: P.cyan, align: 'right' });
      uiWrap(ctx, 'Up to 4 players, all vs all or in teams. Your own weapons, abilities and upgrades count. Needs an internet connection.', PX + 14, ty + 4, PW - 28, 13, { size: T.small, color: P.grey });
    } else if (this.st === 'join') {
      uiText(ctx, 'ENTER THE LOBBY CODE', cx, 96, { size: T.h2, color: P.ice, align: 'center' });
      const bw = 36, gap = 8, x0 = cx - (Net.CODE_LEN * bw + (Net.CODE_LEN - 1) * gap) / 2;
      for (let i = 0; i < Net.CODE_LEN; i++) {
        const x = x0 + i * (bw + gap), cur = i === this.input.length;
        uiPanel(ctx, x, 106, bw, 38, { color: cur && Math.floor(G.realTime * 2) % 2 ? P.yellow : P.cyan, fill: P.void, alpha: 0.95 });
        if (this.input[i]) uiText(ctx, this.input[i], x + bw / 2, 134, { size: T.h1, color: P.ice, align: 'center' });
      }
      uiText(ctx, 'TAP THE LETTERS BELOW (OR TYPE, CTRL+V PASTES)', cx, 158, { size: T.small, color: P.grey, align: 'center' });
      // Bildschirmtastatur (fuer Handy/Tablet ohne Tastatur): 8 Tasten pro Reihe, nur die erlaubten Code-Zeichen
      const chars = Net.CODE_CHARS.split(''), cols = 8, kw = 34, kh = 22, kg = 4, kx0 = cx - (cols * kw + (cols - 1) * kg) / 2, m = Input.mouse;
      chars.forEach((ch, i) => {
        const x = kx0 + (i % cols) * (kw + kg), y = 166 + Math.floor(i / cols) * (kh + kg), hot = m.x >= x && m.x <= x + kw && m.y >= y && m.y <= y + kh;
        UIHit.add(x, y, kw, kh, () => {}, { act: () => { if (this.input.length < Net.CODE_LEN) { this.input += ch; Sfx.play('tick'); } } });
        uiPanel(ctx, x, y, kw, kh, { color: hot ? P.ice : P.cyan, fill: hot ? P.greyMid : P.void, alpha: 0.95 });
        uiText(ctx, ch, x + kw / 2, y + 16, { size: T.h2, color: hot ? P.ice : P.cyan, align: 'center' });
      });
      const by = 166 + 4 * (kh + kg) + 6, bw2 = 100, bg = 10, bx0 = cx - (3 * bw2 + 2 * bg) / 2;
      [['DEL', () => { this.input = this.input.slice(0, -1); Sfx.play('tick'); }, P.orange],
        ['JOIN', () => { if (this.input.length === Net.CODE_LEN) this.connect(this.input, false); else { this.say('A CODE HAS ' + Net.CODE_LEN + ' CHARACTERS', P.orange); Sfx.play('deny'); } }, P.green || P.cyan],
        ['BACK', () => { this.st = 'menu'; this.sel = 1; }, P.red]].forEach(([l, fn, col], i) => {
        const x = bx0 + i * (bw2 + bg), hot = m.x >= x && m.x <= x + bw2 && m.y >= by && m.y <= by + 30;
        UIHit.add(x, by, bw2, 30, () => {}, { act: fn });
        uiPanel(ctx, x, by, bw2, 30, { color: hot ? P.ice : col, fill: hot ? P.greyMid : P.void, alpha: 0.95, glow: hot });
        uiText(ctx, l, x + bw2 / 2, by + 21, { size: T.h2, color: hot ? P.ice : col, align: 'center' });
      });
    } else if (this.st === 'loadout') {
      this.drawLoadout(ctx);
    } else {
      this.drawLobby(ctx, top);
    }
    if (this.msg) uiText(ctx, this.msg, cx, 338, { size: T.body, color: this.msgCol || P.orange, align: 'center' });
  },

  // Ausruestung: links Waffen und Implant, rechts die drei Ability-Gruppen und der Held, unten BACK. Bei SET nur die Set-Wahl.
  drawLoadout(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2, kind = this.ruleKind(), rule = this.ruleNow();
    uiText(ctx, 'CHOOSE YOUR EQUIPMENT', cx, 56, { size: T.h2, color: P.ice, align: 'center' });
    uiText(ctx, this.RULE_NAMES[rule], cx, 72, { size: T.small, color: kind === 'all' ? P.yellow : kind === 'set' ? P.cyan : P.grey, align: 'center' });
    if (kind === 'set') return this.drawSetPick(ctx);
    const L = this.loadout(), tiers = CFG.loadout.tiers, w = 440, H = 40, GP = 46, y0 = 92, xs = [cx - w - 10, cx + 10], all = kind === 'all';
    const row = (i, x, y, label, name, icon, iconW, n) => {
      const sel = this.sel === i;
      UIHit.add(x, y, w, H, () => { this.sel = i; });
      uiPanel(ctx, x, y, w, H, { color: sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.92, glow: sel });
      uiText(ctx, label, x + 10, y + 14, { size: T.small, color: P.grey });
      if (icon) drawIcon(ctx, icon, x + 26, y + 29, iconW || 18);
      uiText(ctx, name || 'NONE', x + (icon ? 46 : 10), y + 33, { size: T.h2, color: name ? P.ice : P.greyMid, maxW: w - 120 });
      if (n > 1) {
        UIHit.add(x + w - 70, y, 35, H, () => { this.sel = i; }, { act: () => this.cycleRow(i, -1) });
        UIHit.add(x + w - 35, y, 35, H, () => { this.sel = i; }, { act: () => this.cycleRow(i, 1) });
        uiText(ctx, '<', x + w - 52, y + 28, { size: T.h1, color: sel ? P.cyan : P.grey, align: 'center' });
        uiText(ctx, '>', x + w - 17, y + 28, { size: T.h1, color: sel ? P.cyan : P.grey, align: 'center' });
      }
    };
    let desc = '';
    CFG.items.slots.forEach((s, i) => {
      const id = Save.pvpEquipped(s.id), I = id ? CFG.items.catalog[id] : null;
      row(i, xs[0], y0 + i * GP, s.label, I ? I.name : '', I && I.icon, I && I.iconW, this.equipList(s.id).length);
      if (this.sel === i && I) desc = I.desc;
    });
    tiers.forEach((t, i) => {
      const id = L[t.id], A = id ? CFG.loadout.abilities[id] : null, n = this.tierList(t.id).length;
      row(4 + i, xs[1], y0 + i * GP, t.label + '  [' + t.key.toUpperCase() + ']', A ? A.name : (n > 1 ? '' : 'NONE UNLOCKED'), A && A.icon, 20, n);
      if (this.sel === 4 + i && A) desc = A.desc;
    });
    const hid = Save.pvpHero(kind), Hc = CFG.heroes[hid];
    row(7, xs[1], y0 + 3 * GP, 'HERO', Hc.name, null, 0, this.heroList().length);
    if (this.sel === 7) desc = Hc.blurb || '';
    const by = y0 + 4 * GP + 2;
    drawMenuRow(ctx, by, 'BACK', this.sel === 8, { w: 200, h: 28, cx, hit: () => { this.sel = 8; } });
    if (desc) uiWrap(ctx, desc, xs[0], by + 42, 2 * w + 20, 13, { size: T.small, color: P.grey });
    else uiText(ctx, all ? 'EVERYTHING IS UNLOCKED AND AT MAX LEVEL, WITH MAX UPGRADES.' : 'ONLY WHAT YOU OWN CAN BE CHOSEN. YOUR UPGRADES AND HERO COUNT. YOUR INVENTORY STAYS UNCHANGED.', cx, by + 52, { size: T.small, color: P.greyMid, align: 'center' });
  },

  drawSetPick(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2, S = this.setNow(), cat = CFG.items.catalog, ab = CFG.loadout.abilities, w = 520, x = cx - w / 2, y = 90;
    const locked = this.ruleNow() === 'setfix' && !this.isHost;
    uiPanel(ctx, x, y, w, 150, { color: P.cyan, fill: P.void, alpha: 0.92, glow: true });
    UIHit.add(x, y, w, 150, () => { this.sel = 0; });
    uiText(ctx, S.name, cx, y + 30, { size: T.h1, color: P.cyan, align: 'center' });
    if (!locked) {
      UIHit.add(x, y, 60, 150, () => { this.sel = 0; }, { act: () => this.cycleSet(-1) });
      UIHit.add(x + w - 60, y, 60, 150, () => { this.sel = 0; }, { act: () => this.cycleSet(1) });
      uiText(ctx, '<', x + 30, y + 80, { size: T.h1, color: P.cyan, align: 'center' });
      uiText(ctx, '>', x + w - 30, y + 80, { size: T.h1, color: P.cyan, align: 'center' });
    }
    uiWrap(ctx, S.desc, x + 70, y + 50, w - 140, 13, { size: T.small, color: P.grey });
    const lines = [['MELEE', cat[S.melee].name], ['RANGED', cat[S.ranged].name], ['HEAVY', cat[S.heavy].name], ['IMPLANT', cat[S.artifact].name]], l2 = [['WEAK', ab[S.weak].name], ['MEDIUM', ab[S.medium].name], ['STRONG', ab[S.strong].name], ['HERO', CFG.heroes.vanguard.name]];
    lines.forEach(([k, v], i) => { uiText(ctx, k, x + 70, y + 92 + i * 14, { size: T.small, color: P.grey }); uiText(ctx, v, x + 140, y + 92 + i * 14, { size: T.small, color: P.ice }); });
    l2.forEach(([k, v], i) => { uiText(ctx, k, x + 290, y + 92 + i * 14, { size: T.small, color: P.grey }); uiText(ctx, v, x + 350, y + 92 + i * 14, { size: T.small, color: P.ice }); });
    drawMenuRow(ctx, y + 166, 'BACK', this.sel === 1, { w: 200, h: 28, cx, hit: () => { this.sel = 1; } });
    uiText(ctx, locked ? 'THE HOST CHOSE THIS SET FOR EVERYONE.' : 'NO UPGRADES, LEVEL 0 GEAR, HERO VANGUARD: EVERYONE IS EQUAL.', cx, y + 216, { size: T.small, color: P.greyMid, align: 'center' });
  },

  drawLobby(ctx, top) {
    const P = STYLE.pal, T = STYLE.type, lw = 220, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX;
    const status = this.ch ? this.ch.status : 'closed', copied = Date.now() - this.copied < 1500, rows = this.lobbyRows(), mode = this.modeNow(), teams = mode === 'teams';
    const y0 = top + 58, BH = 28, BG = 36, bottom = y0 + (rows.length - 1) * BG + BH;            // der rote Kasten reicht bis zur Unterkante des letzten Knopfes
    rows.forEach((r, i) => {
      const label = r === 'start' ? (this.players.length < 2 ? 'START ROUND (2+ PLAYERS)' : 'START ROUND') : r === 'mode' ? (teams ? 'MODE: TEAMS (A / B)' : 'MODE: ALL VS ALL')
        : r === 'rule' ? 'RULES: ' + this.RULE_NAMES[this.ruleNow()] : r === 'equipment' ? 'EQUIPMENT' : r === 'copy' ? (copied ? 'COPIED!' : 'COPY CODE') : 'LEAVE LOBBY';
      drawMenuRow(ctx, y0 + i * BG, label, this.sel === i, { w: lw, h: BH, cx: 40 + lw / 2, hit: () => { this.sel = i; }, lr: r === 'mode' || r === 'rule' });
    });
    uiText(ctx, 'LOBBY CODE', 40 + lw / 2, top + 10, { size: T.small, color: P.grey, align: 'center' });
    uiText(ctx, this.code, 40 + lw / 2, top + 46, { size: T.title * 0.62, color: P.yellow, align: 'center', glow: P.yellow });
    uiPanel(ctx, PX, top, PW, bottom - top, { color: P.red, fill: P.void, alpha: 0.92, glow: true });
    uiText(ctx, 'PLAYERS  ' + this.players.length + ' / ' + Net.MAX_PLAYERS, PX + 14, top + 22, { size: T.h2, color: P.red });
    uiText(ctx, teams ? 'TEAMS' : 'ALL VS ALL', PX + PW - 14, top + 22, { size: T.small, color: P.grey, align: 'right' });
    if (status === 'connecting' || (!this.players.length && status === 'joined')) uiText(ctx, 'CONNECTING...', PX + 14, top + 52, { size: T.body, color: P.grey });
    const sc = this.scores || {};
    this.players.slice(0, Net.MAX_PLAYERS).forEach((p, i) => {
      const y = top + 34 + i * 26, mine = this.ch && p.id === this.ch.id, tcol = teams ? (i % 2 ? P.red : P.cyan) : (mine ? P.cyan : P.greyMid);
      uiPanel(ctx, PX + 10, y, PW - 20, 22, { color: mine ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9 });
      if (teams) uiText(ctx, i % 2 ? 'B' : 'A', PX + 20, y + 16, { size: T.body, color: tcol });
      uiText(ctx, p.name + (mine ? '  (YOU)' : ''), PX + (teams ? 34 : 20), y + 16, { size: T.body, color: mine ? P.ice : P.grey, maxW: PW - 170 });
      uiText(ctx, (sc[p.id] ? sc[p.id] + ' WINS  ' : '') + (p.host ? 'HOST' : ''), PX + PW - 20, y + 16, { size: T.small, color: P.yellow, align: 'right' });
    });
    const hy = top + 34 + Math.min(this.players.length, Net.MAX_PLAYERS) * 26 + 6;
    if (hy < bottom - 26) uiWrap(ctx, this.isHost ? 'Share the code. Everyone who joins appears here. Start the round when you are ready.' : 'Choose your equipment. Only the host can start the round.', PX + 14, hy + 8, PW - 28, 13, { size: T.small, color: P.grey });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'PVP ARENA': 'PVP-ARENA', 'MULTIPLAYER': 'MEHRSPIELER', 'Play with other players online. Pick a multiplayer mode next.': 'Spiele online mit anderen Spielern. Wähle als Nächstes einen Mehrspieler-Modus.', 'Currently: PVP Arena. Needs an internet connection.': 'Aktuell: PvP-Arena. Braucht eine Internetverbindung.', 'Back to the mode selection.': 'Zurück zur Modus-Auswahl.', 'CREATE LOBBY': 'LOBBY ERSTELLEN', 'JOIN LOBBY': 'LOBBY BEITRETEN', 'JOIN': 'BEITRETEN', 'LEAVE LOBBY': 'LOBBY VERLASSEN', 'COPY CODE': 'CODE KOPIEREN', 'COPIED!': 'KOPIERT!',
  'LOBBY CODE': 'LOBBY-CODE', 'ENTER THE LOBBY CODE': 'LOBBY-CODE EINGEBEN', 'TYPE THE CODE (CTRL+V PASTES)': 'CODE TIPPEN (STRG+V FÜGT EIN)', 'TAP THE LETTERS BELOW (OR TYPE, CTRL+V PASTES)': 'BUCHSTABEN UNTEN ANTIPPEN (ODER TIPPEN, STRG+V FÜGT EIN)', 'DEL': 'LÖSCHEN',
  'CONNECTING...': 'VERBINDE...', 'JOINING...': 'TRETE BEI...', 'HOST': 'HOST', '(YOU)': '(DU)', 'CONNECTION FAILED': 'VERBINDUNG FEHLGESCHLAGEN',
  'THE HOST CLOSED THE LOBBY': 'DER HOST HAT DIE LOBBY GESCHLOSSEN', 'THE LOBBY IS FULL': 'DIE LOBBY IST VOLL', 'NO LOBBY WITH THIS CODE': 'KEINE LOBBY MIT DIESEM CODE',
  'NO CONNECTION POSSIBLE ON THIS DEVICE': 'AUF DIESEM GERÄT IST KEINE VERBINDUNG MÖGLICH',
  'Share the code. Everyone who joins appears here. Start the round when you are ready.': 'Teile den Code. Alle, die beitreten, erscheinen hier. Starte die Runde, wenn ihr bereit seid.',
  'Waiting for the host to start the round.': 'Warte darauf, dass der Host die Runde startet.',
  'START ROUND': 'RUNDE STARTEN', 'START ROUND (2+ PLAYERS)': 'RUNDE STARTEN (2+ SPIELER)', 'MODE: TEAMS (A / B)': 'MODUS: TEAMS (A / B)', 'MODE: ALL VS ALL': 'MODUS: JEDER GEGEN JEDEN', 'TEAMS': 'TEAMS', 'ALL VS ALL': 'JEDER GEGEN JEDEN', 'WINS': 'SIEGE',
  'A ROUND IS RUNNING - YOU JOIN THE NEXT ONE': 'EINE RUNDE LÄUFT - DU BIST BEIM NÄCHSTEN DABEI', 'Choose your abilities. Only the host can start the round.': 'Wähle deine Abilities. Nur der Host kann die Runde starten.', 'ABILITIES': 'ABILITIES', 'CHOOSE YOUR ABILITIES': 'WÄHLE DEINE ABILITIES', 'EQUIPMENT': 'AUSRÜSTUNG', 'RULES: OWN EQUIPMENT': 'REGEL: EIGENE AUSRÜSTUNG', 'RULES: ONE SET FOR ALL': 'REGEL: EIN SET FÜR ALLE', 'RULES: PICK A SET': 'REGEL: SET WÄHLEN', 'RULES: ALL EQUIPMENT': 'REGEL: ALLE AUSRÜSTUNG', 'OWN EQUIPMENT': 'EIGENE AUSRÜSTUNG', 'ONE SET FOR ALL': 'EIN SET FÜR ALLE', 'PICK A SET': 'SET WÄHLEN', 'ALL EQUIPMENT': 'ALLE AUSRÜSTUNG', 'HERO': 'HELD', 'EVERYTHING IS UNLOCKED AND AT MAX LEVEL, WITH MAX UPGRADES.': 'ALLES IST FREIGESCHALTET UND AUF MAXIMALER STUFE, MIT MAXIMALEN UPGRADES.', 'ONLY WHAT YOU OWN CAN BE CHOSEN. YOUR UPGRADES AND HERO COUNT. YOUR INVENTORY STAYS UNCHANGED.': 'NUR GEKAUFTES KANN GEWÄHLT WERDEN. DEINE UPGRADES UND DEIN HELD ZÄHLEN. DEIN INVENTAR BLEIBT UNVERÄNDERT.', 'THE HOST CHOSE THIS SET FOR EVERYONE.': 'DER HOST HAT DIESES SET FÜR ALLE GEWÄHLT.', 'NO UPGRADES, LEVEL 0 GEAR, HERO VANGUARD: EVERYONE IS EQUAL.': 'KEINE UPGRADES, AUSRÜSTUNG STUFE 0, HELD VANGUARD: ALLE SIND GLEICH.', 'WEAK': 'SCHWACH', 'MEDIUM': 'MITTEL', 'STRONG': 'STARK', 'CHOOSE YOUR EQUIPMENT': 'WÄHLE DEINE AUSRÜSTUNG', 'WEAPONS & IMPLANT': 'WAFFEN & IMPLANT', 'Choose your equipment. Only the host can start the round.': 'Wähle deine Ausrüstung. Nur der Host kann die Runde starten.', 'ONLY ITEMS AND ABILITIES YOU OWN CAN BE CHOSEN. THIS DOES NOT CHANGE YOUR INVENTORY.': 'NUR GEKAUFTE ITEMS UND ABILITIES KÖNNEN GEWÄHLT WERDEN. DEIN INVENTAR BLEIBT UNVERÄNDERT.', 'NONE': 'KEINE', 'NONE UNLOCKED': 'KEINE FREIGESCHALTET', 'ONLY ABILITIES YOU HAVE UNLOCKED CAN BE CHOSEN.': 'NUR FREIGESCHALTETE ABILITIES KÖNNEN GEWÄHLT WERDEN.', 'YOU NEED AT LEAST 2 PLAYERS': 'DU BRAUCHST MINDESTENS 2 SPIELER',
  'ROUND STARTING - THE ARENA ITSELF COMES IN THE NEXT UPDATE': 'RUNDE STARTET - DIE ARENA SELBST KOMMT IM NÄCHSTEN UPDATE',
  'Back to the mode list.': 'Zurück zur Modusliste.', 'You are the host.': 'Du bist der Host.', "Enter the code of a friend's lobby to join it.": 'Gib den Code der Lobby eines Freundes ein, um beizutreten.',
  'Fight other players in an arena. Create a lobby and share the code, or join a friend with their code.': 'Kämpfe in einer Arena gegen andere Spieler. Erstelle eine Lobby und teile den Code, oder tritt mit dem Code eines Freundes bei.',
  'Up to 4 players, all vs all or in teams. Your own weapons, abilities and upgrades count. Needs an internet connection.': 'Bis zu 4 Spieler, jeder gegen jeden oder in Teams. Deine eigenen Waffen, Abilities und Upgrades zählen. Braucht eine Internetverbindung.',
  'Open a lobby and share the code with your friends (up to # players).': 'Eröffne eine Lobby und teile den Code mit deinen Freunden (bis zu # Spieler).',
});
