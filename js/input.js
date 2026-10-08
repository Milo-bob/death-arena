// Tastatur und Maus. Statt Scratchs "Taste gedrückt?" fragen wir Input.down(...) ab.

const Input = {
  keys: {},        // true, solange die Taste gehalten wird
  pressedNow: {},  // true nur in dem Frame, in dem die Taste gedrückt wurde
  clicked: false,
  wheel: 0,        // -1 oder 1 im Frame, in dem das Mausrad gedreht wurde
  mouse: { x: -999, y: -999, moved: false },     // Mausposition in Buehnenkoordinaten (0..STAGE_W, 0..STAGE_H), moved = in diesem Frame bewegt
  rightClicked: false,

  down(code) { return !!this.keys[code]; },
  // Backspace zaehlt wie Escape (Pause und Zurueck): im Vollbild im iframe (Holiday Games) kommt Escape nicht zuverlaessig an. Beim Belegen einer Taste bleibt Backspace eine normale Taste.
  pressed(code) { return !!this.pressedNow[code] || (code === 'Escape' && !!this.pressedNow.Backspace && !(typeof G !== 'undefined' && G.bindWait)); },
  // Belegbare Aktionen: Standardtasten. Eigene Belegung steht in Save.data.binds (nur die geaenderten).
  actions: [
    { id: 'up', label: 'UP', def: 'KeyW' },
    { id: 'left', label: 'LEFT', def: 'KeyA' },
    { id: 'down', label: 'DOWN', def: 'KeyS' },
    { id: 'right', label: 'RIGHT', def: 'KeyD' },
    { id: 'attack', label: 'ATTACK', def: 'Space' },
    { id: 'weapon1', label: 'WEAPON 1 (MELEE)', def: 'Digit1' },
    { id: 'weapon2', label: 'WEAPON 2 (RANGED)', def: 'Digit2' },
    { id: 'beam', label: 'HEAVY WEAPON', def: 'KeyE' },
    { id: 'ability_weak', label: 'ABILITY WEAK', def: 'ShiftLeft' },
    { id: 'ability_medium', label: 'ABILITY MEDIUM', def: 'KeyQ' },
    { id: 'ability_strong', label: 'ABILITY STRONG', def: 'KeyR' },
    { id: 'ultimate', label: 'ULTIMATE', def: 'KeyV' },
    { id: 'artifact', label: 'HERO ARTIFACT', def: 'KeyF' },
  ],
  code(action) { return (Save.data.binds && Save.data.binds[action]) || this.actions.find((a) => a.id === action).def; },
  mouseHeld: false,                                      // linke Maustaste gehalten
  // Angriff: Halten (Standard) oder Umschalten (Einstellung ATTACK, gilt auch im Touch-Modus): ein Druck startet den Dauerangriff, der naechste beendet ihn
  attackOn: false,
  attackToggleMode() { return Save.data.attackMode === 'toggle'; },
  tickAttack() {
    if (typeof G === 'undefined' || G.mode !== 'play' || !this.attackToggleMode()) { this.attackOn = false; return; }
    if (typeof Tutorial !== 'undefined' && Tutorial.active && (Tutorial.phase === 'brief' || Tutorial.phase === 'end')) { this.attackOn = false; return; }       // dort bestaetigt Leertaste/Klick nur den Text
    if (this.pressedNow[this.code('attack')] || (this.clicked && !!Save.data.mouseAim)) this.attackOn = !this.attackOn;
  },
  actDown(action) {
    if (action === 'attack' && this.attackToggleMode()) return this.attackOn;
    return this.down(this.code(action)) || (action === 'attack' && this.mouseHeld && !!Save.data.mouseAim);
  },
  actPressed(action) { return this.pressed(this.code(action)); },
  // Kurzer Tastentext fuer Anzeigen (HUD, Menue)
  label(action) { return this.codeLabel(this.code(action)); },
  // Ausgeschriebener Tastenname (fuer das Tutorial: "SHIFT" statt "SH")
  fullLabel(action) {
    const c = this.code(action), map = { Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CONTROL', ControlRight: 'CONTROL', AltLeft: 'ALT', AltRight: 'ALT', Tab: 'TAB', ArrowUp: 'UP ARROW', ArrowDown: 'DOWN ARROW', ArrowLeft: 'LEFT ARROW', ArrowRight: 'RIGHT ARROW', Backquote: 'BACKTICK (`)', Enter: 'ENTER', Backspace: 'BACKSPACE', Minus: 'MINUS', Equal: 'EQUALS', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', Semicolon: 'SEMICOLON', Quote: 'QUOTE', BracketLeft: 'LEFT BRACKET', BracketRight: 'RIGHT BRACKET', Backslash: 'BACKSLASH' };
    return map[c] || (/^Numpad/.test(c) ? 'NUMPAD ' + c.replace(/^Numpad/, '') : this.codeLabel(c));
  },
  codeLabel(c) {
    const map = { Space: 'SPC', ShiftLeft: 'SH', ControlLeft: 'CTRL', AltLeft: 'ALT', Tab: 'TAB', ArrowUp: 'UP', ArrowDown: 'DN', ArrowLeft: 'LT', ArrowRight: 'RT', Backquote: '`', Enter: 'ENT' };
    if (map[c]) return map[c];
    return c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'N');
  },
  // Taste einer Aktion zuweisen. Ist sie schon belegt, tauschen die beiden Aktionen ihre Tasten.
  bind(action, code) {
    const old = this.code(action), other = this.actions.find((a) => a.id !== action && this.code(a.id) === code);
    Save.data.binds = Save.data.binds || {};
    if (other) Save.data.binds[other.id] = old;
    Save.data.binds[action] = code;
    Save.write();
  },
  resetBinds() { Save.data.binds = {}; Save.write(); },
  // Erste in diesem Frame gedrueckte Taste (fuer das Umbelegen), sonst null
  firstPressed() { return Object.keys(this.pressedNow)[0] || null; },
  endFrame() { this.pressedNow = {}; this.clicked = false; this.rightClicked = false; this.mouse.moved = false; this.wheel = 0; },
  // Mausposition aus einem Browser-Event in Buehnenkoordinaten umrechnen (das Canvas wird per CSS skaliert)
  setMouse(e) {
    const cv = document.getElementById('gameCanvas'), r = cv.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) / r.width * CANVAS_W - VIEW_PAD;
    this.mouse.y = (e.clientY - r.top) / r.height * STAGE_H;
  },
};

