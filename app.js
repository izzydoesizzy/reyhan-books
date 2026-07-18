/* ===== Reyhan's Reading List — app ===== */
(function () {
  "use strict";

  /* ---- Group books by series, preserving SERIES_ORDER ---- */
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

  /* ---- Card builder ---- */
  function starMarkup(rating) {
    if (rating == null) return "";
    const pct = Math.max(0, Math.min(5, rating)) / 5 * 100;
    return (
      '<span class="stars" aria-label="Rated ' + rating.toFixed(1) + ' out of 5">' +
      '<span class="stars-track">☆☆☆☆☆' +
      '<span class="stars-fill" style="width:' + pct + '%">★★★★★</span>' +
      "</span>" +
      '<span class="stars-num">' + rating.toFixed(1) + "</span>" +
      "</span>"
    );
  }

  function linkMarkup(url, exact, marketplace) {
    if (!url) return "";
    const label = (exact ? "Buy on " : "Search on ") + marketplace;
    const cls = exact ? "" : ' class="fallback-link"';
    return '<a href="' + url + '" target="_blank" rel="noopener"' + cls +
      ' tabindex="-1">' + label + "</a>";
  }

  function buildCard(book) {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", "false");
    const seriesLabel = book.seriesNumber != null
      ? book.series + " #" + book.seriesNumber
      : book.series;
    card.setAttribute("aria-label", book.title + " — " + seriesLabel + ". Activate for details.");

    const color = SERIES_COLORS[book.series] || "#556";

    card.innerHTML =
      '<div class="card-inner">' +
        '<div class="card-front">' +
          '<div class="cover-fallback" style="background:linear-gradient(160deg,' + color + ' 0%, #14161c 130%)">' +
            '<span class="fb-series">' + seriesLabel + "</span>" +
            '<span class="fb-title">' + book.title + "</span>" +
          "</div>" +
          '<img data-src="' + book.coverFile + '" alt="Cover of ' + book.title.replace(/"/g, "&quot;") + '" width="180" height="270">' +
        "</div>" +
        '<div class="card-back">' +
          '<div class="bk-title">' + book.title + "</div>" +
          '<div class="bk-meta">' +
            '<span class="bk-series">' + seriesLabel + "</span><br>" +
            "by " + book.author + "<br>" +
            "Read: " + book.displayDateRead +
          "</div>" +
          starMarkup(book.goodreadsRating) +
          '<div class="bk-synopsis">' + (book.synopsis || "") + "</div>" +
          '<button class="bk-more" type="button" tabindex="-1">More details</button>' +
          '<div class="bk-links">' +
            linkMarkup(book.amazonUsUrl, book.amazonUsExact, "Amazon.com") +
            linkMarkup(book.amazonCaUrl, book.amazonCaExact, "Amazon.ca") +
          "</div>" +
        "</div>" +
      "</div>";

    /* cover loads -> fade it in over the placeholder;
       error -> retry via Open Library by ISBN; final failure just leaves
       the placeholder visible (the img stays transparent) */
    const img = card.querySelector("img");
    img.addEventListener("load", function () {
      img.classList.add("loaded");
    });
    img.addEventListener("error", function () {
      if (book.coverIsbn && !img.dataset.triedRemote) {
        img.dataset.triedRemote = "1";
        img.src = "https://covers.openlibrary.org/b/isbn/" + book.coverIsbn +
          "-L.jpg?default=false";
      }
    });

    /* flip interaction */
    function setFlipped(on) {
      card.classList.toggle("flipped", on);
      card.setAttribute("aria-pressed", String(on));
      card.querySelectorAll(".bk-links a, .bk-more").forEach((a) => {
        a.setAttribute("tabindex", on ? "0" : "-1");
      });
    }

    card.querySelector(".bk-more").addEventListener("click", function (e) {
      e.stopPropagation();
      openModal(book, card);
    });

    card.addEventListener("click", function (e) {
      if (e.target.closest("a, .bk-more")) return; /* let buy links + More work */
      const flipping = !card.classList.contains("flipped");
      /* close other flipped cards in the same row */
      card.closest(".row-scroll").querySelectorAll(".card.flipped").forEach((c) => {
        if (c !== card) {
          c.classList.remove("flipped");
          c.setAttribute("aria-pressed", "false");
          c.querySelectorAll(".bk-links a").forEach((a) => a.setAttribute("tabindex", "-1"));
        }
      });
      setFlipped(flipping);
    });

    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        if (e.target.closest("a, .bk-more")) return;
        e.preventDefault();
        card.click();
      } else if (e.key === "Escape" && card.classList.contains("flipped")) {
        setFlipped(false);
        card.focus();
      }
    });

    return card;
  }

  /* ---- Row builder ---- */
  function buildRow(series, books) {
    const section = document.createElement("section");
    section.className = "row";
    section.setAttribute("aria-label", series);

    const h2 = document.createElement("h2");
    h2.className = "row-title";
    h2.innerHTML = series + ' <span class="series-count">' +
      books.length + (books.length === 1 ? " book" : " books") + "</span>";
    section.appendChild(h2);

    const wrap = document.createElement("div");
    wrap.className = "row-wrap";

    const scroll = document.createElement("div");
    scroll.className = "row-scroll";
    for (const b of books) scroll.appendChild(buildCard(b));
    wrap.appendChild(scroll);

    /* chevrons */
    for (const dir of ["prev", "next"]) {
      const btn = document.createElement("button");
      btn.className = "chevron " + dir;
      btn.innerHTML = dir === "prev" ? "&#10094;" : "&#10095;";
      btn.setAttribute("aria-label", (dir === "prev" ? "Scroll back in " : "Scroll forward in ") + series);
      btn.addEventListener("click", function () {
        scroll.scrollBy({
          left: (dir === "prev" ? -1 : 1) * scroll.clientWidth * 0.85,
          behavior: "smooth",
        });
      });
      wrap.appendChild(btn);
    }

    /* vertical wheel -> horizontal scroll (only when the row can scroll) */
    scroll.addEventListener("wheel", function (e) {
      if (scroll.scrollWidth <= scroll.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const before = scroll.scrollLeft;
        scroll.scrollLeft += e.deltaY;
        /* only swallow the event if we actually scrolled (edges pass through) */
        if (scroll.scrollLeft !== before) e.preventDefault();
      }
    }, { passive: false });

    section.appendChild(wrap);
    return section;
  }

  /* ---- Detail modal ---- */
  const META = typeof SERIES_META !== "undefined" ? SERIES_META : {};
  let lastFocused = null;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-label="Book details">' +
      '<button class="modal-close" type="button" aria-label="Close details">&times;</button>' +
      '<div class="modal-body"></div>' +
    "</div>";
  document.body.appendChild(backdrop);
  const modalBody = backdrop.querySelector(".modal-body");

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function factRow(label, value) {
    if (!value) return "";
    return '<div class="fact"><span class="fact-label">' + label +
      '</span><span class="fact-value">' + esc(value) + "</span></div>";
  }

  function suggestionCard(s) {
    const links = [];
    if (s.amazonUsUrl) links.push('<a href="' + esc(s.amazonUsUrl) + '" target="_blank" rel="noopener">Amazon.com</a>');
    if (s.amazonCaUrl) links.push('<a href="' + esc(s.amazonCaUrl) + '" target="_blank" rel="noopener">Amazon.ca</a>');
    return (
      '<div class="suggestion">' +
        '<div class="sg-title">' + esc(s.title) + "</div>" +
        '<div class="sg-author">by ' + esc(s.author) + "</div>" +
        '<div class="sg-blurb">' + esc(s.blurb || "") + "</div>" +
        (links.length ? '<div class="sg-links">' + links.join(" · ") + "</div>" : "") +
      "</div>"
    );
  }

  function openModal(book, sourceCard) {
    lastFocused = sourceCard || document.activeElement;
    const meta = META[book.series] || {};
    const seriesLabel = book.seriesNumber != null
      ? book.series + " #" + book.seriesNumber
      : book.series;
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
            linkMarkup(book.amazonUsUrl, book.amazonUsExact, "Amazon.com").replace(' tabindex="-1"', "") +
            linkMarkup(book.amazonCaUrl, book.amazonCaExact, "Amazon.ca").replace(' tabindex="-1"', "") +
          "</div>" +
        "</div>" +
      "</div>" +
      (suggestions
        ? '<div class="suggestions"><h3>You might like next</h3><div class="suggestion-list">' +
            suggestions + "</div></div>"
        : "");

    /* modal cover: same load chain as cards */
    const img = modalBody.querySelector(".modal-cover img");
    img.addEventListener("load", function () { img.classList.add("loaded"); });
    img.addEventListener("error", function () {
      if (book.coverIsbn && !img.dataset.triedRemote) {
        img.dataset.triedRemote = "1";
        img.src = "https://covers.openlibrary.org/b/isbn/" + book.coverIsbn + "-L.jpg?default=false";
      }
    });
    img.src = book.coverFile;

    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    backdrop.querySelector(".modal-close").focus();
  }

  function closeModal() {
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  }

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

  /* ---- Render ---- */
  const rowsEl = document.getElementById("rows");
  const grouped = groupBySeries(BOOKS);
  for (const [series, books] of grouped) {
    if (books.length) rowsEl.appendChild(buildRow(series, books));
  }

  document.getElementById("book-count").textContent = BOOKS.length;

  /* ---- Cover loading ----
     Near-viewport covers load first (IntersectionObserver with a generous
     margin); once the page has settled, the rest prefetch quietly in the
     background so scrolling never hits a cold image. */
  function startLoad(img) {
    if (!img.dataset.src) return;
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
    io.unobserve(img);
  }

  const io = new IntersectionObserver(function (entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) startLoad(entry.target);
    }
  }, { rootMargin: "800px" });

  document.querySelectorAll("img[data-src]").forEach((img) => io.observe(img));

  window.addEventListener("load", function () {
    setTimeout(function prefetchRest() {
      const pending = document.querySelectorAll("img[data-src]");
      if (!pending.length) return;
      /* load in small batches to keep the network friendly */
      for (let i = 0; i < 6 && i < pending.length; i++) startLoad(pending[i]);
      setTimeout(prefetchRest, 300);
    }, 800);
  });
})();
