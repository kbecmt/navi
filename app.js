const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const STORE_KEY = "simpleNaviRoute";
const SETTINGS_KEY = "simpleNaviSettings";
const SIM_MIN_MS = 25000;
const SIM_MAX_MS = 120000;
const SIM_MAX_SPEED_KMH = 100;
const MANEUVER_ZOOM_BEFORE_KM = 0.3;
const MANEUVER_ZOOM_AFTER_KM = 0.1;
const DEFAULT_MANEUVER_VIEW_RADIUS_KM = 1;
const MIN_RENDER_INTERVAL_MS = 900;
const GPS_RENDER_STEP_KM = 0.008;
const GPS_SPEED_RENDER_STEP_KMH = 5;
const NEARBY_ROAD_MAX_DISTANCE_KM = 0.5;

const state = {
  start: null,
  dest: null,
  route: null,
  cumulative: [],
  totalKm: 0,
  progressKm: 0,
  simulation: null,
  gpsWatch: null,
  lastGps: null,
  speedKmh: 0,
  currentLimit: null,
  lastSpeedAlertAt: 0,
  nextInstructionIndex: 0,
  lastSpokenInstruction: -1,
  lastRenderKey: "",
  renderTimer: null,
  lastRenderAt: 0,
  lastRenderedSpeedKmh: 0,
  cameraBearing: null,
  settings: {
    maneuverViewRadiusKm: DEFAULT_MANEUVER_VIEW_RADIUS_KM
  }
};

