/**
 * Default Manual Shipping Rates for all 69 Algerian Wilayas
 * Simple baseline rates (DZD) used before first admin configuration.
 */

import { ALGERIA_LOCATIONS } from "./algeria-locations.js";

export const DEFAULT_SHIPPING_RATES = {};

ALGERIA_LOCATIONS.forEach(w => {
  DEFAULT_SHIPPING_RATES[w.code] = {
    wilayaCode: w.code,
    wilayaName: w.name,
    wilayaNameLatin: w.name_latin || "",
    home: 600,
    stopDesk: 400
  };
});
