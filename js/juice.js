// "Juice": dezente visuelle Effekte, damit Treffer, Tempo und grosse Momente besser ankommen.
//   Zoom-Puls (Dash), Wackeln, Impact-Frames (Mini-Stopp), Funken, Nachbilder, Bildschirmblitze.
// Schutz vor Uebertreibung: alle Staerken sind klein, Blitze sind gedeckelt und haben eine Mindestpause (kein Flackern),
// und im Menue Settings > Effects laesst sich alles auf REDUCED (halb, ohne Blitze/Wackeln) oder OFF stellen (Save.data.fx: 0/1/2).
// Zahlen: CFG.juice in config.js.

const Juice = {
  zoom: 1, zoomTarget: 1, zoomT: 0,       // aktueller Zoom, Ziel, Restzeit des Pulses
  shakeAmt: 0, shakeTime: 0,              // Wackelstaerke (Bildeinheiten), Laufzeit fuer die Schwingung
  hs: 0,                                  // Rest des Impact-Frames (Welt steht still)
  flashCd: 0,                             // Mindestpause zwischen zwei normalen Blitzen
  particles: [], ghosts: [], ghostT: 0,

  // 0 = aus, 1 = reduziert, 2 = voll
  force: undefined,                                              // Cosmetics-Vorschau: zeigt Effekte immer voll, egal was in den Einstellungen steht
  get level() { if (this.force !== undefined) return this.force; const v = Save.data.fx; return v === undefined ? 2 : v; },
  get scale() { return [0, 0.5, 1][this.level]; },

  reset() { this.zoom = 1; this.zoomTarget = 1; this.zoomT = 0; this.shakeAmt = 0; this.hs = 0; this.flashCd = 0; this.particles = []; this.ghosts = []; },

  // Zoom-Puls: Zoom geht auf z (kleiner = rauszoomen), haelt dur Sekunden, kehrt dann sanft zurueck. Abgeschwaecht durch die Effekt-Stufe.
  zoomPulse(z, dur) {
    if (this.scale === 0) return;
    this.zoomTarget = 1 + (z - 1) * this.scale;
    this.zoomT = dur;
  },
  // Wackeln: nimmt zu, wenn es gerade staerker ist, klingt von allein ab
  shake(amt) {
    if (this.level < 2) return;
    this.shakeAmt = Math.min(CFG.juice.maxShake, Math.max(this.shakeAmt, amt));
  },
  // Impact-Frame: die Welt steht sec Sekunden still (nur bei Reduced halb so lang)
  hitStop(sec) { this.hs = Math.max(this.hs, sec * this.scale); },
  // Bildschirmblitz. force = auch waehrend der Mindestpause (seltene, bewusste Momente wie Revival Core)
  flash(color, alpha, dur, force) {
    if (this.level < 2 && !force) return;
    if (this.scale === 0) return;
    if (this.flashCd > 0 && !force) return;
    alpha = Math.min(alpha, force ? 0.5 : CFG.juice.maxFlash) * (this.level === 2 ? 1 : 0.5);
    if (G.flashT > 0 && G.flashAlpha * G.flashT / G.flashMax > alpha) return;      // nicht ueber einen staerkeren Blitz drueber
    G.flashT = G.flashMax = dur; G.flashColor = color; G.flashAlpha = alpha;
    this.flashCd = CFG.juice.flashGap;
  },
  // Funken: n kleine Pixel fliegen von (x, y) weg
  sparks(x, y, color, n, speed = 3) {
    if (this.scale === 0) return;
    n = Math.round(n * (this.level === 2 ? 1 : 0.5));
    for (let i = 0; i < n && this.particles.length < CFG.juice.maxParticles; i++) {
      const a = rand(0, 360), v = rand(speed * 0.5, speed);
      this.particles.push({ x, y, vx: fwdX(a) * v, vy: fwdY(a) * v, life: rand(0.25, 0.45), t: 0, color, size: Math.random() < 0.3 ? 3 : 2 });
    }
  },
  // Nachbild des Spielers (Dash, Boost)
  ghost(p, life = 0.22) {
    if (this.scale === 0 || this.ghostT > 0) return;
    this.ghostT = 0.03;
    this.ghosts.push({ x: p.x, y: p.y, dir: p.dir, t: 0, life });
    if (this.ghosts.length > 8) this.ghosts.shift();
  },

  update(dt) {
    this.flashCd = Math.max(0, this.flashCd - dt);
    this.ghostT = Math.max(0, this.ghostT - dt);
    this.shakeTime += dt;
    this.shakeAmt *= Math.exp(-CFG.juice.shakeDecay * dt);
    if (this.shakeAmt < 0.05) this.shakeAmt = 0;
    if (this.zoomT > 0) { this.zoomT -= dt; this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, 14 * dt); }
    else this.zoom += (1 - this.zoom) * Math.min(1, 5 * dt);
    if (Math.abs(this.zoom - 1) < 0.001) this.zoom = 1;
    this.particles = Cos.stepParticles(this.particles, dt);
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < g.life);
  },

  // Wackel-Versatz fuer dieses Bild (sanfte Schwingung statt Zufallszittern)
  get offset() {
    if (!this.shakeAmt) return [0, 0];
    return [Math.sin(this.shakeTime * 47) * this.shakeAmt, Math.cos(this.shakeTime * 39) * this.shakeAmt];
  },
  // Wie viel Bildrand zusaetzlich gezeichnet werden muss (beim Rauszoomen und Wackeln wird mehr Welt sichtbar)
  get margin() {
    const z = this.zoom;
    return [(STAGE_W / 2) * (1 / z - 1) + this.shakeAmt + 4, (STAGE_H / 2) * (1 / z - 1) + this.shakeAmt + 4].map((v) => Math.max(4, v));
  },

  // Transformation um die Bildmitte (vor der Welt anwenden, danach ctx.restore())
  begin(ctx) {
    ctx.save();
    const [ox, oy] = this.offset;
    ctx.translate(STAGE_W / 2 + ox, STAGE_H / 2 + oy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-STAGE_W / 2, -STAGE_H / 2);
  },

  // Nachbilder und Funken (in Weltkoordinaten, innerhalb der Kamera-Verschiebung)
  drawWorld(ctx) {
    for (const g of this.ghosts) drawSprite(ctx, Cos.player(), g.x, g.y, g.dir, CFG.player.size, { alpha: 0.4 * (1 - g.t / g.life) });
    for (const q of this.particles) {
      if (q.shape) { Cos.drawParticle(ctx, q); continue; }
      ctx.globalAlpha = 1 - q.t / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(STAGE_W / 2 + q.x - q.size / 2), Math.round(STAGE_H / 2 - q.y - q.size / 2), q.size, q.size);
    }
    ctx.globalAlpha = 1;
  },
};
