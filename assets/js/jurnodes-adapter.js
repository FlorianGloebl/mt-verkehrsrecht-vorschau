/* jur|nodes-Adapter – Referenzimplementierung auf Basis von show-api-spec.json (jur|nodes API 1.0.1).
   Läuft im Prototyp gegen einen SIMULIERTEN Transport. In der Produktion wird diese Logik
   serverseitig (PHP) umgesetzt; API-Zugangsdaten verlassen niemals den Server.

   Ablauf je Eingang (jeder Schritt wird einzeln protokolliert und bei Wiederholung übersprungen):
     1. POST /contact                → Anspruchsteller als Kontakt (Person oder Company)
     2. POST /lead                   → Lead mit shortRubrum = "<Referenz> <Name>" (Abgleich-Schlüssel)
     3. POST /lead-contact           → Kontakt mit Lead verknüpfen
     4. POST /lead-contact           → (Partnerfall) hinterlegten Partnerkontakt verknüpfen
     5. POST /lead-notes             → Kurznotiz (max. 200 Zeichen laut Spezifikation)
     6. POST /file-system/add-file   → ausgefülltes Formular-PDF in Lead-Ordner (fileFolderId)
     7. POST /file-system/add-file   → je hochgeladener Datei

   Unfallgegner, Zeugen und Fahrzeugdaten werden bewusst NICHT als jur|nodes-Kontakte angelegt,
   sondern im Formular-PDF übergeben (keine ungeprüfte Kontaktanlage Dritter, Konzept §9.4). */

