/* ============================================================
   Reyhan's Story Shelf (V2) — app
   Hash router + four views (shelves, book spread, journey,
   passport), search overlay, and the "Pick for me!" die.
   Data comes from buildLibrary() in config.js; covers from
   covers.js. No dependencies, no build step.
   ============================================================ */

(function () {
  "use strict";

  var lib = buildLibrary();
  var view = document.getElementById("view");
  var homeScroll = 0;

  /* ---------- tiny helpers ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  }

  function monthLabel(key) { /* "2026-03" -> "March 2026" */
    var names = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    return names[+key.slice(5, 7) - 1] + " " + key.slice(0, 4);
  }

  function starString(rating) {
    var out = "", full = Math.round(rating);
    for (var i = 1; i <= 5; i++) out += i <= full ? "★" : "☆";
    return out;
  }

  function fmt(n) { return n.toLocaleString("en-US"); }

  function hydrateCovers(root) {
    root.querySelectorAll("img[data-book-id]").forEach(function (img) {
      var book = lib.byId[img.getAttribute("data-book-id")];
      if (book) Covers.hydrate(img, book);
    });
  }

  function coverImg(book, cls, sizesAttr) {
    return '<img class="' + cls + '" data-book-id="' + esc(book.id) + '" alt="Cover of ' +
      esc(book.title) + '"' + (sizesAttr || "") + ">";
  }

  /* Covers span every shape publishers have ever printed - square
     board books, landscape pop-ups, tall paperbacks. The CSS aspect-
     ratio on these classes is just a pre-load guess so a box is
     reserved before the image arrives; once each image actually
     loads (real or cached), size its own box to its true proportions
     instead of leaving it letterboxed/cropped into one fixed shape. */
  function fitCoverRatio(root, selector) {
    root.querySelectorAll(selector).forEach(function (img) {
      function apply() {
        if (img.naturalWidth && img.naturalHeight) {
          img.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
        }
      }
      if (img.complete) apply();
      img.addEventListener("load", apply);
    });
  }

  /* ---------- views ---------- */

  var BEGINNINGS_PREVIEW_COUNT = 12;

  function renderShelves() {
    var html =
      '<h1 class="view-title">Shelves</h1>' +
      '<p class="view-sub">Every series, grouped together — and a peek at the books from before this log began.</p>';

    lib.series.forEach(function (s) {
      html +=
        '<section class="shelf-section" data-series="' + esc(s.name) + '">' +
          '<div class="shelf-plaque">' +
            '<span class="swatch" style="background:' + s.color + '"></span>' +
            "<h2>" + esc(s.name) + "</h2>" +
            '<span class="count">' + s.count + (s.count === 1 ? " book" : " books") + "</span>" +
          "</div>" +
          '<ul class="shelf-row">' +
          s.books.map(function (b) {
            return "<li>" +
              '<a class="book-spine" href="#/book/' + esc(b.id) + '" aria-label="' +
                esc(b.title) + '">' + coverImg(b, "") + "</a></li>";
          }).join("") +
          "</ul>" +
        "</section>";
    });

    if (lib.earlyBooks.length) {
      var preview = lib.earlyBooks.slice(0, BEGINNINGS_PREVIEW_COUNT);
      html +=
        '<section class="shelf-section" data-series="' + esc(lib.earlyReadsLabel) + '">' +
          '<div class="shelf-plaque">' +
            '<span class="swatch" style="background:' + "var(--wood-lo)" + '"></span>' +
            "<h2>" + esc(lib.earlyReadsLabel) + "</h2>" +
            '<span class="count">' + lib.earlyBooks.length + " books</span>" +
          "</div>" +
          '<p class="view-sub" style="margin:-6px 0 16px">Picture books and board books from ' +
            esc(lib.earlyReadsRange) + ", before this log's chapter-book chronicle begins.</p>" +
          '<ul class="early-grid">' +
          preview.map(function (b) {
            return '<li><a class="early-card" href="#/book/' + esc(b.id) + '">' +
              coverImg(b, "early-cover") +
              '<span class="early-title">' + esc(b.title) + "</span>" +
              '<span class="early-author">' + esc(b.author) + "</span>" +
              "</a></li>";
          }).join("") +
          "</ul>" +
          '<a class="btn btn-ghost" href="#/beginnings">See all ' + lib.earlyBooks.length + " books →</a>" +
        "</section>";
    }

    view.innerHTML = html;
    hydrateCovers(view);
    fitCoverRatio(view, ".early-cover");
  }

  function renderBook(id) {
    var b = lib.byId[id];
    if (!b) { location.hash = "#/"; return; }
    var series = lib.series.filter(function (s) { return s.name === b.series; })[0];

    var facts = "";
    function fact(label, value) {
      if (value) facts += "<div><dt>" + label + "</dt><dd>" + value + "</dd></div>";
    }
    fact("Finished", esc(b.displayDateRead));
    fact("Pages", b.pages ? fmt(b.pages) : null);
    fact("Ages", esc(b.ageRange));
    fact("Grades", esc(b.gradeLevel));
    fact("Lexile", esc(b.lexile));
    fact("Illustrated by", esc(b.illustrator));
    if (b.rating) {
      var stars = '<span class="stars" aria-hidden="true">' + starString(b.rating) + "</span> " + b.rating.toFixed(2);
      fact("Goodreads", b.ratingUrl
        ? '<a href="' + esc(b.ratingUrl) + '" rel="noopener">' + stars + "</a>"
        : stars);
    }

    var suggestions = "";
    if (series && series.suggestions.length) {
      suggestions =
        '<div class="next-up"><h3>If you loved this, try…</h3>' +
        '<div class="suggestion-grid">' +
        series.suggestions.map(function (s) {
          return '<article class="suggestion">' +
            "<strong>" + esc(s.title) + "</strong>" +
            '<span class="by">by ' + esc(s.author) + "</span>" +
            "<p>" + esc(s.blurb) + "</p>" +
            (s.amazonUs ? '<a href="' + esc(s.amazonUs) + '" rel="noopener">Amazon US →</a>' : "") +
            "</article>";
        }).join("") +
        "</div></div>";
    }

    view.innerHTML =
      '<div class="spread-back"><a class="btn btn-ghost" href="#/shelves">← Back to the shelves</a></div>' +
      '<article class="spread">' +
        '<div class="page page-left">' +
          coverImg(b, "spread-cover") +
          '<a class="series-chip" style="background:' + b.color + '" href="#/shelves">' +
            esc(b.series) + (b.seriesNumber ? " · Book " + b.seriesNumber : "") + "</a>" +
          '<dl class="fact-list">' + facts + "</dl>" +
        "</div>" +
        '<div class="page page-right">' +
          '<p class="spread-series-line">' + esc(b.series) +
            (b.seriesNumber ? ", book " + b.seriesNumber : "") + "</p>" +
          '<h1 class="spread-title">' + esc(b.title) + "</h1>" +
          '<p class="spread-author">by ' + esc(b.author) + "</p>" +
          '<p class="spread-synopsis">' + esc(b.synopsis) + "</p>" +
          '<div class="spread-actions">' +
            (b.amazonUs ? '<a class="btn btn-primary" href="' + esc(b.amazonUs) + '" rel="noopener">Get it — Amazon US</a>' : "") +
            (b.amazonCa ? '<a class="btn btn-ghost" href="' + esc(b.amazonCa) + '" rel="noopener">Amazon CA</a>' : "") +
          "</div>" +
          (b.tags.length
            ? '<ul class="tag-row">' + b.tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"
            : "") +
          suggestions +
        "</div>" +
      "</article>";
    hydrateCovers(view);
    fitCoverRatio(view, ".spread-cover");
  }

  function renderJourney() {
    /* Newest month first. lib.monthKeys stays ascending (the streak/
       busiest-month math in buildLibrary() depends on that order),
       so it's only reversed here for display. */
    var monthsNewestFirst = lib.monthKeys.slice().reverse();
    var latest = lib.latest;

    var html =
      '<section class="easel" aria-label="Just finished">' +
        '<div class="easel-stand">' + coverImg(latest, "easel-cover") + "</div>" +
        '<div class="easel-note">' +
          '<p class="easel-kicker">We just finished this one! — Dad</p>' +
          '<h2 class="easel-title">' + esc(latest.title) + "</h2>" +
          '<p class="easel-meta">' + esc(latest.series) +
            (latest.seriesNumber ? " #" + latest.seriesNumber : "") +
            '<span class="dot">•</span>' + esc(latest.displayDateRead || "") +
            (latest.pages ? '<span class="dot">•</span>' + latest.pages + " pages" : "") + "</p>" +
          '<p class="easel-synopsis">' + esc(latest.synopsis) + "</p>" +
          '<div class="spread-actions">' +
            '<a class="btn btn-primary" href="#/book/' + esc(latest.id) + '">Open the book</a>' +
            '<a class="btn btn-ghost" href="#/passport">See the passport</a>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<h1 class="view-title">The Reading Journey</h1>' +
      '<p class="view-sub">Newest stories first. Follow the trail back to where it all began, one month at a time.</p>' +
      '<div class="trail">';

    monthsNewestFirst.forEach(function (key) {
      var books = lib.byMonth[key].slice().reverse();
      html +=
        '<section class="trail-stop">' +
          '<h2 class="trail-month">' + monthLabel(key) + "</h2>" +
          '<p class="trail-count">' + books.length + (books.length === 1 ? " book" : " books") + " read</p>" +
          '<ul class="trail-books">' +
          books.map(function (b) {
            return '<li><a class="trail-mini" href="#/book/' + esc(b.id) + '" aria-label="' +
              esc(b.title) + '" title="' + esc(b.title) + '">' + coverImg(b, "") + "</a></li>";
          }).join("") +
          "</ul>" +
        "</section>";
    });

    html += '</div><p class="trail-start">…and that’s where the story began! 🌱</p>';
    view.innerHTML = html;
    hydrateCovers(view);
  }

  function renderPassport() {
    var s = lib.stats;
    var weeks = lib.firstDate
      ? Math.max(1, Math.round((new Date(lib.lastDate) - new Date(lib.firstDate)) / 6048e5))
      : 0;

    var html =
      '<h1 class="view-title">Reading Passport</h1>' +
      '<p class="view-sub">Stamps for every series visited, and badges for the big milestones.</p>' +

      '<section class="passport-card">' +
        '<p class="passport-holder">This passport belongs to</p>' +
        '<h2 class="passport-name">Reyhan ⭐</h2>' +
        '<div class="stat-row">' +
          '<div class="stat"><b>' + fmt(s.totalBooks) + "</b><span>books finished</span></div>" +
          '<div class="stat"><b>' + fmt(s.totalPages) + "</b><span>pages read</span></div>" +
          '<div class="stat"><b>' + weeks + "</b><span>weeks of reading</span></div>" +
          (s.avgRating ? '<div class="stat"><b>' + s.avgRating.toFixed(1) + " ★</b><span>avg. Goodreads score</span></div>" : "") +
          (s.busiestMonthKey ? '<div class="stat"><b>' + s.busiestMonthCount + "</b><span>best month (" + monthLabel(s.busiestMonthKey).split(" ")[0] + ")</span></div>" : "") +
        "</div>" +
      "</section>" +

      '<h2 class="passport-section-title">Series stamps</h2>' +
      '<ul class="stamp-grid">' +
      SERIES_ORDER.map(function (name, i) {
        var count = lib.seriesCounts[name] || 0;
        var color = V2_SERIES_COLORS[name] || V2_FALLBACK_COLOR;
        var tilt = (i % 3 === 0 ? -4 : i % 3 === 1 ? 3 : -1) + "deg";
        return '<li><div class="stamp' + (count ? " is-earned" : "") +
          '" style="--stamp-color:' + color + ";--tilt:" + tilt + ";--delay:" + (i * 70) + 'ms">' +
          '<span class="stamp-count">' + (count || "?") + "</span>" +
          '<span class="stamp-name">' + esc(name) + "</span>" +
          '<span class="stamp-sub">' + (count ? "visited" : "not yet") + "</span>" +
          "</div></li>";
      }).join("") +
      "</ul>" +

      '<h2 class="passport-section-title">Badges</h2>' +
      '<ul class="badge-grid">' +
      lib.badges.map(function (b) {
        return '<li><div class="badge' + (b.earned ? "" : " is-locked") + '">' +
          '<span class="badge-icon" aria-hidden="true">' + (b.earned ? b.icon : "🔒") + "</span>" +
          "<div><b>" + esc(b.name) + "</b><span>" + esc(b.desc) + "</span></div>" +
          "</div></li>";
      }).join("") +
      "</ul>";

    view.innerHTML = html;
  }

  function renderBeginnings() {
    var books = lib.earlyBooks;
    var html =
      '<div class="spread-back"><a class="btn btn-ghost" href="#/shelves">← Back to the shelves</a></div>' +
      '<h1 class="view-title">' + esc(lib.earlyReadsLabel) + "</h1>" +
      '<p class="view-sub">Picture books, board books, and bedtime stories from before this shelf’s ' +
        "chapter-book chronicle begins — read sometime across " + esc(lib.earlyReadsRange) +
        ". Exact dates weren’t tracked for this stretch, so they’re gathered here together " +
        "instead of month by month.</p>" +
      '<p class="view-sub"><strong>' + books.length + (books.length === 1 ? " book" : " books") + "</strong></p>" +
      '<ul class="early-grid">' +
      books.map(function (b) {
        return '<li><a class="early-card" href="#/book/' + esc(b.id) + '">' +
          coverImg(b, "early-cover") +
          '<span class="early-title">' + esc(b.title) + "</span>" +
          '<span class="early-author">' + esc(b.author) + "</span>" +
          "</a></li>";
      }).join("") +
      "</ul>";

    view.innerHTML = html;
    hydrateCovers(view);
    fitCoverRatio(view, ".early-cover");
  }

  function renderDiscover() {
    var all = (typeof LIBRARY_SERIES !== "undefined" ? LIBRARY_SERIES : []).slice()
      .sort(function (a, z) { return a.name.localeCompare(z.name); });

    if (!all.length) {
      view.innerHTML = '<h1 class="view-title">Discover</h1>' +
        '<p class="view-sub">Nothing waiting to be discovered yet — check back soon!</p>';
      return;
    }

    var continuing = all.filter(function (s) { return s.isContinuation; });
    var fresh = all.filter(function (s) { return !s.isContinuation; });

    /* A stable "today's pick" — same all day, changes daily, rather
       than reshuffling (and feeling random/arbitrary) on every load. */
    var dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
    var featured = all[dayOfYear % all.length];

    function poster(s) {
      var count = s.books.length + (s.books.length === 1 ? " book" : " books");
      var tag = s.isContinuation ? "More to read" : s.collection;
      return '<li class="discover-tile">' +
        '<img class="discover-cover" data-discover-cover src="covers/' + esc(s.books[0].coverFile) + '" alt="" loading="lazy">' +
        '<span class="discover-caption">' +
          '<span class="discover-name">' + esc(s.name) + "</span>" +
          '<span class="discover-author">' + esc(s.author) + "</span>" +
          '<span class="discover-count">' + count + " · " + esc(tag) + "</span>" +
        "</span>" +
      "</li>";
    }

    function section(title, list) {
      if (!list.length) return "";
      return '<h2 class="discover-section-title">' + esc(title) + "</h2>" +
        '<ul class="discover-grid">' + list.map(poster).join("") + "</ul>";
    }

    var byCollection = {};
    fresh.forEach(function (s) { (byCollection[s.collection] = byCollection[s.collection] || []).push(s); });

    var html =
      '<h1 class="view-title">Discover</h1>' +
      '<p class="view-sub"><strong>' + all.length + " series</strong> waiting to be discovered — the rest of the shelves " +
        "Reyhan’s already in, and new ones worth trying next.</p>" +

      '<section class="discover-hero">' +
        '<div class="discover-hero-stand">' +
          '<img class="discover-hero-cover" src="covers/' + esc(featured.books[0].coverFile) + '" alt="">' +
        "</div>" +
        '<div class="discover-hero-note">' +
          '<p class="discover-hero-kicker">Ready for something new?</p>' +
          '<h2 class="discover-hero-title">' + esc(featured.name) + "</h2>" +
          '<p class="discover-hero-meta">' + esc(featured.author) +
            '<span class="dot">•</span>' + featured.books.length + (featured.books.length === 1 ? " book" : " books") +
            '<span class="dot">•</span>' + (featured.isContinuation ? "Already on the shelf" : esc(featured.collection)) +
          "</p>" +
          '<button type="button" class="btn btn-primary" id="discover-browse-btn">Browse everything</button>' +
        "</div>" +
      "</section>" +

      section("More from series you’re already reading", continuing);
    Object.keys(byCollection).sort().forEach(function (col) {
      html += section(col, byCollection[col]);
    });

    view.innerHTML = html;

    view.querySelectorAll("img[data-discover-cover]").forEach(function (img) {
      img.addEventListener("error", function () { img.classList.add("is-missing"); }, { once: true });
    });
    fitCoverRatio(view, ".discover-cover, .discover-hero-cover");

    var browseBtn = document.getElementById("discover-browse-btn");
    var grid = view.querySelector(".discover-grid");
    if (browseBtn && grid) {
      browseBtn.addEventListener("click", function () {
        grid.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  /* ---------- router ---------- */

  function route() {
    var hash = location.hash || "#/";
    var bookMatch = hash.match(/^#\/book\/([^/?#]+)/);
    var current;

    if (bookMatch) {
      homeScrollMaybeSave();
      renderBook(decodeURIComponent(bookMatch[1]));
      current = null;
      window.scrollTo(0, 0);
    } else if (hash.indexOf("#/shelves") === 0) {
      homeScrollMaybeSave();
      renderShelves();
      current = "shelves";
      window.scrollTo(0, 0);
    } else if (hash.indexOf("#/passport") === 0) {
      homeScrollMaybeSave();
      renderPassport();
      current = "passport";
      window.scrollTo(0, 0);
    } else if (hash.indexOf("#/beginnings") === 0) {
      /* No longer its own nav item (folded into Shelves as a
         condensed section) but still a real route - "see all" on
         Shelves links here. Highlight Shelves in the nav since
         that's conceptually where this lives now. */
      homeScrollMaybeSave();
      renderBeginnings();
      current = "shelves";
      window.scrollTo(0, 0);
    } else if (hash.indexOf("#/discover") === 0) {
      homeScrollMaybeSave();
      renderDiscover();
      current = "discover";
      window.scrollTo(0, 0);
    } else {
      /* Journey is the default/home view now. */
      renderJourney();
      current = "journey";
      window.scrollTo(0, homeScroll);
    }

    document.querySelectorAll("[data-nav]").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-nav") === current);
    });
    view.focus({ preventScroll: true });
  }

  var onHome = true;
  function homeScrollMaybeSave() {
    if (onHome) homeScroll = window.scrollY;
    onHome = false;
  }

  window.addEventListener("hashchange", function () {
    route();
    onHome = !location.hash || location.hash === "#/" || location.hash === "#";
  });

  /* ---------- die ---------- */

  var diceBtn = document.getElementById("dice-btn");
  diceBtn.addEventListener("click", function () {
    var pick = lib.books[Math.floor(Math.random() * lib.books.length)];
    diceBtn.classList.add("is-rolling");

    var shelf = document.querySelector('.shelf-section[data-series="' + CSS.escape(pick.series) + '"]');
    if (shelf) shelf.classList.add("is-rattling");

    setTimeout(function () {
      diceBtn.classList.remove("is-rolling");
      if (shelf) shelf.classList.remove("is-rattling");
      location.hash = "#/book/" + encodeURIComponent(pick.id);
    }, 620);
  });

  /* ---------- search ---------- */

  var overlay = document.getElementById("search-overlay");
  var input = document.getElementById("search-input");
  var results = document.getElementById("search-results");
  var lastFocus = null;

  function openSearch() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    input.value = "";
    results.innerHTML = "";
    input.focus();
  }

  function closeSearch() {
    overlay.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  function runSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) { results.innerHTML = ""; return; }

    var hits = lib.books.filter(function (b) {
      return b.title.toLowerCase().indexOf(q) !== -1 ||
        b.author.toLowerCase().indexOf(q) !== -1 ||
        b.series.toLowerCase().indexOf(q) !== -1 ||
        b.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
    }).slice(0, 12);

    if (!hits.length) {
      results.innerHTML = '<p class="search-empty">Hmm, no books match that… yet!</p>';
      return;
    }

    results.innerHTML = hits.map(function (b) {
      return '<button class="search-hit" data-id="' + esc(b.id) + '">' +
        coverImg(b, "") +
        "<div><b>" + esc(b.title) + "</b><span>" + esc(b.series) + " · " + esc(b.author) + "</span></div>" +
        "</button>";
    }).join("");
    hydrateCovers(results);
  }

  document.getElementById("search-open").addEventListener("click", openSearch);
  document.getElementById("search-close").addEventListener("click", closeSearch);
  input.addEventListener("input", function () { runSearch(input.value); });

  results.addEventListener("click", function (e) {
    var hit = e.target.closest(".search-hit");
    if (!hit) return;
    closeSearch();
    location.hash = "#/book/" + encodeURIComponent(hit.getAttribute("data-id"));
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeSearch();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closeSearch();
    if (e.key === "/" && overlay.hidden &&
        !/^(input|textarea|select)$/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      openSearch();
    }
  });

  /* ---------- footer + boot ---------- */

  document.getElementById("footer-stats").textContent =
    fmt(lib.stats.totalBooks) + " books · " + fmt(lib.stats.totalPages) + " pages";

  route();
})();
