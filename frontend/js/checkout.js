/* ==========================================================================
   SHAFQ — Unified Cash-on-Delivery Checkout, Shipping & Location Engine
   Consolidates:
   - Lazy-loaded Algeria 69-Wilaya / Commune data & cascading select UI
   - Session-cached manual shipping rates loader (Firestore shippingSettings/current)
   - Delivery pricing UI controller (Home Delivery vs Stop Desk Pickup)
   - Algerian phone/address validation & authoritative /api/order submission
   ========================================================================== */

let cachedLocations = null;
let locationsLoadPromise = null;

let cachedDefaultRates = null;
let defaultRatesPromise = null;

let sharedShippingSettings = {
  rates: null,
  updatedAt: ""
};
let shippingFirestoreResolved = false;
let shippingLoadPromise = null;
const shippingSubscribers = new Set();

function notifyShippingSubscribers() {
  shippingSubscribers.forEach((cb) => {
    try { cb(sharedShippingSettings); } catch (_) {}
  });
}

/**
 * Lazily imports and caches Algeria Wilaya/Commune data (225 KB) once per session.
 */
async function ensureLocationsData() {
  if (cachedLocations) return cachedLocations;
  if (!locationsLoadPromise) {
    locationsLoadPromise = import("../data/algeria-locations.js")
      .then((mod) => {
        cachedLocations = mod.ALGERIA_LOCATIONS;
        return cachedLocations;
      })
      .catch((err) => {
        locationsLoadPromise = null;
        throw err;
      });
  }
  return locationsLoadPromise;
}

async function ensureDefaultShippingRates() {
  if (cachedDefaultRates) return cachedDefaultRates;
  if (!defaultRatesPromise) {
    defaultRatesPromise = import("../data/default-shipping-rates.js")
      .then((mod) => {
        cachedDefaultRates = mod.DEFAULT_SHIPPING_RATES;
        if (!shippingFirestoreResolved && !sharedShippingSettings.rates) {
          sharedShippingSettings = {
            rates: cachedDefaultRates,
            updatedAt: new Date().toISOString()
          };
          notifyShippingSubscribers();
        }
        return cachedDefaultRates;
      })
      .catch((err) => {
        defaultRatesPromise = null;
        throw err;
      });
  }
  return defaultRatesPromise;
}

/**
 * Normalizes a Wilaya code to a two-digit string ("01" - "69").
 */
export function normalizeWilayaCode(val) {
  if (!val) return "";
  const num = parseInt(val, 10);
  if (isNaN(num)) return "";
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Finds a Wilaya object from loaded ALGERIA_LOCATIONS by name or code.
 */
export function findWilaya(identifier, locationsList = cachedLocations) {
  if (!identifier || !Array.isArray(locationsList)) return null;
  const str = String(identifier).trim();
  const normalizedCode = normalizeWilayaCode(str);

  return (
    locationsList.find(
      (w) =>
        w.code === normalizedCode ||
        w.name === str ||
        (w.name_latin && w.name_latin.toLowerCase() === str.toLowerCase())
    ) || null
  );
}

/**
 * Returns baseline fallback rates if already loaded in memory.
 */
export function getInitialShippingSettings() {
  return {
    rates: sharedShippingSettings.rates || cachedDefaultRates || {},
    updatedAt: sharedShippingSettings.updatedAt || new Date().toISOString()
  };
}

/**
 * Lazily loads active shipping rates from Cloud Firestore once per session,
 * seeding immediate baseline defaults while Firestore completes.
 */
export async function loadActiveShippingSettings() {
  if (!shippingLoadPromise) {
    shippingLoadPromise = (async () => {
      const [, baselineRates] = await Promise.all([
        ensureLocationsData().catch(() => null),
        ensureDefaultShippingRates().catch(() => ({}))
      ]);

      try {
        const [{ db }, { doc, getDoc }] = await Promise.all([
          import("./firebase-config.js"),
          import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js")
        ]);
        const snap = await getDoc(doc(db, "shippingSettings", "current"));
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.rates && typeof data.rates === "object") {
            const mergedRates = { ...baselineRates };
            Object.keys(data.rates).forEach((code) => {
              mergedRates[code] = {
                ...mergedRates[code],
                ...data.rates[code]
              };
            });
            sharedShippingSettings = {
              rates: mergedRates,
              updatedAt: data.updatedAt || new Date().toISOString()
            };
            shippingFirestoreResolved = true;
            notifyShippingSubscribers();
            return sharedShippingSettings;
          }
        }
      } catch (err) {
        console.warn("Could not read shipping settings from Firestore (using baseline fallback):", err.message);
      }

      sharedShippingSettings = {
        rates: baselineRates || {},
        updatedAt: new Date().toISOString()
      };
      shippingFirestoreResolved = true;
      notifyShippingSubscribers();
      return sharedShippingSettings;
    })();
  }
  return shippingLoadPromise;
}

