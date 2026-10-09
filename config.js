/*
 * LobbyCard-Assistent – Konfiguration
 *
 * Hier stehen alle Angaben, die sich ändern können: Einkommensgrenzen, Anlaufstellen,
 * Öffnungszeiten und die Feldnamen in den PDF-Formularen der Stadt Ulm.
 *
 * Quellen (Stand Oktober 2026):
 *  - https://www.ulm.de → LobbyCard und KinderBonusCard
 *  - Flyer „LobbyCard und KinderBonusCard“, Stand 07/2026
 *  - Antrag mit Bezug von Sozialleistungen, Stand 1/2023   (antrag_leistungen.pdf)
 *  - Antrag ohne Bezug von Sozialleistungen, Stand 09/2025 (antrag_einkommen.pdf)
 */
window.LOBBYCARD_CONFIG = {
  stand: '10/2026',

  // Optional: Links zu Impressum und Datenschutzerklärung (z. B. auf der Website der Jusos Ulm).
  // Leer lassen = Link wird nicht angezeigt.
  impressumUrl: '',
  datenschutzUrl: '',

  officialUrl: 'https://www.ulm.de/leben-in-ulm/kinder,-jugend,-familie/angebote-und-hilfe-f%C3%BCr-familien/soziale-verg%C3%BCnstigungen/lobbycard-und-kinderbonuscard',
  email: 'lobbycard@ulm.de',

  // Netto-Einkommensgrenzen pro Monat (Antrag „ohne Bezug von Sozialleistungen“, Stand 09/2025;
  // laut Flyer 07/2026 weiterhin gültig). Grenze = Grundbetrag + Zuschläge für weitere Personen.
  incomeLimit: {
    base: 1377,           // Alleinstehende
    perPerson14: 688,     // jede weitere Person ab 14 Jahren (z. B. Partner/in)
    perChildUnder14: 413, // jedes Kind unter 14 Jahren
  },

  // Postleitzahlen der Stadt Ulm (nur für einen freundlichen Hinweis bei Tippfehlern)
  ulmZips: ['89073', '89075', '89077', '89079', '89081'],

  // Altersgrenzen der Karten
  ages: { kinderBonusMin: 4, kinderBonusMax: 17, lobbyCardMin: 18 },

  // Leistungen → Kästchen im Antrag „mit Bezug von Sozialleistungen“
  benefits: [
    { id: 'buergergeld', pdfField: 'Arbeitslosengeld II' },
    { id: 'wohngeld', pdfField: 'Wohngeld' },
    { id: 'kinderzuschlag', pdfField: 'Kinderzuschlag' },
    { id: 'sozialhilfe', pdfField: 'Sozialhilfe SGB XII' },
    { id: 'asyl', pdfField: 'Asylbewerberleistungen' },
    { id: 'bafoeg', pdfField: 'Bafög oder BAB' },
    { id: 'jugendhilfe', pdfField: 'Wirtschaftliche Jugendhilfe' },
    { id: 'sonstige', pdfField: 'Sonstige' },
  ],

  // Einkommensarten = Zeilen 1–11 der Tabelle im Antrag „ohne Bezug von Sozialleistungen“
  incomeTypes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],

  // Erstanlaufstellen (EAS) der Stadt Ulm – laut Flyer Stand 07/2026
  offices: [
    {
      id: 'mitte', name: 'Erstanlaufstelle Stadtmitte/Oststadt',
      street: 'Kornhausplatz 4–6', city: '89073 Ulm', phone: '0731 161-5153', stop: 'Rathaus',
      hours: [
        { days: ['mo', 'tu'], times: '8:00–12:00 · 14:00–15:30' },
        { days: ['th'], times: '8:00–12:00 · 14:00–16:30' },
        { days: ['fr'], times: '8:00–13:00' },
      ],
    },
    {
      id: 'boefingen', name: 'Erstanlaufstelle Böfingen',
      street: 'Haslacher Weg 89–91', city: '89075 Ulm', phone: '0731 161-5249', stop: 'Haslacher Weg',
      hours: [
        { days: ['mo', 'tu'], times: '8:00–12:00 · 14:00–15:30' },
        { days: ['th'], times: '8:00–12:00 · 14:00–16:30' },
        { days: ['fr'], times: '8:00–13:00' },
      ],
    },
    {
      id: 'west', name: 'Erstanlaufstelle Weststadt/Söflingen',
      street: 'Moltkestraße 20', city: '89077 Ulm', phone: '0731 161-5361', stop: 'Theodor-Heuss-Platz',
      hours: [
        { days: ['mo', 'th'], times: '8:00–12:00 · 14:00–15:30' },
        { days: ['tu'], times: '8:00–12:00 · 14:00–16:30' },
        { days: ['fr'], times: '8:00–13:00' },
      ],
    },
    {
      id: 'eselsberg', name: 'Erstanlaufstelle Eselsberg (Bürgerzentrum)',
      street: 'Virchowstraße 4', city: '89075 Ulm', phone: '0731 161-5322', stop: 'Virchowstraße',
      hours: [
        { days: ['mo', 'th'], times: '8:00–12:00 · 14:00–15:30' },
        { days: ['tu'], times: '8:00–12:00 · 14:00–16:30' },
        { days: ['fr'], times: '8:00–13:00' },
      ],
    },
    {
      id: 'wiblingen', name: 'Erstanlaufstelle Wiblingen',
      street: 'Buchauer Straße 8–10', city: '89079 Ulm', phone: '0731 161-5030', stop: 'Tannenplatz Zentrum',
      hours: [
        { days: ['mo', 'th'], times: '8:00–12:00 · 14:00–15:30' },
        { days: ['tu'], times: '8:00–12:00 · 14:00–16:30' },
        { days: ['fr'], times: '8:00–13:00' },
      ],
    },
  ],

  // Stadtteile → zuständige Erstanlaufstelle (laut Flyer).
  // ortsverwaltung: true = Antrag kann auch bei der Ortsverwaltung abgegeben werden.
  districts: [
    { name: 'Böfingen', office: 'boefingen' },
    { name: 'Donaustetten', office: 'wiblingen', ortsverwaltung: true },
    { name: 'Donautal', office: 'west' },
    { name: 'Eggingen', office: 'west', ortsverwaltung: true },
    { name: 'Einsingen', office: 'west', ortsverwaltung: true },
    { name: 'Ermingen', office: 'west', ortsverwaltung: true },
    { name: 'Eselsberg', office: 'eselsberg' },
    { name: 'Gögglingen', office: 'wiblingen', ortsverwaltung: true },
    { name: 'Grimmelfingen', office: 'west' },
    { name: 'Jungingen', office: 'boefingen', ortsverwaltung: true },
    { name: 'Lehr', office: 'boefingen', ortsverwaltung: true },
    { name: 'Mähringen', office: 'boefingen', ortsverwaltung: true },
    { name: 'Oststadt', office: 'mitte' },
    { name: 'Söflingen', office: 'west' },
    { name: 'Stadtmitte', office: 'mitte' },
    { name: 'Unterweiler', office: 'wiblingen', ortsverwaltung: true },
    { name: 'Weststadt', office: 'west' },
    { name: 'Wiblingen', office: 'wiblingen' },
  ],

  // Die beiden PDF-Formulare der Stadt Ulm.
  // Wenn die Stadt neue Formulare veröffentlicht: PDF austauschen und prüfen, ob die Feldnamen noch stimmen.
  forms: {
    leistungen: { file: 'antrag_leistungen.pdf', typeRadio: 'Optionsfeld1', signPage: 1 },
    einkommen: { file: 'antrag_einkommen.pdf', typeRadio: 'Antragsart', signPage: 2 },
  },

  // Feldnamen in den PDFs (in beiden Formularen gleich, sofern vorhanden)
  pdfFields: {
    applicantName: 'Name Vorname der Antragstellerin  des Antragstellers Erziehungsberechtigter',
    applicantBirth: 'Geburtsdatum',
    address: 'Anschrift Straße Hausnummer Postleitzahl Ort',
    phone: 'Telefonnummer',
    partnerName: 'Name Vorname des Partners',
    partnerBirth: 'Geburtsdatum_2',
    childNames: ['Name Vorname des Kindes', 'Name Vorname des Kindes_2', 'Name Vorname des Kindes_3', 'Name Vorname des Kindes_4', 'Name Vorname des Kindes_5'],
    childBirths: ['Geburtsdatum_3', 'Geburtsdatum_4', 'Geburtsdatum_5', 'Geburtsdatum_6', 'Geburtsdatum_7'],
    incomeCell: '{person}Row{row}',               // Person 1–6, Zeile 1–11
    personTotal: 'Nettoeinkommen Person {person}',
    total: 'Gesamt',
    limit: 'Einkommensgrenze',
    difference: 'Differenz',
    householdType: 'Personen',
    // Technische Felder des Online-Portals der Stadt, die im Ausdruck nichts verloren haben
    portalFields: ['startParams', 'anzahlAnlagen', 'consentComplete', 'fileUrl', 'ofs_Sonst_Daten'],
  },

  // Auswahl „Personen“ im Einkommens-Formular (exakt wie im PDF)
  householdTypes: {
    single: 'Alleinstehende',
    couple: 'Paar ohne Kinder',
    couple1: 'Paar mit 1 Kind u14',
    couple2: 'Paar mit 2 Kindern u14',
    couple3: 'Paar mit 3 Kindern u14',
    single1: 'Alleinerziehende; 1 Kind u14',
    single2: 'Alleinerziehende; 2 Kinder u14',
    single3: 'Alleinerziehende; 3 Kinder u14',
    other: 'Sonstiges',
  },

  maxChildren: 5,       // Platz für Kinder im Formular
  incomeColumns: 6,     // Spalten in der Einkommenstabelle (Antragsteller/in, Partner/in, 4 Kinder)

  vendor: {
    pdfLib: 'vendor/pdf-lib.min.js',
    fontkit: 'vendor/fontkit.umd.min.js',
    font: 'vendor/Arimo-Regular.ttf',
  },
};
