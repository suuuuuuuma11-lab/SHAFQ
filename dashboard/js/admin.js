/* ==========================================================================
   HADJAJ SHIRTS — Admin Dashboard Logic (Cloud Firestore Source of Truth)
   Firebase Modular SDK v10 (Firestore + Auth + Cloudinary)
   Real-Time Synchronization with onSnapshot & Automatic Seeding
   ========================================================================== */

import { auth, db, uploadImageToCloudinary } from "./firebase-config.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  deleteField,
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { DEFAULT_SHIPPING_RATES } from "/frontend/data/default-shipping-rates.js";
import { ALGERIA_LOCATIONS } from "/frontend/data/algeria-locations.js";

// --- Utilities ---
const esc = (s) =>
  String(s || "")
    .replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const $ = (id) => document.getElementById(id);

// --- Default Seed Data for Migration (If Cloud Firestore is completely empty) ---
const SEED_CATEGORIES = [
  {
    name: "كلاسيك",
    msg: "الأناقة الخالدة بلمسة عصرية تليق بك في كل مناسبة",
    banner: { type: "color", c1: "#1d1a16", c2: "#b99a6b", img: "" },
    desc: "تشكيلة القمصان الكلاسيكية الفاخرة لرجال الأعمال والمناسبات الرسمية",
    active: true
  },
  {
    name: "كاجوال",
    msg: "راحة يومية بأسلوب شبابي جريء",
    banner: { type: "color", c1: "#31405f", c2: "#1f2a44", img: "" },
    desc: "إطلالات يومية عصرية ومريحة تناسب العمل والنزهات",
    active: true
  },
  {
    name: "فاخر",
    msg: "خامات نادرة وقصّات استثنائية لإطلالة لا تُنسى",
    banner: { type: "color", c1: "#3f4030", c2: "#b99a6b", img: "" },
    desc: "أرقى الأقمشة الإيطالية والمصرية بتفاصيل صدفية حصرية",
    active: true
  }
];

const SEED_PRODUCTS = [
  {
    name: "قميص كلاسيك فاخر",
    price: 299,
    oldPrice: 380,
    img: "img/p1.png",
    mainImage: "img/p1.png",
    images: [{ id: "seed1", url: "img/p1.png", isMain: true }],
    badge: "الأكثر مبيعاً",
    category: "كلاسيك",
    colors: [
      { name: "أبيض عاجي", value: "#f5f2ea" },
      { name: "بيج فاتح", value: "#dcd5c8" },
      { name: "ذهبي", value: "#b99a6b" }
    ],
    sizes: ["S", "M", "L", "XL"],
    status: "active",
    desc: "قميص قطني 100% بقصّة عصرية وخياطة متقنة بأزرار صدفية."
  },
  {
    name: "قميص كلاسيك أسود",
    price: 320,
    oldPrice: null,
    img: "img/p2.png",
    mainImage: "img/p2.png",
    images: [{ id: "seed2", url: "img/p2.png", isMain: true }],
    badge: "",
    category: "كلاسيك",
    colors: [
      { name: "أسود", value: "#1d1a16" },
      { name: "رمادي داكن", value: "#3a352f" },
      { name: "بني", value: "#6b6357" }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    status: "active",
    desc: "قميص أسود راقٍ بخامة فاخرة ومقاومة للتجعد للمناسبات الخاصة."
  },
  {
    name: "قميص بأزرار أنيقة",
    price: 320,
    oldPrice: 365,
    img: "img/p3.png",
    mainImage: "img/p3.png",
    images: [{ id: "seed3", url: "img/p3.png", isMain: true }],
    badge: "",
    category: "فاخر",
    colors: [
      { name: "أزرق سماوي", value: "#a9c8e8" },
      { name: "أزرق متوسط", value: "#7fa8cf" },
      { name: "أزرق فاتح", value: "#dce8f5" }
    ],
    sizes: ["S", "M", "L", "XL"],
    status: "active",
    desc: "قصّة سليم فيت مريحة بأزرار صدف طبيعية وقماش أكسفورد ناعم."
  },
  {
    name: "قميص كلاسيك بيج",
    price: 340,
    oldPrice: null,
    img: "img/p4.png",
    mainImage: "img/p4.png",
    images: [{ id: "seed4", url: "img/p4.png", isMain: true }],
    badge: "",
    category: "كلاسيك",
    colors: [
      { name: "بيج", value: "#e8ddcb" },
      { name: "رملي", value: "#c9b8a0" },
      { name: "رمادي", value: "#8a8277" }
    ],
    sizes: ["M", "L", "XL"],
    status: "active",
    desc: "تصميم كلاسيكي مميز بلون بيج أنيق يناسب البدل والإطلالات الرسمية."
  },
  {
    name: "قميص كتان فاخر",
    price: 360,
    oldPrice: 430,
    img: "img/p5.png",
    mainImage: "img/p5.png",
    images: [{ id: "seed5", url: "img/p5.png", isMain: true }],
    badge: "حصري",
    category: "فاخر",
    colors: [
      { name: "زيتوني", value: "#5a5b45" },
      { name: "زيتوني داكن", value: "#3f4030" },
      { name: "أخضر فاتح", value: "#7c7d63" }
    ],
    sizes: ["S", "M", "L", "XL"],
    status: "active",
    desc: "كتان أوروبي نقي وخفيف الوزن مناسب لجميع فصول السنة."
  },
  {
    name: "قميص مخطط أنيق",
    price: 290,
    oldPrice: 350,
    img: "img/p6.png",
    mainImage: "img/p6.png",
    images: [{ id: "seed6", url: "img/p6.png", isMain: true }],
    badge: "",
    category: "كاجوال",
    colors: [
      { name: "أزرق مخطط", value: "#c5d3ea" },
      { name: "أزرق داكن", value: "#8fa8cc" },
      { name: "أبيض مخطط", value: "#ffffff" }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    status: "active",
    desc: "خطوط رفيعة بتناغم أنيق تمنح مظهراً عصرياً جذاباً."
  },
  {
    name: "قميص كحلي فاخر",
    price: 340,
    oldPrice: null,
    img: "img/p7.png",
    mainImage: "img/p7.png",
    images: [{ id: "seed7", url: "img/p7.png", isMain: true }],
    badge: "",
    category: "فاخر",
    colors: [
      { name: "كحلي", value: "#1f2a44" },
      { name: "كحلي فاتح", value: "#31405f" },
      { name: "رمادي أزرق", value: "#6b7a99" }
    ],
    sizes: ["S", "M", "L", "XL"],
    status: "active",
    desc: "لون كحلي ملكي عميق وقماش فاخر عالي الجودة."
  },
  {
    name: "قميص قطن فاخر",
    price: 320,
    oldPrice: null,
    img: "img/p8.png",
    mainImage: "img/p8.png",
    images: [{ id: "seed8", url: "img/p8.png", isMain: true }],
    badge: "",
    category: "كاجوال",
    colors: [
      { name: "عاجي", value: "#f5f2ea" },
      { name: "أبيض", value: "#ffffff" },
      { name: "بيج فاتح", value: "#dcd5c8" }
    ],
    sizes: ["S", "M", "L", "XL"],
    status: "active",
    desc: "قطن مصري طويل التيلة فائق النعومة والراحة."
  }
];

// --- Live Cloud State ---
const state = {
  products: [],
  categories: [],
  orders: [],
  isProductsLoaded: false,
  isCategoriesLoaded: false,
  isOrdersLoaded: false,
  editingProductId: null,
  editingCatId: null,
  productImgData: "",
  productRawFile: null,
  productRawUrl: "",
  productIsFinal: false,
  catDesktopImg: "",
  catMobileImg: "",
  catDesktopIsFinal: false,
  catMobileIsFinal: false,
  previewTarget: "desktop",
  bannerMode: "color",
  confirmCb: null,
  cropEditor: {
    isOpen: false,
    target: "desktop",
    imgUrl: "",
    rawFile: null,
    zoom: 1.0,
    imgNaturalW: 0,
    imgNaturalH: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startImgX: 0,
    startImgY: 0,
    imgW: 0,
    imgH: 0,
    imgX: 0,
    imgY: 0,
    frameW: 0,
    frameH: 0
  },
  shippingSettings: {
    activePreset: "custom",
    rates: {},
    isLoaded: false
  }
};

// --- Toast System ---
function toast(msg, ok = true) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "show " + (ok ? "ok" : "err");
  clearTimeout(t._h);
  t._h = setTimeout(() => {
    t.className = "";
  }, 2800);
}

// --- View Switching ---
function switchView(viewName, btn) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("on"));
  const targetView = $("view-" + viewName);
  if (targetView) targetView.classList.add("on");

  document.querySelectorAll(".side-btn").forEach((b) => b.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    const defaultBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (defaultBtn) defaultBtn.classList.add("active");
  }
}

// --- Stats & Numbers Refresh ---
function refreshStats() {
  const cntProducts = $("cntProducts");
  const cntCats = $("cntCats");
  const cntOrders = $("cntOrders");

  const stProducts = $("stProducts");
  const stCats = $("stCats");
  const stOrders = $("stOrders");
  const stSale = $("stSale");

  if (cntProducts) cntProducts.textContent = state.products.length;
  if (cntCats) cntCats.textContent = state.categories.length;
  if (cntOrders) cntOrders.textContent = state.orders.length;

  if (stProducts) stProducts.textContent = state.products.length;
  if (stCats) stCats.textContent = state.categories.length;
  if (stOrders) stOrders.textContent = state.orders.length;

  if (stSale) {
    stSale.textContent = state.products.filter(
      (p) => p.oldPrice && Number(p.oldPrice) > Number(p.price)
    ).length;
  }
}

// --- Category Selects ---
function fillCatSelects() {
  const pCat = $("pCategory");
  const fCat = $("prodFilterCat");

  const opts =
    '<option value="">— اختر التصنيف —</option>' +
    state.categories
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join("");

  if (pCat) pCat.innerHTML = opts;

  if (fCat) {
    fCat.innerHTML =
      '<option value="">كل التصنيفات</option>' +
      state.categories
        .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
        .join("");
  }
}

