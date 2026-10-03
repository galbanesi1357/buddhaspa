import Anthropic from "./vendor/anthropic-sdk.js";
import { initDiary, addEvent, addNote, b64ToBlob, generateReport, openDiary, openReport, loadMemory, memoryNear, memorySearch, describeMemory, sessionSummary, discardBetween, shrinkImage, offerCopy } from "./diario.js?v=5";

// ---------- Configuração ----------
// Modelos: chat e guia ao vivo usam o Sonnet por padrão (mais barato); relatórios usam sempre o Opus
const MODELS = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
const NOMINATIM = "https://nominatim.openstreetmap.org";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const ROUTER = { foot: "routed-foot", car: "routed-car", bike: "routed-bike" };
const MODE_LABEL = { foot: "a pé", car: "de carro", bike: "de bicicleta" };
// Distâncias (m) para avisar antes de cada manobra e para considerar que ela foi feita
const NAV = {
  foot: { far: 120, near: 35, pass: 15, off: 40, arrive: 20 },
  bike: { far: 200, near: 60, pass: 20, off: 50, arrive: 25 },
  car: { far: 400, near: 120, pass: 30, off: 70, arrive: 40 },
};

// Versão deste código. Ao publicar, aumente aqui, em version.json e em app.js?v= no index.html.
const APP_VERSION = 25;

const store = {
  get(k, d) { try { const v = localStorage.getItem("guia." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("guia." + k, JSON.stringify(v)); } catch {} },
};

const S = {
  key: store.get("key", ""),
  mode: store.get("mode", "foot"),
  lookEvery: store.get("lookEvery", "turns"),
  rate: store.get("rate", 1.5),
  livePace: store.get("livePace", "continuo"),
  liveDirections: store.get("liveDirections", false),
  navVoice: store.get("navVoice", false),
  voiceURI: store.get("voiceURI", ""),
  openaiKey: store.get("openaiKey", ""),
  diaryOn: store.get("diaryOn", true),
  clipEvery: store.get("clipEvery", "2"),
  lastLogPos: null,
  lastClip: 0,
  recording: false,
  clipAudio: store.get("clipAudio", true),
  memory: [],
  chatModel: store.get("chatModel", "sonnet"),
  guideModel: store.get("guideModel2", "sonnet"),
  facing: "environment", // "user" = câmera frontal (selfie)
  liveSessionStart: 0,
  openaiVoice: store.get("openaiVoice", "coral"),
  live: false,
  liveBusy: false,
  liveReadyAt: 0,
  liveSaid: [],
  liveErrors: 0,
  livePois: [],
  livePoisAt: null,
  compass: null,
  compassAt: 0,
  voice: store.get("voice", false),
  pos: null,           // {lat, lon, acc, heading, speed, t}
  address: null,
  lastGeocode: null,
  camOn: false,
  history: [],
  busy: false,
  route: null,         // {dest, steps, coords, total, duration}
  stepIdx: 0,
  ann: {},
  offCount: 0,
  lastReroute: 0,
  lastLook: 0,
  guideBusy: false,
  arrived: false,
  wakeLock: null,
};

const $ = (id) => document.getElementById(id);
let client = S.key ? new Anthropic({ apiKey: S.key, dangerouslyAllowBrowser: true }) : null;

// ---------- Utilidades geográficas ----------
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const CARD = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];
const cardinal = (deg) => CARD[Math.round(deg / 45) % 8];
// Para onde o celular aponta: bússola (se recente) ou direção do movimento
function facing() {
  if (S.compass != null && Date.now() - S.compassAt < 3000) return S.compass;
  return S.pos?.heading ?? null;
}
function relative(deg) {
  const f = facing();
  if (f == null) return null;
  const r = (deg - f + 360) % 360;
  if (r < 30 || r > 330) return "à frente";
  if (r < 150) return "à direita";
  if (r <= 210) return "atrás";
  return "à esquerda";
}
function fmtDist(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
function spokenDist(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} metros`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} quilômetros`;
}
// Distância de um ponto até a linha da rota (projeção local equiretangular)
function distToLine(p, coords) {
  const kx = Math.cos(rad(p.lat)) * 111320, ky = 110540;
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i - 1].lon - p.lon) * kx, ay = (coords[i - 1].lat - p.lat) * ky;
    const bx = (coords[i].lon - p.lon) * kx, by = (coords[i].lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// ---------- Mapa ----------
const map = L.map("map", { zoomControl: false, attributionControl: true }).setView([-23.5505, -46.6333], 15);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "© OpenStreetMap",
}).addTo(map);
const meMarker = L.marker([0, 0], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18] }) });
let accCircle = null, routeLine = null, destMarker = null, follow = true;
const poiLayer = L.layerGroup().addTo(map);
function setFollow(on) {
  follow = on;
  $("locateBtn").setAttribute("aria-pressed", String(on));
}
map.on("dragstart", () => setFollow(false));
$("locateBtn").addEventListener("click", () => {
  if (!S.pos) { addMsg("Ainda procurando sua localização. Verifique se o GPS e a permissão estão ligados.", "sys"); return; }
  setFollow(true);
  map.setView([S.pos.lat, S.pos.lon], Math.max(map.getZoom(), 17));
});

// ---------- Fala ----------
// As vozes são as do próprio celular. Preferimos as naturais/neurais em português do Brasil
// e evitamos as compactas, que soam robóticas.
let ptVoice = null;
const NATURAL = /natural|neural|premium|enhanced|aprimorad|online|network|wavenet|studio|siri/i;
function voiceScore(v) {
  const lang = (v.lang || "").toLowerCase().replace("_", "-");
  if (!lang.startsWith("pt")) return -1;
  let sc = lang === "pt-br" ? 20 : 2;
  if (NATURAL.test(v.name)) sc += 10;
  if (/google/i.test(v.name)) sc += 5;
  if (v.localService === false) sc += 3;
  if (/compact|eloquence|espeak|robot/i.test(v.name)) sc -= 8;
  return sc;
}
function ptVoices() {
  return speechSynthesis.getVoices().filter((v) => voiceScore(v) >= 0).sort((a, b) => voiceScore(b) - voiceScore(a));
}
function pickVoice() {
  const vs = ptVoices();
  ptVoice = vs.find((v) => v.voiceURI === S.voiceURI) || vs[0] || null;
  fillVoiceSelect();
}
function fillVoiceSelect() {
  const sel = document.getElementById("voiceSel");
  if (!sel) return;
  const vs = ptVoices();
  sel.replaceChildren(new Option(vs.length ? `Automática (${vs[0].name})` : "Nenhuma voz em português encontrada", ""));
  vs.forEach((v) => {
    const tags = [v.lang, NATURAL.test(v.name) || v.localService === false ? "natural" : ""].filter(Boolean).join(", ");
    sel.add(new Option(`${v.name} (${tags})`, v.voiceURI));
  });
  sel.value = vs.some((v) => v.voiceURI === S.voiceURI) ? S.voiceURI : "";
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
// Fila própria de fala: frases curtas, para poder mudar a velocidade e continuar de onde parou
const speechQ = [];
function enqueueSpeech(text) {
  const item = { text, idx: 0, queuedAt: Date.now(), startedAt: 0, dead: false };
  if (cloudVoiceOn()) { cloudEnqueue(item); return; }
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  if (ptVoice) u.voice = ptVoice;
  u.rate = S.rate;
  u.onstart = () => { item.startedAt = Date.now(); };
  u.onboundary = (e) => { if (e.charIndex != null) item.idx = e.charIndex; };
  u.onend = u.onerror = () => {
    if (item.dead) return;
    const i = speechQ.indexOf(item);
    if (i >= 0) speechQ.splice(i, 1);
    S.lastSpeechEnd = Date.now();
  };
  item.u = u;
  speechQ.push(item);
  speechSynthesis.speak(u);
}
function speak(text, { interrupt = false } = {}) {
  if (!S.voice || !text || !(cloudVoiceOn() || "speechSynthesis" in window)) return;
  if (interrupt) stopSpeech();
  const clean = text.replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?…]+[.!?…]*/g) || [clean];
  parts.map((p) => p.trim()).filter(Boolean).forEach(enqueueSpeech);
}
function stopSpeech() {
  speechQ.splice(0).forEach((i) => { i.dead = true; i.finish?.(); });
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  cloudStop();
}
// Está falando? Ignora sinais presos (alguns celulares nunca avisam que terminaram)
function isSpeaking() {
  while (speechQ.length) {
    const h = speechQ[0];
    const est = (h.text.split(" ").length / (2.6 * S.rate)) * 1000 + 3000;
    const t0 = h.startedAt || Math.max(h.queuedAt, S.lastSpeechEnd || 0);
    // A voz da nuvem precisa baixar o áudio antes de começar
    const limit = h.startedAt ? est : est + (h.cloud ? 15000 : 2000);
    if (Date.now() - t0 <= limit) break;
    h.dead = true; speechQ.shift(); S.lastSpeechEnd = Date.now();
    h.finish?.();
    if (!speechQ.length && "speechSynthesis" in window) speechSynthesis.cancel();
  }
  return speechQ.length > 0;
}
// Retoma o que falta na nova velocidade, a partir da última palavra falada
function respeakAtCurrentRate() {
  if (cloudAudio) { cloudAudio.defaultPlaybackRate = cloudAudio.playbackRate = S.rate; }
  if (!speechQ.length || speechQ[0].cloud) return;
  const items = speechQ.splice(0);
  items.forEach((i) => { i.dead = true; });
  speechSynthesis.cancel();
  const rest = items.map((it, k) => (k === 0 && it.startedAt ? it.text.slice(it.idx) : it.text).trim()).filter(Boolean);
  setTimeout(() => rest.forEach(enqueueSpeech), 80);
}

