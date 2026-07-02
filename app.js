const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const STORE_KEY = "simpleNaviRoute";
const ROUTES_STORE_KEY = "simpleNaviRoutes";
const SETTINGS_KEY = "simpleNaviSettings";
const SIM_MIN_MS = 25000;
const SIM_MAX_MS = 120000;
const SIM_MAX_SPEED_KMH = 100;
const MANEUVER_ZOOM_BEFORE_KM = 0.3;
const MANEUVER_ZOOM_AFTER_KM = 0.1;
const DEFAULT_MANEUVER_VIEW_RADIUS_KM = 1;
const MIN_MANEUVER_VIEW_RADIUS_KM = 0.01;
const MAX_MANEUVER_VIEW_RADIUS_KM = 2;
const MIN_RENDER_INTERVAL_MS = 900;
const GPS_RENDER_STEP_KM = 0.008;
const GPS_SPEED_RENDER_STEP_KMH = 5;
const VISUAL_PREDICT_SECONDS = 0.9;
const CAMERA_LOOKAHEAD_SECONDS = 4.2;
const CAMERA_LOOKAHEAD_MIN_KM = 0.025;
const CAMERA_LOOKAHEAD_MAX_KM = 0.18;
const MOTION_EPSILON_KM = 0.0007;
const LITE_RENDER_INTERVAL_MS = 1500;
const LITE_MOTION_INTERVAL_MS = 180;
const DEVICE_MONITOR_INTERVAL_MS = 2500;
const SPEECH_QUEUE_LIMIT = 6;
const SPEECH_WATCHDOG_MS = 4500;
const DEFAULT_SOUND_MODE = "both";
const DEFAULT_SIGNAL_VOLUME = 70;
const DEFAULT_MANEUVER_NOTIFY_DISTANCE_M = 120;
const DEFAULT_MANEUVER_REMINDER_DELAY_SEC = 12;
const DEFAULT_POI_NOTIFY_DISTANCE_M = 800;
const DEFAULT_CAMERA_NOTIFY_DISTANCE_M = 1200;
const DEFAULT_NEARBY_ROAD_RADIUS_M = 500;
const DEFAULT_POI_TYPES = ["fuel", "parking", "food", "help"];
const POI_TYPE_CONFIG = {
  fuel: { label: "Paliwo", overpass: 'node["amenity"="fuel"]({bbox});way["amenity"="fuel"]({bbox});' },
  parking: { label: "Parking", overpass: 'node["amenity"="parking"]({bbox});way["amenity"="parking"]({bbox});' },
  food: { label: "Jedzenie", overpass: 'node["amenity"~"restaurant|cafe"]({bbox});way["amenity"~"restaurant|cafe"]({bbox});' },
  help: { label: "Pomoc", overpass: 'node["amenity"~"pharmacy|hospital"]({bbox});way["amenity"~"pharmacy|hospital"]({bbox});' }
};

