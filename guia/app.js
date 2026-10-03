import Anthropic from "./vendor/anthropic-sdk.js";

// ---------- Configuração ----------
const MODEL = "claude-opus-5-5";
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
let ptVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  ptVoice = vs.find((v) => v.lang === "pt-BR") || vs.find((v) => v.lang?.startsWith("pt")) || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, { interrupt = false } = {}) {
  if (!S.voice || !("speechSynthesis" in window) || !text) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>|]/g, "").replace(/\s+/g, " "));
  u.lang = "pt-BR";
  if (ptVoice) u.voice = ptVoice;
  u.rate = S.rate;
  u.onend = u.onerror = () => { S.lastSpeechEnd = Date.now(); };
  speechSynthesis.speak(u);
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
  return { completo: j.display_name, curto: [rua, bairro, cidade].filter(Boolean).join(" · "), rua: a.road, bairro, cidade, estado: a.state, lugar: j.name || null };
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
  qualquer: ['["amenity"]', '["shop"]', '["tourism"]'],
};

async function nearby(categoria, raio) {
  if (!S.pos) throw new Error("Ainda sem localização.");
  const filters = CATEGORIES[categoria] || CATEGORIES.qualquer;
  const r = Math.min(Math.max(raio || 600, 100), 3000);
  const parts = filters.map((f) => `nwr${f}["name"](around:${r},${S.pos.lat},${S.pos.lon});`).join("");
  const q = `[out:json][timeout:20];(${parts});out center tags 80;`;
  const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
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
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      $("cam").srcObject = stream; $("cam").hidden = false; await $("cam").play();
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
  $("camBtn").setAttribute("aria-label", S.camOn ? "Desligar câmera" : "Ligar câmera");
  return S.camOn;
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
const SYSTEM = `Você é o Guia de Rua, um assistente de localização e viagem que acompanha a pessoa pelo celular enquanto ela anda, pedala ou dirige.

Como trabalhar:
- Use as ferramentas para dados reais de localização, lugares e rotas. Nunca invente nomes, endereços, distâncias ou horários.
- Quando houver uma imagem da câmera, ela mostra o que está à frente da pessoa. Use o que aparece (cor das fachadas, placas, lojas, árvores, faixas, esquinas) para orientar: "o restaurante fica depois daquela casa amarela à direita". Só cite o que de fato está visível.
- Para levar a pessoa a algum lugar: encontre o destino (buscar_lugar ou buscar_proximos) e chame iniciar_rota. Se houver várias opções parecidas, escolha a mais próxima e diga qual escolheu, sem perguntar, a menos que a dúvida seja real.
- A partir daí o app mostra as conversões na tela (e fala, se a pessoa ativou os avisos falados); você não precisa repetir a rota inteira. Diga só o primeiro passo e o tempo estimado.

Estilo: português do Brasil, frases curtas e naturais, pensadas para serem ouvidas. Até 3 frases, salvo se pedirem detalhes. Sem markdown, listas ou emojis. Distâncias arredondadas ("uns 200 metros").

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
    description: "Muda preferências do app: velocidade da fala (1, 1.5 ou 2), se o guia ao vivo deve indicar para onde olhar e virar, e se os avisos de navegação (conversões da rota) devem ser falados em voz alta.",
    input_schema: { type: "object", properties: { velocidade_fala: { type: "number", enum: [1, 1.5, 2] }, direcoes_no_guia_ao_vivo: { type: "boolean" }, avisos_de_navegacao_falados: { type: "boolean" } } },
  },
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
    case "iniciar_rota": return await startRoute({ lat: input.lat, lon: input.lon, nome: input.nome });
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
  parts.push(S.camOn ? "Câmera: imagem anexada (o que está à frente da pessoa)" : "Câmera: desligada");
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
    model: MODEL,
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
  const img = grabFrame();
  if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
  content.push({ type: "text", text: `${contextLine()}\n\n${text}` });
  S.history.push({ role: "user", content });

  try {
    for (let round = 0; round < 8; round++) {
      const resp = await claudeCreate({
        max_tokens: 8000, system: SYSTEM, tools: TOOLS, messages: S.history,
        output_config: { effort: "low" }, cache_control: { type: "ephemeral" },
      });
      if (resp.stop_reason === "refusal") { S.history.length = snapshot; wait.remove(); say("Não posso ajudar com esse pedido."); return; }
      S.history.push({ role: "assistant", content: resp.content });
      const reply = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const calls = resp.content.filter((b) => b.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || !calls.length) { wait.remove(); say(reply || "Pronto."); return; }
      wait.textContent = "Consultando mapa…";
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
  if (!client || !S.camOn || S.guideBusy) return null;
  const img = grabFrame();
  if (!img) return null;
  S.guideBusy = true; S.lastLook = Date.now();
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
const LIVE_GAP = { continuo: 2500, normal: 10000, calmo: 25000 };

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
- Só se realmente não houver nada novo para dizer, responda exatamente [SILENCIO].`;

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
  const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
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
      return `- ${p.nome} (${p.info}) — ${Math.round(p.d)} m${dir}`;
    }).join("\n");
}

