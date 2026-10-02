/* Schemagesteuerte Formular-Engine für die digitale Fallaufnahme.
   - Mehrstufig mit Fortschritt, bedingten Feldern, Feld- und Zusammenfassungsfehlern
   - Eingaben nur im Arbeitsspeicher der aktuellen Seite (keine Browser-Speicherung, Konzept §6.4)
   - Validierungsfunktionen sind rein und werden vom (simulierten) Server wiederverwendet */

(function () {
  const C = window.MT_CONFIG;
  const icon = (n) => window.MT_ICON(n);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtDate = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

  /* ---------------- Reine Logik (auch serverseitig nutzbar) ---------------- */
  const allFields = (schema) => schema.steps.flatMap((s) => s.groups.flatMap((g) => g.fields));
  const stepFields = (step) => step.groups.flatMap((g) => g.fields);
  const isVisible = (f, data) => !f.showIf || Object.entries(f.showIf).every(([k, vals]) => vals.includes(data[k]));
  const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0) || v === false;

  function validateField(f, data) {
    if (!isVisible(f, data) || f.type === "files") return null;
    const v = data[f.id];
    if (f.required && isEmpty(v)) {
      if (f.requiredMsg) return f.requiredMsg;
      if (f.type === "radio") return `Bitte wählen Sie bei „${f.label}“ eine Option.`;
      return `Bitte geben Sie „${f.label}“ an.`;
    }
    if (isEmpty(v)) return null;
    if (typeof v === "string") {
      if (f.max && v.length > f.max) return `„${f.label}“ darf höchstens ${f.max} Zeichen lang sein.`;
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Bitte geben Sie eine gültige E-Mail-Adresse an, z. B. name@beispiel.de.";
      if (f.type === "tel" && !/^[+0-9 ()/\-]{6,}$/.test(v)) return "Bitte geben Sie eine gültige Telefonnummer an (nur Ziffern, Leerzeichen, + / - ).";
      if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMsg || `Bitte prüfen Sie „${f.label}“.`;
      if (f.type === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Bitte geben Sie ein gültiges Datum an.";
        if (f.notFuture && v > todayISO()) return "Der Unfalltag darf nicht in der Zukunft liegen.";
        if (f.minDate && v < f.minDate) return "Bitte prüfen Sie das Datum.";
      }
      if (f.type === "radio" && !f.options.some(([o]) => o === v)) return "Ungültige Auswahl.";
    }
    if (f.type === "checkboxes" && (!Array.isArray(v) || v.some((x) => !f.options.some(([o]) => o === x)))) return "Ungültige Auswahl.";
    return null;
  }

  /** Liefert [{id, msg}] für einen Schritt bzw. (ohne step) für das gesamte Schema. */
  function validate(schema, data, step) {
    const steps = step ? [step] : schema.steps;
    const errs = [];
    for (const s of steps) {
      for (const f of stepFields(s)) {
        const m = validateField(f, data);
        if (m) errs.push({ id: f.id, msg: m });
      }
      for (const r of s.rules || []) {
        if (r.oneOf) {
          const fs = stepFields(s).filter((f) => f.oneOf === r.oneOf);
          if (fs.every((f) => isEmpty(data[f.id]))) errs.push({ id: r.focus, msg: r.msg, rule: true });
        }
      }
    }
    return errs;
  }

  /** Entfernt Werte ausgeblendeter Felder und unbekannte Schlüssel (Datensparsamkeit). */
  function clean(schema, data) {
    const out = {};
    for (const f of allFields(schema)) {
      if (f.type === "files") continue;
      if (isVisible(f, data) && !isEmpty(data[f.id])) out[f.id] = typeof data[f.id] === "string" ? data[f.id].trim() : data[f.id];
    }
    return out;
  }

  /* Datei-Prüfung: Endung, Größe und tatsächlicher Inhaltstyp (Magic Bytes). Server prüft erneut. */
  async function sniff(file) {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    const ftyp = String.fromCharCode(...b.slice(4, 12));
    if (/ftyp(heic|heix|mif1|hevc)/.test(ftyp)) return "image/heic";
    return "unknown";
  }

  window.MT_FORM_LOGIC = { validate, validateField, isVisible, clean, allFields, sniff };

  /* ---------------- UI ---------------- */
  function renderField(f, data) {
    const v = data[f.id];
    const hid = f.hint ? `${f.id}-hint` : "";
    const describedby = [hid, `${f.id}-err`].filter(Boolean).join(" ");
    const opt = f.optional ? ' <span class="opt">(optional)</span>' : "";
    const hint = f.hint ? `<span class="hint" id="${hid}">${esc(f.hint)}</span>` : "";
    const err = `<div id="${f.id}-err" aria-live="polite"></div>`;
    const wrap = (inner, labelTag = true) => `
      <div class="field" data-field="${f.id}" ${f.w ? `data-w="${f.w}"` : ""} ${isVisible(f, data) ? "" : "hidden"}>
        ${inner}
      </div>`;

    switch (f.type) {
      case "radio":
      case "checkboxes": {
        const multi = f.type === "checkboxes";
        const items = f.options.map(([o, l], i) => {
          const checked = multi ? (v || []).includes(o) : v === o;
          return `<label class="opt-pill"><input type="${multi ? "checkbox" : "radio"}" name="${f.id}" value="${esc(o)}" id="${f.id}-${i}" ${checked ? "checked" : ""} aria-describedby="${describedby}"><span>${esc(l)}</span></label>`;
        }).join("");
        return wrap(`<fieldset class="group" style="margin:0" id="f-${f.id}" tabindex="-1"><legend class="label" style="font-size:.93rem;letter-spacing:0;text-transform:none;color:var(--ink);margin-bottom:6px;display:block">${esc(f.label)}${opt}</legend>${hint}
          <div class="options ${f.cards ? "options--cards" : ""}">${items}</div>${err}</fieldset>`);
      }
      case "check":
        return wrap(`<label class="opt-pill" style="display:block"><input type="checkbox" name="${f.id}" id="f-${f.id}" ${v ? "checked" : ""} aria-describedby="${describedby}"><span style="align-items:flex-start;line-height:1.45;padding:14px 18px">${esc(f.label)}</span></label>
          ${f.draft ? '<span class="hint" style="margin-top:8px"><span class="placeholder-tag">Entwurf</span> Formulierung fachlich und rechtlich durch die Kanzlei prüfen.</span>' : ""}${err}`);
      case "textarea":
        return wrap(`<label for="f-${f.id}">${esc(f.label)}${opt}</label>${hint}
          <textarea id="f-${f.id}" name="${f.id}" maxlength="${f.max || 5000}" aria-describedby="${describedby}">${esc(v)}</textarea>
          <span class="hint" style="text-align:right;margin:4px 0 0" data-count="${f.id}">${(v || "").length} / ${f.max} Zeichen</span>${err}`);
      case "files": {
        const F = C.formular;
        return wrap(`<span class="label" id="${f.id}-label">${esc(f.label)}${opt}</span>${hint}
          <div class="dropzone" data-dropzone>
            ${icon("upload")}
            <p>Dateien hierher ziehen oder auswählen<br><small>PDF, JPG oder PNG · bis ${F.maxDateien} Dateien · je max. ${F.maxDateiMB} MB, gesamt max. ${F.maxGesamtMB} MB</small></p>
            <label class="btn btn--ghost" style="cursor:pointer">${icon("camera")} Dateien oder Fotos wählen
              <input type="file" id="f-${f.id}" class="sr-only" multiple accept="${F.erlaubteEndungen.join(",")},${F.erlaubteTypen.join(",")}" aria-labelledby="${f.id}-label" aria-describedby="${describedby}">
            </label>
          </div>
          <p class="hint" style="margin-top:8px">iPhone-Fotos im HEIC-Format werden derzeit nicht angenommen. Tipp: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“.</p>
          <ul class="file-list" data-filelist></ul>${err}`);
      }
      default: {
        const type = f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text";
        const attrs = [
          `type="${type}"`, `id="f-${f.id}"`, `name="${f.id}"`, `value="${esc(v)}"`,
          f.max ? `maxlength="${f.max}"` : "", f.autocomplete ? `autocomplete="${f.autocomplete}"` : "",
          f.inputmode ? `inputmode="${f.inputmode}"` : "", f.notFuture ? `max="${todayISO()}"` : "",
          f.minDate ? `min="${f.minDate}"` : "", f.plate ? 'class="plate" autocapitalize="characters" spellcheck="false"' : "",
          f.required ? 'aria-required="true"' : "", `aria-describedby="${describedby}"`,
        ].filter(Boolean).join(" ");
        return wrap(`<label for="f-${f.id}">${esc(f.label)}${opt}</label>${hint}<input ${attrs}>${err}`);
      }
    }
  }

  function displayValue(f, v, files) {
    if (f.type === "files") return files.length ? files.map((x) => x.file.name).join("\n") : "";
    if (isEmpty(v)) return "";
    if (f.type === "radio") return (f.options.find(([o]) => o === v) || [, v])[1];
    if (f.type === "checkboxes") return v.map((x) => (f.options.find(([o]) => o === x) || [, x])[1]).join(", ");
    if (f.type === "check") return "Bestätigt";
    if (f.type === "date") return fmtDate(v);
    return v;
  }

  /**
   * Formular einhängen.
   * @param {HTMLElement} mount
   * @param {object} schema
   * @param {{ submit: Function, partner?: object, kopf?: string, initial?: object }} opts
   */
  function mountForm(mount, schema, opts) {
    const state = {
      data: { ...(opts.initial || {}) },
      files: [], // { file, mime }
      step: 0,
      requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()),
      dirty: false,
      sending: false,
    };
    const steps = [...schema.steps, { id: "review", titel: "Prüfen und absenden", review: true }];
    let timer, warnTimer;

    const progress = () => {
      const n = steps.length, i = state.step;
      return `<div class="progress" aria-label="Fortschritt">
        <div class="progress__meta"><span>Schritt <strong>${i + 1}</strong> von ${n}</span><span>${esc(steps[i].titel)}</span></div>
        <div class="progress__bar"><span style="width:${((i + 1) / n) * 100}%"></span></div>
        <ol class="progress__steps">${steps.map((s, j) => `<li ${j === i ? 'aria-current="step"' : ""} class="${j < i ? "done" : ""}">${j < i ? "✓ " : ""}${esc(s.titel)}</li>`).join("")}</ol>
      </div>`;
    };

    function render() {
      const s = steps[state.step];
      const head = `${opts.kopf || ""}${progress()}<div data-errsum></div>
        <h2 class="step-title" tabindex="-1">${esc(s.titel)}</h2>${s.intro ? `<p class="step-intro">${esc(s.intro)}</p>` : ""}`;
      const body = s.review ? renderReview() : s.groups.map((g) => `
        <fieldset class="group"><legend>${esc(g.legend)}</legend>${g.hint ? `<p class="hint" style="margin:-6px 0 16px">${esc(g.hint)}</p>` : ""}
          <div class="fields">${g.fields.map((f) => renderField(f, state.data)).join("")}</div>
        </fieldset>`).join("");
      const last = s.review;
      const nav = `<div class="form-nav">
          ${state.step > 0 ? `<button type="button" class="btn btn--back" data-back>← Zurück</button>` : "<span></span>"}
          <button type="submit" class="btn btn--primary" ${state.sending ? "disabled" : ""}>${last ? (state.sending ? "Wird übermittelt …" : "Anfrage verbindlich absenden") : "Weiter"} ${icon("arrow")}</button>
        </div>`;
      mount.innerHTML = `<form novalidate autocomplete="on">
          <div class="hp-field" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
          ${head}${body}${nav}</form>`;
      bind();
      if (!s.review && s.groups.some((g) => g.fields.some((f) => f.type === "files"))) renderFiles();
    }

    function renderReview() {
      const sections = schema.steps.map((s, i) => {
        const rows = stepFields(s).filter((f) => isVisible(f, state.data))
          .map((f) => [f.label || "Bestätigung", displayValue(f, state.data[f.id], state.files)])
          .filter(([, v]) => v !== "");
        return `<section><h3>${esc(s.titel)} <button type="button" class="btn--link btn" data-goto="${i}">Ändern<span class="sr-only">: ${esc(s.titel)}</span></button></h3>
          ${rows.length ? `<dl>${rows.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : '<p style="padding:12px 18px;margin:0;color:var(--grey)">Keine Angaben</p>'}</section>`;
      }).join("");
      return `<div class="review">${sections}</div>
        <div class="notice notice--warn" style="margin-top:28px">${icon("clock")}<div><p><strong>Fristen:</strong> Bei laufenden oder kurzfristig endenden Fristen kontaktieren Sie uns bitte zusätzlich telefonisch unter <a href="tel:${C.kanzlei.telefonLink}">${C.kanzlei.telefon}</a>. Die Übermittlung ersetzt keine Bestätigung der Mandatsübernahme.</p></div></div>
        <div class="notice" style="margin-top:14px">${icon("shield")}<div><p>Wir verarbeiten Ihre Angaben und hochgeladenen Unterlagen, um Ihre Anfrage zu prüfen und mit Ihnen Kontakt aufzunehmen. Dazu werden die Daten über unsere Website entgegengenommen und in die von uns eingesetzte Kanzleisoftware jur|nodes übertragen. Weitere Informationen zu Verantwortlichkeit, Dienstleistern, Rechtsgrundlagen, Speicherdauer und Ihren Rechten finden Sie in unseren <a href="${window.MT_HREF("datenschutz/#fallaufnahme")}" target="_blank" rel="noopener">Datenschutzhinweisen zur Fallaufnahme</a>.</p></div></div>
        <div data-submit-error></div>`;
    }

    function setError(id, msg) {
      const wrap = mount.querySelector(`[data-field="${id}"]`);
      const slot = mount.querySelector(`#${CSS.escape(id)}-err`);
      if (!wrap || !slot) return;
      wrap.classList.toggle("has-error", !!msg);
      slot.innerHTML = msg ? `<p class="error-msg">${icon("alert")}<span>${esc(msg)}</span></p>` : "";
      wrap.querySelectorAll("input,textarea").forEach((el) => el.setAttribute("aria-invalid", msg ? "true" : "false"));
    }

    function showErrors(errs) {
      mount.querySelectorAll(".has-error").forEach((el) => setError(el.dataset.field, null));
      const sum = mount.querySelector("[data-errsum]");
      if (!errs.length) { sum.innerHTML = ""; return; }
      errs.forEach((e) => setError(e.id, e.msg));
      sum.innerHTML = `<div class="error-summary" role="alert" tabindex="-1"><h2>${icon("alert")} Bitte prüfen Sie Ihre Angaben</h2>
        <ul>${errs.map((e) => `<li><a href="#f-${e.id}" data-focus="${e.id}">${esc(e.msg)}</a></li>`).join("")}</ul></div>`;
      sum.querySelectorAll("[data-focus]").forEach((a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const el = mount.querySelector(`#f-${CSS.escape(a.dataset.focus)}`) || mount.querySelector(`[name="${a.dataset.focus}"]`);
        el && el.focus();
      }));
      sum.firstElementChild.focus();
    }

    function updateVisibility() {
      const s = steps[state.step];
      if (s.review) return;
      for (const f of stepFields(s)) {
        const el = mount.querySelector(`[data-field="${f.id}"]`);
        if (el) el.hidden = !isVisible(f, state.data);
      }
    }

    function bind() {
      const form = mount.querySelector("form");
      form.addEventListener("input", onInput);
      form.addEventListener("change", onInput);
      form.addEventListener("submit", onSubmit);
      form.querySelector("[data-back]")?.addEventListener("click", () => go(state.step - 1));
      form.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.goto)));
      const fileInput = form.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
        const dz = form.querySelector("[data-dropzone]");
        ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
        ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
        dz.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
      }
    }

    function onInput(e) {
      const el = e.target;
      if (!el.name || el.name === "website" || el.type === "file") return;
      const f = window.MT_FORM_LOGIC.allFields(schema).find((x) => x.id === el.name);
      if (!f) return;
      if (f.type === "checkboxes") state.data[f.id] = [...mount.querySelectorAll(`input[name="${f.id}"]:checked`)].map((x) => x.value);
      else if (f.type === "check") state.data[f.id] = el.checked;
      else {
        if (f.plate && e.type === "input") { const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p); }
        state.data[f.id] = el.value;
      }
      if (f.type === "textarea") { const c = mount.querySelector(`[data-count="${f.id}"]`); c && (c.textContent = `${el.value.length} / ${f.max} Zeichen`); }
      state.dirty = true;
      touch();
      updateVisibility();
      if (e.type === "change" && mount.querySelector(`[data-field="${f.id}"].has-error`)) setError(f.id, validateField(f, state.data));
    }

    async function addFiles(fileList) {
      const F = C.formular;
      const errs = [];
      const list = [...fileList]; // kopieren: das Input wird direkt danach geleert, die Prüfung läuft asynchron
      for (const file of list) {
        const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
        if (state.files.length >= F.maxDateien) { errs.push(`Maximal ${F.maxDateien} Dateien möglich.`); break; }
        if (file.size > F.maxDateiMB * 1048576) { errs.push(`„${file.name}“ ist größer als ${F.maxDateiMB} MB.`); continue; }
        const total = state.files.reduce((a, x) => a + x.file.size, 0) + file.size;
        if (total > F.maxGesamtMB * 1048576) { errs.push(`Die Dateien überschreiten zusammen ${F.maxGesamtMB} MB.`); continue; }
        const mime = await sniff(file);
        if (mime === "image/heic") { errs.push(`„${file.name}“ ist ein HEIC-Foto. Bitte als JPG senden.`); continue; }
        if (!F.erlaubteEndungen.includes(ext) || !F.erlaubteTypen.includes(mime)) { errs.push(`„${file.name}“: Nur PDF, JPG oder PNG möglich.`); continue; }
        if (state.files.some((x) => x.file.name === file.name && x.file.size === file.size)) continue;
        state.files.push({ file, mime });
      }
      state.dirty = true;
      renderFiles();
      setError("dateien", errs.length ? errs.join(" ") : null);
    }

    function renderFiles() {
      const ul = mount.querySelector("[data-filelist]");
      if (!ul) return;
      ul.innerHTML = state.files.map((x, i) => `<li>${icon(x.mime === "application/pdf" ? "file" : "camera")}<span class="name">${esc(x.file.name)}</span><span class="size">${fmtSize(x.file.size)}</span><button type="button" data-rm="${i}">Entfernen<span class="sr-only"> ${esc(x.file.name)}</span></button></li>`).join("");
      ul.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { state.files.splice(+b.dataset.rm, 1); renderFiles(); }));
    }

    function go(i) {
      state.step = Math.max(0, Math.min(steps.length - 1, i));
      render();
      mount.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      mount.querySelector(".step-title")?.focus({ preventScroll: true });
    }

    async function onSubmit(e) {
      e.preventDefault();
      const s = steps[state.step];
      if (!s.review) {
        const errs = validate(schema, state.data, s);
        if (errs.length) return showErrors(errs);
        return go(state.step + 1);
      }
      // Abschließende Gesamtprüfung
      const all = validate(schema, state.data);
      if (all.length) {
        const idx = schema.steps.findIndex((st) => stepFields(st).some((f) => f.id === all[0].id));
        go(idx < 0 ? 0 : idx);
        return showErrors(validate(schema, state.data, schema.steps[idx < 0 ? 0 : idx]));
      }
      if (state.sending) return; // Doppelklick-Schutz (zusätzlich serverseitig per requestId)
      const hp = mount.querySelector('[name="website"]')?.value || ""; // Köderfeld, vor dem Neu-Rendern auslesen
      state.sending = true;
      render();
      try {
        const progress = (msg) => {
          const b = mount.querySelector('button[type="submit"]');
          if (b && b.firstChild) b.firstChild.nodeValue = msg + " ";
        };
        const res = await opts.submit({
          requestId: state.requestId,
          data: clean(schema, state.data),
          files: state.files.map((x) => ({ name: x.file.name, size: x.file.size, mime: x.mime, file: x.file })),
          honeypot: hp,
        }, progress);
        // Erfolg erst nach dauerhafter Speicherung (Server bestätigt) → Eingaben verwerfen
        state.data = {}; state.files = []; state.dirty = false;
        stopTimers();
        showSuccess(res);
      } catch (err) {
        state.sending = false;
        render();
        const slot = mount.querySelector("[data-submit-error]");
        slot.innerHTML = `<div class="notice notice--error" role="alert" style="margin-top:20px">${icon("alert")}<div><p><strong>Die Anfrage konnte nicht übermittelt werden.</strong> ${esc(err.userMessage || "Bitte versuchen Sie es in einem Moment erneut.")} Ihre Eingaben sind erhalten geblieben.</p><p>Alternativ erreichen Sie uns telefonisch unter <a href="tel:${C.kanzlei.telefonLink}">${C.kanzlei.telefon}</a>.</p></div></div>`;
        slot.firstElementChild.focus?.();
      }
    }

    function showSuccess(res) {
      mount.innerHTML = `<div class="success" role="status">
          <div class="success__icon">${icon("check")}</div>
          <h2 tabindex="-1">Ihre Anfrage ist bei uns eingegangen.</h2>
          <p>Ihre Referenz:</p>
          <div class="ref">${esc(res.ref)}</div>
          <p style="max-width:52ch;margin:0 auto 24px;color:var(--grey)">${opts.partner
            ? "Vielen Dank. Wir prüfen den Fall und melden uns beim Kunden bzw. bei Ihnen. Die Übernahme des Falls bestätigen wir gesondert."
            : "Wir prüfen Ihre Angaben und melden uns bei Ihnen. Die Übernahme Ihres Falls bestätigen wir gesondert."}</p>
          <p style="font-size:.85rem;color:var(--grey);max-width:52ch;margin:0 auto 28px">Die Referenz dient nur der Zuordnung bei Rückfragen; sie ermöglicht keinen Abruf Ihrer Daten.</p>
          <div class="btn-row" style="justify-content:center">
            ${opts.partner ? `<a class="btn btn--primary" href="${window.MT_HREF("partner/neuer-fall/")}">Weiteren Fall übermitteln</a>` : `<a class="btn btn--primary" href="${window.MT_HREF("")}">Zur Startseite</a>`}
            <a class="btn btn--ghost" href="${window.MT_HREF("intern/")}">Demo: Übertragung im Kanzlei-Monitor ansehen</a>
          </div>
        </div>`;
      mount.querySelector("h2").focus();
    }

    /* Sitzungs-Timeout ankündigen und verlängern lassen (Konzept §6.4) */
    function touch() {
      stopTimers();
      const min = C.formular.sitzungMinuten;
      warnTimer = setTimeout(showTimeoutWarning, (min - 2) * 60000);
      timer = setTimeout(expire, min * 60000);
    }
    function stopTimers() { clearTimeout(timer); clearTimeout(warnTimer); document.querySelector(".modal-backdrop")?.remove(); }
    function showTimeoutWarning() {
      const m = document.createElement("div");
      m.className = "modal-backdrop";
      m.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="to-t"><h2 id="to-t">Ihre Sitzung läuft bald ab</h2>
        <p>Aus Datenschutzgründen werden nicht abgesendete Eingaben nach ${C.formular.sitzungMinuten} Minuten ohne Aktivität verworfen.</p>
        <button class="btn btn--primary" type="button">Weiter bearbeiten</button></div>`;
      document.body.appendChild(m);
      const b = m.querySelector("button");
      b.focus();
      b.addEventListener("click", () => { touch(); /* Produktion: Server-Sitzung per Ping verlängern */ });
    }
    function expire() {
      stopTimers();
      state.data = {}; state.files = []; state.dirty = false; state.step = 0;
      render();
      mount.querySelector("[data-errsum]").innerHTML = `<div class="notice notice--warn" role="alert">${icon("clock")}<p>Ihre Sitzung ist abgelaufen. Die Eingaben wurden aus Datenschutzgründen verworfen.</p></div>`;
    }

    window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
    touch();
    render();
    return state;
  }

  window.MT_FORM = { mountForm };
})();
