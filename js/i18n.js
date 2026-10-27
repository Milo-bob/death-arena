// Sprachen (Settings > LANGUAGE): Englisch ist die Originalsprache im Code, Deutsch wird beim Zeichnen uebersetzt (uiText, uiWrap, wrapLines, uiFit rufen I18n.t).
// Eigennamen (Spiel, Waffen, Gegner, Bosse, Karten, Helden, Items, Abilities) bleiben englisch (I18n.protectFrom, siehe js/i18n_de3.js).
// Woerterbuch: I18n.add({ 'ENGLISCHER TEXT': 'DEUTSCHER TEXT' }). Zahlen in Texten sind mit # markiert und werden uebernommen
// ('PLAY # RUNS': 'SPIELE # RUNS'). I18n.phrases([...]) sind Bruchstuecke, die in zusammengesetzten Texten ersetzt werden (laengste zuerst, an Wortgrenzen).
// Lange Saetze (ab 14 Zeichen) aus dem Woerterbuch werden auch mitten in zusammengesetzten Texten gefunden.
// Neuer Text im Spiel = Eintrag in js/i18n_de*.js. Fehlt er, bleibt der englische Text stehen.
const I18n = {
  lang: 'en',
  D: Object.create(null),
  PH: [],
  tcache: new Map(),
  LK: null,
  cache: new Map(),
  NAME_SRC: [], names: null, nameSet: null, nameRe: new Map(),
  esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
  add(obj) { Object.assign(this.D, obj); this.LK = null; },
  phrases(list) {
    for (const [en, de] of list) {
      const a = /^[A-Za-z]/.test(en) ? '(?<![A-Za-z])' : '', b = /[A-Za-z]$/.test(en) ? '(?![A-Za-z])' : '';
      this.PH.push([en, de, new RegExp(a + this.esc(en) + b, 'g')]);
    }
    this.PH.sort((x, y) => y[0].length - x[0].length);
  },
  // Eigennamen (bleiben englisch): Quellen sind Funktionen, die Namen liefern; werden beim ersten Gebrauch einmal gesammelt
  protectFrom(fn) { this.NAME_SRC.push(fn); this.names = null; },
  buildNames() {
    const set = new Set();
    for (const fn of this.NAME_SRC) {
      try { for (const n of fn()) if (typeof n === 'string' && n.trim().length > 2) { set.add(n.trim()); set.add(n.trim().toUpperCase()); } } catch (e) { /* Quelle noch nicht geladen */ }
    }
    this.nameSet = set; this.names = [...set].sort((a, b) => b.length - a.length);
  },
  set(l) {
    this.lang = l === 'de' ? 'de' : 'en'; this.cache.clear();
    try { if (typeof Touch !== 'undefined') Touch.lastSize = ''; } catch (e) { /* egal */ }
    try { if (typeof document !== 'undefined') document.documentElement.lang = this.lang; } catch (e) { /* egal */ }
  },
  t(s) {
    if (this.lang === 'en' || typeof s !== 'string' || s.length < 2) return s;
    let r = this.cache.get(s);
    if (r !== undefined) return r;
    const nums = [], norm = s.replace(/\d+(?:\.\d+)?/g, (m) => { nums.push(m); return '#'; });
    const tpl = nums.length && this.D[s] === undefined ? this.tcache.get(norm) : undefined;           // Vorlage fuer Texte, die sich nur in den Zahlen unterscheiden (Zeiten, Zaehler)
    if (tpl !== undefined) { let i = 0; r = tpl.replace(/#/g, () => (nums[i++] !== undefined ? nums[i - 1] : '#')); }
    else r = this.tr(s, norm);
    if (this.cache.size > 6000) this.cache.clear();
    if (this.tcache.size > 3000) this.tcache.clear();
    this.cache.set(s, r);
    return r;
  },
  tr(s, norm0) {
    if (!/[A-Za-z]{2}/.test(s)) return s;
    if (this.D[s] !== undefined) return this.D[s];
    const nums = [];
    const norm = s.replace(/\d+(?:\.\d+)?/g, (m) => { nums.push(m); return '#'; });
    if (nums.length && this.D[norm] !== undefined) { let i = 0; return this.D[norm].replace(/#/g, () => (nums[i++] !== undefined ? nums[i - 1] : '#')); }
    if (!this.names) this.buildNames();
    if (this.nameSet.has(s.trim())) return s;
    // 1) Eigennamen und 2) lange Saetze aus dem Woerterbuch (auch mitten in zusammengesetzten Texten) werden durch Platzhalter ersetzt
    // (Platzhalter bestehen nur aus Buchstaben), 3) danach greifen Zahlen-Markierung und Bruchstuecke (PH) nur noch auf den uebrigen Text.
    const held = [], A = String.fromCharCode(1), B = String.fromCharCode(2);
    const tok = (v) => { held.push(v); let n = held.length - 1, code = ''; do { code = String.fromCharCode(97 + (n % 26)) + code; n = Math.floor(n / 26); } while (n > 0); return A + code + B; };
    let out = s;
    for (const n of this.names) {
      if (!out.includes(n)) continue;
      let re = this.nameRe.get(n);
      if (!re) { re = new RegExp('(?<![A-Za-z])' + this.esc(n) + '(?![A-Za-z])', 'g'); this.nameRe.set(n, re); }
      out = out.replace(re, (m) => tok(m));
    }
    if (!this.LK) this.LK = Object.keys(this.D).filter((k) => k.length >= 14 && !k.includes('#')).sort((x, y) => y.length - x.length);
    let usedLK = false;
    for (const k of this.LK) if (out.includes(k)) { out = out.split(k).join(tok(this.D[k])); usedLK = true; }
    const nums2 = [];
    out = out.replace(/\d+(?:\.\d+)?/g, (m) => { nums2.push(m); return '#'; });
    for (const [en, de, re] of this.PH) if (out.includes(en)) out = out.replace(re, de);
    const rx = new RegExp(A + '([a-z]+)' + B, 'g');
    const restore = (t) => { for (let guard = 0; guard < 4 && t.includes(A); guard++) t = t.replace(rx, (m, code) => { let n = 0; for (const ch of code) n = n * 26 + (ch.charCodeAt(0) - 97); return held[n]; }); return t; };
    if (nums2.length && !usedLK) this.tcache.set(norm, restore(out));        // Vorlage: gleiche Form mit anderen Zahlen braucht keine neue Suche
    if (nums2.length) { let i = 0; out = out.replace(/#/g, () => (nums2[i++] !== undefined ? nums2[i - 1] : '#')); }
    return restore(out);
  },
};
