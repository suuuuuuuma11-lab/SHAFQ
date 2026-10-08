import { db } from "./firebase-config.js";
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { initCartUI, addToCart, sendTelegramOrderNotification } from "./cart.js";
import { setupWilayaCommuneCascade } from "./locations.js";
import { loadActiveShippingSettings, getInitialShippingSettings, getShippingPrice, findWilaya } from "./shipping.js";

// Telegram Bot token is strictly stored on server-side (/api/telegram) and never exposed to the browser.

const defaultSizes = ["S","M","L","XL","XXL"];

// Safe HTML Escape
function esc(s){ return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

let products = [];
let currentProduct = null;
let qty = 1;
let selectedSize = "M";
let selectedColorIndex = 0;
let favsP = new Set(JSON.parse(localStorage.getItem('alnoor_favs') || '[]'));

// URL Params
const params = new URLSearchParams(location.search);
const idParam = params.get("id");

/* Wilayas & Communes dropdown setup (Official 69 Wilayas & 1541 Communes) */
setupWilayaCommuneCascade({
  wilayaSelectId: "wilaya",
  communeSelectId: "commune",
  wilayaFieldId: "fWilaya",
  communeFieldId: "fCommune"
});

function toast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2400);
}

let activeShippingSettings = getInitialShippingSettings();

function getSelectedDeliveryMethod() {
  const checked = document.querySelector('input[name="deliveryMethod"]:checked');
  return checked ? checked.value : "home";
}

function updateProductCheckoutPricing() {
  const wilayaSelect = document.getElementById("wilaya");
  const wilayaVal = wilayaSelect ? wilayaSelect.value : "";
  const method = getSelectedDeliveryMethod();

  const homePriceEl = document.getElementById("homePriceDisplay");
  const stopDeskPriceEl = document.getElementById("stopDeskPriceDisplay");
  const opsSubtotalEl = document.getElementById("opsSubtotal");
  const opsShippingEl = document.getElementById("opsShipping");
  const opsMethodLabelEl = document.getElementById("opsMethodLabel");
  const opsTotalEl = document.getElementById("opsTotal");
  const cardHome = document.getElementById("cardHome");
  const cardStopDesk = document.getElementById("cardStopDesk");

  if (cardHome) cardHome.classList.toggle("active", method === "home");
  if (cardStopDesk) cardStopDesk.classList.toggle("active", method === "stopDesk");

  const rates = (activeShippingSettings && activeShippingSettings.rates) ? activeShippingSettings.rates : null;
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

  const currentPrice = currentProduct ? currentProduct.price : 0;
  const subtotal = currentPrice * qty;
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
}

// Initialize shipping rates
loadActiveShippingSettings().then((settings) => {
  activeShippingSettings = settings;
  updateProductCheckoutPricing();
});

// Attach delivery option clicks & wilaya change listeners
document.addEventListener("DOMContentLoaded", () => {
  setupDeliveryListeners();
});
setTimeout(setupDeliveryListeners, 200);

function setupDeliveryListeners() {
  document.querySelectorAll('input[name="deliveryMethod"]').forEach((radio) => {
    radio.addEventListener("change", () => updateProductCheckoutPricing());
  });
  document.getElementById("cardHome")?.addEventListener("click", () => {
    const r = document.querySelector('input[name="deliveryMethod"][value="home"]');
    if (r) { r.checked = true; updateProductCheckoutPricing(); }
  });
  document.getElementById("cardStopDesk")?.addEventListener("click", () => {
    const r = document.querySelector('input[name="deliveryMethod"][value="stopDesk"]');
    if (r) { r.checked = true; updateProductCheckoutPricing(); }
  });
  document.getElementById("wilaya")?.addEventListener("change", () => {
    updateProductCheckoutPricing();
  });
}

function changeQty(d){
  qty = Math.max(1, qty + d);
  const qtyEl = document.getElementById("qty");
  const totalEl = document.getElementById("total");
  if (qtyEl) qtyEl.textContent = qty;
  if (totalEl && currentProduct) {
    totalEl.textContent = (currentProduct.price * qty).toLocaleString('ar-DZ') + " دج";
  }
  updateProductCheckoutPricing();
}
window.changeQty = changeQty;

