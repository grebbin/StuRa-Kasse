/**
 * Google-Apps-Script-Endpunkt für die Branch data-collection.
 *
 * Einrichtung:
 * 1. Diesen Inhalt in das an die Tabelle gebundene Apps Script kopieren.
 * 2. setupSheets() einmal im Editor ausführen und die Berechtigung bestätigen.
 * 3. In "Einstellungen" B2 auf AKTIV stellen.
 * 4. Als Web-App bereitstellen: Ausführen als "Ich", Zugriff "Jeder".
 * 5. Die erzeugte /exec-URL in config.js bei DATA_COLLECTION.endpoint eintragen.
 */

const SPREADSHEET_ID = "1rqEwiWmW1wzzYA9ft0LsEqusnDVVMP67z7MMHRqna6c";

const SHEETS = Object.freeze({
  settings: "Einstellungen",
  orders: "Bestellungen",
  items: "Positionen",
  refunds: "Pfandrückgabe",
});

const ORDER_HEADERS = [
  "Bestell-ID",
  "Serverzeit",
  "Gerätezeit",
  "Party-ID",
  "Party",
  "Getränkeanzahl",
  "Warenwert",
  "Verkaufspfand",
  "Pfand zurück",
  "Gesamt",
  "Währung",
  "App-Version",
  "Schema-Version",
];

const ITEM_HEADERS = [
  "Bestell-ID",
  "Getränke-ID",
  "Abkürzung",
  "Getränk",
  "Menge",
  "Preis je Stück",
  "Pfand je Stück",
  "Warenwert",
  "Verkaufspfand",
  "Zeilensumme",
  "Preis angepasst",
];

const REFUND_HEADERS = [
  "Bestell-ID",
  "Pfandwert",
  "Menge",
  "Abzug",
];

function setupSheets() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settings = ensureSettingsSheet_(spreadsheet);
  const orders = ensureDataSheet_(spreadsheet, SHEETS.orders, ORDER_HEADERS);
  const items = ensureDataSheet_(spreadsheet, SHEETS.items, ITEM_HEADERS);
  const refunds = ensureDataSheet_(spreadsheet, SHEETS.refunds, REFUND_HEADERS);

  settings.setFrozenRows(1);
  orders.setFrozenRows(1);
  items.setFrozenRows(1);
  refunds.setFrozenRows(1);

  orders.getRange("B:C").setNumberFormat("dd.mm.yyyy hh:mm:ss");
  orders.getRange("G:J").setNumberFormat("0.00 [$€-407]");
  items.getRange("F:J").setNumberFormat("0.00 [$€-407]");
  refunds.getRange("B:B").setNumberFormat("0.00 [$€-407]");
  refunds.getRange("D:D").setNumberFormat("0.00 [$€-407]");

  [settings, orders, items, refunds].forEach((sheet) => {
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });

  return "Tabellen vorbereitet. Datenerfassung steht zunächst auf INAKTIV.";
}

function doPost(event) {
  let result;

  try {
    const payload = event.parameter.payload || event.postData.contents;
    result = processOrder_(validateOrder_(JSON.parse(payload)));
  } catch (error) {
    console.error(error);
    result = { status: "rejected", message: String(error.message || error) };
  }

  return postResponse_(event, result);
}

function processOrder_(order) {
  if (!isCollectionActive_()) {
    return { status: "inactive", orderId: order.orderId };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!isCollectionActive_()) {
      return { status: "inactive", orderId: order.orderId };
    }

    if (orderExists_(order.orderId)) {
      return { status: "duplicate", orderId: order.orderId };
    }

    writeOrder_(order);
    SpreadsheetApp.flush();
    return { status: "recorded", orderId: order.orderId };
  } finally {
    lock.releaseLock();
  }
}

function doGet(event) {
  const callback = event.parameter.callback;
  let result;

  try {
    if (event.parameter.action === "status") {
      const orderId = validateId_(event.parameter.orderId, "Bestell-ID");

      if (orderExists_(orderId)) {
        result = { status: "recorded", orderId };
      } else if (!isCollectionActive_()) {
        result = { status: "inactive", orderId };
      } else {
        result = { status: "missing", orderId };
      }
    } else {
      result = {
        status: "ok",
        collection: isCollectionActive_() ? "active" : "inactive",
      };
    }
  } catch (error) {
    result = { status: "error", message: String(error.message || error) };
  }

  return callback ? jsonpResponse_(callback, result) : jsonResponse_(result);
}

