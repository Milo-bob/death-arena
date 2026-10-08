// Tutorial: ein kurzes Level mit Ende. Jede Möglichkeit des Spiels bekommt ein eigenes Szenario (SCENARIOS unten), ohne Zeitlimit.
// Ablauf je Szenario: erst die grosse Textbox (Phase 'brief', das Spiel steht still, der Spieler liest nur und drueckt SPACE), dann die Aufgabe
// (Phase 'task': nur eine kleine Anzeige oben mit Ziel und Fortschritt). Szenarien mit rebrief: true zeigen die Textbox erneut, wenn ihre erste Zeile wechselt (neue Teilaufgabe).
// Man kommt nur weiter, wenn man die Aufgabe erledigt hat: die Texte lassen sich NICHT überspringen (nur ESC = Pause, dort "LEAVE TUTORIAL").
// Während des Tutorials ruht der Director (keine normalen Gegner, Events, Barrikaden, Bosszeitplan), die Zeit steht, nichts wird gespeichert
// (außer: abgeschlossen + einmalig 25 Cores). Der Spieler kann nicht sterben (Leben fällt nie unter TUT_HP_FLOOR).
// Neues Szenario: Eintrag in SCENARIOS (name, enter(s) beim Start der Textbox, begin(s) optional nach SPACE, update(dt, s), lines(s) = [Ziel, Erklaerung], progress(s), done(s)). s ist der Zustand des Szenarios.

const TUT_HP_FLOOR = 25;
const TUT_BONUS_CORES = 25;