const state = {
  start: null,
  dest: null,
  route: null,
  activeSavedRouteId: null,
  routeChoices: [],
  routeChoiceStart: null,
  routeChoiceDest: null,
  activeRouteChoiceIndex: -1,
  cumulative: [],
  totalKm: 0,
  progressKm: 0,
  visualProgressKm: 0,
  cameraProgressKm: 0,
  progressUpdatedAt: 0,
  motionFrame: null,
  motionTimer: null,
  lastMotionFrameAt: 0,
  simulation: null,
  gpsWatch: null,
  lastGps: null,
  speedKmh: 0,
  currentLimit: null,
  lastSpeedAlertAt: 0,
  nextInstructionIndex: 0,
  lastSpokenInstruction: -1,
  lastManeuverAlertAt: 0,
  maneuverReminderSpoken: false,
  maneuverReminderTimer: null,
  lastRenderKey: "",
  renderTimer: null,
  lastRenderAt: 0,
  lastRenderedSpeedKmh: 0,
  lastMotionRenderAt: 0,
  cameraBearing: null,
  vehicleBearing: null,
  battery: null,
  speech: {
    unlocked: false,
    queue: [],
    voices: [],
    voice: null,
    speaking: false,
    watchdog: null,
    lastStartedAt: 0
  },
  audio: {
    context: null,
    unlocked: false,
    lastSignalAt: 0
  },
  deviceMonitor: {
    lastFrameAt: 0,
    frameSamples: [],
    timer: null
  },
  settings: {
    maneuverViewRadiusKm: DEFAULT_MANEUVER_VIEW_RADIUS_KM,
    powerMode: "full",
    soundMode: DEFAULT_SOUND_MODE,
    signalVolume: DEFAULT_SIGNAL_VOLUME,
    maneuverNotifyDistanceM: DEFAULT_MANEUVER_NOTIFY_DISTANCE_M,
    maneuverReminderDelaySec: DEFAULT_MANEUVER_REMINDER_DELAY_SEC,
    poiNotifyDistanceM: DEFAULT_POI_NOTIFY_DISTANCE_M,
    cameraNotifyDistanceM: DEFAULT_CAMERA_NOTIFY_DISTANCE_M,
    nearbyRoadRadiusM: DEFAULT_NEARBY_ROAD_RADIUS_M,
    poiTypes: [...DEFAULT_POI_TYPES]
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
  laneGuide: document.getElementById("laneGuide"),
  nextManeuverText: document.getElementById("nextManeuverText"),
  panel: document.getElementById("panel"),
  panelHandle: document.getElementById("panelHandle"),
  panelToggleBtn: document.getElementById("panelToggleBtn"),
  bottomSheetButton: document.getElementById("bottomSheetButton"),
  gpsStart: document.getElementById("gpsStartText"),
  dest: document.getElementById("destInput"),
  locateBtn: document.getElementById("locateBtn"),
  routeBtn: document.getElementById("routeBtn"),
  routeChoices: document.getElementById("routeChoices"),
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
  powerModeInput: document.getElementById("powerModeInput"),
  powerModeValue: document.getElementById("powerModeValue"),
  soundModeInput: document.getElementById("soundModeInput"),
  soundModeValue: document.getElementById("soundModeValue"),
  signalVolumeInput: document.getElementById("signalVolumeInput"),
  signalVolumeValue: document.getElementById("signalVolumeValue"),
  maneuverNotifyInput: document.getElementById("maneuverNotifyInput"),
  maneuverNotifyValue: document.getElementById("maneuverNotifyValue"),
  maneuverReminderInput: document.getElementById("maneuverReminderInput"),
  maneuverReminderValue: document.getElementById("maneuverReminderValue"),
  poiNotifyInput: document.getElementById("poiNotifyInput"),
  poiNotifyValue: document.getElementById("poiNotifyValue"),
  cameraNotifyInput: document.getElementById("cameraNotifyInput"),
  cameraNotifyValue: document.getElementById("cameraNotifyValue"),
  roadRadiusInput: document.getElementById("roadRadiusInput"),
  roadRadiusValue: document.getElementById("roadRadiusValue"),
  poiTypeInputs: Array.from(document.querySelectorAll("[data-poi-type]")),
  deviceTempText: document.getElementById("deviceTempText"),
  batteryText: document.getElementById("batteryText"),
  loadText: document.getElementById("loadText"),
  deviceHint: document.getElementById("deviceHint"),
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

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
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

function laneArrow(indication = "") {
  if (indication.includes("uturn")) return "↺";
  if (indication.includes("sharp left")) return "↰";
  if (indication.includes("slight left")) return "↖";
  if (indication.includes("left")) return "←";
  if (indication.includes("sharp right")) return "↱";
  if (indication.includes("slight right")) return "↗";
  if (indication.includes("right")) return "→";
  if (indication.includes("straight")) return "↑";
  return "•";
}

function normalizeLanes(step) {
  const intersections = Array.isArray(step.intersections) ? step.intersections : [];
  const intersection = intersections.find(item => Array.isArray(item.lanes) && item.lanes.length);
  if (!intersection) return [];
  return intersection.lanes.map(lane => {
    const indications = Array.isArray(lane.indications) ? lane.indications : [];
    return {
      active: lane.valid === true,
      arrows: indications.length ? indications.map(laneArrow).join("") : "•"
    };
  });
}

function showStatus(text) {
  el.status.textContent = text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isLiteMode() {
  return state.settings.powerMode === "lite" || state.settings.powerMode === "mega" || state.settings.powerMode === "ultra";
}

function isMegaLiteMode() {
  return state.settings.powerMode === "mega";
}

function isUltraLiteMode() {
  return state.settings.powerMode === "ultra";
}

function isNotificationOnlyMode() {
  return isMegaLiteMode() || isUltraLiteMode();
}

function shouldFetchRouteExtras() {
  return state.settings.powerMode === "full" || isMegaLiteMode();
}

function powerModeLabel(mode = state.settings.powerMode) {
  if (mode === "ultra") return "Ultra Lite";
  if (mode === "mega") return "Mega Lite";
  if (mode === "lite") return "Lite";
  return "Pełny";
}

function soundModeLabel(mode = state.settings.soundMode) {
  if (mode === "voice") return "Lektor";
  if (mode === "signal") return "Sygnały";
  return "Lektor + sygnały";
}

function normalizePoiTypes(value) {
  if (!Array.isArray(value)) return [...DEFAULT_POI_TYPES];
  return [...new Set(value.filter(type => POI_TYPE_CONFIG[type]))];
}

function notifyKm(meters) {
  return clamp(Number(meters) || 0, 50, 5000) / 1000;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : fallback, min, max);
}

function roadRadiusKm() {
  return clampNumber(state.settings.nearbyRoadRadiusM, DEFAULT_NEARBY_ROAD_RADIUS_M, 0, 2000) / 1000;
}

function arrivalTimeText(route = state.route) {
  if (!route || !Number.isFinite(route.durationSec)) return "--";
  return new Date(Date.now() + route.durationSec * 1000).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function routeTimeHtml(route = state.route) {
  if (!route) return "--";
  return `${fmtTime(route.durationSec)}<small>przyjazd ${arrivalTimeText(route)}</small>`;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const radius = Number(saved.maneuverViewRadiusKm);
    if (Number.isFinite(radius)) {
      state.settings.maneuverViewRadiusKm = clamp(radius, MIN_MANEUVER_VIEW_RADIUS_KM, MAX_MANEUVER_VIEW_RADIUS_KM);
    }
    state.settings.soundMode = ["voice", "signal", "both"].includes(saved.soundMode) ? saved.soundMode : DEFAULT_SOUND_MODE;
    state.settings.signalVolume = clampNumber(saved.signalVolume, DEFAULT_SIGNAL_VOLUME, 0, 100);
    state.settings.maneuverNotifyDistanceM = clampNumber(saved.maneuverNotifyDistanceM, DEFAULT_MANEUVER_NOTIFY_DISTANCE_M, 20, 2000);
    state.settings.maneuverReminderDelaySec = clampNumber(saved.maneuverReminderDelaySec, DEFAULT_MANEUVER_REMINDER_DELAY_SEC, 3, 60);
    state.settings.poiNotifyDistanceM = clamp(Number(saved.poiNotifyDistanceM) || DEFAULT_POI_NOTIFY_DISTANCE_M, 50, 5000);
    state.settings.cameraNotifyDistanceM = clamp(Number(saved.cameraNotifyDistanceM) || DEFAULT_CAMERA_NOTIFY_DISTANCE_M, 50, 5000);
    state.settings.nearbyRoadRadiusM = clampNumber(saved.nearbyRoadRadiusM, DEFAULT_NEARBY_ROAD_RADIUS_M, 0, 2000);
    state.settings.poiTypes = normalizePoiTypes(saved.poiTypes);
    state.settings.powerMode = ["full", "lite", "mega", "ultra"].includes(saved.powerMode)
      ? saved.powerMode
      : saved.liteMode === true ? "lite" : "full";
  } catch (_) {
    state.settings.maneuverViewRadiusKm = DEFAULT_MANEUVER_VIEW_RADIUS_KM;
    state.settings.powerMode = "full";
    state.settings.soundMode = DEFAULT_SOUND_MODE;
    state.settings.signalVolume = DEFAULT_SIGNAL_VOLUME;
    state.settings.maneuverNotifyDistanceM = DEFAULT_MANEUVER_NOTIFY_DISTANCE_M;
    state.settings.maneuverReminderDelaySec = DEFAULT_MANEUVER_REMINDER_DELAY_SEC;
    state.settings.poiNotifyDistanceM = DEFAULT_POI_NOTIFY_DISTANCE_M;
    state.settings.cameraNotifyDistanceM = DEFAULT_CAMERA_NOTIFY_DISTANCE_M;
    state.settings.nearbyRoadRadiusM = DEFAULT_NEARBY_ROAD_RADIUS_M;
    state.settings.poiTypes = [...DEFAULT_POI_TYPES];
  }
  updateSettingsUi();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function updateSettingsUi() {
  if (el.maneuverZoomInput && el.maneuverZoomValue) {
    el.maneuverZoomInput.value = String(state.settings.maneuverViewRadiusKm);
    const radius = state.settings.maneuverViewRadiusKm;
    el.maneuverZoomValue.textContent = `${radius < 0.1 ? radius.toFixed(2) : radius.toFixed(1)} km`;
  }
  if (el.powerModeInput) el.powerModeInput.value = state.settings.powerMode;
  if (el.powerModeValue) el.powerModeValue.textContent = powerModeLabel();
  if (el.soundModeInput) el.soundModeInput.value = state.settings.soundMode;
  if (el.soundModeValue) el.soundModeValue.textContent = soundModeLabel();
  if (el.signalVolumeInput && el.signalVolumeValue) {
    el.signalVolumeInput.value = String(state.settings.signalVolume);
    el.signalVolumeValue.textContent = `${state.settings.signalVolume}%`;
  }
  if (el.maneuverNotifyInput && el.maneuverNotifyValue) {
    el.maneuverNotifyInput.value = String(state.settings.maneuverNotifyDistanceM);
    el.maneuverNotifyValue.textContent = fmtKm(state.settings.maneuverNotifyDistanceM / 1000);
  }
  if (el.maneuverReminderInput && el.maneuverReminderValue) {
    el.maneuverReminderInput.value = String(state.settings.maneuverReminderDelaySec);
    el.maneuverReminderValue.textContent = `${state.settings.maneuverReminderDelaySec} s`;
  }
  if (el.poiNotifyInput && el.poiNotifyValue) {
    el.poiNotifyInput.value = String(state.settings.poiNotifyDistanceM);
    el.poiNotifyValue.textContent = fmtKm(state.settings.poiNotifyDistanceM / 1000);
  }
  if (el.cameraNotifyInput && el.cameraNotifyValue) {
    el.cameraNotifyInput.value = String(state.settings.cameraNotifyDistanceM);
    el.cameraNotifyValue.textContent = fmtKm(state.settings.cameraNotifyDistanceM / 1000);
  }
  if (el.roadRadiusInput && el.roadRadiusValue) {
    el.roadRadiusInput.value = String(state.settings.nearbyRoadRadiusM);
    el.roadRadiusValue.textContent = fmtKm(state.settings.nearbyRoadRadiusM / 1000);
  }
  for (const input of el.poiTypeInputs || []) {
    input.checked = state.settings.poiTypes.includes(input.dataset.poiType);
  }
  document.body.classList.toggle("lite-mode", isLiteMode());
  document.body.classList.toggle("mega-lite-mode", isMegaLiteMode());
  document.body.classList.toggle("ultra-lite-mode", isUltraLiteMode());
  document.body.classList.toggle("notification-only-mode", isNotificationOnlyMode());
}

function setManeuverZoomRadius(value) {
  state.settings.maneuverViewRadiusKm = clamp(Number(value) || DEFAULT_MANEUVER_VIEW_RADIUS_KM, MIN_MANEUVER_VIEW_RADIUS_KM, MAX_MANEUVER_VIEW_RADIUS_KM);
  updateSettingsUi();
  saveSettings();
  scheduleRender(true);
}

function setSoundMode(mode) {
  state.settings.soundMode = ["voice", "signal", "both"].includes(mode) ? mode : DEFAULT_SOUND_MODE;
  updateSettingsUi();
  saveSettings();
  if (state.settings.soundMode !== "voice") playAlarmSignal("test");
}

function setSignalVolume(value) {
  state.settings.signalVolume = clampNumber(value, DEFAULT_SIGNAL_VOLUME, 0, 100);
  updateSettingsUi();
  saveSettings();
  if (state.settings.soundMode !== "voice") playAlarmSignal("test");
}

function setManeuverNotifyDistance(value) {
  state.settings.maneuverNotifyDistanceM = clampNumber(value, DEFAULT_MANEUVER_NOTIFY_DISTANCE_M, 20, 2000);
  updateSettingsUi();
  saveSettings();
  scheduleRender(true);
}

function setManeuverReminderDelay(value) {
  state.settings.maneuverReminderDelaySec = clampNumber(value, DEFAULT_MANEUVER_REMINDER_DELAY_SEC, 3, 60);
  updateSettingsUi();
  saveSettings();
  if (state.lastSpokenInstruction >= 0 && !state.maneuverReminderSpoken) {
    scheduleManeuverReminder(state.lastSpokenInstruction);
  }
}

function setPoiNotifyDistance(value) {
  state.settings.poiNotifyDistanceM = clamp(Number(value) || DEFAULT_POI_NOTIFY_DISTANCE_M, 50, 5000);
  updateSettingsUi();
  saveSettings();
  scheduleRender(true);
}

function setCameraNotifyDistance(value) {
  state.settings.cameraNotifyDistanceM = clamp(Number(value) || DEFAULT_CAMERA_NOTIFY_DISTANCE_M, 50, 5000);
  updateSettingsUi();
  saveSettings();
  scheduleRender(true);
}

function setNearbyRoadRadius(value) {
  state.settings.nearbyRoadRadiusM = clampNumber(value, DEFAULT_NEARBY_ROAD_RADIUS_M, 0, 2000);
  updateSettingsUi();
  saveSettings();
  if (state.route) showStatus("Promień dróg zadziała przy kolejnym pobraniu trasy");
}

function setPoiType(type, enabled) {
  const current = new Set(state.settings.poiTypes);
  if (enabled) current.add(type);
  else current.delete(type);
  state.settings.poiTypes = normalizePoiTypes([...current]);
  updateSettingsUi();
  saveSettings();
}

function setPowerMode(mode) {
  state.settings.powerMode = ["full", "lite", "mega", "ultra"].includes(mode) ? mode : "full";
  updateSettingsUi();
  saveSettings();
  state.lastRenderKey = "";
  state.lastMotionRenderAt = 0;
  if (isNotificationOnlyMode()) stopMotionAnimation();
  else startMotionAnimation();
  showStatus(`Tryb ${powerModeLabel()} włączony`);
  scheduleRender(true);
}

function renderDeviceStatus() {
  if (el.deviceTempText) el.deviceTempText.textContent = "Brak dostępu";

  if (el.batteryText) {
    if (state.battery) {
      const level = Math.round(state.battery.level * 100);
      el.batteryText.textContent = state.battery.charging ? `${level}% ładuje` : `${level}%`;
    } else {
      el.batteryText.textContent = "Niedostępna";
    }
  }

  if (el.loadText) {
    const samples = state.deviceMonitor.frameSamples;
    if (samples.length < 8) {
      el.loadText.textContent = "--";
    } else {
      const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const fps = Math.round(1000 / Math.max(16, avg));
      const hot = avg > 42;
      const warm = avg > 26;
      el.loadText.textContent = hot ? `Wysokie (${fps} fps)` : warm ? `Średnie (${fps} fps)` : `OK (${fps} fps)`;
      el.loadText.classList.toggle("warn", hot);
    }
  }

  if (el.deviceHint) {
    const highLoad = state.deviceMonitor.frameSamples.length &&
      state.deviceMonitor.frameSamples.reduce((sum, value) => sum + value, 0) / state.deviceMonitor.frameSamples.length > 42;
    el.deviceHint.textContent = highLoad && !isLiteMode()
      ? "Telefon może się grzać: włącz Tryb Lite, żeby ograniczyć render i pobieranie."
      : "Strona WWW nie ma dostępu do czujnika temperatury telefonu.";
  }
}

async function initBatteryStatus() {
  if (!navigator.getBattery) {
    renderDeviceStatus();
    return;
  }
  try {
    state.battery = await navigator.getBattery();
    ["chargingchange", "levelchange"].forEach(eventName => {
      state.battery.addEventListener(eventName, renderDeviceStatus);
    });
  } catch (_) {
    state.battery = null;
  }
  renderDeviceStatus();
}

function sampleDeviceFrame(now) {
  const monitor = state.deviceMonitor;
  if (monitor.lastFrameAt) {
    monitor.frameSamples.push(now - monitor.lastFrameAt);
    if (monitor.frameSamples.length > 45) monitor.frameSamples.shift();
  }
  monitor.lastFrameAt = now;
  requestAnimationFrame(sampleDeviceFrame);
}

function startDeviceMonitor() {
  requestAnimationFrame(sampleDeviceFrame);
  state.deviceMonitor.timer = setInterval(renderDeviceStatus, DEVICE_MONITOR_INTERVAL_MS);
  initBatteryStatus();
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

function speechSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function loadSpeechVoices() {
  if (!speechSupported()) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  state.speech.voices = voices;
  state.speech.voice = voices.find(voice => voice.lang === "pl-PL")
    || voices.find(voice => voice.lang?.toLowerCase().startsWith("pl"))
    || voices.find(voice => voice.default)
    || voices[0]
    || null;
  return voices;
}

function createSpeechUtterance(text, { volume = 1 } = {}) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.speech.voice?.lang || "pl-PL";
  utterance.voice = state.speech.voice;
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.volume = volume;
  return utterance;
}

function audioContextSupported() {
  return "AudioContext" in window || "webkitAudioContext" in window;
}

function getAudioContext() {
  if (!audioContextSupported()) return null;
  if (!state.audio.context) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audio.context = new AudioCtx();
  }
  return state.audio.context;
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") ctx.resume();
    state.audio.unlocked = true;
    return true;
  } catch (_) {
    return false;
  }
}

function playTone(startAt, frequency, duration, volume) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), startAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.035);
}

