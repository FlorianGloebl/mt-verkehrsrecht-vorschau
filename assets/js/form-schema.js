/* Formularschemata – abgeleitet aus den AcroForm-PDFs der Kanzlei:
   - MT_VERKEHRSRECHT_Unfallaufnahme_Mandant.pdf  → MT_SCHEMAS.mandant
   - MT_VERKEHRSRECHT_Autohaus_Kurzfragebogen.pdf → MT_SCHEMAS.partner

   Feld-IDs entsprechen den PDF-Feldnamen. Wo das Web-Formular ein PDF-Feld aufteilt
   (z. B. Name → Vor- und Nachname), verweist `pdf` auf das Ursprungsfeld.
   `added: true` markiert Felder, die NICHT im PDF stehen (fachlich bestätigen lassen).

   Feldtypen: text | email | tel | date | time | textarea | radio | checkboxes | check | files
   showIf: { feld: [werte] } – Feld nur anzeigen (und validieren), wenn Bedingung erfüllt. */

(function () {
  const JA_NEIN = [["ja", "Ja"], ["nein", "Nein"]];
  const NEIN_JA = [["nein", "Nein"], ["ja", "Ja"]];
  const UNB = ["unbekannt", "Weiß ich nicht"];

  const anrede = { id: "mandant_anrede", label: "Anrede", type: "radio", optional: true, added: true,
    hint: "Für die korrekte Ansprache in unserer Korrespondenz.",
    options: [["frau", "Frau"], ["herr", "Herr"], ["divers", "Divers"], ["keine", "Keine Angabe"]] };

  const name = [
    { id: "mandant_vorname", label: "Vorname", type: "text", w: 3, pdf: "mandant_name", autocomplete: "given-name", optional: true, max: 70 },
    { id: "mandant_nachname", label: "Nachname", type: "text", w: 3, pdf: "mandant_name", autocomplete: "family-name", required: true, max: 150 },
  ];
  const adresse = (pdfStrasse, pdfOrt) => [
    { id: "mandant_strasse", label: "Straße und Hausnummer", type: "text", pdf: pdfStrasse, autocomplete: "street-address", optional: true, max: 100 },
    { id: "mandant_plz", label: "PLZ", type: "text", w: 2, pdf: pdfOrt, autocomplete: "postal-code", inputmode: "numeric", optional: true, max: 10, pattern: "^[0-9]{4,5}$", patternMsg: "Bitte eine gültige Postleitzahl eingeben." },
    { id: "mandant_ort", label: "Ort", type: "text", w: 4, pdf: pdfOrt, autocomplete: "address-level2", optional: true, max: 70 },
  ];
  const kontakt = [
    { id: "mandant_telefon", label: "Telefon", type: "tel", w: 3, autocomplete: "tel", inputmode: "tel", optional: true, max: 40, oneOf: "kontakt" },
    { id: "mandant_email", label: "E-Mail", type: "email", w: 3, autocomplete: "email", optional: true, max: 70, oneOf: "kontakt" },
  ];
  const vorsteuer = { id: "mandant_vorsteuer", label: "Vorsteuerabzugsberechtigt?", type: "radio", optional: true,
    hint: "In der Regel nur bei Unternehmen und Selbstständigen relevant.",
    options: [...JA_NEIN, UNB] };

  const fahrzeug = (withKasko, withWerkstatt) => [
    { id: "fahrzeug_kennzeichen", label: "Amtliches Kennzeichen", type: "text", w: 3, plate: true, optional: true, max: 15, hint: "z. B. LA-MT 123" },
    { id: "fahrzeug_eigentum", label: "Eigentumsverhältnis", type: "radio", optional: true,
      options: [["eigentum", "Eigentum"], ["leasing", "Leasing"], ["finanzierung", "Finanzierung"], UNB] },
    { id: "fahrzeug_finanzierer", label: "Leasing-/Finanzierungsgesellschaft", type: "text", w: 4, optional: true, max: 100,
      showIf: { fahrzeug_eigentum: ["leasing", "finanzierung"] } },
    { id: "fahrzeug_vertragsnummer", label: "Vertrags-Nr.", type: "text", w: 2, optional: true, max: 50,
      showIf: { fahrzeug_eigentum: ["leasing", "finanzierung"] } },
    { id: "fahrzeug_vollkasko", label: "Vollkaskoversicherung?", type: "radio", optional: true, options: [...NEIN_JA, UNB] },
    ...(withKasko ? [{ id: "fahrzeug_vollkasko_gesellschaft", label: "Kaskoversicherer", type: "text", w: 4, optional: true, max: 100,
      showIf: { fahrzeug_vollkasko: ["ja"] } }] : []),
    { id: "fahrzeug_schadenermittlung", label: "Schadenermittlung", type: "radio", optional: true,
      options: [["gutachten", "Gutachten"], ["kva", "Kostenvoranschlag"], ["offen", "Noch nicht erfolgt"]] },
    { id: "fahrzeug_sachverstaendiger", label: "Sachverständiger", type: "text", w: 4, optional: true, max: 100,
      showIf: { fahrzeug_schadenermittlung: ["gutachten"] } },
    ...(withWerkstatt ? [{ id: "fahrzeug_werkstatt", label: "Werkstatt", type: "text", w: 4, optional: true, max: 100 }] : []),
    { id: "fahrzeug_abrechnungsart", label: "Abrechnungsart", type: "radio", optional: true,
      hint: "Falls Sie unsicher sind, wählen Sie „Noch unentschieden“ – wir besprechen das mit Ihnen.",
      options: [["reparaturrechnung", "Reparaturrechnung (konkret)"], ["gutachtenbasis", "Auf Gutachtenbasis (fiktiv)"], ["totalschaden", "Totalschaden"], ["unentschieden", "Noch unentschieden"]] },
  ];

  const polizei = [
    { id: "unfall_polizei", label: "Polizei am Unfallort?", type: "radio", optional: true, options: [...NEIN_JA, UNB] },
    { id: "unfall_polizeidienststelle", label: "Polizeidienststelle", type: "text", w: 3, optional: true, max: 100, showIf: { unfall_polizei: ["ja"] } },
    { id: "unfall_aktenzeichen", label: "Aktenzeichen", type: "text", w: 3, optional: true, max: 50, showIf: { unfall_polizei: ["ja"] } },
  ];

  const datum = { id: "unfall_datum", label: "Unfalltag", type: "date", w: 3, required: true, notFuture: true, minDate: "2000-01-01" };
  const hergang = { id: "unfall_hergang", label: "Wie hat sich der Unfall ereignet?", type: "textarea", required: true, max: 3000,
    hint: "Kurz in eigenen Worten – z. B. Fahrtrichtung, Verkehrssituation, was passiert ist." };

  window.MT_SCHEMAS = {
    /* ------------------------------------------------------------------ */
    mandant: {
      key: "mandant",
      titel: "Eigenen Schaden melden",
      quelle: "Website · Eigener Schaden",
      pdfVorlage: "MT_VERKEHRSRECHT_Unfallaufnahme_Mandant.pdf",
      steps: [
        {
          id: "person", titel: "Ihre Angaben", intro: "Damit wir Sie erreichen können. Ein Kontaktweg genügt.",
          groups: [
            { legend: "Wer meldet den Schaden?", fields: [
              { id: "melder_typ", label: "Ich melde als", type: "radio", cards: true, required: true, added: true,
                options: [["privat", "Privatperson"], ["unternehmen", "Unternehmen (eigenes Firmenfahrzeug)"]] },
              { id: "firma_name", label: "Name des Unternehmens", type: "text", w: 4, required: true, added: true, max: 150, autocomplete: "organization",
                showIf: { melder_typ: ["unternehmen"] } },
              { id: "firma_rolle", label: "Ihre Funktion im Unternehmen", type: "text", w: 2, optional: true, added: true, max: 70,
                showIf: { melder_typ: ["unternehmen"] }, hint: "z. B. Geschäftsführung, Fuhrpark" },
            ] },
            { legend: "Kontaktdaten", fields: [anrede, ...name, ...adresse("mandant_adresse", "mandant_plz_ort"), ...kontakt, vorsteuer] },
          ],
          rules: [{ oneOf: "kontakt", msg: "Bitte geben Sie mindestens eine Telefonnummer oder E-Mail-Adresse an.", focus: "mandant_telefon" }],
        },
        {
          id: "fahrzeug", titel: "Ihr Fahrzeug", intro: "Angaben, die Sie nicht kennen, können Sie einfach offenlassen.",
          groups: [{ legend: "Fahrzeug und Schaden", fields: fahrzeug(true, true) }],
        },
        {
          id: "unfall", titel: "Unfall und Unfallgegner", intro: "Je genauer, desto besser – aber Lücken sind kein Problem.",
          groups: [
            { legend: "Unfall", fields: [datum, { id: "unfall_uhrzeit", label: "Uhrzeit", type: "time", w: 3, optional: true },
              { id: "unfall_ort", label: "Unfallort", type: "text", optional: true, max: 200, hint: "Straße, Kreuzung oder Ortsangabe" }, hergang, ...polizei] },
            { legend: "Unfallgegner", hint: "Soweit bekannt – oft stehen diese Angaben auf dem Unfallbericht oder Zettel der Polizei.", fields: [
              { id: "gegner_name", label: "Name des Unfallgegners", type: "text", optional: true, max: 150 },
              { id: "gegner_kennzeichen", label: "Kennzeichen", type: "text", w: 3, plate: true, optional: true, max: 15 },
              { id: "gegner_versicherung", label: "Versicherer", type: "text", w: 3, optional: true, max: 100 },
              { id: "gegner_vertragsnummer", label: "Versicherungsscheinnummer", type: "text", w: 3, optional: true, max: 50 },
              { id: "gegner_schadennummer", label: "Schaden-Nr.", type: "text", w: 3, optional: true, max: 50 },
            ] },
          ],
        },
        {
          id: "folgen", titel: "Fahrzeugzustand, Zeugen, Verletzungen", intro: "Nur kurze Angaben – Einzelheiten besprechen wir persönlich.",
          groups: [
            { legend: "Fahrzeugzustand", fields: [
              { id: "zustand_fahrbereit", label: "Fahrzeug fahrbereit?", type: "radio", w: 3, optional: true, options: [...JA_NEIN, UNB] },
              { id: "zustand_abgeschleppt", label: "Fahrzeug abgeschleppt?", type: "radio", w: 3, optional: true, options: NEIN_JA },
            ] },
            { legend: "Zeugen", fields: [
              { id: "zeugen_vorhanden", label: "Gab es Zeugen?", type: "radio", optional: true, options: [...NEIN_JA, UNB] },
              ...[1, 2].flatMap((n) => [
                { id: `zeuge_${n}_name`, label: `Zeuge ${n} – Name`, type: "text", w: 3, optional: true, max: 150, showIf: { zeugen_vorhanden: ["ja"] } },
                { id: `zeuge_${n}_telefon`, label: "Telefon", type: "tel", w: 3, optional: true, max: 40, inputmode: "tel", showIf: { zeugen_vorhanden: ["ja"] } },
                { id: `zeuge_${n}_adresse`, label: "Adresse", type: "text", optional: true, max: 200, showIf: { zeugen_vorhanden: ["ja"] } },
              ]),
            ] },
            { legend: "Verletzungen", fields: [
              { id: "verletzungen_vorhanden", label: "Wurde jemand verletzt?", type: "radio", w: 3, optional: true, options: NEIN_JA },
              { id: "verletzungen_behandlung", label: "Ärztliche Behandlung?", type: "radio", w: 3, optional: true, options: NEIN_JA, showIf: { verletzungen_vorhanden: ["ja"] } },
              { id: "verletzungen_personen", label: "Falls ja, wer?", type: "text", optional: true, max: 200, showIf: { verletzungen_vorhanden: ["ja"] },
                hint: "Bitte nur angeben, wer verletzt wurde – keine Diagnosen oder Befunde. Das klären wir im persönlichen Gespräch." },
            ] },
          ],
        },
        {
          id: "unterlagen", titel: "Unterlagen", intro: "Laden Sie vorhandene Unterlagen hoch oder reichen Sie sie später nach.",
          groups: [
            { legend: "Was liegt bereits vor?", fields: [
              { id: "unterlagen", label: "Vorhandene Unterlagen", type: "checkboxes", optional: true, multiPdf: true,
                options: [["unterlage_unfallfotos", "Unfallfotos"], ["unterlage_fahrzeugschein", "Fahrzeugschein"], ["unterlage_gutachten", "Gutachten"],
                  ["unterlage_kva", "Kostenvoranschlag"], ["unterlage_polizeidaten", "Polizeidaten"], ["unterlage_versicherung", "Versicherungsunterlagen"],
                  ["unterlage_reparaturrechnung", "Reparaturrechnung"], ["unterlage_sonstige", "Sonstige Unterlagen"]] },
              { id: "dateien", label: "Dateien hochladen", type: "files", optional: true },
            ] },
            { legend: "Ergänzende Angaben", fields: [
              { id: "ergaenzende_angaben", label: "Gibt es noch etwas, das wir zum Unfall oder Schaden wissen sollten?", type: "textarea", optional: true, max: 3000 },
            ] },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    partner: {
      key: "partner",
      titel: "Neuen Kundenfall übermitteln",
      quelle: "Partnerportal",
      pdfVorlage: "MT_VERKEHRSRECHT_Autohaus_Kurzfragebogen.pdf",
      steps: [
        {
          id: "kunde", titel: "Kunde", intro: "Angaben zur geschädigten Person bzw. zum geschädigten Unternehmen.",
          groups: [
            { legend: "Mandant", fields: [anrede, ...name, ...adresse("mandant_adresse", "mandant_adresse"), ...kontakt, vorsteuer,
              { id: "partner_referenz", label: "Ihre interne Referenz", type: "text", w: 3, optional: true, added: true, max: 40,
                hint: "z. B. Auftrags- oder Werkstattnummer – erscheint in unserer Rückmeldung." }] },
          ],
          rules: [{ oneOf: "kontakt", msg: "Bitte mindestens Telefon oder E-Mail des Kunden angeben.", focus: "mandant_telefon" }],
        },
        {
          id: "fahrzeug", titel: "Fahrzeug und Schaden",
          groups: [{ legend: "Mandantenfahrzeug", fields: fahrzeug(false, false) }],
        },
        {
          id: "unfall", titel: "Unfall und Unfallgegner",
          groups: [
            { legend: "Daten zum Unfall", fields: [datum, { id: "unfall_ort", label: "Unfallort", type: "text", w: 3, optional: true, max: 200 },
              { ...hergang, id: "unfall_hergang", label: "Schadenschilderung", hint: "Kurz, soweit vom Kunden geschildert." }, ...polizei] },
            { legend: "Unfallgegner", fields: [
              { id: "gegner_name", label: "Name", type: "text", optional: true, max: 150 },
              { id: "gegner_kennzeichen", label: "Kennzeichen", type: "text", w: 2, plate: true, optional: true, max: 15 },
              { id: "gegner_versicherer", label: "Versicherer", type: "text", w: 4, optional: true, max: 100 },
              { id: "gegner_versicherung_schaden", label: "Versicherungsschein- / Schadennummer", type: "text", optional: true, max: 80 },
            ] },
          ],
        },
        {
          id: "abschluss", titel: "Unterlagen und Freigabe",
          groups: [
            { legend: "Unterlagen", fields: [
              { id: "dateien", label: "Dateien hochladen", type: "files", optional: true, hint: "z. B. Gutachten, Kostenvoranschlag, Fotos, Fahrzeugschein" },
              { id: "bemerkungen", label: "Bemerkungen", type: "textarea", optional: true, max: 2000 },
            ] },
            { legend: "Übermittlung", fields: [
              { id: "partner_rolle", label: "In welcher Rolle übermitteln Sie?", type: "radio", required: true, added: true,
                options: [["werkstatt", "Als reparierende Werkstatt"], ["autohaus", "Als Autohaus / Händler"], ["sonstige", "Sonstige Rolle"]] },
              { id: "partner_berechtigung", type: "check", required: true, added: true, draft: true,
                label: "Der Kunde hat uns beauftragt, diese Angaben an MT | Verkehrsrecht zu übermitteln, und wurde auf die Datenschutzhinweise der Kanzlei hingewiesen.",
                requiredMsg: "Bitte bestätigen Sie die Übermittlungsberechtigung." },
            ] },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    kontakt: {
      key: "kontakt",
      titel: "Allgemeine Anfrage",
      quelle: "Website · Kontakt",
      steps: [
        {
          id: "nachricht", titel: "Ihre Nachricht",
          groups: [{ legend: "Anliegen", fields: [
            { id: "anliegen", label: "Worum geht es?", type: "radio", required: true,
              options: [["unfall", "Verkehrsunfall"], ["owi", "Bußgeld / Ordnungswidrigkeit"], ["betrieb", "Rechtsfrage Kfz-Betrieb"], ["partnerschaft", "Zusammenarbeit als Partnerbetrieb"], ["sonstiges", "Sonstiges"]] },
            ...name, ...kontakt,
            { id: "nachricht", label: "Ihre Nachricht", type: "textarea", required: true, max: 2000 },
          ] }],
          rules: [{ oneOf: "kontakt", msg: "Bitte geben Sie mindestens eine Telefonnummer oder E-Mail-Adresse an.", focus: "mandant_telefon" }],
        },
      ],
    },
  };
})();
