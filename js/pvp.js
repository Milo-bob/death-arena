// PvP-Arena: Menues fuer die Lobby (erstellen, per Code beitreten, Spielerliste, Modus, Abilities). Die Verbindung steckt in net.js, der Kampf in pvpmatch.js.
// Nur der Host (Ersteller) darf Modus waehlen und die Runde starten; alle Spieler duerfen ihre Abilities waehlen. Siehe Organise/CLAUDE.md "PvP-Arena".
// Zustaende (Pvp.st): menu (Lobby erstellen / beitreten / zurueck), join (Code eintippen), lobby (Code + Spieler).
// Bedienung: W/S + Leertaste (Maus geht ueberall), im Code-Feld Buchstaben/Ziffern tippen (Strg+V fuegt ein), Rueckschritt loescht, ESC = zurueck.

const Pvp = {
  st: 'menu', sel: 0, code: '', input: '', ch: null, players: [], me: null, isHost: false,
  msg: '', msgCol: null, msgAt: 0, joinAt: 0, hadHost: false, copied: 0, mode: 'ffa', scores: {},

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
    this.scores = {}; this.mode = 'ffa';
    this.code = code; this.isHost = host; this.joinAt = Date.now(); this.hadHost = host; this.st = 'lobby'; this.sel = 0; this.say(host ? '' : 'JOINING...', STYLE.pal.grey);
    this.ch = Net.open(code, { name: this.name(), host, mode: 'ffa' }, {
      onPlayers: (list) => this.onPlayers(list),
      onMessage: (ev, p) => { if (ev === 'start' && !this.isHost) this.roundStart(p); else PvpMatch.onMessage(ev, p); },
      onStatus: (s) => { if (s === 'error' && this.ch) { this.failBack('CONNECTION FAILED'); } },
    });
  },

  // Runde starten (nur der Host): alle in der Lobby bekommen 'start' { mode, order } (Reihenfolge und Modus legt der Host fest, damit Teams bei allen gleich sind)
  roundStart(info) {
    if (info && info.order && this.ch && !info.order.includes(this.ch.id)) { this.say('A ROUND IS RUNNING - YOU JOIN THE NEXT ONE', STYLE.pal.orange); return; }        // spaet beigetreten
    this.st = 'lobby';
    if (PvpMatch.begin(info)) Sfx.play('levelUp'); else this.say('CONNECTION FAILED', STYLE.pal.red);
  },
  startRound() {
    if (!this.isHost || !this.ch) return;
    if (this.players.length < 2) { this.say('YOU NEED AT LEAST 2 PLAYERS', STYLE.pal.orange); Sfx.play('deny'); return; }
    const info = { mode: this.mode, order: this.players.slice(0, Net.MAX_PLAYERS).map((p) => p.id) };
    this.ch.send('start', info); this.roundStart(info);
  },
  // Modus: der Host waehlt (jeder gegen jeden / Teams), alle sehen ihn ueber die Anwesenheit des Hosts
  modeNow() { if (this.isHost) return this.mode; const h = this.players.find((p) => p.host); return h && h.mode === 'teams' ? 'teams' : 'ffa'; },
  toggleMode() { if (!this.isHost || !this.ch) return; this.mode = this.mode === 'teams' ? 'ffa' : 'teams'; this.ch.update({ mode: this.mode }); Sfx.play('select'); },
  lobbyRows() { return this.isHost ? ['start', 'mode', 'abilities', 'copy', 'leave'] : ['abilities', 'copy', 'leave']; },

  // ---- Abilities fuer den Kampf: je Gruppe (weak/medium/strong) eine GEKAUFTE Ability oder keine ----
  tierList(tier) { return [null].concat(Object.keys(CFG.loadout.abilities).filter((id) => CFG.loadout.abilities[id].tier === tier && Save.isUnlocked(id))); },
  loadout() {
    const S = Save.data.pvpLoadout || {}, out = {};
    for (const t of CFG.loadout.tiers) out[t.id] = S[t.id] && this.tierList(t.id).includes(S[t.id]) ? S[t.id] : null;
    return out;
  },
  cycle(i, d) {
    const t = CFG.loadout.tiers[i], list = this.tierList(t.id), cur = this.loadout()[t.id], n = list.length;
    Save.data.pvpLoadout = Object.assign({}, this.loadout(), { [t.id]: list[(list.indexOf(cur) + d + n) % n] });
    Save.write(); Sfx.play('select');
  },

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
      if (Input.pressed('Escape')) { G.mode = 'modeselect'; return; }
      if (go) {
        const r = rows[this.sel];
        if (r === 'create') this.connect(Net.newCode(), true);
        else if (r === 'join') { this.st = 'join'; this.sel = 0; this.input = ''; this.say(''); }
        else G.mode = 'modeselect';
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
      const n = CFG.loadout.tiers.length + 1;
      if (up) this.sel = (this.sel + n - 1) % n;
      if (dn) this.sel = (this.sel + 1) % n;
      if (this.sel < n - 1) {
        if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.cycle(this.sel, -1);
        if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.cycle(this.sel, 1);
      }
      if (Input.pressed('Escape') || (go && this.sel === n - 1)) { this.st = 'lobby'; this.sel = 1; return; }
      if (go && this.sel < n - 1) this.cycle(this.sel, 1);
    } else if (this.st === 'lobby') {
      const lr = this.lobbyRows(); if (up) this.sel = (this.sel + lr.length - 1) % lr.length; if (dn) this.sel = (this.sel + 1) % lr.length;
      this.sel = Math.min(this.sel, lr.length - 1);
      if (!this.isHost && this.ch && this.ch.status === 'joined' && !this.hadHost && Date.now() - this.joinAt > 2500) { this.failBack('NO LOBBY WITH THIS CODE'); return; }       // niemand hat sich als Host eingetragen
      if (Input.pressed('Escape')) { this.leave(); return; }
      if (lr[this.sel] === 'mode' && (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('ArrowRight') || Input.pressed('KeyD'))) this.toggleMode();
      if (go) {
        const r = lr[this.sel];
        if (r === 'start') this.startRound();
        else if (r === 'mode') this.toggleMode();
        else if (r === 'abilities') { this.st = 'loadout'; this.sel = 0; }
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
      UIHit.add(x0, 108, Net.CODE_LEN * (bw + gap), 44, () => { this.sel = 0; });
      for (let i = 0; i < Net.CODE_LEN; i++) {
        const x = x0 + i * (bw + gap), cur = i === this.input.length;
        uiPanel(ctx, x, 108, bw, 44, { color: cur && Math.floor(G.realTime * 2) % 2 ? P.yellow : this.sel === 0 ? P.cyan : P.greyMid, fill: P.void, alpha: 0.95 });
        if (this.input[i]) uiText(ctx, this.input[i], x + bw / 2, 140, { size: T.h1, color: P.ice, align: 'center' });
      }
      uiText(ctx, 'TYPE THE CODE (CTRL+V PASTES)', cx, 170, { size: T.small, color: P.grey, align: 'center' });
      ['JOIN', 'BACK'].forEach((l, i) => drawMenuRow(ctx, 190 + i * 44, l, this.sel === i + 1 || (i === 0 && this.sel === 0), { w: 220, h: 34, cx, hit: () => { this.sel = i + 1; } }));
    } else if (this.st === 'loadout') {
      this.drawLoadout(ctx);
    } else {
      this.drawLobby(ctx, top);
    }
    if (this.msg) uiText(ctx, this.msg, cx, 338, { size: T.body, color: this.msgCol || P.orange, align: 'center' });
  },

  drawLoadout(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2, L = this.loadout(), tiers = CFG.loadout.tiers, w = 440, x0 = cx - w / 2, H = 46, G2 = 54, y0 = 92;
    uiText(ctx, 'CHOOSE YOUR ABILITIES', cx, 80, { size: T.h2, color: P.ice, align: 'center' });
    tiers.forEach((t, i) => {
      const y = y0 + i * G2, sel = this.sel === i, id = L[t.id], A = id ? CFG.loadout.abilities[id] : null, n = this.tierList(t.id).length - 1;
      UIHit.add(x0, y, w, H, () => { this.sel = i; });
      uiPanel(ctx, x0, y, w, H, { color: sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.92, glow: sel });
      uiText(ctx, t.label + '  [' + t.key.toUpperCase() + ']', x0 + 12, y + 17, { size: T.small, color: P.grey });
      if (A) drawIcon(ctx, A.icon, x0 + 40, y + 32, 20);
      uiText(ctx, A ? A.name : (n ? 'NONE' : 'NONE UNLOCKED'), x0 + (A ? 58 : 12), y + 36, { size: T.h2, color: A ? P.ice : P.greyMid, maxW: w - 130 });
      if (n > 0) {
        UIHit.add(x0 + w - 70, y, 35, H, () => { this.sel = i; }, { act: () => this.cycle(i, -1) });
        UIHit.add(x0 + w - 35, y, 35, H, () => { this.sel = i; }, { act: () => this.cycle(i, 1) });
        uiText(ctx, '<', x0 + w - 52, y + 31, { size: T.h1, color: sel ? P.cyan : P.grey, align: 'center' });
        uiText(ctx, '>', x0 + w - 17, y + 31, { size: T.h1, color: sel ? P.cyan : P.grey, align: 'center' });
      }
    });
    const by = y0 + tiers.length * G2 + 4;
    drawMenuRow(ctx, by, 'BACK', this.sel === tiers.length, { w: 200, h: 30, cx, hit: () => { this.sel = tiers.length; } });
    const cur = this.sel < tiers.length && L[tiers[this.sel].id] ? CFG.loadout.abilities[L[tiers[this.sel].id]] : null;
    if (cur) uiWrap(ctx, cur.desc, x0, by + 44, w, 13, { size: T.small, color: P.grey });
    else uiText(ctx, 'ONLY ABILITIES YOU HAVE UNLOCKED CAN BE CHOSEN.', cx, by + 52, { size: T.small, color: P.greyMid, align: 'center' });
  },

  drawLobby(ctx, top) {
    const P = STYLE.pal, T = STYLE.type, lw = 220, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX;
    const status = this.ch ? this.ch.status : 'closed', copied = Date.now() - this.copied < 1500, rows = this.lobbyRows(), mode = this.modeNow(), teams = mode === 'teams';
    const y0 = top + 58, BH = 28, BG = 36, bottom = y0 + (rows.length - 1) * BG + BH;            // der rote Kasten reicht bis zur Unterkante des letzten Knopfes
    rows.forEach((r, i) => {
      const label = r === 'start' ? (this.players.length < 2 ? 'START ROUND (2+ PLAYERS)' : 'START ROUND') : r === 'mode' ? (teams ? 'MODE: TEAMS (A / B)' : 'MODE: ALL VS ALL')
        : r === 'abilities' ? 'ABILITIES' : r === 'copy' ? (copied ? 'COPIED!' : 'COPY CODE') : 'LEAVE LOBBY';
      drawMenuRow(ctx, y0 + i * BG, label, this.sel === i, { w: lw, h: BH, cx: 40 + lw / 2, hit: () => { this.sel = i; }, lr: r === 'mode' });
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
    if (hy < bottom - 26) uiWrap(ctx, this.isHost ? 'Share the code. Everyone who joins appears here. Start the round when you are ready.' : 'Choose your abilities. Only the host can start the round.', PX + 14, hy + 8, PW - 28, 13, { size: T.small, color: P.grey });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'PVP ARENA': 'PVP-ARENA', 'CREATE LOBBY': 'LOBBY ERSTELLEN', 'JOIN LOBBY': 'LOBBY BEITRETEN', 'JOIN': 'BEITRETEN', 'LEAVE LOBBY': 'LOBBY VERLASSEN', 'COPY CODE': 'CODE KOPIEREN', 'COPIED!': 'KOPIERT!',
  'LOBBY CODE': 'LOBBY-CODE', 'ENTER THE LOBBY CODE': 'LOBBY-CODE EINGEBEN', 'TYPE THE CODE (CTRL+V PASTES)': 'CODE TIPPEN (STRG+V FÜGT EIN)',
  'CONNECTING...': 'VERBINDE...', 'JOINING...': 'TRETE BEI...', 'HOST': 'HOST', '(YOU)': '(DU)', 'CONNECTION FAILED': 'VERBINDUNG FEHLGESCHLAGEN',
  'THE HOST CLOSED THE LOBBY': 'DER HOST HAT DIE LOBBY GESCHLOSSEN', 'THE LOBBY IS FULL': 'DIE LOBBY IST VOLL', 'NO LOBBY WITH THIS CODE': 'KEINE LOBBY MIT DIESEM CODE',
  'NO CONNECTION POSSIBLE ON THIS DEVICE': 'AUF DIESEM GERÄT IST KEINE VERBINDUNG MÖGLICH',
  'Share the code. Everyone who joins appears here. Start the round when you are ready.': 'Teile den Code. Alle, die beitreten, erscheinen hier. Starte die Runde, wenn ihr bereit seid.',
  'Waiting for the host to start the round.': 'Warte darauf, dass der Host die Runde startet.',
  'START ROUND': 'RUNDE STARTEN', 'START ROUND (2+ PLAYERS)': 'RUNDE STARTEN (2+ SPIELER)', 'MODE: TEAMS (A / B)': 'MODUS: TEAMS (A / B)', 'MODE: ALL VS ALL': 'MODUS: JEDER GEGEN JEDEN', 'TEAMS': 'TEAMS', 'ALL VS ALL': 'JEDER GEGEN JEDEN', 'WINS': 'SIEGE',
  'A ROUND IS RUNNING - YOU JOIN THE NEXT ONE': 'EINE RUNDE LÄUFT - DU BIST BEIM NÄCHSTEN DABEI', 'Choose your abilities. Only the host can start the round.': 'Wähle deine Abilities. Nur der Host kann die Runde starten.', 'ABILITIES': 'ABILITIES', 'CHOOSE YOUR ABILITIES': 'WÄHLE DEINE ABILITIES', 'NONE': 'KEINE', 'NONE UNLOCKED': 'KEINE FREIGESCHALTET', 'ONLY ABILITIES YOU HAVE UNLOCKED CAN BE CHOSEN.': 'NUR FREIGESCHALTETE ABILITIES KÖNNEN GEWÄHLT WERDEN.', 'YOU NEED AT LEAST 2 PLAYERS': 'DU BRAUCHST MINDESTENS 2 SPIELER',
  'ROUND STARTING - THE ARENA ITSELF COMES IN THE NEXT UPDATE': 'RUNDE STARTET - DIE ARENA SELBST KOMMT IM NÄCHSTEN UPDATE',
  'Back to the mode list.': 'Zurück zur Modusliste.', 'You are the host.': 'Du bist der Host.', "Enter the code of a friend's lobby to join it.": 'Gib den Code der Lobby eines Freundes ein, um beizutreten.',
  'Fight other players in an arena. Create a lobby and share the code, or join a friend with their code.': 'Kämpfe in einer Arena gegen andere Spieler. Erstelle eine Lobby und teile den Code, oder tritt mit dem Code eines Freundes bei.',
  'Up to 4 players, all vs all or in teams. Your own weapons, abilities and upgrades count. Needs an internet connection.': 'Bis zu 4 Spieler, jeder gegen jeden oder in Teams. Deine eigenen Waffen, Abilities und Upgrades zählen. Braucht eine Internetverbindung.',
  'Open a lobby and share the code with your friends (up to # players).': 'Eröffne eine Lobby und teile den Code mit deinen Freunden (bis zu # Spieler).',
});
