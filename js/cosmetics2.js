// Cosmetics, Teil 2 (Objekt Cos2): die "speziellen" Cosmetics, die mehr als nur Farben aendern. Daten in CFG.cosmetics (config.js [4c]).
// Regel: jedes Cosmetic gilt fuer die GANZE Kategorie, nie nur fuer eine einzelne Waffe oder Faehigkeit.
//   Skin-Effekte (fx)     : drawShip -> dissolve, cloud, lens, mech, slime, twin, wire, cracks, hbeat (reagieren aufs Laufen, Dashen und Leben)
//   Glow 'echo'           : jeder Angriff jeder Waffe laesst eingefrorene Abbilder zurueck (Cos.drawAttack -> echoSnap)
//   SHOTS (proj)          : Form fuer alle Projektile (Schuss, Schrot, Prallschuss, Scheibe, Rakete, Granate, Flasche)
//   HITS (hit)            : bei jedem Treffer auf Gegner und Bosse (Comic-Woerter)
//   KILLS (neue shapes)   : Stempel (Krallen, Totenkopf, Stern), Grabstein, Muenzregen, Tintenklecks, Feuerwerk, Glitch-Loeschen
//   TRAIL (Boden-Shapes)  : Fussspuren, Pfotenabdruecke, Blumen, Ripple (floorTick) / WEATHER: Wetter ueber der Arena
//   PET                   : Begleiter, der folgt, sich nach Bossen freut und sich beim Tod versteckt
//   HUD / DIGITS / SOUND / MENU BG : HUD-Themes, Schadenszahlen, Sound-Pakete, animierter Menue-Hintergrund
//   DEATH / INTRO / WIN / REVIVE   : Todes-Animation, Boss-Titelkarte, Siegerpose, Wiederbelebungs-Animation (Totem of Undying)
// Alle Zeichenfunktionen arbeiten wie in cosmetics.js in Weltkoordinaten bzw. (Karten, HUD) in Bildschirmkoordinaten und werden vom Spiel UND von
// der Vorschau im Cosmetics-Menue benutzt. Alles ist reine Optik (Ausnahme: Sound-Pakete tauschen Klaenge).

// Kleine Pixelbilder (Zeichen: '.' leer, '#' Hauptfarbe, andere Zeichen = Eintrag in der Farbtabelle)
const CBM = {
  skull: ['.#####.', '#######', '##.#.##', '#######', '.#####.', '..#.#..', '..###..'],
  star: ['...#...', '...#...', '.#####.', '#######', '.#####.', '.##.##.', '.#...#.'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  tomb: ['..#####..', '.#######.', '####o####', '####o####', '##ooooo##', '####o####', '####o####', '#########', '#########', '#########'],
  plane: ['##.......', '#####....', '#ffffffff', '#####....', '##.......'],
  arrow: ['........#..', '.........#.', '###########', '.........#.', '........#..'],
  note: ['....####', '....#.##', '....#..#', '....#...', '....#...', '..###...', '.####...', '.####...', '..##....'],
  fish: ['...###....', '.#######.#', '#e#######.', '.#######.#', '...###....'],
  // Totem of Undying wie in Minecraft (16x16): goldene Figur mit ausgestreckten Armen und gruenen Smaragden als Augen/Mund
  // a = dunkles Gold (Rand), b = Gold, c = Braun (Umriss), d = Hellgelb (Glanz), e = Cremegelb, f = helles Gold, g = Smaragd hell, h = Smaragd dunkel, i = Orange-Gold (Schatten)
  totem: ['................', '.....aaaaaa.....', '....abbbbbba....', '....cbddeebc....', '....cffebffc....', '....cdgffdgc....', '....cghdeghc....', '....cifebfic....',
          '.aaaacibbicaaaa.', '.abfcbfiificifc.', '..ccaedebbfacc..', '....abffffic....', '....caaaaaac....', '.....cfiiic.....', '.....cfiifc.....', '......cccc......'],
};
// Zeichnet ein Pixelbild mittig bei (cx, cy), k = Pixel pro Zelle, pal = Farben je Zeichen
function cbmDraw(ctx, rows, cx, cy, k, pal) {
  const w = rows[0].length, h = rows.length, x0 = cx - w * k / 2, y0 = cy - h * k / 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = rows[j][i];
    if (c === '.') continue;
    ctx.fillStyle = pal[c] || pal['#'];
    ctx.fillRect(Math.round(x0 + i * k), Math.round(y0 + j * k), k, k);
  }
}
const cmod = (a, b) => ((a % b) + b) % b;
const chash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };       // Zufall aus einer Zahl, immer gleich (kein Zustand noetig)

const TOTEM_PAL = { a: '#a05b23', b: '#eadb84', c: '#85400f', d: '#fdfbee', e: '#f8eea5', f: '#d1a75d', g: '#41e67f', h: '#00bb46', i: '#c58742' };       // Farben des Minecraft-Totems
const DEATH_DUR = 1.05;           // Dauer der Todes-Animation (Sekunden), danach kommt der Todesbildschirm
const INTRO_DUR = 2.3, VICTORY_DUR = { fanfare: 1.7, flag: 2.4, dance: 1.5 }, REVIVE_DUR = 2.0;

const INK_HALF = 56;           // halbe Kantenlaenge des vorgerenderten Farbklecks-Bildes
// Farbklecks: Liste aus Kreisen [x, y, r] relativ zur Mitte: Kern, Spritzarme mit abgerissenen Tropfen, verstreute Spritzer
function inkBlobs() {
  const out = [], add = (x, y, r) => out.push([x, y, r]);
  add(0, 0, rand(12, 15));
  for (let i = 0; i < 7; i++) { const a = rand(0, 6.283), d = rand(6, 15); add(Math.cos(a) * d, Math.sin(a) * d, rand(5, 9)); }                // unregelmaessiger, breiter Kern
  const arms = randInt(5, 7);
  for (let i = 0; i < arms; i++) {                                                                                                         // kurze, dicke Spritzer mit abgerissenem Tropfen
    const a = i / arms * 6.283 + rand(-0.45, 0.45), len = rand(8, 20);
    for (let st = 1; st <= 3; st++) { const f = st / 3, d = 12 + f * len; add(Math.cos(a) * d, Math.sin(a) * d, Math.max(2.5, (1 - f * 0.6) * rand(5, 7))); }
    const dd = 14 + len + rand(5, 10); add(Math.cos(a) * dd, Math.sin(a) * dd, rand(2.2, 3.6));
  }
  for (let i = 0; i < 9; i++) { const a = rand(0, 6.283), d = rand(26, 48); add(Math.cos(a) * d, Math.sin(a) * d, rand(1, 2.4)); }              // kleine Spritzer
  return out;
}
// Rendert den Klecks einmal in ein eigenes Bild (viele Klekse bleiben lange liegen). Ohne Canvas (Tests) null, dann wird live gezeichnet.
function inkImage(blobs, color) {
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = INK_HALF * 2;
    const g = cv.getContext('2d'); g.fillStyle = color;
    for (const b of blobs) { if (b[2] < 2.6) pxFill(g, INK_HALF + b[0], INK_HALF + b[1], b[2] < 1.6 ? 1 : 2); else pxDisc(g, INK_HALF + b[0], INK_HALF + b[1], b[2]); }       // winzige Spritzer als Quadrate (Kreise waeren Kreuze)
    g.fillStyle = 'rgba(255,255,255,0.32)'; pxDisc(g, INK_HALF - 3, INK_HALF - 3, 3); pxFill(g, INK_HALF + 4, INK_HALF - 5, 1);        // Glanzpunkte
    return cv;
  } catch (e) { return null; }
}

