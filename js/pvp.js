// PvP-Arena: Menues fuer die Lobby (erstellen, per Code beitreten, Spielerliste, Modus, Abilities). Die Verbindung steckt in net.js, der Kampf in pvpmatch.js.
// Nur der Host (Ersteller) darf Modus waehlen und die Runde starten; alle Spieler duerfen ihre Abilities waehlen. Siehe Organise/CLAUDE.md "PvP-Arena".
// Zustaende (Pvp.st): menu (Lobby erstellen / beitreten / zurueck), join (Code eintippen), lobby (Code + Spieler).
// Bedienung: W/S + Leertaste (Maus geht ueberall), im Code-Feld Buchstaben/Ziffern tippen (Strg+V fuegt ein), Rueckschritt loescht, ESC = zurueck.

const Pvp = {
  bots: 0, botLevel: 1, st: 'menu', sel: 0, code: '', input: '', ch: null, players: [], me: null, isHost: false,
  msg: '', msgCol: null, msgAt: 0, joinAt: 0, hadHost: false, copied: 0, mode: 'ffa', scores: {}, rule: 'own', pub: false, qch: null, RULES: ['own', 'setfix', 'setpick', 'all'],

  // Aussehen fuer die Lobby-Karten der anderen (Held-Sprite, Skin/Aura/Gear); Fehler duerfen das Beitreten nie verhindern
  lookSprite() { try { return Hero.sprite(); } catch (e) { return 'player'; } },
  lookCs() { try { return Coop.lookPack(); } catch (e) { return undefined; } },

  // Anzeigename: Kontoname, sonst ein fester Gastname pro Geraet
  name() {
    if (typeof Account !== 'undefined' && Account.on && Account.meta.name) return String(Account.meta.name).toUpperCase().slice(0, 14);
    if (!Save.data.pvpName) { Save.data.pvpName = 'GUEST-' + String(Math.floor(1000 + Math.random() * 9000)); Save.write(); }
    return Save.data.pvpName;
  },

  game: 'pvp', coopMap: 0, pmap: null,
  open(game) { this.game = game === 'coop' ? 'coop' : 'pvp'; this.pick = null; this.scores = {}; this.pub = false; this.leave(true); this.st = 'menu'; this.sel = 0; this.input = ''; this.say(''); },
  say(t, col) { this.msg = t; this.msgCol = col || null; this.msgAt = Date.now(); },

  // Verbindung schliessen und zurueck ins Menue (silent = keine Meldung loeschen)
  leave(silent) {
    this.qClose();
    if (this.ch) { try { this.ch.close(); } catch (e) { /* egal */ } }
    this.ch = null; this.players = []; this.isHost = false; this.hadHost = false; this.code = '';
    if (!silent) { this.st = 'menu'; this.sel = 0; G.mode = 'modeselect'; }          // Lobby/Suche verlassen: zurueck in die Modusliste
  },

  connect(code, host) {
    this.pub = false;
    if (!Net.available) { this.say('NO CONNECTION POSSIBLE ON THIS DEVICE', STYLE.pal.red); return; }
    if (Net.isDevCode(code)) {                                      // reservierte Dev-Lobby: nur mit Dev-Zugang. Man tritt als Gast bei; ist niemand Host, wird man es selbst (promote)
      if (!Save.anyDev()) { this.say('THIS CODE IS RESERVED', STYLE.pal.red); Sfx.play('deny'); return; }
      host = false; code = code.toUpperCase();
    }
    this.leave(true);
    this.scores = {}; this.mode = 'ffa'; this.rule = 'own'; this.bots = 0;
    this.code = code; this.isHost = host; this.joinAt = Date.now(); this.hadHost = host; this.st = 'lobby'; this.sel = 0; this.say(host ? '' : 'JOINING...', STYLE.pal.grey);
    this.ch = Net.open(this.game === 'coop' && Net.isDevCode(code) ? code + 'C' : code, { /* Dev-Lobbys: PvP und Koop haben je einen eigenen Kanal */ name: this.name(), host, mode: 'ffa', rule: 'own', set: Save.data.pvpSet, game: this.game, map: this.coopMap, pmap: this.pmapSel(), spr: this.lookSprite(), cs: this.lookCs(), rating: Save.pvpStrength() }, {
      onPlayers: (list) => this.onPlayers(list),
      onMessage: (ev, p) => { if (ev === 'start' && !this.isHost) this.roundStart(p); else { PvpMatch.onMessage(ev, p); Coop.onMessage(ev, p); } },
      onStatus: (s) => { if (s === 'error' && this.ch) this.failBack('CONNECTION FAILED'); else if (s === 'reconnecting') this.say('RECONNECTING...', STYLE.pal.orange); else if (s === 'joined' && this.msg === 'RECONNECTING...') this.say(''); },
    });
  },

  // Runde starten (nur der Host): alle in der Lobby bekommen 'start' { mode, order } (Reihenfolge und Modus legt der Host fest, damit Teams bei allen gleich sind)
  roundStart(info) {
    if (info && info.order && this.ch && !info.order.includes(this.ch.id)) { this.say('A ROUND IS RUNNING - YOU JOIN THE NEXT ONE', STYLE.pal.orange); return; }        // spaet beigetreten
    this.st = 'lobby';
    // Der Host bestimmt die Arena-Groesse: ein Geraet mit aelterem Spielstand (App noch nicht aktualisiert) soll sonst keine andere Arena haben
    if (info && !this.isHost && Number.isFinite(info.radius) && info.radius >= 100 && info.radius <= 1000) CFG.pvp.radius = info.radius;
    if (info && info.game === 'coop' ? Coop.begin(info) : PvpMatch.begin(info)) Sfx.play('levelUp'); else this.say('CONNECTION FAILED', STYLE.pal.red);
  },
  // Host-Wechsel: faellt der Host weg (Lobby, Runde oder Dev-Lobby ohne Host), uebernimmt der Spieler, der am laengsten dabei ist, mit den Einstellungen des alten Hosts
  // (Modus, Regel, Karte, Spielart). Laeuft gerade eine PvP-Runde, uebernimmt er auch die Mitspieler, die der alte Host gerechnet hat (PvpMatch.takeOver).
  promote() {
    if (!this.ch || this.isHost) return;
    const L = this.lastHost || {};
    if (this.MODES.includes(L.mode)) this.mode = L.mode;
    if (this.RULES.includes(L.rule)) this.rule = L.rule;
    if (L.game === 'coop' || L.game === 'pvp') this.game = L.game;
    if (Number.isFinite(L.map)) this.coopMap = clamp(L.map | 0, 0, CFG.maps.length - 1);
    if (L.pmap) this.pmap = PvpCover.validId(L.pmap);
    this.isHost = true; this.hadHost = true;
    this.ch.update({ host: true, mode: this.mode, rule: this.rule, game: this.game, map: this.coopMap, pmap: this.pmapSel(), set: Save.data.pvpSet });
    this.sel = 0; this.say('');
    if (G.pvp) { PvpMatch.takeOver(); G.notice('YOU ARE THE HOST NOW', STYLE.pal.cyan); } else if (this.st === 'lobby') this.say('YOU ARE THE HOST NOW', STYLE.pal.cyan);
  },
  isDevLobby() { return Net.isDevCode(this.code); },
  // Name des b-ten Mitspielers, der einen freien Platz fuellt: aus dem Lobby-Code abgeleitet, damit Lobby-Karte und Runde bei allen gleich sind
  botName(b) { let h = 7; for (const c of String(this.code || 'X')) h = (h * 31 + c.charCodeAt(0)) % 9973; const N = CFG.pvp.botNames; return N[(h + b * 7) % N.length]; },
  // DEV02: 0-3 Bots (nur beim Host-Geraet vorhanden, siehe PvpMatch.begin)
  botsNow() {
    if (!this.isHost) return 0;
    if (this.code === 'DEV02') return this.bots | 0;
    return this.modeNow() === 'dm' || this.pub ? Math.max(0, CFG.pvp.maxPlayers - Math.min(this.players.length, CFG.pvp.maxPlayers)) : 0;          // Deathmatch 3v3: Bots fuellen die freien Plaetze
  },
  startRound() {
    if (!this.isHost || !this.ch) return;
    if (this.gameNow() === 'coop') {                                       // Koop: auch allein moeglich, die Karte waehlt der Host
      const order = this.players.slice(0, CFG.coop.maxPlayers).map((p) => p.id), info = { game: 'coop', order, map: this.coopMap };
      this.ch.send('start', info); this.roundStart(info);
      return;
    }
    if (this.players.length < 2 && !this.isDevLobby() && this.modeNow() !== 'dm' && !this.pub) { this.say('YOU NEED AT LEAST 2 PLAYERS', STYLE.pal.orange); Sfx.play('deny'); return; }
    if (this.pub) { this.ch.update({ rating: Save.pvpStrength() }); this.botLevel = this.autoBotLevel(); }
    const info = { botLevel: this.botLevel | 0, bots: this.botsNow(), mode: this.mode, order: this.players.slice(0, Math.max(1, CFG.pvp.maxPlayers - this.botsNow())).map((p) => p.id), radius: CFG.pvp.radius, pmap: this.pmapNow(), rule: this.ruleKind(), setId: this.ruleNow() === 'setfix' ? this.setNow().id : null };
    this.ch.send('start', info); this.roundStart(info);
  },
  // Spielart der Lobby (der Host legt sie beim Erstellen fest): 'pvp' oder 'coop'
  gameNow() { if (this.isHost) return this.game; const h = this.players.find((p) => p.host); return h ? (h.game === 'coop' ? 'coop' : 'pvp') : this.game; },       // solange der Host noch nicht sichtbar ist, gilt der gewaehlte Modus (sonst steht beim Beitreten kurz PVP ARENA im Koop)
  // Koop: Karte (der Host waehlt unter seinen freigeschalteten, alle sehen sie ueber seine Anwesenheit)
  mapNow() { if (this.isHost) return this.coopMap; const h = this.players.find((p) => p.host); return h && Number.isFinite(h.map) ? clamp(h.map | 0, 0, CFG.maps.length - 1) : 0; },
  toggleMap(d) {
    if (!this.isHost || !this.ch) return;
    const n = CFG.maps.length; let i = this.coopMap;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (Save.mapUnlocked(i)) break; }
    this.coopMap = i; this.ch.update({ map: i }); Sfx.play('select');
  },
  // PvP-Karte (CFG.pvp.maps): der Host waehlt, alle sehen sie ueber seine Anwesenheit; die Runde laedt sie aus info.pmap
  pmapSel() { return PvpCover.validId(this.pmap); },
  pmapNow() { if (this.isHost || this.pub) return this.pmapSel(); const h = this.players.find((p) => p.host); return PvpCover.validId(h && h.pmap); },
  togglePMap(d) {
    if (!this.isHost || !this.ch || this.pub) return;
    const ids = Object.keys(CFG.pvp.maps), i = ids.indexOf(this.pmapSel());
    this.pmap = ids[(i + d + ids.length) % ids.length]; this.ch.update({ pmap: this.pmap }); Sfx.play('select');
  },
  // Modus: der Host waehlt (jeder gegen jeden / Teams), alle sehen ihn ueber die Anwesenheit des Hosts
  MODES: ['ffa', 'teams'],                                              // waehlbar in der Lobby ('dm' = Team-Deathmatch ist vorerst abgeschaltet, die Logik steckt noch in pvpmatch.js)
  modeNow() { if (this.isHost) return this.mode; const h = this.players.find((p) => p.host); return h && this.MODES.includes(h.mode) ? h.mode : 'ffa'; },
  maxP() { return this.gameNow() === 'coop' ? CFG.coop.maxPlayers : CFG.pvp.maxPlayers; },
  // Host: Spielart der Lobby (PVP oder CO-OP); alle sehen sie ueber seine Anwesenheit
  toggleGame() {
    if (!this.isHost || !this.ch || this.pub) return;
    const next = this.game === 'coop' ? 'pvp' : 'coop';
    this.game = next; this.ch.update({ game: next }); Sfx.play('select');
  },
  toggleMode() { if (!this.isHost || !this.ch || this.pub) return; this.mode = this.MODES[(this.MODES.indexOf(this.mode) + 1) % this.MODES.length]; this.ch.update({ mode: this.mode }); Sfx.play('select'); },
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
  lobbyRows() { const r = this.baseRows(); if (!this.pub && Social.on) r.splice(r.length - 1, 0, 'friends'); return r; },       // Zeile INVITE FRIENDS vor LEAVE
  baseRows() { if (this.pub) return ['leave']; if (this.gameNow() === 'coop') return this.isHost ? ['start', 'game', 'map', 'leave'] : ['leave']; return this.isHost ? ['start', 'game', 'mode', 'arena'].concat(this.code === 'DEV02' ? ['bots', 'botlevel'] : [], ['rule', 'equipment', 'leave']) : ['equipment', 'leave']; },

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
  heroList() { const all = this.ruleKind() === 'all'; return (CFG.heroes.order || Object.keys(CFG.heroes)).filter((id) => CFG.heroes[id] && CFG.heroes[id].name && (all || Save.heroOwned(id))); },
  heroCycle(d) {
    const l = this.heroList(), cur = Save.pvpHero(this.ruleKind()), n = l.length;
    if (n < 2) return;
    Save.data.pvpHeroSel = l[(Math.max(0, l.indexOf(cur)) + d + n) % n]; Save.write(); Sfx.play('select');
  },
  // Auswahlfenster (wie im Inventar): alle Moeglichkeiten der Zeile als Liste. row 0-3 Inventar-Slot, 4-6 Ability-Gruppe, 7 Held
  openPick(row) {
    let kind, key, list, cur, col;
    const P = STYLE.pal;
    if (row < 4) { kind = 'slot'; key = CFG.items.slots[row].id; list = this.equipList(key); cur = Save.pvpEquipped(key); col = slotColor(key); }
    else if (row < 7) { kind = 'tier'; key = CFG.loadout.tiers[row - 4].id; list = this.tierList(key); cur = this.loadout()[key]; col = { weak: P.cyan, medium: P.yellow, strong: P.orange }[key] || P.cyan; }
    else { kind = 'hero'; key = 'hero'; list = this.heroList(); cur = Save.pvpHero(this.ruleKind()); col = P.purple; }
    this.pick = { kind, key, list, cur, col, sel: Math.max(0, list.indexOf(cur)), title: row < 4 ? CFG.items.slots[row].label : row < 7 ? CFG.loadout.tiers[row - 4].label : 'HERO' };
    Sfx.play('select');
  },
  updatePick(up, dn, go) {
    const K = this.pick, n = K.list.length;
    if (Input.pressed('Escape')) { this.pick = null; return; }
    if (!n) { if (go) this.pick = null; return; }
    if (up) K.sel = (K.sel + n - 1) % n;
    if (dn) K.sel = (K.sel + 1) % n;
    if (go) {
      const id = K.list[K.sel];
      if (K.kind === 'slot') Save.data.pvpEquip = Object.assign({}, Save.data.pvpEquip, { [K.key]: id });
      else if (K.kind === 'tier') Save.data.pvpLoadout = Object.assign({}, this.loadout(), { [K.key]: id });
      else Save.data.pvpHeroSel = id;
      Save.write(); Sfx.play('select'); this.pick = null;
    }
  },
  // Zeilen des Ausruestungs-Bildschirms: SET = nur die Set-Wahl, sonst 4 Inventar-Slots, 3 Ability-Gruppen, Held
  eqRows() { return this.ruleKind() === 'set' ? ['set'] : [0, 1, 2, 3, 4, 5, 6, 7]; },
  cycleRow(i, d) { if (this.ruleKind() === 'set') this.cycleSet(d); else if (i < 4) this.equipCycle(CFG.items.slots[i].id, d); else if (i < 7) this.cycle(i - 4, d); else this.heroCycle(d); },

  RULE_SHORT: { own: 'RULES: OWN GEAR', setfix: 'RULES: ONE SET', setpick: 'RULES: PICK SET', all: 'RULES: ALL GEAR' },
  RULE_NAMES: { own: 'OWN EQUIPMENT', setfix: 'ONE SET FOR ALL', setpick: 'PICK A SET', all: 'ALL EQUIPMENT' },

  // Der Host ist seit 3 s weg: der am laengsten anwesende Spieler wird Host (alle sehen dieselbe Reihenfolge), die anderen warten kurz auf ihn, sonst schliesst die Lobby
  hostLost() {
    if (!this.ch || this.isHost || !this.hadHost || this.players.some((p) => p.host)) return;
    const first = this.players[0];
    if (this.isDevLobby() || (first && first.id === this.ch.id)) { this.promote(); return; }
    setTimeout(() => {
      if (!this.ch || this.isHost || this.players.some((p) => p.host)) return;
      const nx = this.players[0];
      if (nx && nx.id === this.ch.id) this.promote(); else this.failBack('THE HOST CLOSED THE LOBBY');
    }, 6000);
  },

  failBack(text) { this.leave(); this.say(text, STYLE.pal.red); Sfx.play('deny'); },          // Meldung steht in der Modusliste

  onPlayers(list) {
    this.players = list;
    const h = list.find((p) => p.host);
    if (h) this.lastHost = h;                                           // letzte Einstellungen des Hosts merken (fuer den Host-Wechsel)
    if (this.isHost) return;
    const host = !!h;
    if (host) this.hadHost = true;
    if (!this.hadHost) return;                                          // der Host kommt kurz nach dem Beitritt per Presence an (Pruefung in update)
    if (!host) {                                                        // Host kurz weg (z. B. beim Aktualisieren seiner Anwesenheit): erst nach 3 s wirklich weg
      setTimeout(() => this.hostLost(), 3000);
      return;
    }
    if (list.length > this.maxP() && !list.slice(0, this.maxP()).some((p) => p.id === this.ch.id)) { this.failBack('THE LOBBY IS FULL'); return; }
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
    this.pubTick();
    const up = Input.pressed('ArrowUp') || Input.pressed('KeyW'), dn = Input.pressed('ArrowDown') || Input.pressed('KeyS');
    const go = Input.pressed('Space') || Input.pressed('Enter');
    if (this.st === 'menu') {
      const rows = this.rows(); if (up) this.sel = (this.sel + rows.length - 1) % rows.length; if (dn) this.sel = (this.sel + 1) % rows.length;
      if (Input.pressed('Escape')) { G.mode = 'modeselect'; return; }
      if (go) {
        const r = rows[this.sel];
        if (r === 'quick') this.startQueue();
        else if (r === 'create') this.connect(Net.newCode(), true);
        else if (/^dev\d$/.test(r)) this.connect(Net.DEV_CODES[+r[3] - 1], true);
        else if (r === 'join') { this.st = 'join'; this.sel = 0; this.input = ''; this.say(''); }
        else G.mode = 'modeselect';
      }
    } else if (this.st === 'join') {
      if (Input.pressedNow.Backspace) { this.input = this.input.slice(0, -1); return; }       // Rueckschritt loescht (zaehlt sonst wie ESC)
      this.type();
      const rows = this.rows(); if (up) this.sel = (this.sel + rows.length - 1) % rows.length; if (dn) this.sel = (this.sel + 1) % rows.length;
      if (Input.pressed('Escape')) { G.mode = 'modeselect'; return; }
      if (go) {
        if (this.sel === 0 || this.sel === 1) { if (this.input.length === Net.CODE_LEN) this.connect(this.input, false); else { this.say('A CODE HAS ' + Net.CODE_LEN + ' CHARACTERS', STYLE.pal.orange); Sfx.play('deny'); } }
        else G.mode = 'modeselect';
      }
    } else if (this.st === 'queue') {
      this.qTick();
      if (Input.pressed('Escape')) { this.qClose(); G.mode = 'modeselect'; Sfx.play('select'); }
    } else if (this.st === 'loadout') {
      if (this.pick) { this.updatePick(up, dn, go); return; }
      const n = this.eqRows().length + 1;
      if (up) this.sel = (this.sel + n - 1) % n;
      if (dn) this.sel = (this.sel + 1) % n;
      if (this.sel < n - 1 && this.ruleKind() === 'set') {
        if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.cycleRow(this.sel, -1);
        if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.cycleRow(this.sel, 1);
      }
      if (Input.pressed('Escape') || (go && this.sel === n - 1)) { this.st = 'lobby'; this.sel = Math.max(0, this.lobbyRows().indexOf('equipment')); return; }
      if (go && this.sel < n - 1) { if (this.ruleKind() === 'set') this.cycleRow(this.sel, 1); else this.openPick(this.sel); }
    } else if (this.st === 'lobby') {
      const lr = this.lobbyRows(); if (up) this.sel = (this.sel + lr.length - 1) % lr.length; if (dn) this.sel = (this.sel + 1) % lr.length;
      this.sel = Math.min(this.sel, lr.length - 1);
      if (!this.isHost && this.ch && this.ch.status === 'joined' && !this.hadHost && this.isDevLobby() && Date.now() - this.joinAt > 1500) this.promote();         // Dev-Lobby: es gibt sie immer
      if (!this.isHost && this.ch && this.ch.status === 'joined' && !this.hadHost && Date.now() - this.joinAt > 2500) { this.failBack('NO LOBBY WITH THIS CODE'); return; }       // niemand hat sich als Host eingetragen
      if (lr[this.sel] === 'botlevel') { if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.botLevel = (this.botLevel + 2) % 3; if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.botLevel = (this.botLevel + 1) % 3; }
      if (lr[this.sel] === 'bots') { if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.bots = Math.max(0, this.bots - 1); if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.bots = Math.min(3, this.bots + 1); }
      if (Input.pressed('Escape')) { this.leave(); return; }
      if (lr[this.sel] === 'map') { if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.toggleMap(-1); if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.toggleMap(1); }
      if (lr[this.sel] === 'game' && (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('ArrowRight') || Input.pressed('KeyD'))) this.toggleGame();
      if (lr[this.sel] === 'arena') { if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.togglePMap(-1); if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.togglePMap(1); }
      if (lr[this.sel] === 'mode' && (Input.pressed('ArrowLeft') || Input.pressed('KeyA') || Input.pressed('ArrowRight') || Input.pressed('KeyD'))) this.toggleMode();
      if (lr[this.sel] === 'rule') { if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) this.toggleRule(-1); if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) this.toggleRule(1); }
      if (go) {
        const r = lr[this.sel];
        if (r === 'start') this.startRound();
        else if (r === 'game') this.toggleGame();
        else if (r === 'map') this.toggleMap(1);
        else if (r === 'mode') this.toggleMode();
        else if (r === 'arena') this.togglePMap(1);
        else if (r === 'bots') this.bots = (this.bots + 1) % 4;
        else if (r === 'botlevel') this.botLevel = (this.botLevel + 1) % 3;
        else if (r === 'rule') this.toggleRule(1);
        else if (r === 'equipment') { this.st = 'loadout'; this.sel = 0; this.pick = null; }
        else if (r === 'friends') Social.open('pvp');
        else this.leave();
      }
    }
  },

  menuRows() { return this.game === 'coop' ? ['create', 'join', 'back'] : ['quick', 'create', 'join', 'back']; },
  rows() { return this.st === 'menu' ? this.menuRows() : [0, 1, 2]; },
  // Tastenreihen fuer die Code-Eingabe: nur erlaubte Zeichen (ohne I, O, 0, 1; mit Dev-Zugang 0 und 1), Anordnung wie auf der Tastatur der Spielsprache
  keyRows() {
    const ok = Net.CODE_CHARS + (Save.anyDev() ? '01' : ''), de = Save.data.lang === 'de';
    const tpl = ['1234567890', de ? 'QWERTZUIOP' : 'QWERTYUIOP', 'ASDFGHJKL', de ? 'YXCVBNM' : 'ZXCVBNM'];
    const rows = tpl.map((r) => r.split('').filter((c) => ok.includes(c)));
    for (const c of ok) if (!rows.some((r) => r.includes(c))) rows[rows.length - 1].push(c);        // falls ein erlaubtes Zeichen in keiner Reihe steht
    return rows;
  },

  // ---- Oeffentliche Arena (Schnellspiel 3v3): alle Suchenden stehen im Kanal 'QUEUE'. Der am laengsten Wartende ist Anfuehrer: sind 6 da oder ist seine Wartezeit (20 s +- 2 s) um,
  //      bildet er aus den Aeltesten eine Gruppe, denkt sich einen Lobby-Code aus und meldet ihn per 'qmatch'. Jede Gruppe spielt in ihrer eigenen Lobby (viele Spiele gleichzeitig);
  //      der Anfuehrer wird Host, fuellt freie Plaetze mit Bots und startet nach kurzer Ausruestungswahl. Wer schon vergeben ist ('taken'), wird nicht nochmal eingeteilt. ----
  startQueue() {
    if (!Net.available) { this.say('NO CONNECTION POSSIBLE ON THIS DEVICE', STYLE.pal.red); Sfx.play('deny'); return; }
    this.leave(true);
    const D = CFG.pvp.dm;
    this.scores = {}; this.pub = true; this.st = 'queue'; this.sel = 0; this.say('');
    this.qAt = Date.now(); this.qWait = (D.queueWait + (Math.random() * 2 - 1) * D.queueJitter) * 1000; this.qTaken = {}; this.qDone = false;
    this.qch = Net.open('QUEUE', { name: this.name(), host: false, rating: Save.pvpStrength() }, {
      onMessage: (ev, p) => this.qMsg(ev, p),
      onStatus: (s) => { if (s === 'error' && this.qch) { this.qClose(); this.pub = false; this.failBack('CONNECTION FAILED'); } },
    });
  },
  qClose() { const c = this.qch; this.qch = null; if (c) { try { c.close(); } catch (e) { /* egal */ } } },
  qList() { const now = Date.now(), t = this.qTaken || {}; for (const k of Object.keys(t)) if (now - t[k] > 20000) delete t[k]; return ((this.qch && this.qch.players) || []).filter((p) => !t[p.id]); },
  qTick() {
    const ch = this.qch;
    if (!ch || ch.status !== 'joined' || this.qDone) return;
    const list = this.qList();
    if (!list.length || list[0].id !== ch.id) return;                // nur der laengste Wartende bildet die Gruppe
    // Mitspieler mit aehnlicher PVP-Staerke: das Fenster waechst mit der Wartezeit, damit niemand ewig wartet
    const R = CFG.pvp.rating, waited = Date.now() - this.qAt, win = R.window + waited / 1000 * R.windowPerSec, rt = (p) => this.cleanRating(p.rating), me = rt(list[0]);
    const near = list.slice(1).map((p) => ({ p, d: Math.abs(rt(p) - me) })).filter((x) => x.d <= win).sort((a, b) => a.d - b.d).slice(0, CFG.pvp.maxPlayers - 1).map((x) => x.p);
    const group = [list[0]].concat(near);
    if (group.length >= CFG.pvp.maxPlayers || waited >= this.qWait) this.qForm(group);
  },
  cleanRating(v) { const r = Number(v); return Number.isFinite(r) ? clamp(r, 100, 5000) : CFG.pvp.rating.start; },
  // Stufe der Bots (0 EASY, 1 NORMAL, 2 HARD) nach der mittleren Staerke der Menschen in der Lobby
  autoBotLevel() {
    const hs = this.players.map((p) => this.cleanRating(p.rating)), avg = hs.reduce((s, v) => s + v, 0) / Math.max(1, hs.length), T = CFG.pvp.rating.botTiers;
    return avg < T[0] ? 0 : avg < T[1] ? 1 : 2;
  },
  qForm(group) {
    const code = Net.newCode(), ids = group.map((p) => p.id), ch = this.qch;
    ch.send('qmatch', { code, ids });
    this.qDone = true; for (const id of ids) this.qTaken[id] = Date.now();
    this.qEnter(code, true, ids);
  },
  qMsg(ev, p) {
    if (ev !== 'qmatch' || !p || !Array.isArray(p.ids) || typeof p.code !== 'string') return;
    for (const id of p.ids) this.qTaken[id] = Date.now();
    if (this.qDone || !this.qch || !p.ids.includes(this.qch.id)) return;
    this.qDone = true;
    this.qEnter(Net.cleanCode(p.code), false, p.ids);
  },
  qEnter(code, host, ids) {
    const D = CFG.pvp.dm, ch = this.qch;
    setTimeout(() => { try { ch.close(); } catch (e) { /* egal */ } }, 500);           // erst schliessen, wenn 'qmatch' raus ist
    this.qch = null;
    this.connect(code, host);
    this.pub = true; this.pubIds = ids; this.pubAt = Date.now() + D.lobbyPick * 1000; this.pubStarted = false;
    if (host) { this.mode = 'ffa'; this.rule = 'own'; this.ch.update({ mode: 'ffa', rule: 'own' }); }          // offene Runde: jeder gegen jeden, Bots fuellen auf
  },
  // Lobby der oeffentlichen Arena: der Host startet, sobald alle da sind (oder nach einer Frist) und die Ausruestungswahl um ist
  pubTick() {
    if (!this.pub || !this.isHost || this.pubStarted || !this.ch || this.ch.status !== 'joined') return;
    const now = Date.now(), here = this.pubIds.filter((id) => this.players.some((p) => p.id === id)).length;
    if (now >= this.pubAt && (here >= this.pubIds.length || now >= this.pubAt + 4000)) { this.pubStarted = true; this.startRound(); }
  },

  // Hintergrund: in Lobby und Suche (dort wartet man laenger) ein ruhiges, statisches Bild: Arena-Siegel (Pixelringe) hinter den Karten und ein Boden mit Warnstreifen,
  // in der Farbe der Spielart (PvP rot, Koop orange). Sonst die schlichte Gitterwand mit Funken.
  drawBg(ctx) {
    drawMenuBg(ctx, 'keysettings', false, 'pvp');
    if (this.st !== 'lobby' && this.st !== 'queue') { drawEmbers(ctx); return; }
    const P = STYLE.pal, W = STAGE_W, H = STAGE_H, accent = this.gameNow() === 'coop' ? P.orange : P.red, PX = PIXEL;
    ctx.save();
    ctx.fillStyle = 'rgba(4,5,14,0.55)'; ctx.fillRect(0, 0, W, H);                          // Wand etwas abdunkeln
    const cx = W / 2 + 100, cy = H / 2 + 6;                                                // Siegel: Ringe, Strichring und Markierungen
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.32; pxRing(ctx, cx, cy, 150, 1, 0, 0);
    ctx.globalAlpha = 0.26; pxRing(ctx, cx, cy, 128, 1, 40, 0);
    ctx.globalAlpha = 0.32; pxRing(ctx, cx, cy, 96, 1, 0, 0);
    ctx.globalAlpha = 0.2; pxRing(ctx, cx, cy, 64, 2, 24, 0.5);
    ctx.globalAlpha = 0.24;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, len = k % 2 ? 8 : 16;
      for (let r = 152; r < 152 + len; r += PX) ctx.fillRect(Math.round((cx + Math.cos(a) * r) / PX) * PX, Math.round((cy + Math.sin(a) * r) / PX) * PX, PX, PX);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillRect(Math.round((cx - 150) / PX) * PX, Math.round(cy / PX) * PX, 300, PX);       // Fadenkreuz
    ctx.fillRect(Math.round(cx / PX) * PX, Math.round((cy - 150) / PX) * PX, PX, 300);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H - 34, W, 34);                       // Boden
    ctx.fillStyle = accent; ctx.globalAlpha = 0.5; ctx.fillRect(0, H - 34, W, 2);
    ctx.globalAlpha = 0.12; for (let x = 0; x < W; x += 40) ctx.fillRect(x, H - 32, 2, 32); ctx.fillRect(0, H - 17, W, 2);
    ctx.globalAlpha = 0.3; ctx.fillStyle = P.yellow;                                          // Warnstreifen am unteren Rand
    for (let x = 0; x < W; x += 16) ctx.fillRect(x, H - 6, 8, 4);
    ctx.restore();
  },

  draw(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2;
    this.drawBg(ctx);
    if (this.st !== 'loadout' && this.st !== 'lobby') uiText(ctx, this.gameNow() === 'coop' ? 'CO-OP' : 'PVP', cx, 56, { size: T.h1, color: P.red, align: 'center', glow: P.red });
    const top = 90, GAP = 46;
    if (this.st === 'menu') {
      const NAMES = { quick: 'OPEN ROUND', create: 'CREATE LOBBY', join: 'JOIN LOBBY', back: 'BACK' }, labels = this.menuRows().map((r) => NAMES[r]), lw = 300, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX;
      labels.forEach((l, i) => drawMenuRow(ctx, top + i * GAP, l, this.sel === i, { w: lw, h: 36, cx: 40 + lw / 2, hit: () => { this.sel = i; } }));
      uiPanel(ctx, PX, top, PW, labels.length * GAP - 10, { color: P.red, fill: P.void, alpha: 0.92, glow: true });
      const D0 = { quick: ['Free for all with up to 6 players: the last one standing wins. The round starts after about ' + CFG.pvp.dm.queueWait + ' seconds.', ''],
        create: ['Open a lobby and share the code with your friends (up to ' + this.maxP() + ' players).', ''], join: ['Enter the code of a friend\'s lobby to join it.', ''], back: ['Back to the mode list.', ''] };
      const d = D0[this.menuRows()[this.sel]] || ['', ''];
      uiText(ctx, labels[this.sel], PX + 14, top + 24, { size: T.h1, color: P.red });
      let ty = top + 48;
      ty += 13 * uiWrap(ctx, d[0], PX + 14, ty, PW - 28, 13, { size: T.body, color: P.ice }) + 6;
      if (d[1]) ty += 13 * uiWrap(ctx, d[1], PX + 14, ty, PW - 28, 13, { size: T.body, color: P.grey }) + 6;
      uiText(ctx, this.name(), PX + PW - 14, top + 24, { size: T.small, color: P.cyan, align: 'right' });
      uiWrap(ctx, 'Up to 6 players, all vs all or in teams. Your own weapons, abilities and upgrades count. Needs an internet connection.', PX + 14, ty + 4, PW - 28, 13, { size: T.small, color: P.grey });
    } else if (this.st === 'queue') {
      const n = this.qList().length, sec = Math.floor((Date.now() - this.qAt) / 1000);
      uiText(ctx, 'OPEN ROUND', cx, 56, { size: T.h1, color: P.red, align: 'center', glow: P.red });
      uiText(ctx, this.qch && this.qch.status === 'joined' ? 'SEARCHING FOR PLAYERS...' : 'CONNECTING...', cx, 130, { size: T.h2, color: P.ice, align: 'center' });
      uiText(ctx, 'WAITING ' + sec + ' S    PLAYERS FOUND ' + Math.max(1, n) + ' / ' + CFG.pvp.maxPlayers, cx, 156, { size: T.body, color: P.yellow, align: 'center' });
      uiText(ctx, 'THE ROUND STARTS AFTER ABOUT ' + CFG.pvp.dm.queueWait + ' SECONDS', cx, 178, { size: T.small, color: P.grey, align: 'center' });
      const bx = cx - 70;
      UIHit.add(bx, 204, 140, 30, () => {}, { act: () => { this.qClose(); G.mode = 'modeselect'; } });
      uiPanel(ctx, bx, 204, 140, 30, { color: P.red, fill: P.void, alpha: 0.95 });
      uiText(ctx, 'CANCEL', cx, 225, { size: T.h2, color: P.red, align: 'center' });
    } else if (this.st === 'join') {
      uiText(ctx, 'ENTER THE LOBBY CODE', cx, 96, { size: T.h2, color: P.ice, align: 'center' });
      const bw = 36, gap = 8, x0 = cx - (Net.CODE_LEN * bw + (Net.CODE_LEN - 1) * gap) / 2;
      for (let i = 0; i < Net.CODE_LEN; i++) {
        const x = x0 + i * (bw + gap), cur = i === this.input.length;
        uiPanel(ctx, x, 106, bw, 38, { color: cur && Math.floor(G.realTime * 2) % 2 ? P.yellow : P.cyan, fill: P.void, alpha: 0.95 });
        if (this.input[i]) uiText(ctx, this.input[i], x + bw / 2, 134, { size: T.h1, color: P.ice, align: 'center' });
      }
      uiText(ctx, 'TAP THE LETTERS BELOW (OR TYPE, CTRL+V PASTES)', cx, 158, { size: T.small, color: P.grey, align: 'center' });
      if (Save.data.dev) uiText(ctx, 'DEV: ' + Net.DEV_CODES.join(', ') + ' = RESERVED DEV LOBBIES (WORK IN PVP AND CO-OP)', cx, 80, { size: T.small, color: P.yellow, align: 'center' });
      // Bildschirmtastatur (fuer Handy/Tablet ohne Tastatur): Zahlenreihe oben, dann QWERTZ (Sprache Deutsch) bzw. QWERTY, nur die erlaubten Code-Zeichen, jede Reihe zentriert
      const kw = 34, kh = 22, kg = 4, m = Input.mouse, rows = this.keyRows();
      rows.forEach((row, ri) => {
        const kx0 = cx - (row.length * kw + (row.length - 1) * kg) / 2, y = 166 + ri * (kh + kg);
        row.forEach((ch, i) => {
          const x = kx0 + i * (kw + kg), hot = m.x >= x && m.x <= x + kw && m.y >= y && m.y <= y + kh;
          UIHit.add(x, y, kw, kh, () => {}, { act: () => { if (this.input.length < Net.CODE_LEN) { this.input += ch; Sfx.play('tick'); } } });
          uiPanel(ctx, x, y, kw, kh, { color: hot ? P.ice : P.cyan, fill: hot ? P.greyMid : P.void, alpha: 0.95 });
          uiText(ctx, ch, x + kw / 2, y + 16, { size: T.h2, color: hot ? P.ice : P.cyan, align: 'center' });
        });
      });
      const by = 166 + 4 * (kh + kg) + 6, bw2 = 100, bg = 10, bx0 = cx - (3 * bw2 + 2 * bg) / 2;
      [['DEL', () => { this.input = this.input.slice(0, -1); Sfx.play('tick'); }, P.orange],
        ['JOIN', () => { if (this.input.length === Net.CODE_LEN) this.connect(this.input, false); else { this.say('A CODE HAS ' + Net.CODE_LEN + ' CHARACTERS', P.orange); Sfx.play('deny'); } }, P.green || P.cyan],
        ['BACK', () => { G.mode = 'modeselect'; }, P.red]].forEach(([l, fn, col], i) => {
        const x = bx0 + i * (bw2 + bg), hot = m.x >= x && m.x <= x + bw2 && m.y >= by && m.y <= by + 30;
        UIHit.add(x, by, bw2, 30, () => {}, { act: fn });
        uiPanel(ctx, x, by, bw2, 30, { color: hot ? P.ice : col, fill: hot ? P.greyMid : P.void, alpha: 0.95, glow: hot });
        uiText(ctx, l, x + bw2 / 2, by + 21, { size: T.h2, color: hot ? P.ice : col, align: 'center' });
      });
    } else if (this.st === 'loadout') {
      this.drawLoadout(ctx);
      if (this.pick && this.ruleKind() !== 'set') this.drawPick(ctx);
    } else {
      this.drawLobby(ctx, top);
    }
    if (this.msg) uiText(ctx, this.msg, cx, 338, { size: T.body, color: this.msgCol || P.orange, align: 'center' });
  },

  // Ausruestung: links Waffen und Implant, rechts die drei Ability-Gruppen und der Held, unten BACK. Bei SET nur die Set-Wahl.
  drawLoadout(ctx) {
    const P = STYLE.pal, T = STYLE.type, cx = STAGE_W / 2, kind = this.ruleKind(), rule = this.ruleNow();
    uiText(ctx, 'CHOOSE YOUR EQUIPMENT', cx, 38, { size: T.h2, color: P.ice, align: 'center' });
    uiText(ctx, this.RULE_NAMES[rule], cx, 54, { size: T.small, color: kind === 'all' ? P.yellow : kind === 'set' ? P.cyan : P.grey, align: 'center' });
    if (kind === 'set') return this.drawSetPick(ctx);
    const L = this.loadout(), tiers = CFG.loadout.tiers, w = 200, H = 44, GP = 50, y0 = 84, xs = [cx - w - 10, cx + 10], all = kind === 'all', t = G.realTime;
    uiText(ctx, 'WEAPONS & IMPLANT', xs[0], 78, { size: T.small, color: P.grey });
    uiText(ctx, 'ABILITIES & HERO', xs[1], 78, { size: T.small, color: P.grey });
    // Karte im Stil des Inventars: Farbstreifen, Symbol im Rahmen, Beschriftung, Name; schmale Pfeile rechts
    const card = (i, x, y, col, label, name, icon, iconW, n) => {
      const sel = this.sel === i, cw = w - (sel ? 6 : 0), cx0 = x + (sel ? 6 : 0);
      UIHit.add(x, y, w, H, () => { this.sel = i; });
      uiPanel(ctx, cx0, y, cw, H, { color: sel ? col : P.greyMid, fill: sel ? P.voidLight : P.void, alpha: 0.92, glow: sel });
      ctx.save(); ctx.globalAlpha = sel ? 1 : 0.45; ctx.fillStyle = col; ctx.fillRect(cx0 + 1, y + 4, 3, H - 8); ctx.restore();
      uiPanel(ctx, cx0 + 8, y + 7, 30, 30, { color: sel ? col : P.greyMid, fill: P.ink, alpha: 1, notch: 3 });
      if (icon) drawIcon(ctx, icon, cx0 + 23, y + 22 + (sel ? Math.round(Math.sin(t * 4)) : 0), Math.min(24, (iconW || 18) + 4), 1);
      else uiText(ctx, name ? name[0] : '?', cx0 + 23, y + 27, { size: T.h2, color: name ? col : P.greyMid, align: 'center' });
      const tw = cw - 44 - (n > 1 ? 22 : 6);
      uiText(ctx, label, cx0 + 44, y + 16, { size: T.small, color: col });
      uiText(ctx, name ? uiFit(ctx, name, tw, T.body) : 'NONE', cx0 + 44, y + 30, { size: T.body, color: name ? (sel ? P.ice : P.grey) : P.greyMid });
      if (n > 1) uiText(ctx, '...', x + w - 12, y + 26, { size: T.small, color: sel ? col : P.greyMid, align: 'center' });       // Hinweis: Antippen oeffnet die Liste
    };
    let desc = '';
    CFG.items.slots.forEach((s, i) => {
      const id = Save.pvpEquipped(s.id), I = id ? CFG.items.catalog[id] : null;
      card(i, xs[0], y0 + i * GP, slotColor(s.id), s.label, I ? I.name : '', I && I.icon, I && I.iconW, this.equipList(s.id).length);
      if (this.sel === i && I) desc = I.desc;
    });
    const tcol = { weak: P.cyan, medium: P.yellow, strong: P.orange };
    tiers.forEach((tr, i) => {
      const id = L[tr.id], A = id ? CFG.loadout.abilities[id] : null, n = this.tierList(tr.id).length;
      card(4 + i, xs[1], y0 + i * GP, tcol[tr.id] || P.cyan, tr.label + ' [' + tr.key.toUpperCase() + ']', A ? A.name : '', A && A.icon, A && A.iconW, n);
      if (this.sel === 4 + i && A) desc = A.desc;
    });
    const hid = Save.pvpHero(kind), Hc = CFG.heroes[hid];
    card(7, xs[1], y0 + 3 * GP, P.purple, 'HERO', Hc.name, null, 0, this.heroList().length);
    if (this.sel === 7) desc = Hc.blurb || '';
    const by = y0 + 4 * GP + 2, bw = 130;
    UIHit.add(cx - bw / 2, by, bw, 24, () => { this.sel = 8; });
    uiPanel(ctx, cx - bw / 2, by, bw, 24, { color: this.sel === 8 ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: this.sel === 8 });
    uiText(ctx, 'BACK', cx, by + 17, { size: T.h2, color: this.sel === 8 ? P.ice : P.grey, align: 'center' });
    if (desc) uiWrap(ctx, desc, xs[0], by + 40, 2 * w + 20, 11, { size: T.small, color: P.grey });
    else uiText(ctx, all ? 'EVERYTHING UNLOCKED, MAX LEVEL, MAX UPGRADES.' : 'ONLY WHAT YOU OWN. YOUR UPGRADES AND HERO COUNT.', cx, by + 44, { size: T.small, color: P.greyMid, align: 'center' });
  },

  // Auswahlfenster der Ausruestung: Karten mit Symbol, Name und Kurzinfo; die aktuelle Wahl ist markiert
  drawPick(ctx) {
    const P = STYLE.pal, T = STYLE.type, K = this.pick, col = K.col, t = G.realTime, cx = STAGE_W / 2;
    const w = 340, H = 36, GAP = 40, VIS = 6, x = cx - w / 2, y0 = 66;
    UIHit.list.length = 0;                                           // das Fenster liegt oben: darunter ist nichts klickbar
    ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = P.ink; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
    const rows = Math.max(1, Math.min(VIS, K.list.length));
    uiPanel(ctx, x - 12, y0 - 36, w + 24, 36 + rows * GAP + 14, { color: col, fill: P.void, alpha: 0.97, glow: true });
    uiCorners(ctx, x - 15, y0 - 39, w + 30, 36 + rows * GAP + 20, col, 7);
    uiText(ctx, K.title + ' - CHOOSE', cx, y0 - 14, { size: T.h2, color: col, align: 'center', glow: col });
    const off = clamp(K.sel - (VIS - 1), 0, Math.max(0, K.list.length - VIS));
    K.list.slice(off, off + VIS).forEach((id, k) => {
      const i = off + k, sel = K.sel === i, y = y0 + k * GAP, ox = sel ? 4 : 0;
      let name = 'NONE', sub = 'Leave it empty', icon = null, iw = 18;
      if (K.kind === 'slot' && id) { const I = CFG.items.catalog[id]; name = I.name; sub = itemFacts(id) || I.desc; icon = I.icon; iw = I.iconW; }
      else if (K.kind === 'tier' && id) { const A = CFG.loadout.abilities[id]; name = A.name; sub = A.desc; icon = A.icon; iw = A.iconW; }
      else if (K.kind === 'hero') { const Hc = CFG.heroes[id]; name = Hc.name; sub = Hc.blurb || ''; }
      UIHit.add(x, y, w, H, () => { K.sel = i; });
      uiPanel(ctx, x + ox, y, w - ox, H, { color: sel ? col : P.greyMid, fill: sel ? P.voidLight : P.void, alpha: 0.92, glow: sel });
      uiPanel(ctx, x + 7 + ox, y + 5, 26, 26, { color: sel ? col : P.greyMid, fill: P.ink, alpha: 1, notch: 3 });
      if (icon) drawIcon(ctx, icon, x + 20 + ox, y + 18 + (sel ? Math.round(Math.sin(t * 4)) : 0), Math.min(20, (iw || 18) + 2), 1);
      else uiText(ctx, name[0], x + 20 + ox, y + 24, { size: T.h2, color: sel ? col : P.greyMid, align: 'center' });
      uiText(ctx, name, x + 40 + ox, y + 15, { size: T.h2, color: sel ? P.ice : P.grey });
      uiText(ctx, uiFit(ctx, sub, w - 52 - (id === K.cur ? 56 : 0), T.small), x + 40 + ox, y + 28, { size: T.small, color: sel ? P.cyan : P.greyMid });
      if (id === K.cur) uiText(ctx, 'SELECTED', x + w - 8, y + 15, { size: T.small, color: P.cyan, align: 'right' });
    });
    if (K.list.length > VIS) uiText(ctx, (K.sel + 1) + ' / ' + K.list.length, cx, y0 + rows * GAP + 8, { size: T.small, color: P.grey, align: 'center' });
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
    drawMenuRow(ctx, y + 166, 'BACK', this.sel === 1, { w: 130, h: 24, cx, hit: () => { this.sel = 1; } });
    uiText(ctx, locked ? 'THE HOST CHOSE THIS SET FOR EVERYONE.' : 'NO UPGRADES, LEVEL 0 GEAR, HERO VANGUARD: EVERYONE IS EQUAL.', cx, y + 216, { size: T.small, color: P.greyMid, align: 'center' });
  },

  // Lobby: links die Knopfspalte, rechts Spielerkarten mit Schiff (Skin/Aura/Gear), im Team-Modus zwei Spalten A und B; oben der Code (Klick kopiert ihn)
  drawLobby(ctx, top) {
    const P = STYLE.pal, T = STYLE.type, t = G.realTime, W = STAGE_W, H = STAGE_H;
    const status = this.ch ? this.ch.status : 'closed', rows = this.lobbyRows(), coop = this.gameNow() === 'coop', mode = this.modeNow(), teams = !coop && mode !== 'ffa', accent = coop ? P.orange : P.red;
    uiText(ctx, this.pub ? 'OPEN ROUND' : coop ? 'CO-OP LOBBY' : 'PVP LOBBY', 16, 40, { size: T.h1, color: accent, glow: accent });
    if (this.pub) {
      const s = Math.max(0, Math.ceil((this.pubAt - Date.now()) / 1000));
      uiText(ctx, s > 0 ? 'STARTS IN ' + s : 'STARTING...', W - 60, 38, { size: T.h2, color: P.yellow, align: 'right' });
    } else {
      const bw = 28, bh = 32, gap = 4, n = this.code.length || 5, tw = n * (bw + gap) - gap, x0 = W - 60 - tw, copied = Date.now() - this.copied < 1500;          // Platz fuer das X oben rechts
      UIHit.add(x0 - 4, 8, tw + 8, bh + 14, () => {}, { act: () => { try { navigator.clipboard.writeText(this.code); } catch (e) { /* egal */ } this.copied = Date.now(); Sfx.play('tick'); } });
      uiText(ctx, copied ? 'COPIED!' : 'LOBBY CODE', x0 + tw / 2, 14, { size: T.small, color: copied ? P.green : P.grey, align: 'center' });
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (bw + gap);
        uiPanel(ctx, x, 18, bw, bh, { color: P.yellow, fill: P.voidLight, alpha: 0.95, glow: true });
        uiText(ctx, this.code[i] || '', x + bw / 2, 18 + 24, { size: T.h1, color: P.yellow, align: 'center' });
      }
    }
    // Knopfspalte
    const lx = 16, lw = 172, y0 = 74, BG = Math.min(30, Math.floor((H - 36 - y0) / Math.max(1, rows.length))), BH = Math.min(24, BG - 3);
    rows.forEach((r, i) => {
      const label = r === 'map' ? 'MAP: ' + CFG.maps[this.mapNow()].name : r === 'arena' ? 'ARENA: ' + CFG.pvp.maps[this.pmapNow()].name : r === 'start' ? (coop ? 'START RUN' : this.players.length < 2 && !this.isDevLobby() ? 'START (2+ PLAYERS)' : 'START ROUND') : r === 'game' ? 'GAME: ' + (coop ? 'CO-OP' : 'PVP') : r === 'bots' ? 'BOTS: ' + this.bots + ' / 3' : r === 'botlevel' ? 'BOT LEVEL: ' + CFG.pvp.bot.levels[this.botLevel].name : r === 'mode' ? (teams ? 'MODE: TEAMS (A / B)' : 'MODE: ALL VS ALL')
        : r === 'rule' ? this.RULE_SHORT[this.ruleNow()] : r === 'equipment' ? 'EQUIPMENT' : r === 'friends' ? 'INVITE FRIENDS' : 'LEAVE LOBBY';
      drawMenuRow(ctx, y0 + i * BG, label, this.sel === i, { w: lw, h: BH, cx: lx + lw / 2, hit: () => { this.sel = i; }, lr: r === 'game' || r === 'mode' || r === 'rule' || r === 'map' || r === 'arena' || r === 'bots' || r === 'botlevel' });
    });
    // Spielerkarten: Spalte = Team (A links, B rechts), sonst einfach zweispaltig
    const gx = 204, colW = Math.floor((W - 16 - gx - 10) / 2), ch = 62, gy = 92, slots = this.maxP(), sc = this.scores || {};
    if (teams) {
      uiText(ctx, 'TEAM A', gx + colW / 2, gy - 8, { size: T.h2, color: P.cyan, align: 'center' });
      uiText(ctx, 'TEAM B', gx + colW + 10 + colW / 2, gy - 8, { size: T.h2, color: P.red, align: 'center' });
    } else uiText(ctx, coop ? 'DIFFICULTY x' + CFG.coop.mult(Math.max(1, this.players.length)).toFixed(1) : 'ALL VS ALL', gx, gy - 8, { size: T.small, color: coop ? P.orange : P.grey });
    const botFill = this.pub ? Math.max(0, slots - Math.min(this.players.length, slots)) : 0;               // offene Runde: Bots fuellen die freien Plaetze beim Start, sie zaehlen schon jetzt mit
    uiText(ctx, (coop ? '' : CFG.pvp.maps[this.pmapNow()].name + '   ') + 'PLAYERS ' + (this.players.length + botFill) + ' / ' + slots, W - 16, gy - 8, { size: T.small, color: P.grey, align: 'right' });
    if (status === 'connecting' || (!this.players.length && status === 'joined')) uiText(ctx, 'CONNECTING...', gx + colW, gy + 40, { size: T.body, color: P.grey, align: 'center' });
    for (let i = 0; i < slots; i++) {
      const col = i % 2, row = Math.floor(i / 2), x = gx + col * (colW + 10), y = gy + row * (ch + 8), p = this.players[i], mine = !!(p && this.ch && p.id === this.ch.id);
      if (!p && this.pub) {                                                                       // offene Runde: dieser Platz wird beim Start von einem Bot besetzt
        uiPanel(ctx, x, y, colW, ch, { color: P.greyMid, fill: P.void, alpha: 0.95 });
        try {
          const ox = x + 32 - W / 2, oy = H / 2 - (y + ch / 2 + Math.sin(t * 1.8 + i) * 2);
          CoopMate.prototype.drawLook.call({ x: ox, y: oy, dir: 90, vx: 0, vy: 0, hp: 100, mhp: 100, blink: false, spr: 'player' }, ctx, 0, 0);
        } catch (e) { /* ohne Schiff weiter */ }
        uiText(ctx, this.botName(i - this.players.length), x + 64, y + 26, { size: T.h2, color: P.grey, maxW: colW - 64 - 40 });
        continue;
      }
      if (!p) {
        uiPanel(ctx, x, y, colW, ch, { color: P.greyDark, fill: P.void, alpha: 0.5 });
        ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2 + i); uiText(ctx, 'WAITING...', x + colW / 2, y + ch / 2 + 4, { size: T.small, color: P.grey, align: 'center' }); ctx.restore();
        continue;
      }
      const tcol = teams ? (col ? P.red : P.cyan) : mine ? P.cyan : P.greyMid;
      uiPanel(ctx, x, y, colW, ch, { color: tcol, fill: mine ? P.voidLight : P.void, alpha: 0.95, glow: mine || teams });
      try {                                                                                      // Schiff des Spielers (Skin, Aura, Gear), schwebt leicht
        const ox = x + 32 - W / 2, oy = H / 2 - (y + ch / 2 + Math.sin(t * 1.8 + i) * 2);
        CoopMate.prototype.drawLook.call({ x: ox, y: oy, dir: 90, vx: 0, vy: 0, hp: 100, mhp: 100, blink: false, cs: p.cs, spr: p.spr || 'player' }, ctx, 0, 0);
      } catch (e) { /* ohne Schiff weiter */ }
      uiText(ctx, p.name, x + 64, y + 26, { size: T.h2, color: mine ? P.ice : P.grey, maxW: colW - 64 - 40 });
      uiText(ctx, (mine ? 'YOU' : '') + (mine && p.host ? '  -  ' : '') + (p.host ? 'HOST' : '') + (sc[p.id] ? '   ' + sc[p.id] + ' WINS' : ''), x + 64, y + 44, { size: T.small, color: p.host ? P.yellow : P.cyan });
      if (teams) uiText(ctx, col ? 'B' : 'A', x + colW - 14, y + 40, { size: T.h1, color: tcol, align: 'center' });
    }
    const hint = this.pub ? 'The round starts as soon as everyone is here.' : coop ? (this.isHost ? 'Share the code, choose the map and start the run.' : 'Your own gear and hero count. Only the host can start the run.') : this.isHost ? 'Share the code, set up the round and start it.' : 'Choose your equipment. Only the host can start the round.';
    uiText(ctx, hint, gx + (W - 16 - gx) / 2, H - 14, { size: T.small, color: P.grey, align: 'center' });
  },
};

