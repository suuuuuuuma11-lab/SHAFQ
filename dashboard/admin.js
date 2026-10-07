/* ==========================================================================
   ClothStore — Admin Dashboard Logic
   Firebase Firestore + Cloudinary Unsigned Uploads + Firebase Authentication
   Clean, Modular & Production-Ready Vanilla JavaScript
   ========================================================================== */

import { auth, db, uploadImageToCloudinary } from "./firebase-config.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- Configuration ---
const CONFIG = {
  ITEMS_PER_PAGE: 5,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
  ACCEPTED_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  TOAST_DURATION: 3000
};

// --- Application State ---
const state = {
  products: [],
  categories: [],
  currentPage: 1,
  searchQuery: "",
  editingProductId: null,
  deleteProductId: null,
  formImages: [] // Array of { id, url, file, isUploading, error, isMain }
};

// --- DOM References ---
const $ = (id) => document.getElementById(id);

const DOM = {
  // Action bar & Search
  searchInput: $("searchInput"),
  searchClear: $("searchClear"),
  openAddModalBtn: $("openAddModalBtn"),

  // Products & Pagination
  productsContainer: $("productsContainer"),
  paginationContainer: $("paginationContainer"),

  // Product Form Modal
  productFormModal: $("productFormModal"),
  formModalTitle: $("formModalTitle"),
  closeFormModalBtn: $("closeFormModalBtn"),
  cancelFormBtn: $("cancelFormBtn"),
  productForm: $("productForm"),
  saveProductBtn: $("saveProductBtn"),
  saveBtnText: $("saveBtnText"),
  saveBtnLoader: $("saveBtnLoader"),

  // Form Fields
  productName: $("productName"),
  productCategory: $("productCategory"),
  openAddCategoryModalBtn: $("openAddCategoryModalBtn"),
  productPrice: $("productPrice"),
  productTitle: $("productTitle"),
  productDescription: $("productDescription"),

  // Add Category Modal (Nested within Product Form workflow)
  addCategoryModal: $("addCategoryModal"),
  closeCategoryModalBtn: $("closeCategoryModalBtn"),
  cancelCategoryModalBtn: $("cancelCategoryModalBtn"),
  categoryForm: $("categoryForm"),
  newCategoryName: $("newCategoryName"),
  newCategoryNameError: $("newCategoryNameError"),
  saveCategoryBtn: $("saveCategoryBtn"),
  saveCategoryBtnText: $("saveCategoryBtnText"),
  saveCategoryBtnLoader: $("saveCategoryBtnLoader"),

  // Dropzone & Thumbnails
  dropzone: $("dropzone"),
  imageInput: $("imageInput"),
  imagesGrid: $("imagesGrid"),
  addThumbBtn: $("addThumbBtn"),

  // Delete Modal
  deleteModal: $("deleteModal"),
  deleteProductName: $("deleteProductName"),
  closeDeleteModalBtn: $("closeDeleteModalBtn"),
  cancelDeleteBtn: $("cancelDeleteBtn"),
  confirmDeleteBtn: $("confirmDeleteBtn"),
  deleteBtnText: $("deleteBtnText"),
  deleteBtnLoader: $("deleteBtnLoader"),

  // Lightbox & Toast
  imageLightbox: $("imageLightbox"),
  lightboxImage: $("lightboxImage"),
  closeLightbox: $("closeLightbox"),
  toastContainer: $("toastContainer"),

  // Header & Auth
  adminUserEmail: $("adminUserEmail"),
  logoutBtn: $("logoutBtn")
};

// --- Helpers ---
function generateSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "-")
    .replace(/[^\p{L}\p{N}\-]+/gu, "")
    .replace(/^-+|-+$/g, "") || ("cat-" + Date.now().toString(36));
}

