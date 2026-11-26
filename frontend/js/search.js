/* ==========================================================================
   SHAFQ — Intelligent Catalog Search Engine (Phase 4.3.1)
   - Powered by Fuse.js (v7.0.0) with cached index rebuilt only on catalog updates
   - Arabic & French/Latin text normalization (diacritics, Alef/Taa/Ya, accents)
   - Curated bilingual fashion & fragrance alias mapping (no aggressive noise)
   - Multi-token matching + relevance ranking (Name > Category > Alias > Desc)
   - Short-query false-positive prevention & full Phase 4.3 UI compatibility
   ========================================================================== */

import Fuse from "./vendor/fuse.js";

let catalogAdapterPromise = null;
let optimizeProductImageFn = null;

async function loadCatalogAdapter() {
  if (!catalogAdapterPromise) {
    catalogAdapterPromise = import("./catalog-adapter.js")
      .then((mod) => {
        if (typeof mod.optimizeProductImage === "function") {
          optimizeProductImageFn = mod.optimizeProductImage;
        }
        return mod;
      })
      .catch((err) => {
        catalogAdapterPromise = null;
        throw err;
      });
  }
  return catalogAdapterPromise;
}

const SEARCH_PAGE_SIZE = 10;
const DEBOUNCE_MS = 180;
const MAX_FUSE_SCORE = 0.46;

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));

/**
 * Arabic & French normalization preserving word boundaries and distinctions:
 * - Strips French combining accents + Arabic tashkeel diacritics & tatweel
 * - Normalizes Alef variants (أإآٱ -> ا), ة -> ه, ى -> ي, ؤ -> و, ئ -> ي
 */
export function normalizeArabic(text) {
  if (!text) return "";
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, "")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Curated French/English <-> Arabic domain equivalents for menswear & fragrances
const DOMAIN_ALIAS_RULES = [
  [["قميص", "اقمصه"], ["chemise", "shirt", "قمصان", "قمص"]],
  [["عطر", "عطور", "بارفان"], ["parfum", "eau de parfum", "برفان", "برفيوم"]],
  [["بنطلون", "بناطيل"], ["pantalon", "trousers", "pants"]],
  [["حذاء", "احذيه"], ["chaussure", "chaussures", "shoes", "soulier"]],
  [["اكسفورد", "اوكسفورد"], ["oxford", "اوكسفورد", "اكسفورد"]],
  [["لوفرز"], ["loafers", "mocassin", "لوفر"]],
  [["تشينو"], ["chino", "شينو"]],
  [["كتان", "كتاني"], ["lin", "linen"]],
  [["قطن", "قطني"], ["coton", "cotton"]],
  [["جلد", "جلديه", "جلدي"], ["cuir", "leather"]],
  [["شامواه", "السويد"], ["chamois", "suede", "daim", "شاموه"]],
  [["كلاسيك", "كلاسيكيه"], ["classique", "classic"]],
  [["كاجوال"], ["casual"]],
  [["رالف لورين"], ["ralph", "lauren", "polo"]],
  [["اكسيسوارات"], ["accessoire", "accessoires", "accessories", "اكسسوار"]],
  [["ابيض", "الابيض"], ["blanc", "white"]],
  [["اسود", "بلاك"], ["noir", "black"]],
  [["ازرق"], ["bleu", "blue"]],
  [["كحلي"], ["navy", "marine"]],
  [["بني"], ["marron", "brown"]],
  [["الدهبي"], ["ذهبي", "الذهبي", "dore", "gold"]],
  [["عود"], ["oud"]],
  [["مسك"], ["musc", "musk"]]
];

function buildDomainAliases(combinedNorm) {
  const tokens = [];
  for (const [triggers, aliases] of DOMAIN_ALIAS_RULES) {
    if (triggers.some((t) => combinedNorm.includes(t))) {
      tokens.push(...aliases);
    }
  }
  return Array.from(new Set(tokens));
}

