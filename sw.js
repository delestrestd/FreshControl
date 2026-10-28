/* ═══ FreshControl — service worker (cache hors-ligne) ═══════════════════════
   Objectif : ouverture instantanée et fonctionnement sans réseau en magasin,
   SANS bloquer les mises à jour (piège déjà rencontré, cf. commit a5f892d).

   Stratégie :
   • Page (index.html) : servie depuis le cache tout de suite, puis revérifiée
     sur le réseau en arrière-plan. Si le contenu a changé, le cache est mis à
     jour et la page est prévenue (message 'fc-update') : elle se recharge seule
     sur l'écran de connexion, sinon elle affiche un bandeau « Mettre à jour ».
   • Manifest + icônes : idem (cache puis rafraîchissement silencieux).
   • ZXing (jsDelivr) et polices Google : URLs versionnées → cache d'abord.
   • Tout le reste (Google Apps Script, Sheets, géocodage, /api) : jamais mis
     en cache, passe directement au réseau.

   En cas de problème grave en production : remplacer ce fichier par une
   version qui fait self.registration.unregister() et vide les caches. */

const CACHE = 'fc-shell-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.svg', '/icons/icon-512.svg', '/icons/icon-maskable.svg', '/brand/s2d-monogramme.svg',
  ...['lea-nature','jardin-bio','joyce','karelea','good-moov','naturasens','biosens','kiva','sobio-etic','biovie','dentavie','floressance'].map(n => '/brand/marques/' + n + '.png')];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Installation : pré-charge la coquille de l'app (toujours depuis le réseau)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'no-store' }))))
      .then(() => self.skipWaiting())
  );
});

// Activation : supprime les caches d'anciennes versions, prend la main tout de suite
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // La page elle-même ('/' ou '/index.html', y compris avec ?paramètres)
    if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(servePage(event));
      return;
    }
    // Manifest, icônes et logo : cache puis rafraîchissement silencieux
    if (SHELL.includes(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, req, url.pathname));
      return;
    }
    return;   // /api et le reste : réseau direct
  }

  // Bibliothèque de scan et polices : cache d'abord (URLs versionnées)
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});

/* Page : réponse immédiate depuis le cache. Premier lancement (rien en
   cache) : réseau puis mise en cache. La vérification de mise à jour est
   demandée par la page elle-même une fois chargée (message 'fc-check') :
   prévenir la page plus tôt risquerait d'envoyer le message avant qu'elle
   ne l'écoute. */
async function servePage(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('/');
  if (cached) return cached;
  const fresh = await fetch('/', { cache: 'no-store' });
  if (fresh.ok) await cache.put('/', fresh.clone());
  return fresh;
}

// Compare la page en cache à celle du serveur ; true si une nouvelle version a été mise en cache
async function refreshPage() {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('/');
  const fresh = await fetch('/', { cache: 'no-store' });
  if (!fresh.ok) return false;
  if (cached) {
    const [a, b] = await Promise.all([cached.clone().text(), fresh.clone().text()]);
    if (a === b) return false;                // rien de neuf
  }
  await cache.put('/', fresh);
  return !!cached;
}

// La page demande « y a-t-il du neuf ? » → réponse 'fc-update' si oui (hors-ligne : silence)
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'fc-check' || !event.source) return;
  event.waitUntil(
    refreshPage()
      .then(updated => { if (updated) event.source.postMessage({ type: 'fc-update' }); })
      .catch(() => {})
  );
});

async function staleWhileRevalidate(event, req, key) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key);
  const net = fetch(req, { cache: 'no-store' })
    .then(r => { if (r.ok) cache.put(key, r.clone()); return r; });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  return net;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const r = await fetch(req);
  // On ne garde que les réponses exploitables (CORS ok) ou opaques des polices
  if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
  return r;
}