// --- Category API Layer (Firestore /categories) ---
const CategoryAPI = {
  async getAll() {
    try {
      const colRef = collection(db, "categories");
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          name: d.name || "",
          slug: d.slug || "",
          image: d.image || "",
          createdAt: d.createdAt || "",
          updatedAt: d.updatedAt || ""
        });
      });
      return list;
    } catch (e) {
      console.warn("Falling back to unordered categories query:", e);
      try {
        const colRef = collection(db, "categories");
        const snapshot = await getDocs(colRef);
        const list = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            name: d.name || "",
            slug: d.slug || "",
            image: d.image || "",
            createdAt: d.createdAt || "",
            updatedAt: d.updatedAt || ""
          });
        });
        return list;
      } catch (err) {
        console.error("Firestore categories getAll error:", err);
        return [];
      }
    }
  },

  async create(name) {
    const colRef = collection(db, "categories");
    const now = new Date().toISOString();
    const slug = generateSlug(name);
    const catData = {
      name: name.trim(),
      slug: slug,
      createdAt: now,
      updatedAt: now
    };
    const docRef = await addDoc(colRef, catData);
    return { id: docRef.id, ...catData };
  }
};

// --- Product API Layer (Firestore /products) ---
const ProductAPI = {
  async getAll() {
    try {
      const colRef = collection(db, "products");
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          name: d.name || "",
          categoryId: d.categoryId || d.category || "",
          category: d.category || "",
          title: d.title || "",
          price: typeof d.price === "number" ? d.price : Number(d.price) || 0,
          description: d.description || "",
          images: Array.isArray(d.images) ? d.images : [],
          mainImage: d.mainImage || (Array.isArray(d.images) && d.images[0] ? (d.images[0].url || d.images[0]) : ""),
          createdAt: d.createdAt || "",
          updatedAt: d.updatedAt || ""
        });
      });
      return list;
    } catch (e) {
      console.error("Firestore getAll error:", e);
      throw e;
    }
  },

  getById(id) {
    return state.products.find((p) => String(p.id) === String(id)) || null;
  },

  async create(data) {
    const colRef = collection(db, "products");
    const now = new Date().toISOString();
    const docData = {
      name: data.name,
      categoryId: data.categoryId, // SOURCE OF TRUTH
      category: data.categoryName || data.category || "",
      title: data.title,
      price: data.price,
      description: data.description || "",
      images: Array.isArray(data.images) ? data.images : [],
      mainImage: data.mainImage || "",
      createdAt: now,
      updatedAt: now
    };
    const docRef = await addDoc(colRef, docData);
    return { id: docRef.id, ...docData };
  },

  async update(id, data) {
    const docRef = doc(db, "products", String(id));
    const now = new Date().toISOString();
    const updateData = {
      name: data.name,
      categoryId: data.categoryId, // SOURCE OF TRUTH
      category: data.categoryName || data.category || "",
      title: data.title,
      price: data.price,
      description: data.description || "",
      images: Array.isArray(data.images) ? data.images : [],
      mainImage: data.mainImage || "",
      updatedAt: now
    };
    await updateDoc(docRef, updateData);
    return { id, ...updateData };
  },

  async delete(id) {
    const docRef = doc(db, "products", String(id));
    await deleteDoc(docRef);
    return true;
  }
};

