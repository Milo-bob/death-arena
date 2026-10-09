// Touch-Steuerung (Einstellungen > TOUCH CONTROLS). Links ein Joystick mit nipplejs (js/nipplejs.min.js, lokal) zum Laufen, der Spieler blickt in
// Laufrichtung (kein Ziel-Stick). Alle Tasten liegen am rechten Rand. Zu Rundenbeginn zeigt ein Hinweis-Stick, wo der Joystick ist, bis er zum ersten Mal angetippt wird.
// Die Tasten setzen einfach die Tastatur-Codes in Input.keys / Input.pressedNow, der Rest des Spiels merkt keinen Unterschied.
// Gezeichnet werden die Tasten auf einer eigenen Leinwand ueber dem ganzen Fenster, mit denselben Zeichenfunktionen wie die Hotbar (drawSlot, drawUltOrb,
// hudSlots in ui.js): gleiche Symbole, Rahmen, Abklingzeiten und Cosmetic-HUD-Themes. Die unsichtbaren DOM-Flaechen darueber fangen nur die Beruehrung ab.
// Joystick-Werte stehen in Input.touch: mv = { on, dir } (Laufrichtung), aim bleibt immer aus (Rest des Spiels fragt es noch ab), dir im Spielwinkel (0 = oben, 90 = rechts).

