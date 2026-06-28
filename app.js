const CONFIG={
    osrmUrl:'https://router.project-osrm.org/route/v1/driving',
    nominatimUrl:'https://nominatim.openstreetmap.org/search',
    overpassUrl:'https://overpass-api.de/api/interpreter',
    hereApiKey: '', // <-- Wklej tutaj swój klucz HERE API
    weatherApiKey: '', // <-- Wklej tutaj swój klucz OpenWeatherMap API
    elevationApiUrl: 'https://api.open-elevation.com/api/v1/lookup',
    hereTrafficUrl: 'https://data.traffic.hereapi.com/v7/incidents',
    defaultZoom:16,gpsOptions:{enableHighAccuracy:true,maximumAge:10000,timeout:9000},gpsIntervalMs:10000,mapPanMs:1800,mapLookAheadKm:5,debounceMs:400,gpsMaxAccuracyM:80,gpsJumpSpeedKmh:230,passedManeuverKm:0.035,cameraAlertRange:0.5,cameraShowRange:2,cameraNearRange:0.03,preNotifyRange:0.5,rerouteThreshold: 0.075, elevationDownsample: 100, speedWarnCooldown:8000,speechResumeInterval:3000,autoNightStart:20,autoNightEnd:7,offRouteWarnCooldown:15000,routeChoiceOnlineExtras:false
};
const core = window.NaviCore;
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
    routeCumulativeDists: [],
    routeProgress: { percent: 0, doneKm: 0, remainingKm: 0, closestIndex: 0, distanceFromRoute: Infinity, snapped: null },
    lastSpokenIdx: -1,
    lastCameraSpoken: null,
    nearestCameraDistance: Infinity,
    isRerouting: false,
    alternativeRoutes: [],
    alternativeRouteLines: [],
    routePreviewPoiMarkers: [],
    selectedRouteData: null,
    routeLine: null,
    lastMapViewTime: 0,
    lastMapViewPos: null,
    routePOIs: [],
    poiMarkers: [],
    spoken500m: new Set(),
    spokenCameras500m: new Set(),
    currentSpeedLimit: 0,
    lastSpeedWarnSpoken: 0,
    trafficIncidents: [],
    speedLimits: [],
    routeWeather: [],
    userIncidents: [],
    tripStartTime: 0,
    tripHistorySaved: false,
    maxSpeed: 0,
    lastTrafficCheck: 0,
    offlineNavigation: false,
    lastOffRouteWarn: 0,
    gpsQuality: { accuracy: null, lastFix: 0, ignored: false },
    simulation: { active: false, timer: null, doneKm: 0, speedKmh: 70 },
};

let settings = { routeType: 'fast', cameraZoom: 16, speedAlertOver: 10, speedAlertEnabled: true, turnNotifyDistanceM: 500, cameraNotifyDistanceM: 500, voiceEnabled: true, isNightMode: true, carMode: false, mapTilesEnabled: true, trafficEnabled: false, favoritesCollapsed: false, searchHistoryCollapsed: false, poiFilters: {}, avoidTolls: false, avoidFerries: false, avoidHighways: false, avoidUnpaved: false };
function saveSettings(){try{localStorage.setItem('naviSettings',JSON.stringify(settings))}catch(e){console.error("Failed to save settings:", e)}}
function loadSettings(){try{const s=JSON.parse(localStorage.getItem('naviSettings'));if(s){Object.assign(settings, s)}}catch(e){console.error("Failed to load settings:", e)}}
loadSettings();
function calcBearing(lat1, lon1, lat2, lon2) { const dLon = (lon2 - lon1) * Math.PI / 180; const lat1Rad = lat1 * Math.PI / 180; const lat2Rad = lat2 * Math.PI / 180; const y = Math.sin(dLon) * Math.cos(lat2Rad); const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon); return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360; }
function calcSpeed(lat1, lon1, time1, lat2, lon2, time2) { const dist = haversine(lat1, lon1, lat2, lon2); const dt = (time2 - time1) / 1000; return dt < 0.5 ? 0 : dist / dt * 3600; }
function haversine(lat1, lon1, lat2, lon2) { return core.haversine(lat1, lon1, lat2, lon2); }
function fmtDist(km){return km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km'}
function fmtMeters(m){return m<1000?m+' m':(m/1000).toFixed(m%1000?1:0)+' km'}
function cameraZoom(){return Math.max(13,Math.min(18,parseInt(settings.cameraZoom,10)||CONFIG.defaultZoom))}
function turnNotifyKm(){return (settings.turnNotifyDistanceM||500)/1000}
function cameraNotifyKm(){return (settings.cameraNotifyDistanceM||500)/1000}
function fmtArrival(min){const d=new Date(Date.now()+min*60000);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function fmtDuration(min){const h=Math.floor(min/60);const m=Math.round(min%60);return h>0?h+'h '+m+'min':m+' min'}
function bearingName(b){const n=['na północ','na północny wschód','na wschód','na południowy wschód','na południe','na południowy zachód','na zachód','na północny zachód'];return n[Math.round(b/45)%8]}
const arrowChars=['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function bearingToArrow(b){return arrowChars[Math.round(b/45)%8]}
let displayedBearing=0;
function rotateMap(deg){
    let diff=deg-displayedBearing;if(diff>180)diff-=360;if(diff<-180)diff+=360;displayedBearing+=diff*0.25;if(displayedBearing>360)displayedBearing-=360;if(displayedBearing<0)displayedBearing+=360;
    document.getElementById('map').style.transform = `rotate(${-displayedBearing}deg) scale(1)`;
}
function isCarModeForced(){const p=new URLSearchParams(location.search);return p.get('car')==='1'||p.get('androidAuto')==='1'||p.get('aa')==='1'}
function isCarModeActive(){return settings.carMode||isCarModeForced()}
function applyCarMode(){const active=isCarModeActive();document.body.classList.toggle('car-mode',active);const toggle=document.getElementById('carModeToggle');if(toggle)toggle.classList.toggle('on',active)}
function toggleCarMode(){settings.carMode=!settings.carMode;applyCarMode();saveSettings();if(settings.carMode)speak('Tryb samochodowy włączony')}
function ensureCenterUserMarker(){let el=document.getElementById('centerUserMarker');if(!el){el=document.createElement('div');el.id='centerUserMarker';el.innerHTML='<svg class="center-user-arrow" viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" fill="#2979ff" stroke="white" stroke-width="3.5" opacity="0.96"/><polygon points="21,6 28,31 21,25 14,31" fill="white"/></svg>';document.body.appendChild(el)}return el}
function updateCenterUserMarker(show){const el=ensureCenterUserMarker();el.classList.toggle('show',!!show)}
function syncVoiceButtons(){const label=settings.voiceEnabled?'🔊':'🔇';const sb=document.getElementById('btnSound');const mb=document.getElementById('mobileBtnSound');if(sb)sb.textContent=label;if(mb)mb.textContent=label;const toggle=document.getElementById('voiceToggle');if(toggle)toggle.classList.toggle('on',settings.voiceEnabled)}
let speechUnlocked=false,availableVoices=[],audioCtx=null;
function refreshVoices(){try{availableVoices=window.speechSynthesis?window.speechSynthesis.getVoices():[]}catch(e){availableVoices=[]}}
function getPolishVoice(){refreshVoices();return availableVoices.find(v=>/^pl([-_]|$)/i.test(v.lang))||availableVoices.find(v=>/polski|polish/i.test(v.name))||null}
function unlockAudio(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;if(!audioCtx)audioCtx=new Ctx();if(audioCtx.state==='suspended')audioCtx.resume()}catch(e){}}
function playBeep(freq=880,duration=0.14){try{unlockAudio();if(!audioCtx)return;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0.001,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(0.18,audioCtx.currentTime+0.02);gain.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration+0.03)}catch(e){}}
function unlockSpeech(){if(speechUnlocked)return;try{unlockAudio();if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window))return;refreshVoices();window.speechSynthesis.resume();const u=new SpeechSynthesisUtterance(' ');u.lang='pl-PL';u.volume=0.01;u.rate=1;const voice=getPolishVoice();if(voice)u.voice=voice;window.speechSynthesis.speak(u);speechUnlocked=true}catch(e){}}
function showVoiceToast(text){const t=document.getElementById('voiceToast');if(!t)return;t.textContent=text;t.classList.add('show');return t}
function speak(text){if(!settings.voiceEnabled||!text)return;unlockSpeech();playBeep();if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){showVoiceToast('Głos niedostępny w tej przeglądarce');return}try{refreshVoices();window.speechSynthesis.resume();if(window.speechSynthesis.speaking||window.speechSynthesis.pending)window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='pl-PL';u.rate=0.98;u.volume=1;const voice=getPolishVoice();if(voice)u.voice=voice;const t=showVoiceToast(text);u.onend=u.onerror=()=>{if(t)t.classList.remove('show')};window.speechSynthesis.speak(u)}catch(e){showVoiceToast('Nie udało się odtworzyć głosu')}}
function toggleVoice(){settings.voiceEnabled=!settings.voiceEnabled;syncVoiceButtons();saveSettings();if(settings.voiceEnabled){unlockSpeech();speak('Dźwięk włączony')}}
function testMobileSound(){settings.voiceEnabled=true;syncVoiceButtons();saveSettings();unlockSpeech();playBeep(660,0.12);speak('Test dźwięku. Powiadomienia głosowe działają.')}
if(window.speechSynthesis){refreshVoices();window.speechSynthesis.onvoiceschanged=refreshVoices}
document.addEventListener('touchstart',unlockSpeech,{once:true,passive:true});document.addEventListener('click',unlockSpeech,{once:true});document.addEventListener('pointerdown',unlockAudio,{once:true,passive:true});
setInterval(()=>{try{if(window.speechSynthesis&&!window.speechSynthesis.speaking)window.speechSynthesis.resume()}catch(e){}},CONFIG.speechResumeInterval);
let mapTilesLayer=null;
function removeOnlineMapLayers(){
    if(mapTilesLayer){map.removeLayer(mapTilesLayer);mapTilesLayer=null}
    if(trafficLayer){map.removeLayer(trafficLayer);trafficLayer=null}
    if(trafficInterval){clearInterval(trafficInterval);trafficInterval=null}
}
function enterNavigationOfflineMode(){
    appState.offlineNavigation=true;
    removeOnlineMapLayers();
    document.getElementById('map').style.background=settings.isNightMode?'#111318':'#dde5ef';
}
function exitNavigationOfflineMode(){
    appState.offlineNavigation=false;
    if(settings.mapTilesEnabled)loadMapTiles();
    if(settings.trafficEnabled)updateTrafficLayerStyle();
}
function loadMapTiles(){if(!settings.mapTilesEnabled||appState.offlineNavigation)return;if(mapTilesLayer)map.removeLayer(mapTilesLayer);mapTilesLayer=settings.isNightMode?L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map):L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map)}
loadMapTiles();