// --- Utility Functions ---
function escapeHTML(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function getCategoryLabel(productOrCatId) {
  if (!productOrCatId) return "—";
  let catId = "";
  let catNameFallback = "";
  if (typeof productOrCatId === "object") {
    catId = productOrCatId.categoryId || productOrCatId.category || "";
    catNameFallback = productOrCatId.category || "";
  } else {
    catId = String(productOrCatId);
  }

  const match = state.categories.find(c => c.id === catId || c.slug === catId || c.name === catId);
  if (match) return match.name;
  if (catNameFallback) return catNameFallback;
  return catId || "—";
}

function renderCategoryDropdown(selectedCategoryId = "") {
  if (!DOM.productCategory) return;

  const currentVal = selectedCategoryId !== undefined && selectedCategoryId !== "" ? selectedCategoryId : DOM.productCategory.value;

  if (!state.categories || state.categories.length === 0) {
    DOM.productCategory.innerHTML = `
      <option value="">لا توجد تصنيفات — أضف تصنيفًا جديدًا</option>
    `;
    return;
  }

  const optionsHTML = state.categories.map(c => `
    <option value="${escapeHTML(c.id)}" ${c.id === currentVal ? "selected" : ""}>
      ${escapeHTML(c.name)}
    </option>
  `).join("");

  DOM.productCategory.innerHTML = `
    <option value="">اختر التصنيف</option>
    ${optionsHTML}
  `;

  if (currentVal) {
    DOM.productCategory.value = currentVal;
  }
}

function getMainImage(product) {
  if (product.mainImage) return product.mainImage;
  if (!product.images || product.images.length === 0) {
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  }
  const main = product.images.find(img => img.isMain);
  return main ? (main.url || main) : (product.images[0].url || product.images[0]);
}

function ensureMainImage(images) {
  if (images.length > 0 && !images.some(img => img.isMain)) {
    images[0].isMain = true;
  }
  return images;
}

// --- Modal Utilities ---
function openModal(modalElement) {
  if (!modalElement) return;
  modalElement.classList.add("show");
  modalElement.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal(modalElement) {
  if (!modalElement) return;
  modalElement.classList.remove("show");
  modalElement.setAttribute("aria-hidden", "true");

  const anyOpen = document.querySelector(".modal-overlay.show, .lightbox.show");
  if (!anyOpen) {
    document.body.classList.remove("modal-open");
  }
}

function closeAllModals() {
  document.querySelectorAll(".modal-overlay.show, .lightbox.show").forEach(closeModal);
}

// --- Toast System ---
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("removing");
    setTimeout(() => toast.remove(), 250);
  }, CONFIG.TOAST_DURATION);
}

// --- Search & Filtering (Pure Derived) ---
function getFilteredProducts() {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) return state.products;

  return state.products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.title || "").toLowerCase().includes(q) ||
    getCategoryLabel(p).toLowerCase().includes(q)
  );
}

function getCurrentPageSlice(filteredList) {
  const start = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
  return filteredList.slice(start, start + CONFIG.ITEMS_PER_PAGE);
}

// --- Rendering ---
function renderStateMessage(iconSvg, title, desc) {
  DOM.productsContainer.innerHTML = `
    <div class="state-message-box">
      <div class="state-icon">${iconSvg}</div>
      <div class="state-title">${escapeHTML(title)}</div>
      <p class="state-desc">${escapeHTML(desc)}</p>
    </div>
  `;
  DOM.paginationContainer.innerHTML = "";
}

