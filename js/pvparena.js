// PvP-Arena: die runde Kampffläche im Stil eines Kolosseums, aber futuristisch (rötliche Töne, Neonlinien statt Fackeln aus Stein).
// Aufbau von aussen nach innen: Zuschauerränge (Stufen mit Gängen) -> Mauer mit Bögen und Säulen -> Neon-Rand -> Sandboden mit Raster und Mitten-Zeichen.
// Alles wird EINMAL in ein Offscreen-Bild gezeichnet (Pixel-Look wie der Rest, siehe px*-Helfer in style.js); pro Bild kommen nur Fackelschein und Pulsieren dazu.
// Die Grenze der Kampffläche ist ein Kreis mit Radius CFG.pvp.radius (clampToMap in game.js).

const PvpArena = {
  cv: null, S: 0, torches: [],

  build() {
    const R = CFG.pvp.radius, S = (R + 100) * 2, c = S / 2, K = (R / 180) ** 2;       // K: gleiche Koernung bei groesserer Arena
    this.S = S; this.R = R; this.torches = [];
    let cv;
    try { cv = document.createElement('canvas'); } catch (e) { return; }
    cv.width = cv.height = S;
    const x = cv.getContext('2d');
    if (!x) return;
    let seed = 90210;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const polar = (r, a) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
    const speck = (r0, r1, cols, n) => {                                     // zufaellige 2x2-Pixel im Ring r0..r1
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.2832, r = Math.sqrt(r0 * r0 + rnd() * (r1 * r1 - r0 * r0));
        x.fillStyle = cols[Math.floor(rnd() * cols.length)];
        const [px, py] = polar(r, a); pxFill(x, px, py, 1);
      }
    };
    x.fillStyle = '#07020a'; x.fillRect(0, 0, S, S);

    // Zuschauerränge: sechs Stufen, jede etwas heller als die aeussere
    const seats = ['#14070c', '#1b0a10', '#150709', '#220b13', '#190810', '#2a0e17'];
    seats.forEach((col, i) => { x.fillStyle = col; pxDisc(x, c, c, R + 98 - i * 13); });
    speck(R + 34, R + 98, ['rgba(255,90,100,0.10)', 'rgba(0,0,0,0.22)', 'rgba(255,150,80,0.07)'], Math.round(5200 * K));
    x.fillStyle = '#07020a';                                                 // Gaenge (Treppen) zwischen den Tribuenen
    for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.2832 + 0.1, [x0, y0] = polar(R + 36, a), [x1, y1] = polar(R + 98, a); pxLine(x, x0, y0, x1, y1, 3); }
    x.fillStyle = 'rgba(255,90,60,0.35)';                                    // Stufenkanten als gestrichelte Neonringe
    for (let i = 0; i < 5; i++) pxRing(x, c, c, R + 98 - (i + 1) * 13 + 1, 1, 70 + i * 6, i * 0.13);

    // Mauer mit Podium
    x.fillStyle = '#34121d'; pxDisc(x, c, c, R + 30);
    x.fillStyle = '#4a1a27'; pxDisc(x, c, c, R + 24);
    x.fillStyle = '#5c2230'; pxDisc(x, c, c, R + 9);                         // Mauerkrone
    x.fillStyle = '#2a0d14'; pxDisc(x, c, c, R + 3);                         // Schatten am Fuss der Mauer
    // Boegen in der Mauerflaeche
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 6.2832 + 0.065, u = [Math.cos(a), Math.sin(a)], v = [-Math.sin(a), Math.cos(a)], [px, py] = polar(R + 17, a);
      const pts = [[-4, -7], [4, -7], [4, 5], [-4, 5]].map(([s, t]) => [px + v[0] * s + u[0] * t, py + v[1] * s + u[1] * t]);
      x.fillStyle = '#0b0306'; pxPolyFill(x, pts);
      x.fillStyle = 'rgba(255,45,61,0.55)'; pxPoly(x, pts, true, 1);
      const [tx, ty] = [px + u[0] * 6, py + u[1] * 6]; x.fillStyle = 'rgba(255,45,61,0.7)'; pxFill(x, tx, ty, 1);       // Schlussstein
    }
    // Saeulen mit Fackeln zwischen den Bögen
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 6.2832 + 0.26, [px, py] = polar(R + 8, a);
      x.fillStyle = '#8a2f3d'; pxFill(x, px - 3, py - 3, 3); x.fillStyle = '#b44a58'; pxFill(x, px - 3, py - 3, 1);
      this.torches.push([Math.cos(a) * (R + 8), -Math.sin(a) * (R + 8)]);
    }
    // Neon-Rand der Kampffläche und ein zweiter, schwacher Ring auf dem Podium
    x.fillStyle = '#ff2d3d'; pxRing(x, c, c, R + 1, 1);
    x.fillStyle = 'rgba(255,120,60,0.55)'; pxRing(x, c, c, R + 26, 1, 60, 0.05);

    // Sandboden
    x.fillStyle = '#3d121a'; pxDisc(x, c, c, R);
    speck(0, R - 3, ['#47161f', '#34101a', '#521b24', '#2c0d15', '#3a1018'], Math.round(7000 * K));
    x.fillStyle = '#2a0c13'; pxRing(x, c, c, R - 4, 2);                      // dunklerer Rand am Wandfuss
    // futuristisches Raster: Ringe und Speichen
    x.fillStyle = 'rgba(255,100,60,0.30)';
    pxRing(x, c, c, R * 0.34, 1, 56); pxRing(x, c, c, R * 0.67, 1, 96);
    x.fillStyle = 'rgba(255,100,60,0.16)';
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.2832 + 0.3927, [x0, y0] = polar(30, a), [x1, y1] = polar(R - 8, a); pxDashLine(x, x0, y0, x1, y1, 1, 4); }
    // Mitten-Zeichen und Startplaetze
    x.fillStyle = '#ff2d3d'; pxRing(x, c, c, 28, 2);
    x.fillStyle = '#ff7a3d'; pxRing(x, c, c, 16, 1); pxDisc(x, c, c, 3);
    x.fillStyle = 'rgba(255,200,120,0.5)';
    for (let k = 0; k < 4; k++) { const a = k * 1.5708, [x0, y0] = polar(34, a), [x1, y1] = polar(44, a); pxLine(x, x0, y0, x1, y1, 1); }
    for (const sx of [-CFG.pvp.spawnX, CFG.pvp.spawnX]) { x.fillStyle = 'rgba(255,170,90,0.55)'; pxRing(x, c + sx, c, 14, 1, 12); x.fillStyle = 'rgba(255,170,90,0.2)'; pxGlow(x, c + sx, c, 10); }
    this.cv = cv;
  },

  // Boden unter allem (wird von drawGround in game.js statt der Kachelkarte gerufen). ctx steht noch auf Bildschirmkoordinaten, Kamera = G.cam.
  drawGround(ctx) {
    if (!this.cv || this.R !== CFG.pvp.radius) this.build();
    const P = STYLE.pal, c = G.cam, [mx, my] = Juice.margin;
    ctx.fillStyle = '#07020a'; ctx.fillRect(-mx, -my, STAGE_W + 2 * mx, STAGE_H + 2 * my);
    if (!this.cv) return;
    const sx = Math.round((STAGE_W / 2 - this.S / 2 - c.x) * SCALE) / SCALE, sy = Math.round((STAGE_H / 2 - this.S / 2 + c.y) * SCALE) / SCALE;
    ctx.drawImage(this.cv, sx, sy, this.S, this.S);
    // lebendig: Fackelschein und ein pulsierender Ring in der Mitte
    const t = G.realTime;
    ctx.save();
    ctx.fillStyle = P.orange;
    this.torches.forEach(([wx, wy], i) => {
      const px = STAGE_W / 2 + wx - c.x, py = STAGE_H / 2 - wy + c.y;
      if (px < -30 || px > STAGE_W + 30 || py < -30 || py > STAGE_H + 30) return;
      const fl = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7);
      ctx.globalAlpha = 0.14 + 0.1 * fl; pxGlow(ctx, px, py - 4, 11);
      ctx.globalAlpha = 0.9; ctx.fillStyle = P.yellow; pxFill(ctx, px - 1, py - 6 - fl * 2, 1);
      ctx.fillStyle = P.orange; pxFill(ctx, px - 1, py - 4, 1);
    });
    const cx = STAGE_W / 2 - c.x, cy = STAGE_H / 2 + c.y;
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2.2); ctx.fillStyle = P.red; pxRing(ctx, cx, cy, 34 + Math.sin(t * 2.2) * 2, 1, 40, t * 0.1);
    ctx.restore();
  },
};