function writeOrder_(order) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ordersSheet = requireSheet_(spreadsheet, SHEETS.orders);
  const itemsSheet = requireSheet_(spreadsheet, SHEETS.items);
  const refundsSheet = requireSheet_(spreadsheet, SHEETS.refunds);
  const receivedAt = new Date();
  const clientTime = new Date(order.createdAt);

  appendRows_(ordersSheet, [[
    order.orderId,
    receivedAt,
    clientTime,
    safeText_(order.partyId),
    safeText_(order.partyName),
    order.totals.drinkCount,
    centsToEuros_(order.totals.drinkPriceCents),
    centsToEuros_(order.totals.soldDepositCents),
    centsToEuros_(order.totals.returnedDepositCents),
    centsToEuros_(order.totals.finalCents),
    order.currency,
    safeText_(order.appVersion),
    order.schemaVersion,
  ]]);

  appendRows_(itemsSheet, order.items.map((item) => [
    order.orderId,
    safeText_(item.drinkId),
    safeText_(item.abbreviation),
    safeText_(item.name),
    item.quantity,
    centsToEuros_(item.unitPriceCents),
    centsToEuros_(item.unitDepositCents),
    centsToEuros_(item.linePriceCents),
    centsToEuros_(item.lineDepositCents),
    centsToEuros_(item.lineTotalCents),
    item.priceAdjusted ? "JA" : "NEIN",
  ]));

  appendRows_(refundsSheet, order.returnedDeposits.map((entry) => [
    order.orderId,
    centsToEuros_(entry.unitDepositCents),
    entry.quantity,
    centsToEuros_(entry.totalCents),
  ]));
}

function validateOrder_(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Ungültiger Bestelldatensatz.");
  }

  const order = {
    schemaVersion: input.schemaVersion,
    orderId: validateId_(input.orderId, "Bestell-ID"),
    createdAt: validateDate_(input.createdAt),
    appVersion: validateText_(input.appVersion, "App-Version", 80),
    partyId: validateId_(input.partyId, "Party-ID"),
    partyName: validateText_(input.partyName, "Party", 120),
    currency: input.currency,
    items: input.items,
    returnedDeposits: input.returnedDeposits,
    totals: input.totals,
  };

  if (order.schemaVersion !== 1 || order.currency !== "EUR") {
    throw new Error("Nicht unterstützte Datenversion oder Währung.");
  }
  if (!Array.isArray(order.items) || order.items.length < 1 || order.items.length > 100) {
    throw new Error("Die Getränkeliste ist ungültig.");
  }
  if (!Array.isArray(order.returnedDeposits) || order.returnedDeposits.length > 50) {
    throw new Error("Die Pfandrückgabe ist ungültig.");
  }

  order.items = order.items.map(validateItem_);
  order.returnedDeposits = order.returnedDeposits.map(validateRefund_);

  const calculatedTotals = {
    drinkCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    drinkPriceCents: order.items.reduce((sum, item) => sum + item.linePriceCents, 0),
    soldDepositCents: order.items.reduce((sum, item) => sum + item.lineDepositCents, 0),
    returnedDepositCents: order.returnedDeposits.reduce(
      (sum, entry) => sum + entry.totalCents,
      0,
    ),
  };
  calculatedTotals.finalCents = calculatedTotals.drinkPriceCents
    + calculatedTotals.soldDepositCents
    - calculatedTotals.returnedDepositCents;

  Object.entries(calculatedTotals).forEach(([key, value]) => {
    if (!Number.isInteger(order.totals?.[key]) || order.totals[key] !== value) {
      throw new Error(`Gesamtsumme ${key} stimmt nicht.`);
    }
  });

  order.totals = calculatedTotals;
  return order;
}

