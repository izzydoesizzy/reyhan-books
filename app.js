/* ===== Reyhan's Reading List — app ===== */
(function () {
  "use strict";

  /* ================= Data & helpers ================= */
  const META = typeof SERIES_META !== "undefined" ? SERIES_META : {};
  const READ = BOOKS.filter((b) => (b.status || "read") === "read");
  const UP_NEXT = BOOKS.filter((b) => b.status === "upNext");
  const byId = new Map(BOOKS.map((b) => [b.id, b]));
  const bookIndex = new Map(BOOKS.map((b, i) => [b.id, i]));
  const seriesIndex = new Map(SERIES_ORDER.map((s, i) => [s, i]));

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_FULL = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function normalize(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function monthLabel(key, full) {
    const parts = key.split("-");
    return (full ? MONTHS_FULL : MONTHS_SHORT)[Number(parts[1]) - 1] + " " + parts[0];
  }

  function seriesLabelOf(book) {
    return book.seriesNumber != null
      ? book.series + " #" + book.seriesNumber
      : book.series;
  }

  /* Newest first; books logged the same day tie-break to the one added
     to BOOKS last (the log is appended chronologically). */
  function recencyCompare(a, b) {
    const d = (b.dateRead || "").localeCompare(a.dateRead || "");
    if (d) return d;
    return bookIndex.get(b.id) - bookIndex.get(a.id);
  }

  function seriesCompare(a, b) {
    const d = (seriesIndex.get(a.series) ?? 99) - (seriesIndex.get(b.series) ?? 99);
    if (d) return d;
    return (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0);
  }

  const SORTS = {
    series: seriesCompare,
    recent: recencyCompare,
    title: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => (b.goodreadsRating ?? -1) - (a.goodreadsRating ?? -1),
    pages: (a, b) => (b.pages ?? 0) - (a.pages ?? 0),
  };

  /* ================= Cover pipeline ================= */
  /* Covers are sourced remotely by trying progressively broader public
     lookups until one returns art, in order:
       1. Open Library, by this exact ISBN            (fastest, most precise)
       2. Open Library, by title+author search         (catches editions whose
          specific ISBN was never scanned, but some edition of the work was)
       3. Google Books, by this exact ISBN             (broadest catalog,
          best odds for newer/small-press titles Open Library hasn't caught up on)
     If every step comes up empty the colored placeholder card stays put. */

  const titleCoverCache = new Map();
  function fetchCoverByTitle(title, author) {
    const key = title + "|" + author;
    if (titleCoverCache.has(key)) return titleCoverCache.get(key);
    const q = encodeURIComponent(title + " " + author);
    const p = fetch("https://openlibrary.org/search.json?q=" + q + "&fields=cover_i&limit=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const doc = data && data.docs && data.docs[0];
        return doc && doc.cover_i
          ? "https://covers.openlibrary.org/b/id/" + doc.cover_i + "-L.jpg"
          : null;
      })
      .catch(() => null);
    titleCoverCache.set(key, p);
    return p;
  }

  function isbnCoverUrl(isbn) {
    return "https://covers.openlibrary.org/b/isbn/" + isbn + "-L.jpg?default=false";
  }

  /* Wires an <img> to fade in on load (over the color placeholder) and to
     walk the fallback chain on each failure; returns a starter function so
     loading can be deferred (lazy) or kicked off immediately (eager). */
  function wireCover(img, book) {
    const steps = [];
    if (book.coverIsbn) {
      steps.push(function () {
        img.src = isbnCoverUrl(book.coverIsbn);
      });
    }
    steps.push(function (next) {
      fetchCoverByTitle(book.title, book.author).then(function (url) {
        if (url) img.src = url;
        else next();
      });
    });
    if (book.coverIsbn) {
      steps.push(function (next) {
        fetch("https://www.googleapis.com/books/v1/volumes?q=isbn:" + book.coverIsbn)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const item = data && data.items && data.items[0];
            const links = item && item.volumeInfo && item.volumeInfo.imageLinks;
            const url = links && (links.thumbnail || links.smallThumbnail);
            if (url) img.src = url.replace(/^http:/, "https:");
            else next();
          })
          .catch(next);
      });
    }
    let i = 0;
    function advance() {
      if (i < steps.length) steps[i++](advance);
    }
    img.addEventListener("load", function () { img.classList.add("loaded"); });
    img.addEventListener("error", advance);
    return advance;
  }

  const coverStarters = new Map(); /* img -> starter fn, until started */

  const io = new IntersectionObserver(function (entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) startLoad(entry.target);
    }
  }, { rootMargin: "800px" });

  function lazyCover(img, book) {
    coverStarters.set(img, wireCover(img, book));
    io.observe(img);
  }

  function eagerCover(img, book) {
    wireCover(img, book)();
  }

  function startLoad(img) {
    const starter = coverStarters.get(img);
    if (starter) {
      coverStarters.delete(img);
      starter();
    }
    io.unobserve(img);
  }

  /* ================= Markup helpers ================= */
  function starMarkup(rating) {
    if (rating == null) return "";
    const pct = Math.max(0, Math.min(5, rating)) / 5 * 100;
    return (
      '<span class="stars" role="img" aria-label="Rated ' + rating.toFixed(1) + ' out of 5">' +
      '<span class="stars-track" aria-hidden="true">☆☆☆☆☆' +
      '<span class="stars-fill" style="width:' + pct + '%">★★★★★</span>' +
      "</span>" +
      '<span class="stars-num" aria-hidden="true">' + rating.toFixed(1) + "</span>" +
      "</span>"
    );
  }

  function linkMarkup(url, exact, marketplace) {
    if (!url) return "";
    const label = (exact ? "Buy on " : "Search on ") + marketplace;
    const cls = exact ? "" : ' class="fallback-link"';
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener"' + cls + ">" +
      label + "</a>";
  }

  /* ================= Cards ================= */
  const cardCache = new Map(); /* "ctx:id" -> card record */
  let flippedCard = null;

  function applyFlip(card, on) {
    card.el.classList.toggle("flipped", on);
    card.front.setAttribute("aria-expanded", String(on));
    if (on) {
      card.back.removeAttribute("inert");
      card.front.setAttribute("inert", "");
    } else {
      card.back.setAttribute("inert", "");
      card.front.removeAttribute("inert");
    }
  }

  function flip(card, on) {
    if (on && flippedCard && flippedCard !== card) applyFlip(flippedCard, false);
    applyFlip(card, on);
    flippedCard = on ? card : (flippedCard === card ? null : flippedCard);
    /* keep focus out of the inert face */
    if (on) card.back.querySelector(".bk-more").focus({ preventScroll: true });
    else card.front.focus({ preventScroll: true });
  }

  function buildCard(book) {
    const el = document.createElement("article");
    el.className = "card";
    const seriesLabel = seriesLabelOf(book);
    const color = SERIES_COLORS[book.series] || "#556";
    const readLine = book.displayDateRead ? "Read: " + esc(book.displayDateRead) : "";

    el.innerHTML =
      '<div class="card-inner">' +
        '<button class="card-front" type="button" aria-expanded="false" aria-label="' +
          esc(book.title + " — " + seriesLabel + ". Show details.") + '">' +
          '<span class="cover-fallback" style="background:linear-gradient(160deg,' + color + ' 0%, #14161c 130%)">' +
            '<span class="fb-series">' + esc(seriesLabel) + "</span>" +
            '<span class="fb-title">' + esc(book.title) + "</span>" +
          "</span>" +
          '<img alt="" width="180" height="270">' +
          (book.status === "upNext" ? '<span class="card-badge">Up next</span>' : "") +
        "</button>" +
        '<div class="card-back" inert>' +
          '<div class="bk-title">' + esc(book.title) + "</div>" +
          '<div class="bk-meta">' +
            '<span class="bk-series">' + esc(seriesLabel) + "</span><br>" +
            "by " + esc(book.author) + (readLine ? "<br>" + readLine : "") +
          "</div>" +
          starMarkup(book.goodreadsRating) +
          '<div class="bk-synopsis">' + esc(book.synopsis || "") + "</div>" +
          '<button class="bk-more" type="button">More details</button>' +
          '<div class="bk-links">' +
            linkMarkup(book.amazonUsUrl, book.amazonUsExact, "Amazon.com") +
            linkMarkup(book.amazonCaUrl, book.amazonCaExact, "Amazon.ca") +
          "</div>" +
        "</div>" +
      "</div>";

    const front = el.querySelector(".card-front");
    const back = el.querySelector(".card-back");
    lazyCover(el.querySelector(".card-front img"), book);

    const card = { el: el, front: front, back: back, book: book };

    front.addEventListener("click", function () { flip(card, true); });
    back.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      flip(card, false);
    });
    back.querySelector(".bk-more").addEventListener("click", function () {
      requestOpen(book, front);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && el.classList.contains("flipped")) {
        flip(card, false);
      }
    });

    return card;
  }

  /* One DOM node per (context, book): the "recent" row shows the same book
     as its series row, so it needs its own instance; every other surface
     (series rows, grid, search) shows a book at most once and shares one. */
  function cardFor(book, ctx) {
    const key = ctx + ":" + book.id;
    let card = cardCache.get(key);
    if (!card) {
      card = buildCard(book);
      cardCache.set(key, card);
    }
    return card;
  }

  /* ================= Rows ================= */
  function buildRow(title, books, ctx, countText) {
    const section = document.createElement("section");
    section.className = "row";
    section.setAttribute("aria-label", title);

    const h2 = document.createElement("h2");
    h2.className = "row-title";
    h2.innerHTML = esc(title) + ' <span class="series-count">' +
      esc(countText || (books.length + (books.length === 1 ? " book" : " books"))) +
      "</span>";
    section.appendChild(h2);

    const wrap = document.createElement("div");
    wrap.className = "row-wrap";

    const scroll = document.createElement("div");
    scroll.className = "row-scroll";
    for (const b of books) scroll.appendChild(cardFor(b, ctx).el);
    wrap.appendChild(scroll);

    for (const dir of ["prev", "next"]) {
      const btn = document.createElement("button");
      btn.className = "chevron " + dir;
      btn.innerHTML = dir === "prev" ? "&#10094;" : "&#10095;";
      btn.setAttribute("aria-label", (dir === "prev" ? "Scroll back in " : "Scroll forward in ") + title);
      btn.addEventListener("click", function () {
        scroll.scrollBy({
          left: (dir === "prev" ? -1 : 1) * scroll.clientWidth * 0.85,
          behavior: "smooth",
        });
      });
      wrap.appendChild(btn);
    }

    section.appendChild(wrap);
    return section;
  }

  function groupBySeries(books) {
    const map = new Map(SERIES_ORDER.map((s) => [s, []]));
    for (const b of books) {
      if (!map.has(b.series)) map.set(b.series, []);
      map.get(b.series).push(b);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0));
    }
    return map;
  }

  /* ================= Detail modal + hash router ================= */
  let lastFocused = null;
  let pendingSource = null;
  let openedViaApp = false;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-label="Book details">' +
      '<button class="modal-close" type="button" aria-label="Close details">&times;</button>' +
      '<div class="modal-body"></div>' +
    "</div>";
  document.body.appendChild(backdrop);
  const modalBody = backdrop.querySelector(".modal-body");

  function factRow(label, value) {
    if (!value) return "";
    return '<div class="fact"><span class="fact-label">' + label +
      '</span><span class="fact-value">' + esc(value) + "</span></div>";
  }

  function suggestionCard(s) {
    const links = [];
    if (s.amazonUsUrl) links.push('<a href="' + esc(s.amazonUsUrl) + '" target="_blank" rel="noopener">Amazon.com</a>');
    if (s.amazonCaUrl) links.push('<a href="' + esc(s.amazonCaUrl) + '" target="_blank" rel="noopener">Amazon.ca</a>');
    const href = s.amazonUsUrl || s.amazonCaUrl ||
      "https://www.google.com/search?q=" + encodeURIComponent(s.title + " " + s.author + " book");
    return (
      '<div class="suggestion" data-title="' + esc(s.title) + '" data-author="' + esc(s.author) + '">' +
        '<div class="sg-cover" aria-hidden="true"><img alt=""></div>' +
        '<div class="sg-body">' +
          '<a class="sg-title" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" +
          '<div class="sg-author">by ' + esc(s.author) + "</div>" +
          '<div class="sg-blurb">' + esc(s.blurb || "") + "</div>" +
          (links.length ? '<div class="sg-links">' + links.join(" · ") + "</div>" : "") +
        "</div>" +
      "</div>"
    );
  }

  function fillSuggestionCovers() {
    modalBody.querySelectorAll(".suggestion").forEach(function (elm) {
      const img = elm.querySelector(".sg-cover img");
      fetchCoverByTitle(elm.dataset.title, elm.dataset.author).then(function (url) {
        if (!url) return;
        img.addEventListener("load", function () { img.classList.add("loaded"); });
        img.src = url;
      });
    });
  }

  function openModal(book, sourceEl) {
    lastFocused = sourceEl || null;
    const meta = META[book.series] || {};
    const seriesLabel = seriesLabelOf(book);
    const color = SERIES_COLORS[book.series] || "#556";

    const chips = (meta.tags || []).map(function (t) {
      return '<span class="chip">' + esc(t) + "</span>";
    }).join("");

    const ratingBlock = book.goodreadsRating == null ? "" :
      (book.goodreadsUrl
        ? '<a class="gr-link" href="' + esc(book.goodreadsUrl) + '" target="_blank" rel="noopener">' +
            starMarkup(book.goodreadsRating) + '<span class="gr-cta">See reviews on Goodreads &rarr;</span></a>'
        : starMarkup(book.goodreadsRating));

    const suggestions = (meta.suggestions || []).map(suggestionCard).join("");

    modalBody.innerHTML =
      '<div class="modal-grid">' +
        '<div class="modal-cover" style="background:linear-gradient(160deg,' + color + ' 0%, #14161c 130%)">' +
          '<img alt="Cover of ' + esc(book.title) + '">' +
        "</div>" +
        '<div class="modal-info">' +
          '<h2 class="md-title">' + esc(book.title) + "</h2>" +
          '<p class="md-sub"><span class="bk-series">' + esc(seriesLabel) + "</span> &middot; by " +
            esc(book.author) + (meta.illustrator ? " &middot; illustrated by " + esc(meta.illustrator) : "") + "</p>" +
          (chips ? '<div class="chips">' + chips + "</div>" : "") +
          '<div class="facts">' +
            factRow("Read", book.displayDateRead) +
            factRow("Level", meta.ageRange) +
            factRow("Grades", meta.gradeLevel && meta.gradeLevel.replace(/^Grades?\s*/i, "")) +
            factRow("Lexile", meta.lexile) +
            factRow("Pages", book.pages) +
          "</div>" +
          ratingBlock +
          '<div class="md-synopsis">' + esc(book.synopsis || "") + "</div>" +
          '<div class="bk-links md-links">' +
            linkMarkup(book.amazonUsUrl, book.amazonUsExact, "Amazon.com") +
            linkMarkup(book.amazonCaUrl, book.amazonCaExact, "Amazon.ca") +
          "</div>" +
        "</div>" +
      "</div>" +
      (suggestions
        ? '<div class="suggestions"><h3>You might like next</h3><div class="suggestion-list">' +
            suggestions + "</div></div>"
        : "");

    eagerCover(modalBody.querySelector(".modal-cover img"), book);
    fillSuggestionCovers();

    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    backdrop.querySelector(".modal-close").focus();
  }

  function doCloseModal() {
    openedViaApp = false;
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    const target = lastFocused && document.contains(lastFocused)
      ? lastFocused
      : document.querySelector(".brand");
    if (target) target.focus();
    lastFocused = null;
  }

  /* User-initiated close: unwind the history entry we pushed so the back
     button stays sane; a cold deep-link landing just clears the hash. */
  function closeModal() {
    if (openedViaApp) {
      history.back(); /* -> hashchange -> doCloseModal() */
    } else {
      history.replaceState(null, "", location.pathname + location.search);
      doCloseModal();
    }
  }

  function requestOpen(book, sourceEl) {
    pendingSource = sourceEl || null;
    const target = "#book/" + book.id;
    if (location.hash === target) {
      handleHash(); /* same hash -> no hashchange event; open directly */
      return;
    }
    openedViaApp = true;
    location.hash = target;
  }

  function handleHash() {
    const m = location.hash.match(/^#book\/(.+)$/);
    const book = m ? byId.get(decodeURIComponent(m[1])) : null;
    if (book) {
      openModal(book, pendingSource);
      pendingSource = null;
    } else if (backdrop.classList.contains("open")) {
      doCloseModal();
    }
  }

  window.addEventListener("hashchange", handleHash);

  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector(".modal-close").addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (!backdrop.classList.contains("open")) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal();
    } else if (e.key === "Tab") {
      /* simple focus trap */
      const focusables = backdrop.querySelectorAll("button, a[href]");
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }, true);

  /* ================= Hero / billboard ================= */
  const heroEl = document.querySelector(".hero");

  function renderHero() {
    if (!READ.length) {
      heroEl.hidden = true;
      return;
    }
    const featured = READ.slice().sort(recencyCompare)[0];
    const color = SERIES_COLORS[featured.series] || "#556";
    const seriesLabel = seriesLabelOf(featured);

    heroEl.innerHTML =
      '<div class="hero-backdrop" style="background:linear-gradient(160deg,' + color + ' 0%, #14161c 130%)">' +
        '<img alt="" aria-hidden="true">' +
      "</div>" +
      '<div class="hero-scrim"></div>' +
      '<div class="hero-layout">' +
        '<div class="hero-content">' +
          '<p class="hero-kicker">Latest read &middot; ' + READ.length + " books and counting</p>" +
          '<h1 class="hero-title">' + esc(featured.title) + "</h1>" +
          '<p class="hero-sub"><span class="bk-series">' + esc(seriesLabel) + "</span> &middot; by " +
            esc(featured.author) +
            (featured.displayDateRead ? " &middot; Read " + esc(featured.displayDateRead) : "") + "</p>" +
          (featured.goodreadsRating != null
            ? '<div class="hero-stars">' + starMarkup(featured.goodreadsRating) + "</div>"
            : "") +
          '<p class="hero-synopsis">' + esc(featured.synopsis || "") + "</p>" +
          '<div class="hero-actions">' +
            '<button class="btn btn-primary" type="button" id="hero-details">More details</button>' +
            '<button class="btn btn-ghost" type="button" id="surprise">🎲 Surprise me</button>' +
          "</div>" +
        "</div>" +
        '<div class="hero-poster" style="background:linear-gradient(160deg,' + color + ' 0%, #14161c 130%)">' +
          '<img alt="Cover of ' + esc(featured.title) + '">' +
        "</div>" +
      "</div>";

    eagerCover(heroEl.querySelector(".hero-backdrop img"), featured);
    eagerCover(heroEl.querySelector(".hero-poster img"), featured);

    document.getElementById("hero-details").addEventListener("click", function (e) {
      requestOpen(featured, e.currentTarget);
    });
    document.getElementById("surprise").addEventListener("click", function (e) {
      const pick = READ[Math.floor(Math.random() * READ.length)];
      requestOpen(pick, e.currentTarget);
    });
  }

  /* ================= State, controls, rendering ================= */
  const state = { query: "", tags: new Set(), sort: "series", view: "rows" };
  try {
    const saved = localStorage.getItem("reyhan:view");
    if (saved === "grid" || saved === "rows") state.view = saved;
  } catch (e) { /* private mode etc. */ }

  const rowsEl = document.getElementById("rows");
  const gridEl = document.getElementById("all-grid");
  const resultsEl = document.getElementById("search-results");
  const controlsEl = document.getElementById("controls");
  const hintEl = document.querySelector(".hint");
  const liveEl = document.getElementById("live-region");
  const searchInput = document.getElementById("search");
  const viewRowsBtn = document.getElementById("view-rows");
  const viewGridBtn = document.getElementById("view-grid");
  const sortSel = document.getElementById("sort");

  const searchHay = new Map(BOOKS.map((b) => [b.id, normalize([
    b.title, b.author, b.series, ((META[b.series] || {}).tags || []).join(" "),
  ].join(" "))]));

  function matchesQuery(b) {
    const tokens = normalize(state.query.trim()).split(/\s+/).filter(Boolean);
    const hay = searchHay.get(b.id);
    return tokens.every((t) => hay.indexOf(t) !== -1);
  }

  function filterBooks(list) {
    if (!state.tags.size) return list;
    return list.filter(function (b) {
      if (state.tags.has(b.series)) return true;
      const tags = (META[b.series] || {}).tags || [];
      return tags.some((t) => state.tags.has(t));
    });
  }

  function renderRows(list) {
    rowsEl.innerHTML = "";
    if (!state.tags.size) {
      const recent = READ.slice().sort(recencyCompare).slice(0, 10);
      if (recent.length) {
        rowsEl.appendChild(buildRow("Recently read", recent, "recent", "last " + recent.length));
      }
      if (UP_NEXT.length) {
        rowsEl.appendChild(buildRow("Up Next", UP_NEXT, "main"));
      }
    }
    const grouped = groupBySeries(list);
    for (const [series, books] of grouped) {
      if (books.length) rowsEl.appendChild(buildRow(series, books, "main"));
    }
  }

  function renderGrid(list) {
    gridEl.innerHTML = "";
    const sorted = list.slice().sort(SORTS[state.sort] || SORTS.series);
    for (const b of sorted) gridEl.appendChild(cardFor(b, "main").el);
  }

  function renderSearch() {
    const q = state.query.trim();
    const matches = BOOKS.filter(matchesQuery).sort(SORTS.series);
    const label = matches.length + (matches.length === 1 ? " result" : " results") +
      " for “" + q + "”";

    resultsEl.innerHTML = '<h2 class="results-title">' + esc(label) + "</h2>";
    if (matches.length) {
      const grid = document.createElement("div");
      grid.className = "poster-grid";
      for (const b of matches) grid.appendChild(cardFor(b, "main").el);
      resultsEl.appendChild(grid);
    } else {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "No books found — try a title, author, or series like “Dragon Masters”.";
      resultsEl.appendChild(empty);
    }
    liveEl.textContent = label;
  }

  function applyState() {
    const searching = state.query.trim().length > 0;
    heroEl.hidden = searching;
    controlsEl.hidden = searching;
    hintEl.hidden = searching;
    resultsEl.hidden = !searching;
    rowsEl.hidden = searching || state.view !== "rows";
    gridEl.hidden = searching || state.view !== "grid";

    if (searching) {
      renderSearch();
    } else if (state.view === "rows") {
      renderRows(filterBooks(READ));
    } else {
      renderGrid(filterBooks(READ));
    }

    viewRowsBtn.setAttribute("aria-pressed", String(state.view === "rows"));
    viewGridBtn.setAttribute("aria-pressed", String(state.view === "grid"));
    sortSel.value = state.sort;
  }

  function persistView() {
    try { localStorage.setItem("reyhan:view", state.view); } catch (e) { /* noop */ }
  }

  let searchTimer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = searchInput.value;
      applyState();
    }, 120);
  });

  viewRowsBtn.addEventListener("click", function () {
    state.view = "rows";
    state.sort = "series"; /* rows are always in series order */
    persistView();
    applyState();
  });

  viewGridBtn.addEventListener("click", function () {
    state.view = "grid";
    persistView();
    applyState();
  });

  sortSel.addEventListener("change", function () {
    state.sort = sortSel.value;
    if (state.sort !== "series" && state.view === "rows") {
      state.view = "grid"; /* only the grid can show a flat sorted order */
      persistView();
    }
    applyState();
  });

  function buildChips() {
    const strip = document.getElementById("chips");

    function makeChip(key, dotColor) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fchip";
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML =
        (dotColor ? '<span class="dot" style="background:' + dotColor + '"></span>' : "") +
        esc(key);
      btn.addEventListener("click", function () {
        const on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(on));
        if (on) state.tags.add(key);
        else state.tags.delete(key);
        clearBtn.hidden = state.tags.size === 0;
        applyState();
      });
      return btn;
    }

    const frag = document.createDocumentFragment();
    for (const s of SERIES_ORDER) {
      if (BOOKS.some((b) => b.series === s)) frag.appendChild(makeChip(s, SERIES_COLORS[s]));
    }

    const tagCounts = new Map();
    for (const b of READ) {
      for (const t of (META[b.series] || {}).tags || []) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map((e) => e[0]);
    for (const t of topTags) {
      if (!seriesIndex.has(t)) frag.appendChild(makeChip(t, null));
    }

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "fchip fchip-clear";
    clearBtn.hidden = true;
    clearBtn.textContent = "✕ Clear filters";
    clearBtn.addEventListener("click", function () {
      state.tags.clear();
      strip.querySelectorAll('.fchip[aria-pressed="true"]').forEach(function (c) {
        c.setAttribute("aria-pressed", "false");
      });
      clearBtn.hidden = true;
      applyState();
    });
    frag.appendChild(clearBtn);

    strip.appendChild(frag);
  }

  /* ================= Stats ================= */
  function computeStats() {
    const totalPages = READ.reduce((s, b) => s + (b.pages || 0), 0);
    const rated = READ.filter((b) => b.goodreadsRating != null);
    const avg = rated.length
      ? rated.reduce((s, b) => s + b.goodreadsRating, 0) / rated.length
      : null;
    const seriesCount = new Set(READ.map((b) => b.series)).size;

    const counts = new Map();
    for (const b of READ) {
      if (!b.dateRead) continue;
      const m = b.dateRead.slice(0, 7);
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    const months = Array.from(counts.keys()).sort();
    const filled = [];
    if (months.length) {
      let [y, mo] = months[0].split("-").map(Number);
      const [ly, lmo] = months[months.length - 1].split("-").map(Number);
      while (y < ly || (y === ly && mo <= lmo)) {
        const key = y + "-" + String(mo).padStart(2, "0");
        filled.push([key, counts.get(key) || 0]);
        mo++;
        if (mo > 12) { mo = 1; y++; }
      }
    }

    let busiest = null;
    for (const entry of filled) {
      if (!busiest || entry[1] > busiest[1]) busiest = entry;
    }
    let streak = 0;
    for (let i = filled.length - 1; i >= 0; i--) {
      if (filled[i][1] > 0) streak++;
      else break;
    }

    return {
      totalBooks: READ.length,
      totalPages: totalPages,
      avg: avg,
      seriesCount: seriesCount,
      filled: filled,
      busiest: busiest,
      streak: streak,
    };
  }

  function sparklineSvg(filled) {
    if (!filled.length) return "";
    const max = Math.max.apply(null, filled.map((f) => f[1]).concat([1]));
    const bw = 22, gap = 10, chartH = 56, topPad = 16, labelH = 18;
    const W = filled.length * (bw + gap) + gap;
    const H = topPad + chartH + labelH;
    let parts = "";
    filled.forEach(function (f, i) {
      const h = Math.max(2, Math.round(f[1] / max * chartH));
      const x = gap + i * (bw + gap);
      const y = topPad + chartH - h;
      parts += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h +
        '" rx="4" fill="' + (f[1] ? "var(--accent)" : "rgba(255,255,255,0.12)") + '">' +
        "<title>" + monthLabel(f[0]) + ": " + f[1] + "</title></rect>";
      if (f[1]) {
        parts += '<text x="' + (x + bw / 2) + '" y="' + (y - 5) +
          '" text-anchor="middle" font-size="10" fill="#9aa0ad">' + f[1] + "</text>";
      }
    });
    const baseline = topPad + chartH + 13;
    parts += '<text x="' + gap + '" y="' + baseline +
      '" text-anchor="start" font-size="10" fill="#9aa0ad">' + monthLabel(filled[0][0]) + "</text>";
    if (filled.length > 1) {
      parts += '<text x="' + (W - gap) + '" y="' + baseline +
        '" text-anchor="end" font-size="10" fill="#9aa0ad">' +
        monthLabel(filled[filled.length - 1][0]) + "</text>";
    }
    const desc = "Books per month, " + monthLabel(filled[0][0], true) + " to " +
      monthLabel(filled[filled.length - 1][0], true) + ": " +
      filled.map((f) => f[1]).join(", ") + ".";
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(desc) +
      '" preserveAspectRatio="xMinYMid meet">' + parts + "</svg>";
  }

  function renderStats(stats) {
    const statsEl = document.getElementById("stats");
    if (!READ.length) {
      statsEl.hidden = true;
      return;
    }
    const tiles = [
      [String(stats.totalBooks), "Books read"],
      [stats.totalPages.toLocaleString("en-US"), "Pages read"],
      [stats.avg != null ? stats.avg.toFixed(2) + " ★" : "—", "Avg rating"],
      [String(stats.seriesCount), "Series explored"],
      [stats.busiest ? monthLabel(stats.busiest[0]) : "—",
        stats.busiest ? "Busiest month · " + stats.busiest[1] + " books" : "Busiest month"],
      [stats.streak + (stats.streak === 1 ? " month" : " months"), "Reading streak"],
    ];
    statsEl.innerHTML =
      "<h2>Reading stats</h2>" +
      '<div class="stat-tiles">' +
      tiles.map(function (t) {
        return '<div class="stat-tile"><div class="stat-value">' + esc(t[0]) +
          '</div><div class="stat-label">' + esc(t[1]) + "</div></div>";
      }).join("") +
      "</div>" +
      (stats.filled.length
        ? '<div class="spark-wrap"><div class="spark-title">Books per month</div>' +
          sparklineSvg(stats.filled) + "</div>"
        : "");
  }

  function renderFooterStats(stats) {
    const el = document.getElementById("footer-stats");
    if (!el || !READ.length) return;
    el.textContent = stats.totalBooks + " books · " +
      stats.totalPages.toLocaleString("en-US") + " pages" +
      (stats.filled.length ? " · reading since " + monthLabel(stats.filled[0][0], true) : "");
  }

  /* ================= Boot ================= */
  buildChips();
  renderHero();
  const stats = computeStats();
  renderStats(stats);
  renderFooterStats(stats);

  /* Pre-build every card once so the background prefetch below knows about
     every cover, whatever view is active. */
  for (const b of BOOKS) cardFor(b, "main");

  applyState();
  handleHash(); /* support cold-loading a shared #book/<id> link */

  /* topbar bottom border appears once the page scrolls */
  const sentinel = document.getElementById("top-sentinel");
  const topbar = document.querySelector(".topbar");
  if (sentinel && topbar) {
    new IntersectionObserver(function (entries) {
      topbar.classList.toggle("scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---- Cover loading ----
     Near-viewport covers load first (IntersectionObserver with a generous
     margin); once the page has settled, the rest prefetch quietly in the
     background so scrolling never hits a cold image. */
  window.addEventListener("load", function () {
    setTimeout(function prefetchRest() {
      const pending = Array.from(coverStarters.keys()).slice(0, 6);
      if (!pending.length) return;
      pending.forEach(startLoad);
      setTimeout(prefetchRest, 300);
    }, 800);

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline support is optional */ });
    }
  });
})();
