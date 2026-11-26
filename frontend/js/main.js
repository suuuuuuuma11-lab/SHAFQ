(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Sun emblem (vector redraw of the SHAFQ mark) ---------- */
  function drawEmblem() {
    var svg = $("#emblem-sun"); if (!svg) return;
    var cx = 420, cy = 385, base = 100;
    // [angle from vertical (deg, negative = left), tip radius, half-width at base]
    var rays = [
      [0, 275, 13], [-27, 244, 11], [27, 252, 11], [-51, 240, 10], [51, 246, 10],
      [-77, 224, 10], [77, 232, 10], [-96, 190, 9], [96, 196, 9],
      [-13, 156, 6], [13, 156, 6], [-39, 146, 5.5], [39, 146, 5.5], [-64, 140, 5.5], [64, 140, 5.5], [-86, 130, 5.5], [86, 130, 5.5]
    ];
    var d = "";
    rays.forEach(function (r) {
      var a = r[0] * Math.PI / 180, L = r[1], w = r[2];
      var ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux;
      var b1x = cx + ux * (base - 2) + px * w, b1y = cy + uy * (base - 2) + py * w;
      var b2x = cx + ux * (base - 2) - px * w, b2y = cy + uy * (base - 2) - py * w;
      var tx = cx + ux * L, ty = cy + uy * L;
      d += "M" + b1x.toFixed(1) + " " + b1y.toFixed(1) + "L" + tx.toFixed(1) + " " + ty.toFixed(1) + "L" + b2x.toFixed(1) + " " + b2y.toFixed(1) + "Z";
    });
    svg.innerHTML =
      '<path d="' + d + '"/>' +
      '<path d="M310 436 L317 392 A103 103 0 0 1 523 392 L530 436 L505 422 L502 392 A80 80 0 0 0 338 392 L335 422 Z"/>' +
      '<path d="M421 356v28M407 370h28" stroke="currentColor" stroke-width="9" fill="none" stroke-linecap="butt"/>' +
      '<circle cx="250" cy="306" r="3.5"/><circle cx="590" cy="306" r="3.5"/>';
  }

  function closeAll() {
    var sheet = $("#sheet-search"), drawer = $("#drawer-cart"), scrim = $("#scrim");
    var pSearch = $("#searchOverlay");
    var bSearch = $("#btn-search"), nav = $("#nav"), burger = $("#btn-menu"), sidebar = $("#shop-sidebar");
    if (sheet) sheet.hidden = true;
    if (pSearch) { pSearch.classList.remove("show"); pSearch.setAttribute("aria-hidden", "true"); }
    if (window.SHAFQ_SEARCH && window.SHAFQ_SEARCH.reset) window.SHAFQ_SEARCH.reset();
    if (drawer) { drawer.hidden = true; drawer.setAttribute("aria-hidden", "true"); }
    if (sidebar) sidebar.classList.remove("is-open");
    var btnFilter = $("#btn-filter"); if (btnFilter) btnFilter.setAttribute("aria-expanded", "false");
    if (scrim) scrim.hidden = true;
    if (bSearch) bSearch.setAttribute("aria-expanded", "false");
    if (nav) nav.classList.remove("is-open");
    if (burger) {
      burger.setAttribute("aria-expanded", "false");
      if (burger.firstElementChild && burger.firstElementChild.firstElementChild) {
        burger.firstElementChild.firstElementChild.setAttribute("href", "#i-menu");
      }
    }
  }

  function redirectLegacyCatalogRootUrl() {
    if (!document.body || !document.body.classList.contains("page-home")) return false;
    try {
      var params = new URLSearchParams(location.search);
      var cat = params.get("cat") || params.get("category");
      var view = (params.get("view") || "").trim().toLowerCase();
      var q = params.get("q") || params.get("search");
      if (cat || q || view === "sale" || view === "discounts" || view === "fav" || view === "favorites") {
        location.replace("/shop" + location.search);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function initPage() {
    if (redirectLegacyCatalogRootUrl()) return;
    drawEmblem();

    /* ---------- Navigation ---------- */
    var nav = $("#nav"), burger = $("#btn-menu");
    $$(".nav__link").forEach(function (a) {
      a.addEventListener("click", closeAll);
    });
    if (burger && nav) {
      burger.addEventListener("click", function () {
        var open = !nav.classList.contains("is-open");
        closeAll();
        nav.classList.toggle("is-open", open);
        burger.setAttribute("aria-expanded", String(open));
        if (burger.firstElementChild && burger.firstElementChild.firstElementChild) {
          burger.firstElementChild.firstElementChild.setAttribute("href", open ? "#i-close" : "#i-menu");
        }
      });
    }

    /* ---------- Search / Bag ---------- */
    var sheet = $("#sheet-search"), drawer = $("#drawer-cart"), scrim = $("#scrim");
    var bSearch = $("#btn-search"), bCart = $("#btn-cart");
    if (bSearch && sheet) {
      bSearch.addEventListener("click", function () {
        var open = sheet.hidden; closeAll();
        if (open) {
          sheet.hidden = false;
          if (scrim) scrim.hidden = false;
          bSearch.setAttribute("aria-expanded", "true");
          var inp = $("#search-input"); if (inp) inp.focus();
        }
      });
    }
    if (bCart && drawer) {
      bCart.addEventListener("click", function () {
        var open = drawer.hidden; closeAll();
        if (open) {
          if (window.shafqCart && window.shafqCart.render) {
            window.shafqCart.render();
          }
          drawer.hidden = false;
          drawer.setAttribute("aria-hidden", "false");
          if (scrim) scrim.hidden = false;
        }
      });
    }
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeAll); });
    if (scrim) scrim.addEventListener("click", closeAll);

    var searchForm = $("#search-form");
    if (searchForm && !searchForm.dataset.shafqMainSubmitBound) {
      searchForm.dataset.shafqMainSubmitBound = "1";
      searchForm.addEventListener("submit", function (e) {
        if (searchForm.dataset.shafqSearchSubmitBound === "1") return;
        e.preventDefault();
        var inp = $("#search-input"), res = $("#search-result");
        if (!inp) return;
        var q = inp.value.trim(); if (!q) return;
        if (window.SHAFQ_SEARCH && window.SHAFQ_SEARCH.submitQuery) {
          window.SHAFQ_SEARCH.submitQuery(q);
        } else if (res) {
          res.textContent = "Searching collection...";
        }
      });
    }

    /* ---------- Newsletter form ---------- */
    var nlForm = $("#newsletter-form"), nlStatus = $("#newsletter-status");
    if (nlForm) {
      nlForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = $(".newsletter__input", nlForm);
        if (!input || !input.value.trim()) return;
        input.value = "";
        if (nlStatus) {
          nlStatus.textContent = "Thank you for subscribing.";
          nlStatus.hidden = false;
          setTimeout(function () { nlStatus.hidden = true; }, 4000);
        }
      });
    }

    /* ---------- Contact form ---------- */
    var contactForm = $("#contact-form"), contactStatus = $("#contact-status");
    if (contactForm) {
      contactForm.addEventListener("submit", function (e) {
        e.preventDefault();
        contactForm.reset();
        if (contactStatus) {
          contactStatus.textContent = "Thank you — your message has been received.";
          contactStatus.hidden = false;
          setTimeout(function () { contactStatus.hidden = true; }, 5000);
        }
      });
    }

    if (window.SHAFQ_SEARCH && window.SHAFQ_SEARCH.init) {
      window.SHAFQ_SEARCH.init();
    }
    if (window.shafqCart && window.shafqCart.init) {
      window.shafqCart.init();
    }
    if (window.SHAFQ_SHOP && window.SHAFQ_SHOP.init) {
      window.SHAFQ_SHOP.init();
    }
    if (window.SHAFQ_PRODUCT && window.SHAFQ_PRODUCT.init) {
      window.SHAFQ_PRODUCT.init();
    }
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });

  window.SHAFQ = { initPage: initPage, closeAll: closeAll };

  initPage();
})();