function renderProductDetails(p) {
  currentProduct = p;
  document.title = "حجاج | " + p.name;
  
  const crumbEl = document.getElementById("crumb");
  const nameEl = document.getElementById("pName");
  const priceEl = document.getElementById("pPrice");
  const imgEl = document.getElementById("pImg");
  const badgeEl = document.getElementById("pBadge");
  const colorsEl = document.getElementById("pColors");
  const colorNameEl = document.getElementById("colorName");
  const sizesEl = document.getElementById("pSizes");

  if (crumbEl) crumbEl.textContent = p.name;
  if (nameEl) nameEl.textContent = p.name;
  if (priceEl) priceEl.textContent = p.price;
  
  const mainImg = p.img || p.mainImage || 'img/p1.png';
  const imgSkel = document.getElementById("pImgSkeleton");

  if (imgEl) {
    imgEl.alt = p.name;

    const onImageLoaded = () => {
      imgEl.src = mainImg;
      imgEl.style.opacity = "1";
      if (imgSkel) {
        imgSkel.style.opacity = "0";
        setTimeout(() => {
          if (imgSkel && imgSkel.parentNode) imgSkel.style.display = "none";
        }, 250);
      }
    };

    // Preload image so skeleton stays until the image pixels are actually downloaded
    const preloader = new Image();
    preloader.onload = onImageLoaded;
    preloader.onerror = () => {
      imgEl.src = 'img/p1.png';
      imgEl.style.opacity = "1";
      if (imgSkel) {
        imgSkel.style.opacity = "0";
        setTimeout(() => {
          if (imgSkel && imgSkel.parentNode) imgSkel.style.display = "none";
        }, 250);
      }
    };
    preloader.src = mainImg;
  }
  
  if (badgeEl) {
    if (p.badge) {
      badgeEl.textContent = p.badge;
      badgeEl.style.display = "inline-block";
    } else {
      badgeEl.style.display = "none";
    }
  }

  // Render colors
  const colorList = Array.isArray(p.colors) && p.colors.length > 0 ? p.colors : [{ name: "افتراضي", value: "#1d1a16" }];
  selectedColorIndex = 0;
  if (colorsEl) {
    colorsEl.innerHTML = colorList.map((c, i) => {
      const val = typeof c === 'object' ? c.value : c;
      const nm = typeof c === 'object' ? c.name : (p.colorNames && p.colorNames[i] ? p.colorNames[i] : 'لون');
      return `<span class="dot ${i === 0 ? 'active' : ''}" style="background:${val}" title="${esc(nm)}" data-idx="${i}" data-name="${esc(nm)}"></span>`;
    }).join("");

    colorsEl.querySelectorAll('.dot').forEach(dot => {
      dot.addEventListener('click', () => {
        colorsEl.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        selectedColorIndex = parseInt(dot.dataset.idx, 10);
        if (colorNameEl) colorNameEl.textContent = dot.dataset.name;
      });
    });
  }

  const initialColorName = typeof colorList[0] === 'object' ? colorList[0].name : (p.colorNames && p.colorNames[0] ? p.colorNames[0] : 'لون');
  if (colorNameEl) colorNameEl.textContent = initialColorName;

  // Render sizes
  const sizeList = Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes : defaultSizes;
  selectedSize = sizeList[0] || "M";
  if (sizesEl) {
    sizesEl.innerHTML = sizeList.map((s, i) => `<span class="size ${i === 0 ? 'active' : ''}" data-val="${esc(s)}">${esc(s)}</span>`).join("");
    sizesEl.querySelectorAll('.size').forEach(sz => {
      sz.addEventListener('click', () => {
        sizesEl.querySelectorAll('.size').forEach(x => x.classList.remove('active'));
        sz.classList.add('active');
        selectedSize = sz.dataset.val;
      });
    });
  }

  changeQty(0);

  // Transition info skeleton to real form
  const infoSkel = document.getElementById("pInfoSkel");
  const formWrap = document.getElementById("formWrap");
  if (infoSkel) {
    infoSkel.classList.add("fade-out");
    setTimeout(() => {
      if (infoSkel && infoSkel.parentNode) infoSkel.style.display = "none";
    }, 220);
  }
  if (formWrap) {
    formWrap.style.display = "block";
    requestAnimationFrame(() => {
      formWrap.classList.add("is-visible");
    });
  }

  // Favorites button
  const favBtn = document.getElementById('favBtn');
  if (favBtn) {
    favBtn.style.opacity = '1';
    favBtn.classList.toggle('liked', favsP.has(p.id));
  }
}


