/* ==========================================================================
   SHAFQ — Firestore Catalog Adapter
   Bridges Dashboard / Cloud Firestore documents ("products", "categories")
   with the SHAFQ Storefront schema cleanly and deterministically.
   ========================================================================== */

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export const SWR_CACHE_VERSION = 1;
export const SWR_STORAGE_KEYS = Object.freeze({
  products: "shafq_products_swr_v1",
  categories: "shafq_categories_swr_v1",
  activeBanner: "shafq_active_banner_v1"
});
export const SWR_SOFT_STALE_MS = 1000 * 60 * 60 * 24;      // 24 hours
export const SWR_HARD_EXPIRE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getStorage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function safeRemoveStorage(key) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {}
}

function isQuotaError(err) {
  if (!err) return false;
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

function safeReadEnvelope(key, maxAgeMs = SWR_HARD_EXPIRE_MS) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      safeRemoveStorage(key);
      return null;
    }
    if (parsed.version !== SWR_CACHE_VERSION || typeof parsed.cachedAt !== "number" || !Number.isFinite(parsed.cachedAt)) {
      safeRemoveStorage(key);
      return null;
    }
    const ageMs = Date.now() - parsed.cachedAt;
    if (ageMs < 0 || ageMs > maxAgeMs) {
      safeRemoveStorage(key);
      return null;
    }
    return {
      ...parsed,
      ageMs,
      isStale: ageMs > SWR_SOFT_STALE_MS
    };
  } catch {
    safeRemoveStorage(key);
    return null;
  }
}

