/* ==========================================================================
   HADJAJ STORE — Unified Shopping Cart & Checkout Module
   Manages:
   - Cart Persistence (hadjaj_cart with alnoor_cart fallback)
   - Add to Cart with Variant Identification (productId + size + color)
   - Quantity Controls (qty >= 1 strictly enforced)
   - In-Cart Size & Color Modification with Automatic Merge Logic
   - Subtotal & Total Exact Calculations
   - Universal Cash-on-Delivery Checkout Modal (Cloud Firestore + Telegram)
   - Seamless RTL UX and Mobile Responsiveness
   ========================================================================== */

import { db } from "./firebase-config.js";
import { 
  collection, 
  addDoc 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Storage Keys
const PRIMARY_CART_KEY = "hadjaj_cart";
const LEGACY_CART_KEY = "alnoor_cart";

import { setupWilayaCommuneCascade } from "./locations.js";
import { loadActiveShippingSettings, getInitialShippingSettings, getShippingPrice, findWilaya } from "./shipping.js";

export const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"];

// Arabic Color Name to Hex Code Resolver
export const ARABIC_COLOR_MAP = {
  "أسود": "#18181b", "اسود": "#18181b", "black": "#18181b",
  "أبيض": "#ffffff", "ابيض": "#ffffff", "white": "#ffffff",
  "رمادي": "#71717a", "رمادي فاتح": "#d4d4d8", "رمادي غامق": "#3f3f46", "gray": "#71717a", "grey": "#71717a",
  "كحلي": "#1e293b", "ازرق داكن": "#1e3a8a", "أزرق داكن": "#1e3a8a", "navy": "#1e293b",
  "أزرق": "#2563eb", "ازرق": "#2563eb", "أزرق فاتح": "#38bdf8", "blue": "#2563eb",
  "بني": "#78350f", "بني فاتح": "#92400e", "brown": "#78350f",
  "بيج": "#e6d5b8", "beige": "#e6d5b8",
  "خردلي": "#d97706", "mustard": "#d97706",
  "أخضر": "#16a34a", "اخضر": "#16a34a", "زيتي": "#4d5b36", "green": "#16a34a", "olive": "#4d5b36",
  "أحمر": "#dc2626", "احمر": "#dc2626", "red": "#dc2626",
  "عنابي": "#881337", "بورغندي": "#701a31", "maroon": "#881337", "burgundy": "#701a31",
  "وردي": "#f472b6", "pink": "#f472b6",
  "بنفسجي": "#7c3aed", "purple": "#7c3aed",
  "برتقالي": "#ea580c", "orange": "#ea580c",
  "أصفر": "#eab308", "اصفر": "#eab308", "yellow": "#eab308"
};

export function resolveColorHex(val) {
  if (!val) return "#1d1a16";
  const str = String(val).trim();
  if (str.startsWith("#") || str.startsWith("rgb") || str.startsWith("hsl")) return str;
  return ARABIC_COLOR_MAP[str] || ARABIC_COLOR_MAP[str.toLowerCase()] || "#1d1a16";
}

// Safe HTML Escape
export const esc = s => String(s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// --- Cart State & Storage Helpers ---
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(PRIMARY_CART_KEY) || localStorage.getItem(LEGACY_CART_KEY) || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    // Normalize existing items to ensure required fields exist
    return parsed.map(item => {
      const pid = item.productId || item.id || "item_" + Math.random().toString(36).slice(2, 7);
      const name = item.name || "قميص فاخر";
      const price = typeof item.price === "number" ? item.price : Number(item.price) || 0;
      const qty = Math.max(1, parseInt(item.quantity || item.qty, 10) || 1);
      const size = String(item.size || "M");
      const color = String(item.color || "افتراضي");
      const colorHex = String(item.colorHex || "#1d1a16");
      const image = item.image || item.img || '';
      const availableSizes = Array.isArray(item.availableSizes) && item.availableSizes.length ? item.availableSizes : DEFAULT_SIZES;
      const availableColors = Array.isArray(item.availableColors) && item.availableColors.length ? item.availableColors : [{ name: color, value: colorHex }];

      return {
        productId: String(pid),
        id: String(pid),
        name,
        price,
        image,
        quantity: qty,
        size,
        color,
        colorHex,
        availableSizes,
        availableColors
      };
    });
  } catch (err) {
    console.error("Cart hydration error:", err);
    return [];
  }
}