/**
 * Resolves shipping price for a Wilaya and delivery method ('home' or 'stopDesk').
 */
export function getShippingPrice(rates, wilayaIdentifier, deliveryMethod = "home") {
  if (!rates || !wilayaIdentifier) return 0;

  const w = findWilaya(wilayaIdentifier);
  const code = w ? w.code : normalizeWilayaCode(wilayaIdentifier);
  if (!code || !rates[code]) return 0;

  const rate = rates[code];
  const method = deliveryMethod === "stopDesk" ? "stopDesk" : "home";
  const price = rate[method];

  return typeof price === "number" ? price : Number(price) || 0;
}

/**
 * Lazily loads location data and attaches Wilaya -> Commune cascade behavior
 * to a pair of <select> elements without duplicating event listeners.
 */
export async function setupWilayaCommuneCascade({
  wilayaSelectId,
  communeSelectId,
  wilayaFieldId,
  communeFieldId
}) {
  const wSelect = document.getElementById(wilayaSelectId);
  const cSelect = document.getElementById(communeSelectId);
  if (!wSelect || !cSelect) return null;

  const locations = await ensureLocationsData();

  // Guard against View Transition / stale DOM if elements detached during load
  if (!wSelect.isConnected || !cSelect.isConnected) return null;

  if (wSelect.options.length <= 1) {
    const currentW = wSelect.value;
    wSelect.innerHTML =
      '<option value="">— Select Wilaya —</option>' +
      locations
        .map((w) => {
          const label = w.name_latin ? `${w.code} — ${w.name_latin} (${w.name})` : `${w.code} — ${w.name}`;
          return `<option value="${w.name}">${label}</option>`;
        })
        .join("");
    if (currentW) wSelect.value = currentW;
  }

  function syncCommunes(resetSelection = false) {
    const selectedWilayaName = wSelect.value;

    if (!selectedWilayaName) {
      cSelect.innerHTML = '<option value="">— Select Wilaya First —</option>';
      cSelect.value = "";
      cSelect.disabled = true;
      return;
    }

    const wilayaData = locations.find((w) => w.name === selectedWilayaName);
    if (!wilayaData || !wilayaData.communes || wilayaData.communes.length === 0) {
      cSelect.innerHTML = '<option value="">— No Communes Available —</option>';
      cSelect.value = "";
      cSelect.disabled = true;
      return;
    }

    const currentC = resetSelection ? "" : cSelect.value;
    cSelect.innerHTML =
      '<option value="">— Select Commune —</option>' +
      wilayaData.communes
        .map((c) => {
          const label = c.name_latin ? `${c.name_latin} (${c.name})` : c.name;
          return `<option value="${c.name}">${label}</option>`;
        })
        .join("");

    cSelect.disabled = false;
    if (currentC && wilayaData.communes.some((c) => c.name === currentC)) {
      cSelect.value = currentC;
    } else {
      cSelect.value = "";
    }
  }

  syncCommunes(false);

  if (!wSelect.dataset.shafqCascadeBound) {
    wSelect.dataset.shafqCascadeBound = "1";
    wSelect.addEventListener("change", () => {
      syncCommunes(true);

      if (wilayaFieldId && wSelect.value) {
        document.getElementById(wilayaFieldId)?.classList.remove("invalid");
      }
      if (communeFieldId) {
        document.getElementById(communeFieldId)?.classList.remove("invalid");
      }
    });
  }

  if (!cSelect.dataset.shafqCascadeBound) {
    cSelect.dataset.shafqCascadeBound = "1";
    cSelect.addEventListener("change", () => {
      if (communeFieldId && cSelect.value) {
        document.getElementById(communeFieldId)?.classList.remove("invalid");
      }
    });
  }

  return { syncCommunes };
}