const Tutorial = {
  active: false, idx: 0, phase: 'brief', t: 0, s: {}, bossDown: false, firstTime: false, newMs: [],

  start() {
    this.active = true; this.bossDown = false; this.firstTime = false; this.newMs = [];
    G.time = 0;
    this.enterScenario(0);
  },
  exit() {                                   // Pause > LEAVE TUTORIAL (oder nach dem Ende)
    this.active = false;
    G.mode = 'start';
    G.bossFight = false; G.boss = null; G.intro = null;
  },
  // Alle Szenarien geschafft: einmalig Bonus-Cores, Meilenstein "Tutorial" pruefen, speichern (die Endanzeige zeigt das Ergebnis)
  complete() {
    this.firstTime = !Save.data.tutorialDone;
    if (this.firstTime) Save.data.souls += TUT_BONUS_CORES;
    Save.data.tutorialDone = true;
    this.newMs = Save.checkMilestones();
    Save.write();
  },
  finish() { this.exit(); },

  // Spielfeld leeren und den Spieler für das nächste Szenario zurücksetzen
  clearField() {
    G.enemies = []; G.shots = []; G.blasts = []; G.obstacles = []; G.drops = []; G.powerups = []; G.bossShots = []; G.meteors = []; G.texts = [];
    G.bossFight = false; G.boss = null; G.intro = null;
  },
  enterScenario(i) {
    this.idx = i; this.phase = 'brief'; this.t = 0; this.s = {}; this.begun = false;
    this.clearField();
    const p = G.player;
    p.x = 0; p.y = 0; p.hp = p.maxHp; p.dashCd = 0; p.pulseCd = 0; p.shieldCd = 0;
    for (const k of Object.keys(p.cds)) p.cds[k] = 0;
    G.cam.x = 0; G.cam.y = 0; G.kills = 0;
    const sc = SCENARIOS[i];
    sc.enter(this.s);
    this.l0 = sc.lines(this.s)[0];
    if (sc.skip && sc.skip(this.s)) this.phase = 'task';                  // nichts zu tun (z. B. keine Evolution fuer diese Waffe): gleich als erledigt werten
  },

  update(dt) {
    if (!this.active) return;
    const p = G.player;
    p.afk = 0;
    if (p.hp < TUT_HP_FLOOR) p.hp = TUT_HP_FLOOR;              // Sicherheitsnetz: im Tutorial stirbt man nicht
    if (this.phase === 'end') { if (Input.pressed('Space') || Input.pressed('Enter') || Input.clicked) this.finish(); return; }
    if (this.phase === 'cleared') {
      this.t += dt;
      if (this.t > 1.5) { if (this.idx + 1 >= SCENARIOS.length) { this.phase = 'end'; this.clearField(); this.complete(); } else this.enterScenario(this.idx + 1); }
      return;
    }
    const s = SCENARIOS[this.idx];
    if (this.phase === 'brief') {                                          // Textbox: nichts passiert, bis der Spieler SPACE drueckt
      this.t += dt;
      if (this.t > 0.35 && (Input.pressed('Space') || Input.pressed('Enter') || Input.clicked)) {
        this.phase = 'task'; this.t = 0;
        Sfx.play('select');
        if (!this.begun) { this.begun = true; s.begin && s.begin(this.s); }
        this.l0 = s.lines(this.s)[0];
      }
      return;
    }
    s.update && s.update(dt, this.s);
    if (s.done(this.s)) {
      this.phase = 'cleared'; this.t = 0;
      Sfx.play('upgrade');
      G.trigger('TASK COMPLETE', STYLE.pal.green, { flash: 0.12, radius: 60, rings: 2 });
      return;
    }
    const l0 = s.lines(this.s)[0];
    if (s.rebrief && l0 !== this.l0) { this.l0 = l0; this.phase = 'brief'; this.t = 0; Sfx.play('levelUp'); }       // neue Teilaufgabe: Textbox erneut
  },

  // Markierungen in der Spielwelt (Pixel-Ringe)
  drawWorld(ctx) {
    if (!this.active || (this.phase !== 'task' && this.phase !== 'brief')) return;
    const s = SCENARIOS[this.idx];
    if (!s.marker) return;
    const m = s.marker(this.s);
    if (!m) return;
    const P = STYLE.pal, cx = STAGE_W / 2 + m.x, cy = STAGE_H / 2 - m.y, pulse = 0.5 + 0.5 * Math.sin(G.realTime * 5);
    ctx.save();
    ctx.fillStyle = P.cyan; ctx.globalAlpha = 0.15 + 0.15 * pulse; pxDisc(ctx, cx, cy, m.r);
    ctx.globalAlpha = 1; pxRing(ctx, cx, cy, m.r, 2, 12, G.realTime * 0.2);
    ctx.restore();
  },

  draw(ctx) {
    if (!this.active) return;
    const P = STYLE.pal, T = STYLE.type;
    if (this.phase === 'end') {
      ctx.fillStyle = 'rgba(5,6,15,0.7)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      uiPanel(ctx, STAGE_W / 2 - 170, 100, 340, 140, { color: P.green, fill: P.void, alpha: 0.96, glow: true });
      uiText(ctx, 'TUTORIAL COMPLETE', STAGE_W / 2, 135, { size: T.h1, color: P.green, align: 'center', glow: P.green });
      uiText(ctx, 'You know every basic now. Spend cores in UPGRADES and', STAGE_W / 2, 160, { size: T.body, color: P.ice, align: 'center' });
      uiText(ctx, 'INVENTORY, then take on bosses, events and evolutions.', STAGE_W / 2, 173, { size: T.body, color: P.ice, align: 'center' });
      if (this.firstTime) uiText(ctx, 'FIRST TIME BONUS: +' + TUT_BONUS_CORES + ' CORES', STAGE_W / 2, 194, { size: T.h2, color: P.yellow, align: 'center' });
      if (this.newMs.length) uiText(ctx, 'MILESTONE: ' + this.newMs[0].name, STAGE_W / 2, 212, { size: T.small, color: P.cyan, align: 'center' });
      drawPrompt(ctx, 'MENU [SPACE]', 232);
      return;
    }
    const s = SCENARIOS[this.idx], lines = s.lines(this.s), head = 'TUTORIAL ' + (this.idx + 1) + '/' + SCENARIOS.length + '  -  ' + s.name;
    if (this.phase === 'brief') {                                         // grosse Textbox: Ziel und Erklaerung, Spiel steht still
      const w = 360, h = 150, x = STAGE_W / 2 - w / 2, y = 96, pulse = 0.55 + 0.45 * Math.sin(G.realTime * 4);
      ctx.fillStyle = 'rgba(5,6,15,0.55)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      uiPanel(ctx, x, y, w, h, { color: P.yellow, fill: P.void, alpha: 0.97, glow: true });
      uiText(ctx, head, STAGE_W / 2, y + 16, { size: T.small, color: P.yellow, align: 'center' });
      const n = uiWrap(ctx, lines[0], STAGE_W / 2, y + 40, w - 30, 16, { size: T.h2, color: P.white, align: 'center' });
      uiWrap(ctx, lines[1], STAGE_W / 2, y + 40 + n * 16 + 6, w - 40, 13, { size: T.body, color: P.ice, align: 'center' });
      uiText(ctx, 'Nothing happens until you press SPACE. Read in peace.', STAGE_W / 2, y + h - 36, { size: T.small, color: P.grey, align: 'center' });
      ctx.save(); ctx.globalAlpha = pulse;
      uiPanel(ctx, STAGE_W / 2 - 100, y + h - 28, 200, 20, { color: P.green, fill: P.void, alpha: 1, glow: true });
      uiText(ctx, 'PRESS SPACE TO START', STAGE_W / 2, y + h - 14, { size: T.h2, color: P.green, align: 'center' });
      ctx.restore();
      return;
    }
    const done = this.phase === 'cleared', col = done ? P.green : P.yellow, w = 260, x = STAGE_W / 2 - 40 - w / 2, y = 10;   // Aufgabe laeuft: kleine Anzeige oben, der Bildschirm bleibt frei
    if (done) {
      uiPanel(ctx, x, y, w, 26, { color: col, fill: P.void, alpha: 0.9, glow: true });
      uiText(ctx, 'TASK COMPLETE', x + w / 2, y + 18, { size: T.h2, color: P.green, align: 'center', glow: P.green });
      return;
    }
    uiPanel(ctx, x, y, w, 44, { color: col, fill: P.void, alpha: 0.85, glow: false });
    uiText(ctx, (this.idx + 1) + '/' + SCENARIOS.length + '  ' + s.name, x + 8, y + 11, { size: T.small, color: P.grey });
    uiText(ctx, lines[0], x + w / 2, y + 25, { size: T.body, color: P.ice, align: 'center' });
    uiText(ctx, s.progress(this.s), x + w / 2, y + 38, { size: T.small, color: P.cyan, align: 'center' });
  },
};