export let cart = loadCartFromStorage();

export function saveCart() {
  try {
    const serialized = JSON.stringify(cart);
    localStorage.setItem(PRIMARY_CART_KEY, serialized);
    localStorage.setItem(LEGACY_CART_KEY, serialized);
  } catch (err) {
    console.error("Cart save error:", err);
  }
  updateBadge();
}

export function cartKey(item) {
  return `${item.productId || item.id}|${item.size}|${item.color}`;
}

export function getCartQty() {
  return cart.reduce((sum, item) => sum + (Math.max(1, parseInt(item.quantity, 10) || 1)), 0);
}

export function getCartTotal() {
  return cart.reduce((sum, item) => {
    const p = typeof item.price === "number" ? item.price : Number(item.price) || 0;
    const q = Math.max(1, parseInt(item.quantity, 10) || 1);
    return sum + (p * q);
  }, 0);
}

export function toast(msg, isSuccess = true) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.background = isSuccess ? "#1d1a16" : "#c0392b";
  t.classList.add("show");
  clearTimeout(t._toastTimer);
  t._toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// --- Cart Operations ---

/**
 * Add product to cart.
 * If same productId + size + color exists -> increment quantity.
 * If different size or color -> add as separate item.
 */
export function addToCart({
  productId,
  name,
  price,
  image,
  quantity = 1,
  size = "M",
  color = "افتراضي",
  colorHex = "#1d1a16",
  availableSizes = DEFAULT_SIZES,
  availableColors = [],
  openDrawer = false
}) {
  const pid = String(productId || "");
  const cleanPrice = typeof price === "number" ? price : Number(price) || 0;
  const cleanQty = Math.max(1, parseInt(quantity, 10) || 1);
  const cleanSize = String(size || "M");
  const cleanColor = String(color || "افتراضي");

  const existingIndex = cart.findIndex(
    item => String(item.productId || item.id) === pid && item.size === cleanSize && item.color === cleanColor
  );

  if (existingIndex > -1) {
    cart[existingIndex].quantity += cleanQty;
    // Keep verified metadata up to date
    if (cleanPrice > 0) cart[existingIndex].price = cleanPrice;
    if (image) cart[existingIndex].image = image;
  } else {
    cart.push({
      productId: pid,
      id: pid,
      name: name || "قميص فاخر",
      price: cleanPrice,
      image: image || '',
      quantity: cleanQty,
      size: cleanSize,
      color: cleanColor,
      colorHex: colorHex || "#1d1a16",
      availableSizes: Array.isArray(availableSizes) && availableSizes.length ? availableSizes : DEFAULT_SIZES,
      availableColors: Array.isArray(availableColors) && availableColors.length ? availableColors : [{ name: cleanColor, value: colorHex || "#1d1a16" }]
    });
  }

  saveCart();
  renderCartDrawer();
  if (openDrawer) {
    openCartDrawer();
  }
  toast(`تمت إضافة "${name}" إلى السلة`);
}

/**
 * Change quantity of a cart item.
 * Minimum quantity is 1 (never decreases to 0 or negative).
 */
export function changeCartQty(key, delta) {
  const item = cart.find(c => cartKey(c) === key);
  if (!item) return;

  const currentQty = Math.max(1, parseInt(item.quantity, 10) || 1);
  const newQty = currentQty + delta;

  if (newQty < 1) {
    // Strictly enforce minimum of 1
    item.quantity = 1;
    toast("الحد الأدنى للكمية هو 1");
  } else {
    item.quantity = newQty;
  }

  saveCart();
  renderCartDrawer();
  syncCheckoutModalIfOpen();
}

/**
 * Remove an item completely from cart.
 */
export function removeFromCart(key) {
  const beforeLen = cart.length;
  cart = cart.filter(c => cartKey(c) !== key);
  if (cart.length < beforeLen) {
    saveCart();
    renderCartDrawer();
    syncCheckoutModalIfOpen();
    toast("أُزيل المنتج من الحقيبة");
  }
}

