/* ==========================================================================
   SHAFQ — Context-Specific Image Optimization Utilities
   Zero-dependency helper shared across catalog, shop, cart, search & product.
   ========================================================================== */

export const IMAGE_CONTEXT_WIDTHS = Object.freeze({
  thumb: 120,
  cart: 120,
  search: 120,
  card: 420,
  detail: 800,
  bannerMobile: 1000,
  bannerDesktop: 1600
});

export function resolveImageWidth(widthOrContext = "detail") {
  if (typeof widthOrContext === "number" && Number.isFinite(widthOrContext) && widthOrContext > 0) {
    return Math.round(widthOrContext);
  }
  const key = String(widthOrContext || "").trim();
  if (key && Object.prototype.hasOwnProperty.call(IMAGE_CONTEXT_WIDTHS, key)) {
    return IMAGE_CONTEXT_WIDTHS[key];
  }
  const parsed = Number(key);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : IMAGE_CONTEXT_WIDTHS.detail;
}

export function optimizeProductImage(url, widthOrContext = 800) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  const width = resolveImageWidth(widthOrContext);
  const marker = "/upload/";
  const uploadIdx = trimmed.indexOf(marker);
  if (trimmed.includes("res.cloudinary.com") && uploadIdx !== -1) {
    const prefix = trimmed.slice(0, uploadIdx + marker.length);
    const rest = trimmed.slice(uploadIdx + marker.length);
    if (/^f_auto,q_auto(?:,w_\d+)?\//.test(rest)) {
      return prefix + rest.replace(/^f_auto,q_auto(?:,w_\d+)?\//, `f_auto,q_auto,w_${width}/`);
    }
    if (!rest.includes("f_auto,q_auto")) {
      return `${prefix}f_auto,q_auto,w_${width}/${rest}`;
    }
  }
  return trimmed;
}

export function extractRawProductImages(d) {
  const candidates = [];
  if (!d || typeof d !== "object") return candidates;
  const pushUrl = (val) => {
    const raw = typeof val === "object" && val !== null ? val.url : val;
    const str = typeof raw === "string" ? raw.trim() : "";
    if (str && !candidates.includes(str)) {
      candidates.push(str);
    }
  };
  pushUrl(d.mainImage);
  pushUrl(d.img);
  if (Array.isArray(d.images)) {
    d.images.forEach(pushUrl);
  }
  return candidates;
}

export function getProductImageUrl(productOrUrl, context = "card") {
  if (!productOrUrl) return "";
  const raw = typeof productOrUrl === "string"
    ? productOrUrl
    : (productOrUrl.rawImage || productOrUrl.mainImage || productOrUrl.img || productOrUrl.image || (Array.isArray(productOrUrl.rawImages) && productOrUrl.rawImages[0]) || "");
  return optimizeProductImage(raw, context);
}

export function getProductGalleryUrls(product, context = "detail") {
  if (!product || typeof product !== "object") return [];
  const list = Array.isArray(product.rawImages) && product.rawImages.length
    ? product.rawImages
    : (Array.isArray(product.images) && product.images.length ? product.images : []);
  const out = list.map((u) => optimizeProductImage(u, context)).filter(Boolean);
  if (out.length === 0) {
    const primary = getProductImageUrl(product, context);
    if (primary) out.push(primary);
  }
  return out;
}