async function liveNarrate() {
  S.liveBusy = true;
  try {
    await refreshLivePois().catch(() => {});
    const img = grabFrame();
    const f = facing();
    const lines = [
      S.liveDirections
        ? 'Preferência de direções: LIGADA. Diga para onde olhar ou virar ("olhe à sua esquerda", "atrás de você", "logo à frente") usando as direções relativas dos dados; se a direção for desconhecida, descreva pela imagem.'
        : 'Preferência de direções: DESLIGADA. Não diga para onde olhar, virar ou andar (nada de "à esquerda", "à direita", "atrás de você", "vire", "siga"). Só conte o que há e o que se vê; pode dizer a distância.',
      `Hora local: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Modo: ${MODE_LABEL[S.mode]}.`,
      S.address ? `Local: ${S.address.completo}` : "Local: endereço ainda desconhecido",
      S.pos ? `Coordenadas: ${S.pos.lat.toFixed(5)}, ${S.pos.lon.toFixed(5)} (±${Math.round(S.pos.acc)} m)` : "Sem GPS no momento.",
      `Câmera apontando para: ${S.liveDirections && f != null ? cardinal(f) : "não informado"}${S.pos?.speed > 0.5 ? `; andando a ${Math.round(S.pos.speed * 3.6)} km/h` : ""}.`,
    ];
    if (S.route && S.liveDirections) { const n = S.route.steps[S.stepIdx + 1]; lines.push(`Rota ativa até ${S.route.dest.nome}; próxima manobra: ${n ? instruction(n) + " em " + fmtDist(dist(S.pos, n.at)) : "chegada"}.`); }
    if (S.pos && S.livePois.length) lines.push(`\nLugares do mapa por perto (até 350 m):\n${livePoiLines()}`);
    lines.push(S.liveSaid.length ? `\nO que você já contou (não repita):\n${S.liveSaid.map((t) => "- " + t).join("\n")}` : "\nVocê ainda não falou nada; comece se apresentando em poucas palavras e contando onde a pessoa está.");
    lines.push(img ? "\nA imagem anexada é o que a pessoa vê agora." : "\nSem imagem da câmera neste momento.");

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
    addMsg(text, "bot");
    speak(text);
    // Se a voz estiver desligada, dá tempo de ler antes da próxima
    const readMs = S.voice ? 0 : (text.split(/\s+/).length / 3) * 1000;
    S.liveReadyAt = Date.now() + readMs + LIVE_GAP[S.livePace];
  } catch (e) {
    S.liveErrors++;
    if (e instanceof Anthropic.AuthenticationError || S.liveErrors >= 3) {
      addMsg(explainError(e) + " Guia ao vivo desligado.", "err");
      setLive(false);
    } else {
      S.liveReadyAt = Date.now() + 15000;
    }
  } finally {
    S.liveBusy = false;
  }
}

