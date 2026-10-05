// Spielstand übertragen (Settings > SAVE TRANSFER): ein HTML-Dialog über dem Spiel.
// Bewusst kein Canvas-Menü: Textfeld, Datei-Auswahl und Download brauchen echte Klicks des Nutzers,
// das klappt so auch in einem iframe (Holiday Games) und auf Tablets/Handys. Die Datenfunktionen stehen in save.js.

const SaveTransfer = {
  el: null,
  confirm: false,

  open() {
    if (this.el) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* egal */ }       // sonst bleibt der Dialog unsichtbar
    const P = STYLE.pal, mk = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css || ''; if (text) e.textContent = text; return e; };
    const font = 'font-family:"Pixelify Sans",monospace;';
    const root = mk('div', 'position:fixed;inset:0;background:rgba(5,6,15,.88);z-index:10;display:flex;align-items:center;justify-content:center;' + font);
    const box = mk('div', 'width:min(560px,92vw);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px;background:' + P.void + ';border:2px solid ' + P.cyan + ';color:' + P.ice + ';');
    const btn = (label, color) => mk('button', 'flex:1 1 140px;padding:10px 8px;margin:3px;cursor:pointer;background:' + P.voidLight + ';color:' + color + ';border:2px solid ' + color + ';font:inherit;font-size:15px;', label);
    box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:22px;margin-bottom:6px;', 'SAVE TRANSFER  (SLOT ' + (Save.slot + 1) + ')'));
    box.appendChild(mk('div', 'color:' + P.grey + ';font-size:13px;line-height:1.4;margin-bottom:8px;',
      'EXPORT: copy the code or download the file, then import it on another device. IMPORT: paste a code (or load a file) and press IMPORT. ' +
      'Importing REPLACES slot ' + (Save.slot + 1) + '. Volume, effects and keybinds of this device stay.'));
    const ta = mk('textarea', 'width:100%;height:110px;box-sizing:border-box;resize:vertical;background:' + P.ink + ';color:' + P.ice + ';border:2px solid ' + P.cyanDark + ';padding:6px;font:12px monospace;');
    ta.value = Save.exportCode(); ta.spellcheck = false;
    box.appendChild(ta);
    const msg = mk('div', 'min-height:20px;margin:6px 2px;font-size:14px;color:' + P.grey + ';');
    const say = (t, color) => { msg.textContent = t; msg.style.color = color || P.grey; };
    const row = mk('div', 'display:flex;flex-wrap:wrap;');
    const bCopy = btn('COPY CODE', P.cyan), bDown = btn('DOWNLOAD FILE', P.cyan), bFile = btn('LOAD FILE...', P.yellow), bImp = btn('IMPORT', P.orange), bClose = btn('CLOSE', P.grey);
    const fileIn = mk('input'); fileIn.type = 'file'; fileIn.accept = '.txt,.json,.deatharena,text/plain,application/json'; fileIn.style.display = 'none';

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
    bFile.onclick = () => fileIn.click();
    fileIn.onchange = () => {
      const f = fileIn.files && fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { ta.value = String(r.result).trim(); this.confirm = false; bImp.textContent = 'IMPORT'; say('FILE LOADED - PRESS IMPORT', P.teal); };
      r.onerror = () => say('FILE COULD NOT BE READ', P.red);
      r.readAsText(f);
      fileIn.value = '';
    };
    bImp.onclick = () => {
      if (!this.confirm) { this.confirm = true; bImp.textContent = 'SURE? REPLACES SLOT ' + (Save.slot + 1); say('PRESS AGAIN TO CONFIRM', P.orange); return; }
      this.confirm = false; bImp.textContent = 'IMPORT';
      const res = Save.importCode(ta.value);
      if (res.ok) { say('IMPORTED! SLOT ' + (Save.slot + 1) + ' IS NOW THE LOADED SAVE', P.teal); ta.value = Save.exportCode(); }
      else say(res.error, P.red);
    };
    ta.oninput = () => { this.confirm = false; bImp.textContent = 'IMPORT'; };
    bClose.onclick = () => this.close();

    [bCopy, bDown, bFile, bImp, bClose].forEach((b) => row.appendChild(b));
    box.appendChild(msg); box.appendChild(row); box.appendChild(fileIn);

    // Spieldaten (anonymes Protokoll fuers Balancing, siehe runstats.js): jeder kann sein Protokoll als Code weitergeben,
    // im Dev-Modus fuehrt MERGE die Codes anderer Spieler mit dem eigenen Protokoll zusammen (Statistik-Bildschirm).
    const dev = !!Save.data.dev;
    box.appendChild(mk('div', 'color:' + P.yellow + ';font-size:18px;margin:14px 0 4px;', 'PLAY DATA (ANONYMOUS)'));
    box.appendChild(mk('div', 'color:' + P.grey + ';font-size:13px;line-height:1.4;margin-bottom:6px;',
      'Your run log: how long you survived, what killed you, which boss fights you won, which gear you used. No names and no save content. ' +
      (dev ? 'Paste codes from other players and press MERGE to add them to your statistics.' : 'Send the code to the developer to help balance the game.')));
    const ta2 = mk('textarea', 'width:100%;height:70px;box-sizing:border-box;resize:vertical;background:' + P.ink + ';color:' + P.ice + ';border:2px solid ' + P.cyanDark + ';padding:6px;font:12px monospace;');
    ta2.value = Stats.exportData(); ta2.spellcheck = false;
    box.appendChild(ta2);
    const msg2 = mk('div', 'min-height:20px;margin:6px 2px;font-size:14px;color:' + P.grey + ';');
    const say2 = (t, color) => { msg2.textContent = t; msg2.style.color = color || P.grey; };
    const row2 = mk('div', 'display:flex;flex-wrap:wrap;');
    const bCopy2 = btn('COPY DATA', P.cyan), bDown2 = btn('DOWNLOAD DATA', P.cyan);
    bCopy2.onclick = () => {
      ta2.value = Stats.exportData(); ta2.focus(); ta2.select();
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta2.value).then(() => say2('DATA COPIED', P.teal), () => { document.execCommand('copy'); say2('DATA COPIED', P.teal); }); else { document.execCommand('copy'); say2('DATA COPIED', P.teal); } }
      catch (e) { say2('SELECT THE TEXT AND COPY IT BY HAND', P.yellow); }
    };
    bDown2.onclick = () => {
      try {
        const blob = new Blob([Stats.exportData()], { type: 'text/plain' }), a = mk('a'), d = new Date();
        a.href = URL.createObjectURL(blob); a.download = 'deatharena-playdata-' + d.toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        say2('FILE SAVED (CHECK YOUR DOWNLOADS)', P.teal);
      } catch (e) { say2('DOWNLOAD BLOCKED - USE COPY DATA', P.yellow); }
    };
    row2.appendChild(bCopy2); row2.appendChild(bDown2);
    if (dev) {
      const bFile2 = btn('LOAD FILE...', P.yellow), bMerge = btn('MERGE', P.orange), fileIn2 = mk('input');
      fileIn2.type = 'file'; fileIn2.accept = '.txt,.json,text/plain'; fileIn2.style.display = 'none';
      bFile2.onclick = () => fileIn2.click();
      fileIn2.onchange = () => {
        const f = fileIn2.files && fileIn2.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { ta2.value = String(r.result).trim(); say2('FILE LOADED - PRESS MERGE', P.teal); };
        r.onerror = () => say2('FILE COULD NOT BE READ', P.red);
        r.readAsText(f); fileIn2.value = '';
      };
      bMerge.onclick = () => {
        const res = Stats.mergeData(ta2.value);
        if (res.ok) { say2('MERGED: ' + res.deaths + ' RUNS, ' + res.bosses + ' BOSS FIGHTS ADDED', P.teal); ta2.value = Stats.exportData(); }
        else say2(res.error, P.red);
      };
      row2.appendChild(bFile2); row2.appendChild(bMerge); row2.appendChild(fileIn2);
    }
    box.appendChild(msg2); box.appendChild(row2);
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
