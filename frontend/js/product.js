import { addToCart, toast, esc } from "./cart.js";
import { fetchProductById, subscribeCategories, optimizeProductImage, readCachedProductById, readCatalogCache } from "./catalog-adapter.js";
import { loadFavorites, isFavorite, toggleFavorite } from "./favorites.js";
import "./search.js";
import {
  setupWilayaCommuneCascade,
  createCheckoutPricingController,
  validateCodFormFields,
  resolveLocationCodes,
  submitCodOrder
} from "./checkout.js";

let currentProduct = null;
let qty = 1;
let selectedSize = "M";
let selectedColorIndex = 0;

// URL Params helper (evaluated dynamically for View Transition navigations)
function getIdParam() {
  return new URLSearchParams(location.search).get("id");
}

function initProductWilayaCascade() {
  return setupWilayaCommuneCascade({
    wilayaSelectId: "wilaya",
    communeSelectId: "commune",
    wilayaFieldId: "fWilaya",
    communeFieldId: "fCommune"
  });
}

function getSelectedColorMeta() {
  const hasColors = Boolean(currentProduct && Array.isArray(currentProduct.colors) && currentProduct.colors.length > 0);
  if (!hasColors) return { colorName: "", colorHex: "" };
  const colorsList = currentProduct.colors;
  const chosenColor = colorsList[selectedColorIndex] || colorsList[0];
  const colorName = chosenColor
    ? (typeof chosenColor === "object"
        ? chosenColor.name
        : (currentProduct.colorNames && currentProduct.colorNames[selectedColorIndex] ? currentProduct.colorNames[selectedColorIndex] : ""))
    : "";
  const colorHex = chosenColor ? (typeof chosenColor === "object" ? chosenColor.value : chosenColor) : "";
  return { colorName, colorHex };
}

const productPricingController = createCheckoutPricingController({
  wilayaSelectId: "wilaya",
  radioName: "deliveryMethod",
  cardHomeId: "cardHome",
  cardStopDeskId: "cardStopDesk",
  homePriceId: "homePriceDisplay",
  stopDeskPriceId: "stopDeskPriceDisplay",
  opsSubtotalId: "opsSubtotal",
  opsShippingId: "opsShipping",
  opsMethodLabelId: "opsMethodLabel",
  opsTotalId: "opsTotal",
  getSubtotal: () => (currentProduct ? currentProduct.price * qty : 0)
});

function changeQty(d){
  qty = Math.max(1, qty + d);
  const qtyEl = document.getElementById("qty");
  const totalEl = document.getElementById("total");
  if (qtyEl) qtyEl.textContent = qty;
  if (totalEl && currentProduct) {
    totalEl.textContent = (currentProduct.price * qty).toLocaleString('en-US') + " DA";
  }
  productPricingController.update();
}