function validateItem_(item) {
  const validated = {
    drinkId: validateId_(item?.drinkId, "Getränke-ID"),
    abbreviation: validateText_(item?.abbreviation, "Abkürzung", 20),
    name: validateText_(item?.name, "Getränkename", 200),
    quantity: validateInteger_(item?.quantity, "Menge", 1, 1000),
    unitPriceCents: validateInteger_(item?.unitPriceCents, "Getränkepreis", 0, 10000000),
    unitDepositCents: validateInteger_(item?.unitDepositCents, "Pfandwert", 0, 10000000),
    priceAdjusted: item?.priceAdjusted === true,
  };

  validated.linePriceCents = validated.unitPriceCents * validated.quantity;
  validated.lineDepositCents = validated.unitDepositCents * validated.quantity;
  validated.lineTotalCents = validated.linePriceCents + validated.lineDepositCents;

  if (
    item.linePriceCents !== validated.linePriceCents
    || item.lineDepositCents !== validated.lineDepositCents
    || item.lineTotalCents !== validated.lineTotalCents
  ) {
    throw new Error("Eine Getränke-Zeilensumme stimmt nicht.");
  }

  return validated;
}

function validateRefund_(entry) {
  const validated = {
    unitDepositCents: validateInteger_(entry?.unitDepositCents, "Pfandwert", 1, 10000000),
    quantity: validateInteger_(entry?.quantity, "Pfandmenge", 1, 1000),
  };
  validated.totalCents = validated.unitDepositCents * validated.quantity;

  if (entry.totalCents !== validated.totalCents) {
    throw new Error("Eine Pfand-Zeilensumme stimmt nicht.");
  }

  return validated;
}

function validateInteger_(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} ist ungültig.`);
  }
  return value;
}

function validateId_(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(value)) {
    throw new Error(`${label} ist ungültig.`);
  }
  return value;
}

function validateText_(value, label, maximumLength) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) {
    throw new Error(`${label} ist ungültig.`);
  }
  return value;
}

function validateDate_(value) {
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) {
    throw new Error("Gerätezeit ist ungültig.");
  }
  return value;
}

function isCollectionActive_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settings = spreadsheet.getSheetByName(SHEETS.settings);

  if (!settings) {
    return false;
  }

  return String(settings.getRange("B2").getDisplayValue()).trim().toUpperCase() === "AKTIV";
}

function orderExists_(orderId) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEETS.orders);

  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  return Boolean(
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(orderId)
      .matchEntireCell(true)
      .findNext(),
  );
}

function ensureSettingsSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEETS.settings)
    || spreadsheet.insertSheet(SHEETS.settings);

  if (sheet.getRange("A1:B2").isBlank()) {
    sheet.getRange("A1:B2").setValues([
      ["Einstellung", "Wert"],
      ["Datenübertragung", "INAKTIV"],
    ]);
  } else if (sheet.getRange("A2").getValue() !== "Datenübertragung") {
    throw new Error("Das Tabellenblatt Einstellungen enthält bereits andere Daten.");
  }

  sheet.getRange("A1:B1").setFontWeight("bold");
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["AKTIV", "INAKTIV"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange("B2").setDataValidation(validation);
  return sheet;
}

function ensureDataSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);

  if (headerRange.isBlank()) {
    headerRange.setValues([headers]);
  } else if (headerRange.getValues()[0].join("|") !== headers.join("|")) {
    throw new Error(`Das Tabellenblatt ${name} hat unerwartete Spalten.`);
  }

  headerRange.setFontWeight("bold");
  return sheet;
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error(`Tabellenblatt ${name} fehlt. Bitte setupSheets() ausführen.`);
  }
  return sheet;
}

function appendRows_(sheet, rows) {
  if (rows.length === 0) {
    return;
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function safeText_(value) {
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function centsToEuros_(value) {
  return value / 100;
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function postResponse_(event, value) {
  const callbackToken = String(event.parameter.callbackToken || "");

  if (!callbackToken) {
    return jsonResponse_(value);
  }
  if (!/^[A-Za-z0-9-]{1,100}$/.test(callbackToken)) {
    return jsonResponse_({ status: "rejected", message: "Ungültiges Callback-Token." });
  }

  const message = JSON.stringify({
    source: "stura-kasse-data-collection",
    token: callbackToken,
    response: value,
  }).replace(/</g, "\\u003c");

  return HtmlService
    .createHtmlOutput(`<script>top.postMessage(${message}, "*");</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function jsonpResponse_(callback, value) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/.test(callback)) {
    return jsonResponse_({ status: "error", message: "Ungültiger Callback." });
  }

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(value)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