/* favorites: restore + persist */
const favBtn = document.getElementById('favBtn');
if (favBtn) {
  favBtn.addEventListener('click', () => {
    if (!currentProduct) return;
    const id = currentProduct.id;
    if (favsP.has(id)) {
      favsP.delete(id);
      favBtn.classList.remove('liked');
      toast('أُزيل من المفضلة');
    } else {
      favsP.add(id);
      favBtn.classList.add('liked');
      toast('أُضيف إلى المفضلة ♥');
    }
    localStorage.setItem('alnoor_favs', JSON.stringify([...favsP]));
  });
}

/* add to cart with complete variant metadata */
const addCartBtn = document.getElementById('addCartBtn');
if (addCartBtn) {
  function setProductBtnFeedback(duration = 1500) {
    if (addCartBtn._resetTimer) {
      clearTimeout(addCartBtn._resetTimer);
      addCartBtn._resetTimer = null;
    }
    addCartBtn.classList.add('added');
    addCartBtn.style.removeProperty('background');
    addCartBtn.style.removeProperty('background-color');
    addCartBtn.style.removeProperty('border-color');
    addCartBtn.style.removeProperty('color');
    addCartBtn.textContent = '✓ تمت الإضافة إلى السلة';

    addCartBtn._resetTimer = setTimeout(() => {
      resetProductBtnFeedback();
    }, duration);
  }

  function resetProductBtnFeedback() {
    if (addCartBtn._resetTimer) {
      clearTimeout(addCartBtn._resetTimer);
      addCartBtn._resetTimer = null;
    }
    addCartBtn.classList.remove('added');
    addCartBtn.style.removeProperty('background');
    addCartBtn.style.removeProperty('background-color');
    addCartBtn.style.removeProperty('border-color');
    addCartBtn.style.removeProperty('color');
    addCartBtn.textContent = '🛒 إضافة إلى السلة';
    addCartBtn._busy = false;
  }

  addCartBtn.addEventListener('click', () => {
    if (addCartBtn._busy || !currentProduct) return;
    addCartBtn._busy = true;
    setTimeout(() => { addCartBtn._busy = false; }, 250);

    const colorsList = Array.isArray(currentProduct.colors) && currentProduct.colors.length > 0 ? currentProduct.colors : [{ name: "افتراضي", value: "#1d1a16" }];
    const chosenColor = colorsList[selectedColorIndex] || colorsList[0];
    const colorName = typeof chosenColor === 'object' ? chosenColor.name : (currentProduct.colorNames && currentProduct.colorNames[selectedColorIndex] ? currentProduct.colorNames[selectedColorIndex] : 'لون');
    const colorHex = typeof chosenColor === 'object' ? chosenColor.value : chosenColor;

    addToCart({
      productId: currentProduct.id,
      name: currentProduct.name,
      price: currentProduct.price,
      image: currentProduct.img || currentProduct.mainImage || 'img/p1.png',
      quantity: qty,
      size: selectedSize,
      color: colorName,
      colorHex: colorHex,
      availableSizes: Array.isArray(currentProduct.sizes) && currentProduct.sizes.length ? currentProduct.sizes : defaultSizes,
      availableColors: colorsList,
      openDrawer: false
    });

    setProductBtnFeedback(1500);
  });
}

// Initialize Unified Shopping Cart & Checkout
initCartUI();

/* search overlay */
const sOverlay = document.getElementById('searchOverlay');
const sInput = document.getElementById('searchInput');
const sResults = document.getElementById('searchResults');

document.getElementById('searchBtn')?.addEventListener('click', () => {
  sOverlay?.classList.add('show');
  setTimeout(()=>sInput?.focus(), 80);
});
document.getElementById('searchClose')?.addEventListener('click', closeSearch);
sOverlay?.addEventListener('click', e => { if(e.target === sOverlay) closeSearch(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeSearch(); closeCart(); } });
function closeSearch(){
  sOverlay?.classList.remove('show');
  if (sInput) sInput.value = '';
  if (sResults) sResults.innerHTML = '';
}