// ---------- Hilfen für die Szenarien ----------
const tkeys = (...ids) => ids.map((i) => Input.fullLabel(i)).join(ids.length > 2 ? ' ' : ' / ');       // ausgeschriebene Tastennamen (SHIFT, SPACE ...)
function tutSpawn(type, angle, dist) {
  const p = G.player, [x, y] = clampToMap(p.x + fwdX(angle) * dist, p.y + fwdY(angle) * dist, 20), e = new Enemy(type, x, y, false);
  G.enemies.push(e);
  return e;
}
// Hält n Gegner eines Typs am Leben (ersetzt besiegte), solange noch welche gebraucht werden (need)
function tutKeep(type, n, need, dist) {
  const have = G.enemies.filter((e) => e.alive && e.type === type).length;
  for (let i = have; i < Math.min(n, need); i++) tutSpawn(type, rand(0, 360), dist);
}
const tutCount = (n, goal, what) => what + ' ' + Math.min(n, goal) + '/' + goal;

const SCENARIOS = [
  {
    name: 'MOVEMENT',
    enter: (s) => { s.pts = [[-130, 60], [120, 70], [0, -100]]; s.i = 0; },
    update: (dt, s) => { const q = s.pts[s.i]; if (q && Math.hypot(G.player.x - q[0], G.player.y - q[1]) < 22) { s.i++; Sfx.play('select'); } },
    marker: (s) => s.pts[s.i] ? { x: s.pts[s.i][0], y: s.pts[s.i][1], r: 22 } : null,
    lines: () => ['MOVE: ' + tkeys('up', 'left', 'down', 'right'), Save.data.touch ? 'Walk into the glowing ring with the left stick. The right stick aims and attacks.' : Save.data.mouseAim ? 'Walk into the glowing ring. You aim with the mouse.' : 'Walk into the glowing ring. You face the way you walk. A quick tap only turns you.'],
    progress: (s) => tutCount(s.i, 3, 'RINGS'),
    done: (s) => s.i >= 3,
  },
  {
    name: 'MELEE ATTACK',
    enter: (s) => { G.player.weapon = WEAPON.SWORD; },
    update: () => { G.player.weapon = WEAPON.SWORD; tutKeep('circle', 2, 3 - G.kills, 130); },
    lines: () => ['ATTACK: ' + tkeys('attack') + '  (hold to keep attacking)', 'Defeat 3 circles with your melee weapon. Good against swarms.'],
    progress: () => tutCount(G.kills, 3, 'KILLS'),
    done: () => G.kills >= 3,
  },
  {
    name: 'RANGED ATTACK',
    rebrief: true,
    enter: (s) => { s.stage = 0; G.player.weapon = WEAPON.SWORD; },
    update: (dt, s) => {
      if (s.stage === 0 && G.player.weapon === WEAPON.SHOT) { s.stage = 1; G.kills = 0; }
      if (s.stage === 1) tutKeep('triangle', 2, 2 - G.kills, 150);
    },
    lines: (s) => s.stage === 0 ? ['SWITCH WEAPON: press ' + tkeys('weapon2') + ' (ranged)', tkeys('weapon1') + ' = melee, ' + tkeys('weapon2') + ' = ranged. Mouse wheel works too.'] : ['SHOOT: ' + tkeys('attack'), 'Defeat 2 triangles from a distance. They shoot back!'],
    progress: (s) => s.stage === 0 ? 'WAITING FOR WEAPON SWITCH' : tutCount(G.kills, 2, 'KILLS'),
    done: (s) => s.stage === 1 && G.kills >= 2,
  },
  {
    name: 'ABILITY SELECTION',
    enter: (s) => {
      G.player.slots.weak = null;
    },
    begin: () => {
      G.pick = { tier: CFG.loadout.tiers[0], ids: ['dash', 'shockstep', 'adrenaline'], sel: 0, age: 0 };         // wie nach einem Boss: 3 Abilities zur Wahl
      G.mode = 'pick';
    },
    lines: () => ['ABILITY SELECTION', 'Pick one of the three abilities. Your choice goes into the WEAK slot.'],
    progress: () => 'WAITING FOR YOUR CHOICE',
    done: () => !!G.player.slots.weak,
  },
  {
    name: 'ABILITY: USE IT',
    enter: (s) => { s.n = 0; s.prev = false; },
    update: (dt, s) => {
      const p = G.player, id = p.slots.weak, used = id === 'dash' ? p.dashLeft > 0 : p.cds[id] > 0;
      if (used && !s.prev) { s.n++; if (id !== 'dash') p.cds[id] = 0; }                // jede Benutzung zählen, keine Wartezeit im Tutorial
      s.prev = used;
      if (id === 'dash' && !used) p.dashCd = 0;
    },
    lines: () => { const A = CFG.loadout.abilities[G.player.slots.weak]; return ['USE ' + A.name + ': ' + tkeys('ability_weak'), A.desc + ' Use it 3 times.']; },
    progress: (s) => tutCount(s.n, 3, 'USES'),
    done: (s) => s.n >= 3,
  },
  {
    name: 'ABILITY: FORCE BUBBLE',
    enter: (s) => { G.player.slots.medium = 'shield'; s.t = 0; },
    update: (dt, s) => { if (G.player.shield) s.t += dt; else G.player.shieldCd = 0; tutKeep('triangle', 2, 99, 140); },
    lines: () => ['FORCE BUBBLE: ' + tkeys('ability_medium'), 'It blocks every shot and push. Keep it up for 1.5 seconds while the triangles fire.'],
    progress: (s) => 'BUBBLE ' + Math.min(1.5, s.t).toFixed(1) + ' / 1.5 s',
    done: (s) => s.t >= 1.5,
  },
  {
    name: 'COVER',
    rebrief: true,
    enter: (s) => {
      s.stage = 0;
      for (const [ox, oy] of [[-24, 48], [28, 52]]) { const o = new Obstacle(ox, oy); o.maxHp = o.hp = 16; o.age = 1; G.obstacles.push(o); }
    },
    update: (dt, s) => {
      const hits = G.obstacles.reduce((a, o) => a + (o.enemyHits || 0), 0);
      if (s.stage === 0) { tutKeep('square', 1, 1, 150); s.hits = hits; if (hits >= 3) { s.stage = 1; for (const o of G.obstacles) o.hp = Math.min(o.hp, 3); G.enemies = []; G.shots = []; s.start = G.obstacles.length; } }
      else s.gone = s.start - G.obstacles.filter((o) => o.alive).length;
    },
    lines: (s) => s.stage === 0
      ? ['TAKE COVER behind the barricades', 'The square fires missiles. Stand behind a barricade so it soaks up 3 of them.']
      : ['DESTROY A BARRICADE', 'Barricades block everything, but your attacks break them. Smash one.'],
    progress: (s) => s.stage === 0 ? tutCount(s.hits || 0, 3, 'MISSILES BLOCKED') : 'BARRICADES DESTROYED ' + Math.min(1, s.gone || 0) + '/1',
    done: (s) => s.stage === 1 && (s.gone || 0) >= 1,
  },
  {
    name: 'CRATES & LOOT',
    enter: (s) => {
      G.player.hp = 60; s.total = 3;
      for (const [ox, oy] of [[-80, 40], [70, 55], [10, -75]]) { const o = new Obstacle(ox, oy); o.maxHp = o.hp = 4; o.age = 1; G.obstacles.push(o); }
    },
    update: (dt, s) => { s.gone = s.total - G.obstacles.filter((o) => o.alive).length; for (const q of G.powerups) q.age = 0; },
    lines: () => ['SMASH THE CRATES', 'Barricades hide loot: cores, healing and buffs. Break all three, then grab what drops.'],
    progress: (s) => (s.gone || 0) < s.total ? tutCount(s.gone || 0, s.total, 'CRATES') : 'LOOT LEFT ' + G.powerups.length,
    done: (s) => (s.gone || 0) >= s.total && G.powerups.length === 0 && G.drops.length === 0,
  },
  {
    name: 'PICKUPS',
    enter: (s) => {
      G.player.hp = 50;
      G.powerups.push(new PowerUp(-90, 30, 30));
      G.drops.push(new Drop(100, -20, 'haste'));
    },
    update: () => { for (const q of G.powerups) q.age = 0; for (const d of G.drops) d.age = 0; },   // bleiben liegen, kein Zeitdruck
    lines: () => ['COLLECT PICKUPS: just walk over them', 'The green cross heals you. Diamonds give a temporary buff (speed, rapid fire, ...).'],
    progress: () => 'LEFT ' + (G.powerups.length + G.drops.length),
    done: () => G.powerups.length === 0 && G.drops.length === 0,
  },
  {
    name: 'ULTIMATE',
    enter: (s) => { G.ultCharge = 100; s.used = false; s.seen = false; for (let i = 0; i < 6; i++) tutSpawn('circle', i * 60, 130); },
    update: (dt, s) => {
      const u = G.player.ult && G.player.ult.alive;
      if (u) s.seen = true;
      if (s.seen && !u) s.used = true;
    },
    lines: () => ['ULTIMATE: ' + tkeys('ultimate'), 'The orb at the bottom is full. Unleash it to wipe out everything on screen. Kills fill it again.'],
    progress: (s) => s.seen ? 'RELEASED' : 'PRESS ' + tkeys('ultimate'),
    done: (s) => s.used,
  },
  {
    name: 'EVOLUTION',
    enter: (s) => {
      const w = Save.equipped('melee'), id = Object.keys(CFG.evolutions.list).find((k) => CFG.evolutions.list[k].slot === 'melee' && CFG.evolutions.list[k].weapon === w);
      s.id = id; s.stage = 0;
    },
    skip: (s) => !s.id,                                                                 // keine Evolution fuer diese Nahkampfwaffe: Szenario entfaellt
    begin: (s) => { G.pick = { kind: 'evo', tier: null, ids: [s.id], sel: 0, age: 0 }; G.mode = 'pick'; },
    rebrief: true,
    update: (dt, s) => {
      if (!s.id) return;
      const R = CFG.evolutions.list[s.id];
      if (s.stage === 0) {
        if (G.player.evolved[R.slot] === s.id) { s.stage = 1; G.kills = 0; }
        else if (G.mode === 'play') { G.pick = { kind: 'evo', tier: null, ids: [s.id], sel: 0, age: 0 }; G.mode = 'pick'; }      // ESC ueberspringt hier nicht
      } else { G.player.weapon = WEAPON.SWORD; tutKeep('circle', 3, 3 - G.kills, 130); }
    },
    lines: (s) => {
      if (!s.id) return ['EVOLUTION', 'Nothing to evolve.'];
      const R = CFG.evolutions.list[s.id], W = CFG.items.catalog[R.weapon];
      return s.stage === 0 ? ['EVOLUTION: ' + W.name + ' + ' + evoPartner(R, false).name, 'Weapon + partner = stronger form. In real runs it is offered after 3 bosses. Take it.'] : ['TRY ' + R.name + ': ' + tkeys('attack'), R.desc];
    },
    progress: (s) => !s.id ? '' : s.stage === 0 ? 'WAITING FOR YOUR CHOICE' : tutCount(G.kills, 3, 'KILLS'),
    done: (s) => !s.id || (s.stage === 1 && G.kills >= 3),
  },
  {
    name: 'BOSS FIGHT',
    enter: (s) => { s.set = false; G.player.slots.medium = 'shield'; },
    begin: () => G.startBossFight('octagon'),
    update: (dt, s) => { if (G.boss && !s.set) { G.boss.maxHp = G.boss.hp = 8; s.set = true; } },
    lines: (s) => s.set ? ['DEFEAT THE BOSS', 'Dodge its bolts, use ' + tkeys('ability_weak') + ' and ' + tkeys('ability_medium') + ', hit it with everything.'] : ['A BOSS APPEARS ...', 'Real bosses are much tougher. This one is a practice dummy.'],
    progress: (s) => G.boss ? 'BOSS HP ' + Math.max(0, Math.ceil(G.boss.hp)) + ' / ' + G.boss.maxHp : '',
    done: () => Tutorial.bossDown,
  },
];
