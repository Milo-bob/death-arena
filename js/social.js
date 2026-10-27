// Freunde, Einladungen und Gilden (Hauptmenü > FRIENDS). Alles läuft über die Funktionen aus tools/supabase_social.sql (RPC), der Name kommt vom Konto.
//  - Freunde: per Name hinzufügen (Anfrage), annehmen/ablehnen, entfernen; online = in den letzten 100 s gemeldet (soc_ping alle 40 s).
//  - Einladungen: INVITE legt eine Lobby an (oder nutzt die offene) und schickt den Code an den Freund; der Freund holt sie alle 10 s im Menü ab
//    und sieht unten "NAME INVITES YOU" (J = beitreten, K = ablehnen, oder klicken).
//  - Gilden: eine pro Spieler, bis 20 Mitglieder. Jeder gemeldete Lauf (Kills + 25 pro Boss) zählt für die Wochenpunkte der Gilde,
//    ab drei Wochenzielen (Basis x Mitgliederzahl 3-10) gibt es einmal pro Woche Credits (CLAIM). Wochenwechsel ist Montag.
// Ohne Konto oder ohne eingerichtete Datenbank zeigt der Bildschirm nur einen Hinweis.
// Bedienung: Q/E, A/D oder Tab = Reiter, W/S = Zeile, Leertaste = Hauptaktion (INVITE, ACCEPT, JOIN), X = Zweitaktion (REMOVE, DECLINE, KICK), ESC = zurück.