function renderTableRowHTML(p) {
  const mainImg = getMainImage(p);
  return `
    <tr data-id="${escapeHTML(String(p.id))}">
      <td>
        <div class="table-img-box">
          <img src="${escapeHTML(mainImg)}" alt="${escapeHTML(p.name)}" loading="lazy">
        </div>
      </td>
      <td class="td-name">${escapeHTML(p.name)}</td>
      <td class="td-category">${escapeHTML(getCategoryLabel(p))}</td>
      <td class="td-title">${escapeHTML(p.title || "—")}</td>
      <td class="td-price">${p.price} دج</td>
      <td class="td-actions">
        <div class="table-actions-cell">
          <button class="action-btn-edit" type="button" data-action="edit" data-id="${escapeHTML(String(p.id))}" title="تعديل">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn-delete" type="button" data-action="delete" data-id="${escapeHTML(String(p.id))}" title="حذف">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderMobileCardHTML(p) {
  const mainImg = getMainImage(p);
  return `
    <div class="mobile-product-card" data-id="${escapeHTML(String(p.id))}">
      <img class="mobile-card-thumb" src="${escapeHTML(mainImg)}" alt="${escapeHTML(p.name)}">
      <div class="mobile-card-content">
        <div class="mobile-card-row-top">
          <span class="mobile-card-name">${escapeHTML(p.name)}</span>
        </div>
        <div class="mobile-card-meta">${escapeHTML(getCategoryLabel(p))} • ${escapeHTML(p.title || "")}</div>
        <div class="mobile-card-row-bottom">
          <span class="mobile-card-price">${p.price} دج</span>
          <div class="table-actions-cell">
            <button class="action-btn-edit" type="button" data-action="edit" data-id="${escapeHTML(String(p.id))}" title="تعديل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-btn-delete" type="button" data-action="delete" data-id="${escapeHTML(String(p.id))}" title="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProducts() {
  if (state.products.length === 0) {
    renderStateMessage(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
      "لا توجد منتجات حتى الآن",
      "اضغط على زر \"إضافة منتج\" لإضافة أول منتج لمتجرك."
    );
    return;
  }

  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    renderStateMessage(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      "لم يتم العثور على منتجات",
      `لا توجد نتائج مطابقة لبحثك "${state.searchQuery}".`
    );
    return;
  }

  const pageItems = getCurrentPageSlice(filtered);

  const tableHTML = `
    <table class="products-table">
      <thead>
        <tr>
          <th class="th-img">الصورة</th>
          <th class="th-name">اسم المنتج</th>
          <th class="th-category">التصنيف</th>
          <th class="th-title">العنوان</th>
          <th class="th-price">السعر</th>
          <th class="th-actions">الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${pageItems.map(renderTableRowHTML).join("")}
      </tbody>
    </table>
  `;

  const mobileHTML = `
    <div class="mobile-products-grid">
      ${pageItems.map(renderMobileCardHTML).join("")}
    </div>
  `;

  DOM.productsContainer.innerHTML = tableHTML + mobileHTML;
  renderPagination(filtered.length);
}

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE));
  const start = totalItems === 0 ? 0 : (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE + 1;
  const end = Math.min(state.currentPage * CONFIG.ITEMS_PER_PAGE, totalItems);

  let pages = "";
  for (let i = 1; i <= totalPages; i++) {
    pages += `<button class="pg-btn ${i === state.currentPage ? "active" : ""}" type="button" data-page="${i}">${i}</button>`;
  }

  DOM.paginationContainer.innerHTML = `
    <span class="pagination-text">عرض ${start} - ${end} من ${totalItems} منتجات</span>
    <div class="pagination-btns">
      <button class="pg-btn" type="button" data-page="${state.currentPage - 1}" ${state.currentPage <= 1 ? "disabled" : ""} aria-label="السابق">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      ${pages}
      <button class="pg-btn" type="button" data-page="${state.currentPage + 1}" ${state.currentPage >= totalPages ? "disabled" : ""} aria-label="التالي">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
    </div>
  `;
}

// --- Product Form Handling & Validation ---
function clearValidationErrors() {
  DOM.productForm.querySelectorAll(".has-error").forEach(el => el.classList.remove("has-error"));
  DOM.productForm.querySelectorAll(".field-error-msg").forEach(el => el.textContent = "");
  DOM.dropzone.classList.remove("has-error");
  $("imagesError").textContent = "";
}

function resetProductForm() {
  DOM.productForm.reset();
  state.editingProductId = null;
  state.formImages = [];
  clearValidationErrors();
  renderFormImages();
}

function openProductForm(product = null) {
  clearValidationErrors();
  DOM.productForm.reset();

  const selectedCatId = product ? (product.categoryId || product.category || "") : "";
  renderCategoryDropdown(selectedCatId);

  if (product) {
    state.editingProductId = product.id;
    DOM.formModalTitle.textContent = "تعديل المنتج";
    DOM.saveBtnText.textContent = "حفظ التعديلات";

    DOM.productName.value = product.name || "";
    DOM.productCategory.value = selectedCatId;
    DOM.productPrice.value = product.price !== undefined ? product.price : "";
    DOM.productTitle.value = product.title || "";
    DOM.productDescription.value = product.description || "";
    state.formImages = (product.images || []).map(img => ({
      id: img.id || ("img_" + Math.random().toString(36).slice(2, 8)),
      url: typeof img === "string" ? img : img.url,
      isMain: Boolean(img.isMain),
      isUploading: false,
      error: false
    }));
  } else {
    state.editingProductId = null;
    DOM.formModalTitle.textContent = "إضافة منتج";
    DOM.saveBtnText.textContent = "حفظ المنتج";
    DOM.productCategory.value = "";
    state.formImages = [];
  }

  renderFormImages();
  openModal(DOM.productFormModal);
  DOM.productName.focus();
}