if (typeof I18n !== 'undefined' && I18n.add) I18n.add({
  'PVP': 'PVP', 'START RUN': 'LAUF STARTEN', 'DIFFICULTY x': 'SCHWIERIGKEIT x', 'CO-OP RUN': 'KOOP-LAUF', 'MULTIPLAYER': 'MEHRSPIELER', 'Play with other players online. Pick a multiplayer mode next.': 'Spiele online mit anderen Spielern. Wähle als Nächstes einen Mehrspieler-Modus.', 'Currently: PVP Arena. Needs an internet connection.': 'Aktuell: PvP-Arena. Braucht eine Internetverbindung.', 'Back to the mode selection.': 'Zurück zur Modus-Auswahl.', 'CREATE LOBBY': 'LOBBY ERSTELLEN', 'JOIN LOBBY': 'LOBBY BEITRETEN', 'JOIN': 'BEITRETEN', 'LEAVE LOBBY': 'LOBBY VERLASSEN', 'COPY CODE': 'CODE KOPIEREN', 'COPIED!': 'KOPIERT!',
  'LOBBY CODE': 'LOBBY-CODE', 'ENTER THE LOBBY CODE': 'LOBBY-CODE EINGEBEN', 'TYPE THE CODE (CTRL+V PASTES)': 'CODE TIPPEN (STRG+V FÜGT EIN)', 'TAP THE LETTERS BELOW (OR TYPE, CTRL+V PASTES)': 'BUCHSTABEN UNTEN ANTIPPEN (ODER TIPPEN, STRG+V FÜGT EIN)', 'DEL': 'LÖSCHEN',
  'CONNECTING...': 'VERBINDE...', 'RECONNECTING...': 'VERBINDE NEU...', 'JOINING...': 'TRETE BEI...', 'HOST': 'HOST', '(YOU)': '(DU)', 'CONNECTION FAILED': 'VERBINDUNG FEHLGESCHLAGEN',
  'THE HOST CLOSED THE LOBBY': 'DER HOST HAT DIE LOBBY GESCHLOSSEN', 'THE LOBBY IS FULL': 'DIE LOBBY IST VOLL', 'NO LOBBY WITH THIS CODE': 'KEINE LOBBY MIT DIESEM CODE',
  'NO CONNECTION POSSIBLE ON THIS DEVICE': 'AUF DIESEM GERÄT IST KEINE VERBINDUNG MÖGLICH',
  'Share the code. Everyone who joins appears here. Start the round when you are ready.': 'Teile den Code. Alle, die beitreten, erscheinen hier. Starte die Runde, wenn ihr bereit seid.',
  'Waiting for the host to start the round.': 'Warte darauf, dass der Host die Runde startet.',
  'START ROUND': 'RUNDE STARTEN', 'START ROUND (2+ PLAYERS)': 'RUNDE STARTEN (2+ SPIELER)', 'MODE: TEAMS (A / B)': 'MODUS: TEAMS (A / B)', 'MODE: ALL VS ALL': 'MODUS: JEDER GEGEN JEDEN', 'TEAMS': 'TEAMS', 'ALL VS ALL': 'JEDER GEGEN JEDEN', 'WINS': 'SIEGE',
  'A ROUND IS RUNNING - YOU JOIN THE NEXT ONE': 'EINE RUNDE LÄUFT - DU BIST BEIM NÄCHSTEN DABEI', 'Choose your abilities. Only the host can start the round.': 'Wähle deine Abilities. Nur der Host kann die Runde starten.', 'ABILITIES': 'ABILITIES', 'CHOOSE YOUR ABILITIES': 'WÄHLE DEINE ABILITIES', 'EQUIPMENT': 'AUSRÜSTUNG', 'SELECTED': 'GEWÄHLT', 'Leave it empty': 'Leer lassen', ' - CHOOSE': ' - WÄHLEN', 'RULES: OWN GEAR': 'REGEL: EIGENE', 'RULES: ONE SET': 'REGEL: EIN SET', 'RULES: PICK SET': 'REGEL: SET WÄHLEN', 'RULES: ALL GEAR': 'REGEL: ALLES', 'ABILITIES & HERO': 'ABILITIES & HELD', 'EVERYTHING UNLOCKED, MAX LEVEL, MAX UPGRADES.': 'ALLES FREI, MAX-STUFE, MAX-UPGRADES.', 'ONLY WHAT YOU OWN. YOUR UPGRADES AND HERO COUNT.': 'NUR DEIN BESITZ. DEINE UPGRADES UND DEIN HELD ZÄHLEN.', 'RULES: OWN EQUIPMENT': 'REGEL: EIGENE AUSRÜSTUNG', 'RULES: ONE SET FOR ALL': 'REGEL: EIN SET FÜR ALLE', 'RULES: PICK A SET': 'REGEL: SET WÄHLEN', 'RULES: ALL EQUIPMENT': 'REGEL: ALLE AUSRÜSTUNG', 'OWN EQUIPMENT': 'EIGENE AUSRÜSTUNG', 'ONE SET FOR ALL': 'EIN SET FÜR ALLE', 'PICK A SET': 'SET WÄHLEN', 'ALL EQUIPMENT': 'ALLE AUSRÜSTUNG', 'HERO': 'HELD', 'EVERYTHING IS UNLOCKED AND AT MAX LEVEL, WITH MAX UPGRADES.': 'ALLES IST FREIGESCHALTET UND AUF MAXIMALER STUFE, MIT MAXIMALEN UPGRADES.', 'ONLY WHAT YOU OWN CAN BE CHOSEN. YOUR UPGRADES AND HERO COUNT. YOUR ARMORY STAYS UNCHANGED.': 'NUR GEKAUFTES KANN GEWÄHLT WERDEN. DEINE UPGRADES UND DEIN HELD ZÄHLEN. DEINE WAFFENKAMMER BLEIBT UNVERÄNDERT.', 'THE HOST CHOSE THIS SET FOR EVERYONE.': 'DER HOST HAT DIESES SET FÜR ALLE GEWÄHLT.', 'NO UPGRADES, LEVEL 0 GEAR, HERO VANGUARD: EVERYONE IS EQUAL.': 'KEINE UPGRADES, AUSRÜSTUNG STUFE 0, HELD VANGUARD: ALLE SIND GLEICH.', 'WEAK': 'SCHWACH', 'MEDIUM': 'MITTEL', 'STRONG': 'STARK', 'CHOOSE YOUR EQUIPMENT': 'WÄHLE DEINE AUSRÜSTUNG', 'WEAPONS & IMPLANT': 'WAFFEN & IMPLANT', 'Choose your equipment. Only the host can start the round.': 'Wähle deine Ausrüstung. Nur der Host kann die Runde starten.', 'ONLY ITEMS AND ABILITIES YOU OWN CAN BE CHOSEN. THIS DOES NOT CHANGE YOUR ARMORY.': 'NUR GEKAUFTE ITEMS UND ABILITIES KÖNNEN GEWÄHLT WERDEN. DEINE WAFFENKAMMER BLEIBT UNVERÄNDERT.', 'NONE': 'KEINE', 'NONE UNLOCKED': 'KEINE FREIGESCHALTET', 'ONLY ABILITIES YOU HAVE UNLOCKED CAN BE CHOSEN.': 'NUR FREIGESCHALTETE ABILITIES KÖNNEN GEWÄHLT WERDEN.', 'YOU NEED AT LEAST 2 PLAYERS': 'DU BRAUCHST MINDESTENS 2 SPIELER',
  'ROUND STARTING - THE ARENA ITSELF COMES IN THE NEXT UPDATE': 'RUNDE STARTET - DIE ARENA SELBST KOMMT IM NÄCHSTEN UPDATE',
  'Back to the mode list.': 'Zurück zur Modusliste.', 'You are the host.': 'Du bist der Host.', "Enter the code of a friend's lobby to join it.": 'Gib den Code der Lobby eines Freundes ein, um beizutreten.',
  'Fight other players in an arena. Create a lobby and share the code, or join a friend with their code.': 'Kämpfe in einer Arena gegen andere Spieler. Erstelle eine Lobby und teile den Code, oder tritt mit dem Code eines Freundes bei.',
  'Up to 6 players, all vs all or in teams. Your own weapons, abilities and upgrades count. Needs an internet connection.': 'Bis zu 6 Spieler, jeder gegen jeden oder in Teams. Deine eigenen Waffen, Abilities und Upgrades zählen. Braucht eine Internetverbindung.',
  'YOU ARE THE HOST NOW': 'DU BIST JETZT DER HOST', 'THE ROUND STARTS AFTER ABOUT # SECONDS': 'DIE RUNDE STARTET NACH CA. # SEKUNDEN',
  'OPEN ROUND': 'OFFENE RUNDE', 'PVP LOBBY': 'PVP-LOBBY', 'CO-OP LOBBY': 'KOOP-LOBBY', 'WAITING...': 'WARTE...', 'TEAM A': 'TEAM A', 'TEAM B': 'TEAM B', 'COPIED!': 'KOPIERT!', 'STARTS IN ': 'STARTET IN ', 'YOU': 'DU', 'PLAYERS ': 'SPIELER ', 'MODE: DEATHMATCH 3V3': 'MODUS: DEATHMATCH 3V3', 'DEATHMATCH 3V3 - BOTS FILL EMPTY SLOTS': 'DEATHMATCH 3V3 - BOTS FÜLLEN FREIE PLÄTZE', 'PUBLIC MATCH': 'ÖFFENTLICHES SPIEL', 'STARTING...': 'STARTET...', 'CANCEL': 'ABBRECHEN', 'SEARCHING FOR PLAYERS...': 'SUCHE SPIELER...',
  'Open a lobby and share the code with your friends (up to # players).': 'Eröffne eine Lobby und teile den Code mit deinen Freunden (bis zu # Spieler).',
});
