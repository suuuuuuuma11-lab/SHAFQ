/**
 * ClothStore — Wilaya Shipping Management & Pricing Engine
 * Handles Wilaya-based shipping rates (Home & Stop Desk) across all 69 Algerian Wilayas.
 * 
 * Rules:
 * - Pricing depends ONLY on Wilaya + Delivery Method (Home or Stop Desk).
 * - Pricing does NOT depend on Commune (Commune is address info only).
 * - Full synchronization between Firestore, Admin Dashboard, and Storefront Checkout.
 */

import { DEFAULT_SHIPPING_PRESETS } from "../data/default-shipping-presets.js";
import { ALGERIA_LOCATIONS } from "../data/algeria-locations.js";
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
 * Ensures a valid 69-Wilaya rates map
 */
export function buildDefaultRates(presetKey = "custom") {
  const preset = DEFAULT_SHIPPING_PRESETS[presetKey] || DEFAULT_SHIPPING_PRESETS.custom;
  const rates = {};

  ALGERIA_LOCATIONS.forEach(w => {
    const pRate = (preset && preset.rates && preset.rates[w.code]) || {};
    rates[w.code] = {
      wilayaCode: w.code,
      wilayaName: w.name,
      wilayaNameLatin: w.name_latin || "",
      home: typeof pRate.home === "number" ? pRate.home : 600,
      stopDesk: typeof pRate.stopDesk === "number" ? pRate.stopDesk : 400
    };
  });

  return rates;
}

/**
 * Returns immediate synchronous fallback rates from localStorage or default preset.
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
    activePreset: "custom",
    rates: buildDefaultRates("custom"),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Loads active shipping settings from Firestore with localStorage and Preset fallbacks.
 */
export async function loadActiveShippingSettings() {
  // 1. Try reading from Cloud Firestore
  try {
    const docRef = doc(db, "shippingSettings", "current");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.rates && typeof data.rates === "object") {
        // Complete any missing wilayas if needed
        const completeRates = buildDefaultRates(data.activePreset || "custom");
        Object.keys(data.rates).forEach(code => {
          if (completeRates[code]) {
            completeRates[code] = {
              ...completeRates[code],
              ...data.rates[code]
            };
          }
        });
        const resolved = {
          activePreset: data.activePreset || "custom",
          rates: completeRates,
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

  // 3. Ultimate fallback: default preset
  return {
    activePreset: "custom",
    rates: buildDefaultRates("custom"),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Saves active shipping settings to Firestore and localStorage.
 */
export async function saveActiveShippingSettings(settings) {
  const payload = {
    activePreset: settings.activePreset || "custom",
    rates: settings.rates || buildDefaultRates("custom"),
    updatedAt: new Date().toISOString()
  };

  // Cache locally first for instant offline/responsive feedback
  try {
    localStorage.setItem(LOCAL_STORAGE_SHIPPING_KEY, JSON.stringify(payload));
  } catch (_) {}

  // Save to Cloud Firestore
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

  return typeof price === "number" ? price : 0;
}
