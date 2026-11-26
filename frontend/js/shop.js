/* ==========================================================================
   SHAFQ — Shop Catalog Controller (Cloud Firestore Source of Truth)
   Connects to Firestore "products" and "categories" via catalog-adapter.js,
   preserving SHAFQ's filtering, sorting, favorites, pagination, and View
   Transition navigation without demonstration fallbacks.
   ========================================================================== */
import { subscribeStoreCatalog, optimizeProductImage } from "./catalog-adapter.js";
import { loadFavorites, isFavorite, toggleFavorite, setFavorites, getFavoritesCount } from "./favorites.js";
import { filterProductsByQuery, setSearchCatalog } from "./search.js";
import { addToCart } from "./cart.js";

const PER_PAGE = 6;
const MIN_PRICE = 0;
const DEFAULT_MAX_PRICE = 60000;
const LETTER_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const DEFAULT_HERO_IMG = "assets/images/shop-hero.jpg";
const DEFAULT_HERO_TITLE = "Shop";
const DEFAULT_HERO_SUB = "Discover our latest collection.";
let heroBannerRequestId = 0;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = (s) => String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

let maxPriceLimit = DEFAULT_MAX_PRICE;

function defaultFilterState() {
  return {
    category: "All",
    sizes: new Set(),
    colors: new Set(),
    minPrice: MIN_PRICE,
    maxPrice: maxPriceLimit
  };
}

function cloneFilterState(src) {
  return {
    category: src.category,
    sizes: new Set(src.sizes),
    colors: new Set(src.colors),
    minPrice: src.minPrice,
    maxPrice: src.maxPrice
  };
}

let currentView = "all";
let searchQuery = "";
let pendingCatParam = "";
let applied = defaultFilterState();
let draft = defaultFilterState();
let currentSort = "featured";
let currentPage = 1;

let liveProducts = [];
let liveCategories = [];
let isLoading = true;
let loadError = null;
let unsubscribeCatalog = null;

function isOnSaleProduct(p) {
  return Boolean(p && typeof p.oldPrice === "number" && p.oldPrice > p.price);
}

function getDiscountPercent(p) {
  if (!isOnSaleProduct(p)) return 0;
  return Math.round((1 - p.price / p.oldPrice) * 100);
}

function getSyncedSaleCount() {
  if (!isLoading && !loadError) {
    let count = 0;
    for (const p of liveProducts) {
      if (isOnSaleProduct(p)) count += 1;
    }
    return count;
  }
  return 0;
}

function applyShopHeroBanner({ src = DEFAULT_HERO_IMG, isCustomBanner = false, bgGradient = "" } = {}) {
  const hero = $(".shop-hero");
  const heroBg = $(".shop-hero__bg");
  const heroImg = $(".shop-hero__img");
  if (!hero || !heroImg) return;

  if (heroBg) {
    heroBg.style.background = bgGradient || "";
  }

  const targetSrc = String(src || "").trim();
  const requestId = ++heroBannerRequestId;

  if (!targetSrc) {
    heroImg.removeAttribute("src");
    heroImg.style.opacity = "0";
    heroImg.dataset.bannerSrc = "";
    return;
  }

  const currentTarget = heroImg.dataset.bannerSrc || heroImg.getAttribute("src") || "";
  if (currentTarget === targetSrc && heroImg.style.opacity !== "0") {
    heroImg.style.objectPosition = isCustomBanner ? "50% 50%" : "";
    return;
  }

  heroImg.dataset.bannerSrc = targetSrc;
  heroImg.style.transition = "opacity .25s ease";
  heroImg.style.opacity = "0";

  const preloader = new Image();
  preloader.onload = () => {
    if (requestId !== heroBannerRequestId) return;
    heroImg.style.objectPosition = isCustomBanner ? "50% 50%" : "";
    heroImg.src = targetSrc;
    heroImg.style.opacity = "1";
  };
  preloader.onerror = () => {
    if (requestId !== heroBannerRequestId) return;
    if (targetSrc !== DEFAULT_HERO_IMG) {
      heroImg.style.objectPosition = "";
      heroImg.src = DEFAULT_HERO_IMG;
      heroImg.style.opacity = "1";
    } else {
      heroImg.style.opacity = "0";
    }
  };
  preloader.src = targetSrc;
}

function updateShopHero() {
  const titleEl = $(".shop-hero__title");
  const subEl = $(".shop-hero__sub");
  if (!titleEl || !subEl) return;

  if (isLoading && pendingCatParam) {
    titleEl.removeAttribute("dir");
    subEl.removeAttribute("dir");
    titleEl.textContent = DEFAULT_HERO_TITLE;
    subEl.textContent = "Loading collection...";
    applyShopHeroBanner({ src: DEFAULT_HERO_IMG, isCustomBanner: false });
    return;
  }

  if (currentView === "sale") {
    titleEl.removeAttribute("dir");
    subEl.removeAttribute("dir");
    titleEl.textContent = "Discounts";
    subEl.textContent = "Curated SHAFQ pieces at special pricing.";
    applyShopHeroBanner({ src: DEFAULT_HERO_IMG, isCustomBanner: false });
    return;
  }

  if (currentView === "fav") {
    titleEl.removeAttribute("dir");
    subEl.removeAttribute("dir");
    titleEl.textContent = "Favorites";
    subEl.textContent = "Your saved pieces, ready whenever you are.";
    applyShopHeroBanner({ src: DEFAULT_HERO_IMG, isCustomBanner: false });
    return;
  }

  if (searchQuery) {
    titleEl.setAttribute("dir", "auto");
    subEl.removeAttribute("dir");
    titleEl.textContent = `Search: \u201C${searchQuery}\u201D`;
    subEl.textContent = "Matching pieces across the SHAFQ catalog.";
    applyShopHeroBanner({ src: DEFAULT_HERO_IMG, isCustomBanner: false });
    return;
  }

  if (applied.category && applied.category !== "All") {
    const selCat = liveCategories.find(
      (c) => c.name.trim().toLowerCase() === applied.category.trim().toLowerCase()
    );
    const displayTitle = selCat ? selCat.name : applied.category;
    const promoMsg = selCat ? (selCat.msg || selCat.desc || "") : "";

    titleEl.setAttribute("dir", "auto");
    titleEl.textContent = displayTitle;

    if (promoMsg) {
      subEl.setAttribute("dir", "auto");
      subEl.textContent = promoMsg;
    } else {
      subEl.removeAttribute("dir");
      subEl.textContent = DEFAULT_HERO_SUB;
    }

    const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    const b = selCat && selCat.banner ? selCat.banner : null;
    if (b && b.type === "image" && (b.img || b.mobileImg)) {
      const chosenSrc = (isMobile && b.mobileImg) ? b.mobileImg : (b.img || b.mobileImg);
      applyShopHeroBanner({ src: chosenSrc, isCustomBanner: true });
    } else if (b && b.type === "color" && b.c1 && b.c2) {
      applyShopHeroBanner({
        src: "",
        isCustomBanner: true,
        bgGradient: `linear-gradient(135deg, ${b.c1}, ${b.c2})`
      });
    } else {
      applyShopHeroBanner({ src: DEFAULT_HERO_IMG, isCustomBanner: false });
    }
    return;
  }

  titleEl.removeAttribute("dir");
  subEl.removeAttribute("dir");
  titleEl.textContent = DEFAULT_HERO_TITLE;
  subEl.textContent = DEFAULT_HERO_SUB;
  applyShopHeroBanner({ src: DEFAULT_HERO_IMG, isCustomBanner: false });
}