function closeProductForm() {
  closeModal(DOM.productFormModal);
  resetProductForm();
}

function validateProductForm() {
  clearValidationErrors();
  let isValid = true;

  const setFieldError = (inputEl, errorId, message) => {
    inputEl?.closest(".form-field-group")?.classList.add("has-error");
    const errSpan = $(errorId);
    if (errSpan) errSpan.textContent = message;
    isValid = false;
  };

  if (!DOM.productName.value.trim()) {
    setFieldError(DOM.productName, "nameError", "اسم المنتج مطلوب");
  }
  if (!DOM.productCategory.value) {
    setFieldError(DOM.productCategory, "categoryError", "يرجى اختيار التصنيف");
  }
  if (!DOM.productTitle.value.trim()) {
    setFieldError(DOM.productTitle, "titleError", "العنوان مطلوب");
  }

  const price = parseInt(DOM.productPrice.value.trim(), 10);
  if (isNaN(price) || price < 0) {
    setFieldError(DOM.productPrice, "priceError", "يرجى إدخال سعر صحيح");
  }

  const validImages = state.formImages.filter(img => !img.error);
  if (validImages.length === 0) {
    DOM.dropzone.classList.add("has-error");
    $("imagesError").textContent = "يرجى إضافة صورة واحدة على الأقل";
    isValid = false;
  }

  return isValid;
}

function collectProductFormData() {
  const cleanImages = state.formImages
    .filter(img => !img.error && !img.isUploading)
    .map(img => ({
      id: img.id,
      url: img.url,
      isMain: Boolean(img.isMain)
    }));

  ensureMainImage(cleanImages);
  const mainImage = cleanImages.find(img => img.isMain)?.url || (cleanImages[0]?.url || "");

  const selectedCatId = DOM.productCategory.value;
  const selectedCat = state.categories.find(c => c.id === selectedCatId);
  const selectedCatName = selectedCat ? selectedCat.name : "";

  return {
    name: DOM.productName.value.trim(),
    categoryId: selectedCatId, // SOURCE OF TRUTH
    categoryName: selectedCatName,
    category: selectedCatName || selectedCatId, // backwards compatibility
    title: DOM.productTitle.value.trim(),
    price: parseInt(DOM.productPrice.value.trim(), 10),
    description: DOM.productDescription.value.trim(),
    images: cleanImages,
    mainImage: mainImage
  };
}

async function saveProduct(e) {
  e.preventDefault();

  if (state.formImages.some(img => img.isUploading)) {
    showToast("جاري رفع الصور إلى السحابة، يرجى الانتظار...", "warning");
    return;
  }

  if (state.formImages.some(img => img.error)) {
    showToast("يرجى إزالة الصور التي تعذر رفعها أو إعادة اختيارها", "warning");
    return;
  }

  if (!validateProductForm()) return;

  DOM.saveProductBtn.disabled = true;
  DOM.saveBtnText.hidden = true;
  DOM.saveBtnLoader.hidden = false;

  const productData = collectProductFormData();
  const isEdit = Boolean(state.editingProductId);

  try {
    if (isEdit) {
      await ProductAPI.update(state.editingProductId, productData);
      showToast("تم تحديث المنتج بنجاح", "success");
    } else {
      await ProductAPI.create(productData);
      showToast("تمت إضافة المنتج بنجاح", "success");
    }
    closeProductForm();
    await loadProducts();
  } catch (error) {
    console.error("Save product error:", error);
    showToast("حدث خطأ أثناء حفظ المنتج في قاعدة البيانات", "error");
  } finally {
    DOM.saveProductBtn.disabled = false;
    DOM.saveBtnText.hidden = false;
    DOM.saveBtnLoader.hidden = true;
  }
}

