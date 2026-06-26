const CACHE_NAME='navi-v1';
const ASSETS=['index.html','style.css','app.js','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js'];

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
    if(e.request.url.includes('nominatim')||e.request.url.includes('router.project-osrm'))return;
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});