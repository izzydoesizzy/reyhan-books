/* ===== Kill-switch service worker =====
   This repo restructured: V2 was promoted to the site root and the
   original version moved to /archived/ (which has its own real
   service worker now). The new root doesn't register a service
   worker at all - but any browser that visited the OLD root before
   the restructure still has ITS service worker registered at this
   same "/" scope, cache-first-serving the stale V1 shell (old
   index.html/app.js/styles.css/data.js) forever, since nothing at
   this URL was telling it otherwise.

   This file replaces that old sw.js at the exact same scope so the
   browser's normal update check installs it, and it immediately
   unregisters itself, wipes every cache it can see, and reloads any
   open tabs so they fetch the real (new) site fresh. Safe to remove
   this file entirely a few months from now, once returning visitors
   have long since been flushed. */

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clientsList) {
        clientsList.forEach(function (client) { client.navigate(client.url); });
      })
  );
});
