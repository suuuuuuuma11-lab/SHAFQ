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

// --- Curated Showcase Catalog (Matching Reference Design Exactly) ---
const SHOWCASE_PRODUCTS = [
  {
    id: "showcase-1",
    name: "قميص رسمي",
    category: "shirts",
    price: 3500,
    priceDisplay: "3,500 د.ج",
    rating: 4.8,
    reviewsCount: 10,
    description: "قميص أنيق ومريح من القطن عالي الجودة. مناسب لجميع المناسبات سواء للعمل أو الخروج اليومي.",
    images: [
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1620012253295-c15c429f6356?auto=format&fit=crop&w=900&q=80"
    ],
    colors: ["#60a5fa", "#ffffff", "#1e293b", "#0f172a"],
    sizes: ["S", "M", "L", "XL"],
    specs: [
      "الخامة: قطن 100% ممتاز",
      "المقاس: متوفر من S إلى XL",
      "اللون: أزرق فاتح مخطط",
      "مناسب لجميع المواسم"
    ]
  },
  {
    id: "showcase-2",
    name: "تيشيرت كلاسيك",
    category: "shirts",
    price: 2800,
    priceDisplay: "2,800 د.ج",
    rating: 4.9,
    reviewsCount: 18,
    description: "تيشيرت قطني كلاسيكي ناعم الملمس، بقصة مريحة وأكمام قصيرة تلائم الإطلالات العصرية.",
    images: [
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80"
    ],
    colors: ["#111615", "#ffffff", "#6b7280"],
    sizes: ["S", "M", "L", "XL"],
    specs: [
      "الخامة: قطن بيور 100%",
      "القصة: ريغولار فيت",
      "مقاوم للانكماش والبهتان"
    ]
  },
  {
    id: "showcase-3",
    name: "هودي كاجوال",
    category: "hoodies",
    price: 4500,
    priceDisplay: "4,500 د.ج",
    rating: 4.7,
    reviewsCount: 14,
    description: "هودي أوفر سايز بقماش ميلتون دافئ وفاخر مع جيب كنغر وغطاء رأس مبطن.",
    images: [
      "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=80"
    ],
    colors: ["#d6d3d1", "#1e293b", "#78716c"],
    sizes: ["M", "L", "XL"],
    specs: [
      "الخامة: ميلتون قطن مدعم",
      "الستايل: كاجوال أوفر سايز",
      "بطانة ناعمة توفر الدفء"
    ]
  },
  {
    id: "showcase-4",
    name: "حذاء رياضي",
    category: "shoes",
    price: 6900,
    priceDisplay: "6,900 د.ج",
    rating: 5.0,
    reviewsCount: 22,
    description: "حذاء سنيكرز كلاسيكي بتصميم أبيض أنيق مع نعل داخلي مبطن لراحة فائقة طوال اليوم.",
    images: [
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=80"
    ],
    colors: ["#f8fafc", "#e2e8f0"],
    sizes: ["40", "41", "42", "43", "44"],
    specs: [
      "الخامة: جلد صناعي ممتاز",
      "النعل: مطاطي مقاوم للانزلاق",
      "الوزن: خفيف ومريح للمشي"
    ]
  },
  {
    id: "showcase-5",
    name: "بنطلون جينز كلاسيك",
    category: "pants",
    price: 3800,
    priceDisplay: "3,800 د.ج",
    rating: 4.8,
    reviewsCount: 16,
    description: "جينز أزرق داكن بقصة مستقيمة مريحة مصنوع من قماش الدنيم المعالج عالي التحمل.",
    images: [
      "https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=900&q=80"
    ],
    colors: ["#1e3a8a", "#1e293b"],
    sizes: ["30", "32", "34", "36"],
    specs: [
      "الخامة: دنيم قطني 98% مع إيلاستين",
      "القصة: مستقيمة كلاسيكية",
      "جيوب متينة وخياطة مزدوجة"
    ]
  },
  {
    id: "showcase-6",
    name: "معطف شتوي فاخر",
    category: "jackets",
    price: 8500,
    priceDisplay: "8,500 د.ج",
    rating: 4.9,
    reviewsCount: 9,
    description: "معطف شتوي طويل أنيق يمنحك مظهراً راقياً ودفئاً مثالياً في الأيام الباردة.",
    images: [
      "https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=900&q=80"
    ],
    colors: ["#111615", "#78716c"],
    sizes: ["M", "L", "XL"],
    specs: [
      "الخامة: صوف معالج مع بطانة ساتان",
      "ياقة كلاسيكية عريضة",
      "أزرار أنيقة وقفل محكم"
    ]
  }
];

