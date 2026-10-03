// Diário de viagem: guarda no próprio celular (IndexedDB) o trajeto, as falas do guia,
// perguntas, notas, fotos e clipes; gera relatórios de um período com o Claude e mantém o histórico.

const $ = (id) => document.getElementById(id);
let deps = null; // { claude, addMsg, speak, getContext }

// ---------- Banco local ----------
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("guia-diario", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("events", { keyPath: "id", autoIncrement: true }).createIndex("t", "t");
      d.createObjectStore("media", { keyPath: "id", autoIncrement: true });
      d.createObjectStore("reports", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}
const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function store(name, mode = "readonly") { return (await db()).transaction(name, mode).objectStore(name); }

export async function addEvent(type, data = {}, blob = null) {
  try {
    let mediaId = null;
    if (blob) mediaId = await done((await store("media", "readwrite")).add({ blob, type: blob.type, t: Date.now() }));
    return await done((await store("events", "readwrite")).add({ t: Date.now(), type, ...data, mediaId }));
  } catch (e) {
    console.warn("diário", e);
    return null;
  }
}
async function eventsBetween(from, to) {
  return done((await store("events")).index("t").getAll(IDBKeyRange.bound(from, to)));
}
async function getMedia(id) { return id == null ? null : done((await store("media")).get(id)); }
async function allReports() { return (await done((await store("reports")).getAll())).sort((a, b) => b.created - a.created); }
async function getReport(id) { return done((await store("reports")).get(id)); }
async function putReport(r) { return done((await store("reports", "readwrite")).put(r)); }
async function deleteReport(id) { return done((await store("reports", "readwrite")).delete(id)); }

// ---------- Utilidades ----------
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ddmm = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtPeriod = (from, to) => isoDay(from) === isoDay(to)
  ? new Date(from).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
  : `${new Date(from).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${new Date(to).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
export function b64ToBlob(b64, type = "image/jpeg") {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
const blobToDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
function dayRange(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split("-").map(Number), [y2, m2, d2] = toStr.split("-").map(Number);
  return [new Date(y1, m1 - 1, d1, 0, 0, 0).getTime(), new Date(y2, m2 - 1, d2, 23, 59, 59, 999).getTime()];
}
export function todayISO() { return isoDay(Date.now()); }

// ---------- Análise do período ----------
function analyze(events) {
  const track = events.filter((e) => e.type === "pos" && (e.acc ?? 0) < 80);
  let meters = 0;
  for (let i = 1; i < track.length; i++) {
    const d = dist(track[i - 1], track[i]);
    if (d < 2000) meters += d; // ignora saltos do GPS
  }
  // Paradas: ficou 10 min ou mais num raio de 80 m
  const stops = [];
  for (let i = 0; i < track.length;) {
    let j = i;
    while (j + 1 < track.length && dist(track[i], track[j + 1]) < 80) j++;
    if (track[j].t - track[i].t >= 10 * 60000) { stops.push({ from: track[i].t, to: track[j].t, lat: track[i].lat, lon: track[i].lon, addr: track[i].addr }); i = j + 1; }
    else i++;
  }
  const photos = events.filter((e) => e.mediaId != null && e.type !== "clipe");
  const clips = events.filter((e) => e.type === "clipe" && e.mediaId != null);
  const step = Math.max(1, Math.ceil(track.length / 600));
  const line = track.filter((_, i) => i % step === 0 || i === track.length - 1).map((p) => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
  const days = new Set(events.map((e) => isoDay(e.t))).size;
  return { track, line, meters, stops, photos, clips, days };
}

export async function periodPreview(fromStr, toStr) {
  const [from, to] = dayRange(fromStr, toStr);
  const ev = await eventsBetween(from, to);
  const a = analyze(ev);
  return { events: ev.length, km: a.meters / 1000, photos: a.photos.length, clips: a.clips.length, notes: ev.filter((e) => e.type === "nota").length, narrations: ev.filter((e) => e.type === "narracao").length };
}

const REPORT_SYSTEM = `Você é editor de diários de viagem. Recebe o registro bruto de um período (trajeto, paradas, o que o guia contou, perguntas, notas da pessoa, rotas) e algumas fotos da câmera. Escreva um relatório de viagem em português do Brasil, caloroso e informativo, como uma lembrança para guardar.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, neste formato:
{
  "titulo": "título curto e evocativo",
  "subtitulo": "uma linha com lugares e período",
  "resumo": "2 a 4 parágrafos curtos sobre a viagem como um todo, separados por \\n\\n",
  "capa": número da foto de capa ou null,
  "dias": [
    {
      "data": "AAAA-MM-DD",
      "titulo": "título do dia",
      "resumo": "1 parágrafo sobre o dia",
      "destaques": [
        { "hora": "HH:MM", "lugar": "nome do lugar ou rua", "texto": "1 a 3 frases: o que foi visto, feito ou contado ali", "foto": número ou null, "clipe": número ou null }
      ]
    }
  ],
  "curiosidades": ["fatos interessantes contados ao longo do caminho"]
}

Regras:
- Use só o que está no registro e nas fotos. Não invente lugares, refeições ou acontecimentos.
- As notas da pessoa são a fonte mais importante do que ela fez; dê destaque a elas.
- Escolha de 3 a 8 destaques por dia, em ordem de horário. Use "foto" e "clipe" apenas com números que aparecem no registro.
- Prefira para cada destaque uma foto que mostre aquele lugar.`;

export async function generateReport(fromStr, toStr, onStatus = () => {}) {
  const [from, to] = dayRange(fromStr, toStr);
  onStatus("Lendo o diário…");
  const events = await eventsBetween(from, to);
  if (!events.length) throw new Error("Não há nada gravado nesse período.");
  const a = analyze(events);

  // Registro em texto, agrupado por dia
  const lines = [];
  let day = "";
  for (const e of events) {
    if (e.type === "pos") continue;
    if (isoDay(e.t) !== day) { day = isoDay(e.t); lines.push(`\n=== ${day} ===`); }
    const where = e.addr ? ` (${e.addr})` : "";
    const media = e.mediaId != null ? (e.type === "clipe" ? ` [clipe ${e.mediaId}]` : ` [foto ${e.mediaId}]`) : "";
    const txt = {
      narracao: `guia contou: ${e.text}`,
      pergunta: `pessoa perguntou: ${e.text}${e.reply ? ` | resposta: ${e.reply}` : ""}`,
      nota: `NOTA DA PESSOA: ${e.text}`,
      rota: `rota iniciada até ${e.text}`,
      chegada: `chegou a ${e.text}`,
      olhar: `descrição da câmera: ${e.text}`,
      clipe: "clipe de vídeo gravado",
      foto: "foto",
    }[e.type] || e.text || e.type;
    lines.push(`${hhmm(e.t)}${where} ${txt}${media}`);
  }
  let log = lines.join("\n");
  if (log.length > 300000) log = log.slice(0, 150000) + "\n[…trecho do meio omitido…]\n" + log.slice(-150000);
  const stopsTxt = a.stops.map((s) => `- ${ddmm(s.from)} ${hhmm(s.from)}–${hhmm(s.to)} parada de ${Math.round((s.to - s.from) / 60000)} min${s.addr ? ` em ${s.addr}` : ""}`).join("\n");

  // Até 16 fotos espalhadas pelo período
  const pick = [];
  const n = Math.min(16, a.photos.length);
  for (let i = 0; i < n; i++) pick.push(a.photos[Math.floor((i * a.photos.length) / n)]);
  onStatus(`Preparando ${pick.length} fotos…`);
  const content = [];
  for (const e of pick) {
    const m = await getMedia(e.mediaId);
    if (!m?.blob) continue;
    const data = (await blobToDataURL(m.blob)).split(",")[1];
    content.push({ type: "text", text: `Foto ${e.mediaId} — ${ddmm(e.t)} ${hhmm(e.t)}${e.addr ? `, ${e.addr}` : ""}` });
    content.push({ type: "image", source: { type: "base64", media_type: m.type || "image/jpeg", data } });
  }
  content.push({ type: "text", text: `Período: ${fmtPeriod(from, to)}. Distância percorrida: ${(a.meters / 1000).toFixed(1)} km em ${a.days} dia(s). Fotos no período: ${a.photos.length}. Clipes: ${a.clips.length}.\n\nParadas longas:\n${stopsTxt || "- nenhuma"}\n\nRegistro:\n${log}` });

  onStatus("Escrevendo o relatório com o Claude…");
  const resp = await deps.claude({ max_tokens: 16000, system: REPORT_SYSTEM, output_config: { effort: "medium" }, messages: [{ role: "user", content }] });
  if (resp.stop_reason === "refusal") throw new Error("O Claude não conseguiu montar este relatório.");
  const raw = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let body;
  try { body = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); }
  catch { throw new Error("O relatório veio num formato inesperado. Tente de novo."); }

  // Só aceita fotos e clipes que existem no período
  const valid = new Set([...a.photos, ...a.clips].map((e) => e.mediaId));
  const posOf = new Map([...a.photos, ...a.clips].filter((e) => e.lat != null).map((e) => [e.mediaId, [e.lat, e.lon]]));
  for (const d of body.dias || []) for (const h of d.destaques || []) {
    if (!valid.has(h.foto)) h.foto = null;
    if (!valid.has(h.clipe)) h.clipe = null;
    h.pos = posOf.get(h.foto) || posOf.get(h.clipe) || null;
  }
  if (!valid.has(body.capa)) body.capa = (body.dias || []).flatMap((d) => d.destaques || []).find((h) => h.foto)?.foto ?? a.photos[0]?.mediaId ?? null;

  const report = {
    created: Date.now(), from, to, fromStr, toStr, pinned: false,
    title: body.titulo || "Viagem", subtitle: body.subtitulo || fmtPeriod(from, to), summary: body.resumo || "",
    cover: body.capa, days: body.dias || [], facts: body.curiosidades || [],
    stats: { km: a.meters / 1000, days: a.days, stops: a.stops.length, photos: a.photos.length, clips: a.clips.length },
    line: a.line,
  };
  report.id = await putReport(report);
  onStatus("");
  return report;
}

// ---------- Telas ----------
let reportMap = null;
const objectUrls = [];
function mediaURL(blob) { const u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
function releaseURLs() { objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u)); }

export function openDiary(tab = "list") {
  $("diary").hidden = false;
  showTab(tab);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
function closeDiary() { $("diary").hidden = true; closeReport(); }
function showTab(tab) {
  for (const t of ["list", "new"]) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === tab));
    $(`panel-${t}`).hidden = t !== tab;
  }
  if (tab === "list") renderList();
  else updatePreview();
}

async function renderList() {
  const box = $("reportList");
  const reports = await allReports().catch(() => []);
  box.replaceChildren();
  if (!reports.length) {
    box.innerHTML = `<div class="empty"><strong>Nenhum relatório ainda.</strong><br>Enquanto você passeia, o app guarda o trajeto, as falas do guia, fotos e clipes. Em "Novo relatório", escolha as datas e gere o primeiro.</div>`;
  }
  for (const r of reports) {
    const card = document.createElement("button");
    card.className = "rcard";
    const cover = r.cover != null ? await getMedia(r.cover) : null;
    card.innerHTML = `
      <div class="rthumb">${cover?.blob ? `<img alt="" src="${mediaURL(cover.blob)}">` : ""}</div>
      <div class="rbody">
        <div class="rtitle">${r.pinned ? '<span class="pin" title="Permanente">★</span> ' : ""}${esc(r.title)}</div>
        <div class="rmeta">${esc(fmtPeriod(r.from, r.to))} · ${r.stats.km.toFixed(1).replace(".", ",")} km · ${r.stats.photos} fotos</div>
        <div class="rsum">${esc((r.summary || "").split("\n")[0].slice(0, 160))}${(r.summary || "").length > 160 ? "…" : ""}</div>
      </div>`;
    card.addEventListener("click", () => openReport(r.id));
    box.appendChild(card);
  }
  const est = await navigator.storage?.estimate?.().catch(() => null);
  $("storageInfo").textContent = est ? `Espaço usado pelo diário neste celular: ${(est.usage / 1048576).toFixed(0)} MB` : "";
}

async function updatePreview() {
  const f = $("dFrom").value, t = $("dTo").value;
  if (!f || !t) return;
  if (f > t) { $("dPreview").textContent = "A data inicial é depois da final."; return; }
  const p = await periodPreview(f, t).catch(() => null);
  $("dPreview").textContent = !p || !p.events ? "Nada gravado nesse período ainda."
    : `Nesse período: ${p.km.toFixed(1).replace(".", ",")} km, ${p.narrations} falas do guia, ${p.notes} notas, ${p.photos} fotos e ${p.clips} clipes.`;
}

async function openReport(id) {
  const r = await getReport(id);
  if (!r) return;
  releaseURLs();
  const v = $("reportView");
  v.hidden = false;
  v.scrollTop = 0;
  const media = new Map();
  const ids = new Set([r.cover, ...r.days.flatMap((d) => (d.destaques || []).flatMap((h) => [h.foto, h.clipe]))].filter((x) => x != null));
  for (const mid of ids) { const m = await getMedia(mid); if (m?.blob) media.set(mid, mediaURL(m.blob)); }
  const fig = (h) => h.clipe != null && media.has(h.clipe)
    ? `<video controls playsinline preload="metadata" src="${media.get(h.clipe)}"></video>`
    : h.foto != null && media.has(h.foto) ? `<img alt="${esc(h.lugar)}" loading="lazy" src="${media.get(h.foto)}">` : "";
  $("reportBody").innerHTML = `
    ${r.cover != null && media.has(r.cover) ? `<img class="rcover" alt="" src="${media.get(r.cover)}">` : ""}
    <h2>${esc(r.title)}</h2>
    <p class="rsub">${esc(r.subtitle)}</p>
    <div class="rstats">
      <span><b>${r.stats.km.toFixed(1).replace(".", ",")}</b> km</span><span><b>${r.stats.days}</b> dia(s)</span>
      <span><b>${r.stats.stops}</b> paradas</span><span><b>${r.stats.photos}</b> fotos</span><span><b>${r.stats.clips}</b> clipes</span>
    </div>
    <div id="reportMap" class="rmap"></div>
    ${r.summary.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}
    ${r.days.map((d) => `
      <section class="rday">
        <h3>${esc(d.titulo)} <small>${esc(cap(new Date(d.data + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })))}</small></h3>
        <p>${esc(d.resumo)}</p>
        ${(d.destaques || []).map((h) => `
          <article class="rhl">
            <div class="rhl-head"><span class="rtime">${esc(h.hora)}</span> <strong>${esc(h.lugar)}</strong></div>
            <p>${esc(h.texto)}</p>
            ${fig(h)}
          </article>`).join("")}
      </section>`).join("")}
    ${r.facts.length ? `<section class="rday"><h3>Curiosidades do caminho</h3><ul>${r.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></section>` : ""}`;
  $("pinBtn").textContent = r.pinned ? "★ Permanente" : "☆ Permanente";
  $("pinBtn").setAttribute("aria-pressed", String(r.pinned));
  $("reportView").dataset.id = r.id;

  if (reportMap) { reportMap.remove(); reportMap = null; }
  if (r.line.length) {
    reportMap = L.map("reportMap", { zoomControl: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(reportMap);
    const pl = L.polyline(r.line, { color: "#14675b", weight: 5 }).addTo(reportMap);
    r.days.forEach((d) => (d.destaques || []).forEach((h) => { if (h.pos) L.circleMarker(h.pos, { radius: 7, color: "#e8a21a", fillOpacity: 0.9 }).bindTooltip(`${h.hora} ${h.lugar}`).addTo(reportMap); }));
    reportMap.fitBounds(pl.getBounds(), { padding: [20, 20] });
  } else $("reportMap").hidden = true;
}
function closeReport() {
  $("reportView").hidden = true;
  if (reportMap) { reportMap.remove(); reportMap = null; }
  releaseURLs();
}

// Confirmação dentro da página (o navegador pode bloquear confirm())
function confirmBox(text, okLabel) {
  return new Promise((resolve) => {
    const d = $("confirmDlg");
    $("confirmText").textContent = text;
    $("confirmOk").textContent = okLabel;
    d.returnValue = "";
    d.onclose = () => resolve(d.returnValue === "ok");
    d.showModal();
  });
}

async function onDelete() {
  const id = +$("reportView").dataset.id;
  const r = await getReport(id);
  if (!r) return;
  if (r.pinned) {
    await confirmBox(`"${r.title}" está salvo como permanente. Para excluir, desmarque "Permanente" primeiro.`, "Entendi");
    return;
  }
  const ok = await confirmBox(`Excluir o relatório "${r.title}" (${fmtPeriod(r.from, r.to)})? As fotos e clipes continuam no diário, mas este relatório some do histórico.`, "Excluir");
  if (!ok) return;
  await deleteReport(id);
  closeReport();
  renderList();
}
async function onPin() {
  const r = await getReport(+$("reportView").dataset.id);
  if (!r) return;
  r.pinned = !r.pinned;
  await putReport(r);
  $("pinBtn").textContent = r.pinned ? "★ Permanente" : "☆ Permanente";
  $("pinBtn").setAttribute("aria-pressed", String(r.pinned));
  renderList();
}

// ---------- Exportar (arquivo HTML único, para guardar ou trazer ao Claude) ----------
function routeSVG(line) {
  if (line.length < 2) return "";
  const lats = line.map((p) => p[0]), lons = line.map((p) => p[1]);
  const [minLa, maxLa, minLo, maxLo] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(rad((minLa + maxLa) / 2));
  const w = Math.max((maxLo - minLo) * k, 1e-6), h = Math.max(maxLa - minLa, 1e-6);
  const W = 600, H = Math.max(200, Math.min(600, (W * h) / w));
  const sc = Math.min((W - 40) / w, (H - 40) / h);
  const pts = line.map(([la, lo]) => `${(20 + (lo - minLo) * k * sc).toFixed(1)},${(H - 20 - (la - minLa) * sc).toFixed(1)}`).join(" ");
  const [sx, sy] = pts.split(" ")[0].split(","), [ex, ey] = pts.split(" ").at(-1).split(",");
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="Trajeto percorrido"><rect width="100%" height="100%" fill="#eef2ee"/><polyline points="${pts}" fill="none" stroke="#14675b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx}" cy="${sy}" r="7" fill="#2f7cf6"/><circle cx="${ex}" cy="${ey}" r="7" fill="#e8a21a"/></svg>`;
}

