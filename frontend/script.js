/* ==========================================================================
   ClothStore — Customer Storefront Logic
   Live Firestore Product Display + Telegram Order Flow
   ========================================================================== */

import { db } from "../dashboard/firebase-config.js";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const TELEGRAM_BOT_TOKEN = "8916406368:AAFIJTPkAykiL54hn_mmbv6AqGax6lvq08U";
const TELEGRAM_CHAT_ID = "6609345622";

const productsGrid = document.querySelector("#productsGrid");
const filterButtons = document.querySelectorAll(".filter-btn");
const filterLinks = document.querySelectorAll("[data-filter-link]");
const modal = document.querySelector("#productModal");
const modalContent = document.querySelector("#modalContent");
const closeModalButton = document.querySelector(".close-modal");
const toast = document.querySelector("#toast");

let activeFilter = "all";
let currentProduct = null;
let toastTimer = null;
let storeProducts = [];

function getCategoryLabel(category) {
  const labels = {
    shirts: "أقمصة",
    jellabas: "جلابيب",
    shoes: "أحذية",
    underwear: "ملابس داخلية",
    jackets: "جاكيتات",
    hoodies: "هوديات",
    pants: "بناطيل",
    accessories: "إكسسوارات"
  };

  return labels[category] || "منتجات";
}

async function fetchStoreProducts() {
  try {
    const colRef = collection(db, "products");
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    storeProducts = [];

    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      const rawImages = Array.isArray(p.images) ? p.images : [];
      const imageUrls = rawImages.map(img => typeof img === "string" ? img : img.url).filter(Boolean);
      if (imageUrls.length === 0 && p.mainImage) {
        imageUrls.push(p.mainImage);
      }

      storeProducts.push({
        id: docSnap.id,
        name: p.name || "",
        category: p.category || "",
        price: typeof p.price === "number" ? `${p.price} دج` : (p.price ? `${p.price} دج` : "0 دج"),
        description: p.title || p.description || "",
        fullDescription: p.description || p.title || "",
        features: ["قماش عالي الجودة", "تصميم عصري وأنيق", "سعر مميز ومناسب"],
        images: imageUrls
      });
    });
  } catch (error) {
    console.error("Failed to fetch store products from Firestore:", error);
    storeProducts = [];
  }

  renderProducts();
}

