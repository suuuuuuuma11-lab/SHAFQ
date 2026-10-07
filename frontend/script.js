/* ==========================================================================
   ClothStore — Frontend E-Commerce Logic
   Matches Reference Fashion UI:
   - Dynamic Product Catalog with Firestore Sync & Luxury Fallbacks
   - Interactive Slide-In Cart Drawer
   - Rich Product Details Modal with Swatches & Size Chips
   - Cash On Delivery Checkout flow with Telegram Bot Integration
   - Instant Live Search & Favorites Management
   ========================================================================== */

import { db } from "../dashboard/firebase-config.js";
import { 
  collection, 
  getDocs, 
  getDocsFromCache,
  getDocsFromServer,
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- Telegram Configuration ---
const TELEGRAM_BOT_TOKEN = "8916406368:AAFIJTPkAykiL54hn_mmbv6AqGax6lvq08U";
const TELEGRAM_CHAT_ID = "6609345622";

// --- Reference / Default Showcase Data (Exact Match with Reference Mockup) ---
const REFERENCE_CATEGORIES = [
  {
    id: "cat_women",
    name: "النساء",
    slug: "women",
    image: "images/cat_women.jpg"
  },
  {
    id: "cat_men",
    name: "الرجال",
    slug: "men",
    image: "images/cat_men.jpg"
  },
  {
    id: "cat_casual",
    name: "الملابس الكاجوال",
    slug: "casual",
    image: "images/cat_casual.jpg"
  },
  {
    id: "cat_accessories",
    name: "الإكسسوارات",
    slug: "accessories",
    image: "images/cat_accessories.jpg"
  }
];

const REFERENCE_PRODUCTS = [
  {
    id: "ref_jacket",
    name: "جاكيت خفيف",
    category: "الرجال",
    categoryId: "cat_men",
    price: 3200,
    priceDisplay: "3.200 د.ج",
    isNew: false,
    description: "جاكيت خفيف كلاسيكي بسحاب أنيق وتصميم عصري مريح يناسب الإطلالات اليومية والمناسبات.",
    images: ["images/prod_jacket.jpg"],
    colors: [
      { name: "بيج / جملي", value: "#B8977E" },
      { name: "أخضر داكن", value: "#1E3328" },
      { name: "أسود", value: "#1B1B1B" }
    ],
    sizes: ["M", "L", "XL", "XXL"],
    specs: ["خامة مقاومة للرياح وخفيفة الوزن", "سحاب معدني عالي الجودة", "قصة عصرية متناسقة"]
  },
  {
    id: "ref_pants",
    name: "بنطال واسع",
    category: "الملابس الكاجوال",
    categoryId: "cat_casual",
    price: 2600,
    priceDisplay: "2.600 د.ج",
    isNew: false,
    description: "بنطال واسع بقصة مريحة وأناقة عالية، مصمم بطيات راقية وخامة ناعمة تمنحك حرية الحركة طوال اليوم.",
    images: ["images/prod_pants.jpg"],
    colors: [
      { name: "كريمي / أوف وايت", value: "#E6DED4" },
      { name: "زيتي داكن", value: "#1F362B" },
      { name: "كاربون أسود", value: "#1C1C1C" }
    ],
    sizes: ["38", "40", "42", "44"],
    specs: ["قماش كتان وبوليفيسكوز فائق النعومة", "قصة واسعة مريحة (Wide Leg)", "خصر مريح وثابت"]
  },
  {
    id: "ref_hoodie",
    name: "هودي كلاسيك",
    category: "الملابس الكاجوال",
    categoryId: "cat_casual",
    price: 2400,
    priceDisplay: "2.400 د.ج",
    isNew: false,
    description: "هودي كلاسيكي مصنوع من أجود خامات القطن الدافئ، قصة مثالية وتفاصيل مريحة للاستخدام اليومي.",
    images: ["images/prod_hoodie.jpg"],
    colors: [
      { name: "بيج ناعم", value: "#DFD8CB" },
      { name: "أخضر زمردي داكن", value: "#1D3326" },
      { name: "أسود فحمي", value: "#1A1A1A" }
    ],
    sizes: ["S", "M", "L", "XL"],
    specs: ["قطن 100% مبطن بنعومة", "قبعة مريحة برباط تحكم", "جيب كانغارو واسع"]
  },
  {
    id: "ref_sweater",
    name: "كنزة صوف ناعمة",
    category: "النساء",
    categoryId: "cat_women",
    price: 2800,
    priceDisplay: "2.800 د.ج",
    isNew: true,
    description: "كنزة صوفية ناعمة بقصة فضفاضة مريحة وياقة مستديرة، تمنحك الدفء والأناقة بأسلوب مينيمالي فاخر.",
    images: ["images/prod_sweater.jpg"],
    colors: [
      { name: "جملي دافئ", value: "#B58D70" },
      { name: "بني شوكولاتة", value: "#6A5142" },
      { name: "رمادي بيج فاتح", value: "#CEC7BF" }
    ],
    sizes: ["Standard", "S/M", "L/XL"],
    specs: ["صوف فائق النعومة غير مسبب للحكة", "أكتاف منسدلة لإطلالة عصرية", "حياكة مضلعة متينة"]
  }
];

// --- Application State ---
const state = {
  products: [...REFERENCE_PRODUCTS],
  categories: [...REFERENCE_CATEGORIES],
  activeFilter: "all",
  cart: loadCartFromStorage(),
  favorites: loadFavoritesFromStorage(),
  currentDetailProduct: null,
  selectedColor: null,
  selectedSize: null,
  currentCheckoutItems: [],
  heroSlideIndex: 0
};

// Hero Carousel Images
const HERO_SLIDES = [
  "images/hero.jpg",
  "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=85"
];

// --- DOM References ---
const $ = (id) => document.getElementById(id);

const DOM = {
  header: $("siteHeader"),
  heroImg: $("heroImg"),
  heroPrevBtn: $("heroPrevBtn"),
  heroNextBtn: $("heroNextBtn"),
  heroDots: $("heroDots"),

  // Products & Categories
  productsGrid: $("productsGrid"),
  categoryTabs: $("categoryTabs"),
  categoriesSection: $("categoriesSection"),
  categoriesGrid: $("categoriesGrid"),
  viewAllCategoriesBtn: $("viewAllCategoriesBtn"),
  drawerCatTags: $("drawerCatTags"),

  // Cart Drawer
  cartBtn: $("cartBtn"),
  cartBadge: $("cartCountBadge"),
  cartDrawer: $("cartDrawer"),
  cartDrawerOverlay: $("cartDrawerOverlay"),
  closeCartDrawerBtn: $("closeCartDrawerBtn"),
  cartItemsList: $("cartItemsList"),
  cartSubtotalVal: $("cartSubtotalVal"),
  cartDrawerItemsBadge: $("cartDrawerItemsBadge"),
  proceedCheckoutBtn: $("proceedCheckoutBtn"),

  // Product Details Modal
  productModal: $("productModal"),
  closeProductModalBtn: $("closeProductModalBtn"),
  modalProductContent: $("modalProductContent"),

  // Checkout Modal
  checkoutModal: $("checkoutModal"),
  closeCheckoutModalBtn: $("closeCheckoutModalBtn"),
  checkoutForm: $("checkoutForm"),
  checkoutSummaryStrip: $("checkoutSummaryStrip"),
  submitOrderBtn: $("submitOrderBtn"),
  submitOrderText: $("submitOrderText"),
  submitOrderLoader: $("submitOrderLoader"),

  // Search
  searchBtn: $("searchBtn"),
  searchOverlay: $("searchOverlay"),
  closeSearchBtn: $("closeSearchBtn"),
  liveSearchInput: $("liveSearchInput"),
  searchResultsList: $("searchResultsList"),

  // Mobile
  mobileMenuBtn: $("mobileMenuBtn"),
  mobileDrawer: $("mobileDrawer"),
  mobileDrawerOverlay: $("mobileDrawerOverlay"),
  closeMobileDrawerBtn: $("closeMobileDrawerBtn"),

  // Toast
  toast: $("toastNotify")
};

// --- Storage Helpers ---
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem("clothstore_cart_items");
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        const colorName = item.color ? (typeof item.color === "object" ? (item.color.name || "") : String(item.color)) : "";
        const sizeVal = item.size ? String(item.size).trim() : "";
        return {
          ...item,
          cartKey: item.cartKey || `${item.id}__${sizeVal}__${colorName}`
        };
      });
    }
    return [];
  } catch (_) {
    return [];
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem("clothstore_cart_items", JSON.stringify(state.cart));
  } catch (_) {}
}

