/* ==========================================================================
   SHAFQ — Unified Favorites Storage & Synchronization Module
   - Single canonical localStorage key: "shafq-favorites"
   - Seamless one-time migration/merge from legacy "alnoor_favs"
   - Safe sanitization of invalid, empty, or malformed product IDs
   - Cross-page & cross-tab reactivity via custom DOM & storage events
   ========================================================================== */

export const FAVORITES_STORAGE_KEY = "shafq-favorites";
export const LEGACY_FAVORITES_KEY = "alnoor_favs";

function normalizeFavoriteId(id) {
  if (id === null || id === undefined) return "";
  if (typeof id !== "string" && typeof id !== "number") return "";
  const clean = String(id).trim();
  if (!clean || clean === "null" || clean === "undefined") return "";
  return clean;
}

function parseStoredIds(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    const seen = new Set();
    for (const entry of parsed) {
      const id = normalizeFavoriteId(entry);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function readAndMigrateFromStorage() {
  try {
    const primaryRaw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const legacyRaw = localStorage.getItem(LEGACY_FAVORITES_KEY);

    const primaryIds = parseStoredIds(primaryRaw);
    const legacyIds = parseStoredIds(legacyRaw);

    const merged = [];
    const seen = new Set();
    for (const id of [...primaryIds, ...legacyIds]) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }

    if (legacyRaw !== null) {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(merged));
      localStorage.removeItem(LEGACY_FAVORITES_KEY);
    } else if (primaryRaw !== null && JSON.stringify(merged) !== primaryRaw) {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(merged));
    }

    return new Set(merged);
  } catch {
    return new Set();
  }
}

let favoritesSet = readAndMigrateFromStorage();

function persistAndBroadcast() {
  const ids = Array.from(favoritesSet);
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
    localStorage.removeItem(LEGACY_FAVORITES_KEY);
  } catch (_) {}

  document.dispatchEvent(
    new CustomEvent("shafq:favorites", {
      detail: { ids, count: ids.length }
    })
  );
  return ids;
}

export function loadFavorites() {
  favoritesSet = readAndMigrateFromStorage();
  return new Set(favoritesSet);
}

export function getFavoriteIds() {
  return Array.from(favoritesSet);
}

export function getFavoritesCount() {
  return favoritesSet.size;
}

export function isFavorite(productId) {
  const id = normalizeFavoriteId(productId);
  if (!id) return false;
  return favoritesSet.has(id);
}

export function toggleFavorite(productId) {
  const id = normalizeFavoriteId(productId);
  if (!id) return null;

  favoritesSet = readAndMigrateFromStorage();
  let favorited;
  if (favoritesSet.has(id)) {
    favoritesSet.delete(id);
    favorited = false;
  } else {
    favoritesSet.add(id);
    favorited = true;
  }

  const ids = persistAndBroadcast();
  document.dispatchEvent(
    new CustomEvent("shafq:favorite", {
      detail: { id, favorited, ids, count: ids.length }
    })
  );

  return { id, favorited, ids, count: ids.length };
}

export function setFavorites(ids) {
  const cleaned = parseStoredIds(JSON.stringify(Array.isArray(ids) ? ids : []));
  favoritesSet = new Set(cleaned);
  persistAndBroadcast();
  return new Set(favoritesSet);
}

if (typeof window !== "undefined" && !window._shafqFavoritesStorageBound) {
  window._shafqFavoritesStorageBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key === FAVORITES_STORAGE_KEY || e.key === LEGACY_FAVORITES_KEY || e.key === null) {
      favoritesSet = readAndMigrateFromStorage();
      const ids = Array.from(favoritesSet);
      document.dispatchEvent(
        new CustomEvent("shafq:favorites", {
          detail: { ids, count: ids.length }
        })
      );
    }
  });
}

if (typeof window !== "undefined") {
  window.SHAFQ_FAVORITES = {
    key: FAVORITES_STORAGE_KEY,
    load: loadFavorites,
    getAll: getFavoriteIds,
    count: getFavoritesCount,
    has: isFavorite,
    toggle: toggleFavorite,
    set: setFavorites
  };
}
