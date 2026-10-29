/* Talaia · service worker: l'app sempre es baixa de nou si hi ha xarxa (les actualitzacions arriben soles)
   i, sense xarxa, obre l'última versió guardada. Les fonts es guarden a la memòria cau. */
var CACHE = 'talaia-v3';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  var isPage = req.mode === 'navigate' || (url.origin === location.origin && /(\/|index\.html)$/.test(url.pathname));
  var isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (isPage) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(function (r) {
      var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put('index.html', cp); }); return r;
    }).catch(function () { return caches.open(CACHE).then(function (c) { return c.match('index.html'); }); }));
  } else if (isFont) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  }
});
