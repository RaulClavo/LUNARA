import { initSkyDome, updateSkyDome } from './skydome.js';

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const R_MOON_KM = 1737.4;
const C_KM_S = 299792.458;
const AU_KM = 149597870.7;
const SOLAR_CONSTANT = 1361;
const STEFAN_BOLTZMANN = 5.670374e-8;
const ALBEDO_MOON = 0.12;
const EMISSIVITY_MOON = 0.95;

let DATA = null;
let TIMES = null;
let PRESETS = [];

function setCurrentDateTime() {
  const now = new Date();
  const utc2Time = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  const yyyy = utc2Time.getUTCFullYear();
  const mm = String(utc2Time.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc2Time.getUTCDate()).padStart(2, '0');
  const hh = String(utc2Time.getUTCHours()).padStart(2, '0');
  const min = String(utc2Time.getUTCMinutes()).padStart(2, '0');
  document.getElementById("date").value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

async function loadData() {
  const res = await fetch("data/positions.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}. Ejecuta gen_pos.py.`);
  DATA = await res.json();
  TIMES = Float64Array.from(DATA, r => r.t);
}

async function loadPresets() {
  try {
    const res = await fetch("data/presets.json");
    PRESETS = await res.json();
    const select = document.getElementById("preset");
    
    PRESETS.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    select.addEventListener("change", (e) => {
      const idx = e.target.value;
      if (idx === "") return;
      const p = PRESETS[idx];
      document.getElementById("lat").value = p.lat;
      document.getElementById("lon").value = p.lon;
      document.getElementById("alt").value = p.alt;
      if (p.date) document.getElementById("date").value = p.date;
      document.getElementById("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
  } catch (e) { console.warn("No se pudieron cargar los presets", e); }
}

function interp(et, key) {
  if (et <= TIMES[0]) return DATA[0][key];
  if (et >= TIMES[TIMES.length - 1]) return DATA[DATA.length - 1][key];
  let lo = 0, hi = TIMES.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TIMES[mid] <= et) lo = mid; else hi = mid;
  }
  const f = (et - TIMES[lo]) / (TIMES[hi] - TIMES[lo]);
  const v0 = DATA[lo][key], v1 = DATA[hi][key];
  if (Array.isArray(v0)) {
    return [v0[0] + f * (v1[0] - v0[0]), v0[1] + f * (v1[1] - v0[1]), v0[2] + f * (v1[2] - v0[2])];
  }
  return v0 + f * (v1 - v0);
}

function enuFrame(latDeg, lonDeg) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  return { north, east, up };
}

function siteOffset(latDeg, lonDeg, altKm) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const r = R_MOON_KM + altKm;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

function getAstroData(vec, latDeg, lonDeg, altKm) {
  const off = siteOffset(latDeg, lonDeg, altKm);
  const v = [vec[0] - off[0], vec[1] - off[1], vec[2] - off[2]];
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n === 0) return { el: 0, az: 0, dist: 0 };
  const { up, east, north } = enuFrame(latDeg, lonDeg);
  const u = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / n;
  const e = (v[0] * east[0] + v[1] * east[1] + v[2] * east[2]) / n;
  const no = (v[0] * north[0] + v[1] * north[1] + v[2] * north[2]) / n;
  const el = Math.asin(Math.max(-1, Math.min(1, u))) * 180 / Math.PI;
  const az = (Math.atan2(e, no) * 180 / Math.PI + 360) % 360;
  return { el, az, dist: n };
}

function calculateTemperature(el, distKm) {
  if (el <= 0) return -173; 
  const distAU = distKm / AU_KM;
  const flux = (SOLAR_CONSTANT / (distAU * distAU)) * Math.sin(el * Math.PI / 180);
  const T_kelvin = Math.pow((flux * (1 - ALBEDO_MOON)) / (EMISSIVITY_MOON * STEFAN_BOLTZMANN), 0.25);
  const tempC = Math.round(T_kelvin - 273.15);
  return Math.max(-173, tempC);
}

function computeWindows(lat, lon, alt, startISO, hours = 24) {
  const startMs = new Date(startISO).getTime();
  const et0 = (startMs - J2000_MS) / 1000;
  const rows = [];
  const n = hours * 60;
  for (let i = 0; i < n; i++) { 
    const et = et0 + i * 60;
    const sunData = getAstroData(interp(et, "sun"), lat, lon, alt);
    const earthData = getAstroData(interp(et, "earth"), lat, lon, alt);
    rows.push({
      t: new Date(startMs + i * 60000).toISOString(),
      sun_el: sunData.el,
      sun_az: sunData.az,
      sun_dist: sunData.dist,
      earth_el: earthData.el,
      earth_az: earthData.az,
      earth_dist: earthData.dist,
      phase: interp(et, "phase"),
      sub_lat: interp(et, "sub_lat"),
      sub_lon: interp(et, "sub_lon"),
      temp: calculateTemperature(sunData.el, sunData.dist)
    });
  }
  return rows;
}

function extractEvents(rows) {
  const stats = { 
    sun: { max_el: -90, max_temp: -273, min_temp: 200, max_row: null, visible_mins: 0 }, 
    earth: { max_el: -90, max_row: null, visible_mins: 0 } 
  };
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].sun_el > stats.sun.max_el) { stats.sun.max_el = rows[i].sun_el; stats.sun.max_row = rows[i]; }
    if (rows[i].sun_el > 0) stats.sun.visible_mins++;
    if (rows[i].temp > stats.sun.max_temp) stats.sun.max_temp = rows[i].temp;
    if (rows[i].temp < stats.sun.min_temp) stats.sun.min_temp = rows[i].temp;
    if (rows[i].earth_el > stats.earth.max_el) { stats.earth.max_el = rows[i].earth_el; stats.earth.max_row = rows[i]; }
    if (rows[i].earth_el > 0) stats.earth.visible_mins++;
  }
  return stats;
}

