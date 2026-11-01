// Ergebnisbild zum Teilen (Todes- und Siegbildschirm, Taste H / Knopf SHARE): zeichnet eine 1200 x 630 Karte mit Zeit, Held, Karte, Kills, Bossen und Link,
// teilt sie über das Teilen-Menü des Geräts (Handy) oder lädt sie als PNG herunter (Computer). Die Karte hat feste englische Texte (Bild für alle).
// Nutzt nur Daten des gerade beendeten Laufs (G.time, G.kills, G.bosses, G.mapIdx, Stats.summary) und die Farben aus STYLE.

const Share = {
  url: 'death-arena.holiday-games.com',
  busy: false,

  info() {
    const sm = (typeof Stats !== 'undefined' && Stats.summary) || null;
    const won = G.mode === 'ending' || (sm && sm.killer === 'VICTORY');
    const hero = CFG.heroes[Save.heroSelected()];
    const map = CFG.maps[G.mapIdx] || CFG.maps[0];
    return {
      won, time: G.time || 0, kills: G.kills || 0, bosses: G.bosses || 0,
      hero: hero ? hero.name : 'VANGUARD', map: map.name || 'NEON VOID', accent: map.frame || STYLE.pal.cyan,
      killer: sm && !won ? sm.killer : '', level: sm ? sm.level : 0, asc: G.asc | 0, best: !!G.newBest,
    };
  },

  // Karte zeichnen und das Canvas zurückgeben (auch für Tests ohne Browser-Teilen)
  render(info) {
    const P = STYLE.pal, W = 1200, H = 630, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), font = (px) => px + 'px "Pixelify Sans", monospace';
    const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, P.ink); bg.addColorStop(1, P.violetDark);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = P.grid; c.lineWidth = 2;                                               // Gitter wie im Spiel
    for (let x = 0; x <= W; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y <= H; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = 'rgba(5,6,15,0.6)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = info.accent; c.lineWidth = 8; c.strokeRect(24, 24, W - 48, H - 48);

    const text = (t, x, y, px, color, align) => { c.font = font(px); c.fillStyle = color; c.textAlign = align || 'left'; c.fillText(t, x, y); };
    text('DEATH ARENA EVOLUTION', 70, 100, 44, P.cyan);
    text(info.won ? 'VICTORY!' : 'RUN OVER', 70, 190, 78, info.won ? P.yellow : P.red);
    text(info.won ? 'I beat Death himself.' : info.killer ? 'Killed by ' + info.killer : 'How long can you survive?', 70, 240, 34, P.ice);
    text(formatTime(info.time), W - 70, 230, 150, P.ice, 'right');
    text('SURVIVED', W - 70, 110, 30, P.grey, 'right');
    if (info.best) text('NEW BEST TIME!', W - 70, 275, 34, P.yellow, 'right');

    const stats = [['HERO', info.hero], ['MAP', info.map], ['KILLS', String(info.kills)], ['BOSSES', String(info.bosses)]];
    if (info.asc > 0) stats.push(['ASCENSION', String(info.asc)]);
    const bw = (W - 140 - (stats.length - 1) * 20) / stats.length;
    stats.forEach(([k, v], i) => {
      const x = 70 + i * (bw + 20);
      c.fillStyle = 'rgba(14,20,48,0.9)'; c.fillRect(x, 340, bw, 150);
      c.strokeStyle = info.accent; c.lineWidth = 3; c.strokeRect(x, 340, bw, 150);
      text(k, x + bw / 2, 385, 28, P.grey, 'center');
      let px = 46;                                                                  // lange Namen passend verkleinern
      for (; px > 20; px -= 2) { c.font = font(px); if (c.measureText(v).width <= bw - 24) break; }
      text(v, x + bw / 2, 450, px, P.ice, 'center');
    });
    text('Can you beat that? Play free in your browser:', 70, 560, 30, P.grey);
    text(Share.url, 70, 600, 40, P.yellow);
    return cv;
  },

  // Teilen oder Herunterladen. Rückmeldung als Meldung oben (G.toast ohne Fehlerklang).
  async send() {
    if (this.busy) return;
    this.busy = true;
    const say = (t) => { G.toastText = t; G.toastAt = G.realTime; };
    try {
      const info = this.info(), cv = this.render(info);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (!blob) { say('SHARING FAILED'); return; }
      const name = 'deatharena-' + formatTime(info.time).replace(':', 'm') + 's.png';
      const file = new File([blob], name, { type: 'image/png' });
      const msg = { files: [file], title: 'Death Arena Evolution', text: (info.won ? 'I beat Death Arena Evolution' : 'I survived ' + formatTime(info.time) + ' in Death Arena Evolution') + ' - can you beat that? https://' + this.url };
      if (navigator.canShare && navigator.canShare(msg) && navigator.share) {
        try { await navigator.share(msg); return; } catch (e) { if (e && e.name === 'AbortError') return; }      // abgebrochen = fertig, sonst Download
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say('IMAGE SAVED - SHARE IT!');
    } catch (e) {
      say('SHARING FAILED');
    } finally {
      this.busy = false;
    }
  },
};
