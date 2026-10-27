// Anticheat, Client-Seite (Gegenstück: tools/supabase_anticheat.sql, dort steht auch das Prinzip).
//  - Beim Start eines Laufs (G.begin) / einer PvP-Runde (PvpMatch.begin) holt das Spiel ein TICKET vom Server (run_start, Serverzeit).
//  - Am Ende (G.settleRun / PvpMatch.tryReward) wird das Ergebnis gemeldet (run_end: Zeit, Kills, Bosse, Sieg). Der Server prüft es und führt Buch.
//  - Der Bericht wird zuerst in localStorage gespeichert und erst nach der Antwort des Servers gelöscht: kein Netz = später nachmelden (dann ohne Ticket, nur begrenzt).
//  - Vor jedem Hochladen eines Spielstands (Account.upload) wird alles Offene gemeldet (Anticheat.flush), damit das Ledger des Servers aktuell ist.
// Tutorial, Dev-Stände und Cheat-Läufe werden nie gemeldet. Ohne Konto oder ohne eingerichteten Server passiert nichts.

const Anticheat = {
  KEY: 'deatharena.ac.pending',
  tickets: { run: null, pvp: null },       // laufende Tickets { id, p (Promise), slot, kind, map, inf, coop }
  pending: [],                              // noch nicht gemeldete Berichte (werden in localStorage gespeichert)
  waits: new Map(),                         // Bericht -> Ticket, dessen Antwort noch aussteht
  busy: null, missing: false, flagged: false, lastError: '',

  get on() { return typeof Account !== 'undefined' && Account.configured && Account.on && !this.missing && !(Save.data && Save.data.dev); },

  load() { try { const raw = localStorage.getItem(this.KEY); this.pending = raw ? JSON.parse(raw).filter((e) => e && typeof e === 'object').slice(-20) : []; } catch (e) { this.pending = []; } },
  persist() { try { if (this.pending.length) localStorage.setItem(this.KEY, JSON.stringify(this.pending)); else localStorage.removeItem(this.KEY); } catch (e) { /* ignorieren */ } },

  async rpc(fn, args) {
    const r = await Account.rest('POST', '/rest/v1/rpc/' + fn, args);
    const m = String((r.json && (r.json.message || r.json.msg)) || '');
    if (!r.ok && (r.status === 404 || /could not find the function|schema cache/i.test(m))) this.missing = true;           // Server noch nicht eingerichtet: Anticheat ruht
    return r;
  },

  // Lauf/Runde beginnt: Ticket holen (im Hintergrund). kind = 'run' | 'pvp'. coop = Koop-Lauf bzw. bei PvP: mindestens ein anderer echter Spieler.
  start(kind, map, infinite, coop) {
    this.drop(kind);
    if (!this.on) return;
    const t = { id: null, slot: Save.slot, kind, map: String(map || ''), inf: !!infinite, coop: !!coop, p: null };
    t.p = this.rpc('run_start', { p_slot: t.slot, p_kind: kind, p_map: t.map, p_infinite: t.inf, p_coop: t.coop }).then((r) => { if (r.ok && typeof r.json === 'string') t.id = r.json; }).catch(() => {});
    this.tickets[kind] = t;
  },
  // Lauf ohne Meldung beenden (Tutorial, Cheat, zu kurz)
  drop(kind) { this.tickets[kind || 'run'] = null; },

  // Ergebnis: { kind, time, kills, bosses, win }. Wird sofort gespeichert und dann gemeldet.
  end(s) {
    const t = this.tickets[s.kind]; this.tickets[s.kind] = null;
    if (!this.on) return Promise.resolve();
    const e = { id: t ? t.id : null, slot: t ? t.slot : Save.slot, kind: s.kind, map: t ? t.map : '', inf: t ? t.inf : false, coop: t ? t.coop : false,
      time: Math.max(0, Math.round(s.time * 10) / 10), kills: Math.max(0, Math.floor(s.kills || 0)), bosses: Math.max(0, Math.floor(s.bosses || 0)), win: !!s.win, at: Date.now() };
    this.pending.push(e); if (t) this.waits.set(e, t);
    this.persist();
    return this.flush();
  },

  // Alles Offene melden. Mehrere gleichzeitige Aufrufe teilen sich denselben Lauf.
  flush() {
    if (!this.on) return Promise.resolve();
    if (this.busy) return this.busy;
    this.busy = (async () => {
      try {
        while (this.pending.length) {
          const e = this.pending[0], t = this.waits.get(e);
          if (t) { await t.p; e.id = t.id; this.waits.delete(e); }                     // Ticket noch unterwegs? Erst abwarten (kam keins an, wird ohne Ticket gemeldet)
          const r = await this.rpc('run_end', { p_run: e.id, p_slot: e.slot, p_kind: e.kind, p_map: e.map, p_infinite: e.inf, p_coop: e.coop, p_time: e.time, p_kills: e.kills, p_bosses: e.bosses, p_win: e.win });
          if (this.missing) { this.pending = []; this.persist(); return; }
          if (!r.ok) {
            if (r.offline || r.status === 0 || r.status >= 500 || r.status === 401) return;         // kein Netz / Serverproblem: bleibt liegen, naechstes Mal
            this.lastError = String((r.json && (r.json.message || r.json.msg)) || r.status);        // Server hat abgelehnt: nicht wiederholen
          } else if (r.json && r.json.ok === false) this.lastError = String(r.json.reason || '');
          else if (r.json && r.json.verified && e.kind === 'run' && typeof Social !== 'undefined' && Social.guild) Social.loadGuild();       // Gilden-Punkte kommen vom Server
          this.pending.shift(); this.persist();
        }
      } finally { this.busy = null; }
    })();
    return this.busy;
  },
};
Anticheat.load();