function renderProductDetails(p) {
  currentProduct = p;
  document.title = p.name + " — SHAFQ";
  
  const crumbEl = document.getElementById("crumb");
  const nameEl = document.getElementById("pName");
  const priceEl = document.getElementById("pPrice");
  const oldPriceEl = document.getElementById("pOldPrice");
  const descEl = document.getElementById("pDesc");
  const imgEl = document.getElementById("pImg");
  const badgeEl = document.getElementById("pBadge");
  const colorsEl = document.getElementById("pColors");
  const colorNameEl = document.getElementById("colorName");
  const sizesEl = document.getElementById("pSizes");

  if (crumbEl) crumbEl.textContent = p.name;
  if (nameEl) nameEl.textContent = p.name;
  if (priceEl) priceEl.textContent = p.price.toLocaleString('en-US');
  if (oldPriceEl) {
    if (p.oldPrice && p.oldPrice > p.price) {
      oldPriceEl.textContent = p.oldPrice.toLocaleString('en-US') + " DA";
      oldPriceEl.style.display = "inline-block";
    } else {
      oldPriceEl.textContent = "";
      oldPriceEl.style.display = "none";
    }
  }
  if (descEl) {
    if (p.desc && String(p.desc).trim()) {
      descEl.textContent = String(p.desc).trim();
      descEl.style.display = "block";
    } else {
      descEl.textContent = "";
      descEl.style.display = "none";
    }
  }
  
  const rawImg = p.rawImage || p.img || p.mainImage || '';
  const mainImg = optimizeProductImage(rawImg, "detail");
  const imgSkel = document.getElementById("pImgSkeleton");

  if (imgEl) {
    imgEl.alt = p.name;

    if (imgEl.dataset.loadedSrc === mainImg && imgEl.style.opacity === "1") {
      if (imgSkel && imgSkel.parentNode) imgSkel.style.display = "none";
    } else {
      const onImageLoaded = () => {
        imgEl.dataset.loadedSrc = mainImg;
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
      preloader.fetchPriority = "high";
      preloader.onload = onImageLoaded;
      preloader.onerror = () => {
        imgEl.dataset.loadedSrc = "";
        imgEl.removeAttribute('src');
        imgEl.style.opacity = "0";
        if (imgSkel) {
          imgSkel.style.opacity = "0";
          setTimeout(() => {
            if (imgSkel && imgSkel.parentNode) imgSkel.style.display = "none";
          }, 250);
        }
      };
      preloader.src = mainImg;
    }
  }
  
  if (badgeEl) {
    const discPct = (p.oldPrice && p.oldPrice > p.price) ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const badgeLabel = p.badge || (discPct > 0 ? `-${discPct}%` : "");
    if (badgeLabel) {
      badgeEl.textContent = badgeLabel;
      badgeEl.style.display = "inline-block";
    } else {
      badgeEl.style.display = "none";
    }
  }

  // Render colors (optional)
  const hasColors = Array.isArray(p.colors) && p.colors.length > 0;
  const colorList = hasColors ? p.colors : [];
  selectedColorIndex = 0;
  const colorOptLabel = document.getElementById("colorOptLabel");
  if (hasColors && colorsEl) {
    if (colorOptLabel) colorOptLabel.style.display = "block";
    colorsEl.style.display = "flex";
    colorsEl.innerHTML = colorList.map((c, i) => {
      const val = typeof c === 'object' ? c.value : c;
      const nm = typeof c === 'object' ? c.name : (p.colorNames && p.colorNames[i] ? p.colorNames[i] : 'Color');
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
    const initialColorName = typeof colorList[0] === 'object' ? colorList[0].name : (p.colorNames && p.colorNames[0] ? p.colorNames[0] : 'Color');
    if (colorNameEl) colorNameEl.textContent = initialColorName;
  } else {
    if (colorOptLabel) colorOptLabel.style.display = "none";
    if (colorsEl) { colorsEl.style.display = "none"; colorsEl.innerHTML = ""; }
    if (colorNameEl) colorNameEl.textContent = "";
  }

  // Render sizes (optional)
  const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
  const sizeOptLabel = document.getElementById("sizeOptLabel");
  if (hasSizes && sizesEl) {
    if (sizeOptLabel) sizeOptLabel.style.display = "block";
    sizesEl.style.display = "flex";
    const sizeList = p.sizes;
    selectedSize = sizeList[0] || "";
    sizesEl.innerHTML = sizeList.map((s, i) => `<span class="size ${i === 0 ? 'active' : ''}" data-val="${esc(s)}">${esc(s)}</span>`).join("");
    sizesEl.querySelectorAll('.size').forEach(sz => {
      sz.addEventListener('click', () => {
        sizesEl.querySelectorAll('.size').forEach(x => x.classList.remove('active'));
        sz.classList.add('active');
        selectedSize = sz.dataset.val;
      });
    });
  } else {
    if (sizeOptLabel) sizeOptLabel.style.display = "none";
    if (sizesEl) { sizesEl.style.display = "none"; sizesEl.innerHTML = ""; }
    selectedSize = "";
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
  loadFavorites();
  const favBtn = document.getElementById('favBtn');
  if (favBtn) {
    const liked = isFavorite(p.id);
    favBtn.style.opacity = '1';
    favBtn.classList.toggle('liked', liked);
    favBtn.setAttribute('aria-pressed', String(liked));
    favBtn.setAttribute('aria-label', liked ? 'Remove from favorites' : 'Save to favorites');
  }
}

/* Validation + authoritative order submission via /api/order */
function bindOrderForm() {
  const orderForm = document.getElementById("orderForm");
  if (!orderForm || orderForm.dataset.shafqBound) return;
  orderForm.dataset.shafqBound = "1";
  orderForm.addEventListener("submit", async function(e){
    e.preventDefault();
    if (!currentProduct) {
      toast("Please wait until product details finish loading", false);
      return;
    }

    const { valid, customer: name, phone, wilaya, commune, address } = validateCodFormFields({
      nameInputId: "fullName",
      phoneInputId: "phone",
      wilayaSelectId: "wilaya",
      communeSelectId: "commune",
      addressInputId: "address",
      nameFieldId: "fName",
      phoneFieldId: "fPhone",
      wilayaFieldId: "fWilaya",
      communeFieldId: "fCommune"
    });
    if (!valid) return;

    const submitBtn = document.querySelector("#orderForm button[type=submit]");
    const originalHTML = submitBtn ? submitBtn.innerHTML : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Placing order...";
    }

    const deliveryMethod = productPricingController.getSelectedMethod();
    const { canonicalWilaya, wilayaCode, communeCode } = await resolveLocationCodes(wilaya, commune);
    const { colorName, colorHex } = getSelectedColorMeta();
    const hasSizes = Array.isArray(currentProduct.sizes) && currentProduct.sizes.length > 0;

    // Authoritative request payload (matches cart.js & server /api/order contract)
    const orderRequestPayload = {
      customer: name,
      phone: phone,
      wilaya: canonicalWilaya,
      wilayaCode: wilayaCode,
      commune: commune,
      communeCode: communeCode,
      address: address || "",
      deliveryMethod: deliveryMethod,
      items: [
        {
          productId: currentProduct.id,
          name: currentProduct.name,
          quantity: qty,
          size: hasSizes ? selectedSize : '',
          color: colorName,
          colorHex: colorHex,
          image: currentProduct.rawImage || currentProduct.img || currentProduct.mainImage || ""
        }
      ]
    };

    try {
      const result = await submitCodOrder(orderRequestPayload);
      if (!result.ok) {
        toast(result.error, false);
        return;
      }

      const createdOrderId = result.orderId;
      const verifiedTotal = result.order.total;
      const verifiedShipping = result.order.shippingPrice;
      const verifiedSubtotal = result.order.subtotal;

      // Render success screen with verified totals and delivery details
      const summary = document.getElementById("orderSummary");
      if (summary) {
        summary.innerHTML = `
          <b>Order Details</b><br>
          Order ID: <b>#${createdOrderId.slice(-6).toUpperCase()}</b><br>
          Piece: <span dir="auto">${esc(currentProduct.name)}</span><br>
          ${colorName ? `Color: <span dir="auto">${esc(colorName)}</span> — ` : ""}${hasSizes && selectedSize ? `Size: <span dir="auto">${esc(selectedSize)}</span> — ` : ""}Qty: ${qty}<br>
          Items Subtotal: <b>${verifiedSubtotal.toLocaleString('en-US')} DA</b><br>
          Delivery: <b>${deliveryMethod === 'stopDesk' ? 'Stop Desk Pickup' : 'Home Delivery'} (${verifiedShipping.toLocaleString('en-US')} DA)</b><br>
          Total: <b>${verifiedTotal.toLocaleString('en-US')} DA</b> (Cash on Delivery)<br>
          Customer: <span dir="auto">${esc(name)}</span><br>
          Phone: ${esc(phone)}<br>
          Location: <span dir="auto">${esc(wilaya)} — ${esc(commune)}</span>${address ? "<br>Address: <span dir='auto'>" + esc(address) + "</span>" : ""}`;
      }

      const formWrapEl = document.getElementById("formWrap");
      if (formWrapEl) {
        formWrapEl.classList.add("hidden");
        formWrapEl.style.display = "none";
      }
      document.getElementById("successBox")?.classList.add("show");
      window.scrollTo({top:0, behavior:"smooth"});
    } catch (err) {
      console.error("Order processing error:", err);
      toast("Error saving your order. Please try again.", false);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML || "<span>Confirm Order — Cash on Delivery</span>";
      }
    }
  });
}

function syncProductFavButton() {
  const favBtn = document.getElementById('favBtn');
  if (!favBtn || !currentProduct) return;
  const liked = isFavorite(currentProduct.id);
  favBtn.classList.toggle('liked', liked);
  favBtn.setAttribute('aria-pressed', String(liked));
  favBtn.setAttribute('aria-label', liked ? 'Remove from favorites' : 'Save to favorites');
}

function bindFavButton() {
  const favBtn = document.getElementById('favBtn');
  if (!favBtn || favBtn.dataset.shafqBound) return;
  favBtn.dataset.shafqBound = "1";
  favBtn.addEventListener('click', () => {
    if (!currentProduct || !currentProduct.id) return;
    const res = toggleFavorite(currentProduct.id);
    if (!res) return;
    syncProductFavButton();
    toast(res.favorited ? 'Saved to favorites' : 'Removed from favorites');
  });
}

/* add to cart with complete variant metadata */
function bindAddCartButton() {
  const addCartBtn = document.getElementById('addCartBtn');
  if (!addCartBtn || addCartBtn.dataset.shafqBound) return;
  addCartBtn.dataset.shafqBound = "1";

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
    addCartBtn.textContent = 'Added to Bag';

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
    addCartBtn.textContent = 'Add to Bag';
    addCartBtn._busy = false;
  }

  addCartBtn.addEventListener('click', () => {
    if (addCartBtn._busy || !currentProduct) return;
    addCartBtn._busy = true;
    setTimeout(() => { addCartBtn._busy = false; }, 250);

    const colorsList = Array.isArray(currentProduct.colors) ? currentProduct.colors : [];
    const { colorName, colorHex } = getSelectedColorMeta();
    const hasSizes = Array.isArray(currentProduct.sizes) && currentProduct.sizes.length > 0;

    addToCart({
      productId: currentProduct.id,
      name: currentProduct.name,
      price: currentProduct.price,
      image: currentProduct.rawImage || currentProduct.img || currentProduct.mainImage || '',
      quantity: qty,
      size: hasSizes ? selectedSize : '',
      color: colorName,
      colorHex: colorHex,
      availableSizes: hasSizes ? currentProduct.sizes : [],
      availableColors: colorsList,
      openDrawer: false
    });

    setProductBtnFeedback(1500);
  });
}

// --- Dynamic Firestore Categories Synchronization (Breadcrumb) ---
let categoriesList = [];
let currentTargetProduct = null;
let categoriesSubscribed = false;
let unsubscribeCategories = null;
let pendingCatSyncTimer = null;
let catLoadEventHandler = null;

function clearPendingCategorySync() {
  if (pendingCatSyncTimer) {
    clearTimeout(pendingCatSyncTimer);
    pendingCatSyncTimer = null;
  }
  if (catLoadEventHandler) {
    window.removeEventListener("load", catLoadEventHandler);
    catLoadEventHandler = null;
  }
}

function cleanupProductListeners() {
  activeLoadSeq += 1;
  clearPendingCategorySync();
  if (unsubscribeCategories) {
    try { unsubscribeCategories(); } catch (_) {}
    unsubscribeCategories = null;
  }
  categoriesSubscribed = false;
}

function startCategoriesSubscription() {
  if (categoriesSubscribed || !document.querySelector('.product-wrap')) return;
  categoriesSubscribed = true;
  unsubscribeCategories = subscribeCategories(
    (sortedCats) => {
      categoriesList = sortedCats;
      syncProductCategoryBreadcrumb();
    },
    (err) => {
      console.warn("Categories onSnapshot error:", err);
      syncProductCategoryBreadcrumb();
    }
  );
}

function initCategoriesSync() {
  if (categoriesSubscribed) return;
  const cached = readCatalogCache({ allowStale: true });
  const hasCachedCats = Boolean(cached && cached.hasCategories);
  if (hasCachedCats) {
    categoriesList = cached.categories;
    syncProductCategoryBreadcrumb();
  }

  clearPendingCategorySync();
  if (!hasCachedCats) {
    startCategoriesSubscription();
    return;
  }

  const trigger = () => {
    pendingCatSyncTimer = setTimeout(() => {
      pendingCatSyncTimer = null;
      startCategoriesSubscription();
    }, 50);
  };

  if (document.readyState === "complete") {
    trigger();
  } else {
    catLoadEventHandler = () => {
      catLoadEventHandler = null;
      trigger();
    };
    window.addEventListener("load", catLoadEventHandler, { once: true });
  }
}

function syncProductCategoryBreadcrumb() {
  const crumbCatLink = document.getElementById('crumbCatLink');
  if (!crumbCatLink || !currentTargetProduct) return;

  const currentCatId = currentTargetProduct.categoryId || '';
  const currentCatName = currentTargetProduct.category || '';
  const matchedCat = categoriesList.find(
    (c) => c.id === currentCatId || c.name.trim().toLowerCase() === currentCatName.trim().toLowerCase()
  );

  if (matchedCat) {
    crumbCatLink.textContent = matchedCat.name;
    crumbCatLink.href = `/shop?cat=${encodeURIComponent(matchedCat.id)}`;
  } else if (currentCatName) {
    crumbCatLink.textContent = currentCatName;
    crumbCatLink.href = `/shop?cat=${encodeURIComponent(currentCatName)}`;
  } else {
    crumbCatLink.textContent = 'Shop';
    crumbCatLink.href = '/shop';
  }
}

function showProductErrorState(msg = "This piece is currently unavailable.") {
  const wrap = document.querySelector('.product-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="empty-state">
      <h3>Piece Unavailable</h3>
      <p>${esc(msg)}</p>
      <a href="/shop" class="btn-order" style="display:inline-flex;margin-top:22px;width:auto;min-width:200px">Return to Shop</a>
    </div>`;
}

let activeLoadSeq = 0;

// --- Fetch Data from Cloud Firestore (SWR Cache preview + Authoritative Server sync) ---
async function loadProductFromFirestore(seq) {
  const idParam = getIdParam();
  if (!idParam) {
    showProductErrorState("No piece was specified. Please select a piece from the shop.");
    return;
  }

  let hasCachedPreview = false;
  const cachedEntry = readCachedProductById(idParam);
  if (cachedEntry && cachedEntry.product) {
    hasCachedPreview = true;
    currentTargetProduct = cachedEntry.product;
    renderProductDetails(cachedEntry.product);
    syncProductCategoryBreadcrumb();
  }

  const { product, error } = await fetchProductById(idParam);
  if (seq !== activeLoadSeq) return;

  if (product) {
    currentTargetProduct = product;
    renderProductDetails(product);
    syncProductCategoryBreadcrumb();
    return;
  }

  if (error) {
    if (hasCachedPreview) {
      toast("Offline — showing cached piece details (verified at checkout)", false);
      return;
    }
    toast("Unable to load product details", false);
    showProductErrorState("We could not retrieve this piece from the catalog. Please check your connection and try again.");
  } else {
    showProductErrorState("This piece could not be found or is no longer available.");
  }
}

let globalProductListenersBound = false;

function bindProductPageControls() {
  productPricingController.activate();
  productPricingController.bindListeners();
  initProductWilayaCascade().then(() => productPricingController.update());
  bindOrderForm();
  bindFavButton();
  bindAddCartButton();

  const qtyPlus = document.getElementById("qtyPlusBtn");
  const qtyMinus = document.getElementById("qtyMinusBtn");
  if (qtyPlus && !qtyPlus.dataset.shafqBound) {
    qtyPlus.dataset.shafqBound = "1";
    qtyPlus.addEventListener("click", () => changeQty(1));
  }
  if (qtyMinus && !qtyMinus.dataset.shafqBound) {
    qtyMinus.dataset.shafqBound = "1";
    qtyMinus.addEventListener("click", () => changeQty(-1));
  }

  if (!globalProductListenersBound) {
    globalProductListenersBound = true;
    document.addEventListener('shafq:favorites', syncProductFavButton);
  }
}

export function initProductPage() {
  if (!document.querySelector('.product-wrap')) return;
  loadFavorites();
  const seq = ++activeLoadSeq;
  currentProduct = null;
  currentTargetProduct = null;
  qty = 1;
  selectedSize = "";
  selectedColorIndex = 0;

  bindProductPageControls();
  syncProductCategoryBreadcrumb();
  initCategoriesSync();
  loadProductFromFirestore(seq);
}

window.SHAFQ_PRODUCT = { init: initProductPage, destroy: cleanupProductListeners };

if (document.querySelector('.product-wrap')) {
  initProductPage();
}