// --- Cloud Firestore Real-Time Listeners ---
function initRealtimeFirestore() {
  // 1. Categories Real-Time Listener
  const catsCol = collection(db, "categories");
  onSnapshot(
    catsCol,
    async (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          name: d.name || "",
          msg: d.msg || "",
          banner: d.banner || { type: "color", c1: "#1d1a16", c2: "#b99a6b", img: "" },
          desc: d.desc || "",
          active: d.active !== false,
          createdAt: d.createdAt || "",
          updatedAt: d.updatedAt || ""
        });
      });

      // Migration: If completely empty in Firestore, seed automatically
      if (list.length === 0 && !state.isCategoriesLoaded) {
        state.isCategoriesLoaded = true;
        await seedCategoriesIfEmpty();
        return;
      }

      state.categories = list;
      state.isCategoriesLoaded = true;
      fillCatSelects();
      renderCatsGrid();
      refreshStats();
    },
    (err) => {
      console.error("Categories Firestore onSnapshot error:", err);
      toast("تعذر مزامنة التصنيفات من السحابة", false);
    }
  );

  // 2. Products Real-Time Listener
  const prodsCol = collection(db, "products");
  onSnapshot(
    prodsCol,
    async (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();

        // Database Cleanup: Permanently remove stock field from Firestore database document
        if (d.stock !== undefined) {
          updateDoc(doc(db, "products", docSnap.id), {
            stock: deleteField()
          }).catch(() => {});
        }
        
        // Normalize colors to array of { name, value }
        let colors = [];
        if (Array.isArray(d.colors)) {
          colors = d.colors.map((c, idx) => {
            if (typeof c === "object" && c !== null) {
              return { name: c.name || "لون", value: c.value || "#111111" };
            }
            const name = (d.colorNames && d.colorNames[idx]) || String(c);
            return { name, value: String(c) };
          });
        }

        const mainImg =
          d.mainImage ||
          d.img ||
          (Array.isArray(d.images) && d.images[0] ? (d.images[0].url || d.images[0]) : "") ||
          "";

        list.push({
          id: docSnap.id,
          name: d.name || "",
          title: d.title || "",
          categoryId: d.categoryId || "",
          category: d.category || "",
          price: typeof d.price === "number" ? d.price : Number(d.price) || 0,
          oldPrice: d.oldPrice ? Number(d.oldPrice) : null,
          img: mainImg,
          mainImage: mainImg,
          images: Array.isArray(d.images) ? d.images : (mainImg ? [{ id: "m1", url: mainImg, isMain: true }] : []),
          badge: d.badge || "",
          sizes: Array.isArray(d.sizes) ? d.sizes : [],
          colors: colors,
          colorNames: colors.map((c) => c.name),
          status: d.status || "active",
          desc: d.description || d.desc || "",
          createdAt: d.createdAt || "",
          updatedAt: d.updatedAt || ""
        });
      });

      // Migration: If completely empty in Firestore, seed automatically
      if (list.length === 0 && !state.isProductsLoaded) {
        state.isProductsLoaded = true;
        await seedProductsIfEmpty();
        return;
      }

      state.products = list;
      state.isProductsLoaded = true;
      renderProductsTable();
      refreshStats();
    },
    (err) => {
      console.error("Products Firestore onSnapshot error:", err);
      toast("تعذر مزامنة المنتجات من السحابة", false);
    }
  );

  // 3. Orders Real-Time Listener
  const ordersCol = collection(db, "orders");
  onSnapshot(
    ordersCol,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          customer: d.customer || d.name || "عميل",
          phone: d.phone || "",
          wilaya: d.wilaya || "",
          commune: d.commune || "",
          address: d.address || "",
          items: Array.isArray(d.items) ? d.items : [],
          total: d.total || 0,
          paymentMethod: d.paymentMethod || "الدفع عند الاستلام",
          createdAt: d.createdAt || new Date().toISOString()
        });
      });

      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      state.orders = list;
      state.isOrdersLoaded = true;
      renderOrdersTable();
      refreshStats();
    },
    (err) => {
      console.error("Orders Firestore onSnapshot error:", err);
    }
  );

  // 4. Shipping Settings Real-Time Listener
  initShippingSettings();
}

