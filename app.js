/* global ACTIVE_PARTY_ID, PARTIES */

"use strict";

// ------------------------------
// Zustand und Konfiguration
// ------------------------------

const configuredParty = PARTIES[ACTIVE_PARTY_ID];

if (!configuredParty) {
  throw new Error(
    `Die Party "${ACTIVE_PARTY_ID}" wurde nicht in config.js gefunden.`,
  );
}

validateParty(configuredParty);

const PRICE_OVERRIDE_STORAGE_KEY = `stura-kasse:price-overrides:${ACTIVE_PARTY_ID}`;
const party = {
  ...configuredParty,
  drinks: configuredParty.drinks.map((drink) => ({ ...drink })),
};

applyStoredPriceOverrides();

const state = {
  // Map speichert: Getränke-ID -> ausgewählte Anzahl
  quantities: new Map(),
  // Map speichert: Pfandwert in Cent -> zurückgegebene Anzahl
  depositCounts: new Map(),
  editingDrinkId: null,
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
  depositCounterList: document.querySelector("#deposit-counter-list"),
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
  priceDialog: document.querySelector("#price-dialog"),
  priceForm: document.querySelector("#price-form"),
  priceDialogTitle: document.querySelector("#price-dialog-title"),
  priceDialogDefault: document.querySelector("#price-dialog-default"),
  editDrinkPrice: document.querySelector("#edit-drink-price"),
  editDrinkDeposit: document.querySelector("#edit-drink-deposit"),
  priceResetButton: document.querySelector("#price-reset-button"),
  priceResetAllButton: document.querySelector("#price-reset-all-button"),
  priceDialogClose: document.querySelector("#price-dialog-close"),
  toast: document.querySelector("#toast"),
};

let toastTimer;
let priceDialogViewportHeight;
let priceDialogViewportFrame;

// ------------------------------
// Start und Ereignisse
// ------------------------------

initialize();

function initialize() {
  document.title = `${party.name} · Kasse`;
  elements.partyName.textContent = party.name;

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

  elements.calculateButton.addEventListener("click", showReceipt);
  elements.editButton.addEventListener("click", () => showScreen("products"));
  elements.finishButton.addEventListener("click", finishOrder);

  elements.priceForm.addEventListener("submit", saveEditedDrinkPrices);
  elements.priceResetButton.addEventListener("click", resetEditedDrinkPrices);
  elements.priceResetAllButton.addEventListener("click", resetAllDrinkPrices);
  elements.priceDialogClose.addEventListener("click", closePriceDialog);
  [elements.editDrinkPrice, elements.editDrinkDeposit].forEach((input) => {
    input.addEventListener("blur", () => formatMoneyInputField(input));
    input.addEventListener("input", updatePriceResetButtons);
  });
  elements.priceDialog.addEventListener("focusin", (event) => {
    if (event.target.matches(".price-field__input input")) {
      elements.priceDialog.classList.add("price-dialog--input-active");
      schedulePriceDialogViewportUpdate();
    }
  });
  elements.priceDialog.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!elements.priceDialog.contains(document.activeElement)) {
        elements.priceDialog.classList.remove("price-dialog--input-active");
      }
    });
  });
  elements.priceDialog.addEventListener("click", closePriceDialogFromBackdrop);
  elements.priceDialog.addEventListener("close", () => {
    state.editingDrinkId = null;
    priceDialogViewportHeight = undefined;
    elements.priceDialog.classList.remove(
      "price-dialog--input-active",
      "price-dialog--keyboard-open",
    );
    elements.priceDialog.style.removeProperty("--visible-viewport-top");
    elements.priceDialog.style.removeProperty("--visible-viewport-height");
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", schedulePriceDialogViewportUpdate);
    window.visualViewport.addEventListener("scroll", schedulePriceDialogViewportUpdate);
  }
}

// ------------------------------
// Getränkeauswahl
// ------------------------------

