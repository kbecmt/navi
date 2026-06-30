const APP_CACHE_NAME='navi-app-v17';
const ASSETS=['index.html','style.css','navi-core.js','app.js'];

self.addEventListener('install',e=>e.waitUntil(caches.open(APP_CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==APP_CACHE_NAME).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));

self.addEventListener('message', event => {
    if (event.data.action === 'cache-info') {
        const { requestId } = event.data;
        event.source.postMessage({ action: 'cache-info', requestId, tileCount: 0 });
    }
    if (event.data.action === 'clear-tiles') {
        const { requestId } = event.data;
        event.source.postMessage({ action: 'tiles-cleared', requestId });
    }
});

self.addEventListener('fetch',e=>{
    const url = new URL(e.request.url);
    // API calls go directly to network
    if(url.hostname.includes('nominatim') || url.hostname.includes('router.project-osrm') || url.hostname.includes('overpass-api')) {
        return;
    }

    // App assets: cache first, then network
    e.respondWith(
        caches.open(APP_CACHE_NAME).then(cache => {
            return cache.match(e.request).then(response => {
                return response || fetch(e.request);
            });
        })
    );
});
