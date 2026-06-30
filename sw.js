const APP_CACHE_NAME='navi-app-v5';
const TILES_CACHE_NAME='navi-tiles-v1';
const ASSETS=['index.html','style.css','navi-core.js','app.js','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js'];

self.addEventListener('install',e=>e.waitUntil(caches.open(APP_CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==APP_CACHE_NAME && n !== TILES_CACHE_NAME).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));

self.addEventListener('message', event => {
    if (event.data.action === 'cache-tiles') {
        const { urls, regionName, meta } = event.data;
        event.waitUntil(
            caches.open(TILES_CACHE_NAME).then(cache => {
                // We need to fetch and cache one by one to report progress
                const total = urls.length;
                let completed = 0;
                const cachePromises = urls.map(url => {
                    return cache.match(url).then(response => {
                        if (!response) {
                            return fetch(url).then(fetchResponse => {
                                if (fetchResponse.ok) {
                                    cache.put(url, fetchResponse.clone());
                                }
                            });
                        }
                    }).finally(() => {
                        completed++;
                        event.source.postMessage({ action: 'cache-progress', regionName, progress: (completed / total) * 100 });
                    });
                });
                return Promise.all(cachePromises).then(()=>caches.open(APP_CACHE_NAME).then(appCache=>appCache.put('offline-region-'+regionName,new Response(JSON.stringify({regionName,meta,tileCount:urls.length,date:new Date().toISOString()}),{headers:{'Content-Type':'application/json'}}))));
            })
        );
    }
    if (event.data.action === 'cache-info') {
        const { requestId } = event.data;
        event.waitUntil(
            caches.open(TILES_CACHE_NAME)
                .then(cache => cache.keys())
                .then(keys => event.source.postMessage({ action: 'cache-info', requestId, tileCount: keys.length }))
        );
    }
    if (event.data.action === 'clear-tiles') {
        const { requestId } = event.data;
        event.waitUntil(
            caches.delete(TILES_CACHE_NAME)
                .then(() => event.source.postMessage({ action: 'tiles-cleared', requestId }))
        );
    }
});

self.addEventListener('fetch',e=>{
    const url = new URL(e.request.url);
    // API calls go directly to network
    if(url.hostname.includes('nominatim') || url.hostname.includes('router.project-osrm') || url.hostname.includes('overpass-api')) {
        return;
    }

    // Map tiles: cache first, then network
    if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('basemaps.cartocdn.com')) {
        e.respondWith(
            caches.open(TILES_CACHE_NAME).then(cache => {
                return cache.match(e.request).then(response => {
                    return response || fetch(e.request).then(fetchResponse => {
                        // Optionally, cache tiles on-the-fly, but this can fill up storage quickly.
                        // For this implementation, we rely on explicit downloads.
                        return fetchResponse;
                    });
                });
            })
        );
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