function playAlarmSignal(kind = "notice") {
  if (state.settings.signalVolume <= 0 || !unlockAudio()) return;
  const nowMs = Date.now();
  if (kind !== "test" && nowMs - state.audio.lastSignalAt < 900) return;
  state.audio.lastSignalAt = nowMs;
  const ctx = state.audio.context;
  const volume = Math.max(0.01, state.settings.signalVolume / 100 * 0.18);
  const start = ctx.currentTime + 0.015;
  const patterns = {
    speed: [980, 760, 980],
    maneuver: [660, 880],
    reminder: [520, 760],
    test: [620, 840],
    notice: [740, 740]
  };
  const tones = patterns[kind] || patterns.notice;
  tones.forEach((frequency, index) => {
    playTone(start + index * 0.16, frequency, 0.105, volume);
  });
}

function startSpeechWatchdog() {
  if (state.speech.watchdog) return;
  state.speech.watchdog = setInterval(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    if (synth.paused) synth.resume();
    if (state.speech.speaking && Date.now() - state.speech.lastStartedAt > 20000) {
      state.speech.speaking = false;
      flushSpeechQueue();
    }
  }, SPEECH_WATCHDOG_MS);
}

function flushSpeechQueue() {
  if (!speechSupported() || !state.speech.unlocked || state.speech.speaking || !state.speech.queue.length) return;
  const synth = window.speechSynthesis;
  loadSpeechVoices();
  const text = state.speech.queue.shift();
  const utterance = createSpeechUtterance(text);
  state.speech.speaking = true;
  state.speech.lastStartedAt = Date.now();
  utterance.onend = () => {
    state.speech.speaking = false;
    setTimeout(flushSpeechQueue, 120);
  };
  utterance.onerror = () => {
    state.speech.speaking = false;
    setTimeout(flushSpeechQueue, 250);
  };
  try {
    synth.resume();
    synth.speak(utterance);
  } catch (_) {
    state.speech.speaking = false;
  }
}