/**
 * Change size of an item in the cart.
 * If the change results in matching an existing item -> merge quantity!
 */
export function changeCartItemSize(key, newSize) {
  const item = cart.find(c => cartKey(c) === key);
  if (!item || item.size === newSize) return;

  const duplicateIndex = cart.findIndex(
    c => cartKey(c) !== key && String(c.productId || c.id) === String(item.productId || item.id) && c.color === item.color && c.size === newSize
  );

  if (duplicateIndex > -1) {
    // Merge into existing item
    cart[duplicateIndex].quantity += item.quantity;
    cart = cart.filter(c => cartKey(c) !== key);
    toast(`تم تغيير المقاس ودمج الكمية مع المقاس الموجود (${cart[duplicateIndex].quantity})`);
  } else {
    item.size = newSize;
    toast(`تم تعديل المقاس إلى ${newSize}`);
  }

  saveCart();
  renderCartDrawer();
  syncCheckoutModalIfOpen();
}

/**
 * Change color of an item in the cart.
 * If the change results in matching an existing item -> merge quantity!
 */
export function changeCartItemColor(key, newColorName) {
  const item = cart.find(c => cartKey(c) === key);
  if (!item || item.color === newColorName) return;

  // Find color hex from available colors
  let newHex = item.colorHex;
  if (Array.isArray(item.availableColors)) {
    const match = item.availableColors.find(c => (typeof c === "object" ? c.name === newColorName : c === newColorName));
    if (match) newHex = typeof match === "object" ? match.value : match;
  }

  const duplicateIndex = cart.findIndex(
    c => cartKey(c) !== key && String(c.productId || c.id) === String(item.productId || item.id) && c.size === item.size && c.color === newColorName
  );

  if (duplicateIndex > -1) {
    // Merge into existing item
    cart[duplicateIndex].quantity += item.quantity;
    cart = cart.filter(c => cartKey(c) !== key);
    toast(`تم تغيير اللون ودمج الكمية مع العنصر المطابق (${cart[duplicateIndex].quantity})`);
  } else {
    item.color = newColorName;
    item.colorHex = newHex;
    toast(`تم تعديل اللون إلى ${newColorName}`);
  }

  saveCart();
  renderCartDrawer();
  syncCheckoutModalIfOpen();
}

/**
 * Clear the entire cart.
 */
export function clearCart() {
  cart = [];
  saveCart();
  renderCartDrawer();
  syncCheckoutModalIfOpen();
}

// --- Cart Drawer Rendering ---

export function updateBadge() {
  const badgeEl = document.getElementById("cartBadge");
  const qty = getCartQty();
  if (badgeEl) {
    badgeEl.textContent = qty;
    badgeEl.style.display = qty > 0 ? "flex" : "none";
  }
}

export function openCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const backdrop = document.getElementById("backdrop");
  renderCartDrawer();
  drawer?.classList.add("open");
  backdrop?.classList.add("show");
  document.body.classList.add("drawer-open");
}

export function closeCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const backdrop = document.getElementById("backdrop");
  drawer?.classList.remove("open");
  backdrop?.classList.remove("show");
  document.body.classList.remove("drawer-open");
}