sInput?.addEventListener('input', () => {
  const q = sInput.value.trim().toLowerCase();
  if(!q){ if(sResults) sResults.innerHTML = ''; return; }
  const hits = products.filter(pr => pr.name.toLowerCase().includes(q));
  if(sResults) {
    sResults.innerHTML = hits.length ? hits.map(pr => `
      <a class="sr-item" href="/product?id=${encodeURIComponent(pr.id)}">
        <img src="${esc(pr.img || pr.mainImage)}" alt="${esc(pr.name)}">
        <div><div class="sr-name">${esc(pr.name)}</div><div class="sr-price">${pr.price} دج</div></div>
      </a>`).join('') : '<div class="search-empty">لا توجد نتائج مطابقة لبحثك</div>';
  }
});

// --- Dynamic Firestore Categories Synchronization ---
let categoriesList = [];
let isCatsLoaded = false;
let currentTargetProduct = null;

function initCategoriesSync() {
  const catsCol = collection(db, "categories");
  onSnapshot(catsCol, (catSnap) => {
    const list = [];
    catSnap.forEach(docSnap => {
      const cd = docSnap.data() || {};
      if (cd.active === false) return;
      const name = (cd.name || '').trim();
      if (!name) return;
      const rawOrder = cd.order ?? cd.sortOrder;
      const orderNum = (rawOrder !== undefined && rawOrder !== null && !isNaN(Number(rawOrder))) ? Number(rawOrder) : null;
      list.push({
        id: docSnap.id,
        name: name,
        order: orderNum,
        createdAt: cd.createdAt || ''
      });
    });

    list.sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      if (a.createdAt && b.createdAt) {
        const tA = new Date(a.createdAt).getTime();
        const tB = new Date(b.createdAt).getTime();
        if (!isNaN(tA) && !isNaN(tB) && tA !== tB) return tA - tB;
      }
      return a.name.localeCompare(b.name, 'ar');
    });

    categoriesList = list;
    isCatsLoaded = true;
    renderProductHeaderCategories();
  }, (err) => {
    console.warn("Categories onSnapshot error:", err);
    isCatsLoaded = true;
    renderProductHeaderCategories();
  });
}

function renderProductHeaderCategories() {
  const mainNav = document.getElementById('mainNav');
  const mobileScroller = document.getElementById('mobileCatScroller');

  if (!isCatsLoaded) {
    if (mainNav) {
      mainNav.innerHTML = `
        <div class="nav-skeleton" aria-label="جاري التحميل">
          <span class="nav-skel-pill"></span>
          <span class="nav-skel-pill"></span>
          <span class="nav-skel-pill"></span>
        </div>`;
    }
    if (mobileScroller) {
      mobileScroller.innerHTML = `<span class="mobile-cat-pill" style="opacity:0.5">جاري التحميل...</span>`;
    }
    return;
  }

  const currentCatId = currentTargetProduct ? (currentTargetProduct.categoryId || '') : '';
  const currentCatName = currentTargetProduct ? (currentTargetProduct.category || '') : '';

  let desktopHtml = `<a href="/">الكل</a>`;
  let mobileHtml = `<a href="/" class="mobile-cat-pill">الكل</a>`;

  // Render ONLY categories from Cloud Firestore
  categoriesList.forEach(cat => {
    const isActive = (currentCatId && cat.id === currentCatId) || (currentCatName && cat.name.trim().toLowerCase() === currentCatName.trim().toLowerCase());
    desktopHtml += `<a href="/?cat=${encodeURIComponent(cat.id)}" class="${isActive ? 'active' : ''}">${esc(cat.name)}</a>`;
    mobileHtml += `<a href="/?cat=${encodeURIComponent(cat.id)}" class="mobile-cat-pill ${isActive ? 'active' : ''}">${esc(cat.name)}</a>`;
  });

  desktopHtml += `<a href="/?view=sale">الخصومات</a><a href="/?view=fav">المفضلة</a>`;
  mobileHtml += `<a href="/?view=sale" class="mobile-cat-pill">الخصومات</a><a href="/?view=fav" class="mobile-cat-pill">المفضلة</a>`;

  if (mainNav) mainNav.innerHTML = desktopHtml;
  if (mobileScroller) mobileScroller.innerHTML = mobileHtml;

  // Synchronize Breadcrumb category
  const crumbCatLink = document.getElementById('crumbCatLink');
  if (crumbCatLink && currentTargetProduct) {
    const matchedCat = categoriesList.find(c => c.id === currentCatId || c.name.trim().toLowerCase() === currentCatName.trim().toLowerCase());
    if (matchedCat) {
      crumbCatLink.textContent = matchedCat.name;
      crumbCatLink.href = `/?cat=${encodeURIComponent(matchedCat.id)}`;
    } else if (currentCatName) {
      crumbCatLink.textContent = currentCatName;
      crumbCatLink.href = '/';
    } else {
      crumbCatLink.textContent = 'المنتجات';
      crumbCatLink.href = '/';
    }
  }
}