function buildIndexedEntry(p) {
  const nameNorm = normalizeArabic(p.name);
  const catLabel = p.category || (p.categoryId && !/^[A-Za-z0-9_-]{15,}$/.test(String(p.categoryId)) ? p.categoryId : "");
  const catNorm = normalizeArabic(catLabel);
  const descNorm = normalizeArabic(p.desc || p.description || "");
  const aliasList = buildDomainAliases(`${nameNorm} ${catNorm} ${descNorm}`);
  const aliasesNorm = aliasList.join(" ");

  return {
    product: p,
    idLower: String(p.id || "").toLowerCase(),
    catIdLower: String(p.categoryId || "").toLowerCase(),
    nameNorm,
    catNorm,
    descNorm,
    aliasesNorm,
    nameWords: nameNorm.split(" ").filter(Boolean),
    catWords: catNorm.split(" ").filter(Boolean),
    aliasWords: aliasList,
    descWords: descNorm.split(" ").filter(Boolean)
  };
}

function createFuseState(products) {
  const activeProducts = Array.isArray(products)
    ? products.filter((p) => p && p.status !== "hidden")
    : [];
  const entries = activeProducts.map(buildIndexedEntry);
  const byId = new Map(entries.map((e) => [String(e.product.id), e]));

  const fuse = new Fuse(entries, {
    includeScore: true,
    ignoreLocation: true,
    fieldNormWeight: 0.25,
    threshold: 0.34,
    minMatchCharLength: 2,
    keys: [
      { name: "nameWords", weight: 1.0 },
      { name: "catWords", weight: 0.7 },
      { name: "aliasWords", weight: 0.5 },
      { name: "descWords", weight: 0.35 }
    ]
  });

  return { entries, byId, fuse };
}

function computeExactTokenRank(entry, token, rawIdLower) {
  // For single-character queries, require word-start match in name or category only (avoid short false positives)
  if (token.length === 1) {
    if (entry.nameWords.some((w) => w.startsWith(token))) return -1.4;
    if (entry.catWords.some((w) => w.startsWith(token))) return -0.75;
    return null;
  }

  // Exact/substring priority: Name > ID > Category > Alias > Description
  if (entry.nameNorm.includes(token)) {
    const isWordStart = entry.nameWords.some((w) => w.startsWith(token));
    return isWordStart ? -1.4 : -1.1;
  }
  if (token.length >= 6 && (entry.idLower.includes(rawIdLower) || entry.catIdLower.includes(rawIdLower))) {
    return -0.95;
  }
  if (entry.catNorm.includes(token)) {
    return -0.75;
  }
  if (entry.aliasesNorm.includes(token)) {
    return -0.5;
  }
  if (entry.descNorm.includes(token)) {
    return -0.25;
  }
  return null;
}

function scoreSingleToken(state, token, rawQueryLower) {
  const scores = new Map(); // id -> bestScore (lower is better)

  // 1. Direct normalized matches always win relevance over fuzzy matches
  for (const entry of state.entries) {
    const exactRank = computeExactTokenRank(entry, token, rawQueryLower);
    if (exactRank !== null) {
      scores.set(String(entry.product.id), exactRank);
    }
  }

  // 2. For very short tokens (<= 2 chars), skip fuzzy edit matching to avoid false positives
  if (token.length <= 2) {
    return scores;
  }

  // 3. Fuse.js fuzzy lookup for spelling mistakes, missing letters & cross-script queries
  const fuseHits = state.fuse.search(token);
  for (const hit of fuseHits) {
    if (typeof hit.score !== "number" || hit.score > MAX_FUSE_SCORE) continue;
    const pid = String(hit.item.product.id);
    if (!scores.has(pid) || hit.score < scores.get(pid)) {
      scores.set(pid, hit.score);
    }
  }

  return scores;
}

function computeCatalogSignature(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list
    .filter((p) => p && p.status !== "hidden")
    .map((p) => `${p.id}|${p.name || ""}|${p.category || ""}|${p.desc || p.description || ""}`)
    .join("\n");
}

let cachedCatalog = [];
let catalogLoaded = false;
let cachedSignature = "";
let cachedIndexState = createFuseState([]);
let inflightCatalogPromise = null;

function getOrBuildStateForList(list) {
  const sig = computeCatalogSignature(list);
  if (sig === cachedSignature && cachedIndexState) {
    return cachedIndexState;
  }
  return createFuseState(list);
}

/**
 * Filter & relevance-rank products for rawQuery using the cached Fuse.js index.
 */