export function renderCartDrawer() {
  const box = document.getElementById("cartItems");
  const foot = document.getElementById("cartFoot");
  const totalEl = document.getElementById("cartTotal");

  if (!box) return;

  if (cart.length === 0) {
    box.innerHTML = `
      <div class="drawer-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="margin:0 auto 12px;opacity:0.4"><path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        <p>حقيبتك فارغة</p>
        <small>تصفح القمصان وأضف ما يعجبك</small>
      </div>`;
    if (foot) foot.style.display = "none";
    if (totalEl) totalEl.textContent = "0 دج";
    return;
  }

  if (foot) foot.style.display = "block";

  box.innerHTML = cart.map(item => {
    const k = cartKey(item);
    const itemTotal = (item.price * item.quantity).toLocaleString("ar-DZ");
    const sizes = Array.isArray(item.availableSizes) && item.availableSizes.length ? item.availableSizes : DEFAULT_SIZES;
    const colors = Array.isArray(item.availableColors) && item.availableColors.length 
      ? item.availableColors 
      : [{ name: item.color, value: item.colorHex || "#1d1a16" }];

    const sizeOptionsHTML = sizes.map(s => `
      <option value="${esc(s)}" ${s === item.size ? "selected" : ""}>${esc(s)}</option>
    `).join("");

    const colorOptionsHTML = colors.map(c => {
      const cName = typeof c === "object" ? c.name : c;
      return `<option value="${esc(cName)}" ${cName === item.color ? "selected" : ""}>${esc(cName)}</option>`;
    }).join("");

    return `
      <div class="ci" data-key="${esc(k)}">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" onerror="this.style.opacity='0'">
        <div class="ci-info">
          <div class="ci-name">${esc(item.name)}</div>
          
          <div class="ci-options">
            <div class="ci-opt-group">
              <label>المقاس:</label>
              <select class="ci-select" onchange="window.hadjajCart.changeCartItemSize('${esc(k)}', this.value)">
                ${sizeOptionsHTML}
              </select>
            </div>
            <div class="ci-opt-group">
              <label>اللون:</label>
              <select class="ci-select" onchange="window.hadjajCart.changeCartItemColor('${esc(k)}', this.value)">
                ${colorOptionsHTML}
              </select>
            </div>
          </div>

          <div class="ci-row">
            <div class="ci-qty">
              <button type="button" onclick="window.hadjajCart.changeCartQty('${esc(k)}', 1)" aria-label="زيادة">+</button>
              <span>${item.quantity}</span>
              <button type="button" onclick="window.hadjajCart.changeCartQty('${esc(k)}', -1)" aria-label="إنقاص" ${item.quantity <= 1 ? "disabled style='opacity:0.4;cursor:not-allowed'" : ""}>−</button>
            </div>
            <span class="ci-price">${itemTotal} دج</span>
          </div>

          <button type="button" class="ci-remove" onclick="window.hadjajCart.removeFromCart('${esc(k)}')">إزالة</button>
        </div>
      </div>`;
  }).join("");

  if (totalEl) {
    totalEl.textContent = getCartTotal().toLocaleString("ar-DZ") + " دج";
  }
}

// --- Universal Checkout Modal ---

function syncCheckoutModalIfOpen() {
  const modal = document.getElementById("checkoutModal");
  if (modal && modal.classList.contains("show")) {
    if (cart.length === 0) {
      closeCheckoutModal();
      toast("أصبحت السلة فارغة");
    } else {
      renderCheckoutModalReview();
    }
  }
}

export function openCheckoutModal() {
  if (cart.length === 0) {
    toast("حقيبتك فارغة، اختر منتجاً أولاً", false);
    return;
  }

  closeCartDrawer();
  const modal = document.getElementById("checkoutModal");
  const backdrop = document.getElementById("checkoutBackdrop");

  renderCheckoutModalReview();
  populateWilayasDropdown();
  updateCartCheckoutPricing();

  modal?.classList.add("show");
  backdrop?.classList.add("show");
  document.body.classList.add("modal-open");
}

export function closeCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  const backdrop = document.getElementById("checkoutBackdrop");
  modal?.classList.remove("show");
  backdrop?.classList.remove("show");
  document.body.classList.remove("modal-open");
}

function renderCheckoutModalReview() {
  const listEl = document.getElementById("cmItemsList");
  const countEl = document.getElementById("cmItemCount");
  const totalEl = document.getElementById("cmTotalAmount");
  const btnEl = document.getElementById("cmSubmitBtn");

  const total = getCartTotal();
  const count = getCartQty();

  if (countEl) countEl.textContent = `${count} ${count > 1 ? "قطع" : "قطعة"}`;
  if (totalEl) totalEl.textContent = total.toLocaleString("ar-DZ") + " دج";
  if (btnEl) btnEl.textContent = `تأكيد الطلب — الدفع عند الاستلام (${total.toLocaleString("ar-DZ")} دج)`;

  if (listEl) {
    listEl.innerHTML = cart.map(item => `
      <div class="cm-review-item">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" onerror="this.style.opacity='0'">
        <div class="cm-review-info">
          <div class="cm-review-name">${esc(item.name)}</div>
          <div class="cm-review-meta">المقاس: <b>${esc(item.size)}</b> — اللون: <b>${esc(item.color)}</b></div>
        </div>
        <div class="cm-review-calc">
          <div>${item.quantity} × ${item.price.toLocaleString("ar-DZ")} دج</div>
          <b>${(item.price * item.quantity).toLocaleString("ar-DZ")} دج</b>
        </div>
      </div>
    `).join("");
  }
}