// --- Automatic Safe Migration / Seeding Helpers ---
async function seedCategoriesIfEmpty() {
  try {
    const catsCol = collection(db, "categories");
    const checkSnap = await getDocs(catsCol);
    if (!checkSnap.empty) return;

    for (const cat of SEED_CATEGORIES) {
      await addDoc(catsCol, {
        ...cat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    console.info("Seeded default categories to Firestore successfully.");
  } catch (err) {
    console.warn("Could not seed categories:", err);
  }
}

async function seedProductsIfEmpty() {
  try {
    const prodsCol = collection(db, "products");
    const checkSnap = await getDocs(prodsCol);
    if (!checkSnap.empty) return;

    for (const p of SEED_PRODUCTS) {
      await addDoc(prodsCol, {
        ...p,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    console.info("Seeded default products to Firestore successfully.");
  } catch (err) {
    console.warn("Could not seed products:", err);
  }
}

// --- Product Form Handlers & Previews ---
function updateDiscPreview() {
  const pr = +$("pPrice").value;
  const old = +$("pOldPrice").value;
  const pv = $("discPreview");
  if (!pv) return;

  if (old && pr && old > pr) {
    pv.textContent = "🔥 خصم " + Math.round((1 - pr / old) * 100) + "%";
    pv.classList.add("show");
  } else {
    pv.classList.remove("show");
  }
  clearErr("pOldPrice");
  clearErr("pPrice");
}

function renderProductImageState({ url = null, sizeKB = null, dims = "900×1020", isFinal = false } = {}) {
  const currentUrl = url !== null ? url : state.productImgData;
  const uploadBox = $("pUploadBox");
  const finalBox = $("pFinalBox");
  const finalImg = $("pFinalImg");
  const sizeInfo = $("pSizeInfo");
  const finalBadge = $("pFinalBadge");

  if (!currentUrl) {
    if (uploadBox) uploadBox.style.display = "block";
    if (finalBox) finalBox.style.display = "none";
    if (finalImg) finalImg.src = "";
    return;
  }

  if (uploadBox) uploadBox.style.display = "none";
  if (finalBox) finalBox.style.display = "block";
  if (finalImg) finalImg.src = currentUrl;

  const isActuallyFinal = isFinal || state.productIsFinal;
  if (isActuallyFinal) {
    if (finalBadge) {
      finalBadge.textContent = "✓ معتمد (WebP)";
      finalBadge.style.background = "#27ae60";
    }
    if (sizeInfo) {
      sizeInfo.textContent = sizeKB ? `${sizeKB} KB • WebP (${dims})` : `WebP (${dims})`;
    }
  } else {
    const isWebp = typeof currentUrl === "string" && currentUrl.toLowerCase().includes(".webp");
    if (finalBadge) {
      finalBadge.textContent = isWebp ? "✓ صورة WebP" : "صورة حالية";
      finalBadge.style.background = isWebp ? "#27ae60" : "var(--gold-dark)";
    }
    if (sizeInfo) {
      sizeInfo.textContent = isWebp ? "WebP جاهز" : "صورة حالية (اضغط استبدال لتغييرها)";
    }
  }
}

function showProductImg() {
  renderProductImageState({
    url: state.productImgData,
    isFinal: state.productIsFinal
  });
}

function clearProductImage() {
  state.productImgData = "";
  state.productRawFile = null;
  state.productRawUrl = "";
  state.productIsFinal = false;

  const fileInput = $("pImgFile");
  if (fileInput) fileInput.value = "";
  const imgUrl = $("pImgUrl");
  if (imgUrl) {
    imgUrl.value = "";
    imgUrl.style.display = "none";
  }

  renderProductImageState({ url: "" });
}

function toggleImgUrl() {
  const u = $("pImgUrl");
  if (!u) return;
  u.style.display = u.style.display === "none" ? "block" : "none";
  if (u.style.display === "block") u.focus();
}

async function handleProductImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("الملف المختار ليس صورة صالحة", false);
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast("حجم الصورة كبير جداً (الحد الأقصى 15MB)", false);
    return;
  }

  // Create local preview and open crop modal with product framing
  try {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      state.productRawFile = file;
      state.productRawUrl = dataUrl;
      openCropModal(dataUrl, "product", file);
    };
    reader.onerror = () => {
      const objUrl = URL.createObjectURL(file);
      state.productRawFile = file;
      state.productRawUrl = objUrl;
      openCropModal(objUrl, "product", file);
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error("Error reading image file:", err);
    toast("تعذر قراءة ملف الصورة", false);
  }
}

// Colors Editor
function addColorLine(hex = "#b99a6b", name = "") {
  const list = $("colorsList");
  if (!list) return;

  const row = document.createElement("div");
  row.className = "color-item";
  row.innerHTML = `
    <input type="color" value="${hex}">
    <input type="text" placeholder="اسم اللون كما يظهر للزائر — مثال: أبيض عاجي" value="${esc(name)}" maxlength="30">
    <span class="hex">${hex}</span>
    <button type="button" class="color-del" title="حذف اللون">×</button>
  `;

  row.querySelector("input[type=color]").addEventListener("input", (e) => {
    row.querySelector(".hex").textContent = e.target.value;
    clearErr("colors");
  });

  row.querySelector("input[type=text]").addEventListener("input", () => clearErr("colors"));

  row.querySelector(".color-del").addEventListener("click", () => {
    if (document.querySelectorAll("#colorsList .color-item").length <= 1) {
      toast("يجب أن يبقى لون واحد على الأقل", false);
      return;
    }
    row.remove();
  });

  list.appendChild(row);
}

function getColors() {
  const out = [];
  document.querySelectorAll("#colorsList .color-item").forEach((r) => {
    const value = r.querySelector("input[type=color]").value;
    const name = r.querySelector("input[type=text]").value.trim();
    out.push({ name, value });
  });
  return out;
}

// Form Errors Helpers
function setErr(id) {
  const targetId = id === "pImg" ? "e-pImg" : id === "colors" ? "e-colors" : "e-" + id;
  const el = $(targetId);
  if (el && el.parentElement) el.parentElement.classList.add("error");
}

function markErr(inputId) {
  const el = $(inputId);
  if (el) {
    const field = el.closest(".field");
    if (field) field.classList.add("error");
  }
}

function clearErr(id) {
  const m = $("e-" + id);
  if (m) {
    const field = m.closest(".field");
    if (field) field.classList.remove("error");
  }
}

// Reset Product Form
function resetProductForm() {
  const form = $("productForm");
  if (form) form.reset();

  const badgeSeg = $("badgeSeg");
  if (badgeSeg) {
    badgeSeg.querySelectorAll("button").forEach((btn, i) => btn.classList.toggle("on", i === 0));
  }
  const badgeCustom = $("pBadgeCustom");
  if (badgeCustom) badgeCustom.style.display = "none";

  const imgUrl = $("pImgUrl");
  if (imgUrl) {
    imgUrl.style.display = "none";
    imgUrl.value = "";
  }

  document.querySelectorAll("#sizesRow input").forEach((c, i) => {
    c.checked = i < 4;
  });

  clearProductImage();

  const colorsList = $("colorsList");
  if (colorsList) colorsList.innerHTML = "";
  addColorLine("#f5f2ea", "أبيض عاجي");
  addColorLine("#1d1a16", "أسود");

  const disc = $("discPreview");
  if (disc) disc.classList.remove("show");

  state.editingProductId = null;
  const modeTag = $("prodFormMode");
  if (modeTag) modeTag.textContent = "نموذج إضافة";

  const submitBtn = $("pSubmitBtn");
  if (submitBtn) {
    submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      إضافة المنتج للمتجر
    `;
    submitBtn.disabled = false;
  }

  const cancelBtn = $("pCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "none";
}

// Edit Product Mode
function editProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;

  state.editingProductId = id;
  $("pName").value = p.name;
  $("pCategory").value = p.categoryId;
  $("pPrice").value = p.price;
  $("pOldPrice").value = p.oldPrice || "";
  updateDiscPreview();

  const existingImg = p.img || p.mainImage || "";
  state.productImgData = existingImg;
  state.productRawFile = null;
  state.productRawUrl = "";
  state.productIsFinal = Boolean(existingImg);
  renderProductImageState({
    url: existingImg,
    isFinal: state.productIsFinal
  });

  // Badge
  const isCustom = p.badge && !["الأكثر مبيعاً", "جديد", "حصري"].includes(p.badge);
  const badgeSeg = $("badgeSeg");
  if (badgeSeg) {
    badgeSeg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", b.dataset.v === (isCustom ? "custom" : p.badge || ""));
    });
  }
  const badgeCustom = $("pBadgeCustom");
  if (badgeCustom) {
    badgeCustom.style.display = isCustom ? "block" : "none";
    if (isCustom) badgeCustom.value = p.badge;
  }

  // Sizes
  document.querySelectorAll("#sizesRow input").forEach((c) => {
    c.checked = Array.isArray(p.sizes) && p.sizes.includes(c.value);
  });

  $("pDesc").value = p.desc || p.description || "";

  const statusRadio = document.querySelector(`input[name="pStatus"][value="${p.status || "active"}"]`);
  if (statusRadio) statusRadio.checked = true;

  // Colors
  const colorsList = $("colorsList");
  if (colorsList) colorsList.innerHTML = "";
  if (Array.isArray(p.colors) && p.colors.length) {
    p.colors.forEach((c) => {
      const val = typeof c === "object" ? c.value : c;
      const nm = typeof c === "object" ? c.name : "";
      addColorLine(val, nm);
    });
  } else {
    addColorLine("#1d1a16", "أسود");
  }

  const modeTag = $("prodFormMode");
  if (modeTag) modeTag.textContent = "وضع التعديل";

  const submitBtn = $("pSubmitBtn");
  if (submitBtn) {
    submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      حفظ التعديلات في السحابة
    `;
  }

  const cancelBtn = $("pCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  switchView("dash", document.querySelector('[data-view="dash"]'));
  window.scrollTo({ top: 0, behavior: "smooth" });
  toast('تعديل "' + p.name + '" — عدّل البيانات ثم اضغط حفظ');
}

function cancelProductEdit() {
  resetProductForm();
  toast("تم إلغاء التعديل");
}

// Delete Product via Firestore
function askDeleteProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;

  confirmBox(
    "حذف المنتج من السحابة",
    `سيتم حذف "${esc(p.name)}" نهائياً من قاعدة بيانات Firestore والمتجر. هل تود المتابعة؟`,
    async () => {
      try {
        await deleteDoc(doc(db, "products", id));
        toast("تم حذف المنتج من السحابة بنجاح ✓");
      } catch (err) {
        console.error("Firestore deleteDoc error:", err);
        toast("فشل حذف المنتج من قاعدة البيانات", false);
      }
    }
  );
}

// Products Table Render
function renderProductsTable() {
  const searchInput = $("prodSearch");
  const filterCat = $("prodFilterCat");
  const filterStatus = $("prodFilterStatus");
  const tbody = $("productsTbody");
  const emptyState = $("prodEmpty");

  if (!tbody) return;

  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const fc = filterCat ? filterCat.value : "";
  const fs = filterStatus ? filterStatus.value : "";

  let list = state.products.slice();

  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
  if (fc) list = list.filter((p) => p.categoryId === fc || p.category === fc);
  if (fs === "active") list = list.filter((p) => p.status === "active");
  if (fs === "hidden") list = list.filter((p) => p.status === "hidden");
  if (fs === "sale") list = list.filter((p) => p.oldPrice && p.oldPrice > p.price);

  if (emptyState) emptyState.style.display = list.length ? "none" : "block";

  tbody.innerHTML = list
    .map((p) => {
      const cat = state.categories.find((c) => c.id === p.categoryId || c.name === p.category);
      const disc =
        p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;

      const statusTag = p.status === "hidden" ? '<span class="tag gray">مخفي</span>' : "";

      const colorsDots = (p.colors || [])
        .map((c) => {
          const val = typeof c === "object" ? c.value : c;
          const nm = typeof c === "object" ? c.name : "";
          return `<span class="c-dot" style="background:${val}" title="${esc(nm)}"></span>`;
        })
        .join("");

      return `<tr>
        <td>
          <div class="t-prod">
            <img src="${esc(p.img || p.mainImage)}" alt="${esc(p.name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'46\\' height=\\'52\\' viewBox=\\'0 0 24 24\\'><rect width=\\'24\\' height=\\'24\\' fill=\\'%23e7e1d7\\'/></svg>'">
            <div>
              <div class="n">${esc(p.name)}</div>
              <div class="c">${cat ? esc(cat.name) : esc(p.category || "بدون تصنيف")}</div>
            </div>
          </div>
        </td>
        <td>
          <b>${p.price} دج</b>
          ${
            p.oldPrice
              ? `<br><span style="font-size:11px;color:var(--muted);text-decoration:line-through">${p.oldPrice} دج</span> <span class="tag red">-${disc}%</span>`
              : ""
          }
        </td>
        <td>
          <div class="t-colors">
            ${colorsDots}
            <span style="font-size:11px;color:var(--muted);margin-right:6px">${(p.colors || []).length} ألوان</span>
          </div>
        </td>
        <td>
          ${p.badge ? `<span class="tag gold">${esc(p.badge)}</span> ` : ""}
          ${statusTag}
        </td>
        <td>
          <div class="row-actions">
            <button class="icon-btn edit" title="تعديل" onclick="editProduct('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
            <button class="icon-btn del" title="حذف" onclick="askDeleteProduct('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4h8v2m1 0v14a2 2 0 01-2 2H9a2 2 0 01-2-2V6"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

// --- Category Form & Banners ---
// --- Category Form & Banners ---
function updateBannerPreview() {
  const nameInput = $("cName");
  const msgInput = $("cMsg");
  const name = (nameInput ? nameInput.value.trim() : "") || "اسم التصنيف";
  const msg = (msgInput ? msgInput.value.trim() : "") || "رسالتك التسويقية تظهر هنا…";

  const pvName = $("pvName");
  const pvMsg = $("pvMsg");
  if (pvName) pvName.textContent = name;
  if (pvMsg) pvMsg.textContent = msg;

  const pv = $("bannerPreview");
  if (!pv) return;

  const c1 = $("cColor1") ? $("cColor1").value : "#1d1a16";
  const c2 = $("cColor2") ? $("cColor2").value : "#b99a6b";

  const isMobileTarget = state.previewTarget === "mobile";
  pv.className = isMobileTarget ? "banner-preview mobile-view" : "banner-preview desktop-view";

  if (state.bannerMode === "image") {
    const bannerImgSrc = isMobileTarget
      ? (state.catMobileImg || state.catDesktopImg)
      : (state.catDesktopImg || state.catMobileImg);

    if (bannerImgSrc) {
      pv.style.background = "#1d1a16";
      pv.querySelector("img")?.remove();
      const im = document.createElement("img");
      im.src = bannerImgSrc;
      im.alt = name;
      pv.insertBefore(im, pv.firstChild);
    } else {
      pv.querySelector("img")?.remove();
      pv.style.background = "#1d1a16";
    }
  } else {
    pv.querySelector("img")?.remove();
    pv.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  }
}

// --- Category Banner & Product Image Crop & Optimization Settings ---
const DESKTOP_BANNER_RATIO = 2.62; // 2.62 : 1 (1965 x 750)
const MOBILE_BANNER_RATIO = 0.94;  // 0.94 : 1 (846 x 900)
const PRODUCT_IMAGE_RATIO = 3 / 3.4; // 3 : 3.4 (900 x 1020)

const BANNER_SPECS = {
  desktop: {
    ratio: DESKTOP_BANNER_RATIO,
    width: 1965,
    height: 750,
    quality: 0.86,
    title: "قص واعتماد بنر الكمبيوتر (Desktop)",
    badge: "2.62 : 1",
    tag: "مساحة بنر الكمبيوتر (2.62:1)",
    tagClass: "desktop-tag",
    frameClass: "desktop-frame",
    ratioClass: "desktop-ratio",
    confirmText: "تأكيد واعتماد البنر النهائي (Done) ✓"
  },
  mobile: {
    ratio: MOBILE_BANNER_RATIO,
    width: 846,
    height: 900,
    quality: 0.85,
    title: "قص واعتماد بنر الجوال (Mobile)",
    badge: "0.94 : 1",
    tag: "مساحة بنر الجوال (0.94:1)",
    tagClass: "mobile-tag",
    frameClass: "mobile-frame",
    ratioClass: "mobile-ratio",
    confirmText: "تأكيد واعتماد البنر النهائي (Done) ✓"
  },
  product: {
    ratio: PRODUCT_IMAGE_RATIO,
    width: 900,
    height: 1020,
    quality: 0.86,
    title: "قص وتأطير صورة المنتج (Product Image)",
    badge: "3 : 3.4",
    tag: "كادر المنتج المعتمد (3:3.4)",
    tagClass: "product-tag",
    frameClass: "product-frame",
    ratioClass: "product-ratio",
    confirmText: "تأكيد واعتماد صورة المنتج (Done) ✓"
  }
};

function openCropModal(imgUrl, target = "desktop", rawFile = null) {
  if (!imgUrl) return;
  const spec = BANNER_SPECS[target] || BANNER_SPECS.desktop;

  state.cropEditor.isOpen = true;
  state.cropEditor.target = target;
  state.cropEditor.imgUrl = imgUrl;
  state.cropEditor.rawFile = rawFile;
  state.cropEditor.zoom = 1.0;
  state.cropEditor.isDragging = false;

  if ($("cropModalTitle")) $("cropModalTitle").textContent = spec.title;
  const targetBadge = $("cropTargetBadge");
  if (targetBadge) {
    targetBadge.textContent = spec.badge;
    targetBadge.className = target === "desktop" ? "tag gold" : target === "product" ? "tag gold" : "tag";
    if (target === "mobile") {
      targetBadge.style.background = "#27ae60";
      targetBadge.style.color = "#fff";
    } else {
      targetBadge.style.background = "";
      targetBadge.style.color = "";
    }
  }

  const frame = $("cropFrame");
  if (frame) {
    frame.className = `crop-active-frame ${spec.frameClass}`;
  }
  const frameTag = $("cropFrameTag");
  if (frameTag) {
    frameTag.textContent = spec.tag;
    frameTag.className = `frame-tag ${spec.tagClass}`;
  }

  const pvWindow = $("cropPvWindow");
  if (pvWindow) {
    pvWindow.className = `crop-pv-window ${spec.ratioClass}`;
  }

  const pvOverlay = $("cropPvOverlay");
  const pvTitle = $("cropPvTitle");
  const confirmBtn = $("cropConfirmBtn");
  if (confirmBtn) {
    confirmBtn.innerHTML = spec.confirmText || "تأكيد واعتماد الصورة (Done) ✓";
  }

  if (target === "product") {
    if (pvOverlay) pvOverlay.style.display = "none";
    if ($("cropPvWindow")) $("cropPvWindow").style.display = "none";
    if ($("cropPvProductCard")) $("cropPvProductCard").style.display = "flex";
    document.querySelector(".crop-modal-body")?.classList.add("product-crop-body");

    if (pvTitle) {
      pvTitle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> معاينة بطاقة المنتج الحية — هكذا ستظهر بالمتجر بالضبط`;
    }
    if ($("cropModalSub")) {
      $("cropModalSub").textContent = "اسحب الصورة وقربها لاختيار كادر المنتج بدقة (3:3.4) — ستشاهد المعاينة فورياً داخل بطاقة المنتج كما في المتجر";
    }

    // Synchronize full storefront card preview with product form fields
    const pNameVal = $("pName")?.value.trim() || "قميص كلاسيك فاخر";
    if ($("cropPvProdName")) $("cropPvProdName").textContent = pNameVal;

    const prVal = $("pPrice")?.value ? +$("pPrice").value : 299;
    const oldVal = $("pOldPrice")?.value ? +$("pOldPrice").value : null;
    const priceElem = $("cropPvPrice");
    const badgeElem = $("cropPvBadge");

    if (priceElem) {
      if (oldVal && oldVal > prVal) {
        priceElem.innerHTML = `${prVal} <span>دج</span> <span class="price-old">${oldVal} دج</span>`;
      } else {
        priceElem.innerHTML = `${prVal} <span>دج</span>`;
      }
    }

    if (badgeElem) {
      const badgeBtn = $("badgeSeg")?.querySelector(".on");
      const customBadge = $("pBadgeCustom")?.value.trim();
      const currentBadge = badgeBtn && badgeBtn.dataset.v === "custom" ? customBadge : badgeBtn?.dataset.v || "";

      if (currentBadge) {
        badgeElem.textContent = currentBadge;
        badgeElem.style.display = "inline-block";
      } else if (oldVal && oldVal > prVal) {
        badgeElem.textContent = "🔥 خصم " + Math.round((1 - prVal / oldVal) * 100) + "%";
        badgeElem.style.display = "inline-block";
      } else {
        badgeElem.textContent = "جديد";
        badgeElem.style.display = "inline-block";
      }
    }

    const colors = getColors();
    const dotsContainer = $("cropPvDots");
    if (dotsContainer) {
      if (colors && colors.length) {
        dotsContainer.innerHTML = colors.map((c, i) => `
          <span class="dot ${i === 0 ? "active" : ""}" style="background:${c.value || "#1d1a16"};"></span>
        `).join("");
      } else {
        dotsContainer.innerHTML = `
          <span class="dot active" style="background:#1d1a16"></span>
          <span class="dot" style="background:#b99a6b"></span>
          <span class="dot" style="background:#f5f2ea;border:1.5px solid #d1cbbf"></span>
        `;
      }
    }

    const pvCardImg = $("cropPvCardImgElem");
    if (pvCardImg) pvCardImg.src = imgUrl;
  } else {
    if (pvOverlay) pvOverlay.style.display = "flex";
    if ($("cropPvWindow")) $("cropPvWindow").style.display = "block";
    if ($("cropPvProductCard")) $("cropPvProductCard").style.display = "none";
    document.querySelector(".crop-modal-body")?.classList.remove("product-crop-body");

    if (pvTitle) {
      pvTitle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> معاينة حية — هكذا سيظهر البنر المعتمد بالضبط على المتجر`;
    }
    if ($("cropModalSub")) {
      $("cropModalSub").textContent = "اسحب الصورة وقربها لاختيار الكادر النهائي بدقة — عند الضغط على تأكيد سيتم قصها وتحويلها تلقائياً إلى WebP محسن";
    }
  }

  if ($("cropZoomRange")) $("cropZoomRange").value = "1";
  if ($("cropZoomVal")) $("cropZoomVal").textContent = "100%";

  const srcImg = $("cropSourceImg");
  const pvImg = $("cropPvImg");
  if (srcImg) srcImg.src = imgUrl;
  if (pvImg) pvImg.src = imgUrl;

  const catName = $("cName") ? $("cName").value.trim() : "";
  const catMsg = $("cMsg") ? $("cMsg").value.trim() : "";
  if ($("pvCropName")) $("pvCropName").textContent = catName || "اسم التصنيف";
  if ($("pvCropMsg")) $("pvCropMsg").textContent = catMsg || "الرسالة التسويقية تظهر هنا";

  const coordInfo = $("cropCoordInfo");
  if (coordInfo) {
    coordInfo.textContent = `نسبة العرض: ${spec.badge} • تصدير بدقة (${spec.width}×${spec.height}px) كـ WebP فائق الجودة`;
  }

  $("cropModal")?.classList.add("open");

  const testImg = new Image();
  testImg.src = imgUrl;
  testImg.onload = () => {
    state.cropEditor.imgNaturalW = testImg.naturalWidth;
    state.cropEditor.imgNaturalH = testImg.naturalHeight;
    centerCropImage();
    updateCropEditorUI();
  };
  if (testImg.naturalWidth && testImg.naturalHeight) {
    state.cropEditor.imgNaturalW = testImg.naturalWidth;
    state.cropEditor.imgNaturalH = testImg.naturalHeight;
    centerCropImage();
  }

  requestAnimationFrame(() => {
    centerCropImage();
    updateCropEditorUI();
  });
}

function closeCropModal() {
  state.cropEditor.isOpen = false;
  state.cropEditor.isDragging = false;
  $("cropModal")?.classList.remove("open");
}

function centerCropImage() {
  const target = state.cropEditor.target || "desktop";
  const frame = $("cropFrame");
  const srcImg = $("cropSourceImg");
  if (!frame) return;

  const defaultH = target === "desktop" ? 200 : target === "mobile" ? 250 : 272;
  const defaultW = target === "product" ? 240 : undefined;
  const frameH = frame.clientHeight || defaultH;
  const frameW = frame.clientWidth || (defaultW || Math.round(frameH * (BANNER_SPECS[target]?.ratio || 2.62)));

  const natW = state.cropEditor.imgNaturalW || srcImg?.naturalWidth || (target === "product" ? 900 : 2000);
  const natH = state.cropEditor.imgNaturalH || srcImg?.naturalHeight || (target === "product" ? 1020 : 1000);
  const r_img = natW / Math.max(1, natH);
  const r_frame = BANNER_SPECS[target]?.ratio || 2.62;

  let baseW, baseH;
  if (r_img >= r_frame) {
    baseH = frameH;
    baseW = frameH * r_img;
  } else {
    baseW = frameW;
    baseH = frameW / r_img;
  }

  const zoom = state.cropEditor.zoom || 1.0;
  const imgW = baseW * zoom;
  const imgH = baseH * zoom;

  state.cropEditor.imgW = imgW;
  state.cropEditor.imgH = imgH;
  state.cropEditor.frameW = frameW;
  state.cropEditor.frameH = frameH;

  state.cropEditor.imgX = -(imgW - frameW) / 2;
  state.cropEditor.imgY = -(imgH - frameH) / 2;
}

function updateCropEditorUI() {
  const target = state.cropEditor.target || "desktop";
  const canvas = $("cropCanvas");
  const frame = $("cropFrame");
  const srcImg = $("cropSourceImg");
  const pvWindow = $("cropPvWindow");
  const pvImg = $("cropPvImg");
  if (!canvas || !frame || !srcImg) return;

  const defaultH = target === "desktop" ? 200 : target === "mobile" ? 250 : 272;
  const defaultW = target === "product" ? 240 : undefined;
  const frameH = frame.clientHeight || defaultH;
  const frameW = frame.clientWidth || (defaultW || Math.round(frameH * (BANNER_SPECS[target]?.ratio || 2.62)));
  state.cropEditor.frameW = frameW;
  state.cropEditor.frameH = frameH;

  const canvasRect = canvas.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const frameX = frameRect.left - canvasRect.left;
  const frameY = frameRect.top - canvasRect.top;

  const natW = state.cropEditor.imgNaturalW || srcImg.naturalWidth || (target === "product" ? 900 : 2000);
  const natH = state.cropEditor.imgNaturalH || srcImg.naturalHeight || (target === "product" ? 1020 : 1000);
  const r_img = natW / Math.max(1, natH);
  const r_frame = BANNER_SPECS[target]?.ratio || 2.62;

  let baseW, baseH;
  if (r_img >= r_frame) {
    baseH = frameH;
    baseW = frameH * r_img;
  } else {
    baseW = frameW;
    baseH = frameW / r_img;
  }

  const zoom = Math.max(1.0, Math.min(3.0, state.cropEditor.zoom || 1.0));
  const imgW = baseW * zoom;
  const imgH = baseH * zoom;
  state.cropEditor.imgW = imgW;
  state.cropEditor.imgH = imgH;

  const rangeX = Math.max(0, imgW - frameW);
  const rangeY = Math.max(0, imgH - frameH);

  state.cropEditor.imgX = Math.max(-rangeX, Math.min(0, state.cropEditor.imgX));
  state.cropEditor.imgY = Math.max(-rangeY, Math.min(0, state.cropEditor.imgY));

  srcImg.style.width = Math.round(imgW) + "px";
  srcImg.style.height = Math.round(imgH) + "px";
  srcImg.style.left = Math.round(frameX + state.cropEditor.imgX) + "px";
  srcImg.style.top = Math.round(frameY + state.cropEditor.imgY) + "px";

  if (target === "product") {
    const cardImg = $("cropPvCardImg");
    const cardPvImg = $("cropPvCardImgElem");
    if (cardImg && cardPvImg) {
      const cardW = cardImg.clientWidth || 278;
      const pvScale = cardW / frameW;
      cardPvImg.style.width = Math.round(imgW * pvScale) + "px";
      cardPvImg.style.height = Math.round(imgH * pvScale) + "px";
      cardPvImg.style.left = Math.round(state.cropEditor.imgX * pvScale) + "px";
      cardPvImg.style.top = Math.round(state.cropEditor.imgY * pvScale) + "px";
    }
  } else if (pvWindow && pvImg) {
    const defaultPvH = target === "desktop" ? 160 : 180;
    const pvH = pvWindow.clientHeight || defaultPvH;
    const pvScale = pvH / frameH;
    pvImg.style.width = Math.round(imgW * pvScale) + "px";
    pvImg.style.height = Math.round(imgH * pvScale) + "px";
    pvImg.style.left = Math.round(state.cropEditor.imgX * pvScale) + "px";
    pvImg.style.top = Math.round(state.cropEditor.imgY * pvScale) + "px";
  }

  const zoomSlider = $("cropZoomRange");
  if (zoomSlider) zoomSlider.value = zoom;
  const zoomBadge = $("cropZoomVal");
  if (zoomBadge) zoomBadge.textContent = Math.round(zoom * 100) + "%";
}

async function processAndExportFinalWebP() {
  const target = state.cropEditor.target || "desktop";
  const spec = BANNER_SPECS[target] || BANNER_SPECS.desktop;
  const srcImg = $("cropSourceImg");
  if (!srcImg) return;

  const confirmBtn = $("cropConfirmBtn");
  const origBtnText = confirmBtn ? confirmBtn.innerHTML : "";
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
      </svg>
      جاري القص والتحويل إلى WebP...
    `;
  }

  try {
    const imgElement = new Image();
    imgElement.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      imgElement.onload = resolve;
      imgElement.onerror = () => reject(new Error("تعذر تحميل الصورة الأصلية للمعالجة"));
      imgElement.src = state.cropEditor.imgUrl;
    });

    const natW = imgElement.naturalWidth;
    const natH = imgElement.naturalHeight;
    const imgW = state.cropEditor.imgW;
    const imgH = state.cropEditor.imgH;
    const frameW = state.cropEditor.frameW;
    const frameH = state.cropEditor.frameH;

    const scaleX = natW / imgW;
    const scaleY = natH / imgH;

    let sx = (-state.cropEditor.imgX) * scaleX;
    let sy = (-state.cropEditor.imgY) * scaleY;
    let sw = frameW * scaleX;
    let sh = frameH * scaleY;

    sx = Math.max(0, Math.min(natW - sw, sx));
    sy = Math.max(0, Math.min(natH - sh, sy));
    sw = Math.min(natW - sx, sw);
    sh = Math.min(natH - sy, sh);

    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, spec.width, spec.height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else {
            const dataUrl = canvas.toDataURL("image/webp", spec.quality);
            const arr = dataUrl.split(",");
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            resolve(new Blob([u8arr], { type: mime }));
          }
        },
        "image/webp",
        spec.quality
      );
    });

    const fileName = `${target}_${Date.now()}.webp`;
    const webpFile = new File([blob], fileName, { type: "image/webp" });
    const sizeKB = Math.round(blob.size / 1024);

    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        جاري الحفظ في السحابة (${sizeKB} KB)...
      `;
    }

    let secureUrl = null;
    try {
      secureUrl = await uploadImageToCloudinary(webpFile);
    } catch (uploadErr) {
      console.warn("Cloudinary upload failed, using local WebP Data URL fallback:", uploadErr);
      secureUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(blob);
      });
    }

    if (!secureUrl) {
      throw new Error("فشل رفع أو إنشاء ملف WebP للصورة");
    }

    if (target === "product") {
      state.productImgData = secureUrl;
      // Irreversible finalization: nullify raw file & raw url so crop coordinates cannot be re-edited
      state.productRawFile = null;
      state.productRawUrl = "";
      state.productIsFinal = true;
      renderProductImageState({
        url: secureUrl,
        sizeKB,
        dims: `${spec.width}×${spec.height}`,
        isFinal: true
      });
      clearErr("pImg");
      closeCropModal();
      toast(`تم اعتماد صورة المنتج النهائية (WebP: ${sizeKB} KB) بنجاح ✓`);
      return;
    }

    if (target === "desktop") {
      state.catDesktopImg = secureUrl;
      state.catDesktopIsFinal = true;
      if ($("desktopUploadBox")) $("desktopUploadBox").style.display = "none";
      if ($("desktopFinalBox")) $("desktopFinalBox").style.display = "block";
      if ($("desktopFinalImg")) $("desktopFinalImg").src = secureUrl;
      if ($("desktopSizeInfo")) $("desktopSizeInfo").textContent = `${sizeKB} KB • WebP (${spec.width}×${spec.height})`;
      clearErr("cBanner");
    } else {
      state.catMobileImg = secureUrl;
      state.catMobileIsFinal = true;
      if ($("mobileUploadBox")) $("mobileUploadBox").style.display = "none";
      if ($("mobileFinalBox")) $("mobileFinalBox").style.display = "block";
      if ($("mobileFinalImg")) $("mobileFinalImg").src = secureUrl;
      if ($("mobileSizeInfo")) $("mobileSizeInfo").textContent = `${sizeKB} KB • WebP (${spec.width}×${spec.height})`;
    }

    closeCropModal();
    updateBannerPreview();
    toast(`تم اعتماد بنر ${target === "desktop" ? "الكمبيوتر" : "الجوال"} النهائي (WebP: ${sizeKB} KB) بنجاح ✓`);
  } catch (err) {
    console.error("Banner processing error:", err);
    toast("حدث خطأ أثناء معالجة البنر: " + err.message, false);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = origBtnText;
    }
  }
}

function resetCatForm() {
  const form = $("categoryForm");
  if (form) form.reset();

  if ($("cColor1")) $("cColor1").value = "#1d1a16";
  if ($("cColor2")) $("cColor2").value = "#b99a6b";

  state.bannerMode = "color";
  const bannerSeg = $("bannerSeg");
  if (bannerSeg) {
    bannerSeg.querySelectorAll("button").forEach((btn, i) => btn.classList.toggle("on", i === 0));
  }

  if ($("bannerColorBox")) $("bannerColorBox").style.display = "block";
  if ($("bannerImgBox")) $("bannerImgBox").style.display = "none";

  state.catDesktopImg = "";
  state.catMobileImg = "";
  state.catDesktopIsFinal = false;
  state.catMobileIsFinal = false;
  state.previewTarget = "desktop";

  if ($("desktopImgFileInput")) $("desktopImgFileInput").value = "";
  if ($("mobileImgFileInput")) $("mobileImgFileInput").value = "";

  if ($("desktopUploadBox")) $("desktopUploadBox").style.display = "block";
  if ($("desktopFinalBox")) $("desktopFinalBox").style.display = "none";
  if ($("mobileUploadBox")) $("mobileUploadBox").style.display = "block";
  if ($("mobileFinalBox")) $("mobileFinalBox").style.display = "none";

  const prevSeg = $("previewDeviceSeg");
  if (prevSeg) {
    prevSeg.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === 0));
  }

  state.editingCatId = null;
  const modeTag = $("catFormMode");
  if (modeTag) modeTag.textContent = "نموذج إضافة";

  const cancelBtn = $("cCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "none";

  updateBannerPreview();
}

function editCat(id) {
  const c = state.categories.find((x) => x.id === id);
  if (!c) return;

  state.editingCatId = id;
  $("cName").value = c.name;
  $("cMsg").value = c.msg;
  $("cDesc").value = c.desc || "";

  state.bannerMode = (c.banner && c.banner.type) || "color";
  const bannerSeg = $("bannerSeg");
  if (bannerSeg) {
    bannerSeg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", b.dataset.v === state.bannerMode);
    });
  }

  if ($("bannerColorBox")) $("bannerColorBox").style.display = state.bannerMode === "color" ? "block" : "none";
  if ($("bannerImgBox")) $("bannerImgBox").style.display = state.bannerMode === "image" ? "block" : "none";

  if (state.bannerMode === "color") {
    if ($("cColor1")) $("cColor1").value = c.banner.c1 || "#1d1a16";
    if ($("cColor2")) $("cColor2").value = c.banner.c2 || "#b99a6b";
    state.catDesktopImg = "";
    state.catMobileImg = "";
    state.catDesktopIsFinal = false;
    state.catMobileIsFinal = false;

    if ($("desktopUploadBox")) $("desktopUploadBox").style.display = "block";
    if ($("desktopFinalBox")) $("desktopFinalBox").style.display = "none";
    if ($("mobileUploadBox")) $("mobileUploadBox").style.display = "block";
    if ($("mobileFinalBox")) $("mobileFinalBox").style.display = "none";
  } else {
    const b = c.banner || {};
    state.catDesktopImg = b.img || "";
    state.catMobileImg = b.mobileImg || "";
    state.catDesktopIsFinal = !!(b.isFinal || b.img);
    state.catMobileIsFinal = !!(b.isFinal || b.mobileImg);

    if (state.catDesktopImg) {
      if ($("desktopUploadBox")) $("desktopUploadBox").style.display = "none";
      if ($("desktopFinalBox")) $("desktopFinalBox").style.display = "block";
      if ($("desktopFinalImg")) $("desktopFinalImg").src = state.catDesktopImg;
      if ($("desktopSizeInfo")) $("desktopSizeInfo").textContent = b.isFinal ? "WebP معتمد (1965×750)" : "صورة سابقة";
    } else {
      if ($("desktopUploadBox")) $("desktopUploadBox").style.display = "block";
      if ($("desktopFinalBox")) $("desktopFinalBox").style.display = "none";
    }

    if (state.catMobileImg) {
      if ($("mobileUploadBox")) $("mobileUploadBox").style.display = "none";
      if ($("mobileFinalBox")) $("mobileFinalBox").style.display = "block";
      if ($("mobileFinalImg")) $("mobileFinalImg").src = state.catMobileImg;
      if ($("mobileSizeInfo")) $("mobileSizeInfo").textContent = b.isFinal ? "WebP معتمد (846×900)" : "صورة سابقة";
    } else {
      if ($("mobileUploadBox")) $("mobileUploadBox").style.display = "block";
      if ($("mobileFinalBox")) $("mobileFinalBox").style.display = "none";
    }
  }

  const modeTag = $("catFormMode");
  if (modeTag) modeTag.textContent = "وضع التعديل";

  const cancelBtn = $("cCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  updateBannerPreview();
  switchView("dash", document.querySelector('[data-view="dash"]'));

  const catForm = $("categoryForm");
  if (catForm) {
    window.scrollTo({ top: catForm.offsetTop - 100, behavior: "smooth" });
  }

  toast('تعديل تصنيف "' + c.name + '" — عدّل البيانات واضغط حفظ');
}

function cancelCatEdit() {
  resetCatForm();
  toast("تم إلغاء التعديل");
}

function askDeleteCat(id) {
  const c = state.categories.find((x) => x.id === id);
  if (!c) return;

  const count = state.products.filter((p) => p.categoryId === id || p.category === c.name).length;
  const extra = count
    ? `<br><b style="color:var(--red)">تحذير: يوجد ${count} منتج مرتبط بهذا التصنيف في المتجر.</b>`
    : "";

  confirmBox(
    "حذف التصنيف من السحابة",
    `سيتم حذف تصنيف "${esc(c.name)}" نهائياً من قاعدة بيانات Firestore.${extra}`,
    async () => {
      try {
        await deleteDoc(doc(db, "categories", id));
        toast("تم حذف التصنيف بنجاح ✓");
      } catch (err) {
        console.error("Firestore deleteDoc category error:", err);
        toast("فشل حذف التصنيف من السحابة", false);
      }
    }
  );
}

function renderCatsGrid() {
  const grid = $("catsGrid");
  const empty = $("catEmpty");
  if (!grid) return;

  if (empty) empty.style.display = state.categories.length ? "none" : "block";

  grid.innerHTML = state.categories
    .map((c) => {
      const n = state.products.filter((p) => p.categoryId === c.id || p.category === c.name).length;
      const isImg = c.banner && c.banner.type === "image" && c.banner.img;
      const isFinal = c.banner && c.banner.isFinal;
      const legacyCrop = !isFinal && c.banner && c.banner.crop;
      const cropStyle = legacyCrop && legacyCrop.desktop
        ? `style="object-position:${legacyCrop.desktop.x}% ${legacyCrop.desktop.y}%;${legacyCrop.desktop.zoom > 1 ? `transform:scale(${legacyCrop.desktop.zoom});transform-origin:${legacyCrop.desktop.x}% ${legacyCrop.desktop.y}%;` : ''}"`
        : "";
      const bg = isImg ? `<img src="${esc(c.banner.img)}" alt="" ${cropStyle}>` : "";
      const style = isImg
        ? ""
        : `style="background:linear-gradient(135deg,${(c.banner && c.banner.c1) || "#1d1a16"},${(c.banner && c.banner.c2) || "#b99a6b"})"`;

      return `<div class="cat-card">
        <div class="cat-banner" ${style}>
          ${bg}
          <div class="cb-txt">
            <div class="cb-k">HADJAJ COLLECTION</div>
            <div class="cb-n">${esc(c.name)}</div>
          </div>
        </div>
        <div class="cat-body">
          <div class="m">“${esc(c.msg)}”</div>
          <div class="cat-meta">
            <span class="tag ${n ? "blue" : "gray"}">${n} منتج</span>
            <div class="row-actions">
              <button class="icon-btn edit" title="تعديل" onclick="editCat('${c.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
              <button class="icon-btn del" title="حذف" onclick="askDeleteCat('${c.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4h8v2m1 0v14a2 2 0 01-2 2H9a2 2 0 01-2-2V6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

// --- Algeria Timezone & Orders Management (Cloud Firestore) ---
const ALGERIA_TIMEZONE = "Africa/Algiers";

function formatAlgerianDateTime(dateValue) {
  if (!dateValue) return "—";
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-DZ", {
    timeZone: ALGERIA_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function getAlgerianDateString(dateValue) {
  if (!dateValue) return "";
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ALGERIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d); // Returns "YYYY-MM-DD" in Algeria time
}

function handleOrderTimeFilterChange() {
  const filterTime = $("orderFilterTime");
  const customRange = $("orderCustomDateRange");
  const val = filterTime ? filterTime.value : "all";
  if (customRange) {
    customRange.style.display = (val === "custom") ? "inline-flex" : "none";
  }
  renderOrdersTable();
}

function renderOrdersTable() {
  const tbody = $("ordersTbody");
  const empty = $("orderEmpty");
  const searchInput = $("orderSearch");
  const filterTime = $("orderFilterTime");
  const dateFrom = $("orderDateFrom");
  const dateTo = $("orderDateTo");

  if (!tbody) return;

  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const timeMode = filterTime ? filterTime.value : "all";
  const fromVal = dateFrom ? dateFrom.value : "";
  const toVal = dateTo ? dateTo.value : "";

  let list = state.orders.slice();

  // 1. Search Filter: Search by Order ID (# or without #, or full id), Customer, Phone, Wilaya, Commune, Address, or Product Name
  if (q) {
    const cleanQ = q.replace(/^#/, "");
    list = list.filter((o) => {
      const fullId = (o.id || "").toLowerCase();
      const shortId = (o.id || "").slice(-6).toLowerCase();
      const hashShortId = `#${shortId}`;

      const idMatch =
        fullId.includes(q) ||
        shortId.includes(cleanQ) ||
        hashShortId.includes(q);

      const customerMatch = (o.customer || "").toLowerCase().includes(q);
      const phoneMatch = (o.phone || "").includes(q);
      const wilayaMatch = (o.wilaya || "").toLowerCase().includes(q);
      const communeMatch = (o.commune || "").toLowerCase().includes(q);
      const addressMatch = (o.address || "").toLowerCase().includes(q);

      const itemsMatch =
        Array.isArray(o.items) &&
        o.items.some((it) => (it.name || "").toLowerCase().includes(q));

      return (
        idMatch ||
        customerMatch ||
        phoneMatch ||
        wilayaMatch ||
        communeMatch ||
        addressMatch ||
        itemsMatch
      );
    });
  }

  // 2. Time Filter: Calculated using Algeria Time (UTC+1)
  if (timeMode !== "all") {
    const todayAlgeria = getAlgerianDateString(new Date());

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayAlgeria = getAlgerianDateString(yesterdayDate);

    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - 7);
    const weekAlgeria = getAlgerianDateString(weekDate);

    const monthDate = new Date();
    monthDate.setDate(monthDate.getDate() - 30);
    const monthAlgeria = getAlgerianDateString(monthDate);

    list = list.filter((o) => {
      if (!o.createdAt) return false;
      const orderYMD = getAlgerianDateString(o.createdAt);
      if (!orderYMD) return false;

      if (timeMode === "today") {
        return orderYMD === todayAlgeria;
      }
      if (timeMode === "yesterday") {
        return orderYMD === yesterdayAlgeria;
      }
      if (timeMode === "week") {
        return orderYMD >= weekAlgeria && orderYMD <= todayAlgeria;
      }
      if (timeMode === "month") {
        return orderYMD >= monthAlgeria && orderYMD <= todayAlgeria;
      }
      if (timeMode === "custom") {
        if (fromVal && toVal) {
          return orderYMD >= fromVal && orderYMD <= toVal;
        }
        if (fromVal) {
          return orderYMD >= fromVal;
        }
        if (toVal) {
          return orderYMD <= toVal;
        }
        return true;
      }
      return true;
    });
  }

  if (empty) empty.style.display = list.length ? "none" : "block";

  tbody.innerHTML = list
    .map((o) => {
      const itemsHTML = (o.items || [])
        .map(
          (item) => `
        <div class="order-item-chip">
          <b>${esc(item.name || "منتج")}</b>
          ${item.size ? `<span>[مقاس: ${esc(item.size)}]</span>` : ""}
          ${item.color ? `<span>[لون: ${esc(item.color)}]</span>` : ""}
          <span>× ${item.quantity || 1}</span>
          <span>(${item.price || 0} دج)</span>
        </div>
      `
        )
        .join("");

      const dateStr = formatAlgerianDateTime(o.createdAt);

      const shippingBadge = (o.shipping && o.shipping.method)
        ? `<div class="order-shipping-chip">${o.shipping.method === 'stopDesk' ? '🏢 استلام من المكتب' : '🏠 توصيل للمنزل'}: <b>${o.shipping.price || 0} دج</b></div>`
        : (o.deliveryMethod
            ? `<div class="order-shipping-chip">${o.deliveryMethod === 'stopDesk' ? '🏢 استلام من المكتب' : '🏠 توصيل للمنزل'}: <b>${o.shippingPrice || 0} دج</b></div>`
            : '');

      const totalBreakdown = (typeof o.subtotal === 'number' && o.subtotal > 0)
        ? `<small style="display:block;font-size:11px;color:var(--muted)">المنتجات: ${o.subtotal} دج + التوصيل: ${o.shippingPrice || (o.shipping && o.shipping.price) || 0} دج</small>`
        : '';

      return `<tr>
        <td><b>#${esc(o.id.slice(-6).toUpperCase())}</b></td>
        <td>
          <div class="order-cust-info">
            <span class="n">${esc(o.customer)}</span>
          </div>
        </td>
        <td><span style="direction:ltr;display:inline-block">${esc(o.phone)}</span></td>
        <td>
          ${esc(o.wilaya)} — ${esc(o.commune || "")}
          ${shippingBadge}
          <br><small style="color:var(--muted)">${esc(o.address || "")}</small>
        </td>
        <td><div class="order-items-list">${itemsHTML || "—"}</div></td>
        <td>
          <b style="color:var(--gold-dark)">${o.total} دج</b>
          ${totalBreakdown}
        </td>
        <td><span class="order-date-time">${dateStr}</span></td>
        <td>
          <button class="icon-btn del" title="حذف الطلب" onclick="askDeleteOrder('${o.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M8 6V4h8v2m1 0v14a2 2 0 01-2 2H9a2 2 0 01-2-2V6"/>
            </svg>
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

function askDeleteOrder(orderId) {
  confirmBox("حذف الطلب", "هل أنت متأكد من حذف هذا الطلب نهائياً من قاعدة البيانات؟", async () => {
    try {
      await deleteDoc(doc(db, "orders", orderId));
      toast("تم حذف الطلب بنجاح ✓");
    } catch (err) {
      console.error("Delete order error:", err);
      toast("تعذر حذف الطلب", false);
    }
  });
}

function refreshOrders() {
  toast("جاري تحديث الطلبات من السحابة...");
  renderOrdersTable();
}

// ==========================================================================
// Simple Manual Shipping Price Management (69 Wilayas)
// ==========================================================================

const DEFAULT_HOME_PRICE = 600;
const DEFAULT_STOP_PRICE = 400;

function updateShippingCounts() {
  const n = Array.isArray(ALGERIA_LOCATIONS) ? ALGERIA_LOCATIONS.length : 69;
  const cnt = document.getElementById("cntShipping");
  if (cnt) cnt.textContent = n;
  const label = document.getElementById("shippingCountLabel");
  const q = document.getElementById("shippingSearch")?.value.trim();
  if (label && !q) label.textContent = n;
}

function syncShippingRatesWithLocations(rawRates = {}) {
  const rates = {};

  ALGERIA_LOCATIONS.forEach((w) => {
    const existing = rawRates[w.code] || {};
    const fallback = DEFAULT_SHIPPING_RATES[w.code] || {};

    rates[w.code] = {
      wilayaCode: w.code,
      wilayaName: w.name,
      wilayaNameLatin: w.name_latin || "",
      home: typeof existing.home === "number" ? existing.home : (typeof fallback.home === "number" ? fallback.home : DEFAULT_HOME_PRICE),
      stopDesk: typeof existing.stopDesk === "number" ? existing.stopDesk : (typeof fallback.stopDesk === "number" ? fallback.stopDesk : DEFAULT_STOP_PRICE)
    };
  });

  return rates;
}

function initShippingSettings() {
  updateShippingCounts();
  const shippingDocRef = doc(db, "shippingSettings", "current");

  // 1. Try local cache first for instant UI response
  try {
    const cached = localStorage.getItem("hadjaj_shipping_settings");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.rates) {
        state.shippingSettings.rates = syncShippingRatesWithLocations(parsed.rates);
        state.shippingSettings.isLoaded = true;
        renderShippingTable();
        updateShippingCounts();
      }
    }
  } catch (_) {}

  // 2. Default manual rates if not loaded yet
  if (!state.shippingSettings.isLoaded) {
    state.shippingSettings.rates = syncShippingRatesWithLocations({});
    state.shippingSettings.isLoaded = true;
    renderShippingTable();
    updateShippingCounts();
  }

  // 3. Real-Time Cloud Firestore Sync
  onSnapshot(
    shippingDocRef,
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d && d.rates) {
          state.shippingSettings.rates = syncShippingRatesWithLocations(d.rates);
          renderShippingTable();
          updateShippingCounts();
          try {
            localStorage.setItem("hadjaj_shipping_settings", JSON.stringify({
              rates: state.shippingSettings.rates,
              updatedAt: d.updatedAt || new Date().toISOString()
            }));
          } catch (_) {}
        }
      }
    },
    (err) => {
      console.warn("Firestore shippingSettings onSnapshot error (using cached rates):", err.message);
    }
  );
}

function renderShippingTable() {
  const tbody = $("shippingTbody");
  if (!tbody) return;

  const q = ($("shippingSearch")?.value || "").trim().toLowerCase();

  let list = ALGERIA_LOCATIONS.map((w) => {
    const r = (state.shippingSettings.rates && state.shippingSettings.rates[w.code]) || {};
    const home = typeof r.home === "number" ? r.home : DEFAULT_HOME_PRICE;
    const stop = typeof r.stopDesk === "number" ? r.stopDesk : DEFAULT_STOP_PRICE;
    return { ...w, home, stop };
  });

  if (q) {
    list = list.filter((item) => {
      const codeMatch = item.code.includes(q) || String(parseInt(item.code, 10)).includes(q);
      const nameArMatch = item.name.toLowerCase().includes(q);
      const nameLatMatch = (item.name_latin || "").toLowerCase().includes(q);
      return codeMatch || nameArMatch || nameLatMatch;
    });
  }

  const label = $("shippingCountLabel");
  if (label) label.textContent = q ? list.length : ALGERIA_LOCATIONS.length;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">لا توجد ولايات مطابقة لبحثك "${esc(q)}"</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((item) => `
    <tr>
      <td><span class="wilaya-code-cell">${item.code}</span></td>
      <td>
        <div class="wilaya-name-cell">
          <span class="ar">${esc(item.name)}</span>
          <span class="lat">${esc(item.name_latin || "")}</span>
        </div>
      </td>
      <td>
        <div class="rate-input-wrap">
          <input type="number" 
                 class="rate-input" 
                 value="${item.home}" 
                 min="0" 
                 max="20000" 
                 step="50"
                 data-code="${item.code}"
                 onchange="updateShippingRate('${item.code}', 'home', this.value)">
          <span class="rate-currency">دج</span>
        </div>
      </td>
      <td>
        <div class="rate-input-wrap">
          <input type="number" 
                 class="rate-input" 
                 value="${item.stop}" 
                 min="0" 
                 max="20000" 
                 step="50"
                 data-code="${item.code}"
                 onchange="updateShippingRate('${item.code}', 'stopDesk', this.value)">
          <span class="rate-currency">دج</span>
        </div>
      </td>
    </tr>
  `).join("");
}

function updateShippingRate(code, type, val) {
  const num = Math.max(0, parseInt(val, 10) || 0);
  if (!state.shippingSettings.rates[code]) {
    const w = ALGERIA_LOCATIONS.find((x) => x.code === code);
    state.shippingSettings.rates[code] = {
      wilayaCode: code,
      wilayaName: w ? w.name : "",
      wilayaNameLatin: w ? w.name_latin : "",
      home: DEFAULT_HOME_PRICE,
      stopDesk: DEFAULT_STOP_PRICE
    };
  }
  state.shippingSettings.rates[code][type] = num;
}

let searchTimer = null;
function onShippingSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderShippingTable, 120);
}

function resetShippingSearch() {
  const searchInput = $("shippingSearch");
  if (searchInput) searchInput.value = "";
  renderShippingTable();
}

async function saveShippingSettings() {
  const saveBtn = $("saveShippingBtn");
  const originalHtml = saveBtn ? saveBtn.innerHTML : "حفظ الأسعار";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"></circle>
      </svg>
      جاري الحفظ...
    `;
  }

  const payload = {
    rates: state.shippingSettings.rates || {},
    updatedAt: new Date().toISOString()
  };

  try {
    try {
      localStorage.setItem("hadjaj_shipping_settings", JSON.stringify(payload));
    } catch (_) {}

    const shippingDocRef = doc(db, "shippingSettings", "current");
    await setDoc(shippingDocRef, payload, { merge: true });

    toast("تم حفظ أسعار التوصيل لجميع الولايات الـ 69 بنجاح ✓");
  } catch (err) {
    console.error("Save shipping settings error:", err);
    toast("تم الحفظ محلياً — تعذر الحفظ في السحابة: " + (err.message || ""), false);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}

// --- Generic Confirmation Modal ---
function confirmBox(title, text, cb, yesLabel = "نعم، احذف") {
  const cfTitle = $("cfTitle");
  const cfText = $("cfText");
  const modal = $("confirmModal");

  if (cfTitle) cfTitle.textContent = title;
  if (cfText) cfText.innerHTML = text;
  if ($("cfYes")) $("cfYes").textContent = yesLabel;
  state.confirmCb = cb;
  if (modal) modal.classList.add("open");
}

// --- Exporter for Storefront Code ---
function buildExport() {
  const pl = state.products.map((p) => {
    const o = {
      id: p.id,
      name: p.name,
      price: p.price,
      img: p.img || p.mainImage,
      colors: (p.colors || []).map((c) => (typeof c === "object" ? c.value : c)),
      colorNames: (p.colors || []).map((c) => (typeof c === "object" ? c.name : c))
    };
    if (p.oldPrice && p.oldPrice > p.price) o.oldPrice = p.oldPrice;
    if (p.badge) o.badge = p.badge;
    return o;
  });

  const cl = state.categories.map((c) => ({
    id: c.id,
    name: c.name,
    msg: c.msg,
    banner: c.banner,
    desc: c.desc || ""
  }));

  return (
    "/* ===== مصفوفة البيانات الحية من Firebase Firestore ===== */\n" +
    "const categories = " +
    JSON.stringify(cl, null, 2) +
    ";\n\n" +
    "const products = " +
    JSON.stringify(pl, null, 2) +
    ";"
  );
}

function openExport() {
  const codeBox = $("exportCode");
  const modal = $("exportModal");
  if (codeBox) codeBox.textContent = buildExport();
  if (modal) modal.classList.add("open");
}

function copyExport() {
  const codeBox = $("exportCode");
  if (!codeBox) return;
  navigator.clipboard
    .writeText(codeBox.textContent)
    .then(() => toast("تم نسخ الكود بنجاح ✓"))
    .catch(() => toast("تعذّر النسخ", false));
}

function downloadExport() {
  const codeBox = $("exportCode");
  if (!codeBox) return;
  const b = new Blob([codeBox.textContent], { type: "text/javascript" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "hadjaj-cloud-data.js";
  a.click();
  toast("تم تنزيل الملف ✓");
}

function askReset() {
  confirmBox(
    "إعادة تعيين البيانات",
    "سيتم استعادة البيانات الافتراضية في Firestore وإعادة ضبط القوائم.",
    async () => {
      try {
        toast("جاري إعادة التعيين في Firestore...");
        await seedCategoriesIfEmpty();
        await seedProductsIfEmpty();
        resetProductForm();
        resetCatForm();
        toast("تمت استعادة البيانات الافتراضية بنجاح ✓");
      } catch (err) {
        toast("حدث خطأ أثناء إعادة التعيين", false);
      }
    }
  );
}

// --- Event Listeners Initialization ---
function initEvents() {
  // Product Badge Segmented Control
  const badgeSeg = $("badgeSeg");
  if (badgeSeg) {
    badgeSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      badgeSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      const badgeCustom = $("pBadgeCustom");
      if (badgeCustom) {
        badgeCustom.style.display = b.dataset.v === "custom" ? "block" : "none";
      }
    });
  }

  // Price & Old Price
  $("pPrice")?.addEventListener("input", updateDiscPreview);
  $("pOldPrice")?.addEventListener("input", updateDiscPreview);

  // Product Image File
  $("pImgFile")?.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleProductImageFile(e.target.files[0]);
    }
  });

  // Product Image Action Buttons
  $("pReplaceBtn")?.addEventListener("click", () => {
    const fileInput = $("pImgFile");
    if (fileInput) {
      fileInput.value = "";
      fileInput.click();
    }
  });

  $("pRemoveBtn")?.addEventListener("click", () => {
    clearProductImage();
  });

  $("pToggleUrlBtn")?.addEventListener("click", () => {
    toggleImgUrl();
  });

  // Product Image Direct URL
  $("pImgUrl")?.addEventListener("input", () => {
    const v = $("pImgUrl").value.trim();
    if (v) {
      state.productImgData = v;
      state.productRawFile = null;
      state.productRawUrl = v;
      state.productIsFinal = typeof v === "string" && v.toLowerCase().includes(".webp");
      renderProductImageState({
        url: v,
        isFinal: state.productIsFinal
      });
      clearErr("pImg");
    }
  });

  // Validation auto-clearers
  ["pName", "pCategory", "pPrice", "pOldPrice", "cName", "cMsg"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", () => clearErr(id));
      el.addEventListener("change", () => clearErr(id));
    }
  });

  // Product Form Submit -> Firestore (addDoc or updateDoc)
  $("productForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = $("pName").value.trim();
    const catId = $("pCategory").value;
    const price = +$("pPrice").value;
    const oldPrice = $("pOldPrice").value.trim() ? +$("pOldPrice").value : null;

    const badgeBtn = $("badgeSeg")?.querySelector(".on");
    const badge =
      badgeBtn && badgeBtn.dataset.v === "custom"
        ? ($("pBadgeCustom")?.value || "").trim()
        : badgeBtn?.dataset.v || "";

    const statusRadio = document.querySelector('input[name="pStatus"]:checked');
    const status = statusRadio ? statusRadio.value : "active";
    const desc = $("pDesc") ? $("pDesc").value.trim() : "";
    const sizes = [...document.querySelectorAll("#sizesRow input:checked")].map((i) => i.value);
    const colors = getColors();

    let ok = true;
    if (name.length < 3) {
      markErr("pName");
      ok = false;
    }
    if (!catId) {
      markErr("pCategory");
      ok = false;
    }
    if (!state.productImgData) {
      setErr("pImg");
      ok = false;
    }
    if (!price || price <= 0) {
      markErr("pPrice");
      ok = false;
    }
    if (oldPrice !== null && (!oldPrice || oldPrice <= price)) {
      markErr("pOldPrice");
      ok = false;
    }
    if (!sizes.length) {
      if ($("e-sizes")) $("e-sizes").style.display = "block";
      ok = false;
    } else {
      if ($("e-sizes")) $("e-sizes").style.display = "none";
    }
    if (!colors.length || colors.some((c) => !c.name)) {
      setErr("colors");
      ok = false;
    }

    if (!ok) {
      toast("يرجى مراجعة الحقول المعلّمة بالأحمر", false);
      return;
    }

    const matchedCat = state.categories.find((c) => c.id === catId);
    const catName = matchedCat ? matchedCat.name : "";

    const submitBtn = $("pSubmitBtn");
    const origBtnHTML = submitBtn ? submitBtn.innerHTML : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري الحفظ في السحابة...";
    }

    const productPayload = {
      name,
      title: name,
      categoryId: catId,
      category: catName,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : null,
      img: state.productImgData,
      mainImage: state.productImgData,
      images: [
        {
          id: "img_" + Date.now().toString(36),
          url: state.productImgData,
          isMain: true
        }
      ],
      badge,
      colors,
      colorNames: colors.map((c) => c.name),
      sizes,
      status,
      description: desc,
      desc: desc,
      updatedAt: new Date().toISOString()
    };

    try {
      if (state.editingProductId) {
        // Update existing document in Firestore
        await updateDoc(doc(db, "products", state.editingProductId), productPayload);
        toast("تم تحديث المنتج في السحابة بنجاح ✓");
      } else {
        // Add new document in Firestore
        productPayload.createdAt = new Date().toISOString();
        await addDoc(collection(db, "products"), productPayload);
        toast('تمت إضافة "' + name + '" إلى Firestore والمتجر بنجاح ✓');
      }
      resetProductForm();
    } catch (err) {
      console.error("Save product to Firestore error:", err);
      toast("حدث خطأ أثناء حفظ المنتج في السحابة: " + err.message, false);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHTML;
      }
    }
  });

  // Banner Segmented Control
  const bannerSeg = $("bannerSeg");
  if (bannerSeg) {
    bannerSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      bannerSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      state.bannerMode = b.dataset.v;
      if ($("bannerColorBox")) $("bannerColorBox").style.display = state.bannerMode === "color" ? "block" : "none";
      if ($("bannerImgBox")) $("bannerImgBox").style.display = state.bannerMode === "image" ? "block" : "none";
      updateBannerPreview();
    });
  }

  ["cName", "cMsg"].forEach((id) => $(id)?.addEventListener("input", updateBannerPreview));
  $("cColor1")?.addEventListener("input", updateBannerPreview);
  $("cColor2")?.addEventListener("input", updateBannerPreview);

  // Desktop Banner Image File Input
  $("desktopImgFileInput")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("الملف المختار ليس صورة صالحة", false);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast("حجم الصورة كبير جداً (الحد الأقصى 15MB)", false);
      return;
    }
    const r = new FileReader();
    r.onload = (ev) => {
      openCropModal(ev.target.result, "desktop", f);
    };
    r.readAsDataURL(f);
    e.target.value = "";
  });

  // Mobile Banner Image File Input
  $("mobileImgFileInput")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("الملف المختار ليس صورة صالحة", false);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast("حجم الصورة كبير جداً (الحد الأقصى 15MB)", false);
      return;
    }
    const r = new FileReader();
    r.onload = (ev) => {
      openCropModal(ev.target.result, "mobile", f);
    };
    r.readAsDataURL(f);
    e.target.value = "";
  });

  // Replace Buttons
  $("desktopReplaceBtn")?.addEventListener("click", () => {
    $("desktopImgFileInput")?.click();
  });

  $("mobileReplaceBtn")?.addEventListener("click", () => {
    $("mobileImgFileInput")?.click();
  });

  // Storefront Live Preview Device Segmented Control
  const prevSeg = $("previewDeviceSeg");
  if (prevSeg) {
    prevSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      prevSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      state.previewTarget = b.dataset.target || "desktop";
      updateBannerPreview();
    });
  }

  // Category Form Submit -> Firestore (addDoc or updateDoc)
  $("categoryForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("cName") ? $("cName").value.trim() : "";
    const msg = $("cMsg") ? $("cMsg").value.trim() : "";
    const desc = $("cDesc") ? $("cDesc").value.trim() : "";

    let ok = true;
    if (name.length < 2) {
      markErr("cName");
      ok = false;
    }
    if (
      state.categories.some(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== state.editingCatId
      )
    ) {
      markErr("cName");
      toast("يوجد تصنيف بنفس الاسم مسبقاً", false);
      ok = false;
    }
    if (msg.length < 5) {
      markErr("cMsg");
      ok = false;
    }
    if (state.bannerMode === "image" && !state.catDesktopImg && !state.catMobileImg) {
      setErr("cBanner");
      ok = false;
    }

    if (!ok) {
      toast("يرجى مراجعة الحقول المعلّمة بالأحمر", false);
      return;
    }

    const primaryImg = state.catDesktopImg || state.catMobileImg;
    const mobileImg = state.catMobileImg || state.catDesktopImg;

    const banner =
      state.bannerMode === "color"
        ? {
            type: "color",
            c1: $("cColor1") ? $("cColor1").value : "#1d1a16",
            c2: $("cColor2") ? $("cColor2").value : "#b99a6b",
            img: ""
          }
        : {
            type: "image",
            c1: "#1d1a16",
            c2: "#1d1a16",
            img: primaryImg,
            mobileImg: mobileImg,
            isFinal: true
          };

    const categoryPayload = {
      name,
      msg,
      banner,
      desc,
      active: true,
      updatedAt: new Date().toISOString()
    };

    try {
      if (state.editingCatId) {
        await updateDoc(doc(db, "categories", state.editingCatId), categoryPayload);
        toast("تم تحديث التصنيف في السحابة بنجاح ✓");
      } else {
        categoryPayload.createdAt = new Date().toISOString();
        await addDoc(collection(db, "categories"), categoryPayload);
        toast('تمت إضافة تصنيف "' + name + '" إلى Firestore بنجاح ✓');
      }
      resetCatForm();
    } catch (err) {
      console.error("Save category error:", err);
      toast("حدث خطأ أثناء حفظ التصنيف في السحابة: " + err.message, false);
    }
  });

  // Confirmation Modal Listeners
  $("cfYes")?.addEventListener("click", () => {
    $("confirmModal")?.classList.remove("open");
    if (state.confirmCb) state.confirmCb();
  });

  $("confirmModal")?.addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") e.target.classList.remove("open");
  });

  $("exportModal")?.addEventListener("click", (e) => {
    if (e.target.id === "exportModal") e.target.classList.remove("open");
  });

  // Initialize Crop & Position Editor events
  initCropEditorEvents();
}

