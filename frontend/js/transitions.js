/* ==========================================================================
   SHAFQ — Scalable Shared Element Page Transitions
   Supports any multi-page combination (Home <-> Shop <-> About <-> Contact)
   using the View Transitions API with zero-delay pre-warmed snapshots and
   graceful fallback for unsupported browsers.
   ========================================================================== */
(function () {
  "use strict";

  var isHttp = location.protocol === "http:" || location.protocol === "https:";
  var supportsVT = typeof document.startViewTransition === "function";
  var reducedMotion = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  function normalizePath(pathname) {
    var clean = String(pathname || "/")
      .replace(/\/index(?:\.html)?$/i, "/")
      .replace(/\.html$/i, "");
    if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
    return clean || "/";
  }

  function sameDocument(url) {
    return normalizePath(url.pathname) === normalizePath(location.pathname) && url.search === location.search;
  }

  function getInternalUrl(link) {
    if (!link || !link.getAttribute("href")) return null;
    if (link.target === "_blank" || link.hasAttribute("download") || link.hasAttribute("data-no-transition")) return null;
    var raw = link.getAttribute("href").trim();
    if (!raw || raw.charAt(0) === "#") return null;
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return null; }
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") return null;
    if (isHttp && url.origin !== location.origin) return null;
    if (!isHttp && location.protocol === "file:" && url.protocol !== "file:") return null;
    return url;
  }

  /* ---------- Native MPA pagereveal support ---------- */
  window.addEventListener("pagereveal", function (e) {
    if (e.viewTransition) {
      document.documentElement.classList.add("is-vt-nav");
    }
  });

  /* ---------- Fallback transition for non-VT browsers / file:// ---------- */
  (function initFallbackEntrance() {
    try {
      if (sessionStorage.getItem("shafq-vt-fallback") === "1") {
        sessionStorage.removeItem("shafq-vt-fallback");
        if (!reducedMotion()) {
          document.documentElement.classList.add("is-page-entering");
          setTimeout(function () {
            document.documentElement.classList.remove("is-page-entering");
          }, 400);
        }
      }
    } catch (e) {}
    window.addEventListener("pageshow", function () {
      document.documentElement.classList.remove("is-page-leaving");
    });
  })();

  function fallbackNavigate(href) {
    if (reducedMotion()) {
      location.href = href;
      return;
    }
    try { sessionStorage.setItem("shafq-vt-fallback", "1"); } catch (e) {}
    document.documentElement.classList.add("is-page-leaving");
    setTimeout(function () { location.href = href; }, 210);
  }

  /* ---------- View Transition cache & pre-warming ---------- */
  var parsedCache = new Map();
  var inflightFetches = new Map();
  var loadedScripts = new Set(
    Array.prototype.slice.call(document.querySelectorAll("script[src]")).map(function (s) { return s.src; })
  );
  var activeController = null;
  var currentRouteKey = normalizePath(location.pathname) + location.search;

  function ensureScripts(nextDoc, url) {
    var baseHref = (url && url.href) || location.href;
    var incoming = Array.prototype.slice.call(nextDoc.querySelectorAll("script[src]"));
    var missing = [];
    incoming.forEach(function (s) {
      var abs = new URL(s.getAttribute("src"), baseHref).href;
      if (!loadedScripts.has(abs)) {
        missing.push({ src: abs, type: s.getAttribute("type") || "" });
      }
    });
    if (!missing.length) return null;
    return missing.reduce(function (chain, item) {
      return chain.then(function () {
        return new Promise(function (resolve) {
          if (loadedScripts.has(item.src)) return resolve();
          var el = document.createElement("script");
          if (item.type) el.type = item.type;
          el.src = item.src;
          el.onload = function () { loadedScripts.add(item.src); resolve(); };
          el.onerror = resolve;
          document.head.appendChild(el);
        });
      });
    }, Promise.resolve());
  }

  function warmImages(doc) {
    var imgs = Array.prototype.slice.call(doc.body.querySelectorAll(".brand img, .hero__img, .shop-hero__img, .about-hero__img, .about-media__img"));
    imgs.forEach(function (el) {
      var src = el.getAttribute("src");
      if (!src) return;
      var img = new Image();
      img.src = new URL(src, location.href).href;
      if (img.decode) img.decode().catch(function () {});
    });
  }

  function fetchAndParse(url, signal) {
    var cached = parsedCache.get(url.href);
    if (cached) return Promise.resolve(cached);

    var inflight = inflightFetches.get(url.href);
    if (inflight && !signal) return inflight;

    var p = fetch(url.href, { signal: signal, headers: { "X-Requested-With": "shafq-vt" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        var ct = res.headers.get("content-type") || "";
        if (ct && ct.indexOf("text/html") === -1) throw new Error("Not HTML");
        return res.text();
      })
      .then(function (html) {
        var nextDoc = new DOMParser().parseFromString(html, "text/html");
        if (!nextDoc || !nextDoc.body) throw new Error("Invalid HTML");
        parsedCache.set(url.href, nextDoc);
        warmImages(nextDoc);
        return nextDoc;
      })
      .finally(function () {
        inflightFetches.delete(url.href);
      });

    if (!signal) inflightFetches.set(url.href, p);
    return p;
  }

  function syncStylesheets(nextDoc) {
    var existing = Array.prototype.slice.call(document.head.querySelectorAll('link[rel="stylesheet"]'))
      .map(function (l) { return l.href; });
    var incoming = Array.prototype.slice.call(nextDoc.head.querySelectorAll('link[rel="stylesheet"]'));
    var loads = [];
    incoming.forEach(function (link) {
      var abs = new URL(link.getAttribute("href"), location.href).href;
      if (existing.indexOf(abs) === -1) {
        var clone = document.createElement("link");
        clone.rel = "stylesheet";
        clone.href = abs;
        loads.push(new Promise(function (resolve) {
          clone.onload = resolve;
          clone.onerror = resolve;
          setTimeout(resolve, 400);
        }));
        document.head.appendChild(clone);
      }
    });
    return loads.length ? Promise.all(loads) : null;
  }

  function syncMeta(nextDoc) {
    document.title = nextDoc.title || document.title;
    ["description", "theme-color"].forEach(function (name) {
      var nextMeta = nextDoc.head.querySelector('meta[name="' + name + '"]');
      var curMeta = document.head.querySelector('meta[name="' + name + '"]');
      if (nextMeta && curMeta) curMeta.setAttribute("content", nextMeta.getAttribute("content") || "");
    });
  }

  function decodeLiveImages() {
    var imgs = Array.prototype.slice.call(document.body.querySelectorAll(".brand img, .hero__img, .shop-hero__img, .about-hero__img, .about-media__img"));
    if (!imgs.length) return null;
    var pending = imgs.map(function (img) {
      if (img.complete && img.naturalWidth > 0 && !img.decode) return Promise.resolve();
      if (img.decode) return img.decode().catch(function () {});
      return new Promise(function (resolve) {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    });
    return Promise.race([
      Promise.all(pending),
      new Promise(function (resolve) { setTimeout(resolve, 120); })
    ]);
  }

  function applyDocument(nextDoc, url) {
    if (window.SHAFQ && window.SHAFQ.closeAll) window.SHAFQ.closeAll();
    if (window.SHAFQ && window.SHAFQ.cleanupPage) window.SHAFQ.cleanupPage();
    syncMeta(nextDoc);

    document.body.className = nextDoc.body.className;
    Array.prototype.slice.call(document.body.attributes).forEach(function (attr) {
      if (attr.name.indexOf("data-") === 0) document.body.removeAttribute(attr.name);
    });
    Array.prototype.slice.call(nextDoc.body.attributes).forEach(function (attr) {
      if (attr.name.indexOf("data-") === 0) document.body.setAttribute(attr.name, attr.value);
    });

    document.body.innerHTML = nextDoc.body.innerHTML;

    if (url.hash) {
      var target = document.getElementById(url.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: "instant" });
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }

    if (window.SHAFQ && window.SHAFQ.initPage) {
      window.SHAFQ.initPage();
    }
  }

  function runTransition(nextDoc, url, pushHistory) {
    currentRouteKey = normalizePath(url.pathname) + url.search;
    if (pushHistory) history.pushState({ shafqUrl: url.href }, "", url.href);

    if (reducedMotion()) {
      applyDocument(nextDoc, url);
      return;
    }

    document.documentElement.classList.add("is-vt-nav");

    try {
      var vt = document.startViewTransition(function () {
        var cssWait = syncStylesheets(nextDoc);
        applyDocument(nextDoc, url);
        var imgWait = decodeLiveImages();
        if (cssWait || imgWait) {
          return Promise.all([cssWait, imgWait]);
        }
      });
      if (vt && vt.ready) vt.ready.catch(function () {});
      if (vt && vt.finished) vt.finished.catch(function () {});
      if (vt && vt.updateCallbackDone) vt.updateCallbackDone.catch(function () {});
    } catch (err) {
      applyDocument(nextDoc, url);
    }
  }

  function navigateWithVT(url, pushHistory) {
    if (activeController) activeController.abort();

    // Instant synchronous path when page & its scripts are already ready
    var cachedDoc = parsedCache.get(url.href);
    if (cachedDoc) {
      var scriptWait = ensureScripts(cachedDoc, url);
      if (!scriptWait) {
        runTransition(cachedDoc, url, pushHistory);
      } else {
        scriptWait.then(function () { runTransition(cachedDoc, url, pushHistory); });
      }
      return;
    }

    activeController = new AbortController();
    fetchAndParse(url, activeController.signal)
      .then(function (nextDoc) {
        var scriptWait = ensureScripts(nextDoc, url);
        if (scriptWait) return scriptWait.then(function () { return nextDoc; });
        return nextDoc;
      })
      .then(function (nextDoc) {
        runTransition(nextDoc, url, pushHistory);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        location.href = url.href;
      });
  }

  /* ---------- Pre-warm internal navigation targets ---------- */
  function warmUpNavLinks() {
    if (!isHttp || !supportsVT) return;
    var links = document.querySelectorAll(".nav__link, .cta, .brand");
    var seen = new Set();
    links.forEach(function (link) {
      var url = getInternalUrl(link);
      if (!url || sameDocument(url) || seen.has(url.href)) return;
      seen.add(url.href);
      fetchAndParse(url).catch(function () {});
    });
  }

  if (isHttp) {
    history.replaceState({ shafqUrl: location.href }, "", location.href);
    if (document.readyState === "complete") {
      setTimeout(warmUpNavLinks, 60);
    } else {
      window.addEventListener("load", function () { setTimeout(warmUpNavLinks, 60); }, { once: true });
    }
  }

  function prefetchOnIntent(e) {
    if (!isHttp || !supportsVT) return;
    var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    var url = getInternalUrl(link);
    if (!url || sameDocument(url) || parsedCache.has(url.href)) return;
    fetchAndParse(url).catch(function () {});
  }
  document.addEventListener("pointerenter", prefetchOnIntent, true);
  document.addEventListener("focusin", prefetchOnIntent, true);

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    var url = getInternalUrl(link);
    if (!url) return;

    if (sameDocument(url)) {
      if (!url.hash) {
        e.preventDefault();
        if (window.SHAFQ && window.SHAFQ.closeAll) window.SHAFQ.closeAll();
        window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
      }
      return;
    }

    e.preventDefault();
    if (isHttp && supportsVT) {
      navigateWithVT(url, true);
    } else {
      fallbackNavigate(url.href);
    }
  });

  window.SHAFQ_VT = {
    syncRoute: function (href) {
      try {
        var u = new URL(href || location.href, location.href);
        currentRouteKey = normalizePath(u.pathname) + u.search;
      } catch (e) {}
    }
  };

  window.addEventListener("popstate", function () {
    if (!isHttp || !supportsVT) return;
    var url = new URL(location.href);
    var nextPath = normalizePath(url.pathname);
    var curPath = currentRouteKey.split("?")[0];
    var nextRouteKey = nextPath + url.search;
    if (nextRouteKey === currentRouteKey) return;
    if (nextPath === curPath) {
      currentRouteKey = nextRouteKey;
      return;
    }
    navigateWithVT(url, false);
  });
})();