let cmCascadeInitialized = false;

let activeCartShippingSettings = getInitialShippingSettings();

export function getCartSelectedDeliveryMethod() {
  const checked = document.querySelector('input[name="cmDeliveryMethod"]:checked');
  return checked ? checked.value : "home";
}

export function updateCartCheckoutPricing() {
  const wilayaEl = document.getElementById("cmWilaya");
  const wilayaVal = wilayaEl ? wilayaEl.value : "";
  const method = getCartSelectedDeliveryMethod();

  const homePriceEl = document.getElementById("cmHomePriceDisplay");
  const stopDeskPriceEl = document.getElementById("cmStopDeskPriceDisplay");
  const opsSubtotalEl = document.getElementById("cmOpsSubtotal");
  const opsShippingEl = document.getElementById("cmOpsShipping");
  const opsMethodLabelEl = document.getElementById("cmOpsMethodLabel");
  const opsTotalEl = document.getElementById("cmOpsTotal");
  const cmTotalAmountEl = document.getElementById("cmTotalAmount");
  const cardHome = document.getElementById("cmCardHome");
  const cardStopDesk = document.getElementById("cmCardStopDesk");

  if (cardHome) cardHome.classList.toggle("active", method === "home");
  if (cardStopDesk) cardStopDesk.classList.toggle("active", method === "stopDesk");

  const rates = (activeCartShippingSettings && activeCartShippingSettings.rates) ? activeCartShippingSettings.rates : null;
  let homePrice = 0;
  let stopDeskPrice = 0;
  let hasWilaya = false;

  if (wilayaVal && rates) {
    hasWilaya = true;
    homePrice = getShippingPrice(rates, wilayaVal, "home");
    stopDeskPrice = getShippingPrice(rates, wilayaVal, "stopDesk");
  }

  if (homePriceEl) homePriceEl.textContent = hasWilaya ? `${homePrice.toLocaleString("ar-DZ")} دج` : "—";
  if (stopDeskPriceEl) stopDeskPriceEl.textContent = hasWilaya ? `${stopDeskPrice.toLocaleString("ar-DZ")} دج` : "—";

  const subtotal = getCartTotal();
  const activeShipping = hasWilaya ? (method === "stopDesk" ? stopDeskPrice : homePrice) : 0;
  const finalTotal = subtotal + activeShipping;

  if (opsSubtotalEl) opsSubtotalEl.textContent = `${subtotal.toLocaleString("ar-DZ")} دج`;
  if (opsShippingEl) {
    opsShippingEl.textContent = hasWilaya ? `${activeShipping.toLocaleString("ar-DZ")} دج` : "اختر الولاية";
  }
  if (opsMethodLabelEl) {
    opsMethodLabelEl.textContent = method === "stopDesk" ? "استلام من المكتب" : "توصيل للمنزل";
  }
  if (opsTotalEl) opsTotalEl.textContent = `${finalTotal.toLocaleString("ar-DZ")} دج`;
  if (cmTotalAmountEl) cmTotalAmountEl.textContent = `${finalTotal.toLocaleString("ar-DZ")} دج`;
}

// Load shipping settings on initialization
loadActiveShippingSettings().then(s => {
  activeCartShippingSettings = s;
  updateCartCheckoutPricing();
});