let trafficLayer = null;
let trafficInterval = null;

function updateTrafficLayerStyle() {
    if (trafficLayer) {
        map.removeLayer(trafficLayer);
        trafficLayer = null;
        if (trafficInterval) clearInterval(trafficInterval);
        trafficInterval = null;
    }

    if (settings.trafficEnabled && !appState.offlineNavigation) {
        if (!CONFIG.hereApiKey) return; // Silently fail if no key
        const style = settings.isNightMode ? 'normal.night' : 'normal.day';
        trafficLayer = L.tileLayer(`https://{s}.traffic.maps.ls.hereapi.com/maptile/2.1/flowtile/newest/${style}/{z}/{x}/{y}/256/png8?apiKey=${CONFIG.hereApiKey}`, { subdomains: '1234', maxZoom: 20 });
        trafficLayer.addTo(map);
        trafficInterval = setInterval(() => trafficLayer.redraw(), 300000);
    }
}

function toggleTraffic() {
    settings.trafficEnabled = !settings.trafficEnabled;
    document.getElementById('trafficToggle').classList.toggle('on', settings.trafficEnabled);
    saveSettings();
    updateTrafficLayerStyle();
}
function toggleMapTiles(){settings.mapTilesEnabled=!settings.mapTilesEnabled;document.getElementById('mapTilesToggle').classList.toggle('on',settings.mapTilesEnabled);if(settings.mapTilesEnabled)loadMapTiles();else{if(mapTilesLayer){map.removeLayer(mapTilesLayer);mapTilesLayer=null}document.getElementById('map').style.background=settings.isNightMode?'#111318':'#dde5ef'}saveSettings()}

function toggleDayNight(){settings.isNightMode=!settings.isNightMode;document.body.classList.toggle('day-mode',!settings.isNightMode);document.getElementById('dayNightToggle').classList.toggle('on',settings.isNightMode);loadMapTiles();if(settings.trafficEnabled){updateTrafficLayerStyle()}if(!settings.mapTilesEnabled||appState.offlineNavigation)document.getElementById('map').style.background=settings.isNightMode?'#111318':'#dde5ef';saveSettings()}
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

function readStoredJson(key){try{return JSON.parse(localStorage.getItem(key))}catch(e){return null}}
function writeStoredJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){console.error("Failed to store JSON:",e);return false}}
function normalizeImportedList(data){return Array.isArray(data)?data:(data&&Array.isArray(data.items)?data.items:[])}

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

    const cameraSection = createDOMElement('div', { className: 'ss-section' });
    cameraSection.append(createDOMElement('h4', { textContent: 'Kamera' }));
    const cameraRow = createDOMElement('div', { className: 'ss-row ss-row-stack' });
    const cameraTop = createDOMElement('div', { className: 'ss-row-top' });
    const cameraVal = createDOMElement('b', { textContent: `Zoom ${cameraZoom()}` });
    const cameraRange = createDOMElement('input', { className: 'camera-range', attributes: { type: 'range', min: '13', max: '18', value: cameraZoom() } });
    cameraRange.oninput = () => {
        settings.cameraZoom = parseInt(cameraRange.value, 10);
        cameraVal.textContent = `Zoom ${settings.cameraZoom}`;
        saveSettings();
        if(appState.userPos)map.setZoom(cameraZoom(),{animate:true});
    };
    const cameraHint = createDOMElement('div', { className: 'setting-hint', textContent: 'Niżej = bliżej auta, wyżej = większy widok trasy.' });
    cameraTop.append(createDOMElement('span', { textContent: 'Wysokość kamery' }), cameraVal);
    cameraRow.append(cameraTop, cameraRange, cameraHint);
    cameraSection.append(cameraRow);
    ssBody.append(cameraSection);

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

function openPoiSettings() {
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody = document.getElementById('ssBody');
    ssBody.innerHTML = '';
    document.getElementById('ssTitle').textContent = 'Filtrowanie POI';

    const poiSection = createDOMElement('div', { className: 'ss-section' });
    
    const uniquePoiTypes = [...new Set(Object.values(osmTypeMap).map(item => item.type))];

    uniquePoiTypes.forEach(type => {
        if (!settings.poiFilters.hasOwnProperty(type)) {
            settings.poiFilters[type] = true; // Default to true if not set
        }
        const item = createDOMElement('div', { className: 'avoid-item' });
        const label = createDOMElement('div', { className: 'ai-left', textContent: type.charAt(0).toUpperCase() + type.slice(1) });
        const toggle = createDOMElement('div', { className: `mm-toggle ${settings.poiFilters[type] ? 'on' : ''}` });
        toggle.onclick = () => {
            settings.poiFilters[type] = !settings.poiFilters[type];
            toggle.classList.toggle('on');
            saveSettings();
            clearRoutePreviewCache();
            renderPOIMarkers();
            if(appState.alternativeRoutes.length)renderRouteChoiceSummaries(appState.alternativeRoutes);
        };
        item.append(label, toggle);
        poiSection.appendChild(item);
    });
    ssBody.append(poiSection);
    document.getElementById('settingsSub').classList.add('open');
}

function openUserIncidentsPanel() {
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody = document.getElementById('ssBody');
    ssBody.innerHTML = '';
    document.getElementById('ssTitle').textContent = 'Moje zgłoszenia';

    const incidentSection = createDOMElement('div', { className: 'ss-section' });
    if (appState.userIncidents.length === 0) {
        incidentSection.innerHTML = '<div class="fav-empty">Brak zgłoszonych zdarzeń.</div>';
    } else {
        appState.userIncidents.forEach(incident => {
            const item = createDOMElement('div', { className: 'fav-item' });
            const label = createDOMElement('span', { textContent: `${incident.icon} ${incident.name}` });
            const deleteBtn = createDOMElement('button', { className: 'fav-remove', textContent: 'Usuń' });
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteUserIncident(incident.timestamp); };
            item.append(label, deleteBtn);
            incidentSection.appendChild(item);
        });
    }

    ssBody.append(incidentSection);
    document.getElementById('settingsSub').classList.add('open');
}

function openReportPanel() {
    document.getElementById('reportPanel').classList.add('show');
    document.getElementById('overlay').classList.add('show');
}

function closeReportPanel() {
    document.getElementById('reportPanel').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
}

function reportIncident(type) {
    if (!appState.userPos) {
        return alert("Brak sygnału GPS, nie można zgłosić zdarzenia.");
    }

    const incidentIcons = {
        camera: '📸',
        accident: '💥',
        traffic_jam: '🚗',
        road_works: '🚧'
    };

    const newIncident = {
        lat: appState.userPos.lat,
        lng: appState.userPos.lng,
        type: type,
        icon: incidentIcons[type] || '⚠️',
        name: `Zgłoszone: ${type}`,
        timestamp: Date.now()
    };
    const routeIncident=appState.routeCoords.length?withRouteDistance(newIncident):newIncident;

    appState.userIncidents.push(routeIncident);
    saveUserIncidents();
    clearRoutePreviewCache();
    renderPOIMarkers();
    closeReportPanel();
    speak("Dziękujemy za zgłoszenie.");
}
function deleteUserIncident(timestamp){
    appState.userIncidents=appState.userIncidents.filter(incident=>incident.timestamp!==timestamp);
    saveUserIncidents();
    clearRoutePreviewCache();
    renderPOIMarkers();
    openUserIncidentsPanel();
}

function openOfflineMaps() {
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody = document.getElementById('ssBody');
    ssBody.innerHTML = '';
    document.getElementById('ssTitle').textContent = 'Mapy offline';

    const section = createDOMElement('div', { className: 'ss-section' });
    section.append(createDOMElement('h4', { textContent: 'Dane lokalne' }));
    const stats = createDOMElement('div', { className: 'offline-stats', id: 'offlineStats', textContent: 'Sprawdzanie danych...' });
    const importCameras = createDOMElement('input', { className: 'hidden-file-input', attributes: { type: 'file', id: 'importCamerasInput', accept: 'application/json,.json' } });
    const importPois = createDOMElement('input', { className: 'hidden-file-input', attributes: { type: 'file', id: 'importPoisInput', accept: 'application/json,.json' } });
    importCameras.onchange = e => importLocalDataFile(e.target.files[0], 'speedCameras');
    importPois.onchange = e => importLocalDataFile(e.target.files[0], 'fallbackPOIs');
    const importRow = createDOMElement('div', { className: 'offline-actions' });
    const importCamBtn = createDOMElement('button', { className: 'add-fav-btn', textContent: 'Importuj fotoradary' });
    importCamBtn.onclick = () => importCameras.click();
    const importPoiBtn = createDOMElement('button', { className: 'add-fav-btn', textContent: 'Importuj POI' });
    importPoiBtn.onclick = () => importPois.click();
    const resetImportBtn = createDOMElement('button', { className: 'add-fav-btn', textContent: 'Przywróć dane domyślne' });
    resetImportBtn.onclick = resetImportedData;
    importRow.append(importCamBtn, importPoiBtn, resetImportBtn);
    const downloadBtn = createDOMElement('button', { className: 'search-go', textContent: 'Pobierz widoczny obszar mapy' });
    downloadBtn.onclick = () => downloadOfflineArea();
    const clearBtn = createDOMElement('button', { className: 'add-fav-btn', textContent: 'Wyczyść cache kafelków' });
    clearBtn.onclick = () => clearTileCache();
    
    const progressContainer = createDOMElement('div', { id: 'offlineProgressContainer', style: 'margin-top: 15px; display: none;' });
    progressContainer.innerHTML = `
        <div id="offlineProgressLabel">Pobieranie...</div>
        <div style="background: #555; border-radius: 5px; padding: 2px; margin-top: 5px;">
            <div id="offlineProgressBar" style="width: 0%; height: 10px; background: var(--primary); border-radius: 3px; transition: width 0.2s;"></div>
        </div>
    `;

    section.append(stats, importCameras, importPois, importRow, downloadBtn, clearBtn, progressContainer);
    ssBody.append(section);
    document.getElementById('settingsSub').classList.add('open');
    refreshOfflineStats();
}

