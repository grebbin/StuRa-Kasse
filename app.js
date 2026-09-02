/* global ACTIVE_PARTY_ID, PARTIES */

"use strict";

// ------------------------------
// Zustand und Konfiguration
// ------------------------------

const party = PARTIES[ACTIVE_PARTY_ID];

if (!party) {
  throw new Error(
    `Die Party "${ACTIVE_PARTY_ID}" wurde nicht in config.js gefunden.`,
  );
}

validateParty(party);

const state = {
  // Map speichert: Getränke-ID -> ausgewählte Anzahl
  quantities: new Map(),
  depositCount: 0,
};

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const elements = {
  screens: {
    products: document.querySelector("#products-screen"),
    deposit: document.querySelector("#deposit-screen"),
    receipt: document.querySelector("#receipt-screen"),
  },
  partyName: document.querySelector("#party-name"),
  productGrid: document.querySelector("#product-grid"),
  resetButton: document.querySelector("#reset-button"),
  itemCount: document.querySelector("#item-count"),
  drinkTotal: document.querySelector("#drink-total"),
  toDepositButton: document.querySelector("#to-deposit-button"),
  depositRate: document.querySelector("#deposit-rate"),
  depositMinus: document.querySelector("#deposit-minus"),
  depositPlus: document.querySelector("#deposit-plus"),
  depositCount: document.querySelector("#deposit-count"),
  depositTotal: document.querySelector("#deposit-total"),
  calculateButton: document.querySelector("#calculate-button"),
  receiptPartyName: document.querySelector("#receipt-party-name"),
  receiptTime: document.querySelector("#receipt-time"),
  receiptItems: document.querySelector("#receipt-items"),
  receiptTotal: document.querySelector("#receipt-total"),
  receiptTitle: document.querySelector("#receipt-title"),
  grandTotal: document.querySelector("#grand-total"),
  editButton: document.querySelector("#edit-button"),
  finishButton: document.querySelector("#finish-button"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

// ------------------------------
// Start und Ereignisse
// ------------------------------

initialize();

function initialize() {
  document.title = `${party.name} · Kasse`;
  elements.partyName.textContent = party.name;
  elements.depositRate.textContent = `${formatMoney(party.deposit)} Pfand pro Stück`;

  renderProductTiles();
  renderOrder();
  renderDeposit();
  bindEvents();
}

function bindEvents() {
  elements.resetButton.addEventListener("click", resetOrderWithFeedback);
  elements.toDepositButton.addEventListener("click", () => showScreen("deposit"));

  document.querySelectorAll("[data-back-to]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.backTo));
  });

  elements.depositMinus.addEventListener("click", () => changeDeposit(-1));
  elements.depositPlus.addEventListener("click", () => changeDeposit(1));

  elements.calculateButton.addEventListener("click", showReceipt);
  elements.editButton.addEventListener("click", () => showScreen("products"));
  elements.finishButton.addEventListener("click", finishOrder);
}

// ------------------------------
// Getränkeauswahl
// ------------------------------

function renderProductTiles() {
  elements.productGrid.replaceChildren();

  party.drinks.forEach((drink) => {
    const tile = document.createElement("article");
    tile.className = "product-tile";
    tile.dataset.drinkId = drink.id;

    const addButton = document.createElement("button");
    addButton.className = "product-tile__add";
    addButton.type = "button";
    addButton.setAttribute("aria-label", `${drink.name} für ${formatMoney(drink.price)} hinzufügen`);
    addButton.innerHTML = `
      <span class="product-tile__abbreviation">${escapeHtml(drink.abbreviation)}</span>
      <span class="product-tile__name">${escapeHtml(drink.name)}</span>
      <span class="product-tile__price">${formatMoney(drink.price)}</span>
    `;
    addButton.addEventListener("click", () => changeDrinkQuantity(drink.id, 1));

    const countBadge = document.createElement("span");
    countBadge.className = "product-tile__count";
    countBadge.dataset.countFor = drink.id;
    countBadge.hidden = true;

    const removeButton = document.createElement("button");
    removeButton.className = "product-tile__remove";
    removeButton.type = "button";
    removeButton.dataset.removeFor = drink.id;
    removeButton.setAttribute("aria-label", `Einmal ${drink.name} entfernen`);
    const removeIcon = document.createElement("img");
    removeIcon.className = "button-icon";
    removeIcon.src = "assets/icons/remove.svg";
    removeIcon.alt = "";
    removeIcon.setAttribute("aria-hidden", "true");
    removeButton.append(removeIcon);
    removeButton.hidden = true;
    removeButton.addEventListener("click", () => changeDrinkQuantity(drink.id, -1));

    tile.append(addButton, countBadge, removeButton);
    elements.productGrid.append(tile);
  });
}

function changeDrinkQuantity(drinkId, difference) {
  const currentQuantity = state.quantities.get(drinkId) ?? 0;
  const nextQuantity = Math.max(0, currentQuantity + difference);

  if (nextQuantity === 0) {
    state.quantities.delete(drinkId);
  } else {
    state.quantities.set(drinkId, nextQuantity);
  }

  renderOrder();
}

function renderOrder() {
  const totalCount = getTotalDrinkCount();
  const totalPrice = getDrinkTotal();

  // Anzahl und Minus-Schaltfläche direkt an jeder Getränkekachel aktualisieren.
  party.drinks.forEach((drink) => {
    const quantity = state.quantities.get(drink.id) ?? 0;
    const tile = elements.productGrid.querySelector(`[data-drink-id="${drink.id}"]`);
    const badge = tile.querySelector(`[data-count-for="${drink.id}"]`);
    const removeButton = tile.querySelector(`[data-remove-for="${drink.id}"]`);

    tile.classList.toggle("product-tile--selected", quantity > 0);
    badge.textContent = quantity;
    badge.hidden = quantity === 0;
    removeButton.hidden = quantity === 0;
  });

  elements.itemCount.textContent = `${totalCount} ${totalCount === 1 ? "Getränk" : "Getränke"}`;
  elements.drinkTotal.textContent = formatMoney(totalPrice);
  elements.resetButton.disabled = totalCount === 0;
  elements.toDepositButton.disabled = totalCount === 0;
}

function resetOrderWithFeedback() {
  state.quantities.clear();
  state.depositCount = 0;
  renderOrder();
  renderDeposit();
  showToast("Bestellung zurückgesetzt");
}

// ------------------------------
// Pfand
// ------------------------------

function changeDeposit(difference) {
  state.depositCount = Math.max(0, state.depositCount + difference);
  renderDeposit();
}

function renderDeposit() {
  elements.depositCount.value = state.depositCount;
  elements.depositCount.textContent = state.depositCount;
  elements.depositTotal.textContent = `− ${formatMoney(state.depositCount * party.deposit)}`;
  elements.depositMinus.disabled = state.depositCount === 0;
  elements.calculateButton.textContent = state.depositCount === 0
    ? "Berechnen ohne Pfand"
    : "Berechnen mit Pfand";
}

// ------------------------------
// Bon und Abschluss
// ------------------------------

function showReceipt() {
  const drinkTotal = getDrinkTotal();
  const depositTotal = state.depositCount * party.deposit;
  const finalTotal = drinkTotal - depositTotal;

  elements.receiptPartyName.textContent = party.name;
  elements.receiptTime.textContent = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  elements.receiptItems.replaceChildren();

  getSelectedDrinks().forEach(({ drink, quantity }) => {
    elements.receiptItems.append(
      createReceiptRow(`${quantity}× ${drink.name}`, drink.price * quantity),
    );
  });

  if (state.depositCount > 0) {
    elements.receiptItems.append(
      createReceiptRow(`${state.depositCount}× Pfand zurück`, -depositTotal, true),
    );
  } else {
    elements.receiptItems.append(createReceiptNote("Kein Pfand zurück"));
  }

  const formattedTotal = formatMoney(finalTotal);
  elements.receiptTotal.textContent = formattedTotal;
  elements.receiptTitle.textContent = finalTotal < 0 ? "Rückgeld" : "Zu zahlen";
  elements.receiptTitle.classList.toggle("receipt-title--refund", finalTotal < 0);
  elements.grandTotal.textContent = formattedTotal;
  elements.grandTotal.classList.toggle("grand-total--negative", finalTotal < 0);

  showScreen("receipt");
}

function createReceiptRow(label, amount, isDeduction = false) {
  const row = document.createElement("li");
  row.className = "receipt__item";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  const amountElement = document.createElement("span");
  amountElement.textContent = `${isDeduction ? "− " : ""}${formatMoney(Math.abs(amount))}`;
  amountElement.classList.toggle("receipt__deduction", isDeduction);

  row.append(labelElement, amountElement);
  return row;
}

function createReceiptNote(text) {
  const row = document.createElement("li");
  row.className = "receipt__note";
  row.textContent = text;
  return row;
}

function finishOrder() {
  state.quantities.clear();
  state.depositCount = 0;
  renderOrder();
  renderDeposit();
  showScreen("products");
  showToast("Bereit für die nächste Bestellung");
}

// ------------------------------
// Hilfsfunktionen
// ------------------------------

function showScreen(screenName) {
  Object.entries(elements.screens).forEach(([name, screen]) => {
    const isActive = name === screenName;
    screen.hidden = !isActive;
    screen.classList.toggle("screen--active", isActive);
  });

  window.scrollTo({ top: 0, behavior: "instant" });
}

function getSelectedDrinks() {
  return party.drinks
    .map((drink) => ({ drink, quantity: state.quantities.get(drink.id) ?? 0 }))
    .filter(({ quantity }) => quantity > 0);
}

function getTotalDrinkCount() {
  return [...state.quantities.values()].reduce((sum, quantity) => sum + quantity, 0);
}

function getDrinkTotal() {
  return getSelectedDrinks().reduce(
    (sum, { drink, quantity }) => sum + drink.price * quantity,
    0,
  );
}

function formatMoney(value) {
  // Verhindert die unschöne Anzeige „−0,00 €“ durch Rundungsartefakte.
  const safeValue = Math.abs(value) < 0.005 ? 0 : value;
  return euro.format(safeValue);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("toast--visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast--visible");
  }, 1800);
}

function validateParty(partyToValidate) {
  if (!partyToValidate.name || !Array.isArray(partyToValidate.drinks)) {
    throw new Error("Die aktive Party braucht einen Namen und eine Getränkeliste.");
  }

  if (!Number.isFinite(partyToValidate.deposit) || partyToValidate.deposit < 0) {
    throw new Error("Der Pfandwert muss eine positive Zahl oder 0 sein.");
  }

  const ids = new Set();
  partyToValidate.drinks.forEach((drink) => {
    if (!drink.id || !drink.abbreviation || !drink.name || !Number.isFinite(drink.price)) {
      throw new Error("Jedes Getränk braucht ID, Abkürzung, Namen und Preis.");
    }
    if (ids.has(drink.id)) {
      throw new Error(`Die Getränke-ID "${drink.id}" ist doppelt vergeben.`);
    }
    if (!/^[a-z0-9-]+$/.test(drink.id)) {
      throw new Error(
        `Die Getränke-ID "${drink.id}" darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.`,
      );
    }
    ids.add(drink.id);
  });
}

function escapeHtml(value) {
  const temporaryElement = document.createElement("span");
  temporaryElement.textContent = value;
  return temporaryElement.innerHTML;
}