function liveTick() {
  if (!S.live) return;
  const speaking = "speechSynthesis" in window && (speechSynthesis.speaking || speechSynthesis.pending);
  const idle = !speaking && !S.liveBusy && !S.busy && !S.guideBusy && !rec && document.visibilityState === "visible";
  const sinceSpeech = Date.now() - (S.lastSpeechEnd || 0);
  if (idle && Date.now() >= S.liveReadyAt && (!S.voice || sinceSpeech >= LIVE_GAP[S.livePace])) liveNarrate();
  S.liveTimer = setTimeout(liveTick, 1000);
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

async function setLive(on) {
  if (on) {
    if (!client) { openSettings(); return; }
    enableCompass();
    if (!S.camOn && !(await setCamera(true))) return;
    if (!S.voice) setVoice(true);
    S.live = true; S.liveSaid = []; S.liveErrors = 0; S.liveReadyAt = 0; S.lastSpeechEnd = 0;
    keepAwake(true);
    addMsg("Guia ao vivo ligado. Aponte a câmera para a rua e eu vou contando o que há por aqui.", "sys");
    clearTimeout(S.liveTimer);
    S.liveTimer = setTimeout(liveTick, 800);
  } else {
    S.live = false;
    clearTimeout(S.liveTimer);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (!S.route) keepAwake(false);
    addMsg("Guia ao vivo desligado.", "sys");
  }
  $("liveBtn").setAttribute("aria-pressed", String(S.live));
  $("liveBtn").querySelector("span").textContent = S.live ? "Guia ao vivo · tocar para parar" : "Guia ao vivo";
}

// ---------- Voz (entrada) ----------
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function listen() {
  if (!Rec) { addMsg("Este navegador não reconhece fala. Use o microfone do teclado do celular.", "sys"); $("q").focus(); return; }
  if (rec) { rec.stop(); return; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  rec = new Rec();
  rec.lang = "pt-BR"; rec.interimResults = true; rec.maxAlternatives = 1;
  let finalText = "";
  rec.onresult = (ev) => {
    let t = "";
    for (const r of ev.results) { t += r[0].transcript; if (r.isFinal) finalText = t; }
    $("q").value = t;
  };
  rec.onerror = (ev) => { if (ev.error === "not-allowed") addMsg("Microfone negado. Libere a permissão no navegador.", "err"); };
  rec.onend = () => {
    $("micBtn").classList.remove("listening"); rec = null;
    const t = (finalText || $("q").value).trim();
    if (t) { $("q").value = ""; ask(t); }
  };
  $("micBtn").classList.add("listening");
  rec.start();
}

// ---------- Ajustes ----------
function openSettings() {
  $("apiKey").value = S.key; $("mode").value = S.mode; $("lookEvery").value = S.lookEvery; $("liveDirections").value = S.liveDirections ? "on" : "off"; $("navVoice").value = S.navVoice ? "on" : "off"; $("livePace").value = S.livePace;
  $("settings").showModal();
}
$("settings").addEventListener("close", () => {
  if ($("settings").returnValue !== "save") return;
  S.key = $("apiKey").value.trim(); S.mode = $("mode").value; S.lookEvery = $("lookEvery").value; S.liveDirections = $("liveDirections").value === "on"; S.navVoice = $("navVoice").value === "on"; S.livePace = $("livePace").value;
  store.set("key", S.key); store.set("mode", S.mode); store.set("lookEvery", S.lookEvery); store.set("liveDirections", S.liveDirections); store.set("navVoice", S.navVoice); store.set("livePace", S.livePace);
  client = S.key ? new Anthropic({ apiKey: S.key, dangerouslyAllowBrowser: true }) : null;
  if (S.route) startRoute(S.route.dest).catch((e) => addMsg(e.message, "err"));
});

// ---------- Eventos ----------
const SPEEDS = [1, 1.5, 2];
const speedLabel = (r) => `${String(r).replace(".", ",")}x`;
function setRate(r) {
  S.rate = r; store.set("rate", r);
  $("speedBtn").textContent = speedLabel(r);
  $("speedBtn").setAttribute("aria-label", `Velocidade da fala: ${speedLabel(r)}. Tocar para mudar`);
}
$("speedBtn").addEventListener("click", () => {
  const next = SPEEDS.find((x) => x > S.rate + 0.01) ?? SPEEDS[0];
  setRate(next);
  speak(`Velocidade ${speedLabel(next)}`, { interrupt: !S.live });
});

function setVoice(on) {
  S.voice = on; store.set("voice", on);
  $("voiceBtn").setAttribute("aria-pressed", String(on));
  $("voiceBtn").setAttribute("aria-label", on ? "Desligar fala" : "Ligar fala em voz alta");
}
$("voiceBtn").addEventListener("click", () => {
  setVoice(!S.voice);
  if (S.voice) speak("Voz ligada. Vou falando as respostas e as conversões.", { interrupt: true });
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
});
$("camBtn").addEventListener("click", () => setCamera(!S.camOn));
$("liveBtn").addEventListener("click", () => setLive(!S.live));
$("cam").addEventListener("click", () => $("stage").classList.toggle("cam-big"));
$("micBtn").addEventListener("click", listen);
$("settingsBtn").addEventListener("click", openSettings);
$("stopBtn").addEventListener("click", () => { stopRoute(); say("Navegação encerrada."); });
$("describeBtn").addEventListener("click", async () => {
  if (!S.camOn && !(await setCamera(true))) return;
  await new Promise((r) => setTimeout(r, 600));
  const n = S.route?.steps[S.stepIdx + 1];
  const t = await lookAndGuide("describe", n ? { instr: instruction(n), d: dist(S.pos, n.at) } : {});
  say(t || "Não consegui analisar a imagem agora.", true);
});
$("controls").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("q").value.trim();
  if (!t) return;
  $("q").value = "";
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