function resolveCategoryNameFromParam(param) {
  const clean = String(param || "").trim();
  if (!clean) return "All";
  const lower = clean.toLowerCase();
  if (lower === "all" || clean === "الكل") return "All";

  const matchedCat = liveCategories.find(
    (c) => c.id === clean || (c.name && c.name.trim().toLowerCase() === lower)
  );
  if (matchedCat) return matchedCat.name;

  const matchedProd = liveProducts.find(
    (p) =>
      (p.categoryId && String(p.categoryId).trim() === clean) ||
      (p.category && p.category.trim().toLowerCase() === lower)
  );
  if (matchedProd && matchedProd.category) return matchedProd.category;

  return null;
}

function parseUrlViewState() {
  try {
    const params = new URLSearchParams(location.search);
    const viewParam = (params.get("view") || "").trim().toLowerCase();
    const catParam = (params.get("cat") || params.get("category") || "").trim();
    const qParam = (params.get("q") || params.get("search") || "").trim();

    searchQuery = qParam;

    if (viewParam === "fav" || viewParam === "favorites") {
      currentView = "fav";
      pendingCatParam = "";
      searchQuery = "";
      draft.category = "All";
      applied.category = "All";
    } else if (viewParam === "sale" || viewParam === "discounts" || viewParam === "discount") {
      currentView = "sale";
      pendingCatParam = "";
      searchQuery = "";
      draft.category = "All";
      applied.category = "All";
    } else if (catParam) {
      currentView = "all";
      if (!isLoading) {
        const resolved = resolveCategoryNameFromParam(catParam);
        const finalCat = resolved || "All";
        draft.category = finalCat;
        applied.category = finalCat;
        pendingCatParam = "";
      } else {
        pendingCatParam = catParam;
      }
    } else {
      currentView = "all";
      pendingCatParam = "";
      draft.category = "All";
      applied.category = "All";
    }
  } catch (_) {
    currentView = "all";
    pendingCatParam = "";
    searchQuery = "";
    draft.category = "All";
    applied.category = "All";
  }
}

