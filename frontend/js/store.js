import { db } from "./firebase-config.js";
    import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
    import { initCartUI, toast as cartToast, resolveColorHex } from "./cart.js";

    // Safe HTML escape (including quotes and single quotes)
    const esc = s => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    // Products & Categories state (Loaded dynamically from Cloud Firestore)
    let products = [];
    let categories = [];
    let isLoaded = false;
    let isCatsLoaded = false;
    let selectedCatId = null;

    try {
      const cachedCats = JSON.parse(localStorage.getItem('clothstore_categories_cache') || 'null');
      if (Array.isArray(cachedCats) && cachedCats.length > 0) {
        categories = cachedCats;
        isCatsLoaded = true;
      }
    } catch (_) {}

    /* ---------- state ---------- */
    let favs = new Set(JSON.parse(localStorage.getItem('alnoor_favs') || '[]'));
    let view = 'all', priceFilter = 'all', sortMode = 'default';

    const grid = document.getElementById('grid');
    const countEl = document.getElementById('count');

    function saveFavs() { localStorage.setItem('alnoor_favs', JSON.stringify([...favs])); }

    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg; t.classList.add('show');
      clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
    }

    function toggleFav(id, el) {
      if (favs.has(id)) { favs.delete(id); el.classList.remove('liked'); toast('أُزيل من المفضلة'); }
      else { favs.add(id); el.classList.add('liked'); toast('أُضيف إلى المفضلة ♥'); }
      saveFavs();
      if (view === 'fav') render();
    }

    /* ---------- filter / sort / render ---------- */
    function getList() {
      let list = products.slice();
      if (view === 'sale') {
        list = list.filter(p => p.oldPrice && p.oldPrice > p.price);
      } else if (view === 'fav') {
        list = list.filter(p => favs.has(p.id));
      } else if (view === 'cat' && selectedCatId) {
        const selCat = categories.find(c => c.id === selectedCatId);
        list = list.filter(p => {
          if (p.categoryId && p.categoryId === selectedCatId) return true;
          if (selCat && p.category && p.category.trim().toLowerCase() === selCat.name.trim().toLowerCase()) return true;
          if (selCat && p.categoryId && p.categoryId.trim().toLowerCase() === selCat.name.trim().toLowerCase()) return true;
          return false;
        });
      }
      if (priceFilter === 'lt300') list = list.filter(p => p.price < 300);
      else if (priceFilter === 'mid') list = list.filter(p => p.price >= 300 && p.price <= 350);
      else if (priceFilter === 'gt350') list = list.filter(p => p.price > 350);
      else if (priceFilter === 'sale') list = list.filter(p => p.oldPrice && p.oldPrice > p.price);
      if (sortMode === 'asc') list.sort((a, b) => a.price - b.price);
      else if (sortMode === 'desc') list.sort((a, b) => b.price - a.price);
      else if (sortMode === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      return list;
    }
    function discount(p) { return p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0; }

    function render() {
      if (!isLoaded && products.length === 0) {
        grid.innerHTML = '<div class="empty-state">جاري تحميل المنتجات من السحابة...</div>';
        countEl.textContent = '...';
        return;
      }

      const list = getList();
      countEl.textContent = list.length + ' منتج';
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state">لا توجد منتجات هنا حالياً<br><small style="font-weight:400">' +
          (view === 'fav' ? 'اضغط على القلب ♥ في أي منتج لإضافته إلى مفضلتك' : 'جرّب تغيير خيارات التصفية') +
          '</small></div>';
        return;
      }
      grid.innerHTML = list.map(p => {
        const mainImg = p.img || p.mainImage || 'img/p1.png';
        const disc = discount(p);
        const badgeHTML = disc ? `<span class="badge">خصم ${disc}%</span>` : (p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '');
        const isLiked = favs.has(p.id);

        const colorsHTML = (p.colors || []).map((c, j) => {
          const val = typeof c === 'object' ? (c.value || c.hex) : c;
          const nm = typeof c === 'object' ? c.name : (p.colorNames && p.colorNames[j] ? p.colorNames[j] : '');
          const hex = resolveColorHex(val || nm);
          const isLight = hex.toLowerCase() === '#ffffff' || hex.toLowerCase() === '#fff' || hex === '#fdfcfa';
          return `<span class="dot ${j === 0 ? 'active' : ''}" style="background:${hex};${isLight ? 'border:1.5px solid #d1cbbf' : ''}" title="${esc(nm || hex)}"></span>`;
        }).join('');

        return `
    <div class="card">
      <a class="card-link" href="/product?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}">
        <div class="card-img">
          ${badgeHTML}
          <button type="button" class="fav ${isLiked ? 'liked' : ''}" aria-label="مفضلة" onclick="event.preventDefault();event.stopPropagation();toggleFav('${p.id}',this)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7.5-4.7-9.5-9.2C.9 8.4 3 4.5 6.8 4.5c2 0 3.6 1.1 4.6 2.7h1.2c1-1.6 2.6-2.7 4.6-2.7 3.8 0 5.9 3.9 4.3 7.3C19.5 16.3 12 21 12 21z"/></svg>
          </button>
          <img src="${esc(mainImg)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='img/p1.png'">
        </div>
        <div class="card-info-top">
          <h3>${esc(p.name)}</h3>
          <div class="dots">${colorsHTML}</div>
          <div class="price">${p.price} <span>دج</span>${p.oldPrice ? `<span class="price-old">${p.oldPrice} دج</span>` : ''}</div>
        </div>
      </a>
      <div class="card-btn-wrap">
        <button type="button" class="card-cart-btn" aria-label="إضافة إلى السلة" onclick="window.handleCardQuickAdd('${esc(p.id)}', this)">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
          <span class="btn-text">إضافة إلى السلة</span>
        </button>
      </div>
    </div>`;
      }).join('');
    }

    /* ---------- Dynamic Categories & Nav Logic ---------- */
    let currentBannerRequestId = 0;

    function applyBanner(banner, legacyCrop) {
      const heroImg = document.getElementById("heroBannerImg");
      const heroMobile = document.getElementById("heroBannerMobile");
      const heroSec = document.querySelector(".hero");
      if (!heroImg) return;

      const b = typeof banner === 'object' && banner !== null ? banner : { img: banner, crop: legacyCrop };
      if (!b.img) return;

      const desktopSrc = b.img;
      const mobileSrc = b.mobileImg || b.img;

      // Cache active banner for instant load on reload
      try {
        localStorage.setItem('clothstore_active_banner', JSON.stringify({
          desktop: desktopSrc,
          mobile: mobileSrc
        }));
      } catch (_) {}

      const currentSrc = heroImg.getAttribute('src');
      if (currentSrc === desktopSrc && !heroImg.classList.contains('hero-img-loading')) {
        return;
      }

      // Track request ID to prevent race conditions when user switches rapidly (A -> B -> C)
      const requestId = ++currentBannerRequestId;

      // Immediately hide previous banner and show skeleton loading state
      heroImg.classList.add('hero-img-loading');
      if (heroSec) heroSec.classList.add('is-loading');

      // Target image for current screen mode (mobile vs desktop)
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
      const targetSrc = (isMobile && mobileSrc) ? mobileSrc : desktopSrc;

      const applyCrop = () => {
        if (!b.isFinal && b.crop) {
          const crop = b.crop;
          const dx = typeof crop.desktop?.x === 'number' ? crop.desktop.x : 50;
          const dy = typeof crop.desktop?.y === 'number' ? crop.desktop.y : 50;
          const dz = typeof crop.desktop?.zoom === 'number' ? crop.desktop.zoom : 1;
          const mx = typeof crop.mobile?.x === 'number' ? crop.mobile.x : (typeof crop.mobile?.focusX === 'number' ? crop.mobile.focusX : dx);
          const my = typeof crop.mobile?.y === 'number' ? crop.mobile.y : dy;
          const mz = typeof crop.mobile?.zoom === 'number' ? crop.mobile.zoom : dz;

          heroImg.style.setProperty('--crop-dx', `${dx}%`);
          heroImg.style.setProperty('--crop-dy', `${dy}%`);
          heroImg.style.setProperty('--crop-dz', `${dz}`);
          heroImg.style.setProperty('--crop-mx', `${mx}%`);
          heroImg.style.setProperty('--crop-my', `${my}%`);
          heroImg.style.setProperty('--crop-mz', `${mz}`);
        } else {
          // Finalized banner: pure physical WebP crop, clean defaults
          heroImg.style.setProperty('--crop-dx', '50%');
          heroImg.style.setProperty('--crop-dy', '50%');
          heroImg.style.setProperty('--crop-dz', '1');
          heroImg.style.setProperty('--crop-mx', '50%');
          heroImg.style.setProperty('--crop-my', '50%');
          heroImg.style.setProperty('--crop-mz', '1');
        }
      };

      const finishLoading = () => {
        // Drop stale results from previous rapid category switches
        if (requestId !== currentBannerRequestId) return;

        applyCrop();
        if (heroMobile) heroMobile.srcset = mobileSrc;
        heroImg.src = desktopSrc;

        requestAnimationFrame(() => {
          if (requestId !== currentBannerRequestId) return;
          heroImg.classList.remove('hero-img-loading');
          if (heroSec) heroSec.classList.remove('is-loading');
        });
      };

      // Preload the target banner before revealing
      const preloader = new Image();
      preloader.onload = finishLoading;
      preloader.onerror = finishLoading;
      preloader.src = targetSrc;

      // Also warm cache for alternate viewport
      const altSrc = (targetSrc === mobileSrc) ? desktopSrc : mobileSrc;
      if (altSrc && altSrc !== targetSrc) {
        const altPreloader = new Image();
        altPreloader.src = altSrc;
      }
    }
    const applyBannerImage = applyBanner;

    function updateHeroAndHeaders() {
      const heroTitle = document.getElementById('heroTitle');
      const heroSub = document.getElementById('heroSub');
      const heroDesc = document.getElementById('heroDesc');
      const crumbTitle = document.getElementById('crumbTitle');
      const pageHeading = document.getElementById('pageHeading');
      const pageDesc = document.getElementById('pageDesc');

      if (view === 'sale') {
        if (heroTitle) heroTitle.textContent = 'الخصومات والعروض';
        if (heroSub) heroSub.textContent = 'تخفيضات استثنائية';
        if (heroDesc) heroDesc.textContent = 'أفضل العروض والأسعار الخاصة على تشكيلاتنا الفاخرة';
        if (crumbTitle) crumbTitle.textContent = 'الخصومات';
        if (pageHeading) pageHeading.textContent = 'الخصومات';
        if (pageDesc) pageDesc.textContent = 'استمتع بأقوى العروض والخصومات على تشكيلة فاخرة من منتجاتنا.';
        const firstBannerCat = categories.find(c => c.banner && c.banner.type === 'image' && c.banner.img);
        if (firstBannerCat) applyBanner(firstBannerCat.banner);
        return;
      }

      if (view === 'fav') {
        if (heroTitle) heroTitle.textContent = 'قائمتي المفضلة';
        if (heroSub) heroSub.textContent = 'قطعك المختارة بعناية';
        if (heroDesc) heroDesc.textContent = 'تصفح وأدر جميع المنتجات التي نالت إعجابك';
        if (crumbTitle) crumbTitle.textContent = 'المفضلة';
        if (pageHeading) pageHeading.textContent = 'المفضلة';
        if (pageDesc) pageDesc.textContent = 'المنتجات التي قمت بحفظها في قائمتك المفضلة لسهولة الوصول إليها لاحقاً.';
        const firstBannerCat = categories.find(c => c.banner && c.banner.type === 'image' && c.banner.img);
        if (firstBannerCat) applyBanner(firstBannerCat.banner);
        return;
      }

      if (view === 'cat' && selectedCatId) {
        const selCat = categories.find(c => c.id === selectedCatId);
        if (selCat) {
          if (heroTitle) heroTitle.textContent = selCat.name;
          if (heroSub) heroSub.textContent = selCat.msg || 'أناقة تُرتدى بثقة';
          if (heroDesc) heroDesc.textContent = selCat.desc || 'تشكيلة فاخرة بتفاصيل دقيقة وجودة استثنائية';
          if (crumbTitle) crumbTitle.textContent = selCat.name;
          if (pageHeading) pageHeading.textContent = selCat.name;
          if (pageDesc) pageDesc.textContent = selCat.desc || selCat.msg || 'مجموعة مختارة من التصاميم الفاخرة تناسب كل إطلالاتك.';

          if (selCat.banner && selCat.banner.type === 'image' && selCat.banner.img) {
            applyBanner(selCat.banner);
          } else {
            const firstBannerCat = categories.find(c => c.banner && c.banner.type === 'image' && c.banner.img);
            if (firstBannerCat) applyBanner(firstBannerCat.banner);
          }
          return;
        }
      }

      // Default: "all" view
      if (heroTitle) heroTitle.textContent = 'متجر حجاج';
      if (heroSub) heroSub.textContent = 'أناقة تُرتدى بثقة';
      if (heroDesc) heroDesc.textContent = 'تشكيلة حصرية من أرقى التصاميم الرجالية بتفاصيل دقيقة وجودة استثنائية';
      if (crumbTitle) crumbTitle.textContent = 'جميع المنتجات';
      if (pageHeading) pageHeading.textContent = 'جميع المنتجات';
      if (pageDesc) pageDesc.textContent = 'مجموعة مختارة من أرقى التصاميم الرجالية الفاخرة، بتصاميم كلاسيكية وعصرية تناسب كل إطلالاتك.';

      const firstBannerCat = categories.find(c => c.banner && c.banner.type === 'image' && c.banner.img);
      if (firstBannerCat) {
        applyBanner(firstBannerCat.banner);
      }
    }

    function updateActiveCategoryNav() {
      const isAllActive = view === 'all' && !selectedCatId;
      const isSaleActive = view === 'sale';
      const isFavActive = view === 'fav';

      const updateItems = (container) => {
        if (!container) return;
        container.querySelectorAll('[data-view]').forEach(el => {
          const v = el.dataset.view;
          let active = false;
          if (v === 'all') active = isAllActive;
          else if (v === 'sale') active = isSaleActive;
          else if (v === 'fav') active = isFavActive;
          else if (v === 'cat') active = (view === 'cat' && el.dataset.catId === selectedCatId);
          el.classList.toggle('active', active);
        });
      };

      updateItems(document.getElementById('mainNav'));
      updateItems(document.getElementById('mobileCatScroller'));
    }

    let navReadyTimer = null;
    function markNavReady() {
      clearTimeout(navReadyTimer);
      navReadyTimer = setTimeout(() => {
        const mainNav = document.getElementById('mainNav');
        const mobileCatBar = document.querySelector('.mobile-cat-bar');
        const mobileScroller = document.getElementById('mobileCatScroller');
        if (mainNav) mainNav.classList.add('nav-ready');
        if (mobileCatBar) mobileCatBar.classList.add('nav-ready');
        if (mobileScroller) mobileScroller.classList.add('nav-ready');
      }, 1200);
    }

    function renderCategoriesNav() {
      const mainNav = document.getElementById('mainNav');
      const mobileScroller = document.getElementById('mobileCatScroller');

      if (!isCatsLoaded) {
        if (mainNav) {
          mainNav.innerHTML = `
            <div class="nav-skeleton" aria-label="جاري التحميل">
              <span class="nav-skel-pill"></span>
              <span class="nav-skel-pill"></span>
              <span class="nav-skel-pill"></span>
            </div>
          `;
        }
        if (mobileScroller) {
          mobileScroller.innerHTML = `<span class="mobile-cat-pill" style="opacity:0.5">جاري التحميل...</span>`;
        }
        return;
      }

      // Check if navigation elements already exist with matching categories
      const existingPills = mobileScroller ? mobileScroller.querySelectorAll('[data-view="cat"]') : [];
      const isMatchingCats = existingPills.length === categories.length &&
        Array.from(existingPills).every((el, idx) => el.dataset.catId === categories[idx]?.id);

      if (isMatchingCats && mainNav && mainNav.querySelector('[data-view]')) {
        updateActiveCategoryNav();
        markNavReady();
        return;
      }

      const isAllActive = view === 'all' && !selectedCatId;
      const isSaleActive = view === 'sale';
      const isFavActive = view === 'fav';

      let idx = 0;
      let desktopHtml = `<a href="/" data-view="all" style="--i:${idx++}" class="${isAllActive ? 'active' : ''}">الكل</a>`;
      let mobileHtml = `<button type="button" class="mobile-cat-pill ${isAllActive ? 'active' : ''}" data-view="all">الكل</button>`;

      // Render ONLY categories from Cloud Firestore categories collection
      categories.forEach(cat => {
        const isCatActive = view === 'cat' && selectedCatId === cat.id;
        desktopHtml += `<a href="/?cat=${encodeURIComponent(cat.id)}" data-view="cat" data-cat-id="${esc(cat.id)}" style="--i:${idx++}" class="${isCatActive ? 'active' : ''}">${esc(cat.name)}</a>`;
        mobileHtml += `<button type="button" class="mobile-cat-pill ${isCatActive ? 'active' : ''}" data-view="cat" data-cat-id="${esc(cat.id)}">${esc(cat.name)}</button>`;
      });

      desktopHtml += `
        <a href="/?view=sale" data-view="sale" style="--i:${idx++}" class="${isSaleActive ? 'active' : ''}">الخصومات</a>
        <a href="/?view=fav" data-view="fav" style="--i:${idx++}" class="${isFavActive ? 'active' : ''}">المفضلة</a>
      `;

      mobileHtml += `
        <button type="button" class="mobile-cat-pill ${isSaleActive ? 'active' : ''}" data-view="sale">الخصومات</button>
        <button type="button" class="mobile-cat-pill ${isFavActive ? 'active' : ''}" data-view="fav">المفضلة</button>
      `;

      if (mainNav) mainNav.innerHTML = desktopHtml;
      if (mobileScroller) mobileScroller.innerHTML = mobileHtml;

      bindNavEvents();
      markNavReady();
    }

    function bindNavEvents() {
      const handleNavClick = (e) => {
        const target = e.target.closest('[data-view]');
        if (!target) return;
        e.preventDefault();

        const v = target.dataset.view;
        const catId = target.dataset.catId || null;

        if (v === 'all') {
          view = 'all';
          selectedCatId = null;
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('cat');
            url.searchParams.delete('category');
            url.searchParams.delete('view');
            window.history.pushState({}, '', '/');
          } catch (_) {}
        } else if (v === 'cat') {
          view = 'cat';
          selectedCatId = catId;
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('cat', catId);
            url.searchParams.delete('view');
            window.history.pushState({}, '', '/?cat=' + encodeURIComponent(catId));
          } catch (_) {}
        } else if (v === 'sale') {
          view = 'sale';
          selectedCatId = null;
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'sale');
            url.searchParams.delete('cat');
            url.searchParams.delete('category');
            window.history.pushState({}, '', '/?view=sale');
          } catch (_) {}
        } else if (v === 'fav') {
          view = 'fav';
          selectedCatId = null;
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'fav');
            url.searchParams.delete('cat');
            url.searchParams.delete('category');
            window.history.pushState({}, '', '/?view=fav');
          } catch (_) {}
        }

        updateActiveCategoryNav();
        updateHeroAndHeaders();
        render();
      };

      const mainNav = document.getElementById('mainNav');
      if (mainNav && !mainNav._hasHandler) {
        mainNav.addEventListener('click', handleNavClick);
        mainNav._hasHandler = true;
      }

      const mobileScroller = document.getElementById('mobileCatScroller');
      if (mobileScroller && !mobileScroller._hasHandler) {
        mobileScroller.addEventListener('click', handleNavClick);
        mobileScroller._hasHandler = true;
      }
    }

    function parseInitialUrlState() {
      try {
        const params = new URLSearchParams(window.location.search);
        const catParam = params.get('cat') || params.get('category');
        const viewParam = params.get('view');

        if (viewParam === 'sale') {
          view = 'sale';
          selectedCatId = null;
        } else if (viewParam === 'fav') {
          view = 'fav';
          selectedCatId = null;
        } else if (catParam) {
          view = 'cat';
          const matched = categories.find(c => c.id === catParam || c.name.trim().toLowerCase() === catParam.trim().toLowerCase());
          if (matched) {
            selectedCatId = matched.id;
          } else {
            selectedCatId = catParam;
          }
        }
      } catch (_) {}
    }

    /* ---------- dropdowns ---------- */
    function setupDrop(btnId, menuId, onPick) {
      const btn = document.getElementById(btnId), menu = document.getElementById(menuId);
      btn.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.menu.open').forEach(m => { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
      });
      menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        menu.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        onPick(b.dataset.f || b.dataset.s);
        menu.classList.remove('open');
        render();
      }));
    }
    document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')));
    setupDrop('filterBtn', 'filterMenu', f => { priceFilter = f; });
    setupDrop('sortBtn', 'sortMenu', s => { sortMode = s; });

    /* ---------- search ---------- */
    const sOverlay = document.getElementById('searchOverlay'),
      sInput = document.getElementById('searchInput'),
      sResults = document.getElementById('searchResults');
    document.getElementById('searchBtn').addEventListener('click', () => { sOverlay.classList.add('show'); setTimeout(() => sInput.focus(), 80); });
    document.getElementById('searchClose').addEventListener('click', closeSearch);
    sOverlay.addEventListener('click', e => { if (e.target === sOverlay) closeSearch(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSearch(); closeCart(); } });
    function closeSearch() { sOverlay.classList.remove('show'); sInput.value = ''; sResults.innerHTML = ''; }
    sInput.addEventListener('input', () => {
      const q = sInput.value.trim().toLowerCase();
      if (!q) { sResults.innerHTML = ''; return; }
      const hits = products.filter(p => p.name.toLowerCase().includes(q));
      sResults.innerHTML = hits.length ? hits.map(p => `
    <a class="sr-item" href="/product?id=${encodeURIComponent(p.id)}">
      <img src="${esc(p.img || p.mainImage)}" alt="${esc(p.name)}">
      <div><div class="sr-name">${esc(p.name)}</div><div class="sr-price">${p.price} دج</div></div>
    </a>`) : '<div class="search-empty">لا توجد نتائج مطابقة لبحثك</div>';
    });

    // Expose favorites function
    window.toggleFav = toggleFav;

    // --- Card Button Feedback Helpers ---
    function setCardButtonFeedback(button, duration = 1500) {
      if (!button) return;

      // Clear existing timer if any (prevents timer accumulation on rapid clicks)
      if (button._resetTimer) {
        clearTimeout(button._resetTimer);
        button._resetTimer = null;
      }

      button.classList.add('added');
      button.style.removeProperty('background');
      button.style.removeProperty('background-color');
      button.style.removeProperty('border-color');
      button.style.removeProperty('color');

      const txt = button.querySelector('.btn-text');
      if (txt) {
        txt.textContent = '✓ تمت الإضافة إلى السلة';
      }

      button._resetTimer = setTimeout(() => {
        resetCardButtonFeedback(button);
      }, duration);
    }

    function resetCardButtonFeedback(button) {
      if (!button) return;
      if (button._resetTimer) {
        clearTimeout(button._resetTimer);
        button._resetTimer = null;
      }
      button.classList.remove('added');
      button.style.removeProperty('background');
      button.style.removeProperty('background-color');
      button.style.removeProperty('border-color');
      button.style.removeProperty('color');

      const txt = button.querySelector('.btn-text');
      if (txt) {
        txt.textContent = 'إضافة إلى السلة';
      }
      button._busy = false;
    }

    // --- Quick Add To Cart Flow (Card 🛒 button) ---
    let currentQoProduct = null;
    let currentQoBtn = null;
    let qoSelectedSize = null;
    let qoSelectedColor = null;
    let qoSelectedColorHex = '#1d1a16';
    let qoQty = 1;

    function closeQuickOptions() {
      document.getElementById('qoModal')?.classList.remove('show');
      document.getElementById('qoBackdrop')?.classList.remove('show');
      document.body.classList.remove('modal-open');
      if (currentQoBtn) currentQoBtn._busy = false;
      currentQoProduct = null;
      currentQoBtn = null;
    }

    function updateQoSubtotal() {
      if (!currentQoProduct) return;
      const subtotalVal = document.getElementById('qoSubtotalVal');
      if (subtotalVal) {
        subtotalVal.textContent = (currentQoProduct.price * qoQty).toLocaleString('ar-DZ') + ' دج';
      }
    }

    function openQuickOptions(p, btn) {
      currentQoProduct = p;
      currentQoBtn = btn;
      qoSelectedSize = null;
      qoSelectedColor = null;
      qoSelectedColorHex = '#1d1a16';
      qoQty = 1;

      const modal = document.getElementById('qoModal');
      const backdrop = document.getElementById('qoBackdrop');
      const imgEl = document.getElementById('qoImg');
      const titleEl = document.getElementById('qoTitle');
      const priceEl = document.getElementById('qoPrice');
      const sizesSec = document.getElementById('qoSizesSection');
      const sizesList = document.getElementById('qoSizesList');
      const sizeText = document.getElementById('qoSelectedSizeText');
      const colorsSec = document.getElementById('qoColorsSection');
      const colorsList = document.getElementById('qoColorsList');
      const colorText = document.getElementById('qoSelectedColorText');
      const qtyVal = document.getElementById('qoQtyVal');
      const bannerErr = document.getElementById('qoBannerErr');
      const sizeErr = document.getElementById('qoSizeErr');
      const colorErr = document.getElementById('qoColorErr');

      if (bannerErr) bannerErr.style.display = 'none';
      if (sizeErr) sizeErr.style.display = 'none';
      if (colorErr) colorErr.style.display = 'none';

      if (imgEl) imgEl.src = p.img || p.mainImage || 'img/p1.png';
      if (titleEl) titleEl.textContent = p.name;
      if (priceEl) priceEl.textContent = p.price.toLocaleString('ar-DZ');
      if (qtyVal) qtyVal.textContent = 1;
      if (sizeText) sizeText.textContent = '';
      if (colorText) colorText.textContent = '';
      updateQoSubtotal();

      // Render sizes
      const sizes = Array.isArray(p.sizes) ? p.sizes : [];
      if (sizes.length > 0 && sizesSec && sizesList) {
        sizesSec.style.display = 'block';
        sizesList.innerHTML = sizes.map(s => `
      <button type="button" class="qo-size-chip" data-size="${esc(s)}">${esc(s)}</button>
    `).join('');

        sizesList.querySelectorAll('.qo-size-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            sizesList.querySelectorAll('.qo-size-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            qoSelectedSize = chip.dataset.size;
            if (sizeText) sizeText.textContent = `(${qoSelectedSize})`;
            if (sizeErr) sizeErr.style.display = 'none';
            if (bannerErr) bannerErr.style.display = 'none';
          });
        });
      } else if (sizesSec) {
        sizesSec.style.display = 'none';
        qoSelectedSize = 'افتراضي';
      }

      // Render colors
      const colors = Array.isArray(p.colors) ? p.colors : [];
      if (colors.length > 0 && colorsSec && colorsList) {
        colorsSec.style.display = 'block';
        colorsList.innerHTML = colors.map((c, idx) => {
          const val = typeof c === 'object' ? (c.value || c.hex) : c;
          const nm = typeof c === 'object' ? c.name : (p.colorNames && p.colorNames[idx] ? p.colorNames[idx] : 'لون');
          const hex = resolveColorHex(val || nm);
          const isLight = hex.toLowerCase() === '#ffffff' || hex.toLowerCase() === '#fff';
          return `<button type="button" class="qo-color-dot" style="background:${hex};${isLight ? 'border:2px solid #ccc' : ''}" title="${esc(nm)}" data-name="${esc(nm)}" data-val="${hex}"></button>`;
        }).join('');

        colorsList.querySelectorAll('.qo-color-dot').forEach(dot => {
          dot.addEventListener('click', () => {
            colorsList.querySelectorAll('.qo-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            qoSelectedColor = dot.dataset.name;
            qoSelectedColorHex = dot.dataset.val;
            if (colorText) colorText.textContent = `(${qoSelectedColor})`;
            if (colorErr) colorErr.style.display = 'none';
            if (bannerErr) bannerErr.style.display = 'none';
          });
        });
      } else if (colorsSec) {
        colorsSec.style.display = 'none';
        qoSelectedColor = 'افتراضي';
      }

      modal?.classList.add('show');
      backdrop?.classList.add('show');
      document.body.classList.add('modal-open');
    }

    // Bind modal controls
    document.getElementById('qoClose')?.addEventListener('click', closeQuickOptions);
    document.getElementById('qoBackdrop')?.addEventListener('click', closeQuickOptions);

    document.getElementById('qoQtyPlus')?.addEventListener('click', () => {
      qoQty += 1;
      const qtyEl = document.getElementById('qoQtyVal');
      if (qtyEl) qtyEl.textContent = qoQty;
      updateQoSubtotal();
    });

    document.getElementById('qoQtyMinus')?.addEventListener('click', () => {
      if (qoQty > 1) {
        qoQty -= 1;
        const qtyEl = document.getElementById('qoQtyVal');
        if (qtyEl) qtyEl.textContent = qoQty;
        updateQoSubtotal();
      }
    });

    let isQoSubmitting = false;
    document.getElementById('qoSubmitBtn')?.addEventListener('click', () => {
      if (isQoSubmitting || !currentQoProduct) return;

      const hasSizes = Array.isArray(currentQoProduct.sizes) && currentQoProduct.sizes.length > 0;
      const hasColors = Array.isArray(currentQoProduct.colors) && currentQoProduct.colors.length > 0;

      const needSize = hasSizes && !qoSelectedSize;
      const needColor = hasColors && !qoSelectedColor;

      const sizeErr = document.getElementById('qoSizeErr');
      const colorErr = document.getElementById('qoColorErr');
      const bannerErr = document.getElementById('qoBannerErr');

      if (needSize && needColor) {
        if (sizeErr) sizeErr.style.display = 'block';
        if (colorErr) colorErr.style.display = 'block';
        if (bannerErr) {
          bannerErr.textContent = 'يرجى اختيار المقاس واللون أولاً';
          bannerErr.style.display = 'block';
        }
        return;
      }
      if (needSize) {
        if (sizeErr) sizeErr.style.display = 'block';
        if (bannerErr) {
          bannerErr.textContent = 'يرجى اختيار المقاس أولاً';
          bannerErr.style.display = 'block';
        }
        return;
      }
      if (needColor) {
        if (colorErr) colorErr.style.display = 'block';
        if (bannerErr) {
          bannerErr.textContent = 'يرجى اختيار اللون أولاً';
          bannerErr.style.display = 'block';
        }
        return;
      }

      isQoSubmitting = true;
      const submitBtn = document.getElementById('qoSubmitBtn');
      if (submitBtn) submitBtn.disabled = true;

      // Add to cart with all required options (do not force drawer open over the page)
      window.hadjajCart.addToCart({
        productId: currentQoProduct.id,
        name: currentQoProduct.name,
        price: currentQoProduct.price,
        image: currentQoProduct.img || currentQoProduct.mainImage || 'img/p1.png',
        quantity: qoQty,
        size: qoSelectedSize || 'افتراضي',
        color: qoSelectedColor || 'افتراضي',
        colorHex: qoSelectedColorHex || '#1d1a16',
        availableSizes: currentQoProduct.sizes,
        availableColors: currentQoProduct.colors,
        openDrawer: false
      });

      const targetBtn = currentQoBtn;

      closeQuickOptions();

      // Visual feedback on card button if provided (safe captured reference)
      if (targetBtn) {
        setCardButtonFeedback(targetBtn, 1500);
      }

      setTimeout(() => {
        isQoSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }, 250);
    });

    // Card 🛒 click handler
    window.handleCardQuickAdd = function (productId, btn) {
      if (btn._busy) return;
      btn._busy = true;
      setTimeout(() => { btn._busy = false; }, 250);

      const p = products.find(item => String(item.id) === String(productId));
      if (!p) {
        btn._busy = false;
        return;
      }

      const hasSizes = Array.isArray(p.sizes) && p.sizes.length > 0;
      const hasColors = Array.isArray(p.colors) && p.colors.length > 0;

      // Case A: Product has NO sizes and NO colors -> add directly
      if (!hasSizes && !hasColors) {
        window.hadjajCart.addToCart({
          productId: p.id,
          name: p.name,
          price: p.price,
          image: p.img || p.mainImage || 'img/p1.png',
          quantity: 1,
          size: 'افتراضي',
          color: 'افتراضي',
          colorHex: '#1d1a16',
          openDrawer: false
        });

        setCardButtonFeedback(btn, 1500);
        return;
      }

      // Case B: Product HAS sizes or colors -> open Quick Options Modal
      openQuickOptions(p, btn);
    };

    // Initialize Unified Shopping Cart & Checkout
    initCartUI();

    // --- Real-time Firestore Connection ---
    function initFirestoreSync() {
      const colRef = collection(db, "products");
      onSnapshot(colRef, (snapshot) => {
        const list = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d.status === 'hidden') return;

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
            sizes: Array.isArray(d.sizes) ? d.sizes : [],
            status: d.status || 'active',
            category: d.category || '',
            categoryId: d.categoryId || d.category || ''
          });
        });

        products = list;
        isLoaded = true;
        render();
      }, (err) => {
        console.error("Firestore onSnapshot error:", err);
        isLoaded = true;
        render();
      });

      // Sole Authoritative Categories Listener from Cloud Firestore
      const catsRef = collection(db, "categories");
      onSnapshot(catsRef, (catSnap) => {
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
            createdAt: cd.createdAt || '',
            banner: cd.banner || null,
            msg: cd.msg || '',
            desc: cd.desc || ''
          });
        });

        // Sort by order/sortOrder -> createdAt -> name (Arabic)
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

        const isFirstLoad = !isCatsLoaded;
        categories = list;
        isCatsLoaded = true;

        try {
          localStorage.setItem('clothstore_categories_cache', JSON.stringify(list));
        } catch (_) {}

        if (isFirstLoad) {
          parseInitialUrlState();
        } else if (selectedCatId) {
          // If the currently selected category was deleted or renamed in Firestore
          const exists = categories.find(c => c.id === selectedCatId);
          if (!exists) {
            selectedCatId = null;
            view = 'all';
          }
        }

        renderCategoriesNav();
        updateHeroAndHeaders();
        render();
      }, (err) => {
        console.warn("Categories onSnapshot error:", err);
        isCatsLoaded = true;
        renderCategoriesNav();
      });
    }

    // Initial parse and render with cached or skeleton state
    parseInitialUrlState();
    renderCategoriesNav();
    updateHeroAndHeaders();
    render();
    initFirestoreSync();

    // Browser back/forward navigation support
    window.addEventListener('popstate', () => {
      parseInitialUrlState();
      updateActiveCategoryNav();
      updateHeroAndHeaders();
      render();
    });

// Smooth scroll for Hero Shop button
const heroShopBtn = document.getElementById("heroShopBtn");
if (heroShopBtn) {
  heroShopBtn.addEventListener("click", () => {
    document.querySelector(".toolbar")?.scrollIntoView({ behavior: "smooth" });
  });
}

// Motion System: Header scroll compression
window.addEventListener('scroll', () => {
  const header = document.querySelector('header');
  if (header) {
    if (window.scrollY > 25) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }
}, { passive: true });