export function filterProductsByQuery(list, rawQuery) {
  if (!Array.isArray(list)) return [];
  const active = list.filter((p) => p && p.status !== "hidden");
  const rawTrimmed = String(rawQuery || "").trim();
  if (!rawTrimmed) return active;

  const qNorm = normalizeArabic(rawTrimmed);
  const tokens = qNorm.split(" ").filter(Boolean);
  if (!tokens.length) return active;

  const state = getOrBuildStateForList(active);
  const rawLower = rawTrimmed.toLowerCase();

  // Score each token independently then intersect (AND across all tokens)
  const tokenMaps = tokens.map((t) => scoreSingleToken(state, t, rawLower));
  const [firstMap, ...restMaps] = tokenMaps;
  if (!firstMap || firstMap.size === 0) return [];

  const ranked = [];
  for (const [pid, firstScore] of firstMap.entries()) {
    let totalScore = firstScore;
    let allMatched = true;
    for (const m of restMaps) {
      if (!m.has(pid)) {
        allMatched = false;
        break;
      }
      totalScore += m.get(pid);
    }
    if (!allMatched) continue;

    const entry = state.byId.get(pid);
    if (!entry) continue;

    // Bonus for full-phrase match in product name
    let avgScore = totalScore / tokens.length;
    if (tokens.length > 1 && entry.nameNorm.includes(qNorm)) {
      avgScore -= 0.6;
    }

    ranked.push({ product: entry.product, score: avgScore });
  }

  ranked.sort((a, b) => a.score - b.score);
  return ranked.map((r) => r.product);
}

export function setSearchCatalog(list, optimizeFn = null) {
  if (typeof optimizeFn === "function") {
    optimizeProductImageFn = optimizeFn;
  }
  if (!Array.isArray(list)) return;
  const active = list.filter((p) => p && p.status !== "hidden");
  const sig = computeCatalogSignature(active);
  catalogLoaded = true;
  if (sig === cachedSignature && cachedIndexState) {
    cachedCatalog = active;
    return;
  }
  cachedCatalog = active;
  cachedSignature = sig;
  cachedIndexState = createFuseState(active);
}

export async function ensureSearchCatalog(forceRefresh = false) {
  if (catalogLoaded && !forceRefresh) return cachedCatalog;
  if (window.SHAFQ_SHOP && typeof window.SHAFQ_SHOP.getProducts === "function") {
    const shopProds = window.SHAFQ_SHOP.getProducts();
    if (Array.isArray(shopProds) && shopProds.length > 0) {
      setSearchCatalog(shopProds);
      return cachedCatalog;
    }
  }
  if (!inflightCatalogPromise) {
    inflightCatalogPromise = loadCatalogAdapter()
      .then((mod) => {
        if (!catalogLoaded && typeof mod.readCatalogCache === "function") {
          const cached = mod.readCatalogCache({ allowStale: true });
          if (cached && cached.hasProducts) {
            setSearchCatalog(cached.products, mod.optimizeProductImage);
          }
        }
        return mod.fetchStoreCatalog();
      })
      .then(({ products }) => {
        setSearchCatalog(products);
        return cachedCatalog;
      })
      .catch((err) => {
        console.warn("Search catalog load warning:", err);
        return cachedCatalog;
      })
      .finally(() => {
        inflightCatalogPromise = null;
      });
  }
  return inflightCatalogPromise;
}

function navigateToUrl(targetUrl) {
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  if (isHttp) {
    const link = document.createElement("a");
    link.href = targetUrl;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    location.href = targetUrl;
  }
}

function navigateToShopSearch(query) {
  const clean = String(query || "").trim();
  if (!clean) return;

  const isShopPage = Boolean(document.getElementById("shop-catalog"));
  if (isShopPage && window.SHAFQ_SHOP && typeof window.SHAFQ_SHOP.applySearch === "function") {
    if (window.SHAFQ && window.SHAFQ.closeAll) window.SHAFQ.closeAll();
    window.SHAFQ_SHOP.applySearch(clean);
    return;
  }

  if (window.SHAFQ && window.SHAFQ.closeAll) window.SHAFQ.closeAll();
  navigateToUrl(`/shop?q=${encodeURIComponent(clean)}`);
}