function updateShopUrlView(mode, { replace = false } = {}) {
  try {
    const url = new URL(location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("cat");
    url.searchParams.delete("category");
    url.searchParams.delete("q");
    url.searchParams.delete("search");

    const effectiveMode = mode || currentView;
    if (effectiveMode === "fav") {
      url.searchParams.set("view", "fav");
    } else if (effectiveMode === "sale") {
      url.searchParams.set("view", "sale");
    } else {
      if (applied.category && applied.category !== "All") {
        const catObj = liveCategories.find((c) => c.name === applied.category);
        url.searchParams.set("cat", catObj ? catObj.id : applied.category);
      }
      if (searchQuery) {
        url.searchParams.set("q", searchQuery);
      }
    }

    if (url.href !== location.href) {
      if (replace) {
        history.replaceState({ shafqUrl: url.href }, "", url.href);
      } else {
        history.pushState({ shafqUrl: url.href }, "", url.href);
      }
      if (window.SHAFQ_VT && typeof window.SHAFQ_VT.syncRoute === "function") {
        window.SHAFQ_VT.syncRoute(url.href);
      }
    }
  } catch (_) {}
}

function applySearchQuery(q) {
  searchQuery = String(q || "").trim();
  pendingCatParam = "";
  currentView = "all";
  draft.category = "All";
  applied.category = "All";
  currentPage = 1;
  updateShopUrlView("all");
  syncControlsToDraft();
  renderCatalog(true);
  const target = $("#shop-catalog");
  if (target && searchQuery) {
    const rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function getSyncedFavoritesCount() {
  if (!isLoading && !loadError) {
    let count = 0;
    for (const p of liveProducts) {
      if (isFavorite(p.id)) count += 1;
    }
    return count;
  }
  return getFavoritesCount();
}

function formatDA(n) {
  return (Number(n) || 0).toLocaleString("en-US") + " DA";
}

function compareSizes(a, b) {
  const ia = LETTER_SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = LETTER_SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

function renderDynamicFilters() {
  const catsEl = $(".filter-cats");
  const sizesEl = $(".filter-sizes");
  const colorsEl = $(".filter-colors");

  // 1. Categories: "All" + active Firestore categories (+ any category found on active products)
  if (catsEl) {
    const seenCats = new Set(["All"]);
    const catNames = [];
    liveCategories.forEach((c) => {
      if (c.name && !seenCats.has(c.name)) {
        seenCats.add(c.name);
        catNames.push(c.name);
      }
    });
    liveProducts.forEach((p) => {
      if (p.category && !seenCats.has(p.category)) {
        seenCats.add(p.category);
        catNames.push(p.category);
      }
    });

    if (!isLoading && !pendingCatParam && draft.category !== "All" && !seenCats.has(draft.category)) {
      draft.category = "All";
      applied.category = "All";
    }

    catsEl.innerHTML = [
      `<button type="button" class="filter-cat${currentView === "all" && draft.category === "All" ? " is-active" : ""}" data-category="All" aria-pressed="${currentView === "all" && draft.category === "All"}">All</button>`,
      ...catNames.map((name) => {
        const active = currentView === "all" && draft.category === name;
        const catObj = liveCategories.find((c) => c.name === name);
        const catIdAttr = catObj ? ` data-cat-id="${esc(catObj.id)}"` : "";
        return `<button type="button" class="filter-cat${active ? " is-active" : ""}" data-category="${esc(name)}"${catIdAttr} aria-pressed="${active}" dir="auto">${esc(name)}</button>`;
      }),
      `<button type="button" class="filter-cat${currentView === "sale" ? " is-active" : ""}" data-view-mode="sale" aria-pressed="${currentView === "sale"}">Discounts</button>`,
      `<button type="button" class="filter-cat${currentView === "fav" ? " is-active" : ""}" data-view-mode="fav" aria-pressed="${currentView === "fav"}">Favorites</button>`
    ].join("");
  }

  // 2. Sizes extracted from real Firestore products
  if (sizesEl) {
    const sizeSet = new Set();
    liveProducts.forEach((p) => {
      (p.availableSizes || []).forEach((s) => sizeSet.add(s));
    });
    const sortedSizes = Array.from(sizeSet).sort(compareSizes);
    if (sortedSizes.length > 0) {
      sizesEl.innerHTML = sortedSizes.map((sz) => {
        const active = draft.sizes.has(sz);
        return `<button type="button" class="filter-size${active ? " is-selected" : ""}" data-size="${esc(sz)}" aria-pressed="${active}">${esc(sz)}</button>`;
      }).join("");
    }
  }

  // 3. Color swatches extracted from real Firestore products
  if (colorsEl) {
    const colorMap = new Map();
    liveProducts.forEach((p) => {
      (p.availableColors || []).forEach((c) => {
        const name = typeof c === "object" ? c.name : String(c);
        const value = typeof c === "object" ? c.value : "#1D1916";
        if (name && !colorMap.has(name)) {
          colorMap.set(name, value || "#1D1916");
        }
      });
    });
    const colorEntries = Array.from(colorMap.entries());
    if (colorEntries.length > 0) {
      colorsEl.innerHTML = colorEntries.map(([name, hex]) => {
        const active = draft.colors.has(name);
        return `<button type="button" class="filter-color${active ? " is-selected" : ""}" data-color="${esc(name)}" style="--swatch:${esc(hex)}" aria-label="${esc(name)}" title="${esc(name)}" aria-pressed="${active}"></button>`;
      }).join("");
    }
  }
}

function getFilteredProducts() {
  const baseList = searchQuery ? filterProductsByQuery(liveProducts, searchQuery) : liveProducts;
  const filtered = baseList.filter((p) => {
    if (currentView === "fav") {
      if (!isFavorite(p.id)) return false;
    } else if (currentView === "sale") {
      if (!isOnSaleProduct(p)) return false;
    } else if (applied.category !== "All" && p.category !== applied.category) {
      return false;
    }
    if (applied.sizes.size > 0) {
      const hasSize = (p.availableSizes || []).some((s) => applied.sizes.has(s));
      if (!hasSize) return false;
    }
    if (applied.colors.size > 0) {
      const hasColor = (p.availableColors || []).some((c) => {
        const cName = typeof c === "object" ? c.name : c;
        return applied.colors.has(cName);
      });
      if (!hasColor) return false;
    }
    if (p.price < applied.minPrice || p.price > applied.maxPrice) return false;
    return true;
  });

  if (searchQuery && currentSort === "featured") {
    return filtered;
  }

  filtered.sort((a, b) => {
    if (currentSort === "newest") {
      return (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
    }
    if (currentSort === "price-asc") {
      return a.price - b.price;
    }
    if (currentSort === "price-desc") {
      return b.price - a.price;
    }
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    const tDiff = (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
    if (tDiff !== 0) return tDiff;
    return String(a.id).localeCompare(String(b.id));
  });

  return filtered;
}

function updatePriceSliderUI() {
  const slider = $("#price-slider"), label = $("#price-label");
  const minInput = $("#price-min"), maxInput = $("#price-max");
  if (!slider || !minInput || !maxInput) return;

  minInput.max = String(maxPriceLimit);
  maxInput.max = String(maxPriceLimit);

  const minVal = Number(minInput.value);
  const maxVal = Number(maxInput.value);
  const span = Math.max(1, maxPriceLimit - MIN_PRICE);
  const minPct = ((minVal - MIN_PRICE) / span) * 100;
  const maxPct = ((maxVal - MIN_PRICE) / span) * 100;
  slider.style.setProperty("--min-pct", minPct + "%");
  slider.style.setProperty("--max-pct", maxPct + "%");

  if (label) {
    label.textContent = formatDA(minVal) + " \u2014 " + formatDA(maxVal);
  }
}

function syncControlsToDraft() {
  $$(".filter-cat").forEach((btn) => {
    const viewMode = btn.dataset.viewMode;
    let active = false;
    if (viewMode === "fav") active = currentView === "fav";
    else if (viewMode === "sale") active = currentView === "sale";
    else active = currentView === "all" && btn.dataset.category === draft.category;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  $$(".filter-size").forEach((btn) => {
    const active = draft.sizes.has(btn.dataset.size);
    btn.classList.toggle("is-selected", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  $$(".filter-color").forEach((btn) => {
    const active = draft.colors.has(btn.dataset.color);
    btn.classList.toggle("is-selected", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const minInput = $("#price-min"), maxInput = $("#price-max");
  if (minInput && maxInput) {
    minInput.max = String(maxPriceLimit);
    maxInput.max = String(maxPriceLimit);
    minInput.value = String(draft.minPrice);
    maxInput.value = String(draft.maxPrice);
    updatePriceSliderUI();
  }

  const sortSel = $("#shop-sort"), sortDisp = $("#shop-sort-display");
  if (sortSel) {
    sortSel.value = currentSort;
    if (sortDisp && sortSel.selectedIndex >= 0) {
      sortDisp.textContent = sortSel.options[sortSel.selectedIndex].text;
    }
  }
  $$(".shop-sort__opt").forEach((opt) => {
    const active = opt.dataset.value === currentSort;
    opt.classList.toggle("is-selected", active);
    opt.setAttribute("aria-selected", String(active));
  });
}

function closeFilterDrawer() {
  const sidebar = $("#shop-sidebar"), scrim = $("#scrim"), btnFilter = $("#btn-filter");
  if (sidebar) sidebar.classList.remove("is-open");
  if (btnFilter) btnFilter.setAttribute("aria-expanded", "false");
  if (scrim) {
    const sheet = $("#sheet-search"), drawer = $("#drawer-cart");
    if ((!sheet || sheet.hidden) && (!drawer || drawer.hidden)) {
      scrim.hidden = true;
    }
  }
}

function openFilterDrawer() {
  if (window.SHAFQ && window.SHAFQ.closeAll) window.SHAFQ.closeAll();
  const sidebar = $("#shop-sidebar"), scrim = $("#scrim"), btnFilter = $("#btn-filter");
  if (sidebar) sidebar.classList.add("is-open");
  if (scrim) scrim.hidden = false;
  if (btnFilter) btnFilter.setAttribute("aria-expanded", "true");
}

function resetAllFilters() {
  currentView = "all";
  pendingCatParam = "";
  searchQuery = "";
  draft = defaultFilterState();
  applied = defaultFilterState();
  currentSort = "featured";
  currentPage = 1;
  updateShopUrlView("all");
  syncControlsToDraft();
  closeFilterDrawer();
  renderCatalog(true);
}

function renderPagination(pagEl, total, totalPages) {
  if (total === 0) {
    pagEl.innerHTML = "";
    return;
  }

  let winStart = 1;
  let winEnd = Math.min(3, totalPages);
  if (totalPages > 3 && currentPage >= 3) {
    winEnd = Math.min(totalPages, currentPage + 1);
    winStart = Math.max(1, winEnd - 2);
  }

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  let html =
    '<button type="button" class="page-btn page-btn--arrow" data-page="' + (currentPage - 1) + '" aria-label="Previous page"' +
    (prevDisabled ? ' disabled aria-disabled="true"' : '') +
    '><svg class="ico ico--chev flip" aria-hidden="true"><use href="#i-chev-right" /></svg></button>';

  for (let i = winStart; i <= winEnd; i++) {
    const active = i === currentPage;
    html += '<button type="button" class="page-btn' + (active ? " is-active" : "") + '" data-page="' + i + '"' + (active ? ' aria-current="page"' : '') + '>' + i + '</button>';
  }

  html +=
    '<button type="button" class="page-btn page-btn--arrow" data-page="' + (currentPage + 1) + '" aria-label="Next page"' +
    (nextDisabled ? ' disabled aria-disabled="true"' : '') +
    '><svg class="ico ico--chev" aria-hidden="true"><use href="#i-chev-right" /></svg></button>';

  pagEl.innerHTML = html;
}

function renderCatalog(animate) {
  updateShopHero();
  const grid = $("#product-grid"), countEl = $("#shop-count"), pagEl = $("#shop-pagination");
  if (!grid || !countEl || !pagEl) return;

  if (isLoading) {
    countEl.textContent = "Loading collection...";
    pagEl.innerHTML = "";
    grid.innerHTML =
      '<div class="shop-empty">' +
        '<p class="shop-empty__text">Loading pieces from the catalog...</p>' +
      '</div>';
    return;
  }

  if (loadError) {
    countEl.textContent = "Catalog unavailable";
    pagEl.innerHTML = "";
    grid.innerHTML =
      '<div class="shop-empty">' +
        '<p class="shop-empty__text">Unable to load products from the database. Please check your connection and try again.</p>' +
        '<button type="button" class="shop-empty__reset" id="btn-retry-catalog">Retry</button>' +
      '</div>';
    const retryBtn = $("#btn-retry-catalog");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        isLoading = true;
        loadError = null;
        renderCatalog(false);
        startCatalogSubscription(true);
      });
    }
    return;
  }

  const items = getFilteredProducts();
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * PER_PAGE;
  const pageItems = items.slice(startIdx, startIdx + PER_PAGE);

  if (currentView === "fav") {
    if (total === 0) {
      countEl.textContent = "Showing 0 favorite products";
    } else {
      const from = startIdx + 1;
      const to = startIdx + pageItems.length;
      countEl.textContent = "Showing " + from + "\u2013" + to + " of " + total + " favorite product" + (total === 1 ? "" : "s");
    }
  } else if (currentView === "sale") {
    if (total === 0) {
      countEl.textContent = "Showing 0 discounted products";
    } else {
      const from = startIdx + 1;
      const to = startIdx + pageItems.length;
      countEl.textContent = "Showing " + from + "\u2013" + to + " of " + total + " discounted product" + (total === 1 ? "" : "s");
    }
  } else {
    let baseCountText;
    if (total === 0) {
      baseCountText = "Showing 0 of 0 products";
    } else {
      const from = startIdx + 1;
      const to = startIdx + pageItems.length;
      baseCountText = "Showing " + from + "\u2013" + to + " of " + total + " product" + (total === 1 ? "" : "s");
    }
    if (searchQuery) {
      countEl.innerHTML = `${baseCountText} for \u201C<span dir="auto">${esc(searchQuery)}</span>\u201D <button type="button" class="shop-search-clear" id="btn-clear-search">Clear</button>`;
      const clearBtn = $("#btn-clear-search");
      if (clearBtn) clearBtn.addEventListener("click", () => applySearchQuery(""));
    } else {
      countEl.textContent = baseCountText;
    }
  }

  if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    grid.classList.add("is-updating");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { grid.classList.remove("is-updating"); });
    });
  }

  if (pageItems.length === 0) {
    const hasSavedFavs = getSyncedFavoritesCount() > 0;
    const hasSaleItems = getSyncedSaleCount() > 0;
    let emptyText = "No pieces match your selected filters.";
    let resetLabel = "Reset Filters";
    if (currentView === "fav") {
      emptyText = hasSavedFavs
        ? "No favorite pieces match your selected filters."
        : "No favorite pieces yet. Tap the heart on any product to save it here.";
      if (!hasSavedFavs) resetLabel = "Browse All Pieces";
    } else if (currentView === "sale") {
      emptyText = hasSaleItems
        ? "No discounted pieces match your selected filters."
        : "No discounted pieces are available right now.";
      if (!hasSaleItems) resetLabel = "Browse All Pieces";
    }
    grid.innerHTML =
      '<div class="shop-empty">' +
        '<p class="shop-empty__text">' + emptyText + '</p>' +
        '<button type="button" class="shop-empty__reset" id="btn-empty-reset">' + resetLabel + '</button>' +
      '</div>';
    const emptyReset = $("#btn-empty-reset");
    if (emptyReset) emptyReset.addEventListener("click", resetAllFilters);
  } else {
    grid.innerHTML = pageItems.map((p) => {
      const isFav = isFavorite(p.id);
      const href = "/product?id=" + encodeURIComponent(p.id);
      const badgeLabel = p.badge || (p.isNew ? "New" : "");
      const disc = getDiscountPercent(p);
      return (
        '<article class="product-card" data-product-id="' + esc(p.id) + '">' +
          '<a class="product-card__media" href="' + href + '">' +
            '<img class="product-card__img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" style="object-position:' + esc(p.imagePosition || "50% 25%") + '" onerror="this.style.opacity=\'0\'">' +
            (disc > 0 ? '<span class="product-card__sale">-' + disc + '%</span>' : '') +
            '<button type="button" class="product-card__fav' + (isFav ? " is-favorited" : "") + '" data-fav-id="' + esc(p.id) + '" aria-label="Favorite ' + esc(p.name) + '" aria-pressed="' + String(isFav) + '">' +
              '<svg class="ico ico--heart" aria-hidden="true"><use href="#i-heart" /></svg>' +
            '</button>' +
          '</a>' +
          '<div class="product-card__meta">' +
            '<div class="product-card__row">' +
              '<h3 class="product-card__name" dir="auto"><a href="' + href + '">' + esc(p.name) + '</a></h3>' +
              (badgeLabel ? '<span class="product-card__new" dir="auto">' + esc(badgeLabel) + '</span>' : '') +
            '</div>' +
            '<p class="product-card__price">' +
              '<span>' + formatDA(p.price) + '</span>' +
              (disc > 0 ? '<span class="product-card__old-price">' + formatDA(p.oldPrice) + '</span>' : '') +
            '</p>' +
            '<div class="product-card__actions">' +
              '<button type="button" class="product-card__cart" data-add-id="' + esc(p.id) + '" aria-label="Add ' + esc(p.name) + ' to bag">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.6 8.2h14.8l.4 12.3H4.2z"/><path d="M8.6 8.2V6.4a3.4 3.4 0 0 1 6.8 0v1.8"/></svg>' +
                '<span class="product-card__cart-text">Add to Bag</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join("");
  }

  renderPagination(pagEl, total, totalPages);
}

function handleCatalogSnapshot({ products, categories }) {
  const prevCeiling = maxPriceLimit;
  const highestPrice = products.reduce((mx, p) => Math.max(mx, Number(p.price) || 0), 0);
  maxPriceLimit = Math.max(DEFAULT_MAX_PRICE, Math.ceil(highestPrice / 500) * 500);

  if (draft.maxPrice === prevCeiling) draft.maxPrice = maxPriceLimit;
  if (applied.maxPrice === prevCeiling) applied.maxPrice = maxPriceLimit;

  liveProducts = products;
  liveCategories = categories;
  isLoading = false;
  loadError = null;
  setSearchCatalog(products, optimizeProductImage);

  if (pendingCatParam) {
    const resolved = resolveCategoryNameFromParam(pendingCatParam);
    const finalCat = resolved || "All";
    draft.category = finalCat;
    applied.category = finalCat;
    pendingCatParam = "";
  }

  if ($("#shop-catalog")) {
    renderDynamicFilters();
    syncControlsToDraft();
    renderCatalog(false);
  }
}

function startCatalogSubscription(forceRestart = false) {
  if (unsubscribeCatalog && !forceRestart) return;
  if (unsubscribeCatalog) {
    try { unsubscribeCatalog(); } catch (_) {}
    unsubscribeCatalog = null;
  }

  unsubscribeCatalog = subscribeStoreCatalog(
    handleCatalogSnapshot,
    (err) => {
      console.error("Firestore Shop catalog error:", err);
      isLoading = false;
      loadError = err;
      if ($("#shop-catalog")) renderCatalog(false);
    }
  );
}

function bindCatalogDomEvents(catalog) {
  if (!catalog || catalog.dataset.shafqBound) return;
  catalog.dataset.shafqBound = "1";

  // Delegated category & view-mode (Sale / Favorites) filter clicks
  const catsEl = $(".filter-cats", catalog);
  if (catsEl) {
    catsEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".filter-cat");
      if (!btn) return;
      pendingCatParam = "";
      searchQuery = "";
      if (btn.dataset.viewMode === "fav") {
        currentView = "fav";
        draft.category = "All";
        applied.category = "All";
        updateShopUrlView("fav");
      } else if (btn.dataset.viewMode === "sale") {
        currentView = "sale";
        draft.category = "All";
        applied.category = "All";
        updateShopUrlView("sale");
      } else {
        currentView = "all";
        draft.category = btn.dataset.category || "All";
        applied.category = draft.category;
        updateShopUrlView("all");
      }
      currentPage = 1;
      syncControlsToDraft();
      renderCatalog(true);
    });
  }

  // Delegated size filter clicks
  const sizesEl = $(".filter-sizes", catalog);
  if (sizesEl) {
    sizesEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".filter-size");
      if (!btn) return;
      const sz = btn.dataset.size;
      if (!sz) return;
      if (draft.sizes.has(sz)) draft.sizes.delete(sz);
      else draft.sizes.add(sz);
      syncControlsToDraft();
    });
  }

  // Delegated color swatch clicks
  const colorsEl = $(".filter-colors", catalog);
  if (colorsEl) {
    colorsEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".filter-color");
      if (!btn) return;
      const col = btn.dataset.color;
      if (!col) return;
      if (draft.colors.has(col)) draft.colors.delete(col);
      else draft.colors.add(col);
      syncControlsToDraft();
    });
  }

  // Dual-handle price range slider
  const minInput = $("#price-min", catalog), maxInput = $("#price-max", catalog);
  if (minInput && maxInput) {
    minInput.addEventListener("input", () => {
      let v = Number(minInput.value);
      if (v > Number(maxInput.value)) {
        v = Number(maxInput.value);
        minInput.value = String(v);
      }
      draft.minPrice = v;
      updatePriceSliderUI();
    });
    maxInput.addEventListener("input", () => {
      let v = Number(maxInput.value);
      if (v < Number(minInput.value)) {
        v = Number(minInput.value);
        maxInput.value = String(v);
      }
      draft.maxPrice = v;
      updatePriceSliderUI();
    });
  }

  // Apply & Reset Filters
  const applyBtn = $("#btn-apply-filters", catalog);
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      applied = cloneFilterState(draft);
      currentPage = 1;
      closeFilterDrawer();
      renderCatalog(true);
    });
  }

  const resetBtn = $("#btn-reset-filters", catalog);
  if (resetBtn) {
    resetBtn.addEventListener("click", resetAllFilters);
  }

  // Sorting
  const sortSel = $("#shop-sort", catalog);
  const sortTrigger = $("#shop-sort-trigger", catalog), sortMenu = $("#shop-sort-menu", catalog);

  const closeSortMenu = () => {
    if (sortMenu) sortMenu.hidden = true;
    if (sortTrigger) sortTrigger.setAttribute("aria-expanded", "false");
  };

  const selectSort = (val) => {
    currentSort = val;
    if (sortSel) sortSel.value = val;
    currentPage = 1;
    syncControlsToDraft();
    closeSortMenu();
    renderCatalog(true);
  };

  if (sortTrigger && sortMenu) {
    sortTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = sortMenu.hidden;
      sortMenu.hidden = !open;
      sortTrigger.setAttribute("aria-expanded", String(open));
    });
    sortMenu.addEventListener("click", (e) => {
      const opt = e.target?.closest?.(".shop-sort__opt");
      if (!opt) return;
      selectSort(opt.dataset.value);
    });
  }
  if (sortSel) {
    sortSel.addEventListener("change", () => {
      selectSort(sortSel.value);
    });
  }

  // Favorite toggle, Quick Add to Bag, & product card click delegation
  const grid = $("#product-grid", catalog);
  if (grid) {
    grid.addEventListener("click", (e) => {
      const cartBtn = e.target?.closest?.(".product-card__cart");
      if (cartBtn) {
        e.preventDefault();
        e.stopPropagation();
        const pid = cartBtn.dataset.addId;
        if (pid) handleCardQuickAdd(pid, cartBtn);
        return;
      }
      const favBtn = e.target?.closest?.(".product-card__fav");
      if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = favBtn.dataset.favId;
        const result = toggleFavorite(id);
        if (!result) return;
        const active = result.favorited;
        favBtn.classList.toggle("is-favorited", active);
        favBtn.setAttribute("aria-pressed", String(active));
        if (currentView === "fav") {
          renderCatalog(true);
        }
        if (window.SHAFQ_SHOP && typeof window.SHAFQ_SHOP.onFavoriteToggle === "function") {
          window.SHAFQ_SHOP.onFavoriteToggle(id, active);
        }
        return;
      }
      const card = e.target?.closest?.(".product-card");
      if (card && window.SHAFQ_SHOP && typeof window.SHAFQ_SHOP.onProductClick === "function") {
        window.SHAFQ_SHOP.onProductClick(card.dataset.productId, e);
      }
    });
  }

  // Pagination clicks
  const pagEl = $("#shop-pagination", catalog);
  if (pagEl) {
    pagEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".page-btn");
      if (!btn) return;
      const next = Number(btn.dataset.page);
      if (!next || next === currentPage) return;
      currentPage = next;
      renderCatalog(true);
      const topTarget = $("#shop-catalog");
      if (topTarget) {
        const rect = topTarget.getBoundingClientRect();
        if (rect.top < 0) topTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Mobile filter drawer controls
  const btnFilter = $("#btn-filter", catalog), btnFilterClose = $("#btn-filter-close", catalog);
  if (btnFilter) btnFilter.addEventListener("click", openFilterDrawer);
  if (btnFilterClose) btnFilterClose.addEventListener("click", closeFilterDrawer);
}

