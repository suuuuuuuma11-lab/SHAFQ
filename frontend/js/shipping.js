/**
 * Simple Manual Shipping Price Engine (69 Algerian Wilayas)
 * 
 * Rules:
 * - Shipping is configured manually by the admin for all 69 Wilayas.
 * - Price depends ONLY on Wilaya + Delivery Method (Home or Stop Desk).
 * - Commune does NOT affect shipping price (it is customer address info only).
 * - Shipping is charged ONCE per order/shipment.
 */

import { ALGERIA_LOCATIONS } from "../data/algeria-locations.js";
import { DEFAULT_SHIPPING_RATES } from "../data/default-shipping-rates.js";
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export const LOCAL_STORAGE_SHIPPING_KEY = "hadjaj_shipping_settings";

/**
 * Normalizes a Wilaya code to a two-digit string ("01" - "69")
 */
export function normalizeWilayaCode(val) {
  if (!val) return "";
  const num = parseInt(val, 10);
  if (isNaN(num)) return "";
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Finds a Wilaya object from ALGERIA_LOCATIONS by name or code
 */
export function findWilaya(identifier) {
  if (!identifier) return null;
  const str = String(identifier).trim();
  const normalizedCode = normalizeWilayaCode(str);

  return ALGERIA_LOCATIONS.find(w => 
    w.code === normalizedCode ||
    w.name === str ||
    (w.name_latin && w.name_latin.toLowerCase() === str.toLowerCase())
  ) || null;
}

/**
 * Returns immediate synchronous fallback rates from localStorage or default baseline.
 */
export function getInitialShippingSettings() {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_SHIPPING_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.rates) return parsed;
    }
  } catch (_) {}
  return {
    rates: DEFAULT_SHIPPING_RATES,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Loads active manual shipping rates from Firestore with localStorage fallback.
 */
export async function loadActiveShippingSettings() {
  // 1. Try reading from Cloud Firestore
  try {
    const docRef = doc(db, "shippingSettings", "current");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.rates && typeof data.rates === "object") {
        const mergedRates = { ...DEFAULT_SHIPPING_RATES };
        Object.keys(data.rates).forEach(code => {
          mergedRates[code] = {
            ...mergedRates[code],
            ...data.rates[code]
          };
        });
        const resolved = {
          rates: mergedRates,
          updatedAt: data.updatedAt || new Date().toISOString()
        };
        try {
          localStorage.setItem(LOCAL_STORAGE_SHIPPING_KEY, JSON.stringify(resolved));
        } catch (_) {}
        return resolved;
      }
    }
  } catch (err) {
    console.warn("Could not read shipping settings from Firestore (using cached/fallback):", err.message);
  }

  // 2. Fallback to localStorage
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_SHIPPING_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.rates) {
        return parsed;
      }
    }
  } catch (_) {}

  // 3. Ultimate baseline fallback
  return {
    rates: DEFAULT_SHIPPING_RATES,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Saves active shipping settings to Firestore and localStorage.
 */
export async function saveActiveShippingSettings(settings) {
  const payload = {
    rates: settings.rates || DEFAULT_SHIPPING_RATES,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_SHIPPING_KEY, JSON.stringify(payload));
  } catch (_) {}

  try {
    const docRef = doc(db, "shippingSettings", "current");
    await setDoc(docRef, payload, { merge: true });
    return { success: true };
  } catch (err) {
    console.error("Failed to save shipping settings to Firestore:", err);
    throw err;
  }
}

/**
 * Resolves shipping price for a Wilaya and delivery method
 * @param {Object} rates - 69-Wilaya rates object
 * @param {string} wilayaIdentifier - Wilaya name, code, or ID
 * @param {string} deliveryMethod - 'home' or 'stopDesk'
 * @returns {number} shipping price in DZD
 */
export function getShippingPrice(rates, wilayaIdentifier, deliveryMethod = "home") {
  if (!rates || !wilayaIdentifier) return 0;

  const w = findWilaya(wilayaIdentifier);
  const code = w ? w.code : normalizeWilayaCode(wilayaIdentifier);
  if (!code || !rates[code]) return 0;

  const rate = rates[code];
  const method = deliveryMethod === "stopDesk" ? "stopDesk" : "home";
  const price = rate[method];

  return typeof price === "number" ? price : (Number(price) || 0);
}