// --- Category Management (Inside Product Form Workflow) ---
function openCategoryModal() {
  if (DOM.newCategoryName) {
    DOM.newCategoryName.value = "";
    DOM.newCategoryName.closest(".form-field-group")?.classList.remove("has-error");
    if (DOM.newCategoryNameError) DOM.newCategoryNameError.textContent = "";
  }
  openModal(DOM.addCategoryModal);
  setTimeout(() => DOM.newCategoryName?.focus(), 120);
}

function closeCategoryModal() {
  closeModal(DOM.addCategoryModal);
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const name = DOM.newCategoryName ? DOM.newCategoryName.value.trim() : "";

  if (!name) {
    DOM.newCategoryName?.closest(".form-field-group")?.classList.add("has-error");
    if (DOM.newCategoryNameError) DOM.newCategoryNameError.textContent = "يرجى إدخال اسم التصنيف";
    DOM.newCategoryName?.focus();
    return;
  }

  // Check if a category with this name already exists in state.categories
  const existing = state.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    renderCategoryDropdown(existing.id);
    DOM.productCategory.value = existing.id;
    DOM.productCategory.closest(".form-field-group")?.classList.remove("has-error");
    const catErr = $("categoryError");
    if (catErr) catErr.textContent = "";

    closeCategoryModal();
    showToast(`التصنيف "${existing.name}" موجود بالفعل وتم تحديده.`, "info");
    return;
  }

  DOM.saveCategoryBtn.disabled = true;
  DOM.saveCategoryBtnText.hidden = true;
  DOM.saveCategoryBtnLoader.hidden = false;

  try {
    const newCat = await CategoryAPI.create(name);
    state.categories.unshift(newCat);

    // Refresh category dropdown automatically and select newly created category
    renderCategoryDropdown(newCat.id);
    DOM.productCategory.value = newCat.id;

    // Clear any validation error on the product form's category field
    DOM.productCategory.closest(".form-field-group")?.classList.remove("has-error");
    const catErr = $("categoryError");
    if (catErr) catErr.textContent = "";

    // Close category modal smoothly while keeping product form completely intact
    closeCategoryModal();
    showToast(`تم إنشاء التصنيف "${newCat.name}" بنجاح!`, "success");
  } catch (err) {
    console.error("Create category error:", err);
    showToast("حدث خطأ أثناء حفظ التصنيف، يرجى المحاولة مجدداً.", "error");
  } finally {
    DOM.saveCategoryBtn.disabled = false;
    DOM.saveCategoryBtnText.hidden = false;
    DOM.saveCategoryBtnLoader.hidden = true;
  }
}

async function loadCategories() {
  try {
    state.categories = await CategoryAPI.getAll();
    renderCategoryDropdown();
  } catch (err) {
    console.error("Load categories error:", err);
    state.categories = [];
    renderCategoryDropdown();
  }
}

// --- Image Management with Cloudinary Uploads ---
function handleImageFiles(files) {
  Array.from(files).forEach(file => {
    if (!CONFIG.ACCEPTED_TYPES.includes(file.type)) {
      showToast(`نوع الملف غير مدعوم: ${file.name}`, "warning");
      return;
    }
    if (file.size > CONFIG.MAX_IMAGE_SIZE) {
      showToast(`حجم الصورة يتعدى 5MB: ${file.name}`, "warning");
      return;
    }

    const tempId = "img_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const localPreviewUrl = URL.createObjectURL(file);

    const imgObj = {
      id: tempId,
      url: localPreviewUrl,
      file: file,
      isUploading: true,
      error: false,
      isMain: state.formImages.length === 0
    };

    state.formImages.push(imgObj);
    renderFormImages();

    // Trigger direct unsigned upload to Cloudinary
    uploadImageToCloudinary(file)
      .then((secureUrl) => {
        imgObj.url = secureUrl;
        imgObj.isUploading = false;
        imgObj.file = null;
        renderFormImages();
      })
      .catch((err) => {
        console.error("Cloudinary upload error:", err);
        imgObj.isUploading = false;
        imgObj.error = true;
        showToast(`تعذر رفع الصورة "${file.name}": ${err.message}`, "error");
        renderFormImages();
      });
  });

  $("imagesError").textContent = "";
  DOM.dropzone.classList.remove("has-error");
}

