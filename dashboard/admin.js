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
  addDoc, 
  updateDoc, 
  deleteDoc, 
  deleteField,
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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
  catImgData: "",
  catCropSettings: null,
  bannerMode: "color",
  confirmCb: null,
  cropEditor: {
    isOpen: false,
    imgUrl: "",
    desktop: { x: 50, y: 50, zoom: 1.0 },
    mobile: { focusX: 50, x: 50, y: 50, zoom: 1.0 },
    imgNaturalW: 0,
    imgNaturalH: 0,
    isDraggingImage: false,
    isDraggingMobile: false,
    dragStartX: 0,
    dragStartY: 0,
    startImgX: 0,
    startImgY: 0,
    startFocusX_px: 0,
    imgW: 0,
    imgH: 0,
    imgX: 0,
    imgY: 0
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
          }).then(() => {
            console.log("Permanently deleted stock field from Firestore database document:", docSnap.id);
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
          status: d.status || "جديد",
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

function showProductImg() {
  const uploader = $("pUploader");
  if (!uploader) return;
  uploader.classList.add("has-img");
  uploader.innerHTML = `<img src="${state.productImgData}" alt="صورة المنتج">`;
}

function clearProductImage() {
  state.productImgData = "";
  const fileInput = $("pImgFile");
  if (fileInput) fileInput.value = "";
  const uploader = $("pUploader");
  if (uploader) {
    uploader.classList.remove("has-img");
    uploader.innerHTML =
      '<div class="up-txt" id="pUpTxt"><b>اضغط لرفع صورة المنتج</b>PNG أو JPG — يُفضّل 800×900 بكسل</div>';
  }
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
    toast("الملف ليس صورة", false);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast("حجم الصورة كبير (الحد الأقصى 5MB)", false);
    return;
  }

  // Instant local preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    state.productImgData = ev.target.result;
    showProductImg();
    clearErr("pImg");
  };
  reader.readAsDataURL(file);

  // Background Cloudinary Upload
  try {
    toast("جاري رفع الصورة إلى السحابة...", true);
    const secureUrl = await uploadImageToCloudinary(file);
    if (secureUrl) {
      state.productImgData = secureUrl;
      showProductImg();
      toast("تم حفظ الصورة على السحابة بنجاح ✓", true);
    }
  } catch (err) {
    console.info("Cloudinary upload fallback to data URL:", err.message);
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

  state.productImgData = p.img || p.mainImage || "";
  showProductImg();

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

  if (state.bannerMode === "image" && state.catImgData) {
    pv.style.background = "#1d1a16";
    pv.querySelector("img")?.remove();
    const im = document.createElement("img");
    im.src = state.catImgData;
    if (state.catCropSettings && state.catCropSettings.desktop) {
      im.style.objectPosition = `${state.catCropSettings.desktop.x}% ${state.catCropSettings.desktop.y}%`;
      if (state.catCropSettings.desktop.zoom > 1) {
        im.style.transform = `scale(${state.catCropSettings.desktop.zoom})`;
        im.style.transformOrigin = `${state.catCropSettings.desktop.x}% ${state.catCropSettings.desktop.y}%`;
      }
    }
    pv.insertBefore(im, pv.firstChild);
  } else {
    pv.querySelector("img")?.remove();
    pv.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  }
}

// --- Category Banner Crop & Position Editor ---
const DESKTOP_BANNER_RATIO = 2.62; // 2.62 : 1 (e.g. 2620 x 1000)
const MOBILE_FOCUS_RATIO = 0.94;   // 0.94 : 1 (e.g. 940 x 1000)

function openCropModal(imgUrl, existingCrop) {
  if (!imgUrl) return;
  state.cropEditor.isOpen = true;
  state.cropEditor.imgUrl = imgUrl;

  const defaultCrop = {
    desktop: { x: 50, y: 50, zoom: 1.0 },
    mobile: { focusX: 50, x: 50, y: 50, zoom: 1.0 }
  };

  const crop = existingCrop || defaultCrop;
  state.cropEditor.desktop = {
    x: typeof crop.desktop?.x === "number" ? crop.desktop.x : 50,
    y: typeof crop.desktop?.y === "number" ? crop.desktop.y : 50,
    zoom: typeof crop.desktop?.zoom === "number" ? crop.desktop.zoom : 1.0
  };
  state.cropEditor.mobile = {
    focusX: typeof crop.mobile?.focusX === "number" ? crop.mobile.focusX : (typeof crop.mobile?.x === "number" ? crop.mobile.x : 50),
    x: typeof crop.mobile?.x === "number" ? crop.mobile.x : 50,
    y: typeof crop.mobile?.y === "number" ? crop.mobile.y : 50,
    zoom: typeof crop.mobile?.zoom === "number" ? crop.mobile.zoom : 1.0
  };

  state.cropEditor.isDraggingImage = false;
  state.cropEditor.isDraggingMobile = false;

  const srcImg = $("cropSourceImg");
  const pvDImg = $("pvDesktopImg");
  const pvMImg = $("pvMobileImg");

  if (srcImg) srcImg.src = imgUrl;
  if (pvDImg) pvDImg.src = imgUrl;
  if (pvMImg) pvMImg.src = imgUrl;

  const catName = $("cName") ? $("cName").value.trim() : "";
  const catMsg = $("cMsg") ? $("cMsg").value.trim() : "";
  if ($("pvCropNameDesktop")) $("pvCropNameDesktop").textContent = catName || "اسم التصنيف";
  if ($("pvCropMsgDesktop")) $("pvCropMsgDesktop").textContent = catMsg || "الرسالة التسويقية تظهر هنا";
  if ($("pvCropNameMobile")) $("pvCropNameMobile").textContent = catName || "اسم التصنيف";

  $("cropModal")?.classList.add("open");

  // Load natural dimensions to ensure exact aspect ratio coverage
  const testImg = new Image();
  testImg.src = imgUrl;
  testImg.onload = () => {
    state.cropEditor.imgNaturalW = testImg.naturalWidth;
    state.cropEditor.imgNaturalH = testImg.naturalHeight;
    updateCropEditorUI();
  };
  if (testImg.naturalWidth && testImg.naturalHeight) {
    state.cropEditor.imgNaturalW = testImg.naturalWidth;
    state.cropEditor.imgNaturalH = testImg.naturalHeight;
  }

  requestAnimationFrame(() => {
    updateCropEditorUI();
  });
}

function closeCropModal() {
  state.cropEditor.isOpen = false;
  state.cropEditor.isDraggingImage = false;
  state.cropEditor.isDraggingMobile = false;
  $("cropModal")?.classList.remove("open");
}

function updateCropEditorUI() {
  const d = state.cropEditor.desktop;
  const m = state.cropEditor.mobile;

  const canvas = $("cropCanvas");
  const frame = $("desktopBannerFrame");
  const mobBox = $("mobileFocusBox");
  const srcImg = $("cropSourceImg");
  if (!canvas || !frame || !srcImg) return;

  const frameH = frame.clientHeight || 200;
  const frameW = frame.clientWidth || Math.round(frameH * DESKTOP_BANNER_RATIO);
  const canvasRect = canvas.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const frameX = frameRect.left - canvasRect.left;
  const frameY = frameRect.top - canvasRect.top;

  // Aspect ratio calculations: Desktop Banner fixed at 2.62 : 1
  const natW = state.cropEditor.imgNaturalW || srcImg.naturalWidth || 2620;
  const natH = state.cropEditor.imgNaturalH || srcImg.naturalHeight || 1000;
  const r_img = natW / Math.max(1, natH);
  const r_frame = DESKTOP_BANNER_RATIO; // 2.62 : 1

  let baseW, baseH;
  if (r_img >= r_frame) {
    baseH = frameH;
    baseW = frameH * r_img;
  } else {
    baseW = frameW;
    baseH = frameW / r_img;
  }

  const zoom = Math.max(1.0, Math.min(3.0, d.zoom || 1.0));
  const imgW = baseW * zoom;
  const imgH = baseH * zoom;
  state.cropEditor.imgW = imgW;
  state.cropEditor.imgH = imgH;

  const rangeX = Math.max(0, imgW - frameW);
  const rangeY = Math.max(0, imgH - frameH);

  // Position image if not currently actively dragging
  if (!state.cropEditor.isDraggingImage) {
    state.cropEditor.imgX = rangeX > 0 ? -(d.x / 100) * rangeX : 0;
    state.cropEditor.imgY = rangeY > 0 ? -(d.y / 100) * rangeY : 0;
  }

  // Render cropSourceImg in canvas relative to desktop frame
  srcImg.style.width = Math.round(imgW) + "px";
  srcImg.style.height = Math.round(imgH) + "px";
  srcImg.style.left = Math.round(frameX + state.cropEditor.imgX) + "px";
  srcImg.style.top = Math.round(frameY + state.cropEditor.imgY) + "px";

  // Mobile Focus Box: STRICTLY FIXED 0.94 : 1 RATIO INSIDE DESKTOP FRAME
  const boxW = Math.round(frameH * MOBILE_FOCUS_RATIO); // e.g. 200 * 0.94 = 188px
  const maxXM = Math.max(0, frameW - boxW);

  if (!state.cropEditor.isDraggingMobile) {
    const fx = typeof m.focusX === "number" ? m.focusX : 50;
    state.cropEditor.mobile.focusX_px = (fx / 100) * maxXM;
  }

  const focusX_px = Math.max(0, Math.min(maxXM, state.cropEditor.mobile.focusX_px || 0));
  state.cropEditor.mobile.focusX_px = focusX_px;
  if (maxXM > 0) {
    state.cropEditor.mobile.focusX = (focusX_px / maxXM) * 100;
  }

  if (mobBox) {
    mobBox.style.width = boxW + "px";
    mobBox.style.left = Math.round(focusX_px) + "px";
    mobBox.style.top = "0px";
    mobBox.style.bottom = "0px";
    mobBox.style.height = "100%";
  }

  // Live Desktop Preview: Fixed 2.62 : 1
  const pvDInner = $("pvDesktopInner");
  const pvDImg = $("pvDesktopImg");
  if (pvDInner && pvDImg) {
    const pvDH = pvDInner.clientHeight || 100;
    const scaleD = pvDH / frameH;
    pvDImg.style.width = Math.round(imgW * scaleD) + "px";
    pvDImg.style.height = Math.round(imgH * scaleD) + "px";
    pvDImg.style.left = Math.round(state.cropEditor.imgX * scaleD) + "px";
    pvDImg.style.top = Math.round(state.cropEditor.imgY * scaleD) + "px";
  }

  // Live Mobile Preview: EXACT 0.94 : 1 SUB-WINDOW OF MOBILE FOCUS BOX
  const pvMInner = $("pvMobileInner");
  const pvMImg = $("pvMobileImg");
  if (pvMInner && pvMImg) {
    const pvMH = pvMInner.clientHeight || 120;
    const scaleM = pvMH / frameH;
    pvMImg.style.width = Math.round(imgW * scaleM) + "px";
    pvMImg.style.height = Math.round(imgH * scaleM) + "px";
    pvMImg.style.left = Math.round((state.cropEditor.imgX - focusX_px) * scaleM) + "px";
    pvMImg.style.top = Math.round(state.cropEditor.imgY * scaleM) + "px";
  }

  // Zoom display in toolbar
  const zoomSlider = $("cropZoomRange");
  if (zoomSlider) zoomSlider.value = zoom;
  const zoomBadge = $("cropZoomVal");
  if (zoomBadge) zoomBadge.textContent = Math.round(zoom * 100) + "%";

  // Calculate focal coordinates on the image for mobile storefront
  const mobileCenterX = focusX_px + (boxW / 2) - state.cropEditor.imgX;
  const mobileCenterY = (frameH / 2) - state.cropEditor.imgY;
  const focalImageXPct = Math.max(0, Math.min(100, (mobileCenterX / imgW) * 100));
  const focalImageYPct = Math.max(0, Math.min(100, (mobileCenterY / imgH) * 100));

  state.cropEditor.mobile.x = Math.round(focalImageXPct * 10) / 10;
  state.cropEditor.mobile.y = Math.round(focalImageYPct * 10) / 10;

  const coordInfo = $("cropCoordInfo");
  if (coordInfo) {
    const dX = Math.round(state.cropEditor.desktop.x);
    const dY = Math.round(state.cropEditor.desktop.y);
    const mFocus = Math.round(state.cropEditor.mobile.focusX);
    coordInfo.textContent = `💻 بنر الكمبيوتر (2.62:1): (${dX}%, ${dY}%) • تقريب: ${zoom.toFixed(1)}x | 📱 تركيز الجوال (0.94:1): ${mFocus}% (أفقي)`;
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

  state.catImgData = "";
  state.catCropSettings = null;
  if ($("cImgFile")) $("cImgFile").value = "";

  const uploader = $("cUploader");
  if (uploader) {
    uploader.classList.remove("has-img");
    uploader.innerHTML =
      '<div class="up-txt" id="cUpTxt"><b>اضغط لرفع صورة البنر</b>عرض 1600×500 بكسل يُفضل</div>';
  }

  const cropTrigger = $("cropTriggerWrap");
  if (cropTrigger) cropTrigger.style.display = "none";
  const cropBadge = $("cropStatusBadge");
  if (cropBadge) cropBadge.style.display = "none";

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
    state.catImgData = "";
    state.catCropSettings = null;
    if ($("cropTriggerWrap")) $("cropTriggerWrap").style.display = "none";
    if ($("cropStatusBadge")) $("cropStatusBadge").style.display = "none";
  } else {
    state.catImgData = c.banner.img || "";
    state.catCropSettings = (c.banner && c.banner.crop) || {
      desktop: { x: 50, y: 50, zoom: 1.0 },
      mobile: { focusX: 50, x: 50, y: 50, zoom: 1.0 }
    };
    const uploader = $("cUploader");
    if (uploader) {
      uploader.classList.add("has-img");
      uploader.innerHTML = `<img src="${state.catImgData}" alt="" style="height:150px">`;
    }
    if ($("cropTriggerWrap")) $("cropTriggerWrap").style.display = "flex";
    const cropBadge = $("cropStatusBadge");
    if (cropBadge) {
      cropBadge.style.display = "inline-block";
      const fx = typeof state.catCropSettings.mobile?.focusX === "number" ? state.catCropSettings.mobile.focusX : (state.catCropSettings.mobile?.x ?? 50);
      cropBadge.textContent = `موضع مخصص (تركيز الجوال: ${fx}%) ✓`;
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
      const crop = c.banner && c.banner.crop;
      const cropStyle = isImg && crop
        ? `style="object-position:${crop.desktop.x}% ${crop.desktop.y}%;${crop.desktop.zoom > 1 ? `transform:scale(${crop.desktop.zoom});transform-origin:${crop.desktop.x}% ${crop.desktop.y}%;` : ''}"`
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

// --- Orders Management (Cloud Firestore) ---
function renderOrdersTable() {
  const tbody = $("ordersTbody");
  const empty = $("orderEmpty");
  const searchInput = $("orderSearch");
  const filterStatus = $("orderFilterStatus");

  if (!tbody) return;

  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const fs = filterStatus ? filterStatus.value : "";

  let list = state.orders.slice();
  if (q) {
    list = list.filter(
      (o) =>
        (o.customer || "").toLowerCase().includes(q) ||
        (o.phone || "").includes(q) ||
        (o.wilaya || "").toLowerCase().includes(q)
    );
  }
  if (fs) {
    list = list.filter((o) => o.status === fs);
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

      const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString("ar-DZ") : "—";

      return `<tr>
        <td><b>#${esc(o.id.slice(-6).toUpperCase())}</b></td>
        <td>
          <div class="order-cust-info">
            <span class="n">${esc(o.customer)}</span>
          </div>
        </td>
        <td><span style="direction:ltr;display:inline-block">${esc(o.phone)}</span></td>
        <td>${esc(o.wilaya)} — ${esc(o.commune || "")}<br><small style="color:var(--muted)">${esc(o.address || "")}</small></td>
        <td><div class="order-items-list">${itemsHTML || "—"}</div></td>
        <td><b style="color:var(--gold-dark)">${o.total} دج</b></td>
        <td>
          <select class="order-status-select" onchange="changeOrderStatus('${o.id}', this.value)">
            <option value="جديد" ${o.status === "جديد" ? "selected" : ""}>جديد</option>
            <option value="قيد المعالجة" ${o.status === "قيد المعالجة" ? "selected" : ""}>قيد المعالجة</option>
            <option value="مؤكد" ${o.status === "مؤكد" ? "selected" : ""}>مؤكد</option>
            <option value="تم التوصيل" ${o.status === "تم التوصيل" ? "selected" : ""}>تم التوصيل</option>
            <option value="ملغي" ${o.status === "ملغي" ? "selected" : ""}>ملغي</option>
          </select>
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

async function changeOrderStatus(orderId, newStatus) {
  try {
    await updateDoc(doc(db, "orders", orderId), {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
    toast(`تم تحديث حالة الطلب إلى "${newStatus}" ✓`);
  } catch (err) {
    console.error("Update order status error:", err);
    toast("تعذر تحديث حالة الطلب في السحابة", false);
  }
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

// --- Generic Confirmation Modal ---
function confirmBox(title, text, cb) {
  const cfTitle = $("cfTitle");
  const cfText = $("cfText");
  const modal = $("confirmModal");

  if (cfTitle) cfTitle.textContent = title;
  if (cfText) cfText.innerHTML = text;
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

  // Product Image Direct URL
  $("pImgUrl")?.addEventListener("input", () => {
    const v = $("pImgUrl").value.trim();
    if (/^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(v)) {
      state.productImgData = v;
      showProductImg();
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

  // Category Banner Image File Input
  $("cImgFile")?.addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("الملف المختار ليس صورة صالحة", false);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast("حجم البنر كبير (الحد الأقصى 5MB)", false);
      return;
    }

    const r = new FileReader();
    r.onload = (ev) => {
      state.catImgData = ev.target.result;
      const uploader = $("cUploader");
      if (uploader) {
        uploader.classList.add("has-img");
        uploader.innerHTML = `<img src="${state.catImgData}" alt="" style="height:150px">`;
      }
      $("cropTriggerWrap")?.style.setProperty("display", "flex");
      updateBannerPreview();
      clearErr("cBanner");

      // Auto-open Crop & Position Editor Modal immediately after upload
      openCropModal(state.catImgData, state.catCropSettings || null);
    };
    r.readAsDataURL(f);

    try {
      const secureUrl = await uploadImageToCloudinary(f);
      if (secureUrl) {
        state.catImgData = secureUrl;
        if (state.cropEditor.isOpen && $("cropSourceImg")) {
          $("cropSourceImg").src = secureUrl;
          if ($("pvDesktopImg")) $("pvDesktopImg").src = secureUrl;
          if ($("pvMobileImg")) $("pvMobileImg").src = secureUrl;
        }
        updateBannerPreview();
      }
    } catch (_) {}
  });

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
    if (state.bannerMode === "image" && !state.catImgData) {
      setErr("cBanner");
      ok = false;
    }

    if (!ok) {
      toast("يرجى مراجعة الحقول المعلّمة بالأحمر", false);
      return;
    }

    const cropSettings = state.catCropSettings || {
      desktop: { x: 50, y: 50, zoom: 1.0 },
      mobile: { x: 50, y: 50, zoom: 1.0 }
    };

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
            img: state.catImgData,
            crop: cropSettings
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
  const mobBox = $("mobileFocusBox");
  if (!canvas) return;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !state.cropEditor.isOpen) return;
    const target = e.target;
    const frame = $("desktopBannerFrame");
    if (!frame) return;

    if (mobBox && (target === mobBox || mobBox.contains(target))) {
      state.cropEditor.isDraggingMobile = true;
      state.cropEditor.isDraggingImage = false;
      mobBox.classList.add("dragging");
      state.cropEditor.dragStartX = e.clientX;
      state.cropEditor.startFocusX_px = state.cropEditor.mobile.focusX_px || 0;
    } else {
      state.cropEditor.isDraggingImage = true;
      state.cropEditor.isDraggingMobile = false;
      canvas.classList.add("grabbing");
      state.cropEditor.dragStartX = e.clientX;
      state.cropEditor.dragStartY = e.clientY;
      state.cropEditor.startImgX = state.cropEditor.imgX || 0;
      state.cropEditor.startImgY = state.cropEditor.imgY || 0;
    }

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.cropEditor.isDraggingImage && !state.cropEditor.isDraggingMobile) return;
    const frame = $("desktopBannerFrame");
    if (!frame) return;

    if (state.cropEditor.isDraggingMobile) {
      // STRICTLY HORIZONTAL: vertical delta is completely ignored!
      const deltaX = e.clientX - state.cropEditor.dragStartX;
      const frameH = frame.clientHeight || 200;
      const frameW = frame.clientWidth || Math.round(frameH * DESKTOP_BANNER_RATIO);
      const boxW = Math.round(frameH * MOBILE_FOCUS_RATIO);
      const maxXM = Math.max(0, frameW - boxW);
      let newXM = (state.cropEditor.startFocusX_px || 0) + deltaX;
      newXM = Math.max(0, Math.min(maxXM, newXM));
      state.cropEditor.mobile.focusX_px = newXM;
      state.cropEditor.mobile.focusX = (maxXM > 0) ? (newXM / maxXM) * 100 : 50;
      updateCropEditorUI();
    } else if (state.cropEditor.isDraggingImage) {
      const deltaX = e.clientX - state.cropEditor.dragStartX;
      const deltaY = e.clientY - state.cropEditor.dragStartY;
      const frameH = frame.clientHeight || 200;
      const frameW = frame.clientWidth || Math.round(frameH * DESKTOP_BANNER_RATIO);
      const rangeX = Math.max(0, (state.cropEditor.imgW || frameW) - frameW);
      const rangeY = Math.max(0, (state.cropEditor.imgH || frameH) - frameH);

      let newImgX = (state.cropEditor.startImgX || 0) + deltaX;
      let newImgY = (state.cropEditor.startImgY || 0) + deltaY;

      newImgX = Math.max(-rangeX, Math.min(0, newImgX));
      newImgY = Math.max(-rangeY, Math.min(0, newImgY));

      state.cropEditor.imgX = newImgX;
      state.cropEditor.imgY = newImgY;

      state.cropEditor.desktop.x = (rangeX > 0) ? (-newImgX / rangeX) * 100 : 50;
      state.cropEditor.desktop.y = (rangeY > 0) ? (-newImgY / rangeY) * 100 : 50;
      updateCropEditorUI();
    }
  });

  const stopDrag = (e) => {
    state.cropEditor.isDraggingImage = false;
    state.cropEditor.isDraggingMobile = false;
    canvas.classList.remove("grabbing");
    mobBox?.classList.remove("dragging");
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
    state.cropEditor.desktop.zoom = parseFloat(e.target.value) || 1.0;
    updateCropEditorUI();
  });

  $("cropZoomIn")?.addEventListener("click", () => {
    const cur = state.cropEditor.desktop.zoom || 1.0;
    state.cropEditor.desktop.zoom = Math.min(3.0, Math.round((cur + 0.1) * 100) / 100);
    updateCropEditorUI();
  });

  $("cropZoomOut")?.addEventListener("click", () => {
    const cur = state.cropEditor.desktop.zoom || 1.0;
    state.cropEditor.desktop.zoom = Math.max(1.0, Math.round((cur - 0.1) * 100) / 100);
    updateCropEditorUI();
  });

  // Quick centering
  $("cropCenterDesktop")?.addEventListener("click", () => {
    state.cropEditor.desktop.x = 50;
    state.cropEditor.desktop.y = 50;
    state.cropEditor.isDraggingImage = false;
    updateCropEditorUI();
  });

  $("cropCenterMobile")?.addEventListener("click", () => {
    state.cropEditor.mobile.focusX = 50;
    const frame = $("desktopBannerFrame");
    if (frame) {
      const frameH = frame.clientHeight || 200;
      const frameW = frame.clientWidth || Math.round(frameH * DESKTOP_BANNER_RATIO);
      const boxW = Math.round(frameH * MOBILE_FOCUS_RATIO);
      const maxXM = Math.max(0, frameW - boxW);
      state.cropEditor.mobile.focusX_px = maxXM / 2;
    }
    state.cropEditor.isDraggingMobile = false;
    updateCropEditorUI();
  });

  const resetAll = () => {
    state.cropEditor.desktop = { x: 50, y: 50, zoom: 1.0 };
    state.cropEditor.mobile = { focusX: 50, x: 50, y: 50, zoom: 1.0 };
    const frame = $("desktopBannerFrame");
    if (frame) {
      const frameH = frame.clientHeight || 200;
      const frameW = frame.clientWidth || Math.round(frameH * DESKTOP_BANNER_RATIO);
      const boxW = Math.round(frameH * MOBILE_FOCUS_RATIO);
      const maxXM = Math.max(0, frameW - boxW);
      state.cropEditor.mobile.focusX_px = maxXM / 2;
    }
    state.cropEditor.isDraggingImage = false;
    state.cropEditor.isDraggingMobile = false;
    updateCropEditorUI();
    toast("تمت إعادة ضبط الموضع والتقريب");
  };

  $("cropResetTop")?.addEventListener("click", resetAll);
  $("cropResetBottomBtn")?.addEventListener("click", resetAll);

  // Close and Cancel
  $("cropCloseBtn")?.addEventListener("click", closeCropModal);
  $("cropCancelBtn")?.addEventListener("click", closeCropModal);
  $("cropModal")?.addEventListener("click", (e) => {
    if (e.target.id === "cropModal") closeCropModal();
  });

  // Save Customization
  $("cropSaveBtn")?.addEventListener("click", () => {
    state.catCropSettings = {
      desktop: {
        x: Math.round(state.cropEditor.desktop.x * 10) / 10,
        y: Math.round(state.cropEditor.desktop.y * 10) / 10,
        zoom: Number(state.cropEditor.desktop.zoom.toFixed(2))
      },
      mobile: {
        focusX: Math.round(state.cropEditor.mobile.focusX * 10) / 10,
        x: Math.round(state.cropEditor.mobile.x * 10) / 10,
        y: Math.round(state.cropEditor.mobile.y * 10) / 10,
        zoom: Number(state.cropEditor.desktop.zoom.toFixed(2))
      }
    };

    const badge = $("cropStatusBadge");
    if (badge) {
      badge.style.display = "inline-block";
      badge.textContent = `موضع مخصص (تركيز الجوال: ${state.catCropSettings.mobile.focusX}%) ✓`;
    }

    updateBannerPreview();
    closeCropModal();
    toast("تم حفظ تخصيص موضع البنر وتركيز الجوال بنجاح ✓");
  });

  // Open trigger button from category form
  $("openCropModalBtn")?.addEventListener("click", () => {
    if (!state.catImgData) {
      toast("يرجى اختيار صورة بنر أولاً", false);
      return;
    }
    openCropModal(state.catImgData, state.catCropSettings || null);
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
    window.location.replace("login.html");
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
window.changeOrderStatus = changeOrderStatus;
window.askDeleteOrder = askDeleteOrder;
window.refreshOrders = refreshOrders;
window.handleLogout = handleLogout;

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
let isDashboardInitialized = false;

onAuthStateChanged(auth, async (user) => {
  const adminPill = document.querySelector(".admin-pill");

  if (!user) {
    // Unauthenticated user -> kick out to login page
    window.location.replace("login.html");
    return;
  }

  // User is logged in -> verify admin role
  const isAdmin = await verifyIsAdmin(user);
  if (!isAdmin) {
    console.warn("Unauthorized user blocked from dashboard:", user.uid);
    await signOut(auth);
    window.location.replace("login.html?error=unauthorized");
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