const normCode = (c) => (c === 'ShiftRight' ? 'ShiftLeft' : c);     // beide Shift-Tasten zaehlen gleich
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Backspace' || (/^F[1-4]$/.test(e.code) && Save.data.dev)) e.preventDefault();       // F1-F4 sind im Dev-Modus Cheat-Tasten (game.js devKeys)
  const c = normCode(e.code);
  if (!Input.keys[c]) Input.pressedNow[c] = true;
  Input.keys[c] = true;
});
window.addEventListener('keyup', (e) => { Input.keys[normCode(e.code)] = false; });
const releaseAll = () => { Input.keys = {}; Input.mouseHeld = false; };
window.addEventListener('blur', releaseAll);
window.addEventListener('pagehide', releaseAll);
window.addEventListener('contextmenu', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
// Verlorene keyup-Ereignisse (z. B. Shift zusammen mit anderer Taste losgelassen): Modifier-Flags jedes Ereignisses abgleichen
const syncMods = (e) => { if (e.shiftKey === false) Input.keys.ShiftLeft = false; if (e.ctrlKey === false) { Input.keys.ControlLeft = false; Input.keys.ControlRight = false; } if (e.altKey === false) { Input.keys.AltLeft = false; Input.keys.AltRight = false; } };
window.addEventListener('keydown', syncMods, true);
window.addEventListener('keyup', syncMods, true);
window.addEventListener('mousedown', syncMods, true);
window.addEventListener('mousemove', syncMods, true);
// Touch: ein Finger verhaelt sich wie die Maus (Tippen = Klick, Ziehen = gehaltene Maus, z. B. an Scrollleisten).
// Nach einem angenommenen Tipp ignoriert das Spiel TAP_LOCK Sekunden lang weitere Tipps, damit man den Finger heben kann, ohne mehrfach zu tippen.
// Die vom Browser nachgereichten Mausereignisse (mousedown/up/move nach touchend) werden ignoriert, sonst zaehlt jeder Tipp doppelt.
const TAP_LOCK = 350;                                   // ms
let lastTouchAt = -1e9, lastTapAt = -1e9;
const fromTouch = () => performance.now() - lastTouchAt < 1000;
const inTouchUI = (e) => !!(e.target && e.target.closest && e.target.closest('#touchUI, [data-nogame], input, textarea, button'));
const touchPos = (e) => { const t = e.touches[0] || e.changedTouches[0]; if (t) Input.setMouse(t); };
window.addEventListener('touchstart', (e) => {
  lastTouchAt = performance.now(); Input.touchSeen = true;
  if (inTouchUI(e)) return;
  touchPos(e);
  Input.mouse.moved = true;
  const now = performance.now();
  if (now - lastTapAt < TAP_LOCK) return;               // zu schnell nach dem letzten Tipp: ignorieren
  lastTapAt = now; Input.clicked = true; Input.mouseHeld = true;
}, { passive: true });
window.addEventListener('touchmove', (e) => { lastTouchAt = performance.now(); if (inTouchUI(e)) return; touchPos(e); if (Input.mouseHeld) Input.mouse.moved = true; }, { passive: true });
const touchEnd = (e) => { lastTouchAt = performance.now(); if (!inTouchUI(e)) Input.mouseHeld = false; };
window.addEventListener('touchend', touchEnd, { passive: true });
window.addEventListener('touchcancel', touchEnd, { passive: true });
window.addEventListener('mousedown', (e) => { if (fromTouch()) return; Input.setMouse(e); if (e.button === 2) Input.rightClicked = true; else { Input.clicked = true; Input.mouseHeld = true; } });
window.addEventListener('mouseup', (e) => { if (fromTouch()) return; if (e.button !== 2) Input.mouseHeld = false; });
window.addEventListener('mousemove', (e) => { if (fromTouch()) return; Input.setMouse(e); Input.mouse.moved = true; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Eingebettet (iframe, z. B. auf der Holiday-Games-Seite) bekommt das Spiel Tasten nur, wenn es den Fokus hat.
// Auf Tablets reicht ein Touch oft nicht, deshalb Fokus bei jedem Touch/Klick und beim Laden holen.
const grabFocus = () => {
  try {
    window.focus();
    const a = document.activeElement;
    if (document.body && !(a && /^(INPUT|TEXTAREA|BUTTON)$/.test(a.tagName))) document.body.focus();       // Dialog-Elemente (SaveTransfer) behalten ihren Fokus
  } catch (e) {}
};
if (document.body) { document.body.tabIndex = -1; document.body.style.outline = 'none'; }
['pointerdown', 'touchstart', 'mousedown', 'click'].forEach((ev) => window.addEventListener(ev, grabFocus, { passive: true }));
window.addEventListener('load', grabFocus);
window.addEventListener('wheel', (e) => { Input.wheel = e.deltaY > 0 ? 1 : -1; });