function renderProductTiles() {
  elements.productGrid.replaceChildren();

  party.drinks.forEach((drink) => {
    const usesDefaultValues = drinkUsesDefaultValues(drink);
    const tile = document.createElement("article");
    tile.className = "product-tile";
    tile.dataset.drinkId = drink.id;

    const addButton = document.createElement("button");
    addButton.className = "product-tile__add";
    addButton.type = "button";
    addButton.title = "Lange drücken, um Preis und Pfand anzupassen";
    const depositLabel = drink.deposit > 0
      ? ` + ${formatMoney(drink.deposit)} Pfand`
      : "";
    addButton.setAttribute(
      "aria-label",
      `${drink.name} für ${formatMoney(drink.price)}${depositLabel} hinzufügen`,
    );
    addButton.innerHTML = `
      <span class="product-tile__abbreviation${drink.abbreviation.length > 2 ? " product-tile__abbreviation--long" : ""}">${escapeHtml(drink.abbreviation)}</span>
      <span class="product-tile__name">${escapeHtml(drink.name)}</span>
      <span class="product-tile__price${usesDefaultValues ? "" : " product-tile__price--overridden"}">
        <span>${formatMoney(drink.price)}</span>${drink.deposit > 0 ? `<span>+ ${formatMoney(drink.deposit)}</span>` : ""}
      </span>
    `;
    attachDrinkTileInteractions(addButton, drink.id);

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

function attachDrinkTileInteractions(button, drinkId) {
  const longPressDuration = 600;
  const movementTolerance = 12;
  let pressTimer;
  let pointerStart;
  let suppressClickUntil = 0;

  const cancelLongPress = () => {
    window.clearTimeout(pressTimer);
    pressTimer = undefined;
    pointerStart = undefined;
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    cancelLongPress();
    pointerStart = { x: event.clientX, y: event.clientY };
    pressTimer = window.setTimeout(() => {
      suppressClickUntil = Date.now() + 1000;
      openPriceDialog(drinkId);
      cancelLongPress();
    }, longPressDuration);
  });

  button.addEventListener("pointermove", (event) => {
    if (!pointerStart) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y,
    );

    if (distance > movementTolerance) {
      cancelLongPress();
    }
  });

  button.addEventListener("pointerup", cancelLongPress);
  button.addEventListener("pointercancel", cancelLongPress);
  button.addEventListener("pointerleave", cancelLongPress);

  button.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      return;
    }

    changeDrinkQuantity(drinkId, 1);
  });

  // Am Desktop steht Rechtsklick als Alternative zum langen Drücken bereit.
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    suppressClickUntil = Date.now() + 1000;
    openPriceDialog(drinkId);
    cancelLongPress();
  });
}

function openPriceDialog(drinkId) {
  const drink = party.drinks.find((entry) => entry.id === drinkId);
  const defaultDrink = getConfiguredDrink(drinkId);

  if (!drink || !defaultDrink || elements.priceDialog.open) {
    return;
  }

  state.editingDrinkId = drinkId;
  elements.priceDialogTitle.textContent = `${drink.abbreviation} · ${drink.name}`;
  elements.editDrinkPrice.value = formatMoneyInput(drink.price);
  elements.editDrinkDeposit.value = formatMoneyInput(drink.deposit);
  elements.priceDialogDefault.textContent = `Standard: ${formatMoney(defaultDrink.price)} + ${formatMoney(defaultDrink.deposit)} Pfand`;
  updatePriceResetButtons();
  elements.priceDialog.showModal();
  priceDialogViewportHeight = window.visualViewport?.height ?? window.innerHeight;
  elements.priceDialog.focus();
}

function closePriceDialog() {
  elements.priceDialog.close();
}

function closePriceDialogFromBackdrop(event) {
  if (event.target !== elements.priceDialog) {
    return;
  }

  const dialogBounds = elements.priceDialog.getBoundingClientRect();
  const clickedOutsideDialog = (
    event.clientX < dialogBounds.left
    || event.clientX > dialogBounds.right
    || event.clientY < dialogBounds.top
    || event.clientY > dialogBounds.bottom
  );

  if (clickedOutsideDialog) {
    closePriceDialog();
  }
}

function schedulePriceDialogViewportUpdate() {
  window.cancelAnimationFrame(priceDialogViewportFrame);
  priceDialogViewportFrame = window.requestAnimationFrame(updatePriceDialogViewport);
}

function updatePriceDialogViewport() {
  if (!elements.priceDialog.open || !window.visualViewport) {
    return;
  }

  const viewport = window.visualViewport;
  const baselineHeight = priceDialogViewportHeight ?? viewport.height;
  const keyboardIsOpen = viewport.height < baselineHeight - 80;

  elements.priceDialog.classList.toggle(
    "price-dialog--keyboard-open",
    keyboardIsOpen,
  );
  elements.priceDialog.style.setProperty(
    "--visible-viewport-top",
    `${viewport.offsetTop + 12}px`,
  );
  elements.priceDialog.style.setProperty(
    "--visible-viewport-height",
    `${Math.max(220, viewport.height - 24)}px`,
  );

  if (keyboardIsOpen && document.activeElement?.matches(".price-field__input input")) {
    document.activeElement.closest(".price-field").scrollIntoView({
      block: "center",
      behavior: "auto",
    });
  }
}

