/* ==========================================================================
   ALNOOR SHIRTS — Admin Dashboard Logic
   Pure Vanilla JavaScript with LocalStorage Persistence,
   Live Previews, Cloudinary Upload Support & Frontend Code Exporter
   ========================================================================== */

import { auth, uploadImageToCloudinary } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// --- Storage Keys & Utilities ---
const LS_P = "alnoor_admin_products";
const LS_C = "alnoor_admin_cats";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const $ = (id) => document.getElementById(id);

// --- Default Demo Data (Matches Storefront 100%) ---
const DEMO_CATS = [
  {
    id: "c1",
    name: "كلاسيك",
    msg: "الأناقة الخالدة بلمسة عصرية تليق بك في كل مناسبة",
    banner: { type: "color", c1: "#1d1a16", c2: "#b99a6b", img: "" },
    desc: "",
    active: true
  },
  {
    id: "c2",
    name: "كاجوال",
    msg: "راحة يومية بأسلوب شبابي جريء",
    banner: { type: "color", c1: "#31405f", c2: "#1f2a44", img: "" },
    desc: "",
    active: true
  },
  {
    id: "c3",
    name: "فاخر",
    msg: "خامات نادرة وقصّات استثنائية لإطلالة لا تُنسى",
    banner: { type: "color", c1: "#3f4030", c2: "#b99a6b", img: "" },
    desc: "",
    active: true
  }
];

