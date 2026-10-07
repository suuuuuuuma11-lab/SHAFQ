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
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- Telegram Configuration ---
const TELEGRAM_BOT_TOKEN = "8916406368:AAFIJTPkAykiL54hn_mmbv6AqGax6lvq08U";
const TELEGRAM_CHAT_ID = "6609345622";

// --- Application State ---
const state = {
  products: [],
  categories: [],
  activeFilter: "all",
  cart: loadCartFromStorage(),
  favorites: loadFavoritesFromStorage(),
  currentDetailProduct: null,
  selectedColor: null,
  selectedSize: null,
  heroSlideIndex: 0
};

// Hero Carousel Images
const HERO_SLIDES = [
  "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&q=85"
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
    return raw ? JSON.parse(raw) : [];
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

// --- Live Firestore Sync ---
async function fetchStoreCategories() {
  try {
    const colRef = collection(db, "categories");
    let snapshot;
    try {
      const q = query(colRef, orderBy("createdAt", "desc"));
      snapshot = await getDocs(q);
    } catch (_) {
      snapshot = await getDocs(colRef);
    }

    const list = [];
    if (snapshot && !snapshot.empty) {
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
    }

    state.categories = list;
  } catch (err) {
    console.warn("Firestore categories fetch:", err.message);
    state.categories = [];
  }
}

async function fetchStoreProducts() {
  try {
    const colRef = collection(db, "products");
    let snapshot;
    try {
      const q = query(colRef, orderBy("createdAt", "desc"));
      snapshot = await getDocs(q);
    } catch (_) {
      snapshot = await getDocs(colRef);
    }

    if (!snapshot.empty) {
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

        liveList.push({
          id: docSnap.id,
          name: p.name || "منتج",
          categoryId: catId,
          category: catName,
          price: priceNum,
          priceDisplay: formatPrice(priceNum),
          rating: typeof p.rating === "number" ? p.rating : 4.8,
          reviewsCount: typeof p.reviewsCount === "number" ? p.reviewsCount : 12,
          description: p.description || p.title || "منتج عالي الجودة متوفر للطلب مع خدمة التوصيل والدفع عند الاستلام.",
          images: imageUrls.length > 0 ? imageUrls : ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80"],
          colors: Array.isArray(p.colors) && p.colors.length > 0 ? p.colors : ["#111615", "#ffffff"],
          sizes: Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes : ["S", "M", "L", "XL"],
          specs: Array.isArray(p.specs) && p.specs.length > 0 ? p.specs : [
            "الخامة: جودة ممتازة مضمونة",
            "المقاس: متوفر بمقاسات متعددة",
            "الدفع عند الاستلام بعد المعاينة"
          ]
        });
      });

      state.products = liveList;
    } else {
      state.products = [];
    }
  } catch (err) {
    console.warn("Firestore products fetch:", err.message);
    state.products = [];
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
      DOM.categoriesGrid.innerHTML = "";
    } else {
      DOM.categoriesGrid.innerHTML = state.categories.map(cat => {
        const matchingProduct = state.products.find(p => 
          (p.categoryId && p.categoryId === cat.id) || 
          (p.category && (p.category.trim().toLowerCase() === cat.name.trim().toLowerCase() || p.category === cat.slug))
        );
        const imgUrl = cat.image || (matchingProduct && matchingProduct.images && matchingProduct.images[0]) || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=500&q=80";
        const isActive = state.activeFilter === cat.id || state.activeFilter === cat.name;

        return `
          <div class="category-card ${isActive ? "active" : ""}" data-category-id="${escapeHtml(cat.id)}" data-category-name="${escapeHtml(cat.name)}" role="button" tabindex="0">
            <div class="category-img-box">
              <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(cat.name)}" loading="lazy">
            </div>
            <span class="category-name">${escapeHtml(cat.name)}</span>
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

  if (filtered.length === 0) {
    DOM.productsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 64px 20px; color: var(--color-text-sub);">
        <p style="font-size: 1.2rem; font-weight: 700; margin-bottom: 6px; color: var(--color-text-main);">لا توجد منتجات في هذا القسم حالياً</p>
        <p style="font-size: 0.95rem;">اختر قسماً آخر أو تصفح تشكيلة "الكل".</p>
      </div>
    `;
    return;
  }

  DOM.productsGrid.innerHTML = filtered.map(p => {
    const isFav = state.favorites.has(p.id);
    const mainImg = p.images && p.images.length > 0 ? p.images[0] : "";

    return `
      <article class="product-card" data-product-id="${p.id}">
        <!-- Thumbnail Wrap -->
        <div class="product-thumb-wrap" data-action="view-details" data-id="${p.id}">
          <img class="product-thumb-img" src="${mainImg}" alt="${p.name}" loading="lazy">
          
          <!-- Favorite Heart Button -->
          <button class="btn-favorite ${isFav ? "active" : ""}" type="button" data-action="toggle-fav" data-id="${p.id}" title="${isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="product-info-body">
          <h3 class="product-name" data-action="view-details" data-id="${p.id}">${p.name}</h3>
          
          <div class="product-price-row">
            <span class="product-price">${p.priceDisplay || formatPrice(p.price)}</span>
          </div>

          <button class="btn-add-cart" type="button" data-action="quick-add-cart" data-id="${p.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span>أضف إلى السلة</span>
          </button>
        </div>
      </article>
    `;
  }).join("");
}

// --- Product Details Modal ---
function openProductDetails(product) {
  state.currentDetailProduct = product;
  state.selectedColor = product.colors && product.colors.length > 0 ? product.colors[0] : null;
  state.selectedSize = product.sizes && product.sizes.length > 0 ? product.sizes[0] : null;

  const images = product.images && product.images.length > 0 ? product.images : [];
  const mainImage = images[0] || "";

  const thumbsHtml = images.map((img, i) => `
    <button class="thumb-btn ${i === 0 ? "active" : ""}" type="button" data-image="${img}">
      <img src="${img}" alt="${product.name} ${i + 1}">
    </button>
  `).join("");

  const colorsHtml = (product.colors || []).map((col, idx) => `
    <span class="color-swatch-dot ${idx === 0 ? "active" : ""}" style="background-color: ${col};" data-color="${col}" title="${col}"></span>
  `).join("");

  const sizesHtml = (product.sizes || []).map((sz, idx) => `
    <button class="size-chip ${idx === 0 ? "active" : ""}" type="button" data-size="${sz}">${sz}</button>
  `).join("");

  const specsHtml = (product.specs || []).map(s => `<li>${s}</li>`).join("");

  DOM.modalProductContent.innerHTML = `
    <!-- Gallery -->
    <div class="detail-gallery-wrap">
      <div class="detail-main-img-box">
        <img id="detailMainImage" src="${mainImage}" alt="${product.name}">
      </div>
      <div class="detail-thumbs-strip" id="detailThumbsStrip">
        ${thumbsHtml}
      </div>
    </div>

    <!-- Info -->
    <div class="detail-info-col">
      <div class="detail-breadcrumbs">الرئيسية > المنتجات > ${product.name}</div>
      <h2 class="detail-title">${product.name}</h2>
      
      <div class="detail-price-rating-row">
        <span class="detail-price">${product.priceDisplay || formatPrice(product.price)}</span>
        <div class="detail-rating">
          <span class="detail-stars">★★★★★</span>
          <span>(${product.rating})</span>
          <span>(${product.reviewsCount} تقييم)</span>
        </div>
      </div>

      <p class="detail-desc">${product.description}</p>

      <!-- Color Selector -->
      <div class="picker-group">
        <label class="picker-label">اللون</label>
        <div class="color-swatches" id="colorSwatchesWrap">
          ${colorsHtml}
        </div>
      </div>

      <!-- Size Selector -->
      <div class="picker-group">
        <label class="picker-label">المقاس</label>
        <div class="size-chips" id="sizeChipsWrap">
          ${sizesHtml}
        </div>
      </div>

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
      <div class="detail-specs-box">
        <h4 class="specs-title">تفاصيل المنتج</h4>
        <ul class="specs-list">
          ${specsHtml}
        </ul>
      </div>
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

  DOM.cartItemsList.innerHTML = state.cart.map((item, index) => `
    <div class="cart-item-row" data-cart-index="${index}">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}">
      
      <div class="cart-item-details">
        <h4 class="cart-item-name">${item.name}</h4>
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
  `).join("");
}

function addToCart(product, quantity = 1, color = null, size = null) {
  const existing = state.cart.find(item => item.id === product.id);
  const mainImg = product.images && product.images.length > 0 ? product.images[0] : "";

  if (existing) {
    existing.quantity += quantity;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: mainImg,
      quantity,
      color: color || (product.colors ? product.colors[0] : null),
      size: size || (product.sizes ? product.sizes[0] : null)
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
      image: singleProduct.images ? singleProduct.images[0] : ""
    }];
  } else {
    if (state.cart.length === 0) {
      showToast("السلة فارغة، اختر منتجاً أولاً.");
      return;
    }
    checkoutItems = [...state.cart];
  }

  const subtotal = checkoutItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  DOM.checkoutSummaryStrip.innerHTML = `
    <div>
      <strong>عدد المنتجات:</strong> ${checkoutItems.reduce((s, i) => s + i.quantity, 0)} قطع
      <div style="font-size: 0.8rem; color: var(--color-text-sub); margin-top: 2px;">
        ${checkoutItems.map(i => `${i.name} (x${i.quantity})`).join(" • ")}
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
}