function renderFormImages() {
  DOM.imagesGrid.innerHTML = state.formImages.map(img => `
    <div class="thumb-preview-item ${img.isMain ? "is-main" : ""} ${img.isUploading ? "is-uploading" : ""}" data-img-id="${img.id}" title="${img.isMain ? "الصورة الرئيسية" : "اضغط للتعيين كرئيسية"}">
      <img src="${escapeHTML(img.url)}" alt="صورة المعاينة">
      ${img.isUploading ? '<div class="thumb-upload-spinner"></div>' : ""}
      <button class="thumb-delete-badge" type="button" data-del-img="${img.id}" title="حذف الصورة">×</button>
    </div>
  `).join("");
}

function removeImage(imgId) {
  state.formImages = state.formImages.filter(i => i.id !== imgId);
  ensureMainImage(state.formImages);
  renderFormImages();
}

function setMainImage(imgId) {
  state.formImages.forEach(img => {
    img.isMain = img.id === imgId;
  });
  renderFormImages();
}

// --- Delete Flow ---
function openDeleteModal(productId) {
  const product = ProductAPI.getById(productId);
  if (!product) return;

  state.deleteProductId = productId;
  DOM.deleteProductName.textContent = `"${product.name}"`;
  openModal(DOM.deleteModal);
}

function closeDeleteModal() {
  closeModal(DOM.deleteModal);
  state.deleteProductId = null;
}

async function confirmDelete() {
  if (!state.deleteProductId) return;

  DOM.confirmDeleteBtn.disabled = true;
  DOM.deleteBtnText.hidden = true;
  DOM.deleteBtnLoader.hidden = false;

  try {
    await ProductAPI.delete(state.deleteProductId);
    showToast("تم حذف المنتج بنجاح", "success");
    closeDeleteModal();
    await loadProducts();
  } catch (error) {
    console.error("Delete product error:", error);
    showToast("تعذر حذف المنتج من قاعدة البيانات", "error");
  } finally {
    DOM.confirmDeleteBtn.disabled = false;
    DOM.deleteBtnText.hidden = false;
    DOM.deleteBtnLoader.hidden = true;
  }
}

// --- Data Loading & Event Listeners ---
async function loadProducts() {
  try {
    state.products = await ProductAPI.getAll();
    renderProducts();
  } catch (error) {
    console.error("Load products error:", error);
    showToast("تعذر تحميل المنتجات من قاعدة البيانات", "error");
    renderStateMessage(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      "خطأ في الاتصال بقاعدة البيانات",
      "يرجى التحقق من إعدادات Firebase والاتصال بالإنترنت."
    );
  }
}