async function exportReport() {
  const r = await getReport(+$("reportView").dataset.id);
  if (!r) return;
  $("exportBtn").textContent = "Preparando…";
  try {
    const data = new Map();
    let budget = 60 * 1048576; // limita o arquivo a ~60 MB
    const ids = [r.cover, ...r.days.flatMap((d) => (d.destaques || []).flatMap((h) => [h.foto, h.clipe]))].filter((x) => x != null);
    for (const mid of new Set(ids)) {
      const m = await getMedia(mid);
      if (!m?.blob || m.blob.size > budget) continue;
      budget -= m.blob.size;
      data.set(mid, await blobToDataURL(m.blob));
    }
    const fig = (h) => h.clipe != null && data.has(h.clipe) ? `<video controls playsinline src="${data.get(h.clipe)}"></video>`
      : h.foto != null && data.has(h.foto) ? `<img alt="${esc(h.lugar)}" src="${data.get(h.foto)}">` : "";
    const center = r.line.length ? r.line[Math.floor(r.line.length / 2)] : null;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)}</title>
<style>
:root{--bg:#f6f7f3;--fg:#17231f;--mut:#5c6b65;--acc:#14675b;--line:#d8ded8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0f1614;--fg:#e8efec;--mut:#9aaba4;--acc:#3fb3a0;--line:#2a3733;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 Georgia,"Times New Roman",serif}
main{max-width:760px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:2rem;line-height:1.15;margin:.4em 0 .1em}h2{font-size:1.35rem;margin:2em 0 .3em}h2 small{display:block;font:500 .85rem system-ui,sans-serif;color:var(--mut)}
.sub{color:var(--mut);margin:0 0 1em;font-family:system-ui,sans-serif}
.stats{display:flex;flex-wrap:wrap;gap:8px 18px;font:15px system-ui,sans-serif;color:var(--mut);margin:12px 0 18px}.stats b{color:var(--fg);font-size:1.2rem}
img,video,svg{width:100%;height:auto;border-radius:12px;display:block;margin:10px 0}
.cover{aspect-ratio:16/9;object-fit:cover}
article{border-top:1px solid var(--line);padding:14px 0}.t{font:600 .85rem system-ui,sans-serif;color:var(--acc);margin-right:6px}
a{color:var(--acc)}footer{margin-top:40px;font:13px system-ui,sans-serif;color:var(--mut)}
</style></head><body><main>
${r.cover != null && data.has(r.cover) ? `<img class="cover" alt="" src="${data.get(r.cover)}">` : ""}
<h1>${esc(r.title)}</h1><p class="sub">${esc(r.subtitle)} · ${esc(fmtPeriod(r.from, r.to))}</p>
<div class="stats"><span><b>${r.stats.km.toFixed(1).replace(".", ",")}</b> km</span><span><b>${r.stats.days}</b> dia(s)</span><span><b>${r.stats.stops}</b> paradas</span><span><b>${r.stats.photos}</b> fotos</span></div>
${routeSVG(r.line)}
${center ? `<p class="sub"><a href="https://www.openstreetmap.org/#map=15/${center[0]}/${center[1]}">Ver a região no mapa</a></p>` : ""}
${r.summary.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}
${r.days.map((d) => `<h2>${esc(d.titulo)}<small>${esc(cap(new Date(d.data + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })))}</small></h2><p>${esc(d.resumo)}</p>
${(d.destaques || []).map((h) => `<article><div><span class="t">${esc(h.hora)}</span><strong>${esc(h.lugar)}</strong></div><p>${esc(h.texto)}</p>${fig(h)}</article>`).join("")}`).join("")}
${r.facts.length ? `<h2>Curiosidades do caminho</h2><ul>${r.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
<footer>Relatório gerado pelo Guia de Rua em ${new Date(r.created).toLocaleString("pt-BR")}.</footer>
</main>
<script type="application/json" id="dados">${JSON.stringify({ ...r, line: r.line }).replace(/</g, "\\u003c")}</script>
</body></html>`;
    const name = `viagem-${r.fromStr}${r.toStr !== r.fromStr ? "_a_" + r.toStr : ""}.html`;
    const file = new File([html], name, { type: "text/html" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: r.title }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  } finally {
    $("exportBtn").textContent = "Exportar";
  }
}

async function onGenerate() {
  const f = $("dFrom").value, t = $("dTo").value;
  if (!f || !t || f > t) { $("dStatus").textContent = "Escolha um período válido."; return; }
  $("genBtn").disabled = true;
  try {
    const r = await generateReport(f, t, (s) => { $("dStatus").textContent = s; });
    $("dStatus").textContent = "";
    showTab("list");
    openReport(r.id);
  } catch (e) {
    $("dStatus").textContent = deps.explain ? deps.explain(e) : e.message;
  } finally {
    $("genBtn").disabled = false;
  }
}

export async function addNote(text) {
  const ctx = deps.getContext();
  return addEvent("nota", { text, ...ctx });
}

export function initDiary(d) {
  deps = d;
  $("dFrom").value = $("dTo").value = todayISO();
  $("diaryBtn").addEventListener("click", () => openDiary("list"));
  $("diaryClose").addEventListener("click", closeDiary);
  $("tab-list").addEventListener("click", () => showTab("list"));
  $("tab-new").addEventListener("click", () => showTab("new"));
  $("dFrom").addEventListener("change", updatePreview);
  $("dTo").addEventListener("change", updatePreview);
  $("genBtn").addEventListener("click", onGenerate);
  $("noteBtn").addEventListener("click", async () => {
    const t = $("noteText").value.trim();
    if (!t) return;
    await addNote(t);
    $("noteText").value = "";
    $("dStatus").textContent = "Nota guardada no diário.";
    updatePreview();
  });
  $("reportBack").addEventListener("click", closeReport);
  $("deleteBtn").addEventListener("click", onDelete);
  $("pinBtn").addEventListener("click", onPin);
  $("exportBtn").addEventListener("click", exportReport);
}
export { openReport };