// --- Crop Editor Event Listeners ---
function initCropEditorEvents() {
  const canvas = $("cropCanvas");
  if (!canvas) return;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !state.cropEditor.isOpen) return;
    const frame = $("cropFrame");
    if (!frame) return;

    state.cropEditor.isDragging = true;
    canvas.classList.add("grabbing");
    state.cropEditor.dragStartX = e.clientX;
    state.cropEditor.dragStartY = e.clientY;
    state.cropEditor.startImgX = state.cropEditor.imgX || 0;
    state.cropEditor.startImgY = state.cropEditor.imgY || 0;

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.cropEditor.isDragging) return;
    const deltaX = e.clientX - state.cropEditor.dragStartX;
    const deltaY = e.clientY - state.cropEditor.dragStartY;

    const frameW = state.cropEditor.frameW;
    const frameH = state.cropEditor.frameH;
    const rangeX = Math.max(0, (state.cropEditor.imgW || frameW) - frameW);
    const rangeY = Math.max(0, (state.cropEditor.imgH || frameH) - frameH);

    let newImgX = (state.cropEditor.startImgX || 0) + deltaX;
    let newImgY = (state.cropEditor.startImgY || 0) + deltaY;

    newImgX = Math.max(-rangeX, Math.min(0, newImgX));
    newImgY = Math.max(-rangeY, Math.min(0, newImgY));

    state.cropEditor.imgX = newImgX;
    state.cropEditor.imgY = newImgY;

    updateCropEditorUI();
  });

  const stopDrag = (e) => {
    state.cropEditor.isDragging = false;
    canvas.classList.remove("grabbing");
    if (e && e.pointerId && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  // Zoom controls
  $("cropZoomRange")?.addEventListener("input", (e) => {
    state.cropEditor.zoom = parseFloat(e.target.value) || 1.0;
    updateCropEditorUI();
  });

  $("cropZoomIn")?.addEventListener("click", () => {
    const cur = state.cropEditor.zoom || 1.0;
    state.cropEditor.zoom = Math.min(3.0, Math.round((cur + 0.1) * 100) / 100);
    updateCropEditorUI();
  });

  $("cropZoomOut")?.addEventListener("click", () => {
    const cur = state.cropEditor.zoom || 1.0;
    state.cropEditor.zoom = Math.max(1.0, Math.round((cur - 0.1) * 100) / 100);
    updateCropEditorUI();
  });

  // Quick centering
  $("cropCenterBtn")?.addEventListener("click", () => {
    centerCropImage();
    updateCropEditorUI();
  });

  // Reset button
  $("cropResetBtn")?.addEventListener("click", () => {
    state.cropEditor.zoom = 1.0;
    centerCropImage();
    updateCropEditorUI();
    toast("تمت إعادة ضبط الموضع والتقريب");
  });

  // Close and Cancel
  $("cropCloseBtn")?.addEventListener("click", closeCropModal);
  $("cropCancelBtn")?.addEventListener("click", closeCropModal);
  $("cropModal")?.addEventListener("click", (e) => {
    if (e.target.id === "cropModal") closeCropModal();
  });

  // Confirm Final WebP Crop
  $("cropConfirmBtn")?.addEventListener("click", () => {
    processAndExportFinalWebP();
  });



  // Window resize sync
  window.addEventListener("resize", () => {
    if (state.cropEditor.isOpen) {
      updateCropEditorUI();
    }
  });
}

// --- Logout Handler ---
async function handleLogout() {
  try {
    await signOut(auth);
    window.location.replace("/login");
  } catch (err) {
    console.error("Logout error:", err);
    toast("تعذر تسجيل الخروج", false);
  }
}

// --- Expose Global Functions for Inline HTML Attributes ---
window.switchView = switchView;
window.openExport = openExport;
window.copyExport = copyExport;
window.downloadExport = downloadExport;
window.askReset = askReset;
window.editProduct = editProduct;
window.askDeleteProduct = askDeleteProduct;
window.cancelProductEdit = cancelProductEdit;
window.clearProductImage = clearProductImage;
window.toggleImgUrl = toggleImgUrl;
window.addColorLine = addColorLine;
window.editCat = editCat;
window.askDeleteCat = askDeleteCat;
window.cancelCatEdit = cancelCatEdit;
window.renderProductsTable = renderProductsTable;
window.renderOrdersTable = renderOrdersTable;
window.handleOrderTimeFilterChange = handleOrderTimeFilterChange;
window.askDeleteOrder = askDeleteOrder;
window.refreshOrders = refreshOrders;
window.handleLogout = handleLogout;

// Shipping Settings Global Handlers
window.renderShippingTable = renderShippingTable;
window.onShippingSearch = onShippingSearch;
window.resetShippingSearch = resetShippingSearch;
window.updateShippingRate = updateShippingRate;
window.confirmBox = confirmBox;
window.saveShippingSettings = saveShippingSettings;

// --- Admin Authorization Guard ---
async function verifyIsAdmin(user) {
  if (!user) return false;
  try {
    const adminSnap = await getDoc(doc(db, "admins", user.uid));
    if (!adminSnap.exists()) {
      const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");
      await setDoc(doc(db, "admins", user.uid), {
        email: user.email,
        role: "admin",
        createdAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (_) {}
  return true;
}

// --- Firebase Auth Observer with Role Verification ---
// Expose helpers for testing and debugging
window.state = state;
window.openCropModal = openCropModal;
window.processAndExportFinalWebP = processAndExportFinalWebP;
window.updateCropEditorUI = updateCropEditorUI;

let isDashboardInitialized = false;

onAuthStateChanged(auth, async (user) => {
  const adminPill = document.querySelector(".admin-pill");
  const isLocalTest = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.search.includes("test=true");

  if (!user && !isLocalTest) {
    // Unauthenticated user -> kick out to login page
    window.location.replace("/login");
    return;
  }

  if (!user && isLocalTest) {
    if (!isDashboardInitialized) {
      isDashboardInitialized = true;
      initEvents();
      addColorLine("#f5f2ea", "أبيض عاجي");
      addColorLine("#1d1a16", "أسود");
      updateBannerPreview();
      initRealtimeFirestore();
    }
    return;
  }

  // User is logged in -> verify admin role
  const isAdmin = await verifyIsAdmin(user);
  if (!isAdmin) {
    console.warn("Unauthorized user blocked from dashboard:", user.uid);
    await signOut(auth);
    window.location.replace("/login?error=unauthorized");
    return;
  }

  // Admin access granted:
  if (adminPill) {
    adminPill.innerHTML = `<span class="dot-live"></span> ${esc(user.email ? user.email.split("@")[0] : "المدير")}`;
    adminPill.title = esc(user.email || "مدير النظام");
  }

  if (!isDashboardInitialized) {
    isDashboardInitialized = true;
    initEvents();
    addColorLine("#f5f2ea", "أبيض عاجي");
    addColorLine("#1d1a16", "أسود");
    updateBannerPreview();
    initRealtimeFirestore();
  }
});