function setupCartDeliveryListeners() {
  document.querySelectorAll('input[name="cmDeliveryMethod"]').forEach(r => {
    r.addEventListener('change', () => updateCartCheckoutPricing());
  });
  document.getElementById("cmCardHome")?.addEventListener("click", () => {
    const r = document.querySelector('input[name="cmDeliveryMethod"][value="home"]');
    if (r) { r.checked = true; updateCartCheckoutPricing(); }
  });
  document.getElementById("cmCardStopDesk")?.addEventListener("click", () => {
    const r = document.querySelector('input[name="cmDeliveryMethod"][value="stopDesk"]');
    if (r) { r.checked = true; updateCartCheckoutPricing(); }
  });
  document.getElementById("cmWilaya")?.addEventListener("change", () => {
    updateCartCheckoutPricing();
  });
}

function populateWilayasDropdown() {
  if (!cmCascadeInitialized) {
    setupWilayaCommuneCascade({
      wilayaSelectId: "cmWilaya",
      communeSelectId: "cmCommune",
      wilayaFieldId: "cmFWilaya",
      communeFieldId: "cmFCommune"
    });
    cmCascadeInitialized = true;
  }
}

// Telegram Order Dispatcher (Securely routed through serverless endpoint /api/telegram)
export async function sendTelegramOrderNotification(orderData, orderId) {
  try {
    const res = await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, orderData })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return data;
    }
  } catch (err) {
    console.warn("Telegram notification dispatch error:", err);
  }
  return { ok: false };
}

