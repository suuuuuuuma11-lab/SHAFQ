/* ==========================================================================
   SHAFQ — Unified Shopping Cart & Cash-on-Delivery Checkout Module
   Manages:
   - Single Shared Storage ("shafq_cart" with one-time legacy migration)
   - Unified SHAFQ Drawer UI (#drawer-cart, #scrim, #btn-cart, #cart-count)
   - Variant Identification (productId + size + color) & Automatic Merge
   - Quantity Controls (qty >= 1) & Item Removal
   - Authoritative Cash-on-Delivery Checkout via /api/order
   ========================================================================== */

// Single canonical storage key across all SHAFQ pages
const CART_STORAGE_KEY = "shafq_cart";
const LEGACY_STORAGE_KEYS = ["hadjaj_cart", "alnoor_cart"];

import {
  setupWilayaCommuneCascade,
  createCheckoutPricingController,
  getSelectedDeliveryMethod,
  validateCodFormFields,
  resolveLocationCodes,
  submitCodOrder
} from "./checkout.js";

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
    let raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) {
      for (const oldKey of LEGACY_STORAGE_KEYS) {
        const legacyRaw = localStorage.getItem(oldKey);
        if (legacyRaw) {
          raw = legacyRaw;
          localStorage.setItem(CART_STORAGE_KEY, legacyRaw);
          break;
        }
      }
      for (const oldKey of LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(oldKey);
      }
    }
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    
    // Normalize existing items to ensure required fields exist
    return parsed.map(item => {
      const pid = item.productId || item.id || "item_" + Math.random().toString(36).slice(2, 7);
      const name = item.name || "SHAFQ Piece";
      const price = typeof item.price === "number" ? item.price : Number(item.price) || 0;
      const qty = Math.max(1, parseInt(item.quantity || item.qty, 10) || 1);
      const size = String(item.size || "");
      const color = String(item.color || "");
      const colorHex = String(item.colorHex || "");
      const image = item.image || item.img || '';
      const availableSizes = Array.isArray(item.availableSizes) ? item.availableSizes : [];
      const availableColors = Array.isArray(item.availableColors) ? item.availableColors : (color ? [{ name: color, value: colorHex || "#1d1a16" }] : []);

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
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
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
  size = "",
  color = "",
  colorHex = "",
  availableSizes = [],
  availableColors = [],
  openDrawer = false
}) {
  const pid = String(productId || "");
  const cleanPrice = typeof price === "number" ? price : Number(price) || 0;
  const cleanQty = Math.max(1, parseInt(quantity, 10) || 1);
  const cleanSize = String(size || "");
  const cleanColor = String(color || "");

  const existingIndex = cart.findIndex(
    item => String(item.productId || item.id) === pid && (item.size || "") === cleanSize && (item.color || "") === cleanColor
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
      name: name || "منتج",
      price: cleanPrice,
      image: image || '',
      quantity: cleanQty,
      size: cleanSize,
      color: cleanColor,
      colorHex: colorHex || "",
      availableSizes: Array.isArray(availableSizes) ? availableSizes : [],
      availableColors: Array.isArray(availableColors) ? availableColors : (cleanColor ? [{ name: cleanColor, value: colorHex || "#1d1a16" }] : [])
    });
  }

  saveCart();
  renderCartDrawer();
  if (openDrawer) {
    openCartDrawer();
  }
  toast(`Added "${name}" to bag`);
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
    toast("Minimum quantity is 1");
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
    toast("Removed from bag");
  }
}

function mergeVariantQuantity(sourceItem, targetItem, toastLabel) {
  const targetQty = Math.max(1, parseInt(targetItem.quantity, 10) || 1);
  const sourceQty = Math.max(1, parseInt(sourceItem.quantity, 10) || 1);
  const mergedQty = targetQty + sourceQty;
  targetItem.quantity = mergedQty;
  cart = cart.filter(c => c !== sourceItem);
  toast(`${toastLabel} (${mergedQty})`);
}

/**
 * Change size of an item in the cart.
 * If the change results in matching an existing item -> merge quantity!
 */