function saveEditedDrinkPrices(event) {
  event.preventDefault();

  if (!elements.priceForm.reportValidity()) {
    return;
  }

  const drink = party.drinks.find((entry) => entry.id === state.editingDrinkId);
  const price = parseMoneyInput(elements.editDrinkPrice.value);
  const deposit = parseMoneyInput(elements.editDrinkDeposit.value);

  if (!drink || price === null || deposit === null) {
    showToast("Bitte gültige Beträge eingeben");
    return;
  }

  drink.price = price;
  drink.deposit = deposit;
  const wasStored = persistDrinkOverride(drink);

  renderProductTiles();
  renderOrder();
  renderDeposit();
  closePriceDialog();
  showToast(
    wasStored
      ? `${drink.abbreviation}: Preise gespeichert`
      : "Geändert, aber nicht dauerhaft gespeichert",
  );
}

function resetEditedDrinkPrices() {
  const drink = party.drinks.find((entry) => entry.id === state.editingDrinkId);
  const defaultDrink = getConfiguredDrink(state.editingDrinkId);

  if (!drink || !defaultDrink) {
    return;
  }

  drink.price = defaultDrink.price;
  drink.deposit = defaultDrink.deposit;
  const wasStored = removeDrinkOverride(drink.id);

  renderProductTiles();
  renderOrder();
  renderDeposit();
  closePriceDialog();
  showToast(
    wasStored
      ? `${drink.abbreviation}: Standardwerte wiederhergestellt`
      : "Zurückgesetzt, aber Gerätespeicher nicht verfügbar",
  );
}

function resetAllDrinkPrices() {
  party.drinks.forEach((drink) => {
    const defaultDrink = getConfiguredDrink(drink.id);
    drink.price = defaultDrink.price;
    drink.deposit = defaultDrink.deposit;
  });

  const wasStored = writePriceOverrides({});

  renderProductTiles();
  renderOrder();
  renderDeposit();
  closePriceDialog();
  showToast(
    wasStored
      ? "Alle Werte wurden zurückgesetzt"
      : "Zurückgesetzt, aber Gerätespeicher nicht verfügbar",
  );
}

function updatePriceResetButtons() {
  const defaultDrink = getConfiguredDrink(state.editingDrinkId);
  const enteredPrice = parseMoneyInput(elements.editDrinkPrice.value);
  const enteredDeposit = parseMoneyInput(elements.editDrinkDeposit.value);
  const currentDrinkUsesDefaults = Boolean(
    defaultDrink
      && enteredPrice === defaultDrink.price
      && enteredDeposit === defaultDrink.deposit,
  );

  elements.priceResetButton.disabled = currentDrinkUsesDefaults;
  elements.priceResetAllButton.disabled = !hasDrinkPriceOverrides();
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
  state.depositCounts.clear();
  renderOrder();
  renderDeposit();
  showToast("Bestellung geleert");
}

// ------------------------------
// Pfand
// ------------------------------

function changeDeposit(depositCents, difference) {
  const currentCount = state.depositCounts.get(depositCents) ?? 0;
  const nextCount = Math.max(0, currentCount + difference);

  if (nextCount === 0) {
    state.depositCounts.delete(depositCents);
  } else {
    state.depositCounts.set(depositCents, nextCount);
  }

  renderDeposit();
}

function renderDeposit() {
  const depositValues = getReturnDepositValues();
  const totalCount = getReturnedDepositCount();

  elements.depositCounterList.replaceChildren();

  depositValues.forEach((depositCents) => {
    elements.depositCounterList.append(createDepositCounter(depositCents));
  });

  if (depositValues.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "deposit-counter-list__empty";
    emptyMessage.textContent = "Keine Pfandwerte eingerichtet";
    elements.depositCounterList.append(emptyMessage);
  }

  elements.depositTotal.textContent = `− ${formatMoney(getReturnedDepositTotal())}`;
  elements.calculateButton.textContent = totalCount === 0
    ? "Berechnen ohne Pfand"
    : "Berechnen mit Pfand";
}

