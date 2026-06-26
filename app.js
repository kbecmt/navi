const CONFIG={
    osrmUrl:'https://router.project-osrm.org/route/v1/driving',
    nominatimUrl:'https://nominatim.openstreetmap.org/search',
    overpassUrl:'https://overpass-api.de/api/interpreter',
    hereApiKey: '', // <-- Wklej tutaj swój klucz HERE API
    defaultZoom:16,gpsOptions:{enableHighAccuracy:true,maximumAge:500},debounceMs:400,cameraAlertRange:0.5,cameraShowRange:2,cameraNearRange:0.03,preNotifyRange:0.5,rerouteThreshold: 0.075, speedWarnCooldown:8000,speechResumeInterval:3000,autoNightStart:20,autoNightEnd:7
};
const map = L.map('map', { zoomControl: false, rotate: true, rotateControl: false }).setView([51.5, -0.09], 5);
L.control.zoom({ position: 'bottomright' }).addTo(map);

const appState = {
    userPos: null,
    destination: null,
    destinationName: '',
    userMarker: null,
    gpsCentered: false,
    navigationActive: false,
    lastLat: null,
    lastLng: null,
    lastTime: null,
    currentBearing: 0,
    currentSpeed: 0,
    routeInstructions: [],
    instructionIndex: 0,
    totalRouteDist: 0,
    routeCoords: [],
    lastSpokenIdx: -1,
    lastCameraSpoken: null,
    nearestCameraDistance: Infinity,
    isRerouting: false,
    alternativeRoutes: [],
    alternativeRouteLines: [],
    routeLine: null,
    lastMapViewTime: 0,
    lastMapViewPos: null,
    routePOIs: [],
    poiMarkers: [],
    spoken500m: new Set(),
    spokenCameras500m: new Set(),
    currentSpeedLimit: 0,
    lastSpeedWarnSpoken: 0,
};

let settings = { routeType: 'fast', speedAlertOver: 10, speedAlertEnabled: true, voiceEnabled: true, isNightMode: true, mapTilesEnabled: true, trafficEnabled: false, favoritesCollapsed: false, avoidTolls: false, avoidFerries: false, avoidHighways: false, avoidUnpaved: false };
function saveSettings(){try{localStorage.setItem('naviSettings',JSON.stringify(settings))}catch(e){console.error("Failed to save settings:", e)}}
function loadSettings(){try{const s=JSON.parse(localStorage.getItem('naviSettings'));if(s){Object.assign(settings, s)}}catch(e){console.error("Failed to load settings:", e)}}
loadSettings();
function calcBearing(lat1, lon1, lat2, lon2) { const dLon = (lon2 - lon1) * Math.PI / 180; const lat1Rad = lat1 * Math.PI / 180; const lat2Rad = lat2 * Math.PI / 180; const y = Math.sin(dLon) * Math.cos(lat2Rad); const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon); return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360; }
function calcSpeed(lat1, lon1, time1, lat2, lon2, time2) { const dist = haversine(lat1, lon1, lat2, lon2); const dt = (time2 - time1) / 1000; return dt < 0.5 ? 0 : dist / dt * 3600; }
function haversine(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }
function fmtDist(km){return km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km'}
function fmtArrival(min){const d=new Date(Date.now()+min*60000);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function fmtDuration(min){const h=Math.floor(min/60);const m=Math.round(min%60);return h>0?h+'h '+m+'min':m+' min'}
function bearingName(b){const n=['na północ','na północny wschód','na wschód','na południowy wschód','na południe','na południowy zachód','na zachód','na północny zachód'];return n[Math.round(b/45)%8]}
const arrowChars=['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function bearingToArrow(b){return arrowChars[Math.round(b/45)%8]}
let displayedBearing=0;
function rotateMap(deg){let diff=deg-displayedBearing;if(diff>180)diff-=360;if(diff<-180)diff+=360;displayedBearing+=diff*0.25;if(displayedBearing>360)displayedBearing-=360;if(displayedBearing<0)displayedBearing+=360;document.getElementById('map').style.transform='rotate('+(-displayedBearing)+'deg)'}
function toggleVoice(){settings.voiceEnabled=!settings.voiceEnabled;document.getElementById('voiceToggle').classList.toggle('on',settings.voiceEnabled);const sb=document.getElementById('btnSound');if(sb)sb.textContent=settings.voiceEnabled?'🔊':'🔇';saveSettings()}
function speak(text){if(!settings.voiceEnabled||!text)return;if(window.speechSynthesis.speaking)window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='pl-PL';u.rate=1.05;u.volume=1;const t=document.getElementById('voiceToast');t.textContent=text;t.classList.add('show');u.onend=u.onerror=()=>t.classList.remove('show');window.speechSynthesis.speak(u)}
let speechUnlocked=false;function unlockSpeech(){if(speechUnlocked)return;speechUnlocked=true;try{const u=new SpeechSynthesisUtterance('');u.volume=0;u.rate=0.01;window.speechSynthesis.speak(u);window.speechSynthesis.cancel();window.speechSynthesis.resume()}catch(e){}}
document.addEventListener('touchstart',unlockSpeech,{once:true});document.addEventListener('click',unlockSpeech,{once:true});
setInterval(()=>{try{if(window.speechSynthesis&&!window.speechSynthesis.speaking)window.speechSynthesis.resume()}catch(e){}},CONFIG.speechResumeInterval);
let mapTilesLayer=null;
function loadMapTiles(){if(!settings.mapTilesEnabled)return;if(mapTilesLayer)map.removeLayer(mapTilesLayer);mapTilesLayer=settings.isNightMode?L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map):L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map)}
loadMapTiles();

let trafficLayer = null;
let trafficInterval = null;
function toggleTraffic() {
    settings.trafficEnabled = !settings.trafficEnabled;
    document.getElementById('trafficToggle').classList.toggle('on', settings.trafficEnabled);
    saveSettings();

    if (settings.trafficEnabled) {
        if (!CONFIG.hereApiKey) {
            alert('Klucz HERE API nie został skonfigurowany. Dodaj go w pliku app.js, aby włączyć warstwę ruchu.');
            settings.trafficEnabled = false;
            document.getElementById('trafficToggle').classList.remove('on');
            saveSettings();
            return;
        }
        trafficLayer = L.tileLayer(`https://{s}.traffic.maps.ls.hereapi.com/maptile/2.1/flowtile/newest/normal.day/{z}/{x}/{y}/256/png8?apiKey=${CONFIG.hereApiKey}`, { subdomains: '1234', maxZoom: 20 });
        trafficLayer.addTo(map);
        trafficInterval = setInterval(() => trafficLayer.redraw(), 300000); // Odświeżaj co 5 minut
    } else if (trafficLayer) {
        map.removeLayer(trafficLayer);
        trafficLayer = null;
        if (trafficInterval) clearInterval(trafficInterval);
        trafficInterval = null;
    }
}
function toggleMapTiles(){settings.mapTilesEnabled=!settings.mapTilesEnabled;document.getElementById('mapTilesToggle').classList.toggle('on',settings.mapTilesEnabled);if(settings.mapTilesEnabled)loadMapTiles();else{if(mapTilesLayer){map.removeLayer(mapTilesLayer);mapTilesLayer=null}document.getElementById('map').style.background=settings.isNightMode?'#111118':'#d8d8e0'}saveSettings()}
function toggleDayNight(){settings.isNightMode=!settings.isNightMode;document.body.classList.toggle('day-mode',!settings.isNightMode);document.getElementById('dayNightToggle').classList.toggle('on',settings.isNightMode);loadMapTiles();if(!settings.mapTilesEnabled)document.getElementById('map').style.background=settings.isNightMode?'#111118':'#d8d8e0';saveSettings()}
function autoDayNight(){const h=new Date().getHours();const shouldBeNight=h<CONFIG.autoNightEnd||h>=CONFIG.autoNightStart;if(shouldBeNight!==settings.isNightMode)toggleDayNight()}
setInterval(autoDayNight,60000);
function createArrowIcon(bearing){return L.divIcon({className:'',html:'<svg class="user-arrow" viewBox="0 0 30 30" style="transform:rotate('+bearing+'deg)"><circle cx="15" cy="15" r="12" fill="#2979ff" stroke="white" stroke-width="2.5" opacity="0.95"/><polygon points="15,4 20,22 15,18 10,22" fill="white"/></svg>',iconSize:[30,30],iconAnchor:[15,15]})}
function openMainMenu(){document.getElementById('mainMenu').classList.add('open');document.getElementById('overlay').classList.add('show');document.getElementById('persistentMenu').style.display='none'}
function closeMainMenu(){document.getElementById('mainMenu').classList.remove('open');document.getElementById('overlay').classList.remove('show');if(!appState.navigationActive)document.getElementById('persistentMenu').style.display='flex'}

function createDOMElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.textContent) el.textContent = options.textContent;
    if (options.innerHTML) el.innerHTML = options.innerHTML;
    if (options.onclick) el.onclick = options.onclick;
    for (const attr in options.attributes) {
        el.setAttribute(attr, options.attributes[attr]);
    }
    return el;
}

