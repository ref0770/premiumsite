document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      var expanded = nav.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (item.open) {
        faqItems.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            setTimeout(function () {
              entry.target.classList.add("is-visible");
            }, (i % 4) * 70);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { observer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  loadGoogleReviews();
  initCountUps();
});

/**
 * Count-up animation for stat figures (24/7, 20-30 хв, 5.0★, etc.) — plays once
 * when a stat scrolls into view. Parses the leading number out of the element's
 * existing text so no markup changes are needed, animates from 0, then restores
 * the exact original text (avoids float rounding artifacts in the suffix).
 * Skipped entirely under prefers-reduced-motion — the static value already
 * present in the HTML is the fallback, no extra code needed.
 */
function initCountUps() {
  var els = document.querySelectorAll(".hero-mini-stat strong, .stat strong, .rating-badge strong");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function animate(el) {
    var original = el.textContent.trim();
    var match = original.match(/^(\d+(?:\.\d+)?)/);
    if (!match) return;
    var target = parseFloat(match[1]);
    var decimals = (match[1].split(".")[1] || "").length;
    var suffix = original.slice(match[1].length);
    var duration = 1100;
    var start = null;

    function tick(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = original;
      }
    }
    requestAnimationFrame(tick);
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 }
  );
  els.forEach(function (el) { observer.observe(el); });
}

/**
 * Live Google reviews, fetched through our own /api/google-reviews proxy
 * (a Cloudflare Pages Function) — the real Google API key lives only in that
 * function's server-side environment variable, never in this public file.
 * Progressive enhancement: static placeholder cards stay in the markup and
 * render immediately; on successful fetch we replace them with real data.
 * If the fetch fails (offline, proxy not deployed, quota), the static
 * placeholders remain untouched — no broken UI.
 */
function loadGoogleReviews() {
  var grids = document.querySelectorAll(".grid-reviews");
  if (!grids.length) return;

  var lang = document.documentElement.lang === "ru" ? "ru" : "uk";
  var cacheKey = "gReviews_" + lang;
  var cacheTtlMs = 60 * 60 * 1000; // 1 hour — keep well under Places API caching limits

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function starString(rating) {
    var full = Math.max(0, Math.min(5, Math.round(rating || 5)));
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  function buildCard(review) {
    var name = (review.authorAttribution && review.authorAttribution.displayName) || "Google";
    var text = (review.text && review.text.text) || "";
    var time = review.relativePublishTimeDescription || "";
    var card = document.createElement("div");
    card.className = "review-card";
    card.innerHTML =
      '<div class="stars">' + starString(review.rating) + "</div>" +
      '<p class="text">' + escapeHtml(text) + "</p>" +
      '<div class="who">' + escapeHtml(name) + " <span>" + escapeHtml(time) + "</span></div>";
    return card;
  }

  function applyData(data) {
    var reviews = (data && data.reviews) || [];
    if (!reviews.length) return;

    grids.forEach(function (grid) {
      grid.innerHTML = "";
      reviews.slice(0, 6).forEach(function (r) { grid.appendChild(buildCard(r)); });
    });

    document.querySelectorAll(".review-placeholder-note").forEach(function (note) {
      note.remove();
    });

    if (data.rating) {
      document.querySelectorAll(".rating-badge").forEach(function (badge) {
        var strong = badge.querySelector("strong");
        var flag = badge.querySelector(".todo-flag");
        if (strong) strong.textContent = data.rating.toFixed(1);
        if (flag) flag.remove();
      });
    }
  }

  function fetchLive() {
    var url = "/api/google-reviews?lang=" + lang;
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Places API " + res.status);
        return res.json();
      })
      .then(function (data) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: data }));
        } catch (e) { /* sessionStorage unavailable — skip caching */ }
        applyData(data);
      })
      .catch(function () { /* silent: static placeholder cards remain visible */ });
  }

  try {
    var cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.at < cacheTtlMs) {
      applyData(cached.data);
      return;
    }
  } catch (e) { /* fall through to live fetch */ }

  fetchLive();
}