const el = {
  svg: document.getElementById("routeSvg"),
  vehicle: document.getElementById("vehicle"),
  status: document.getElementById("statusText"),
  speed: document.getElementById("speedText"),
  speedLimit: document.getElementById("speedLimitText"),
  distance: document.getElementById("distanceText"),
  progress: document.getElementById("progressText"),
  maneuverIcon: document.getElementById("maneuverIcon"),
  maneuverDistance: document.getElementById("maneuverDistance"),
  maneuverText: document.getElementById("maneuverText"),
  nextManeuverText: document.getElementById("nextManeuverText"),
  panel: document.getElementById("panel"),
  panelHandle: document.getElementById("panelHandle"),
  panelToggleBtn: document.getElementById("panelToggleBtn"),
  bottomSheetButton: document.getElementById("bottomSheetButton"),
  gpsStart: document.getElementById("gpsStartText"),
  dest: document.getElementById("destInput"),
  locateBtn: document.getElementById("locateBtn"),
  routeBtn: document.getElementById("routeBtn"),
  gpsBtn: document.getElementById("gpsBtn"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  simBtn: document.getElementById("simBtn"),
  stopBtn: document.getElementById("stopBtn"),
  sumDistance: document.getElementById("sumDistance"),
  sumTime: document.getElementById("sumTime"),
  sumPoints: document.getElementById("sumPoints"),
  drawer: document.getElementById("drawer"),
  menuBtn: document.getElementById("menuBtn"),
  closeMenuBtn: document.getElementById("closeMenuBtn"),
  voiceBtn: document.getElementById("voiceBtn"),
  maneuverZoomInput: document.getElementById("maneuverZoomInput"),
  maneuverZoomValue: document.getElementById("maneuverZoomValue"),
  clearBtn: document.getElementById("clearBtn"),
  savedInfo: document.getElementById("savedInfo")
};

function kmBetween(a, b) {
  const r = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearing(a, b) {
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function fmtKm(km) {
  if (!Number.isFinite(km)) return "--";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const min = Math.round(seconds / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}min` : `${m} min`;
}

function parseMaxspeed(value) {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (text.includes("none") || text.includes("signals")) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const speed = Number(match[0]);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  return text.includes("mph") ? Math.round(speed * 1.60934) : speed;
}

function directionArrow(modifier = "", type = "") {
  if (type === "roundabout" || type === "rotary") return "⟳";
  if (type === "arrive") return "◎";
  if (modifier.includes("left")) return "←";
  if (modifier.includes("right")) return "→";
  if (modifier.includes("straight")) return "↑";
  return "↑";
}

function maneuverLabel(type = "", modifier = "", name = "") {
  const road = name ? ` w ${name}` : "";
  if (type === "depart") return "Rusz prosto";
  if (type === "arrive") return "Dotrzyj do celu";
  if (type === "roundabout" || type === "rotary") return name ? `Wjedź na rondo i jedź ${name}` : "Wjedź na rondo";
  if (type === "fork") return modifier.includes("left") ? "Trzymaj się lewej strony" : "Trzymaj się prawej strony";
  if (type === "merge") return `Włącz się do ruchu${road}`;
  if (type === "on ramp") return `Wjedź na zjazd${road}`;
  if (type === "off ramp") return `Zjedź z trasy${road}`;
  if (type === "end of road") return modifier.includes("left") ? `Na końcu drogi skręć w lewo${road}` : `Na końcu drogi skręć w prawo${road}`;
  if (modifier.includes("left")) return `Skręć w lewo${road}`;
  if (modifier.includes("right")) return `Skręć w prawo${road}`;
  if (modifier.includes("straight")) return name ? `Jedź prosto przez ${name}` : "Jedź prosto";
  return name ? `Jedź ${name}` : "Kontynuuj jazdę";
}

function showStatus(text) {
  el.status.textContent = text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const radius = Number(saved.maneuverViewRadiusKm);
    if (Number.isFinite(radius)) {
      state.settings.maneuverViewRadiusKm = clamp(radius, 0.2, 2);
    }
  } catch (_) {
    state.settings.maneuverViewRadiusKm = DEFAULT_MANEUVER_VIEW_RADIUS_KM;
  }
  updateSettingsUi();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function updateSettingsUi() {
  if (!el.maneuverZoomInput || !el.maneuverZoomValue) return;
  el.maneuverZoomInput.value = String(state.settings.maneuverViewRadiusKm);
  el.maneuverZoomValue.textContent = `${state.settings.maneuverViewRadiusKm.toFixed(1)} km`;
}

function setManeuverZoomRadius(value) {
  state.settings.maneuverViewRadiusKm = clamp(Number(value) || DEFAULT_MANEUVER_VIEW_RADIUS_KM, 0.2, 2);
  updateSettingsUi();
  saveSettings();
  scheduleRender(true);
}

function setPanelOpen(open) {
  el.panel.classList.toggle("collapsed", !open);
  el.bottomSheetButton.classList.toggle("hidden", open);
  el.panelToggleBtn.setAttribute("aria-label", open ? "Zwiń panel" : "Rozwiń panel");
  el.panelHandle.setAttribute("aria-label", open ? "Zwiń panel" : "Rozwiń panel");
  el.bottomSheetButton.setAttribute("aria-label", open ? "Menu otwarte" : "Rozwiń menu");
}

function togglePanel() {
  setPanelOpen(el.panel.classList.contains("collapsed"));
}

function gpsErrorMessage(error) {
  if (!navigator.geolocation) return "Ta przeglądarka nie obsługuje GPS";
  if (error?.code === 1) return "Brak zgody na lokalizację. Włącz GPS dla tej strony.";
  if (error?.code === 2) return "Telefon nie podał lokalizacji. Sprawdź GPS.";
  if (error?.code === 3) return "GPS odpowiada za wolno. Spróbuj jeszcze raz.";
  return error?.message || "Nie udało się pobrać lokalizacji GPS";
}

function speak(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "pl-PL";
    msg.rate = 0.95;
    window.speechSynthesis.speak(msg);
  } catch (_) {}
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Brak GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        time: Date.now()
      }),
      reject,
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 1500 }
    );
  });
}

async function locateStart() {
  showStatus("Pobieranie GPS...");
  el.gpsStart.textContent = "Pobieranie lokalizacji...";
  try {
    const start = await getCurrentPosition();
    state.start = start;
    const acc = Number.isFinite(start.accuracy) ? `, dokładność ${Math.round(start.accuracy)} m` : "";
    el.gpsStart.textContent = `${start.lat.toFixed(5)}, ${start.lng.toFixed(5)}${acc}`;
    showStatus("GPS gotowy");
    return start;
  } catch (error) {
    const msg = gpsErrorMessage(error);
    el.gpsStart.textContent = msg;
    showStatus("Błąd GPS");
    throw new Error(msg);
  }
}

async function geocode(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("Błąd wyszukiwania adresu");
  const data = await response.json();
  if (!data.length) throw new Error("Nie znaleziono adresu");
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), name: data[0].display_name };
}

function buildCumulative(coords) {
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative[i] = cumulative[i - 1] + kmBetween(coords[i - 1], coords[i]);
  }
  return cumulative;
}

function routePointAt(km) {
  if (!state.route?.coords?.length) return null;
  const coords = state.route.coords;
  const target = Math.max(0, Math.min(km, state.totalKm));
  for (let i = 1; i < state.cumulative.length; i++) {
    if (state.cumulative[i] >= target) {
      const prev = coords[i - 1];
      const next = coords[i];
      const seg = state.cumulative[i] - state.cumulative[i - 1] || 0.000001;
      const t = (target - state.cumulative[i - 1]) / seg;
      return {
        lat: prev.lat + (next.lat - prev.lat) * t,
        lng: prev.lng + (next.lng - prev.lng) * t,
        bearing: bearing(prev, next)
      };
    }
  }
  return { ...coords[coords.length - 1], bearing: 0 };
}

function nearestProgress(point) {
  if (!state.route?.coords?.length) return 0;
  let best = { distance: Infinity, km: 0 };
  const coords = state.route.coords;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const ax = a.lng;
    const ay = a.lat;
    const bx = b.lng;
    const by = b.lat;
    const px = point.lng;
    const py = point.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 0.000001;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
    const snap = { lat: ay + dy * t, lng: ax + dx * t };
    const d = kmBetween(point, snap);
    if (d < best.distance) {
      const segKm = state.cumulative[i] - state.cumulative[i - 1];
      best = { distance: d, km: state.cumulative[i - 1] + segKm * t };
    }
  }
  return best.km;
}

function buildInstructions(osrmRoute, coords) {
  const items = [];
  for (const leg of osrmRoute.legs || []) {
    for (const step of leg.steps || []) {
      const maneuver = step.maneuver || {};
      const location = maneuver.location;
      if (!Array.isArray(location)) continue;
      const type = maneuver.type || "";
      const modifier = maneuver.modifier || "";
      if (type === "continue" && modifier === "straight") continue;
      const point = { lat: location[1], lng: location[0] };
      const doneKm = nearestProgressOnCoords(point, coords);
      items.push({
        lat: point.lat,
        lng: point.lng,
        doneKm,
        type,
        modifier,
        arrow: directionArrow(modifier, type),
        text: maneuverLabel(type, modifier, step.name || "")
      });
    }
  }
  if (!items.some(item => item.type === "arrive") && coords.length) {
    const last = coords[coords.length - 1];
    items.push({
      lat: last.lat,
      lng: last.lng,
      doneKm: state.totalKm,
      type: "arrive",
      modifier: "",
      arrow: "◎",
      text: "Dotrzyj do celu"
    });
  }
  return items
    .sort((a, b) => a.doneKm - b.doneKm)
    .filter((item, index, all) => index === 0 || Math.abs(item.doneKm - all[index - 1].doneKm) > 0.015 || item.type === "arrive");
}

function routeBoundsWithMargin(coords, marginKm = 0.55) {
  const b = bounds(coords);
  if (!b) return null;
  const midLat = (b.minLat + b.maxLat) / 2;
  const latMargin = marginKm / 111;
  const lngMargin = marginKm / (111 * Math.max(0.2, Math.cos(midLat * Math.PI / 180)));
  return {
    south: b.minLat - latMargin,
    west: b.minLng - lngMargin,
    north: b.maxLat + latMargin,
    east: b.maxLng + lngMargin
  };
}

function buildOverpassQuery(box) {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  return `[out:json][timeout:18];(
node["amenity"~"fuel|parking|restaurant|cafe|pharmacy|hospital"](${bbox});
way["amenity"~"fuel|parking|restaurant|cafe|pharmacy|hospital"](${bbox});
node["highway"="speed_camera"](${bbox});
way["highway"="speed_camera"](${bbox});
node["enforcement"="maxspeed"](${bbox});
way["enforcement"="maxspeed"](${bbox});
way["highway"]["maxspeed"](${bbox});
way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road"](${bbox});
);out body center geom;`;
}

function poiMeta(tags = {}) {
  if (tags.highway === "speed_camera" || tags.enforcement === "maxspeed") {
    return { type: "camera", icon: "R", name: "Fotoradar" };
  }
  if (tags.amenity === "fuel") return { type: "fuel", icon: "P", name: "Stacja paliw" };
  if (tags.amenity === "parking") return { type: "parking", icon: "P", name: "Parking" };
  if (tags.amenity === "restaurant") return { type: "food", icon: "J", name: "Restauracja" };
  if (tags.amenity === "cafe") return { type: "food", icon: "K", name: "Kawiarnia" };
  if (tags.amenity === "pharmacy") return { type: "help", icon: "+", name: "Apteka" };
  if (tags.amenity === "hospital") return { type: "help", icon: "H", name: "Szpital" };
  return null;
}

function normalizeOverpassElement(item) {
  const tags = item.tags || {};
  const lat = typeof item.lat === "number" ? item.lat : item.center?.lat;
  const lng = typeof item.lon === "number" ? item.lon : item.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const meta = poiMeta(tags);
  if (!meta) return null;
  const speedMatch = String(tags.maxspeed || "").match(/\d+/);
  return {
    lat,
    lng,
    type: meta.type,
    icon: meta.icon,
    name: tags.name || tags.brand || meta.name,
    limit: speedMatch ? Number(speedMatch[0]) : undefined,
    source: "OpenStreetMap"
  };
}

function normalizeSpeedLimitElement(item) {
  const tags = item.tags || {};
  const limit = parseMaxspeed(tags.maxspeed);
  const lat = typeof item.lat === "number" ? item.lat : item.center?.lat;
  const lng = typeof item.lon === "number" ? item.lon : item.center?.lon;
  if (!limit || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    limit,
    road: tags.name || tags.ref || "droga",
    source: "OpenStreetMap"
  };
}

function normalizeRoadElement(item) {
  const tags = item.tags || {};
  if (item.type !== "way" || !tags.highway || !Array.isArray(item.geometry)) return null;
  if (tags.area === "yes" || tags.highway === "services" || tags.highway === "rest_area") return null;
  const coords = item.geometry
    .map(point => ({ lat: point.lat, lng: point.lon }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (coords.length < 2) return null;
  return {
    id: item.id,
    name: tags.name || tags.ref || "",
    highway: tags.highway,
    coords
  };
}

async function fetchOverpassPoints(coords) {
  const box = routeBoundsWithMargin(coords);
  if (!box) return [];
  const body = `data=${encodeURIComponent(buildOverpassQuery(box))}`;
  let lastError = null;
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body
      });
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nie udało się pobrać punktów OSM");
}

async function loadRoutePoints(coords) {
  const rawElements = await fetchOverpassPoints(coords);
  const raw = rawElements.map(normalizeOverpassElement).filter(Boolean);
  const rawLimits = rawElements.map(normalizeSpeedLimitElement).filter(Boolean);
  const rawRoads = rawElements.map(normalizeRoadElement).filter(Boolean);
  const seen = new Set();
  const enriched = raw.map(point => {
    const doneKm = nearestProgressOnCoords(point, coords);
    const snapped = routePointAtOnCoords(doneKm, coords);
    return { ...point, doneKm, snapped, distanceFromRoute: snapped ? kmBetween(point, snapped) : Infinity };
  }).filter(point => point.distanceFromRoute <= 0.25).filter(point => {
    const key = `${point.type}:${Math.round(point.lat * 10000)}:${Math.round(point.lng * 10000)}:${point.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.doneKm - b.doneKm);
  return {
    pois: enriched.filter(point => point.type !== "camera"),
    cameras: enriched.filter(point => point.type === "camera"),
    speedLimits: normalizeRouteSpeedLimits(rawLimits, coords),
    nearbyRoads: normalizeNearbyRoads(rawRoads, coords)
  };
}

function normalizeNearbyRoads(roads, routeCoords) {
  const cumulative = buildCumulative(routeCoords);
  const seen = new Set();
  return roads.map(road => {
    const measured = road.coords.map(point => {
      const doneKm = nearestProgressOnPrepared(point, routeCoords, cumulative);
      const snapped = routePointAtOnPrepared(doneKm, routeCoords, cumulative);
      return {
        point,
        distance: snapped ? kmBetween(point, snapped) : Infinity
      };
    });
    const distanceFromRoute = Math.min(...measured.map(item => item.distance));
    const coords = measured
      .filter((item, index, all) => (
        item.distance <= NEARBY_ROAD_MAX_DISTANCE_KM ||
        all[index - 1]?.distance <= NEARBY_ROAD_MAX_DISTANCE_KM ||
        all[index + 1]?.distance <= NEARBY_ROAD_MAX_DISTANCE_KM
      ))
      .map(item => item.point);
    return { ...road, coords, distanceFromRoute };
  }).filter(road => road.distanceFromRoute <= NEARBY_ROAD_MAX_DISTANCE_KM).filter(road => {
    if (road.coords.length < 2) return false;
    const key = road.id || `${road.name}:${road.highway}:${road.coords[0].lat}:${road.coords[0].lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 280);
}

function normalizeRouteSpeedLimits(limits, coords) {
  const seen = new Set();
  return limits.map(limit => {
    const doneKm = nearestProgressOnCoords(limit, coords);
    const snapped = routePointAtOnCoords(doneKm, coords);
    return { ...limit, doneKm, snapped, distanceFromRoute: snapped ? kmBetween(limit, snapped) : Infinity };
  }).filter(limit => limit.distanceFromRoute <= 0.18).filter(limit => {
    const key = `${limit.limit}:${Math.round(limit.doneKm * 20)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.doneKm - b.doneKm);
}

function routePointAtOnCoords(km, coords) {
  const cumulative = buildCumulative(coords);
  return routePointAtOnPrepared(km, coords, cumulative);
}

function routePointAtOnPrepared(km, coords, cumulative) {
  const total = cumulative[cumulative.length - 1] || 0;
  const target = Math.max(0, Math.min(km, total));
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i] >= target) {
      const prev = coords[i - 1];
      const next = coords[i];
      const seg = cumulative[i] - cumulative[i - 1] || 0.000001;
      const t = (target - cumulative[i - 1]) / seg;
      return {
        lat: prev.lat + (next.lat - prev.lat) * t,
        lng: prev.lng + (next.lng - prev.lng) * t
      };
    }
  }
  return coords[coords.length - 1] || null;
}

function nearestProgressOnCoords(point, coords) {
  const cumulative = buildCumulative(coords);
  return nearestProgressOnPrepared(point, coords, cumulative);
}

function nearestProgressOnPrepared(point, coords, cumulative) {
  let best = { distance: Infinity, km: 0 };
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const ax = a.lng;
    const ay = a.lat;
    const bx = b.lng;
    const by = b.lat;
    const px = point.lng;
    const py = point.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 0.000001;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
    const snap = { lat: ay + dy * t, lng: ax + dx * t };
    const d = kmBetween(point, snap);
    if (d < best.distance) {
      best = { distance: d, km: cumulative[i - 1] + (cumulative[i] - cumulative[i - 1]) * t };
    }
  }
  return best.km;
}

function getNextInstruction() {
  const instructions = state.route?.instructions || [];
  while (
    state.nextInstructionIndex < instructions.length - 1 &&
    state.progressKm > instructions[state.nextInstructionIndex].doneKm + 0.035
  ) {
    state.nextInstructionIndex++;
  }
  return instructions[state.nextInstructionIndex] || null;
}

function mercatorPoint(p) {
  const lat = Math.max(-85, Math.min(85, p.lat));
  const rad = lat * Math.PI / 180;
  return {
    x: p.lng,
    y: Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 180 / Math.PI
  };
}

function bounds(coords) {
  if (!coords.length) return null;
  const first = mercatorPoint(coords[0]);
  return coords.reduce((b, p) => {
    const q = mercatorPoint(p);
    return {
      minLat: Math.min(b.minLat, p.lat),
      maxLat: Math.max(b.maxLat, p.lat),
      minLng: Math.min(b.minLng, p.lng),
      maxLng: Math.max(b.maxLng, p.lng),
      minX: Math.min(b.minX, q.x),
      maxX: Math.max(b.maxX, q.x),
      minY: Math.min(b.minY, q.y),
      maxY: Math.max(b.maxY, q.y)
    };
  }, {
    minLat: coords[0].lat,
    maxLat: coords[0].lat,
    minLng: coords[0].lng,
    maxLng: coords[0].lng,
    minX: first.x,
    maxX: first.x,
    minY: first.y,
    maxY: first.y
  });
}

function project(p, b, pad = 7) {
  const q = mercatorPoint(p);
  const xRange = Math.max(0.000001, b.maxX - b.minX);
  const yRange = Math.max(0.000001, b.maxY - b.minY);
  const scale = (100 - pad * 2) / Math.max(xRange, yRange);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  return {
    x: 50 + (q.x - midX) * scale,
    y: 50 - (q.y - midY) * scale
  };
}

function offsetPoint(point, northKm, eastKm) {
  const lat = point.lat + northKm / 111;
  const lng = point.lng + eastKm / (111 * Math.max(0.2, Math.cos(point.lat * Math.PI / 180)));
  return { lat, lng };
}

function maneuverViewBoxSize(routePoint, boundsForRoute) {
  const car = project(routePoint, boundsForRoute);
  const radius = state.settings.maneuverViewRadiusKm;
  const edgePoints = [
    offsetPoint(routePoint, radius, 0),
    offsetPoint(routePoint, -radius, 0),
    offsetPoint(routePoint, 0, radius),
    offsetPoint(routePoint, 0, -radius)
  ].map(point => project(point, boundsForRoute));
  const svgRadius = Math.max(...edgePoints.map(point => Math.hypot(point.x - car.x, point.y - car.y)));
  return Math.max(0.2, svgRadius * 2);
}

function getManeuverFocusInstruction() {
  const instructions = state.route?.instructions || [];
  return instructions.find(instruction => {
    if (instruction.type === "depart") return false;
    const beforeKm = instruction.doneKm - state.progressKm;
    const afterKm = state.progressKm - instruction.doneKm;
    return beforeKm <= MANEUVER_ZOOM_BEFORE_KM && afterKm <= MANEUVER_ZOOM_AFTER_KM;
  }) || null;
}

function getRouteViewBox(routePoint, boundsForRoute) {
  if (!routePoint || !getManeuverFocusInstruction()) return { x: 0, y: 0, width: 100, height: 100, zoomed: false };
  const car = project(routePoint, boundsForRoute);
  const size = maneuverViewBoxSize(routePoint, boundsForRoute);
  return {
    x: car.x - size / 2,
    y: car.y - size / 2,
    width: size,
    height: size,
    zoomed: true
  };
}

function applySvgViewBox(viewBox) {
  el.svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
}

function smoothAngle(current, target, factor = 0.38) {
  if (!Number.isFinite(current)) return target;
  const delta = ((target - current + 540) % 360) - 180;
  return (current + delta * factor + 360) % 360;
}

function applyRouteCamera() {
  state.cameraBearing = null;
  el.svg.classList.remove("maneuver-camera");
  el.svg.style.transform = "";
}

function svgPointToScreen(point, viewBox) {
  const svgRect = el.svg.getBoundingClientRect();
  const scale = Math.min(svgRect.width / viewBox.width, svgRect.height / viewBox.height);
  const drawnWidth = viewBox.width * scale;
  const drawnHeight = viewBox.height * scale;
  const offsetX = (svgRect.width - drawnWidth) / 2;
  const offsetY = (svgRect.height - drawnHeight) / 2;
  return {
    x: svgRect.left + offsetX + (point.x - viewBox.x) * scale,
    y: svgRect.top + offsetY + (point.y - viewBox.y) * scale
  };
}

function scaledRadius(baseRadius, viewBox) {
  return baseRadius * (viewBox.width / 100);
}

function isAhead(doneKm, keepAfterKm = 0.02) {
  return typeof doneKm !== "number" || doneKm >= state.progressKm - keepAfterKm;
}

function currentSpeedLimit() {
  const limits = state.route?.speedLimits || [];
  let current = null;
  for (const limit of limits) {
    if (limit.doneKm <= state.progressKm + 0.05) current = limit;
    else break;
  }
  return current;
}

function renderSpeedLimit() {
  const current = currentSpeedLimit();
  state.currentLimit = current?.limit || null;
  const speeding = state.currentLimit && state.speedKmh > state.currentLimit + 5;
  el.speedLimit.textContent = state.currentLimit
    ? speeding ? `Zwolnij! Limit: ${state.currentLimit} km/h` : `Limit: ${state.currentLimit} km/h`
    : "Limit: --";
  document.getElementById("hud").classList.toggle("speeding", !!speeding);
  if (speeding && Date.now() - state.lastSpeedAlertAt > 9000) {
    state.lastSpeedAlertAt = Date.now();
    speak(`Uwaga, przekroczona prędkość. Limit ${state.currentLimit} kilometrów na godzinę`);
  }
}

function scheduleRender(force = false) {
  if (force) {
    if (state.renderTimer) clearTimeout(state.renderTimer);
    state.renderTimer = null;
    render(true);
    return;
  }
  const now = Date.now();
  const wait = Math.max(0, MIN_RENDER_INTERVAL_MS - (now - state.lastRenderAt));
  if (state.renderTimer) return;
  state.renderTimer = setTimeout(() => {
    state.renderTimer = null;
    render(false);
  }, wait);
}

function polyline(coords, b) {
  return coords.map(p => {
    const q = project(p, b);
    return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  }).join(" ");
}

function render(force = false) {
  const route = state.route;
  const routeId = route?.createdAt || "none";
  const renderKey = route?.coords?.length
    ? `${routeId}:${Math.round(state.progressKm * 125)}:${Math.round(state.speedKmh / 3)}:${state.nextInstructionIndex}:${state.currentLimit || 0}`
    : `empty:${Math.round(state.speedKmh / 5)}`;
  if (!force && renderKey === state.lastRenderKey) return;
  state.lastRenderKey = renderKey;
  state.lastRenderAt = Date.now();
  state.lastRenderedSpeedKmh = state.speedKmh;

  el.svg.innerHTML = "";
  if (!route?.coords?.length) {
    applySvgViewBox({ x: 0, y: 0, width: 100, height: 100 });
    applyRouteCamera();
    el.vehicle.style.display = "none";
    state.currentLimit = null;
    el.sumDistance.textContent = "--";
    el.sumTime.textContent = "--";
    el.sumPoints.textContent = "0";
    el.distance.textContent = "--";
    el.progress.textContent = "0%";
    el.speed.textContent = `${Math.round(state.speedKmh)} km/h`;
    el.speedLimit.textContent = "Limit: --";
    document.getElementById("hud").classList.remove("speeding");
    el.maneuverIcon.textContent = "↑";
    el.maneuverDistance.textContent = "--";
    el.maneuverText.textContent = "Wyznacz trasę, aby zobaczyć wskazówki";
    el.nextManeuverText.textContent = "--";
    return;
  }

  const coords = route.coords;
  const visibleCoords = [
    ...coords,
    ...(route.nearbyRoads || []).flatMap(road => road.coords || [])
  ];
  const b = bounds(visibleCoords.length ? visibleCoords : coords);
  const all = polyline(coords, b);
  const doneCoords = coords.filter((_, index) => state.cumulative[index] <= state.progressKm);
  const point = routePointAt(state.progressKm);
  const viewBox = getRouteViewBox(point, b);
  applySvgViewBox(viewBox);
  applyRouteCamera();

  for (const road of route.nearbyRoads || []) {
    if (!road.coords?.length) continue;
    el.svg.insertAdjacentHTML("beforeend", `<polyline class="nearby-road" points="${polyline(road.coords, b)}"><title>${road.name || "Droga OSM"}</title></polyline>`);
  }
  el.svg.insertAdjacentHTML("beforeend", `<polyline class="route-bg" points="${all}"></polyline>`);
  el.svg.insertAdjacentHTML("beforeend", `<polyline class="route-line" points="${all}"></polyline>`);
  if (doneCoords.length > 1) {
    el.svg.insertAdjacentHTML("beforeend", `<polyline class="route-done" points="${polyline(doneCoords, b)}"></polyline>`);
  }
  for (const marker of [coords[0], coords[coords.length - 1]]) {
    const q = project(marker, b);
    el.svg.insertAdjacentHTML("beforeend", `<circle class="route-point" cx="${q.x}" cy="${q.y}" r="${scaledRadius(0.75, viewBox)}"></circle>`);
  }
  const nextInstruction = getNextInstruction();
  for (const instruction of route.instructions || []) {
    if (instruction.type === "depart") continue;
    if (!isAhead(instruction.doneKm, 0.1)) continue;
    const q = project(instruction, b);
    const cls = instruction === nextInstruction ? "maneuver-dot next" : "maneuver-dot";
    el.svg.insertAdjacentHTML("beforeend", `<circle class="${cls}" cx="${q.x}" cy="${q.y}" r="${scaledRadius(0.58, viewBox)}"></circle>`);
  }
  for (const poi of route.pois || []) {
    if (!isAhead(poi.doneKm, 0.03)) continue;
    const src = poi.snapped || poi;
    const q = project(src, b);
    const r = scaledRadius(1.05, viewBox);
    el.svg.insertAdjacentHTML("beforeend", `<g class="poi-icon"><circle cx="${q.x}" cy="${q.y}" r="${r}"></circle><text x="${q.x}" y="${q.y}">${poi.icon || "P"}</text><title>${poi.name}</title></g>`);
  }
  for (const camera of route.cameras || []) {
    if (!isAhead(camera.doneKm, 0.03)) continue;
    const src = camera.snapped || camera;
    const q = project(src, b);
    const title = camera.limit ? `${camera.name} ${camera.limit} km/h` : camera.name;
    const r = scaledRadius(1.08, viewBox);
    const label = camera.limit ? String(camera.limit).slice(0, 3) : "R";
    el.svg.insertAdjacentHTML("beforeend", `<g class="camera-icon"><circle cx="${q.x}" cy="${q.y}" r="${r}"></circle><text x="${q.x}" y="${q.y}">${label}</text><title>${title}</title></g>`);
  }

  if (point) {
    const q = project(point, b);
    const screen = svgPointToScreen(q, viewBox);
    el.vehicle.style.display = "grid";
    el.vehicle.style.left = `${screen.x}px`;
    el.vehicle.style.top = `${screen.y}px`;
    el.vehicle.style.transform = `translate(-50%, -50%) rotate(${point.bearing}deg)`;
  }

  const percent = state.totalKm ? Math.round((state.progressKm / state.totalKm) * 100) : 0;
  el.sumDistance.textContent = fmtKm(state.totalKm);
  el.sumTime.textContent = fmtTime(route.durationSec);
  el.sumPoints.textContent = String(route.instructions?.length || 0);
  el.distance.textContent = `${fmtKm(Math.max(0, state.totalKm - state.progressKm))} do celu`;
  el.progress.textContent = `${percent}%`;
  el.speed.textContent = `${Math.round(state.speedKmh)} km/h`;
  renderSpeedLimit();
  renderManeuver();
}

function renderManeuver() {
  const instructions = state.route?.instructions || [];
  const current = getNextInstruction();
  const next = instructions[state.nextInstructionIndex + 1];
  if (!current) {
    el.maneuverIcon.textContent = "◎";
    el.maneuverDistance.textContent = "--";
    el.maneuverText.textContent = "Jedź do celu";
    el.nextManeuverText.textContent = "";
    return;
  }
  const distKm = Math.max(0, current.doneKm - state.progressKm);
  el.maneuverIcon.textContent = current.arrow;
  el.maneuverDistance.textContent = current.type === "arrive" ? `${fmtKm(distKm)} do celu` : `${fmtKm(distKm)} do manewru`;
  el.maneuverText.textContent = current.text;
  el.nextManeuverText.textContent = next ? `Potem: ${next.text}` : "";
  if (distKm < 0.08 && state.lastSpokenInstruction !== state.nextInstructionIndex) {
    state.lastSpokenInstruction = state.nextInstructionIndex;
    speak(current.type === "arrive" ? `Za ${fmtKm(distKm)} dotrzesz do celu` : `Za ${fmtKm(distKm)}, ${current.text}`);
  }
}

async function createRoute() {
  try {
    stopSimulation();
    showStatus("Pobieranie startu GPS...");
    const destQuery = el.dest.value.trim();
    if (!destQuery) throw new Error("Wpisz cel");
    const start = await locateStart();
    showStatus("Szukam celu...");
    const dest = await geocode(destQuery);
    showStatus("Wyznaczanie trasy...");
    const url = `${OSRM_URL}/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Błąd serwera trasy");
    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("Nie udało się wyznaczyć trasy");
    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    state.start = start;
    state.dest = dest;
    state.cumulative = buildCumulative(coords);
    state.totalKm = state.cumulative[state.cumulative.length - 1] || route.distance / 1000;
    const instructions = buildInstructions(route, coords);
    state.route = { coords, instructions, pois: [], cameras: [], speedLimits: [], nearbyRoads: [], durationSec: route.duration, createdAt: Date.now(), destName: destQuery };
    state.progressKm = 0;
    state.speedKmh = 0;
    state.currentLimit = null;
    state.lastSpeedAlertAt = 0;
    state.nextInstructionIndex = 0;
    state.lastSpokenInstruction = -1;
    showStatus("Pobieranie POI i fotoradarów...");
    try {
      const routePoints = await loadRoutePoints(coords);
      state.route.pois = routePoints.pois;
      state.route.cameras = routePoints.cameras;
      state.route.speedLimits = routePoints.speedLimits;
      state.route.nearbyRoads = routePoints.nearbyRoads;
    } catch (error) {
      console.warn("Nie udało się pobrać punktów OSM", error);
    }
    showStatus(`Trasa gotowa: ${state.route.pois.length} POI, ${state.route.cameras.length} radarów, ${state.route.speedLimits.length} limitów, ${state.route.nearbyRoads.length} dróg`);
    saveRoute();
    scheduleRender(true);
    setPanelOpen(false);
    speak("Trasa wyznaczona");
  } catch (error) {
    showStatus(error.message || "Błąd");
    alert(error.message || "Nie udało się wyznaczyć trasy");
    scheduleRender(true);
  }
}

function saveRoute() {
  if (!state.route) return alert("Brak trasy do zapisania");
  localStorage.setItem(STORE_KEY, JSON.stringify({
    start: state.start,
    dest: state.dest,
    route: state.route,
    progressKm: state.progressKm
  }));
  updateSavedInfo();
}

function loadRoute() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return alert("Brak zapisanej trasy");
  const saved = JSON.parse(raw);
  state.start = saved.start;
  state.dest = saved.dest;
  state.route = saved.route;
  state.cumulative = buildCumulative(state.route.coords);
  state.totalKm = state.cumulative[state.cumulative.length - 1] || 0;
  if (!Array.isArray(state.route.instructions)) {
    const last = state.route.coords[state.route.coords.length - 1];
    state.route.instructions = last ? [{ ...last, doneKm: state.totalKm, type: "arrive", modifier: "", arrow: "◎", text: "Dotrzyj do celu" }] : [];
  }
  if (!Array.isArray(state.route.pois)) state.route.pois = [];
  if (!Array.isArray(state.route.cameras)) state.route.cameras = [];
  if (!Array.isArray(state.route.speedLimits)) state.route.speedLimits = [];
  if (!Array.isArray(state.route.nearbyRoads)) state.route.nearbyRoads = [];
  state.progressKm = Math.min(saved.progressKm || 0, state.totalKm);
  state.speedKmh = 0;
  state.nextInstructionIndex = 0;
  state.lastSpokenInstruction = -1;
  showStatus("Wczytano trasę");
  scheduleRender(true);
  setPanelOpen(false);
}

function updateSavedInfo() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    el.savedInfo.textContent = "Zapis: brak";
    return;
  }
  try {
    const saved = JSON.parse(raw);
    const count = saved.route?.coords?.length || 0;
    const instructions = saved.route?.instructions?.length || 0;
    const pois = saved.route?.pois?.length || 0;
    const cameras = saved.route?.cameras?.length || 0;
    const speedLimits = saved.route?.speedLimits?.length || 0;
    const nearbyRoads = saved.route?.nearbyRoads?.length || 0;
    const date = new Date(saved.route?.createdAt || Date.now()).toLocaleString("pl-PL");
    el.savedInfo.textContent = `Zapis: ${count} punktów, ${instructions} manewrów, ${pois} POI, ${cameras} radarów, ${speedLimits} limitów, ${nearbyRoads} dróg, ${date}`;
  } catch (_) {
    el.savedInfo.textContent = "Zapis: uszkodzony";
  }
}

function startSimulation() {
  if (!state.route) return alert("Najpierw wyznacz albo wczytaj trasę");
  if (state.simulation) return stopSimulation();
  state.progressKm = 0;
  state.nextInstructionIndex = 0;
  state.lastSpokenInstruction = -1;
  showStatus("Symulacja jazdy");
  speak("Symulacja rozpoczęta");
  let last = performance.now();
  const simDurationMs = Math.max(SIM_MIN_MS, Math.min(SIM_MAX_MS, state.totalKm * 1400));
  const simKmh = state.totalKm / (simDurationMs / 3600000);
  state.speedKmh = Math.min(SIM_MAX_SPEED_KMH, simKmh);
  el.simBtn.classList.add("running");
  el.simBtn.textContent = "Pauza";
  state.simulation = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    state.progressKm += (state.speedKmh * dt) / 3600;
    if (state.progressKm >= state.totalKm) {
      state.progressKm = state.totalKm;
      stopSimulation();
      state.speedKmh = 0;
      showStatus("Cel osiągnięty");
      speak("Dotarłeś do celu");
    }
    scheduleRender();
  }, 1000);
}

function stopSimulation() {
  if (state.simulation) clearInterval(state.simulation);
  state.simulation = null;
  el.simBtn.classList.remove("running");
  el.simBtn.textContent = "Symuluj";
}

function stopAll() {
  stopSimulation();
  if (state.gpsWatch !== null) navigator.geolocation.clearWatch(state.gpsWatch);
  state.gpsWatch = null;
  state.speedKmh = 0;
  state.currentLimit = null;
  showStatus(state.route ? "Trasa zatrzymana" : "Brak trasy");
  scheduleRender(true);
}

function startGps() {
  if (!state.route) return alert("Najpierw wyznacz albo wczytaj trasę");
  if (!navigator.geolocation) return alert("Brak GPS w przeglądarce");
  if (state.gpsWatch !== null) {
    navigator.geolocation.clearWatch(state.gpsWatch);
    state.gpsWatch = null;
    showStatus("GPS wyłączony");
    return;
  }
  showStatus("GPS aktywny");
  state.gpsWatch = navigator.geolocation.watchPosition(pos => {
    const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const now = Date.now();
    if (state.lastGps) {
      const dt = Math.max(0.5, (now - state.lastGps.time) / 1000);
      state.speedKmh = (kmBetween(state.lastGps.point, point) / dt) * 3600;
    } else if (typeof pos.coords.speed === "number") {
      state.speedKmh = Math.max(0, pos.coords.speed * 3.6);
    }
    state.lastGps = { point, time: now };
    const previousProgress = state.progressKm;
    state.progressKm = nearestProgress(point);
    const movedEnough = Math.abs(state.progressKm - previousProgress) >= GPS_RENDER_STEP_KM;
    const speedChangedEnough = Math.abs(state.speedKmh - state.lastRenderedSpeedKmh) >= GPS_SPEED_RENDER_STEP_KMH;
    if (movedEnough || speedChangedEnough) scheduleRender();
  }, error => {
    showStatus("Błąd GPS");
    alert(gpsErrorMessage(error));
  }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 2500 });
}

function clearRoute() {
  stopAll();
  state.start = null;
  state.dest = null;
  state.route = null;
  state.cumulative = [];
  state.totalKm = 0;
  state.progressKm = 0;
  state.speedKmh = 0;
  state.currentLimit = null;
  state.lastSpeedAlertAt = 0;
  state.nextInstructionIndex = 0;
  state.lastSpokenInstruction = -1;
  localStorage.removeItem(STORE_KEY);
  showStatus("Brak trasy");
  updateSavedInfo();
  scheduleRender(true);
  setPanelOpen(true);
}

el.routeBtn.addEventListener("click", createRoute);
el.locateBtn.addEventListener("click", () => locateStart().catch(error => alert(error.message)));
el.saveBtn.addEventListener("click", saveRoute);
el.loadBtn.addEventListener("click", loadRoute);
el.simBtn.addEventListener("click", startSimulation);
el.stopBtn.addEventListener("click", stopAll);
el.gpsBtn.addEventListener("click", startGps);
el.menuBtn.addEventListener("click", () => el.drawer.classList.add("open"));
el.closeMenuBtn.addEventListener("click", () => el.drawer.classList.remove("open"));
el.voiceBtn.addEventListener("click", () => speak("Lektor działa"));
el.maneuverZoomInput.addEventListener("input", event => setManeuverZoomRadius(event.target.value));
el.clearBtn.addEventListener("click", clearRoute);
el.panelHandle.addEventListener("click", togglePanel);
el.panelToggleBtn.addEventListener("click", togglePanel);
el.bottomSheetButton.addEventListener("click", () => setPanelOpen(true));
el.panel.querySelector("header").addEventListener("click", event => {
  if (event.target === el.menuBtn) return;
  if (event.target === el.panelToggleBtn) return;
  togglePanel();
});

let panelTouchStartY = null;
el.panel.addEventListener("touchstart", event => {
  panelTouchStartY = event.touches[0].clientY;
}, { passive: true });
el.panel.addEventListener("touchend", event => {
  if (panelTouchStartY === null) return;
  const dy = event.changedTouches[0].clientY - panelTouchStartY;
  if (Math.abs(dy) > 45) setPanelOpen(dy < 0);
  panelTouchStartY = null;
}, { passive: true });
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => scheduleRender(true), 180);
});

loadSettings();
updateSavedInfo();
setPanelOpen(true);
scheduleRender(true);