function openSettingsSub() {
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody = document.getElementById('ssBody');
    ssBody.innerHTML = '';
    document.getElementById('ssTitle').textContent = 'Ustawienia trasy';

    const routeTypes = [ { type: 'fast', icon: '⚡', label: 'Szybka' }, { type: 'eco', icon: '🌿', label: 'Eko' }, { type: 'short', icon: '📏', label: 'Krótka' } ];
    const routeTypesContainer = createDOMElement('div', { className: 'route-types' });
    routeTypes.forEach(rt => {
        const typeEl = createDOMElement('div', { className: `route-type ${settings.routeType === rt.type ? 'active' : ''}`});
        typeEl.onclick = () => setRouteType(rt.type, typeEl);
        typeEl.append(createDOMElement('div', { className: 'rt-icon', textContent: rt.icon }), createDOMElement('div', { className: 'rt-label', textContent: rt.label }));
        routeTypesContainer.append(typeEl);
    });
    ssBody.append(createDOMElement('div', { className: 'ss-section', innerHTML: '<h4>Typ trasy</h4>' }), routeTypesContainer);

    const avoidItems = [
        { key: 'avoidTolls', icon: '💰', label: 'Opłaty' }, { key: 'avoidUnpaved', icon: '🛤️', label: 'Drogi nieutwardzone' },
        { key: 'avoidHighways', icon: '🛣️', label: 'Autostrady' }, { key: 'avoidFerries', icon: '⛴️', label: 'Promy' }
    ];
    const avoidSection = createDOMElement('div', { className: 'ss-section' });
    avoidSection.append(createDOMElement('h4', { textContent: 'Unikaj' }));
    avoidItems.forEach(item => {
        const avoidItem = createDOMElement('div', { className: 'avoid-item' });
        const toggle = createDOMElement('div', { className: `mm-toggle ${settings[item.key] ? 'on' : ''}`});
        toggle.onclick = function() { settings[item.key] = !settings[item.key]; this.classList.toggle('on'); saveSettings(); };
        avoidItem.append(createDOMElement('div', { className: 'ai-left', innerHTML: `<span class="ai-icon">${item.icon}</span> ${item.label}` }), toggle);
        avoidSection.append(avoidItem);
    });
    ssBody.append(avoidSection);
    document.getElementById('settingsSub').classList.add('open');
}

function openSpeedSettings() {
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody = document.getElementById('ssBody');
    ssBody.innerHTML = '';
    document.getElementById('ssTitle').textContent = 'Alerty prędkości';

    const section = createDOMElement('div', { className: 'ss-section' });
    section.append(createDOMElement('h4', { textContent: 'Powiadomienia o przekroczeniu prędkości' }));
    
    const row1 = createDOMElement('div', { className: 'ss-row' });
    const toggle = createDOMElement('div', { className: `mm-toggle ${settings.speedAlertEnabled ? 'on' : ''}`, onclick: function() { settings.speedAlertEnabled = !settings.speedAlertEnabled; this.classList.toggle('on'); saveSettings(); } });
    row1.append(createDOMElement('label', { textContent: 'Włącz alerty' }), toggle);

    const row2 = createDOMElement('div', { className: 'ss-row' });
    const valSpan = createDOMElement('span', { className: 'ss-num', id: 'speedAlertVal', textContent: `+${settings.speedAlertOver} km/h` });
    const rangeInput = createDOMElement('input', { attributes: { type: 'range', min: '1', max: '30', value: settings.speedAlertOver } });
    rangeInput.oninput = () => { settings.speedAlertOver = parseInt(rangeInput.value); valSpan.textContent = `+${rangeInput.value} km/h`; saveSettings(); };
    const valDiv = createDOMElement('div', { className: 'ss-val' });
    valDiv.append(rangeInput, valSpan);
    row2.append(createDOMElement('label', { textContent: 'Próg przekroczenia' }), valDiv);

    section.append(row1, row2);
    ssBody.append(section);
    document.getElementById('settingsSub').classList.add('open');
}