// Handle Checkout Form Submission
export async function handleCheckoutSubmit(e) {
  e.preventDefault();
  if (cart.length === 0) {
    toast("حقيبتك فارغة", false);
    return;
  }

  const nameEl = document.getElementById("cmName");
  const phoneEl = document.getElementById("cmPhone");
  const wilayaEl = document.getElementById("cmWilaya");
  const communeEl = document.getElementById("cmCommune");
  const addressEl = document.getElementById("cmAddress");
  const submitBtn = document.getElementById("cmSubmitBtn");

  const name = nameEl ? nameEl.value.trim() : "";
  const phone = phoneEl ? phoneEl.value.trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) : "";
  const wilaya = wilayaEl ? wilayaEl.value : "";
  const commune = communeEl ? communeEl.value.trim() : "";
  const address = addressEl ? addressEl.value.trim() : "";

  // Validation
  const setInvalid = (fid, bad) => {
    const el = document.getElementById(fid);
    if (el) el.classList.toggle("invalid", bad);
    return !bad;
  };

  let valid = true;
  valid = setInvalid("cmFName", name.length < 3) && valid;
  valid = setInvalid("cmFPhone", !/^0[5-7][0-9]{8}$/.test(phone)) && valid;
  valid = setInvalid("cmFWilaya", !wilaya) && valid;
  valid = setInvalid("cmFCommune", !commune) && valid;

  if (!valid) return;

  const originalBtnText = submitBtn ? submitBtn.textContent : "تأكيد الطلب — الدفع عند الاستلام";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "جاري تأكيد الطلب وحفظه في السحابة...";
  }

  const deliveryMethod = getCartSelectedDeliveryMethod();
  const wilayaInfo = findWilaya(wilaya);
  const wilayaCode = wilayaInfo ? wilayaInfo.code : "";
  const communeInfo = wilayaInfo?.communes?.find(c => c.name === commune);
  const communeCode = communeInfo ? communeInfo.code : "";

  const subtotal = getCartTotal();
  const rates = (activeCartShippingSettings && activeCartShippingSettings.rates) ? activeCartShippingSettings.rates : null;
  const shippingPrice = getShippingPrice(rates, wilaya, deliveryMethod);
  const calculatedTotal = subtotal + shippingPrice;

  const orderItems = cart.map(i => ({
    productId: i.productId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    size: i.size,
    color: i.color,
    colorHex: i.colorHex || "#1d1a16",
    image: i.image || ''
  }));

  let createdOrderId = null;
  let savedOrderData = null;
  let telegramAlreadySent = false;

  try {
    // 1. Authoritative Backend Calculation & Verification
    const backendRes = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: name,
        phone,
        wilaya,
        wilayaCode,
        commune,
        communeCode,
        address,
        deliveryMethod,
        items: orderItems,
        paymentMethod: "الدفع عند الاستلام"
      })
    });

    if (backendRes.ok) {
      const backendData = await backendRes.json();
      if (backendData.success) {
        if (backendData.firestoreSaved && backendData.orderId) {
          createdOrderId = backendData.orderId;
          savedOrderData = backendData.order;
          telegramAlreadySent = Boolean(backendData.telegramSent);
        } else if (backendData.order) {
          // Backend verified the math, but did not write to Firestore directly
          savedOrderData = backendData.order;
        }
      }
    }
  } catch (apiErr) {
    console.warn("Backend /api/order call failed, falling back to direct Firestore:", apiErr);
  }

  try {
    // 2. Direct Firestore Persistence if not already saved by backend
    if (!createdOrderId) {
      const basePayload = savedOrderData || {
        customer: name,
        phone,
        wilaya,
        commune,
        address,
        deliveryMethod: deliveryMethod,
        shippingPrice: shippingPrice,
        subtotal: subtotal,
        total: calculatedTotal,
        shipping: {
          method: deliveryMethod,
          wilayaCode: String(wilayaCode || ""),
          communeCode: String(communeCode || ""),
          price: shippingPrice
        },
        items: orderItems,
        paymentMethod: "الدفع عند الاستلام",
        status: "جديد",
        createdAt: new Date().toISOString()
      };

      // Ensure strictly valid keys conforming to firestore.rules (allowedKeys)
      const cleanOrderPayload = {
        customer: basePayload.customer,
        phone: basePayload.phone,
        wilaya: basePayload.wilaya,
        commune: basePayload.commune,
        address: basePayload.address || "",
        deliveryMethod: basePayload.deliveryMethod,
        shippingPrice: Number(basePayload.shippingPrice),
        subtotal: Number(basePayload.subtotal),
        total: Number(basePayload.total),
        shipping: {
          method: basePayload.deliveryMethod,
          wilayaCode: String(basePayload.shipping?.wilayaCode || wilayaCode || ""),
          communeCode: String(basePayload.shipping?.communeCode || communeCode || ""),
          price: Number(basePayload.shippingPrice)
        },
        items: basePayload.items.map(it => ({
          productId: String(it.productId || it.id || "p1"),
          name: it.name,
          price: Number(it.price),
          quantity: Number(it.quantity || it.qty || 1),
          size: it.size || "M",
          color: it.color || "افتراضي",
          colorHex: it.colorHex || "#1d1a16",
          image: it.image || ""
        })),
        paymentMethod: "الدفع عند الاستلام",
        status: "جديد",
        createdAt: basePayload.createdAt || new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "orders"), cleanOrderPayload);
      createdOrderId = docRef.id;
      savedOrderData = cleanOrderPayload;
    }

    if (!createdOrderId) {
      throw new Error("فشل حفظ الطلب في قاعدة البيانات");
    }

    // Always guarantee Telegram notification is dispatched with the real order ID
    if (!telegramAlreadySent) {
      try {
        await sendTelegramOrderNotification({
          name: savedOrderData.customer,
          phone: savedOrderData.phone,
          wilaya: savedOrderData.wilaya,
          commune: savedOrderData.commune,
          address: savedOrderData.address,
          items: savedOrderData.items,
          deliveryMethod: savedOrderData.deliveryMethod,
          shippingPrice: savedOrderData.shippingPrice,
          subtotal: savedOrderData.subtotal,
          total: Number(savedOrderData.total).toLocaleString("ar-DZ")
        }, createdOrderId);
      } catch (tgErr) {
        console.warn("Direct Telegram notification warning:", tgErr);
      }
    }

    // 3. Clear Cart
    clearCart();

    // 4. Close Checkout Modal
    closeCheckoutModal();

    // 5. Show Success Screen
    showOrderSuccessReceipt(createdOrderId, savedOrderData);

  } catch (err) {
    console.error("Order submission exception:", err);
    toast("حدث خطأ أثناء حفظ الطلب في السحابة، يرجى المحاولة ثانية", false);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
}