function renderResultsInto({ gridEl, statusEl, rawQuery, hits, state, onRerender }) {
  if (!gridEl) return;

  if (!rawQuery) {
    gridEl.innerHTML = "";
    if (statusEl) statusEl.textContent = "";
    return;
  }

  if (statusEl) {
    statusEl.textContent = hits.length
      ? `${hits.length} matching ${hits.length === 1 ? "piece" : "pieces"} — press Enter to view in Shop`
      : `No matching pieces found for “${rawQuery}”.`;
  }

  if (!hits.length) {
    gridEl.innerHTML = `<div class="search-empty">No matching pieces found.</div>`;
    return;
  }

  const visibleHits = hits.slice(0, state.renderedCount);
  const remaining = hits.length - state.renderedCount;

  let html = visibleHits
    .map((p) => {
      const rawImg = p.rawImage || p.image || p.img || p.mainImage || "";
      const thumb = optimizeProductImageFn ? optimizeProductImageFn(rawImg, 120) : String(rawImg || "");
      const priceStr = `${(Number(p.price) || 0).toLocaleString("en-US")} DA`;
      const catHtml = p.category ? `<div class="sr-cat" dir="auto">${esc(p.category)}</div>` : "";
      return `
        <a class="sr-item" href="/product?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}">
          <img src="${esc(thumb)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.style.opacity='0'">
          <div>
            <div class="sr-name" dir="auto">${esc(p.name)}</div>
            ${catHtml}
            <div class="sr-price">${priceStr}</div>
          </div>
        </a>`;
    })
    .join("");

  if (remaining > 0) {
    html += `
      <div class="p-search-more">
        <button type="button" class="sr-more-btn" data-search-more>
          Show more results (${remaining} remaining)
        </button>
      </div>`;
  }

  gridEl.innerHTML = html;

  const moreBtn = gridEl.querySelector("[data-search-more]");
  if (moreBtn) {
    moreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.renderedCount = Math.min(state.renderedCount + SEARCH_PAGE_SIZE, hits.length);
      onRerender();
    });
  }
}

function attachSearchController({ inputEl, resultsGridEl, statusEl, scrollContainerEl, onBeforeNavigate }) {
  if (!inputEl || inputEl.dataset.shafqSearchBound) return;
  inputEl.dataset.shafqSearchBound = "1";

  const state = {
    hits: [],
    renderedCount: SEARCH_PAGE_SIZE,
    debounceTimer: null,
    lastQuery: ""
  };

  const redraw = () => {
    renderResultsInto({
      gridEl: resultsGridEl,
      statusEl,
      rawQuery: state.lastQuery,
      hits: state.hits,
      state,
      onRerender: redraw
    });
  };

  const runSearch = async () => {
    const rawQuery = inputEl.value.trim();
    state.lastQuery = rawQuery;
    if (!rawQuery) {
      state.hits = [];
      state.renderedCount = SEARCH_PAGE_SIZE;
      redraw();
      return;
    }

    if (!catalogLoaded && statusEl) {
      statusEl.textContent = "Searching collection...";
    }

    await ensureSearchCatalog();
    if (inputEl.value.trim() !== rawQuery) return;

    state.hits = filterProductsByQuery(cachedCatalog, rawQuery);
    state.renderedCount = SEARCH_PAGE_SIZE;
    redraw();
  };

  inputEl.addEventListener("input", () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = inputEl.value.trim();
      if (q) {
        e.preventDefault();
        if (onBeforeNavigate) onBeforeNavigate();
        navigateToShopSearch(q);
      }
    }
  });

  if (resultsGridEl && !resultsGridEl.dataset.shafqSearchClickBound) {
    resultsGridEl.dataset.shafqSearchClickBound = "1";
    resultsGridEl.addEventListener("click", (e) => {
      const itemLink = e.target?.closest?.("a.sr-item");
      if (itemLink && onBeforeNavigate) {
        onBeforeNavigate();
      }
    });
  }

  if (scrollContainerEl && !scrollContainerEl.dataset.shafqSearchScrollBound) {
    scrollContainerEl.dataset.shafqSearchScrollBound = "1";
    scrollContainerEl.addEventListener(
      "scroll",
      () => {
        if (state.renderedCount >= state.hits.length) return;
        const atBottom =
          scrollContainerEl.scrollTop + scrollContainerEl.clientHeight >=
          scrollContainerEl.scrollHeight - 50;
        if (atBottom) {
          state.renderedCount = Math.min(state.renderedCount + SEARCH_PAGE_SIZE, state.hits.length);
          redraw();
        }
      },
      { passive: true }
    );
  }

  return {
    runSearch,
    reset: () => {
      clearTimeout(state.debounceTimer);
      inputEl.value = "";
      state.lastQuery = "";
      state.hits = [];
      state.renderedCount = SEARCH_PAGE_SIZE;
      if (resultsGridEl) resultsGridEl.innerHTML = "";
      if (statusEl) statusEl.textContent = "";
    }
  };
}