function formatDuration(mins) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function renderTemps(stats) {
  const container = document.getElementById("temp-summary");
  container.innerHTML = `
    <div class="temp-box hot">
      <div class="temp-title">Temp. Máxima (Día)</div>
      <div class="temp-value">${stats.sun.max_temp} °C</div>
    </div>
    <div class="temp-box cold">
      <div class="temp-title">Temp. Mínima (Noche)</div>
      <div class="temp-value">${stats.sun.min_temp} °C</div>
    </div>
  `;
}

function renderSummary(stats, rows, lat, lon) {
  const container = document.getElementById("summary");
  
  const makeCard = (name, icon, colorClass, data, isEarth) => {
    let extraHtml = "";
    
    if (isEarth) {
      const delay = (data.max_row.earth_dist * 2 / C_KM_S).toFixed(2);
      extraHtml = `
        <div class="detail"><span>Retardo señal:</span> <span>${delay} s</span></div>
        <div class="detail"><span>Fase (Sol-Luna-Tierra):</span> <span>${data.max_row.phase.toFixed(1)}°</span></div>
      `;
    } else {
      extraHtml = `
        <div class="detail" style="margin-top:8px;">
          <span>Subpunto Solar:</span> <span>${data.max_row.sub_lat.toFixed(1)}°N, ${data.max_row.sub_lon.toFixed(1)}°E</span>
        </div>
      `;
    }

    return `
      <div class="card ${colorClass}">
        <h3>${icon} ${name}</h3>
        <div class="value">${formatDuration(data.visible_mins)}</div>
        <div class="detail"><span>Visible de 24h</span></div>
        <div style="margin-top:1rem;">
          <div class="detail"><span>Elevación máx:</span> <span>${data.max_el.toFixed(1)}°</span></div>
          ${extraHtml}
        </div>
      </div>
    `;
  };

  container.innerHTML = makeCard("Ciclo Solar", "☀️", "sun", stats.sun, false) + 
                        makeCard("Enlace Terrestre", "🌍", "earth", stats.earth, true);
}

