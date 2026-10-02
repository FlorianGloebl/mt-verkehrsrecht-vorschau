/* Zentrale Kanzlei-Konfiguration.
   Quelle: Bestandswebsite maier-verkehrsrecht.de und Mail von Thorsten Maier (01.10.2026).
   Vor Veröffentlichung von der Kanzlei bestätigen lassen (siehe docs/OFFENE-PUNKTE.md). */
window.MT_CONFIG = {
  brand: {
    name: "MT | Verkehrsrecht",
    claim: "Kompetente Hilfe. Klar. Schnell. Persönlich.",
  },
  kanzlei: {
    inhaber: "Rechtsanwalt Thorsten Maier",
    titel: "Rechtsanwalt · Fachanwalt für Verkehrsrecht",
    strasse: "Ottostraße 13",
    plzOrt: "84030 Landshut",
    telefon: "0871 20666180",
    telefonLink: "+4987120666180",
    fax: "0871 20666189",
    email: "info@maier-verkehrsrecht.de",
    zeiten: [
      ["Montag – Donnerstag", "09:00 – 13:00 · 14:00 – 16:00 Uhr"],
      ["Freitag", "09:00 – 14:00 Uhr"],
    ],
  },
  downloads: [
    { titel: "Vollmacht", datei: "assets/downloads/MTV-Vollmacht.pdf" },
    { titel: "Widerrufsbelehrung", datei: "assets/downloads/MTV-Widerrufsbelehrung.pdf" },
    { titel: "Reparaturablaufplan", datei: "assets/downloads/MTV-Reparaturablaufplan.pdf" },
  ],
  formular: {
    maxDateien: 10,
    maxDateiMB: 10,
    maxGesamtMB: 50,
    erlaubteTypen: ["application/pdf", "image/jpeg", "image/png"],
    erlaubteEndungen: [".pdf", ".jpg", ".jpeg", ".png"],
    sitzungMinuten: 30,
    datenschutzVersion: "ENTWURF-2026-10-01",
  },
};