function showOrderSuccessReceipt(orderId, orderData) {
  const successModal = document.getElementById("orderSuccessModal");
  const backdrop = document.getElementById("checkoutBackdrop");
  const summaryEl = document.getElementById("smOrderSummary");

  if (summaryEl) {
    const itemsListHTML = (orderData.items || []).map(it => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e7e1d7;font-size:13px">
        <span>${esc(it.name)} (${esc(it.size)} / ${esc(it.color)}) × ${it.quantity}</span>
        <b>${(it.price * it.quantity).toLocaleString("ar-DZ")} دج</b>
      </div>
    `).join("");

    summaryEl.innerHTML = `
      <div style="font-size:14px;line-height:1.8">
        <div style="margin-bottom:8px">رقم الطلب: <b style="color:var(--gold-dark)">#${esc(orderId.slice(-6).toUpperCase())}</b></div>
        <div style="margin-bottom:8px">${itemsListHTML}</div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:var(--muted)">
          <span>طريقة التوصيل:</span>
          <b>${orderData.deliveryMethod === "stopDesk" ? "استلام من المكتب (Stop Desk)" : "توصيل للمنزل (Home)"}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:var(--muted)">
          <span>تكلفة التوصيل:</span>
          <b>${(orderData.shippingPrice || 0).toLocaleString("ar-DZ")} دج</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:16px;margin:8px 0;padding-top:6px;border-top:1px solid #e7e1d7">
          <b>الإجمالي الكلي:</b>
          <b style="color:var(--gold-dark)">${orderData.total.toLocaleString("ar-DZ")} دج</b>
        </div>
        <div style="color:var(--muted);font-size:12px;margin-top:8px">
          العميل: ${esc(orderData.customer)} | الهاتف: ${esc(orderData.phone)}<br>
          العنوان: ${esc(orderData.wilaya)} — ${esc(orderData.commune)}
        </div>
      </div>
    `;
  }

  successModal?.classList.add("show");
  backdrop?.classList.add("show");
  document.body.classList.add("modal-open");
}

export function closeOrderSuccessReceipt() {
  const successModal = document.getElementById("orderSuccessModal");
  const backdrop = document.getElementById("checkoutBackdrop");
  successModal?.classList.remove("show");
  backdrop?.classList.remove("show");
  document.body.classList.remove("modal-open");
}

// Global initialization helper for both index.html & product.html
export function initCartUI() {
  updateBadge();
  renderCartDrawer();
  populateWilayasDropdown();
  setupCartDeliveryListeners();

  // Drawer event bindings
  document.getElementById("cartBtn")?.addEventListener("click", openCartDrawer);
  document.getElementById("cartClose")?.addEventListener("click", closeCartDrawer);
  document.getElementById("backdrop")?.addEventListener("click", () => {
    closeCartDrawer();
  });

  // Checkout modal bindings
  document.getElementById("checkoutBtn")?.addEventListener("click", openCheckoutModal);
  document.getElementById("checkoutClose")?.addEventListener("click", closeCheckoutModal);
  document.getElementById("checkoutBackdrop")?.addEventListener("click", () => {
    closeCheckoutModal();
    closeOrderSuccessReceipt();
  });

  // Checkout form submit
  document.getElementById("checkoutForm")?.addEventListener("submit", handleCheckoutSubmit);

  // Success modal button
  document.getElementById("smContinueBtn")?.addEventListener("click", closeOrderSuccessReceipt);

  // Keyboard Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeCartDrawer();
      closeCheckoutModal();
      closeOrderSuccessReceipt();
    }
  });

  // Expose to window for inline HTML onclick attributes
  window.hadjajCart = {
    get cart() { return cart; },
    getCart: () => cart,
    getCartQty,
    getCartTotal,
    addToCart,
    changeCartQty,
    removeFromCart,
    changeCartItemSize,
    changeCartItemColor,
    clearCart,
    openCartDrawer,
    closeCartDrawer,
    openCheckoutModal,
    closeCheckoutModal,
    resolveColorHex,
    ARABIC_COLOR_MAP
  };

  // Keep legacy global names pointing to unified module
  window.changeCartQty = changeCartQty;
  window.removeFromCart = removeFromCart;
}