function syncRenderedCardFavorites() {
  $$(".product-card__fav").forEach((btn) => {
    const active = isFavorite(btn.dataset.favId);
    btn.classList.toggle("is-favorited", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

// --- Quick Add to Bag & Editorial Quick Options Modal ---
const qoState = {
  product: null,
  triggerBtn: null,
  size: "",
  color: "",
  colorHex: "",
  qty: 1,
  submitting: false
};

function setCardButtonFeedback(btn, durationMs = 1500) {
  if (!btn) return;
  if (btn._resetTimer) {
    clearTimeout(btn._resetTimer);
    btn._resetTimer = null;
  }
  btn.classList.add("is-added");
  const txt = btn.querySelector(".product-card__cart-text");
  if (txt) txt.textContent = "Added to Bag";

  btn._resetTimer = setTimeout(() => {
    btn.classList.remove("is-added");
    if (txt) txt.textContent = "Add to Bag";
    btn._resetTimer = null;
  }, durationMs);
}

function closeQuickOptions() {
  $("#qoModal")?.classList.remove("show");
  $("#qoBackdrop")?.classList.remove("show");
  document.body.classList.remove("modal-open");
  if (qoState.triggerBtn) qoState.triggerBtn._busy = false;
  qoState.product = null;
  qoState.triggerBtn = null;
}

function updateQoSubtotal() {
  if (!qoState.product) return;
  const subEl = $("#qoSubtotalVal");
  if (subEl) subEl.textContent = formatDA(qoState.product.price * qoState.qty);
}

function ensureQuickOptionsModal() {
  let backdrop = $("#qoBackdrop");
  let modal = $("#qoModal");
  if (backdrop && modal) return { backdrop, modal };

  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "qo-backdrop";
    backdrop.id = "qoBackdrop";
    document.body.appendChild(backdrop);
  }

  if (!modal) {
    modal = document.createElement("div");
    modal.className = "qo-modal";
    modal.id = "qoModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "qoTitle");
    modal.innerHTML =
      '<div class="qo-head">' +
        '<div class="qo-prod">' +
          '<img class="qo-prod__img" id="qoImg" src="" alt="">' +
          '<div class="qo-prod__info">' +
            '<h4 class="qo-prod__title" id="qoTitle" dir="auto"></h4>' +
            '<div class="qo-prod__prices">' +
              '<span class="qo-prod__price" id="qoPrice"></span>' +
              '<span class="qo-prod__old" id="qoOldPrice" hidden></span>' +
              '<span class="qo-prod__disc" id="qoDiscBadge" hidden></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="qo-close" id="qoClose" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="qo-body">' +
        '<div class="qo-section" id="qoSizesSection">' +
          '<label class="qo-label">Size: <strong id="qoSelectedSizeText"></strong></label>' +
          '<div class="p-sizes" id="qoSizesList"></div>' +
          '<div class="qo-err" id="qoSizeErr" hidden>Please select a size</div>' +
        '</div>' +
        '<div class="qo-section" id="qoColorsSection">' +
          '<label class="qo-label">Color: <strong id="qoSelectedColorText" dir="auto"></strong></label>' +
          '<div class="p-colors" id="qoColorsList"></div>' +
          '<div class="qo-err" id="qoColorErr" hidden>Please select a color</div>' +
        '</div>' +
        '<div class="qo-qty-row">' +
          '<div class="qty">' +
            '<button type="button" id="qoQtyMinus" aria-label="Decrease quantity">&minus;</button>' +
            '<span id="qoQtyVal">1</span>' +
            '<button type="button" id="qoQtyPlus" aria-label="Increase quantity">+</button>' +
          '</div>' +
          '<div class="qo-subtotal">Subtotal: <strong id="qoSubtotalVal">0 DA</strong></div>' +
        '</div>' +
        '<div class="qo-banner-err" id="qoBannerErr" hidden></div>' +
        '<button type="button" class="qo-submit" id="qoSubmitBtn">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.6 8.2h14.8l.4 12.3H4.2z"/><path d="M8.6 8.2V6.4a3.4 3.4 0 0 1 6.8 0v1.8"/></svg>' +
          '<span>Add to Bag</span>' +
        '</button>' +
      '</div>';
    document.body.appendChild(modal);
  }

  if (!modal._shafqBound) {
    modal._shafqBound = true;
    backdrop.addEventListener("click", closeQuickOptions);
    $("#qoClose", modal)?.addEventListener("click", closeQuickOptions);

    $("#qoQtyPlus", modal)?.addEventListener("click", () => {
      if (qoState.qty < 50) qoState.qty += 1;
      const qtyEl = $("#qoQtyVal", modal);
      if (qtyEl) qtyEl.textContent = String(qoState.qty);
      updateQoSubtotal();
    });

    $("#qoQtyMinus", modal)?.addEventListener("click", () => {
      if (qoState.qty > 1) {
        qoState.qty -= 1;
        const qtyEl = $("#qoQtyVal", modal);
        if (qtyEl) qtyEl.textContent = String(qoState.qty);
        updateQoSubtotal();
      }
    });

    $("#qoSubmitBtn", modal)?.addEventListener("click", () => {
      const p = qoState.product;
      if (qoState.submitting || !p) return;

      const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
      const hasColors = Array.isArray(p.colors) && p.colors.length > 0;
      const needSize = hasSizes && !qoState.size;
      const needColor = hasColors && !qoState.color;

      const sizeErr = $("#qoSizeErr", modal);
      const colorErr = $("#qoColorErr", modal);
      const bannerErr = $("#qoBannerErr", modal);

      if (sizeErr) sizeErr.hidden = !needSize;
      if (colorErr) colorErr.hidden = !needColor;
      if (needSize || needColor) {
        if (bannerErr) {
          bannerErr.textContent = (needSize && needColor)
            ? "Please select a size and color"
            : (needSize ? "Please select a size first" : "Please select a color first");
          bannerErr.hidden = false;
        }
        return;
      }

      qoState.submitting = true;
      const submitBtn = $("#qoSubmitBtn", modal);
      if (submitBtn) submitBtn.disabled = true;

      const addFn = typeof addToCart === "function" ? addToCart : window.shafqCart?.addToCart;
      if (typeof addFn === "function") {
        addFn({
          productId: p.id,
          name: p.name,
          price: p.price,
          image: p.image || "",
          quantity: qoState.qty,
          size: hasSizes ? qoState.size : "",
          color: hasColors ? qoState.color : "",
          colorHex: hasColors ? qoState.colorHex : "",
          availableSizes: hasSizes ? p.sizes : [],
          availableColors: hasColors ? p.colors : [],
          openDrawer: false
        });
      }

      const targetBtn = qoState.triggerBtn;
      closeQuickOptions();
      setCardButtonFeedback(targetBtn, 1500);

      setTimeout(() => {
        qoState.submitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }, 220);
    });
  }

  return { backdrop, modal };
}

function openQuickOptions(p, btn) {
  const { backdrop, modal } = ensureQuickOptionsModal();
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const colors = Array.isArray(p.colors) ? p.colors : [];

  qoState.product = p;
  qoState.triggerBtn = btn;
  qoState.qty = 1;
  qoState.size = sizes.length === 1 ? sizes[0] : "";
  qoState.color = colors.length === 1 ? (colors[0].name || "") : "";
  qoState.colorHex = colors.length === 1 ? (colors[0].value || "#1D1916") : "#1D1916";

  const imgEl = $("#qoImg", modal);
  const titleEl = $("#qoTitle", modal);
  const priceEl = $("#qoPrice", modal);
  const oldEl = $("#qoOldPrice", modal);
  const discEl = $("#qoDiscBadge", modal);
  const qtyEl = $("#qoQtyVal", modal);
  const sizeErr = $("#qoSizeErr", modal);
  const colorErr = $("#qoColorErr", modal);
  const bannerErr = $("#qoBannerErr", modal);
  const sizeText = $("#qoSelectedSizeText", modal);
  const colorText = $("#qoSelectedColorText", modal);

  if (imgEl) {
    imgEl.src = optimizeProductImage(p.image || "", 320);
    imgEl.alt = p.name || "";
  }
  if (titleEl) titleEl.textContent = p.name || "";
  if (priceEl) priceEl.textContent = formatDA(p.price);

  const disc = getDiscountPercent(p);
  if (oldEl) {
    oldEl.textContent = disc > 0 ? formatDA(p.oldPrice) : "";
    oldEl.hidden = disc <= 0;
  }
  if (discEl) {
    discEl.textContent = disc > 0 ? `-${disc}%` : "";
    discEl.hidden = disc <= 0;
  }

  if (qtyEl) qtyEl.textContent = "1";
  if (sizeErr) sizeErr.hidden = true;
  if (colorErr) colorErr.hidden = true;
  if (bannerErr) bannerErr.hidden = true;
  if (sizeText) sizeText.textContent = qoState.size;
  if (colorText) colorText.textContent = qoState.color;
  updateQoSubtotal();

  const sizesSec = $("#qoSizesSection", modal);
  const sizesList = $("#qoSizesList", modal);
  if (sizes.length > 0 && sizesSec && sizesList) {
    sizesSec.hidden = false;
    sizesList.innerHTML = sizes
      .map((s) => '<button type="button" class="size' + (s === qoState.size ? " active" : "") + '" data-size="' + esc(s) + '">' + esc(s) + "</button>")
      .join("");
    $$(".size", sizesList).forEach((chip) => {
      chip.addEventListener("click", () => {
        $$(".size", sizesList).forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        qoState.size = chip.dataset.size || "";
        if (sizeText) sizeText.textContent = qoState.size;
        if (sizeErr) sizeErr.hidden = true;
        if (bannerErr) bannerErr.hidden = true;
      });
    });
  } else if (sizesSec) {
    sizesSec.hidden = true;
  }

  const colorsSec = $("#qoColorsSection", modal);
  const colorsList = $("#qoColorsList", modal);
  if (colors.length > 0 && colorsSec && colorsList) {
    colorsSec.hidden = false;
    colorsList.innerHTML = colors
      .map((c) => {
        const nm = c.name || "";
        const hex = c.value || "#1D1916";
        return '<button type="button" class="dot' + (nm === qoState.color ? " active" : "") + '" style="background:' + esc(hex) + '" title="' + esc(nm) + '" aria-label="' + esc(nm) + '" data-name="' + esc(nm) + '" data-val="' + esc(hex) + '"></button>';
      })
      .join("");
    $$(".dot", colorsList).forEach((dot) => {
      dot.addEventListener("click", () => {
        $$(".dot", colorsList).forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        qoState.color = dot.dataset.name || "";
        qoState.colorHex = dot.dataset.val || "#1D1916";
        if (colorText) colorText.textContent = qoState.color;
        if (colorErr) colorErr.hidden = true;
        if (bannerErr) bannerErr.hidden = true;
      });
    });
  } else if (colorsSec) {
    colorsSec.hidden = true;
  }

  backdrop.classList.add("show");
  modal.classList.add("show");
  document.body.classList.add("modal-open");
}

function handleCardQuickAdd(productId, btn) {
  if (!btn || btn._busy) return;
  btn._busy = true;
  setTimeout(() => { btn._busy = false; }, 220);

  const p = liveProducts.find((item) => String(item.id) === String(productId));
  if (!p) {
    btn._busy = false;
    return;
  }

  const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
  const hasColors = Array.isArray(p.colors) && p.colors.length > 0;

  if (!hasSizes && !hasColors) {
    const addFn = typeof addToCart === "function" ? addToCart : window.shafqCart?.addToCart;
    if (typeof addFn === "function") {
      addFn({
        productId: p.id,
        name: p.name,
        price: p.price,
        image: p.image || "",
        quantity: 1,
        size: "",
        color: "",
        colorHex: "",
        availableSizes: [],
        availableColors: [],
        openDrawer: false
      });
      setCardButtonFeedback(btn, 1500);
    }
    return;
  }

  openQuickOptions(p, btn);
}

function init() {
  const catalog = $("#shop-catalog");
  if (!catalog) return;

  loadFavorites();
  parseUrlViewState();
  startCatalogSubscription(false);
  bindCatalogDomEvents(catalog);

  if (!isLoading && !loadError) {
    renderDynamicFilters();
  }
  syncControlsToDraft();
  renderCatalog(false);
}

if (!document._shafqShopGlobalBound) {
  document._shafqShopGlobalBound = true;
  if (window.matchMedia) {
    const mq = window.matchMedia("(max-width: 768px)");
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", () => {
        if ($("#shop-catalog") && !isLoading) updateShopHero();
      });
    }
  }
  window.addEventListener("popstate", () => {
    if (!$("#shop-catalog")) return;
    loadFavorites();
    parseUrlViewState();
    currentPage = 1;
    syncControlsToDraft();
    renderCatalog(false);
  });
  document.addEventListener("shafq:favorites", () => {
    if (!$("#shop-catalog")) return;
    if (currentView === "fav") {
      renderCatalog(false);
    } else {
      syncRenderedCardFavorites();
    }
  });
  document.addEventListener("click", (e) => {
    const wrap = $("#shop-sort-wrap"), menu = $("#shop-sort-menu"), trig = $("#shop-sort-trigger");
    if (menu && !menu.hidden && wrap && !wrap.contains(e.target)) {
      menu.hidden = true;
      if (trig) trig.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("#qoModal")?.classList.contains("show")) {
        closeQuickOptions();
      }
      const menu = $("#shop-sort-menu"), trig = $("#shop-sort-trigger");
      if (menu && !menu.hidden) {
        menu.hidden = true;
        if (trig) trig.setAttribute("aria-expanded", "false");
      }
    }
  });
}

window.SHAFQ_SHOP = {
  init,
  closeDrawer: closeFilterDrawer,
  getProducts: () => liveProducts,
  applySearch: applySearchQuery,
  setFavorites: (ids) => {
    setFavorites(ids);
    if ($("#shop-catalog")) renderCatalog(false);
  },
  onFavoriteToggle: null,
  onProductClick: null
};

if (document.readyState !== "loading" && $("#shop-catalog")) {
  init();
} else if ($("#shop-catalog")) {
  document.addEventListener("DOMContentLoaded", init, { once: true });
}
