/* ===== Reyhan's Reading List — service worker =====
   The app shell is served cache-first, so after shipping a change to any
   shell file BUMP THE VERSION below (v1 -> v2) — that's the whole deploy
   story: a new version installs fresh copies and deletes the old caches. */
const VERSION = "v1";
const SHELL_CACHE = "reyhan-shell-" + VERSION;
const COVER_CACHE = "reyhan-covers-" + VERSION;
const COVER_LIMIT = 120;

const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data.js",
  "manifest.json",
  "icon.svg",
];

const COVER_HOSTS = [
  "covers.openlibrary.org",
  "openlibrary.org",
  "www.googleapis.com",
  "books.google.com",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k !== SHELL_CACHE && k !== COVER_CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Keep the cover cache from growing without bound (opaque responses
   inflate storage quota): drop oldest entries past the cap. */
function trimCoverCache(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= COVER_LIMIT) return null;
    return cache.delete(keys[0]).then(function () { return trimCoverCache(cache); });
  });
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  /* App shell: cache-first, falling back to network. */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(e.request).then(function (res) {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(function (cache) { cache.put(e.request, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* Covers + metadata lookups: stale-while-revalidate. Cover <img> loads
     are no-cors, so opaque responses are cached too (for images only). */
  if (COVER_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(COVER_CACHE).then(function (cache) {
        return cache.match(e.request).then(function (hit) {
          const refresh = fetch(e.request).then(function (res) {
            const cacheable = res.ok ||
              (res.type === "opaque" && e.request.destination === "image");
            if (cacheable) {
              const copy = res.clone();
              cache.put(e.request, copy).then(function () { trimCoverCache(cache); });
            }
            return res;
          });
          return hit || refresh;
        });
      })
    );
  }
  /* Everything else (fonts, Amazon, Goodreads) passes straight through. */
});