function initEventListeners() {
  // Add Product modal open
  DOM.openAddModalBtn.addEventListener("click", () => openProductForm(null));

  // Form modal close & cancel
  DOM.closeFormModalBtn.addEventListener("click", closeProductForm);
  DOM.cancelFormBtn.addEventListener("click", closeProductForm);
  DOM.productFormModal.addEventListener("click", (e) => {
    if (e.target === DOM.productFormModal) closeProductForm();
  });

  // Form submit
  DOM.productForm.addEventListener("submit", saveProduct);

  // Search input & clear
  DOM.searchInput.addEventListener("input", () => {
    state.searchQuery = DOM.searchInput.value;
    state.currentPage = 1;
    DOM.searchClear.hidden = !state.searchQuery;
    renderProducts();
  });

  DOM.searchClear.addEventListener("click", () => {
    state.searchQuery = "";
    DOM.searchInput.value = "";
    DOM.searchClear.hidden = true;
    state.currentPage = 1;
    renderProducts();
    DOM.searchInput.focus();
  });

  // Table & mobile card action delegation
  DOM.productsContainer.addEventListener("click", (e) => {
    const imgEl = e.target.closest(".table-img-box img, .mobile-card-thumb");
    if (imgEl) {
      DOM.lightboxImage.src = imgEl.src;
      openModal(DOM.imageLightbox);
      return;
    }

    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const product = ProductAPI.getById(id);
      if (product) openProductForm(product);
      return;
    }

    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
      const id = delBtn.dataset.id;
      openDeleteModal(id);
      return;
    }
  });

  // Lightbox close
  DOM.closeLightbox.addEventListener("click", () => closeModal(DOM.imageLightbox));
  DOM.imageLightbox.addEventListener("click", (e) => {
    if (e.target === DOM.imageLightbox) closeModal(DOM.imageLightbox);
  });

  // Pagination delegation
  DOM.paginationContainer.addEventListener("click", (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (pageBtn && !pageBtn.disabled) {
      const page = parseInt(pageBtn.dataset.page, 10);
      if (page > 0 && page !== state.currentPage) {
        state.currentPage = page;
        renderProducts();
      }
    }
  });

  // Image dropzone & file picker
  DOM.dropzone.addEventListener("click", () => DOM.imageInput.click());
  DOM.addThumbBtn.addEventListener("click", () => DOM.imageInput.click());
  DOM.imageInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFiles(e.target.files);
      DOM.imageInput.value = "";
    }
  });

  // Thumbnail grid delegation
  DOM.imagesGrid.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-del-img]");
    if (delBtn) {
      e.stopPropagation();
      removeImage(delBtn.dataset.delImg);
      return;
    }
    const item = e.target.closest(".thumb-preview-item");
    if (item && item.dataset.imgId) {
      setMainImage(item.dataset.imgId);
    }
  });

  // Delete modal actions
  DOM.confirmDeleteBtn.addEventListener("click", confirmDelete);
  DOM.cancelDeleteBtn.addEventListener("click", closeDeleteModal);
  DOM.closeDeleteModalBtn.addEventListener("click", closeDeleteModal);
  DOM.deleteModal.addEventListener("click", (e) => {
    if (e.target === DOM.deleteModal) closeDeleteModal();
  });

  // Logout button action
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        window.location.replace("login.html");
      } catch (err) {
        console.error("Sign out error:", err);
        showToast("تعذر تسجيل الخروج", "error");
      }
    });
  }

  // Category Modal actions
  DOM.openAddCategoryModalBtn?.addEventListener("click", openCategoryModal);
  DOM.closeCategoryModalBtn?.addEventListener("click", closeCategoryModal);
  DOM.cancelCategoryModalBtn?.addEventListener("click", closeCategoryModal);
  DOM.categoryForm?.addEventListener("submit", handleCreateCategory);
  DOM.addCategoryModal?.addEventListener("click", (e) => {
    if (e.target === DOM.addCategoryModal) closeCategoryModal();
  });

  // Global Escape key handler (handles nested modal cleanly)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (DOM.addCategoryModal?.classList.contains("show")) {
        closeCategoryModal();
        return;
      }
      closeAllModals();
    }
  });
}

// --- Initialization & Auth Guard ---
initEventListeners();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Unauthenticated user -> redirect to login.html
    window.location.replace("login.html");
    return;
  }

  // Authenticated admin user
  if (DOM.adminUserEmail) {
    DOM.adminUserEmail.textContent = user.email || "Admin";
  }
  document.body.classList.remove("auth-loading");
  await loadCategories();
  await loadProducts();
});