// ---------- Voz natural na nuvem (OpenAI, opcional) ----------
// Só é usada se houver uma chave da OpenAI em Ajustes; senão fica a voz do celular.
const OPENAI_TTS = "https://api.openai.com/v1/audio/speech";
const TTS_STYLE = "Fale em português do Brasil, com sotaque brasileiro natural, em tom caloroso e animado de guia turístico, com ritmo fluido.";
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
const cloudAudio = typeof Audio === "function" ? new Audio() : null;
if (cloudAudio) { cloudAudio.preservesPitch = true; cloudAudio.webkitPreservesPitch = true; }
let cloudCtrl = new AbortController(), cloudPumping = false, cloudFailed = false, audioUnlocked = false;

function cloudVoiceOn() { return !!(S.openaiKey && cloudAudio && !cloudFailed); }

// iPhone só deixa tocar áudio depois de um toque; destrava o player no primeiro toque
function unlockAudio() {
  if (audioUnlocked || !cloudAudio || !S.openaiKey) return;
  audioUnlocked = true;
  cloudAudio.src = SILENT_WAV;
  cloudAudio.play().catch(() => { audioUnlocked = false; });
}
document.addEventListener("click", unlockAudio, true);

async function fetchTTS(text, key = S.openaiKey, voice = S.openaiVoice, signal = cloudCtrl.signal) {
  const r = await fetch(OPENAI_TTS, {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, instructions: TTS_STYLE, response_format: "mp3" }),
  });
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json())?.error?.code || ""; } catch {}
    const msg = r.status === 401 ? "A chave da OpenAI não foi aceita."
      : r.status === 429 && /quota/.test(detail) ? "A conta da OpenAI está sem créditos."
      : r.status === 429 ? "Muitas solicitações à OpenAI seguidas."
      : `A OpenAI respondeu com erro (${r.status}).`;
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return URL.createObjectURL(await r.blob());
}

function cloudEnqueue(item) {
  item.cloud = true;
  item.audio = fetchTTS(item.text); // já baixa enquanto a frase anterior toca
  item.audio.catch(() => {});
  speechQ.push(item);
  cloudPump();
}

async function cloudPump() {
  if (cloudPumping) return;
  cloudPumping = true;
  try {
    while (speechQ.length && speechQ[0].cloud) {
      const it = speechQ[0];
      let url;
      try { url = await it.audio; } catch (e) {
        if (it.dead || e.name === "AbortError") { if (speechQ[0] === it) speechQ.shift(); continue; }
        // Falhou: avisa uma vez e passa a usar a voz do celular
        cloudFailed = true;
        addMsg(`${e.message} Usando a voz do celular.`, "err");
        const rest = speechQ.splice(0).filter((i) => !i.dead);
        rest.forEach((i) => { i.dead = true; });
        rest.forEach((i) => enqueueSpeech(i.text));
        break;
      }
      if (it.dead) { URL.revokeObjectURL(url); continue; }
      it.startedAt = Date.now();
      cloudAudio.src = url;
      cloudAudio.defaultPlaybackRate = cloudAudio.playbackRate = S.rate;
      await new Promise((res) => {
        it.finish = res;
        cloudAudio.onended = cloudAudio.onerror = res;
        cloudAudio.play().catch(res);
      });
      URL.revokeObjectURL(url);
      if (speechQ[0] === it) { speechQ.shift(); S.lastSpeechEnd = Date.now(); }
    }
  } finally {
    cloudPumping = false;
  }
}

function cloudStop() {
  cloudCtrl.abort();
  cloudCtrl = new AbortController();
  if (cloudAudio && !cloudAudio.paused) cloudAudio.pause();
}

// ---------- Interface de conversa ----------
function addMsg(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  $("chat").appendChild(d);
  $("chat").scrollTop = $("chat").scrollHeight;
  return d;
}

// ---------- Localização ----------
// ---------- Diário: o que vai sendo guardado ----------
function here() {
  return S.pos ? { lat: +S.pos.lat.toFixed(6), lon: +S.pos.lon.toFixed(6), addr: S.address?.curto || null } : { addr: S.address?.curto || null };
}
function journal(type, data = {}, b64 = null) {
  if (!S.diaryOn) return;
  addEvent(type, { ...here(), ...data }, b64 ? b64ToBlob(b64) : null);
}
function logTrack() {
  if (!S.diaryOn || !S.pos || S.pos.acc > 80) return;
  const last = S.lastLogPos;
  if (last && dist(last, S.pos) < 25 && Date.now() - last.t < 120000) return;
  S.lastLogPos = { lat: S.pos.lat, lon: S.pos.lon, t: Date.now() };
  addEvent("pos", { lat: +S.pos.lat.toFixed(6), lon: +S.pos.lon.toFixed(6), acc: Math.round(S.pos.acc), addr: S.address?.curto || null });
}

// Clipe curto da câmera para o diário
async function recordClip(sec = 10, manual = false) {
  if (!stream || S.recording || typeof MediaRecorder === "undefined" || !S.diaryOn) return;
  const type = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) { if (manual) addMsg("Este navegador não grava vídeo.", "err"); return; }
  S.recording = true; S.lastClip = Date.now();
  $("clipBtn").classList.add("recording"); $("clipBtn").textContent = "● Gravando…";
  let mic = null;
  try {
    // Som ambiente: o microfone fica ligado só durante o clipe
    if (S.clipAudio && !rec) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        if (manual && !S.micWarned) { S.micWarned = true; addMsg("Sem permissão do microfone: o clipe sai sem som. Libere o microfone para o site nas configurações do navegador.", "sys"); }
      }
    }
    const recStream = mic ? new MediaStream([...stream.getVideoTracks(), ...mic.getAudioTracks()]) : stream;
    const chunks = [];
    const mr = new MediaRecorder(recStream, { mimeType: type, videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 });
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { mr.onstop = r; });
    mr.start();
    await new Promise((r) => setTimeout(r, sec * 1000));
    if (mr.state !== "inactive") mr.stop();
    await stopped;
    const blob = new Blob(chunks, { type: type.split(";")[0] });
    if (blob.size) {
      await addEvent("clipe", { ...here(), manual }, blob);
      if (manual) addMsg("Clipe guardado no diário.", "sys");
    }
  } catch (e) {
    if (manual) addMsg("Não consegui gravar o clipe.", "err");
  } finally {
    mic?.getTracks().forEach((t) => t.stop());
    S.recording = false;
    $("clipBtn").classList.remove("recording"); $("clipBtn").textContent = "● Gravar 10 s";
  }
}