function loadFavoritesFromStorage() {
  try {
    const raw = localStorage.getItem("clothstore_favorites");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (_) {
    return new Set();
  }
}

function saveFavoritesToStorage() {
  try {
    localStorage.setItem("clothstore_favorites", JSON.stringify([...state.favorites]));
  } catch (_) {}
}

// --- Formatting Helpers ---
function formatPrice(num) {
  const n = typeof num === "number" ? num : (parseInt(num, 10) || 0);
  return `${n.toLocaleString("ar-DZ")} د.ج`;
}

function getCategoryLabel(key) {
  if (!key || key === "all") return "الكل";
  const found = state.categories.find(c => c.id === key || c.name === key || c.slug === key);
  return found ? found.name : key;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Toast System ---
let toastTimer = null;
function showToast(message) {
  if (!DOM.toast) return;
  DOM.toast.textContent = message;
  DOM.toast.classList.add("active");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    DOM.toast.classList.remove("active");
  }, 3200);
}

// --- Image Optimization Helper (Cloudinary & Unsplash) ---
function optimizeImageUrl(url, width = 600) {
  if (!url || typeof url !== "string") return "";

  // Cloudinary Transformation: auto format, auto quality, max width, limit crop
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    if (!url.includes("f_auto") && !url.includes("q_auto")) {
      const transform = `c_limit,w_${width},f_auto,q_auto`;
      return url.replace("/upload/", `/upload/${transform}/`);
    }
  }

  // Unsplash Transformation: auto format, max width, 80 quality
  if (url.includes("images.unsplash.com")) {
    try {
      const u = new URL(url);
      u.searchParams.set("auto", "format");
      u.searchParams.set("w", String(width));
      u.searchParams.set("q", "80");
      return u.toString();
    } catch (_) {
      return url;
    }
  }

  return url;
}

// --- Snapshot Parsers ---
function parseCategoriesSnapshot(snapshot) {
  if (!snapshot || snapshot.empty) return;
  const list = [];
  snapshot.forEach((docSnap) => {
    const d = docSnap.data();
    if (d && d.name && d.name.trim()) {
      list.push({
        id: docSnap.id,
        name: d.name.trim(),
        slug: d.slug || d.name.trim(),
        image: d.image || ""
      });
    }
  });
  if (list.length > 0) {
    state.categories = list;
  }
}

function parseProductsSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.empty) {
    state.products = [];
    return;
  }

  const liveList = [];
  snapshot.forEach((docSnap) => {
    const p = docSnap.data();
    const rawImages = Array.isArray(p.images) ? p.images : [];
    const imageUrls = rawImages.map(i => typeof i === "string" ? i : (i && i.url)).filter(Boolean);
    if (imageUrls.length === 0 && p.mainImage) {
      imageUrls.push(p.mainImage);
    }

    const priceNum = typeof p.price === "number" ? p.price : (parseInt(p.price, 10) || 0);

    let catName = (p.category || "").trim();
    const catId = (p.categoryId || "").trim();
    if (!catName && catId) {
      const matchCat = state.categories.find(c => c.id === catId);
      if (matchCat) catName = matchCat.name;
    }
    if (!catName) catName = "عام";

    // Parse optional product sizes (empty array if none)
    const parsedSizes = Array.isArray(p.sizes)
      ? p.sizes.map(s => String(s).trim()).filter(Boolean)
      : [];

    // Parse optional product colors (empty array if none)
    const parsedColors = Array.isArray(p.colors)
      ? p.colors.map(col => {
          if (typeof col === "string") {
            const trimmed = col.trim();
            return { name: trimmed, value: trimmed.startsWith("#") ? trimmed : "#111111" };
          }
          if (col && typeof col === "object") {
            return {
              name: String(col.name || "لون").trim(),
              value: String(col.value || "#111111").trim()
            };
          }
          return null;
        }).filter(Boolean)
      : [];

    liveList.push({
      id: docSnap.id,
      name: p.name || "منتج",
      categoryId: catId,
      category: catName,
      price: priceNum,
      priceDisplay: formatPrice(priceNum),
      description: p.description || p.title || "منتج عالي الجودة متوفر للطلب مع خدمة التوصيل والدفع عند الاستلام.",
      images: imageUrls.length > 0 ? imageUrls : ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80"],
      colors: parsedColors,
      sizes: parsedSizes,
      specs: Array.isArray(p.specs) && p.specs.length > 0 ? p.specs : [
        "الخامة: جودة ممتازة مضمونة",
        "الدفع عند الاستلام بعد المعاينة"
      ]
    });
  });

  state.products = liveList;
}