const Touch = {
  built: false,
  shown: false,
  deadzone: 0.22,                         // Anteil des Stick-Radius, unter dem nichts passiert
  size: 120,                              // Durchmesser des Sticks in Pixeln
  touched: false,                         // Spieler hat den Joystick in dieser Runde schon angetippt (Hinweis-Stick weg)
  // Tasten: Beschriftungen (die erste, die Platz hat; \n = Zeilenumbruch), Aktion (Tastenbelegung) oder Tastencode, Groesse (a = Angriff, m = mittel, s = klein).
  // Anordnung siehe layout(): Angriff unten rechts; Waffenwechsel (links), Ultimate (schraeg links oben) und starke Waffe (oben) gleichmaessig um den Angriff;
  // darueber als Stapel Artefakt (falls vorhanden), die drei Abilities (1 = schwach, 3 = stark) und Pause. Alles im Streifen rechts neben dem Spielfeld.
  buttons: [
    { id: 'atk', labels: ['ATTACK'], act: 'attack', size: 'a' },
    { id: 'swap', labels: ['CHANGE\nWEAPON', 'CHANGE\nWPN', 'SWAP'], swap: true, size: 'm' },
    { id: 'hvy', labels: ['HEAVY\nWEAPON', 'HEAVY', 'HVY'], act: 'beam', size: 'm' },
    { id: 'ult', labels: ['ULTIMATE', 'ULT'], act: 'ultimate', size: 'm' },
    { id: 'art', labels: ['ARTIFACT', 'ART'], act: 'artifact', size: 'm' },
    { id: 'a1', labels: ['ABILITY 1', '1'], act: 'ability_weak', size: 's', tier: 0 },
    { id: 'a2', labels: ['ABILITY 2', '2'], act: 'ability_medium', size: 's', tier: 1 },
    { id: 'a3', labels: ['ABILITY 3', '3'], act: 'ability_strong', size: 's', tier: 2 },
    { id: 'pause', labels: ['PAUSE'], code: 'KeyP', size: 's' },
  ],

  // Stick-Ereignis in Spielwinkel umrechnen. nipplejs liefert den mathematischen Winkel (0 = rechts, gegen den Uhrzeigersinn).
  stick(target, ev) {
    const d = ev.data;
    if (!d || !d.angle) return;
    const frac = (d.distance || 0) / (this.size / 2);
    target.on = frac >= this.deadzone;
    target.dir = 90 - d.angle.radian / DEG;
  },

  // Unsichtbare Beruehrungsflaeche einer Taste
  makeButton(parent, b) {
    const el = document.createElement('div');
    el.className = 'tbtn';
    parent.appendChild(el);
    b.el = el;
    let held = null;                                                           // Tastencode, der mit diesem Druck gesetzt wurde (Waffenwechsel waehlt ihn beim Druck)
    const code = () => b.code || (b.swap ? Input.code(G.player && G.player.weapon === 0 ? 'weapon2' : 'weapon1') : Input.code(b.act));
    const press = (e) => { e.preventDefault(); held = code(); if (!Input.keys[held]) Input.pressedNow[held] = true; Input.keys[held] = true; b.down = true; };
    const release = (e) => { e.preventDefault(); if (held) Input.keys[held] = false; held = null; b.down = false; };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
  },

  // Anordnung (Pixel im Fenster). Alle Tasten sollen im Streifen rechts neben dem 4:3-Spielfeld liegen (hoechstens ganz wenig darueber);
  // die Groesse richtet sich deshalb nach der Streifenbreite. Beschriftungen stehen neben der Taste (rechts, links, darunter, darueber), reichen aber
  // nicht ins Spielfeld und laufen nicht ueber andere Tasten oder Texte; passt eine Beschriftung nicht, wird die naechstkuerzere versucht.
  layout() {
    const W = window.innerWidth, H = window.innerHeight, by = {};
    this.buttons.forEach((b) => { by[b.id] = b; });
    const cv = document.getElementById('gameCanvas'), cr = cv.getBoundingClientRect(), u = cr.height / STAGE_H;
    this.u = u;
    const fieldRight = cr.left + cr.width * (PAD + 480) / CANVAS_W, strip = W - fieldRight;      // Streifen rechts vom Spielfeld
    const g = Math.max(10, Math.round(0.045 * H)), bot = Math.max(8, Math.round(0.04 * H)), gap = Math.max(5, Math.round(0.015 * H)), top = Math.max(8, Math.round(0.03 * H));
    const m = Math.max(40, Math.round(Math.min(0.15 * H, (strip * 1.04 - g) / 2.775)));            // mittlere Taste; Angriff 1.35x, Abilities/Pause 0.8x
    const SZ = { m, a: Math.round(m * 1.35), s: Math.max(34, Math.round(m * 0.8)) };
    const A = SZ.a, S = SZ.s;
    const place = (b, cx, cy) => { b.r = { x: Math.round(cx - SZ[b.size] / 2), y: Math.round(cy - SZ[b.size] / 2), w: SZ[b.size], h: SZ[b.size] }; };
    const acx = W - g - A / 2, acy = H - bot - A / 2, R = Math.round(Math.max(m * 1.4 + 8, A / 2 + m / 2 + 6));
    place(by.atk, acx, acy);
    const arc = (b, deg) => place(b, acx + R * Math.cos(deg * DEG), acy - R * Math.sin(deg * DEG));
    arc(by.swap, 180); arc(by.ult, 135); arc(by.hvy, 90);
    this.hasArt = !!Hero.artifact();
    const stack = (this.hasArt ? ['art'] : []).concat(['a1', 'a2', 'a3', 'pause']);              // Stapel nach oben ueber der starken Waffe, bei Platzmangel eine zweite Spalte links
    let col = 0, cy = by.hvy.r.y - gap;
    const startY = cy;
    stack.forEach((id) => {
      const sz = SZ[by[id].size];
      if (cy - sz < top) { col += 1; cy = startY; }
      by[id].r = { x: Math.round(W - g - sz - col * (S + gap)), y: Math.round(cy - sz), w: sz, h: sz };    // erste Spalte: rechte Kante buendig mit der des Angriffs
      cy -= sz + gap;
    });
    // Beschriftungen
    const T = STYLE.type, mc = this.octx;
    mc.save(); mc.setTransform(1, 0, 0, 1, 0, 0); mc.font = uiFont(T.small);
    const lh = (T.small + 2) * u, placed = [];
    const hit = (p, q, pad) => p.x < q.x + q.w + pad && p.x + p.w + pad > q.x && p.y < q.y + q.h + pad && p.y + p.h + pad > q.y;
    this.buttons.forEach((b) => {
      b.spot = null;
      if (b.id === 'art' && !this.hasArt) return;
      for (const text of b.labels) {
        const lines = text.split('\n'), tw = Math.ceil(Math.max(...lines.map((l) => mc.measureText(l).width)) * u), th = lines.length * lh;
        const mx = b.r.x + b.r.w / 2, my = b.r.y + b.r.h / 2;
        const cands = [['r', b.r.x + b.r.w + 4, my - th / 2, 'left'], ['l', b.r.x - 4 - tw, my - th / 2, 'right'], ['b', mx - tw / 2, b.r.y + b.r.h + 2, 'center'], ['t', mx - tw / 2, b.r.y - 2 - th, 'center']];
        for (const [side, lx0, ly, align] of cands) {
          const lx = side === 'b' || side === 't' ? Math.min(Math.max(lx0, fieldRight + 2), W - 2 - tw) : lx0, q = { x: lx, y: ly, w: tw, h: th };
          if (lx < fieldRight + 2 || lx + tw > W - 2 || ly < 0 || ly + th > H) continue;
          if (this.buttons.some((o) => (o.id !== 'art' || this.hasArt) && hit(q, o.r, 2)) || placed.some((p) => hit(q, p, 2))) continue;
          b.spot = { x: lx, y: ly, w: tw, align, lines }; placed.push(q); break;
        }
        if (b.spot) break;
      }
      Object.assign(b.el.style, { left: b.r.x + 'px', top: b.r.y + 'px', width: b.r.w + 'px', height: b.r.h + 'px' });
    });
    mc.restore();
    this.lastSize = W + 'x' + H + 'x' + Math.round(cr.left) + 'x' + Math.round(cr.height);
  },

  // Tasten auf die Leinwand zeichnen (Einheiten wie im Spiel: 1 Einheit = u Pixel)
  render() {
    const cv = this.ocv, ctx = this.octx, W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1, u = this.u, p = G.player;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); ctx.imageSmoothingEnabled = false;
    if (!p) return;
    const P = STYLE.pal, D = hudSlots(p), ultReady = G.ultCharge > CFG.ult.readyAt;
    const atkOn = Input.attackToggleMode() ? !!Input.attackOn : !!this.buttons[0].down;
    Cos2.hudBegin();
    try {
      for (const b of this.buttons) {
        if (b.id === 'art' && !D.artifact) { b.el.style.display = 'none'; continue; }
        b.el.style.display = 'block';
        ctx.save();
        ctx.translate(b.r.x / u, b.r.y / u);
        const k = b.r.w / u / SLOT;
        ctx.scale(k, k);
        const base = (o, extra) => Object.assign({}, o, { key: '', count: '', selected: false }, extra);
        if (b.id === 'atk') drawSlot(ctx, 0, 0, base(p.weapon === WEAPON.SWORD ? D.melee : D.ranged, { active: atkOn }));
        else if (b.id === 'swap') drawSlot(ctx, 0, 0, base({ icon: 'swapIcon', iconW: 18, color: P.cyan, ready: 1 }, { active: !!b.down }));
        else if (b.id === 'ult') drawSlot(ctx, 0, 0, base({ icon: 'ultIcon', iconW: 18, color: P.teal, ready: ultReady ? 1 : clamp(G.ultCharge / (CFG.ult.readyAt + 1), 0, 1) }, { active: !!b.down || (ultReady && Math.floor(G.realTime * 4) % 2 === 0) }));
        else if (b.id === 'hvy') drawSlot(ctx, 0, 0, base(D.heavy.icon ? D.heavy : { icon: 'slotEmptyIcon', iconW: 18, color: P.greyMid, ready: 1 }, { active: D.heavy.active || !!b.down }));
        else if (b.id === 'art') drawSlot(ctx, 0, 0, base(D.artifact, { active: D.artifact.active || !!b.down }));
        else if (b.tier !== undefined) { const ab = D.abilities[b.tier]; drawSlot(ctx, 0, 0, base(ab.icon ? ab : { icon: 'slotEmptyIcon', iconW: 18, color: P.greyMid, ready: 1 }, { active: ab.active || !!b.down })); }
        else drawSlot(ctx, 0, 0, base({ icon: 'pauseIcon', iconW: 18, color: P.cyan, ready: 1 }, { active: !!b.down }));
        ctx.restore();
        if (b.spot) {
          const T = STYLE.type, lh = T.small + 2, sp = b.spot, x = sp.align === 'left' ? sp.x : sp.align === 'right' ? sp.x + sp.w : sp.x + sp.w / 2;
          sp.lines.forEach((l, i) => uiText(ctx, l, x / u, sp.y / u + T.small + i * lh, { size: T.small, color: P.ice, align: sp.align }));
        }
      }
    } finally { Cos2.hudEnd(); }
  },
  build() {
    if (this.built || typeof nipplejs === 'undefined') return;
    this.built = true;
    const css = document.createElement('style');
    css.textContent = `
      #touchUI { position: fixed; inset: 0; z-index: 20; display: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; pointer-events: none; }
      #touchUI canvas { position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; pointer-events: none; image-rendering: pixelated; }
      #touchUI .tzone { position: absolute; bottom: 0; left: 0; width: 46%; height: 54%; pointer-events: auto; touch-action: none; }
      #touchUI .tbtn { position: absolute; pointer-events: auto; touch-action: none; border-radius: 50%; }
      #touchUI .thint { position: absolute; left: 23%; bottom: 27%; width: 120px; height: 120px; margin: 0 0 -60px -60px; border: 2px solid rgba(0,229,255,0.55); border-radius: 50%; pointer-events: none; display: none; animation: thint 1.6s ease-in-out infinite; }
      #touchUI .thint::after { content: ''; position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(0,229,255,0.4); }
      @keyframes thint { 0%, 100% { opacity: 0.45; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.08); } }
    `;
    document.head.appendChild(css);
    const root = document.createElement('div');
    root.id = 'touchUI';
    root.innerHTML = '<canvas></canvas><div class="tzone tl"></div><div class="thint"></div>';
    document.body.appendChild(root);
    this.root = root;
    this.ocv = root.querySelector('canvas'); this.octx = this.ocv.getContext('2d');
    Input.touch = Input.touch || { mv: { on: false, dir: 0 }, aim: { on: false, dir: 0 } };
    const m = nipplejs.create({ zone: root.querySelector('.tl'), mode: 'dynamic', color: '#00e5ff', size: this.size, multitouch: false, maxNumberOfNipples: 1, fadeTime: 80, restOpacity: 0.5 });
    m.on('start move', (ev, data) => this.stick(Input.touch.mv, data ? { data } : ev));
    m.on('end', () => { Input.touch.mv.on = false; });
    this.hint = root.querySelector('.thint');
    root.querySelector('.tl').addEventListener('touchstart', () => { this.touched = true; }, { passive: true });
    this.buttons.forEach((b) => this.makeButton(root, b));
    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
  },

  // Sichtbar nur im Spiel mit eingeschalteter Touch-Steuerung; sonst Sticks zuruecksetzen
  tick() {
    const want = !!Save.data.touch && typeof G !== 'undefined' && G.mode === 'play';
    if (want && !this.built) this.build();
    if (typeof G !== 'undefined' && !G.touchWrapped) {                        // neue Runde: Hinweis-Stick wieder anzeigen
      G.touchWrapped = true;
      const begin = G.begin;
      G.begin = function (...a) { Touch.touched = false; return begin.apply(this, a); };
    }
    if (this.built) {
      const cr = document.getElementById('gameCanvas').getBoundingClientRect();
      if (this.hasArt !== !!Hero.artifact() || this.lastSize !== window.innerWidth + 'x' + window.innerHeight + 'x' + Math.round(cr.left) + 'x' + Math.round(cr.height)) this.layout();       // z. B. nach Vollbild
      const reading = want && Tutorial.active && Tutorial.phase === 'brief';          // Tutorial-Textbox: Joystick-Zone aus, damit ein Tipp links unten "weiter" ist
      if (reading !== this.reading) {
        this.reading = reading;
        this.root.querySelector('.tl').style.pointerEvents = reading ? 'none' : '';
        if (reading) Input.touch.mv.on = false;
      }
      this.hint.style.display = want && !this.touched && !reading ? 'block' : 'none';
      if (want) this.render();
    }
    if (this.built && want !== this.shown) {
      this.shown = want;
      this.root.style.display = want ? 'block' : 'none';
      if (!want) { Input.touch.mv.on = false; Input.touch.aim.on = false; }
    }
    requestAnimationFrame(() => this.tick());
  },
};
Input.touch = { mv: { on: false, dir: 0 }, aim: { on: false, dir: 0 } };
Input.touchMoving = () => !!Save.data.touch && Input.touch.mv.on;
Input.touchAiming = () => !!Save.data.touch && Input.touch.aim.on;
requestAnimationFrame(() => Touch.tick());
