// Gildenraum: die Raumschiff-Zentrale der Gilde (erreichbar im Bildschirm FRIENDS > GUILD, Knopf GUILD ROOM / Taste G).
// Stationen: GUILD CHEST (gemeinsamer Credit-Topf, Tresor ausbauen, Wochenbelohnung abholen), CREW TERMINAL (Mitglieder, Rollen, Einladen, Rauswerfen),
// COMMS (Schnell-Chat: nur vorgefertigte Saetze und Emotes, kein freier Text). Oben die Wochenziele. Die Daten kommen aus Social.guild (guild_info),
// Server: tools/supabase_guildroom.sql (Rollen Anfuehrer/Offizier/Mitglied, guild_deposit, guild_vault_up, guild_role, guild_say, guild_chat_get).
// Bedienung: A/D oder Pfeile = Station, Leertaste = oeffnen (oder C/T/M), ESC = zurueck. In den Fenstern W/S + Leertaste, ESC schliesst.

const GuildRoom = {
  st: 'room',                     // room | chest | crew | comms
  sel: 1, psel: 0, off: 0, ask: null,
  chat: [], chatId: 0, chatAt: 0, sayAt: 0, loadingChat: false, missing: false,
  STATIONS: [{ id: 'chest', x: 110, label: 'GUILD CHEST', key: 'C', code: 'KeyC' }, { id: 'crew', x: 320, label: 'CREW TERMINAL', key: 'T', code: 'KeyT' }, { id: 'comms', x: 530, label: 'COMMS', key: 'M', code: 'KeyM' }],
  // Schnell-Chat: 0-15 Saetze, 16-19 Emotes (Nummer geht zum Server, kein Text)
  PHRASES: ['HELLO!', 'GG!', 'NICE RUN!', 'THANKS!', 'LET\'S GO!', 'WHO PLAYS?', 'COOP ANYONE?', 'PVP ANYONE?', 'JOIN MY LOBBY', 'NEED HELP', 'BOSS DOWN!', 'OOPS...', 'WELL DONE!', 'BRB', 'GOOD LUCK', 'BYE!'],
  EMOTES: [
    ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],                            // Herz
    ['.XXXXX.', 'XXXXXXX', 'X.XXX.X', 'XXXXXXX', '.XX.XX.', '.X.X.X.'],                            // Totenkopf
    ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '.XX.XX.', 'XX...XX'],                            // Stern
    ['.XXXXX.', 'X.XXX.X', 'XXXXXXX', 'X.XXX.X', 'XX...XX', '.XXXXX.'],                            // Lachen
  ],
  EMOTE_COL: ['red', 'ice', 'yellow', 'green'],
  DEPOSITS: [50, 200, 1000], DEP_CAP: 5000,
  ROLE_TXT: { leader: 'LEADER', officer: 'OFFICER', member: 'MEMBER' },

  get g() { return Social.guild; },
  myRole() { const g = this.g; return !g ? 'member' : g.myRole || (g.leader ? 'leader' : 'member'); },
  isBoss() { const r = this.myRole(); return r === 'leader' || r === 'officer'; },
  roleOf(m) { return m.role || (m.leader ? 'leader' : 'member'); },
  say(t, col) { Social.say(t, col); },

  open() {
    if (!this.g) return;
    G.mode = 'guildroom'; this.st = 'room'; this.psel = 0; this.off = 0; this.ask = null;
    this.chat = []; this.chatId = 0; this.chatAt = 0; Social.loadGuild(); this.loadChat();
  },
  close() { G.mode = 'friends'; Social.tab = 1; this.ask = null; },

  // ---- Server ----
  async rpc(fn, args) {
    const r = await Social.rpc(fn, args);
    if (!r.ok && /could not find the function|schema cache/i.test(String((r.json && (r.json.message || r.json.msg)) || '')) || r.status === 404) { this.missing = true; r.err = 'GUILD ROOM IS NOT SET UP ON THE SERVER YET (RUN supabase_guildroom.sql)'; }
    return r;
  },
  async loadChat() {
    if (this.loadingChat || this.missing || !Social.on) return;
    this.loadingChat = true; this.chatAt = Date.now();
    try {
      const r = await this.rpc('guild_chat_get', { p_after: this.chatId });
      if (r.ok && Array.isArray(r.json)) {
        for (const x of r.json) if (x.cid > this.chatId) { this.chat.push({ id: x.cid, name: String(x.cname || '?').toUpperCase(), msg: x.cmsg | 0, uid: x.cuid }); this.chatId = x.cid; }
        this.chat = this.chat.slice(-40);
      } else if (r.err) Social.error = r.err;
    } finally { this.loadingChat = false; }
  },
  async send(n) {
    const now = Date.now();
    if (now - this.sayAt < 2000) { this.say('SLOW DOWN A BIT', STYLE.pal.orange); Sfx.play('deny'); return; }
    this.sayAt = now;
    const r = await this.rpc('guild_say', { p_msg: n });
    if (r.ok && r.json === 'ok') { Sfx.play('tick'); await this.loadChat(); }
    else { this.say(r.ok ? 'COULD NOT SEND (' + r.json + ')' : r.err, STYLE.pal.red); Sfx.play('deny'); }
  },
  async deposit(n) {
    if ((Save.data.souls || 0) < n) { this.say('NOT ENOUGH CREDITS', STYLE.pal.orange); Sfx.play('deny'); return; }
    const r = await this.rpc('guild_deposit', { p_amount: n });
    if (r.ok && r.json === 'ok') { Save.data.souls -= n; Save.write(); this.say('+' + n + ' CREDITS FOR THE GUILD', STYLE.pal.green); Sfx.play('levelUp'); }
    else this.say(r.ok ? { limit: 'DAILY LIMIT REACHED (' + this.DEP_CAP + ' CREDITS PER DAY)', no: 'NOT POSSIBLE RIGHT NOW', bad: 'BAD AMOUNT' }[r.json] || 'NOT POSSIBLE' : r.err, STYLE.pal.red);
    await Social.loadGuild();
  },
  async upgrade() {
    const r = await this.rpc('guild_vault_up');
    const T = { ok: 'VAULT UPGRADED', poor: 'NOT ENOUGH CREDITS IN THE CHEST', max: 'VAULT IS AT MAXIMUM', no: 'ONLY LEADER AND OFFICERS CAN DO THIS' };
    this.say(r.ok ? T[r.json] || 'DONE' : r.err, r.ok && r.json === 'ok' ? STYLE.pal.yellow : STYLE.pal.red);
    if (r.ok && r.json === 'ok') Sfx.play('levelUp'); else Sfx.play('deny');
    await Social.loadGuild();
  },
  async setRole(m, role) {
    const r = await this.rpc('guild_role', { p_uid: m.uid, p_role: role });
    const T = { ok: role === 'officer' ? m.name.toUpperCase() + ' IS NOW AN OFFICER' : m.name.toUpperCase() + ' IS A MEMBER AGAIN', max: 'AT MOST 3 OFFICERS', no: 'NOT POSSIBLE', bad: 'NOT POSSIBLE' };
    this.say(r.ok ? T[r.json] || 'DONE' : r.err, r.ok && r.json === 'ok' ? STYLE.pal.green : STYLE.pal.red);
    await Social.loadGuild();
  },

  // ---- Auswahl ----
  openPanel(id) { this.st = id; this.psel = 0; this.off = 0; this.ask = null; Sfx.play('select'); Social.msg = ''; if (id === 'comms') this.loadChat(); },
  chestItems() {
    const g = this.g, P = STYLE.pal, items = [];
    for (const n of this.DEPOSITS) items.push({ label: 'DEPOSIT ' + n, col: P.green, ok: (Save.data.souls || 0) >= n, fn: () => this.deposit(n) });
    items.push({ label: g.vaultCost ? 'UPGRADE VAULT  -' + g.vaultCost : 'VAULT AT MAXIMUM', col: P.yellow, ok: this.isBoss() && !!g.vaultCost && g.pot >= g.vaultCost, fn: () => this.upgrade() });
    const n = Social.claimable();
    items.push({ label: 'CLAIM WEEKLY REWARD', col: P.cyan, ok: n > 0, fn: () => Social.claim() });
    items.push({ label: 'BACK', col: P.grey, ok: true, fn: () => { this.st = 'room'; } });
    return items;
  },
  member() { const g = this.g; return g ? g.members[Math.min(this.psel, g.members.length - 1)] : null; },
  // Aktionen fuer das gewaehlte Mitglied im Crew-Fenster
  crewActions() {
    const g = this.g, m = this.member(), P = STYLE.pal, me = Social.myUid(), A = [];
    if (!m || m.uid === me) return A;
    const r = this.roleOf(m), mine = this.myRole();
    if (m.online) A.push({ label: 'INVITE', key: 'I', code: 'KeyI', col: P.cyan, fn: () => Social.inviteUid(m.uid, m.name.toUpperCase()) });
    if (mine === 'leader' && r !== 'leader') A.push({ label: r === 'officer' ? 'MAKE MEMBER' : 'MAKE OFFICER', key: 'P', code: 'KeyP', col: P.green, fn: () => this.setRole(m, r === 'officer' ? 'member' : 'officer') });
    if ((mine === 'leader' && r !== 'leader') || (mine === 'officer' && r === 'member')) A.push({ label: this.ask === 'k' + m.uid ? 'SURE?' : 'KICK', key: 'X', code: 'KeyX', col: P.red, fn: () => this.kick(m) });
    return A;
  },
  async kick(m) {
    if (this.ask !== 'k' + m.uid) { this.ask = 'k' + m.uid; Sfx.play('tick'); return; }
    this.ask = null; const r = await this.rpc('guild_kick', { p_uid: m.uid });
    this.say(r.ok ? m.name.toUpperCase() + ' WAS REMOVED' : r.err, r.ok ? STYLE.pal.grey : STYLE.pal.red); await Social.loadGuild();
  },

  // ---- Eingabe ----
  update() {
    if (Social.el) return;
    const g = this.g;
    if (Input.pressed('Escape')) { if (this.st === 'room') this.close(); else { this.st = 'room'; this.ask = null; Sfx.play('select'); } return; }
    if (!g) { this.close(); return; }
    const now = Date.now();
    if (now - this.chatAt > (this.st === 'comms' ? 4000 : 9000)) this.loadChat();
    if (Social.msg && now - Social.msgAt > 7000) Social.msg = '';
    const left = Input.pressed('ArrowLeft') || Input.pressed('KeyA'), right = Input.pressed('ArrowRight') || Input.pressed('KeyD');
    const up = Input.pressed('ArrowUp') || Input.pressed('KeyW'), down = Input.pressed('ArrowDown') || Input.pressed('KeyS');
    const ok = Input.pressed('Space') || Input.pressed('Enter');
    if (this.st === 'room') {
      const n = this.STATIONS.length;
      if (left) { this.sel = (this.sel + n - 1) % n; Sfx.play('tick'); }
      if (right) { this.sel = (this.sel + 1) % n; Sfx.play('tick'); }
      if (ok) this.openPanel(this.STATIONS[this.sel].id);
      this.STATIONS.forEach((s, i) => { if (Input.pressed(s.code)) { this.sel = i; this.openPanel(s.id); } });
    } else if (this.st === 'chest') {
      const items = this.chestItems(), n = items.length;
      if (up) { this.psel = (this.psel + n - 1) % n; Sfx.play('tick'); }
      if (down) { this.psel = (this.psel + 1) % n; Sfx.play('tick'); }
      if (ok) this.useItem(items[this.psel]);
    } else if (this.st === 'crew') {
      const n = g.members.length;
      if (up) { this.psel = (this.psel + n - 1) % n; this.ask = null; Sfx.play('tick'); }
      if (down) { this.psel = (this.psel + 1) % n; this.ask = null; Sfx.play('tick'); }
      this.psel = Math.min(this.psel, n - 1);
      const acts = this.crewActions();
      for (const a of acts) if (Input.pressed(a.code)) a.fn();
      if (ok && acts[0]) acts[0].fn();
    } else if (this.st === 'comms') {
      const n = 20, c = 4;
      if (left) this.psel = (this.psel + n - 1) % n;
      if (right) this.psel = (this.psel + 1) % n;
      if (up) this.psel = (this.psel + n - c) % n;
      if (down) this.psel = (this.psel + c) % n;
      if (ok) this.send(this.psel);
    }
  },
  useItem(it) { if (!it) return; if (it.ok) it.fn(); else { Sfx.play('deny'); if (it.label.startsWith('UPGRADE')) this.say(this.isBoss() ? 'NOT ENOUGH CREDITS IN THE CHEST' : 'ONLY LEADER AND OFFICERS CAN UPGRADE', STYLE.pal.orange); else if (it.label.startsWith('CLAIM')) this.say('NOTHING TO CLAIM YET (GOAL NOT REACHED OR UNDER 100 OWN POINTS)', STYLE.pal.orange); } },

  // ---- Zeichnen: Szene ----
  roleCol(r) { const P = STYLE.pal; return r === 'leader' ? P.yellow : r === 'officer' ? P.cyan : P.ice; },
  chatText(c) { return c.msg < 16 ? I18n.t(this.PHRASES[c.msg] || '?') : ''; },
  drawEmote(ctx, n, x, y, s) {
    const P = STYLE.pal, E = this.EMOTES[n - 16]; if (!E) return;
    ctx.fillStyle = P[this.EMOTE_COL[n - 16]];
    E.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === 'X') ctx.fillRect(x + rx * s, y + ry * s, s, s); });
  },
  shipPx(ctx, x, y, col, s) {
    const rows = ['..X..', '.XXX.', 'XXXXX', 'X.X.X'];
    ctx.fillStyle = col; rows.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] === 'X') ctx.fillRect(Math.round(x + (rx - 2.5) * s), Math.round(y + ry * s), s, s); });
  },
  drawScene(ctx, t) {
    const P = STYLE.pal, W = STAGE_W, H = STAGE_H;
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.void; ctx.fillRect(0, 0, W, 214);                                            // Rueckwand
    ctx.fillStyle = P.voidLight; for (let x = 0; x <= W; x += 80) { ctx.fillRect(x, 0, 2, 214); for (const y of [30, 108, 186]) ctx.fillRect(x - 2, y, 6, 6); }
    ctx.fillRect(0, 100, W, 2); ctx.fillRect(0, 210, W, 4);
    ctx.fillStyle = P.cyanDark; ctx.globalAlpha = 0.5; ctx.fillRect(0, 214, W, 2); ctx.globalAlpha = 1;
    // Panoramafenster mit Sternen und Planet
    const wx = 186, wy = 62, ww = 268, wh = 100;
    ctx.fillStyle = P.cyanDark; ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    ctx.fillStyle = '#04050c'; ctx.fillRect(wx, wy, ww, wh);
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    for (let i = 0; i < 46; i++) {
      const sp = 3 + (i % 4) * 4, sx = ((i * 97 + 31) % ww) - ((t * sp) % ww), x = wx + (sx < 0 ? sx + ww : sx), y = wy + ((i * 53 + 7) % wh);
      ctx.globalAlpha = 0.35 + (i % 3) * 0.25; ctx.fillStyle = i % 5 === 0 ? P.yellow : P.ice; ctx.fillRect(Math.round(x), y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    const px = wx + ww - 6, py = wy + wh - 4, pr = 34;                                                    // Planet (3 Toene, Pixelraster)
    for (let j = -pr; j <= pr; j += 2) { const w = Math.floor(Math.sqrt(pr * pr - j * j)); for (let i = -w; i <= w; i += 2) { const sh = (i + j * 0.6) / pr; ctx.fillStyle = sh > 0.35 ? P.violet : sh > -0.25 ? P.purple : P.cyanDark; ctx.fillRect(px + i, py + j, 2, 2); } }
    ctx.restore();
    ctx.fillStyle = P.cyan; ctx.globalAlpha = 0.5; ctx.fillRect(wx, wy, ww, 1); ctx.fillRect(wx, wy + wh - 1, ww, 1); ctx.globalAlpha = 1;
    // Boden mit Perspektiv-Gitter
    ctx.fillStyle = '#080a18'; ctx.fillRect(0, 216, W, H - 216);
    ctx.strokeStyle = P.cyanDark; ctx.lineWidth = 1; ctx.globalAlpha = 0.45; ctx.beginPath();
    for (let k = 1; k <= 7; k++) { const y = 216 + (k * k) * 3; ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    for (let k = -10; k <= 10; k++) { ctx.moveTo(W / 2 + k * 18, 216); ctx.lineTo(W / 2 + k * 70, H); }
    ctx.stroke(); ctx.globalAlpha = 1;
    this.drawProps(ctx, t);
    // Mannschaft: online-Mitglieder (und du selbst) schweben vor dem Fenster
    const g = this.g, me = Social.myUid(); if (!g) return;
    const crew = g.members.filter((m) => m.online || m.uid === me).slice(0, 8);
    crew.forEach((m, i) => {
      const x = wx + 24 + (i + 0.5) * ((ww - 48) / Math.max(crew.length, 1)), y = wy + 22 + Math.sin(t * 1.4 + i * 1.7) * 3, col = this.roleCol(this.roleOf(m));
      if (m.uid === me) { ctx.fillStyle = col; ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 4); ctx.fillRect(Math.round(x) - 14, Math.round(y) - 5, 28, 24); ctx.globalAlpha = 1; }
      this.shipPx(ctx, x, y, col, 3);
      ctx.fillStyle = P.orange; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 20 + i); ctx.fillRect(Math.round(x) - 2, Math.round(y) + 13, 4, 3); ctx.globalAlpha = 1;
      uiText(ctx, m.name.toUpperCase(), x, y + 28, { size: STYLE.type.small, color: m.uid === me ? P.white : P.grey, align: 'center', maxW: 52 });
    });
  },
  // Einrichtung: Bildschirme, Rohre, Lampen, Kisten, Tanks, Drohne und laufende Crew, damit die Zentrale belebt wirkt
  drawProps(ctx, t) {
    const P = STYLE.pal, W = STAGE_W, f = (c, a, x, y, w, h) => { ctx.fillStyle = c; ctx.globalAlpha = a; ctx.fillRect(Math.round(x), Math.round(y), w, h); ctx.globalAlpha = 1; };
    const blink = (i, per) => Math.floor(t * 2 + i * 1.3) % per === 0;
    // Deckenlampen mit Lichtkegel
    for (const lx of [90, 320, 550]) { f(P.greyDark, 1, lx - 14, 0, 28, 6); f(blink(lx, 9) ? P.yellow : P.ice, 0.9, lx - 10, 6, 20, 2); f(P.ice, 0.05, lx - 24, 8, 48, 90); f(P.ice, 0.04, lx - 14, 8, 28, 90); }
    // Kabel und Rohre an der Wand
    for (const [y, c] of [[16, P.greyDark], [24, P.cyanDark], [34, P.purple]]) { f(c, 1, 0, y, 182, 3); f(c, 1, 458, y, 182, 3); }
    for (const x of [30, 62, 120, 590, 612]) f(P.greyDark, 1, x, 16, 3, 150);
    // linker Bildschirm: Balkendiagramm
    f(P.cyanDark, 1, 12, 62, 100, 70); f(P.ink, 1, 16, 66, 92, 62);
    for (let i = 0; i < 9; i++) { const h = 8 + Math.round((Math.sin(t * 1.3 + i * 1.1) * 0.5 + 0.5) * 38); f(i % 3 === 0 ? P.yellow : P.cyan, 0.8, 21 + i * 10, 124 - h, 7, h); }
    f(P.cyan, 0.4, 16, 66, 92, 1);
    // rechter Bildschirm: Radar mit Schwenk
    f(P.cyanDark, 1, 528, 62, 100, 70); f(P.ink, 1, 532, 66, 92, 62);
    const rcx = 578, rcy = 97;
    ctx.strokeStyle = P.cyan; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(rcx, rcy, 24, 0, 7); ctx.moveTo(rcx - 28, rcy); ctx.lineTo(rcx + 28, rcy); ctx.moveTo(rcx, rcy - 28); ctx.lineTo(rcx, rcy + 28); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(rcx, rcy); ctx.lineTo(rcx + Math.cos(t * 1.6) * 26, rcy + Math.sin(t * 1.6) * 26); ctx.stroke(); ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) f(P.orange, 0.5 + 0.5 * Math.sin(t * 3 + i * 2), rcx + [-14, 9, 16, -5][i], rcy + [8, -12, 10, -16][i], 3, 3);
    // Statusleuchten und Lüftungsgitter unter den Bildschirmen
    for (let i = 0; i < 6; i++) { f([P.green, P.yellow, P.cyan][i % 3], blink(i, 4) ? 1 : 0.25, 18 + i * 9, 140, 5, 5); f([P.cyan, P.orange, P.green][i % 3], blink(i + 3, 5) ? 1 : 0.25, 534 + i * 9, 140, 5, 5); }
    for (let k = 0; k < 5; k++) { f(P.greyDark, 1, 18, 156 + k * 7, 86, 3); f(P.greyDark, 1, 534, 156 + k * 7, 86, 3); }
    // Warnstreifen am Wandfuss
    for (let x = 0; x < W; x += 16) { f(P.yellow, 0.55, x, 206, 8, 4); f(P.ink, 1, x + 8, 206, 8, 4); }
    // Kisten und Fässer am Rand, Tanks zwischen den Stationen
    f(P.greyDark, 1, 2, 262, 22, 24); f(P.orange, 0.8, 2, 262, 22, 3); f(P.orange, 0.8, 2, 283, 22, 3); f(P.greyMid, 1, 6, 270, 14, 2);
    f(P.greyDark, 1, 4, 242, 16, 20); f(P.cyan, 0.6, 4, 242, 16, 2);
    f(P.greyDark, 1, 616, 258, 20, 28); f(P.cyan, 0.7, 616, 262, 20, 2); f(P.cyan, 0.7, 616, 280, 20, 2); f(P.red, blink(5, 3) ? 1 : 0.3, 624, 270, 4, 4);
    for (const tx of [215, 425]) {
      f(P.greyMid, 1, tx - 7, 222, 14, 4); f(P.greyMid, 1, tx - 7, 296, 14, 4); f('#04141a', 1, tx - 5, 226, 10, 70);
      const lv = 40 + Math.round(Math.sin(t * 0.8 + tx) * 6); f(tx < 320 ? P.cyan : P.violet, 0.55, tx - 5, 296 - lv, 10, lv); f(P.ice, 0.5, tx - 3, 226, 1, 68);
      for (let k = 0; k < 3; k++) f(P.ice, 0.7, tx - 3 + (k * 3 + 1) % 7, 292 - ((t * (10 + k * 4) + k * 17) % lv), 2, 2);
    }
    // Wartungsdrohne schwebt durch den Raum
    const dx = 320 + Math.sin(t * 0.35) * 250, dy = 186 + Math.sin(t * 1.7) * 3;
    f(P.greyMid, 1, dx - 6, dy, 12, 5); f(P.cyan, 1, dx - 2, dy + 1, 4, 2); f(P.greyDark, 1, dx - 9, dy - 2, 18, 1); f(P.cyan, 0.2, dx - 4, dy + 5, 8, 10);
    this.drawBanner(ctx, t, f); this.drawTrophies(ctx, t, f);
    // Crew läuft am Boden: online aktiv, offline schlafend (dunkel)
    const g = this.g; if (!g) return;
    const me = Social.myUid(), body = ['.XXX.', 'XVVVX', '.XXX.', 'XXXXX', 'X.X.X', 'X...X'];
    g.members.slice(0, 20).forEach((m, i) => {
      const on = m.online || m.uid === me, pos = (i * 47) % 340, hx = pos < 170 ? 16 + pos : 456 + pos - 170, x = on ? hx + Math.sin(t * 0.5 + i * 2.1) * 12 : hx, y = 341 + (i % 2) * 3, dir = Math.cos(t * 0.5 + i * 2.1) >= 0 ? 1 : -1, step = on && Math.floor(t * 4 + i) % 2 === 0;
      ctx.globalAlpha = on ? 1 : 0.3;
      body.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] !== '.') {
        const px = Math.round(x + (dir > 0 ? rx : 4 - rx) * 2 - 5), py = y + ry * 2 - (ry === 5 && step ? 0 : 0);
        ctx.fillStyle = row[rx] === 'V' ? P.cyan : this.roleCol(this.roleOf(m)); ctx.fillRect(px, py + (ry >= 4 && step && rx % 2 ? -1 : 0), 2, 2);
      } });
      ctx.globalAlpha = 1;
      if (m.uid === me) { f(P.white, 0.8 + 0.2 * Math.sin(t * 5), x - 2, y - 6, 4, 2); }
    });
  },
  // Gildenbanner: Farbe und Wappen werden aus dem Tag abgeleitet (jede Gilde sieht anders aus), weht leicht
  drawBanner(ctx, t, f) {
    const P = STYLE.pal, g = this.g; if (!g) return;
    let h = 7; for (const ch of String(g.tag)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const col = [P.cyanDark, P.purple, '#7a3a14', '#1f6a3a', '#7a1f2a', P.violet][h % 6], x0 = 130, w = 38, top = 66, hgt = 76;
    f(P.grey, 1, x0 - 6, top - 3, w + 12, 3); f(P.yellow, 1, x0 - 8, top - 4, 3, 5); f(P.yellow, 1, x0 + w + 5, top - 4, 3, 5);
    for (let y = 0; y < hgt; y += 2) {
      const sway = Math.round(Math.sin(t * 1.4 + y * 0.07) * (y / hgt) * 2.2), cut = y > hgt - 14 ? Math.round((y - (hgt - 14)) / 14 * (w / 2)) : 0;
      if (cut >= w / 2) break;
      const lx = x0 + sway, mid = lx + w / 2;
      f(col, 1, lx + (y > hgt - 14 ? 0 : 0), top + y, w, 2);
      if (cut) { f(P.void, 1, mid - cut / 2 - 0, top + y, cut, 2); }                                 // Schwalbenschwanz am unteren Ende
      f(P.yellow, 0.85, lx, top + y, 2, 2); f(P.yellow, 0.85, lx + w - 2, top + y, 2, 2);
    }
    const sway = Math.round(Math.sin(t * 1.4 + 20 * 0.07) * (20 / hgt) * 2.2), ex = x0 + sway + (w - 20) / 2, ey = top + 12;       // 5x5-Wappen, an der Mittelachse gespiegelt
    ctx.fillStyle = P.yellow;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((h >> (r * 3 + c)) & 1 || (r === 2 && c === 2)) { ctx.fillRect(ex + c * 4, ey + r * 4, 4, 4); if (c < 2) ctx.fillRect(ex + (4 - c) * 4, ey + r * 4, 4, 4); }
    uiText(ctx, g.tag, x0 + sway + w / 2, top + 50, { size: STYLE.type.small, color: P.white, align: 'center', maxW: w - 4 });
  },
  // Trophäen-Regal: großer Pokal für den Wochenrang (Gold/Silber/Bronze für Platz 1-3), kleine Pokale für die Wochenziele
  drawTrophies(ctx, t, f) {
    const P = STYLE.pal, g = this.g; if (!g) return;
    const cup = ['X.XXX.X', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...', '..XXX..'];
    const draw = (cx, y, sc, col, a) => { ctx.fillStyle = col; ctx.globalAlpha = a; cup.forEach((row, ry) => { for (let rx = 0; rx < 7; rx++) if (row[rx] === 'X') ctx.fillRect(Math.round(cx + (rx - 3.5) * sc), y + ry * sc, sc, sc); }); ctx.globalAlpha = 1; };
    const rank = g.rank | 0, medal = rank === 1 ? '#ffd23d' : rank === 2 ? '#c8d0e0' : rank === 3 ? '#c8803a' : null, cx = 494;
    f(P.greyMid, 1, 464, 120, 60, 3); f(P.greyDark, 1, 464, 123, 60, 2);
    if (medal) { f(medal, 0.12 + 0.06 * Math.sin(t * 2.5), cx - 14, 96, 28, 24); if (rank === 1) f(P.white, 0.5 + 0.5 * Math.sin(t * 4), cx + 9 + Math.round(Math.sin(t) * 2), 98, 2, 2); }
    draw(cx, 100, 3, medal || P.greyMid, medal ? 1 : 0.6);
    f(P.greyDark, 1, cx - 5, 118, 10, 2);
    uiText(ctx, '#' + (rank || '-'), cx, 133, { size: STYLE.type.small, color: medal || P.grey, align: 'center' });
    f(P.greyMid, 1, 464, 154, 60, 3); f(P.greyDark, 1, 464, 157, 60, 2);
    const tiers = g.tiers.slice(0, 4);
    tiers.forEach((tr, i) => draw(473 + i * 15, 142, 2, tr.claimed ? P.cyan : tr.reached ? P.yellow : P.greyMid, tr.reached ? 1 : 0.5));
  },
  drawStations(ctx, t) {
    const P = STYLE.pal, T = STYLE.type, g = this.g, n = Social.claimable(), pul = 0.5 + 0.5 * Math.sin(t * 3);
    this.STATIONS.forEach((s, i) => {
      const on = i === this.sel && this.st === 'room', x = s.x, base = 270;
      UIHit.add(x - 84, 176, 168, 126, () => { this.sel = i; }, { act: () => { this.sel = i; this.openPanel(s.id); } });
      // Schein unter der Station
      ctx.fillStyle = on ? P.yellow : P.cyan; ctx.globalAlpha = on ? 0.14 + 0.06 * pul : 0.07;
      for (let k = 0; k < 3; k++) ctx.fillRect(x - 70 + k * 8, base + 14 + k * 5, 140 - k * 16, 4); ctx.globalAlpha = 1;
      if (s.id === 'chest') {
        const hot = n > 0 || g.pot > 0, col = hot ? P.yellow : P.orange, lid = n > 0 ? Math.round(3 + pul * 3) : 0;
        ctx.fillStyle = P.greyDark; ctx.fillRect(x - 34, base - 24, 68, 38);                           // Truhe
        ctx.fillStyle = col; ctx.fillRect(x - 34, base - 24, 68, 3); ctx.fillRect(x - 34, base - 24, 3, 38); ctx.fillRect(x + 31, base - 24, 3, 38); ctx.fillRect(x - 34, base + 11, 68, 3); ctx.fillRect(x - 3, base - 8, 6, 8);
        ctx.fillStyle = P.greyMid; ctx.fillRect(x - 31, base - 40 - lid, 62, 16); ctx.fillStyle = col; ctx.fillRect(x - 31, base - 40 - lid, 62, 3); ctx.fillRect(x - 31, base - 27 - lid, 62, 3);
        if (lid) { ctx.fillStyle = P.yellow; ctx.globalAlpha = 0.5 + 0.4 * pul; for (let k = 0; k < 6; k++) ctx.fillRect(x - 24 + k * 9, base - 36 - lid + ((k * 5 + Math.floor(t * 8)) % 6), 3, 3); ctx.globalAlpha = 1; }
        uiText(ctx, g.pot + ' CREDITS', x, base - 52 - lid, { size: T.body, color: P.yellow, align: 'center', glow: hot ? P.orange : undefined });
        if (n > 0) uiText(ctx, '! ' + n + ' READY', x, base - 64 - lid + Math.round(pul * -2), { size: T.small, color: P.cyan, align: 'center' });
      } else if (s.id === 'crew') {
        ctx.fillStyle = P.greyDark; ctx.fillRect(x - 30, base + 2, 60, 12); ctx.fillStyle = P.cyan; ctx.fillRect(x - 30, base + 2, 60, 2); ctx.fillRect(x - 12, base - 14, 24, 16);
        const N = g.members.length;                                                                  // Hologramm: ein Punkt pro Mitglied auf dem Ring
        ctx.fillStyle = P.cyan; ctx.globalAlpha = 0.2; ctx.fillRect(x - 28, base - 34, 56, 18); ctx.globalAlpha = 1;
        g.members.forEach((m, k) => {
          const a = t * 0.9 + k / N * Math.PI * 2, mx = Math.round(x + Math.cos(a) * 24), my = Math.round(base - 26 + Math.sin(a) * 6);
          ctx.fillStyle = this.roleCol(this.roleOf(m)); ctx.globalAlpha = m.online ? 1 : 0.4; ctx.fillRect(mx - 1, my - 1, 3, 3); ctx.globalAlpha = 1;
        });
        uiText(ctx, g.n + '/20 CREW', x, base - 46, { size: T.body, color: P.cyan, align: 'center' });
      } else {
        ctx.fillStyle = P.greyDark; ctx.fillRect(x - 44, base - 22, 88, 36); ctx.fillStyle = P.cyan; ctx.fillRect(x - 44, base - 22, 88, 2);
        ctx.fillStyle = '#04141a'; ctx.fillRect(x - 38, base - 18, 76, 26);
        ctx.fillStyle = P.cyan; ctx.globalAlpha = 0.45; for (let k = 0; k < 4; k++) ctx.fillRect(x - 34, base - 14 + k * 6, 20 + ((k * 13 + Math.floor(t * 2)) % 40), 2); ctx.globalAlpha = 1;
        const last = this.chat.slice(-3);                                                            // letzte Nachrichten als Sprechblasen ueber der Konsole
        last.forEach((c, k) => {
          const y = base - 50 - (last.length - 1 - k) * 14, head = c.name + ': ', col = k === last.length - 1 ? P.ice : P.grey;
          uiText(ctx, head, x - 74, y, { size: T.small, color: col, maxW: 80 });
          const hx = x - 74 + this.nameW(ctx, head);
          if (c.msg < 16) uiText(ctx, this.chatText(c), hx, y, { size: T.small, color: col, maxW: 150 - (hx - (x - 74)) });
          else this.drawEmote(ctx, c.msg, hx, y - 7, 1);
        });
        if (!last.length) uiText(ctx, 'NO MESSAGES YET', x, base - 50, { size: T.small, color: P.greyMid, align: 'center' });
      }
      uiText(ctx, s.label, x, 316, { size: T.h2, color: on ? P.yellow : P.ice, align: 'center', glow: on ? P.orange : undefined });
      uiText(ctx, '[' + s.key + ']' + (on ? '  OPEN' : ''), x, 330, { size: T.small, color: on ? P.cyan : P.greyMid, align: 'center' });
      if (on) { ctx.fillStyle = P.yellow; for (const [cx, cy, sx, sy] of [[x - 80, 180, 1, 1], [x + 80, 180, -1, 1], [x - 80, 300, 1, -1], [x + 80, 300, -1, -1]]) { ctx.fillRect(cx, cy, sx * 10, sy * 2); ctx.fillRect(cx, cy, sx * 2, sy * 10); } }
    });
  },
  nameW(ctx, s) { ctx.save(); ctx.font = uiFont(STYLE.type.small); const w = ctx.measureText(I18n.t(s)).width; ctx.restore(); return Math.min(w, 120); },
  drawHeader(ctx) {
    const P = STYLE.pal, T = STYLE.type, g = this.g, W = 590;
    uiPanel(ctx, 8, 6, W - 8, 24, { color: P.purple, fill: P.void, alpha: 0.92 });
    uiText(ctx, '[' + g.tag + '] ' + g.name.toUpperCase(), 18, 23, { size: T.h2, color: P.yellow, maxW: 250 });
    uiText(ctx, I18n.t('YOUR ROLE') + ': ' + I18n.t(this.ROLE_TXT[this.myRole()]), W - 10, 23, { size: T.small, color: this.roleCol(this.myRole()), align: 'right' });
    uiText(ctx, I18n.t('WEEK RANK') + ' ' + g.rank, W - 150, 23, { size: T.small, color: P.cyan, align: 'right' });
    // Wochenziele als Balken mit den Belohnungsstufen
    const bx = 18, bw = W - 28, by = 41, last = Math.max(1, g.tiers.length ? g.tiers[g.tiers.length - 1].goal : 1), f = Math.min(1, g.points / last);
    ctx.fillStyle = P.greyDark; ctx.fillRect(bx, by, bw, 7); ctx.fillStyle = P.cyan; ctx.fillRect(bx, by, Math.round(bw * f), 7);
    g.tiers.forEach((t) => { const mx = bx + Math.round(bw * t.goal / last) - 1; ctx.fillStyle = t.claimed ? P.greyMid : t.reached ? P.yellow : P.ice; ctx.fillRect(mx - 1, by - 3, 3, 13); });
    uiText(ctx, g.points + ' ' + I18n.t('PTS THIS WEEK') + '   ' + g.daysLeft + ' ' + I18n.t(g.daysLeft === 1 ? 'DAY LEFT' : 'DAYS LEFT') + '   +' + g.vault * 10 + '% ' + I18n.t('VAULT BONUS'), bx, by + 19, { size: T.small, color: P.grey });
  },

  // ---- Zeichnen: Fenster ----
  panel(ctx, title, col) {
    const P = STYLE.pal, T = STYLE.type;
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.62; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.globalAlpha = 1;
    UIHit.list.length = 0;                                                                            // darunter ist nichts klickbar (drawCloseX kommt danach wieder hinein)
    uiPanel(ctx, 70, 50, 500, 262, { color: col, fill: P.void, alpha: 0.97, glow: true });
    uiText(ctx, title, 88, 78, { size: T.h1, color: col });
  },
  drawChest(ctx, t) {
    const P = STYLE.pal, T = STYLE.type, g = this.g, items = this.chestItems();
    this.panel(ctx, 'GUILD CHEST', P.yellow);
    uiText(ctx, g.pot + '', 88, 130, { size: T.title, color: P.yellow, glow: P.orange });
    uiText(ctx, 'CREDITS IN THE CHEST', 88, 146, { size: T.small, color: P.grey });
    uiText(ctx, I18n.t('VAULT') + ' ' + g.vault + ' / 5', 88, 172, { size: T.h2, color: P.cyan });
    uiBar(ctx, 88, 178, 150, 8, g.vault / 5, P.cyan);
    uiText(ctx, '+' + g.vault * 10 + '% ' + I18n.t('ON ALL WEEKLY REWARDS'), 88, 202, { size: T.small, color: P.ice });
    uiText(ctx, g.vaultCost ? I18n.t('NEXT LEVEL') + ': ' + g.vaultCost + ' ' + I18n.t('CREDITS') : I18n.t('MAXIMUM LEVEL'), 88, 216, { size: T.small, color: g.vaultCost && g.pot >= g.vaultCost ? P.green : P.grey });
    uiText(ctx, I18n.t('YOU PUT IN TODAY') + ': ' + g.depToday + ' / ' + this.DEP_CAP, 88, 238, { size: T.small, color: P.grey });
    uiText(ctx, I18n.t('YOUR CREDITS') + ': ' + (Save.data.souls || 0), 88, 252, { size: T.small, color: P.yellow });
    uiText(ctx, I18n.t('ONLY LEADER AND OFFICERS CAN UPGRADE THE VAULT'), 88, 288, { size: T.small, color: P.greyMid, maxW: 230 });
    const cx = 440;
    items.forEach((it, i) => {
      const y = 92 + i * 30, on = i === this.psel;
      drawMenuRow(ctx, y, it.label, on, { w: 230, h: 24, cx, size: T.body, locked: false, hit: () => { this.psel = i; } });
      UIHit.add(cx - 115, y, 230, 24, () => { this.psel = i; }, { act: () => { this.psel = i; this.useItem(it); } });
      if (!it.ok) { ctx.fillStyle = P.void; ctx.globalAlpha = 0.5; ctx.fillRect(cx - 114, y + 1, 228, 22); ctx.globalAlpha = 1; }
    });
    this.drawMsg(ctx, 304);
  },
  drawCrew(ctx) {
    const P = STYLE.pal, T = STYLE.type, g = this.g, me = Social.myUid(), vis = 10, DY = 18, y0 = 92, X = 86, W = 290;
    this.panel(ctx, 'CREW TERMINAL', P.cyan);
    const n = g.members.length; this.psel = Math.min(this.psel, n - 1);
    this.off = clamp(this.off, Math.max(0, this.psel - vis + 1), Math.min(this.psel, Math.max(0, n - vis)));
    g.members.slice(this.off, this.off + vis).forEach((m, k) => {
      const i = this.off + k, y = y0 + k * DY, on = i === this.psel, r = this.roleOf(m);
      UIHit.add(X - 4, y, W + 8, DY - 2, () => { this.psel = i; this.ask = null; }, { noConfirm: true });
      if (on) { ctx.fillStyle = P.voidLight; ctx.fillRect(X - 4, y, W + 8, DY - 2); }
      ctx.fillStyle = m.online ? P.green : P.greyMid; ctx.fillRect(X, y + 5, 6, 6);
      uiText(ctx, m.name.toUpperCase() + (m.uid === me ? ' *' : ''), X + 14, y + 12, { size: T.body, color: on ? P.ice : P.white, maxW: 130 });
      uiText(ctx, I18n.t(this.ROLE_TXT[r]), X + 160, y + 12, { size: T.small, color: this.roleCol(r) });
      uiText(ctx, m.points + ' ' + I18n.t('PTS'), X + W, y + 12, { size: T.small, color: P.grey, align: 'right' });
    });
    if (n > vis) uiText(ctx, (this.off + 1) + '-' + Math.min(n, this.off + vis) + ' / ' + n, X + W, y0 + vis * DY + 8, { size: T.small, color: P.greyMid, align: 'right' });
    const m = this.member(), acts = this.crewActions(), cx = 480;
    if (m) {
      uiText(ctx, m.name.toUpperCase(), cx, 108, { size: T.h2, color: P.ice, align: 'center', maxW: 160 });
      uiText(ctx, I18n.t(this.ROLE_TXT[this.roleOf(m)]) + '  -  ' + (m.online ? I18n.t(Social.actText(m.activity === 'run' || m.activity === 'lobby' ? m.activity : 'menu')) : I18n.t('OFFLINE')), cx, 122, { size: T.small, color: m.online ? P.green : P.grey, align: 'center', maxW: 170 });
      this.shipPx(ctx, cx, 134, this.roleCol(this.roleOf(m)), 4);
    }
    acts.forEach((a, i) => {
      const y = 170 + i * 30;
      UIHit.add(cx - 80, y, 160, 24, () => {}, { act: () => a.fn() });
      uiPanel(ctx, cx - 80, y, 160, 24, { color: a.col, fill: P.void, alpha: 0.9 });
      uiText(ctx, I18n.t(a.label) + '  [' + a.key + ']', cx, y + 16, { size: T.body, color: a.col, align: 'center' });
    });
    if (m && !acts.length) uiText(ctx, m.uid === me ? 'THAT IS YOU' : 'NO ACTIONS FOR THIS PLAYER', cx, 190, { size: T.small, color: P.greyMid, align: 'center' });
    uiText(ctx, '[W/S] ' + I18n.t('SELECT') + '   LEADER: ' + I18n.t('PROMOTE OFFICERS (MAX 3)') + '   ' + I18n.t('OFFICERS CAN KICK MEMBERS'), 88, 296, { size: T.small, color: P.greyMid, maxW: 470 });
    this.drawMsg(ctx, 308);
  },
  drawComms(ctx) {
    const P = STYLE.pal, T = STYLE.type, me = Social.myUid();
    this.panel(ctx, 'COMMS', P.cyan);
    const lines = this.chat.slice(-5);
    uiPanel(ctx, 84, 88, 472, 72, { color: P.cyanDark, fill: '#04141a', alpha: 0.95 });
    if (!lines.length) uiText(ctx, 'NO MESSAGES YET  -  SAY SOMETHING', 320, 128, { size: T.small, color: P.greyMid, align: 'center' });
    lines.forEach((c, k) => {
      const y = 102 + k * 13, self = c.uid === me, head = c.name + ': ';
      uiText(ctx, head, 92, y, { size: T.small, color: self ? P.yellow : P.cyan, maxW: 150 });
      if (c.msg < 16) uiText(ctx, this.chatText(c), 92 + this.nameW(ctx, head), y, { size: T.small, color: P.ice, maxW: 340 });
      else this.drawEmote(ctx, c.msg, 92 + this.nameW(ctx, head), y - 7, 1);
    });
    const cw = 114, ch = 20, gx = 88, gy = 166;
    for (let i = 0; i < 20; i++) {
      const x = gx + (i % 4) * (cw + 6), y = gy + Math.floor(i / 4) * (ch + 5), on = i === this.psel;
      UIHit.add(x, y, cw, ch, () => { this.psel = i; }, { act: () => { this.psel = i; this.send(i); } });
      uiPanel(ctx, x, y, cw, ch, { color: on ? P.cyan : P.greyMid, fill: on ? P.voidLight : P.void, alpha: 0.92, glow: on });
      if (i < 16) uiText(ctx, this.PHRASES[i], x + cw / 2, y + 14, { size: T.small, color: on ? P.ice : P.grey, align: 'center', maxW: cw - 8 });
      else this.drawEmote(ctx, i, Math.round(x + cw / 2 - 7), y + 4, 2);
    }
    uiText(ctx, '[ARROWS] ' + I18n.t('SELECT') + '   [SPACE] ' + I18n.t('SEND') + '   ' + I18n.t('ONE MESSAGE EVERY 2 SECONDS'), 88, 298, { size: T.small, color: P.greyMid, maxW: 470 });
    this.drawMsg(ctx, 309);
  },
  drawMsg(ctx, y) { const P = STYLE.pal, line = Social.msg || Social.error; if (line) uiText(ctx, line, 320, y, { size: STYLE.type.small, color: Social.msg ? Social.msgCol || P.cyan : P.red, align: 'center', maxW: 480 }); },

  draw(ctx) {
    const g = this.g, t = G.realTime, P = STYLE.pal, T = STYLE.type;
    this.drawScene(ctx, t);
    if (!g) return;
    this.drawStations(ctx, t);
    this.drawHeader(ctx);
    const line = Social.msg || Social.error;
    if (this.st === 'room') {
      if (line) uiText(ctx, line, STAGE_W / 2, 349, { size: T.small, color: Social.msg ? Social.msgCol || P.cyan : P.red, align: 'center', maxW: STAGE_W - 40 });
      else uiText(ctx, '[A/D] ' + I18n.t('SELECT STATION') + '    [SPACE] ' + I18n.t('OPEN') + '    [ESC] ' + I18n.t('BACK'), STAGE_W / 2, 349, { size: T.small, color: P.greyMid, align: 'center' });
    } else if (this.st === 'chest') this.drawChest(ctx, t);
    else if (this.st === 'crew') this.drawCrew(ctx);
    else this.drawComms(ctx);
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'GUILD ROOM': 'GILDENRAUM', 'GUILD CHEST': 'GILDENKISTE', 'CREW TERMINAL': 'CREW-TERMINAL', 'COMMS': 'FUNK', 'CREDITS IN THE CHEST': 'CREDITS IN DER KISTE',
  'DEPOSIT 50': '50 EINZAHLEN', 'DEPOSIT 200': '200 EINZAHLEN', 'DEPOSIT 1000': '1000 EINZAHLEN', 'VAULT AT MAXIMUM': 'TRESOR AUF MAXIMUM', 'CLAIM WEEKLY REWARD': 'WOCHENBELOHNUNG ABHOLEN', 'BACK': 'ZURÜCK',
  'MAKE OFFICER': 'ZUM OFFIZIER MACHEN', 'MAKE MEMBER': 'ZUM MITGLIED MACHEN', 'LEADER': 'ANFÜHRER', 'OFFICER': 'OFFIZIER', 'MEMBER': 'MITGLIED', 'YOUR ROLE': 'DEINE ROLLE',
  'NOT ENOUGH CREDITS': 'NICHT GENUG CREDITS', 'NOT ENOUGH CREDITS IN THE CHEST': 'NICHT GENUG CREDITS IN DER KISTE', 'VAULT UPGRADED': 'TRESOR AUSGEBAUT', 'VAULT IS AT MAXIMUM': 'TRESOR IST AUF MAXIMUM',
  'ONLY LEADER AND OFFICERS CAN DO THIS': 'NUR ANFÜHRER UND OFFIZIERE KÖNNEN DAS', 'ONLY LEADER AND OFFICERS CAN UPGRADE': 'NUR ANFÜHRER UND OFFIZIERE KÖNNEN AUSBAUEN',
  'ONLY LEADER AND OFFICERS CAN UPGRADE THE VAULT': 'NUR ANFÜHRER UND OFFIZIERE KÖNNEN DEN TRESOR AUSBAUEN', 'AT MOST 3 OFFICERS': 'HÖCHSTENS 3 OFFIZIERE', 'NOT POSSIBLE': 'GEHT NICHT', 'NOT POSSIBLE RIGHT NOW': 'GERADE NICHT MÖGLICH',
  'NOTHING TO CLAIM YET (GOAL NOT REACHED OR UNDER 100 OWN POINTS)': 'NOCH NICHTS ZUM ABHOLEN (ZIEL NICHT ERREICHT ODER UNTER 100 EIGENEN PUNKTEN)', 'SLOW DOWN A BIT': 'ETWAS LANGSAMER',
  'GUILD ROOM IS NOT SET UP ON THE SERVER YET (RUN supabase_guildroom.sql)': 'GILDENRAUM IST AUF DEM SERVER NOCH NICHT EINGERICHTET (supabase_guildroom.sql AUSFÜHREN)',
  'NO MESSAGES YET': 'NOCH KEINE NACHRICHTEN', 'NO MESSAGES YET  -  SAY SOMETHING': 'NOCH KEINE NACHRICHTEN  -  SAG ETWAS', 'THAT IS YOU': 'DAS BIST DU', 'NO ACTIONS FOR THIS PLAYER': 'KEINE AKTIONEN FÜR DIESEN SPIELER',
  'NEXT LEVEL': 'NÄCHSTE STUFE', 'MAXIMUM LEVEL': 'HÖCHSTE STUFE', 'CREDITS': 'CREDITS', 'YOU PUT IN TODAY': 'HEUTE EINGEZAHLT', 'YOUR CREDITS': 'DEINE CREDITS', 'VAULT': 'TRESOR', 'ON ALL WEEKLY REWARDS': 'AUF ALLE WOCHENBELOHNUNGEN',
  'VAULT BONUS': 'TRESOR-BONUS', 'PTS THIS WEEK': 'PKT DIESE WOCHE', 'SELECT': 'WÄHLEN', 'SEND': 'SENDEN', 'OPEN': 'ÖFFNEN', 'SELECT STATION': 'STATION WÄHLEN', 'PROMOTE OFFICERS (MAX 3)': 'OFFIZIERE ERNENNEN (MAX 3)', 'OFFICERS CAN KICK MEMBERS': 'OFFIZIERE DÜRFEN MITGLIEDER RAUSWERFEN',
  'ONE MESSAGE EVERY 2 SECONDS': 'EINE NACHRICHT ALLE 2 SEKUNDEN', 'IN A RUN': 'IM LAUF',
  'HELLO!': 'HALLO!', 'GG!': 'GG!', 'NICE RUN!': 'GUTER LAUF!', 'THANKS!': 'DANKE!', 'LET\'S GO!': 'LOS GEHT\'S!', 'WHO PLAYS?': 'WER SPIELT?', 'COOP ANYONE?': 'JEMAND KOOP?', 'PVP ANYONE?': 'JEMAND PVP?', 'JOIN MY LOBBY': 'KOMM IN MEINE LOBBY',
  'NEED HELP': 'BRAUCHE HILFE', 'BOSS DOWN!': 'BOSS BESIEGT!', 'OOPS...': 'UPS...', 'WELL DONE!': 'GUT GEMACHT!', 'BRB': 'GLEICH ZURÜCK', 'GOOD LUCK': 'VIEL GLÜCK', 'BYE!': 'TSCHÜSS!', 'WAS REMOVED': 'WURDE ENTFERNT',
});
if (typeof I18n !== 'undefined' && I18n.phrases) I18n.phrases([['CREDITS FOR THE GUILD', 'CREDITS FÜR DIE GILDE'], ['IS NOW AN OFFICER', 'IST JETZT OFFIZIER'], ['IS A MEMBER AGAIN', 'IST WIEDER MITGLIED'], ['DAILY LIMIT REACHED', 'TAGESGRENZE ERREICHT'], ['CREDITS PER DAY', 'CREDITS PRO TAG'], ['READY', 'BEREIT'], ['CREW', 'CREW'], ['DEPOSIT', 'EINZAHLEN'], ['UPGRADE VAULT', 'TRESOR AUSBAUEN'], ['WAS REMOVED', 'WURDE ENTFERNT']]);