function unlockSpeech(announce = false) {
  unlockAudio();
  if (!speechSupported()) {
    showStatus("Brak lektora w tej przeglądarce");
    if (announce) playAlarmSignal("test");
    return false;
  }
  try {
    const synth = window.speechSynthesis;
    loadSpeechVoices();
    synth.cancel();
    synth.resume();
    state.speech.unlocked = true;
    state.speech.speaking = false;
    state.speech.queue = [];
    startSpeechWatchdog();
    if (announce) announceAudio("Lektor działa", "test");
    else flushSpeechQueue();
    return true;
  } catch (_) {
    showStatus("Nie udało się uruchomić lektora");
    return false;
  }
}

function primeSpeechFromGesture() {
  unlockAudio();
  if (state.speech.unlocked || !speechSupported()) return;
  try {
    const synth = window.speechSynthesis;
    loadSpeechVoices();
    synth.resume();
    state.speech.unlocked = true;
    const primer = createSpeechUtterance(".", { volume: 0 });
    state.speech.speaking = true;
    state.speech.lastStartedAt = Date.now();
    primer.onend = () => {
      state.speech.speaking = false;
      flushSpeechQueue();
    };
    primer.onerror = () => {
      state.speech.speaking = false;
      flushSpeechQueue();
    };
    synth.speak(primer);
    startSpeechWatchdog();
  } catch (_) {
    state.speech.speaking = false;
  }
}

function announceAudio(text, kind = "notice") {
  if (!text) return;
  const mode = state.settings.soundMode || DEFAULT_SOUND_MODE;
  if (mode !== "voice") playAlarmSignal(kind);
  if (mode === "signal") return;
  speak(text);
}

function speak(text) {
  if (!speechSupported() || !text) return;
  loadSpeechVoices();
  state.speech.queue.push(String(text));
  if (state.speech.queue.length > SPEECH_QUEUE_LIMIT) {
    state.speech.queue.splice(0, state.speech.queue.length - SPEECH_QUEUE_LIMIT);
  }
  if (!state.speech.unlocked) {
    showStatus("Dotknij Test lektora, żeby włączyć głos na telefonie");
    return;
  }
  flushSpeechQueue();
}

if (speechSupported()) {
  loadSpeechVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    loadSpeechVoices();
    flushSpeechQueue();
  });
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

function markProgressUpdated() {
  state.progressUpdatedAt = performance.now();
}

function resetMotionProgress(progressKm = state.progressKm) {
  const progress = Math.max(0, Math.min(progressKm || 0, state.totalKm || 0));
  state.visualProgressKm = progress;
  state.cameraProgressKm = progress;
  state.vehicleBearing = null;
  markProgressUpdated();
  state.lastMotionFrameAt = 0;
}

function predictedProgressKm(seconds = VISUAL_PREDICT_SECONDS) {
  if (!state.route) return state.progressKm;
  const now = performance.now();
  const elapsedSec = state.progressUpdatedAt ? Math.min(1.6, Math.max(0, (now - state.progressUpdatedAt) / 1000)) : 0;
  const speedKmPerSec = Math.max(0, state.speedKmh) / 3600;
  return Math.min(state.totalKm, state.progressKm + speedKmPerSec * Math.min(seconds, elapsedSec));
}

function cameraTargetProgressKm(visualKm) {
  if (!state.route) return visualKm;
  const speedLeadKm = (Math.max(0, state.speedKmh) / 3600) * CAMERA_LOOKAHEAD_SECONDS;
  const leadKm = clamp(speedLeadKm, CAMERA_LOOKAHEAD_MIN_KM, CAMERA_LOOKAHEAD_MAX_KM);
  return Math.min(state.totalKm, visualKm + leadKm);
}