const DEMO_PRODUCTS = [
  {
    id: "p1",
    name: "قميص كلاسيك فاخر",
    price: 299,
    oldPrice: 380,
    img: "img/p1.png",
    badge: "الأكثر مبيعاً",
    colors: ["#f5f2ea", "#dcd5c8", "#b99a6b"],
    colorNames: ["أبيض عاجي", "بيج فاتح", "ذهبي"],
    sizes: ["S", "M", "L", "XL"],
    stock: 25,
    status: "active",
    desc: "قميص قطني 100% بقصّة عصرية وخياطة متقنة.",
    categoryId: "c1"
  },
  {
    id: "p2",
    name: "قميص كلاسيك أسود",
    price: 320,
    oldPrice: null,
    img: "img/p2.png",
    badge: "",
    colors: ["#1d1a16", "#3a352f", "#6b6357"],
    colorNames: ["أسود", "رمادي داكن", "بني"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stock: 18,
    status: "active",
    desc: "",
    categoryId: "c1"
  },
  {
    id: "p3",
    name: "قميص بأزرار أنيقة",
    price: 320,
    oldPrice: 365,
    img: "img/p3.png",
    badge: "",
    colors: ["#a9c8e8", "#7fa8cf", "#dce8f5"],
    colorNames: ["أزرق سماوي", "أزرق متوسط", "أزرق فاتح"],
    sizes: ["S", "M", "L", "XL"],
    stock: 30,
    status: "active",
    desc: "",
    categoryId: "c3"
  },
  {
    id: "p4",
    name: "قميص كلاسيك بيج",
    price: 340,
    oldPrice: null,
    img: "img/p4.png",
    badge: "",
    colors: ["#e8ddcb", "#c9b8a0", "#8a8277"],
    colorNames: ["بيج", "رملي", "رمادي"],
    sizes: ["M", "L", "XL"],
    stock: 12,
    status: "active",
    desc: "",
    categoryId: "c1"
  },
  {
    id: "p5",
    name: "قميص كتان فاخر",
    price: 360,
    oldPrice: 430,
    img: "img/p5.png",
    badge: "حصري",
    colors: ["#5a5b45", "#3f4030", "#7c7d63"],
    colorNames: ["زيتوني", "زيتوني داكن", "أخضر فاتح"],
    sizes: ["S", "M", "L", "XL"],
    stock: 8,
    status: "active",
    desc: "",
    categoryId: "c3"
  },
  {
    id: "p6",
    name: "قميص مخطط أنيق",
    price: 290,
    oldPrice: 350,
    img: "img/p6.png",
    badge: "",
    colors: ["#c5d3ea", "#8fa8cc", "#ffffff"],
    colorNames: ["أزرق مخطط", "أزرق داكن", "أبيض مخطط"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stock: 22,
    status: "active",
    desc: "",
    categoryId: "c2"
  },
  {
    id: "p7",
    name: "قميص كحلي فاخر",
    price: 340,
    oldPrice: null,
    img: "img/p7.png",
    badge: "",
    colors: ["#1f2a44", "#31405f", "#6b7a99"],
    colorNames: ["كحلي", "كحلي فاتح", "رمادي أزرق"],
    sizes: ["S", "M", "L", "XL"],
    stock: 15,
    status: "active",
    desc: "",
    categoryId: "c3"
  },
  {
    id: "p8",
    name: "قميص قطن فاخر",
    price: 320,
    oldPrice: null,
    img: "img/p8.png",
    badge: "",
    colors: ["#f5f2ea", "#ffffff", "#dcd5c8"],
    colorNames: ["عاجي", "أبيض", "بيج فاتح"],
    sizes: ["S", "M", "L", "XL"],
    stock: 0,
    status: "active",
    desc: "",
    categoryId: "c2"
  }
];

// --- Application State ---
function loadStorage(key, fallback) {
  try {
    const val = JSON.parse(localStorage.getItem(key));
    return Array.isArray(val) && val.length ? val : JSON.parse(JSON.stringify(fallback));
  } catch (e) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

let products = loadStorage(LS_P, DEMO_PRODUCTS);
let cats = loadStorage(LS_C, DEMO_CATS);

let editingProductId = null;
let editingCatId = null;
let productImgData = "";
let catImgData = "";
let bannerMode = "color";
let confirmCb = null;

function saveAll() {
  localStorage.setItem(LS_P, JSON.stringify(products));
  localStorage.setItem(LS_C, JSON.stringify(cats));
  refresh();
}

// --- Toast System ---
function toast(msg, ok = true) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "show " + (ok ? "ok" : "err");
  clearTimeout(t._h);
  t._h = setTimeout(() => {
    t.className = "";
  }, 2600);
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

// --- Global Stats & Refresh ---
function refresh() {
  const cntProducts = $("cntProducts");
  const cntCats = $("cntCats");
  const stProducts = $("stProducts");
  const stCats = $("stCats");
  const stSale = $("stSale");
  const stStock = $("stStock");

  if (cntProducts) cntProducts.textContent = products.length;
  if (cntCats) cntCats.textContent = cats.length;
  if (stProducts) stProducts.textContent = products.length;
  if (stCats) stCats.textContent = cats.length;

  if (stSale) {
    stSale.textContent = products.filter((p) => p.oldPrice && p.oldPrice > p.price).length;
  }
  if (stStock) {
    stStock.textContent = products.reduce((sum, p) => sum + (+p.stock || 0), 0);
  }

  fillCatSelects();
  renderProductsTable();
  renderCatsGrid();
}

// --- Category Select Dropdowns ---
function fillCatSelects() {
  const pCat = $("pCategory");
  const fCat = $("prodFilterCat");

  const opts =
    '<option value="">— اختر التصنيف —</option>' +
    cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

  if (pCat) pCat.innerHTML = opts;

  if (fCat) {
    fCat.innerHTML =
      '<option value="">كل التصنيفات</option>' +
      cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  }
}

// --- Product Form Handlers & Live Previews ---
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
  uploader.innerHTML = `<img src="${productImgData}" alt="صورة المنتج">`;
}

function clearProductImage() {
  productImgData = "";
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

// Image File Upload with Cloudinary Support
async function handleProductImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("الملف المختار ليس صورة صالحة", false);
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    toast("حجم الصورة كبير (الحد الأقصى 4MB)", false);
    return;
  }

  // Instant local preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    productImgData = ev.target.result;
    showProductImg();
    clearErr("pImg");
  };
  reader.readAsDataURL(file);

  // Background upload to Cloudinary for permanent CDN link
  try {
    toast("جاري رفع الصورة إلى السحابة...", true);
    const secureUrl = await uploadImageToCloudinary(file);
    if (secureUrl) {
      productImgData = secureUrl;
      showProductImg();
      toast("تم حفظ الصورة على السحابة بنجاح ✓", true);
    }
  } catch (err) {
    console.info("Cloudinary upload fallback to local data URL:", err.message);
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
      toast("يجب أن يبقى لون واحد على الأقل للمنتج", false);
      return;
    }
    row.remove();
  });

  list.appendChild(row);
}

