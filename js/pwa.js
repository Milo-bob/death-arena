// App-Funktionen (PWA): Installieren, Offline-Bereitschaft, automatische Updates, Bildschirm wach halten.
// Die eigentliche Arbeit macht der Service Worker sw.js (erzeugt von tools/build_pwa.js): offline spielbar, online immer der Stand der Webseite.
// Installieren geht nur auf der Spiel-Adresse selbst. Eingebettet auf Holiday Games (iframe) kann der Browser keine App-Installation anbieten,
// deshalb oeffnet das Install-Symbol dort die Spielseite mit ?install=1 in einem neuen Tab (dort erscheint der Installieren-Dialog).

const PWA = {
  prompt: null, offlineReady: false, updating: false, updateAt: 0, hadController: false, wake: null, wakeBusy: false, el: null,

  get secure() { try { return location.protocol === 'https:' || location.hostname === 'localhost'; } catch (e) { return false; } },
  get embedded() { try { return window.parent !== window; } catch (e) { return true; } },
  get standalone() { try { return (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { return false; } },
  get ios() { try { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; } },
  get visible() { return this.secure && !this.standalone; },          // Install-Symbol im Hauptmenue: nicht in der installierten App selbst

  init() {
    if (!this.secure) return;
    try {
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.prompt = e; if (/[?&]install=1/.test(location.search) && !this.embedded) setTimeout(() => this.open(), 700); if (this.el && this.refresh) this.refresh(); });
      window.addEventListener('appinstalled', () => { this.prompt = null; if (this.el && this.refresh) this.refresh(); });
      if (!('serviceWorker' in navigator)) return;
      this.hadController = !!navigator.serviceWorker.controller;
      // Neue Version uebernimmt: die Seite laedt im Hauptmenue neu (tick), nie mitten im Lauf. Beim allerersten Installieren (kein Vorgaenger) kein Neuladen.
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (this.hadController) this.updating = true; this.hadController = true; });
      navigator.serviceWorker.register('sw.js').then((reg) => {
        const check = () => { try { reg.update(); } catch (e) { /* egal */ } };
        setInterval(check, 30 * 60 * 1000);                          // die App kann tagelang offen bleiben
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      }).catch(() => {});
      navigator.serviceWorker.ready.then(() => { this.offlineReady = true; if (this.el && this.refresh) this.refresh(); });
    } catch (e) { /* ohne App-Funktionen weiterspielen */ }
  },

  // Jedes Bild aus G.update: Update einspielen (im Hauptmenue) und Bildschirm im Lauf wach halten
  tick(mode) {
    if (this.updating && mode === 'start' && !this.updateAt) { try { Save.write(); } catch (e) { /* egal */ } this.updateAt = Date.now() + 1000; }
    if (this.updateAt && Date.now() > this.updateAt) { this.updateAt = Infinity; try { location.reload(); } catch (e) { /* egal */ } }
    try {
      if (!navigator.wakeLock) return;
      if (mode === 'play' && !this.wake && !this.wakeBusy) { this.wakeBusy = true; navigator.wakeLock.request('screen').then((l) => { this.wake = l; this.wakeBusy = false; l.addEventListener('release', () => { this.wake = null; }); }).catch(() => { this.wakeBusy = false; }); }
      else if (mode !== 'play' && this.wake) { this.wake.release(); this.wake = null; }
    } catch (e) { /* egal */ }
  },

  // ---- Dialog (HTML wie account.js) ----
  open() {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = I18n.t(text); return e; };
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;font-family:"Pixelify Sans",monospace;');
    root.setAttribute('data-nogame', '1');
    const box = mk('div', 'width:min(480px,92vw);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.green + ';color:' + P.ice + ';');
    // Install-Knopf unter dem Beschreibungskasten: App-Symbol + Text, was er tut (button oder Link, je nach Lage)
    const installBtn = (tag, label, sub) => {
      const b = mk(tag, 'display:flex;align-items:center;gap:14px;box-sizing:border-box;width:100%;text-align:left;text-decoration:none;padding:10px 14px;margin:10px 0 6px;cursor:pointer;background:' + P.voidLight + ';color:' + P.green + ';border:2px solid ' + P.green + ';font:inherit;');
      const im = mk('img', 'width:56px;height:56px;image-rendering:pixelated;flex:none;border:2px solid ' + P.green + ';'); im.src = 'icons/icon-192.png'; im.alt = '';
      const t = mk('div', 'flex:1;'); t.appendChild(mk('div', 'font-size:18px;color:' + P.ice + ';', label)); t.appendChild(mk('div', 'font-size:12px;color:' + P.grey + ';margin-top:3px;line-height:1.3;', sub));
      b.appendChild(im); b.appendChild(t);
      return b;
    };
    const render = () => {
      box.textContent = '';
      box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:22px;margin-bottom:8px;', 'DEATHARENA APP'));
      const info = mk('div', 'border:2px solid ' + P.cyanDark + ';background:' + P.ink + ';padding:10px 12px;');
      info.appendChild(mk('div', 'color:' + P.ice + ';font-size:14px;line-height:1.5;', 'Own icon and window, works fully offline and is always the same version as the website (it updates itself when you are online). Your saves and your account stay the same.'));
      info.appendChild(mk('div', 'font-size:14px;margin-top:8px;color:' + (this.offlineReady ? P.green : P.grey) + ';', this.offlineReady ? 'OFFLINE: READY' : 'OFFLINE: PREPARING... (OPEN THE GAME ONCE WHILE ONLINE)'));
      if (!this.embedded && !this.prompt) info.appendChild(mk('div', 'color:' + P.yellow + ';font-size:14px;line-height:1.6;margin-top:8px;', this.ios
        ? 'On iPhone / iPad: tap the SHARE button of Safari (square with an arrow), then "Add to Home Screen". Open the game from the new icon.'
        : 'Use your browser menu: "Install DeathArena" / "Install app" (Chrome, Edge) or "Add to Home Screen" (mobile). If nothing is offered, the app is probably installed already.'));
      box.appendChild(info);
      if (this.embedded) {
        const a = installBtn('a', 'INSTALL THE APP', 'Opens the game page in a new tab, where you can install it.'); a.href = location.origin + '/?install=1'; a.target = '_blank'; a.rel = 'noopener'; box.appendChild(a);
      } else if (this.prompt) {
        const b = installBtn('button', 'INSTALL THE APP', 'Adds DeathArena to your device as an app.');
        b.onclick = async () => { try { this.prompt.prompt(); await this.prompt.userChoice; } catch (e) { /* abgebrochen */ } this.prompt = null; this.close(); };
        box.appendChild(b);
      }
      const c = mk('button', 'display:block;box-sizing:border-box;width:100%;text-align:center;padding:10px 8px;margin:6px 0 0;cursor:pointer;background:' + P.voidLight + ';color:' + P.grey + ';border:2px solid ' + P.grey + ';font:inherit;font-size:15px;', 'CLOSE'); c.onclick = () => this.close(); box.appendChild(c);
    };
    this.refresh = render; render();
    root.appendChild(box);
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    root.addEventListener('wheel', (e) => e.stopPropagation());
    root.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
    document.body.appendChild(root);
    this.el = root;
  },
  close() {
    if (!this.el) return;
    this.el.remove(); this.el = null; this.refresh = null;
    Input.keys = {}; Input.pressedNow = {};
    window.focus();
  },
};
PWA.init();