function routeCoordsUntil(km) {
  const coords = state.route?.coords || [];
  if (!coords.length) return [];
  const target = Math.max(0, Math.min(km, state.totalKm));
  const result = [];
  for (let i = 0; i < coords.length; i++) {
    if ((state.cumulative[i] || 0) <= target) result.push(coords[i]);
    else break;
  }
  const point = routePointAt(target);
  if (point) result.push(point);
  return result.filter((point, index, all) => {
    if (!index) return true;
    const prev = all[index - 1];
    return Math.abs(point.lat - prev.lat) > 0.0000001 || Math.abs(point.lng - prev.lng) > 0.0000001;
  });
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

function buildInstructions(osrmRoute, coords, totalKm = state.totalKm) {
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
        text: maneuverLabel(type, modifier, step.name || ""),
        lanes: normalizeLanes(step)
      });
    }
  }
  if (!items.some(item => item.type === "arrive") && coords.length) {
    const last = coords[coords.length - 1];
    items.push({
      lat: last.lat,
      lng: last.lng,
      doneKm: totalKm,
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
  const poiQueries = state.settings.poiTypes
    .map(type => POI_TYPE_CONFIG[type]?.overpass || "")
    .filter(Boolean)
    .map(query => query.split("{bbox}").join(bbox))
    .join("\n");
  return `[out:json][timeout:18];(
${poiQueries}
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
  const box = routeBoundsWithMargin(coords, Math.max(0.3, roadRadiusKm()));
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
  const selectedPoiTypes = new Set(state.settings.poiTypes);
  const raw = rawElements
    .map(normalizeOverpassElement)
    .filter(Boolean)
    .filter(point => point.type === "camera" || selectedPoiTypes.has(point.type));
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
  const maxDistanceKm = roadRadiusKm();
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
        item.distance <= maxDistanceKm ||
        all[index - 1]?.distance <= maxDistanceKm ||
        all[index + 1]?.distance <= maxDistanceKm
      ))
      .map(item => item.point);
    return { ...road, coords, distanceFromRoute };
  }).filter(road => road.distanceFromRoute <= maxDistanceKm).filter(road => {
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

function shouldUseManeuverZoom() {
  return state.simulation || state.gpsWatch !== null || state.progressKm > 0.03 || state.speedKmh > 2;
}

function getRouteViewBox(routePoint, boundsForRoute) {
  if (!routePoint || !shouldUseManeuverZoom() || !getManeuverFocusInstruction()) {
    return { x: 0, y: 0, width: 100, height: 100, zoomed: false };
  }
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
    announceAudio(`Uwaga, przekroczona prędkość. Limit ${state.currentLimit} kilometrów na godzinę`, "speed");
  }
}

function nextRouteNotice() {
  const cameras = state.route?.cameras || [];
  const camera = cameras.find(item => typeof item.doneKm === "number" && item.doneKm >= state.progressKm - 0.02);
  if (camera) {
    const distKm = Math.max(0, camera.doneKm - state.progressKm);
    if (distKm <= notifyKm(state.settings.cameraNotifyDistanceM)) {
      const limit = camera.limit ? ` ${camera.limit} km/h` : "";
      return `Radar${limit} za ${fmtKm(distKm)}`;
    }
  }
  const pois = state.route?.pois || [];
  const poi = pois.find(item => typeof item.doneKm === "number" && item.doneKm >= state.progressKm + 0.02);
  if (!poi) return "";
  const distKm = Math.max(0, poi.doneKm - state.progressKm);
  return distKm <= notifyKm(state.settings.poiNotifyDistanceM) ? `${poi.name || "POI"} za ${fmtKm(distKm)}` : "";
}

function routeNoticeText() {
  return shouldFetchRouteExtras() ? nextRouteNotice() : "";
}

function resetManeuverVoiceState() {
  if (state.maneuverReminderTimer) clearTimeout(state.maneuverReminderTimer);
  state.lastSpokenInstruction = -1;
  state.lastManeuverAlertAt = 0;
  state.maneuverReminderSpoken = false;
  state.maneuverReminderTimer = null;
}

function scheduleManeuverReminder(index) {
  if (state.maneuverReminderTimer) clearTimeout(state.maneuverReminderTimer);
  const delayMs = clampNumber(state.settings.maneuverReminderDelaySec, DEFAULT_MANEUVER_REMINDER_DELAY_SEC, 3, 60) * 1000;
  state.maneuverReminderTimer = setTimeout(() => {
    state.maneuverReminderTimer = null;
    if (state.lastSpokenInstruction !== index || state.maneuverReminderSpoken) return;
    const current = getNextInstruction();
    if (!current || state.nextInstructionIndex !== index) return;
    const distKm = Math.max(0, current.doneKm - state.progressKm);
    const notifyDistanceKm = clampNumber(state.settings.maneuverNotifyDistanceM, DEFAULT_MANEUVER_NOTIFY_DISTANCE_M, 20, 2000) / 1000;
    if (distKm > 0.02 && distKm <= notifyDistanceKm) {
      state.maneuverReminderSpoken = true;
      announceAudio(current.type === "arrive" ? `Przypomnienie, cel za ${fmtKm(distKm)}` : `Przypomnienie, za ${fmtKm(distKm)}, ${current.text}`, "reminder");
    }
  }, delayMs);
}

function scheduleRender(force = false) {
  if (force) {
    if (state.renderTimer) clearTimeout(state.renderTimer);
    state.renderTimer = null;
    render(true);
    return;
  }
  const now = Date.now();
  const interval = isLiteMode() ? LITE_RENDER_INTERVAL_MS : MIN_RENDER_INTERVAL_MS;
  const wait = Math.max(0, interval - (now - state.lastRenderAt));
  if (state.renderTimer) return;
  state.renderTimer = setTimeout(() => {
    state.renderTimer = null;
    render(false);
  }, wait);
}

function startMotionAnimation() {
  if (isNotificationOnlyMode()) return;
  if (state.motionFrame !== null || state.motionTimer !== null) return;
  scheduleMotionFrame();
}

function stopMotionAnimation() {
  if (state.motionFrame !== null) cancelAnimationFrame(state.motionFrame);
  if (state.motionTimer !== null) clearTimeout(state.motionTimer);
  state.motionFrame = null;
  state.motionTimer = null;
  state.lastMotionFrameAt = 0;
}

function scheduleMotionFrame() {
  const delay = isLiteMode() ? LITE_MOTION_INTERVAL_MS : 0;
  if (delay) {
    state.motionTimer = setTimeout(() => {
      state.motionTimer = null;
      state.motionFrame = requestAnimationFrame(animateMotion);
    }, delay);
  } else {
    state.motionFrame = requestAnimationFrame(animateMotion);
  }
}

function animateMotion(now) {
  state.motionFrame = null;
  if (!state.route) {
    stopMotionAnimation();
    return;
  }

  const previousFrameAt = state.lastMotionFrameAt || now;
  const dt = Math.min(80, Math.max(16, now - previousFrameAt));
  state.lastMotionFrameAt = now;

  const targetVisual = predictedProgressKm();
  const visualAlpha = 1 - Math.exp(-dt / 170);
  state.visualProgressKm += (targetVisual - state.visualProgressKm) * visualAlpha;

  const targetCamera = cameraTargetProgressKm(state.visualProgressKm);
  const cameraAlpha = 1 - Math.exp(-dt / 260);
  state.cameraProgressKm += (targetCamera - state.cameraProgressKm) * cameraAlpha;

  const visualDelta = Math.abs(targetVisual - state.visualProgressKm);
  const cameraDelta = Math.abs(targetCamera - state.cameraProgressKm);
  const motionInterval = isLiteMode() ? LITE_MOTION_INTERVAL_MS : 0;
  if (!motionInterval || now - state.lastMotionRenderAt >= motionInterval) {
    state.lastMotionRenderAt = now;
    render(true);
  }

  const shouldKeepMoving =
    visualDelta > MOTION_EPSILON_KM ||
    cameraDelta > MOTION_EPSILON_KM ||
    ((state.simulation || state.gpsWatch !== null) && state.speedKmh > 1 && state.visualProgressKm < state.totalKm);
  if (shouldKeepMoving) scheduleMotionFrame();
  else state.lastMotionFrameAt = 0;
}

function polyline(coords, b) {
  return coords.map(p => {
    const q = project(p, b);
    return `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
  }).join(" ");
}

function svgNum(value) {
  return Number(value).toFixed(4);
}