function initGlobalSheetSearch() {
  const sheet = document.getElementById("sheet-search");
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const statusEl = document.getElementById("search-result");
  const btnSearch = document.getElementById("btn-search");
  if (!sheet || !form || !input) return;

  let gridEl = document.getElementById("search-results-grid");
  if (!gridEl) {
    gridEl = document.createElement("div");
    gridEl.id = "search-results-grid";
    gridEl.className = "p-search-results";
    gridEl.setAttribute("aria-live", "polite");
    sheet.appendChild(gridEl);
  }

  const ctrl = attachSearchController({
    inputEl: input,
    resultsGridEl: gridEl,
    statusEl,
    scrollContainerEl: gridEl,
    onBeforeNavigate: () => {
      if (window.SHAFQ && window.SHAFQ.closeAll) window.SHAFQ.closeAll();
    }
  });

  if (btnSearch && !btnSearch.dataset.shafqSearchWarmBound) {
    btnSearch.dataset.shafqSearchWarmBound = "1";
    btnSearch.addEventListener("click", () => {
      ensureSearchCatalog();
    });
  }

  if (!input.dataset.shafqSearchFocusWarmBound) {
    input.dataset.shafqSearchFocusWarmBound = "1";
    input.addEventListener("focus", () => {
      ensureSearchCatalog();
    });
  }

  if (!form.dataset.shafqSearchSubmitBound) {
    form.dataset.shafqSearchSubmitBound = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      navigateToShopSearch(q);
    });
  }

  if (ctrl) sheet._shafqSearchReset = ctrl.reset;
}

function closeProductSearchOverlay() {
  const overlay = document.getElementById("searchOverlay");
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");
  overlay?.classList.remove("show");
  overlay?.setAttribute("aria-hidden", "true");
  if (input) input.value = "";
  if (results) results.innerHTML = "";
}

function initProductOverlaySearch() {
  const overlay = document.getElementById("searchOverlay");
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");
  const openBtn = document.getElementById("searchBtn");
  const closeBtn = document.getElementById("searchClose");
  if (!overlay || !input || !results) return;

  if (openBtn && !openBtn.dataset.shafqBound) {
    openBtn.dataset.shafqBound = "1";
    openBtn.addEventListener("click", () => {
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
      ensureSearchCatalog();
      setTimeout(() => input.focus(), 80);
    });
  }

  if (!input.dataset.shafqSearchFocusWarmBound) {
    input.dataset.shafqSearchFocusWarmBound = "1";
    input.addEventListener("focus", () => {
      ensureSearchCatalog();
    });
  }

  if (closeBtn && !closeBtn.dataset.shafqBound) {
    closeBtn.dataset.shafqBound = "1";
    closeBtn.addEventListener("click", closeProductSearchOverlay);
  }

  if (!overlay.dataset.shafqBound) {
    overlay.dataset.shafqBound = "1";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeProductSearchOverlay();
    });
  }

  const ctrl = attachSearchController({
    inputEl: input,
    resultsGridEl: results,
    statusEl: null,
    scrollContainerEl: results,
    onBeforeNavigate: closeProductSearchOverlay
  });

  if (ctrl) overlay._shafqSearchReset = ctrl.reset;
}

export function resetAllSearchUI() {
  const sheet = document.getElementById("sheet-search");
  if (sheet && typeof sheet._shafqSearchReset === "function") {
    sheet._shafqSearchReset();
  }
  const overlay = document.getElementById("searchOverlay");
  if (overlay && typeof overlay._shafqSearchReset === "function") {
    overlay._shafqSearchReset();
  }
}

export function initGlobalSearch() {
  initGlobalSheetSearch();
  initProductOverlaySearch();
}

window.SHAFQ_SEARCH = {
  init: initGlobalSearch,
  reset: resetAllSearchUI,
  normalizeArabic,
  filterProducts: filterProductsByQuery,
  setCatalog: setSearchCatalog,
  ensureCatalog: ensureSearchCatalog,
  submitQuery: navigateToShopSearch
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGlobalSearch, { once: true });
} else {
  initGlobalSearch();
}