const Social = {
  friends: [], guild: undefined, found: [], top: [], invites: [],             // guild: undefined = noch nicht geladen, null = keine Gilde
  tab: 0, sel: 0, back: 'start', msg: '', msgCol: null, msgAt: 0, error: '', ask: null, missing: false,
  pingAt: 0, pollAt: 0, listAt: 0, guildAt: 0, pinged: false, busy: {}, el: null,
  TABS: ['FRIENDS', 'GUILD', 'TOP GUILDS'],
  MENU_MODES: ['start', 'friends', 'modeselect', 'mapselect', 'pvp', 'cosmetics', 'inventory', 'upgrades', 'achievements', 'leaderboard', 'settings'],

  get on() { return typeof Account !== 'undefined' && Account.configured && Account.on; },

  async rpc(fn, args) {
    const r = await Account.rest('POST', '/rest/v1/rpc/' + fn, args || {});
    if (!r.ok) {
      const m = String((r.json && (r.json.message || r.json.msg)) || '');
      if (r.status === 404 || /could not find the function|schema cache/i.test(m)) { this.missing = true; r.err = 'FRIENDS AND GUILDS ARE NOT SET UP ON THE SERVER YET'; }
      else r.err = Account.errText(r);
    }
    return r;
  },
  say(t, col) { this.msg = t; this.msgCol = col || null; this.msgAt = Date.now(); },
  activity() { return ['play', 'pause', 'pick', 'swap'].includes(G.mode) ? 'run' : (typeof Pvp !== 'undefined' && Pvp.ch ? 'lobby' : 'menu'); },
  actText(a) { return a === 'run' ? 'IN A RUN' : a === 'lobby' ? 'IN A LOBBY' : 'ONLINE'; },
  myUid() { return Account.meta && Account.meta.uid; },
  ownPoints() { const g = this.guild, me = this.myUid(); const m = g && g.members.find((x) => x.uid === me); return m ? m.points : 0; },
  claimable() { const g = this.guild; return g && this.ownPoints() >= 100 ? g.tiers.filter((t) => t.reached && !t.claimed).length : 0; },
  badge() { return this.on && !this.missing && (this.friends.some((f) => f.state === 'incoming') || this.claimable() > 0); },       // roter Punkt am Hauptmenü-Knopf

  // ---- jedes Bild aus G.update: Anwesenheit melden, Einladungen abholen, Listen im Hintergrund aktuell halten ----
  tick(mode) {
    if (!this.on || this.missing || (typeof document !== 'undefined' && document.hidden)) return;
    const now = Date.now();
    if (now - this.pingAt > 40000) { this.pingAt = now; this.rpc('soc_ping', { p_activity: this.activity() }).then((r) => { if (r.ok) this.pinged = true; }); }
    if (!this.MENU_MODES.includes(mode)) return;
    if (now - this.pollAt > 10000) {
      this.pollAt = now;
      this.rpc('invite_poll').then((r) => { if (r.ok && Array.isArray(r.json)) r.json.forEach((i) => this.addInvite(i)); });
    }
    if (mode === 'friends') { if (now - this.listAt > 30000) this.loadFriends(); if (this.tab === 1 && now - this.guildAt > 30000) this.loadGuild(); }
    else if (mode === 'start') { if (now - this.listAt > 60000) this.loadFriends(); if (now - this.guildAt > 120000) this.loadGuild(); }
  },
  addInvite(i) {
    if (!i || !i.icode || (typeof Pvp !== 'undefined' && Pvp.code === i.icode) || this.invites.some((x) => x.code === i.icode)) return;
    this.invites.push({ from: String(i.ifrom || '?').toUpperCase(), code: i.icode, game: i.igame === 'pvp' ? 'pvp' : 'coop', until: Date.now() + 25000 });
    this.invites = this.invites.slice(-3); Sfx.play('levelUp');
  },
  acceptInvite() {
    const inv = this.invites.shift(); if (!inv) return;
    if (!Net.available) { this.say('NO CONNECTION POSSIBLE ON THIS DEVICE', STYLE.pal.red); return; }
    G.mode = 'pvp'; Pvp.open(inv.game); Pvp.connect(inv.code, false);
  },
  // Tasten J / K (nicht beim Eintippen eines Lobby-Codes, dort sind es Buchstaben)
  keys() {
    const inv = this.invites[0]; if (!inv || !this.MENU_MODES.includes(G.mode)) return;
    if (Date.now() > inv.until) { this.invites.shift(); return; }
    if (G.mode === 'pvp' && Pvp.st === 'join') return;
    if (Input.pressed('KeyJ')) this.acceptInvite(); else if (Input.pressed('KeyK')) this.invites.shift();
  },
  drawInvite(ctx) {
    const inv = this.invites[0]; if (!inv || !this.MENU_MODES.includes(G.mode)) return;
    const P = STYLE.pal, T = STYLE.type, up = G.mode === 'friends', w = up ? 196 : 320, h = 34, x = up ? STAGE_W - w - 38 : (STAGE_W - w) / 2, y = up ? 8 : STAGE_H - h - 8, pulse = 0.6 + 0.4 * Math.sin(G.realTime * 5);
    uiPanel(ctx, x, y, w, h, { color: P.green, fill: P.void, alpha: 0.97, glow: true });
    uiText(ctx, inv.from + ' INVITES YOU (' + (inv.game === 'pvp' ? 'PVP' : 'CO-OP') + ')', x + 10, y + 14, { size: T.body, color: P.ice, maxW: w - 20 });
    UIHit.add(x + 8, y + 18, w / 2 - 14, 14, () => {}, { act: () => this.acceptInvite() });
    UIHit.add(x + w / 2 + 6, y + 18, w / 2 - 14, 14, () => {}, { act: () => this.invites.shift() });
    uiText(ctx, '[J] JOIN', x + 10, y + 29, { size: T.small, color: P.green });
    uiText(ctx, '[K] IGNORE', x + w / 2 + 6, y + 29, { size: T.small, color: P.grey });
    ctx.save(); ctx.globalAlpha = pulse; ctx.fillStyle = P.green; ctx.fillRect(x + w - 14, y + 8, 6, 6); ctx.restore();
  },

  // ---- Laden ----
  async guarded(key, fn) { if (this.busy[key]) return; this.busy[key] = true; try { await fn(); } finally { this.busy[key] = false; } },
  loadFriends() {
    if (!this.on) return;
    return this.guarded('friends', async () => {
      if (!this.pinged) {                                                       // das Profil muss einmal angelegt sein, sonst findet dich niemand
        const p = await this.rpc('soc_ping', { p_activity: this.activity() });
        if (!p.ok) { this.error = p.err; return; }
        this.pinged = true; this.pingAt = Date.now();
      }
      const r = await this.rpc('friend_list');
      if (r.ok && Array.isArray(r.json)) { this.friends = r.json.map((x) => ({ uid: x.fuid, name: String(x.fname).toUpperCase(), state: x.fstate, online: !!x.fonline, act: x.factivity })); this.error = ''; }
      else this.error = r.err || '';
      this.listAt = Date.now();
    });
  },
  loadGuild() {
    if (!this.on) return;
    return this.guarded('guild', async () => {
      const r = await this.rpc('guild_info');
      if (!r.ok) { this.error = r.err || ''; return; }
      this.guild = r.json && typeof r.json === 'object' ? r.json : null; this.guildAt = Date.now(); this.error = '';
      if (!this.guild) await this.loadFound('');
      else this.sel = Math.min(this.sel, this.guild.members.length - 1);
    });
  },
  async loadFound(q) {
    const r = await this.rpc('guild_search', { p_q: q || '' });
    if (r.ok && Array.isArray(r.json)) this.found = r.json.map((x) => ({ id: x.gid, name: String(x.gname), tag: String(x.gtag), n: x.gmembers, pts: x.gpoints }));
    else this.error = r.err || '';
  },
  loadTop() {
    if (!this.on) return;
    return this.guarded('top', async () => {
      const r = await this.rpc('guild_top', { p_limit: 20 });
      if (r.ok && Array.isArray(r.json)) this.top = r.json.map((x) => ({ rank: Number(x.grank), name: String(x.gname), tag: String(x.gtag), n: x.gmembers, pts: x.gpoints }));
      else this.error = r.err || '';
    });
  },
  refresh() { this.loadFriends(); this.loadGuild(); if (this.tab === 2) this.loadTop(); this.say('REFRESHING...', STYLE.pal.grey); setTimeout(() => { if (this.msg === 'REFRESHING...') this.say(''); }, 900); },

  // ---- Freunde ----
  addFriend() {
    this.form('ADD FRIEND', [{ ph: 'PLAYER NAME', max: 20 }], 'SEND REQUEST', async (v) => {
      const name = v[0].trim().toLowerCase(); if (!name) return;
      const r = await this.rpc('friend_request', { p_name: name });
      if (!r.ok) { this.say(r.err, STYLE.pal.red); return; }
      const T = { sent: ['REQUEST SENT TO ' + name.toUpperCase(), 'green'], accepted: ['YOU ARE NOW FRIENDS WITH ' + name.toUpperCase(), 'green'], exists: ['YOU ALREADY SENT A REQUEST OR ARE FRIENDS', 'orange'],
        self: ['THAT IS YOU', 'orange'], unknown: ['NO PLAYER WITH THIS NAME (THEY MUST HAVE OPENED THE GAME LOGGED IN)', 'red'], limit: ['TOO MANY FRIENDS OR OPEN REQUESTS', 'orange'] }[r.json] || ['DONE', 'grey'];
      this.say(T[0], STYLE.pal[T[1]]); Sfx.play(T[1] === 'red' ? 'deny' : 'select'); this.loadFriends();
    });
  },
  async answer(f, yes) { const r = await this.rpc('friend_answer', { p_uid: f.uid, p_accept: yes }); this.say(r.ok ? (yes ? 'YOU ARE NOW FRIENDS WITH ' + f.name : 'REQUEST DECLINED') : r.err, r.ok ? STYLE.pal.green : STYLE.pal.red); await this.loadFriends(); },
  async removeFriend(f) {
    if (f.state === 'friend' && this.ask !== 'f' + f.uid) { this.ask = 'f' + f.uid; Sfx.play('tick'); return; }          // Freund entfernen: zweimal drücken
    this.ask = null; const r = await this.rpc('friend_remove', { p_uid: f.uid });
    this.say(r.ok ? (f.state === 'friend' ? 'FRIEND REMOVED' : 'REQUEST REMOVED') : r.err, r.ok ? STYLE.pal.grey : STYLE.pal.red); await this.loadFriends();
  },
  // Einladung senden: gibt es keine offene Lobby, wird eine Koop-Lobby erstellt (du bist Host); der Code geht an den Freund
  async inviteUid(uid, name) {
    if (!Net.available) { this.say('NO CONNECTION POSSIBLE ON THIS DEVICE', STYLE.pal.red); Sfx.play('deny'); return; }
    if (!(Pvp.ch && Pvp.code && !Pvp.pub)) { Pvp.open('coop'); Pvp.connect(Net.newCode(), true); this.back = 'pvp'; }
    const r = await this.rpc('invite_send', { p_uid: uid, p_code: Pvp.code, p_game: Pvp.gameNow() });
    if (r.ok && r.json === 'ok') { this.say('INVITE SENT TO ' + name + '  -  LOBBY ' + Pvp.code, STYLE.pal.green); Sfx.play('select'); }
    else { this.say(r.ok ? 'YOU CAN ONLY INVITE FRIENDS' : r.err, STYLE.pal.red); Sfx.play('deny'); }
  },

  // ---- Gilde ----
  createGuild() {
    this.form('CREATE GUILD', [{ ph: 'GUILD NAME (3-20)', max: 20 }, { ph: 'TAG (2-4)', max: 4, upper: true }], 'CREATE', async (v) => {
      const r = await this.rpc('guild_create', { p_name: v[0], p_tag: v[1] });
      const T = { ok: 'GUILD CREATED', in_guild: 'YOU ARE ALREADY IN A GUILD', bad_name: 'NAME: 3-20 LETTERS, NUMBERS, SPACE, _ OR -', bad_tag: 'TAG: 2-4 LETTERS OR NUMBERS', taken: 'THIS NAME OR TAG IS TAKEN' };
      this.say(r.ok ? T[r.json] || 'DONE' : r.err, r.ok && r.json === 'ok' ? STYLE.pal.green : STYLE.pal.red);
      if (r.ok && r.json === 'ok') { Sfx.play('levelUp'); this.sel = 0; }
      await this.loadGuild();
    });
  },
  searchGuild() { this.form('FIND GUILD', [{ ph: 'NAME OR TAG (EMPTY = TOP GUILDS)', max: 20 }], 'SEARCH', async (v) => { this.sel = 0; await this.loadFound(v[0].trim()); this.say(this.found.length ? '' : 'NO GUILD FOUND', STYLE.pal.orange); }); },
  async joinGuild(g) {
    const r = await this.rpc('guild_join', { p_id: g.id });
    const T = { ok: 'YOU JOINED ' + g.name.toUpperCase(), in_guild: 'YOU ARE ALREADY IN A GUILD', full: 'THIS GUILD IS FULL (20 MEMBERS)', unknown: 'THIS GUILD NO LONGER EXISTS' };
    this.say(r.ok ? T[r.json] || 'DONE' : r.err, r.ok && r.json === 'ok' ? STYLE.pal.green : STYLE.pal.red);
    if (r.ok && r.json === 'ok') { Sfx.play('levelUp'); this.sel = 0; }
    await this.loadGuild();
  },
  async leaveGuild() {
    if (this.ask !== 'leave') { this.ask = 'leave'; this.say('PRESS L AGAIN TO LEAVE (YOUR POINTS THIS WEEK GO WITH YOU)', STYLE.pal.orange); Sfx.play('tick'); return; }
    this.ask = null; const r = await this.rpc('guild_leave');
    this.say(r.ok ? 'YOU LEFT THE GUILD' : r.err, r.ok ? STYLE.pal.grey : STYLE.pal.red); this.sel = 0; this.guild = undefined; await this.loadGuild();
  },
  async kick(m) {
    if (this.ask !== 'k' + m.uid) { this.ask = 'k' + m.uid; Sfx.play('tick'); return; }
    this.ask = null; const r = await this.rpc('guild_kick', { p_uid: m.uid });
    this.say(r.ok ? m.name.toUpperCase() + ' WAS REMOVED' : r.err, r.ok ? STYLE.pal.grey : STYLE.pal.red); await this.loadGuild();
  },
  async claim() {
    if (!this.guild) return;
    if (this.ownPoints() < 100) { this.say('YOU NEED 100 POINTS OF YOUR OWN THIS WEEK TO CLAIM', STYLE.pal.orange); Sfx.play('deny'); return; }
    const r = await this.rpc('guild_claim');
    if (r.ok && Number(r.json) > 0) { Save.data.souls = (Save.data.souls || 0) + Number(r.json); Save.write(); this.say('+' + r.json + ' CREDITS FROM YOUR GUILD', STYLE.pal.yellow); Sfx.play('levelUp'); }
    else this.say(r.ok ? 'NOTHING TO CLAIM YET - REACH A WEEKLY GOAL FIRST' : r.err, r.ok ? STYLE.pal.orange : STYLE.pal.red);
    await this.loadGuild();
  },
  // ---- Bildschirm ----
  open(from) { G.mode = 'friends'; this.back = from || 'start'; this.tab = 0; this.sel = 0; this.ask = null; this.msg = ''; this.loadFriends(); this.loadGuild(); },
  close() { G.mode = this.back === 'pvp' && Pvp.ch ? 'pvp' : 'start'; this.back = 'start'; this.ask = null; },
  setTab(i) { this.tab = i; this.sel = 0; this.ask = null; Sfx.play('tick'); if (i === 1) this.loadGuild(); if (i === 2) this.loadTop(); },

  // Zeilen des offenen Reiters mit ihren Aktionen: { name, tag?, right, dot?, pri: { label, col, fn }, sec: { label, col, fn } }
  rows() {
    const P = STYLE.pal;
    if (this.tab === 0) return this.friends.map((f) => {
      if (f.state === 'incoming') return { name: f.name, right: 'WANTS TO BE YOUR FRIEND', dot: P.yellow, pri: { label: 'ACCEPT', col: P.green, fn: () => this.answer(f, true) }, sec: { label: 'DECLINE', col: P.red, fn: () => this.answer(f, false) } };
      if (f.state === 'outgoing') return { name: f.name, right: 'REQUEST SENT', dot: P.greyMid, sec: { label: 'CANCEL', col: P.red, fn: () => this.removeFriend(f) } };
      return { name: f.name, right: f.online ? this.actText(f.act) : 'OFFLINE', rc: f.online ? P.green : P.grey, dot: f.online ? P.green : P.greyMid,
        pri: f.online ? { label: 'INVITE', col: P.cyan, fn: () => this.inviteUid(f.uid, f.name) } : null, sec: { label: this.ask === 'f' + f.uid ? 'SURE?' : 'REMOVE', col: P.red, fn: () => this.removeFriend(f) } };
    });
    if (this.tab === 1) {
      const g = this.guild;
      if (g === undefined) return [];
      if (!g) return this.found.map((x) => ({ name: '[' + x.tag + '] ' + x.name.toUpperCase(), right: x.n + '/20   ' + x.pts + ' PTS', pri: { label: 'JOIN', col: P.green, fn: () => this.joinGuild(x) } }));
      const me = this.myUid();
      return g.members.map((m) => ({ name: m.name.toUpperCase() + (m.leader ? '  (LEADER)' : ''), right: m.points + ' PTS', dot: m.online ? P.green : P.greyMid,
        pri: m.online && m.uid !== me ? { label: 'INVITE', col: P.cyan, fn: () => this.inviteUid(m.uid, m.name.toUpperCase()) } : null,
        sec: g.leader && m.uid !== me ? { label: this.ask === 'k' + m.uid ? 'SURE?' : 'KICK', col: P.red, fn: () => this.kick(m) } : null }));
    }
    return this.top.map((x) => ({ rank: x.rank, name: '[' + x.tag + '] ' + x.name.toUpperCase(), right: x.n + ' MEMBERS   ' + x.pts + ' PTS' }));
  },
  buttons() {
    const P = STYLE.pal, R = { label: 'REFRESH', code: 'KeyR', key: 'R', col: P.cyan, fn: () => this.refresh() };
    if (this.tab === 0) return [{ label: 'ADD FRIEND', code: 'KeyN', key: 'N', col: P.green, fn: () => this.addFriend() }, R];
    if (this.tab === 2) return [R];
    if (this.guild === undefined) return [R];
    if (!this.guild) return [{ label: 'CREATE GUILD', code: 'KeyC', key: 'C', col: P.green, fn: () => this.createGuild() }, { label: 'SEARCH', code: 'KeyF', key: 'F', col: P.cyan, fn: () => this.searchGuild() }, R];
    const n = this.claimable();
    return [{ label: n ? 'CLAIM REWARD' : 'CLAIM', code: 'KeyC', key: 'C', col: n ? P.yellow : P.greyMid, fn: () => this.claim() }, { label: this.ask === 'leave' ? 'SURE?' : 'LEAVE GUILD', code: 'KeyL', key: 'L', col: P.red, fn: () => this.leaveGuild() }, R];
  },

  update() {
    if (this.el) return;                                                         // Eingabefenster offen
    if (Input.pressed('Escape')) { this.close(); return; }
    if (!this.on) { if (Input.pressed('Space') || Input.pressed('Enter')) Account.open(); return; }
    const n = this.TABS.length;
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('KeyQ')) this.setTab((this.tab + n - 1) % n);
    if (Input.pressed('ArrowRight') || Input.pressed('KeyD') || Input.pressed('KeyE') || Input.pressed('Tab')) this.setTab((this.tab + 1) % n);
    const rows = this.rows(), N = Math.max(1, rows.length);
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) { this.sel = (this.sel + N - 1) % N; this.ask = null; }
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) { this.sel = (this.sel + 1) % N; this.ask = null; }
    this.sel = Math.min(this.sel, N - 1);
    const r = rows[this.sel];
    if (r && (Input.pressed('Space') || Input.pressed('Enter'))) { if (r.pri) r.pri.fn(); else Sfx.play('deny'); }
    if (r && r.sec && (Input.pressed('KeyX') || Input.pressed('Delete'))) r.sec.fn();
    for (const b of this.buttons()) if (Input.pressed(b.code)) b.fn();
    if (this.msg && Date.now() - this.msgAt > 7000) this.msg = '';
  },

  draw(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2, X = 60, W = STAGE_W - 120;
    drawMenuBg(ctx, 'keysettings'); drawEmbers(ctx);
    uiText(ctx, 'FRIENDS & GUILD', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
    this.TABS.forEach((t, i) => {
      const w = 120, x = 24 + i * (w + 6), y = 50, on = i === this.tab;
      UIHit.add(x, y, w, 20, () => {}, { act: () => this.setTab(i) });
      uiPanel(ctx, x, y, w, 20, { color: on ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: on });
      uiText(ctx, t, x + w / 2, y + 14, { size: T.body, color: on ? P.ice : P.grey, align: 'center' });
      if (i === 0 && this.friends.some((f) => f.state === 'incoming')) { ctx.fillStyle = P.red; ctx.fillRect(x + w - 8, y - 4, 10, 10); }
      if (i === 1 && this.claimable() > 0) { ctx.fillStyle = P.yellow; ctx.fillRect(x + w - 8, y - 4, 10, 10); }
    });
    if (!Account.configured || !this.on || this.missing) {
      uiPanel(ctx, cx - 210, 110, 420, 110, { color: P.purple, fill: P.void, alpha: 0.92, glow: true });
      const t = !Account.configured ? 'ONLINE FEATURES ARE NOT AVAILABLE IN THIS VERSION' : this.missing ? this.error || 'FRIENDS AND GUILDS ARE NOT SET UP ON THE SERVER YET' : 'LOG IN TO ADD FRIENDS AND JOIN A GUILD';
      uiWrap(ctx, t, cx - 190, 140, 380, 14, { size: T.h2, color: P.ice });
      if (Account.configured && !this.on) drawMenuRow(ctx, 232, 'OPEN ACCOUNT', true, { w: 190, h: 24, hit: () => {}, cx });
      if (Account.configured && !this.on) UIHit.add(cx - 95, 232, 190, 24, () => {}, { act: () => Account.open() });
      return;
    }
    const g = this.tab === 1 ? this.guild : null, head = !!g, y0 = head ? 176 : 84, DY = 22, vis = head ? 6 : 9;
    if (head) this.drawGuildHead(ctx, g, X, W);
    const rows = this.rows();
    uiPanel(ctx, X - 10, y0 - 6, W + 20, vis * DY + 10, { color: P.greyMid, fill: P.void, alpha: 0.9 });
    if (this.tab === 0 && this.listAt === 0) uiText(ctx, 'LOADING...', cx, y0 + 60, { size: T.h2, color: P.grey, align: 'center' });
    else if (this.tab === 1 && this.guild === undefined) uiText(ctx, 'LOADING...', cx, y0 + 60, { size: T.h2, color: P.grey, align: 'center' });
    else if (!rows.length) uiText(ctx, this.tab === 0 ? 'NO FRIENDS YET  -  PRESS N AND TYPE THE NAME OF A PLAYER' : this.tab === 1 ? 'NO GUILDS YET  -  CREATE THE FIRST ONE' : 'NO GUILD HAS POINTS THIS WEEK YET', cx, y0 + 60, { size: T.body, color: P.grey, align: 'center' });
    if (this.tab === 1 && this.guild === null && rows.length) uiText(ctx, 'JOIN A GUILD OR CREATE YOUR OWN', X, y0 - 12, { size: T.small, color: P.cyan });
    const S = UIScroll.win('social', this.tab + ':' + (head ? 1 : 0), this.sel, vis, rows.length);
    rows.slice(S.off, S.off + vis).forEach((r, k) => {
      const i = S.off + k, y = y0 + k * DY, on = i === this.sel, bw = 58;
      UIHit.add(X - 6, y - 2, W + 12, DY - 2, () => { this.sel = i; }, { noConfirm: true });
      if (on) { ctx.fillStyle = P.voidLight; ctx.fillRect(X - 6, y - 2, W + 12, DY - 2); }
      let tx = X + 4;
      if (r.rank) { uiText(ctx, '#' + r.rank, X + 4, y + 13, { size: T.h2, color: r.rank <= 3 ? P.yellow : P.grey }); tx = X + 44; }
      else if (r.dot) { ctx.fillStyle = r.dot; ctx.fillRect(X + 4, y + 5, 8, 8); tx = X + 22; }
      const rx = X + W - 6 - (r.pri || r.sec ? bw * 2 + 10 : 0);
      uiText(ctx, r.name, tx, y + 13, { size: T.h2, color: on ? P.ice : P.white, maxW: rx - tx - 150 });
      uiText(ctx, r.right, rx, y + 13, { size: T.body, color: r.rc || P.grey, align: 'right' });
      [[r.pri, X + W - 6 - bw * 2 - 4], [r.sec, X + W - 6 - bw]].forEach(([a, bx]) => {
        if (!a) return;
        UIHit.add(bx, y, bw, DY - 4, () => { this.sel = i; }, { act: () => a.fn() });
        uiPanel(ctx, bx, y, bw, DY - 4, { color: a.col, fill: P.void, alpha: 0.9 });
        uiText(ctx, a.label, bx + bw / 2, y + 12, { size: T.small, color: a.col, align: 'center' });
      });
    });
    UIScroll.bar(ctx, 'social', X + W + 12, y0, 6, vis * DY - 4, true, Math.max(rows.length, vis), vis, S.off, (v) => { S.off = v; });
    // Meldung / Fehler, Knöpfe
    const line = this.msg || this.error; if (line) uiText(ctx, line, cx, 316, { size: T.body, color: this.msg ? this.msgCol || P.cyan : P.red, align: 'center', maxW: STAGE_W - 40 });
    const bs = this.buttons(), bw = 130, gap = 10, bx0 = cx - (bs.length * bw + (bs.length - 1) * gap) / 2;
    bs.forEach((b, i) => {
      const x = bx0 + i * (bw + gap);
      UIHit.add(x, 324, bw, 22, () => {}, { act: () => b.fn() });
      uiPanel(ctx, x, 324, bw, 22, { color: b.col, fill: P.void, alpha: 0.9 });
      uiText(ctx, I18n.t(b.label) + '  [' + b.key + ']', x + bw / 2, 339, { size: T.body, color: b.col, align: 'center' });
    });
    const hint = this.tab === 0 ? '[SPACE] INVITE / ACCEPT      [X] REMOVE / DECLINE      INVITES ARRIVE IN YOUR MENU WITHIN SECONDS' : this.tab === 1 && g ? 'POINTS = KILLS + 25 PER BOSS FROM EVERY RUN      [SPACE] INVITE      [X] KICK (LEADER)' : '';
    if (hint) uiText(ctx, hint, cx, 355, { size: T.small, color: P.greyMid, align: 'center' });
  },

  drawGuildHead(ctx, g, X, W) {
    const P = STYLE.pal, T = STYLE.type;
    uiPanel(ctx, X - 10, 74, W + 20, 90, { color: P.purple, fill: P.void, alpha: 0.92 });
    uiText(ctx, '[' + g.tag + '] ' + g.name.toUpperCase(), X, 96, { size: T.h1, color: P.yellow, maxW: W * 0.5 });
    uiText(ctx, 'WEEK RANK ' + g.rank, X + W, 88, { size: T.small, color: P.cyan, align: 'right' });
    uiText(ctx, g.n + '/20 MEMBERS   ' + g.daysLeft + (g.daysLeft === 1 ? ' DAY LEFT' : ' DAYS LEFT'), X + W, 98, { size: T.small, color: P.grey, align: 'right' });
    const by = 118, bh = 10, last = Math.max(1, g.tiers.length ? g.tiers[g.tiers.length - 1].goal : 1), f = Math.min(1, g.points / last), own = this.ownPoints();
    uiText(ctx, g.points + ' PTS THIS WEEK', X, by - 4, { size: T.body, color: P.ice });
    uiText(ctx, 'YOURS ' + own + ' PTS' + (own < 100 ? '  (100 NEEDED TO CLAIM)' : ''), X + W, by - 4, { size: T.small, color: own >= 100 ? P.green : P.orange, align: 'right' });
    ctx.fillStyle = P.greyDark; ctx.fillRect(X, by, W, bh);
    ctx.fillStyle = P.cyan; ctx.fillRect(X, by, Math.round(W * f), bh);
    g.tiers.forEach((t, i) => {
      const mx = X + Math.round(W * t.goal / last) - 1, col = t.claimed ? P.greyMid : t.reached ? P.yellow : P.grey, al = i === g.tiers.length - 1 ? 'right' : 'center', lx = al === 'right' ? mx + 2 : mx;
      ctx.fillStyle = t.reached ? P.yellow : P.ice; ctx.fillRect(mx - 1, by - 3, 3, bh + 6);
      uiText(ctx, t.goal + ' PTS', lx, by + 24, { size: T.small, color: P.grey, align: al });
      uiText(ctx, t.claimed ? 'CLAIMED' : '+' + t.credits + ' CREDITS', lx, by + 35, { size: T.small, color: col, align: al });
    });
  },

  // ---- Eingabefenster (HTML wie account.js: klappt im iframe und auf Tablets) ----
  form(title, fields, okLabel, cb) {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = I18n.t(text); return e; };
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;font-family:"Pixelify Sans",monospace;');
    root.setAttribute('data-nogame', '1');
    const box = mk('div', 'width:min(420px,92vw);box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.cyan + ';color:' + P.ice + ';');
    box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:20px;margin-bottom:8px;', title));
    const inputs = fields.map((f) => {
      const e = mk('input', 'width:100%;box-sizing:border-box;margin:4px 0;padding:8px;background:' + P.ink + ';color:' + P.ice + ';border:2px solid ' + P.cyanDark + ';font:16px monospace;' + (f.upper ? 'text-transform:uppercase;' : ''));
      e.type = 'text'; e.placeholder = I18n.t(f.ph); e.maxLength = f.max || 20; e.spellcheck = false; e.autocomplete = 'off'; box.appendChild(e); return e;
    });
    const row = mk('div', 'display:flex;margin-top:8px;');
    const btn = (label, color, fn) => { const b = mk('button', 'flex:1;padding:10px 8px;margin:3px;cursor:pointer;background:' + P.voidLight + ';color:' + color + ';border:2px solid ' + color + ';font:inherit;font-size:15px;', label); b.onclick = fn; return b; };
    const done = (ok) => { const v = inputs.map((e) => e.value.trim()); this.closeForm(); if (ok && v.some((x) => x)) cb(v); };
    row.appendChild(btn(okLabel, P.green, () => done(true))); row.appendChild(btn('CANCEL', P.grey, () => done(false)));
    box.appendChild(row); root.appendChild(box);
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') done(false); else if (e.key === 'Enter') done(true); });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    root.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
    document.body.appendChild(root); this.el = root; inputs[0].focus();
  },
  closeForm() { if (!this.el) return; this.el.remove(); this.el = null; Input.keys = {}; Input.pressedNow = {}; window.focus(); },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'FRIENDS & GUILD': 'FREUNDE & GILDE', 'FRIENDS': 'FREUNDE', 'GUILD': 'GILDE', 'TOP GUILDS': 'BESTE GILDEN', 'ADD FRIEND': 'FREUND HINZUFÜGEN', 'REFRESH': 'AKTUALISIEREN',
  'INVITE': 'EINLADEN', 'ACCEPT': 'ANNEHMEN', 'DECLINE': 'ABLEHNEN', 'REMOVE': 'ENTFERNEN', 'CANCEL': 'ABBRECHEN', 'SURE?': 'SICHER?', 'JOIN': 'BEITRETEN', 'KICK': 'RAUSWERFEN',
  'OFFLINE': 'OFFLINE', 'ONLINE': 'ONLINE', 'IN A RUN': 'IM LAUF', 'IN A LOBBY': 'IN EINER LOBBY', 'WANTS TO BE YOUR FRIEND': 'MÖCHTE DEIN FREUND SEIN', 'REQUEST SENT': 'ANFRAGE GESENDET',
  'CREATE GUILD': 'GILDE ERSTELLEN', 'SEARCH': 'SUCHEN', 'LEAVE GUILD': 'GILDE VERLASSEN', 'CLAIM': 'ABHOLEN', 'CLAIM REWARD': 'BELOHNUNG ABHOLEN', '(LEADER)': '(ANFÜHRER)',
  'LOADING...': 'LADEN...', 'OPEN ACCOUNT': 'KONTO ÖFFNEN', 'LOG IN TO ADD FRIENDS AND JOIN A GUILD': 'MELDE DICH AN, UM FREUNDE HINZUZUFÜGEN UND EINER GILDE BEIZUTRETEN',
  'NO FRIENDS YET  -  PRESS N AND TYPE THE NAME OF A PLAYER': 'NOCH KEINE FREUNDE  -  DRÜCKE N UND GIB DEN NAMEN EINES SPIELERS EIN',
  'JOIN A GUILD OR CREATE YOUR OWN': 'TRITT EINER GILDE BEI ODER ERSTELLE EINE EIGENE', 'NO GUILDS YET  -  CREATE THE FIRST ONE': 'NOCH KEINE GILDEN  -  ERSTELLE DIE ERSTE',
  'NO GUILD HAS POINTS THIS WEEK YET': 'DIESE WOCHE HAT NOCH KEINE GILDE PUNKTE', '[J] JOIN': '[J] BEITRETEN', '[K] IGNORE': '[K] IGNORIEREN',
  'POINTS = KILLS + 25 PER BOSS, FROM EVERY RUN. GOALS GROW WITH YOUR MEMBER COUNT. RESET ON MONDAY.': 'PUNKTE = KILLS + 25 PRO BOSS, AUS JEDEM LAUF. DIE ZIELE WACHSEN MIT DER MITGLIEDERZAHL. RESET AM MONTAG.',
  'REQUEST DECLINED': 'ANFRAGE ABGELEHNT', 'FRIEND REMOVED': 'FREUND ENTFERNT', 'YOU LEFT THE GUILD': 'DU HAST DIE GILDE VERLASSEN', 'GUILD CREATED': 'GILDE ERSTELLT', 'NO GUILD FOUND': 'KEINE GILDE GEFUNDEN',
  'FIND GUILD': 'GILDE SUCHEN',
  '[SPACE] INVITE / ACCEPT      [X] REMOVE / DECLINE      INVITES ARRIVE IN YOUR MENU WITHIN SECONDS': '[LEERTASTE] EINLADEN / ANNEHMEN      [X] ENTFERNEN / ABLEHNEN      EINLADUNGEN KOMMEN IN WENIGEN SEKUNDEN IM MENÜ AN',
  'POINTS = KILLS + 25 PER BOSS FROM EVERY RUN      [SPACE] INVITE      [X] KICK (LEADER)': 'PUNKTE = KILLS + 25 PRO BOSS AUS JEDEM LAUF      [LEERTASTE] EINLADEN      [X] RAUSWERFEN (ANFÜHRER)', 'CREATE': 'ERSTELLEN', 'SEND REQUEST': 'ANFRAGE SENDEN', 'PLAYER NAME': 'SPIELERNAME', 'INVITE FRIENDS': 'FREUNDE EINLADEN',
});
if (typeof I18n !== 'undefined' && I18n.phrases) I18n.phrases([['WEEK RANK', 'WOCHENRANG'], ['MEMBERS', 'MITGLIEDER'], ['DAYS LEFT', 'TAGE ÜBRIG'], ['DAY LEFT', 'TAG ÜBRIG'], ['PTS', 'PKT'], ['THIS WEEK', 'DIESE WOCHE'], ['YOURS', 'DEINE'], ['CLAIMED', 'ABGEHOLT'], ['100 NEEDED TO CLAIM', 'ZUM ABHOLEN 100 NÖTIG'], ['INVITES YOU', 'LÄDT DICH EIN'], ['INVITE SENT TO', 'EINLADUNG GESENDET AN'], ['(LEADER)', '(ANFÜHRER)']]);