function pathData(coords, b, smooth = false) {
  const points = coords.map(p => project(p, b));
  if (!points.length) return "";
  const start = points[0];
  if (points.length === 1) return `M ${svgNum(start.x)} ${svgNum(start.y)}`;
  if (!smooth || points.length < 3) {
    return points
      .map((point, index) => `${index ? "L" : "M"} ${svgNum(point.x)} ${svgNum(point.y)}`)
      .join(" ");
  }
  const commands = [`M ${svgNum(start.x)} ${svgNum(start.y)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const prev = points[Math.max(0, i - 1)];
    const current = points[i];
    const next = points[i + 1];
    const after = points[Math.min(points.length - 1, i + 2)];
    const cp1 = {
      x: current.x + (next.x - prev.x) / 6,
      y: current.y + (next.y - prev.y) / 6
    };
    const cp2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6
    };
    commands.push(
      `C ${svgNum(cp1.x)} ${svgNum(cp1.y)} ${svgNum(cp2.x)} ${svgNum(cp2.y)} ${svgNum(next.x)} ${svgNum(next.y)}`
    );
  }
  return commands.join(" ");
}

function render(force = false) {
  const route = state.route;
  const routeId = route?.createdAt || "none";
  const liteMode = isLiteMode();
  const notificationOnlyMode = isNotificationOnlyMode();
  const modeKey = state.settings.powerMode;
  const summaryKey = `${state.settings.nearbyRoadRadiusM}`;
  const renderKey = route?.coords?.length
    ? `${routeId}:${modeKey}:${summaryKey}:${Math.round(state.progressKm * 125)}:${Math.round(state.speedKmh / 3)}:${state.nextInstructionIndex}:${state.currentLimit || 0}`
    : `empty:${modeKey}:${summaryKey}:${Math.round(state.speedKmh / 5)}`;
  if (!force && renderKey === state.lastRenderKey) return;
  state.lastRenderKey = renderKey;
  state.lastRenderAt = Date.now();
  state.lastRenderedSpeedKmh = state.speedKmh;

  el.svg.innerHTML = "";
  if (!route?.coords?.length) {
    applySvgViewBox({ x: 0, y: 0, width: 100, height: 100 });
    applyRouteCamera();
    el.vehicle.style.display = "none";
    state.vehicleBearing = null;
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
    el.laneGuide.innerHTML = "";
    el.laneGuide.classList.remove("visible");
    el.nextManeuverText.textContent = "--";
    return;
  }

  if (notificationOnlyMode) {
    el.svg.innerHTML = "";
    applySvgViewBox({ x: 0, y: 0, width: 100, height: 100 });
    applyRouteCamera();
    el.vehicle.style.display = "none";
    state.vehicleBearing = null;
    const percent = state.totalKm ? Math.round((state.progressKm / state.totalKm) * 100) : 0;
    el.sumDistance.textContent = fmtKm(state.totalKm);
    el.sumTime.innerHTML = routeTimeHtml(route);
    el.sumPoints.textContent = String(route.instructions?.length || 0);
    el.distance.textContent = `${fmtKm(Math.max(0, state.totalKm - state.progressKm))} do celu`;
    el.progress.textContent = `${percent}%`;
    el.speed.textContent = `${Math.round(state.speedKmh)} km/h`;
    renderSpeedLimit();
    renderManeuver();
    return;
  }

  const coords = route.coords;
  const visibleCoords = [
    ...coords,
    ...(!liteMode ? (route.nearbyRoads || []).flatMap(road => road.coords || []) : [])
  ];
  const b = bounds(visibleCoords.length ? visibleCoords : coords);
  const visualKm = Math.max(0, Math.min(state.visualProgressKm || state.progressKm, state.totalKm));
  const cameraKm = Math.max(0, Math.min(state.cameraProgressKm || visualKm, state.totalKm));
  const doneCoords = routeCoordsUntil(visualKm);
  const point = routePointAt(visualKm);
  const cameraPoint = routePointAt(cameraKm) || point;
  const viewBox = getRouteViewBox(cameraPoint, b);
  const smoothRoute = viewBox.zoomed && !liteMode;
  const all = pathData(coords, b, smoothRoute);
  applySvgViewBox(viewBox);
  applyRouteCamera();

  if (!liteMode) {
    for (const road of route.nearbyRoads || []) {
      if (!road.coords?.length) continue;
      el.svg.insertAdjacentHTML("beforeend", `<polyline class="nearby-road" points="${polyline(road.coords, b)}"><title>${road.name || "Droga OSM"}</title></polyline>`);
    }
  }
  el.svg.insertAdjacentHTML("beforeend", `<path class="route-bg" d="${all}"></path>`);
  el.svg.insertAdjacentHTML("beforeend", `<path class="route-line" d="${all}"></path>`);
  if (doneCoords.length > 1) {
    el.svg.insertAdjacentHTML("beforeend", `<path class="route-done" d="${pathData(doneCoords, b, smoothRoute)}"></path>`);
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
  if (!liteMode) {
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
  }

  if (point) {
    const q = project(point, b);
    const screen = svgPointToScreen(q, viewBox);
    state.vehicleBearing = smoothAngle(state.vehicleBearing, point.bearing, 0.32);
    el.vehicle.style.display = "grid";
    el.vehicle.style.left = `${screen.x}px`;
    el.vehicle.style.top = `${screen.y}px`;
    el.vehicle.style.transform = `translate(-50%, -50%) rotate(${state.vehicleBearing}deg)`;
  }

  const percent = state.totalKm ? Math.round((state.progressKm / state.totalKm) * 100) : 0;
  el.sumDistance.textContent = fmtKm(state.totalKm);
  el.sumTime.innerHTML = routeTimeHtml(route);
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
    el.laneGuide.innerHTML = "";
    el.laneGuide.classList.remove("visible");
    el.nextManeuverText.textContent = "";
    return;
  }
  const distKm = Math.max(0, current.doneKm - state.progressKm);
  el.maneuverIcon.textContent = current.arrow;
  el.maneuverDistance.textContent = current.type === "arrive" ? `${fmtKm(distKm)} do celu` : `${fmtKm(distKm)} do manewru`;
  el.maneuverText.textContent = current.text;
  const lanes = Array.isArray(current.lanes) ? current.lanes : [];
  el.laneGuide.innerHTML = lanes.map(lane => (
    `<span class="lane ${lane.active ? "active" : ""}">${lane.arrows}</span>`
  )).join("");
  el.laneGuide.classList.toggle("visible", lanes.length > 0);
  const notice = routeNoticeText();
  el.nextManeuverText.textContent = [next ? `Potem: ${next.text}` : "", notice].filter(Boolean).join(" · ");
  const notifyDistanceKm = clampNumber(state.settings.maneuverNotifyDistanceM, DEFAULT_MANEUVER_NOTIFY_DISTANCE_M, 20, 2000) / 1000;
  const isInNotifyRange = distKm <= notifyDistanceKm;
  if (isInNotifyRange && state.lastSpokenInstruction !== state.nextInstructionIndex) {
    state.lastSpokenInstruction = state.nextInstructionIndex;
    state.lastManeuverAlertAt = Date.now();
    state.maneuverReminderSpoken = false;
    scheduleManeuverReminder(state.nextInstructionIndex);
    announceAudio(current.type === "arrive" ? `Za ${fmtKm(distKm)} dotrzesz do celu` : `Za ${fmtKm(distKm)}, ${current.text}`, "maneuver");
  } else if (
    isInNotifyRange &&
    state.lastSpokenInstruction === state.nextInstructionIndex &&
    !state.maneuverReminderSpoken &&
    Date.now() - state.lastManeuverAlertAt >= state.settings.maneuverReminderDelaySec * 1000 &&
    distKm > 0.02
  ) {
    if (state.maneuverReminderTimer) clearTimeout(state.maneuverReminderTimer);
    state.maneuverReminderTimer = null;
    state.maneuverReminderSpoken = true;
    announceAudio(current.type === "arrive" ? `Przypomnienie, cel za ${fmtKm(distKm)}` : `Przypomnienie, za ${fmtKm(distKm)}, ${current.text}`, "reminder");
  }
}

function buildRouteChoice(route, index, destName) {
  const coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const cumulative = buildCumulative(coords);
  const totalKm = cumulative[cumulative.length - 1] || route.distance / 1000;
  return {
    index,
    label: index === 0 ? "Najlepsza" : `Alternatywa ${index}`,
    route: {
      coords,
      instructions: buildInstructions(route, coords, totalKm),
      pois: [],
      cameras: [],
      speedLimits: [],
      nearbyRoads: [],
      durationSec: route.duration,
      createdAt: Date.now(),
      destName
    },
    totalKm,
    durationSec: route.duration,
    distanceKm: route.distance / 1000
  };
}

function renderRouteChoices() {
  if (!el.routeChoices) return;
  if (!state.routeChoices.length) {
    el.routeChoices.innerHTML = "";
    el.routeChoices.classList.remove("visible");
    return;
  }
  el.routeChoices.classList.add("visible");
  el.routeChoices.innerHTML = state.routeChoices.map(choice => {
    const active = choice.index === state.activeRouteChoiceIndex;
    return `
      <div class="route-choice ${active ? "active" : ""}">
        <button type="button" data-route-preview="${choice.index}">
          <strong>${choice.label}</strong>
          <small>${fmtTime(choice.durationSec)} · przyjazd ${arrivalTimeText(choice.route)} · ${fmtKm(choice.distanceKm)}</small>
        </button>
        <button type="button" data-route-choice="${choice.index}">${active ? "Wybierz podgląd" : "Wybierz"}</button>
      </div>
    `;
  }).join("");
}

function hasPendingRouteChoice() {
  return state.routeChoices.length > 0;
}

function previewRouteChoice(index = 0) {
  const choice = state.routeChoices[index];
  if (!choice) return;
  state.activeRouteChoiceIndex = index;
  state.route = { ...choice.route, createdAt: Date.now() };
  state.cumulative = buildCumulative(state.route.coords);
  state.totalKm = choice.totalKm;
  state.progressKm = 0;
  state.speedKmh = 0;
  state.currentLimit = null;
  state.lastSpeedAlertAt = 0;
  state.nextInstructionIndex = 0;
  resetManeuverVoiceState();
  resetMotionProgress(0);
  renderRouteChoices();
  scheduleRender(true);
}

async function selectRouteChoice(index) {
  const choice = state.routeChoices[index];
  if (!choice) return;
  stopSimulation();
  state.activeRouteChoiceIndex = index;
  state.start = state.routeChoiceStart;
  state.dest = state.routeChoiceDest;
  state.route = { ...choice.route, createdAt: Date.now() };
  state.cumulative = buildCumulative(state.route.coords);
  state.totalKm = choice.totalKm;
  state.progressKm = 0;
  state.speedKmh = 0;
  state.currentLimit = null;
  state.lastSpeedAlertAt = 0;
  state.nextInstructionIndex = 0;
  resetManeuverVoiceState();
  resetMotionProgress(0);
  renderRouteChoices();
  if (!shouldFetchRouteExtras()) {
    showStatus(`Tryb ${powerModeLabel()}: pominięto dodatkowe warstwy`);
  } else {
    showStatus("Pobieranie POI i fotoradarów...");
    try {
      const routePoints = await loadRoutePoints(state.route.coords);
      state.route.pois = routePoints.pois;
      state.route.cameras = routePoints.cameras;
      state.route.speedLimits = routePoints.speedLimits;
      state.route.nearbyRoads = routePoints.nearbyRoads;
    } catch (error) {
      console.warn("Nie udało się pobrać punktów OSM", error);
    }
  }
  showStatus(!shouldFetchRouteExtras()
    ? `Trasa wybrana w trybie ${powerModeLabel()}`
    : `Trasa wybrana: ${state.route.pois.length} POI, ${state.route.cameras.length} radarów, ${state.route.speedLimits.length} limitów, ${state.route.nearbyRoads.length} dróg`);
  state.routeChoices = [];
  state.activeRouteChoiceIndex = -1;
  state.activeSavedRouteId = null;
  renderRouteChoices();
  state.activeSavedRouteId = null;
  persistLastRoute();
  updateSavedInfo();
  scheduleRender(true);
  setPanelOpen(false);
  announceAudio("Trasa wybrana", "notice");
}

async function createRoute() {
  try {
    stopSimulation();
    state.routeChoices = [];
    state.activeRouteChoiceIndex = -1;
    renderRouteChoices();
    showStatus("Pobieranie startu GPS...");
    const destQuery = el.dest.value.trim();
    if (!destQuery) throw new Error("Wpisz cel");
    const start = await locateStart();
    showStatus("Szukam celu...");
    const dest = await geocode(destQuery);
    showStatus("Wyznaczanie trasy...");
    const url = `${OSRM_URL}/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Błąd serwera trasy");
    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("Nie udało się wyznaczyć trasy");
    state.start = start;
    state.dest = dest;
    state.routeChoiceStart = start;
    state.routeChoiceDest = dest;
    state.routeChoices = data.routes.slice(0, 3).map((route, index) => buildRouteChoice(route, index, destQuery));
    previewRouteChoice(0);
    showStatus(state.routeChoices.length > 1
      ? `Znaleziono ${state.routeChoices.length} trasy. Wybierz wariant.`
      : "Znaleziono trasę. Potwierdź wybór.");
    setPanelOpen(true);
    announceAudio("Wybierz trasę", "notice");
  } catch (error) {
    showStatus(error.message || "Błąd");
    alert(error.message || "Nie udało się wyznaczyć trasy");
    scheduleRender(true);
  }
}

