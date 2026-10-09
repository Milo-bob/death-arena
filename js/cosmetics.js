// Cosmetics: rein optische Anpassungen. Daten in CFG.cosmetics, Besitz/Auswahl in Save.data.cosmetics.
// Kategorien: skin (Farbe + Effekte am Schiff), blade (Glow: Farbe + Effekte an Klinge/Schuessen), trail (Spur), kill (Todes-Effekt), aura (Effekt um den Spieler), gear (Anbauten).
// Es wird nicht nur umgefaerbt: Items koennen eigene Formen und Partikel mitbringen (Ringe, Plus-Sterne, Scherben, Rauch, Flammen, Blitze, Fluegel ...).
// Farbige Sprites werden einmal vorgefaerbt (Offscreen-Canvas, Cache) statt jedes Bild mit einem Filter zu zeichnen.
// Alle Zeichenfunktionen arbeiten in Weltkoordinaten (x, y wie im Spiel) und werden vom Spiel UND von der Vorschau im Menue benutzt.

const Cos = {
  trailT: 0, auraT: 0, gearT: 0, swordT: 0,

  items(cat) { return CFG.cosmetics.items[cat]; },
  item(cat, id) { return this.items(cat).find((i) => i.id === id); },
  over: null,                                                       // Vorschau: { kategorie: item } ueberschreibt das ausgeruestete Item (siehe previewStep)
  cur(cat) { if (this.over && this.over[cat]) return this.over[cat]; return this.colored(cat, this.item(cat, Save.cosEquipped(cat)) || this.items(cat)[0]); },
  // Item mit der gewaehlten Farbe der Kategorie (CFG.cosmetics.colors): gleiche Daten, aber Filter bzw. Partikelfarben ausgetauscht (Kopie wird gemerkt)
  colored(cat, it, colorId) {
    const list = CFG.cosmetics.colors[cat], cid = colorId === undefined ? Save.cosColor(cat) : colorId;
    if (!list || !it || it.noColor || it.colored || !cid) return it;
    const c = list.find((q) => q.id === cid);
    if (!c) return it;
    const key = cat + ':' + it.id + ':' + cid, cache = this._cc || (this._cc = {});
    return cache[key] || (cache[key] = Object.assign({}, it, 'filter' in c ? { filter: c.filter } : { colors: c.colors }, { color: c.color, colored: true }));
  },
  // Eintraege der Farbwahl im Menue: zuerst die eigenen Farben des Items, dann alle Farben der Kategorie
  colorEntries(cat, it) { return [{ id: null, name: 'ITEM DEFAULT', color: it.color }].concat(CFG.cosmetics.colors[cat] || []); },
  canColor(cat, it) { return !!CFG.cosmetics.colors[cat] && !!it && !it.noColor; },

  // Sprite-Name einer eingefaerbten Kopie von base (wird beim ersten Bedarf erzeugt). Ohne Filter oder ohne Canvas: das Original.
  tinted(base, filter) {
    if (!filter) return base;
    const key = base + '@' + filter, im = IMG[base];
    if (IMG[key]) return key;
    if (!im || !im.ok || typeof document === 'undefined') return base;
    try {
      const c = document.createElement('canvas');
      c.width = im.w; c.height = im.h;
      const g = c.getContext('2d');
      if ('filter' in g) { g.filter = filter; g.drawImage(im.img, 0, 0); }
      else { g.drawImage(im.img, 0, 0); this.filterPixels(g, c.width, c.height, filter); }       // Safari/iPad kennt ctx.filter nicht: Filter selbst auf die Pixel rechnen
      IMG[key] = { img: c, ok: true, res: im.res, w: im.w, h: im.h, rcx: im.rcx, rcy: im.rcy };
      return key;
    } catch (e) { return base; }
  },
  // CSS-Filter (hue-rotate, saturate, brightness) per Pixelrechnung, gleiche Matrizen wie die CSS-Spezifikation
  filterPixels(g, w, h, filter) {
    const d = g.getImageData(0, 0, w, h), p = d.data, re = /(hue-rotate|saturate|brightness)\(\s*(-?[\d.]+)(deg)?\s*\)/g;
    let m, M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const mul = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
    while ((m = re.exec(filter))) {
      const v = parseFloat(m[2]);
      let F;
      if (m[1] === 'brightness') F = [v, 0, 0, 0, v, 0, 0, 0, v];
      else if (m[1] === 'saturate') F = [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v];
      else {
        const c = Math.cos(v * Math.PI / 180), s = Math.sin(v * Math.PI / 180);
        F = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
             0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
             0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
      }
      M = mul(F, M);
    }
    const cl = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gg = p[i + 1], b = p[i + 2];
      p[i] = cl(M[0] * r + M[1] * gg + M[2] * b); p[i + 1] = cl(M[3] * r + M[4] * gg + M[5] * b); p[i + 2] = cl(M[6] * r + M[7] * gg + M[8] * b);
    }
    g.putImageData(d, 0, 0);
  },
  sprite(base, cat, previewItem) {
    const it = previewItem || this.cur(cat);
    return it && it.filter ? this.tinted(base, it.filter) : base;
  },
  player() { return this.sprite(Hero.sprite(), 'skin'); },        // Sprite des gewaehlten Helden mit Skin-Farbe (Skins gelten fuer alle Helden)
  blade(base) { return this.sprite(base, 'blade'); },

  // ---------------------------------------------------------------------------------------------
  // Partikel mit Form (Juice.particles und die Vorschau nutzen dieselben Funktionen)
  // q: x, y, vx, vy, life, t, color, size, shape ('ring' | 'plus' | 'shard' | 'smoke' | 'flame' | 'streak' | sonst Pixel), g (Schwerkraft), rot, spin
  // ---------------------------------------------------------------------------------------------
  push(list, q, cap) {
    if (Juice.scale === 0 || list.length >= (cap || CFG.juice.maxParticles)) return;
    q.t = 0; q.rot = q.rot || 0;
    list.push(q);
  },
  stepParticles(list, dt) {
    for (const q of list) {
      q.t += dt;
      if (q.home !== undefined && q.t > q.home) {                  // Muenzen (Coin Rain): fliegen nach kurzer Zeit zum Spieler und verschwinden dort
        const tg = Cos2.homeTarget(), dx = tg.x - q.x, dy = tg.y - q.y, d = Math.hypot(dx, dy) || 1, sp = 3 + (q.t - q.home) * 14;
        q.vx = dx / d * sp; q.vy = dy / d * sp; q.g = 0;
        if (d < 9) q.t = q.life;
      }
      if (q.g) q.vy += q.g * dt * 30;
      q.x += q.vx * dt * 30; q.y += q.vy * dt * 30;
      q.vx *= 0.93; q.vy *= q.g ? 0.98 : 0.93;
      if (q.spin) q.rot += q.spin * dt;
    }
    const out = list.filter((q) => q.t < q.life);
    if (out.length !== list.length) for (const q of list) if (q.t >= q.life && q.onEnd) q.onEnd(out, q);       // z. B. Feuerwerk: Rakete platzt am Ende
    return out;
  },
  drawParticle(ctx, q) {
    const sx = Math.round(STAGE_W / 2 + q.x), sy = Math.round(STAGE_H / 2 - q.y), k = q.t / q.life, s = q.size;
    ctx.fillStyle = q.color;
    switch (q.shape) {
      case 'ring': ctx.globalAlpha = 1 - k; pxRing(ctx, sx, sy, s * (0.5 + 2.5 * k), 1); break;
      case 'plus': {
        const a = Math.max(1, Math.round(s * (1 - k * 0.5)));
        ctx.globalAlpha = 1 - k * 0.6; ctx.fillRect(sx - a, sy - 1, a * 2 + 1, 2); ctx.fillRect(sx - 1, sy - a, 2, a * 2 + 1);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, sy - 1, 2, 2); break;
      }
      case 'shard':
        ctx.globalAlpha = 1 - k * k; ctx.save(); ctx.translate(sx, sy); ctx.rotate(q.rot); ctx.fillRect(-s / 2, -s / 2, s, Math.max(2, s * 0.55)); ctx.restore(); break;
      case 'smoke': { const z = Math.round(s * (1 + 2.2 * k)); ctx.globalAlpha = 0.45 * (1 - k); ctx.fillRect(sx - z / 2, sy - z / 2, z, z); break; }
      case 'flame': { const z = Math.max(1, Math.round(s * (1 - k * 0.7))); ctx.globalAlpha = 0.95 * (1 - k * 0.5); ctx.fillStyle = k < 0.3 ? '#ffd91f' : k < 0.65 ? '#ff8a1f' : '#ff2d3d'; ctx.fillRect(sx - z / 2, sy - z / 2, z, z); break; }
      case 'streak': ctx.globalAlpha = 1 - k; pxLine(ctx, sx, sy, sx - q.vx * 3, sy + q.vy * 3); break;
      default: if (!Cos2.drawParticleEx(ctx, q, sx, sy, k)) { ctx.globalAlpha = 1 - k; ctx.fillRect(sx - s / 2, sy - s / 2, s, s); }
    }
    ctx.globalAlpha = 1;
  },

  // ---------------------------------------------------------------------------------------------
  // Skin-Effekte (am Schiff selbst): glitch = versetzte Farbkopien + Ruckeln, holo = flackernd durchscheinend mit Scan-Linie
  // ---------------------------------------------------------------------------------------------
  drawShip(ctx, name, x, y, dir, size, opts, it, t) {
    opts = opts || {};
    if (Cos2.drawShip(ctx, name, x, y, dir, size, opts, it, t)) return;               // Skins mit Verhalten (js/cosmetics2.js)
    const fx = it && it.fx;
    if (fx === 'glitch') {
      const burst = (t * 5) % 1 < 0.18;
      if (burst) {
        const o = 2 + Math.floor((t * 40) % 3);
        drawSprite(ctx, name, x - o, y, dir, size, { hue: 150, alpha: 0.55 });
        drawSprite(ctx, name, x + o, y + 1, dir, size, { hue: -120, alpha: 0.55 });
        x += ((t * 77) % 3 - 1) * 2;
      }
      drawSprite(ctx, name, x, y, dir, size, opts);
    } else if (fx === 'holo') {
      const flick = 0.55 + 0.25 * Math.sin(t * 9) + ((t * 31) % 1 < 0.06 ? -0.3 : 0);
      drawSprite(ctx, name, x, y, dir, size, Object.assign({}, opts, { alpha: Math.max(0.15, flick) * (opts.alpha === undefined ? 1 : opts.alpha) }));
      const sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y, r = size / 100 * 5;           // Scan-Linie wandert ueber das Schiff
      const off = ((t * 22) % (r * 2)) - r, hw = Math.sqrt(Math.max(0, r * r - off * off));
      ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = '#e6fdff'; ctx.fillRect(Math.round(sx - hw), Math.round(sy + off), Math.round(hw * 2), 1); ctx.restore();
    } else if (fx === 'rainbow') {                                    // Farbe wandert durch den Regenbogen (8 vorgefaerbte Stufen, kein Live-Filter)
      const step = Math.floor(t * 4) % 8;
      drawSprite(ctx, this.tinted(name, 'hue-rotate(' + step * 45 + 'deg)'), x, y, dir, size, opts);
    } else if (fx === 'phantom') {                                    // blasses Schiff mit zwei schwebenden Echos
      const a = opts.alpha === undefined ? 1 : opts.alpha, w = Math.sin(t * 3) * 3;
      drawSprite(ctx, name, x - fwdX(dir) * 6 + w, y - fwdY(dir) * 6, dir, size, { alpha: 0.18 * a });
      drawSprite(ctx, name, x - fwdX(dir) * 12 - w, y - fwdY(dir) * 12, dir, size, { alpha: 0.1 * a });
      drawSprite(ctx, name, x, y, dir, size, Object.assign({}, opts, { alpha: (0.6 + 0.2 * Math.sin(t * 2)) * a }));
    } else if (fx === 'shadow') {                                     // dunkle Silhouette, violetter Rand pulsiert
      const a = opts.alpha === undefined ? 1 : opts.alpha, k = 0.35 + 0.25 * Math.sin(t * 4);
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) drawSprite(ctx, name, x + dx, y + dy, dir, size, { alpha: k * a * 0.6 });
      drawSprite(ctx, this.tinted(name, 'brightness(0.22) saturate(0.5)'), x, y, dir, size, opts);
    } else if (fx === 'ember' || fx === 'void' || fx === 'chrome') {
      drawSprite(ctx, name, x, y, dir, size, opts);
      const sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y, P = STYLE.pal;
      ctx.save();
      if (fx === 'ember') {                                           // glimmende Funken steigen vom Schiff auf
        for (let i = 0; i < 5; i++) {
          const k = (t * 0.9 + i * 0.2) % 1, ex = sx + Math.sin(i * 12.9 + k * 4) * 8, ey = sy + 4 - k * 20;
          ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.35 ? P.yellow : k < 0.7 ? P.orange : P.red;
          ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
        }
      } else if (fx === 'void') {                                     // Sterne funkeln auf dem Schiff
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.6 + i * 0.37) % 1, a = i * 2.4 + Math.floor(t * 1.6 + i * 0.37) * 1.7, r = 2 + (i * 5) % 8;
          const ex = Math.round(sx + Math.cos(a) * r), ey = Math.round(sy + Math.sin(a) * r), s = ph < 0.5 ? ph * 2 : 2 - ph * 2;
          ctx.globalAlpha = s; ctx.fillStyle = P.white; ctx.fillRect(ex, ey, 1, 1);
          if (s > 0.7) { ctx.fillRect(ex - 1, ey, 3, 1); ctx.fillRect(ex, ey - 1, 1, 3); }
        }
      } else {                                                        // Glanzstreifen wischt alle 2 s diagonal ueber das Schiff
        const k = (t % 2) / 2;
        if (k < 0.5) {
          const o = (k / 0.5) * 24 - 12;
          ctx.globalAlpha = 0.75; ctx.fillStyle = P.white;
          for (let i = -6; i <= 6; i++) { const px = o + i, py = i; if (Math.hypot(px, py) < 9) ctx.fillRect(Math.round(sx + px), Math.round(sy + py), 2, 1); }
        }
      }
      ctx.restore();
    } else drawSprite(ctx, name, x, y, dir, size, opts);
  },

  // ---------------------------------------------------------------------------------------------
  // Aura (um den Spieler, unter dem Schiff)
  // ---------------------------------------------------------------------------------------------
  drawAura(ctx, it, x, y, t) {
    if (!it || !it.fx) return;
    const P = STYLE.pal, sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y;
    ctx.save();
    if (it.fx === 'motes') {                                   // drei Lichtpunkte kreisen
      for (let i = 0; i < 3; i++) {
        const a = (t * 2.6 + i * 2.094), mx = sx + Math.cos(a) * 17, my = sy + Math.sin(a) * 17;
        ctx.globalAlpha = 0.25; ctx.fillStyle = it.color; ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 3, 6, 6);
        ctx.globalAlpha = 1; ctx.fillStyle = P.white; ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
      }
    } else if (it.fx === 'halo') {                             // gestrichelter Ring dreht sich
      ctx.fillStyle = it.color; ctx.globalAlpha = 0.9; pxRing(ctx, sx, sy, 17, 1, 9, t * 0.25);
      ctx.globalAlpha = 0.35; pxRing(ctx, sx, sy, 20, 1, 14, -t * 0.15);
    } else if (it.fx === 'arcs') {                             // kurze Blitzbogen, wechseln etwa 12x pro Sekunde
      const seed = Math.floor(t * 12);
      for (let i = 0; i < 3; i++) {
        let a = ((seed * 37 + i * 119) % 360) * DEG, px = sx + Math.cos(a) * 11, py = sy + Math.sin(a) * 11;
        ctx.fillStyle = i % 2 ? P.white : it.color; ctx.globalAlpha = 0.9;
        for (let s2 = 1; s2 <= 3; s2++) {
          const r = 11 + s2 * 4, j = (((seed * 13 + i * 7 + s2 * 5) % 9) - 4) * DEG * 5, nx = sx + Math.cos(a + j) * r, ny = sy + Math.sin(a + j) * r;
          pxLine(ctx, px, py, nx, ny); px = nx; py = ny;
        }
      }
    } else if (it.fx === 'pulse') {                            // Ring wie ein Herzschlag
      const k = (t % 1.1) / 1.1;
      ctx.fillStyle = it.color; ctx.globalAlpha = (1 - k) * 0.9; pxRing(ctx, sx, sy, 10 + 26 * k, 2);
      ctx.globalAlpha = 0.12 * (1 - k); pxDisc(ctx, sx, sy, 10 + 22 * k);
    }
    ctx.restore();
  },
  // Aura-Partikel (Flammenkranz): in `list` setzen, solange die Aura aktiv ist
  auraTick(list, it, x, y, dt) {
    if (!it || it.fx !== 'flames') return;
    this.auraT -= dt;
    if (this.auraT > 0) return;
    this.auraT = Juice.level === 2 ? 0.045 : 0.09;
    const a = rand(0, 360);
    this.push(list, { x: x + fwdX(a) * 11, y: y + fwdY(a) * 11, vx: fwdX(a) * 0.2, vy: 0.9 + Math.random() * 0.5, life: 0.5, color: '#ff8a1f', size: 3, shape: 'flame' });
  },

  // ---------------------------------------------------------------------------------------------
  // Endlos-Cosmetics. Im Spiel nur aktiv, wenn G.infinite (Vorschau ruft sie direkt auf).
  // Boden (grid, stars): vor der Welt gezeichnet, cam = Kamera, hx/hy = halbe sichtbare Groesse. Unterschiede zur Kamera erzeugen die Tiefe.
  // ---------------------------------------------------------------------------------------------
  drawEndlessGround(ctx, it, cam, hx, hy, t) {
    if (!it || (it.fx !== 'grid' && it.fx !== 'stars')) return;
    const sx0 = STAGE_W / 2, sy0 = STAGE_H / 2;
    ctx.save();
    if (it.fx === 'grid') {
      const S = 40, x0 = Math.floor((cam.x - hx) / S) * S, y0 = Math.floor((cam.y - hy) / S) * S;
      ctx.fillStyle = it.color;
      for (let wx = x0; wx < cam.x + hx; wx += S) {
        ctx.globalAlpha = Math.round(wx / S) % 5 === 0 ? 0.28 : 0.11;
        ctx.fillRect(Math.round(sx0 + wx - cam.x), Math.round(sy0 - hy), 1, Math.round(hy * 2));
      }
      for (let wy = y0; wy < cam.y + hy; wy += S) {
        ctx.globalAlpha = Math.round(wy / S) % 5 === 0 ? 0.28 : 0.11;
        ctx.fillRect(Math.round(sx0 - hx), Math.round(sy0 - wy + cam.y), Math.round(hx * 2), 1);
      }
    } else {
      const S = 36, par = 0.45, px = cam.x * par, py = cam.y * par;                       // Sterne bewegen sich langsamer als der Boden
      const x0 = Math.floor((px - hx) / S), y0 = Math.floor((py - hy) / S), x1 = Math.ceil((px + hx) / S), y1 = Math.ceil((py + hy) / S);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
        const h = Math.abs(Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1, h2 = Math.abs(Math.sin(i * 269.5 + j * 183.3) * 24634.6345) % 1;
        if (h > 0.6) continue;
        const wx = (i + h2) * S - px, wy = (j + ((h * 7) % 1)) * S - py, tw = 0.5 + 0.5 * Math.sin(t * (1 + h2 * 2) + h * 20);
        ctx.globalAlpha = 0.25 + 0.55 * tw; ctx.fillStyle = h < 0.12 ? STYLE.pal.yellow : STYLE.pal.white;
        const sx = Math.round(sx0 + wx), sy = Math.round(sy0 - wy);
        ctx.fillRect(sx, sy, 1, 1);
        if (h < 0.12 && tw > 0.7) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); }
      }
    }
    ctx.restore();
  },
  // Um den Spieler: beacon (Pfeil zum Startpunkt), sonar (Ping-Ringe), chrono (Siegel). o = { homeX, homeY, mins }
  drawEndless(ctx, it, x, y, t, o) {
    if (!it || !it.fx) return;
    const P = STYLE.pal, sx = Math.round(STAGE_W / 2 + x), sy = Math.round(STAGE_H / 2 - y);
    ctx.save();
    if (it.fx === 'beacon') {
      const dx = o.homeX - x, dy = o.homeY - y, d = Math.hypot(dx, dy);
      if (d > 90) {                                                                      // nah am Start ist der Pfeil unnoetig
        const a = Math.atan2(dy, dx), r = 26, ca = Math.cos(a), sa = -Math.sin(a), nx = -sa, ny = ca;
        const bx = sx + ca * r, by = sy + sa * r, pts = [[bx + ca * 6, by + sa * 6], [bx - ca * 3 + nx * 4, by - sa * 3 + ny * 4], [bx - ca * 3 - nx * 4, by - sa * 3 - ny * 4]];
        ctx.globalAlpha = clamp((d - 90) / 120, 0.25, 0.95) * (0.75 + 0.25 * Math.sin(t * 5));
        ctx.fillStyle = it.color; pxPolyFill(ctx, pts);
        ctx.fillStyle = P.white; pxFill(ctx, bx - 1, by - 1, 1);
      }
    } else if (it.fx === 'sonar') {
      for (let i = 0; i < 2; i++) {
        const k = ((t + i * 2) % 4) / 4;
        ctx.fillStyle = it.color; ctx.globalAlpha = (1 - k) * 0.55; pxRing(ctx, sx, sy, 8 + 62 * k, 1, 28);
      }
    } else if (it.fx === 'chrono') {                                                     // ein Siegel pro 5 Minuten Laufzeit, max. 8
      const n = clamp(1 + Math.floor(o.mins / 5), 1, 8);
      for (let i = 0; i < n; i++) {
        const a = t * 1.3 + i * (Math.PI * 2 / n), mx = Math.round(sx + Math.cos(a) * 21), my = Math.round(sy + Math.sin(a) * 21);
        ctx.globalAlpha = 0.3; ctx.fillStyle = it.color; ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.globalAlpha = 1; ctx.fillRect(mx - 2, my - 2, 4, 4); ctx.fillStyle = P.ink; ctx.fillRect(mx - 1, my - 1, 2, 2);
        ctx.fillStyle = P.white; ctx.fillRect(mx, my - 3, 1, 1);
      }
    }
    ctx.restore();
  },
  // Warp Lines: lange Tempolinien hinter dem Spieler, solange er laeuft
  endlessTick(list, it, p, dt, moving) {
    if (!it || it.fx !== 'warp' || !moving || Juice.scale === 0) return;
    this.warpT = (this.warpT || 0) - dt;
    if (this.warpT > 0) return;
    this.warpT = Juice.level === 2 ? 0.03 : 0.06;
    const back = p.dir + 180, side = rand(-18, 18), d = rand(10, 26);
    this.push(list, { x: p.x + fwdX(back) * d + fwdX(p.dir + 90) * side, y: p.y + fwdY(back) * d + fwdY(p.dir + 90) * side, vx: fwdX(back) * 4, vy: fwdY(back) * 4, life: 0.28, color: Math.random() < 0.3 ? STYLE.pal.white : it.color, size: 2, shape: 'streak' });
  },

  // ---------------------------------------------------------------------------------------------
  // Gear (Anbauten am Schiff). layer 'back' wird vor, 'front' nach dem Schiff gezeichnet. Dreht sich mit dem Schiff (dir), ausser Krone.
  // ---------------------------------------------------------------------------------------------
  drawGear(ctx, it, x, y, dir, t, layer) {
    if (!it || !it.fx) return;
    const P = STYLE.pal, sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y;
    ctx.save();
    if (it.fx === 'crown') {                                   // schwebt ueber dem Kopf, dreht sich nicht
      if (layer === 'front') {
        const by = sy - 17 + Math.round(Math.sin(t * 3)), c = P.yellow;
        ctx.fillStyle = P.ink; ctx.fillRect(sx - 7, by - 4, 14, 8);
        ctx.fillStyle = c; ctx.fillRect(sx - 6, by, 12, 3);
        for (const dx of [-6, -1, 4]) ctx.fillRect(sx + dx, by - 3, 3, 3);
        ctx.fillStyle = P.red; ctx.fillRect(sx - 1, by + 1, 2, 2);
        ctx.fillStyle = P.white; ctx.fillRect(sx - 5, by - 3, 1, 1); ctx.fillRect(sx + 5, by - 3, 1, 1);
      }
      ctx.restore(); return;
    }
    const ga = (dir - 90) * DEG, ca = Math.cos(ga), sa = Math.sin(ga);      // lokale Koordinaten: +x zeigt nach vorn
    const T = (x2, y2) => [sx + x2 * ca - y2 * sa, sy + x2 * sa + y2 * ca], poly = (pts) => pts.map((p) => T(p[0], p[1]));
    if (it.fx === 'wings' && layer === 'back') {
      const flap = Math.sin(t * 7) * 2;
      for (const s of [-1, 1]) {
        ctx.fillStyle = P.cyanDark; pxPolyFill(ctx, poly([[-2, s * 5], [-9, s * (12 + flap)], [-17, s * (15 + flap)], [-12, s * 6]]));
        ctx.fillStyle = it.color; pxPolyFill(ctx, poly([[-3, s * 5], [-9, s * (11 + flap)], [-12, s * 6]]));
        ctx.fillStyle = P.ice; const a = T(-2, s * 5), b = T(-17, s * (15 + flap)); pxLine(ctx, a[0], a[1], b[0], b[1], 1);
      }
    } else if (it.fx === 'horns' && layer === 'front') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = P.ink; pxPolyFill(ctx, poly([[3, s * 6], [13, s * 12], [8, s * 3]]));
        ctx.fillStyle = P.red; pxPolyFill(ctx, poly([[4, s * 6], [12, s * 11], [8, s * 4]]));
      }
    } else if (it.fx === 'antenna' && layer === 'back') {
      ctx.fillStyle = P.grey; pxPoly(ctx, poly([[-5, 0], [-10, -6], [-15, -8]]), false, 1);
      const tip = T(-15.5, -8.5);
      ctx.fillStyle = Math.floor(t * 3) % 2 ? P.red : P.green; pxFill(ctx, tip[0] - 1, tip[1] - 1, 2);
      ctx.globalAlpha = 0.25; pxGlow(ctx, tip[0], tip[1], 5);
    } else if (it.fx === 'jetpack' && layer === 'back') {
      for (const s of [-1, 1]) {
        const body = poly([[-11, s * 4 - 2], [-4, s * 4 - 2], [-4, s * 4 + 2], [-11, s * 4 + 2]]);
        ctx.fillStyle = P.greyDark; pxPolyFill(ctx, body); ctx.fillStyle = P.grey; pxPoly(ctx, body, true, 1);
        const n = T(-12, s * 4); ctx.fillStyle = P.orange; pxFill(ctx, n[0] - 1, n[1] - 1, 1);
      }
    }
    ctx.restore();
  },
  // Gear-Partikel: Jetpack-Flammen hinten, solange man sich bewegt
  gearTick(list, it, x, y, dir, dt, moving) {
    if (!it || it.fx !== 'jetpack' || !moving) return;
    this.gearT -= dt;
    if (this.gearT > 0) return;
    this.gearT = Juice.level === 2 ? 0.03 : 0.06;
    const back = dir + 180;
    for (const s of [-1, 1]) {
      const bx = x + fwdX(back) * 11 + fwdX(dir + 90) * s * 4, by = y + fwdY(back) * 11 + fwdY(dir + 90) * s * 4;
      this.push(list, { x: bx, y: by, vx: fwdX(back) * 1.2 + rand(-0.2, 0.2), vy: fwdY(back) * 1.2 + rand(-0.2, 0.2), life: 0.32, color: '#ff8a1f', size: 3, shape: 'flame' });
    }
  },

  // ---------------------------------------------------------------------------------------------
  // Klinge und Schuesse (Glow-Items mit fx): comet = Nachbilder, sparkle = Funkelsterne + Sternschuesse, volt = Blitze
  // ---------------------------------------------------------------------------------------------
  drawSword(ctx, it, px, py, dir, sizePct, t, owner) {
    const P = STYLE.pal, name = this.sprite('sword', 'blade', it), fx = it && it.fx;
    if (fx === 'comet') {                                          // Nachbilder an den Posen der letzten Bilder: folgen Drehung UND Mitlaufen mit dem Spieler
      const tr = this.poseTrail(owner, { x: px, y: py, dir }, G.realTime);
      tr.forEach((q, i) => drawSprite(ctx, name, q.x, q.y, q.dir, sizePct, { alpha: 0.12 + 0.07 * i }));
    }
    drawSprite(ctx, name, px, py, dir, sizePct);
    if (fx === 'volt') {                                         // flackernde Blitzlinie ueber die Klinge
      const s = sizePct / 100, seed = Math.floor(t * 20), ox = STAGE_W / 2 + px, oy = STAGE_H / 2 - py;
      ctx.save(); ctx.fillStyle = P.white; ctx.globalAlpha = 0.9;
      let lx = ox, ly = oy;
      for (let i = 1; i <= 5; i++) {
        const l = 5 * s * i, a = (dir - 6 + ((seed * 11 + i * 17) % 7)) * DEG, j = (((seed * 5 + i * 3) % 5) - 2) * 1.6;
        const nx = ox + Math.sin(a) * l + Math.cos(a) * j, ny = oy - Math.cos(a) * l + Math.sin(a) * j;
        pxLine(ctx, lx, ly, nx, ny); lx = nx; ly = ny;
      }
      ctx.restore();
    }
  },
  swordTick(list, it, px, py, dir, sizePct, dt) {
    if (!it || it.fx !== 'sparkle') return;
    this.swordT -= dt;
    if (this.swordT > 0) return;
    this.swordT = 0.05;
    const l = rand(8, 24) * sizePct / 100, a = dir - rand(0, 14);
    this.push(list, { x: px + fwdX(a) * l, y: py + fwdY(a) * l, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), life: 0.35, color: it.color, size: 2, shape: 'plus' });
  },
  drawShot(ctx, it, x, y, dir, sizePct, alpha, t, owner) {
    const P = STYLE.pal, fx = it && it.fx, name = this.sprite('shot', 'blade', it);
    if (fx === 'comet') {                                          // Spur an den echten letzten Positionen des Schusses
      const tr = this.poseTrail(owner, { x, y, dir }, G.realTime);
      tr.forEach((q, i) => drawSprite(ctx, name, q.x, q.y, q.dir, sizePct, { alpha: alpha * (0.12 + 0.07 * i) }));
    }
    if (fx === 'sparkle') {                                     // drehender Vierzack-Stern statt Strich
      const sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y, a = t * 9, r = 5 * sizePct / 150;
      ctx.save(); ctx.globalAlpha = alpha;
      const pts = [];
      for (let i = 0; i < 4; i++) { const an = a + i * Math.PI / 2; pts.push([sx + Math.cos(an) * r, sy + Math.sin(an) * r], [sx + Math.cos(an + Math.PI / 4) * r * 0.3, sy + Math.sin(an + Math.PI / 4) * r * 0.3]); }
      ctx.fillStyle = it.color; pxPolyFill(ctx, pts); pxPoly(ctx, pts, true, 1); ctx.fillStyle = P.white; pxFill(ctx, sx - 1, sy - 1, 1); ctx.restore();
      return;
    }
    if (fx === 'volt') {                                        // gezackter Blitz entlang der Flugrichtung
      const ox = STAGE_W / 2 + x, oy = STAGE_H / 2 - y, seed = Math.floor(t * 25);
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = it.color;
      let lx = ox - fwdX(dir) * 9, ly = oy + fwdY(dir) * 9;
      for (let i = 1; i <= 4; i++) {
        const j = (((seed * 7 + Math.floor(x + y) + i * 5) % 5) - 2) * 1.5, l = -9 + i * 4.5;
        const nx = ox + fwdX(dir) * l + fwdY(dir) * j, ny = oy - fwdY(dir) * l + fwdX(dir) * j;
        pxLine(ctx, lx, ly, nx, ny); lx = nx; ly = ny;
      }
      ctx.fillStyle = P.white; ctx.fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 2, 2); ctx.restore();
      return;
    }
    drawSprite(ctx, name, x, y, dir, sizePct, { alpha });
  },

  // ---------------------------------------------------------------------------------------------
  // Spur: Pixel (pick/cycle/glitch) oder Formen (ring = Blasen, plus = Sternenstaub, smoke = Rauch, echo = Nachbilder des Schiffs)
  // ---------------------------------------------------------------------------------------------
  trailColor(it, k, t) {
    const c = it.colors;
    if (it.style === 'cycle') return c[Math.floor(t * 6 + k) % c.length];
    if (it.style === 'glitch') return c[(k * 7 + Math.floor(t * 20)) % c.length];
    return c[Math.floor(Math.random() * c.length)];
  },
  trailTick(list, it, p, dt, moving, realTime) {
    if (!it || !it.colors || !moving || Juice.scale === 0) return;
    if (it.shape === 'echo') return;                              // Nachbilder laufen ueber Juice.ghost (siehe Player)
    this.trailT -= dt;
    if (this.trailT > 0) return;
    this.trailT = (it.shape ? 0.06 : 0.035) * (Juice.level === 2 ? 1 : 2);
    const back = p.dir + 180, g = it.style === 'glitch', col = this.trailColor(it, Math.floor(realTime * 30), realTime);
    const base = { x: p.x + fwdX(back) * 7 + rand(-3, 3), y: p.y + fwdY(back) * 7 + rand(-3, 3), vx: fwdX(back) * 0.6 + (g ? rand(-2, 2) : rand(-0.3, 0.3)), vy: fwdY(back) * 0.6 + (g ? rand(-2, 2) : rand(-0.3, 0.3)), color: col };
    if (it.shape === 'ring') this.push(list, Object.assign(base, { vx: rand(-0.3, 0.3), vy: 0.5 + Math.random() * 0.4, life: 0.8, size: 3, shape: 'ring' }));
    else if (it.shape === 'plus') this.push(list, Object.assign(base, { vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), life: 0.55, size: 3, shape: 'plus' }));
    else if (it.shape === 'smoke') this.push(list, Object.assign(base, { vy: base.vy + 0.35, life: 0.7, size: 4, shape: 'smoke' }));
    else this.push(list, Object.assign(base, { life: g ? 0.3 : 0.45, size: g ? 3 : 2 }));
  },

  // ---------------------------------------------------------------------------------------------
  // Kill-Effekt (Farben oder Formen: shockring, shatter, supernova, bloom)
  // ---------------------------------------------------------------------------------------------
  emitKill(list, x, y, def, n, it) {
    it = it || this.cur('kill');
    const cols = it && it.colors;
    if (!cols) { if (list === Juice.particles) Juice.sparks(x, y, def, n); else for (let i = 0; i < n; i++) this.push(list, { x, y, vx: rand(-3, 3), vy: rand(-3, 3), life: 0.35, color: def, size: 2 }); return; }
    const c = (i) => cols[i % cols.length], sc = Juice.level === 2 ? 1 : 0.5;
    if (Cos2.emitKill(list, x, y, it, sc)) return;                                       // Grabstein, Muenzregen, Tinte, Feuerwerk, Glitch Delete
    if (it.shape === 'shockring') {
      this.push(list, { x, y, vx: 0, vy: 0, life: 0.45, color: c(0), size: 9, shape: 'ring' });
      this.push(list, { x, y, vx: 0, vy: 0, life: 0.6, color: c(1), size: 6, shape: 'ring' });
      for (let i = 0; i < 6 * sc; i++) this.push(list, { x, y, vx: fwdX(i * 60) * 3, vy: fwdY(i * 60) * 3, life: 0.35, color: c(2), size: 2 });
    } else if (it.shape === 'shatter') {
      for (let i = 0; i < 9 * sc; i++) { const a = rand(0, 360), v = rand(1.5, 4); this.push(list, { x, y, vx: fwdX(a) * v, vy: fwdY(a) * v + 1.5, g: -0.22, life: 0.8, color: c(i), size: rand(3, 5), shape: 'shard', rot: rand(0, 6), spin: rand(-12, 12) }); }
    } else if (it.shape === 'supernova') {
      this.push(list, { x, y, vx: 0, vy: 0, life: 0.55, color: c(0), size: 10, shape: 'ring' });
      for (let i = 0; i < 12 * sc; i++) { const a = i * 30, v = 5.5; this.push(list, { x, y, vx: fwdX(a) * v, vy: fwdY(a) * v, life: 0.32, color: c(i), size: 2, shape: 'streak' }); }
    } else if (it.shape === 'bloom') {
      for (let i = 0; i < 8 * sc; i++) { const a = i * 45 + 22, v = 2.6; this.push(list, { x, y, vx: fwdX(a) * v, vy: fwdY(a) * v, life: 0.55, color: c(i), size: 4, shape: 'plus' }); }
    } else {
      const per = Math.max(1, Math.ceil(n / cols.length));
      if (list === Juice.particles) for (const col of cols) Juice.sparks(x, y, col, per + 1, 3.5);
      else for (const col of cols) for (let i = 0; i < per + 1; i++) this.push(list, { x, y, vx: rand(-3.5, 3.5), vy: rand(-3.5, 3.5), life: 0.4, color: col, size: 2 });
    }
  },
  killSparks(x, y, def, n) { this.emitKill(Juice.particles, x, y, def, n); },
  // ---------------------------------------------------------------------------------------------
  // Glow fuer ALLE Waffen: Sprite-Waffen (Schwert, Schuesse) sind vorgefaerbt, alle anderen (Lanze, Peitsche, Hammer, Rakete, Beam, Granate ...)
  // werden mit dem Filter des Glow-Items gezeichnet. Die Effekte (comet/sparkle/volt) kommen als kleiner Akzent an jeder Waffe dazu.
  // ---------------------------------------------------------------------------------------------
  isWeapon(a) {
    const k = a.kind;
    if (k === 'sword') return !(a instanceof SwordSwing);        // Peitsche, Katana, Hammer (SwordSwing zeichnet sich selbst ueber drawSword)
    if (k === 'shot') return !(a instanceof Shot);               // Bumerang (Shot zeichnet sich selbst ueber drawShot)
    return k === 'lance' || k === 'impulse' || k === 'beam' || k === 'grenade' || k === 'fire' || k === 'molotov' || k === 'chain' || k === 'blackhole' || k === 'rocket';
  },
  // Zeichnet einen Angriff mit dem Glow-Item: Farbe (Filter) und Effekt an der Angriffs-Animation selbst:
  // comet = Nachbilder des Schlags/Fluges, sparkle = Funkelkreuze auf der Angriffsflaeche, volt = Blitze auf der Angriffsflaeche
  // Farben: Waffen, die mit Palettenfarben zeichnen (fast alle), bekommen die Farbfamilie des Glow-Items (Palette wird nur waehrend des Zeichnens umgesetzt);
  // nur Sprite-Waffen (Beam) laufen ueber den Farbfilter. Ein reiner Filter wirkt bei fast weissen Farben (Peitsche: ice/white) naemlich kaum.
  drawAttack(ctx, a, itOv) {
    const it = itOv || this.cur('blade');
    if (it && it.fx === 'echo' && !Cos2.echoBusy && a.kind !== 'fire' && (this.isWeapon(a) || a instanceof SwordSwing || a instanceof Shot)) Cos2.echoSnap(a);       // Slash Echo: Abbild zuruecklassen (alle Waffen)
    const pj = this.cur('proj');
    if (pj && pj.shape && Cos2.isProj(a)) { Cos2.drawProj(ctx, a, pj, it); return; }          // SHOTS: Form fuer alle Projektile
    if (!it || (!it.filter && !it.fx) || !this.isWeapon(a)) { a.draw(ctx); return; }
    const warm = a.kind === 'fire' || a.kind === 'molotov', restore = it.id !== 'default' || it.colored ? this.remapPalette(it, warm) : null, f = a.kind === 'beam' && it.filter ? it.filter : '';
    try {
      if (it.fx === 'comet') this.cometGhosts(ctx, a, f);
      ctx.save();
      if (f) ctx.filter = f;
      a.draw(ctx);
      ctx.restore();
      if (it.fx === 'sparkle' || it.fx === 'volt') this.attackSparks(ctx, a, it, G.realTime);
    } finally { if (restore) restore(); }
  },
  // Farbfamilie des Items aus item.color: hell, mittel, dunkel (Mischung mit Weiss/Schwarz). Cache je Item.
  themeOf(it) {
    if (it._theme) return it._theme;
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)), toHex = (v) => '#' + v.map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')).join('');
    const mix = (c, o, k) => { const a = hex(c), b = hex(o); return toHex(a.map((x, i) => x + (b[i] - x) * k)); };
    return (it._theme = { main: it.color, light: mix(it.color, '#ffffff', 0.8), mid: mix(it.color, '#000000', 0.35), dark: mix(it.color, '#000000', 0.7) });
  },
  // Setzt die Paletten-Farben, die Waffen beim Zeichnen benutzen (cyan-Familie, bei Feuer-Waffen die Feuerfarben), gibt die Rueckstell-Funktion zurueck
  remapPalette(it, warm) {
    const P = STYLE.pal, th = this.themeOf(it), saved = {};
    const map = warm ? { yellow: th.light, orange: th.main, red: th.mid, redMid: th.dark, redDark: th.dark } : { cyan: th.main, cyanMid: th.mid, cyanDark: th.dark, ice: th.light, swordCyan: th.main, swordMid: th.light, swordLight: th.light, swordIce: th.light };
    for (const k of Object.keys(map)) { saved[k] = P[k]; P[k] = map[k]; }
    return () => { for (const k of Object.keys(saved)) P[k] = saved[k]; };
  },
  // Verlauf der letzten Posen eines Objekts (fuer Nachbilder): gibt die aelteren Posen zurueck (aelteste zuerst) und merkt die aktuelle
  hist: new WeakMap(),
  poseTrail(owner, pose, now) {
    if (!owner) return [];
    let h = this.hist.get(owner);
    if (!h) { h = { list: [], t: -1 }; this.hist.set(owner, h); }
    const out = h.list.slice();
    if (now - h.t >= 0.022) { h.t = now; h.list.push(pose); if (h.list.length > 4) h.list.shift(); }
    return out;
  },
  // Nachbilder: Schwung-Angriffe (Spieler als Drehpunkt) werden gegen die Schlagrichtung gefaechert, Projektile ziehen eine Spur nach hinten
  cometGhosts(ctx, a, f) {
    if (a.kind === 'fire') return;                                   // Feuerflecken liegen still
    let h = this.hist.get(a);
    if (!h) { h = { list: [], t: -1 }; this.hist.set(a, h); }
    h.list.forEach((g, i) => {                                       // aelteste zuerst, je juenger desto deutlicher
      ctx.save();
      ctx.filter = (f ? f + ' ' : '') + 'opacity(' + (0.12 + 0.07 * i).toFixed(2) + ')';
      g.draw(ctx);
      ctx.restore();
    });
    const now = G.realTime;
    if (now - h.t >= 0.022) {                                        // aktuellen Zustand als Momentaufnahme merken (Kopie des Objekts samt Bewegung und Drehung)
      h.t = now; h.list.push(Object.assign(Object.create(Object.getPrototypeOf(a)), a)); if (h.list.length > 4) h.list.shift();
    }
  },
  // Funkeln / Blitze genau auf der Flaeche des Angriffs: zufaellige Punkte, die der Angriff wirklich trifft (hitsCircle), flackern jedes Bild neu
  attackSparks(ctx, a, it, t) {
    const P = STYLE.pal, pv = a.player, ox = pv ? pv.x : a.x, oy = pv ? pv.y : a.y;
    if (ox === undefined || typeof a.hitsCircle !== 'function' && !a.pts) return;
    const R = a.kind === 'beam' ? 150 : a.pts ? 0 : pv ? 110 : 16;
    let hits = 0;
    ctx.save();
    for (let i = 0; i < 8 && hits < 2; i++) {
      let x, y;
      if (a.pts && a.pts.length > 1) { const k = randInt(0, a.pts.length - 2), u = Math.random(); x = a.pts[k].x + (a.pts[k + 1].x - a.pts[k].x) * u; y = a.pts[k].y + (a.pts[k + 1].y - a.pts[k].y) * u; }
      else if (a.kind === 'beam') { const d = rand(14, R); x = ox + fwdX(pv.dir) * d; y = oy + fwdY(pv.dir) * d; }
      else { const ang = rand(0, 360), d = Math.sqrt(Math.random()) * R; x = ox + fwdX(ang) * d; y = oy + fwdY(ang) * d; if (!a.hitsCircle(x, y, 3)) continue; }
      hits++;
      const sx = Math.round(STAGE_W / 2 + x), sy = Math.round(STAGE_H / 2 - y);
      if (it.fx === 'sparkle') {
        const s = 2 + randInt(0, 2);
        ctx.fillStyle = it.color; ctx.fillRect(sx - s, sy - 1, s * 2 + 1, 2); ctx.fillRect(sx - 1, sy - s, 2, s * 2 + 1);
        ctx.fillStyle = P.white; ctx.fillRect(sx - 1, sy - 1, 2, 2);
      } else {
        ctx.fillStyle = P.white; ctx.globalAlpha = 0.95;
        let lx = sx, ly = sy;
        for (let k = 0; k < 3; k++) { const nx = lx + rand(-5, 5), ny = ly + rand(-5, 5); pxLine(ctx, lx, ly, nx, ny); lx = nx; ly = ny; }
      }
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // Vorschau der ECHTEN Angriffe im Menue (Glow-Tab): die ausgeruesteten Waffen des Spielers feuern in einer kleinen Sandbox
  // (eigene Listen statt G.attacks/G.enemies, Attrappen als Ziele, stumm, Partikel in die Vorschau-Liste). Die Klassen sind dieselben wie im Spiel.
  // ---------------------------------------------------------------------------------------------
  previewSpec(id, m) {
    const C = CFG, mk = (period, make, extra) => Object.assign({ period, make }, extra);
    const specs = {
      sword: () => mk(0.05, () => { const n = Math.min(3, Math.max(2, Loadout.sword.number)); return Array.from({ length: n }, (_, i) => new SwordSwing(m, (360 / n) * i)); }, { whenNone: ['sword'] }),
      lance: () => mk(0.9, () => Loadout.lance.offsets.map((o) => new LanceThrust(m, o, m.dir))),
      impulse: () => mk(1.4, () => [new ImpulseWave(m)]),
      shot: () => mk(0.45, () => [new Shot(m.x, m.y, 90)]),
      shotgun: () => mk(1.1, () => { const S = C.shotgun, out = []; for (let i = 0; i < S.pellets; i++) out.push(new Shot(m.x, m.y, 90 + (S.pellets === 1 ? 0 : -S.spread + (2 * S.spread * i) / (S.pellets - 1)), false, { speed: S.speed, frames: S.frames })); return out; }),
      bounce: () => mk(1.2, () => [new Shot(m.x, m.y, 90, true)]),
      whip: () => mk(0.9, () => [new ArcSlash(m, 90, C.whip)]),
      katana: () => mk(1.2, () => [new ArcSlash(m, 90, C.katana), new ArcSlash(m, 270, Object.assign({}, C.katana, { delay: C.katana.backDelay }))]),
      hammer: () => mk(1.5, () => [new GroundSlam(m, 90)]),
      boomerang: () => mk(0.3, () => [new Boomerang(m, 90)], { whenNone: ['shot'] }),
      molotov: () => mk(2.6, () => [new Molotov(m, 90)]),
      rocket: () => mk(1.7, () => [new Rocket(m, 90)]),
      beam: () => mk(2.2, () => { m.beam = { state: 'fire', clock: C.beam.maxClock }; return [new BeamAttack(m)]; }),
      grenade: () => mk(1.9, () => [new PlasmaGrenade(m)]),
      chain: () => mk(1.8, () => [new ChainLightning(m)]),
      blackhole: () => mk(3.4, () => [new BlackHole(m, m.dir)]),
      firetrail: () => mk(0.12, () => [new FirePatch(m.x - 14 - (Math.floor(G.realTime * 8) % 6) * 9, m.y + Math.sin(G.realTime * 8) * 3)]),
    };
    return specs[id] ? specs[id]() : null;
  },
  // Sandbox fuer eine Waffe aufbauen (id = Item-Id); w = Breite des Vorschaukastens
  previewInit(pv, id, w) {
    Loadout.reset();                                                  // saubere Startwerte der Waffen (im Menue noch nicht gesetzt bzw. vom letzten Lauf veraendert)
    Loadout.sword.number = 2; Loadout.lance.offsets = [0, 180];       // etwas mehr zu sehen: zwei Klingen, Stoss nach vorn und hinten
    const m = new Player();
    m.x = -w / 4 - 10; m.y = 0; m.dir = 90;
    pv.sbx = { id, mock: m, attacks: [], blasts: [], shots: [], last: -9, fail: false, spec: this.previewSpec(id, m), n: 0 };
    const tx = [0, 30, 56];
    pv.sbx.enemies = tx.map((dx, i) => ({ alive: true, x: m.x + 50 + dx, y: [0, 16, -16][i], radius: 10, hitsLeft: 2, maxHits: 2, stun: 0, mini: false, type: 'dummy', size: 250, isBoss: false, dir: 270, takeHit() {}, die() {} }));
    pv.sbx.home = pv.sbx.enemies.map((e) => [e.x, e.y]);
  },
  // Einen Schritt der Sandbox (dt Sekunden): Angriffe feuern lassen und aktualisieren, ohne das echte Spiel anzufassen
  previewStep(pv, it, dt, t, overObj) {            // overObj: Vorschau einer anderen Kategorie (z. B. { proj: item }), sonst gilt it als Glow-Item
    const S = pv.sbx;
    if (!S || S.fail || !S.spec) return;
    const sv = { attacks: G.attacks, blasts: G.blasts, shots: G.shots, enemies: G.enemies, spawners: G.spawners, obstacles: G.obstacles, player: G.player, boss: G.boss, bossShots: G.bossShots };
    const jp = Juice.particles, play = Sfx.play, over = this.over;
    try {
      G.attacks = S.attacks; G.blasts = S.blasts; G.shots = S.shots; G.enemies = S.enemies; G.spawners = []; G.obstacles = []; G.player = S.mock; G.boss = null; G.bossShots = [];
      Juice.particles = pv.list; Sfx.play = () => {}; this.over = overObj || { blade: it };
      Cos2.stepEchoes(dt);
      S.enemies.forEach((e, i) => { e.x = S.home[i][0]; e.y = S.home[i][1]; e.alive = true; });                // Ziele bleiben stehen
      const m = S.mock;
      if (S.id === 'beam' && m.beam && m.beam.state === 'fire') { m.beam.clock -= CFG.beam.decayPerSecond * dt; if (m.beam.clock < 0) m.beam.state = 'none'; }
      const sp = S.spec, busy = sp.whenNone ? G.attacks.some((a) => a.alive && sp.whenNone.includes(a.kind)) : false;
      if (!busy && t - S.last >= sp.period) { S.last = t; for (const a of sp.make()) G.attacks.push(a); }
      for (const a of G.attacks) a.update(dt);
      for (const b of G.blasts) b.update(dt);
      S.attacks = G.attacks.filter((a) => a.alive); S.blasts = G.blasts.filter((b) => b.alive);
    } catch (e) { S.fail = true; }
    finally {
      Object.assign(G, sv); Juice.particles = jp; Sfx.play = play; this.over = over;
    }
  },
  previewDraw(ctx, pv, it, t, overObj) {
    const S = pv.sbx;
    if (!S || S.fail) return;
    const over = this.over; this.over = overObj || { blade: it };
    try {
      for (const e of S.enemies) drawSprite(ctx, 'circle', e.x, e.y, 270, 230, { alpha: 0.55 });                // Ziele
      for (const b of S.blasts) b.draw(ctx);
      Cos2.drawEchoes(ctx);
      for (const a of S.attacks) this.drawAttack(ctx, a, overObj ? undefined : it);
    } catch (e) { S.fail = true; }
    this.over = over;
  },

  // Kleiner Akzent des Glow-Effekts an einer Waffe (Weltkoordinaten): comet = weicher Schein, sparkle = Funkelkreuze, volt = knisternde Linien
  weaponAccent(ctx, it, x, y, t) {
    const P = STYLE.pal, sx = STAGE_W / 2 + x, sy = STAGE_H / 2 - y, seed = Math.floor(t * 14);
    ctx.save();
    if (it.fx === 'comet') { ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t * 8); ctx.fillStyle = it.color; pxGlow(ctx, sx, sy, 13); }
    else if (it.fx === 'sparkle') {
      for (let i = 0; i < 2; i++) {
        const a = ((seed * 53 + i * 180) % 360) * DEG, r = 6 + ((seed + i * 5) % 9), px = Math.round(sx + Math.cos(a) * r), py = Math.round(sy + Math.sin(a) * r), s = 2 + (seed + i) % 2;
        ctx.fillStyle = it.color; ctx.fillRect(px - s, py - 1, s * 2 + 1, 2); ctx.fillRect(px - 1, py - s, 2, s * 2 + 1);
        ctx.fillStyle = P.white; ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    } else if (it.fx === 'volt') {
      ctx.fillStyle = P.white; ctx.globalAlpha = 0.9;
      for (let i = 0; i < 2; i++) {
        let a = ((seed * 41 + i * 170) % 360) * DEG, px = sx, py = sy;
        for (let k = 1; k <= 3; k++) { const j = (((seed * 7 + i * 3 + k) % 5) - 2) * 0.5, nx = sx + Math.cos(a + j) * k * 5, ny = sy + Math.sin(a + j) * k * 5; pxLine(ctx, px, py, nx, ny); px = nx; py = ny; }
      }
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // Gegner-Cosmetics (nur Optik): Farbe (filter) und Zusaetze (fx): googly, outline.
  // Schild-Gegner behalten ihre Farben (die Ruestungsart muss erkennbar bleiben).
  // ---------------------------------------------------------------------------------------------
  enemySprite(name, e) {
    const it = this.cur('enemy');
    return it && it.filter && !(e && (e.type === 'guard' || e.elite)) ? this.tinted(name, it.filter) : name;       // Schild-Gegner und Elites behalten ihre Farben (Erkennbarkeit), die Effekte (fx) gelten trotzdem
  },
  // e: { x, y, radius } (Gegner oder Vorschau-Attrappe), look = Punkt, auf den die Augen schauen
  drawEnemyFx(ctx, it, e, t, look) {
    if (!it || !it.fx) return;
    const P = STYLE.pal, r = e.radius, sx = Math.round(STAGE_W / 2 + e.x), sy = Math.round(STAGE_H / 2 - e.y);
    ctx.save();
    if (it.fx === 'googly') {
      const ang = look ? Math.atan2(-(look.y - e.y), look.x - e.x) : t, ex = r * 0.38, ey = r * 0.15, er = Math.max(2, r * 0.32);
      for (const s of [-1, 1]) {
        ctx.fillStyle = P.white; ctx.fillRect(Math.round(sx + s * ex - er), Math.round(sy - ey - er), er * 2, er * 2);
        ctx.fillStyle = P.ink; const p2 = Math.max(1, er * 0.5); ctx.fillRect(Math.round(sx + s * ex + Math.cos(ang) * er * 0.5 - p2 / 2), Math.round(sy - ey + Math.sin(ang) * er * 0.5 - p2 / 2), p2, p2);
      }
    } else if (it.fx === 'outline') {
      ctx.fillStyle = it.color; ctx.globalAlpha = 0.85; pxRing(ctx, sx, sy, r + 3, 1);
    } else if (it.fx === 'evil') {                                // glühende schräge Augen, blicken zum Ziel
      const ang = look ? Math.atan2(-(look.y - e.y), look.x - e.x) : t, ex = r * 0.4, er = Math.max(2, r * 0.3);
      ctx.fillStyle = P.ink; ctx.fillRect(Math.round(sx - r * 0.85), Math.round(sy - r * 0.4), Math.round(r * 1.7), Math.max(3, Math.round(r * 0.5)));
      ctx.fillStyle = P.yellow;
      for (const s of [-1, 1]) ctx.fillRect(Math.round(sx + s * ex - er / 2 + Math.cos(ang)), Math.round(sy - r * 0.25 + Math.sin(ang)), Math.round(er), Math.max(2, Math.round(er * 0.6)));
    } else if (it.fx === 'static') {
      this.staticArcs(ctx, sx, sy, r, t, e.x);
    } else if (it.fx === 'orbit') {
      this.orbitDots(ctx, sx, sy, r, t, it.color, 2);
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------------------------------------
  // Boss-Cosmetics (nur Optik): Farbe (filter) und Zusaetze (fx): glitch, shadow, infernal (Flammen)
  // ---------------------------------------------------------------------------------------------
  bossSprite(name, itOv) {
    const it = itOv || this.cur('boss');
    return it && it.filter ? this.tinted(name, it.filter) : name;
  },
  // Zeichnet den Boss (Sprite name) samt Zusaetzen. b: { x, y, radius }, size = Spritegroesse in %, opts wie drawSprite
  drawBoss(ctx, name, b, dir, size, opts, t, itOv) {
    const it = itOv || this.cur('boss'), P = STYLE.pal, sx = STAGE_W / 2 + b.x, sy = STAGE_H / 2 - b.y, r = b.radius, sp = this.bossSprite(name, it);
    if (it && it.fx === 'shadow') {                              // dunkler, pulsierender Schein hinter dem Boss
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = P.ink; pxGlow(ctx, sx, sy, r * 1.5);
      ctx.globalAlpha = 0.5; ctx.fillStyle = P.redMid; pxRing(ctx, sx, sy, r * (1.25 + 0.1 * Math.sin(t * 4)), 1); ctx.restore();
    }
    if (it && it.fx === 'glitch' && (t * 4) % 1 < 0.2) {
      const o = 3 + Math.floor((t * 30) % 3);
      drawSprite(ctx, sp, b.x - o, b.y, dir, size, Object.assign({}, opts, { hue: (opts.hue || 0) + 150, alpha: 0.5 }));
      drawSprite(ctx, sp, b.x + o, b.y - 1, dir, size, Object.assign({}, opts, { hue: (opts.hue || 0) - 120, alpha: 0.5 }));
    }
    drawSprite(ctx, sp, b.x, b.y, dir, size, opts);
    if (!it || !it.fx) return;
    ctx.save();
    if (it.fx === 'crown') {                                     // kleine spitze Krone, schwebt leicht über dem Kopf
      const w = Math.min(22, Math.max(13, r * 0.75)), h = w * 0.7, cx = Math.round(sx), by = Math.round(sy - r - 2 + Math.sin(t * 2) * 1.5);
      const pts = [[-w / 2, 0], [-w / 2, -h * 0.65], [-w / 4, -h * 0.35], [0, -h], [w / 4, -h * 0.35], [w / 2, -h * 0.65], [w / 2, 0]];
      const sp = pts.map((p) => [cx + p[0], by + p[1]]);
      ctx.fillStyle = P.ink; pxPolyFill(ctx, pts.map((p) => [cx + p[0] * 1.18, by + p[1] * 1.18 - 1]));        // dunkler Umriss: etwas größere Kopie dahinter
      ctx.fillStyle = P.yellow; pxPolyFill(ctx, sp);
      ctx.fillStyle = '#c9951a'; ctx.fillRect(Math.round(cx - w / 2), Math.round(by - h * 0.22), Math.round(w), Math.max(2, Math.round(h * 0.22)));
      ctx.fillStyle = P.red; ctx.fillRect(cx - 1, Math.round(by - h * 0.17), 3, 3);
      ctx.fillStyle = P.white; for (const p of [pts[1], pts[3], pts[5]]) ctx.fillRect(Math.round(cx + p[0]) - 1, Math.round(by + p[1]) - 1, 2, 2);
    } else if (it.fx === 'static') this.staticArcs(ctx, sx, sy, r, t, 0);
    else if (it.fx === 'orbit') this.orbitDots(ctx, sx, sy, r, t, it.color, 3);
    ctx.restore();
  },
  // Kleine Blitzbögen am Rand (static), flackern im Takt
  staticArcs(ctx, sx, sy, r, t, seed) {
    if ((t * 8 + seed) % 1 > 0.6) return;
    const n = Math.floor(t * 8 + seed);
    ctx.fillStyle = STYLE.pal.ice;
    for (let k = 0; k < 2; k++) {
      const a = (n * 2.4 + k * 3.1) % (Math.PI * 2);
      let x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r;
      const pts = [[x, y]];
      for (let i = 1; i <= 3; i++) { x += Math.cos(a) * 3 + Math.sin(n * 5 + i * 7 + k) * 3; y += Math.sin(a) * 3 + Math.cos(n * 3 + i * 5 + k) * 3; pts.push([x, y]); }
      pxPoly(ctx, pts, false, 1);
    }
  },
  // Kleine Kugeln, die umkreisen (orbit)
  orbitDots(ctx, sx, sy, r, t, color, n) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) { const a = t * 2.2 + i * Math.PI * 2 / n; pxFill(ctx, sx + Math.cos(a) * (r + 5) - 1, sy + Math.sin(a) * (r + 5) - 1, 2); }
  },
  // Flammen rund um den Boss (infernal)
  bossTick(list, b, dt, itOv) {
    const it = itOv || this.cur('boss');
    if (!it || it.fx !== 'infernal') return;
    this.bossT = (this.bossT || 0) - dt;
    if (this.bossT > 0) return;
    this.bossT = Juice.level === 2 ? 0.02 : 0.05;
    const a = rand(0, 360), r = b.radius * rand(0.7, 1.1);
    this.push(list, { x: b.x + fwdX(a) * r, y: b.y + fwdY(a) * r, vx: fwdX(a) * 0.3, vy: 1.1 + Math.random() * 0.6, life: 0.6, color: '#ff8a1f', size: 5, shape: 'flame' });
  },
};