function normalizeAlgerianPhone(rawPhone) {
  return String(rawPhone || "")
    .trim()
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function isValidAlgerianPhone(phone) {
  return /^0[5-7][0-9]{8}$/.test(phone);
}

function setFieldInvalid(fieldId, isInvalid) {
  const el = document.getElementById(fieldId);
  if (el) el.classList.toggle("invalid", Boolean(isInvalid));
  return !isInvalid;
}

export function validateCodFormFields({
  nameInputId,
  phoneInputId,
  wilayaSelectId,
  communeSelectId,
  addressInputId,
  nameFieldId,
  phoneFieldId,
  wilayaFieldId,
  communeFieldId
}) {
  const customer = document.getElementById(nameInputId)?.value.trim() || "";
  const phone = normalizeAlgerianPhone(document.getElementById(phoneInputId)?.value);
  const wilaya = document.getElementById(wilayaSelectId)?.value || "";
  const commune = document.getElementById(communeSelectId)?.value.trim() || "";
  const address = document.getElementById(addressInputId)?.value.trim() || "";

  let valid = true;
  valid = setFieldInvalid(nameFieldId, customer.length < 3) && valid;
  valid = setFieldInvalid(phoneFieldId, !isValidAlgerianPhone(phone)) && valid;
  valid = setFieldInvalid(wilayaFieldId, !wilaya) && valid;
  valid = setFieldInvalid(communeFieldId, !commune) && valid;

  return { valid, customer, phone, wilaya, commune, address };
}

export async function resolveLocationCodes(wilayaName, communeName) {
  const locations = await ensureLocationsData().catch(() => cachedLocations);
  const wilayaInfo = findWilaya(wilayaName, locations);
  const wilayaCode = wilayaInfo ? wilayaInfo.code : "";
  const communeInfo = wilayaInfo?.communes?.find((c) => c.name === communeName);
  const communeCode = communeInfo ? communeInfo.code : "";
  return {
    wilayaInfo,
    canonicalWilaya: wilayaInfo ? wilayaInfo.name : wilayaName,
    wilayaCode,
    communeCode
  };
}

export function getSelectedDeliveryMethod(radioName) {
  const checked = document.querySelector(`input[name="${radioName}"]:checked`);
  return checked ? checked.value : "home";
}

/**
 * Manages delivery method selection cards, Wilaya change listeners,
 * and live Home vs Stop Desk pricing summaries for a COD checkout form.
 * Call activate() only when the checkout UI is rendered/opened so shipping data
 * stays lazy-loaded off non-checkout pages.
 */
export function createCheckoutPricingController({
  wilayaSelectId,
  radioName,
  cardHomeId,
  cardStopDeskId,
  homePriceId,
  stopDeskPriceId,
  opsSubtotalId,
  opsShippingId,
  opsMethodLabelId,
  opsTotalId,
  mirrorTotalId = "",
  getSubtotal
}) {
  function update() {
    const wilayaEl = document.getElementById(wilayaSelectId);
    const wilayaVal = wilayaEl ? wilayaEl.value : "";
    const method = getSelectedDeliveryMethod(radioName);

    const cardHome = document.getElementById(cardHomeId);
    const cardStopDesk = document.getElementById(cardStopDeskId);
    if (cardHome) cardHome.classList.toggle("active", method === "home");
    if (cardStopDesk) cardStopDesk.classList.toggle("active", method === "stopDesk");

    const rates = sharedShippingSettings?.rates || cachedDefaultRates || null;
    let homePrice = 0;
    let stopDeskPrice = 0;
    let hasWilaya = false;

    if (wilayaVal && rates) {
      hasWilaya = true;
      homePrice = getShippingPrice(rates, wilayaVal, "home");
      stopDeskPrice = getShippingPrice(rates, wilayaVal, "stopDesk");
    }

    const homePriceEl = document.getElementById(homePriceId);
    const stopDeskPriceEl = document.getElementById(stopDeskPriceId);
    if (homePriceEl) homePriceEl.textContent = hasWilaya ? `${homePrice.toLocaleString("en-US")} DA` : "—";
    if (stopDeskPriceEl) stopDeskPriceEl.textContent = hasWilaya ? `${stopDeskPrice.toLocaleString("en-US")} DA` : "—";

    const subtotal = Number(typeof getSubtotal === "function" ? getSubtotal() : 0) || 0;
    const activeShipping = hasWilaya ? (method === "stopDesk" ? stopDeskPrice : homePrice) : 0;
    const finalTotal = subtotal + activeShipping;

    const opsSubtotalEl = document.getElementById(opsSubtotalId);
    const opsShippingEl = document.getElementById(opsShippingId);
    const opsMethodLabelEl = document.getElementById(opsMethodLabelId);
    const opsTotalEl = document.getElementById(opsTotalId);
    const mirrorTotalEl = mirrorTotalId ? document.getElementById(mirrorTotalId) : null;

    if (opsSubtotalEl) opsSubtotalEl.textContent = `${subtotal.toLocaleString("en-US")} DA`;
    if (opsShippingEl) {
      opsShippingEl.textContent = hasWilaya ? `${activeShipping.toLocaleString("en-US")} DA` : "Select wilaya";
    }
    if (opsMethodLabelEl) {
      opsMethodLabelEl.textContent = method === "stopDesk" ? "Stop Desk Pickup" : "Home Delivery";
    }
    if (opsTotalEl) opsTotalEl.textContent = `${finalTotal.toLocaleString("en-US")} DA`;
    if (mirrorTotalEl) mirrorTotalEl.textContent = `${finalTotal.toLocaleString("en-US")} DA`;
  }

  function bindListeners() {
    document.querySelectorAll(`input[name="${radioName}"]`).forEach((radio) => {
      if (radio.dataset.shafqBound) return;
      radio.dataset.shafqBound = "1";
      radio.addEventListener("change", update);
    });

    const cardHome = document.getElementById(cardHomeId);
    if (cardHome && !cardHome.dataset.shafqBound) {
      cardHome.dataset.shafqBound = "1";
      cardHome.addEventListener("click", () => {
        const r = document.querySelector(`input[name="${radioName}"][value="home"]`);
        if (r) {
          r.checked = true;
          update();
        }
      });
    }

    const cardStop = document.getElementById(cardStopDeskId);
    if (cardStop && !cardStop.dataset.shafqBound) {
      cardStop.dataset.shafqBound = "1";
      cardStop.addEventListener("click", () => {
        const r = document.querySelector(`input[name="${radioName}"][value="stopDesk"]`);
        if (r) {
          r.checked = true;
          update();
        }
      });
    }

    const wilayaEl = document.getElementById(wilayaSelectId);
    if (wilayaEl && !wilayaEl.dataset.shafqPriceBound) {
      wilayaEl.dataset.shafqPriceBound = "1";
      wilayaEl.addEventListener("change", update);
    }
  }

  function activate() {
    shippingSubscribers.add(update);
    loadActiveShippingSettings().then(update);
  }

  return {
    activate,
    update,
    bindListeners,
    getSelectedMethod: () => getSelectedDeliveryMethod(radioName)
  };
}

/**
 * Submits an order payload strictly to the authoritative backend /api/order endpoint.
 */
export async function submitCodOrder(payload) {
  const res = await fetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || !data.success || !data.orderId) {
    return {
      ok: false,
      error: data?.error || "Unable to verify and place order. Please try again."
    };
  }

  return {
    ok: true,
    orderId: data.orderId,
    order: data.order
  };
}