function importLocalDataFile(file,type){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
        try{
            const data=normalizeImportedList(JSON.parse(reader.result));
            if(!data.length)return alert('Plik nie zawiera listy punktów.');
            if(type==='speedCameras'){writeStoredJson('naviImportedSpeedCameras',data);window.speedCameras=data}
            else{writeStoredJson('naviImportedFallbackPOIs',data);window.fallbackPOIs=data}
            clearRoutePreviewCache();
            if(appState.routeCoords.length)loadRouteCameras();
            if(appState.alternativeRoutes.length)renderRouteChoiceSummaries(appState.alternativeRoutes);
            refreshOfflineStats();
        }catch(e){alert('Nie udało się odczytać pliku JSON.')}
    };
    reader.readAsText(file);
}

function resetImportedData(){
    localStorage.removeItem('naviImportedSpeedCameras');
    localStorage.removeItem('naviImportedFallbackPOIs');
    window.speedCameras=null;
    window.fallbackPOIs=null;
    clearRoutePreviewCache();
    loadExternalData(true).then(()=>{
        if(appState.routeCoords.length)loadRouteCameras();
        refreshOfflineStats();
    });
}

function refreshOfflineStats(){
    loadExternalData().then(()=>{
        const el=document.getElementById('offlineStats');
        if(!el)return;
        const cameraCount=(window.speedCameras||[]).length;
        const poiCount=(window.fallbackPOIs||[]).length;
        const incidentCount=appState.userIncidents.length;
        const regions=readStoredJson('naviOfflineRegions')||[];
        const importedCameras=!!localStorage.getItem('naviImportedSpeedCameras');
        const importedPois=!!localStorage.getItem('naviImportedFallbackPOIs');
        const regionHtml=regions.length?regions.slice(0,3).map(r=>`<div>${r.name}: <b>${r.tileCount}</b> kafelków</div>`).join(''):'<div>Brak zapisanych obszarów</div>';
        el.innerHTML=`<div>Fotoradary: <b>${cameraCount}</b>${importedCameras?' import':''}</div><div>POI: <b>${poiCount}</b>${importedPois?' import':''}</div><div>Moje zgłoszenia: <b>${incidentCount}</b></div><div id="tileCacheInfo">Cache kafelków: sprawdzanie...</div><div class="offline-regions">${regionHtml}</div>`;
        requestTileCacheInfo();
    });
}

function requestTileCacheInfo(){
    if(!navigator.serviceWorker||!navigator.serviceWorker.controller){const el=document.getElementById('tileCacheInfo');if(el)el.textContent='Cache kafelków: service worker nieaktywny';return}
    const requestId='cache-info-'+Date.now();
    const handler=(event)=>{
        if(event.data.action==='cache-info'&&event.data.requestId===requestId){
            const el=document.getElementById('tileCacheInfo');
            if(el)el.innerHTML=`Cache kafelków: <b>${event.data.tileCount}</b>`;
            navigator.serviceWorker.removeEventListener('message',handler);
        }
    };
    navigator.serviceWorker.addEventListener('message',handler);
    navigator.serviceWorker.controller.postMessage({action:'cache-info',requestId});
}

function clearTileCache(){
    if(!navigator.serviceWorker||!navigator.serviceWorker.controller)return alert('Service Worker nie jest aktywny.');
    if(!confirm('Wyczyścić pobrane kafelki map offline?'))return;
    const requestId='clear-tiles-'+Date.now();
    const handler=(event)=>{
        if(event.data.action==='tiles-cleared'&&event.data.requestId===requestId){
            navigator.serviceWorker.removeEventListener('message',handler);
            refreshOfflineStats();
        }
    };
    navigator.serviceWorker.addEventListener('message',handler);
    navigator.serviceWorker.controller.postMessage({action:'clear-tiles',requestId});
}

async function downloadOfflineArea() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        return alert('Service Worker nie jest aktywny. Tryb offline nie jest dostępny.');
    }

    const bounds = map.getBounds();
    const minZoom = 10;
    const maxZoom = 17; // Be careful, higher zoom levels mean exponentially more tiles.
    const regionName = `Obszar_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}`;

    const progressContainer = document.getElementById('offlineProgressContainer');
    const progressBar = document.getElementById('offlineProgressBar');
    const progressLabel = document.getElementById('offlineProgressLabel');

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressLabel.textContent = `Przygotowywanie do pobrania: ${regionName}`;

    const tileUrls = [];
    for (let z = minZoom; z <= maxZoom; z++) {
        const minTile = latLonToTile(bounds.getNorthWest(), z);
        const maxTile = latLonToTile(bounds.getSouthEast(), z);

        for (let x = minTile.x; x <= maxTile.x; x++) {
            for (let y = minTile.y; y <= maxTile.y; y++) {
                // Add URLs for both day and night mode tiles
                tileUrls.push(`https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
                tileUrls.push(`https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);
            }
        }
    }

    progressLabel.textContent = `Pobieranie ${tileUrls.length / 2} kafelków...`;

    navigator.serviceWorker.controller.postMessage({
        action: 'cache-tiles',
        urls: tileUrls,
        regionName: regionName,
        meta: { minZoom, maxZoom, bounds: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() } }
    });

    // Listen for progress updates from the Service Worker
    const progressListener = (event) => {
        if (event.data.action === 'cache-progress' && event.data.regionName === regionName) {
            const progress = event.data.progress;
            progressBar.style.width = `${progress}%`;
            if (progress >= 100) {
                progressLabel.textContent = 'Pobieranie zakończone!';
                saveOfflineRegion(regionName,bounds,minZoom,maxZoom,tileUrls.length);
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 2000);
                navigator.serviceWorker.removeEventListener('message', progressListener);
            }
        }
    };
    navigator.serviceWorker.addEventListener('message', progressListener);
}

function saveOfflineRegion(regionName,bounds,minZoom,maxZoom,tileCount){
    const regions=readStoredJson('naviOfflineRegions')||[];
    regions.unshift({name:regionName,date:new Date().toISOString(),minZoom,maxZoom,tileCount,bounds:{north:bounds.getNorth(),south:bounds.getSouth(),east:bounds.getEast(),west:bounds.getWest()}});
    writeStoredJson('naviOfflineRegions',regions.slice(0,20));
    refreshOfflineStats();
}

function latLonToTile(latlon, zoom) {
    const latRad = latlon.lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor(n * ((latlon.lng + 180) / 360));
    const y = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);
    return { x, y, z: zoom };
}

