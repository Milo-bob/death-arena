// PvP-Deckung: feste Waende (Rechtecke) und Saeulen (Kreise) in der Arena. Die Karten stehen in CFG.pvp.maps (Zahlen, Layout, Radius); 'colosseum' hat keine Deckung (das alte, offene Design).
// Die Deckung ist unzerstoerbar und kommt ohne Zufall aus, damit alle Geraete (und die Bots des Hosts) dieselbe Arena rechnen: jeder Spieler rechnet seine Angriffe selbst
// und schickt die Treffer ('hit'), also muss jeder dieselben Waende kennen.
//   Bewegung: clampToMap (game.js) schiebt Spieler und Bots aus der Deckung (Phase/Dash laufen auch nicht hindurch).
//   Angriffe: Schuesse, Raketen und Bumerangs verschwinden an der Deckung (stopShots); alle anderen Treffer (Nahkampf, Beam, Explosionen, Wellen) zaehlen nur, wenn zwischen
//             Angriff und Ziel keine Deckung steht (blocked, siehe weaponHit in enemies.js).
//   Optik:    PvpArena.build malt die Deckung mit in das Bodenbild (bake).
// Formen: { t: 'c', x, y, r } Kreis | { t: 'r', x, y, hw, hh, a } Rechteck (halbe Laenge hw, halbe Breite hh, a = Drehung in Grad)