// --- Category Labels Dictionary ---
const CATEGORY_NAMES = {
  all: "الكل",
  shirts: "قمصان",
  hoodies: "كنزات",
  pants: "بنطلونات",
  jackets: "معاطف",
  shoes: "أحذية"
};

// --- Application State ---
const state = {
  products: [...SHOWCASE_PRODUCTS],
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

  // Products & Tabs
  productsGrid: $("productsGrid"),
  catTabs: document.querySelectorAll(".cat-tab"),
  categoriesGrid: $("categoriesGrid"),
  viewAllCategoriesBtn: $("viewAllCategoriesBtn"),

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
  return CATEGORY_NAMES[key] || key || "عام";
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
async function fetchStoreProducts() {
  try {
    const colRef = collection(db, "products");
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const liveList = [];
      snapshot.forEach((docSnap) => {
        const p = docSnap.data();
        const rawImages = Array.isArray(p.images) ? p.images : [];
        const imageUrls = rawImages.map(i => typeof i === "string" ? i : i.url).filter(Boolean);
        if (imageUrls.length === 0 && p.mainImage) {
          imageUrls.push(p.mainImage);
        }

        const priceNum = typeof p.price === "number" ? p.price : (parseInt(p.price, 10) || 0);

        liveList.push({
          id: docSnap.id,
          name: p.name || "منتج فاخر",
          category: p.category || "shirts",
          price: priceNum,
          priceDisplay: formatPrice(priceNum),
          rating: 4.8,
          reviewsCount: 12,
          description: p.description || p.title || "منتج عالي الجودة من تشكيلة ClothStore الفاخرة.",
          images: imageUrls.length > 0 ? imageUrls : ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80"],
          colors: ["#111615", "#ffffff", "#60a5fa"],
          sizes: ["S", "M", "L", "XL"],
          specs: [
            "الخامة: قطن أصلي عالي الجودة",
            "المقاس: متوفر بمقاسات متعددة",
            "ضمان الجودة والأصالة"
          ]
        });
      });

      state.products = liveList;
    }
  } catch (err) {
    console.info("Using showcase fashion collection:", err.message);
  }

  renderProducts();
}

// --- Render Products Grid ---
function renderProducts() {
  const filtered = state.products.filter(p => {
    return state.activeFilter === "all" || p.category === state.activeFilter;
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
        <span class="detail-price">${product.priceDisplay || formatPrice(p.price)}</span>
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

  // Category Filter Tabs
  DOM.catTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      DOM.catTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.activeFilter = tab.dataset.filter;
      renderProducts();
    });
  });

  // Category Cards in Category Section
  DOM.categoriesGrid?.addEventListener("click", (e) => {
    const card = e.target.closest(".category-card");
    if (!card) return;
    const cat = card.dataset.category;
    state.activeFilter = cat;

    // Highlight matching tab
    DOM.catTabs.forEach(t => {
      t.classList.toggle("active", t.dataset.filter === cat);
    });

    renderProducts();
    const target = $("productsSection");
    if (target) target.scrollIntoView({ behavior: "smooth" });
  });

  DOM.viewAllCategoriesBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    state.activeFilter = "all";
    DOM.catTabs.forEach(t => t.classList.toggle("active", t.dataset.filter === "all"));
    renderProducts();
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

  // Mobile Menu Drawer
  DOM.mobileMenuBtn.addEventListener("click", () => {
    DOM.mobileDrawer.classList.add("active");
  });
  DOM.closeMobileDrawerBtn.addEventListener("click", () => {
    DOM.mobileDrawer.classList.remove("active");
  });
  document.querySelectorAll(".mobile-nav-link").forEach(link => {
    link.addEventListener("click", () => {
      DOM.mobileDrawer.classList.remove("active");
    });
  });

  // Footer Links
  $("footerOrderLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    openCheckoutModal();
  });

  // Newsletter Form
  $("newsletterForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    showToast("شكراً لاشتراكك في نشرة ClothStore البريدية!");
    e.target.reset();
  });

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
setupEventListeners();
updateCartUI();
fetchStoreProducts();