function drawPlot(rows) {
  const canvas = document.getElementById("plot");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, pad = 40;
  ctx.clearRect(0, 0, W, H);
  const yMin = -90, yMax = 90;
  const xScale = i => pad + (i / (rows.length - 1)) * (W - 2 * pad);
  const yScale = v => H - pad - ((v - yMin) / (yMax - yMin)) * (H - 2 * pad);

  ctx.strokeStyle = "#2d333b"; ctx.lineWidth = 1;
  for (let y = -90; y <= 90; y += 30) {
    ctx.beginPath(); ctx.moveTo(pad, yScale(y)); ctx.lineTo(W - pad, yScale(y)); ctx.stroke();
    ctx.fillStyle = "#8b949e"; ctx.font = "11px monospace"; ctx.textAlign = "right";
    ctx.fillText(y + "°", pad - 8, yScale(y) + 4);
  }
  for (let i = 0; i <= rows.length - 1; i += 240) {
    ctx.beginPath(); ctx.moveTo(xScale(i), pad); ctx.lineTo(xScale(i), H - pad); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillText(rows[i].t.substring(11, 16), xScale(i), H - pad + 16);
  }
  ctx.strokeStyle = "#e6edf3"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pad, yScale(0)); ctx.lineTo(W - pad, yScale(0)); ctx.stroke();

  const drawLine = (key, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    rows.forEach((r, i) => i === 0 ? ctx.moveTo(xScale(i), yScale(r[key])) : ctx.lineTo(xScale(i), yScale(r[key])));
    ctx.stroke();
  };
  drawLine("sun_el", "#ffcc33");
  drawLine("earth_el", "#4da6ff");
}

function searchLocations(targetSunH, targetEarthH, targetMinTemp, targetMaxTemp, startISO, alt) {
  const startMs = new Date(startISO).getTime();
  const et0 = (startMs - J2000_MS) / 1000;
  const n = 24 * 60;
  const sunVecs = [], earthVecs = [];
  for (let i = 0; i < n; i++) {
    const et = et0 + i * 60;
    sunVecs.push(interp(et, "sun"));
    earthVecs.push(interp(et, "earth"));
  }
  const results = [];
  for (let lat = -85; lat <= 85; lat += 5) {
    for (let lon = -180; lon < 180; lon += 5) {
      let sunMins = 0, earthMins = 0, maxTemp = -273, minTemp = 200;
      const { up } = enuFrame(lat, lon);
      const off = siteOffset(lat, lon, alt);
      
      for (let i = 0; i < n; i++) {
        let v = [sunVecs[i][0] - off[0], sunVecs[i][1] - off[1], sunVecs[i][2] - off[2]];
        let len = Math.hypot(v[0], v[1], v[2]);
        let u = (v[0]*up[0] + v[1]*up[1] + v[2]*up[2]) / len;
        let el = Math.asin(Math.max(-1, Math.min(1, u))) * 180 / Math.PI;
        
        if (el > 0) sunMins++;
        
        let t = calculateTemperature(el, len);
        if (t > maxTemp) maxTemp = t;
        if (t < minTemp) minTemp = t;

        v = [earthVecs[i][0] - off[0], earthVecs[i][1] - off[1], earthVecs[i][2] - off[2]];
        len = Math.hypot(v[0], v[1], v[2]);
        u = (v[0]*up[0] + v[1]*up[1] + v[2]*up[2]) / len;
        el = Math.asin(Math.max(-1, Math.min(1, u))) * 180 / Math.PI;
        if (el > 0) earthMins++;
      }
      
      const sunH = sunMins / 60;
      const earthH = earthMins / 60;

      if (sunH >= targetSunH && earthH >= targetEarthH && minTemp >= targetMinTemp && maxTemp <= targetMaxTemp) {
        const distance = Math.hypot(sunH - targetSunH, earthH - targetEarthH);
        results.push({ lat, lon, sunH, earthH, sunMins, earthMins, maxTemp, minTemp, distance, alt });
      }
    }
  }
  return results.sort((a, b) => a.distance - b.distance).slice(0, 8);
}