function getColors() {
  const out = [];
  document.querySelectorAll("#colorsList .color-item").forEach((r) => {
    const hex = r.querySelector("input[type=color]").value;
    const name = r.querySelector("input[type=text]").value.trim();
    out.push({ hex, name });
  });
  return out;
}

// Error Helpers
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

  editingProductId = null;
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
  }

  const cancelBtn = $("pCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "none";
}

// Edit Product
function editProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;

  editingProductId = id;
  $("pName").value = p.name;
  $("pCategory").value = p.categoryId;
  $("pPrice").value = p.price;
  $("pOldPrice").value = p.oldPrice || "";
  updateDiscPreview();

  productImgData = p.img;
  showProductImg();

  // Badges
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

  $("pStock").value = p.stock !== undefined ? p.stock : 20;
  $("pDesc").value = p.desc || "";

  const statusRadio = document.querySelector(`input[name="pStatus"][value="${p.status || "active"}"]`);
  if (statusRadio) statusRadio.checked = true;

  // Colors
  const colorsList = $("colorsList");
  if (colorsList) colorsList.innerHTML = "";
  if (Array.isArray(p.colors) && p.colors.length) {
    p.colors.forEach((c, i) => addColorLine(c, p.colorNames ? p.colorNames[i] || "" : ""));
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
      حفظ التعديلات
    `;
  }

  const cancelBtn = $("pCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  switchView("dash", document.querySelector('[data-view="dash"]'));
  window.scrollTo({ top: 0, behavior: "smooth" });
  toast('تعديل "' + p.name + '" — قم بتعديل البيانات واضغط حفظ');
}

function cancelProductEdit() {
  resetProductForm();
  toast("تم إلغاء التعديل");
}

// Delete Product Flow
function askDeleteProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;

  confirmBox(
    "حذف المنتج",
    `سيتم حذف "${esc(p.name)}" نهائياً من المتجر. لا يمكن التراجع عن هذا الإجراء.`,
    () => {
      products = products.filter((x) => x.id !== id);
      saveAll();
      toast("تم حذف المنتج بنجاح ✓");
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

  let list = products.slice();

  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
  if (fc) list = list.filter((p) => p.categoryId === fc);
  if (fs === "active") list = list.filter((p) => p.status === "active" && +p.stock > 0);
  if (fs === "hidden") list = list.filter((p) => p.status === "hidden");
  if (fs === "sale") list = list.filter((p) => p.oldPrice && p.oldPrice > p.price);
  if (fs === "out") list = list.filter((p) => +p.stock === 0);

  if (emptyState) emptyState.style.display = list.length ? "none" : "block";

  tbody.innerHTML = list
    .map((p) => {
      const cat = cats.find((c) => c.id === p.categoryId);
      const disc =
        p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;

      const stockTag =
        +p.stock === 0
          ? '<span class="tag red">نفدت الكمية</span>'
          : +p.stock < 10
          ? `<span class="tag red">متبقي ${p.stock}</span>`
          : `<span class="tag green">متوفر (${p.stock})</span>`;

      const statusTag = p.status === "hidden" ? '<span class="tag gray">مخفي</span>' : "";

      const colorsDots = (p.colors || [])
        .map((c) => `<span class="c-dot" style="background:${c}"></span>`)
        .join("");

      return `<tr>
        <td>
          <div class="t-prod">
            <img src="${esc(p.img)}" alt="${esc(p.name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'46\\' height=\\'52\\' viewBox=\\'0 0 24 24\\'><rect width=\\'24\\' height=\\'24\\' fill=\\'%23e7e1d7\\'/></svg>'">
            <div>
              <div class="n">${esc(p.name)}</div>
              <div class="c">${cat ? esc(cat.name) : "بدون تصنيف"}</div>
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
        <td>${stockTag}</td>
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

  if (bannerMode === "image" && catImgData) {
    pv.style.background = "#1d1a16";
    pv.querySelector("img")?.remove();
    const im = document.createElement("img");
    im.src = catImgData;
    pv.insertBefore(im, pv.firstChild);
  } else {
    pv.querySelector("img")?.remove();
    pv.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  }
}

