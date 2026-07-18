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
      "☆☆☆☆☆" +
      '<span class="stars-fill" style="width:' + pct + '%">★★★★★</span>' +
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
          '<img data-src="' + book.coverFile + '" alt="Cover of ' + book.title.replace(/"/g, "&quot;") + '" width="180" height="270">' +
          '<div class="cover-fallback" style="background:linear-gradient(160deg,' + color + ' 0%, #14161c 130%)">' +
            '<span class="fb-series">' + seriesLabel + "</span>" +
            '<span class="fb-title">' + book.title + "</span>" +
          "</div>" +
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
          '<div class="bk-links">' +
            linkMarkup(book.amazonUsUrl, book.amazonUsExact, "Amazon.com") +
            linkMarkup(book.amazonCaUrl, book.amazonCaExact, "Amazon.ca") +
          "</div>" +
        "</div>" +
      "</div>";

    /* cover load error -> spine fallback */
    const img = card.querySelector("img");
    img.addEventListener("error", function () {
      img.closest(".card-front").classList.add("cover-error");
    });

    /* flip interaction */
    function setFlipped(on) {
      card.classList.toggle("flipped", on);
      card.setAttribute("aria-pressed", String(on));
      card.querySelectorAll(".bk-links a").forEach((a) => {
        a.setAttribute("tabindex", on ? "0" : "-1");
      });
    }

    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return; /* let buy links work */
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
        if (e.target.closest("a")) return;
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

  /* ---- Render ---- */
  const rowsEl = document.getElementById("rows");
  const grouped = groupBySeries(BOOKS);
  for (const [series, books] of grouped) {
    if (books.length) rowsEl.appendChild(buildRow(series, books));
  }

  document.getElementById("book-count").textContent = BOOKS.length;

  /* ---- Lazy-load covers ---- */
  const io = new IntersectionObserver(function (entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        io.unobserve(img);
      }
    }
  }, { rootMargin: "200px" });

  document.querySelectorAll("img[data-src]").forEach((img) => io.observe(img));
})();