function onPosition(p) {
  const c = p.coords;
  const prev = S.pos;
  const now = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: c.speed, t: p.timestamp, heading: prev?.heading ?? null };
  if (c.heading != null && !Number.isNaN(c.heading) && (c.speed ?? 0) > 0.6) now.heading = c.heading;
  else if (prev && dist(prev, now) > 8) now.heading = bearing(prev, now);
  S.pos = now;

  const ll = [now.lat, now.lon];
  if (!map.hasLayer(meMarker)) { meMarker.addTo(map); map.setView(ll, 17); }
  meMarker.setLatLng(ll);
  if (accCircle) accCircle.setLatLng(ll).setRadius(now.acc);
  else accCircle = L.circle(ll, { radius: now.acc, weight: 1, color: "#2f7cf6", fillOpacity: 0.08 }).addTo(map);
  if (follow) map.panTo(ll, { animate: false });

  if (!S.lastGeocode || (dist(S.lastGeocode, now) > 60 && Date.now() - S.lastGeocode.at > 15000)) {
    S.lastGeocode = { ...now, at: Date.now() };
    reverseGeocode(now).then((a) => { S.address = a; $("where").textContent = a?.curto || "Endereço não encontrado"; }).catch(() => {});
  }
  logTrack();
  if (S.route) updateNav();
}
function startGeo() {
  if (!("geolocation" in navigator)) { addMsg("Este navegador não oferece localização.", "err"); return; }
  navigator.geolocation.watchPosition(onPosition, (e) => {
    $("where").textContent = e.code === 1 ? "Localização negada: libere nas configurações do navegador" : "Sem sinal de GPS no momento";
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

async function reverseGeocode(p) {
  const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lon}&accept-language=pt-BR&zoom=18&addressdetails=1`);
  if (!r.ok) throw new Error("reverse " + r.status);
  const j = await r.json();
  const a = j.address || {};
  const rua = [a.road, a.house_number].filter(Boolean).join(", ");
  const bairro = a.suburb || a.neighbourhood || a.quarter || "";
  const cidade = a.city || a.town || a.village || a.municipality || "";
  return { completo: j.display_name, curto: [rua, bairro, cidade].filter(Boolean).join(" · "), rua: a.road, bairro, cidade, estado: a.state, pais: a.country, lugar: j.name || null };
}

// ---------- Busca de lugares ----------
const CATEGORIES = {
  restaurante: ['["amenity"~"^(restaurant|fast_food|food_court)$"]'],
  cafe: ['["amenity"~"^(cafe|ice_cream)$"]', '["shop"="bakery"]'],
  bar: ['["amenity"~"^(bar|pub|biergarten)$"]'],
  farmacia: ['["amenity"="pharmacy"]'],
  mercado: ['["shop"~"^(supermarket|convenience|greengrocer)$"]'],
  banco_caixa_eletronico: ['["amenity"~"^(bank|atm)$"]'],
  posto_combustivel: ['["amenity"="fuel"]'],
  saude: ['["amenity"~"^(hospital|clinic|doctors)$"]'],
  banheiro: ['["amenity"="toilets"]'],
  estacionamento: ['["amenity"="parking"]'],
  hospedagem: ['["tourism"~"^(hotel|hostel|guest_house|motel)$"]'],
  turismo: ['["tourism"~"^(attraction|museum|viewpoint|artwork|gallery)$"]', '["historic"]'],
  transporte: ['["highway"="bus_stop"]', '["railway"~"^(station|subway_entrance)$"]', '["amenity"="taxi"]'],
  compras: ['["shop"]'],
  spa_bem_estar: ['["leisure"~"^(spa|fitness_centre|sauna)$"]', '["shop"~"^(beauty|massage|hairdresser)$"]'],
  livraria: ['["shop"~"^(books|stationery)$"]'],
  museu_galeria: ['["tourism"~"^(museum|gallery)$"]', '["amenity"="arts_centre"]'],
  parque: ['["leisure"~"^(park|garden)$"]'],
  qualquer: ['["amenity"]', '["shop"]', '["tourism"]'],
};

async function nearby(categoria, raio) {
  if (!S.pos) throw new Error("Ainda sem localização.");
  const filters = CATEGORIES[categoria] || CATEGORIES.qualquer;
  const r = Math.min(Math.max(raio || 600, 100), 3000);
  const parts = filters.map((f) => `nwr${f}["name"](around:${r},${S.pos.lat},${S.pos.lon});`).join("");
  const q = `[out:json][timeout:20];(${parts});out center tags 80;`;
  const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Serviço de lugares indisponível (" + res.status + ")");
  const j = await res.json();
  const items = j.elements.map((e) => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const t = e.tags || {};
    const d = dist(S.pos, { lat, lon }), b = bearing(S.pos, { lat, lon });
    return {
      nome: t.name, tipo: t.cuisine ? `${t.amenity || t.shop || t.tourism} (${t.cuisine})` : (t.amenity || t.shop || t.tourism || t.leisure || t.historic || t.highway || t.railway),
      distancia_m: Math.round(d), direcao: cardinal(b), relativo: relative(b),
      endereco: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ") || undefined,
      horario: t.opening_hours, telefone: t.phone || t["contact:phone"], lat, lon,
    };
  }).filter((x) => x.lat != null).sort((a, b) => a.distancia_m - b.distancia_m).slice(0, 15);
  poiLayer.clearLayers();
  items.forEach((i) => L.circleMarker([i.lat, i.lon], { radius: 7, color: "#e8a21a", fillOpacity: 0.85 }).bindTooltip(i.nome).addTo(poiLayer));
  return items;
}

async function searchPlace(consulta) {
  const p = S.pos;
  let url = `${NOMINATIM}/search?format=jsonv2&limit=8&accept-language=pt-BR&q=${encodeURIComponent(consulta)}`;
  if (p) url += `&viewbox=${p.lon - 0.15},${p.lat + 0.15},${p.lon + 0.15},${p.lat - 0.15}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Busca indisponível (" + r.status + ")");
  const j = await r.json();
  return j.map((x) => {
    const pt = { lat: +x.lat, lon: +x.lon };
    return { nome: x.name || x.display_name.split(",")[0], endereco: x.display_name, tipo: x.type, lat: pt.lat, lon: pt.lon, distancia_m: p ? Math.round(dist(p, pt)) : undefined };
  }).sort((a, b) => (a.distancia_m ?? 0) - (b.distancia_m ?? 0));
}

// ---------- Rota e navegação ----------
const MOD = { left: "à esquerda", right: "à direita", "slight left": "levemente à esquerda", "slight right": "levemente à direita", "sharp left": "bem à esquerda", "sharp right": "bem à direita", straight: "em frente", uturn: "fazendo o retorno" };
function instruction(step) {
  const m = step.maneuver, mod = MOD[m.modifier] || "", via = step.name ? ` na ${step.name}` : "";
  switch (m.type) {
    case "depart": return `Siga ${step.name ? "pela " + step.name : "em frente"}`;
    case "arrive": return "Você chegou ao destino";
    case "turn": return m.modifier === "straight" ? `Siga em frente${via}` : m.modifier === "uturn" ? "Faça o retorno" : `Vire ${mod}${via}`;
    case "new name": case "continue": return `Continue ${mod || "em frente"}${via}`;
    case "fork": return `Na bifurcação, mantenha-se ${mod}${via}`;
    case "merge": return `Entre ${mod}${via}`;
    case "end of road": return `No fim da via, vire ${mod}${via}`;
    case "roundabout": case "rotary": case "roundabout turn":
      return `Na rotatória, pegue a ${m.exit || 1}ª saída${via}`;
    case "exit roundabout": case "exit rotary": return `Saia da rotatória${via}`;
    case "on ramp": return `Pegue o acesso ${mod}${via}`;
    case "off ramp": return `Pegue a saída ${mod}${via}`;
    default: return `${mod ? "Siga " + mod : "Continue"}${via}`;
  }
}

async function startRoute(dest) {
  if (!S.pos) throw new Error("Ainda sem localização.");
  const prof = ROUTER[S.mode] || ROUTER.foot;
  const url = `https://routing.openstreetmap.de/${prof}/route/v1/driving/${S.pos.lon},${S.pos.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson&steps=true`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Serviço de rotas indisponível (" + r.status + ")");
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes?.length) throw new Error("Não encontrei rota até esse destino.");
  const rt = j.routes[0];
  const steps = rt.legs[0].steps.map((s) => ({ ...s, at: { lat: s.maneuver.location[1], lon: s.maneuver.location[0] } }));
  S.route = { dest, steps, coords: rt.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })), total: rt.distance, duration: rt.duration };
  S.stepIdx = 0; S.ann = {}; S.offCount = 0; S.arrived = false; S.lastLook = Date.now();

  if (routeLine) routeLine.remove();
  if (destMarker) destMarker.remove();
  routeLine = L.polyline(S.route.coords.map((c) => [c.lat, c.lon]), { color: "#14675b", weight: 6, opacity: 0.85 }).addTo(map);
  destMarker = L.marker([dest.lat, dest.lon]).bindTooltip(dest.nome || "Destino").addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  setFollow(true);
  $("banner").hidden = false;
  keepAwake(true);
  renderBanner();
  return {
    destino: dest.nome, distancia_total: fmtDist(rt.distance), tempo_estimado_min: Math.round(rt.duration / 60), modo: MODE_LABEL[S.mode],
    passos: steps.slice(0, 8).map((s) => `${instruction(s)} (${fmtDist(s.distance)})`),
  };
}

function stopRoute() {
  S.route = null;
  if (routeLine) { routeLine.remove(); routeLine = null; }
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $("banner").hidden = true;
  if (!S.live) keepAwake(false);
}

function remaining() {
  const r = S.route, next = r.steps[S.stepIdx + 1];
  if (!next) return dist(S.pos, r.dest);
  let m = dist(S.pos, next.at);
  for (let i = S.stepIdx + 1; i < r.steps.length; i++) m += r.steps[i].distance;
  return m;
}