function renderProducts() {
  const visibleProducts = storeProducts.filter((product) => {
    return activeFilter === "all" || product.category === activeFilter;
  });

  if (visibleProducts.length === 0) {
    productsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; color: #64748b;">
        <p style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">لا توجد منتجات متوفرة حالياً</p>
        <p style="font-size: 0.9rem;">سيتم إضافة تشكيلات جديدة قريباً.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = visibleProducts
    .map((product) => {
      const fallbackImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
      const imgSrc = (product.images && product.images.length > 0) ? product.images[0] : fallbackImg;
      return `
        <article class="product-card">
          <div class="product-image-wrap">
            <img class="product-image" src="${imgSrc}" alt="${product.name}" loading="lazy">
          </div>
          <div class="product-body">
            <span class="product-category">${getCategoryLabel(product.category)}</span>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <div class="price-row">
              <strong class="price">${product.price}</strong>
              <button class="details-btn" type="button" data-product-id="${product.id}">عرض التفاصيل</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function setActiveFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((item) => {
    item.classList.toggle("active", item.dataset.filter === filter);
  });
  renderProducts();
}

function buildFeatures(product) {
  const features = product.features || ["جودة عالية", "تصميم أنيق", "سعر مناسب"];
  return features.map((feature) => `<li>${feature}</li>`).join("");
}

function openProductModal(product) {
  currentProduct = product;
  const fullDescription = product.fullDescription || product.description;
  const fallbackImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  const displayImages = (product.images && product.images.length > 0) ? product.images : [fallbackImg];

  const thumbsHtml = displayImages.length > 1 ? `
    <div class="thumbs">
      ${displayImages
        .map((image, index) => {
          const activeClass = index === 0 ? " active" : "";
          return `
            <button class="thumb${activeClass}" type="button" data-image="${image}" aria-label="صورة ${index + 1} من ${product.name}">
              <img src="${image}" alt="${product.name} ${index + 1}">
            </button>
          `;
        })
        .join("")}
    </div>
  ` : "";

  modalContent.innerHTML = `
    <div class="product-detail">
      <div class="gallery">
        <div class="gallery-main">
          <img id="mainGalleryImage" src="${displayImages[0]}" alt="${product.name}">
        </div>
        ${thumbsHtml}
      </div>

      <div class="detail-info">
        <span class="product-category">${getCategoryLabel(product.category)}</span>
        <h2 id="modalTitle">${product.name}</h2>
        <strong class="detail-price">${product.price}</strong>
        <p>${fullDescription}</p>
        <ul class="features">${buildFeatures(product)}</ul>
        <button class="primary-btn" type="button" id="showOrderForm">اطلب الآن</button>

        <form class="order-form" id="orderForm">
          <div class="form-grid">
            <div class="field">
              <label for="customerName">الاسم الكامل</label>
              <input id="customerName" name="customerName" type="text" required autocomplete="name">
            </div>
            <div class="field">
              <label for="phone">رقم الهاتف</label>
              <input id="phone" name="phone" type="tel" required autocomplete="tel">
            </div>
            <div class="field">
              <label for="state">الولاية</label>
              <input id="state" name="state" type="text" required>
            </div>
            <div class="field">
              <label for="city">البلدية</label>
              <input id="city" name="city" type="text" required>
            </div>
            <div class="field full">
              <label for="address">العنوان بالتفصيل</label>
              <textarea id="address" name="address" rows="3" required></textarea>
            </div>
            <div class="field full">
              <label for="notes">ملاحظات إضافية (اختياري)</label>
              <textarea id="notes" name="notes" rows="2"></textarea>
            </div>
          </div>
          <button class="primary-btn submit-btn" type="submit">إرسال الطلب</button>
          <p class="form-note" id="formNote" aria-live="polite"></p>
        </form>
      </div>
    </div>
  `;

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeProductModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  currentProduct = null;
}

function showToast() {
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function formatTelegramMessage(product, formValues) {
  return [
    "🛒 طلب جديد من ANIS SHOP",
    "",
    `المنتج: ${product.name}`,
    `القسم: ${getCategoryLabel(product.category)}`,
    `السعر: ${product.price}`,
    "",
    "بيانات الزبون:",
    `الاسم: ${formValues.customerName}`,
    `الهاتف: ${formValues.phone}`,
    `الولاية: ${formValues.state}`,
    `البلدية: ${formValues.city}`,
    `العنوان: ${formValues.address}`,
    `الملاحظات: ${formValues.notes || "لا توجد"}`,
    "",
    `التاريخ: ${new Date().toLocaleString("ar-DZ")}`
  ].join("\n");
}

async function sendOrderToTelegram(product, formData) {
  const formValues = Object.fromEntries(formData.entries());

  if (
    TELEGRAM_BOT_TOKEN === "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE" ||
    TELEGRAM_CHAT_ID === "PUT_YOUR_TELEGRAM_CHAT_ID_HERE"
  ) {
    console.info("Telegram Dev Order:", { product, formValues });
    return;
  }

  const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const text = formatTelegramMessage(product, formValues);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML"
    })
  });

  if (!response.ok) {
    throw new Error("تعذر إرسال الطلب حالياً، يرجى المحاولة بعد قليل.");
  }
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveFilter(button.dataset.filter);
  });
});

filterLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const filter = link.dataset.filterLink;
    setActiveFilter(filter);
    const target = document.querySelector("#products");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  });
});

productsGrid.addEventListener("click", (event) => {
  const detailsButton = event.target.closest("[data-product-id]");
  if (!detailsButton) return;

  const productId = detailsButton.dataset.productId;
  const product = storeProducts.find((item) => String(item.id) === String(productId));
  if (product) {
    openProductModal(product);
  }
});

modalContent.addEventListener("click", (event) => {
  const thumb = event.target.closest(".thumb");
  const orderButton = event.target.closest("#showOrderForm");

  if (thumb) {
    const mainImage = document.querySelector("#mainGalleryImage");
    document.querySelectorAll(".thumb").forEach((item) => item.classList.remove("active"));
    thumb.classList.add("active");
    mainImage.src = thumb.dataset.image;
  }

  if (orderButton) {
    const form = document.querySelector("#orderForm");
    form.classList.add("show");
    form.querySelector("input").focus();
  }
});

modalContent.addEventListener("submit", async (event) => {
  if (event.target.id !== "orderForm") return;
  event.preventDefault();

  const form = event.target;
  const submitButton = form.querySelector(".submit-btn");
  const formNote = form.querySelector("#formNote");
  const formData = new FormData(form);

  submitButton.disabled = true;
  submitButton.textContent = "جاري الإرسال...";
  formNote.textContent = "";

  try {
    await sendOrderToTelegram(currentProduct, formData);
    form.reset();
    form.classList.remove("show");
    closeProductModal();
    showToast();
  } catch (error) {
    formNote.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "إرسال الطلب";
  }
});

closeModalButton.addEventListener("click", closeProductModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeProductModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("show")) {
    closeProductModal();
  }
});

// Initial fetch from Firestore
fetchStoreProducts();