function createDepositCounter(depositCents) {
  const depositValue = depositCents / 100;
  const count = state.depositCounts.get(depositCents) ?? 0;
  const card = document.createElement("section");
  card.className = "deposit-counter-card";
  card.setAttribute("aria-label", `Pfand zu ${formatMoney(depositValue)}`);

  const rate = document.createElement("p");
  rate.className = "deposit-counter-card__rate";
  rate.textContent = `${formatMoney(depositValue)} Pfand`;

  const counter = document.createElement("div");
  counter.className = "counter";

  const minusButton = createDepositCounterButton(
    "remove.svg",
    `Ein Pfand zu ${formatMoney(depositValue)} weniger`,
  );
  minusButton.disabled = count === 0;
  minusButton.addEventListener("click", () => changeDeposit(depositCents, -1));

  const countOutput = document.createElement("output");
  countOutput.className = "counter__value";
  countOutput.value = count;
  countOutput.textContent = count;
  countOutput.setAttribute("aria-live", "polite");

  const plusButton = createDepositCounterButton(
    "add.svg",
    `Ein Pfand zu ${formatMoney(depositValue)} mehr`,
  );
  plusButton.addEventListener("click", () => changeDeposit(depositCents, 1));

  counter.append(minusButton, countOutput, plusButton);
  card.append(rate, counter);
  return card;
}

function createDepositCounterButton(iconFile, label) {
  const button = document.createElement("button");
  button.className = "counter__button";
  button.type = "button";
  button.setAttribute("aria-label", label);

  const icon = document.createElement("img");
  icon.className = "button-icon";
  icon.src = `assets/icons/${iconFile}`;
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");

  button.append(icon);
  return button;
}

// ------------------------------
// Bon und Abschluss
// ------------------------------

function showReceipt() {
  const drinkTotal = getDrinkTotal();
  const depositTotal = getReturnedDepositTotal();
  const finalTotal = drinkTotal - depositTotal;

  elements.receiptPartyName.textContent = party.name;
  elements.receiptTime.textContent = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  elements.receiptItems.replaceChildren();

  getSelectedDrinks().forEach(({ drink, quantity }) => {
    elements.receiptItems.append(
      createReceiptRow(
        `${quantity}× ${drink.name}`,
        formatDrinkReceiptAmount(drink, quantity),
      ),
    );
  });

  const returnedDeposits = getSelectedReturnedDeposits();

  if (returnedDeposits.length > 0) {
    returnedDeposits.forEach(({ depositCents, count }) => {
      const depositValue = depositCents / 100;
      elements.receiptItems.append(
        createReceiptRow(
          `${count}× Pfand zurück (${formatMoney(depositValue)})`,
          -(depositValue * count),
          true,
        ),
      );
    });
  } else {
    elements.receiptItems.append(createReceiptNote("Kein Pfand zurück"));
  }

  const formattedTotal = formatMoney(finalTotal);
  elements.receiptTotal.textContent = formattedTotal;
  elements.receiptTitle.textContent = finalTotal < 0 ? "Leider Rückgeld" : "Zu zahlen";
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
  amountElement.textContent = typeof amount === "string"
    ? amount
    : `${isDeduction ? "− " : ""}${formatMoney(Math.abs(amount))}`;
  amountElement.classList.toggle("receipt__deduction", isDeduction);

  row.append(labelElement, amountElement);
  return row;
}

function formatDrinkReceiptAmount(drink, quantity) {
  const drinkPrice = formatMoney(drink.price * quantity);

  if (drink.deposit === 0) {
    return drinkPrice;
  }

  return `${drinkPrice} + ${formatMoney(drink.deposit * quantity)}`;
}

function createReceiptNote(text) {
  const row = document.createElement("li");
  row.className = "receipt__note";
  row.textContent = text;
  return row;
}

function finishOrder() {
  state.quantities.clear();
  state.depositCounts.clear();
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
    (sum, { drink, quantity }) => sum + getDrinkUnitTotal(drink) * quantity,
    0,
  );
}

function getDrinkUnitTotal(drink) {
  return drink.price + drink.deposit;
}

function getReturnDepositValues() {
  const values = [];
  const knownValues = new Set();

  const addValue = (value) => {
    const depositCents = moneyToCents(value);

    if (depositCents > 0 && !knownValues.has(depositCents)) {
      knownValues.add(depositCents);
      values.push(depositCents);
    }
  };

  party.returnDeposits.forEach(addValue);
  party.drinks.forEach((drink) => addValue(drink.deposit));
  state.depositCounts.forEach((count, depositCents) => {
    if (count > 0 && !knownValues.has(depositCents)) {
      knownValues.add(depositCents);
      values.push(depositCents);
    }
  });

  return values.sort((firstValue, secondValue) => firstValue - secondValue);
}

