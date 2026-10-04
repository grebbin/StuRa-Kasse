/**
 * HIER WIRD DIE APP KONFIGURIERT.
 *
 * 1. Eine Party in PARTIES anlegen oder bearbeiten.
 * 2. Bei ACTIVE_PARTY_ID die ID der aktuellen Party eintragen.
 * 3. Änderungen committen und zu GitHub pushen.
 */

const ACTIVE_PARTY_ID = "lightsout";

/**
 * DATENERFASSUNG (nur auf der Branch data-collection)
 *
 * Nach dem Bereitstellen des Google Apps Scripts wird dessen /exec-Adresse
 * hier eingetragen. Solange endpoint leer ist, werden keine Bestellungen
 * vorgemerkt oder gesendet.
 */
const DATA_COLLECTION = {
  endpoint: "https://script.google.com/macros/s/AKfycbwnwQ04W1702Rgk9S2RITm_Q1iovUz7i0Uwvp5L2W80kyWzJ3fSncWKtzEcSofL-NdW6w/exec",
  appVersion: "data-collection-v1",
};

const PARTIES = {
  semesterparty: {
    name: "Semesterparty",
    // Diese Pfandwerte erscheinen in dieser Reihenfolge im Rückgabe-Screen,
    // zum Beispiel: returnDeposits: [0.5, 1.0, 2.0]
    returnDeposits: [1.0],
    drinks: [
      // price ist der Getränkepreis, deposit das beim Verkauf berechnete Pfand.
      { id: "bier", abbreviation: "BIER", name: "Bier", price: 2.5, deposit: 1.0 },
      { id: "radler", abbreviation: "RADL", name: "Radler", price: 2.5, deposit: 1.0 },
      { id: "cock", abbreviation: "COCK", name: "Cocktail", price: 6.0, deposit: 1.0 },
      { id: "wasser", abbreviation: "WASS", name: "Wasser", price: 1.5, deposit: 1.0 },
      { id: "soft", abbreviation: "SOFT", name: "Mate, Cola, Eistee, Sprite, Limo", price: 2.5, deposit: 1.0 },
      { id: "shot", abbreviation: "SHOT", name: "Shot", price: 1.5, deposit: 1.0 },
    ],
  },

  lightsout: {
    name: "Lights Out",
    returnDeposits: [2.0],
    drinks: [
      { id: "radler", abbreviation: "RADL", name: "Radler", price: 1.5, deposit: 2.0 },
      { id: "bier", abbreviation: "BIER", name: "Bier Helles", price: 2.0, deposit: 2.0 },
      { id: "sekt", abbreviation: "SEKT", name: "Sekt", price: 3.0, deposit: 0 },
      { id: "wein", abbreviation: "WEIN", name: "Wein", price: 3.0, deposit: 0 },
      { id: "aperol", abbreviation: "APRL", name: "Aperol Spritz", price: 4.0, deposit: 0 },
      { id: "hugo", abbreviation: "HUGO", name: "Hugo", price: 3.5, deposit: 0 },
      { id: "gintonic", abbreviation: "GIN", name: "Gin Tonic", price: 4.0, deposit: 0 },
      { id: "mule", abbreviation: "MULE", name: "FHP Mule", price: 4.0, deposit: 0 },
      { id: "turbomate", abbreviation: "TUBO", name: "Turbomate", price: 3.5, deposit: 0 },
      { id: "sektbronte", abbreviation: "BRON", name: "Sekt-Bronte", price: 3.5, deposit: 0 },
      { id: "shots", abbreviation: "SHOT", name: "Shots", price: 1.0, deposit: 0 },
      { id: "freigetraenk", abbreviation: "FREI", name: "Freigetränk (Wertmarke)", price: 0.0, deposit: 0 },

    ],
  },
};