export function changeCartItemSize(key, newSize) {
  const item = cart.find(c => cartKey(c) === key);
  if (!item || item.size === newSize) return;

  const duplicate = cart.find(
    c => c !== item && String(c.productId || c.id) === String(item.productId || item.id) && c.color === item.color && c.size === newSize
  );

  if (duplicate) {
    mergeVariantQuantity(item, duplicate, "Updated size and merged quantity");
  } else {
    item.size = newSize;
    toast(`Updated size to ${newSize}`);
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

  const duplicate = cart.find(
    c => c !== item && String(c.productId || c.id) === String(item.productId || item.id) && c.size === item.size && c.color === newColorName
  );

  if (duplicate) {
    mergeVariantQuantity(item, duplicate, "Updated color and merged quantity");
  } else {
    item.color = newColorName;
    item.colorHex = newHex;
    toast(`Updated color to ${newColorName}`);
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

// --- Shared Checkout Modal & Toast Injector (available on every page) ---
function ensureCheckoutModals() {
  if (!document.getElementById("toast")) {
    const toastEl = document.createElement("div");
    toastEl.className = "p-toast";
    toastEl.id = "toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }

  if (!document.getElementById("checkoutModal")) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="p-modal-backdrop" id="checkoutBackdrop"></div>
      <div class="p-modal" id="checkoutModal" role="dialog" aria-modal="true" aria-labelledby="checkoutModalTitle">
        <div class="p-modal__head">
          <h2 id="checkoutModalTitle">Checkout — Cash on Delivery</h2>
          <button type="button" class="tool" id="checkoutClose" aria-label="Close">
            <svg class="ico"><use href="#i-close" /></svg>
          </button>
        </div>
        <div class="p-modal__body">
          <div class="cm-review-box">
            <div class="cm-review-title">Order Summary (<span id="cmItemCount">0</span>)</div>
            <div class="cm-items-list" id="cmItemsList"></div>
            <div class="cm-summary-row">
              <span>Total</span>
              <strong class="cm-total" id="cmTotalAmount">0 DA</strong>
            </div>
            <p class="cm-note">Cash on Delivery across Algeria after inspection.</p>
          </div>
          <form id="checkoutForm" novalidate>
            <div class="p-field" id="cmFName">
              <label for="cmName">Full Name <em>*</em></label>
              <input type="text" id="cmName" placeholder="e.g. Mohamed Benali" autocomplete="name" required>
              <div class="err">Please enter your full name (at least 3 characters).</div>
            </div>
            <div class="p-field" id="cmFPhone">
              <label for="cmPhone">Phone Number <em>*</em></label>
              <input type="tel" id="cmPhone" placeholder="e.g. 0551234567" autocomplete="tel" maxlength="10" inputmode="numeric" required>
              <div class="err">Please enter a valid 10-digit Algerian number (starting with 05, 06, or 07).</div>
            </div>
            <div class="two-col">
              <div class="p-field" id="cmFWilaya">
                <label for="cmWilaya">Wilaya <em>*</em></label>
                <select id="cmWilaya" required dir="auto"><option value="">— Select Wilaya —</option></select>
                <div class="err">Please select a wilaya.</div>
              </div>
              <div class="p-field" id="cmFCommune">
                <label for="cmCommune">Commune <em>*</em></label>
                <select id="cmCommune" disabled required dir="auto"><option value="">— Select Wilaya First —</option></select>
                <div class="err">Please select a commune.</div>
              </div>
            </div>
            <div class="p-field">
              <label for="cmAddress">Street Address (Optional)</label>
              <input type="text" id="cmAddress" placeholder="Neighborhood, street, building..." dir="auto">
            </div>
            <div class="delivery-group" id="cmFDeliveryMethod">
              <span class="delivery-group-label">Delivery Method <em>*</em></span>
              <div class="delivery-options-grid">
                <label class="delivery-option-card active" id="cmCardHome">
                  <input type="radio" name="cmDeliveryMethod" value="home" checked>
                  <div class="doc-info"><span class="doc-name">Home Delivery</span></div>
                  <div class="doc-price" id="cmHomePriceDisplay">&mdash;</div>
                </label>
                <label class="delivery-option-card" id="cmCardStopDesk">
                  <input type="radio" name="cmDeliveryMethod" value="stopDesk">
                  <div class="doc-info"><span class="doc-name">Stop Desk Pickup</span></div>
                  <div class="doc-price" id="cmStopDeskPriceDisplay">&mdash;</div>
                </label>
              </div>
            </div>
            <div class="order-price-summary" id="cmPriceSummary">
              <div class="ops-row"><span>Items Subtotal</span><span id="cmOpsSubtotal">0 DA</span></div>
              <div class="ops-row"><span>Shipping (<span id="cmOpsMethodLabel">Home Delivery</span>)</span><span id="cmOpsShipping">Select wilaya</span></div>
              <div class="ops-row ops-row--total"><span>Total</span><strong id="cmOpsTotal">0 DA</strong></div>
            </div>
            <button type="submit" class="btn-order" id="cmSubmitBtn">Confirm Order — Cash on Delivery</button>
            <p class="p-secure">Pay only upon receiving and inspecting your order.</p>
          </form>
        </div>
      </div>
      <div class="p-success-modal" id="orderSuccessModal" role="dialog" aria-modal="true">
        <div class="sm-card">
          <div class="p-success__mark" aria-hidden="true">&#10003;</div>
          <h2 class="p-success__title">Order Confirmed</h2>
          <p class="p-success__sub">Thank you for shopping with SHAFQ. We will contact you shortly by phone to confirm delivery. Payment is cash on delivery.</p>
          <div class="p-summary" id="smOrderSummary"></div>
          <button type="button" class="btn-order" id="smContinueBtn">Continue Shopping</button>
        </div>
      </div>
    `;
    while (wrapper.firstElementChild) {
      document.body.appendChild(wrapper.firstElementChild);
    }
  }
}

// --- Unified Cart Drawer Rendering (#drawer-cart, #cart-count, #scrim) ---

export function updateBadge() {
  const badgeEl = document.getElementById("cart-count");
  const qty = getCartQty();
  if (badgeEl) {
    badgeEl.textContent = qty;
    badgeEl.hidden = qty <= 0;
  }
}

export function openCartDrawer() {
  const drawer = document.getElementById("drawer-cart");
  const scrim = document.getElementById("scrim");
  if (window.SHAFQ && window.SHAFQ.closeAll) {
    window.SHAFQ.closeAll();
  }
  renderCartDrawer();
  if (drawer) {
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
  }
  if (scrim) scrim.hidden = false;
}

export function closeCartDrawer() {
  if (window.SHAFQ && window.SHAFQ.closeAll) {
    window.SHAFQ.closeAll();
    return;
  }
  const drawer = document.getElementById("drawer-cart");
  const scrim = document.getElementById("scrim");
  if (drawer) {
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
  }
  if (scrim) scrim.hidden = true;
}

export function renderCartDrawer() {
  const body = document.getElementById("drawer-cart-body");
  const foot = document.getElementById("drawer-cart-foot");
  const totalEl = document.getElementById("drawer-cart-total");

  if (!body) return;

  if (cart.length === 0) {
    body.innerHTML = `<p class="drawer__empty">Your bag is empty.</p>`;
    if (foot) foot.hidden = true;
    if (totalEl) totalEl.textContent = "0 DA";
    return;
  }

  if (foot) foot.hidden = false;

  body.innerHTML = cart.map(item => {
    const k = cartKey(item);
    const itemTotal = (item.price * item.quantity).toLocaleString("en-US");
    const sizes = Array.isArray(item.availableSizes) ? item.availableSizes : [];
    const colors = Array.isArray(item.availableColors) ? item.availableColors : [];
    const hasSizes = sizes.length > 0;
    const hasColors = colors.length > 0;

    let sizeOptionsHTML = "";
    if (hasSizes) {
      sizeOptionsHTML = `
        <div class="drawer__opt">
          <label>Size:</label>
          <select class="drawer__select" data-cart-action="size" data-cart-key="${esc(k)}" dir="auto">
            ${sizes.map(s => `<option value="${esc(s)}" ${s === item.size ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
        </div>
      `;
    }

    let colorOptionsHTML = "";
    if (hasColors) {
      colorOptionsHTML = `
        <div class="drawer__opt">
          <label>Color:</label>
          <select class="drawer__select" data-cart-action="color" data-cart-key="${esc(k)}" dir="auto">
            ${colors.map(c => {
              const cName = typeof c === "object" ? c.name : c;
              return `<option value="${esc(cName)}" ${cName === item.color ? "selected" : ""}>${esc(cName)}</option>`;
            }).join("")}
          </select>
        </div>
      `;
    }

    const optionsContainerHTML = (hasSizes || hasColors)
      ? `<div class="drawer__item-opts">${sizeOptionsHTML}${colorOptionsHTML}</div>`
      : "";

    return `
      <div class="drawer__item" data-key="${esc(k)}">
        <img class="drawer__item-img" src="${esc(item.image)}" alt="${esc(item.name)}" onerror="this.style.opacity='0'">
        <div class="drawer__item-info">
          <div class="drawer__item-name" dir="auto">${esc(item.name)}</div>
          ${optionsContainerHTML}
          <div class="drawer__item-row">
            <div class="drawer__qty">
              <button type="button" data-cart-action="qty-dec" data-cart-key="${esc(k)}" aria-label="Decrease" ${item.quantity <= 1 ? "disabled" : ""}>&minus;</button>
              <span>${item.quantity}</span>
              <button type="button" data-cart-action="qty-inc" data-cart-key="${esc(k)}" aria-label="Increase">+</button>
            </div>
            <span class="drawer__item-price">${itemTotal} DA</span>
          </div>
          <button type="button" class="drawer__remove" data-cart-action="remove" data-cart-key="${esc(k)}">Remove</button>
        </div>
      </div>`;
  }).join("");

  if (totalEl) {
    totalEl.textContent = getCartTotal().toLocaleString("en-US") + " DA";
  }
}

// --- Universal Checkout Modal ---

function syncCheckoutModalIfOpen() {
  const modal = document.getElementById("checkoutModal");
  if (modal && modal.classList.contains("show")) {
    if (cart.length === 0) {
      closeCheckoutModal();
      toast("Your bag is empty");
    } else {
      renderCheckoutModalReview();
    }
  }
}

export function openCheckoutModal() {
  if (cart.length === 0) {
    toast("Your bag is empty — choose a piece first", false);
    return;
  }

  ensureCheckoutModals();
  bindCheckoutModalControls();
  closeCartDrawer();
  const modal = document.getElementById("checkoutModal");
  const backdrop = document.getElementById("checkoutBackdrop");

  renderCheckoutModalReview();
  cartPricingController.activate();
  cartPricingController.bindListeners();
  updateCartCheckoutPricing();
  populateWilayasDropdown().then(() => updateCartCheckoutPricing());

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

  if (countEl) countEl.textContent = `${count} ${count > 1 ? "pieces" : "piece"}`;
  if (totalEl) totalEl.textContent = total.toLocaleString("en-US") + " DA";
  if (btnEl) btnEl.textContent = `Confirm Order — Cash on Delivery (${total.toLocaleString("en-US")} DA)`;

  if (listEl) {
    listEl.innerHTML = cart.map(item => `
      <div class="cm-review-item">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" onerror="this.style.opacity='0'">
        <div class="cm-review-info">
          <div class="cm-review-name" dir="auto">${esc(item.name)}</div>
          ${(() => {
            const metaParts = [];
            if (item.size) metaParts.push('Size: <b dir="auto">' + esc(item.size) + '</b>');
            if (item.color) metaParts.push('Color: <b dir="auto">' + esc(item.color) + '</b>');
            return metaParts.length ? '<div class="cm-review-meta">' + metaParts.join(' — ') + '</div>' : '';
          })()}
        </div>
        <div class="cm-review-calc">
          <div>${item.quantity} × ${item.price.toLocaleString("en-US")} DA</div>
          <b>${(item.price * item.quantity).toLocaleString("en-US")} DA</b>
        </div>
      </div>
    `).join("");
  }
}

const cartPricingController = createCheckoutPricingController({
  wilayaSelectId: "cmWilaya",
  radioName: "cmDeliveryMethod",
  cardHomeId: "cmCardHome",
  cardStopDeskId: "cmCardStopDesk",
  homePriceId: "cmHomePriceDisplay",
  stopDeskPriceId: "cmStopDeskPriceDisplay",
  opsSubtotalId: "cmOpsSubtotal",
  opsShippingId: "cmOpsShipping",
  opsMethodLabelId: "cmOpsMethodLabel",
  opsTotalId: "cmOpsTotal",
  mirrorTotalId: "cmTotalAmount",
  getSubtotal: getCartTotal
});

export function getCartSelectedDeliveryMethod() {
  return getSelectedDeliveryMethod("cmDeliveryMethod");
}

export function updateCartCheckoutPricing() {
  cartPricingController.update();
}

function populateWilayasDropdown() {
  const wEl = document.getElementById("cmWilaya");
  if (wEl && wEl.options.length <= 1) {
    return setupWilayaCommuneCascade({
      wilayaSelectId: "cmWilaya",
      communeSelectId: "cmCommune",
      wilayaFieldId: "cmFWilaya",
      communeFieldId: "cmFCommune"
    });
  }
  return Promise.resolve(null);
}

// Handle Checkout Form Submission (Strictly routed through authoritative /api/order)
export async function handleCheckoutSubmit(e) {
  e.preventDefault();
  if (cart.length === 0) {
    toast("Your bag is empty", false);
    return;
  }

  const submitBtn = document.getElementById("cmSubmitBtn");
  const { valid, customer, phone, wilaya, commune, address } = validateCodFormFields({
    nameInputId: "cmName",
    phoneInputId: "cmPhone",
    wilayaSelectId: "cmWilaya",
    communeSelectId: "cmCommune",
    addressInputId: "cmAddress",
    nameFieldId: "cmFName",
    phoneFieldId: "cmFPhone",
    wilayaFieldId: "cmFWilaya",
    communeFieldId: "cmFCommune"
  });

  if (!valid) return;

  const originalBtnText = submitBtn ? submitBtn.textContent : "Confirm Order — Cash on Delivery";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Placing order...";
  }

  const deliveryMethod = getCartSelectedDeliveryMethod();
  const { canonicalWilaya, wilayaCode, communeCode } = await resolveLocationCodes(wilaya, commune);

  const orderItems = cart.map(i => ({
    productId: i.productId,
    name: i.name,
    quantity: i.quantity,
    size: i.size,
    color: i.color,
    colorHex: i.colorHex || "#1d1a16",
    image: i.image || ""
  }));

  try {
    const result = await submitCodOrder({
      customer,
      phone,
      wilaya: canonicalWilaya,
      wilayaCode,
      commune,
      communeCode,
      address,
      deliveryMethod,
      items: orderItems
    });

    if (!result.ok) {
      toast(result.error, false);
      return;
    }

    // Clear Cart
    clearCart();

    // Close Checkout Modal
    closeCheckoutModal();

    // Show Success Screen with authoritative server-computed totals
    showOrderSuccessReceipt(result.orderId, result.order);
  } catch (err) {
    console.error("Order submission exception:", err);
    toast("Order service is currently unreachable. Please try again.", false);
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
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed rgba(29,25,22,0.16);font-size:13.5px">
        <span dir="auto">${esc(it.name)} (${esc(it.size)}${it.size && it.color ? " / " : ""}${esc(it.color)}) × ${it.quantity}</span>
        <b>${(it.price * it.quantity).toLocaleString("en-US")} DA</b>
      </div>
    `).join("");

    summaryEl.innerHTML = `
      <div style="font-size:14px;line-height:1.8">
        <div style="margin-bottom:8px">Order ID: <b>#${esc(orderId.slice(-6).toUpperCase())}</b></div>
        <div style="margin-bottom:8px">${itemsListHTML}</div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13.5px;opacity:0.78">
          <span>Delivery Method:</span>
          <b>${orderData.deliveryMethod === "stopDesk" ? "Stop Desk Pickup" : "Home Delivery"}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13.5px;opacity:0.78">
          <span>Shipping:</span>
          <b>${(orderData.shippingPrice || 0).toLocaleString("en-US")} DA</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:16px;margin:8px 0;padding-top:6px;border-top:1px solid rgba(29,25,22,0.2)">
          <b>Total:</b>
          <b>${orderData.total.toLocaleString("en-US")} DA</b>
        </div>
        <div style="opacity:0.78;font-size:13px;margin-top:8px" dir="auto">
          Customer: ${esc(orderData.customer)} | Phone: ${esc(orderData.phone)}<br>
          Location: ${esc(orderData.wilaya)} — ${esc(orderData.commune)}
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

function bindDrawerActions() {
  const body = document.getElementById("drawer-cart-body");
  if (body && !body.dataset.shafqBound) {
    body.dataset.shafqBound = "1";
    body.addEventListener("click", e => {
      const btn = e.target?.closest?.("[data-cart-action]");
      if (!btn) return;
      const action = btn.dataset.cartAction;
      const key = btn.dataset.cartKey;
      if (!key) return;
      if (action === "qty-dec") changeCartQty(key, -1);
      else if (action === "qty-inc") changeCartQty(key, 1);
      else if (action === "remove") removeFromCart(key);
    });
    body.addEventListener("change", e => {
      const sel = e.target?.closest?.("select[data-cart-action]");
      if (!sel) return;
      const action = sel.dataset.cartAction;
      const key = sel.dataset.cartKey;
      if (!key) return;
      if (action === "size") changeCartItemSize(key, sel.value);
      else if (action === "color") changeCartItemColor(key, sel.value);
    });
  }

  const checkoutBtn = document.getElementById("drawer-checkout-btn");
  if (checkoutBtn && !checkoutBtn.dataset.shafqBound) {
    checkoutBtn.dataset.shafqBound = "1";
    checkoutBtn.addEventListener("click", openCheckoutModal);
  }
}

function bindCheckoutModalControls() {
  const closeBtn = document.getElementById("checkoutClose");
  if (closeBtn && !closeBtn.dataset.shafqBound) {
    closeBtn.dataset.shafqBound = "1";
    closeBtn.addEventListener("click", closeCheckoutModal);
  }
  const backdrop = document.getElementById("checkoutBackdrop");
  if (backdrop && !backdrop.dataset.shafqBound) {
    backdrop.dataset.shafqBound = "1";
    backdrop.addEventListener("click", () => {
      closeCheckoutModal();
      closeOrderSuccessReceipt();
    });
  }
  const form = document.getElementById("checkoutForm");
  if (form && !form.dataset.shafqBound) {
    form.dataset.shafqBound = "1";
    form.addEventListener("submit", handleCheckoutSubmit);
  }
  const contBtn = document.getElementById("smContinueBtn");
  if (contBtn && !contBtn.dataset.shafqBound) {
    contBtn.dataset.shafqBound = "1";
    contBtn.addEventListener("click", closeOrderSuccessReceipt);
  }
}

// Unified initialization helper for all SHAFQ pages (and View Transitions)
export function initCartUI() {
  ensureCheckoutModals();
  updateBadge();
  renderCartDrawer();
  bindDrawerActions();
  bindCheckoutModalControls();

  // Escape closes checkout modals (drawer Escape is handled once in main.js)
  if (!document._shafqCheckoutKeyBound) {
    document._shafqCheckoutKeyBound = true;
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeCheckoutModal();
        closeOrderSuccessReceipt();
      }
    });
  }

  // Keep storage synced across tabs
  if (!window._shafqCartStorageBound) {
    window._shafqCartStorageBound = true;
    window.addEventListener("storage", e => {
      if (e.key === CART_STORAGE_KEY) {
        cart = loadCartFromStorage();
        updateBadge();
        renderCartDrawer();
        syncCheckoutModalIfOpen();
      }
    });
  }

  // Single canonical global controller across the entire site
  window.shafqCart = {
    init: initCartUI,
    render: renderCartDrawer,
    updateBadge,
    open: openCartDrawer,
    close: closeCartDrawer,
    get cart() { return cart; },
    getCart: () => cart,
    getCartQty,
    getCartTotal,
    addItem: addToCart,
    addToCart,
    changeCartQty,
    removeFromCart,
    changeCartItemSize,
    changeCartItemColor,
    clearCart,
    openCheckoutModal,
    closeCheckoutModal,
    resolveColorHex,
    ARABIC_COLOR_MAP
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCartUI, { once: true });
  } else {
    initCartUI();
  }
}
