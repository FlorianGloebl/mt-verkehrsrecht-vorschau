/* Anbindung an das PHP-Backend (/api). Gleiche Schnittstelle wie mock-backend.js.
   Ist kein Backend erreichbar (file://, reiner Static-Server), bleibt die Simulation aktiv.
   window.MT_BACKEND_READY löst auf, sobald feststeht, welche Variante genutzt wird. */
(function () {
  const mock = window.MT_BACKEND;
  const base = (document.body.dataset.root || "") + "api/";
  let csrf = null;

  const err = (status, userMessage, extra = {}) => Object.assign(new Error("HTTP " + status), { status, userMessage }, extra);

  async function call(method, path, body, { retryCsrf = true, raw = false } = {}) {
    const opts = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (method !== "GET") opts.headers["X-CSRF-Token"] = csrf || "";
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(base + path, opts); }
    catch { throw err(0, "Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung."); }
    if (raw && res.ok) return res;
    let data = {};
    try { data = await res.json(); } catch { /* leer */ }
    if (res.status === 403 && data.error === "csrf" && retryCsrf) {
      await session();
      return call(method, path, body, { retryCsrf: false, raw });
    }
    if (!res.ok) {
      let msg = data.message || "Die Anfrage konnte nicht verarbeitet werden.";
      if (Array.isArray(data.fields) && data.fields.length) msg += " " + data.fields.map((f) => f.msg).join(" ");
      throw err(res.status, msg, { fields: data.fields });
    }
    if (data.csrf) csrf = data.csrf;
    return data;
  }

  async function session() {
    const s = await call("GET", "session");
    csrf = s.csrf;
    return s;
  }

  const uploaded = new WeakMap(); // File → Upload-ID (keine erneuten Uploads bei Wiederholung)

  const api = {
    mode: "api",
    async partnerLogin(code) { return (await call("POST", "partner/login", { code })).partner; },
    async partnerSession() { return (await session()).partner; },
    async partnerLogout() { await call("POST", "partner/logout", {}); },
    async submit(schemaKey, { requestId, data, files, honeypot }, progress = () => {}) {
      const fileIds = [];
      for (const [i, f] of files.entries()) {
        if (uploaded.has(f.file)) { fileIds.push(uploaded.get(f.file)); continue; }
        progress(`Datei ${i + 1} von ${files.length} wird hochgeladen …`);
        const fd = new FormData();
        fd.append("file", f.file, f.name);
        const r = await call("POST", "upload", fd);
        uploaded.set(f.file, r.id);
        fileIds.push(r.id);
      }
      progress("Wird übermittelt …");
      return call("POST", "submit/" + schemaKey, { requestId, data, fileIds, website: honeypot });
    },
    admin: {
      login: (email, password, otp) => call("POST", "admin/login", { email, password, otp }),
      logout: () => call("POST", "admin/logout", {}),
      session,
      list: () => call("GET", "admin/submissions"),
      retry: (ref) => call("POST", "admin/retry", { ref }),
      resolve: (ref) => call("POST", "admin/resolve", { ref }),
      pdfUrl: (ref) => base + "admin/pdf?ref=" + encodeURIComponent(ref),
      fileUrl: (id) => base + "admin/file?id=" + encodeURIComponent(id),
      partners: () => call("GET", "admin/partners"),
      partnerCreate: (data) => call("POST", "admin/partners", data),
      partnerUpdate: (data) => call("POST", "admin/partners/update", data),
      partnerRotate: (id) => call("POST", "admin/partners/rotate", { id }),
      partnerActive: (id, active) => call("POST", "admin/partners/active", { id, active }),
    },
  };

  const want = (window.MT_CONFIG && window.MT_CONFIG.backend) || "auto";
  window.MT_BACKEND_READY = (async () => {
    if (want === "mock" || location.protocol === "file:") return (window.MT_BACKEND = Object.assign(mock, { mode: "mock" }));
    try {
      await session();
      return (window.MT_BACKEND = api);
    } catch (e) {
      if (want === "api") { window.MT_BACKEND = api; return api; }
      console.info("[MT] Kein Backend erreichbar – Simulation aktiv.");
      return (window.MT_BACKEND = Object.assign(mock, { mode: "mock" }));
    }
  })();
})();