const PvpCover = {
  id: 'colosseum', list: [],

  // Karte waehlen und die Formen vorbereiten (Drehung vorberechnet). Unbekannte Ids ergeben die Standardkarte.
  validId(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CFG.pvp.maps, id) ? id : CFG.pvp.mapId; },
  load(id) {
    this.id = this.validId(id);
    const M = CFG.pvp.maps[this.id];
    this.list = (M.cover || []).map((s) => {
      if (s.t === 'c') return { t: 'c', x: s.x, y: s.y, r: s.r };
      const a = (s.a || 0) * Math.PI / 180;
      return { t: 'r', x: s.x, y: s.y, hw: s.hw, hh: s.hh, c: Math.cos(a), s: Math.sin(a) };
    });
    CFG.pvp.radius = M.radius;
  },
  get active() { return this.list.length > 0; },

  // Position (Kreis mit Radius r) aus der Deckung schieben. Zwei Durchgaenge, damit ein Schub in die naechste Form korrigiert wird.
  push(x, y, r) {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.list) {
        if (s.t === 'c') {
          const dx = x - s.x, dy = y - s.y, min = s.r + r, d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          if (d < 0.01) { x = s.x + min; continue; }
          x = s.x + dx / d * min; y = s.y + dy / d * min;
        } else {
          const dx = x - s.x, dy = y - s.y;
          let lx = dx * s.c + dy * s.s, ly = -dx * s.s + dy * s.c;
          const cx = clamp(lx, -s.hw, s.hw), cy = clamp(ly, -s.hh, s.hh), ex = lx - cx, ey = ly - cy, d2 = ex * ex + ey * ey;
          if (d2 >= r * r) continue;
          if (d2 > 0.0001) { const d = Math.sqrt(d2); lx = cx + ex / d * r; ly = cy + ey / d * r; }
          else if (s.hw - Math.abs(lx) < s.hh - Math.abs(ly)) lx = (lx < 0 ? -1 : 1) * (s.hw + r);       // Mittelpunkt liegt im Rechteck: ueber die naechste Kante hinaus
          else ly = (ly < 0 ? -1 : 1) * (s.hh + r);
          x = s.x + lx * s.c - ly * s.s; y = s.y + lx * s.s + ly * s.c;
        }
      }
    }
    return [x, y];
  },

  // Beruehrt ein Kreis (x, y, r) die Deckung?
  hits(x, y, r) {
    for (const s of this.list) {
      if (s.t === 'c') { if (circlesOverlap(x, y, r, s.x, s.y, s.r)) return true; continue; }
      const dx = x - s.x, dy = y - s.y, lx = dx * s.c + dy * s.s, ly = -dx * s.s + dy * s.c;
      const ex = lx - clamp(lx, -s.hw, s.hw), ey = ly - clamp(ly, -s.hh, s.hh);
      if (ex * ex + ey * ey < r * r) return true;
    }
    return false;
  },

  // Schneidet die Strecke (x0, y0) -> (x1, y1) die Deckung? (Sichtlinie: true = verdeckt)
  blocked(x0, y0, x1, y1) {
    if (!this.list.length) return false;
    for (const s of this.list) {
      if (s.t === 'c') { if (segHitsCircle(x0, y0, x1, y1, 0, s.x, s.y, s.r)) return true; continue; }
      const ax = x0 - s.x, ay = y0 - s.y, bx = x1 - s.x, by = y1 - s.y;
      const lax = ax * s.c + ay * s.s, lay = -ax * s.s + ay * s.c, lbx = bx * s.c + by * s.s, lby = -bx * s.s + by * s.c;
      let t0 = 0, t1 = 1;
      const dx = lbx - lax, dy = lby - lay;
      let ok = true;
      for (const [p, d, h] of [[lax, dx, s.hw], [lay, dy, s.hh]]) {            // Slab-Test je Achse
        if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) { ok = false; break; } continue; }
        let ta = (-h - p) / d, tb = (h - p) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  },

  // Sprung von (x0, y0) nach (x1, y1): stoppt vor der ersten Deckung auf dem Weg (Rift Step darf nicht durch Waende springen)
  clip(x0, y0, x1, y1, r) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (this.hits(x, y, r)) return [px, py];
      px = x; py = y;
    }
    return [x1, y1];
  },

  // Von wo wirkt ein Angriff? Schuesse, Raketen usw. von ihrer eigenen Position, Nahkampf und Beam vom Besitzer (a.player, sonst der eigene Spieler)
  source(a) {
    if (typeof a.x === 'number' && typeof a.y === 'number') return [a.x, a.y];
    const p = a.player || G.player;
    return [p.x, p.y];
  },
  // Verdeckt Deckung den Weg vom Angriff zum Ziel (tx, ty)?
  shields(a, tx, ty) {
    if (!this.list.length) return false;
    const [sx, sy] = this.source(a);
    return this.blocked(sx, sy, tx, ty);
  },

  // Schuesse (Shot), Bumerangs und Raketen, die in der Deckung stecken, verschwinden (Rakete explodiert)
  stopShots(attacks) {
    if (!this.list.length) return;
    for (const a of attacks) {
      if (!a.alive || typeof a.x !== 'number') continue;
      const n = a.constructor.name;
      if (n === 'Shot' || n === 'Boomerang') { if (this.hits(a.x, a.y, 3)) { a.alive = false; Juice.sparks(a.x, a.y, STYLE.pal.red, 3, 2); } }
      else if (n === 'Rocket') { if (!a.exploded && this.hits(a.x, a.y, 4) && a.explode) a.explode(); }
    }
  },

  // In das Bodenbild malen (Offscreen-Canvas x, Mitte (c, c), Welt-y zeigt nach oben). Pixel-Look wie die Mauer der Arena.
  bake(x, c) {
    const P = (wx, wy) => [c + wx, c - wy];
    let seed = 4711;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (const s of this.list) {
      if (s.t === 'c') {
        const [px, py] = P(s.x, s.y);
        x.fillStyle = 'rgba(0,0,0,0.38)'; pxDisc(x, px + 3, py + 4, s.r);                        // Schatten
        x.fillStyle = '#34121d'; pxDisc(x, px, py, s.r);
        x.fillStyle = '#5c2230'; pxDisc(x, px, py, s.r - 3);
        x.fillStyle = '#8a2f3d'; pxDisc(x, px - 1, py - 1, s.r - 7);                             // Kopffläche, leicht versetzt = Licht von links oben
        x.fillStyle = '#ff2d3d'; pxRing(x, px, py, s.r, 1);
        x.fillStyle = 'rgba(255,170,90,0.5)'; pxRing(x, px, py, s.r - 4, 1, 10, rnd() * 3);
        continue;
      }
      const corner = (u, v, grow = 0) => { const lx = u * (s.hw + grow), ly = v * (s.hh + grow); const [px, py] = P(s.x + lx * s.c - ly * s.s, s.y + lx * s.s + ly * s.c); return [px, py]; };
      const poly = (grow, dx = 0, dy = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const [px, py] = corner(u, v, grow); return [px + dx, py + dy]; });
      x.fillStyle = 'rgba(0,0,0,0.38)'; pxPolyFill(x, poly(0, 3, 4));                            // Schatten
      x.fillStyle = '#34121d'; pxPolyFill(x, poly(0));
      x.fillStyle = '#5c2230'; pxPolyFill(x, poly(-3));
      x.fillStyle = '#7a2e40'; pxPolyFill(x, poly(-6));
      x.fillStyle = '#ff2d3d'; pxPoly(x, poly(0), true, 1);
      x.fillStyle = 'rgba(255,170,90,0.45)'; pxPoly(x, poly(-4), true, 1);
      x.fillStyle = '#2a0d14';                                                                     // Risse
      for (let i = 0; i < 4; i++) { const u = rnd() * 1.6 - 0.8, [px, py] = corner(u, 0); pxFill(x, px, py, 1); pxFill(x, px + 1, py + 1, 1); }
    }
  },
};