function openSpeedSettings() {
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody = document.getElementById('ssBody');
    ssBody.innerHTML = '';
    document.getElementById('ssTitle').textContent = 'Powiadomienia';

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

    const distanceSection = createDOMElement('div', { className: 'ss-section' });
    distanceSection.append(createDOMElement('h4', { textContent: 'Odległości komunikatów' }));
    const distanceOptions=[200,300,500,800,1000,1500,2000];
    const makeDistanceRow=(label,key,testText)=>{
        const row=createDOMElement('div',{className:'ss-row ss-row-stack'});
        const top=createDOMElement('div',{className:'ss-row-top'});
        const value=createDOMElement('b',{textContent:fmtMeters(settings[key]||500)});
        const chips=createDOMElement('div',{className:'distance-chips'});
        distanceOptions.forEach(m=>{
            const chip=createDOMElement('button',{className:`distance-chip ${(settings[key]||500)===m?'active':''}`,textContent:fmtMeters(m)});
            chip.onclick=()=>{
                settings[key]=m;
                saveSettings();
                value.textContent=fmtMeters(m);
                chips.querySelectorAll('.distance-chip').forEach(c=>c.classList.remove('active'));
                chip.classList.add('active');
            };
            chips.append(chip);
        });
        const testBtn=createDOMElement('button',{className:'test-voice-btn',textContent:'Test głosu',onclick:()=>speak(testText(settings[key]||500))});
        top.append(createDOMElement('span',{textContent:label}),value);
        row.append(top,chips,testBtn);
        return row;
    };
    distanceSection.append(
        makeDistanceRow('Przypomnienie o skręcie','turnNotifyDistanceM',m=>'Za '+fmtMeters(m)+', skręć w prawo.'),
        makeDistanceRow('Ostrzeżenie o fotoradarze','cameraNotifyDistanceM',m=>'Uwaga, za '+fmtMeters(m)+' fotoradar.')
    );

    ssBody.append(section,distanceSection);
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
let routePreviewPoiCache=new WeakMap();
function distToRoute(lat,lng){return core.distToCoords(lat,lng,appState.routeCoords)}
function snapToRoute(lat,lng){return core.projectPointToRoute(lat,lng,appState.routeCoords,appState.routeCumulativeDists).snapped}
function distToCoords(lat,lng,coords){return core.distToCoords(lat,lng,coords)}
function snapToCoords(lat,lng,coords){return core.projectPointToRoute(lat,lng,coords).snapped}
function rebuildRouteMetrics(){const metrics=core.buildCumulativeDists(appState.routeCoords);appState.routeCumulativeDists=metrics.cumulative;if(metrics.total>0)appState.totalRouteDist=metrics.total}
function nearestRouteIndex(lat,lng,startIndex=0){return core.nearestRouteIndex(lat,lng,appState.routeCoords,startIndex)}
function projectGpsToRoute(lat,lng){if(appState.routeCumulativeDists.length!==appState.routeCoords.length)rebuildRouteMetrics();return core.projectPointToRoute(lat,lng,appState.routeCoords,appState.routeCumulativeDists)}
function clearRoutePreviewCache(){routePreviewPoiCache=new WeakMap()}
function withRouteDistance(poi,coords=appState.routeCoords,cumulative=appState.routeCumulativeDists){const p=core.projectPointToRoute(poi.lat,poi.lng,coords,cumulative);return{...poi,routeDoneKm:p.doneKm,snapped:p.snapped,distanceFromRoute:p.distanceFromRoute}}
function loadRouteCameras(){if(!appState.routeCoords.length)return;let minLat=90,maxLat=-90,minLng=180,maxLng=-180;for(const c of appState.routeCoords){if(c.lat<minLat)minLat=c.lat;if(c.lat>maxLat)maxLat=c.lat;if(c.lng<minLng)minLng=c.lng;if(c.lng>maxLng)maxLng=c.lng}const margin=0.05;routeCameras=(window.speedCameras||[]).filter(cam=>cam.lat>=minLat-margin&&cam.lat<=maxLat+margin&&cam.lng>=minLng-margin&&cam.lng<=maxLng+margin).map(cam=>withRouteDistance(cam)).filter(cam=>cam.distanceFromRoute<0.5);appState.userIncidents=appState.userIncidents.map(incident=>withRouteDistance(incident));loadOSMPOIs(minLat,maxLat,minLng,maxLng)}
const osmTypeMap={
    'brand_Orlen': { icon: 'OR', type: 'fuel', style: { backgroundColor: '#e11b22', color: 'white' } },
    'brand_Shell': { icon: 'SH', type: 'fuel', style: { backgroundColor: '#ffdd00', color: '#d90f17' } },
    'brand_BP': { icon: 'BP', type: 'fuel', style: { backgroundColor: '#009a3d', color: '#ffde00' } },
    'brand_Circle K': { icon: 'CK', type: 'fuel', style: { backgroundColor: '#d92d30', color: 'white' } },

    // Generic types
    'amenity_fuel':{icon:'⛽',type:'fuel'},
    amenity_parking:{icon:'🅿️',type:'parking'},
    amenity_restaurant:{icon:'🍽️',type:'restaurant'},
    amenity_cafe:{icon:'☕',type:'cafe'},
    amenity_hospital:{icon:'🏥',type:'danger'},
    amenity_pharmacy:{icon:'💊',type:'pharmacy'},
    'highway_speed_camera':{icon:'📸',type:'camera', isSpeedCamera: true},
    highway_construction:{icon:'🚧',type:'danger'},
    highway_traffic_signals:{icon:'🚦',type:'traffic'},
    'barrier_toll_booth':{icon:'💰',type:'danger'}
};
let fallbackPOIs = [];
function loadOSMPOIs(minLat,maxLat,minLng,maxLng){
    // Start with fallback POIs filtered by route proximity
    const poisOnRoute = (window.fallbackPOIs || []).map(p => withRouteDistance(p)).filter(p => p.distanceFromRoute < 0.5);
    appState.routePOIs = [...poisOnRoute];
    renderPOIMarkers();
}

function createPoiIcon(poi) {
    if (poi.style) {
        const style = `background-color:${poi.style.backgroundColor}; color:${poi.style.color}; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; border: 1px solid rgba(0,0,0,0.2);`;
        return L.divIcon({
            className: 'poi-brand-icon',
            html: `<div style="${style}">${poi.icon}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12]
        });
    }
    return L.divIcon({className:'',html:`<div style="font-size:22px;text-shadow:0 1px 4px rgba(0,0,0,0.5)">${poi.icon || '📸'}</div>`,iconSize:[24,24],iconAnchor:[12,12]});
}
function renderPOIMarkers(){
    appState.poiMarkers.forEach(m=>map.removeLayer(m));
    appState.poiMarkers=[];
    const renderedCoords = new Set();

    const allPois = [
        ...appState.routePOIs.filter(p => settings.poiFilters[p.type] !== false), 
        ...(settings.poiFilters['camera'] !== false ? routeCameras : []), 
        ...appState.userIncidents];

    for(const poi of allPois){
        const coordKey = `${poi.lat.toFixed(4)},${poi.lng.toFixed(4)}`;
        if (renderedCoords.has(coordKey)) continue;

        const snapped=poi.snapped||snapToRoute(poi.lat,poi.lng);
        const icon = createPoiIcon(poi);
        const m=L.marker([snapped.lat,snapped.lng],{icon}).addTo(map);
        const tooltipText = poi.limit ? `${poi.name} (${poi.limit} km/h)` : poi.name;
        m.bindTooltip(tooltipText,{permanent:false,direction:'top',offset:[0,-8]});
        appState.poiMarkers.push(m);
        renderedCoords.add(coordKey);
    }
}
function clearRoutePreviewMarkers(){appState.routePreviewPoiMarkers.forEach(m=>map.removeLayer(m));appState.routePreviewPoiMarkers=[]}
function renderRoutePreviewMarkers(route){
    clearRoutePreviewMarkers();
    if(!route||!route.geometry||!route.geometry.coordinates)return;
    const coords=route.geometry.coordinates.map(c=>({lat:c[1],lng:c[0]}));
    const previewPois=getRoutePreviewPois(route);
    const renderedCoords=new Set();
    for(const poi of previewPois){
        const coordKey=`${poi.lat.toFixed(4)},${poi.lng.toFixed(4)}`;
        if(renderedCoords.has(coordKey))continue;
        const snapped=poi.snapped||snapToCoords(poi.lat,poi.lng,coords);
        const marker=L.marker([snapped.lat,snapped.lng],{icon:createPoiIcon(poi),zIndexOffset:850}).addTo(map);
        marker.bindTooltip(poi.limit?`${poi.name} (${poi.limit} km/h)`:poi.name,{permanent:false,direction:'top',offset:[0,-8]});
        appState.routePreviewPoiMarkers.push(marker);
        renderedCoords.add(coordKey);
    }
}
function getRoutePreviewPois(route){
    if(!route||!route.geometry||!route.geometry.coordinates)return[];
    if(routePreviewPoiCache.has(route))return routePreviewPoiCache.get(route);
    const coords=route.geometry.coordinates.map(c=>({lat:c[1],lng:c[0]}));
    const metrics=core.buildCumulativeDists(coords);
    const pois=[
        ...(settings.poiFilters['camera']!==false?(window.speedCameras||[]):[]),
        ...(window.fallbackPOIs||[]).filter(p=>settings.poiFilters[p.type]!==false),
        ...appState.userIncidents
    ].map(p=>withRouteDistance(p,coords,metrics.cumulative))
     .filter(p=>p.distanceFromRoute<0.5)
     .sort((a,b)=>a.routeDoneKm-b.routeDoneKm);
    routePreviewPoiCache.set(route,pois);
    return pois;
}
function formatPoiSummary(summary){
    if(!summary.total)return'Brak punktów na trasie';
    const parts=[];
    if(summary.camera)parts.push('📸 '+summary.camera);
    if(summary.fuel)parts.push('⛽ '+summary.fuel);
    if(summary.parking)parts.push('🅿 '+summary.parking);
    if(summary.restaurant||summary.cafe)parts.push('🍽 '+((summary.restaurant||0)+(summary.cafe||0)));
    const rest=summary.total-parts.reduce((sum,part)=>sum+(parseInt(part.replace(/\D/g,''),10)||0),0);
    if(rest>0)parts.push('• '+rest);
    return parts.join('   ');
}
function renderRouteChoiceSummaries(routes){
    routes.forEach((route,index)=>{
        const el=document.getElementById('rcPoiSummary-'+index);
        if(!el)return;
        el.textContent=formatPoiSummary(core.summarizePois(getRoutePreviewPois(route)));
    });
}
function getPoiDistanceOnRoute(poi,coords,cumulative){
    if(typeof poi.routeDoneKm==='number'&&poi.snapped)return poi;
    const metrics=cumulative?{cumulative}:core.buildCumulativeDists(coords);
    const p=core.projectPointToRoute(poi.lat,poi.lng,coords,metrics.cumulative);
    return {...poi,routeDoneKm:p.doneKm,snapped:p.snapped,distanceFromRoute:p.distanceFromRoute};
}
function buildRoutePointItems(route){
    if(!route||!route.geometry||!route.geometry.coordinates)return[];
    const coords=route.geometry.coordinates.map(c=>({lat:c[1],lng:c[0]}));
    const metrics=core.buildCumulativeDists(coords);
    return getRoutePreviewPois(route).map(p=>getPoiDistanceOnRoute(p,coords,metrics.cumulative)).sort((a,b)=>a.routeDoneKm-b.routeDoneKm);
}
function buildActiveRoutePointItems(){
    if(!appState.routeCoords.length)return[];
    const pois=[
        ...(settings.poiFilters['camera']!==false?routeCameras:[]),
        ...appState.routePOIs.filter(p=>settings.poiFilters[p.type]!==false),
        ...appState.userIncidents
    ];
    return pois.map(p=>getPoiDistanceOnRoute(p,appState.routeCoords,appState.routeCumulativeDists)).sort((a,b)=>a.routeDoneKm-b.routeDoneKm);
}
function renderPointList(container,items){
    container.innerHTML='';
    if(!items.length){container.innerHTML='<div class="route-point-empty">Brak punktów na tej trasie.</div>';return}
    items.forEach(p=>{
        const row=createDOMElement('button',{className:'route-point-item'});
        const icon=createDOMElement('span',{className:'route-point-icon',textContent:p.icon||'•'});
        const name=createDOMElement('span',{className:'route-point-name',textContent:p.name||p.type||'Punkt'});
        const dist=createDOMElement('span',{className:'route-point-dist',textContent:fmtDist(p.routeDoneKm)});
        row.append(icon,name,dist);
        row.onclick=()=>{map.setView([p.snapped.lat,p.snapped.lng],Math.max(map.getZoom(),15),{animate:true});closeMainMenu();document.getElementById('settingsSub').classList.remove('open')};
        container.appendChild(row);
    });
}
function renderRouteChoicePointList(route){const el=document.getElementById('routePointList');if(el)renderPointList(el,buildRoutePointItems(route))}
function openRoutePointsPanel(){
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody=document.getElementById('ssBody');
    ssBody.innerHTML='';
    document.getElementById('ssTitle').textContent='Punkty na trasie';
    const section=createDOMElement('div',{className:'ss-section'});
    const list=createDOMElement('div',{className:'route-point-list'});
    section.append(list);
    ssBody.append(section);
    document.getElementById('settingsSub').classList.add('open');
    renderPointList(list,buildActiveRoutePointItems());
}
function openGpsDiagnostics(){
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody=document.getElementById('ssBody');
    ssBody.innerHTML='';
    document.getElementById('ssTitle').textContent='Diagnostyka GPS';
    const q=appState.gpsQuality;
    const lastFix=q.lastFix?Math.max(0,Math.round((Date.now()-q.lastFix)/1000))+' s temu':'brak';
    const rows=[
        ['Pozycja',appState.userPos?`${appState.userPos.lat.toFixed(5)}, ${appState.userPos.lng.toFixed(5)}`:'brak'],
        ['Dokładność',q.accuracy?Math.round(q.accuracy)+' m':'brak'],
        ['Ostatni sygnał',lastFix],
        ['Status',q.ignored?'odrzucony skok GPS':appState.userPos?'aktywny':'oczekiwanie'],
        ['Prędkość',Math.round(appState.currentSpeed)+' km/h'],
        ['Odchylenie od trasy',appState.navigationActive?fmtDist(appState.routeProgress.distanceFromRoute||0):'poza nawigacją'],
        ['Postęp trasy',appState.navigationActive?Math.round(appState.routeProgress.percent||0)+'%':'poza nawigacją']
    ];
    const section=createDOMElement('div',{className:'ss-section mobile-info-grid'});
    rows.forEach(([label,value])=>section.append(createDOMElement('div',{className:'info-row',innerHTML:`<span>${label}</span><b>${value}</b>`})));
    ssBody.append(section);
    document.getElementById('settingsSub').classList.add('open');
}
function readTripHistory(){return readStoredJson('naviTripHistory')||[]}
function saveTripHistoryEntry(entry){const history=readTripHistory();history.unshift(entry);writeStoredJson('naviTripHistory',history.slice(0,25))}
function openTripHistoryPanel(){
    document.getElementById('mainMenu').classList.remove('open');
    const ssBody=document.getElementById('ssBody');
    ssBody.innerHTML='';
    document.getElementById('ssTitle').textContent='Historia przejazdów';
    const history=readTripHistory();
    const section=createDOMElement('div',{className:'ss-section trip-history-list'});
    if(!history.length)section.innerHTML='<div class="fav-empty">Brak zapisanych przejazdów.</div>';
    history.forEach(trip=>{
        const when=new Date(trip.timestamp).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
        section.append(createDOMElement('div',{className:'trip-history-item',innerHTML:`<div><b>${trip.destination||'Cel'}</b><span>${when}</span></div><div><b>${trip.distance}</b><span>${trip.duration}</span></div><div><b>${trip.avgSpeed}</b><span>śr.</span></div>`}));
    });
    ssBody.append(section);
    document.getElementById('settingsSub').classList.add('open');
}
function checkSpeedCameras(lat,lng,speed){let minDist=Infinity,nearestCam=null;for(const cam of routeCameras){const d=haversine(lat,lng,cam.lat,cam.lng);if(d<minDist){minDist=d;nearestCam=cam}}const alert=document.getElementById('cameraAlert'),scRing=document.getElementById('scRing'),scLimit=document.getElementById('scLimit');appState.nearestCameraDistance=minDist;if(nearestCam&&minDist<CONFIG.cameraShowRange){appState.currentSpeedLimit=nearestCam.limit;document.getElementById('camDistText').textContent=fmtDist(minDist);document.getElementById('camSpeedText').textContent='Ograniczenie: '+nearestCam.limit+' km/h — '+nearestCam.name;scLimit.textContent=nearestCam.limit;scLimit.style.display='flex';if(minDist<=CONFIG.cameraAlertRange&&minDist>CONFIG.cameraNearRange){alert.classList.add('show');const camKey=nearestCam.name+Math.round(minDist*10);if(camKey!==appState.lastCameraSpoken){appState.lastCameraSpoken=camKey;speak('Uwaga, fotoradar, '+nearestCam.limit+' km/h, za '+fmtDist(minDist))}}else alert.classList.remove('show');if(settings.speedAlertEnabled&&speed>nearestCam.limit+settings.speedAlertOver){const now=Date.now();if(now-appState.lastSpeedWarnSpoken>CONFIG.speedWarnCooldown){appState.lastSpeedWarnSpoken=now;speak('Uwaga! Przekroczono prędkość o '+Math.round(speed-nearestCam.limit)+' kilometrów na godzinę!');document.getElementById('speedWarning').classList.add('show');setTimeout(()=>document.getElementById('speedWarning').classList.remove('show'),3000)}}}else{alert.classList.remove('show');appState.currentSpeedLimit=0;scLimit.textContent='—'}if(appState.currentSpeedLimit>0){if(speed>appState.currentSpeedLimit+settings.speedAlertOver)scRing.className='sc-ring over';else if(speed>appState.currentSpeedLimit)scRing.className='sc-ring warn';else scRing.className='sc-ring'}else scRing.className='sc-ring'}
function appendRouteStripMarker(track, distanceKm, lookAheadKm, className, content){if(distanceKm<0||distanceKm>lookAheadKm)return;const m=document.createElement('div');m.className='sidebar-strip-marker';m.style.top=(distanceKm/lookAheadKm)*track.clientHeight+'px';m.innerHTML='<div class="icon-dot '+className+'">'+content+'</div>';track.appendChild(m)}
function routeDistanceAhead(item, routeProgress){
    if(typeof item.routeDoneKm==='number')return item.routeDoneKm-routeProgress.doneKm;
    const p=projectGpsToRoute(item.lat,item.lng);
    if(p.closestIndex<routeProgress.closestIndex)return Infinity;
    return p.doneKm-routeProgress.doneKm;
}
function updateRouteStrip(){if(!appState.routeCoords.length||!appState.navigationActive)return;const track=document.getElementById('sbTrack'),progress=document.getElementById('sbProgress'),routeProgress=appState.routeProgress;const closestIdx=routeProgress.closestIndex||0;progress.style.height=routeProgress.percent+'%';track.querySelectorAll('.sidebar-strip-marker').forEach(m=>m.remove());const lookAhead=5;for(const inst of appState.routeInstructions){if(inst.text==='Dotrzyj do celu'||inst.index<closestIdx)continue;const instDist=Math.max(0,(appState.routeCumulativeDists[inst.index]||0)-routeProgress.doneKm);appendRouteStripMarker(track,instDist,lookAhead,'turn',bearingToArrow(inst.bearing||0))}if(settings.poiFilters['camera']!==false){for(const cam of routeCameras){appendRouteStripMarker(track,routeDistanceAhead(cam,routeProgress),lookAhead,'camera','📸')}}for(const poi of appState.routePOIs){if(settings.poiFilters[poi.type]===false)continue;appendRouteStripMarker(track,routeDistanceAhead(poi,routeProgress),lookAhead,poi.type,poi.icon||'•')}for(const incident of appState.userIncidents){appendRouteStripMarker(track,routeDistanceAhead(incident,routeProgress),lookAhead,incident.type||'danger',incident.icon||'⚠️')}}
function routePointAhead(progress, kmAhead){const target=(progress.doneKm||0)+kmAhead;return pointAtRouteDistance(target)}
function smoothSetView(pos){
    const now=Date.now();
    if(now-appState.lastMapViewTime<CONFIG.debounceMs)return;
    if(appState.lastMapViewPos&&haversine(pos.lat,pos.lng,appState.lastMapViewPos.lat,appState.lastMapViewPos.lng)<0.005)return;
    appState.lastMapViewTime=now;
    appState.lastMapViewPos=pos;
    map.invalidateSize({pan:false});
    map.setView(pos,cameraZoom(),{animate:true,duration:CONFIG.mapPanMs/1000,easeLinearity:0.25})
}
function isGpsFixUsable(lat,lng,accuracy,now){
    if(accuracy&&accuracy>CONFIG.gpsMaxAccuracyM&&appState.lastLat!==null)return false;
    if(appState.lastLat===null||appState.lastLng===null||appState.lastTime===null)return true;
    const dt=Math.max(0.001,(now-appState.lastTime)/1000);
    const jumpSpeed=haversine(appState.lastLat,appState.lastLng,lat,lng)/dt*3600;
    return jumpSpeed<=CONFIG.gpsJumpSpeedKmh||accuracy<=25;
}
function updateGpsQuality(accuracy,ignored){appState.gpsQuality={accuracy:accuracy||null,lastFix:Date.now(),ignored:!!ignored};const limit=document.getElementById('scLimit');if(!appState.currentSpeedLimit&&limit){limit.textContent=ignored?'GPS?':accuracy?Math.round(accuracy)+'m':'—'}}
function processGpsPosition(pos){
    const lat=pos.coords.latitude,lng=pos.coords.longitude,heading=pos.coords.heading,accuracy=pos.coords.accuracy,now=Date.now();
    if(!isGpsFixUsable(lat,lng,accuracy,now)){updateGpsQuality(accuracy,true);return}
    updateGpsQuality(accuracy,false);
    appState.userPos=L.latLng(lat,lng);
    if(typeof pos.coords.speed==='number'&&!Number.isNaN(pos.coords.speed))appState.currentSpeed=Math.max(0,pos.coords.speed*3.6);
    if(appState.lastLat!==null&&appState.lastLng!==null&&appState.lastTime!==null){const dt=(now-appState.lastTime)/1000;if(dt>0.3){const b=calcBearing(appState.lastLat,appState.lastLng,lat,lng);const s=calcSpeed(appState.lastLat,appState.lastLng,appState.lastTime,lat,lng,now);if(typeof pos.coords.speed!=='number'||Number.isNaN(pos.coords.speed))appState.currentSpeed=s;if(appState.currentSpeed>1.5)appState.currentBearing=b;appState.lastLat=lat;appState.lastLng=lng;appState.lastTime=now}}else{appState.lastLat=lat;appState.lastLng=lng;appState.lastTime=now}
    appState.maxSpeed=Math.max(appState.maxSpeed,appState.currentSpeed||0);
    if(heading&&!isNaN(heading)&&heading!==0)appState.currentBearing=heading;
    if(appState.navigationActive)appState.routeProgress=projectGpsToRoute(lat,lng);
    const displayPos=appState.navigationActive?appState.routeProgress.snapped:appState.userPos;
    if(appState.navigationActive){
        if(appState.userMarker){map.removeLayer(appState.userMarker);appState.userMarker=null}
        updateCenterUserMarker(true);
    }else{
        updateCenterUserMarker(false);
        if(!appState.userMarker){appState.userMarker=L.marker(displayPos,{icon:createArrowIcon(appState.currentBearing),zIndexOffset:1000}).addTo(map)}else{appState.userMarker.setLatLng(displayPos);appState.userMarker.setIcon(createArrowIcon(appState.currentBearing))}
    }
    if(!appState.gpsCentered){appState.gpsCentered=true;map.invalidateSize({pan:false});map.setView(displayPos,cameraZoom())}
    if(appState.navigationActive){smoothSetView(displayPos);rotateMap(appState.currentBearing);checkRouteProximity(lat,lng);checkSpeedCameras(lat,lng,appState.currentSpeed);updateRouteStrip()}
    document.getElementById('scCurrent').textContent=Math.round(appState.currentSpeed);
    document.getElementById('sbTime').textContent=new Date().getHours().toString().padStart(2,'0')+':'+new Date().getMinutes().toString().padStart(2,'0')
}
function handleGpsError(err){console.log("GPS:",err);if(!appState.gpsCentered){appState.gpsCentered=true;map.setView([50.06,19.94],15)}}
function pollGps(){if(appState.simulation.active)return;navigator.geolocation.getCurrentPosition(processGpsPosition,handleGpsError,CONFIG.gpsOptions)}
pollGps();
setInterval(pollGps,CONFIG.gpsIntervalMs);
function pointAtRouteDistance(doneKm){
    if(!appState.routeCoords.length)return null;
    const total=appState.routeCumulativeDists[appState.routeCumulativeDists.length-1]||0;
    const target=Math.max(0,Math.min(doneKm,total));
    let low=1,high=appState.routeCumulativeDists.length-1;
    while(low<high){
        const mid=Math.floor((low+high)/2);
        if(appState.routeCumulativeDists[mid]>=target)high=mid;
        else low=mid+1;
    }
    const i=low;
    if(appState.routeCumulativeDists[i]>=target){
        const prev=appState.routeCoords[i-1],next=appState.routeCoords[i],seg=appState.routeCumulativeDists[i]-appState.routeCumulativeDists[i-1];
        const t=seg?((target-appState.routeCumulativeDists[i-1])/seg):0;
        return {lat:prev.lat+(next.lat-prev.lat)*t,lng:prev.lng+(next.lng-prev.lng)*t,bearing:calcBearing(prev.lat,prev.lng,next.lat,next.lng)};
    }
    const last=appState.routeCoords[appState.routeCoords.length-1];
    return {lat:last.lat,lng:last.lng,bearing:appState.currentBearing};
}
function updateSimulationButtons(){const label=document.getElementById('simulationMenuLabel'),btn=document.getElementById('btnSim');if(label)label.textContent=appState.simulation.active?'Zatrzymaj symulację':'Symuluj trasę';if(btn)btn.textContent=appState.simulation.active?'⏸':'▶'}
function startSimulation(){
    if(!appState.navigationActive||!appState.routeCoords.length)return alert('Najpierw uruchom trasę.');
    stopSimulation(false);
    appState.simulation.active=true;
    appState.simulation.doneKm=appState.routeProgress.doneKm||0;
    appState.lastLat=null;appState.lastLng=null;appState.lastTime=null;
    appState.simulation.timer=setInterval(()=>{
        appState.simulation.doneKm+=appState.simulation.speedKmh/3600;
        const p=pointAtRouteDistance(appState.simulation.doneKm);
        if(!p){stopSimulation();return}
        processGpsPosition({coords:{latitude:p.lat,longitude:p.lng,heading:p.bearing,accuracy:5,speed:appState.simulation.speedKmh/3.6}});
        if(appState.routeProgress.remainingKm<=CONFIG.cameraNearRange)stopSimulation(false);
    },1000);
    updateSimulationButtons();
    speak('Symulacja trasy uruchomiona.');
}
function stopSimulation(announce=true){if(appState.simulation.timer){clearInterval(appState.simulation.timer);appState.simulation.timer=null}const wasActive=appState.simulation.active;appState.simulation.active=false;updateSimulationButtons();if(announce&&wasActive)speak('Symulacja zatrzymana.')}
function toggleSimulation(){appState.simulation.active?stopSimulation():startSimulation()}
function advanceInstructionIndex(progress){while(appState.instructionIndex<appState.routeInstructions.length-1){const inst=appState.routeInstructions[appState.instructionIndex];const instDone=appState.routeCumulativeDists[inst.index]||0;if(progress.doneKm>instDone+CONFIG.passedManeuverKm||inst.index<progress.closestIndex)appState.instructionIndex++;else break}}
function checkRouteProximity(lat, lng) {
    if (!appState.navigationActive || appState.isRerouting) return;

    const progress = appState.routeProgress.snapped ? appState.routeProgress : projectGpsToRoute(lat, lng);
    appState.routeProgress = progress;
    const distanceFromRoute = progress.distanceFromRoute;
    if (distanceFromRoute > CONFIG.rerouteThreshold) {
        const now = Date.now();
        if (now - appState.lastOffRouteWarn > CONFIG.offRouteWarnCooldown) {
            appState.lastOffRouteWarn = now;
            speak("Zboczyłeś z trasy. Wróć do zaznaczonej trasy.");
        }
        return;
    }

    if (!appState.routeInstructions.length) return;
    advanceInstructionIndex(progress);
    const inst = appState.routeInstructions[appState.instructionIndex];
    if (!inst) return;

    // Update speed limit based on current position
    if (!appState.isRerouting) {
        updateCurrentSpeedLimit(lat, lng);
    }
    const instDone=appState.routeCumulativeDists[inst.index]||progress.doneKm;
    const dist = Math.max(0,instDone-progress.doneKm);
    const isLast = inst.text === 'Dotrzyj do celu';

    if (isLast && progress.remainingKm < CONFIG.cameraNearRange) {
        speak("Dotarłeś do celu: " + (appState.destinationName || 'cel'));
        showTripSummary();
        return;
    }
    const distStr = fmtDist(dist);
    let remain = progress.remainingKm;
    let etaMin = 0, etaStr = '—:—';
    if (appState.currentSpeed > 2) { etaMin = (remain / appState.currentSpeed) * 60; etaStr = fmtArrival(etaMin); }
    document.getElementById('topArrow').textContent = bearingToArrow(inst.bearing || 0);
    const distParts = distStr.match(/^([\d,.]+)\s*(.*)$/) || [distStr, distStr, ''];
    document.getElementById('topDistNum').textContent = distParts[1];
    document.getElementById('topDistUnit').textContent = distParts[2];
    document.getElementById('topStreet').textContent = inst.text || '—';

    const roadBadge = document.getElementById('topRoadBadge');
    const roadBadgeNum = document.getElementById('topRoadBadgeNum');
    if (inst.roadRef) {
        roadBadgeNum.textContent = inst.roadRef.split(';')[0]; // Take the first ref if multiple
        roadBadge.style.display = 'flex';
    } else {
        roadBadge.style.display = 'none';
    }
    renderLaneGuidance(inst.lanes);

    document.getElementById('topBar').classList.add('show');
    if (appState.instructionIndex + 1 < appState.routeInstructions.length) {
        const nxt = appState.routeInstructions[appState.instructionIndex + 1], nxtDist = Math.max(0,(appState.routeCumulativeDists[nxt.index]||progress.doneKm)-progress.doneKm);
        document.getElementById('ntArrow').textContent = bearingToArrow(nxt.bearing || 0);
        document.getElementById('ntDist').textContent = fmtDist(nxtDist);
        document.getElementById('ntText').textContent = nxt.text;
        document.getElementById('nextTurnHint').classList.add('show');
    } else document.getElementById('nextTurnHint').classList.remove('show');
    document.getElementById('statDist').textContent = fmtDist(remain);
    document.getElementById('statDur').textContent = fmtDuration(etaMin);
    document.getElementById('statArrival').textContent = etaStr;
    document.getElementById('speedBar').classList.add('show');
    document.getElementById('rightSidebar').classList.add('show');
    document.getElementById('mobileNavActions').classList.add('show');
    document.getElementById('sbDist').textContent = fmtDist(remain);
    document.getElementById('speedCluster').classList.add('show');
    const turnNotifyRange=turnNotifyKm(),cameraNotifyRange=cameraNotifyKm();
    for (let i = appState.instructionIndex; i < appState.routeInstructions.length; i++) {
        const ri = appState.routeInstructions[i], riDist = Math.max(0,(appState.routeCumulativeDists[ri.index]||progress.doneKm)-progress.doneKm);
        const isCurrentReminder=i===appState.instructionIndex;
        if(isCurrentReminder&&appState.lastSpokenIdx!==i)continue;
        if (riDist <= turnNotifyRange && riDist > CONFIG.cameraNearRange && !appState.spoken500m.has(i)) {
            appState.spoken500m.add(i);
            speak(ri.text === 'Dotrzyj do celu' ? 'Za '+fmtMeters(settings.turnNotifyDistanceM||500)+' dotrzesz do celu: ' + (appState.destinationName || 'cel') : 'Za '+fmtMeters(settings.turnNotifyDistanceM||500)+', ' + ri.text);
        }
    }
    if (appState.nearestCameraDistance <= cameraNotifyRange && appState.nearestCameraDistance > CONFIG.cameraNearRange) {
        for (const cam of routeCameras) {
            const d = haversine(lat, lng, cam.lat, cam.lng);
            if (Math.abs(d - appState.nearestCameraDistance) < 0.001 && !appState.spokenCameras500m.has(cam.name)) {
                appState.spokenCameras500m.add(cam.name);
                speak('Uwaga, za '+fmtMeters(settings.cameraNotifyDistanceM||500)+' fotoradar, ' + cam.limit + ' kilometrów na godzinę');
                break;
            }
        }
    }
    if (appState.instructionIndex !== appState.lastSpokenIdx) {
        appState.lastSpokenIdx = appState.instructionIndex;
        speak(isLast ? 'Za ' + distStr + ' dotrzesz do celu: ' + (appState.destinationName || 'cel') : 'Za ' + distStr + ', ' + inst.text);
    }
}
function startNav() {
    const q = document.getElementById('dest').value;
    if (!q) return alert("Wpisz cel podróży");
    if (!appState.userPos) return alert("Oczekiwanie na GPS…");
    showLoading('Wyznaczanie trasy...');

    addToSearchHistory(q);
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
async function loadExternalData(forceReload=false) {
    if(forceReload)clearRoutePreviewCache();
    if (!forceReload && window.speedCameras && window.fallbackPOIs) return; // Already loaded
    const importedCameras=readStoredJson('naviImportedSpeedCameras');
    const importedPois=readStoredJson('naviImportedFallbackPOIs');
    try {
        const [camData, poiData] = await Promise.all([
            importedCameras || fetch('speed_cameras.json').then(r=>r.json()),
            importedPois || fetch('fallback_pois.json').then(r=>r.json())
        ]);
        window.speedCameras = normalizeImportedList(camData);
        window.fallbackPOIs = normalizeImportedList(poiData);
        clearRoutePreviewCache();
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
        
        clearRoutePreviewCache();
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
        'arrive': () => 'Dotrzyj do celu',
        'roundabout': (mod, name) => `Wjedź na rondo${name ? ' i jedź ' + name : ''}`,
        'rotary': (mod, name) => `Wjedź na rondo${name ? ' i jedź ' + name : ''}`,
        'fork': (mod, name) => `Trzymaj się ${mod.includes('left') ? 'lewej' : 'prawej'} strony${name ? ' na ' + name : ''}`,
        'merge': (mod, name) => `Włącz się do ruchu${name ? ' na ' + name : ''}`,
        'end of road': (mod, name) => `Na końcu drogi skręć ${mod.includes('left') ? 'w lewo' : 'w prawo'}${name ? ' w ' + name : ''}`,
        'on ramp': (mod, name) => `Wjedź na zjazd${name ? ' w kierunku ' + name : ''}`,
        'off ramp': (mod, name) => `Zjedź z trasy${name ? ' w kierunku ' + name : ''}`,
    };
    const junctionTypes = new Set(['turn','roundabout','rotary','fork','merge','end of road','on ramp','off ramp','arrive']);
    const isJunctionManeuver = (type, modifier) => {
        if (!junctionTypes.has(type)) return false;
        if (type === 'turn' && (!modifier || modifier === 'straight')) return false;
        return true;
    };

    for (const step of leg.steps) {
        if (step.maneuver && step.maneuver.location) {
            const { location, modifier = '', type = '', bearing_after = 0 } = step.maneuver;
            if (!isJunctionManeuver(type, modifier)) continue;
            const [lng, lat] = location;
            const name = step.name || '';
            const ref = step.ref || '';
            let text = name;

            if (maneuverMap[type]) {
                text = maneuverMap[type](modifier, name, bearing_after);
            } else if (modifier.includes('left') || modifier.includes('right')) {
                 text = `Skręć ${modifier.includes('left') ? 'w lewo' : 'w prawo'}${name ? ' w ' + name : ''}`;
            }

            const prevInstruction = appState.routeInstructions[appState.routeInstructions.length - 1];
            const instruction = { lat, lng, bearing: bearing_after, text, roadRef: ref, index: nearestRouteIndex(lat, lng, prevInstruction ? prevInstruction.index : 0) };

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
    } else {
        appState.routeInstructions[appState.routeInstructions.length - 1].index = appState.routeCoords.length - 1;
    }
}

function updateCurrentSpeedLimit(lat, lng) {
    // Speed camera limits have priority
    if (appState.nearestCameraDistance < CONFIG.cameraShowRange) {
        return;
    }

    let closestLimit = null;
    let minD = Infinity;

    for (const segment of appState.speedLimits) {
        for (const node of segment.nodes) {
            const d = haversine(lat, lng, node.lat, node.lon);
            if (d < minD) {
                minD = d;
                closestLimit = segment.limit;
            }
        }
    }

    if (minD < 0.1) { // If we are close to a segment with a known limit
        appState.currentSpeedLimit = closestLimit;
    }
}

async function fetchTrafficIncidents() {
    appState.trafficIncidents = [];
}

async function reroute() {
    appState.isRerouting = false;
    speak("Przeliczanie trasy jest wyłączone. Jedź według zapisanej trasy.");
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

function getWeatherIcon(weatherId) {
    if (weatherId >= 200 && weatherId < 300) return '⛈️'; // Thunderstorm
    if (weatherId >= 300 && weatherId < 400) return '🌦️'; // Drizzle
    if (weatherId >= 500 && weatherId < 600) return '🌧️'; // Rain
    if (weatherId >= 600 && weatherId < 700) return '❄️'; // Snow
    if (weatherId >= 700 && weatherId < 800) return '🌫️'; // Atmosphere
    if (weatherId === 800) return '☀️'; // Clear
    if (weatherId > 800) return '☁️'; // Clouds
    return '';
}

async function fetchWeather(lat, lon) {
    if (appState.offlineNavigation || !CONFIG.routeChoiceOnlineExtras || !CONFIG.weatherApiKey) {
        console.log("Weather API key not set. Skipping weather fetch.");
        return;
    }
    const weatherEl = document.getElementById('rcWeather');
    weatherEl.textContent = 'Pobieranie pogody...';

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${CONFIG.weatherApiKey}&units=metric&lang=pl`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.cod !== 200) {
            weatherEl.textContent = 'Błąd pogody';
            return;
        }
        const icon = getWeatherIcon(data.weather[0].id);
        const temp = Math.round(data.main.temp);
        weatherEl.innerHTML = `${icon} ${temp}°C w ${data.name}`;
    } catch (e) {
        weatherEl.textContent = 'Błąd pogody';
        console.error("Failed to fetch weather:", e);
    }
}

function displayRouteChoices(routes) {
    closeMainMenu();
    const choiceList = document.getElementById('routeChoiceList');
    choiceList.innerHTML = '';
    clearRoutePreviewMarkers();
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
        card.onmouseenter=()=>{document.querySelectorAll('.rc-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');appState.alternativeRouteLines.forEach((l,i)=>l.setStyle({color:i===index?'#2979ff':'#8a8a8a',weight:i===index?7:5,opacity:i===index?0.9:0.7}));renderRoutePreviewMarkers(route);renderRouteChoicePointList(route)};
        
        const duration = fmtDuration(route.duration / 60);
        const distance = fmtDist(route.distance / 1000);
        card.innerHTML = `<div class="rc-info"><div class="rc-duration">${duration}</div><div class="rc-distance">${distance}</div></div><div class="rc-poi-summary" id="rcPoiSummary-${index}">Ładowanie punktów...</div>${CONFIG.routeChoiceOnlineExtras ? `<div class="rc-elevation-chart" id="elevation-chart-${index}"></div>` : ''}`;
        choiceList.appendChild(card);
        if (CONFIG.routeChoiceOnlineExtras) fetchElevationProfile(route, index);
    });

    if (CONFIG.routeChoiceOnlineExtras) fetchWeather(appState.destination.lat, appState.destination.lng);
    loadExternalData().then(()=>{if(document.getElementById('routeChoicePanel').classList.contains('show')&&appState.alternativeRoutes===routes){renderRoutePreviewMarkers(routes[0]);renderRouteChoiceSummaries(routes);renderRouteChoicePointList(routes[0])}});
    map.fitBounds(appState.alternativeRouteLines[0].getBounds(), { padding: [50, 50] });
    document.getElementById('routeChoicePanel').classList.add('show');
}