function renderBanner() {
  const r = S.route; if (!r || !S.pos) return;
  const next = r.steps[S.stepIdx + 1];
  const d = next ? dist(S.pos, next.at) : dist(S.pos, r.dest);
  $("bDist").textContent = fmtDist(d);
  $("bText").textContent = next ? instruction(next) : "Destino à frente";
  const rem = remaining();
  const speed = r.total / Math.max(r.duration, 1);
  const eta = new Date(Date.now() + (rem / speed) * 1000);
  $("bSub").textContent = `${r.dest.nome || "Destino"} · faltam ${fmtDist(rem)} · chegada ${eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function updateNav() {
  const r = S.route, cfg = NAV[S.mode] || NAV.foot;
  if (!r || !S.pos) return;
  const dDest = dist(S.pos, r.dest);
  if (dDest < cfg.arrive + Math.min(S.pos.acc, 30) && !S.arrived) {
    S.arrived = true;
    journal("chegada", { text: r.dest.nome || "destino" });
    const fala = `Você chegou${r.dest.nome ? " a " + r.dest.nome : ""}.`;
    if (S.camOn && S.navVoice && !S.ann.near) lookAndGuide("arrive").then((t) => navSay(t || fala, true));
    else navSay(fala, true);
    setTimeout(stopRoute, 4000);
    return;
  }

  let next = r.steps[S.stepIdx + 1];
  // Avança os passos já cumpridos (pode pular mais de um se o GPS atrasou)
  while (next && next.maneuver.type !== "arrive" && dist(S.pos, next.at) < cfg.pass) {
    S.stepIdx++; S.ann = {}; next = r.steps[S.stepIdx + 1];
    const cur = r.steps[S.stepIdx];
    if (cur.distance > 150 && cur.name) navSay(`Agora siga pela ${cur.name} por ${spokenDist(cur.distance)}.`);
  }
  renderBanner();
  if (!next) return;

  const d = dist(S.pos, next.at);
  const instr = instruction(next);
  const isArrive = next.maneuver.type === "arrive";
  const ahead = isArrive ? `O destino fica a ${spokenDist(d)}.` : `Em ${spokenDist(d)}, ${instr.charAt(0).toLowerCase() + instr.slice(1)}.`;
  if (d <= cfg.near && !S.ann.near) {
    S.ann.near = true;
    if (S.camOn && S.navVoice) lookAndGuide(isArrive ? "arrive" : "turn", { instr, d }).then((t) => navSay(t || ahead, true));
    else navSay(ahead, true);
  } else if (d <= cfg.far && d > cfg.near + 25 && !S.ann.far) {
    S.ann.far = true;
    navSay(ahead);
  } else if (S.camOn && S.navVoice && S.lookEvery !== "turns" && d > cfg.near + 30 && Date.now() - S.lastLook > +S.lookEvery * 1000) {
    lookAndGuide("periodic", { instr, d }).then((t) => t && navSay(t));
  }

  // Saiu da rota? Recalcula depois de 3 leituras seguidas fora
  if (S.pos.acc < 60 && distToLine(S.pos, r.coords) > cfg.off) S.offCount++;
  else S.offCount = 0;
  if (S.offCount >= 3 && Date.now() - S.lastReroute > 20000) {
    S.lastReroute = Date.now(); S.offCount = 0;
    navSay("Você saiu da rota. Recalculando.", true);
    startRoute(r.dest).then(() => {
      const n = S.route.steps[1];
      if (n) navSay(`Nova rota. Em ${spokenDist(dist(S.pos, n.at))}, ${instruction(n).toLowerCase()}.`);
    }).catch((e) => addMsg(e.message, "err"));
  }
}

// Avisos da navegação: falados só se a pessoa quiser; senão ficam só no texto
function navSay(text, interrupt = false) {
  if (!text) return;
  if (S.navVoice) say(text, interrupt);
  else addMsg(text, "bot");
}

function say(text, interrupt = false) {
  if (!text) return;
  addMsg(text, "bot");
  speak(text, { interrupt });
}

async function keepAwake(on) {
  try {
    if (on && !S.wakeLock && "wakeLock" in navigator) S.wakeLock = await navigator.wakeLock.request("screen");
    if (!on && S.wakeLock) { await S.wakeLock.release(); S.wakeLock = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.route) { S.wakeLock = null; keepAwake(true); } });

// ---------- Câmera ----------
let stream = null;
async function setCamera(on) {
  if (on) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 1280 } }, audio: false });
      $("cam").srcObject = stream; $("cam").hidden = false; await $("cam").play();
      $("cam").classList.toggle("selfie", S.facing === "user");
      S.camOn = true;
    } catch (e) {
      addMsg("Não consegui abrir a câmera. Verifique a permissão do navegador.", "err");
      S.camOn = false;
    }
  } else {
    if (S.live) setLive(false);
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    $("cam").hidden = true; $("stage").classList.remove("cam-big"); S.camOn = false;
  }
  $("camBtn").setAttribute("aria-pressed", String(S.camOn));
  $("clipBtn").hidden = $("photoBtn").hidden = !(S.camOn && S.diaryOn);
  $("flipBtn").hidden = !S.camOn;
  $("camBtn").setAttribute("aria-label", S.camOn ? "Desligar câmera" : "Ligar câmera");
  return S.camOn;
}
// Alterna entre a câmera traseira e a frontal (selfie) sem desligar o guia
async function flipCamera() {
  if (!S.camOn || S.recording) return;
  S.facing = S.facing === "user" ? "environment" : "user";
  stream?.getTracks().forEach((t) => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: S.facing }, width: { ideal: 1280 } }, audio: false });
  } catch {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 1280 } }, audio: false }); }
    catch { addMsg("Não consegui trocar de câmera.", "err"); return; }
  }
  $("cam").srcObject = stream;
  await $("cam").play().catch(() => {});
  $("cam").classList.toggle("selfie", S.facing === "user");
  $("flipBtn").setAttribute("aria-label", S.facing === "user" ? "Voltar para a câmera traseira" : "Virar para a câmera frontal (selfie)");
  $("flipBtn").textContent = S.facing === "user" ? "⇄ Traseira" : "⇄ Selfie";
}

function grabFrame() {
  const v = $("cam");
  if (!S.camOn || !v.videoWidth) return null;
  const scale = Math.min(1, 768 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
}

// ---------- Claude ----------
const SYSTEM = `Você é o Guia de Rua, um assistente de viagem que acompanha a pessoa pelo celular enquanto ela anda, pedala ou dirige. Além de localização e rotas, você é um concierge completo: dicas do entorno, o que fazer, roteiros, história e cultura do lugar, comida, compras, eventos, horários, preços, transporte, clima, costumes locais e qualquer outra dúvida da viagem.

Como trabalhar:
- Use web_search para tudo que depende de informação atual ou específica: se um lugar existe e está aberto, horários, avaliações, eventos de hoje, exposições, ingressos, preços, recomendações. Combine com buscar_lugar ou buscar_proximos para localizar no mapa e dizer a distância.
- Quando a pessoa pedir dicas, sugira opções concretas perto dela, dizendo por que vale a pena e a que distância fica; ofereça levar até lá.
- Use as ferramentas para dados reais de localização, lugares e rotas. Nunca invente nomes, endereços, distâncias ou horários.
- Quando houver uma imagem da câmera, ela mostra o que está à frente da pessoa. Use o que aparece (cor das fachadas, placas, lojas, árvores, faixas, esquinas) para orientar: "o restaurante fica depois daquela casa amarela à direita". Só cite o que de fato está visível.
- Para levar a pessoa a algum lugar: encontre o destino (buscar_lugar ou buscar_proximos) e chame iniciar_rota. Se houver várias opções parecidas, escolha a mais próxima e diga qual escolheu, sem perguntar, a menos que a dúvida seja real.
- A partir daí o app mostra as conversões na tela (e fala, se a pessoa ativou os avisos falados); você não precisa repetir a rota inteira. Diga só o primeiro passo e o tempo estimado.

Estilo: português do Brasil, frases naturais, pensadas para serem ouvidas. Perguntas simples: até 3 frases. Dicas, roteiros e explicações: até umas 10 frases, em texto corrido. Sem markdown, listas, links ou emojis. Distâncias arredondadas ("uns 200 metros").

Diário de viagem: quando a pessoa contar o que está fazendo, onde comeu, com quem está, o que achou de um lugar, ou pedir para anotar, use anotar_no_diario (sem perguntar). Quando pedir um relatório ou resumo da viagem de um período, use gerar_relatorio com as datas (hoje é a data da "Hora local"); para ver os relatórios guardados, use abrir_historico.
Memória: você lembra dos passeios anteriores pela ferramenta consultar_memoria. Quando a pessoa estiver num lugar já visitado ou perguntar sobre algo, consulte antes de explicar; não repita o que já foi contado, a menos que ela peça para explicar de novo; faça referência ("como te contei em 12 de setembro") e acrescente algo novo.
Não leia coordenadas numéricas (latitude e longitude) a menos que a pessoa peça.
Se a pessoa pedir para falar mais rápido ou devagar, ou para o guia ao vivo indicar (ou parar de indicar) para onde olhar, ou para falar ou silenciar os avisos de navegação, use ajustar_preferencias e confirme em poucas palavras.

Segurança: se a pessoa estiver de carro, seja ainda mais breve e nunca peça para ela olhar a tela.`;

const TOOLS = [
  { name: "onde_estou", description: "Posição atual: coordenadas, precisão do GPS, endereço aproximado, bairro, cidade e direção em que a pessoa está indo.", input_schema: { type: "object", properties: {} } },
  {
    name: "buscar_proximos",
    description: "Lista lugares com nome por perto, por categoria, do mais próximo ao mais distante, com distância, direção (cardeal e relativa ao rumo da pessoa), endereço e horário quando disponíveis.",
    input_schema: { type: "object", properties: { categoria: { type: "string", enum: Object.keys(CATEGORIES) }, raio_m: { type: "integer", description: "Raio de busca em metros (100 a 3000). Padrão 600." } }, required: ["categoria"] },
  },
  {
    name: "buscar_lugar",
    description: "Procura um lugar específico por nome ou endereço (ex.: 'Parque Ibirapuera', 'Rua Augusta 1500', 'Starbucks'), priorizando resultados perto da pessoa.",
    input_schema: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"] },
  },
  {
    name: "iniciar_rota",
    description: "Calcula a rota até o destino no modo de deslocamento escolhido e inicia a navegação guiada por voz no app.",
    input_schema: { type: "object", properties: { lat: { type: "number" }, lon: { type: "number" }, nome: { type: "string" } }, required: ["lat", "lon", "nome"] },
  },
  { name: "status_rota", description: "Situação da navegação em andamento: próxima manobra, distância até ela, quanto falta e próximos passos.", input_schema: { type: "object", properties: {} } },
  {
    name: "ajustar_preferencias",
    description: "Muda preferências do app: velocidade da fala (1, 1.25, 1.5 ou 2), se o guia ao vivo deve indicar para onde olhar e virar, e se os avisos de navegação (conversões da rota) devem ser falados em voz alta.",
    input_schema: { type: "object", properties: { velocidade_fala: { type: "number", enum: [1, 1.25, 1.5, 2] }, direcoes_no_guia_ao_vivo: { type: "boolean" }, avisos_de_navegacao_falados: { type: "boolean" } } },
  },
  {
    name: "anotar_no_diario",
    description: "Guarda uma nota no diário de viagem (o que a pessoa fez, comeu, sentiu, com quem estava), com hora e local atuais. Usada depois nos relatórios.",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
  },
  {
    name: "gerar_relatorio",
    description: "Gera e guarda um relatório de viagem (texto, mapa do trajeto, fotos e clipes) de um período, e o abre na tela. Datas no formato AAAA-MM-DD.",
    input_schema: { type: "object", properties: { de: { type: "string" }, ate: { type: "string" } }, required: ["de", "ate"] },
  },
  {
    name: "consultar_memoria",
    description: "Busca o que já foi contado, perguntado ou anotado em passeios anteriores. Sem 'busca', traz o que há perto da posição atual; com 'busca', procura por palavras (nome de lugar, assunto, pessoa).",
    input_schema: { type: "object", properties: { busca: { type: "string" } } },
  },
  { name: "abrir_historico", description: "Abre a tela com os relatórios de viagem guardados.", input_schema: { type: "object", properties: {} } },
  { name: "parar_rota", description: "Encerra a navegação em andamento.", input_schema: { type: "object", properties: {} } },
];

async function runTool(name, input) {
  switch (name) {
    case "onde_estou": {
      if (!S.pos) return { erro: "GPS ainda sem posição. Peça para a pessoa aguardar ou liberar a localização." };
      const a = S.address || (await reverseGeocode(S.pos).catch(() => null));
      return { lat: S.pos.lat, lon: S.pos.lon, precisao_m: Math.round(S.pos.acc), endereco: a?.completo, rua: a?.rua, bairro: a?.bairro, cidade: a?.cidade, estado: a?.estado, lugar: a?.lugar, indo_para: S.pos.heading != null ? cardinal(S.pos.heading) : "parado ou desconhecido", velocidade_kmh: S.pos.speed != null ? Math.round(S.pos.speed * 3.6) : null };
    }
    case "buscar_proximos": { const r = await nearby(input.categoria, input.raio_m); return r.length ? r : { resultado: "Nada encontrado nesse raio. Tente um raio maior." }; }
    case "buscar_lugar": { const r = await searchPlace(input.consulta); return r.length ? r : { resultado: "Nada encontrado." }; }
    case "iniciar_rota": {
      const r = await startRoute({ lat: input.lat, lon: input.lon, nome: input.nome });
      journal("rota", { text: input.nome });
      return r;
    }
    case "anotar_no_diario":
      if (!S.diaryOn) return { erro: "O diário está desligado em Ajustes." };
      await addNote(input.texto);
      return { resultado: "Nota guardada." };
    case "gerar_relatorio": {
      const r = await generateReport(input.de, input.ate, (st) => { if (st) addMsg(st, "sys"); });
      openDiary("list"); await openReport(r.id); offerCopy();
      return { resultado: "Relatório gerado e aberto na tela.", titulo: r.title, periodo: `${input.de} a ${input.ate}` };
    }
    case "consultar_memoria": {
      const found = input.busca ? memorySearch(S.memory, input.busca).map((m) => describeMemory(m, S.pos && m.lat != null ? dist(S.pos, m) : null))
        : memoryNear(S.memory, S.pos, 400, 12).map((m) => describeMemory(m, m.d));
      return found.length ? { lembrancas: found } : { resultado: "Nada na memória sobre isso." };
    }
    case "abrir_historico": openDiary("list"); return { resultado: "Histórico aberto." };
    case "status_rota": {
      if (!S.route) return { resultado: "Nenhuma navegação em andamento." };
      const n = S.route.steps[S.stepIdx + 1];
      return { destino: S.route.dest.nome, proxima_manobra: n ? instruction(n) : "chegada", distancia_ate_manobra: n ? fmtDist(dist(S.pos, n.at)) : null, falta: fmtDist(remaining()), proximos: S.route.steps.slice(S.stepIdx + 2, S.stepIdx + 6).map(instruction) };
    }
    case "ajustar_preferencias": {
      if (SPEEDS.includes(input.velocidade_fala)) setRate(input.velocidade_fala);
      if (typeof input.direcoes_no_guia_ao_vivo === "boolean") { S.liveDirections = input.direcoes_no_guia_ao_vivo; store.set("liveDirections", S.liveDirections); }
      if (typeof input.avisos_de_navegacao_falados === "boolean") { S.navVoice = input.avisos_de_navegacao_falados; store.set("navVoice", S.navVoice); }
      return { velocidade_fala: speedLabel(S.rate), direcoes_no_guia_ao_vivo: S.liveDirections ? "ligadas" : "desligadas", avisos_de_navegacao_falados: S.navVoice ? "sim" : "não, só na tela" };
    }
    case "parar_rota": stopRoute(); return { resultado: "Navegação encerrada." };
    default: return { erro: "Ferramenta desconhecida." };
  }
}

function contextLine() {
  const parts = [`Hora local: ${new Date().toLocaleString("pt-BR")}`, `Modo: ${MODE_LABEL[S.mode]}`];
  if (S.pos) parts.push(`Posição: ${S.pos.lat.toFixed(5)}, ${S.pos.lon.toFixed(5)} (±${Math.round(S.pos.acc)} m)${S.pos.heading != null ? ", indo para " + cardinal(S.pos.heading) : ""}`);
  else parts.push("Posição: ainda sem GPS");
  if (S.address?.curto) parts.push(`Endereço aproximado: ${S.address.curto}`);
  if (S.route) { const n = S.route.steps[S.stepIdx + 1]; parts.push(`Navegando até ${S.route.dest.nome}; próxima manobra: ${n ? instruction(n) + " em " + fmtDist(dist(S.pos, n.at)) : "chegada"}`); }
  parts.push(!S.camOn ? "Câmera: desligada" : S.facing === "user" ? "Câmera: frontal (selfie) — a imagem mostra a pessoa e o que está atrás dela" : "Câmera: imagem anexada (o que está à frente da pessoa)");
  return `[${parts.join(" | ")}]`;
}

function explainError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "A chave da API não foi aceita. Confira em Ajustes.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Essa chave não tem permissão para este modelo.";
  if (e instanceof Anthropic.RateLimitError) return "Muitas solicitações seguidas. Espere alguns segundos e tente de novo.";
  if (e instanceof Anthropic.APIConnectionError) return "Sem conexão com o Claude. Verifique a internet.";
  if (e instanceof Anthropic.APIError) return `O Claude respondeu com erro (${e.status ?? "?"}). Tente de novo.`;
  return e?.message || "Algo deu errado.";
}

async function claudeCreate(params) {
  return client.beta.messages.create({
    model: MODELS[S.guideModel] || MODELS.opus,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
  });
}

async function ask(text) {
  if (!client) { openSettings(); return; }
  if (S.busy) return;
  S.busy = true;
  addMsg(text, "me");
  const wait = addMsg("Pensando…", "bot thinking");
  // Conversas longas recomeçam do zero para não acumular imagens e custo
  if (S.history.length > 24) S.history = [];
  const snapshot = S.history.length;
  const content = [];
  const att = S.attach; clearAttach();
  const img = att ? att.b64 : grabFrame();
  if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
  const attNote = att ? `\n[A imagem é uma foto do rolo da câmera escolhida pela pessoa${att.old ? `, tirada em ${new Date(att.t).toLocaleString("pt-BR")}` : ", tirada agora"}, e não a câmera ao vivo. ${S.diaryOn ? "Ela já foi guardada no diário com o comentário da pessoa; confirme em poucas palavras e, se fizer sentido, comente algo sobre a foto." : "O diário está desligado, então ela não foi guardada."}]` : "";
  content.push({ type: "text", text: `${contextLine()}${attNote}\n\n${text}` });
  if (att && S.diaryOn) {
    addEvent("foto", { ...(att.old ? { t: att.t } : here()), text: `foto do rolo da câmera: ${text}` }, att.blob);
    loadMemory().then((m) => { S.memory = m; }).catch(() => {});
  }
  S.history.push({ role: "user", content });

  try {
    const web = { type: "web_search_20260209", name: "web_search", max_uses: 5 };
    const loc = { type: "approximate", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (S.address?.cidade) loc.city = S.address.cidade;
    web.user_location = loc;
    for (let round = 0; round < 10; round++) {
      const resp = await claudeCreate({
        model: MODELS[S.chatModel] || MODELS.sonnet,
        max_tokens: 8000, system: SYSTEM, tools: [...TOOLS, web], messages: S.history,
        output_config: { effort: "low" }, cache_control: { type: "ephemeral" },
      });
      if (resp.stop_reason === "refusal") { S.history.length = snapshot; wait.remove(); say("Não posso ajudar com esse pedido."); return; }
      S.history.push({ role: "assistant", content: resp.content });
      const reply = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const calls = resp.content.filter((b) => b.type === "tool_use");
      // Busca na web longa: a API pausa e continua do mesmo ponto na próxima chamada
      if (resp.stop_reason === "pause_turn") { wait.textContent = "Pesquisando na internet…"; continue; }
      if (resp.stop_reason !== "tool_use" || !calls.length) {
        wait.remove(); say(reply || "Pronto.");
        journal("pergunta", { text, reply }, att ? null : img);
        return;
      }
      wait.textContent = resp.content.some((b) => b.type === "server_tool_use") ? "Pesquisando na internet…" : "Consultando mapa…";
      const results = await Promise.all(calls.map(async (c) => {
        try { return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(await runTool(c.name, c.input)) }; }
        catch (e) { return { type: "tool_result", tool_use_id: c.id, content: e.message || "Falhou", is_error: true }; }
      }));
      S.history.push({ role: "user", content: results });
    }
    wait.remove(); say("Não consegui concluir. Pode repetir de outro jeito?");
  } catch (e) {
    S.history.length = snapshot;
    wait.remove(); addMsg(explainError(e), "err");
  } finally {
    S.busy = false;
  }
}

const GUIDE_SYSTEM = `Você guia uma pessoa na rua pela câmera do celular, apontada para a frente. Você recebe a próxima instrução da rota e a imagem atual.
Responda com UMA frase curta (até 25 palavras) em português do Brasil, para ser falada em voz alta, que una a instrução a uma referência visível na imagem: cor de fachada, placa, nome de loja, árvore, poste, faixa de pedestres, esquina.
Exemplos: "Daqui a uns 30 metros, vire à direita logo depois do prédio azul." / "Continue reto; o restaurante fica depois daquela casa amarela, do lado esquerdo."
Se a imagem estiver escura, borrada ou sem nada útil, apenas reformule a instrução de modo natural. Nunca cite algo que não está na imagem. Sem markdown.`;

async function lookAndGuide(kind, ctx = {}) {
  if (!client || !S.camOn || S.guideBusy || S.facing === "user") return null;
  const img = grabFrame();
  if (!img) return null;
  S.guideBusy = true; S.lastLook = Date.now(); S.lastLookImg = img;
  let task;
  if (kind === "arrive") task = `A pessoa está chegando ao destino: ${S.route?.dest.nome || "destino"}. Ajude a identificar o local ou a entrada na imagem, se aparecer.`;
  else if (kind === "describe") task = ctx.instr ? `Próxima instrução: ${ctx.instr}, em ${spokenDist(ctx.d)}. Descreva por onde seguir usando o que aparece na imagem.` : "Não há rota ativa. Descreva brevemente o que está à frente que ajude a se orientar.";
  else task = `Próxima instrução: ${ctx.instr}. Distância até a manobra: ${spokenDist(ctx.d)}.${kind === "periodic" ? " A manobra ainda está longe; confirme que a pessoa está no caminho certo usando uma referência visível." : ""}`;
  try {
    const resp = await claudeCreate({
      max_tokens: 2000, system: GUIDE_SYSTEM, output_config: { effort: "low" },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } },
        { type: "text", text: `Modo: ${MODE_LABEL[S.mode]}. ${task}` },
      ] }],
    });
    if (resp.stop_reason === "refusal") return null;
    return resp.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim() || null;
  } catch (e) {
    console.warn(e);
    return null;
  } finally {
    S.guideBusy = false;
  }
}

// ---------- Guia ao vivo ----------
// Narração contínua: olha a câmera, cruza com pontos de interesse do mapa e vai contando o que há em volta.
const LIVE_GAP = { continuo: 1000, normal: 10000, calmo: 25000 };
const LIVE_REFRESH_MS = 10000; // modo contínuo: nova leitura da câmera a cada 10 s

const LIVE_SYSTEM = `Você é um guia turístico ao vivo, caminhando ao lado da pessoa. A cada momento você recebe a imagem da câmera do celular (o que ela está vendo agora), a localização, para onde a câmera aponta, lugares do mapa ao redor com distância e direção relativa, e o que você já contou.

Sua fala: de 1 a 3 frases, até umas 45 palavras, em português do Brasil, em tom de conversa, para ser ouvida. Sem markdown, listas ou emojis.

O que contar, variando a cada vez:
- O que aparece na imagem: prédios, igrejas, monumentos, praças, arte de rua, estilo arquitetônico, detalhes curiosos.
- Lugares por perto que valem a pena, com a distância.
- História do lugar, do bairro e da cidade; quem morou ou trabalhou ali; o que funciona naquele prédio hoje.
- Comida e vida local: restaurantes e cafés conhecidos, áreas de compras, mercados, vida noturna.

Regras:
- Não repita o que já contou. Se a cena não mudou, fale de outra coisa do entorno, do bairro ou da cidade.
- Fatos: use os dados do mapa e conhecimento que você tem com segurança. Se não tiver certeza (estrela Michelin, data, "o prédio mais alto", quem projetou), não afirme; diga "parece" ou deixe de fora. Nunca invente nomes.
- Siga a preferência de direções indicada no início da mensagem.
- Se a imagem estiver escura, tremida ou sem nada útil, fale do entorno pelos dados do mapa.
- Se houver memória de passeios anteriores, trate como conversa que vocês já tiveram: não repita aquelas explicações; quando ajudar, faça uma referência curta ("como te contei no dia 12", "da outra vez que você passou por aqui") e traga um ângulo novo.
- Siga a regra de ritmo indicada na mensagem.`;

const LIVE_FILTERS = [
  '["tourism"~"^(attraction|museum|viewpoint|artwork|gallery|theme_park|zoo)$"]',
  '["historic"]',
  '["amenity"~"^(place_of_worship|theatre|arts_centre|townhall|library|university|courthouse|cinema|marketplace)$"]',
  '["amenity"~"^(restaurant|cafe|bar|pub)$"]',
  '["leisure"~"^(park|garden|stadium)$"]',
  '["shop"~"^(mall|department_store)$"]',
  '["office"="government"]',
  '["building"]["wikidata"]',
  '["man_made"~"^(tower|lighthouse)$"]',
];

async function refreshLivePois() {
  if (!S.pos) return;
  if (S.livePoisAt && dist(S.livePoisAt, S.pos) < 120 && Date.now() - S.livePoisAt.t < 5 * 60000) return;
  const parts = LIVE_FILTERS.map((f) => `nwr${f}["name"](around:350,${S.pos.lat},${S.pos.lon});`).join("");
  const q = `[out:json][timeout:20];(${parts});out center tags 200;`;
  const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("overpass " + res.status);
  const j = await res.json();
  S.livePois = j.elements.map((e) => {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null) return null;
    const isFood = /^(restaurant|cafe|bar|pub)$/.test(t.amenity || "");
    let score = 0;
    if (t.wikidata || t.wikipedia) score += 4;
    if (t.heritage || t["heritage:operator"]) score += 3;
    if (t.historic || t.tourism) score += 2;
    if (t.start_date || t.architect || t.height || t["building:levels"]) score += 1;
    if (isFood && !(t.wikidata || t.wikipedia)) score -= 1;
    const info = [
      t.tourism || t.historic && `histórico (${t.historic})` || t.amenity || t.leisure || t.shop || t.office || t.man_made || (t.building && "edifício"),
      t.religion && t.religion, t.cuisine && `cozinha ${t.cuisine}`, t.start_date && `desde ${t.start_date}`,
      t.architect && `arquiteto ${t.architect}`, t.height && `${t.height} m de altura`, t["building:levels"] && `${t["building:levels"]} andares`,
      t.heritage && "patrimônio tombado", t.wikipedia && `wikipedia: ${t.wikipedia}`, t.description,
    ].filter(Boolean).join(", ");
    return { nome: t.name, info, lat, lon, score };
  }).filter(Boolean);
  S.livePoisAt = { lat: S.pos.lat, lon: S.pos.lon, t: Date.now() };
}

function livePoiLines() {
  return S.livePois
    .map((p) => ({ ...p, d: dist(S.pos, p) }))
    .sort((a, b) => (b.score - a.score) || (a.d - b.d))
    .slice(0, 25)
    .sort((a, b) => a.d - b.d)
    .map((p) => {
      const b = bearing(S.pos, p);
      const dir = S.liveDirections ? `, ${relative(b) || "direção desconhecida"}, a ${cardinal(b)}` : "";
      const h = S.pos.heading;
      const ahead = h != null && Math.abs(((b - h + 540) % 360) - 180) < 50 ? " [à frente]" : "";
      return `- ${p.nome} (${p.info}) — ${Math.round(p.d)} m${dir}${ahead}`;
    }).join("\n");
}

async function liveNarrate() {
  S.liveBusy = true;
  try {
    if (!S.livePoisLoading) {
      S.livePoisLoading = refreshLivePois().catch(() => {}).finally(() => { S.livePoisLoading = null; });
    }
    if (S.livePoisLoading && !S.livePois.length) await Promise.race([S.livePoisLoading, new Promise((r) => setTimeout(r, 4000))]);
    if (!isSpeaking()) liveStatus("olhando…");
    S.liveLastReq = Date.now();
    const img = grabFrame();
    const f = facing();
    const lines = [
      S.liveDirections
        ? 'Preferência de direções: LIGADA. Diga para onde olhar ou virar ("olhe à sua esquerda", "atrás de você", "logo à frente") usando as direções relativas dos dados; se a direção for desconhecida, descreva pela imagem.'
        : 'Preferência de direções: DESLIGADA. Não dê instruções de olhar, virar ou andar (nada de "à esquerda", "à direita", "atrás de você", "vire", "siga"). Conte o que há e o que se vê; pode dizer a distância e que algo vem "mais adiante no caminho".',
      `Hora local: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Modo: ${MODE_LABEL[S.mode]}.`,
      S.address ? `Local: ${S.address.completo}` : "Local: endereço ainda desconhecido",
      S.pos ? `Coordenadas: ${S.pos.lat.toFixed(5)}, ${S.pos.lon.toFixed(5)} (±${Math.round(S.pos.acc)} m)` : "Sem GPS no momento.",
      `Câmera apontando para: ${S.liveDirections && f != null ? cardinal(f) : "não informado"}${S.pos?.speed > 0.5 ? `; andando a ${Math.round(S.pos.speed * 3.6)} km/h` : ""}.`,
    ];
    if (S.route && S.liveDirections) { const n = S.route.steps[S.stepIdx + 1]; lines.push(`Rota ativa até ${S.route.dest.nome}; próxima manobra: ${n ? instruction(n) + " em " + fmtDist(dist(S.pos, n.at)) : "chegada"}.`); }
    if (S.pos && S.liveLastPos) {
      const moved = dist(S.liveLastPos, S.pos);
      lines.push(moved > 15 ? `A pessoa andou ${Math.round(moved)} m desde a última fala: traga o que é novo neste trecho e o que vem pela frente.` : "A pessoa está praticamente parada: aprofunde sobre o entorno, o bairro e a cidade.");
    }
    if (S.pos && S.livePois.length) lines.push(`\nLugares do mapa por perto (até 350 m; os marcados [à frente] estão no caminho em que a pessoa anda):\n${livePoiLines()}`);
    const near = memoryNear(S.memory, S.pos, 300, 10);
    if (near.length) lines.push(`\nMemória de passeios anteriores perto daqui (já foi contado antes):\n${near.map((m) => "- " + describeMemory(m, m.d)).join("\n")}`);
    lines.push(S.liveSaid.length ? `\nO que você já contou (não repita):\n${S.liveSaid.map((t) => "- " + t).join("\n")}` : "\nVocê ainda não falou nada; comece se apresentando em poucas palavras e contando onde a pessoa está.");
    lines.push(S.livePace === "continuo"
      ? "Ritmo contínuo: fale sempre alguma coisa nova, mesmo que a cena não tenha mudado."
      : "Se realmente não houver nada novo para dizer, responda exatamente [SILENCIO].");
    lines.push(!img ? "\nSem imagem da câmera neste momento." : S.facing === "user"
      ? "\nA imagem é da câmera frontal (selfie): mostra a pessoa e o que está ATRÁS dela. Fale do cenário ao fundo (\"atrás de você aparece…\"); não descreva a aparência da pessoa."
      : "\nA imagem anexada é o que a pessoa vê agora.");

    const content = [];
    if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
    content.push({ type: "text", text: lines.join("\n") });
    const resp = await claudeCreate({ max_tokens: 2000, system: LIVE_SYSTEM, output_config: { effort: "low" }, messages: [{ role: "user", content }] });
    if (!S.live) return;
    S.liveErrors = 0;
    const text = resp.stop_reason === "refusal" ? "" : resp.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    if (!text || text.includes("[SILENCIO]")) { S.liveReadyAt = Date.now() + LIVE_GAP[S.livePace] + 5000; return; }
    S.liveSaid.push(text);
    if (S.liveSaid.length > 12) S.liveSaid.shift();
    S.liveNext = text; // fica na vez; é falada assim que a fala atual terminar
    journal("narracao", { text }, img);
    if (S.pos) S.liveLastPos = { lat: S.pos.lat, lon: S.pos.lon };
  } catch (e) {
    console.warn("guia ao vivo", e);
    S.liveErrors++;
    if (e instanceof Anthropic.AuthenticationError || S.liveErrors >= 3) {
      addMsg(explainError(e) + " Guia ao vivo desligado.", "err");
      setLive(false);
    } else {
      addMsg(explainError(e) + " Tentando de novo em 15 segundos.", "err");
      liveStatus("erro, tentando de novo");
      S.liveReadyAt = Date.now() + 15000;
    }
  } finally {
    S.liveBusy = false;
  }
}

function liveTick() {
  if (!S.live) return;
  const speaking = isSpeaking();
  const free = !S.busy && !S.guideBusy && !rec && document.visibilityState === "visible";
  // 1) Fala a próxima narração assim que a anterior terminar
  if (S.liveNext && !speaking && free) {
    const t = S.liveNext; S.liveNext = null;
    addMsg(t, "bot");
    speak(t);
    liveStatus(S.voice ? "falando" : "");
    // Sem voz, dá tempo de ler na tela
    if (!S.voice) S.liveReadyAt = Date.now() + (t.split(/\s+/).length / 3) * 1000;
  } else if (!speaking && !S.liveBusy && S.liveStatusText === "falando") liveStatus("");
  // 2) Pede uma nova leitura da câmera
  const sinceSpeech = Date.now() - (S.lastSpeechEnd || 0);
  const due = S.livePace === "continuo"
    ? Date.now() - (S.liveLastReq || 0) >= LIVE_REFRESH_MS && !S.liveNext
    : !speaking && !S.liveNext && (!S.voice || sinceSpeech >= LIVE_GAP[S.livePace]);
  if (due && free && !S.liveBusy && Date.now() >= S.liveReadyAt) liveNarrate();
  // 3) Clipe automático para o diário
  if (S.clipEvery !== "off" && S.camOn && S.diaryOn && !S.recording && Date.now() - S.lastClip > +S.clipEvery * 60000) recordClip(6);
  S.liveTimer = setTimeout(liveTick, 500);
}

function onOrient(e) {
  let h = null;
  if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  S.compass = (h + (screen.orientation?.angle || 0) + 360) % 360;
  S.compassAt = Date.now();
}
let compassOn = false;
async function enableCompass() {
  if (compassOn) return;
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return;
    }
    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
    compassOn = true;
  } catch {}
}

function liveStatus(t) {
  S.liveStatusText = t;
  $("liveBtn").querySelector("span").textContent = S.live ? `Guia ao vivo · ${t || "tocar para parar"}` : "Guia ao vivo";
}

async function setLive(on) {
  if (on) {
    if (!client) { openSettings(); return; }
    enableCompass();
    if (!S.camOn && !(await setCamera(true))) return;
    if (!S.voice) setVoice(true);
    S.live = true; S.liveSaid = []; S.liveErrors = 0; S.liveReadyAt = 0; S.lastSpeechEnd = 0;
    S.liveNext = null; S.liveLastReq = 0; S.liveLastPos = null;
    S.lastClip = Date.now() - (+S.clipEvery || 0) * 60000 + 20000; // primeiro clipe uns 20 s depois de ligar
    S.liveSessionStart = Date.now();
    if (S.diaryOn) store.set("pendingSession", { start: S.liveSessionStart });
    loadMemory(S.liveSessionStart).then((m) => { S.memory = m; }).catch(() => {});
    keepAwake(true);
    addMsg("Guia ao vivo ligado. Aponte a câmera para a rua e eu vou contando o que há por aqui.", "sys");
    clearTimeout(S.liveTimer);
    S.liveTimer = setTimeout(liveTick, 800);
  } else {
    S.live = false; S.liveNext = null;
    clearTimeout(S.liveTimer);
    stopSpeech();
    if (!S.route) keepAwake(false);
    addMsg("Guia ao vivo desligado.", "sys");
    if (S.diaryOn && S.liveSessionStart) {
      const ses = { start: S.liveSessionStart, end: Date.now() };
      store.set("pendingSession", ses);
      S.liveSessionStart = 0;
      setTimeout(() => askKeepSession(ses), 1500); // espera clipes em gravação terminarem
    }
  }
  $("liveBtn").setAttribute("aria-pressed", String(S.live));
  liveStatus("");
}

// Ao fim de cada gravação: guardar no diário ou descartar
async function askKeepSession({ start, end }) {
  const sum = await sessionSummary(start, end).catch(() => null);
  if (!sum || !sum.count) { store.set("pendingSession", null); return; }
  const mins = Math.max(1, Math.round((end - start) / 60000));
  const when = new Date(start).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  $("keepText").textContent = `Gravação de ${mins} min (${when}): ${sum.narrations} falas do guia, ${sum.photos} fotos e ${sum.clips} clipes, ${sum.mb.toFixed(1).replace(".", ",")} MB. Guardar no diário para a memória e os relatórios?`;
  $("keepNote").textContent = sum.notes ? `As ${sum.notes} notas que você fez ficam guardadas de qualquer jeito.` : "";
  const d = $("keepDlg");
  d.returnValue = "";
  d.showModal();
  await new Promise((r) => { d.onclose = r; });
  if (d.returnValue === "discard") {
    const n = await discardBetween(start, end);
    addMsg(`Gravação descartada (${n} itens apagados).${sum.notes ? " As notas foram mantidas." : ""}`, "sys");
  } else if (d.returnValue === "keep") {
    addMsg("Gravação guardada no diário.", "sys");
  } else return; // decide depois: pergunta de novo na próxima vez que abrir o app
  store.set("pendingSession", null);
  S.memory = await loadMemory().catch(() => S.memory);
}

// ---------- Voz (entrada) ----------
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function listen() {
  if (!Rec) { addMsg("Este navegador não reconhece fala. Use o microfone do teclado do celular.", "sys"); $("q").focus(); return; }
  if (rec) { rec.stop(); return; }
  stopSpeech();
  rec = new Rec();
  rec.lang = "pt-BR"; rec.interimResults = true; rec.maxAlternatives = 1;
  let finalText = "";
  rec.onresult = (ev) => {
    let t = "";
    for (const r of ev.results) { t += r[0].transcript; if (r.isFinal) finalText = t; }
    $("q").value = t;
    fitInput();
  };
  rec.onerror = (ev) => { if (ev.error === "not-allowed") addMsg("Microfone negado. Libere a permissão no navegador.", "err"); };
  rec.onend = () => {
    $("micBtn").classList.remove("listening"); rec = null;
    const t = (finalText || $("q").value).trim();
    if (t) { $("q").value = ""; fitInput(); ask(t); }
  };
  $("micBtn").classList.add("listening");
  rec.start();
}

// ---------- Ajustes ----------
function openSettings() {
  $("apiKey").value = S.key; $("mode").value = S.mode; $("lookEvery").value = S.lookEvery; $("liveDirections").value = S.liveDirections ? "on" : "off"; $("chatModel").value = S.chatModel; $("guideModel").value = S.guideModel; $("diaryOn").value = S.diaryOn ? "on" : "off"; $("clipEvery").value = S.clipEvery; $("clipAudio").value = S.clipAudio ? "on" : "off"; $("navVoice").value = S.navVoice ? "on" : "off"; $("livePace").value = S.livePace;
  fillVoiceSelect();
  $("openaiKey").value = S.openaiKey; $("openaiVoice").value = S.openaiVoice;
  $("settings").showModal();
}
$("settings").addEventListener("close", () => {
  if ($("settings").returnValue !== "save") { pickVoice(); return; }
  S.voiceURI = $("voiceSel").value; store.set("voiceURI", S.voiceURI); pickVoice();
  const newKey = $("openaiKey").value.trim();
  if (newKey !== S.openaiKey) { cloudFailed = false; audioUnlocked = false; }
  S.openaiKey = newKey; S.openaiVoice = $("openaiVoice").value;
  store.set("openaiKey", S.openaiKey); store.set("openaiVoice", S.openaiVoice);
  S.key = $("apiKey").value.trim(); S.mode = $("mode").value; S.lookEvery = $("lookEvery").value; S.liveDirections = $("liveDirections").value === "on"; if ($("chatModel").value !== S.chatModel) S.history = []; S.chatModel = $("chatModel").value; S.guideModel = $("guideModel").value; S.diaryOn = $("diaryOn").value === "on"; S.clipEvery = $("clipEvery").value; S.clipAudio = $("clipAudio").value === "on"; S.navVoice = $("navVoice").value === "on"; S.livePace = $("livePace").value;
  store.set("key", S.key); store.set("mode", S.mode); store.set("lookEvery", S.lookEvery); store.set("liveDirections", S.liveDirections); store.set("chatModel", S.chatModel); store.set("guideModel2", S.guideModel); store.set("diaryOn", S.diaryOn); store.set("clipEvery", S.clipEvery); store.set("clipAudio", S.clipAudio); store.set("navVoice", S.navVoice); store.set("livePace", S.livePace);
  client = S.key ? new Anthropic({ apiKey: S.key, dangerouslyAllowBrowser: true }) : null;
  if (S.route) startRoute(S.route.dest).catch((e) => addMsg(e.message, "err"));
});

$("cloudTest").addEventListener("click", async () => {
  const key = $("openaiKey").value.trim();
  if (!key) { $("cloudStatus").textContent = "Cole a chave da OpenAI primeiro."; return; }
  stopSpeech();
  cloudAudio.src = SILENT_WAV; cloudAudio.play().catch(() => {}); // destrava o áudio dentro do toque
  $("cloudStatus").textContent = "Gerando a voz…";
  try {
    const url = await fetchTTS("Olá! Esta é a minha voz natural. Vamos passear pela cidade?", key, $("openaiVoice").value, undefined);
    cloudAudio.src = url; cloudAudio.defaultPlaybackRate = cloudAudio.playbackRate = S.rate;
    await cloudAudio.play();
    $("cloudStatus").textContent = "Funcionou. Toque em Salvar para usar esta voz.";
  } catch (e) {
    $("cloudStatus").textContent = e.message || "Não foi possível testar.";
  }
});
$("voiceTest").addEventListener("click", () => {
  const v = ptVoices().find((x) => x.voiceURI === $("voiceSel").value) || ptVoices()[0];
  if (!v) return;
  stopSpeech();
  const u = new SpeechSynthesisUtterance("Olá! Esta é a minha voz. Vamos passear pela cidade?");
  u.lang = v.lang; u.voice = v; u.rate = S.rate;
  speechSynthesis.speak(u);
});

// ---------- Eventos ----------
const SPEEDS = [1, 1.25, 1.5, 2];
const speedLabel = (r) => `${String(r).replace(".", ",")}x`;
function setRate(r) {
  S.rate = r; store.set("rate", r);
  $("speedBtn").textContent = speedLabel(r);
  $("speedBtn").setAttribute("aria-label", `Velocidade da fala: ${speedLabel(r)}. Tocar para mudar`);
  respeakAtCurrentRate();
}
$("speedBtn").addEventListener("click", () => {
  const next = SPEEDS.find((x) => x > S.rate + 0.01) ?? SPEEDS[0];
  setRate(next);
});

function setVoice(on) {
  S.voice = on; store.set("voice", on);
  $("voiceBtn").setAttribute("aria-pressed", String(on));
  $("voiceBtn").setAttribute("aria-label", on ? "Desligar fala" : "Ligar fala em voz alta");
}
$("voiceBtn").addEventListener("click", () => {
  setVoice(!S.voice);
  if (S.voice) speak("Voz ligada.", { interrupt: true });
  else stopSpeech();
});
$("camBtn").addEventListener("click", () => setCamera(!S.camOn));
$("liveBtn").addEventListener("click", () => {
  if (!S.live && client) {
    if (!S.voice) setVoice(true);
    speak("Ligando o guia ao vivo.", { interrupt: true });
  }
  setLive(!S.live);
});
$("cam").addEventListener("click", () => $("stage").classList.toggle("cam-big"));
$("micBtn").addEventListener("click", listen);
$("settingsBtn").addEventListener("click", openSettings);
$("clipBtn").addEventListener("click", () => recordClip(10, true));
$("flipBtn").addEventListener("click", flipCamera);
// Caixa de mensagem que cresce com o texto (até ~6 linhas) e depois rola
function fitInput() {
  const q = $("q");
  const form = $("controls");
  // Passa de uma linha: caixa em largura total (volta ao normal quando fica vazia)
  if (!q.value) form.classList.remove("expanded");
  else if (!form.classList.contains("expanded")) {
    q.style.height = "auto";
    if (q.scrollHeight > 50 || q.value.includes("\n")) form.classList.add("expanded");
  }
  q.style.height = "auto";
  const max = parseFloat(getComputedStyle(q).maxHeight) || 200;
  q.style.height = Math.min(q.scrollHeight + 2, max) + "px";
  q.classList.toggle("scroll", q.scrollHeight + 2 > max);
  if (document.activeElement !== q) q.scrollTop = q.scrollHeight; // ditado: mostra o fim
}
$("q").addEventListener("input", fitInput);
// No computador, Enter envia e Shift+Enter quebra a linha; no celular, Enter quebra a linha e envia-se pelo botão
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !matchMedia("(pointer: coarse)").matches) {
    e.preventDefault();
    $("controls").requestSubmit();
  }
});

// Foto do rolo da câmera, com comentário, para o chat e o diário
function clearAttach() {
  S.attach = null;
  $("attachBar").hidden = true;
  if ($("attachThumb").src.startsWith("blob:")) URL.revokeObjectURL($("attachThumb").src);
  $("attachThumb").removeAttribute("src");
  $("attachFile").value = "";
}
$("attachBtn").addEventListener("click", () => $("attachFile").click());
$("attachRemove").addEventListener("click", clearAttach);
$("attachFile").addEventListener("change", async () => {
  const f = $("attachFile").files[0];
  if (!f) return;
  try {
    const blob = await shrinkImage(f, 1600);
    const small = await shrinkImage(f, 1024);
    const b64 = (await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(small); })).split(",")[1];
    const age = Date.now() - (f.lastModified || Date.now());
    const old = age > 30 * 60000 && age < 30 * 86400000;
    S.attach = { blob, b64, old, t: old ? f.lastModified : Date.now() };
    $("attachThumb").src = URL.createObjectURL(blob);
    $("attachInfo").textContent = S.diaryOn ? "Escreva um comentário e envie. A foto vai para o diário." : "Escreva e envie. (O diário está desligado em Ajustes.)";
    $("attachBar").hidden = false;
    $("q").placeholder = "Comente a foto…";
    $("q").focus();
  } catch {
    addMsg("Não consegui abrir essa foto.", "err");
  }
});

$("photoBtn").addEventListener("click", () => {
  const img = grabFrame();
  if (!img) return;
  journal("foto", { text: "foto escolhida pela pessoa" }, img);
  addMsg("Foto guardada no diário.", "sys");
});
loadMemory().then((m) => { S.memory = m; }).catch(() => {});
{
  const pending = store.get("pendingSession", null);
  if (pending?.start) setTimeout(() => askKeepSession({ start: pending.start, end: pending.end || Date.now() }), 2500);
}
initDiary({ claude: (p) => claudeCreate({ model: MODELS.opus, ...p }), explain: (e) => explainError(e), getContext: here });

// ---------- Atualização e cópia dos ajustes ----------
// Garante que cada abertura do app use a versão mais nova publicada
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// Pede ao navegador para não apagar os dados do app (chave, ajustes e diário)
navigator.storage?.persist?.().catch(() => {});

// Avisa quando há uma versão nova publicada, sem perder nada do que está salvo
let lastUpdateCheck = 0;
async function checkUpdate() {
  if (Date.now() - lastUpdateCheck < 10 * 60000) return;
  lastUpdateCheck = Date.now();
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const { v } = await r.json();
    if (v > APP_VERSION) {
      // Com o service worker ativo, recarregar já traz a versão nova; tenta uma vez sozinho
      let tried = false;
      try { tried = sessionStorage.getItem("guia.reloadedFor") === String(v); sessionStorage.setItem("guia.reloadedFor", String(v)); } catch {}
      if (navigator.serviceWorker?.controller && !tried) { location.reload(); return; }
      $("updateBar").hidden = false;
    }
    $("updateBtn").onclick = async () => {
      try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch {}
      location.replace(`${location.pathname}?v=${v}&t=${Date.now()}`);
    };
  } catch {}
}
checkUpdate();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });

function exportSettings() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("guia.") && k !== "guia.pendingSession") data[k] = localStorage.getItem(k);
  }
  return "GUIA1:" + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}
$("copySettings").addEventListener("click", async () => {
  const code = exportSettings();
  $("settingsCode").value = code;
  try { await navigator.clipboard.writeText(code); $("settingsCodeStatus").textContent = "Copiado. Abra o app no outro lugar, vá em Ajustes e cole aqui."; }
  catch { $("settingsCode").select(); $("settingsCodeStatus").textContent = "Selecionei o código: copie e cole no outro lugar."; }
});
$("applySettings").addEventListener("click", () => {
  const code = $("settingsCode").value.trim();
  try {
    if (!code.startsWith("GUIA1:")) throw new Error();
    const data = JSON.parse(decodeURIComponent(escape(atob(code.slice(6)))));
    Object.entries(data).forEach(([k, v]) => { if (k.startsWith("guia.")) localStorage.setItem(k, v); });
    $("settingsCodeStatus").textContent = "Ajustes aplicados. Recarregando…";
    setTimeout(() => location.reload(), 600);
  } catch {
    $("settingsCodeStatus").textContent = "Esse código não é válido. Copie de novo no app de origem.";
  }
});
$("stopBtn").addEventListener("click", () => { stopRoute(); say("Navegação encerrada."); });
$("describeBtn").addEventListener("click", async () => {
  if (!S.camOn && !(await setCamera(true))) return;
  await new Promise((r) => setTimeout(r, 600));
  const n = S.route?.steps[S.stepIdx + 1];
  const t = await lookAndGuide("describe", n ? { instr: instruction(n), d: dist(S.pos, n.at) } : {});
  say(t || "Não consegui analisar a imagem agora.", true);
  if (t) journal("olhar", { text: t }, S.lastLookImg);
});
$("controls").addEventListener("submit", (e) => {
  e.preventDefault();
  let t = $("q").value.trim();
  if (!t && S.attach) t = "Guarda esta foto no diário.";
  if (!t) return;
  $("q").value = ""; $("q").placeholder = "Pergunte…"; fitInput();
  ask(t);
});
$("chips").addEventListener("click", async (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  if (/vendo/.test(b.textContent) && !S.camOn) { if (!(await setCamera(true))) return; await new Promise((r) => setTimeout(r, 600)); }
  ask(b.textContent);
});

setVoice(S.voice);
setRate(S.rate);
startGeo();
if (!S.key) openSettings();
