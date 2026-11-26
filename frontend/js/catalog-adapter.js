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

export function optimizeProductImage(url, width = 800) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (trimmed.includes("res.cloudinary.com") && trimmed.includes("/upload/")) {
    if (!trimmed.includes("/f_auto,q_auto")) {
      return trimmed.replace("/upload/", `/upload/f_auto,q_auto,w_${width}/`);
    }
  }
  return trimmed;
}

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

  const rawImg = d.mainImage || d.img || (Array.isArray(d.images) && d.images[0] ? (d.images[0].url || d.images[0]) : "") || "";
  const image = optimizeProductImage(rawImg, 800);
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
    image,
    img: image,
    mainImage: image,
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

  return { products, categories: sortCategories(categories) };
}

/**
 * Fetches a single active product by exact Firestore ID with collection fallback.
 */
export async function fetchProductById(productId) {
  const idStr = String(productId || "").trim();
  if (!idStr) return { product: null, error: null };

  let firestoreError = null;
  try {
    try {
      const directDocSnap = await getDoc(doc(db, "products", idStr));
      if (directDocSnap.exists()) {
        const adapted = adaptProductDoc(directDocSnap);
        if (adapted) return { product: adapted, error: null };
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
    return { product: match, error: null };
  } catch (err) {
    firestoreError = err;
    console.warn("Firestore product load warning:", err);
  }

  return { product: null, error: firestoreError };
}

/**
 * Real-time subscription to Firestore active categories.
 */
export function subscribeCategories(onUpdate, onError) {
  return onSnapshot(
    collection(db, "categories"),
    (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        const adapted = adaptCategoryDoc(docSnap);
        if (adapted) list.push(adapted);
      });
      onUpdate(sortCategories(list));
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

  const emit = () => {
    if (prodsReady) {
      onUpdate({
        products: latestProducts,
        categories: latestCategories,
        categoriesReady: catsReady
      });
    }
  };

  const unsubProds = onSnapshot(
    collection(db, "products"),
    (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        const adapted = adaptProductDoc(docSnap);
        if (adapted) list.push(adapted);
      });
      latestProducts = list;
      prodsReady = true;
      emit();
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  const unsubCats = subscribeCategories(
    (sortedCats) => {
      latestCategories = sortedCats;
      catsReady = true;
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
