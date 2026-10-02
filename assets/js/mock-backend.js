/* SIMULIERTES Backend für den Prototyp.
   Bildet das spätere PHP-Backend nach: serverseitige Validierung, Partner-Sitzung, Idempotenz,
   dauerhafte Annahme vor Bestätigung, Übertragungswarteschlange und simulierte jur|nodes-API.

   Speicherung nur in sessionStorage dieses Browser-Tabs und ausschließlich für synthetische Testdaten.
   In der Produktion liegt all das serverseitig – der Browser speichert keine Falldaten. */

(function () {
  const KEY = "mt_demo_server_v1";
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (db) => { try { sessionStorage.setItem(KEY, JSON.stringify(db)); } catch { /* Demo */ } };
  const db = () => {
    const d = load();
    d.jobs ||= []; d.idem ||= {}; d.leads ||= []; d.contacts ||= 0; d.sim ||= {}; d.loginFails ||= {}; d.session ||= null;
    return d;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (status, userMessage) => Object.assign(new Error("HTTP " + status), { status, userMessage });

  /* Demo-Partner. Produktion: Datenbank, Code nur als Passwort-Hash (z. B. Argon2id), Verwaltung unter /intern. */
  const PARTNERS = [
    { id: "p-001", name: "Autohaus Musterfeld GmbH", ort: "Landshut", ansprechpartner: "Frau Beispiel", jnContactId: "DEMO-K-1001",
      demoCode: "MTV-7KQ4-X9MP-2RLA", kennung: "A123", email: "werkstatt@example.org", aktiv: true },
    { id: "p-002", name: "Kfz-Werkstatt Probst (gesperrt)", ort: "Ergolding", ansprechpartner: "Herr Test", jnContactId: "DEMO-K-1002",
      demoCode: "MTV-GESP-ERRT-0000", kennung: "B456", email: "info@example.org", aktiv: false },
  ];

  const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I
  const newRef = () => "MT-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
  const hash = async (obj) => {
    if (!crypto.subtle) return JSON.stringify(obj); // Fallback außerhalb sicherer Kontexte (nur Demo)
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(obj)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  /* ---------------- Partnerzugang ---------------- */
  async function partnerLogin(code) {
    await sleep(600 + Math.random() * 400); // konstante Mindestverzögerung gegen Timing/Brute-Force
    const d = db();
    const k = "global";
    const f = d.loginFails[k] || { n: 0, until: 0 };
    if (Date.now() < f.until) throw err(429, `Zu viele Fehlversuche. Bitte warten Sie ${Math.ceil((f.until - Date.now()) / 1000)} Sekunden.`);
    const p = PARTNERS.find((x) => x.demoCode === String(code || "").trim().toUpperCase());
    if (!p || !p.aktiv) {
      f.n++;
      if (f.n >= 5) { f.until = Date.now() + Math.min(2 ** (f.n - 5) * 30, 900) * 1000; } // abgestufte Sperre
      d.loginFails[k] = f; save(d);
      throw err(401, "Der Zugangscode ist ungültig oder der Zugang ist deaktiviert."); // keine Unterscheidung (kein Orakel)
    }
    d.loginFails[k] = { n: 0, until: 0 };
    d.session = { sid: newRef(), partnerId: p.id, exp: Date.now() + 30 * 60000 };
    save(d);
    return publicPartner(p);
  }
  const publicPartner = (p) => ({ name: p.name, ort: p.ort, ansprechpartner: p.ansprechpartner });
  function currentPartner() {
    const d = db();
    if (!d.session || d.session.exp < Date.now()) return null;
    const p = PARTNERS.find((x) => x.id === d.session.partnerId && x.aktiv);
    return p || null;
  }
  function partnerSession() { const p = currentPartner(); return p ? publicPartner(p) : null; }
  function partnerLogout() { const d = db(); d.session = null; save(d); }

  /* ---------------- Annahme ---------------- */
  async function submit(schemaKey, { requestId, data, files, honeypot }) {
    await sleep(700 + Math.random() * 500);
    const d = db();
    if (d.sim.saveFail) throw err(503, "Unser System ist gerade nicht erreichbar.");

    const schema = window.MT_SCHEMAS[schemaKey];
    let partner = null;
    if (schemaKey === "partner") {
      partner = currentPartner(); // Partner ausschließlich aus der Sitzung, nie aus dem Request
      if (!partner) throw err(401, "Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich erneut an.");
    }
    // Serverseitige Validierung mit demselben Schema
    const clean = window.MT_FORM_LOGIC.clean(schema, data);
    const errors = window.MT_FORM_LOGIC.validate(schema, clean);
    if (errors.length) throw err(422, "Einige Angaben sind unvollständig: " + errors.map((e) => e.msg).join(" "));
    const F = window.MT_CONFIG.formular;
    if (files.length > F.maxDateien || files.some((f) => f.size > F.maxDateiMB * 1048576 || !F.erlaubteTypen.includes(f.mime)))
      throw err(422, "Mindestens eine Datei ist unzulässig.");

    // Idempotenz: gleiche requestId → gleiche Antwort; abweichende Daten → ablehnen
    const h = await hash({ clean, files: files.map((f) => [f.name, f.size]) });
    const prev = d.idem[requestId];
    if (prev) {
      if (prev.hash !== h) throw err(409, "Diese Anfrage wurde bereits mit anderen Daten übermittelt.");
      return { ref: prev.ref, duplicate: true };
    }

    const job = {
      ref: newRef(),
      schema: schemaKey,
      quelle: schema.quelle,
      receivedAt: new Date().toISOString(),
      schemaVersion: "2026-10-01",
      datenschutzVersion: F.datenschutzVersion,
      partner: partner ? { id: partner.id, name: partner.name, jnContactId: partner.jnContactId } : null,
      spam: !!honeypot,
      data: clean,
      files: files.map((f) => ({ name: f.name, size: f.size, mime: f.mime, scan: "ok (simuliert)" })),
      status: honeypot ? "spam" : "pending",
      attempts: 0,
      log: [],
    };
    d.jobs.unshift(job);
    d.idem[requestId] = { hash: h, ref: job.ref };
    save(d); // Antrag + Übertragungsauftrag gemeinsam gespeichert → erst jetzt Bestätigung
    return { ref: job.ref };
  }

  /* ---------------- Simulierte jur|nodes-API ---------------- */
  function makeTransport(d, job) {
    let n = 0;
    return async (method, path, body) => {
      await sleep(150 + Math.random() * 200);
      n++;
      const s = d.sim;
      if (s.authFail) throw err(401);
      if (s.apiDown) throw err(503);
      if (s.invalid && path === "/lead") throw err(400);
      if (path === "/contact") return { identifier: "DEMO-K-" + (2000 + ++d.contacts) };
      if (path.startsWith("/lead/search")) {
        const q = decodeURIComponent(path.split("shortRubrum=")[1] || "").replace("%", "");
        return { elements: d.leads.filter((l) => l.shortRubrum.startsWith(q)) };
      }
      if (path === "/lead") {
        const lead = { identifier: "L-" + (26000 + d.leads.length + 1), status: "created", shortRubrum: body.model.shortRubrum, fileFolderId: 9000 + d.leads.length, broker: body.model.broker };
        d.leads.push(lead);
        if (s.timeoutLead && !job._timedOut) { job._timedOut = true; throw Object.assign(new Error("timeout"), { timeout: true }); } // Lead entsteht, Antwort geht verloren
        return lead;
      }
      if (path === "/file-system/add-file" && s.uploadFail && !job._uploadFailed) { job._uploadFailed = true; throw err(503); }
      if (path === "/lead-notes" && body.note.length > 200) throw err(400);
      return {};
    };
  }

  /** Hintergrundverarbeitung (Produktion: Cronjob mit Prozesssperre). */
  async function runWorker({ ignoreBackoff = false } = {}) {
    const d = db();
    const due = d.jobs.filter((j) => j.status === "pending" && (ignoreBackoff || !j.nextTry || j.nextTry <= new Date().toISOString()));
    for (const job of due) {
      const log = (m) => job.log.push(`${new Date().toLocaleTimeString("de-DE")} ${m}`);
      await window.MT_JURNODES.process(job, makeTransport(d, job), log);
      save(d);
    }
    return due.length;
  }

  function jobs() { return db().jobs; }
  function retry(ref) { const d = db(); const j = d.jobs.find((x) => x.ref === ref); if (j) { j.status = "pending"; j.nextTry = null; j.attempts = 0; save(d); } }
  function sim(patch) { const d = db(); if (patch) { d.sim = { ...d.sim, ...patch }; save(d); } return d.sim; }
  function reset() { sessionStorage.removeItem(KEY); }

  window.MT_BACKEND = { partnerLogin, partnerSession, partnerLogout, submit, runWorker, jobs, retry, sim, reset, PARTNERS };
})();