// --- Telegram Order Notification ---
function formatTelegramOrderMessage(formValues, items, total) {
  const itemsText = items.map(item => `• ${item.name} | العدد: ${item.quantity} | السعر: ${formatPrice(item.price * item.quantity)}`).join("\n");

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
  const items = state.cart.length > 0 ? state.cart : (state.currentDetailProduct ? [state.currentDetailProduct] : []);
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
      <img src="${p.images[0]}" alt="${p.name}">
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
    document.querySelectorAll(".hero-dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === state.heroSlideIndex);
    });
  }

  DOM.heroPrevBtn?.addEventListener("click", () => setHeroSlide(state.heroSlideIndex - 1));
  DOM.heroNextBtn?.addEventListener("click", () => setHeroSlide(state.heroSlideIndex + 1));
  DOM.heroDots?.addEventListener("click", (e) => {
    const dot = e.target.closest(".hero-dot");
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
      if (product) addToCart(product, 1);
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

    // Color Swatch
    const swatch = e.target.closest(".color-swatch-dot");
    if (swatch) {
      document.querySelectorAll(".color-swatch-dot").forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");
      state.selectedColor = swatch.dataset.color;
      return;
    }

    // Size Chip
    const chip = e.target.closest(".size-chip");
    if (chip) {
      document.querySelectorAll(".size-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.selectedSize = chip.dataset.size;
      return;
    }

    // Modal Add To Cart
    if (e.target.closest("#modalAddToCartBtn")) {
      if (state.currentDetailProduct) {
        addToCart(state.currentDetailProduct, 1, state.selectedColor, state.selectedSize);
        closeProductDetails();
      }
      return;
    }

    // Modal Quick COD
    if (e.target.closest("#modalQuickCodBtn")) {
      if (state.currentDetailProduct) {
        const prod = state.currentDetailProduct;
        closeProductDetails();
        openCheckoutModal(prod);
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
      await sendOrderToTelegram(formData);

      // Order Success
      form.reset();
      state.cart = [];
      updateCartUI();
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

  // Show clean spinner during initial fetch
  if (DOM.productsGrid) {
    DOM.productsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--color-text-sub);">
        <p style="font-size: 1rem; font-weight: 600;">جاري تحميل أحدث المنتجات والتصنيفات...</p>
      </div>
    `;
  }

  // Fetch from Firestore
  await fetchStoreCategories();
  await fetchStoreProducts();

  // Discover any category present on products
  syncCategoriesFromProducts();

  // Render dynamic UI
  renderCategoriesUI();
  renderProducts();
}

initStore();
