// Touch-Steuerung (Einstellungen > TOUCH CONTROLS). Zwei Joysticks mit nipplejs (js/nipplejs.min.js, lokal):
// links = laufen, rechts = zielen UND angreifen (solange der Stick gehalten wird). Dazu Tasten fuer Waffen, Abilities, Ultimate, Artefakt und Pause.
// Die Tasten setzen einfach die Tastatur-Codes in Input.keys / Input.pressedNow, der Rest des Spiels merkt keinen Unterschied.
// Joystick-Werte stehen in Input.touch: mv = { on, dir } (Laufrichtung), aim = { on, dir } (Zielrichtung), dir im Spielwinkel (0 = oben, 90 = rechts).

const Touch = {
  built: false,
  shown: false,
  deadzone: 0.22,                         // Anteil des Stick-Radius, unter dem nichts passiert
  size: 120,                              // Durchmesser des Sticks in Pixeln
  buttons: [                              // id, Beschriftung, Aktion (Tastenbelegung), Seite
    { label: 'W1', act: 'weapon1', side: 'l' },
    { label: 'W2', act: 'weapon2', side: 'l' },
    { label: 'HVY', act: 'beam', side: 'l' },
    { label: 'ULT', act: 'ultimate', side: 'l' },
    { label: 'ART', act: 'artifact', side: 'l' },
    { label: 'A1', act: 'ability_weak', side: 'r' },
    { label: 'A2', act: 'ability_medium', side: 'r' },
    { label: 'A3', act: 'ability_strong', side: 'r' },
    { label: 'II', code: 'KeyP', side: 'r' },
  ],

  // Stick-Ereignis in Spielwinkel umrechnen. nipplejs liefert den mathematischen Winkel (0 = rechts, gegen den Uhrzeigersinn).
  stick(target, ev) {
    const d = ev.data;
    if (!d || !d.angle) return;
    const frac = (d.distance || 0) / (this.size / 2);
    target.on = frac >= this.deadzone;
    target.dir = 90 - d.angle.radian / DEG;
  },

  makeButton(parent, b) {
    const el = document.createElement('div');
    el.className = 'tbtn';
    el.textContent = b.label;
    const code = () => b.code || Input.code(b.act);
    const press = (e) => { e.preventDefault(); const c = code(); if (!Input.keys[c]) Input.pressedNow[c] = true; Input.keys[c] = true; el.classList.add('on'); };
    const release = (e) => { e.preventDefault(); Input.keys[code()] = false; el.classList.remove('on'); };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    parent.appendChild(el);
  },

  build() {
    if (this.built || typeof nipplejs === 'undefined') return;
    this.built = true;
    const css = document.createElement('style');
    css.textContent = `
      #touchUI { position: fixed; inset: 0; z-index: 20; display: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; pointer-events: none; }
      #touchUI .tzone { position: absolute; bottom: 0; width: 46%; height: 54%; pointer-events: auto; touch-action: none; }
      #touchUI .tl { left: 0; } #touchUI .tr { right: 0; }
      #touchUI .tbar { position: absolute; bottom: 56%; display: flex; gap: 8px; flex-wrap: wrap; pointer-events: none; }
      #touchUI .tbl { left: 12px; } #touchUI .tbr { right: 12px; justify-content: flex-end; }
      #touchUI .tbtn { pointer-events: auto; touch-action: none; width: min(13vw, 54px); height: min(13vw, 54px); border: 2px solid #00e5ff; border-radius: 50%; background: rgba(5,10,30,0.55); color: #cfeeff; font: 700 13px "Pixelify Sans", monospace; display: flex; align-items: center; justify-content: center; }
      #touchUI .tbtn.on { background: rgba(0,229,255,0.45); }
    `;
    document.head.appendChild(css);
    const root = document.createElement('div');
    root.id = 'touchUI';
    root.innerHTML = '<div class="tzone tl"></div><div class="tzone tr"></div><div class="tbar tbl"></div><div class="tbar tbr"></div>';
    document.body.appendChild(root);
    this.root = root;
    const mk = (sel, color, target) => {
      const m = nipplejs.create({ zone: root.querySelector(sel), mode: 'dynamic', color, size: this.size, multitouch: false, maxNumberOfNipples: 1, fadeTime: 80, restOpacity: 0.5 });
      m.on('start move', (ev, data) => this.stick(target, data ? { data } : ev));
      m.on('end', () => { target.on = false; });
    };
    Input.touch = Input.touch || { mv: { on: false, dir: 0 }, aim: { on: false, dir: 0 } };
    mk('.tl', '#00e5ff', Input.touch.mv);
    mk('.tr', '#ff9a3c', Input.touch.aim);
    const bl = root.querySelector('.tbl'), br = root.querySelector('.tbr');
    this.buttons.forEach((b) => this.makeButton(b.side === 'l' ? bl : br, b));
  },

  // Sichtbar nur im Spiel mit eingeschalteter Touch-Steuerung; sonst Sticks zuruecksetzen
  tick() {
    const want = !!Save.data.touch && typeof G !== 'undefined' && G.mode === 'play';
    if (want && !this.built) this.build();
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