function downsampleRoute(coords, maxPoints) {
    if (coords.length <= maxPoints) return coords;
    const step = Math.floor(coords.length / maxPoints);
    return coords.filter((_, i) => i % step === 0);
}

async function fetchElevationProfile(route, index) {
    if (appState.offlineNavigation || !CONFIG.routeChoiceOnlineExtras) return;
    const chartContainer = document.getElementById(`elevation-chart-${index}`);
    if (!chartContainer) return;

    const downsampledCoords = downsampleRoute(route.geometry.coordinates, CONFIG.elevationDownsample);
    const locations = downsampledCoords.map(c => ({ latitude: c[1], longitude: c[0] }));

    try {
        const response = await fetch(CONFIG.elevationApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations })
        });
        const data = await response.json();
        if (data.results) {
            renderElevationChart(data.results.map(r => r.elevation), chartContainer);
        }
    } catch (e) {
        console.error("Failed to fetch elevation data:", e);
    }
}

function renderElevationChart(elevationData, container) {
    const width = container.clientWidth;
    const height = container.clientHeight || 50; // Default height
    const minElev = Math.min(...elevationData);
    const maxElev = Math.max(...elevationData);
    const elevRange = maxElev - minElev;

    const points = elevationData.map((el, i) => {
        const x = (i / (elevationData.length - 1)) * width;
        const y = height - ((el - minElev) / elevRange) * height;
        return `${x},${y}`;
    }).join(' ');

    const svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="elevationGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.1"/>
                </linearGradient>
            </defs>
            <polygon fill="url(#elevationGradient)" points="0,${height} ${points} ${width},${height}"/>
            <polyline fill="none" stroke="var(--primary)" stroke-width="2" points="${points}"/>
        </svg>
    `;
    container.innerHTML = svg;
}

function selectRoute(routeIndex, routes = appState.alternativeRoutes) {
    document.getElementById('routeChoicePanel').classList.remove('show');
    clearRoutePreviewMarkers();
    
    appState.alternativeRouteLines.forEach((line, index) => {
        if (index !== routeIndex) {
            map.removeLayer(line);
        }
    });

    const selectedRoute = routes[routeIndex];
    appState.selectedRouteData = selectedRoute;
    appState.totalRouteDist = selectedRoute.distance / 1000;
    appState.routeCoords = selectedRoute.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
    rebuildRouteMetrics();

    if (appState.routeLine) map.removeLayer(appState.routeLine);
    appState.routeLine = L.polyline(appState.routeCoords.map(c => [c.lat, c.lng]), { color: '#2979ff', weight: 6, opacity: 0.85 }).addTo(map);
    
    extractInstructionsFromSteps(selectedRoute);
    try {
        localStorage.setItem('naviLastRoute', JSON.stringify({
            destination: appState.destination,
            destinationName: appState.destinationName,
            routeData: selectedRoute
        }));
    } catch (e) {
        console.error("Failed to save route for offline navigation:", e);
    }
    enterNavigationOfflineMode();
    loadExternalData().then(() => {
        loadRouteCameras();
    });

    appState.tripStartTime = Date.now();
    appState.tripHistorySaved = false;
    appState.maxSpeed = 0;


    appState.navigationActive = true;
    if (!appState.isRerouting) { // Don't repeat "Navigation started" on reroute
        speak('Nawigacja uruchomiona. Kieruj się do ' + appState.destinationName);
    }
}

function cancelRouteChoice() {
    document.getElementById('routeChoicePanel').classList.remove('show');
    clearRoutePreviewMarkers();
    appState.alternativeRouteLines.forEach(line => map.removeLayer(line));
    appState.alternativeRouteLines = [];
    openMainMenu();
}

function showTripSummary() {
    const durationMs = Date.now() - appState.tripStartTime;
    const durationMin = durationMs / 60000;
    const distanceKm = appState.totalRouteDist;
    const avgSpeed = distanceKm > 0 && durationMin > 0 ? (distanceKm / (durationMin / 60)).toFixed(0) : 0;
    if(!appState.tripHistorySaved){
        appState.tripHistorySaved=true;
        saveTripHistoryEntry({
            timestamp:Date.now(),
            destination:appState.destinationName,
            distance:`${distanceKm.toFixed(1)} km`,
            duration:fmtDuration(durationMin),
            avgSpeed:`${avgSpeed} km/h`,
            maxSpeed:`${Math.round(appState.maxSpeed)} km/h`
        });
    }

    document.getElementById('tsDistance').textContent = `${distanceKm.toFixed(1)} km`;
    document.getElementById('tsDuration').textContent = fmtDuration(durationMin);
    document.getElementById('tsAvgSpeed').textContent = `${avgSpeed} km/h`;

    document.getElementById('tripSummaryPanel').classList.add('show');
    document.getElementById('overlay').classList.add('show');
}

function closeTripSummary() {
    document.getElementById('tripSummaryPanel').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
    stopNav();
}

function stopNav(){
    // Reset only navigation-related state, keep persistent user data like incidents
    stopSimulation(false);
    exitNavigationOfflineMode();
    Object.assign(appState,{destination:null,destinationName:'',navigationActive:false,isRerouting:false,routeInstructions:[],routeCoords:[],routeCumulativeDists:[],routeProgress:{percent:0,doneKm:0,remainingKm:0,closestIndex:0,distanceFromRoute:Infinity,snapped:null},instructionIndex:0,lastSpokenIdx:-1,totalRouteDist:0,lastCameraSpoken:null,currentSpeedLimit:0,routePOIs:[],alternativeRoutes:[],selectedRouteData:null,trafficIncidents:[],speedLimits:[],routeWeather:[],spoken500m:new Set(),spokenCameras500m:new Set(),tripStartTime:0,tripHistorySaved:false,maxSpeed:0,lastOffRouteWarn:0});
    routeCameras=[];updateCenterUserMarker(false);appState.poiMarkers.forEach(m=>map.removeLayer(m));appState.poiMarkers=[];clearRoutePreviewMarkers();clearRoutePreviewCache();if(appState.routeLine){map.removeLayer(appState.routeLine);appState.routeLine=null}appState.alternativeRouteLines.forEach(l=>map.removeLayer(l));appState.alternativeRouteLines=[];localStorage.removeItem('naviLastRoute');rotateMap(0);['topBar','speedBar','rightSidebar','mobileNavActions','speedCluster','cameraAlert','speedWarning','nextTurnHint','routeChoicePanel','laneBar','elevationChartContainer','reportPanel','tripSummaryPanel'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('show')});document.getElementById('sbTrack').querySelectorAll('.sidebar-strip-marker').forEach(m=>m.remove());document.getElementById('sbProgress').style.height='0%';if(window.speechSynthesis.speaking)window.speechSynthesis.cancel();document.getElementById('voiceToast').classList.remove('show');document.getElementById('persistentMenu').style.display='flex';speak("Nawigacja zatrzymana")
}

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

let searchHistory = [];
function loadSearchHistory() { try { searchHistory = JSON.parse(localStorage.getItem('naviSearchHistory')) || []; } catch (e) { searchHistory = []; } renderSearchHistory(); }
function saveSearchHistory() { try { localStorage.setItem('naviSearchHistory', JSON.stringify(searchHistory)); } catch (e) { console.error("Failed to save search history:", e); } }
function addToSearchHistory(query) {
    // Remove if already exists to move it to the top
    searchHistory = searchHistory.filter(item => item !== query);
    // Add to the beginning
    searchHistory.unshift(query);
    // Keep only the last 10 entries
    if (searchHistory.length > 10) {
        searchHistory.pop();
    }
    saveSearchHistory();
    renderSearchHistory();
}
function renderSearchHistory() {
    const listEl = document.getElementById('searchHistoryList');
    listEl.innerHTML = '';
    if (searchHistory.length === 0) {
        listEl.innerHTML = '<div class="fav-empty">Brak historii wyszukiwania.</div>';
        return;
    }
    searchHistory.forEach(query => {
        const item = createDOMElement('div', { className: 'fav-item', textContent: query, onclick: () => { document.getElementById('dest').value = query; startNav(); closeMainMenu(); } });
        listEl.appendChild(item);
    });
}
function toggleSearchHistory() { settings.searchHistoryCollapsed = !settings.searchHistoryCollapsed; document.getElementById('searchHistorySection').classList.toggle('collapsed', settings.searchHistoryCollapsed); saveSettings(); }

function loadUserIncidents() { try { appState.userIncidents = JSON.parse(localStorage.getItem('naviUserIncidents')) || []; } catch (e) { appState.userIncidents = []; } }
function saveUserIncidents() { try { localStorage.setItem('naviUserIncidents', JSON.stringify(appState.userIncidents)); } catch (e) { console.error("Failed to save user incidents:", e); } }

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
    if (appState.navigationActive && appState.offlineNavigation) {
        searchResultsEl.innerHTML = '';
        searchResultsEl.style.display = 'none';
        return;
    }
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

function resumeLastRoute(savedRoute) {
    appState.destination = L.latLng(savedRoute.destination.lat, savedRoute.destination.lng);
    appState.destinationName = savedRoute.destinationName;
    
    // Use a simplified selectRoute logic to restore state
    const selectedRoute = savedRoute.routeData;
    appState.selectedRouteData = selectedRoute;
    appState.totalRouteDist = selectedRoute.distance / 1000;
    appState.routeCoords = selectedRoute.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
    rebuildRouteMetrics();
    appState.routeLine = L.polyline(appState.routeCoords.map(c => [c.lat, c.lng]), { color: '#2979ff', weight: 6, opacity: 0.85 }).addTo(map);
    
    extractInstructionsFromSteps(selectedRoute);
    enterNavigationOfflineMode();
    loadExternalData().then(() => loadRouteCameras());

    appState.navigationActive = true;
    Object.assign(appState, { lastSpokenIdx: -1, instructionIndex: 0, spoken500m: new Set(), spokenCameras500m: new Set() });
    
    closeMainMenu();
    speak('Wznowiono nawigację do: ' + appState.destinationName);
}

function initApp() {
    if(!settings.isNightMode)document.body.classList.add('day-mode');
    document.getElementById('dayNightToggle').classList.toggle('on',settings.isNightMode);
    applyCarMode();
    syncVoiceButtons();
    document.getElementById('mapTilesToggle').classList.toggle('on',settings.mapTilesEnabled);
    document.getElementById('trafficToggle').classList.toggle('on',settings.trafficEnabled);
    document.querySelector('.mm-favorites').classList.toggle('collapsed', settings.favoritesCollapsed);
    document.getElementById('searchHistorySection').classList.toggle('collapsed', settings.searchHistoryCollapsed);
    if(settings.trafficEnabled)updateTrafficLayerStyle();

    const savedRouteRaw = localStorage.getItem('naviLastRoute');
    // Clear any incomplete offline downloads on startup
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.action === 'cache-progress') {
                 document.getElementById('offlineProgressBar').style.width = `${event.data.progress}%`;
            }
        });
    }
    if (savedRouteRaw) {
        try {
            const savedRoute = JSON.parse(savedRouteRaw);
            if (confirm(`Znaleziono niezakończoną trasę do: ${savedRoute.destinationName}. Czy chcesz ją wznowić?`)) {
                resumeLastRoute(savedRoute);
            } else {
                localStorage.removeItem('naviLastRoute');
                openMainMenu();
            }
        } catch (e) {
            localStorage.removeItem('naviLastRoute');
            openMainMenu();
        }
    } else {
        openMainMenu();
    }

    loadFavorites();
    loadSearchHistory();
    loadUserIncidents();
    if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})}
    let wakeLock=null;async function requestWakeLock(){try{wakeLock=await navigator.wakeLock.request('screen')}catch(e){}}
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&appState.navigationActive)requestWakeLock()});
    window.addEventListener('beforeunload',e=>{if(appState.navigationActive){e.preventDefault();e.returnValue=''}});
    let deferredPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e});
}