function closeSettingsSub(){document.getElementById('settingsSub').classList.remove('open');document.getElementById('mainMenu').classList.add('open');document.getElementById('overlay').classList.add('show')}
function setRouteType(type, clickedElement) {
    document.querySelectorAll('.route-type').forEach(e => e.classList.remove('active'));
    if (clickedElement) clickedElement.classList.add('active');
    settings.routeType = type;
    saveSettings();
}
function showLoading(msg){let el=document.getElementById('loadingOverlay');if(!el){el=document.createElement('div');el.id='loadingOverlay';el.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;z-index:1400;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:18px;font-weight:700;flex-direction:column;gap:12px';el.innerHTML='<div style="width:40px;height:40px;border:4px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite"></div><span id="loadingText"></span><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';document.body.appendChild(el)}document.getElementById('loadingText').textContent=msg||'Ładowanie...';el.style.display='flex'}
function hideLoading(){const el=document.getElementById('loadingOverlay');if(el)el.style.display='none'}
let speedCameras=[];
let routeCameras=[];
function distToRoute(lat,lng){if(!appState.routeCoords.length)return Infinity;let minD=Infinity;for(let i=0;i<appState.routeCoords.length-1;i+=3){const d=haversine(lat,lng,appState.routeCoords[i].lat,appState.routeCoords[i].lng);if(d<minD)minD=d;if(minD<0.1)return minD}return minD}
function snapToRoute(lat,lng){if(!appState.routeCoords.length)return{lat,lng};let minD=Infinity,snap=appState.routeCoords[0];for(let i=0;i<appState.routeCoords.length-1;i++){const p=appState.routeCoords[i],q=appState.routeCoords[i+1];const dx=q.lng-p.lng,dy=q.lat-p.lat;const len2=dx*dx+dy*dy;if(len2===0){const d=haversine(lat,lng,p.lat,p.lng);if(d<minD){minD=d;snap=p}continue}let t=((lng-p.lng)*dx+(lat-p.lat)*dy)/len2;t=Math.max(0,Math.min(1,t));const snapLat=p.lat+t*dy,snapLng=p.lng+t*dx;const d=haversine(lat,lng,snapLat,snapLng);if(d<minD){minD=d;snap={lat:snapLat,lng:snapLng}}}return snap}
function loadRouteCameras(){if(!appState.routeCoords.length)return;let minLat=90,maxLat=-90,minLng=180,maxLng=-180;for(const c of appState.routeCoords){if(c.lat<minLat)minLat=c.lat;if(c.lat>maxLat)maxLat=c.lat;if(c.lng<minLng)minLng=c.lng;if(c.lng>maxLng)maxLng=c.lng}const margin=0.05;routeCameras=(window.speedCameras||[]).filter(cam=>cam.lat>=minLat-margin&&cam.lat<=maxLat+margin&&cam.lng>=minLng-margin&&cam.lng<=maxLng+margin&&distToRoute(cam.lat,cam.lng)<0.5);loadOSMPOIs(minLat,maxLat,minLng,maxLng)}
const osmTypeMap={
    amenity_fuel:{icon:'⛽',type:'fuel'},
    amenity_parking:{icon:'🅿️',type:'parking'},
    amenity_restaurant:{icon:'🍽️',type:'restaurant'},
    amenity_cafe:{icon:'☕',type:'cafe'},
    amenity_hospital:{icon:'🏥',type:'danger'},
    amenity_pharmacy:{icon:'💊',type:'pharmacy'},
    highway_speed_camera:{icon:'📸',type:'camera', isSpeedCamera: true},
    highway_construction:{icon:'🚧',type:'danger'},
    highway_traffic_signals:{icon:'🚦',type:'traffic'},
    barrier_toll_booth:{icon:'💰',type:'danger'}
};
let fallbackPOIs = [];
function loadOSMPOIs(minLat,maxLat,minLng,maxLng){
    // Start with fallback POIs filtered by route proximity
    const poisOnRoute = (window.fallbackPOIs || []).filter(p => distToRoute(p.lat, p.lng) < 0.5);
    appState.routePOIs = [...poisOnRoute];
    renderPOIMarkers();

    const bbox = `(${minLat-0.05},${minLng-0.05},${maxLat+0.05},${maxLng+0.05})`;
    const poiTags = Object.keys(osmTypeMap).map(tag => `node["${tag.replace('_', '"="')}"]${bbox};`);
    const query = `[out:json][timeout:25];(${poiTags.join('')});out body;`;

    fetch(CONFIG.overpassUrl, { method: 'POST', body: 'data=' + encodeURIComponent(query) })
    .then(r => r.json())
    .then(data => {
        if (!data.elements) return;
        const osmPOIs = data.elements.map(el => {
            if (el.type !== 'node') return null;
            const tags = el.tags || {};
            let poiType = null;
            for (const key in osmTypeMap) {
                const [tagKey, tagValue] = key.split('_');
                if (tags[tagKey] === tagValue) {
                    poiType = osmTypeMap[key];
                    break;
                }
            }
            if (!poiType) return null;
            const name = tags.name || tags.brand || tags.operator || poiType.icon + ' OSM';
            if (distToRoute(el.lat, el.lon) < 0.5) {
                const poi = { lat: el.lat, lng: el.lon, type: poiType.type, icon: poiType.icon, name };
                if (poiType.isSpeedCamera) {
                    poi.limit = parseInt(tags.maxspeed, 10) || 0;
                }
                return poi;
            }
            return null;
        }).filter(Boolean); // Remove null entries

        if (osmPOIs.length > 0) {
            // Combine fallback POIs with new ones from Overpass, avoiding duplicates
            const existingPoiCoords = new Set(appState.routePOIs.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`));
            const newPois = osmPOIs.filter(p => !existingPoiCoords.has(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`));
            appState.routePOIs.push(...newPois);
            renderPOIMarkers();
        }
    })
    .catch(err => console.error("Failed to load POIs from Overpass API:", err));
}
function renderPOIMarkers(){
    appState.poiMarkers.forEach(m=>map.removeLayer(m));
    appState.poiMarkers=[];
    const renderedCoords = new Set();

    const allPois = [...appState.routePOIs, ...routeCameras];

    for(const poi of allPois){
        const coordKey = `${poi.lat.toFixed(4)},${poi.lng.toFixed(4)}`;
        if (renderedCoords.has(coordKey)) continue;

        const snapped=snapToRoute(poi.lat,poi.lng);
        const iconHtml = `<div style="font-size:22px;text-shadow:0 1px 4px rgba(0,0,0,0.5)">${poi.icon || '📸'}</div>`;
        const icon=L.divIcon({className:'',html:iconHtml,iconSize:[24,24],iconAnchor:[12,12]});
        const m=L.marker([snapped.lat,snapped.lng],{icon}).addTo(map);
        const tooltipText = poi.limit ? `${poi.name} (${poi.limit} km/h)` : poi.name;
        m.bindTooltip(tooltipText,{permanent:false,direction:'top',offset:[0,-8]});
        appState.poiMarkers.push(m);
        renderedCoords.add(coordKey);
    }
}
function checkSpeedCameras(lat,lng,speed){let minDist=Infinity,nearestCam=null;for(const cam of routeCameras){const d=haversine(lat,lng,cam.lat,cam.lng);if(d<minDist){minDist=d;nearestCam=cam}}const alert=document.getElementById('cameraAlert'),scRing=document.getElementById('scRing'),scLimit=document.getElementById('scLimit');appState.nearestCameraDistance=minDist;if(nearestCam&&minDist<CONFIG.cameraShowRange){appState.currentSpeedLimit=nearestCam.limit;document.getElementById('camDistText').textContent=fmtDist(minDist);document.getElementById('camSpeedText').textContent='Ograniczenie: '+nearestCam.limit+' km/h — '+nearestCam.name;scLimit.textContent=nearestCam.limit;scLimit.style.display='flex';if(minDist<=CONFIG.cameraAlertRange&&minDist>CONFIG.cameraNearRange){alert.classList.add('show');const camKey=nearestCam.name+Math.round(minDist*10);if(camKey!==appState.lastCameraSpoken){appState.lastCameraSpoken=camKey;speak('Uwaga, fotoradar, '+nearestCam.limit+' km/h, za '+fmtDist(minDist))}}else alert.classList.remove('show');if(settings.speedAlertEnabled&&speed>nearestCam.limit+settings.speedAlertOver){const now=Date.now();if(now-appState.lastSpeedWarnSpoken>CONFIG.speedWarnCooldown){appState.lastSpeedWarnSpoken=now;speak('Uwaga! Przekroczono prędkość o '+Math.round(speed-nearestCam.limit)+' kilometrów na godzinę!');document.getElementById('speedWarning').classList.add('show');setTimeout(()=>document.getElementById('speedWarning').classList.remove('show'),3000)}}}else{alert.classList.remove('show');appState.currentSpeedLimit=0;scLimit.textContent='—'}if(appState.currentSpeedLimit>0){if(speed>appState.currentSpeedLimit+settings.speedAlertOver)scRing.className='sc-ring over';else if(speed>appState.currentSpeedLimit)scRing.className='sc-ring warn';else scRing.className='sc-ring'}else scRing.className='sc-ring'}
function updateRouteStrip(lat,lng){if(!appState.routeCoords.length||!appState.navigationActive)return;const track=document.getElementById('sbTrack'),progress=document.getElementById('sbProgress');let totalDist=0;const cumDists=[0];for(let i=1;i<appState.routeCoords.length;i++){totalDist+=haversine(appState.routeCoords[i-1].lat,appState.routeCoords[i-1].lng,appState.routeCoords[i].lat,appState.routeCoords[i].lng);cumDists.push(totalDist)}if(totalDist===0)return;let minD=Infinity,closestIdx=0;for(let i=0;i<appState.routeCoords.length;i++){const d=haversine(lat,lng,appState.routeCoords[i].lat,appState.routeCoords[i].lng);if(d<minD){minD=d;closestIdx=i}}const doneDist=cumDists[closestIdx];progress.style.height=Math.min(100,(doneDist/totalDist)*100)+'%';track.querySelectorAll('.sidebar-strip-marker').forEach(m=>m.remove());const lookAhead=5;for(const inst of appState.routeInstructions){if(inst.index<closestIdx)continue;const instDist=haversine(lat,lng,inst.lat,inst.lng);if(instDist>lookAhead)continue;const topPx=(instDist/lookAhead)*track.clientHeight;const m=document.createElement('div');m.className='sidebar-strip-marker';m.style.top=topPx+'px';m.innerHTML='<div class="icon-dot turn">'+bearingToArrow(inst.bearing||0)+'</div>';track.appendChild(m)}for(const cam of routeCameras){const d=haversine(lat,lng,cam.lat,cam.lng);if(d>lookAhead)continue;const topPx=(d/lookAhead)*track.clientHeight;const m=document.createElement('div');m.className='sidebar-strip-marker';m.style.top=topPx+'px';m.innerHTML='<div class="icon-dot camera">📸</div>';track.appendChild(m)}for(const poi of appState.routePOIs){const d=haversine(lat,lng,poi.lat,poi.lng);if(d>lookAhead)continue;const topPx=(d/lookAhead)*track.clientHeight;const m=document.createElement('div');m.className='sidebar-strip-marker';m.style.top=topPx+'px';m.innerHTML='<div class="icon-dot '+poi.type+'">'+poi.icon+'</div>';track.appendChild(m)}const um=document.createElement('div');um.className='sidebar-strip-marker';um.style.top=Math.min(100,(doneDist/totalDist)*100)+'%';um.innerHTML='<div class="icon-dot user">⬆</div>';track.appendChild(um)}
function debouncedSetView(pos){const now=Date.now();if(now-appState.lastMapViewTime<CONFIG.debounceMs)return;if(appState.lastMapViewPos&&haversine(pos.lat,pos.lng,appState.lastMapViewPos.lat,appState.lastMapViewPos.lng)<0.005)return;appState.lastMapViewTime=now;appState.lastMapViewPos=pos;map.setView(pos,CONFIG.defaultZoom)}
navigator.geolocation.watchPosition(pos=>{const lat=pos.coords.latitude,lng=pos.coords.longitude,heading=pos.coords.heading,now=Date.now();appState.userPos=L.latLng(lat,lng);if(appState.lastLat!==null&&appState.lastLng!==null&&appState.lastTime!==null){const dt=(now-appState.lastTime)/1000;if(dt>0.3){const b=calcBearing(appState.lastLat,appState.lastLng,lat,lng);const s=calcSpeed(appState.lastLat,appState.lastLng,appState.lastTime,lat,lng,now);appState.currentSpeed=s;if(s>1.5)appState.currentBearing=b;appState.lastLat=lat;appState.lastLng=lng;appState.lastTime=now}}else{appState.lastLat=lat;appState.lastLng=lng;appState.lastTime=now}if(heading&&!isNaN(heading)&&heading!==0)appState.currentBearing=heading;if(!appState.userMarker){appState.userMarker=L.marker(appState.userPos,{icon:createArrowIcon(appState.currentBearing),zIndexOffset:1000}).addTo(map)}else{appState.userMarker.setLatLng(appState.userPos);appState.userMarker.setIcon(createArrowIcon(appState.currentBearing))}if(!appState.gpsCentered){appState.gpsCentered=true;map.setView(appState.userPos,CONFIG.defaultZoom)}if(appState.navigationActive){debouncedSetView(appState.userPos);rotateMap(appState.currentBearing);checkRouteProximity(lat,lng);checkSpeedCameras(lat,lng,appState.currentSpeed);updateRouteStrip(lat,lng)}document.getElementById('scCurrent').textContent=Math.round(appState.currentSpeed);document.getElementById('sbTime').textContent=new Date().getHours().toString().padStart(2,'0')+':'+new Date().getMinutes().toString().padStart(2,'0');if(appState.navigationActive&&now-lastGeoTime>30000){lastGeoTime=now;reverseGeocode(lat,lng)}},err=>{console.log("GPS:",err);if(!appState.gpsCentered){appState.gpsCentered=true;map.setView([50.06,19.94],15)}},CONFIG.gpsOptions);
let lastGeoTime=0;function reverseGeocode(lat,lng){fetch(CONFIG.nominatimUrl+'?format=json&lat='+lat+'&lon='+lng+'&zoom=18&addressdetails=1').then(r=>r.json()).then(data=>{if(data&&data.address){const street=data.address.road||data.address.pedestrian||'';const num=data.address.house_number||'';if(street)document.getElementById('topStreet').textContent=street+(num?' '+num:'')}}).catch(()=>{})}
function checkRouteProximity(lat,lng){if(!appState.routeInstructions.length)return;let bestIdx=appState.instructionIndex,bestD=Infinity;for(let i=appState.instructionIndex;i<appState.routeInstructions.length;i++){const d=haversine(lat,lng,appState.routeInstructions[i].lat,appState.routeInstructions[i].lng);if(d<bestD){bestD=d;bestIdx=i}}if(bestIdx>appState.instructionIndex)appState.instructionIndex=bestIdx;const inst=appState.routeInstructions[appState.instructionIndex];if(!inst)return;const dist=haversine(lat,lng,inst.lat,inst.lng),distStr=fmtDist(dist);let remain=0;for(let i=appState.instructionIndex;i<appState.routeInstructions.length-1;i++){remain+=haversine(appState.routeInstructions[i].lat,appState.routeInstructions[i].lng,appState.routeInstructions[i+1].lat,appState.routeInstructions[i+1].lng)}remain+=dist;let etaMin=0,etaStr='—:—';if(appState.currentSpeed>2){etaMin=(remain/appState.currentSpeed)*60;etaStr=fmtArrival(etaMin)}const isLast=inst.text==='Dotrzyj do celu';document.getElementById('topArrow').textContent=bearingToArrow(inst.bearing||0);const distParts=distStr.match(/^([\d,.]+)\s*(.*)$/)||[distStr,distStr,''];document.getElementById('topDistNum').textContent=distParts[1];document.getElementById('topDistUnit').textContent=distParts[2];document.getElementById('topStreet').textContent=inst.text||'—';document.getElementById('topBar').classList.add('show');if(appState.instructionIndex+1<appState.routeInstructions.length){const nxt=appState.routeInstructions[appState.instructionIndex+1],nxtDist=haversine(lat,lng,nxt.lat,nxt.lng);document.getElementById('ntArrow').textContent=bearingToArrow(nxt.bearing||0);document.getElementById('ntDist').textContent=fmtDist(nxtDist);document.getElementById('ntText').textContent=nxt.text;document.getElementById('nextTurnHint').classList.add('show')}else document.getElementById('nextTurnHint').classList.remove('show');document.getElementById('statDist').textContent=fmtDist(remain);document.getElementById('statDur').textContent=fmtDuration(etaMin);document.getElementById('speedBar').classList.add('show');document.getElementById('rightSidebar').classList.add('show');document.getElementById('sbDist').textContent=fmtDist(remain);document.getElementById('speedCluster').classList.add('show');for(let i=appState.instructionIndex;i<appState.routeInstructions.length;i++){const ri=appState.routeInstructions[i],riDist=haversine(lat,lng,ri.lat,ri.lng);if(riDist<=CONFIG.preNotifyRange&&riDist>CONFIG.cameraNearRange&&ri.index!==appState.instructionIndex&&!appState.spoken500m.has(i)){appState.spoken500m.add(i);speak(ri.text==='Dotrzyj do celu'?'Za 500 metrów dotrzesz do celu: '+(appState.destinationName||'cel'):'Za 500 metrów, '+ri.text)}}if(appState.nearestCameraDistance<=CONFIG.preNotifyRange&&appState.nearestCameraDistance>CONFIG.cameraNearRange){for(const cam of routeCameras){const d=haversine(lat,lng,cam.lat,cam.lng);if(Math.abs(d-appState.nearestCameraDistance)<0.001&&!appState.spokenCameras500m.has(cam.name)){appState.spokenCameras500m.add(cam.name);speak('Uwaga, za 500 metrów fotoradar, '+cam.limit+' kilometrów na godzinę');break}}}if(appState.instructionIndex!==appState.lastSpokenIdx){appState.lastSpokenIdx=appState.instructionIndex;speak(isLast?'Za '+distStr+' dotrzesz do celu: '+(appState.destinationName||'cel'):'Za '+distStr+', '+inst.text)}}
function checkRouteProximity(lat,lng){if(!appState.routeInstructions.length)return;let bestIdx=appState.instructionIndex,bestD=Infinity;for(let i=appState.instructionIndex;i<appState.routeInstructions.length;i++){const d=haversine(lat,lng,appState.routeInstructions[i].lat,appState.routeInstructions[i].lng);if(d<bestD){bestD=d;bestIdx=i}}if(bestIdx>appState.instructionIndex)appState.instructionIndex=bestIdx;const inst=appState.routeInstructions[appState.instructionIndex];if(!inst)return;const dist=haversine(lat,lng,inst.lat,inst.lng),distStr=fmtDist(dist);let remain=0;for(let i=appState.instructionIndex;i<appState.routeInstructions.length-1;i++){remain+=haversine(appState.routeInstructions[i].lat,appState.routeInstructions[i].lng,appState.routeInstructions[i+1].lat,appState.routeInstructions[i+1].lng)}remain+=dist;let etaMin=0,etaStr='—:—';if(appState.currentSpeed>2){etaMin=(remain/appState.currentSpeed)*60;etaStr=fmtArrival(etaMin)}const isLast=inst.text==='Dotrzyj do celu';document.getElementById('topArrow').textContent=bearingToArrow(inst.bearing||0);const distParts=distStr.match(/^([\d,.]+)\s*(.*)$/)||[distStr,distStr,''];document.getElementById('topDistNum').textContent=distParts[1];document.getElementById('topDistUnit').textContent=distParts[2];document.getElementById('topStreet').textContent=inst.text||'—';document.getElementById('topBar').classList.add('show');if(appState.instructionIndex+1<appState.routeInstructions.length){const nxt=appState.routeInstructions[appState.instructionIndex+1],nxtDist=haversine(lat,lng,nxt.lat,nxt.lng);document.getElementById('ntArrow').textContent=bearingToArrow(nxt.bearing||0);document.getElementById('ntDist').textContent=fmtDist(nxtDist);document.getElementById('ntText').textContent=nxt.text;document.getElementById('nextTurnHint').classList.add('show')}else document.getElementById('nextTurnHint').classList.remove('show');document.getElementById('statDist').textContent=fmtDist(remain);document.getElementById('statDur').textContent=fmtDuration(etaMin);document.getElementById('statArrival').textContent=etaStr;document.getElementById('speedBar').classList.add('show');document.getElementById('rightSidebar').classList.add('show');document.getElementById('sbDist').textContent=fmtDist(remain);document.getElementById('speedCluster').classList.add('show');for(let i=appState.instructionIndex;i<appState.routeInstructions.length;i++){const ri=appState.routeInstructions[i],riDist=haversine(lat,lng,ri.lat,ri.lng);if(riDist<=CONFIG.preNotifyRange&&riDist>CONFIG.cameraNearRange&&ri.index!==appState.instructionIndex&&!appState.spoken500m.has(i)){appState.spoken500m.add(i);speak(ri.text==='Dotrzyj do celu'?'Za 500 metrów dotrzesz do celu: '+(appState.destinationName||'cel'):'Za 500 metrów, '+ri.text)}}if(appState.nearestCameraDistance<=CONFIG.preNotifyRange&&appState.nearestCameraDistance>CONFIG.cameraNearRange){for(const cam of routeCameras){const d=haversine(lat,lng,cam.lat,cam.lng);if(Math.abs(d-appState.nearestCameraDistance)<0.001&&!appState.spokenCameras500m.has(cam.name)){appState.spokenCameras500m.add(cam.name);speak('Uwaga, za 500 metrów fotoradar, '+cam.limit+' kilometrów na godzinę');break}}}if(appState.instructionIndex!==appState.lastSpokenIdx){appState.lastSpokenIdx=appState.instructionIndex;speak(isLast?'Za '+distStr+' dotrzesz do celu: '+(appState.destinationName||'cel'):'Za '+distStr+', '+inst.text)}}
function startNav() {
    const q = document.getElementById('dest').value;
    if (!q) return alert("Wpisz cel podróży");
    if (!appState.userPos) return alert("Oczekiwanie na GPS…");
    showLoading('Wyznaczanie trasy...');

    // If a destination is already selected from autocomplete, use it
    if (appState.destination && appState.destinationName) {
        drawRoute();
        return;
    }

    // Otherwise, search for the entered query
    fetch(`${CONFIG.nominatimUrl}?format=json&q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => {
            if (!data.length) {
                hideLoading();
                return alert("Nie znaleziono");
            }
            appState.destination = L.latLng(data[0].lat, data[0].lon);
            appState.destinationName = data[0].display_name.split(',')[0] || q;
            drawRoute();
        })
        .catch(() => {
            hideLoading();
            alert("Błąd połączenia");
        });
}
async function loadExternalData() {
    if (window.speedCameras && window.fallbackPOIs) return; // Already loaded
    try {
        const [camRes, poiRes] = await Promise.all([
            fetch('data/speed_cameras.json'),
            fetch('data/fallback_pois.json')
        ]);
        window.speedCameras = await camRes.json();
        window.fallbackPOIs = await poiRes.json();
    } catch (e) {
        console.error("Failed to load POI data", e);
        window.speedCameras = [];
        window.fallbackPOIs = [];
    }
}

async function drawRoute() {
    if (appState.routeLine) { map.removeLayer(appState.routeLine); appState.routeLine = null; }
    const exclude = [];
    if (settings.avoidTolls) exclude.push('toll');
    if (settings.avoidFerries) exclude.push('ferry');
    if (settings.avoidHighways) exclude.push('motorway');
    const coords = `${appState.userPos.lng},${appState.userPos.lat};${appState.destination.lng},${appState.destination.lat}`;
    let url = `${CONFIG.osrmUrl}/${coords}?overview=full&geometries=geojson&steps=true&annotations=true&alternatives=true`;
    if (exclude.length) url += `&exclude=${exclude.join(',')}`;
    if (settings.routeType === 'short' || settings.routeType === 'eco') url += '&weight=shortest';

    try {
        const response = await fetch(url);
        const data = await response.json();
        hideLoading();
        if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
            return alert("Nie udało się wyznaczyć trasy. Spróbuj ponownie lub zmień cel.");
        }
        
        appState.alternativeRoutes = data.routes;
        displayRouteChoices(data.routes);
    } catch (error) {
        hideLoading();
        alert("Błąd połączenia z serwerem tras");
    }
}
function extractInstructionsFromSteps(osrmRoute) {
    appState.routeInstructions = [];
    if (!osrmRoute.legs || !osrmRoute.legs.length) return;
    const leg = osrmRoute.legs[0];
    if (!leg.steps) return;

    const maneuverMap = {
        'turn': (mod, name) => `Skręć ${mod.includes('left') ? 'w lewo' : 'w prawo'}${name ? ' w ' + name : ''}`,
        'new name': (mod, name) => name || 'Kontynuuj prosto',
        'continue': (mod, name) => name || 'Kontynuuj prosto',
        'depart': (mod, name, bearing) => `Kieruj się ${bearingName(bearing || 0)}`,
        'arrive': () => 'Dotrzyj do celu',
        'roundabout': (mod, name) => `Wjedź na rondo${name ? ' i jedź ' + name : ''}`,
    };

    for (const step of leg.steps) {
        if (step.maneuver && step.maneuver.location) {
            const { location, modifier = '', type = '', bearing_after = 0 } = step.maneuver;
            const [lng, lat] = location;
            const name = step.name || '';
            let text = name;

            if (maneuverMap[type]) {
                text = maneuverMap[type](modifier, name, bearing_after);
            } else if (modifier.includes('left') || modifier.includes('right')) {
                 text = `Skręć ${modifier.includes('left') ? 'w lewo' : 'w prawo'}${name ? ' w ' + name : ''}`;
            }

            const instruction = { lat, lng, bearing: bearing_after, text, index: Math.round((step.geometry?.coordinates.length || 0) / 2) };

            const lastIntersection = step.intersections?.[step.intersections.length - 1];
            if (lastIntersection && lastIntersection.lanes) {
                instruction.lanes = lastIntersection.lanes;
            }
            appState.routeInstructions.push(instruction);
        }
    }
    if (!appState.routeInstructions.length || appState.routeInstructions[appState.routeInstructions.length - 1].text !== 'Dotrzyj do celu') {
        const last = appState.routeCoords[appState.routeCoords.length - 1];
        appState.routeInstructions.push({ lat: last.lat, lng: last.lng, bearing: 0, text: 'Dotrzyj do celu', index: appState.routeCoords.length - 1 });
    }
}

async function reroute() {
    showLoading('Przeliczanie trasy...');

    // Clear old route visuals but keep destination
    if (appState.routeLine) map.removeLayer(appState.routeLine);
    appState.alternativeRouteLines.forEach(line => map.removeLayer(line));
    Object.assign(appState, {
        routeLine: null,
        alternativeRouteLines: [],
        alternativeRoutes: [],
        routeInstructions: [],
        instructionIndex: 0,
        lastSpokenIdx: -1
    });

    const exclude = [];
    if (settings.avoidTolls) exclude.push('toll');
    if (settings.avoidFerries) exclude.push('ferry');
    if (settings.avoidHighways) exclude.push('motorway');
    const coords = `${appState.userPos.lng},${appState.userPos.lat};${appState.destination.lng},${appState.destination.lat}`;
    let url = `${CONFIG.osrmUrl}/${coords}?overview=full&geometries=geojson&steps=true&annotations=true&alternatives=false`; // No alternatives on reroute
    if (exclude.length) url += `&exclude=${exclude.join(',')}`;
    if (settings.routeType === 'short' || settings.routeType === 'eco') url += '&weight=shortest';

    try {
        const response = await fetch(url);
        const data = await response.json();
        hideLoading();
        if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
            speak("Nie udało się przeliczyć trasy.");
            stopNav(); // Stop navigation if reroute fails
        } else {
            selectRoute(0, [data.routes[0]]); // Select the new primary route
        }
    } catch (error) {
        hideLoading();
        speak("Błąd połączenia. Nie można przeliczyć trasy.");
    } finally {
        appState.isRerouting = false; // Allow next reroute check
    }
}

function renderLaneGuidance(lanes) {
    const laneBar = document.getElementById('laneBar');
    laneBar.innerHTML = '';
    if (!lanes || lanes.length === 0) {
        laneBar.style.display = 'none';
        return;
    }

    const laneMap = {
        'straight': '↑',
        'left': '←',
        'right': '→',
        'slight left': '↖',
        'slight right': '↗',
        'sharp left': '↩',
        'sharp right': '↪',
        'uturn': '↶'
    };

    lanes.forEach(lane => {
        const laneEl = createDOMElement('div', { className: 'lane' });
        if (lane.valid) {
            laneEl.classList.add('active');
        }
        const indications = lane.indications.map(ind => laneMap[ind] || ind).join('');
        laneEl.textContent = indications;
        laneBar.appendChild(laneEl);
    });

    laneBar.style.display = 'flex';
}

function displayRouteChoices(routes) {
    closeMainMenu();
    const choiceList = document.getElementById('routeChoiceList');
    choiceList.innerHTML = '';
    appState.alternativeRouteLines.forEach(line => map.removeLayer(line));
    appState.alternativeRouteLines = [];

    routes.forEach((route, index) => {
        const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const line = L.polyline(routeCoords, {
            color: index === 0 ? '#2979ff' : '#8a8a8a',
            weight: index === 0 ? 7 : 5,
            opacity: index === 0 ? 0.9 : 0.7
        }).addTo(map);
        appState.alternativeRouteLines.push(line);

        const card = createDOMElement('div', { className: 'rc-card', onclick: () => selectRoute(index) });
        if (index === 0) card.classList.add('active');
        
        const duration = fmtDuration(route.duration / 60);
        const distance = fmtDist(route.distance / 1000);
        card.innerHTML = `<div class="rc-duration">${duration}</div><div class="rc-distance">${distance}</div>`;
        choiceList.appendChild(card);
    });

    map.fitBounds(appState.alternativeRouteLines[0].getBounds(), { padding: [50, 50] });
    document.getElementById('routeChoicePanel').classList.add('show');
}

function selectRoute(routeIndex, routes = appState.alternativeRoutes) {
    document.getElementById('routeChoicePanel').classList.remove('show');
    
    appState.alternativeRouteLines.forEach((line, index) => {
        if (index !== routeIndex) {
            map.removeLayer(line);
        }
    });

    const selectedRoute = routes[routeIndex];
    appState.totalRouteDist = selectedRoute.distance / 1000;
    appState.routeCoords = selectedRoute.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));

    if (appState.routeLine) map.removeLayer(appState.routeLine);
    appState.routeLine = L.polyline(appState.routeCoords.map(c => [c.lat, c.lng]), { color: '#2979ff', weight: 6, opacity: 0.85 }).addTo(map);
    
    extractInstructionsFromSteps(selectedRoute);
    loadExternalData().then(() => {
        loadRouteCameras();
    });

    appState.navigationActive = true;
    if (!appState.isRerouting) { // Don't repeat "Navigation started" on reroute
        speak('Nawigacja uruchomiona. Kieruj się do ' + appState.destinationName);
    }
}

function cancelRouteChoice() {
    document.getElementById('routeChoicePanel').classList.remove('show');
    appState.alternativeRouteLines.forEach(line => map.removeLayer(line));
    appState.alternativeRouteLines = [];
    openMainMenu();
}

function stopNav(){Object.assign(appState,{destination:null,destinationName:'',navigationActive:false,isRerouting:false,routeInstructions:[],routeCoords:[],instructionIndex:0,lastSpokenIdx:-1,totalRouteDist:0,lastCameraSpoken:null,currentSpeedLimit:0,routePOIs:[],alternativeRoutes:[],spoken500m:new Set(),spokenCameras500m:new Set()});routeCameras=[];appState.poiMarkers.forEach(m=>map.removeLayer(m));appState.poiMarkers=[];if(appState.routeLine){map.removeLayer(appState.routeLine);appState.routeLine=null}appState.alternativeRouteLines.forEach(l=>map.removeLayer(l));appState.alternativeRouteLines=[];rotateMap(0);['topBar','speedBar','rightSidebar','speedCluster','cameraAlert','speedWarning','nextTurnHint','routeChoicePanel','laneBar'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('show')});document.getElementById('sbTrack').querySelectorAll('.sidebar-strip-marker').forEach(m=>m.remove());document.getElementById('sbProgress').style.height='0%';if(window.speechSynthesis.speaking)window.speechSynthesis.cancel();document.getElementById('voiceToast').classList.remove('show');document.getElementById('persistentMenu').style.display='flex';speak("Nawigacja zatrzymana")}

let favorites = [];
function loadFavorites() { try { favorites = JSON.parse(localStorage.getItem('naviFavorites')) || []; } catch (e) { favorites = []; } renderFavorites(); }
function saveFavorites() { try { localStorage.setItem('naviFavorites', JSON.stringify(favorites)); } catch (e) { console.error("Failed to save favorites:", e); } }
function addFavorite() {
    const destName = document.getElementById('dest').value;
    if (!destName) return alert('Wpisz nazwę miejsca, które chcesz dodać do ulubionych.');
    if (favorites.some(f => f.name === destName)) return alert('To miejsce jest już na liście ulubionych.');
    const name = prompt('Podaj nazwę dla tej lokalizacji (np. Dom, Praca):', destName.split(',')[0]);
    if (name) {
        favorites.push({ name, address: destName });
        saveFavorites();
        renderFavorites();
    }
}
function removeFavorite(address) {
    favorites = favorites.filter(f => f.address !== address);
    saveFavorites();
    renderFavorites();
}
function renderFavorites() {
    const listEl = document.getElementById('favoritesList');
    listEl.innerHTML = '';
    if (favorites.length === 0) {
        listEl.innerHTML = '<div class="fav-empty">Brak ulubionych miejsc.</div>';
        return;
    }
    favorites.forEach(fav => {
        const item = createDOMElement('div', { className: 'fav-item', onclick: () => { document.getElementById('dest').value = fav.address; startNav(); closeMainMenu(); } });
        const removeBtn = createDOMElement('button', { className: 'fav-remove', textContent: '✕', onclick: (e) => { e.stopPropagation(); removeFavorite(fav.address); } });
        item.append(createDOMElement('span', { textContent: fav.name }), removeBtn);
        listEl.appendChild(item);
    });
}

function toggleFavorites() {
    settings.favoritesCollapsed = !settings.favoritesCollapsed;
    document.querySelector('.mm-favorites').classList.toggle('collapsed', settings.favoritesCollapsed);
    saveSettings();
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

const searchResultsEl = document.getElementById('searchResults');
const destInput = document.getElementById('dest');

const handleSearchInput = debounce(async (query) => {
    if (query.length < 3) {
        searchResultsEl.innerHTML = '';
        searchResultsEl.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`${CONFIG.nominatimUrl}?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const results = await response.json();
        searchResultsEl.innerHTML = '';
        if (results.length > 0) {
            results.forEach(result => {
                const item = createDOMElement('div', {
                    className: 'search-result-item',
                    textContent: result.display_name,
                    onclick: () => selectSearchResult(result)
                });
                searchResultsEl.appendChild(item);
            });
            searchResultsEl.style.display = 'block';
        } else {
            searchResultsEl.style.display = 'none';
        }
    } catch (e) {
        console.error("Search error:", e);
        searchResultsEl.style.display = 'none';
    }
}, CONFIG.debounceMs);