// --- UI State Renderers ---
function renderProductsSkeleton(count = 8) {
  if (!DOM.productsGrid) return;
  DOM.productsGrid.innerHTML = Array.from({ length: count }, () => `
    <article class="product-card product-card-skeleton" aria-hidden="true">
      <div class="product-thumb-wrap skeleton-thumb">
        <div class="skeleton-shimmer"></div>
      </div>
      <div class="product-info-body">
        <div class="skeleton-line skeleton-cat-line"></div>
        <div class="skeleton-line skeleton-title-line-1"></div>
        <div class="skeleton-line skeleton-title-line-2"></div>
        <div class="product-price-row">
          <div class="skeleton-line skeleton-price-line"></div>
        </div>
        <div class="skeleton-btn"></div>
      </div>
    </article>
  `).join("");
}

function renderEmptyState(message = "لا توجد منتجات حاليًا") {
  if (!DOM.productsGrid) return;
  DOM.productsGrid.innerHTML = `
    <div class="store-state-box">
      <div class="store-state-icon store-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="32" height="32">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
      </div>
      <h3 class="store-state-title">${escapeHtml(message)}</h3>
      <p class="store-state-desc">سيتم إضافة تشكيلات جديدة قريباً، تفضل بزيارتنا لاحقاً.</p>
    </div>
  `;
}

function renderErrorState() {
  if (!DOM.productsGrid) return;
  DOM.productsGrid.innerHTML = `
    <div class="store-state-box">
      <div class="store-state-icon store-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="store-state-title">تعذر تحميل المنتجات</h3>
      <p class="store-state-desc">حدث خطأ أثناء الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.</p>
      <button class="btn-state-action" type="button" id="retryProductsBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        <span>إعادة المحاولة</span>
      </button>
    </div>
  `;
  const retryBtn = document.getElementById("retryProductsBtn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      loadStoreData();
    });
  }
}

// --- Live Firestore Sync (Parallel + Browser Persistent Cache) ---
async function loadStoreData() {
  // If grid is currently empty or has no children, render skeleton placeholders immediately
  if (DOM.productsGrid && DOM.productsGrid.children.length === 0) {
    renderProductsSkeleton();
  }

  const catCol = collection(db, "categories");
  const prodCol = collection(db, "products");
  const catQuery = query(catCol, orderBy("createdAt", "desc"));
  const prodQuery = query(prodCol, orderBy("createdAt", "desc"));

  // 1. Fast Cache Read: Return immediately to user if previously cached in IndexedDB
  try {
    const [cachedCatSnap, cachedProdSnap] = await Promise.all([
      getDocsFromCache(catQuery).catch(() => getDocsFromCache(catCol)).catch(() => null),
      getDocsFromCache(prodQuery).catch(() => getDocsFromCache(prodCol)).catch(() => null)
    ]);

    let hadCachedData = false;
    if (cachedCatSnap && !cachedCatSnap.empty) {
      parseCategoriesSnapshot(cachedCatSnap);
      hadCachedData = true;
    }
    if (cachedProdSnap && !cachedProdSnap.empty) {
      parseProductsSnapshot(cachedProdSnap);
      syncCategoriesFromProducts();
      hadCachedData = true;
    }

    if (hadCachedData && state.products.length > 0) {
      renderCategoriesUI();
      renderProducts();
    }
  } catch (_) {
    // Cache miss on fresh visit — continue directly to server query
  }

  // 2. Authoritative Server Query (Executed in parallel for minimum roundtrip latency)
  try {
    const [catSnap, prodSnap] = await Promise.all([
      getDocsFromServer(catQuery).catch(() => getDocs(catQuery)).catch(() => getDocs(catCol)),
      getDocsFromServer(prodQuery).catch(() => getDocs(prodQuery)).catch(() => getDocs(prodCol))
    ]);

    if (catSnap) {
      parseCategoriesSnapshot(catSnap);
    }
    if (prodSnap && !prodSnap.empty) {
      parseProductsSnapshot(prodSnap);
    }
    syncCategoriesFromProducts();

    renderCategoriesUI();

    if (state.products.length === 0) {
      state.products = [...REFERENCE_PRODUCTS];
    }
    renderProducts();
  } catch (serverErr) {
    console.warn("Firestore server fetch failed:", serverErr?.message || serverErr);
    if (state.products.length === 0) {
      state.products = [...REFERENCE_PRODUCTS];
      renderCategoriesUI();
      renderProducts();
    }
  }
}

function syncCategoriesFromProducts() {
  const existingNames = new Set(state.categories.map(c => c.name.trim().toLowerCase()));
  const existingIds = new Set(state.categories.map(c => c.id));

  state.products.forEach(p => {
    const catName = (p.category || "").trim();
    const catId = (p.categoryId || "").trim();

    if (catId && !existingIds.has(catId) && catName && !existingNames.has(catName.toLowerCase())) {
      state.categories.push({
        id: catId,
        name: catName,
        slug: catName,
        image: (p.images && p.images[0]) || ""
      });
      existingNames.add(catName.toLowerCase());
      existingIds.add(catId);
    } else if (catName && catName !== "عام" && !existingNames.has(catName.toLowerCase())) {
      state.categories.push({
        id: catId || catName,
        name: catName,
        slug: catName,
        image: (p.images && p.images[0]) || ""
      });
      existingNames.add(catName.toLowerCase());
    }
  });
}