function activeRouteSnapshot() {
  return {
    start: state.start,
    dest: state.dest,
    route: state.route,
    progressKm: state.progressKm
  };
}

function persistLastRoute() {
  if (!state.route) return;
  localStorage.setItem(STORE_KEY, JSON.stringify(activeRouteSnapshot()));
}

function routeDefaultName(snapshot = activeRouteSnapshot()) {
  const destName = snapshot.route?.destName || snapshot.dest?.name || "Trasa";
  const date = new Date().toLocaleDateString("pl-PL");
  return `${destName}`.split(",")[0].trim() || `Trasa ${date}`;
}

function savedRouteDistanceKm(route) {
  const coords = route?.coords || [];
  if (coords.length < 2) return 0;
  const cumulative = buildCumulative(coords);
  return cumulative[cumulative.length - 1] || 0;
}

function normalizeSavedRoute(entry, index = 0) {
  if (!entry?.route?.coords?.length) return null;
  return {
    id: entry.id || `route-${Date.now()}-${index}`,
    name: entry.name || routeDefaultName(entry),
    favorite: entry.favorite === true,
    savedAt: entry.savedAt || entry.route?.createdAt || Date.now(),
    start: entry.start || null,
    dest: entry.dest || null,
    route: entry.route,
    progressKm: Math.max(0, Number(entry.progressKm) || 0)
  };
}

function readSavedRoutes() {
  let routes = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTES_STORE_KEY) || "[]");
    if (Array.isArray(parsed)) routes = parsed.map(normalizeSavedRoute).filter(Boolean);
  } catch (_) {
    routes = [];
  }
  if (!routes.length) {
    try {
      const legacy = normalizeSavedRoute(JSON.parse(localStorage.getItem(STORE_KEY) || "null"));
      if (legacy) {
        legacy.id = "legacy-last-route";
        legacy.name = legacy.name || "Ostatnia trasa";
        routes = [legacy];
        writeSavedRoutes(routes);
      }
    } catch (_) {
      routes = [];
    }
  }
  return routes.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.savedAt - a.savedAt);
}

function writeSavedRoutes(routes) {
  localStorage.setItem(ROUTES_STORE_KEY, JSON.stringify(routes));
}

function applySavedRoute(saved) {
  state.start = saved.start;
  state.dest = saved.dest;
  state.route = saved.route;
  state.activeSavedRouteId = saved.id || null;
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
  resetManeuverVoiceState();
  state.routeChoices = [];
  state.activeRouteChoiceIndex = -1;
  renderRouteChoices();
  resetMotionProgress(state.progressKm);
  persistLastRoute();
  updateSavedInfo();
  showStatus(`Wczytano: ${saved.name}`);
  scheduleRender(true);
  setPanelOpen(false);
}

function saveRoute() {
  if (!state.route) return alert("Brak trasy do zapisania");
  if (hasPendingRouteChoice()) return alert("Najpierw wybierz wariant trasy");
  const snapshot = activeRouteSnapshot();
  const defaultName = routeDefaultName(snapshot);
  const name = (prompt("Nazwa trasy", defaultName) || "").trim();
  if (!name) return;
  const routes = readSavedRoutes();
  const entry = normalizeSavedRoute({
    ...snapshot,
    id: `route-${Date.now()}`,
    name,
    favorite: false,
    savedAt: Date.now()
  });
  routes.unshift(entry);
  writeSavedRoutes(routes);
  state.activeSavedRouteId = entry.id;
  persistLastRoute();
  updateSavedInfo();
  showStatus(`Zapisano: ${entry.name}`);
}