function resetCatForm() {
  const form = $("categoryForm");
  if (form) form.reset();

  if ($("cColor1")) $("cColor1").value = "#1d1a16";
  if ($("cColor2")) $("cColor2").value = "#b99a6b";

  bannerMode = "color";
  const bannerSeg = $("bannerSeg");
  if (bannerSeg) {
    bannerSeg.querySelectorAll("button").forEach((btn, i) => btn.classList.toggle("on", i === 0));
  }

  if ($("bannerColorBox")) $("bannerColorBox").style.display = "block";
  if ($("bannerImgBox")) $("bannerImgBox").style.display = "none";

  catImgData = "";
  if ($("cImgFile")) $("cImgFile").value = "";

  const uploader = $("cUploader");
  if (uploader) {
    uploader.classList.remove("has-img");
    uploader.innerHTML =
      '<div class="up-txt" id="cUpTxt"><b>اضغط لرفع صورة البنر</b>عرض 1600×500 بكسل يُفضل</div>';
  }

  editingCatId = null;
  const modeTag = $("catFormMode");
  if (modeTag) modeTag.textContent = "نموذج إضافة";

  const cancelBtn = $("cCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "none";

  updateBannerPreview();
}

function editCat(id) {
  const c = cats.find((x) => x.id === id);
  if (!c) return;

  editingCatId = id;
  $("cName").value = c.name;
  $("cMsg").value = c.msg;
  $("cDesc").value = c.desc || "";

  bannerMode = (c.banner && c.banner.type) || "color";
  const bannerSeg = $("bannerSeg");
  if (bannerSeg) {
    bannerSeg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", b.dataset.v === bannerMode);
    });
  }

  if ($("bannerColorBox")) $("bannerColorBox").style.display = bannerMode === "color" ? "block" : "none";
  if ($("bannerImgBox")) $("bannerImgBox").style.display = bannerMode === "image" ? "block" : "none";

  if (bannerMode === "color") {
    if ($("cColor1")) $("cColor1").value = c.banner.c1 || "#1d1a16";
    if ($("cColor2")) $("cColor2").value = c.banner.c2 || "#b99a6b";
    catImgData = "";
  } else {
    catImgData = c.banner.img || "";
    const uploader = $("cUploader");
    if (uploader) {
      uploader.classList.add("has-img");
      uploader.innerHTML = `<img src="${catImgData}" alt="" style="height:150px">`;
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

  toast('تعديل تصنيف "' + c.name + '" — عدّل البيانات ثم اضغط حفظ');
}

function cancelCatEdit() {
  resetCatForm();
  toast("تم إلغاء التعديل");
}

function askDeleteCat(id) {
  const c = cats.find((x) => x.id === id);
  if (!c) return;

  const count = products.filter((p) => p.categoryId === id).length;
  const extra = count
    ? `<br><b style="color:var(--red)">تحذير: يوجد ${count} منتج مرتبط بهذا التصنيف — سيبقى بدون تصنيف.</b>`
    : "";

  confirmBox("حذف التصنيف", `سيتم حذف تصنيف "${esc(c.name)}" نهائياً.${extra}`, () => {
    cats = cats.filter((x) => x.id !== id);
    saveAll();
    toast("تم حذف التصنيف بنجاح ✓");
  });
}

function renderCatsGrid() {
  const grid = $("catsGrid");
  const empty = $("catEmpty");
  if (!grid) return;

  if (empty) empty.style.display = cats.length ? "none" : "block";

  grid.innerHTML = cats
    .map((c) => {
      const n = products.filter((p) => p.categoryId === c.id).length;
      const isImg = c.banner && c.banner.type === "image" && c.banner.img;
      const bg = isImg ? `<img src="${esc(c.banner.img)}" alt="">` : "";
      const style = isImg
        ? ""
        : `style="background:linear-gradient(135deg,${(c.banner && c.banner.c1) || "#1d1a16"},${(c.banner && c.banner.c2) || "#b99a6b"})"`;

      return `<div class="cat-card">
        <div class="cat-banner" ${style}>
          ${bg}
          <div class="cb-txt">
            <div class="cb-k">ALNOOR COLLECTION</div>
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

// --- Generic Confirmation Modal ---
function confirmBox(title, text, cb) {
  const cfTitle = $("cfTitle");
  const cfText = $("cfText");
  const modal = $("confirmModal");

  if (cfTitle) cfTitle.textContent = title;
  if (cfText) cfText.innerHTML = text;
  confirmCb = cb;
  if (modal) modal.classList.add("open");
}

// --- Exporter for Storefront Code ---
function buildExport() {
  const pl = products.map((p) => {
    const o = {
      name: p.name,
      price: p.price,
      img: p.img,
      colors: p.colors || [],
      colorNames: p.colorNames || []
    };
    if (p.oldPrice && p.oldPrice > p.price) o.oldPrice = p.oldPrice;
    if (p.badge) o.badge = p.badge;
    return o;
  });

  const cl = cats.map((c) => ({
    name: c.name,
    msg: c.msg,
    banner: c.banner,
    desc: c.desc || ""
  }));

  return (
    "/* ===== الصق هذا الكود في index.html / product.html ===== */\n" +
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
  a.download = "alnoor-data.js";
  a.click();
  toast("تم تنزيل الملف ✓");
}

function askReset() {
  confirmBox(
    "إعادة تعيين كل البيانات",
    "سيتم حذف كل المنتجات والتصنيفات المضافة واستعادة البيانات التجريبية الأصلية.",
    () => {
      localStorage.removeItem(LS_P);
      localStorage.removeItem(LS_C);
      products = JSON.parse(JSON.stringify(DEMO_PRODUCTS));
      cats = JSON.parse(JSON.stringify(DEMO_CATS));
      saveAll();
      resetProductForm();
      resetCatForm();
      toast("تمت إعادة تعيين البيانات بنجاح");
    }
  );
}

// --- Event Listeners Setup ---
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

  // Price & Old Price live listeners
  $("pPrice")?.addEventListener("input", updateDiscPreview);
  $("pOldPrice")?.addEventListener("input", updateDiscPreview);

  // Product Image File Input
  $("pImgFile")?.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleProductImageFile(e.target.files[0]);
    }
  });

  // Product Image Direct URL
  $("pImgUrl")?.addEventListener("input", () => {
    const v = $("pImgUrl").value.trim();
    if (/^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(v)) {
      productImgData = v;
      showProductImg();
      clearErr("pImg");
    }
  });

  // Validation auto-clearers
  ["pName", "pCategory", "pPrice", "pOldPrice", "pStock", "cName", "cMsg"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", () => clearErr(id));
      el.addEventListener("change", () => clearErr(id));
    }
  });

  // Product Form Submit
  $("productForm")?.addEventListener("submit", (e) => {
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

    const stock = $("pStock") ? $("pStock").value : 20;
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
    if (products.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingProductId)) {
      markErr("pName");
      toast("يوجد منتج بنفس الاسم مسبقاً", false);
      ok = false;
    }
    if (!catId) {
      markErr("pCategory");
      ok = false;
    }
    if (!productImgData) {
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
    if (stock === "" || +stock < 0) {
      markErr("pStock");
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

    const data = {
      name,
      categoryId: catId,
      price,
      oldPrice,
      img: productImgData,
      badge,
      colors: colors.map((c) => c.hex),
      colorNames: colors.map((c) => c.name),
      sizes,
      stock: +stock,
      status,
      desc
    };

    if (editingProductId) {
      const idx = products.findIndex((p) => p.id === editingProductId);
      if (idx !== -1) {
        products[idx] = { ...products[idx], ...data };
        toast("تم تحديث المنتج بنجاح ✓");
      }
    } else {
      products.unshift({ id: uid(), ...data });
      toast('تمت إضافة "' + name + '" للمتجر بنجاح ✓');
    }

    saveAll();
    resetProductForm();
  });

  // Banner Segmented Control
  const bannerSeg = $("bannerSeg");
  if (bannerSeg) {
    bannerSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      bannerSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      bannerMode = b.dataset.v;
      if ($("bannerColorBox")) $("bannerColorBox").style.display = bannerMode === "color" ? "block" : "none";
      if ($("bannerImgBox")) $("bannerImgBox").style.display = bannerMode === "image" ? "block" : "none";
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
    if (f.size > 4 * 1024 * 1024) {
      toast("حجم البنر كبير (الحد الأقصى 4MB)", false);
      return;
    }

    const r = new FileReader();
    r.onload = (ev) => {
      catImgData = ev.target.result;
      const uploader = $("cUploader");
      if (uploader) {
        uploader.classList.add("has-img");
        uploader.innerHTML = `<img src="${catImgData}" alt="" style="height:150px">`;
      }
      updateBannerPreview();
      clearErr("cBanner");
    };
    r.readAsDataURL(f);

    try {
      const secureUrl = await uploadImageToCloudinary(f);
      if (secureUrl) {
        catImgData = secureUrl;
        updateBannerPreview();
      }
    } catch (_) {}
  });

  // Category Form Submit
  $("categoryForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("cName") ? $("cName").value.trim() : "";
    const msg = $("cMsg") ? $("cMsg").value.trim() : "";
    const desc = $("cDesc") ? $("cDesc").value.trim() : "";

    let ok = true;
    if (name.length < 2) {
      markErr("cName");
      ok = false;
    }
    if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCatId)) {
      markErr("cName");
      toast("يوجد تصنيف بنفس الاسم مسبقاً", false);
      ok = false;
    }
    if (msg.length < 5) {
      markErr("cMsg");
      ok = false;
    }
    if (bannerMode === "image" && !catImgData) {
      setErr("cBanner");
      ok = false;
    }

    if (!ok) {
      toast("يرجى مراجعة الحقول المعلّمة بالأحمر", false);
      return;
    }

    const banner =
      bannerMode === "color"
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
            img: catImgData
          };

    if (editingCatId) {
      const idx = cats.findIndex((c) => c.id === editingCatId);
      if (idx !== -1) {
        cats[idx] = { ...cats[idx], name, msg, banner, desc };
        toast("تم تحديث التصنيف بنجاح ✓");
      }
    } else {
      cats.push({ id: uid(), name, msg, banner, desc, active: true });
      toast('تمت إضافة تصنيف "' + name + '" بنجاح ✓');
    }

    saveAll();
    resetCatForm();
  });

  // Confirmation Modal Listeners
  $("cfYes")?.addEventListener("click", () => {
    $("confirmModal")?.classList.remove("open");
    if (confirmCb) confirmCb();
  });

  $("confirmModal")?.addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") e.target.classList.remove("open");
  });

  $("exportModal")?.addEventListener("click", (e) => {
    if (e.target.id === "exportModal") e.target.classList.remove("open");
  });
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

// --- Firebase Authentication Guard (Optional / Non-blocking) ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    const adminPill = document.querySelector(".admin-pill");
    if (adminPill) {
      adminPill.title = user.email || "مدير النظام";
    }
  }
});

// --- Initialize Everything on DOM Ready ---
document.addEventListener("DOMContentLoaded", () => {
  initEvents();
  addColorLine("#f5f2ea", "أبيض عاجي");
  addColorLine("#1d1a16", "أسود");
  updateBannerPreview();
  refresh();
});

// Immediate execution fallback if already parsed
initEvents();
addColorLine("#f5f2ea", "أبيض عاجي");
addColorLine("#1d1a16", "أسود");
updateBannerPreview();
refresh();