const Cos2 = {
  PREVIEW_CATS: ['hit', 'weather', 'pet', 'hud', 'numbers', 'sound', 'menubg', 'death', 'intro', 'victory', 'revive'],       // Kategorien mit eigener Vorschau (previewCat)
  decals: [], echoes: [], echoT: new WeakMap(), echoBusy: false,
  state: { moving: false, dash: false, hp: 1 },            // Zustand des Spielers fuer Skin-Effekte (Player.draw setzt ihn, die Vorschau auch)
  twinHist: [], mechK: 0,
  pet: null, vic: null, intro: null, dfx: null, rev: null,
  lastPos: null, floorDist: 0, floorFoot: 0, hitT: -9,
  homeOverride: null,

  reset() {
    this.decals = []; this.echoes = []; this.twinHist = []; this.pet = null; this.vic = null; this.intro = null; this.dfx = null; this.rev = null;
    this.lastPos = null; this.floorDist = 0; this.hitT = -9;
  },
  // Ziel fuer Muenzen (Muenzregen fliegt zum Spieler); in der Vorschau eine feste Stelle
  homeTarget() { return this.homeOverride || (G.player ? { x: G.player.x, y: G.player.y } : { x: 0, y: 0 }); },
  // Einmal pro Spielbild (im Modus play): Bodenmarken, Echos, Titelkarte, Siegerpose und Wiederbelebung laufen weiter
  tick(dt) {
    this.stepDecals(dt); this.stepEchoes(dt);
    if (this.intro) { this.intro.t += dt; if (this.intro.t > INTRO_DUR) this.intro = null; }
    if (this.rev) { this.rev.t += dt; this.rev.list = this.stepScreenParts(this.rev.list, dt); if (this.rev.t > REVIVE_DUR) this.rev = null; }
  },

  // ---------------------------------------------------------------------------------------------
  // Bodenmarken (Decals): Stempel, Fussspuren, Grabsteine, Tinte. Liegen unter Gegnern und Spieler und verblassen von allein.
  // ---------------------------------------------------------------------------------------------
  addDecal(d) {
    if (Juice.level === 0) return;
    d.t = 0;
    this.decals.push(d);
    if (d.kind === 'ink') {                                                                  // Tinte bleibt lange liegen, deshalb eigene Obergrenze
      let n = 0; for (const q of this.decals) if (q.kind === 'ink') n++;
      if (n > 60) { const i = this.decals.findIndex((q) => q.kind === 'ink'); if (i >= 0) this.decals.splice(i, 1); }
    }
    if (this.decals.length > 170) this.decals.shift();
  },
  stepDecals(dt) {
    if (!this.decals.length) return;
    for (const d of this.decals) d.t += dt;
    this.decals = this.decals.filter((d) => d.t < d.life);
  },
  drawDecals(ctx) {
    if (!this.decals.length) return;
    const P = STYLE.pal;
    ctx.save();
    for (const d of this.decals) {
      const k = d.t / d.life, sx = Math.round(STAGE_W / 2 + d.x), sy = Math.round(STAGE_H / 2 - d.y);
      const al = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) * (d.a || 0.85);
      ctx.globalAlpha = al;
      ctx.fillStyle = d.color;
      switch (d.kind) {
        case 'grave': {                                                                       // steigt aus dem Boden, bleibt stehen, versinkt am Ende
          const sink = k > 0.75 ? (k - 0.75) / 0.25 * 18 : 0, rise = Math.min(1, d.t / 0.25), top = Math.round(sy - 14 + sink + (1 - rise) * 12), a0 = al;
          ctx.fillStyle = '#000000'; ctx.globalAlpha = a0 * 0.35; ctx.fillRect(sx - 12, sy + 12, 25, 3); ctx.globalAlpha = a0;
          cbmDraw(ctx, CBM.tomb, sx, top + 15, 3, { '#': P.grey, o: P.greyMid });
          ctx.fillStyle = P.ice; ctx.fillRect(sx - 12, top + 1, 3, 3);                       // Lichtkante links oben
          break;
        }
        case 'ink': {                                                                          // Farbklecks: spritzt in 0.16 s auseinander, bleibt lange und verblasst am Ende
          const g = Math.min(1, d.t / 0.16), sc = 0.45 + 0.55 * (1 - (1 - g) * (1 - g));
          if (d.img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(d.img, Math.round(sx - INK_HALF * sc), Math.round(sy - INK_HALF * sc), Math.round(INK_HALF * 2 * sc), Math.round(INK_HALF * 2 * sc)); }
          else for (const b of d.blobs) { if (b[2] < 2.6) pxFill(ctx, sx + b[0] * sc, sy + b[1] * sc, b[2] < 1.6 ? 1 : 2); else pxDisc(ctx, sx + b[0] * sc, sy + b[1] * sc, b[2] * sc); }
          break;
        }
        case 'claws': for (let i = -1; i <= 1; i++) { const ca = Math.cos(d.rot), sa = Math.sin(d.rot), ox = -sa * i * 4, oy = ca * i * 4; pxLine(ctx, sx + ox - ca * 7, sy + oy - sa * 7, sx + ox + ca * 7, sy + oy + sa * 7, 1); } break;
        case 'skull': cbmDraw(ctx, CBM.skull, sx, sy, d.t < 0.08 ? 3 : 2, { '#': d.color }); break;                 // Stempel: schlaegt kurz gross ein
        case 'starstamp': cbmDraw(ctx, CBM.star, sx, sy, d.t < 0.08 ? 3 : 2, { '#': d.color }); break;
        case 'boots': {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.rot * DEG);                                   // rot = Richtung zum Spieler (0 = oben)
          ctx.fillRect(-2, -5, 4, 6); ctx.fillRect(-1, 2, 3, 3);                                   // Sohle vorn und Ferse
          ctx.restore(); break;
        }
        case 'paws': {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.rot * DEG);
          ctx.fillRect(-2, 0, 5, 3); ctx.fillRect(-4, -3, 2, 2); ctx.fillRect(-1, -5, 2, 2); ctx.fillRect(2, -3, 2, 2);
          ctx.restore(); break;
        }
        case 'flower': {
          const g = Math.min(1, d.t / 0.4), r = Math.max(1, Math.round(3 * g));
          ctx.fillStyle = d.color; ctx.fillRect(sx - 1, sy - r - 1, 3, 3); ctx.fillRect(sx - 1, sy + r - 1, 3, 3); ctx.fillRect(sx - r - 1, sy - 1, 3, 3); ctx.fillRect(sx + r - 1, sy - 1, 3, 3);
          ctx.fillStyle = P.yellow; ctx.fillRect(sx - 1, sy - 1, 3, 3);
          ctx.fillStyle = P.green; ctx.fillRect(sx, sy + r + 2, 1, 3 * g);
          break;
        }
        case 'ripple': ctx.globalAlpha = (1 - k) * 0.7; pxRing(ctx, sx, sy, 3 + k * 16, 1); break;
      }
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // Slash Echo (Glow-Item mit fx 'echo'): jeder Angriff laesst alle 0.07 s ein eingefrorenes Abbild zurueck. Gilt fuer alle Waffen.
  // ---------------------------------------------------------------------------------------------
  echoSnap(a) {
    if (this.echoBusy || Juice.level === 0) return;
    const now = G.realTime, last = this.echoT.get(a);
    if (last !== undefined && now - last < (Juice.level === 2 ? 0.07 : 0.14)) return;
    this.echoT.set(a, now);
    if (this.echoes.length >= 34) return;
    const snap = Object.assign(Object.create(Object.getPrototypeOf(a)), a);
    if (a.player && typeof a.player === 'object') snap.player = Object.assign(Object.create(Object.getPrototypeOf(a.player)), a.player);      // Spielerposition einfrieren
    this.echoes.push({ a: snap, t: 0, life: 0.8 });
  },
  stepEchoes(dt) {
    if (!this.echoes.length) return;
    for (const e of this.echoes) e.t += dt;
    this.echoes = this.echoes.filter((e) => e.t < e.life);
  },
  drawEchoes(ctx) {
    if (!this.echoes.length) return;
    this.echoBusy = true;
    try {
      for (const e of this.echoes) {
        ctx.save(); ctx.globalAlpha = 0.34 * (1 - e.t / e.life);
        try { Cos.drawAttack(ctx, e.a, e.it); } catch (err) { /* ein kaputtes Abbild darf nichts stoppen */ }
        ctx.restore();
      }
    } finally { this.echoBusy = false; }
  },

  // ---------------------------------------------------------------------------------------------
  // SHOTS: Projektil-Formen (gelten fuer alle Projektile des Spielers). Farbe = Glow-Farbe, sonst die Farbe des Items.
  // ---------------------------------------------------------------------------------------------
  isProj(a) {
    return (a.kind === 'shot' || a.kind === 'rocket' || a.kind === 'grenade' || a.kind === 'molotov') && typeof a.x === 'number' && !a.exploded && a.alive !== false;
  },
  drawProj(ctx, a, pj, blade) {
    const P = STYLE.pal, col = blade && blade.id !== 'default' ? blade.color : pj.color, t = G.realTime;
    const base = a.kind === 'rocket' ? 1.8 : a.kind === 'grenade' ? 1.5 : a.kind === 'molotov' ? 1.4 : clamp((a.sizePct || 150) / 150, 0.7, 1.6);
    const sx = Math.round(STAGE_W / 2 + a.x), sy = Math.round(STAGE_H / 2 - a.y);
    ctx.save(); ctx.translate(sx, sy);
    if (a.ghost) ctx.globalAlpha = clamp(1 - a.ghost / 100, 0, 1);
    switch (pj.shape) {
      case 'plane': ctx.rotate((a.dir - 90) * DEG); ctx.scale(base, base); cbmDraw(ctx, CBM.plane, 0, 0, 1.6, { '#': P.white, f: col }); break;
      case 'arrow': ctx.rotate((a.dir - 90) * DEG); ctx.scale(base, base); cbmDraw(ctx, CBM.arrow, 0, 0, 1.6, { '#': col }); break;
      case 'fish': ctx.rotate((a.dir - 90) * DEG); ctx.scale(base, base); cbmDraw(ctx, CBM.fish, 0, 0, 1.6, { '#': col, e: P.ink }); break;
      case 'note': ctx.translate(0, Math.round(Math.sin(t * 10 + a.x * 0.1) * 2)); ctx.scale(base, base); cbmDraw(ctx, CBM.note, 0, 0, 1.6, { '#': col }); break;
      case 'shuriken': {
        ctx.fillStyle = col;
        const r = 5 * base, sp = t * 14, pts = [];
        for (let i = 0; i < 4; i++) { const an = sp + i * Math.PI / 2; pts.push([Math.cos(an) * r, Math.sin(an) * r], [Math.cos(an + Math.PI / 4) * r * 0.3, Math.sin(an + Math.PI / 4) * r * 0.3]); }
        pxPolyFill(ctx, pts); ctx.fillStyle = P.white; pxFill(ctx, -1, -1, 1); break;
      }
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // HITS: bei jedem Treffer (Gegner und Bosse, jede Waffe): Comic-Woerter. list = Partikelliste (Vorschau: eigene)
  // ---------------------------------------------------------------------------------------------
  hit(x, y, list, itOv) {
    const it = itOv || Cos.cur('hit');
    if (!it || !it.shape || Juice.level === 0) return;
    const now = performance.now() / 1000;
    if (now - this.hitT < (Juice.level === 2 ? 0.06 : 0.12)) return;
    this.hitT = now;
    const jx = x + rand(-5, 5), jy = y + rand(-5, 5), P = STYLE.pal;
    if (it.shape === 'comic') {
      const words = ['POW', 'BAM', 'ZAP', 'WHAM', 'BOOM', 'SMACK'], w = words[randInt(0, words.length - 1)];
      Cos.push(list || Juice.particles, { x: jx, y: jy + 6, vx: rand(-0.4, 0.4), vy: 0.55, life: 0.55, color: [P.yellow, P.orange, P.white, P.pink][randInt(0, 3)], size: randInt(11, 14), shape: 'text', text: w + '!', rot: rand(-0.25, 0.25) });
      return;
    }
  },
  // Bosse haben keinen einzelnen Treffer-Aufruf (der Schaden wird an vielen Stellen abgezogen): sinkt hp seit dem letzten Bild, gilt das als Treffer
  bossWatch(b) {
    const prev = b._cosHp;
    b._cosHp = b.hp;
    if (prev !== undefined && b.hp < prev - 0.01) this.hit(b.x + rand(-1, 1) * b.radius * 0.6, b.y + rand(-1, 1) * b.radius * 0.6);
  },

  // ---------------------------------------------------------------------------------------------
  // Kill-Effekte mit eigenem Ablauf. Gibt true zurueck, wenn die shape hier umgesetzt ist.
  // ---------------------------------------------------------------------------------------------
  emitKill(list, x, y, it, sc) {
    const c = (i) => it.colors[i % it.colors.length], P = STYLE.pal;
    if (it.shape === 'claws' || it.shape === 'skulls' || it.shape === 'starstamp') {      // Stempel bleiben am Todesort liegen
      const kind = it.shape === 'claws' ? 'claws' : it.shape === 'skulls' ? 'skull' : 'starstamp';
      this.addDecal({ kind, x, y, rot: rand(0, Math.PI), color: c(randInt(0, it.colors.length - 1)), life: 7, a: 0.85 });
      for (let i = 0; i < 4 * sc; i++) { const a = rand(0, 360), v = rand(1.2, 2.8); Cos.push(list, { x, y, vx: fwdX(a) * v, vy: fwdY(a) * v, life: 0.3, color: c(i), size: 2 }); }
      return true;
    }
    if (it.shape === 'grave') {
      this.addDecal({ kind: 'grave', x, y, color: P.grey, life: 7, a: 0.95 });
      for (let i = 0; i < 5 * sc; i++) Cos.push(list, { x: x + rand(-8, 8), y: y - 8, vx: rand(-1.2, 1.2), vy: rand(0.2, 0.9), life: 0.55, color: c(i), size: 3, shape: 'smoke' });       // Staub beim Aufsteigen
      return true;
    }
    if (it.shape === 'coins') {
      for (let i = 0; i < 6 * sc + 2; i++) { const a = rand(0, 360), v = rand(1.2, 3.2); Cos.push(list, { x, y, vx: fwdX(a) * v, vy: fwdY(a) * v + 1.6, g: -0.12, life: 1.6, home: 0.32, color: c(i), size: 4, shape: 'coin' }); }
      return true;
    }
    if (it.shape === 'ink') {
      const blobs = inkBlobs(), col = c(randInt(0, it.colors.length - 1));                  // ein echter Farbklecks am Boden statt Partikeln, bleibt ca. 40 s
      this.addDecal({ kind: 'ink', x, y, color: col, blobs, img: inkImage(blobs, col), life: 40, a: 0.92 });
      return true;
    }
    if (it.shape === 'fireworks') {
      const col = c(randInt(0, it.colors.length - 1));
      Cos.push(list, {
        x, y, vx: rand(-0.3, 0.3), vy: 3.2, life: 0.42, color: col, size: 3, shape: 'rocket',
        onEnd: (out, q) => {                                                                         // am Ende des Aufstiegs platzt er
          const qx = q.x, qy = q.y;
          for (let i = 0; i < 14 * sc + 4; i++) { const a = i * (360 / (14 * sc + 4)), v = rand(2.6, 3.6); Cos.push(out, { x: qx, y: qy, vx: fwdX(a) * v, vy: fwdY(a) * v, life: 0.6, color: i % 3 ? col : c(i), size: 2, shape: 'streak' }); }
          Cos.push(out, { x: qx, y: qy, vx: 0, vy: 0, life: 0.45, color: col, size: 8, shape: 'ring' });
        },
      });
      return true;
    }
    if (it.shape === 'glitchdel') {
      Cos.push(list, { x, y, vx: 0, vy: 0, life: 0.14, color: P.white, size: 14 });
      for (let i = 0; i < 7; i++) Cos.push(list, { x: x + rand(-4, 4), y: y + (i - 3) * 2.5, vx: rand(-4, 4), vy: 0, life: rand(0.2, 0.4), color: c(i), size: 3, shape: 'bar', w: randInt(8, 18) });
      return true;
    }
    return false;
  },
  // Partikel mit eigenen Formen (wird von Cos.drawParticle fuer unbekannte shapes aufgerufen). Gibt true zurueck, wenn gezeichnet.
  drawParticleEx(ctx, q, sx, sy, k) {
    const P = STYLE.pal;
    switch (q.shape) {
      case 'coin': {
        const w = Math.max(1, Math.round(1 + 2.5 * Math.abs(Math.cos(q.t * 16))));
        ctx.globalAlpha = 1 - k * k * k; ctx.fillStyle = q.color; ctx.fillRect(sx - w, sy - 3, w * 2, 6);
        ctx.fillStyle = P.white; ctx.fillRect(sx - w, sy - 3, 1, 2); return true;
      }
      case 'rocket': {
        ctx.globalAlpha = 1; ctx.fillStyle = q.color; ctx.fillRect(sx - 1, sy - 2, 2, 4);
        ctx.fillStyle = P.white; ctx.fillRect(sx - 1, sy - 2, 2, 1);
        ctx.globalAlpha = 0.6; ctx.fillStyle = P.yellow; ctx.fillRect(sx - 1, sy + 2, 2, 3); return true;
      }
      case 'bar': ctx.globalAlpha = (1 - k) * (Math.floor(q.t * 40) % 3 ? 1 : 0.3); ctx.fillStyle = q.color; ctx.fillRect(Math.round(sx - q.w / 2), sy, q.w, 2); return true;
      case 'text': {
        const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.4);
        ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; ctx.translate(sx, sy); ctx.rotate(q.rot); ctx.scale(pop, pop);
        uiText(ctx, q.text, 0, 0, { size: q.size, color: q.color, align: 'center' });
        ctx.restore(); return true;
      }
      case 'heart': ctx.globalAlpha = 1 - k; cbmDraw(ctx, CBM.heart, sx, sy, Math.max(1, q.size), { '#': q.color }); return true;
      case 'sym': {                                                                            // Fanfare: Sterne, Noten, Herzen
        ctx.globalAlpha = 1 - k * k;
        if (q.sym === 0) cbmDraw(ctx, CBM.star, sx, sy, 1, { '#': q.color }); else if (q.sym === 1) cbmDraw(ctx, CBM.note, sx, sy, 1, { '#': q.color }); else cbmDraw(ctx, CBM.heart, sx, sy, 1, { '#': q.color });
        return true;
      }
    }
    return false;
  },

  // ---------------------------------------------------------------------------------------------
  // Skin-Effekte am Schiff. Gibt true zurueck, wenn der Skin ein Effekt dieser Datei ist (Cos.drawShip ruft das zuerst auf).
  // Zustand (laeuft, Dash, Leben) kommt aus Cos2.state.
  // ---------------------------------------------------------------------------------------------
  SHIP_FX: ['dissolve', 'cloud', 'lens', 'mech', 'slime', 'twin', 'wire', 'cracks', 'hbeat'],
  wireSprite(base) {                                           // Umriss + blasse Fuellung; nur drawImage und Compositing (kein getImageData, das scheitert bei file://)
    const key = base + '@wire';
    if (IMG[key]) return key;
    const im = IMG[base];
    if (!im || !im.ok || typeof document === 'undefined') return base;
    try {
      const w = im.w, h = im.h, sil = document.createElement('canvas'); sil.width = w; sil.height = h;
      const g = sil.getContext('2d'); g.drawImage(im.img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#39ff7a'; g.fillRect(0, 0, w, h);
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const o = out.getContext('2d');
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) o.drawImage(sil, dx, dy);
      o.globalCompositeOperation = 'destination-out'; o.drawImage(im.img, 0, 0);
      o.globalCompositeOperation = 'source-over'; o.globalAlpha = 0.3; o.drawImage(sil, 0, 0);
      IMG[key] = { img: out, ok: true, res: im.res, w: im.w, h: im.h, rcx: im.rcx, rcy: im.rcy };
      return key;
    } catch (e) { return base; }
  },
  // Pixel Dissolve / Pixel Cloud: das Sprite wird in ein Raster aus Zellen zerlegt (drawImage mit Quellrechteck, kein getImageData noetig, geht auch bei file://).
  // k (0..1) = Aufloesungsgrad, steigt beim Laufen/Dash schnell und faellt im Stand langsamer, dann fliegen die Zellen zurueck an ihren Platz.
  //   dissolve: hinten (entgegen der Laufrichtung) loesen sich die Zellen auf und treiben nach hinten weg, vorne bleibt das Schiff dicht und erkennbar
  //   cloud   : beim Laufen wird das ganze Schiff zu einer kreisenden Teilchenwolke
  disK: 0, disT: -1,
  drawDissolve(ctx, name, x, y, dir, size, opts, fx, t, a) {
    const st = this.state, dt = this.disT < 0 || t < this.disT ? 0 : Math.min(0.1, t - this.disT);
    this.disT = t;
    const goal = st.moving || st.dash ? 1 : 0;
    this.disK += (goal - this.disK) * Math.min(1, dt * (goal > this.disK ? 5 : 2.2));
    const k = this.disK, im = IMG[name];
    if (k < 0.015 || !im || !im.ok) { drawSprite(ctx, name, x, y, dir, size, opts); return; }
    const s = size / 100, c = Math.max(1, Math.round(Math.max(im.w, im.h) / 16)), gw = Math.ceil(im.w / c), gh = Math.ceil(im.h / c);
    const cw = c / im.res * s, halfW = im.w / im.res * s / 2, k2 = s / 2.5;
    const sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y, ga = (dir - 90) * DEG, ca = Math.cos(ga), sa = Math.sin(ga), cloud = fx === 'cloud';
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const id = j * gw + i, r1 = chash(id + 1), r2 = chash(id * 1.7 + 9), r3 = chash(id * 2.3 + 4);
      const lx = ((i * c + c / 2) - im.rcx) / im.res * s, ly = ((j * c + c / 2) - im.rcy) / im.res * s;   // Mitte der Zelle im Schiffs-Koordinatensystem (+x = vorn)
      const back = (1 - clamp(lx / halfW, -1, 1)) / 2;                                                       // 0 = vorn, 1 = ganz hinten
      const th = cloud ? r1 * 0.3 : 0.2 + (1 - back) * 0.85 + r1 * 0.1;                                          // wie spaet sich die Zelle aufloest
      let d = clamp((k - th) * 3, 0, 1); d = d * d * (3 - 2 * d);
      let ox = lx, oy = ly, al = a, sc = 1, spin = 0;
      if (d > 0) {
        if (cloud) {
          const ang = r3 * 6.283 + t * (0.8 + r2), rad = d * (5 + r2 * 18) * k2;
          ox = lx * (1 - d * 0.4) + Math.cos(ang) * rad - d * 5 * k2; oy = ly * (1 - d * 0.4) + Math.sin(ang) * rad; al = a * (1 - 0.25 * d);
        } else {
          const m = d * (6 + r2 * 22) * k2 * (0.8 + 0.2 * Math.sin(t * 4 + r3 * 6.283));
          ox = lx - m; oy = ly + (r3 - 0.5) * 2 * d * 6 * k2 + Math.sin(t * 5 + r2 * 6.283) * d * 1.5; al = a * (1 - 0.55 * d);
        }
        sc = 1 - d * 0.15; spin = d * (r3 - 0.5) * 3;
      }
      const cs = cw * sc;
      ctx.globalAlpha = al;
      ctx.save(); ctx.translate(sx + ox * ca - oy * sa, sy + ox * sa + oy * ca); ctx.rotate(ga + spin);
      ctx.drawImage(im.img, i * c, j * c, Math.min(c, im.w - i * c), Math.min(c, im.h - j * c), -cs / 2, -cs / 2, cs * 1.1, cs * 1.1);
      ctx.restore();
    }
    ctx.restore();
  },
  drawShip(ctx, name, x, y, dir, size, opts, it, t) {
    const fx = it && it.fx;
    if (!fx || this.SHIP_FX.indexOf(fx) < 0) return false;
    const P = STYLE.pal, st = this.state, sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y, R = size / 100 * 6, a = opts.alpha === undefined ? 1 : opts.alpha;
    const ga = (dir - 90) * DEG, ca = Math.cos(ga), sa = Math.sin(ga);
    const T = (x2, y2) => [sx + x2 * ca - y2 * sa, sy + x2 * sa + y2 * ca];                    // lokale Koordinaten, +x = nach vorn
    ctx.save();
    if (fx === 'dissolve' || fx === 'cloud') {                 // das Schiff besteht aus Pixel-Teilchen: beim Laufen loesen sie sich nach hinten auf, im Stand sammeln sie sich wieder
      this.drawDissolve(ctx, name, x, y, dir, size, opts, fx, t, a);
    } else if (fx === 'lens') {                                // Einstein-Ring, Sterne werden spiralfoermig hineingezogen
      ctx.fillStyle = it.color;
      [R * 1.25, R * 1.75, R * 2.3].forEach((r, i) => { ctx.globalAlpha = (0.2 + 0.1 * Math.sin(t * 3 + i)) * a; pxRing(ctx, sx, sy, r, 1, 14, t * 0.1 * (i % 2 ? -1 : 1)); });
      for (let i = 0; i < 12; i++) {
        const k = cmod(t * 0.45 + i / 12, 1), an = i * 2.4 + k * 5, rad = R * 0.8 + R * 2.4 * (1 - k);
        ctx.globalAlpha = Math.min(1, k * 6) * (1 - k * 0.5) * a; ctx.fillStyle = i % 3 ? P.white : P.violet;
        ctx.fillRect(Math.round(sx + Math.cos(an) * rad), Math.round(sy + Math.sin(an) * rad * 0.85), 2, 2);
      }
      ctx.globalAlpha = 1;
      drawSprite(ctx, name, x, y, dir, size * (1 + 0.04 * Math.sin(t * 4)), opts);
    } else if (fx === 'mech') {                                // Panzerplatten, die beim Dash aufklappen
      this.mechK += ((st.dash ? 1 : 0) - this.mechK) * 0.25;
      const o = this.mechK * 4;
      ctx.globalAlpha = a;
      for (const s of [-1, 1]) {
        const plate = [T(2, s * (4 + o)), T(-6, s * (6 + o)), T(-7, s * (10 + o)), T(3, s * (8 + o))];
        ctx.fillStyle = P.greyDark; pxPolyFill(ctx, plate); ctx.fillStyle = P.grey; pxPoly(ctx, plate, true, 1);
        const rv = T(-2, s * (7 + o)); ctx.fillStyle = P.ice; pxFill(ctx, rv[0] - 1, rv[1] - 1, 1);
      }
      drawSprite(ctx, name, x, y, dir, size, opts);
      const v = T(R * 0.55, 0); ctx.globalAlpha = a; ctx.fillStyle = P.cyan; pxFill(ctx, v[0] - 1, v[1] - 1, 1);       // Visier
    } else if (fx === 'slime') {                               // weich: streckt sich beim Laufen und wabbelt im Stand
      const w = Math.sin(t * (st.moving ? 14 : 3)), am = st.moving ? 0.13 : 0.05;
      ctx.translate(sx, sy); ctx.rotate(ga); ctx.scale(1 + am * w, 1 - am * w); ctx.rotate(-ga); ctx.translate(-sx, -sy);
      drawSprite(ctx, name, x, y, dir, size, opts);
      ctx.globalAlpha = 0.65 * a; ctx.fillStyle = P.white; ctx.fillRect(Math.round(sx - R * 0.45), Math.round(sy - R * 0.5), 2, 2);
      for (let i = 0; i < 2; i++) { const k = cmod(t * 0.8 + i * 0.5, 1); ctx.globalAlpha = (1 - k) * a; ctx.fillStyle = it.color; ctx.fillRect(Math.round(sx + (i ? 4 : -4)), Math.round(sy + R * 0.6 + k * 8), 2, 2 + Math.round(k * 3)); }
    } else if (fx === 'twin') {                                // ein blasser Zwilling macht alles mit 0.5 s Verzoegerung nach
      const h = this.twinHist;
      if (h.length && t < h[h.length - 1].t - 0.3) h.length = 0;
      if (!h.length || t - h[h.length - 1].t > 0.016) h.push({ t, x, y, dir });
      while (h.length > 2 && h[0].t < t - 1.3) h.shift();
      let e = null;
      for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t - 0.5) { e = h[i]; break; }
      if (e && Math.hypot(e.x - x, e.y - y) > 2) drawSprite(ctx, Cos.tinted(name, 'grayscale(1) brightness(1.5)'), e.x, e.y, e.dir, size, { alpha: 0.38 * a });
      drawSprite(ctx, name, x, y, dir, size, opts);
    } else if (fx === 'wire') {                                // nur Umriss, Scan-Linie wandert durch
      drawSprite(ctx, this.wireSprite(name), x, y, dir, size, Object.assign({}, opts, { alpha: a * (0.85 + 0.15 * Math.sin(t * 12)) }));
      const off = cmod(t * 14, R * 2) - R, hw = Math.sqrt(Math.max(0, R * R - off * off));
      ctx.globalAlpha = 0.7 * a; ctx.fillStyle = P.green; ctx.fillRect(Math.round(sx - hw), Math.round(sy + off), Math.round(hw * 2), 1);
    } else if (fx === 'cracks') {                              // je weniger Leben, desto mehr Risse und Funken
      drawSprite(ctx, name, x, y, dir, size, opts);
      const hp = st.hp, n = hp > 0.8 ? 0 : hp > 0.6 ? 1 : hp > 0.4 ? 2 : hp > 0.2 ? 4 : 6, sc = R / 8;
      const CR = [[[0, 0], [3, -4], [2, -8], [5, -11]], [[0, 1], [-4, 3], [-6, 8]], [[1, 0], [5, 3], [9, 2]], [[-1, -1], [-5, -3], [-9, -2]], [[0, 2], [2, 6], [1, 10]], [[-1, 0], [-3, -6], [-8, -9]]];
      for (let i = 0; i < n; i++) {
        const pts = CR[i].map(([px, py]) => T(px * sc, py * sc));
        ctx.globalAlpha = 0.9 * a; ctx.fillStyle = P.ink; pxPoly(ctx, pts, false, 1);
        ctx.globalAlpha = 0.35 * a; ctx.fillStyle = P.ice; pxPoly(ctx, pts.map((q) => [q[0] + 1, q[1] + 1]), false, 1);
        if (hp < 0.25 && cmod(t * 2.3 + i * 0.37, 1) < 0.18) { const e = pts[pts.length - 1]; ctx.globalAlpha = a; ctx.fillStyle = P.yellow; ctx.fillRect(Math.round(e[0]), Math.round(e[1]), 2, 2); }
      }
    } else if (fx === 'hbeat') {                               // Herzschlag, wird bei wenig Leben schneller und kraeftiger
      const hp = st.hp, bpm = 52 + (1 - hp) * 118, ph = cmod(t * bpm / 60, 1);
      const v = Math.exp(-Math.pow(ph / 0.07, 2)) + 0.65 * Math.exp(-Math.pow((ph - 0.2) / 0.08, 2)), amp = 0.04 + (1 - hp) * 0.12;
      ctx.fillStyle = it.color; ctx.globalAlpha = (0.08 + 0.22 * v * (0.4 + (1 - hp))) * a; pxGlow(ctx, sx, sy, R * 1.5);
      ctx.globalAlpha = 0.55 * v * a; pxRing(ctx, sx, sy, R * (1.15 + v * 0.7), 1);
      ctx.globalAlpha = 1;
      drawSprite(ctx, name, x, y, dir, size * (1 + amp * v), opts);
    }
    ctx.restore();
    return true;
  },

  // ---------------------------------------------------------------------------------------------
  // TRAIL-Items mit Boden-Marken (Fussspuren, Pfoten, Blumen, Ripple). Wird pro Bild aufgerufen, solange der Spieler laeuft.
  // ---------------------------------------------------------------------------------------------
  FLOOR_SHAPES: { boots: 1, paws: 1, flowers: 1, ripple: 1 },
  floorTick(dt, p, moving, itOv) {
    const it = itOv || Cos.cur('trail');                                                    // Boden-Marken sind Items der Kategorie TRAIL (boots, paws, flowers, ripple)
    if (!it || !this.FLOOR_SHAPES[it.shape] || Juice.level === 0) { this.lastPos = null; return; }
    const lp = this.lastPos;
    this.lastPos = { x: p.x, y: p.y };
    if (!lp || !moving) return;
    const d = Math.hypot(p.x - lp.x, p.y - lp.y);
    if (d > 40) return;
    this.floorDist += d;
    const step = { boots: 11, paws: 12, flowers: 19, ripple: 10 }[it.shape] || 12, P = STYLE.pal;
    while (this.floorDist >= step) {
      this.floorDist -= step; this.floorFoot ^= 1;
      const side = (this.floorFoot ? 1 : -1) * 2.5, bx = p.x + fwdX(p.dir + 90) * side - fwdX(p.dir) * 6, by = p.y + fwdY(p.dir + 90) * side - fwdY(p.dir) * 6;
      const toPlayer = Math.atan2(p.x - bx, p.y - by) / DEG;                                  // Oberseite des Abdrucks zeigt beim Entstehen zum Spieler (0 = oben), danach bleibt er so liegen
      if (it.shape === 'boots') this.addDecal({ kind: 'boots', x: bx, y: by, rot: toPlayer, color: P.grey, life: 5, a: 0.55 });
      else if (it.shape === 'paws') this.addDecal({ kind: 'paws', x: bx, y: by, rot: toPlayer, color: P.ice, life: 5, a: 0.55 });
      else if (it.shape === 'flowers') this.addDecal({ kind: 'flower', x: p.x + rand(-4, 4), y: p.y + rand(-4, 4), color: [P.pink, P.white, P.yellow, P.ice][randInt(0, 3)], life: 8, a: 0.95 });
      else this.addDecal({ kind: 'ripple', x: p.x, y: p.y, color: it.color, life: 0.9, a: 0.9 });
    }
  },

  // ---------------------------------------------------------------------------------------------
  // WEATHER: reine Deko ueber der Arena. Rechnet alles aus der Zeit (kein Zustand). Flaeche (x0, y0, w, h) in Bildschirmkoordinaten, cx/cy = Kamera.
  // ---------------------------------------------------------------------------------------------
  drawWeather(ctx, it, t, x0, y0, w, h, cx, cy) {
    if (!it || !it.shape || Juice.level === 0) return;
    const P = STYLE.pal, n = Juice.level === 2 ? 1 : 0.5;
    ctx.save();
    if (it.shape === 'rain') {
      ctx.fillStyle = it.color;
      for (let i = 0; i < 70 * n; i++) {
        const sp = 190 + (i * 37) % 70, x = x0 + cmod(i * 61.7 - t * 34 - cx * 0.6, w), y = y0 + cmod(i * 29.3 + t * sp - cy * 0.6, h + 24) - 12;
        ctx.globalAlpha = 0.45 + (i % 3) * 0.12; pxLine(ctx, x, y, x - 3, y + 8, 1);
      }
    } else if (it.shape === 'snow') {
      ctx.fillStyle = P.white;
      for (let i = 0; i < 60 * n; i++) {
        const x = x0 + cmod(i * 83.1 + Math.sin(t * 0.7 + i) * 14 + t * 6 - cx * 0.5, w), y = y0 + cmod(i * 37.7 + t * (16 + (i % 5) * 5) - cy * 0.5, h);
        ctx.globalAlpha = 0.5 + (i % 4) * 0.12; const s = i % 4 === 0 ? 3 : 2; ctx.fillRect(Math.round(x), Math.round(y), s, s);
      }
    } else if (it.shape === 'fireflies') {                                           // Gluehwuermchen: wandern langsam, leuchten weich auf und ab, mit hellem Kern und Schein
      for (let i = 0; i < 30 * n; i++) {
        const sp = 0.25 + (i % 5) * 0.07, rx = 50 + (i * 37) % 70, ry = 35 + (i * 53) % 55;
        const hx = x0 + cmod(i * 211.7 - cx * 0.25, w), hy = y0 + cmod(i * 139.3 - cy * 0.25, h);                    // Heimatpunkt, wandert mit der Kamera mit
        const x = hx + Math.sin(t * sp + i * 1.7) * rx + Math.sin(t * sp * 2.3 + i) * 12, y = hy + Math.cos(t * sp * 0.8 + i * 2.3) * ry + Math.cos(t * sp * 1.9 + i * 3) * 9;
        const b = Math.pow(0.5 + 0.5 * Math.sin(t * (0.9 + (i % 4) * 0.25) + i * 1.3), 1.5);
        if (b < 0.05) continue;
        ctx.fillStyle = it.color; ctx.globalAlpha = 0.16 * b; pxGlow(ctx, x, y, 14);
        ctx.globalAlpha = 0.3 * b; pxGlow(ctx, x, y, 7);
        ctx.globalAlpha = 0.95 * b; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        ctx.fillStyle = P.white; ctx.globalAlpha = b; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    } else if (it.shape === 'ash') {
      for (let i = 0; i < 44 * n; i++) {
        const x = x0 + cmod(i * 71.3 + Math.sin(t * 0.5 + i * 2) * 20 + t * 9 - cx * 0.5, w), y = y0 + cmod(i * 41.9 + t * (14 + (i % 6) * 4) - cy * 0.5, h);
        ctx.fillStyle = i % 8 === 0 ? P.orange : P.grey; ctx.globalAlpha = i % 8 === 0 ? 0.9 : 0.35 + (i % 4) * 0.1;
        const s = i % 5 === 0 ? 3 : 2; ctx.fillRect(Math.round(x), Math.round(y), s, s);
      }
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // PET: folgt dem Spieler. st = Zustand (Spiel: Cos2.pet, Vorschau: eigener). Freut sich nach Bossen, versteckt sich beim Tod.
  // ---------------------------------------------------------------------------------------------
  newPet() { return { x: 0, y: 0, init: false, face: 1, happy: 0, hide: 0, t: 0, vx: 0 }; },
  petStep(st, dt, p, moving, it, dead) {
    if (!st.init) { st.x = p.x - 16; st.y = p.y; st.init = true; }
    const back = p.dir + 180, tx = p.x + fwdX(back) * 20 + fwdX(p.dir - 90) * 11, ty = p.y + fwdY(back) * 20 + fwdY(p.dir - 90) * 11;
    const dx = tx - st.x, dy = ty - st.y, d = Math.hypot(dx, dy);
    if (d > 280) { st.x = tx; st.y = ty; }
    else if (it.shape === 'dog') {                              // laeuft mit Maximaltempo hinterher, steht still, wenn er da ist
      const sp = Math.min(d * 5, 150) * dt;
      if (d > 7) { st.x += dx / d * sp; st.y += dy / d * sp; st.vx = dx / d * sp / Math.max(dt, 0.001); }
      else st.vx *= 0.8;
    } else { const k = Math.min(1, dt * (it.shape === 'drone' ? 5 : 3.5)); st.vx = dx * k / Math.max(dt, 0.001); st.x += dx * k; st.y += dy * k; }
    if (Math.abs(dx) > 1.5) st.face = dx > 0 ? 1 : -1;
    st.t += dt; st.happy = Math.max(0, st.happy - dt);
    st.hide = dead ? Math.min(1, st.hide + dt * 3) : Math.max(0, st.hide - dt * 3);
  },
  petDraw(ctx, st, it, t) {
    if (!it || !it.shape || !st || !st.init) return;
    const P = STYLE.pal, hide = st.hide, hop = st.happy > 0 ? Math.abs(Math.sin(st.happy * 9)) * 6 : 0;
    const sx = Math.round(STAGE_W / 2 + st.x), sy = Math.round(STAGE_H / 2 - st.y - hop + hide * 6), f = st.face, run = Math.abs(st.vx) > 14;
    ctx.save(); ctx.globalAlpha = 1 - hide;
    const R = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(sx + (f > 0 ? dx : -dx - w)), sy + dy, w, h); };
    if (it.shape === 'drone') {
      const bob = Math.round(Math.sin(st.t * 5) * 1.5), by = bob - 5;
      ctx.globalAlpha = (1 - hide) * 0.18; ctx.fillStyle = P.cyan; ctx.fillRect(sx - 2, sy + by + 4, 4, 5);
      ctx.globalAlpha = 1 - hide;
      R(-4, by, 8, 5, P.cyanDark); R(-3, by - 1, 6, 1, P.cyan); R(-3, by + 5, 6, 1, P.cyanMid);
      R(-1, by + 1, 3, 3, P.ink); R(0, by + 2, 1, 1, st.happy > 0 ? P.yellow : P.white);                      // Auge (froh = gelb)
      const rl = Math.floor(st.t * 30) % 2 ? 5 : 3;                                                              // Rotoren flimmern
      R(-5 - rl + 3, by - 3, rl * 2, 1, P.ice); R(-1, by - 2, 2, 1, P.grey);
    } else if (it.shape === 'dog') {
      const wag = Math.floor(st.t * (st.happy > 0 ? 18 : 6)) % 2, leg = run ? Math.floor(st.t * 12) % 2 : 0, sit = !run && st.happy <= 0 ? 1 : 0;
      const c = P.purpleDark, cl = P.purple;
      R(-6, -4 + sit, 11, 5, c); R(-6, -4 + sit, 11, 1, cl);                                                      // Koerper
      R(3, -8 + sit, 6, 5, c); R(7, -6 + sit, 3, 2, c); R(4, -10 + sit, 2, 2, c); R(7, -10 + sit, 2, 2, c);        // Kopf, Schnauze, Ohren
      R(7, -7 + sit, 2, 2, st.happy > 0 ? P.yellow : P.pink);                                                    // leuchtendes Auge
      R(-7, -7 + sit + (wag ? 1 : -1), 2, 4, cl);                                                                // Schwanz
      R(-5, 1 + sit, 2, 3 - sit, c); R(3, 1 + sit, 2, 3 - sit, c);                                               // Beine
      if (run) { R(-5 + (leg ? 2 : -1), 1, 2, 3, cl); R(3 + (leg ? -1 : 2), 1, 2, 3, cl); }
    } else if (it.shape === 'cat') {
      const bob = Math.round(Math.sin(st.t * 3) * 2), by = bob - 8;
      ctx.globalAlpha = (1 - hide) * 0.8;
      R(-4, by, 9, 7, P.ice); R(-4, by + 7, 9, 2, P.ice);
      for (let i = 0; i < 5; i++) R(-4 + i * 2, by + 9, 2, (i + Math.floor(st.t * 5)) % 2 ? 2 : 1, P.ice);        // wehende Geisterunterseite
      R(-4, by - 3, 2, 3, P.ice); R(3, by - 3, 2, 3, P.ice);                                                    // Ohren
      R(-3, by + 2, 2, 2, P.ink); R(2, by + 2, 2, 2, P.ink);
      R(-3, by + 2, 1, 1, st.happy > 0 ? P.yellow : P.cyan); R(2, by + 2, 1, 1, st.happy > 0 ? P.yellow : P.cyan);
      const tw = Math.floor(st.t * 4) % 2; R(5, by + 4 - tw, 2, 5, P.ice); R(6, by + 2 - tw, 2, 2, P.ice);        // Schwanz
    }
    ctx.restore();
  },
  petTick(dt, p, moving) {
    const it = Cos.cur('pet');
    if (!it || !it.shape) { this.pet = null; return; }
    if (!this.pet || this.pet.shape !== it.shape) { this.pet = this.newPet(); this.pet.shape = it.shape; }
    this.petStep(this.pet, dt, p, moving, it, false);
  },
  petCheer(st, list) {                                                    // Herzen steigen auf
    if (!st || !st.init) return;
    st.happy = 1.4;
    for (let i = 0; i < 5; i++) Cos.push(list, { x: st.x + rand(-6, 6), y: st.y + 6, vx: rand(-0.4, 0.4), vy: 0.8 + Math.random() * 0.6, life: 1, color: STYLE.pal.pink, size: 1, shape: 'heart' });
  },

  // ---------------------------------------------------------------------------------------------
  // HUD-Themes: Farben und Rahmen des HUD (hudBegin/hudEnd klammern das Zeichnen, uiPanel fragt STYLE.frameTheme)
  // ---------------------------------------------------------------------------------------------
  THEMES: {
    retro: { notch: 0, map: { cyan: '#ff4fd8', ice: '#ffd0f7', teal: '#ff8ae8', greyMid: '#9a5bd0', grey: '#d9b3ff', void: '#16002e', voidLight: '#2a0a52', purple: '#7a3cff', purpleDark: '#3a1470', yellow: '#ffe14d' } },
    terminal: { notch: 0, map: { cyan: '#33ff66', ice: '#c8ffd4', teal: '#33ff66', greyMid: '#1f7a3a', grey: '#46c46a', void: '#020b05', voidLight: '#06200f', yellow: '#ccff33', white: '#d6ffe0', purple: '#1fbf55', purpleDark: '#0c4a22', orange: '#a8ff33', red: '#ffcf33' } },
    blueprint: { notch: 0, map: { cyan: '#ffffff', ice: '#eaf2ff', teal: '#9fc4ff', greyMid: '#5b86d6', grey: '#a9c5ff', void: '#0b2c75', voidLight: '#143d99', yellow: '#ffe58a', purple: '#7aa6ff', purpleDark: '#1b3f94' } },
    wood: { notch: 1, map: { cyan: '#e3b46f', ice: '#fff0cf', teal: '#c9a05a', greyMid: '#7c5632', grey: '#d2aa72', void: '#3b2412', voidLight: '#583a1f', yellow: '#ffd25a', purple: '#a86a3a', purpleDark: '#5a3820' } },
  },
  hudSaved: null,
  hudBegin(itOv) {
    const it = itOv || Cos.cur('hud');
    if (!it || !it.theme || this.hudSaved) return;
    const th = this.THEMES[it.theme], P = STYLE.pal, saved = {};
    for (const k of Object.keys(th.map)) { saved[k] = P[k]; P[k] = th.map[k]; }
    this.hudSaved = saved; STYLE.frameTheme = it.theme;
  },
  hudEnd() {
    if (!this.hudSaved) return;
    for (const k of Object.keys(this.hudSaved)) STYLE.pal[k] = this.hudSaved[k];
    this.hudSaved = null; STYLE.frameTheme = null;
  },
  panelNotch(theme, n) { return this.THEMES[theme].notch; },
  // Zusatz-Zeichnung auf jedem Panel (uiPanel ruft das am Ende auf, wenn ein Theme aktiv ist)
  panelDeco(ctx, x, y, w, h, c) {
    const th = STYLE.frameTheme;
    ctx.save(); ctx.fillStyle = c;
    if (th === 'retro') {                                      // dicke Konsolen-Kante: helle Oberkante, dunkle Unterkante, Eckklötze
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
      ctx.fillStyle = '#000000'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
      ctx.globalAlpha = 1; ctx.fillStyle = c; for (const [px, py] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(px, py, 3, 3);
    } else if (th === 'terminal') {                            // Klammer-Ecken und feine Scanlinien
      ctx.globalAlpha = 1;
      for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) { ctx.fillRect(sx > 0 ? px : px - 4, py, 5, 1); ctx.fillRect(px, sy > 0 ? py : py - 4, 1, 5); }
      ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffffff'; for (let yy = y + 2; yy < y + h - 1; yy += 3) ctx.fillRect(x + 1, yy, w - 2, 1);
    } else if (th === 'blueprint') {                           // Passmarken (+) an den Ecken, gestrichelte Innenlinie
      ctx.globalAlpha = 0.9;
      for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { ctx.fillRect(px - 2, py, 5, 1); ctx.fillRect(px, py - 2, 1, 5); }
      ctx.globalAlpha = 0.35; for (let xx = x + 4; xx < x + w - 4; xx += 4) { ctx.fillRect(xx, y + 3, 2, 1); ctx.fillRect(xx, y + h - 4, 2, 1); }
    } else if (th === 'wood') {                                // Maserung und Nagelkoepfe
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#1e1108'; for (let yy = y + 4; yy < y + h - 2; yy += 5) ctx.fillRect(x + 2, yy, w - 4, 1);
      ctx.globalAlpha = 1; for (const [px, py] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]]) { ctx.fillStyle = '#1e1108'; ctx.fillRect(px, py, 2, 2); ctx.fillStyle = '#d2aa72'; ctx.fillRect(px, py, 1, 1); }
    }
    ctx.restore();
  },
  // Mini-HUD fuer die Vorschau (Koordinaten relativ zur Kastenmitte, im verschobenen Koordinatensystem der Vorschau)
  hudPreview(ctx, it, w, h, t) {
    this.hudBegin(it);
    try {
      const P = STYLE.pal, cx = STAGE_W / 2, cy = STAGE_H / 2, by = cy + h / 2 - 34;
      for (let i = 0; i < 2; i++) drawSlot(ctx, cx - 66 + i * 25, by, { icon: ['sword', 'shot'][i], iconW: 14, key: ['1', '2'][i], color: P.cyan, ready: 1, selected: i === 0 });
      drawUltOrb(ctx, 0.5 + 0.5 * Math.sin(t), false, { cx: cx, cy: by + 12, r: 12 });
      for (let i = 0; i < 2; i++) drawSlot(ctx, cx + 20 + i * 25, by, { icon: i === 0 ? 'shot' : null, iconW: 14, key: ['Q', 'R'][i], color: P.cyan, ready: i === 1 ? 0.4 + 0.3 * Math.sin(t * 2) : 1, left: i === 1 ? 3.2 : 0 });
      const bx = cx - w / 2 + 8, ty = cy - h / 2 + 8;
      uiBar(ctx, bx, ty, w - 16, 6, 0.5 + 0.5 * Math.sin(t * 0.7), P.cyan);
      uiText(ctx, 'LV 7', bx, ty + 18, { size: STYLE.type.small, color: P.yellow });
      uiPanel(ctx, bx, ty + 26, 108, 11, { color: P.yellow, notch: 2 });
      uiText(ctx, 'RAPID FIRE', bx + 6, ty + 34, { size: STYLE.type.small, color: P.yellow });
    } finally { this.hudEnd(); }
  },

  // ---------------------------------------------------------------------------------------------
  // DIGITS: Stil der Schadenszahlen. o = { text, color, size }, (sx, sy) = Bildschirmposition (Mitte), k = Alter 0..1
  // ---------------------------------------------------------------------------------------------
  drawNumber(ctx, style, o, sx, sy, k) {
    const P = STYLE.pal, size = o.size, w = o.text.length * size * 0.55;
    ctx.save();
    if (style === 'flame') {
      uiText(ctx, o.text, sx, sy, { size, color: P.orange, align: 'center' });
      uiText(ctx, o.text, sx, sy - 1, { size, color: P.yellow, align: 'center' });
      for (let i = 0; i < 7; i++) {
        const kk = cmod(k * 3 + i * 0.17, 1);
        ctx.globalAlpha = 1 - kk; ctx.fillStyle = kk < 0.4 ? P.yellow : kk < 0.75 ? P.orange : P.red;
        ctx.fillRect(Math.round(sx + (i - 3) * size * 0.3 + Math.sin(i * 5 + k * 12) * 2), Math.round(sy - size * 0.7 - kk * 9), 2, 2);
      }
    } else if (style === 'ice') {
      uiText(ctx, o.text, sx, sy, { size, color: P.cyan, align: 'center' });
      uiText(ctx, o.text, sx, sy - 1, { size, color: P.ice, align: 'center' });
      for (let i = 0; i < o.text.length; i++) {
        const len = 2 + Math.round((chash(i + o.text.charCodeAt(i)) * 4)) + Math.round(k * 3), px = Math.round(sx - w / 2 + (i + 0.5) * size * 0.55);
        ctx.fillStyle = P.ice; ctx.fillRect(px, Math.round(sy + 1), 1, len); ctx.fillStyle = P.white; ctx.fillRect(px, Math.round(sy + len), 1, 1);
      }
    } else if (style === 'hearts') {
      uiText(ctx, o.text, sx + 4, sy, { size, color: P.pink, align: 'center' });
      cbmDraw(ctx, CBM.heart, Math.round(sx - w / 2 - 5), Math.round(sy - size * 0.35), 1, { '#': P.pink });
      ctx.globalAlpha = 1 - k; cbmDraw(ctx, CBM.heart, Math.round(sx + w / 2 + 6), Math.round(sy - size * 0.5 - k * 10), 1, { '#': P.red });
    } else if (style === 'coins') {
      uiText(ctx, o.text, sx + 4, sy, { size, color: '#ffd91f', align: 'center' });
      const cw = Math.max(1, Math.round(1 + 2.5 * Math.abs(Math.cos(k * 18))));
      ctx.fillStyle = P.yellow; ctx.fillRect(Math.round(sx - w / 2 - 5 - cw), Math.round(sy - size * 0.6), cw * 2, 6); ctx.fillStyle = P.white; ctx.fillRect(Math.round(sx - w / 2 - 5 - cw), Math.round(sy - size * 0.6), 1, 2);
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // SOUND: Pakete ersetzen einzelne Klaenge (gleiche Namen wie in SFX). Sfx.play fragt Cos2.pack().
  // ---------------------------------------------------------------------------------------------
  PACKS: {
    arcade: {
      hit: (s) => s.tone('square', 880, 880, 0.04, 0.1),
      kill: (s) => { [523, 659, 784].forEach((f, i) => s.tone('square', f, f, 0.05, 0.1, i * 0.045)); },
      killBig: (s) => { s.noise('lowpass', 2200, 200, 0.2, 0.2); s.tone('square', 220, 55, 0.25, 0.14); },
      hurt: (s) => { s.tone('square', 220, 110, 0.12, 0.2); s.tone('square', 160, 70, 0.14, 0.2, 0.1); },
      shoot: (s) => s.tone('square', 1200, 420, 0.06, 0.1),
      swing: (s) => { s.tone('square', 300, 900, 0.07, 0.09); },
      stab: (s) => s.tone('square', 620, 300, 0.07, 0.11),
      crack: (s) => { s.noise('highpass', 3000, 3000, 0.04, 0.16); s.tone('square', 300, 200, 0.05, 0.1); },
      blast: (s) => { s.noise('lowpass', 1800, 150, 0.28, 0.24); s.tone('square', 90, 40, 0.25, 0.14); },
    },
    drums: {
      hit: (s) => s.tone('sine', 150, 55, 0.09, 0.32),
      kill: (s) => { s.noise('highpass', 1800, 1800, 0.12, 0.2); s.tone('triangle', 210, 120, 0.1, 0.18); },
      killBig: (s) => { s.tone('sine', 130, 60, 0.28, 0.4); s.tone('sine', 95, 50, 0.3, 0.3, 0.06); },
      hurt: (s) => { s.noise('highpass', 6000, 3000, 0.35, 0.22); s.tone('sine', 110, 45, 0.2, 0.3); },
      shoot: (s) => s.noise('highpass', 8000, 8000, 0.03, 0.12),
      swing: (s) => s.noise('bandpass', 7000, 5000, 0.1, 0.12),
      stab: (s) => s.tone('square', 1800, 1500, 0.025, 0.14),
      crack: (s) => { s.noise('bandpass', 1500, 1500, 0.03, 0.2); s.noise('bandpass', 1500, 1500, 0.05, 0.2, 0.025); },
      blast: (s) => { s.tone('sine', 120, 40, 0.3, 0.45); s.noise('highpass', 5000, 2500, 0.4, 0.15); },
    },
    laser: {
      hit: (s) => s.tone('sawtooth', 1500, 300, 0.07, 0.12),
      kill: (s) => { s.tone('sawtooth', 2000, 200, 0.15, 0.14); s.tone('square', 1000, 100, 0.12, 0.08); },
      killBig: (s) => s.tone('sawtooth', 1200, 60, 0.32, 0.22),
      hurt: (s) => { s.tone('sawtooth', 400, 50, 0.3, 0.26); s.noise('lowpass', 1500, 200, 0.2, 0.12); },
      shoot: (s) => s.tone('sawtooth', 2400, 500, 0.1, 0.09),
      swing: (s) => s.tone('sawtooth', 900, 2200, 0.1, 0.09),
      stab: (s) => s.tone('sawtooth', 1800, 400, 0.08, 0.12),
      crack: (s) => s.tone('square', 2200, 300, 0.06, 0.1),
      blast: (s) => { s.tone('sawtooth', 300, 30, 0.4, 0.26); s.noise('lowpass', 1200, 100, 0.3, 0.14); },
    },
    squeak: {
      hit: (s) => s.tone('sine', 1400, 1900, 0.05, 0.16),
      kill: (s) => { s.tone('sine', 900, 2200, 0.12, 0.2); s.tone('sine', 2200, 1500, 0.08, 0.15, 0.1); },
      killBig: (s) => { s.tone('sine', 500, 1600, 0.26, 0.26); s.tone('sine', 1600, 700, 0.14, 0.18, 0.24); },
      hurt: (s) => s.tone('sine', 1800, 380, 0.22, 0.26),
      shoot: (s) => s.tone('sine', 1800, 1000, 0.05, 0.12),
      swing: (s) => s.tone('triangle', 600, 1200, 0.08, 0.14),
      stab: (s) => s.tone('sine', 1300, 2000, 0.06, 0.15),
      crack: (s) => s.tone('sine', 2000, 2600, 0.04, 0.14),
      blast: (s) => { s.tone('sine', 300, 1500, 0.2, 0.26); s.noise('highpass', 4000, 6000, 0.12, 0.08); },
    },
  },
  pack() { const it = Cos.cur('sound'); return it && it.pack ? this.PACKS[it.pack] : null; },
  // Hoerprobe beim Auswaehlen im Menue (nacheinander ein paar typische Klaenge)
  sample(it) {
    const prev = Cos.over; Cos.over = { sound: it };
    ['shoot', 'hit', 'kill', 'killBig', 'hurt'].forEach((n, i) => setTimeout(() => { const o = Cos.over; Cos.over = { sound: it }; try { Sfx.last = {}; Sfx.play(n); } finally { Cos.over = o; } }, i * 170));
    Cos.over = prev;
  },

  // ---------------------------------------------------------------------------------------------
  // MENU BG: animierter Hintergrund des Hauptmenues. Gibt true zurueck, wenn gezeichnet (sonst zeichnet das Spiel das Standardbild).
  // ---------------------------------------------------------------------------------------------
  drawMenuBg(ctx, it, t, x0, y0, w, h) {
    if (!it || !it.bg) return false;
    const P = STYLE.pal;
    ctx.save();
    const bands = (c0, c1, n) => { for (let i = 0; i < n; i++) { const k = i / (n - 1), mix = (a, b) => Math.round(a + (b - a) * k); ctx.fillStyle = 'rgb(' + mix(c0[0], c1[0]) + ',' + mix(c0[1], c1[1]) + ',' + mix(c0[2], c1[2]) + ')'; ctx.fillRect(x0, Math.round(y0 + h * i / n), w, Math.ceil(h / n) + 1); } };
    if (it.bg === 'stars') {
      bands([3, 4, 14], [26, 8, 46], 14);
      for (let l = 0; l < 3; l++) for (let i = 0; i < 38; i++) {
        const x = x0 + cmod(i * 97.3 * (l + 1) - t * (5 + l * 9), w), y = y0 + cmod(i * 53.7 + l * 31, h);
        ctx.globalAlpha = 0.35 + l * 0.22 + 0.15 * Math.sin(t * 2 + i); ctx.fillStyle = i % 7 === 0 ? P.yellow : l === 2 ? P.white : P.ice; ctx.fillRect(Math.round(x), Math.round(y), l + 1, l + 1);
        if (l === 2 && i % 5 === 0) { ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3); }
      }
      ctx.globalAlpha = 1; const px = x0 + w * 0.8, py = y0 + h * 0.3;                                         // ferner Ringplanet
      ctx.fillStyle = P.purpleDark; pxDisc(ctx, px, py, 26); ctx.fillStyle = P.purple; pxDisc(ctx, px - 5, py - 5, 16); ctx.fillStyle = P.ice; ctx.globalAlpha = 0.6; pxRing(ctx, px, py, 40, 1, 22, t * 0.02);
    } else if (it.bg === 'city') {
      bands([8, 3, 24], [58, 16, 82], 14);
      ctx.fillStyle = '#f2ecff'; ctx.globalAlpha = 0.9; pxDisc(ctx, x0 + w * 0.78, y0 + h * 0.2, 14); ctx.globalAlpha = 1;
      const layers = [[0.52, '#1a0c33', 10, 0.2], [0.62, '#120726', 16, 0.4], [0.74, '#0a0418', 24, 0.7]];
      layers.forEach(([base, col, bw, lit], li) => {
        let x = x0 - 4, i = 0;
        while (x < x0 + w) {
          const bwid = bw + Math.round(chash(i * 7 + li * 100) * 14), bh = (1 - base) * h * (0.35 + chash(i * 3 + li * 50) * 0.65), top = y0 + h - bh;
          ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(top), bwid, Math.ceil(bh));
          for (let wy = top + 4; wy < y0 + h - 4; wy += 6) for (let wx = x + 3; wx < x + bwid - 3; wx += 5) {
            const on = chash(wx * 3.1 + wy * 1.7 + li * 9 + Math.floor(t * 0.15 + chash(wx + wy) * 3)) < lit * 0.5;
            if (on) { ctx.globalAlpha = 0.85; ctx.fillStyle = chash(wx + wy) > 0.8 ? P.cyan : P.yellow; ctx.fillRect(Math.round(wx), Math.round(wy), 2, 3); }
          }
          ctx.globalAlpha = 1; x += bwid + 1; i++;
        }
      });
      ctx.fillStyle = P.cyanMid; for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.35; const rx = x0 + cmod(i * 47.3 - t * 20, w), ry = y0 + cmod(i * 31.1 + t * 210, h); ctx.fillRect(Math.round(rx), Math.round(ry), 1, 6); }
    } else if (it.bg === 'arena') {
      bands([14, 2, 6], [96, 20, 10], 14);
      ctx.fillStyle = '#0a0204';                                                                              // Arena-Mauer mit Bogenoeffnungen
      const wallY = y0 + h * 0.58;
      ctx.fillRect(x0, Math.round(wallY), w, Math.ceil(h - h * 0.58));
      for (let i = 0; i < 9; i++) { const ax = x0 + 14 + i * (w / 9); ctx.fillStyle = '#4a0c16'; ctx.fillRect(Math.round(ax), Math.round(wallY + 8), 22, 40); pxDisc(ctx, ax + 11, wallY + 8, 11); ctx.fillStyle = '#7a1420'; ctx.fillRect(Math.round(ax) + 3, Math.round(wallY + 14), 16, 2); }
      for (let x = x0; x < x0 + w; x += 4) {                                                                  // Flammen am Boden
        const fh = 10 + 12 * (0.5 + 0.5 * Math.sin(t * 6 + x * 0.31)) + 7 * Math.sin(t * 3.3 + x * 0.9), by = y0 + h;
        ctx.fillStyle = P.red; ctx.globalAlpha = 0.85; ctx.fillRect(x, Math.round(by - fh), 4, Math.ceil(fh));
        ctx.fillStyle = P.orange; ctx.fillRect(x, Math.round(by - fh * 0.66), 4, Math.ceil(fh * 0.66));
        ctx.fillStyle = P.yellow; ctx.fillRect(x, Math.round(by - fh * 0.32), 4, Math.ceil(fh * 0.32));
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return true;
  },

  // ---------------------------------------------------------------------------------------------
  // DEATH: Todes-Animation des Schiffs (wird statt des Spielers gezeichnet, danach erscheint der Todesbildschirm). d = Zustand, siehe deathStart.
  // ---------------------------------------------------------------------------------------------
  deathStart(p, itOv) {
    const it = itOv || Cos.cur('death');
    if (!it || !it.anim || Juice.level === 0) return null;
    const P = STYLE.pal, d = { t: 0, type: it.anim, x: p.x, y: p.y, dir: p.dir, list: [], sprite: Cos.player() };
    if (d.type === 'dissolve') {
      for (let i = 0; i < 90; i++) { const a = rand(0, 360), v = rand(0.3, 2.2); Cos.push(d.list, { x: p.x + rand(-6, 6), y: p.y + rand(-6, 6), vx: fwdX(a) * v, vy: fwdY(a) * v + 0.9, life: rand(0.5, 1.0), color: [P.cyan, P.ice, P.white, P.cyanMid][i % 4], size: 2 }, 200); }
    } else if (d.type === 'scrap') {
      for (let i = 0; i < 12; i++) { const a = rand(0, 360), v = rand(1.5, 4.5); Cos.push(d.list, { x: p.x, y: p.y, vx: fwdX(a) * v, vy: fwdY(a) * v + 1.5, g: -0.2, life: 0.95, color: [P.grey, P.greyMid, P.orange, P.greyDark][i % 4], size: rand(3, 5), shape: 'shard', rot: rand(0, 6), spin: rand(-14, 14) }, 200); }
      for (let i = 0; i < 8; i++) Cos.push(d.list, { x: p.x + rand(-5, 5), y: p.y + rand(-5, 5), vx: rand(-1, 1), vy: rand(0.2, 1.2), life: 0.9, color: P.grey, size: 4, shape: 'smoke' }, 200);
      Juice.shake(4);
    } else if (d.type === 'tomb') {
      for (let i = 0; i < 12; i++) Cos.push(d.list, { x: p.x + rand(-8, 8), y: p.y - 4, vx: rand(-1.2, 1.2), vy: rand(0, 0.6), life: 0.8, color: P.grey, size: 4, shape: 'smoke' }, 200);
    }
    return d;
  },
  deathStep(d, dt) { d.t += dt; d.list = Cos.stepParticles(d.list, dt); },
  // Ohne Animations-Cosmetic (Standard oder Effekte aus): kurze neutrale Phase, in der das Schiff verblasst
  deathPlain(p) { return { t: 0, type: 'none', x: p.x, y: p.y, dir: p.dir, list: [], sprite: Cos.player(), dur: 0.45 }; },
  deathActive() { return !!this.dfx && this.dfx.t < (this.dfx.dur || DEATH_DUR); },
  deathFadeIn() { return this.dfx ? clamp((this.dfx.t - (this.dfx.dur || DEATH_DUR)) / 0.3, 0, 1) : 1; },
  deathDraw(ctx, d) {
    const P = STYLE.pal, k = d.t / (d.dur || DEATH_DUR), sx = Math.round(STAGE_W / 2 + d.x), sy = Math.round(STAGE_H / 2 - d.y), size = CFG.player.size;
    ctx.save();
    if (d.type === 'none') {
      if (k < 1) drawSprite(ctx, d.sprite, d.x, d.y, d.dir, size, { alpha: 1 - k });
    } else if (d.type === 'dissolve') {
      const fade = 1 - d.t / 0.55;
      if (fade > 0) for (let i = -3; i <= 3; i++) {                                                               // Schiff zerfaellt in waagerechte Streifen
        ctx.save(); ctx.beginPath(); ctx.rect(sx - 20, sy + i * 3 - 1, 40, 3); ctx.clip();
        drawSprite(ctx, d.sprite, d.x + (i % 2 ? 1 : -1) * d.t * 18 * Math.abs(i) * 0.4, d.y, d.dir, size, { alpha: fade });
        ctx.restore();
      }
    } else if (d.type === 'scrap') {
      if (d.t < 0.1) { ctx.fillStyle = P.white; ctx.fillRect(sx - 8, sy - 8, 16, 16); }
      ctx.fillStyle = P.orange; ctx.globalAlpha = 1 - k; pxRing(ctx, sx, sy, 4 + k * 44, 2); ctx.globalAlpha = 1;
    } else if (d.type === 'tomb') {
      if (d.t < 0.25) drawSprite(ctx, d.sprite, d.x, d.y, d.dir, size, { alpha: 1 - d.t / 0.25 });
      const rise = Math.min(1, Math.max(0, (d.t - 0.15) / 0.3));
      cbmDraw(ctx, CBM.tomb, sx, Math.round(sy + (1 - rise) * 20), 3, { '#': P.grey, o: P.greyDark });
      if (rise > 0.9) uiText(ctx, 'RIP', sx, sy - 8, { size: STYLE.type.small, color: P.ice, align: 'center' });
    } else if (d.type === 'hole') {
      const r = 16 * Math.sin(Math.min(1, k * 1.15) * Math.PI);
      ctx.fillStyle = P.purple; ctx.globalAlpha = 0.7; pxRing(ctx, sx, sy, r * 1.35 + 2, 1, 16, -d.t * 1.2); pxRing(ctx, sx, sy, r * 1.8 + 2, 1, 22, d.t * 0.9);
      ctx.globalAlpha = 1; ctx.fillStyle = P.violet;
      for (let arm = 0; arm < 3; arm++) pxArc(ctx, sx, sy, r * 1.5 + 2, arm * 2.094 + d.t * 9, arm * 2.094 + d.t * 9 + 1.1, 1);
      ctx.fillStyle = '#000000'; pxDisc(ctx, sx, sy, Math.max(0, r));
      const s = Math.max(0, 1 - k * 1.5);
      if (s > 0) drawSprite(ctx, d.sprite, d.x, d.y, d.dir + d.t * 900, size * s, { alpha: s });
    }
    for (const q of d.list) Cos.drawParticle(ctx, q);
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // INTRO: Titelkarte beim Boss-Auftritt (Bildschirmkoordinaten). cx, cy = Mitte der Karte, sc = Skalierung.
  // ---------------------------------------------------------------------------------------------
  bossTitle(type) { return (typeof STAT_BOSS_NAMES !== 'undefined' && STAT_BOSS_NAMES[type]) || String(type).toUpperCase(); },
  introStart(type) {
    const it = Cos.cur('intro');
    this.intro = it && it.card ? { t: 0, name: this.bossTitle(type), card: it.card } : null;
  },
  introDraw(ctx, d, cx, cy, sc) {
    if (!d) return;
    const P = STYLE.pal, t = d.t, out = clamp((INTRO_DUR - t) / 0.4, 0, 1), inn = clamp(t / 0.18, 0, 1);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
    if (d.card === 'comic') {
      const s = (inn < 1 ? inn * 1.25 : 1 + 0.05 * Math.sin(t * 6)) * out, pts = [], pts2 = [];
      for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16, r = (i % 2 ? 78 : 126) * s; pts.push([Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.62]); pts2.push([Math.cos(a) * (r + 6) * 1.5, Math.sin(a) * (r + 6) * 0.62]); }
      ctx.fillStyle = P.ink; pxPolyFill(ctx, pts2); ctx.fillStyle = P.yellow; pxPolyFill(ctx, pts);
      ctx.fillStyle = P.red; ctx.globalAlpha = 0.4; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; pxFill(ctx, Math.cos(a) * 46 * s * 1.5, Math.sin(a) * 46 * s * 0.62, 1); }
      ctx.globalAlpha = out; ctx.rotate(-0.09);
      uiText(ctx, d.name + '!', 0, 8 * s, { size: Math.round(30 * s), color: P.white, align: 'center', glow: P.red });
    } else if (d.card === 'arcade') {
      const hh = 40 * Math.min(1, t / 0.2) * out;                                                              // schwarzes Band mit Scanlinien, waechst aus der Mitte
      ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.92; ctx.fillRect(-STAGE_W / 2 / sc, -hh, STAGE_W / sc, hh * 2);
      ctx.globalAlpha = 0.1; ctx.fillStyle = '#ffffff'; for (let y = -hh; y < hh; y += 3) ctx.fillRect(-STAGE_W / 2 / sc, y, STAGE_W / sc, 1);
      ctx.globalAlpha = out;
      if (hh > 30) {
        if (Math.floor(t * 7) % 2) uiText(ctx, 'WARNING', 0, -14, { size: 16, color: P.pink, align: 'center', glow: P.red });
        const n = Math.min(d.name.length, Math.floor(t * 14)), txt = d.name.slice(0, n) + (Math.floor(t * 4) % 2 ? '_' : ' ');
        uiText(ctx, txt, 0, 12, { size: 22, color: P.yellow, align: 'center' });
        uiText(ctx, 'BOSS FIGHT  -  INSERT COIN', 0, 30, { size: STYLE.type.small, color: P.grey, align: 'center' });
      }
    } else if (d.card === 'horror') {
      const fl = Math.floor(t * 18) % 5 === 0 ? 2 : 0, j = t < 1.2 ? (chash(Math.floor(t * 30)) - 0.5) * 3 : 0;
      ctx.globalAlpha = 0.5 * inn * out; ctx.fillStyle = '#200000'; ctx.fillRect(-STAGE_W / 2 / sc, -cy / sc, STAGE_W / sc, STAGE_H / sc);
      ctx.globalAlpha = Math.min(1, inn) * out * (fl ? 0.4 : 1);
      uiText(ctx, d.name, j, 8, { size: 30, color: '#d01010', align: 'center', glow: '#400000' });
      const wdt = d.name.length * 30 * 0.55;                                                                   // Blut tropft unter den Buchstaben
      ctx.fillStyle = '#a00808';
      for (let i = 0; i < d.name.length; i++) { const len = Math.min(26, Math.max(0, (t - 0.4 - chash(i * 5) * 0.5) * 14)) * (0.4 + chash(i)); ctx.fillRect(Math.round(-wdt / 2 + (i + 0.5) * 30 * 0.55), 12, 2, Math.round(len)); }
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // WIN: Siegerpose nach jedem Boss (Welt- bzw. Spielerkoordinaten)
  // ---------------------------------------------------------------------------------------------
  victoryStart(p, itOv) {
    const it = itOv || Cos.cur('victory');
    if (!it || !it.pose) return null;
    const v = { t: 0, type: it.pose, x: p.x, y: p.y, dir: p.dir }, P = STYLE.pal;
    if (v.type === 'fanfare') for (let i = 0; i < 16; i++) { const a = i * 22.5 + 11, sp = rand(1.6, 2.6); Cos.push(Juice.particles, { x: p.x, y: p.y, vx: fwdX(a) * sp, vy: fwdY(a) * sp, life: 1.2, color: [P.yellow, P.pink, P.cyan, P.white][i % 4], size: 1, shape: 'sym', sym: i % 3 }); }
    if (v.type === 'dance') for (let i = 0; i < 18; i++) { const a = rand(0, 360), sp = rand(0.8, 2.2); Cos.push(Juice.particles, { x: p.x, y: p.y, vx: fwdX(a) * sp, vy: fwdY(a) * sp + 1.4, g: -0.1, life: 1.1, color: [P.red, P.yellow, P.green, P.cyan, P.pink][i % 5], size: 3, shape: 'shard', rot: rand(0, 6), spin: rand(-10, 10) }); }
    return v;
  },
  // Die Siegerpose laeuft nach der echten Zeit weiter, auch hinter der Auswahl nach dem Boss (die das Spiel anhaelt); wird zu Beginn jedes Zeichnens abgeglichen
  victorySync() {
    const v = this.vic;
    if (!v) return;
    v.t = G.realTime - v.live;
    if (v.t > VICTORY_DUR[v.type]) this.vic = null;
  },
  victoryMod(v) {                                              // Tanz: der Spieler huepft und dreht sich (nur Darstellung)
    if (!v || v.type !== 'dance') return { hop: 0, spin: 0 };
    const k = v.t / VICTORY_DUR.dance;
    return { hop: Math.abs(Math.sin(v.t * 9)) * 9 * (1 - k), spin: v.t * 540 * (1 - k * 0.6) };
  },
  victoryDraw(ctx, v) {
    if (!v) return;
    const P = STYLE.pal, sx = Math.round(STAGE_W / 2 + v.x), sy = Math.round(STAGE_H / 2 - v.y), k = v.t / VICTORY_DUR[v.type];
    ctx.save();
    if (v.type === 'fanfare') { ctx.fillStyle = P.yellow; ctx.globalAlpha = (1 - k) * 0.8; pxRing(ctx, sx, sy, 8 + k * 60, 2); ctx.globalAlpha = (1 - k) * 0.5; pxRing(ctx, sx, sy, 4 + k * 38, 1); }
    else if (v.type === 'flag') {
      const rise = Math.min(1, v.t / 0.25), fx = sx + 12, fy = sy + 4, ph = Math.max(0, rise), al = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      ctx.globalAlpha = al; ctx.fillStyle = P.ink; ctx.fillRect(fx - 1, Math.round(fy - 22 * ph), 3, Math.round(22 * ph) + 2);
      ctx.fillStyle = P.ice; ctx.fillRect(fx, Math.round(fy - 22 * ph), 1, Math.round(22 * ph) + 1);
      if (ph > 0.8) for (let i = 0; i < 12; i++) { const wave = Math.round(Math.sin(v.t * 8 + i * 0.7) * 1.5), hh = 8 - Math.floor(i / 3); ctx.fillStyle = i < 6 ? P.red : P.redMid; ctx.fillRect(fx + 1 + i, Math.round(fy - 22 + wave), 1, hh); }
      ctx.globalAlpha = al * 0.5; ctx.fillStyle = P.grey; ctx.fillRect(fx - 4, fy + 1, 9, 2);
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // REVIVE: Totem of Undying (Wiederbelebung durch den Revival Core). Bildschirmkoordinaten, cx, cy = Mitte, sc = Skalierung.
  // ---------------------------------------------------------------------------------------------
  reviveStart() {
    const it = Cos.cur('revive');
    if (!it || it.anim !== 'totem') { this.rev = null; return; }
    this.rev = { t: 0, list: [], emit: 0 };
    Sfx.play('totem');
  },
  stepScreenParts(list, dt) {
    for (const q of list) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 70 * dt; q.vx *= 0.99; }
    return list.filter((q) => q.t < q.life);
  },
  reviveDraw(ctx, r, cx, cy, sc) {
    if (!r) return;
    const P = STYLE.pal, t = r.t;
    // Partikel (gruen und gold) strömen aus dem Totem; in der Vorschau erzeugt die Zeichnung selbst nach, das Spiel erzeugt sie hier ebenso
    if (t < 1.4) r.emit = (r.emit || 0) + 1;
    if (t < 1.4 && r.emit % 2 === 0) for (let i = 0; i < 3; i++) { const a = rand(0, Math.PI * 2), v = rand(30, 120); r.list.push({ x: 0, y: -4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: rand(0.6, 1.1), color: ['#41e67f', '#00bb46', '#f8eea5', '#eadb84'][randInt(0, 3)], s: randInt(2, 4) }); }
    const pop = t < 0.25 ? 0.2 + 1.05 * (t / 0.25) : t < 1.5 ? 1.25 : 1.25 * (1 - (t - 1.5) / 0.5), up = t > 1.5 ? (t - 1.5) / 0.5 * -60 : 0;
    const shake = t > 0.25 && t < 1.5 ? [Math.sin(t * 70) * 2, Math.cos(t * 83) * 2] : [0, 0];
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
    ctx.fillStyle = '#41e67f'; ctx.globalAlpha = 0.16 * Math.max(0, Math.min(1, pop)); pxGlow(ctx, 0, 0, 90);
    ctx.globalAlpha = 1;
    for (const q of r.list) { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
    ctx.globalAlpha = Math.max(0, Math.min(1, pop));
    if (pop > 0.01) { ctx.translate(shake[0], shake[1] + up); ctx.scale(pop, pop); cbmDraw(ctx, CBM.totem, 0, 0, 6, TOTEM_PAL); }
    ctx.restore();
  },
};

// Zeichnet das ausgeruestete Schiff mit Aura, Gear und Skin (fuer die Vorschauen); x, y in Weltkoordinaten der Vorschau
Cos2.shipAt = function (ctx, x, y, dir, t, size) {
  const aura = Cos.cur('aura'), gear = Cos.cur('gear'), skin = Cos.cur('skin');
  Cos.drawAura(ctx, aura, x, y, t);
  Cos.drawGear(ctx, gear, x, y, dir, t, 'back');
  Cos.drawShip(ctx, Cos.player(), x, y, dir, size || 250, {}, skin, t);
  Cos.drawGear(ctx, gear, x, y, dir, t, 'front');
};

// Vorschau der neuen Kategorien im Cosmetics-Menue (alle ausser skin und proj, die laufen ueber den vorhandenen Code in ui.js).
// Zeichnet im verschobenen Koordinatensystem der Vorschau (Mitte des Kastens = Bildmitte), pv = Zustand der Vorschau. Gibt true zurueck, wenn die Kategorie hier umgesetzt ist.
Cos2.previewCat = function (ctx, cat, it, w, h, t, dt, pv) {
  const P = STYLE.pal, cx = STAGE_W / 2, cy = STAGE_H / 2, path = (tt) => [Math.cos(tt * 1.6) * 40, Math.sin(tt * 1.6) * 20];
  const saveState = this.state, saveHome = this.homeOverride;
  const dirAt = (px, py, tt) => { const [nx, ny] = path(tt + 0.05); return Math.atan2(nx - px, ny - py) / DEG; };
  const loop = (period) => cmod(t, period);
  const mark = (name) => { if (pv.cat2 !== name) { pv.cat2 = name; pv.s = {}; this.decals = []; this.echoes = []; this.lastPos = null; this.floorDist = 0; } return pv.s; };
  const S = mark(cat + ':' + it.id);
  this.homeOverride = null;
  try {
    if (cat === 'hit') {
      drawSprite(ctx, 'circle', 34, 0, 270, 250);
      S.hitIn = (S.hitIn === undefined ? 0 : S.hitIn) - dt;
      if (S.hitIn <= 0) { S.hitIn = 0.8; this.hitT = -9; for (let i = 0; i < 4; i++) Cos.push(pv.list, { x: 34, y: 0, vx: rand(-2, 2), vy: rand(-2, 2), life: 0.3, color: P.yellow, size: 2 }); this.hit(34 + rand(-4, 4), rand(-4, 4), pv.list, it); }
      this.stepDecals(dt); this.drawDecals(ctx);
      this.shipAt(ctx, -34, 0, 90, t, 250);
      return true;
    }
    if (cat === 'floor') {
      const [px, py] = path(t), dir = dirAt(px, py, t);
      this.floorTick(dt, { x: px, y: py, dir }, true, it);
      this.stepDecals(dt); this.drawDecals(ctx);
      this.shipAt(ctx, px, py, dir, t, 250);
      return true;
    }
    if (cat === 'weather') {
      this.shipAt(ctx, 0, 0, 90 + Math.sin(t * 0.8) * 25, t, 250);
      this.drawWeather(ctx, it, t, cx - w / 2, cy - h / 2, w, h, t * 8, 0);
      return true;
    }
    if (cat === 'pet') {
      const [px, py] = path(t), dir = dirAt(px, py, t);
      if (!S.pet || S.pet.shape !== it.shape) { S.pet = this.newPet(); S.pet.shape = it.shape; }
      this.petStep(S.pet, dt, { x: px, y: py, dir }, true, it, false);
      S.cheerIn = (S.cheerIn === undefined ? 2 : S.cheerIn) - dt;
      if (S.cheerIn <= 0) { S.cheerIn = 4; this.petCheer(S.pet, pv.list); }
      this.shipAt(ctx, px, py, dir, t, 250);
      if (it.shape) this.petDraw(ctx, S.pet, it, t);
      return true;
    }
    if (cat === 'hud') { this.hudPreview(ctx, it, w, h, t); return true; }
    if (cat === 'numbers') {
      const fy = cy + 22;
      [['-12', 12, P.red, -34], ['-27', 15, P.orange, 6], ['-8', 12, P.red, 44]].forEach(([text, size, col, ox], i) => {
        const k = cmod(t * 0.7 + i * 0.3, 1);
        ctx.save(); ctx.globalAlpha = Math.min(1, (1 - k) / 0.3);
        if (it.style) this.drawNumber(ctx, it.style, { text, size, color: col }, cx + ox, fy - 8 * k - 14 * (i % 2), k);
        else uiText(ctx, text, cx + ox, fy - 8 * k - 14 * (i % 2), { size, color: col, align: 'center' });
        ctx.restore();
      });
      this.shipAt(ctx, 0, -6, 90, t, 250);
      return true;
    }
    if (cat === 'sound') {
      ctx.fillStyle = it.color;
      for (let i = 0; i < 18; i++) { const hh = it.pack ? 4 + Math.abs(Math.sin(t * (4 + i % 5) + i)) * 24 : 4 + Math.abs(Math.sin(t * 3 + i * 0.5)) * 10; ctx.globalAlpha = 0.8; ctx.fillRect(Math.round(cx - w / 2 + 12 + i * ((w - 24) / 18)), Math.round(cy + 8 - hh / 2), Math.max(3, Math.floor((w - 24) / 18) - 2), Math.round(hh)); }
      ctx.globalAlpha = 1; uiText(ctx, it.pack ? 'PLAYS WHEN YOU SELECT IT' : 'ORIGINAL SOUNDS', cx, cy - 30, { size: STYLE.type.small, color: P.grey, align: 'center' });
      return true;
    }
    if (cat === 'menubg') {
      this.drawMenuBg(ctx, it, t, cx - w / 2, cy - h / 2, w, h);
      uiText(ctx, 'DEATHARENA', cx, cy - h / 2 + 24, { size: STYLE.type.h1, color: P.red, align: 'center', glow: P.red });
      if (!it.bg) uiText(ctx, 'STANDARD MENU', cx, cy, { size: STYLE.type.small, color: P.greyMid, align: 'center' });
      return true;
    }
    if (cat === 'death') {
      if (S.d === undefined || (S.d && S.d.t > DEATH_DUR + 0.9)) S.d = this.deathStart({ x: 0, y: 0, dir: 90 }, it);       // null beim Standard-Item
      if (S.d) { this.deathStep(S.d, dt); if (S.d.t <= DEATH_DUR + 0.5) this.deathDraw(ctx, S.d); }
      else this.shipAt(ctx, 0, 0, 90, t, 250);
      return true;
    }
    if (cat === 'intro') {
      if (!S.card || S.card.t > INTRO_DUR + 0.6) S.card = { t: 0, name: 'OCTAGON', card: it.card };
      S.card.t += dt;
      if (it.card) this.introDraw(ctx, S.card.t <= INTRO_DUR ? S.card : null, cx, cy - 6, 0.5);
      else uiText(ctx, 'NO CARD', cx, cy, { size: STYLE.type.small, color: P.greyMid, align: 'center' });
      return true;
    }
    if (cat === 'victory') {
      if (!S.v || S.v.t > (VICTORY_DUR[S.v.type] || 2) + 0.9) { S.v = this.victoryStart({ x: 0, y: 0, dir: 90 }, it) || { t: 0, type: 'none' }; }
      S.v.t += dt;
      const vm = this.victoryMod(S.v);
      if (S.v.type !== 'none') this.victoryDraw(ctx, S.v);
      this.shipAt(ctx, 0, vm.hop, 90 + vm.spin, t, 250);
      return true;
    }
    if (cat === 'revive') {
      if (!S.r || S.r.t > REVIVE_DUR + 0.8) S.r = { t: 0, list: [], emit: 0 };
      S.r.t += dt; S.r.list = this.stepScreenParts(S.r.list, dt);
      if (it.anim === 'totem') { if (S.r.t <= REVIVE_DUR) this.reviveDraw(ctx, S.r, cx, cy, 0.62); }
      else { const k = cmod(t, 1.6) / 1.6; ctx.fillStyle = P.yellow; ctx.globalAlpha = 1 - k; pxRing(ctx, cx, cy, 6 + k * 50, 2); ctx.globalAlpha = 1; uiText(ctx, 'REVIVAL CORE!', cx, cy - 30 - k * 8, { size: STYLE.type.small, color: P.yellow, align: 'center' }); }
      return true;
    }
  } finally { this.state = saveState; this.homeOverride = saveHome; }
  return false;
};
