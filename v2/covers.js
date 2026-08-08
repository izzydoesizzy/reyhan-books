/* ============================================================
   Reyhan's Story Shelf (V2) — cover art pipeline
   ------------------------------------------------------------
   No cover images live in the repo. Each cover is resolved at
   runtime by walking an ordered chain of sources:
     1. Per-book override URL from COVER_OVERRIDES (probed like
        any other candidate, never trusted blindly)
     2. Open Library by ISBN (?default=false makes misses 404,
        so onerror fires reliably)
     3. Amazon's cover CDN by ISBN-10 / ASIN (no API, no quota;
        misses return a 1x1 GIF that the size check rejects)
     4. Google Books API thumbnail by ISBN
     5. Open Library title+author search -> cover id
     6. A designed "cloth cover" SVG placeholder in the series
        color — intentional-looking, never a broken image.
   Successful URLs (and 7-day-expiring misses) are remembered in
   localStorage; concurrent walks are capped and deduped so a
   cold visit stays inside Open Library's rate limits.
   The chain is exported as Covers.sources so covercheck.html
   can probe every book against every source individually.
   ============================================================ */

var Covers = (function () {
  var CACHE_PREFIX = "v2cover2:";
  var LEGACY_PREFIX = "v2cover:";
  var NONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_CONCURRENT = 6;

  /* One-time sweep of the old permanent-negative cache format. */
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf(LEGACY_PREFIX) === 0 && k.indexOf(CACHE_PREFIX) !== 0) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) { /* storage blocked: fine */ }

  /* ---------- cache (keyed by book id) ---------- */

  function cacheGet(id) {
    try {
      var val = localStorage.getItem(CACHE_PREFIX + id);
      if (!val) return null;
      if (val.indexOf("none:") === 0) {
        var age = Date.now() - (+val.slice(5) || 0);
        if (age > NONE_TTL_MS) {
          localStorage.removeItem(CACHE_PREFIX + id);
          return null;
        }
        return "none";
      }
      return val;
    } catch (e) { return null; }
  }

  function cacheSet(id, url) {
    try {
      if (url === "none") {
        /* Don't memorize a miss that was really just being offline. */
        if (navigator.onLine === false) return;
        url = "none:" + Date.now();
      }
      localStorage.setItem(CACHE_PREFIX + id, url);
    } catch (e) { /* full/blocked: fine */ }
  }

  function clearCache() {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf(CACHE_PREFIX) === 0) localStorage.removeItem(k);
      });
    } catch (e) { /* fine */ }
  }

  /* ---------- probing primitives ---------- */

  function bustUrl(url, opts) {
    if (!opts || !opts.bust) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "cb=" + Date.now();
  }

  /* Probe a URL by actually loading it as an image. Rejects the
     tiny stand-in pixels Open Library and Amazon serve on miss. */
  function tryImage(url, opts) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img.naturalWidth > 10 ? url : null); };
      img.onerror = function () { resolve(null); };
      img.src = bustUrl(url, opts);
    });
  }

  function fetchJson(url, opts) {
    return fetch(url, opts && opts.bust ? { cache: "no-store" } : undefined)
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  /* ---------- the source chain ---------- */

  var SOURCES = [
    {
      id: "override",
      label: "Hand-picked URL",
      applies: function (book) { return !!book.override; },
      probe: function (book, opts) { return tryImage(book.override, opts); },
    },
    {
      id: "openlibrary-isbn",
      label: "Open Library (ISBN)",
      applies: function (book) { return !!book.isbn; },
      probe: function (book, opts) {
        return tryImage("https://covers.openlibrary.org/b/isbn/" +
          encodeURIComponent(book.isbn) + "-L.jpg?default=false", opts);
      },
    },
    {
      id: "amazon",
      label: "Amazon covers",
      /* Keyed by ASIN, and for books ASIN == ISBN-10. 13-digit
         ISBNs don't work here, but the ASIN from the Amazon URL
         covers those books (e.g. 979-prefix titles). */
      applies: function (book) {
        return !!(book.asin || (book.isbn && book.isbn.length === 10));
      },
      probe: function (book, opts) {
        var key = (book.isbn && book.isbn.length === 10) ? book.isbn : book.asin;
        /* m.media-amazon.com/images/P/ is the modern equivalent
           host if images-na is ever retired. */
        return tryImage("https://images-na.ssl-images-amazon.com/images/P/" +
          encodeURIComponent(key) + ".01.LZZZZZZZ.jpg", opts);
      },
    },
    {
      id: "googlebooks",
      label: "Google Books (ISBN)",
      applies: function (book) { return !!book.isbn; },
      probe: function (book, opts) {
        return fetchJson("https://www.googleapis.com/books/v1/volumes?q=isbn:" +
          encodeURIComponent(book.isbn), opts)
          .then(function (json) {
            var links = json && json.items && json.items[0] &&
              json.items[0].volumeInfo && json.items[0].volumeInfo.imageLinks;
            var url = links && (links.thumbnail || links.smallThumbnail);
            if (!url) return null;
            url = url.replace(/^http:/, "https:").replace(/zoom=\d/, "zoom=2");
            return tryImage(url, opts);
          });
      },
    },
    {
      id: "openlibrary-search",
      label: "Open Library (title search)",
      /* Least precise (can land on another edition), so last. */
      applies: function (book) { return !!book.title; },
      probe: function (book, opts) {
        var q = book.title + (book.author ? " " + book.author : "");
        return fetchJson("https://openlibrary.org/search.json?q=" +
          encodeURIComponent(q) + "&fields=cover_i&limit=1", opts)
          .then(function (json) {
            var coverId = json && json.docs && json.docs[0] && json.docs[0].cover_i;
            if (!coverId) return null;
            return tryImage("https://covers.openlibrary.org/b/id/" + coverId + "-L.jpg", opts);
          });
      },
    },
  ];

  /* ---------- concurrency: small queue + in-flight dedupe ---------- */

  var active = 0;
  var waiting = [];

  function enqueue(task) {
    return new Promise(function (resolve) {
      function run() {
        active++;
        task().then(function (result) {
          active--;
          if (waiting.length) waiting.shift()();
          resolve(result);
        });
      }
      if (active < MAX_CONCURRENT) run();
      else waiting.push(run);
    });
  }

  var pending = {};

  /* Resolve a cover URL for a book, or null when no source has one. */
  function resolve(book) {
    var cached = cacheGet(book.id);
    if (cached === "none") return Promise.resolve(null);
    if (cached) return Promise.resolve(cached);
    if (pending[book.id]) return pending[book.id];

    pending[book.id] = enqueue(function () {
      var applicable = SOURCES.filter(function (s) { return s.applies(book); });
      function walk(i) {
        if (i >= applicable.length) return Promise.resolve(null);
        return applicable[i].probe(book).then(function (url) {
          return url || walk(i + 1);
        });
      }
      return walk(0).then(function (url) {
        cacheSet(book.id, url || "none");
        delete pending[book.id];
        return url;
      });
    });
    return pending[book.id];
  }

  /* ---------- placeholder ---------- */

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c];
    });
  }

  /* Split a title into up to 4 short lines for the placeholder. */
  function titleLines(title) {
    var words = title.split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      if ((line + " " + w).trim().length > 12 && line) { lines.push(line); line = w; }
      else line = (line + " " + w).trim();
    });
    if (line) lines.push(line);
    if (lines.length > 4) { lines = lines.slice(0, 4); lines[3] += "…"; }
    return lines;
  }

  /* Designed fallback: a cloth-bound cover in the series color. */
  function placeholder(book) {
    var color = book.color || "#A97B4F";
    var lines = titleLines(book.title);
    var text = lines.map(function (l, i) {
      var y = 150 + i * 34 - (lines.length - 1) * 17;
      return '<text x="130" y="' + y + '" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="26" fill="#FFF8EC">' + escapeXml(l) + "</text>";
    }).join("");
    var author = '<text x="130" y="290" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="rgba(255,248,236,.85)">' + escapeXml(book.author || "") + "</text>";
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="330" viewBox="0 0 220 330">' +
      '<rect width="220" height="330" fill="' + color + '"/>' +
      '<rect width="220" height="330" fill="rgba(0,0,0,.12)"/>' +
      '<rect width="18" height="330" fill="rgba(0,0,0,.22)"/>' +
      '<rect x="30" y="24" width="178" height="282" fill="none" stroke="#F2A93B" stroke-width="2" rx="6"/>' +
      '<rect x="37" y="31" width="164" height="268" fill="none" stroke="rgba(242,169,59,.55)" stroke-width="1" rx="4"/>' +
      '<circle cx="130" cy="72" r="17" fill="none" stroke="#F2A93B" stroke-width="2"/>' +
      '<text x="130" y="80" text-anchor="middle" font-size="20">✦</text>' +
      '<g transform="translate(-11,0)">' + text + author + "</g>" +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* Fill an <img>: placeholder immediately (with a one-frame fade),
     then swap in the real cover art whenever it resolves. */
  function hydrate(img, book) {
    img.src = placeholder(book);
    requestAnimationFrame(function () { img.classList.add("is-loaded"); });
    resolve(book).then(function (url) {
      if (!url) return;
      var real = new Image();
      real.onload = function () { img.src = url; };
      real.src = url;
    });
  }

  return {
    hydrate: hydrate,
    placeholder: placeholder,
    resolve: resolve,
    sources: SOURCES,
    clearCache: clearCache,
  };
})();