function getSelectedReturnedDeposits() {
  return getReturnDepositValues()
    .map((depositCents) => ({
      depositCents,
      count: state.depositCounts.get(depositCents) ?? 0,
    }))
    .filter(({ count }) => count > 0);
}

function getReturnedDepositCount() {
  return [...state.depositCounts.values()].reduce((sum, count) => sum + count, 0);
}

function getReturnedDepositTotal() {
  return getSelectedReturnedDeposits().reduce(
    (sum, { depositCents, count }) => sum + (depositCents / 100) * count,
    0,
  );
}

function moneyToCents(value) {
  return Math.round(value * 100);
}

function getConfiguredDrink(drinkId) {
  return configuredParty.drinks.find((drink) => drink.id === drinkId);
}

function hasDrinkPriceOverrides() {
  return party.drinks.some((drink) => !drinkUsesDefaultValues(drink));
}

function drinkUsesDefaultValues(drink) {
  const defaultDrink = getConfiguredDrink(drink.id);
  return drink.price === defaultDrink.price && drink.deposit === defaultDrink.deposit;
}

function normalizeMoneyValue(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function parseMoneyInput(value) {
  const normalizedValue = value.trim().replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
    return null;
  }

  return normalizeMoneyValue(Number(normalizedValue));
}

function formatMoneyInput(value) {
  return value.toFixed(2).replace(".", ",");
}

function formatMoneyInputField(input) {
  const value = parseMoneyInput(input.value);

  if (value !== null) {
    input.value = formatMoneyInput(value);
  }
}

function applyStoredPriceOverrides() {
  const overrides = readPriceOverrides();

  party.drinks.forEach((drink) => {
    const override = overrides[drink.id];

    if (!override) {
      return;
    }

    const storedPrice = normalizeMoneyValue(override.price);
    const storedDeposit = normalizeMoneyValue(override.deposit);

    if (storedPrice !== null && storedDeposit !== null) {
      drink.price = storedPrice;
      drink.deposit = storedDeposit;
    }
  });
}

function persistDrinkOverride(drink) {
  const defaultDrink = getConfiguredDrink(drink.id);
  const overrides = readPriceOverrides();

  if (drink.price === defaultDrink.price && drink.deposit === defaultDrink.deposit) {
    delete overrides[drink.id];
  } else {
    overrides[drink.id] = {
      price: drink.price,
      deposit: drink.deposit,
    };
  }

  return writePriceOverrides(overrides);
}

function removeDrinkOverride(drinkId) {
  const overrides = readPriceOverrides();
  delete overrides[drinkId];
  return writePriceOverrides(overrides);
}

function readPriceOverrides() {
  try {
    const storedValue = window.localStorage.getItem(PRICE_OVERRIDE_STORAGE_KEY);
    const parsedValue = storedValue ? JSON.parse(storedValue) : {};

    return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? parsedValue
      : {};
  } catch (error) {
    console.warn("Gespeicherte Preisanpassungen konnten nicht gelesen werden.", error);
    return {};
  }
}

function writePriceOverrides(overrides) {
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(PRICE_OVERRIDE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        PRICE_OVERRIDE_STORAGE_KEY,
        JSON.stringify(overrides),
      );
    }
    return true;
  } catch (error) {
    console.warn("Preisanpassungen konnten nicht gespeichert werden.", error);
    return false;
  }
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

  if (
    !Array.isArray(partyToValidate.returnDeposits)
    || partyToValidate.returnDeposits.some(
      (deposit) => !Number.isFinite(deposit) || deposit <= 0,
    )
  ) {
    throw new Error("Rückgabe-Pfandwerte müssen als Liste positiver Zahlen angegeben werden.");
  }

  const ids = new Set();
  partyToValidate.drinks.forEach((drink) => {
    if (
      !drink.id
      || !drink.abbreviation
      || !drink.name
      || !Number.isFinite(drink.price)
      || drink.price < 0
      || !Number.isFinite(drink.deposit)
      || drink.deposit < 0
    ) {
      throw new Error(
        "Jedes Getränk braucht ID, Abkürzung, Namen sowie einen gültigen Preis und Pfandwert.",
      );
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
