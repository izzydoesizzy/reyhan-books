/* ============================================================
   Reyhan's Story Shelf (V2) — cover art pipeline
   ------------------------------------------------------------
   No cover images live in the repo. Each cover is resolved at
   runtime, in order:
     1. Open Library by ISBN (?default=false makes misses 404,
        so onerror fires reliably)
     2. Google Books API thumbnail by ISBN
     3. A designed "cloth cover" SVG placeholder in the series
        color — intentional-looking, never a broken image.
   Successful URLs are remembered in localStorage so repeat
   visits skip the network probing.
   ============================================================ */

var Covers = (function () {
  var CACHE_PREFIX = "v2cover:";

  function cacheGet(isbn) {
    try { return localStorage.getItem(CACHE_PREFIX + isbn); } catch (e) { return null; }
  }
  function cacheSet(isbn, url) {
    try { localStorage.setItem(CACHE_PREFIX + isbn, url); } catch (e) { /* full/blocked: fine */ }
  }

  function openLibraryUrl(isbn) {
    return "https://covers.openlibrary.org/b/isbn/" + encodeURIComponent(isbn) + "-L.jpg?default=false";
  }

  function googleBooksUrl(isbn) {
    return fetch("https://www.googleapis.com/books/v1/volumes?q=isbn:" + encodeURIComponent(isbn))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        var links = json && json.items && json.items[0] &&
          json.items[0].volumeInfo && json.items[0].volumeInfo.imageLinks;
        var url = links && (links.thumbnail || links.smallThumbnail);
        if (!url) return null;
        return url.replace(/^http:/, "https:").replace(/zoom=\d/, "zoom=2");
      })
      .catch(function () { return null; });
  }

  /* Probe a URL by actually loading it as an image. */
  function tryImage(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        /* Open Library sometimes serves a 1x1 pixel instead of 404. */
        resolve(img.naturalWidth > 10 ? url : null);
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /* Resolve a cover URL for a book, or null when no art exists. */
  function resolve(book) {
    var isbn = book.isbn;
    if (!isbn) return Promise.resolve(null);

    var cached = cacheGet(isbn);
    if (cached === "none") return Promise.resolve(null);
    if (cached) return Promise.resolve(cached);

    return tryImage(openLibraryUrl(isbn)).then(function (ol) {
      if (ol) { cacheSet(isbn, ol); return ol; }
      return googleBooksUrl(isbn).then(function (gb) {
        if (!gb) { cacheSet(isbn, "none"); return null; }
        return tryImage(gb).then(function (ok) {
          cacheSet(isbn, ok ? gb : "none");
          return ok ? gb : null;
        });
      });
    });
  }

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

  return { hydrate: hydrate, placeholder: placeholder, resolve: resolve };
})();