const form = document.getElementById("form");
const btn = document.getElementById("btn");
const searchForm = document.getElementById("searchForm");
const searchResults = document.getElementById("searchResults");

setCurrentDateTime();

Promise.all([loadData(), loadPresets()]).then(() => {
  btn.disabled = false; btn.textContent = "Calcular";
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}).catch((err) => { console.error(err); alert("Error al cargar datos: " + err.message); });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const lat = parseFloat(document.getElementById("lat").value);
  const lon = parseFloat(document.getElementById("lon").value);
  const alt = parseFloat(document.getElementById("alt").value);
  const dateRaw = document.getElementById("date").value; 
  
  const dateExact = new Date(dateRaw + ":00+02:00").toISOString();
  const dateOnly = dateRaw.split("T")[0];
  const dateMidnight = new Date(dateOnly + "T00:00:00+02:00").toISOString();

  const rows = computeWindows(lat, lon, alt, dateExact);
  const stats = extractEvents(rows);

  const fullDayRows = computeWindows(lat, lon, alt, dateMidnight);
  const fullDayStats = extractEvents(fullDayRows);

  stats.sun.visible_mins = fullDayStats.sun.visible_mins;
  stats.earth.visible_mins = fullDayStats.earth.visible_mins;
  stats.sun.max_temp = fullDayStats.sun.max_temp;
  stats.sun.min_temp = fullDayStats.sun.min_temp;
  
  drawPlot(rows);
  renderSummary(stats, rows, lat, lon);
  renderTemps(stats);
  
  const sample = rows[0];
  initSkyDome(sample.sun_el, sample.sun_az, sample.earth_el, sample.earth_az);
  updateSkyDome(sample.sun_el, sample.sun_az, sample.earth_el, sample.earth_az);
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  searchResults.innerHTML = "<p>Buscando...</p>";
  setTimeout(() => {
    const targetSun = parseFloat(document.getElementById("minSun").value);
    const targetEarth = parseFloat(document.getElementById("minEarth").value);
    const targetMinTemp = parseFloat(document.getElementById("minTemp").value);
    const targetMaxTemp = parseFloat(document.getElementById("maxTemp").value);
    const alt = parseFloat(document.getElementById("alt").value);
    const dateRaw = document.getElementById("date").value; 
    const dateOnly = dateRaw.split("T")[0];
    const dateMidnight = new Date(dateOnly + "T00:00:00+02:00").toISOString();

    const best = searchLocations(targetSun, targetEarth, targetMinTemp, targetMaxTemp, dateMidnight, alt);
    if (best.length === 0) {
      searchResults.innerHTML = "<p>No hay zonas que cumplan esos requisitos. Prueba a ampliar el rango térmico o bajar las horas.</p>";
      return;
    }
    searchResults.innerHTML = best.map(b => `
      <div class="search-item" onclick="document.getElementById('lat').value=${b.lat}; document.getElementById('lon').value=${b.lon}; document.getElementById('alt').value=${b.alt}; document.getElementById('date').value='${dateOnly}T00:00'; document.getElementById('form').dispatchEvent(new Event('submit'));">
        <h4>Lat: ${b.lat.toFixed(1)}°, Lon: ${b.lon.toFixed(1)}°</h4>
        <p>☀️ Sol: <b>${formatDuration(b.sunMins)}</b></p>
        <p>🌍 Tierra: <b>${formatDuration(b.earthMins)}</b></p>
        <p>🌡️ Rango Temp: <b>${b.minTemp}°C / ${b.maxTemp}°C</b></p>
        <p style="color:#4da6ff; margin-top:.5rem; font-size:.75rem;">Click para simular</p>
      </div>
    `).join("");
  }, 50);
});