(function () {
  /* Konfiguration – Werte aus der jur|nodes-Installation der Kanzlei. OFFEN, solange null. */
  const JN_CONFIG = {
    datapool: null,          // OFFEN: exakter Datenpool-Name (GET /config/datapools)
    lawCategory: null,       // OFFEN: Rechtsgebiet-ID Verkehrsrecht (GET /config/law-category)
    defaultGender: "neutral",// OFFEN: Umgang mit fehlender Anrede (gender ist Pflicht bei Person)
    addressSubject: "Privat",
    country: "Deutschland",
    maxAttempts: 6,
    backoffSeconds: [30, 120, 600, 1800, 3600],
  };

  /* Erlaubte Zeichen laut API-Beschreibung: 0-9 / $ % § € ! | ? , ' ( ) . ; + : _ - @ & a-Z [ ]
     Umlaute/ß und Leerzeichen sind lt. Notiz-Beschreibung zulässig. Alles andere wird ersetzt. */
  const sanitize = (s, { newlines = false, max } = {}) => {
    if (s == null) return "";
    let out = String(s)
      .replace(/[„“”"«»]/g, "'").replace(/[‚‘’`´]/g, "'")
      .replace(/[–—]/g, "-").replace(/#/g, "Nr.").replace(/\*/g, "")
      .replace(/\r\n?/g, "\n");
    out = out.replace(newlines ? /[^0-9A-Za-zÄÖÜäöüß\/$%§€!|?,'().;+:_\-@&\[\] \n]/g : /[^0-9A-Za-zÄÖÜäöüß\/$%§€!|?,'().;+:_\-@&\[\] ]/g, " ");
    if (!newlines) out = out.replace(/\n/g, " ");
    out = out.replace(/[ \t]{2,}/g, " ").trim();
    return max ? out.slice(0, max) : out;
  };

  const GENDER = { frau: "female", herr: "male", divers: "diverse", keine: null };
  const SALUTATION = { frau: "Frau", herr: "Herr" };

  /** Kontakt-Payload für POST /contact aus dem internen Modell. */
  function buildContact(d) {
    const isCompany = d.melder_typ === "unternehmen";
    const contacts = [];
    if (d.mandant_telefon) contacts.push({ id: -1, contactType: "phone", subject: JN_CONFIG.addressSubject, value: sanitize(d.mandant_telefon, { max: 70 }) });
    if (d.mandant_email) contacts.push({ id: -1, contactType: "mail", subject: JN_CONFIG.addressSubject, value: String(d.mandant_email).slice(0, 70) });

    const address = { id: -1, subject: isCompany ? "Geschäftlich" : JN_CONFIG.addressSubject, contacts };
    if (d.mandant_strasse && d.mandant_strasse.length >= 3) address.street = sanitize(d.mandant_strasse, { max: 100 });
    if (d.mandant_plz) address.postcode = sanitize(d.mandant_plz, { max: 20 });
    if (d.mandant_ort && d.mandant_ort.length >= 3) address.city = sanitize(d.mandant_ort, { max: 70 });
    address.country = JN_CONFIG.country;

    const model = isCompany
      ? { identifier: null, contactType: "Company", lastName: sanitize(d.firma_name, { max: 150 }),
          entitledToDeductPreTax: d.mandant_vorsteuer === "ja" ? true : d.mandant_vorsteuer === "nein" ? false : undefined }
      : { identifier: null, contactType: "Person",
          firstName: sanitize(d.mandant_vorname, { max: 70 }) || undefined,
          lastName: sanitize(d.mandant_nachname, { max: 150 }),
          gender: GENDER[d.mandant_anrede] || JN_CONFIG.defaultGender,
          salutation: SALUTATION[d.mandant_anrede] };
    model.addresses = [address];
    return { model: JSON.parse(JSON.stringify(model)) };
  }

  /** Lead-Payload für POST /lead. shortRubrum enthält die Referenz → ermöglicht Abgleich per GET /lead/search. */
  function buildLead(d, job) {
    const who = d.melder_typ === "unternehmen" ? d.firma_name : [d.mandant_nachname, d.mandant_vorname].filter(Boolean).join(", ");
    const model = {
      leadDate: job.receivedAt.slice(0, 10),
      shortRubrum: sanitize(`${job.ref} ${who}`, { max: 50 }),
      broker: sanitize(job.partner ? job.partner.name : "Website", { max: 50 }),
    };
    if (JN_CONFIG.datapool) model.datapool = JN_CONFIG.datapool;
    if (JN_CONFIG.lawCategory != null) model.lawCategory = JN_CONFIG.lawCategory;
    return { model };
  }

  function buildNote(d, job) {
    const parts = [
      `Online-Fallaufnahme ${job.ref}`,
      job.partner ? `über Partner ${job.partner.name}${d.partner_referenz ? " (Ref. " + d.partner_referenz + ")" : ""}` : "über Website",
      d.unfall_datum ? `Unfall ${d.unfall_datum.split("-").reverse().join(".")}` : null,
      `${job.files.length} Anlage(n). Details im Formular-PDF.`,
    ].filter(Boolean);
    return sanitize(parts.join(" · ").replace(/·/g, "|"), { newlines: true, max: 200 });
  }

  /** Fehlerklassifizierung nach Konzept §9.4 */
  function classify(err) {
    if (err.timeout) return "timeout";          // Ergebnis unklar → Abgleich
    if (err.status === 401) return "auth";       // stoppen, intern melden
    if (err.status === 400 || err.status === 405) return "invalid"; // manuell klären
    if (err.status === 429 || err.status >= 500 || err.network) return "transient"; // später erneut
    return "invalid";
  }

  /** Verarbeitet einen Auftrag; setzt bei Wiederholung am ersten offenen Schritt fort. */
  async function process(job, transport, log) {
    const d = job.data;
    const st = (job.steps = job.steps || {});
    const run = async (key, label, fn) => {
      if (st[key] && st[key].ok) return st[key].result;
      log(`→ ${label}`);
      const result = await fn();
      st[key] = { ok: true, result, at: new Date().toISOString() };
      log(`✓ ${label}`);
      return result;
    };

    try {
      // Schritt 2 vorziehen? Nein: Kontakt zuerst, damit kein Lead ohne Beteiligten entsteht.
      const contact = await run("contact", "POST /contact", () => transport("POST", "/contact", buildContact(d)));

      // Abgleich nach unklarem Timeout bei der Lead-Anlage (keine blinde Zweitanlage)
      if (job.leadUncertain && !(st.lead && st.lead.ok)) {
        log("→ GET /lead/search (Abgleich nach Timeout)");
        const found = await transport("GET", `/lead/search?shortRubrum=${encodeURIComponent(job.ref + "%")}`);
        const hit = (found.elements || []).find((l) => (l.shortRubrum || "").startsWith(job.ref));
        if (hit) { st.lead = { ok: true, result: hit, at: new Date().toISOString() }; log(`✓ Lead ${hit.identifier} bereits vorhanden – übernommen`); }
        job.leadUncertain = false;
      }

      let lead;
      try {
        lead = await run("lead", "POST /lead", () => transport("POST", "/lead", buildLead(d, job)));
      } catch (e) {
        if (e.timeout) job.leadUncertain = true;
        throw e;
      }

      await run("leadContact", "POST /lead-contact (Anspruchsteller)", () =>
        transport("POST", "/lead-contact", { leadIdentifier: lead.identifier, contactIdentifier: contact.identifier }));

      if (job.partner && job.partner.jnContactId) {
        await run("partnerContact", "POST /lead-contact (Partnerbetrieb)", () =>
          transport("POST", "/lead-contact", { leadIdentifier: lead.identifier, contactIdentifier: job.partner.jnContactId }));
      }

      await run("note", "POST /lead-notes", () => transport("POST", "/lead-notes", { leadIdentifier: lead.identifier, note: buildNote(d, job) }));

      await run("pdf", "POST /file-system/add-file (Formular-PDF)", () =>
        transport("POST", "/file-system/add-file", { _headers: { folderId: lead.fileFolderId, autoRenameIfExist: true }, file: `${job.ref}_Fallaufnahme.pdf` }));

      for (const [i, f] of job.files.entries()) {
        await run(`file${i}`, `POST /file-system/add-file (${f.name})`, () =>
          transport("POST", "/file-system/add-file", { _headers: { folderId: lead.fileFolderId, autoRenameIfExist: true }, file: f.name }));
      }

      job.status = "done";
      job.leadId = lead.identifier;
      job.error = null;
      log(`■ Vollständig übertragen · Lead ${lead.identifier}`);
    } catch (err) {
      const kind = classify(err);
      job.attempts = (job.attempts || 0) + 1;
      job.error = { kind, status: err.status || null, at: new Date().toISOString() }; // keine API-Antwort-Inhalte loggen
      if (kind === "transient" || kind === "timeout") {
        if (job.attempts >= JN_CONFIG.maxAttempts) { job.status = "failed"; log(`✕ ${kind} – max. Versuche erreicht, manuelle Klärung`); }
        else {
          const wait = JN_CONFIG.backoffSeconds[Math.min(job.attempts - 1, JN_CONFIG.backoffSeconds.length - 1)];
          job.status = "pending";
          job.nextTry = new Date(Date.now() + wait * 1000).toISOString();
          log(`… ${kind === "timeout" ? "Timeout (Ergebnis unklar)" : "Temporärer Fehler"} – erneuter Versuch in ${wait}s`);
        }
      } else if (kind === "auth") {
        job.status = "failed"; log("✕ Authentifizierung fehlgeschlagen – Übertragung gestoppt, Kanzlei-IT informieren");
      } else {
        job.status = "manual"; log(`✕ Ungültige Fachangaben (HTTP ${err.status}) – zur manuellen Klärung markiert`);
      }
    }
    return job;
  }

  window.MT_JURNODES = { JN_CONFIG, sanitize, buildContact, buildLead, buildNote, classify, process };
})();
