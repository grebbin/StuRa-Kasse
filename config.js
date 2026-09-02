/**
 * HIER WIRD DIE APP KONFIGURIERT.
 *
 * 1. Eine Party in PARTIES anlegen oder bearbeiten.
 * 2. Bei ACTIVE_PARTY_ID die ID der aktuellen Party eintragen.
 * 3. Änderungen committen und zu GitHub pushen.
 */

const ACTIVE_PARTY_ID = "semesterparty";

const PARTIES = {
  semesterparty: {
    name: "Semesterparty",
    deposit: 1.0,
    drinks: [
      { id: "bier", abbreviation: "BI", name: "Bier", price: 2.5 },
      { id: "radler", abbreviation: "RA", name: "Radler", price: 2.5 },
      { id: "cola", abbreviation: "CO", name: "Cola", price: 2.0 },
      { id: "wasser", abbreviation: "WA", name: "Wasser", price: 1.5 },
      { id: "mate", abbreviation: "MA", name: "Mate", price: 2.5 },
      { id: "shot", abbreviation: "SH", name: "Shot", price: 1.5 },
    ],
  },

  sommerfest: {
    name: "Sommerfest",
    deposit: 0.5,
    drinks: [
      { id: "limo", abbreviation: "LI", name: "Limonade", price: 2.0 },
      { id: "wasser", abbreviation: "WA", name: "Wasser", price: 1.0 },
    ],
  },
};