function selectSearchResult(result) {
    destInput.value = result.display_name;
    appState.destination = L.latLng(result.lat, result.lon);
    appState.destinationName = result.display_name.split(',')[0];
    searchResultsEl.innerHTML = '';
    searchResultsEl.style.display = 'none';
}

destInput.addEventListener('input', (e) => {
    // Reset stored destination if user types again
    if (appState.destination) {
        appState.destination = null;
        appState.destinationName = '';
    }
    handleSearchInput(e.target.value);
});

function initApp() {
    if(!settings.isNightMode)document.body.classList.add('day-mode');
    document.getElementById('dayNightToggle').classList.toggle('on',settings.isNightMode);
    document.getElementById('voiceToggle').classList.toggle('on',settings.voiceEnabled);
    document.getElementById('mapTilesToggle').classList.toggle('on',settings.mapTilesEnabled);
    document.getElementById('trafficToggle').classList.toggle('on',settings.trafficEnabled);
    document.querySelector('.mm-favorites').classList.toggle('collapsed', settings.favoritesCollapsed);
    if(settings.trafficEnabled)toggleTraffic();
    openMainMenu();
    loadFavorites();
    if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})}
    let wakeLock=null;async function requestWakeLock(){try{wakeLock=await navigator.wakeLock.request('screen')}catch(e){}}
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&appState.navigationActive)requestWakeLock()});
    window.addEventListener('beforeunload',e=>{if(appState.navigationActive){e.preventDefault();e.returnValue=''}});
    let deferredPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e});
}