function loadRoute(id = null) {
  const routes = readSavedRoutes();
  if (!routes.length) return alert("Brak zapisanych tras");
  const saved = id ? routes.find(route => route.id === id) : routes.find(route => route.favorite) || routes[0];
  if (!saved) return alert("Nie znaleziono zapisanej trasy");
  applySavedRoute(saved);
}

function deleteSavedRoute(id) {
  const routes = readSavedRoutes();
  const route = routes.find(item => item.id === id);
  if (!route) return;
  if (!confirm(`Usunąć trasę "${route.name}"?`)) return;
  writeSavedRoutes(routes.filter(item => item.id !== id));
  if (state.activeSavedRouteId === id) {
    state.activeSavedRouteId = null;
    localStorage.removeItem(STORE_KEY);
  }
  updateSavedInfo();
  showStatus("Usunięto trasę");
}

function toggleFavoriteRoute(id) {
  const routes = readSavedRoutes().map(route => (
    route.id === id ? { ...route, favorite: !route.favorite } : route
  ));
  writeSavedRoutes(routes);
  updateSavedInfo();
}

function updateSavedInfo() {
  const routes = readSavedRoutes();
  if (!routes.length) {
    el.savedInfo.innerHTML = `<strong>Zapisane trasy</strong><span>Brak zapisanych tras</span>`;
    return;
  }
  el.savedInfo.innerHTML = `
    <strong>Zapisane trasy</strong>
    <div class="saved-routes">
      ${routes.map(route => {
        const date = new Date(route.savedAt || Date.now()).toLocaleDateString("pl-PL");
        const active = route.id === state.activeSavedRouteId;
        const title = `${route.favorite ? "★ " : ""}${route.name}`;
        return `
          <article class="saved-route ${active ? "active" : ""}">
            <div>
              <strong>${escapeHtml(title)}</strong>
              <small>${fmtTime(route.route?.durationSec)} · ${fmtKm(savedRouteDistanceKm(route.route))} · ${date}</small>
            </div>
            <nav>
              <button type="button" data-saved-load="${escapeHtml(route.id)}">Wczytaj</button>
              <button type="button" data-saved-favorite="${escapeHtml(route.id)}">${route.favorite ? "★" : "☆"}</button>
              <button type="button" data-saved-delete="${escapeHtml(route.id)}">Usuń</button>
            </nav>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function startSimulation() {
  if (!state.route) return alert("Najpierw wyznacz albo wczytaj trasę");
  if (hasPendingRouteChoice()) return alert("Najpierw wybierz wariant trasy");
  if (state.simulation) return stopSimulation();
  state.progressKm = 0;
  resetMotionProgress(0);
  state.nextInstructionIndex = 0;
  resetManeuverVoiceState();
  showStatus("Symulacja jazdy");
  announceAudio("Symulacja rozpoczęta", "notice");
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
      announceAudio("Dotarłeś do celu", "notice");
    }
    markProgressUpdated();
    startMotionAnimation();
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
  markProgressUpdated();
  showStatus(state.route ? "Trasa zatrzymana" : "Brak trasy");
  startMotionAnimation();
  scheduleRender(true);
}

function startGps() {
  if (!state.route) return alert("Najpierw wyznacz albo wczytaj trasę");
  if (hasPendingRouteChoice()) return alert("Najpierw wybierz wariant trasy");
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
    markProgressUpdated();
    startMotionAnimation();
    const movedEnough = Math.abs(state.progressKm - previousProgress) >= GPS_RENDER_STEP_KM;
    const speedChangedEnough = Math.abs(state.speedKmh - state.lastRenderedSpeedKmh) >= GPS_SPEED_RENDER_STEP_KMH;
    if (isUltraLiteMode()) {
      scheduleRender(true);
    } else if (movedEnough || speedChangedEnough) {
      scheduleRender();
    }
  }, error => {
    showStatus("Błąd GPS");
    alert(gpsErrorMessage(error));
  }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 2500 });
}

function clearRoute() {
  stopAll();
  stopMotionAnimation();
  state.start = null;
  state.dest = null;
  state.route = null;
  state.activeSavedRouteId = null;
  state.routeChoices = [];
  state.routeChoiceStart = null;
  state.routeChoiceDest = null;
  state.activeRouteChoiceIndex = -1;
  state.cumulative = [];
  state.totalKm = 0;
  state.progressKm = 0;
  state.visualProgressKm = 0;
  state.cameraProgressKm = 0;
  state.speedKmh = 0;
  state.currentLimit = null;
  state.lastSpeedAlertAt = 0;
  state.nextInstructionIndex = 0;
  resetManeuverVoiceState();
  localStorage.removeItem(STORE_KEY);
  showStatus("Brak trasy");
  updateSavedInfo();
  renderRouteChoices();
  scheduleRender(true);
  setPanelOpen(true);
}

el.routeBtn.addEventListener("click", () => {
  primeSpeechFromGesture();
  createRoute();
});
el.locateBtn.addEventListener("click", () => locateStart().catch(error => alert(error.message)));
el.saveBtn.addEventListener("click", saveRoute);
el.loadBtn.addEventListener("click", () => loadRoute());
el.simBtn.addEventListener("click", () => {
  primeSpeechFromGesture();
  startSimulation();
});
el.stopBtn.addEventListener("click", stopAll);
el.gpsBtn.addEventListener("click", () => {
  primeSpeechFromGesture();
  startGps();
});
el.menuBtn.addEventListener("click", () => el.drawer.classList.add("open"));
el.closeMenuBtn.addEventListener("click", () => el.drawer.classList.remove("open"));
el.voiceBtn.addEventListener("click", () => unlockSpeech(true));
el.powerModeInput.addEventListener("change", event => setPowerMode(event.target.value));
if (el.soundModeInput) el.soundModeInput.addEventListener("change", event => setSoundMode(event.target.value));
if (el.signalVolumeInput) el.signalVolumeInput.addEventListener("input", event => setSignalVolume(event.target.value));
el.routeChoices.addEventListener("click", event => {
  const preview = event.target.closest("[data-route-preview]");
  if (preview) {
    previewRouteChoice(Number(preview.dataset.routePreview));
    return;
  }
  const choice = event.target.closest("[data-route-choice]");
  if (choice) selectRouteChoice(Number(choice.dataset.routeChoice));
});
el.savedInfo.addEventListener("click", event => {
  const load = event.target.closest("[data-saved-load]");
  if (load) {
    loadRoute(load.dataset.savedLoad);
    return;
  }
  const favorite = event.target.closest("[data-saved-favorite]");
  if (favorite) {
    toggleFavoriteRoute(favorite.dataset.savedFavorite);
    return;
  }
  const remove = event.target.closest("[data-saved-delete]");
  if (remove) deleteSavedRoute(remove.dataset.savedDelete);
});
el.maneuverZoomInput.addEventListener("input", event => setManeuverZoomRadius(event.target.value));
if (el.maneuverNotifyInput) el.maneuverNotifyInput.addEventListener("input", event => setManeuverNotifyDistance(event.target.value));
if (el.maneuverReminderInput) el.maneuverReminderInput.addEventListener("input", event => setManeuverReminderDelay(event.target.value));
if (el.poiNotifyInput) el.poiNotifyInput.addEventListener("input", event => setPoiNotifyDistance(event.target.value));
if (el.cameraNotifyInput) el.cameraNotifyInput.addEventListener("input", event => setCameraNotifyDistance(event.target.value));
if (el.roadRadiusInput) el.roadRadiusInput.addEventListener("input", event => setNearbyRoadRadius(event.target.value));
for (const input of el.poiTypeInputs || []) {
  input.addEventListener("change", event => setPoiType(event.target.dataset.poiType, event.target.checked));
}
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
startDeviceMonitor();
setPanelOpen(true);
scheduleRender(true);