function safeWriteEnvelope(key, data, { serverConfirmed = false, previousConfirmedAt = null } = {}) {
  const storage = getStorage();
  if (!storage) return false;
  const now = Date.now();
  const payload = {
    version: SWR_CACHE_VERSION,
    cachedAt: now,
    serverConfirmedAt: serverConfirmed ? now : (typeof previousConfirmedAt === "number" ? previousConfirmedAt : null),
    data
  };
  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      safeRemoveStorage(SWR_STORAGE_KEYS.activeBanner);
      try {
        storage.setItem(key, JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export const FALLBACK_COLOR_HEX = {
  "أسود": "#18181b", "اسود": "#18181b", "black": "#111111",
  "أبيض": "#ffffff", "ابيض": "#ffffff", "أبيض عاجي": "#f5f2ea", "white": "#ffffff", "cream": "#E9DCCB",
  "رمادي": "#71717a", "رمادي داكن": "#3a352f", "charcoal": "#292326", "gray": "#71717a",
  "كحلي": "#1f2a44", "أزرق داكن": "#1e3a8a", "ازرق داكن": "#1e3a8a", "navy": "#1D2944",
  "بني": "#795337", "بني غامق": "#594526", "brown": "#795337",
  "بيج": "#c9b48a", "beige": "#e6d5b8",
  "زيتي": "#4d5b36", "olive": "#A49A66",
  "عنابي": "#581C20", "burgundy": "#581C20", "احمر": "#8a1919", "أحمر": "#dc2626"
};

import {
  IMAGE_CONTEXT_WIDTHS,
  resolveImageWidth,
  optimizeProductImage,
  extractRawProductImages,
  getProductImageUrl,
  getProductGalleryUrls
} from "./image-utils.js";

export {
  IMAGE_CONTEXT_WIDTHS,
  resolveImageWidth,
  optimizeProductImage,
  getProductImageUrl,
  getProductGalleryUrls
};

export function resolveColorHex(val, name = "") {
  const s = String(val || "").trim();
  if (s.startsWith("#") || s.startsWith("rgb") || s.startsWith("hsl")) return s;
  const key = String(name || s).trim();
  return FALLBACK_COLOR_HEX[key] || FALLBACK_COLOR_HEX[key.toLowerCase()] || "#1D1916";
}

export function normalizeColors(rawColors, rawColorNames) {
  if (!Array.isArray(rawColors)) return [];
  const out = [];
  const seen = new Set();
  rawColors.forEach((c, idx) => {
    let name = "";
    let value = "";
    if (typeof c === "object" && c !== null) {
      name = String(c.name || "").trim();
      value = resolveColorHex(c.value, name);
      if (!name) name = value;
    } else {
      const fallbackName = Array.isArray(rawColorNames) && rawColorNames[idx] ? String(rawColorNames[idx]).trim() : "";
      const rawStr = String(c || "").trim();
      name = fallbackName || rawStr;
      value = resolveColorHex(rawStr, name);
    }
    if (!name) return;
    const dedupeKey = name.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push({ name, value });
  });
  return out;
}

export function normalizeSizes(rawSizes) {
  if (!Array.isArray(rawSizes)) return [];
  const out = [];
  const seen = new Set();
  rawSizes.forEach((s) => {
    const clean = String(s || "").trim();
    if (!clean) return;
    const canonical = /^(xs|s|m|l|xl|xxl|xxxl)$/i.test(clean) ? clean.toUpperCase() : clean;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  });
  return out;
}

export function toIsoTimestamp(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val.toDate === "function") {
    try { return val.toDate().toISOString(); } catch { return ""; }
  }
  if (typeof val === "number") {
    try { return new Date(val).toISOString(); } catch { return ""; }
  }
  return "";
}

/**
 * Adapts a Firestore "products" document snapshot into the unified SHAFQ catalog object.
 * Returns null if the product is hidden or malformed.
 */
export function adaptProductDoc(docSnap) {
  if (!docSnap) return null;
  const d = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  if (!d) return null;

  const status = String(d.status || "active").trim().toLowerCase();
  if (status === "hidden") return null;

  const id = String(docSnap.id || d.id || "").trim();
  if (!id) return null;

  const rawImages = extractRawProductImages(d);
  const rawImage = rawImages[0] || "";
  const colors = normalizeColors(d.colors, d.colorNames);
  const sizes = normalizeSizes(d.sizes);
  const badge = String(d.badge || "").trim();
  const category = String(d.category || d.categoryId || "").trim();
  const createdAt = toIsoTimestamp(d.createdAt) || toIsoTimestamp(d.updatedAt);

  return {
    id,
    name: String(d.name || d.title || "").trim() || "Untitled Piece",
    price: typeof d.price === "number" ? d.price : (Number(d.price) || 0),
    oldPrice: d.oldPrice ? Number(d.oldPrice) : null,
    rawImage,
    rawImages,
    images: rawImages.slice(),
    image: rawImage,
    img: rawImage,
    mainImage: rawImage,
    imagePosition: String(d.imagePosition || "50% 25%"),
    category,
    categoryId: String(d.categoryId || category),
    availableSizes: sizes,
    sizes,
    availableColors: colors,
    colors,
    colorNames: colors.map((c) => c.name),
    badge,
    isNew: Boolean(d.isNew) || /جديد|new/i.test(badge),
    isFeatured: Boolean(d.isFeatured) || /الأكثر مبيعاً|الأكثر طلباً/i.test(badge),
    status: "active",
    desc: String(d.description || d.desc || "").trim(),
    createdAt,
    url: `/product?id=${encodeURIComponent(id)}`
  };
}

/**
 * Adapts a Firestore "categories" document snapshot.
 * Excludes inactive categories and system "الكل" category.
 */
export function adaptCategoryDoc(docSnap) {
  if (!docSnap) return null;
  const d = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  if (!d || d.active === false) return null;
  if (d.isSystem || docSnap.id === "system_all") return null;

  const name = String(d.name || "").trim();
  if (!name || name === "الكل" || name.toLowerCase() === "all") return null;

  const rawOrder = d.order ?? d.sortOrder;
  const order = (rawOrder !== undefined && rawOrder !== null && !isNaN(Number(rawOrder))) ? Number(rawOrder) : null;

  const rawBanner = d.banner && typeof d.banner === "object" ? d.banner : null;
  const bannerImg = rawBanner && rawBanner.img ? optimizeProductImage(String(rawBanner.img), 1600) : "";
  const bannerMobileImg = rawBanner && rawBanner.mobileImg
    ? optimizeProductImage(String(rawBanner.mobileImg), 1000)
    : bannerImg;

  const banner = rawBanner
    ? {
        type: String(rawBanner.type || (bannerImg ? "image" : "color")),
        img: bannerImg,
        mobileImg: bannerMobileImg,
        c1: String(rawBanner.c1 || "#14120f"),
        c2: String(rawBanner.c2 || "#14120f"),
        isFinal: Boolean(rawBanner.isFinal),
        crop: rawBanner.crop || null
      }
    : null;

  return {
    id: String(docSnap.id),
    name,
    msg: String(d.msg || "").trim(),
    desc: String(d.desc || "").trim(),
    banner,
    order,
    createdAt: toIsoTimestamp(d.createdAt)
  };
}

export function sortCategories(list) {
  return [...list].sort((a, b) => {
    if (a.order !== null && b.order !== null) return a.order - b.order;
    if (a.order !== null) return -1;
    if (b.order !== null) return 1;
    return a.name.localeCompare(b.name, "ar");
  });
}

function sanitizeCachedProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const price = Number(raw.price);
  if (!id || !name || !Number.isFinite(price) || price < 0) return null;
  const status = String(raw.status || "active").trim().toLowerCase();
  if (status === "hidden") return null;

  const rawImages = Array.isArray(raw.rawImages)
    ? raw.rawImages.filter((u) => typeof u === "string" && u.trim()).map((u) => u.trim())
    : [];
  const primary = String(raw.rawImage || raw.mainImage || raw.img || raw.image || rawImages[0] || "").trim();
  if (primary && !rawImages.includes(primary)) rawImages.unshift(primary);

  const oldPriceNum = raw.oldPrice !== null && raw.oldPrice !== undefined ? Number(raw.oldPrice) : null;
  const cleanOldPrice = oldPriceNum !== null && Number.isFinite(oldPriceNum) && oldPriceNum > price ? oldPriceNum : null;
  const colors = normalizeColors(raw.colors || raw.availableColors, raw.colorNames);
  const sizes = normalizeSizes(raw.sizes || raw.availableSizes);

  return {
    id,
    name,
    price,
    oldPrice: cleanOldPrice,
    rawImage: primary,
    rawImages,
    images: rawImages.slice(),
    image: primary,
    img: primary,
    mainImage: primary,
    imagePosition: String(raw.imagePosition || "50% 25%"),
    category: String(raw.category || "").trim(),
    categoryId: String(raw.categoryId || raw.category || "").trim(),
    availableSizes: sizes,
    sizes,
    availableColors: colors,
    colors,
    colorNames: colors.map((c) => c.name),
    badge: String(raw.badge || "").trim(),
    isNew: Boolean(raw.isNew),
    isFeatured: Boolean(raw.isFeatured),
    status: "active",
    desc: String(raw.desc || "").trim().slice(0, 600),
    createdAt: String(raw.createdAt || ""),
    url: `/product?id=${encodeURIComponent(id)}`
  };
}

function sanitizeCachedCategory(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  if (!id || !name) return null;

  const b = raw.banner && typeof raw.banner === "object"
    ? {
        type: String(raw.banner.type || "image"),
        img: String(raw.banner.img || "").trim(),
        mobileImg: String(raw.banner.mobileImg || "").trim(),
        c1: String(raw.banner.c1 || "#14120f"),
        c2: String(raw.banner.c2 || "#14120f"),
        isFinal: Boolean(raw.banner.isFinal)
      }
    : null;

  return {
    id,
    name,
    msg: String(raw.msg || "").trim(),
    desc: String(raw.desc || "").trim(),
    banner: b,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : null,
    createdAt: String(raw.createdAt || "")
  };
}

export function readCatalogCache({ allowStale = true } = {}) {
  const prodEnv = safeReadEnvelope(SWR_STORAGE_KEYS.products);
  const catEnv = safeReadEnvelope(SWR_STORAGE_KEYS.categories);

  let products = [];
  let hasProducts = false;
  if (prodEnv && Array.isArray(prodEnv.data) && (allowStale || !prodEnv.isStale)) {
    const clean = prodEnv.data.map(sanitizeCachedProduct).filter(Boolean);
    if (clean.length > 0 || prodEnv.data.length === 0) {
      products = clean;
      hasProducts = clean.length > 0;
    } else {
      safeRemoveStorage(SWR_STORAGE_KEYS.products);
    }
  }

  let categories = [];
  let hasCategories = false;
  if (catEnv && Array.isArray(catEnv.data) && (allowStale || !catEnv.isStale)) {
    const cleanCats = sortCategories(catEnv.data.map(sanitizeCachedCategory).filter(Boolean));
    if (cleanCats.length > 0 || catEnv.data.length === 0) {
      categories = cleanCats;
      hasCategories = cleanCats.length > 0;
    } else {
      safeRemoveStorage(SWR_STORAGE_KEYS.categories);
    }
  }

  return {
    products,
    categories,
    hasProducts,
    hasCategories,
    productsCachedAt: prodEnv ? prodEnv.cachedAt : null,
    categoriesCachedAt: catEnv ? catEnv.cachedAt : null,
    serverConfirmedAt: prodEnv ? prodEnv.serverConfirmedAt : null,
    isStale: Boolean((prodEnv && prodEnv.isStale) || (catEnv && catEnv.isStale))
  };
}

export function writeCatalogCache({ products, categories, serverConfirmed = false } = {}) {
  if (Array.isArray(products)) {
    const cleanProds = products.map(sanitizeCachedProduct).filter(Boolean);
    const prev = safeReadEnvelope(SWR_STORAGE_KEYS.products);
    const written = safeWriteEnvelope(SWR_STORAGE_KEYS.products, cleanProds, {
      serverConfirmed,
      previousConfirmedAt: prev ? prev.serverConfirmedAt : null
    });
    if (!written && cleanProds.length > 0) {
      // Compact fallback if quota is tight: omit descriptions to keep core catalog cached
      const compact = cleanProds.map((p) => ({ ...p, desc: "" }));
      safeWriteEnvelope(SWR_STORAGE_KEYS.products, compact, {
        serverConfirmed,
        previousConfirmedAt: prev ? prev.serverConfirmedAt : null
      });
    }
  }

  if (Array.isArray(categories)) {
    const cleanCats = sortCategories(categories.map(sanitizeCachedCategory).filter(Boolean));
    const prevCats = safeReadEnvelope(SWR_STORAGE_KEYS.categories);
    safeWriteEnvelope(SWR_STORAGE_KEYS.categories, cleanCats, {
      serverConfirmed,
      previousConfirmedAt: prevCats ? prevCats.serverConfirmedAt : null
    });
  }
}

export function readCachedProductById(productId) {
  const idStr = String(productId || "").trim();
  if (!idStr) return null;
  const cached = readCatalogCache({ allowStale: true });
  if (!cached.hasProducts) return null;
  const match = cached.products.find((p) => String(p.id) === idStr);
  if (!match) return null;
  return {
    product: match,
    cachedAt: cached.productsCachedAt,
    serverConfirmedAt: cached.serverConfirmedAt,
    isStale: cached.isStale
  };
}

export function readActiveBannerCache(categoryKey = "") {
  const env = safeReadEnvelope(SWR_STORAGE_KEYS.activeBanner);
  if (!env || !env.data || typeof env.data !== "object") return null;
  const key = String(categoryKey || "").trim().toLowerCase();
  if (key && String(env.data.categoryKey || "").trim().toLowerCase() !== key) {
    return null;
  }
  return env.data;
}

export function writeActiveBannerCache(categoryKey, bannerState) {
  if (!bannerState || typeof bannerState !== "object") return false;
  return safeWriteEnvelope(SWR_STORAGE_KEYS.activeBanner, {
    categoryKey: String(categoryKey || "").trim(),
    title: String(bannerState.title || ""),
    sub: String(bannerState.sub || ""),
    src: String(bannerState.src || ""),
    isCustomBanner: Boolean(bannerState.isCustomBanner),
    bgGradient: String(bannerState.bgGradient || "")
  });
}

export function clearCatalogCache() {
  safeRemoveStorage(SWR_STORAGE_KEYS.products);
  safeRemoveStorage(SWR_STORAGE_KEYS.categories);
  safeRemoveStorage(SWR_STORAGE_KEYS.activeBanner);
}

/**
 * Fetches live products and categories once from Cloud Firestore.
 */
export async function fetchStoreCatalog() {
  const [prodSnap, catSnap] = await Promise.all([
    getDocs(collection(db, "products")),
    getDocs(collection(db, "categories"))
  ]);

  const products = [];
  prodSnap.forEach((docSnap) => {
    const adapted = adaptProductDoc(docSnap);
    if (adapted) products.push(adapted);
  });

  const categories = [];
  catSnap.forEach((docSnap) => {
    const adapted = adaptCategoryDoc(docSnap);
    if (adapted) categories.push(adapted);
  });

  const sortedCategories = sortCategories(categories);
  const fromCache = Boolean(prodSnap.metadata?.fromCache || catSnap.metadata?.fromCache);
  const serverConfirmed = !fromCache;

  if (products.length > 0 || serverConfirmed) {
    writeCatalogCache({ products, categories: sortedCategories, serverConfirmed });
  }

  return { products, categories: sortedCategories, fromCache, serverConfirmed };
}

/**
 * Fetches a single active product by exact Firestore ID with collection fallback.
 */
export async function fetchProductById(productId) {
  const idStr = String(productId || "").trim();
  if (!idStr) return { product: null, error: null, fromCache: false, serverConfirmed: false };

  let firestoreError = null;
  try {
    try {
      const directDocSnap = await getDoc(doc(db, "products", idStr));
      if (directDocSnap.exists()) {
        const adapted = adaptProductDoc(directDocSnap);
        const fromCache = Boolean(directDocSnap.metadata?.fromCache);
        if (adapted) return { product: adapted, error: null, fromCache, serverConfirmed: !fromCache };
      }
    } catch (directErr) {
      console.warn("Direct product lookup fallback to collection:", directErr.message);
    }

    const snap = await getDocs(collection(db, "products"));
    let match = null;
    snap.forEach((docSnap) => {
      if (match) return;
      const adapted = adaptProductDoc(docSnap);
      if (adapted && String(adapted.id) === idStr) {
        match = adapted;
      }
    });
    const fromCache = Boolean(snap.metadata?.fromCache);
    return { product: match, error: null, fromCache, serverConfirmed: !fromCache };
  } catch (err) {
    firestoreError = err;
    console.warn("Firestore product load warning:", err);
  }

  return { product: null, error: firestoreError, fromCache: false, serverConfirmed: false };
}

/**
 * Real-time subscription to Firestore active categories.
 */
export function subscribeCategories(onUpdate, onError) {
  return onSnapshot(
    collection(db, "categories"),
    { includeMetadataChanges: true },
    (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        const adapted = adaptCategoryDoc(docSnap);
        if (adapted) list.push(adapted);
      });
      const sorted = sortCategories(list);
      const fromCache = Boolean(snap.metadata?.fromCache);
      if (sorted.length > 0 || !fromCache) {
        writeCatalogCache({ categories: sorted, serverConfirmed: !fromCache });
      }
      onUpdate(sorted, { fromCache, serverConfirmed: !fromCache });
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time subscription to Firestore "products" and "categories".
 */
export function subscribeStoreCatalog(onUpdate, onError) {
  let latestProducts = [];
  let latestCategories = [];
  let prodsReady = false;
  let catsReady = false;
  let prodsFromCache = true;
  let catsFromCache = true;

  const emit = () => {
    if (prodsReady) {
      const fromCache = prodsFromCache;
      const serverConfirmed = !prodsFromCache;
      onUpdate({
        products: latestProducts,
        categories: latestCategories,
        categoriesReady: catsReady,
        fromCache,
        categoriesFromCache: catsFromCache,
        serverConfirmed
      });
    }
  };

  const unsubProds = onSnapshot(
    collection(db, "products"),
    { includeMetadataChanges: true },
    (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        const adapted = adaptProductDoc(docSnap);
        if (adapted) list.push(adapted);
      });
      latestProducts = list;
      prodsReady = true;
      prodsFromCache = Boolean(snap.metadata?.fromCache);
      if (list.length > 0 || !prodsFromCache) {
        writeCatalogCache({
          products: list,
          categories: catsReady ? latestCategories : undefined,
          serverConfirmed: !prodsFromCache
        });
      }
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  const unsubCats = subscribeCategories(
    (sortedCats, meta = {}) => {
      latestCategories = sortedCats;
      catsReady = true;
      catsFromCache = Boolean(meta.fromCache);
      emit();
    },
    () => {
      catsReady = true;
      emit();
    }
  );

  return () => {
    unsubProds();
    unsubCats();
  };
}