function renderCategoriesUI() {
  if (DOM.categoriesSection) {
    DOM.categoriesSection.style.display = state.categories.length > 0 ? "" : "none";
  }

  // 1. Categories Grid Cards ("تسوق حسب الفئة")
  if (DOM.categoriesGrid) {
    if (state.categories.length === 0) {
      DOM.categoriesGrid.innerHTML = `<div class="categories-empty-state"><p class="store-state-desc">لا توجد أقسام متوفرة حالياً</p></div>`;
    } else {
      DOM.categoriesGrid.innerHTML = state.categories.map(cat => {
        const matchingProduct = state.products.find(p => 
          (p.categoryId && p.categoryId === cat.id) || 
          (p.category && (p.category.trim().toLowerCase() === cat.name.trim().toLowerCase() || p.category === cat.slug))
        );
        const imgUrl = cat.image || (matchingProduct && matchingProduct.images && matchingProduct.images[0]) || "images/cat_women.jpg";
        const isActive = state.activeFilter === cat.id || state.activeFilter === cat.name;

        return `
          <div class="category-card ${isActive ? "active" : ""}" data-category-id="${escapeHtml(cat.id)}" data-category-name="${escapeHtml(cat.name)}" role="button" tabindex="0">
            <div class="category-img-box">
              <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(cat.name)}" loading="lazy">
              <div class="category-gradient"></div>
            </div>
            <div class="category-bottom-bar">
              <svg class="cat-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span class="category-name">${escapeHtml(cat.name)}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 2. Category Filter Tabs ("أحدث المنتجات")
  const catTabsContainer = DOM.categoryTabs || $("categoryTabs");
  if (catTabsContainer) {
    const allIsActive = state.activeFilter === "all";
    const tabsHtml = [
      `<button class="cat-tab ${allIsActive ? "active" : ""}" type="button" data-filter="all">الكل</button>`
    ];

    state.categories.forEach(cat => {
      const isActive = state.activeFilter === cat.id || state.activeFilter === cat.name;
      tabsHtml.push(
        `<button class="cat-tab ${isActive ? "active" : ""}" type="button" data-filter="${escapeHtml(cat.id)}" data-filter-name="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</button>`
      );
    });

    catTabsContainer.innerHTML = tabsHtml.join("");
  }

  // 3. Mobile Drawer Quick Category Filters
  const drawerCatContainer = DOM.drawerCatTags || $("drawerCatTags");
  if (drawerCatContainer) {
    const allIsActive = state.activeFilter === "all";
    const pillsHtml = [
      `<button class="drawer-cat-pill ${allIsActive ? "active" : ""}" type="button" data-cat="all">الكل</button>`
    ];

    state.categories.forEach(cat => {
      const isActive = state.activeFilter === cat.id || state.activeFilter === cat.name;
      pillsHtml.push(
        `<button class="drawer-cat-pill ${isActive ? "active" : ""}" type="button" data-cat="${escapeHtml(cat.id)}" data-cat-name="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</button>`
      );
    });

    drawerCatContainer.innerHTML = pillsHtml.join("");
  }
}

function setActiveCategory(filter) {
  state.activeFilter = filter || "all";

  // Synchronize Tab Buttons
  document.querySelectorAll(".cat-tab").forEach(tab => {
    const isMatch = tab.dataset.filter === state.activeFilter || tab.dataset.filterName === state.activeFilter;
    tab.classList.toggle("active", isMatch);
  });

  // Synchronize Drawer Pills
  document.querySelectorAll(".drawer-cat-pill").forEach(pill => {
    const isMatch = pill.dataset.cat === state.activeFilter || pill.dataset.catName === state.activeFilter;
    pill.classList.toggle("active", isMatch);
  });

  // Synchronize Category Cards
  document.querySelectorAll(".category-card").forEach(card => {
    const isMatch = card.dataset.categoryId === state.activeFilter || card.dataset.categoryName === state.activeFilter;
    card.classList.toggle("active", isMatch);
  });

  renderProducts();
}

// --- Render Products Grid ---
function renderProducts() {
  const filtered = state.products.filter(p => {
    if (!state.activeFilter || state.activeFilter === "all") return true;

    // Check by categoryId
    if (p.categoryId && p.categoryId === state.activeFilter) return true;

    // Check by category name
    if (p.category && p.category.trim().toLowerCase() === state.activeFilter.trim().toLowerCase()) return true;

    // Check matching category object from state.categories
    const targetCat = state.categories.find(c => 
      c.id === state.activeFilter || 
      c.name.trim().toLowerCase() === state.activeFilter.trim().toLowerCase() ||
      c.slug === state.activeFilter
    );

    if (targetCat) {
      if (p.categoryId && p.categoryId === targetCat.id) return true;
      if (p.category && (
        p.category.trim().toLowerCase() === targetCat.name.trim().toLowerCase() ||
        p.category === targetCat.slug
      )) return true;
    }

    return false;
  });

  if (state.products.length === 0) {
    state.products = [...REFERENCE_PRODUCTS];
  }

  if (filtered.length === 0) {
    DOM.productsGrid.innerHTML = `
      <div class="store-state-box">
        <h3 class="store-state-title">لا توجد منتجات في هذا القسم حالياً</h3>
        <button class="btn-state-action" type="button" id="resetCatFilterBtn">
          <span>عرض جميع المنتجات</span>
        </button>
      </div>
    `;
    const resetBtn = document.getElementById("resetCatFilterBtn");
    if (resetBtn) resetBtn.addEventListener("click", () => setActiveCategory("all"));
    return;
  }

  DOM.productsGrid.innerHTML = filtered.map((p, index) => {
    const isFav = state.favorites.has(p.id);
    const rawImg = p.images && p.images.length > 0 ? p.images[0] : "";
    const optimizedThumb = optimizeImageUrl(rawImg, 600);
    const isAboveFold = index < 4;
    const loadingAttr = isAboveFold ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';

    const swatchesHtml = Array.isArray(p.colors) && p.colors.length > 0
      ? `<div class="product-swatches-row">
          ${p.colors.map(col => {
            const val = typeof col === 'object' ? (col.value || '#111') : (col.startsWith('#') ? col : '#111');
            const name = typeof col === 'object' ? (col.name || '') : col;
            return `<span class="swatch-dot" style="background-color: ${escapeHtml(val)};" title="${escapeHtml(name)}"></span>`;
          }).join("")}
        </div>`
      : "";

    const badgeHtml = p.isNew
      ? `<span class="product-badge-new">جديد</span>`
      : "";

    return `
      <article class="product-card" data-product-id="${escapeHtml(p.id)}" data-action="view-details" data-id="${escapeHtml(p.id)}">
        <!-- Thumbnail Wrap -->
        <div class="product-thumb-wrap">
          <img 
            class="product-thumb-img" 
            src="${escapeHtml(optimizedThumb)}" 
            alt="${escapeHtml(p.name)}" 
            width="400" 
            height="500" 
            ${loadingAttr}
            onerror="this.onerror=null;this.src='images/prod_jacket.jpg';"
          >
          
          ${badgeHtml}

          <!-- Favorite Heart Button -->
          <button class="btn-favorite ${isFav ? "active" : ""}" type="button" data-action="toggle-fav" data-id="${escapeHtml(p.id)}" title="${isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="product-info-body">
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          
          <div class="product-price-row">
            <span class="product-price">${escapeHtml(p.priceDisplay || formatPrice(p.price))}</span>
          </div>

          ${swatchesHtml}
        </div>
      </article>
    `;
  }).join("");
}