function showProductErrorState(msg = "المنتج غير متوفر حالياً") {
  const wrap = document.querySelector('.product-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="empty-state">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--gold-dark)" stroke-width="1.8" style="margin:0 auto 14px;display:block">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
      <h3>المنتج غير متوفر حالياً</h3>
      <p>${esc(msg)}</p>
      <a href="/" class="btn-order" style="display:inline-block;margin-top:16px;max-width:240px">العودة إلى المتجر</a>
    </div>`;
}

// --- Fetch Data from Cloud Firestore ---
async function loadProductFromFirestore() {
  try {
    const colRef = collection(db, "products");
    const snap = await getDocs(colRef);
    const list = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const mainImg = d.mainImage || d.img || (Array.isArray(d.images) && d.images[0] ? (d.images[0].url || d.images[0]) : '') || 'img/p1.png';
      
      let colors = [];
      if (Array.isArray(d.colors)) {
        colors = d.colors.map((c, idx) => {
          if (typeof c === 'object' && c !== null) {
            return { name: c.name || '', value: c.value || '#111111' };
          }
          const nm = (d.colorNames && d.colorNames[idx]) || String(c);
          return { name: nm, value: String(c) };
        });
      }

      list.push({
        id: docSnap.id,
        name: d.name || '',
        price: typeof d.price === 'number' ? d.price : Number(d.price) || 0,
        oldPrice: d.oldPrice ? Number(d.oldPrice) : null,
        img: mainImg,
        mainImage: mainImg,
        badge: d.badge || '',
        colors: colors,
        colorNames: colors.map(c => c.name),
        sizes: Array.isArray(d.sizes) && d.sizes.length ? d.sizes : defaultSizes,
        status: d.status || 'active',
        desc: d.description || d.desc || '',
        category: d.category || '',
        categoryId: d.categoryId || d.category || ''
      });
    });

    products = list;

    // Find the requested product
    let target = null;
    if (idParam) {
      target = products.find(p => String(p.id) === String(idParam));
      // Fallback if numerical index was provided
      if (!target && !isNaN(Number(idParam)) && products[Number(idParam)]) {
        target = products[Number(idParam)];
      }
    } else if (products.length > 0) {
      // Default to first product if no ID specified
      target = products[0];
    }

    if (target) {
      currentTargetProduct = target;
      renderProductDetails(target);
      renderProductHeaderCategories();
    } else {
      showProductErrorState(
        idParam ? "قد يكون هذا المنتج قد تم حذفه أو أن الرابط غير صحيح." : "لا توجد منتجات متاحة في المتجر حالياً."
      );
    }
  } catch (err) {
    console.error("Firestore product load error:", err);
    toast("تعذر تحميل بيانات المنتج من السحابة", false);
    showProductErrorState("حدث خطأ أثناء الاتصال بالسحابة لتحميل بيانات المنتج. يرجى التحقق من اتصالك بالإنترنت.");
  }
}

renderProductHeaderCategories();
initCategoriesSync();
loadProductFromFirestore();

// Quantity buttons event listeners
const qtyPlus = document.getElementById("qtyPlusBtn");
const qtyMinus = document.getElementById("qtyMinusBtn");
if (qtyPlus) qtyPlus.addEventListener("click", () => changeQty(1));
if (qtyMinus) qtyMinus.addEventListener("click", () => changeQty(-1));

// Motion System: Header scroll compression
window.addEventListener('scroll', () => {
  const header = document.querySelector('header');
  if (header) {
    if (window.scrollY > 25) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }
}, { passive: true });


