// Spielstand übertragen (Settings > SAVE TRANSFER): ein HTML-Dialog über dem Spiel.
// Bewusst kein Canvas-Menü: Textfeld, Datei-Auswahl und Download brauchen echte Klicks des Nutzers,
// das klappt so auch in einem iframe (Holiday Games) und auf Tablets/Handys. Die Datenfunktionen stehen in save.js.

const SaveTransfer = {
  el: null,
  confirm: false,

  open() {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }       // sonst bleibt der Dialog unsichtbar
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = I18n.t(text); return e; };
    const font = 'font-family:"Pixelify Sans",monospace;';
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;' + font);
    root.setAttribute('data-nogame', '1');                                  // Touches auf den Dialog zaehlen nicht als Spielklick (input.js)
    const box = mk('div', 'width:min(560px,92vw);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.cyan + ';color:' + P.ice + ';');
    const btn = (label, color) => mk('button', 'flex:1 1 140px;padding:10px 8px;margin:3px;cursor:pointer;background:' + P.voidLight + ';color:' + color + ';border:2px solid ' + color + ';font:inherit;font-size:15px;', label);
    // Datei-Knopf: der echte <input type=file> liegt unsichtbar ueber dem Knopf, der Klick trifft ihn direkt (ein per Skript ausgeloester Klick wird in manchen
    // eingebetteten Seiten/iframes stillschweigend geblockt). onLoad bekommt den Text der gewaehlten Datei, say meldet Fortschritt und Fehler.
    const fileBtn = (label, color, say, onLoad) => {
      const wrap = mk('div', 'position:relative;flex:1 1 140px;margin:3px;display:flex;'), b = btn(label, color), inp = mk('input', 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0;');
      b.style.margin = '0'; b.style.flex = '1 1 auto'; inp.type = 'file'; inp.title = I18n.t(label);
      const read = (f) => {
        if (!f) return;
        say('READING ' + f.name + ' ...', P.grey);
        const r = new FileReader();
        r.onload = () => onLoad(String(r.result).trim(), f.name);
        r.onerror = () => say('FILE COULD NOT BE READ', P.red);
        r.readAsText(f);
      };
      inp.onchange = () => { read(inp.files && inp.files[0]); inp.value = ''; };
      wrap.appendChild(b); wrap.appendChild(inp);
      return { wrap, read };
    };
    box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:22px;margin-bottom:6px;', 'SAVE TRANSFER  (SLOT ' + (Save.slot + 1) + ')'));
    box.appendChild(mk('div', 'color:' + P.grey + ';font-size:13px;line-height:1.4;margin-bottom:8px;',
      'EXPORT: copy the code or download the file, then import it on another device. IMPORT: paste a code (or load a file) and press IMPORT. ' +
      'Importing REPLACES slot ' + (Save.slot + 1) + ', but achievements are merged: nothing you unlocked here or in the code is lost. The code includes everything of the slot: progress, settings, keybinds and dev mode.'));
    const ta = mk('textarea', 'width:100%;height:110px;box-sizing:border-box;resize:vertical;background:' + P.ink + ';color:' + P.ice + ';border:2px solid ' + P.cyanDark + ';padding:6px;font:12px monospace;');
    ta.value = Save.exportCode(); ta.spellcheck = false;
    box.appendChild(ta);
    const msg = mk('div', 'min-height:20px;margin:6px 2px;font-size:14px;color:' + P.grey + ';');
    const say = (t, color) => { msg.textContent = I18n.t(t); msg.style.color = color || P.grey; };
    const row = mk('div', 'display:flex;flex-wrap:wrap;');
    const bCopy = btn('COPY CODE', P.cyan), bDown = btn('DOWNLOAD FILE', P.cyan), bImp = btn('IMPORT', P.orange), bClose = btn('CLOSE', P.grey);
    const F1 = fileBtn('LOAD FILE...', P.yellow, say, (text) => { ta.value = text; this.confirm = false; bImp.textContent = I18n.t('IMPORT'); say('FILE LOADED - PRESS IMPORT', P.teal); });
    ta.addEventListener('dragover', (e) => e.preventDefault());                                  // Datei direkt ins Textfeld ziehen geht auch
    ta.addEventListener('drop', (e) => { e.preventDefault(); F1.read(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });

    bCopy.onclick = () => {
      ta.value = Save.exportCode(); ta.focus(); ta.select();
      const done = () => say('CODE COPIED', P.teal);
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); }); return; } document.execCommand('copy'); done(); }
      catch (e) { say('SELECT THE TEXT AND COPY IT BY HAND', P.yellow); }
    };
    bDown.onclick = () => {
      try {
        const blob = new Blob([Save.exportCode()], { type: 'text/plain' }), a = mk('a'), d = new Date();
        a.href = URL.createObjectURL(blob); a.download = 'deatharena-slot' + (Save.slot + 1) + '-' + d.toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        say('FILE SAVED (CHECK YOUR DOWNLOADS)', P.teal);
      } catch (e) { say('DOWNLOAD BLOCKED - USE COPY CODE', P.yellow); }
    };
    bImp.onclick = () => {
      if (!this.confirm) { this.confirm = true; bImp.textContent = I18n.t('SURE? REPLACES SLOT ' + (Save.slot + 1)); say('PRESS AGAIN TO CONFIRM', P.orange); return; }
      this.confirm = false; bImp.textContent = I18n.t('IMPORT');
      const res = Save.importCode(ta.value);
      if (res.ok) { say('IMPORTED! SLOT ' + (Save.slot + 1) + ' IS NOW THE LOADED SAVE', P.teal); ta.value = Save.exportCode(); }
      else say(res.error, P.red);
    };
    ta.oninput = () => { this.confirm = false; bImp.textContent = I18n.t('IMPORT'); };
    bClose.onclick = () => this.close();

    [bCopy, bDown, F1.wrap, bImp, bClose].forEach((b) => row.appendChild(b));
    box.appendChild(msg); box.appendChild(row);

    root.appendChild(box);
    // Tasten im Dialog gehören dem Dialog, nicht dem Spiel (sonst steuert Tippen im Textfeld die Menüs)
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    root.addEventListener('wheel', (e) => e.stopPropagation());
    root.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
    document.body.appendChild(root);
    this.el = root; this.confirm = false;
    bCopy.focus();
  },

  close() {
    if (!this.el) return;
    this.el.remove(); this.el = null;
    Input.keys = {}; Input.pressedNow = {};
    window.focus();
  },
};