// --- Product Details Modal ---
function openProductDetails(product) {
  state.currentDetailProduct = product;
  state.selectedColor = null;
  state.selectedSize = null;

  const images = (product.images && product.images.length > 0) ? product.images : [];
  const mainImage = images[0] || "";

  const thumbsHtml = images.map((img, i) => `
    <button class="thumb-btn ${i === 0 ? "active" : ""}" type="button" data-image="${escapeHtml(optimizeImageUrl(img, 900))}">
      <img src="${escapeHtml(optimizeImageUrl(img, 180))}" alt="${escapeHtml(product.name)} ${i + 1}" width="70" height="70" loading="lazy">
    </button>
  `).join("");

  // Optional Colors Section
  const hasColors = Array.isArray(product.colors) && product.colors.length > 0;
  const colorsHtml = hasColors ? `
    <div class="picker-group">
      <div class="picker-label-row">
        <label class="picker-label">اختر اللون</label>
        <span class="selected-opt-badge" id="selectedColorBadge">لم يتم الاختيار</span>
      </div>
      <div class="color-swatches" id="colorSwatchesWrap">
        ${product.colors.map(col => {
          const name = typeof col === 'object' ? (col.name || 'لون') : col;
          const val = typeof col === 'object' ? (col.value || '#111111') : (col.startsWith('#') ? col : '#111111');
          return `
            <button class="color-swatch-chip" type="button" data-color-name="${escapeHtml(name)}" data-color-val="${escapeHtml(val)}" title="${escapeHtml(name)}">
              <span class="color-swatch-dot" style="background-color: ${escapeHtml(val)};"></span>
              <span class="color-name-text">${escapeHtml(name)}</span>
            </button>
          `;
        }).join("")}
      </div>
      <span class="option-validation-msg" id="colorValidationMsg" style="display: none;">يرجى اختيار اللون</span>
    </div>
  ` : "";

  // Optional Sizes Section
  const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
  const sizesHtml = hasSizes ? `
    <div class="picker-group">
      <div class="picker-label-row">
        <label class="picker-label">اختر المقاس</label>
        <span class="selected-opt-badge" id="selectedSizeBadge">لم يتم الاختيار</span>
      </div>
      <div class="size-chips" id="sizeChipsWrap">
        ${product.sizes.map(sz => `
          <button class="size-chip" type="button" data-size="${escapeHtml(sz)}">${escapeHtml(sz)}</button>
        `).join("")}
      </div>
      <span class="option-validation-msg" id="sizeValidationMsg" style="display: none;">يرجى اختيار المقاس</span>
    </div>
  ` : "";

  const specsHtml = (product.specs || []).map(s => `<li>${escapeHtml(s)}</li>`).join("");

  DOM.modalProductContent.innerHTML = `
    <!-- Gallery -->
    <div class="detail-gallery-wrap">
      <div class="detail-main-img-box">
        <img id="detailMainImage" src="${escapeHtml(optimizeImageUrl(mainImage, 900))}" alt="${escapeHtml(product.name)}" width="500" height="600">
      </div>
      <div class="detail-thumbs-strip" id="detailThumbsStrip">
        ${thumbsHtml}
      </div>
    </div>

    <!-- Info -->
    <div class="detail-info-col">
      <div class="detail-breadcrumbs">الرئيسية > المنتجات > ${escapeHtml(product.name)}</div>
      <h2 class="detail-title">${escapeHtml(product.name)}</h2>
      
      <div class="detail-price-row">
        <span class="detail-price">${product.priceDisplay || formatPrice(product.price)}</span>
      </div>

      <p class="detail-desc">${escapeHtml(product.description)}</p>

      ${colorsHtml}

      ${sizesHtml}

      <!-- Actions -->
      <div class="detail-cta-row">
        <button class="btn-detail-add-cart" type="button" id="modalAddToCartBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <span>أضف إلى السلة</span>
        </button>

        <button class="btn-detail-quick-cod" type="button" id="modalQuickCodBtn">
          طلب فوري
        </button>
      </div>

      <!-- Product Specs -->
      ${specsHtml ? `
      <div class="detail-specs-box">
        <h4 class="specs-title">تفاصيل المنتج</h4>
        <ul class="specs-list">
          ${specsHtml}
        </ul>
      </div>
      ` : ""}
    </div>
  `;

  DOM.productModal.classList.add("active");
  DOM.productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeProductDetails() {
  DOM.productModal.classList.remove("active");
  DOM.productModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  state.currentDetailProduct = null;
  state.selectedColor = null;
  state.selectedSize = null;
}

// Validation for Required Product Options
function validateProductOptions(product) {
  let isValid = true;
  const sizeMsg = $("sizeValidationMsg");
  const colorMsg = $("colorValidationMsg");

  if (sizeMsg) sizeMsg.style.display = "none";
  if (colorMsg) colorMsg.style.display = "none";

  const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
  const hasColors = Array.isArray(product.colors) && product.colors.length > 0;

  if (hasSizes && !state.selectedSize) {
    if (sizeMsg) sizeMsg.style.display = "block";
    showToast("يرجى اختيار المقاس");
    isValid = false;
  }

  if (hasColors && !state.selectedColor) {
    if (colorMsg) colorMsg.style.display = "block";
    showToast("يرجى اختيار اللون");
    isValid = false;
  }

  return isValid;
}

// --- Cart Drawer Flow ---
function updateCartUI() {
  saveCartToStorage();

  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  DOM.cartBadge.textContent = totalItems;
  DOM.cartDrawerItemsBadge.textContent = `(${totalItems})`;

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  DOM.cartSubtotalVal.textContent = formatPrice(subtotal);

  if (state.cart.length === 0) {
    DOM.cartItemsList.innerHTML = `
      <div class="cart-empty-view">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        <h4>سلة المشتريات فارغة</h4>
        <p>ابدأ بالتسوق لإضافة منتجاتك المفضلة إلى السلة.</p>
      </div>
    `;
    DOM.proceedCheckoutBtn.disabled = true;
    DOM.proceedCheckoutBtn.style.opacity = "0.5";
    return;
  }

  DOM.proceedCheckoutBtn.disabled = false;
  DOM.proceedCheckoutBtn.style.opacity = "1";

  DOM.cartItemsList.innerHTML = state.cart.map((item, index) => {
    const sizeBadge = item.size ? `<span class="cart-opt-tag">المقاس: <strong>${escapeHtml(item.size)}</strong></span>` : '';
    const colorBadge = item.color ? `
      <span class="cart-opt-tag">
        ${item.color.value ? `<span class="cart-color-dot" style="background-color: ${escapeHtml(item.color.value)}"></span>` : ''}
        اللون: <strong>${escapeHtml(item.color.name || item.color)}</strong>
      </span>` : '';
    const optionsHtml = (sizeBadge || colorBadge) ? `<div class="cart-item-options">${sizeBadge}${colorBadge}</div>` : '';

    return `
      <div class="cart-item-row" data-cart-index="${index}">
        <img class="cart-item-img" src="${escapeHtml(optimizeImageUrl(item.image, 160))}" alt="${escapeHtml(item.name)}" width="70" height="70" loading="lazy">
        
        <div class="cart-item-details">
          <h4 class="cart-item-name">${escapeHtml(item.name)}</h4>
          ${optionsHtml}
          <div class="cart-item-price">${formatPrice(item.price)}</div>
          
          <div class="cart-qty-ctrl">
            <button class="btn-qty" type="button" data-action="qty-minus" data-index="${index}">-</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="btn-qty" type="button" data-action="qty-plus" data-index="${index}">+</button>
          </div>
        </div>

        <button class="btn-del-item" type="button" data-action="remove-item" data-index="${index}" title="حذف من السلة">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");
}

function addToCart(product, quantity = 1, color = null, size = null) {
  const colorObj = color ? (typeof color === 'object' ? { name: color.name, value: color.value } : { name: String(color), value: '#111111' }) : null;
  const colorKeyPart = colorObj ? colorObj.name : '';
  const sizeVal = size ? String(size).trim() : '';
  const cartKey = `${product.id}__${sizeVal}__${colorKeyPart}`;

  const existing = state.cart.find(item => (item.cartKey || `${item.id}__${item.size || ''}__${item.color ? (item.color.name || item.color) : ''}`) === cartKey);
  const mainImg = product.images && product.images.length > 0 ? product.images[0] : "";

  if (existing) {
    existing.quantity += quantity;
  } else {
    state.cart.push({
      cartKey,
      id: product.id,
      name: product.name,
      price: product.price,
      image: mainImg,
      quantity,
      color: colorObj,
      size: sizeVal || null
    });
  }

  updateCartUI();
  openCartDrawer();
  showToast(`تمت إضافة "${product.name}" إلى السلة`);
}

function openCartDrawer() {
  DOM.cartDrawer.classList.add("active");
  DOM.cartDrawerOverlay.classList.add("active");
  document.body.classList.add("modal-open");
}

function closeCartDrawer() {
  DOM.cartDrawer.classList.remove("active");
  DOM.cartDrawerOverlay.classList.remove("active");
  document.body.classList.remove("modal-open");
}

// --- Checkout Modal & Flow ---
function openCheckoutModal(singleProduct = null) {
  let checkoutItems = [];

  if (singleProduct) {
    checkoutItems = [{
      id: singleProduct.id,
      name: singleProduct.name,
      price: singleProduct.price,
      quantity: 1,
      image: singleProduct.images ? singleProduct.images[0] : "",
      color: singleProduct.selectedColor || null,
      size: singleProduct.selectedSize || null
    }];
    state.currentCheckoutItems = checkoutItems;
  } else {
    if (state.cart.length === 0) {
      showToast("السلة فارغة، اختر منتجاً أولاً.");
      return;
    }
    checkoutItems = [...state.cart];
    state.currentCheckoutItems = checkoutItems;
  }

  const subtotal = checkoutItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  DOM.checkoutSummaryStrip.innerHTML = `
    <div>
      <strong>عدد المنتجات:</strong> ${checkoutItems.reduce((s, i) => s + i.quantity, 0)} قطع
      <div style="font-size: 0.8rem; color: var(--color-text-sub); margin-top: 4px; display: flex; flex-direction: column; gap: 3px;">
        ${checkoutItems.map(i => {
          const opts = [];
          if (i.size) opts.push(`المقاس: ${escapeHtml(i.size)}`);
          if (i.color) opts.push(`اللون: ${escapeHtml(i.color.name || i.color)}`);
          const optStr = opts.length > 0 ? ` (${opts.join(' | ')})` : '';
          return `<span>• ${escapeHtml(i.name)}${optStr} × ${i.quantity}</span>`;
        }).join("")}
      </div>
    </div>
    <div>
      <strong>الإجمالي:</strong> <span style="color: var(--color-secondary); font-size: 1.15rem; font-weight: 800;">${formatPrice(subtotal)}</span>
    </div>
  `;

  DOM.checkoutModal.classList.add("active");
  DOM.checkoutModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeCheckoutModal() {
  DOM.checkoutModal.classList.remove("active");
  DOM.checkoutModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  state.currentCheckoutItems = [];
}

// --- Telegram Order Notification ---
function formatTelegramOrderMessage(formValues, items, total) {
  const itemsText = items.map(item => {
    const opts = [];
    if (item.size) opts.push(`المقاس: ${item.size}`);
    if (item.color) opts.push(`اللون: ${item.color.name || item.color}`);
    const optStr = opts.length > 0 ? ` [${opts.join(' | ')}]` : '';
    return `• ${item.name}${optStr} | العدد: ${item.quantity} | السعر: ${formatPrice(item.price * item.quantity)}`;
  }).join("\n");

  return [
    "🛍️ طلب جديد من متجر ClothStore!",
    "==========================",
    "",
    "📦 تفاصيل الطلب:",
    itemsText,
    "",
    `💰 الإجمالي الكلي: ${formatPrice(total)} (الدفع عند الاستلام)`,
    "",
    "👤 بيانات الزبون:",
    `الاسم: ${formValues.customerName}`,
    `الهاتف: ${formValues.phone}`,
    `الولاية: ${formValues.state}`,
    `البلدية: ${formValues.city}`,
    `العنوان: ${formValues.address}`,
    `الملاحظات: ${formValues.notes || "لا توجد"}`,
    "",
    `📅 التاريخ: ${new Date().toLocaleString("ar-DZ")}`
  ].join("\n");
}

async function sendOrderToTelegram(formData) {
  const formValues = Object.fromEntries(formData.entries());
  const items = (state.currentCheckoutItems && state.currentCheckoutItems.length > 0)
    ? state.currentCheckoutItems
    : (state.cart.length > 0 ? state.cart : (state.currentDetailProduct ? [state.currentDetailProduct] : []));
  const total = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

  const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const text = formatTelegramOrderMessage(formValues, items, total);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text
    })
  });

  if (!response.ok) {
    let errorMsg = "";
    try {
      const errJson = await response.json();
      errorMsg = errJson.description;
    } catch (_) {}
    throw new Error(errorMsg || "تعذر إرسال الطلب حالياً.");
  }
}

// --- Search Flow ---
function openSearchOverlay() {
  DOM.searchOverlay.classList.add("active");
  DOM.searchOverlay.setAttribute("aria-hidden", "false");
  DOM.liveSearchInput.value = "";
  renderSearchResults("");
  setTimeout(() => DOM.liveSearchInput.focus(), 150);
}

function closeSearchOverlay() {
  DOM.searchOverlay.classList.remove("active");
  DOM.searchOverlay.setAttribute("aria-hidden", "true");
}

function renderSearchResults(queryText) {
  const q = queryText.trim().toLowerCase();
  if (!q) {
    DOM.searchResultsList.innerHTML = `<p style="text-align: center; color: var(--color-text-sub); padding: 20px;">اكتب اسم المنتج أو التصنيف للبحث السريع...</p>`;
    return;
  }

  const results = state.products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    getCategoryLabel(p.category).toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q)
  );

  if (results.length === 0) {
    DOM.searchResultsList.innerHTML = `<p style="text-align: center; color: var(--color-text-sub); padding: 20px;">لم يتم العثور على أي نتائج مطابقة لـ "${q}".</p>`;
    return;
  }

  DOM.searchResultsList.innerHTML = results.map(p => `
    <div class="search-result-item" data-product-id="${p.id}">
      <img src="${optimizeImageUrl(p.images[0], 120)}" alt="${p.name}" width="54" height="54" loading="lazy">
      <div>
        <div style="font-weight: 700; color: var(--color-text-main);">${p.name}</div>
        <div style="font-size: 0.85rem; color: var(--color-secondary); font-weight: 800;">${p.priceDisplay || formatPrice(p.price)}</div>
      </div>
    </div>
  `).join("");
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Hero Carousel Navigation
  function setHeroSlide(idx) {
    state.heroSlideIndex = (idx + HERO_SLIDES.length) % HERO_SLIDES.length;
    DOM.heroImg.src = HERO_SLIDES[state.heroSlideIndex];
    document.querySelectorAll(".hero-bar-item, .hero-dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === state.heroSlideIndex);
    });
  }

  DOM.heroPrevBtn?.addEventListener("click", () => setHeroSlide(state.heroSlideIndex - 1));
  DOM.heroNextBtn?.addEventListener("click", () => setHeroSlide(state.heroSlideIndex + 1));
  DOM.heroDots?.addEventListener("click", (e) => {
    const dot = e.target.closest(".hero-bar-item, .hero-dot");
    if (dot) setHeroSlide(parseInt(dot.dataset.slide, 10));
  });

  // Category Filter Tabs Delegation
  $("categoryTabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".cat-tab");
    if (!tab) return;
    setActiveCategory(tab.dataset.filter);
  });

  // Category Cards in Category Section
  DOM.categoriesGrid?.addEventListener("click", (e) => {
    const card = e.target.closest(".category-card");
    if (!card) return;
    const cat = card.dataset.categoryId || card.dataset.categoryName;
    setActiveCategory(cat);
    $("productsSection")?.scrollIntoView({ behavior: "smooth" });
  });

  DOM.viewAllCategoriesBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    setActiveCategory("all");
    $("productsSection")?.scrollIntoView({ behavior: "smooth" });
  });

  // Products Grid Action Delegation
  DOM.productsGrid.addEventListener("click", (e) => {
    // 1. Toggle Favorite
    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.id;
      if (state.favorites.has(id)) {
        state.favorites.delete(id);
        favBtn.classList.remove("active");
        showToast("تمت الإزالة من المفضلة");
      } else {
        state.favorites.add(id);
        favBtn.classList.add("active");
        showToast("تمت الإضافة إلى المفضلة");
      }
      saveFavoritesToStorage();
      return;
    }

    // 2. Quick Add To Cart
    const addBtn = e.target.closest('[data-action="quick-add-cart"]');
    if (addBtn) {
      e.stopPropagation();
      const id = addBtn.dataset.id;
      const product = state.products.find(p => p.id === id);
      if (product) {
        const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
        const hasColors = Array.isArray(product.colors) && product.colors.length > 0;
        if (hasSizes || hasColors) {
          openProductDetails(product);
          showToast("يرجى تحديد الخيارات المطلوبة أولاً");
        } else {
          addToCart(product, 1);
        }
      }
      return;
    }

    // 3. View Details Modal
    const viewItem = e.target.closest('[data-action="view-details"]') || e.target.closest('.product-card');
    if (viewItem) {
      const id = viewItem.dataset.id || viewItem.dataset.productId;
      const product = state.products.find(p => p.id === id);
      if (product) openProductDetails(product);
    }
  });

  // Product Details Modal Gallery Thumbnails & Swatches
  DOM.modalProductContent?.addEventListener("click", (e) => {
    // Thumbnail click
    const thumb = e.target.closest(".thumb-btn");
    if (thumb) {
      document.querySelectorAll(".thumb-btn").forEach(t => t.classList.remove("active"));
      thumb.classList.add("active");
      const mainImg = $("detailMainImage");
      if (mainImg) mainImg.src = thumb.dataset.image;
      return;
    }

    // Color Swatch Chip Click
    const swatch = e.target.closest(".color-swatch-chip");
    if (swatch) {
      document.querySelectorAll(".color-swatch-chip").forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");
      state.selectedColor = {
        name: swatch.dataset.colorName,
        value: swatch.dataset.colorVal
      };
      const badge = $("selectedColorBadge");
      if (badge) badge.textContent = swatch.dataset.colorName;
      const msg = $("colorValidationMsg");
      if (msg) msg.style.display = "none";
      return;
    }

    // Size Chip Click
    const chip = e.target.closest(".size-chip");
    if (chip) {
      document.querySelectorAll(".size-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.selectedSize = chip.dataset.size;
      const badge = $("selectedSizeBadge");
      if (badge) badge.textContent = chip.dataset.size;
      const msg = $("sizeValidationMsg");
      if (msg) msg.style.display = "none";
      return;
    }

    // Modal Add To Cart
    if (e.target.closest("#modalAddToCartBtn")) {
      if (state.currentDetailProduct) {
        if (!validateProductOptions(state.currentDetailProduct)) return;
        addToCart(state.currentDetailProduct, 1, state.selectedColor, state.selectedSize);
        closeProductDetails();
      }
      return;
    }

    // Modal Quick COD
    if (e.target.closest("#modalQuickCodBtn")) {
      if (state.currentDetailProduct) {
        if (!validateProductOptions(state.currentDetailProduct)) return;
        const prod = state.currentDetailProduct;
        closeProductDetails();
        openCheckoutModal({
          ...prod,
          selectedColor: state.selectedColor,
          selectedSize: state.selectedSize
        });
      }
    }
  });

  DOM.closeProductModalBtn.addEventListener("click", closeProductDetails);
  DOM.productModal.addEventListener("click", (e) => {
    if (e.target === DOM.productModal) closeProductDetails();
  });

  // Cart Drawer Triggers
  DOM.cartBtn.addEventListener("click", openCartDrawer);
  DOM.closeCartDrawerBtn.addEventListener("click", closeCartDrawer);
  DOM.cartDrawerOverlay.addEventListener("click", closeCartDrawer);

  // Cart Items Delegation (Qty +/- and Remove)
  DOM.cartItemsList.addEventListener("click", (e) => {
    const plusBtn = e.target.closest('[data-action="qty-plus"]');
    if (plusBtn) {
      const idx = parseInt(plusBtn.dataset.index, 10);
      if (state.cart[idx]) {
        state.cart[idx].quantity += 1;
        updateCartUI();
      }
      return;
    }

    const minusBtn = e.target.closest('[data-action="qty-minus"]');
    if (minusBtn) {
      const idx = parseInt(minusBtn.dataset.index, 10);
      if (state.cart[idx]) {
        if (state.cart[idx].quantity > 1) {
          state.cart[idx].quantity -= 1;
        } else {
          state.cart.splice(idx, 1);
        }
        updateCartUI();
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="remove-item"]');
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.index, 10);
      if (state.cart[idx]) {
        const removedName = state.cart[idx].name;
        state.cart.splice(idx, 1);
        updateCartUI();
        showToast(`تم حذف "${removedName}" من السلة`);
      }
    }
  });

  // Proceed Checkout from Cart Drawer
  DOM.proceedCheckoutBtn.addEventListener("click", () => {
    closeCartDrawer();
    openCheckoutModal();
  });

  // Checkout Modal Events
  DOM.closeCheckoutModalBtn.addEventListener("click", closeCheckoutModal);
  DOM.checkoutModal.addEventListener("click", (e) => {
    if (e.target === DOM.checkoutModal) closeCheckoutModal();
  });

  // Checkout Form Submission (Telegram Order)
  DOM.checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Clear errors
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");

    const form = e.target;
    let isValid = true;

    if (!form.customerName.value.trim()) {
      $("custNameError").textContent = "يرجى كتابة الاسم الكامل";
      isValid = false;
    }

    if (!form.phone.value.trim() || form.phone.value.trim().length < 9) {
      $("custPhoneError").textContent = "يرجى إدخال رقم هاتف صحيح";
      isValid = false;
    }

    if (!form.state.value.trim()) {
      $("custStateError").textContent = "يرجى تحديد الولاية";
      isValid = false;
    }

    if (!form.city.value.trim()) {
      $("custCityError").textContent = "يرجى إدخال البلدية";
      isValid = false;
    }

    if (!form.address.value.trim()) {
      $("custAddressError").textContent = "يرجى إدخال العنوان بالتفصيل";
      isValid = false;
    }

    if (!isValid) return;

    DOM.submitOrderBtn.disabled = true;
    DOM.submitOrderText.hidden = true;
    DOM.submitOrderLoader.hidden = false;

    try {
      const formData = new FormData(form);
      const isSingleOrder = state.currentCheckoutItems && state.currentCheckoutItems.length > 0 && state.currentCheckoutItems !== state.cart;
      await sendOrderToTelegram(formData);

      // Order Success
      form.reset();
      if (!isSingleOrder) {
        state.cart = [];
        updateCartUI();
      }
      state.currentCheckoutItems = [];
      closeCheckoutModal();
      showToast("🎉 تم تأكيد طلبك بنجاح! سنتواصل معك هاتفياً قريباً للتوصيل.");
    } catch (err) {
      console.error("Order submission failed:", err);
      showToast("تعذر إرسال الطلب، يرجى المحاولة بعد قليل.");
    } finally {
      DOM.submitOrderBtn.disabled = false;
      DOM.submitOrderText.hidden = false;
      DOM.submitOrderLoader.hidden = true;
    }
  });

  // Search Events
  DOM.searchBtn.addEventListener("click", openSearchOverlay);
  DOM.closeSearchBtn.addEventListener("click", closeSearchOverlay);
  DOM.searchOverlay.addEventListener("click", (e) => {
    if (e.target === DOM.searchOverlay) closeSearchOverlay();
  });
  DOM.liveSearchInput.addEventListener("input", (e) => {
    renderSearchResults(e.target.value);
  });
  DOM.searchResultsList.addEventListener("click", (e) => {
    const item = e.target.closest(".search-result-item");
    if (!item) return;
    const prod = state.products.find(p => p.id === item.dataset.productId);
    if (prod) {
      closeSearchOverlay();
      openProductDetails(prod);
    }
  });

  // Mobile Menu Drawer & Overlay
  const openMobileDrawer = () => {
    DOM.mobileDrawer.classList.add("active");
    DOM.mobileDrawerOverlay?.classList.add("active");
    document.body.classList.add("modal-open");
  };

  const closeMobileDrawer = () => {
    DOM.mobileDrawer.classList.remove("active");
    DOM.mobileDrawerOverlay?.classList.remove("active");
    document.body.classList.remove("modal-open");
  };

  DOM.mobileMenuBtn?.addEventListener("click", openMobileDrawer);
  DOM.closeMobileDrawerBtn?.addEventListener("click", closeMobileDrawer);
  DOM.mobileDrawerOverlay?.addEventListener("click", closeMobileDrawer);

  document.querySelectorAll(".mobile-nav-link").forEach(link => {
    link.addEventListener("click", closeMobileDrawer);
  });

  // Category Pills inside Mobile Drawer Delegation
  $("drawerCatTags")?.addEventListener("click", (e) => {
    const pill = e.target.closest(".drawer-cat-pill");
    if (!pill) return;
    setActiveCategory(pill.dataset.cat);
    closeMobileDrawer();
    $("productsSection")?.scrollIntoView({ behavior: "smooth" });
  });

  // Touch Swipe for Hero Banner on Mobile
  let heroTouchStartX = 0;
  let heroTouchEndX = 0;
  const heroBannerBox = document.querySelector(".hero-banner");
  if (heroBannerBox) {
    heroBannerBox.addEventListener("touchstart", (e) => {
      heroTouchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    heroBannerBox.addEventListener("touchend", (e) => {
      heroTouchEndX = e.changedTouches[0].screenX;
      const diff = heroTouchEndX - heroTouchStartX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) {
          // swiped right (RTL next)
          setHeroSlide(state.heroSlideIndex - 1);
        } else {
          // swiped left
          setHeroSlide(state.heroSlideIndex + 1);
        }
      }
    }, { passive: true });
  }



  // Header On-Scroll Refinement
  window.addEventListener("scroll", () => {
    if (DOM.header) {
      DOM.header.classList.toggle("scrolled", window.scrollY > 20);
    }
  }, { passive: true });


  // Global Escape Key Handler
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeProductDetails();
      closeCartDrawer();
      closeCheckoutModal();
      closeSearchOverlay();
      DOM.mobileDrawer.classList.remove("active");
    }
  });
}

// --- Initialization ---
async function initStore() {
  setupEventListeners();
  updateCartUI();

  // Instant render of default showcase data matching reference mockup
  renderCategoriesUI();
  renderProducts();

  // Load live store data with parallel queries and persistent cache
  await loadStoreData();
}

initStore();
