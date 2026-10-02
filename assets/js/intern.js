/* Kanzlei-Monitor: mit Backend (Anmeldung Passwort + Einmalcode, echte Eingänge) oder als Demo (Simulation). */
(function () {
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LABEL = { pending: ["pending", "Ausstehend"], done: ["done", "Übertragen"], failed: ["failed", "Fehlgeschlagen"], manual: ["manual", "Manuell klären"], spam: ["failed", "Spam verworfen"] };
  const fmtTime = (s) => new Date(s * 1000).toLocaleString("de-DE");
  const mount = document.getElementById("intern-mount");
  const btnSm = 'class="btn btn--ghost" style="min-height:34px;padding:5px 12px;font-size:.8rem"';

  /* ------------------------------------------------------------ echtes Backend */
  async function initApi(B) {
    const s = await B.admin.session();
    if (!s.admin) return renderLogin(B);
    renderList(B);
  }

  function renderLogin(B, msg = "") {
    mount.innerHTML = `<div class="form-card" style="max-width:520px">
      <h2 class="step-title">Anmeldung Kanzlei</h2>
      <p class="step-intro">Persönliches Konto mit Passwort und Einmalcode aus der Authenticator-App.</p>
      <form id="adm" novalidate>
        <div data-errsum>${msg ? `<div class="notice notice--error" role="alert">${MT_ICON("alert")}<p>${esc(msg)}</p></div>` : ""}</div>
        <div class="fields" style="margin-top:16px">
          <div class="field"><label for="a-mail">E-Mail</label><input type="email" id="a-mail" autocomplete="username" required></div>
          <div class="field"><label for="a-pw">Passwort</label><input type="password" id="a-pw" autocomplete="current-password" required></div>
          <div class="field" data-w="3"><label for="a-otp">Einmalcode</label><input type="text" id="a-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        </div>
        <div class="form-nav"><span></span><button class="btn btn--primary" type="submit">Anmelden</button></div>
      </form></div>`;
    mount.querySelector("#adm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button");
      b.disabled = true;
      try {
        await B.admin.login(mount.querySelector("#a-mail").value, mount.querySelector("#a-pw").value, mount.querySelector("#a-otp").value.trim());
        renderList(B);
      } catch (er) { renderLogin(B, er.userMessage || "Anmeldung fehlgeschlagen."); }
    });
    mount.querySelector("#a-mail").focus();
  }

  /** Rahmen mit Reitern „Eingänge“ / „Partnerbetriebe“; liefert den Inhaltsbereich. */
  function shell(B, active) {
    mount.innerHTML = `
      <div class="tabs" role="tablist" aria-label="Bereiche" style="align-items:center">
        <button role="tab" type="button" data-tab="eingaenge" aria-selected="${active === "eingaenge"}">Eingänge</button>
        <button role="tab" type="button" data-tab="partner" aria-selected="${active === "partner"}">Partnerbetriebe</button>
        <span style="margin-left:auto"><button ${btnSm} type="button" id="logout">Abmelden</button></span>
      </div>
      <div id="tab-body"></div>`;
    mount.querySelectorAll("[data-tab]").forEach((t) => (t.onclick = () => (t.dataset.tab === "partner" ? renderPartners(B) : renderList(B))));
    mount.querySelector("#logout").onclick = async () => { await B.admin.logout(); renderLogin(B); };
    return mount.querySelector("#tab-body");
  }

  const guard = (B) => (er) => { if (er.status === 401) renderLogin(B, "Sitzung abgelaufen – bitte erneut anmelden."); else throw er; };

  /* ------------------------------------------------------------ Partnerbetriebe */
  async function renderPartners(B, flash = "") {
    let data;
    try { data = await B.admin.partners(); } catch (er) { return guard(B)(er); }
    const body = shell(B, "partner");
    const fmt = (s) => (s ? new Date(s * 1000).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");
    body.innerHTML = `${flash}
      <div class="form-card" style="margin-bottom:32px">
        <h2 class="step-title" style="font-size:1.5rem">Neuen Partnerbetrieb anlegen</h2>
        <p class="step-intro" style="margin-bottom:20px">Das System vergibt eine Partnernummer und einen Zugangscode. Der Code wird nur einmal angezeigt – bitte sicher an den Betrieb übermitteln.</p>
        <form id="pf" novalidate>
          <div data-err></div>
          <div class="fields">
            <div class="field" data-w="4"><label for="p-name">Name des Betriebs</label><input type="text" id="p-name" name="name" maxlength="150" required></div>
            <div class="field" data-w="2"><label for="p-kennung">Partnernummer <span class="opt">(optional)</span></label><input type="text" id="p-kennung" name="kennung" maxlength="20" placeholder="${esc(data.next)}"></div>
            <div class="field" data-w="2"><label for="p-ort">Ort <span class="opt">(optional)</span></label><input type="text" id="p-ort" name="ort" maxlength="100"></div>
            <div class="field" data-w="2"><label for="p-ap">Ansprechpartner <span class="opt">(optional)</span></label><input type="text" id="p-ap" name="ansprechpartner" maxlength="150"></div>
            <div class="field" data-w="2"><label for="p-mail">E-Mail <span class="opt">(optional)</span></label><input type="email" id="p-mail" name="email" maxlength="150"></div>
          </div>
          <div class="form-nav"><span class="hint" style="margin:0">Ohne Eingabe wird die Nummer ${esc(data.next)} vergeben.</span><button class="btn btn--primary" type="submit">Anlegen und Code erzeugen</button></div>
        </form>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Nr.</th><th>Betrieb</th><th>Kontakt</th><th>Fälle</th><th>Letzte Anmeldung</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>
      ${data.items.length ? data.items.map((p) => `<tr>
          <td><strong>${esc(p.kennung || "–")}</strong></td>
          <td>${esc(p.name)}${p.ort ? `<br><small>${esc(p.ort)}</small>` : ""}</td>
          <td>${esc(p.ansprechpartner || "")}${p.email ? `<br><small><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></small>` : ""}</td>
          <td>${p.faelle}</td>
          <td>${fmt(p.last_login_at)}</td>
          <td><span class="status status--${p.active ? "done" : "failed"}">${p.active ? "Aktiv" : "Gesperrt"}</span></td>
          <td><div style="display:grid;gap:6px">
            <button ${btnSm} type="button" data-rotate="${p.id}" data-name="${esc(p.name)}">Neuen Code erzeugen</button>
            <button ${btnSm} type="button" data-active="${p.id}" data-to="${p.active ? 0 : 1}">${p.active ? "Sperren" : "Entsperren"}</button>
          </div></td></tr>`).join("") : '<tr><td colspan="7">Noch keine Partnerbetriebe angelegt.</td></tr>'}
      </tbody></table></div>`;

    const form = body.querySelector("#pf");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const r = await B.admin.partnerCreate(fd);
        renderPartners(B, codeBox(fd.name, r.kennung, r.code, "angelegt"));
      } catch (er) {
        if (er.status === 401) return guard(B)(er);
        btn.disabled = false;
        body.querySelector("[data-err]").innerHTML = `<div class="notice notice--error" role="alert" style="margin-bottom:16px">${MT_ICON("alert")}<p>${esc(er.userMessage)}</p></div>`;
      }
    });
    // Zweistufige Bestätigung ohne Browser-Dialoge
    const twoStep = (btn, label, run) => {
      btn.onclick = async () => {
        if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.dataset.orig = btn.textContent; btn.textContent = label; btn.classList.add("btn--primary"); setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; btn.classList.remove("btn--primary"); } }, 5000); return; }
        btn.disabled = true;
        try { await run(); } catch (er) { guard(B)(er); }
      };
    };
    body.querySelectorAll("[data-rotate]").forEach((b) => twoStep(b, "Wirklich? Alter Code wird ungültig", async () => {
      const r = await B.admin.partnerRotate(+b.dataset.rotate);
      renderPartners(B, codeBox(b.dataset.name, r.kennung, r.code, "erneuert"));
    }));
    body.querySelectorAll("[data-active]").forEach((b) => twoStep(b, b.dataset.to === "1" ? "Bestätigen: entsperren" : "Bestätigen: sperren", async () => {
      await B.admin.partnerActive(+b.dataset.active, b.dataset.to === "1");
      renderPartners(B);
    }));
    body.querySelector("[data-copy]")?.addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(body.querySelector("#code-text").textContent); e.target.textContent = "Kopiert ✓"; } catch { e.target.textContent = "Bitte manuell markieren"; }
    });
  }

  function codeBox(name, nummer, code, was) {
    const url = new URL(MT_HREF("partner/"), location.href).href;
    const text = `Ihr Zugang zum Partnerportal von MT | Verkehrsrecht\n\nBetrieb: ${name}\nPartnernummer: ${nummer}\nZugangscode: ${code}\n\nAnmeldung: ${url}`;
    return `<div class="notice notice--ok" role="status" style="margin-bottom:28px">${MT_ICON("key")}<div>
      <p><strong>Partner ${esc(name)} ${was}.</strong> Der Zugangscode wird nur jetzt angezeigt – bitte sicher übermitteln (z. B. telefonisch oder persönlich, nicht zusammen mit der Nummer in einer unverschlüsselten E-Mail).</p>
      <p style="font-size:1.05rem">Partnernummer <strong>${esc(nummer)}</strong> · Zugangscode <strong style="letter-spacing:.08em">${esc(code)}</strong></p>
      <pre id="code-text" style="white-space:pre-wrap;font-size:.8rem;background:var(--white);border:1px solid var(--grey-line);padding:12px;margin:0 0 10px">${esc(text)}</pre>
      <button ${btnSm} type="button" data-copy>Text kopieren</button></div></div>`;
  }

  async function renderList(B) {
    let data;
    try { data = await B.admin.list(); } catch (er) { return guard(B)(er); }
    const items = data.items;
    const counts = items.reduce((a, j) => ((a[j.status] = (a[j.status] || 0) + 1), a), {});
    const body = shell(B, "eingaenge");
    body.innerHTML = `
      <div class="btn-row" style="justify-content:space-between;margin-bottom:20px">
        <p style="margin:0">${items.length} Eingänge · <strong>${counts.manual || 0}</strong> manuell · <strong>${counts.failed || 0}</strong> fehlgeschlagen · ${counts.pending || 0} ausstehend</p>
        <div class="btn-row"><button ${btnSm} id="reload">Aktualisieren</button></div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Referenz</th><th>Eingang</th><th>Quelle</th><th>Status</th><th>Protokoll</th><th>Aktionen</th></tr></thead><tbody>
      ${items.length ? items.map((j) => {
        const [cls, txt] = LABEL[j.status] || ["pending", j.status];
        const files = j.files.map((f) => `<li><a href="${B.admin.fileUrl(f.public_id)}">${esc(f.name)}</a>${f.scan !== "clean" ? ` <small>(${esc(f.scan)})</small>` : ""}</li>`).join("");
        return `<tr><td><strong>${esc(j.ref)}</strong>${j.lead_id ? `<br><small>Lead ${esc(j.lead_id)}</small>` : ""}</td>
          <td>${fmtTime(j.received_at)}</td>
          <td>${esc(j.quelle)}${j.partner ? `<br><small>${esc(j.partner)}</small>` : ""}${files ? `<ul class="log" style="font-family:inherit">${files}</ul>` : ""}</td>
          <td><span class="status status--${cls}">${txt}</span>${+j.attempts ? `<br><small>Versuche: ${j.attempts}</small>` : ""}${j.next_try && j.status === "pending" ? `<br><small>nächster: ${new Date(j.next_try * 1000).toLocaleTimeString("de-DE")}</small>` : ""}</td>
          <td><ul class="log">${j.log.length ? j.log.map((l) => `<li>${esc(l)}</li>`).join("") : "<li>noch nicht verarbeitet</li>"}</ul></td>
          <td><div style="display:grid;gap:6px">
            ${j.purged_at ? "<small>Inhalte gemäß Löschregel entfernt</small>" : `<a ${btnSm} href="${B.admin.pdfUrl(j.ref)}">PDF</a>`}
            ${["failed", "manual", "pending"].includes(j.status) ? `<button ${btnSm} data-retry="${esc(j.ref)}">Erneut übertragen</button><button ${btnSm} data-resolve="${esc(j.ref)}">Als erledigt markieren</button>` : ""}
          </div></td></tr>`;
      }).join("") : '<tr><td colspan="6">Noch keine Eingänge.</td></tr>'}
      </tbody></table></div>`;
    mount.querySelector("#reload").onclick = () => renderList(B);
    mount.querySelectorAll("[data-retry]").forEach((b) => (b.onclick = async () => { await B.admin.retry(b.dataset.retry); renderList(B); }));
    mount.querySelectorAll("[data-resolve]").forEach((b) => (b.onclick = async () => { await B.admin.resolve(b.dataset.resolve); renderList(B); }));
  }

  /* ------------------------------------------------------------ Demo (Simulation) */
  function initMock(B) {
    const SIMS = [["apiDown", "API nicht erreichbar (503)"], ["timeoutLead", "Timeout nach Lead-Anlage"], ["uploadFail", "Dateiupload scheitert einmal"], ["invalid", "Ungültige Fachangaben (400)"], ["authFail", "Authentifizierung scheitert (401)"], ["saveFail", "Lokale Speicherung scheitert"]];
    mount.innerHTML = `
      <div class="notice notice--warn" style="margin-bottom:20px">${MT_ICON("info")}<p><strong>Demo-Modus:</strong> Kein Backend erreichbar – Eingänge und Übertragung werden im Browser simuliert.</p></div>
      <div class="form-card" style="margin-bottom:28px">
        <h2 style="font-size:1.1rem">Fehlerfälle simulieren</h2>
        <p class="hint">Gilt für die nächste Verarbeitung. Damit lassen sich die Abnahmekriterien aus Konzept §14 durchspielen.</p>
        <div class="toggle-row" id="sim"></div>
        <div class="btn-row"><button class="btn btn--primary" id="run">Hintergrundverarbeitung jetzt ausführen</button><button class="btn btn--ghost" id="reset">Demo-Daten löschen</button><span id="auto" class="hint" style="margin:0"></span></div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Referenz</th><th>Eingang</th><th>Quelle</th><th>Status</th><th>Übertragungsprotokoll</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
      <details style="margin-top:28px"><summary style="cursor:pointer;font-weight:600">Beispiel: Payloads, die der Adapter an jur|nodes senden würde (letzter Eingang)</summary><pre id="payload" style="white-space:pre-wrap;font-size:.78rem;background:var(--white);border:1px solid var(--line);padding:16px;border-radius:4px;overflow:auto"></pre></details>`;
    const simBox = mount.querySelector("#sim");
    const draw = () => {
      const s = B.sim();
      simBox.innerHTML = SIMS.map(([k, l]) => `<label><input type="checkbox" data-sim="${k}" ${s[k] ? "checked" : ""}> ${l}</label>`).join("");
      simBox.querySelectorAll("[data-sim]").forEach((c) => (c.onchange = () => B.sim({ [c.dataset.sim]: c.checked })));
      const jobs = B.jobs();
      mount.querySelector("#rows").innerHTML = jobs.length ? jobs.map((j) => {
        const [cls, txt] = LABEL[j.status] || ["pending", j.status];
        return `<tr><td><strong>${j.ref}</strong>${j.leadId ? `<br><small>Lead ${j.leadId}</small>` : ""}</td><td>${new Date(j.receivedAt).toLocaleString("de-DE")}</td>
          <td>${esc(j.quelle)}${j.partner ? `<br><small>${esc(j.partner.name)}</small>` : ""}<br><small>${j.files.length} Datei(en)</small></td>
          <td><span class="status status--${cls}">${txt}</span>${j.attempts ? `<br><small>Versuche: ${j.attempts}</small>` : ""}${j.nextTry && j.status === "pending" ? `<br><small>nächster: ${new Date(j.nextTry).toLocaleTimeString("de-DE")}</small>` : ""}</td>
          <td><ul class="log">${j.log.length ? j.log.map((l) => `<li>${esc(l)}</li>`).join("") : "<li>noch nicht verarbeitet</li>"}</ul></td>
          <td>${["failed", "manual"].includes(j.status) ? `<button ${btnSm} data-retry="${j.ref}">Erneut versuchen</button>` : ""}</td></tr>`;
      }).join("") : '<tr><td colspan="6">Noch keine Eingänge. Senden Sie zuerst ein Formular mit Testdaten ab.</td></tr>';
      mount.querySelectorAll("[data-retry]").forEach((b) => (b.onclick = () => { B.retry(b.dataset.retry); draw(); }));
      const last = jobs[0];
      mount.querySelector("#payload").textContent = last ? JSON.stringify({
        "POST /contact": MT_JURNODES.buildContact(last.data),
        "POST /lead": MT_JURNODES.buildLead(last.data, last),
        "POST /lead-notes": { leadIdentifier: last.leadId || "<aus /lead>", note: MT_JURNODES.buildNote(last.data, last) },
      }, null, 2) : "–";
    };
    mount.querySelector("#run").onclick = async () => { await B.runWorker({ ignoreBackoff: true }); draw(); };
    mount.querySelector("#reset").onclick = () => { B.reset(); draw(); };
    draw();
    let n = 10;
    const auto = mount.querySelector("#auto");
    setInterval(async () => { n--; auto.textContent = "Automatischer Lauf (Cron-Simulation) in " + n + " s"; if (n <= 0) { n = 10; await B.runWorker(); draw(); } }, 1000);
  }

  window.MT_BACKEND_READY.then((B) => (B.mode === "api" ? initApi(B) : initMock(B)));
})();
