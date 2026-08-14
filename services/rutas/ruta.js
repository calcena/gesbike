const EARTH_RADIUS = 6371000;
const MASS = 63;
const G = 9.81;
const RHO_AIR = 1.208;
const CdA = 0.42;
const Crr = 0.018;
const DRIVETRAIN_LOSS = 0.05;
const MASSBIKER = 52;

// Parámetros de filtrado de velocidad
const SPEED_WINDOW_SIZE = 5; // Ventana de puntos para promediar velocidad

// Variable global para almacenar los datos de la ruta actual
window.rutaActual = null;
// Variable global para controlar si estamos editando una ruta manual
window.rutaEditandoId = null;

// Variables de paginación
const REGISTROS_POR_PAGINA = 10;
window.paginaActual = 1;
window.totalPaginas = 1;

// Rutas seleccionadas con checkbox (para sumar kms)
window.rutasSeleccionadas = new Set();

// Función helper para obtener la URL base de la API
function getApiBaseUrl() {
  const protocol = window.location.protocol;
  const host = window.location.host;
  const pathname = window.location.pathname;

  // Caso 1: Estamos en una subcarpeta tipo /gesBike/views/rutas/ruta.php
  const viewsIndex = pathname.indexOf('/views/');
  if (viewsIndex !== -1) {
    return `${protocol}//${host}${pathname.substring(0, viewsIndex)}`;
  }

  // Caso 2: Estamos en la raíz tipo /views/rutas/ruta.php
  // La raíz es justo antes de /views/
  if (pathname.startsWith('/views/')) {
    return `${protocol}//${host}`;
  }

  // Caso 3: Fallback - buscar rutas/ en el path
  const rutasIndex = pathname.indexOf('/rutas/');
  if (rutasIndex !== -1) {
    // Subir dos niveles desde /rutas/
    const basePath = pathname.substring(0, rutasIndex);
    return `${protocol}//${host}${basePath}`;
  }

  // Último recurso: usar el path actual hasta el archivo
  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash !== -1) {
    const dirPath = pathname.substring(0, lastSlash);
    // Subir un nivel más (estamos en /rutas/)
    const parentSlash = dirPath.lastIndexOf('/');
    if (parentSlash !== -1) {
      return `${protocol}//${host}${pathname.substring(0, parentSlash)}`;
    }
  }

  return `${protocol}//${host}`;
}

// Función helper para construir URLs de API
function getApiUrl(endpoint) {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/rutas/${endpoint}`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function smoothElevation(eles) {
  const smoothed = [];
  for (let i = 0; i < eles.length; i++) {
    let sum = 0,
      count = 0;
    for (
      let j = Math.max(0, i - 1);
      j <= Math.min(eles.length - 1, i + 1);
      j++
    ) {
      sum += eles[j];
      count++;
    }
    smoothed.push(sum / count);
  }
  return smoothed;
}

function calculateSpeedWithFilter(trkpts) {
  const speeds = new Array(trkpts.length).fill(0);
  
  for (let i = 1; i < trkpts.length; i++) {
    const prev = trkpts[i - 1];
    const curr = trkpts[i];
    
    const dt = (curr.time - prev.time) / 1000;
    if (dt <= 0) continue;
    
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const speed = dist / dt;
    speeds[i] = speed;
  }
  
  const filteredSpeeds = new Array(trkpts.length).fill(0);
  const windowSize = SPEED_WINDOW_SIZE;
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 1; i < trkpts.length; i++) {
    let sum = 0;
    let count = 0;
    
    const start = Math.max(1, i - halfWindow);
    const end = Math.min(trkpts.length - 1, i + halfWindow);
    
    for (let j = start; j <= end; j++) {
      if (speeds[j] > 0) {
        sum += speeds[j];
        count++;
      }
    }
    
    filteredSpeeds[i] = count > 0 ? sum / count : 0;
  }
  
  return filteredSpeeds;
}

function estimatePower(dist, dt, dAlt, speed) {
  if (dt <= 0 || speed <= 0) return 0;
  const v = speed;
  const slope = dAlt / dist || 0;
  const Paero = 0.5 * RHO_AIR * CdA * v ** 3;
  const Pgrav = MASS * G * v * slope;
  const Proll = MASS * G * Crr * v;
  let totalPower = Paero + Pgrav + Proll;
  totalPower /= 1 - DRIVETRAIN_LOSS;

  const slopePerc = slope * 100;
  const speedKmh = v * 3.6;

  if (slopePerc < -8 && speedKmh > 5 && speedKmh < 25) {
    return Math.max(50, totalPower);
  }
  return Math.max(0, totalPower);
}

function estimateCalories(totalTimeMovingSec, massKg = 52, MET = 7.32) {
  const hoursMoving = totalTimeMovingSec / 3600;
  return Math.round(MET * massKg * hoursMoving);
}

// Función para calcular tiempos de subida, bajada y plano
function processGPX(text) {

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Archivo GPX inválido: " + parseError.textContent);
  }

  const GPX_NS = "http://www.topografix.com/GPX/1/1";
  const GARMIN_NS = "http://www.garmin.com/xmlschemas/TrackPointExtension/v1";

  let trkptsNodes = doc.getElementsByTagNameNS(GPX_NS, "trkpt");
  if (trkptsNodes.length === 0) trkptsNodes = doc.querySelectorAll("trkpt");

  const trkpts = Array.from(trkptsNodes)
    .map((pt) => {
      let eleElem = pt.getElementsByTagNameNS(GPX_NS, "ele")[0];
      let timeElem = pt.getElementsByTagNameNS(GPX_NS, "time")[0];
      if (!eleElem) eleElem = pt.querySelector("ele");
      if (!timeElem) timeElem = pt.querySelector("time");

      let hr = null, speed = null, cad = null, power = null, temp = null;
      const extElems = pt.getElementsByTagNameNS(GARMIN_NS, "hr");
      if (extElems.length > 0) hr = parseInt(extElems[0].textContent) || null;
      const spdElems = pt.getElementsByTagNameNS(GARMIN_NS, "speed");
      if (spdElems.length > 0) speed = parseFloat(spdElems[0].textContent) || null;
      const cadElems = pt.getElementsByTagNameNS(GARMIN_NS, "cad");
      if (cadElems.length > 0) cad = parseInt(cadElems[0].textContent) || null;
      const pwrElems = pt.getElementsByTagNameNS(GARMIN_NS, "power");
      if (pwrElems.length > 0) power = parseFloat(pwrElems[0].textContent) || null;
      const tempElems = pt.getElementsByTagNameNS(GARMIN_NS, "atemp");
      if (tempElems.length > 0) temp = parseFloat(tempElems[0].textContent) || null;
      if (power == null) {
        const pwrPlain = pt.querySelector("power");
        if (pwrPlain) power = parseFloat(pwrPlain.textContent) || null;
      }
      if (temp == null) {
        const tempPlain = pt.querySelector("atemp");
        if (tempPlain) temp = parseFloat(tempPlain.textContent) || null;
      }

      return {
        lat: parseFloat(pt.getAttribute("lat")),
        lon: parseFloat(pt.getAttribute("lon")),
        ele: eleElem ? parseFloat(eleElem.textContent) : 0,
        time: timeElem ? new Date(timeElem.textContent) : new Date(),
        hr, speed, cad, power, temp,
      };
    })
    .filter(
      (pt) =>
        !isNaN(pt.lat) &&
        !isNaN(pt.lon) &&
        pt.time instanceof Date &&
        !isNaN(pt.time)
    )
    .sort((a, b) => a.time - b.time);


  if (trkpts.length < 2)
    throw new Error("Menos de 2 puntos válidos en el archivo GPX.");

  const rawEles = trkpts.map((p) => p.ele);
  const smoothedEles = smoothElevation(rawEles);
  trkpts.forEach((pt, i) => (pt.ele = smoothedEles[i]));

  let totalDist = 0;
  let totalTimeMoving = 0;
  let ascent = 0;
  let descent = 0;
  let maxSpeed = 0;
  let maxAlt = trkpts[0].ele;
  let totalPowerSec = 0;

  // Clasificación de terreno por segmentos (mismo algoritmo que el parser FIT):
  // segmentos de distancia >= SEG_MIN_DIST y umbral de pendiente ±SEG_GRADE_THRESHOLD
  const SEG_MIN_DIST = 30;
  const SEG_GRADE_THRESHOLD = 2;

  let distSubida = 0;
  let distBajada = 0;
  let distPlano = 0;
  let tiempoSubida = 0;
  let tiempoBajada = 0;
  let tiempoPlano = 0;
  let segDist = 0;
  let segAlt = 0;
  let segTime = 0;

  for (let i = 1; i < trkpts.length; i++) {
    const prev = trkpts[i - 1];
    const curr = trkpts[i];

    const dt = (curr.time - prev.time) / 1000;
    if (dt <= 0) continue;

    let dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const dAlt = curr.ele - prev.ele;
    if (dist > 0 && dAlt !== 0) dist = Math.sqrt(dist * dist + dAlt * dAlt);
    const speed = dist / dt;

    totalDist += dist;

    if (dAlt > 0) ascent += dAlt;
    else descent -= dAlt;

    if (curr.ele > maxAlt) maxAlt = curr.ele;

    if (dist > 0) {
      segDist += dist;
      segAlt += dAlt;
      segTime += dt;
      if (segDist >= SEG_MIN_DIST) {
        const grade = (segAlt / segDist) * 100;
        if (grade > SEG_GRADE_THRESHOLD) {
          distSubida += segDist;
          tiempoSubida += segTime;
        } else if (grade < -SEG_GRADE_THRESHOLD) {
          distBajada += segDist;
          tiempoBajada += segTime;
        } else {
          distPlano += segDist;
          tiempoPlano += segTime;
        }
        segDist = 0;
        segAlt = 0;
        segTime = 0;
      }
    }

    const isMoving = speed > 0.2778;
    if (isMoving) totalTimeMoving += dt;

    const speedKmh = speed * 3.6;
    if (speedKmh > maxSpeed) maxSpeed = speedKmh;

    const power = isMoving ? estimatePower(dist, dt, dAlt, speed) : 0;
    totalPowerSec += power * dt;
  }

  // Segmento final pendiente de clasificar
  if (segDist > 0) {
    const grade = (segAlt / segDist) * 100;
    if (grade > SEG_GRADE_THRESHOLD) {
      distSubida += segDist;
      tiempoSubida += segTime;
    } else if (grade < -SEG_GRADE_THRESHOLD) {
      distBajada += segDist;
      tiempoBajada += segTime;
    } else {
      distPlano += segDist;
      tiempoPlano += segTime;
    }
  }

  const filteredSpeeds = calculateSpeedWithFilter(trkpts);
  let maxSpeedFiltered = 0;
  for (let i = 1; i < filteredSpeeds.length; i++) {
    const speedKmh = filteredSpeeds[i] * 3.6;
    if (speedKmh > maxSpeedFiltered) {
      maxSpeedFiltered = speedKmh;
    }
  }

  // Calcular tiempos por tipo de terreno (acumulados en el bucle principal)

  const totalTimeElapsed =
    (trkpts[trkpts.length - 1].time - trkpts[0].time) / 1000;
  const avgSpeedMoving =
    totalTimeMoving > 0 ? (totalDist / totalTimeMoving) * 3.6 : 0;
  const avgPower = totalTimeMoving > 0 ? totalPowerSec / totalTimeMoving : 0;

  const calories = estimateCalories(totalTimeMoving, MASSBIKER, 7.32);

  // Los % se calculan sobre TIEMPO para que sean coherentes con los
  // tiempo_subida/tiempo_bajada/tiempo_plano mostrados (por distancia, la
  // bajada saldría sobrevalorada porque se rueda más rápido).
  const totalTimeRuta = tiempoSubida + tiempoBajada + tiempoPlano;
  const subidaPerc =
    totalTimeRuta > 0 ? Math.round((tiempoSubida / totalTimeRuta) * 100) : 0;
  const bajadaPerc =
    totalTimeRuta > 0 ? Math.round((tiempoBajada / totalTimeRuta) * 100) : 0;
  const planoPerc = Math.max(0, 100 - subidaPerc - bajadaPerc);

  const hrValues = trkpts.filter(p => p.hr != null && p.hr > 0).map(p => p.hr);
  const frecuencia_cardiaca_promedio = hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null;
  const frecuencia_cardiaca_maxima = hrValues.length > 0 ? Math.max(...hrValues) : null;

  return {
    fecha_inicio: trkpts[0].time.toISOString(),
    fecha_fin: trkpts[trkpts.length - 1].time.toISOString(),
    tiempo_total: formatTime(totalTimeElapsed),
    tiempo_movimiento: formatTime(totalTimeMoving),
    distanciaMetros: Math.round(totalDist),
    kms: (totalDist / 1000).toFixed(3),
    metros_ascenso: Math.round(ascent),
    metros_descenso: Math.round(descent),
    altitud_maxima: Math.round(maxAlt),
    pct_subida: parseInt(subidaPerc),
    pct_plano: parseInt(planoPerc),
    pct_bajada: parseInt(bajadaPerc),
    tiempo_subida: formatTime(tiempoSubida),
    tiempo_bajada: formatTime(tiempoBajada),
    tiempo_plano: formatTime(tiempoPlano),
    velocidad_media: Number(avgSpeedMoving.toFixed(1)),
    velocidad_maxima: Number(maxSpeedFiltered.toFixed(1)),
    frecuencia_cardiaca_promedio: frecuencia_cardiaca_promedio,
    frecuencia_cardiaca_maxima: frecuencia_cardiaca_maxima,
    potencia_promedio_w: Math.round(avgPower),
    calorias: Math.round(calories),
    track_points: trkpts.map(p => ({
      lat: parseFloat(p.lat.toFixed(6)),
      lon: parseFloat(p.lon.toFixed(6)),
      ele: Math.round(p.ele),
      time: p.time.toISOString(),
      ...(p.hr != null && p.hr > 0 ? { hr: p.hr } : {}),
      ...(p.speed != null ? { speed: parseFloat((p.speed * 3.6).toFixed(1)) } : {}),
      ...(p.cad != null ? { cad: p.cad } : {}),
      ...(p.power != null && p.power > 0 ? { power: p.power } : {}),
      ...(p.temp != null ? { temp: p.temp } : {}),
    })),
  };
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

async function initRutas() {
  await getVehiculosByUser(2);
  document.getElementById("fecha_ruta").value = await loadDefaultDate();
  await selectVehiculo(2);
  await getRutasByVehiculo();
  setupMultipleGPXUpload();
  setupMultipleFITUpload();

  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === '4') {
    const tab4 = document.getElementById('tab4-tab');
    if (tab4) {
      setTimeout(() => {
        const bsTab = new bootstrap.Tab(tab4);
        bsTab.show();
        if (typeof getResumenBiker === 'function') getResumenBiker();
      }, 300);
    }
  }
  if (params.get('showLast') === '1') {
    setTimeout(() => {
      if (window.rutasOriginales && window.rutasOriginales.length > 0) {
        const last = window.rutasOriginales[0];
        if (last && last.id) showGpxDetails(last.id);
      }
    }, 500);
  }
}

window.selectVehiculoPicker = async (id, nombre) => {
  sessionStorage.setItem("vehiculo_id", id);
  const btn = document.getElementById("vehiculo-select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
  await getMotorVehiculo(2);
  const searchInput = document.getElementById("searchRutas");
  if (searchInput) searchInput.value = "";
  window.paginaActual = 1;
  window.rutasSeleccionadas.clear();
  getRutasByVehiculo();
  const activePane = document.querySelector('.tab-pane.show.active');
  if (activePane) {
    const id = activePane.id;
    if (id === 'tab5') cargarGraficaVelocidades();
    else if (id === 'tab6' || id === 'tab7') cargarGraficasAnalisis();
  }
};

// ========== FUNCIONALIDAD PARA MÚLTIPLES ARCHIVOS ==========
function setupMultipleGPXUpload() {
  const multipleInput = document.getElementById("gpxMultipleFile");

  if (!multipleInput) {
    console.error("❌ Elemento #gpxMultipleFile no encontrado");
    return;
  }

  multipleInput.addEventListener("change", handleMultipleGPXFiles);
}

async function handleMultipleGPXFiles(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) {
    loadingIndicator.style.display = "block";
    loadingIndicator.innerHTML = `Procesando 0/${files.length} archivos...`;
  }

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      if (loadingIndicator) {
        loadingIndicator.innerHTML = `Procesando ${processedCount + 1}/${
          files.length
        }: ${file.name}`;
      }
      const text = await file.text();
      const result = processGPX(text);

      await sendToAPISilent(result);
      successCount++;
    } catch (err) {
      console.error(`💥 Error al procesar ${file.name}:`, err);
      errorCount++;

      await Swal.fire({
        title: `Error en ${file.name}`,
        text: err.message,
        icon: "error",
        timer: 3000,
        showConfirmButton: false,
      });
    } finally {
      processedCount++;
    }
  }

  if (loadingIndicator) {
    loadingIndicator.style.display = "none";
  }

  if (successCount > 0 || errorCount > 0) {
    await showBatchResult(files.length, successCount, errorCount);
  }

  if (successCount > 0) await crearBackup();

  await getRutasByVehiculo();
  e.target.value = "";
}

async function sendToAPISilent(result) {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");

  if (!vehiculoId) {
    throw new Error("No hay vehículo seleccionado");
  }

  const data = {
    vehiculo_id: vehiculoId,
    kms: result.kms,
    tiempo_movimiento: result.tiempo_movimiento,
    tiempo_total: result.tiempo_total,
    velocidad_media: result.velocidad_media,
    velocidad_maxima: result.velocidad_maxima,
    metros_ascenso: result.metros_ascenso,
    metros_descenso: result.metros_descenso,
    altitud_maxima: result.altitud_maxima,
    potencia_promedio_w: result.potencia_promedio_w,
    calorias: result.calorias,
    pct_subida: result.pct_subida,
    pct_plano: result.pct_plano,
    pct_bajada: result.pct_bajada,
    fecha_inicio: result.fecha_inicio,
    fecha_fin: result.fecha_fin,
    tiempo_subida: result.tiempo_subida,
    tiempo_plano: result.tiempo_plano,
    tiempo_bajada: result.tiempo_bajada,
    frecuencia_cardiaca_promedio: result.frecuencia_cardiaca_promedio,
    frecuencia_cardiaca_maxima: result.frecuencia_cardiaca_maxima,
    gpx_data: JSON.stringify(result.track_points),
  };

  const response = await axios.post(
    getApiUrl('ruta.php?guardarRutaGPX'),
    { data },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.data.success) {
    throw new Error(response.data.message || "Error del servidor");
  }

  return response.data;
}

async function showBatchResult(totalFiles, successCount, errorCount) {
  let html = `
    <div class="text-start">
      <p><strong>Total archivos procesados:</strong> ${totalFiles}</p>
      <p class="text-success"><strong>✅ Correctos:</strong> ${successCount}</p>
  `;

  if (errorCount > 0) {
    html += `<p class="text-danger"><strong>❌ Errores:</strong> ${errorCount}</p>`;
  }

  html += `</div>`;

  await Swal.fire({
    title: "Procesamiento completado",
    html: html,
    icon: errorCount === 0 ? "success" : "warning",
    confirmButtonText: "Aceptar",
  });
}

function samplePointsByDistance(trackPoints, intervalKm = 1) {
  if (!trackPoints || trackPoints.length < 2) return [];
  const intervalM = intervalKm * 1000;
  const distances = computeCumulativeDistances(trackPoints);
  const totalM = distances[distances.length - 1];
  if (totalM <= 0) return [];

  const samples = [];
  for (let d = 0; d <= totalM; d += intervalM) {
    let idx = 0;
    for (let i = 1; i < distances.length; i++) {
      if (distances[i] >= d) { idx = i; break; }
    }
    const p = trackPoints[idx];
    const time = p.time || null;
    samples.push({
      lat: p.lat,
      lon: p.lon,
      ele: p.ele,
      time: time,
      kilometro: parseFloat((d / 1000).toFixed(3))
    });
  }
  return samples;
}

function getNearestHour(timestamp, targetTime) {
  if (!targetTime) return 0;
  const target = new Date(targetTime).getTime();
  const hours = [];
  for (let i = 0; i < 24; i++) {
    const h = new Date(timestamp);
    h.setHours(i, 0, 0, 0);
    hours.push(h.getTime());
  }
  let nearest = 0;
  let minDiff = Infinity;
  for (let i = 0; i < hours.length; i++) {
    const diff = Math.abs(target - hours[i]);
    if (diff < minDiff) { minDiff = diff; nearest = i; }
  }
  return nearest;
}

async function fetchWeatherForRoute(result, rutaId) {
  if (!result.track_points || result.track_points.length < 2) return;
  if (!result.fecha_inicio || !result.fecha_fin) return;

  const samples = samplePointsByDistance(result.track_points, 1);
  if (samples.length === 0) return;

  const fechaInicio = new Date(result.fecha_inicio);
  const fechaFin = new Date(result.fecha_fin);
  const totalMs = fechaFin.getTime() - fechaInicio.getTime();
  const totalKm = parseFloat(result.kms) || 1;

  Swal.fire({
    title: 'Obteniendo datos climáticos...',
    html: '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted" id="clima-progress">Procesando 0/' + samples.length + ' puntos</p></div>',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  const cacheMap = new Map();
  const weatherData = [];

  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 1200;
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    const batch = samples.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (pt) => {
      const frac = totalMs > 0 ? (pt.kilometro / totalKm) : 0;
      const ptTime = pt.time ? new Date(pt.time) : new Date(fechaInicio.getTime() + frac * totalMs);
      const dateStr = ptTime.toISOString().slice(0, 10);
      const hour = ptTime.getHours();
      const latKey = pt.lat.toFixed(2);
      const lonKey = pt.lon.toFixed(2);
      const cacheKey = `${latKey}_${lonKey}_${dateStr}`;

      if (cacheMap.has(cacheKey)) {
        const cached = cacheMap.get(cacheKey);
        const temp = cached.temps[hour] ?? null;
        const rain = cached.precip[hour] > 0 ? 1 : 0;
        return { kilometro: pt.kilometro, lat: pt.lat, lon: pt.lon, temperatura: temp, lluvia: rain, hora: ptTime.toISOString() };
      }

      for (let retry = 0; retry < 3; retry++) {
        try {
          if (retry > 0) await new Promise(r => setTimeout(r, 2000 * retry));
          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${pt.lat}&longitude=${pt.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,precipitation&timezone=auto`;
          const resp = await fetch(url);
          if (resp.status === 429) continue;
          if (!resp.ok) return null;
          const json = await resp.json();
          const hourly = json.hourly || {};
          const temps = hourly.temperature_2m || [];
          const precip = hourly.precipitation || [];

          cacheMap.set(cacheKey, { temps, precip });

          const temp = temps[hour] ?? null;
          const rain = precip[hour] > 0 ? 1 : 0;
          return { kilometro: pt.kilometro, lat: pt.lat, lon: pt.lon, temperatura: temp, lluvia: rain, hora: ptTime.toISOString() };
        } catch (e) {
          if (retry === 2) {
            console.warn('Weather fetch error for point', pt.kilometro, 'km:', e);
            return null;
          }
        }
      }
      return null;
    }));

    for (const r of batchResults) {
      if (r) weatherData.push(r);
    }

    const progressEl = document.getElementById('clima-progress');
    if (progressEl) progressEl.textContent = `Procesando ${Math.min(i + BATCH_SIZE, samples.length)}/${samples.length} puntos`;
    if (i + BATCH_SIZE < samples.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  Swal.close();

  if (weatherData.length === 0) {
    Swal.fire({ text: 'No se pudieron obtener datos climáticos', icon: 'warning', timer: 3000, showConfirmButton: false });
    return;
  }

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?guardarTemperaturas'),
      { data: { ruta_id: rutaId, temperaturas: weatherData } },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.success) {
      Swal.fire({ text: `✅ Datos climáticos guardados (${weatherData.length} puntos)`, icon: "success", timer: 2500, showConfirmButton: false });
    }
  } catch (err) {
    console.error('Error saving weather data:', err);
    Swal.fire({ text: 'Error al guardar datos climáticos', icon: 'error', timer: 3000, showConfirmButton: false });
  }
}

async function fetchWeatherForRouteSilent(result, rutaId) {
  if (!result.track_points || result.track_points.length < 2) return [];
  if (!result.fecha_inicio || !result.fecha_fin) return [];

  const samples = samplePointsByDistance(result.track_points, 1);
  if (samples.length === 0) return [];

  const fechaInicio = new Date(result.fecha_inicio);
  const fechaFin = new Date(result.fecha_fin);
  const totalMs = fechaFin.getTime() - fechaInicio.getTime();
  const totalKm = parseFloat(result.kms) || 1;

  const cacheMap = new Map();
  const weatherData = [];

  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 1200;
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    const batch = samples.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (pt) => {
      const frac = totalMs > 0 ? (pt.kilometro / totalKm) : 0;
      const ptTime = pt.time ? new Date(pt.time) : new Date(fechaInicio.getTime() + frac * totalMs);
      const dateStr = ptTime.toISOString().slice(0, 10);
      const hour = ptTime.getHours();
      const latKey = pt.lat.toFixed(2);
      const lonKey = pt.lon.toFixed(2);
      const cacheKey = `${latKey}_${lonKey}_${dateStr}`;

      if (cacheMap.has(cacheKey)) {
        const cached = cacheMap.get(cacheKey);
        const temp = cached.temps[hour] ?? null;
        const rain = cached.precip[hour] > 0 ? 1 : 0;
        return { kilometro: pt.kilometro, lat: pt.lat, lon: pt.lon, temperatura: temp, lluvia: rain, hora: ptTime.toISOString() };
      }

      for (let retry = 0; retry < 3; retry++) {
        try {
          if (retry > 0) await new Promise(r => setTimeout(r, 2000 * retry));
          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${pt.lat}&longitude=${pt.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,precipitation&timezone=auto`;
          const resp = await fetch(url);
          if (resp.status === 429) continue;
          if (!resp.ok) return null;
          const json = await resp.json();
          const hourly = json.hourly || {};
          const temps = hourly.temperature_2m || [];
          const precip = hourly.precipitation || [];

          cacheMap.set(cacheKey, { temps, precip });

          const temp = temps[hour] ?? null;
          const rain = precip[hour] > 0 ? 1 : 0;
          return { kilometro: pt.kilometro, lat: pt.lat, lon: pt.lon, temperatura: temp, lluvia: rain, hora: ptTime.toISOString() };
        } catch (e) {
          if (retry === 2) return null;
        }
      }
      return null;
    }));

    for (const r of batchResults) {
      if (r) weatherData.push(r);
    }
    if (i + BATCH_SIZE < samples.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  if (weatherData.length === 0) return [];

  try {
    await axios.post(
      getApiUrl('ruta.php?guardarTemperaturas'),
      { data: { ruta_id: rutaId, temperaturas: weatherData } },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error('Error saving weather data (silent):', err);
  }

  return weatherData;
}

async function loadTemperatureData(rutaId) {
  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getTemperaturas'),
      { data: { ruta_id: rutaId } },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.success && response.data.content) {
      return response.data.content;
    }
    return [];
  } catch (e) {
    console.warn('Error loading temperature data:', e);
    return [];
  }
}

function initTemperatureChart(trackPoints, tempData) {
  const canvas = document.getElementById('tempChart');
  if (!canvas || !tempData || tempData.length === 0) return;

  const fullDistances = computeCumulativeDistances(trackPoints);
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;
  const xMax = Math.ceil(totalKm);

  const chartData = tempData.map(d => ({
    x: parseFloat(d.kilometro),
    y: d.temperatura !== null && d.temperatura !== undefined ? parseFloat(d.temperatura) : null
  })).filter(d => d.y !== null);

  const lluviaData = tempData
    .filter(d => d.lluvia == 1 && d.temperatura !== null && d.temperatura !== undefined)
    .map(d => ({
      x: parseFloat(d.kilometro),
      y: parseFloat(d.temperatura)
    }));

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(255, 107, 53, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 107, 53, 0.02)');

  const temps = chartData.filter(d => d.y !== null);
  let maxPoint = null;
  let minPoint = null;
  let maxVal = null;
  let minVal = null;
  if (temps.length > 0) {
    maxVal = Math.max(...temps.map(d => d.y));
    minVal = Math.min(...temps.map(d => d.y));
    maxPoint = temps.find(d => d.y === maxVal);
    minPoint = temps.find(d => d.y === minVal);
  }

    function drawTempLabel(c, text, x, y, color, align) {
    c.save();
    c.font = 'bold 11px Arial';
    c.textAlign = align || 'left';
    const m = c.measureText(text);
    const pad = 4;
    const bw = m.width + pad * 2;
    const bh = 14;
    let bx;
    if (align === 'right') bx = x - bw;
    else if (align === 'center') bx = x - bw / 2;
    else bx = x;
    c.fillStyle = '#fff';
    c.fillRect(bx, y - bh + 3, bw, bh);
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }

  const verticalRainPlugin = {
    id: 'verticalRainLines',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const yBottom = yScale.getPixelForValue(yScale.min);

      lluviaData.forEach(pt => {
        const xPx = xScale.getPixelForValue(pt.x);
        const yPx = yScale.getPixelForValue(pt.y);

        c.save();
        c.beginPath();
        c.setLineDash([4, 4]);
        c.strokeStyle = 'rgba(33, 150, 243, 0.7)';
        c.lineWidth = 1.5;
        c.moveTo(xPx, yBottom);
        c.lineTo(xPx, yPx);
        c.stroke();
        c.restore();
      });

      if (maxPoint) {
        const xPx = xScale.getPixelForValue(maxPoint.x);
        const yPx = yScale.getPixelForValue(maxPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor('#DC143C');
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();

        const align = xPx + 55 > chart.width ? 'right' : 'left';
        const xOff = xPx + (xPx + 55 > chart.width ? -8 : 8);
        drawTempLabel(c, `${maxVal.toFixed(1)}°C`, xOff, yPx + 4, '#DC143C', align);
      }

      if (minPoint) {
        const xPx = xScale.getPixelForValue(minPoint.x);
        const yPx = yScale.getPixelForValue(minPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor('#5B9BD5');
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();

        const align = xPx + 55 > chart.width ? 'right' : 'left';
        const xOff = xPx + (xPx + 55 > chart.width ? -8 : 8);
        drawTempLabel(c, `${minVal.toFixed(1)}°C`, xOff, yPx + 10, '#5B9BD5', align);
      }
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          type: 'line',
          label: 'Temperatura (°C)',
          data: chartData,
          borderColor: '#FF6B35',
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          spanGaps: false,
          yAxisID: 'y',
          order: 0
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pt = tempData.find(d => Math.abs(parseFloat(d.kilometro) - ctx.parsed.x) < 0.01);
              let label = `${ctx.parsed.y}°C @ ${ctx.parsed.x} km`;
              if (pt && pt.lluvia == 1) label += ' 💧';
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: xMax,
          title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
          ticks: { stepSize: tickStep, font: { size: 10 }, callback: (v) => Math.abs(v % tickStep) < 0.01 ? v : '' },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Temperatura (°C)', font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
    },
    plugins: [verticalRainPlugin]
  });
}

function initPulsacionesChart(trackPoints, pulsacionesData) {
  const canvas = document.getElementById('pulsacionesChart');
  if (!canvas || !pulsacionesData || pulsacionesData.length === 0) return;

  const fullDistances = computeCumulativeDistances(trackPoints);
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;
  const xMax = Math.ceil(totalKm);

  const chartData = pulsacionesData
    .filter(d => d.pulsaciones !== null && d.pulsaciones !== undefined)
    .map(d => ({
      x: parseFloat(d.kilometro),
      y: parseInt(d.pulsaciones)
    }));

  if (chartData.length === 0) return;

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(220, 20, 60, 0.25)');
  gradient.addColorStop(1, 'rgba(220, 20, 60, 0.02)');

  const maxVal = Math.max(...chartData.map(d => d.y));
  const minVal = Math.min(...chartData.map(d => d.y));
  const avgVal = chartData.reduce((s, d) => s + d.y, 0) / chartData.length;
  const maxPoint = chartData.find(d => d.y === maxVal);
  const minPoint = chartData.find(d => d.y === minVal);

  const hrPlugin = {
    id: 'hrMarkers',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const chartW = chart.width;

      if (maxPoint) {
        const xPx = xScale.getPixelForValue(maxPoint.x);
        const yPx = yScale.getPixelForValue(maxPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor('#DC143C');
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();

        c.save();
        c.font = 'bold 11px Arial';
        c.fillStyle = '#DC143C';
        c.textAlign = xPx + 60 > chartW ? 'right' : 'left';
        c.fillText(`${maxVal} bpm`, xPx + (xPx + 60 > chartW ? -8 : 8), yPx + 4);
        c.restore();
      }

      if (minPoint) {
        const xPx = xScale.getPixelForValue(minPoint.x);
        const yPx = yScale.getPixelForValue(minPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor('#5B9BD5');
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();

        c.save();
        c.font = 'bold 11px Arial';
        c.fillStyle = '#5B9BD5';
        c.textAlign = xPx + 60 > chartW ? 'right' : 'left';
        c.fillText(`${minVal} bpm`, xPx + (xPx + 60 > chartW ? -8 : 8), yPx + 4);
        c.restore();
      }

      const avgPx = yScale.getPixelForValue(avgVal);
      c.save();
      c.setLineDash([6, 4]);
      c.strokeStyle = 'rgba(255, 107, 107, 0.8)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, avgPx);
      c.lineTo(chartW, avgPx);
      c.stroke();
      c.setLineDash([]);
      c.restore();

      const chartArea = chart.chartArea;
      if (chartArea) {
        const labelY = chart.height - 8;
        const rightX = chartArea.right - 4;
        const pad = 4;
        const avgLabel = `∅ ${Math.round(avgVal)} bpm`;
        c.save();
        c.font = 'bold 11px Arial';
        const avgW = c.measureText(avgLabel).width;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
        c.fillStyle = '#FF6B6B';
        c.textAlign = 'right';
        c.fillText(avgLabel, rightX, labelY + 4);
        c.restore();
      }
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Pulsaciones (bpm)',
        data: chartData,
        borderColor: '#DC143C',
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: false,
        yAxisID: 'y'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} bpm @ ${ctx.parsed.x.toFixed(2)} km`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: xMax,
          title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
          ticks: { stepSize: tickStep, font: { size: 10 }, callback: (v) => Math.abs(v % tickStep) < 0.01 ? v : '' },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Pulsaciones (bpm)', font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
    },
    plugins: [hrPlugin]
  });
}

function getTrackSpeeds(trackPoints, fechaInicio, fechaFin) {
  const hasGarminSpeed = trackPoints.some(p => p.speed != null && p.speed > 0);
  if (hasGarminSpeed) {
    return trackPoints.map((p, i) => ({ index: i, speed: p.speed })).filter(d => d.speed != null);
  }
  const hasTime = trackPoints.some(p => p.time != null);
  if (!hasTime && fechaInicio && fechaFin && trackPoints.length >= 2) {
    const start = new Date(fechaInicio).getTime();
    const end = new Date(fechaFin).getTime();
    const duration = end - start;
    if (duration > 0) {
      trackPoints = trackPoints.map((p, i) => ({
        ...p,
        time: new Date(start + (duration * i / (trackPoints.length - 1))).toISOString()
      }));
    }
  }
  const speeds = [];
  for (let i = 1; i < trackPoints.length; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];
    const dt = (curr.time ? new Date(curr.time) - (prev.time ? new Date(prev.time) : 0) : 0) / 1000;
    if (dt <= 0) continue;
    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const speedMs = dist / dt;
    const speedKmh = speedMs * 3.6;
    if (speedKmh > 0.5) {
      speeds.push({ index: i, speed: speedKmh });
    }
  }
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);
  const smoothed = [];
  for (let i = 0; i < speeds.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(speeds.length - 1, i + halfWindow); j++) {
      sum += speeds[j].speed;
      count++;
    }
    smoothed.push({ index: speeds[i].index, speed: sum / count });
  }
  return smoothed;
}

function initVelocidadChart(trackPoints, fechaInicio, fechaFin) {
  const canvas = document.getElementById('velocidadChart');
  if (!canvas || !trackPoints || trackPoints.length === 0) return;
  const speedPoints = getTrackSpeeds(trackPoints, fechaInicio, fechaFin);
  if (speedPoints.length === 0) return;

  const fullDistances = computeCumulativeDistances(trackPoints);
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;

  const chartData = speedPoints.map(d => ({
    x: fullDistances[d.index] / 1000,
    y: d.speed
  })).filter(d => !isNaN(d.y));

  if (chartData.length === 0) return;
  const maxVal = Math.max(...chartData.map(d => d.y));
  const maxPoint = chartData.find(d => d.y === maxVal);
  const avgVal = chartData.reduce((s, d) => s + d.y, 0) / chartData.length;

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(76, 175, 80, 0.25)');
  gradient.addColorStop(1, 'rgba(76, 175, 80, 0.02)');

  const spdPlugin = {
    id: 'speedMarkers',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const chartW = chart.width;
      const chartH = chart.height;

      if (maxPoint) {
        const xPx = xScale.getPixelForValue(maxPoint.x);
        const yPx = yScale.getPixelForValue(maxPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor('#4CAF50');
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
      }

      const avgPx = yScale.getPixelForValue(avgVal);
      c.save();
      c.setLineDash([6, 4]);
      c.strokeStyle = 'rgba(255, 107, 107, 0.8)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, avgPx);
      c.lineTo(chartW, avgPx);
      c.stroke();
      c.setLineDash([]);
      c.restore();

      const chartArea = chart.chartArea;
      if (chartArea) {
        const labelY = chart.height - 8;
        const leftX = chartArea.left + 4;
        const rightX = chartArea.right - 4;
        c.save();
        const maxLabel = `↗ ${maxVal.toFixed(1)} km/h`;
        c.font = 'bold 11px Arial';
        const maxW = c.measureText(maxLabel).width;
        const pad = 4;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(leftX - pad, labelY - 10 + pad, maxW + pad * 2, 14);
        c.fillStyle = '#4CAF50';
        c.textAlign = 'left';
        c.fillText(maxLabel, leftX, labelY + 4);
        c.restore();

        c.save();
        const avgLabel = `∅ ${avgVal.toFixed(1)} km/h`;
        c.font = 'bold 11px Arial';
        const avgW = c.measureText(avgLabel).width;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
        c.fillStyle = '#FF6B6B';
        c.textAlign = 'right';
        c.fillText(avgLabel, rightX, labelY + 4);
        c.restore();
      }
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Velocidad (km/h)',
        data: chartData,
        borderColor: '#4CAF50',
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: false,
        yAxisID: 'y'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(1)} km/h @ ${ctx.parsed.x.toFixed(2)} km`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: Math.ceil(totalKm),
          title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
          ticks: { stepSize: tickStep, font: { size: 10 }, callback: (v) => Math.abs(v % tickStep) < 0.01 ? v : '' },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Velocidad (km/h)', font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
    },
    plugins: [spdPlugin]
  });
}

function getTrackPower(trackPoints, fechaInicio, fechaFin) {
  const hasTime = trackPoints.some(p => p.time != null);
  if (!hasTime && fechaInicio && fechaFin && trackPoints.length >= 2) {
    const start = new Date(fechaInicio).getTime();
    const end = new Date(fechaFin).getTime();
    const duration = end - start;
    if (duration > 0) {
      trackPoints = trackPoints.map((p, i) => ({
        ...p,
        time: new Date(start + (duration * i / (trackPoints.length - 1))).toISOString()
      }));
    }
  }
  const hasPowerData = trackPoints.some(p => p.power != null && p.power > 0);
  if (hasPowerData) {
    const raw = [];
    for (let i = 0; i < trackPoints.length; i++) {
      if (trackPoints[i].power != null && trackPoints[i].power > 0) {
        raw.push({ index: i, power: trackPoints[i].power });
      }
    }
    if (raw.length === 0) return [];
    const windowSize = 9;
    const halfWindow = Math.floor(windowSize / 2);
    const smoothed = [];
    for (let i = 0; i < raw.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(raw.length - 1, i + halfWindow); j++) {
        sum += raw[j].power;
        count++;
      }
      smoothed.push({ index: raw[i].index, power: Math.round(sum / count) });
    }
    return smoothed;
  }

  const segmentDist = 50;
  const fullDists = computeCumulativeDistances(trackPoints);
  const segments = [];
  let segStart = 1;
  for (let i = 1; i < trackPoints.length; i++) {
    const segEnd = fullDists[i] - fullDists[segStart];
    if (segEnd >= segmentDist || i === trackPoints.length - 1) {
      let segDist = 0;
      let segTime = 0;
      for (let j = segStart; j <= i; j++) {
        if (j > segStart) {
          const d = fullDists[j] - fullDists[j - 1];
          segDist += d;
          segTime += (new Date(trackPoints[j]?.time || 0) - new Date(trackPoints[j - 1]?.time || 0)) / 1000;
        }
      }
      const dAlt = (trackPoints[i]?.ele || 0) - (trackPoints[segStart]?.ele || 0);
      const avgSpeed = segDist / segTime;
      const midIdx = Math.floor((segStart + i) / 2);
      if (segDist > 0 && segTime > 0 && avgSpeed > 0) {
        const power = estimatePower(segDist, segTime, dAlt, avgSpeed);
        if (power > 0) {
          segments.push({ index: midIdx, power: Math.round(power) });
        }
      }
      segStart = i;
    }
  }

  if (segments.length === 0) return [];
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);
  const smoothed = [];
  for (let i = 0; i < segments.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(segments.length - 1, i + halfWindow); j++) {
      sum += segments[j].power;
      count++;
    }
    smoothed.push({ index: segments[i].index, power: Math.round(sum / count) });
  }
  return smoothed;
}

function initPotenciaChart(trackPoints, fechaInicio, fechaFin) {
  const canvas = document.getElementById('potenciaChart');
  if (!canvas || !trackPoints || trackPoints.length === 0) return;
  const powerPoints = getTrackPower(trackPoints, fechaInicio, fechaFin);
  if (powerPoints.length === 0) return;

  const fullDistances = computeCumulativeDistances(trackPoints);
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;

  const chartData = powerPoints.map(d => ({
    x: fullDistances[d.index] / 1000,
    y: d.power
  }));

  const maxVal = Math.max(...chartData.map(d => d.y));
  const maxPoint = chartData.find(d => d.y === maxVal);
  const avgVal = chartData.reduce((s, d) => s + d.y, 0) / chartData.length;

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(0, 188, 212, 0.25)');
  gradient.addColorStop(1, 'rgba(0, 188, 212, 0.02)');

  const pwrPlugin = {
    id: 'powerMarkers',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const chartW = chart.width;

      if (maxPoint) {
        const xPx = xScale.getPixelForValue(maxPoint.x);
        const yPx = yScale.getPixelForValue(maxPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor('#00BCD4');
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
      }

      const avgPx = yScale.getPixelForValue(avgVal);
      c.save();
      c.setLineDash([6, 4]);
      c.strokeStyle = 'rgba(255, 107, 107, 0.8)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, avgPx);
      c.lineTo(chartW, avgPx);
      c.stroke();
      c.setLineDash([]);
      c.restore();

      const chartArea = chart.chartArea;
      if (chartArea) {
        const labelY = chart.height - 8;
        const leftX = chartArea.left + 4;
        const rightX = chartArea.right - 4;
        c.save();
        const maxLabel = `↗ ${maxVal} W`;
        c.font = 'bold 11px Arial';
        const maxW = c.measureText(maxLabel).width;
        const pad = 4;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(leftX - pad, labelY - 10 + pad, maxW + pad * 2, 14);
        c.fillStyle = '#00BCD4';
        c.textAlign = 'left';
        c.fillText(maxLabel, leftX, labelY + 4);
        c.restore();

        c.save();
        const avgLabel = `∅ ${Math.round(avgVal)} W`;
        c.font = 'bold 11px Arial';
        const avgW = c.measureText(avgLabel).width;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
        c.fillStyle = '#FF6B6B';
        c.textAlign = 'right';
        c.fillText(avgLabel, rightX, labelY + 4);
        c.restore();
      }
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Potencia (W)',
        data: chartData,
        borderColor: '#00BCD4',
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: false,
        yAxisID: 'y'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} W @ ${ctx.parsed.x.toFixed(2)} km`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: Math.ceil(totalKm),
          title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
          ticks: { stepSize: tickStep, font: { size: 10 }, callback: (v) => Math.abs(v % tickStep) < 0.01 ? v : '' },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Potencia (W)', font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
    },
    plugins: [pwrPlugin]
  });
}

const guardarRutaManual = async () => {
  const regulacionCheckbox = document.getElementById("regulacion_ruta");
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    kms: document.getElementById("kms_ruta").value,
    observaciones: document.getElementById("obs_ruta").value,
    fecha: document.getElementById("fecha_ruta").value,
    regulacion: regulacionCheckbox ? (regulacionCheckbox.checked ? 1 : 0) : 0,
  };

  let url;
  let mensaje;

  if (window.rutaEditandoId) {
    // Modo edición: actualizar ruta existente
    data.id = window.rutaEditandoId;
    url = getApiUrl('ruta.php?actualizarRutaManual');
    mensaje = "✅ Ruta actualizada correctamente";
  } else {
    // Modo nueva: insertar ruta
    url = getApiUrl('ruta.php?guardarRutaManual');
    mensaje = "✅ Ruta guardada correctamente";
  }

  try {
    const response = await axios.post(
      url,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
      await Swal.fire({
        text: mensaje,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      // Limpiar estado de edición y formulario
      window.rutaEditandoId = null;
      document.getElementById("kms_ruta").value = "";
      document.getElementById("obs_ruta").value = "";
      document.getElementById("fecha_ruta").value = loadDefaultDate();

      // Ocultar botón cancelar
      const cancelBtn = document.getElementById("cancelar_btn");
      if (cancelBtn) cancelBtn.style.display = "none";

      // Volver a la pestaña principal
      const tab1Tab = document.getElementById("tab1-tab");
      const tab1 = document.getElementById("tab1");
      const tab2Tab = document.getElementById("tab2-tab");
      const tab2 = document.getElementById("tab2");

      tab2Tab.classList.remove("active");
      tab2.classList.remove("show", "active");
      tab1Tab.classList.add("active");
      tab1.classList.add("show", "active");

      await getRutasByVehiculo();
      await crearBackup();
    } else {
      throw new Error(response.data.message || "Error del servidor");
    }
  } catch (err) {
    await Swal.fire({
      text: `❌ Error al guardar: ${
        err.response?.data?.message || err.message
      }`,
      icon: "error",
      timer: 3000,
    });
  }
};

const editarRutaManual = (id, fecha, kms, observaciones, regulacion) => {
  // Guardar el ID de la ruta que estamos editando
  window.rutaEditandoId = id;

  // Limpiar valores primero
  document.getElementById("kms_ruta").value = "";
  document.getElementById("obs_ruta").value = "";
  document.getElementById("fecha_ruta").value = "";

  // Cambiar a la pestaña de manual
  const tab2Tab = document.getElementById("tab2-tab");
  const tab2 = document.getElementById("tab2");
  const tab1Tab = document.getElementById("tab1-tab");
  const tab1 = document.getElementById("tab1");

  tab1Tab.classList.remove("active");
  tab1.classList.remove("show", "active");
  tab2Tab.classList.add("active");
  tab2.classList.add("show", "active");

  // Cargar los datos de la ruta
  setTimeout(() => {
    document.getElementById("kms_ruta").value = kms;
    document.getElementById("obs_ruta").value = observaciones.replace(/'/g, "\\'");
    const regCheckbox = document.getElementById("regulacion_ruta");
    if (regCheckbox) regCheckbox.checked = regulacion == 1 || regulacion === "1";

    // Extraer solo la fecha en formato YYYY-MM-DD
    let fechaValue = fecha;
    if (fecha.indexOf('T') !== -1) {
      fechaValue = fecha.split('T')[0];
    } else if (fecha.indexOf(' ') !== -1) {
      fechaValue = fecha.split(' ')[0];
    }
    document.getElementById("fecha_ruta").value = fechaValue;

    // Mostrar botón cancelar
    const cancelBtn = document.getElementById("cancelar_btn");
    if (cancelBtn) {
      cancelBtn.style.display = "block";
    }
  }, 100);
};

const eliminarRutaFormulario = async () => {
  if (window.rutaEditandoId) {
    // Estamos editando una ruta existente: eliminarla
    const fecha = document.getElementById("fecha_ruta").value;
    const kms = document.getElementById("kms_ruta").value;

    const result = await Swal.fire({
      title: 'Eliminar ruta',
      customClass: { title: 'swal-title-sm', html: 'swal-html-sm' },
      html: `
        <div style="text-align: left;">
          <p>¿Está seguro que desea eliminar esta ruta?</p>
          <p><strong>Fecha:</strong> ${formatFechaISO(fecha)}</p>
          <p><strong>Kilómetros:</strong> ${kms} km</p>
          <p class="text-danger mt-3"><small>Esta acción no se puede deshacer.</small></p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const response = await axios.post(
          getApiUrl('ruta.php?eliminaRutaManual'),
          { data: { ruta_id: window.rutaEditandoId } },
          { headers: { "Content-Type": "application/json" } }
        );

        if (response.data.success) {
          await Swal.fire({
            text: "✅ Ruta eliminada correctamente",
            icon: "success",
            timer: 2000,
            showConfirmButton: false,
          });

          // Limpiar estado y formulario
          window.rutaEditandoId = null;
          document.getElementById("kms_ruta").value = "";
          document.getElementById("obs_ruta").value = "";
          document.getElementById("fecha_ruta").value = "";

          // Ocultar botón cancelar
          const cancelBtn = document.getElementById("cancelar_btn");
          if (cancelBtn) cancelBtn.style.display = "none";

          // Volver a la pestaña principal
          const tab1Tab = document.getElementById("tab1-tab");
          const tab1 = document.getElementById("tab1");
          const tab2Tab = document.getElementById("tab2-tab");
          const tab2 = document.getElementById("tab2");

          tab2Tab.classList.remove("active");
          tab2.classList.remove("show", "active");
          tab1Tab.classList.add("active");
          tab1.classList.add("show", "active");

          await getRutasByVehiculo();
        }
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo eliminar la ruta",
        });
      }
    }
  } else {
    // No estamos editando: limpiar formulario
    document.getElementById("kms_ruta").value = "";
    document.getElementById("obs_ruta").value = "";
    document.getElementById("fecha_ruta").value = "";
  }
};

// ========== GRÁFICAS DE ANÁLISIS (Tabs 6 y 7) ==========
let chartDistanciaInstance = null;
let chartCumulativaInstance = null;
let chartCorrDesnivelInstance = null;
let chartCorrVelocidadInstance = null;
let datosDistanciaGlobal = null;

async function cargarGraficasAnalisis() {
  const vehiculoBtn = document.getElementById("vehiculo-select");
  const vehiculo_id = vehiculoBtn?.dataset?.selected || vehiculoBtn?.value;
  if (!vehiculo_id) return;

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getRutasChartData'),
      { data: { vehiculo_id } },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data.success) {
      const datos = response.data.content;
      if (!datos || datos.length === 0) {
        mostrarSinDatos('Gráfica no disponible - Sin rutas para este vehículo');
        return;
      }
      datosDistanciaGlobal = datos;
      poblarSelectorAnioDistancia(datos);
      actualizarGraficaDistanciaPorAnio();
      renderChartCumulativa(datos, vehiculo_id);
      renderChartCorrDesnivel(datos);
      renderChartCorrVelocidad(datos);
    }
  } catch (err) {
    console.error("Error al obtener datos de análisis:", err);
  }
}

function poblarSelectorAnioDistancia(datos) {
  const select = document.getElementById("anio-filtro-distancia");
  if (!select) return;
  const anios = [...new Set(datos.map(d => {
    const f = d.fecha_inicio ? d.fecha_inicio.substring(0, 10) : '';
    return f ? f.substring(0, 4) : null;
  }).filter(Boolean))].sort().reverse();
  select.innerHTML = '';
  anios.forEach(anio => {
    const opt = document.createElement("option");
    opt.value = anio;
    opt.textContent = anio;
    select.appendChild(opt);
  });
  const anioActual = new Date().getFullYear().toString();
  if (anios.includes(anioActual)) select.value = anioActual;
}

function actualizarGraficaDistanciaPorAnio() {
  if (!datosDistanciaGlobal) return;
  const select = document.getElementById("anio-filtro-distancia");
  const anio = select ? select.value : null;
  if (!anio) return;
  const filtrados = datosDistanciaGlobal.filter(d => {
    const f = d.fecha_inicio ? d.fecha_inicio.substring(0, 10) : '';
    return f && f.substring(0, 4) === anio;
  });
  renderChartDistanciaDesnivel(filtrados);
}

function mostrarSinDatos(mensaje) {
  ['chart-distancia', 'chart-cumulativa', 'chart-corr-desnivel', 'chart-corr-velocidad'].forEach(id => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.fillText(mensaje || "Sin datos", canvas.width / 2, canvas.height / 2);
  });
}

function renderChartDistanciaDesnivel(datos) {
  if (chartDistanciaInstance) chartDistanciaInstance.destroy();
  const canvas = document.getElementById("chart-distancia");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const agg = {};
  datos.forEach(d => {
    const f = d.fecha_inicio ? d.fecha_inicio.substring(0, 10) : '';
    if (!f) return;
    const key = f.substring(0, 7);
    if (!agg[key]) agg[key] = { kms: 0, ascenso: 0 };
    agg[key].kms += parseFloat(d.kms) || 0;
    agg[key].ascenso += parseFloat(d.metros_ascenso) || 0;
  });
  const keys = Object.keys(agg).sort();
  const etiquetas = keys.map(k => {
    const [y, m] = k.split('-');
    return meses[parseInt(m) - 1] + ' ' + y;
  });
  const kms = keys.map(k => agg[k].kms);
  const ascenso = keys.map(k => agg[k].ascenso);

  chartDistanciaInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: 'Distancia (km)',
          data: kms,
          backgroundColor: 'rgba(13,71,161,0.65)',
          borderColor: '#6A0DAD',
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Desnivel (m)',
          data: ascenso,
          backgroundColor: 'rgba(230,81,0,0.65)',
          borderColor: '#E65100',
          borderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Distancia y desnivel por ruta', font: { size: 14 } },
        legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } }
      },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'km' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'm' } }
      }
    }
  });
}

function renderChartCumulativa(datos, vehiculo_id) {
  if (chartCumulativaInstance) chartCumulativaInstance.destroy();
  const canvas = document.getElementById("chart-cumulativa");
  if (!canvas) return;
  canvas.style.touchAction = 'pan-y';
  canvas.style.webkitTouchCallout = 'none';
  canvas.style.webkitUserSelect = 'none';
  if (canvas.parentElement) canvas.parentElement.style.touchAction = 'pan-y';
  const ctx = canvas.getContext("2d");

  const etiquetas = datos.map((d, i) => {
    const f = d.fecha_inicio ? d.fecha_inicio.substring(0, 10) : '';
    return f ? f.substring(8, 10) + '/' + f.substring(5, 7) + '/' + f.substring(0, 4) : '#' + (i + 1);
  });
  const kms = datos.map(d => parseFloat(d.kms) || 0);
  const acum = datos.map(d => parseFloat(d.acumulado_kms) || 0);

  chartCumulativaInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: 'Distancia (km)',
          data: kms,
          backgroundColor: 'rgba(27,94,32,0.55)',
          borderColor: '#1B5E20',
          borderWidth: 2,
          order: 2
        },
        {
          label: 'Acumulado (km)',
          data: acum,
          type: 'line',
          borderColor: '#6A1B9A',
          backgroundColor: 'rgba(106,27,154,0.12)',
          borderWidth: 3,
          fill: true,
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6A1B9A',
          yAxisID: 'y1',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Distancia acumulada', font: { size: 14 } },
        legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } },
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, mode: 'x', modifierKey: 'shift' }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'km' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'km acum' } }
      }
    }
  });
}

function renderChartCorrDesnivel(datos) {
  if (chartCorrDesnivelInstance) chartCorrDesnivelInstance.destroy();
  const canvas = document.getElementById("chart-corr-desnivel");
  if (!canvas) return;
  canvas.style.touchAction = 'pan-y';
  canvas.style.webkitTouchCallout = 'none';
  canvas.style.webkitUserSelect = 'none';
  if (canvas.parentElement) canvas.parentElement.style.touchAction = 'pan-y';
  const ctx = canvas.getContext("2d");

  const filtrados = datos.filter(d => d.regulacion != 1);
  const scatterData = filtrados.map(d => ({
    x: parseFloat(d.kms) || 0,
    y: parseFloat(d.metros_ascenso) || 0,
    fecha: d.fecha_inicio ? d.fecha_inicio.substring(0, 10) : ''
  }));

  chartCorrDesnivelInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Ruta',
        data: scatterData,
        backgroundColor: 'rgba(198,40,40,0.7)',
        borderColor: '#C62828',
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Correlación: Distancia vs Desnivel', font: { size: 14 } },
        tooltip: {
          callbacks: {
            label: function(context) {
              const fecha = context.raw.fecha ? formatFechaISO(context.raw.fecha) : '';
              return (fecha ? fecha + ' — ' : '') + context.parsed.x.toFixed(1) + ' km, ' + context.parsed.y.toFixed(0) + ' m';
            }
          }
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, mode: 'xy', modifierKey: 'shift' }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: 'Distancia (km)' } },
        y: { beginAtZero: true, title: { display: true, text: 'Desnivel (m)' } }
      }
    }
  });
}

function renderChartCorrVelocidad(datos) {
  if (chartCorrVelocidadInstance) chartCorrVelocidadInstance.destroy();
  const canvas = document.getElementById("chart-corr-velocidad");
  if (!canvas) return;
  canvas.style.touchAction = 'pan-y';
  canvas.style.webkitTouchCallout = 'none';
  canvas.style.webkitUserSelect = 'none';
  if (canvas.parentElement) canvas.parentElement.style.touchAction = 'pan-y';
  const ctx = canvas.getContext("2d");

  const filtrados = datos.filter(d => d.regulacion != 1);
  const scatterData = filtrados.map(d => ({
    x: parseFloat(d.kms) || 0,
    y: parseFloat(d.velocidad_media) || 0,
    fecha: d.fecha_inicio ? d.fecha_inicio.substring(0, 10) : ''
  }));

  chartCorrVelocidadInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Ruta',
        data: scatterData,
        backgroundColor: 'rgba(0,131,143,0.7)',
        borderColor: '#00838F',
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Correlación: Distancia vs Velocidad media', font: { size: 14 } },
        tooltip: {
          callbacks: {
            label: function(context) {
              const fecha = context.raw.fecha ? formatFechaISO(context.raw.fecha) : '';
              return (fecha ? fecha + ' — ' : '') + context.parsed.x.toFixed(1) + ' km, ' + context.parsed.y.toFixed(1) + ' km/h';
            }
          }
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, mode: 'xy', modifierKey: 'shift' }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: 'Distancia (km)' } },
        y: { beginAtZero: true, title: { display: true, text: 'Velocidad (km/h)' } }
      }
    }
  });
}

const cancelarEdicionRuta = () => {
  // Limpiar estado de edición
  window.rutaEditandoId = null;

  // Limpiar formulario
  document.getElementById("kms_ruta").value = "";
  document.getElementById("obs_ruta").value = "";
  document.getElementById("fecha_ruta").value = "";

  // Ocultar botón cancelar
  const cancelBtn = document.getElementById("cancelar_btn");
  if (cancelBtn) {
    cancelBtn.style.display = "none";
  }

  // Volver a la pestaña principal
  const tab1Tab = document.getElementById("tab1-tab");
  const tab1 = document.getElementById("tab1");
  const tab2Tab = document.getElementById("tab2-tab");
  const tab2 = document.getElementById("tab2");

  tab2Tab.classList.remove("active");
  tab2.classList.remove("show", "active");
  tab1Tab.classList.add("active");
  tab1.classList.add("show", "active");
};

const confirmarEliminarRutaGPX = async (idRuta, fecha, kms) => {
  const fechaTexto = fecha && fecha.includes('T') ? formatFechaTimeISO(fecha) : formatFechaISO(fecha);
  const result = await Swal.fire({
    title: 'Eliminar ruta GPX',
    customClass: { title: 'swal-title-sm', html: 'swal-html-sm' },
    html: `
      <div style="text-align: left;">
        <p>¿Está seguro que desea eliminar esta ruta?</p>
        <p><strong>Fecha:</strong> ${fechaTexto || 'No disponible'}</p>
        <p><strong>Kilómetros:</strong> ${kms} km</p>
        <p class="text-danger mt-3"><small>Esta acción no se puede deshacer.</small></p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    await eliminaRutaManual(idRuta);
  }
};

const eliminaRutaManual = async (idRuta) => {
  const data = {
    ruta_id: idRuta,
  };

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?eliminaRutaManual'),
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
      await initRutas();
    }
  } catch (err) {
    console.error("Error al obtener rutas:", err);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudieron cargar los detalles de la ruta",
    });
  }
};

// Configurar eventos de pulsación larga (long press) para tarjetas GPX
function configurarLongPressCards() {
  const LONG_PRESS_DURATION = 1000; // milisegundos (1 segundo)
  let pressTimer;
  let isPressing = false;
  let currentCard = null;
  let progressIndicator = null;

  // Función para crear indicador de progreso
  const createProgressIndicator = (card) => {
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      height: 4px;
      background: linear-gradient(90deg, #dc3545, #ff6b7a);
      width: 0%;
      transition: width ${LONG_PRESS_DURATION}ms linear;
      border-radius: 0 0 0 4px;
      z-index: 10;
    `;
    card.style.position = 'relative';
    card.appendChild(indicator);

    // Forzar reflow para activar la transición
    indicator.offsetHeight;
    indicator.style.width = '100%';

    return indicator;
  };

  // Función para iniciar la pulsación
  const startPress = (card, e) => {
    if (e.button !== 0 && e.type === 'mousedown') return; // Solo click izquierdo

    // No iniciar long-press si se pulsa sobre el icono (zona de popup/edición)
    if (e.target.closest) {
      const iconArea = e.target.closest('.card-icon-area');
      if (iconArea && card.contains(iconArea)) return;
      // No iniciar long-press si se pulsa sobre el checkbox de selección
      const checkBox = e.target.closest('.ruta-seleccion-check');
      if (checkBox && card.contains(checkBox)) return;
    }

    isPressing = true;
    currentCard = card;

    // Feedback visual - cambiar apariencia
    card.style.transform = 'scale(0.98)';
    card.style.transition = 'transform 0.2s, box-shadow 0.2s';
    card.style.boxShadow = '0 4px 8px rgba(220, 53, 69, 0.3)';

    // Crear indicador de progreso
    progressIndicator = createProgressIndicator(card);

    pressTimer = setTimeout(() => {
      if (isPressing && currentCard === card) {
        // Pulsación larga completada
        isPressing = false;

        // Restaurar estilos
        card.style.transform = 'scale(1)';
        card.style.boxShadow = '';
        if (progressIndicator && progressIndicator.parentNode) {
          progressIndicator.remove();
        }
        progressIndicator = null;

        // Obtener datos del dataset
        const id = card.dataset.gpxId;
        const fecha = card.dataset.gpxFecha;
        const kms = card.dataset.gpxKms;

        // Mostrar confirmación
        confirmarEliminarRutaGPX(id, fecha, kms);
      }
    }, LONG_PRESS_DURATION);
  };

  // Función para cancelar la pulsación
  const cancelPress = (card) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    isPressing = false;
    currentCard = null;

    // Restaurar estilos
    card.style.transform = 'scale(1)';
    card.style.boxShadow = '';

    // Eliminar indicador de progreso
    if (progressIndicator && progressIndicator.parentNode) {
      progressIndicator.remove();
    }
    progressIndicator = null;
  };

  // Configurar eventos para todas las tarjetas GPX
  const gpxCards = document.querySelectorAll('[data-gpx-id]');
  gpxCards.forEach(card => {
    // Mouse events
    card.addEventListener('mousedown', (e) => startPress(card, e));
    card.addEventListener('mouseup', () => cancelPress(card));
    card.addEventListener('mouseleave', () => cancelPress(card));

    // Touch events (para móviles)
    card.addEventListener('touchstart', (e) => {
      // No prevenir default para permitir scroll, solo para el timer
      startPress(card, e);
    }, { passive: true });
    card.addEventListener('touchend', () => cancelPress(card));
    card.addEventListener('touchcancel', () => cancelPress(card));
    card.addEventListener('touchmove', () => cancelPress(card)); // Cancelar si se mueve el dedo

    // Prevenir el menú contextual en móviles
    card.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

// Función para generar resumen compacto de GPX (similar a FIT)
// Función para generar el contenido HTML de la ruta
function renderStatsCaptura(fields) {
  return `
    <div class="ruta-details-captura">
      ${fields
        .map(
          (field) => `
        <div class="detail-row-captura">
          <strong class="label-captura">${field.label}:</strong>
          <span class="value-captura">${field.value}</span>
        </div>
      `
        )
        .join("")}
    </div>
    <style>
      .ruta-details-captura {
        text-align: left;
        font-size: 14px;
        background: white;
        border-radius: 10px;
        padding: 4px;
        border: 1px solid #2562D3;
        max-height: 600px;
        overflow-y: auto;
      }
      .detail-row-captura {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid #e0e0e0;
      }
      .detail-row-captura:last-child {
        border-bottom: none;
      }
      .label-captura {
        font-size: 12px;
        color: #555;
        font-weight: 600;
      }
      .value-captura {
        font-size: 14px;
        font-weight: 700;
        color: #2c3e50;
      }
      .swal-title-small {
        font-size: 16px !important;
      }
    </style>
  `;
}

function generarContenidoRuta(ruta, hasHR = false, tempData = null, pulsacionesSummary = null) {
  const hasElevChart = ruta.gpx_data && ruta.gpx_data !== 'null' && ruta.gpx_data !== '[]';
  const fields = [
    { label: "📆 Inicio", value: formatFechaTimeISO(ruta.fecha_inicio) },
    { label: "📆 Fin", value: formatFechaTimeISO(ruta.fecha_fin) },
    { label: "🕑 Tiempo total", value: ruta.tiempo_total },
    { label: "⌚ Tiempo en movimiento", value: ruta.tiempo_movimiento },
    { label: "📏 Distancia", value: `${ruta.kms} km` },
    ...(hasElevChart ? [] : [
      { label: "⏫ Ascenso", value: `${ruta.metros_ascenso} m` },
      { label: "⏬ Descenso", value: `${ruta.metros_descenso} m` },
    ]),
    ...(hasElevChart ? [] : [{ label: "⛰️ Altitud máxima", value: `${ruta.altitud_maxima} m` }]),
    { label: "💥 Calorías", value: `${ruta.calorias} kcal` },
    {
      label: `⬆️ Subida (${ruta.tiempo_subida || "00:00:00"})`,
      value: `${ruta.pct_subida}%`,
    },
    {
      label: `➡️ Plano (${ruta.tiempo_plano || "00:00:00"})`,
      value: `${ruta.pct_plano}%`,
    },
    {
      label: `⬇️ Bajada (${ruta.tiempo_bajada || "00:00:00"})`,
      value: `${ruta.pct_bajada}%`,
    },
  ];

  if (
    hasHR ||
    (ruta.frecuencia_cardiaca_promedio !== undefined &&
      ruta.frecuencia_cardiaca_promedio !== null)
  ) {
    fields.push(
      {
        label: "❤️ FC promedio",
        value: `${ruta.frecuencia_cardiaca_promedio} bpm`,
      },
      {
        label: "❤️‍🔥 FC máxima",
        value: `${ruta.frecuencia_cardiaca_maxima || "—"} bpm`,
      }
    );
  }

  return renderStatsCaptura(fields);
}

function actualizarStatsConTemperatura(ruta, tempData, pulsacionesSummary = null) {
  if (!tempData || tempData.length === 0) return;
  const statsDiv = document.querySelector('.ruta-details-captura');
  if (!statsDiv) return;
  const tempRegex = /(🌡️ Temp\. máxima|🌡️ Temp\. mínima)/;
  if (tempRegex.test(statsDiv.parentElement?.innerHTML || '')) return;
  statsDiv.outerHTML = generarContenidoRuta(ruta, false, tempData, pulsacionesSummary);
}

// Detalle para rutas de bicicleta estática (indoor).
// No hay GPS: se muestran las estimaciones (distancia/velocidad/potencia) y
// las gráficas de FC, velocidad y potencia frente al km estimado.
const showIndoorDetails = async (ruta_id) => {
  window.__indoorCharts = window.__indoorCharts || {};
  Object.values(window.__indoorCharts).forEach((c) => { try { c.destroy(); } catch (e) {} });
  window.__indoorCharts = {};

  Swal.fire({
    title: false,
    html: '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Cargando detalles...</p></div>',
    width: 800,
    padding: "0px",
    showCloseButton: true,
    showConfirmButton: false,
    customClass: { popup: 'swal-ruta-detalle', closeButton: 'swal-close-top' },
  });

  try {
    const [rutaResp, pulsaciones] = await Promise.all([
      axios.post(getApiUrl('ruta.php?getRutasById'), { data: { ruta_id } }, { headers: { "Content-Type": "application/json" } }),
      getPulsacionesByRuta(ruta_id),
    ]);

    if (!rutaResp.data.success || !rutaResp.data.content[0]) {
      const htmlEl = Swal.getHtml();
      if (htmlEl) htmlEl.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar los detalles</div>';
      return;
    }

    const ruta = rutaResp.data.content[0];

    const fmt = (v, dec = 2) => (parseFloat(v) || 0).toFixed(dec).replace('.', ',');
    const resumen = pulsacionesResumen(pulsaciones);
    const zonasFc = obtenerZonasFc(ruta, pulsaciones);
    const zonasFcHtml = ruta.categoria === 'estatica' && zonasFc ? renderZonasFcHtml(zonasFc) : '';
    const filas = [
      { label: "📆 Inicio", value: formatFechaTimeISO(ruta.fecha_inicio) },
      { label: "🕑 Tiempo total", value: ruta.tiempo_total || '—' },
      { label: "📏 Distancia (estimada)", value: `${fmt(ruta.kms)} km` },
      { label: "🚀 Vel. media (estimada)", value: `${fmt(ruta.velocidad_media, 1)} km/h` },
      { label: "🚀 Vel. máxima (estimada)", value: `${fmt(ruta.velocidad_maxima, 1)} km/h` },
      { label: "⚡ Potencia media (estimada)", value: `${parseInt(ruta.potencia_promedio_w) || 0} W` },
      { label: "❤️ FC promedio", value: `${resumen.avg || '—'} bpm` },
      { label: "❤️‍🔥 FC máxima", value: `${resumen.max || '—'} bpm` },
      { label: "💥 Calorías", value: `${ruta.calorias || '—'} kcal` },
    ];

    const statsHtml = `
      ${renderStatsCaptura(filas)}
      <div style="margin-top:8px;font-size:0.72rem;color:#888;line-height:1.2;text-align:left;">
        <i class="fas fa-circle-info"></i> Distancia, velocidad y potencia son estimaciones calculadas a partir de la frecuencia cardíaca, las calorías y el tiempo.
      </div>`;

    const graphSection = (id, title, open) => `
      <details class="ruta-collapse" ${open ? 'open' : ''}>
        <summary class="ruta-collapse-summary">${title}</summary>
        <div style="height: 200px; margin-top: 4px; padding: 4px; border: 1px solid #dee2e6; border-radius: 8px;">
          <canvas id="${id}"></canvas>
        </div>
      </details>`;

    const hasPulsos = Array.isArray(pulsaciones) && pulsaciones.length > 0;
    const chartsHtml = hasPulsos ? `
      ${graphSection('indoorHrChart', '❤️ Pulsaciones', false)}
      ${zonasFcHtml}
      ${graphSection('indoorSpeedChart', '🚀 Velocidad (estimada)', false)}
      ${graphSection('indoorPowerChart', '⚡ Potencia (estimada)', false)}
    ` : '';

    Swal.update({
      html: `<div class="ruta-details-wrapper">${chartsHtml}<div>${statsHtml}</div></div>
        <style>
          .ruta-collapse { margin-bottom: 2px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }
          .ruta-collapse-summary { padding: 8px 6px; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--text-primary, #333); background: var(--card-bg, #f8f9fa); user-select: none; text-align: left; }
          .swal-wa-top {
            position: absolute; top: 10px; left: 10px; z-index: 10;
            background: #25D366; color: #fff; border: none; border-radius: 50%;
            width: 28px; height: 28px; font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2); transition: transform 0.2s;
          }
          .swal-wa-top:hover { transform: scale(1.1); }
          .swal-close-top { font-size: 22px !important; width: 32px !important; height: 32px !important; line-height: 32px !important; padding: 0 !important; top: 8px !important; right: 8px !important; }
        </style>`,
      showConfirmButton: false,
    });

    // Guardar datos para compartir y añadir botón de WhatsApp
    window.__indoorRuta = ruta;
    window.__indoorPulsaciones = Array.isArray(pulsaciones) ? pulsaciones : [];
    const popup = Swal.getPopup();
    if (popup) {
      popup.style.position = 'relative';
      const waBtn = document.createElement('button');
      waBtn.id = 'wa-share-btn-indoor';
      waBtn.className = 'swal-wa-top';
      waBtn.innerHTML = '<i class="fab fa-whatsapp"></i>';
      waBtn.title = 'Compartir por WhatsApp';
      waBtn.onclick = async (e) => {
        e.preventDefault();
        await compartirIndoorWhatsApp();
      };
      popup.insertBefore(waBtn, popup.firstChild);
    }

    if (hasPulsos) {
      renderIndoorCharts(pulsaciones);
    }
  } catch (err) {
    console.error('showIndoorDetails', err);
    const htmlEl = Swal.getHtml();
    if (htmlEl) htmlEl.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar los detalles</div>';
  }
};

function pulsacionesResumen(pulsaciones) {
  if (!Array.isArray(pulsaciones)) return { avg: null, max: null };
  const hrs = pulsaciones.map(p => parseInt(p.pulsaciones)).filter(v => !isNaN(v) && v > 0);
  if (hrs.length === 0) return { avg: null, max: null };
  return {
    avg: Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length),
    max: Math.max(...hrs),
  };
}

// Zonas de ritmo cardiaco (estilo Zeep)
const HR_ZONES = [
  { zona: 'Moderado', min: 85, max: 101 },
  { zona: 'Intensivo', min: 102, max: 118 },
  { zona: 'Aeróbico', min: 119, max: 135 },
  { zona: 'Anaeróbico', min: 136, max: 152 },
  { zona: 'VO2 Max', min: 153, max: 171 },
];
const ZONE_COLORS = {
  'Moderado': '#B57FB7',
  'Intensivo': '#4FC3F7',
  'Aeróbico': '#66BB6A',
  'Anaeróbico': '#FFB300',
  'VO2 Max': '#E53935',
};

function formatTimeShort(seg) {
  const s = Math.max(0, Math.round(seg || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Calcula el tiempo y porcentaje en cada zona de FC a partir de las pulsaciones.
// El tiempo por registro se obtiene de la diferencia de timestamps (timestamp_fit).
// Calcula las zonas de FC a partir de la fecha de nacimiento y una fecha
// de referencia (p.ej. la de la ruta, para respetar el snapshot).
// HRmáx = 220 - edad. Devuelve null si no hay fecha de nacimiento.
function calcularZonasFcNacimiento(fechaNacimiento, fechaRef) {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  const ref = fechaRef ? new Date(fechaRef) : new Date();
  if (isNaN(nac.getTime()) || isNaN(ref.getTime())) return null;
  let edad = ref.getFullYear() - nac.getFullYear();
  const m = ref.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < nac.getDate())) edad--;
  if (edad < 0) return null;
  const hrMax = Math.max(1, 220 - edad);
  const bands = [
    ['Moderado', 50, 60], ['Intensivo', 60, 70], ['Aeróbico', 70, 80],
    ['Anaeróbico', 80, 90], ['VO2 Max', 90, 100],
  ];
  return bands.map((b, i) => {
    const min = Math.max(1, Math.round(b[1] / 100 * hrMax));
    const max = (i === bands.length - 1) ? hrMax : Math.round(b[2] / 100 * hrMax);
    return { zona: b[0], min, max };
  });
}

// Devuelve la definición de zonas a usar: dinámica según la fecha de
// nacimiento (snapshot a fechaRef) o la constante HR_ZONES por defecto.
function obtenerZonasDef(fechaRef) {
  const dyn = calcularZonasFcNacimiento(sessionStorage.getItem('fecha_nacimiento'), fechaRef);
  return dyn || HR_ZONES;
}

function computeZonasFc(pulsaciones, fechaRef) {
  const zonasDef = obtenerZonasDef(fechaRef);
  const segundos = zonasDef.map(() => 0);
  let prevTs = null;
  let lastZone = null;
  let firstTs = null;
  let lastTs = null;
  for (const p of pulsaciones) {
    const ts = p.timestamp_fit ? new Date(p.timestamp_fit).getTime() : null;
    const hr = parseInt(p.pulsaciones);
    let zoneIdx = null;
    if (!isNaN(hr) && hr > 0) {
      for (let i = 0; i < zonasDef.length; i++) {
        if (hr >= zonasDef[i].min && hr <= zonasDef[i].max) {
          zoneIdx = i;
          break;
        }
      }
    }
    if (ts && prevTs !== null) {
      const dt = (ts - prevTs) / 1000;
      if (dt > 0 && dt <= 600) {
        if (zoneIdx === null) zoneIdx = lastZone;
        if (zoneIdx !== null) {
          segundos[zoneIdx] += dt;
          lastZone = zoneIdx;
        }
      }
    }
    if (ts) {
      if (firstTs === null) firstTs = ts;
      lastTs = ts;
      prevTs = ts;
    }
  }
  // Porcentaje ABSOLUTO: respecto al tiempo total de la sesión
  // (último - primer timestamp), igual que en Zepp.
  const span = (lastTs !== null && firstTs !== null) ? (lastTs - firstTs) / 1000 : 0;
  return zonasDef.map((z, i) => ({
    zona: z.zona,
    min: z.min,
    max: z.max,
    segundos: Math.round(segundos[i]),
    porcentaje: span > 0 ? Math.round((segundos[i] / span) * 100) : 0,
  }));
}

// Devuelve las zonas FC de una ruta. Prioriza el dato persistido (zonas_fc en la
// tabla); si no existe, lo calcula directamente desde las pulsaciones.
function obtenerZonasFc(ruta, pulsaciones) {
  if (ruta && ruta.zonas_fc) {
    try {
      const parsed = typeof ruta.zonas_fc === 'string' ? JSON.parse(ruta.zonas_fc) : ruta.zonas_fc;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) { /* fallback a calculo */ }
  }
  if (Array.isArray(pulsaciones) && pulsaciones.length > 0) {
    return computeZonasFc(pulsaciones, ruta ? ruta.fecha_inicio : null);
  }
  return null;
}

function renderZonasFcRows(zonas) {
  if (!Array.isArray(zonas) || zonas.length === 0) return '';
  const ordenadas = [...zonas].reverse();
  return ordenadas.map(z => {
    const color = ZONE_COLORS[z.zona] || '#888';
    const pct = Math.round(z.porcentaje || 0);
    return `
      <div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:var(--text-primary);">
          <span>${z.zona} <span style="font-weight:400;color:#888;">(${z.min}-${z.max} bpm)</span></span>
          <span>${pct}% &nbsp;&nbsp; ${formatTimeShort(z.segundos)}</span>
        </div>
        <div style="background:#e9ecef;border-radius:6px;height:10px;overflow:hidden;margin-top:2px;">
          <div style="width:${pct}%;background:${color};height:100%;border-radius:6px;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderZonasFcHtml(zonas) {
  const rows = renderZonasFcRows(zonas);
  if (!rows) return '';
  return `
    <details class="ruta-collapse" style="margin-bottom:6px;">
      <summary class="ruta-collapse-summary">❤️‍🔥 Zonas de ritmo cardíaco</summary>
      <div style="padding:8px 6px;">${rows}</div>
    </details>`;
}

// Render autocontenido de la tabla de zonas FC para la imagen compartida
// (estilos inline explícitos para que html2canvas los capture sin depender
// de variables CSS del tema). Devuelve '' si no hay datos.
function renderZonasFcShareHtml(zonas) {
  if (!Array.isArray(zonas) || zonas.length === 0) return '';
  const ordenadas = [...zonas].reverse();
  const rows = ordenadas.map(z => {
    const color = ZONE_COLORS[z.zona] || '#888';
    const pct = Math.round(z.porcentaje || 0);
    return `
      <div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:#333;">
          <span>${z.zona} <span style="font-weight:400;color:#888;">(${z.min}-${z.max} bpm)</span></span>
          <span>${pct}% &nbsp;&nbsp; ${formatTimeShort(z.segundos)}</span>
        </div>
        <div style="background:#e9ecef;border-radius:6px;height:10px;overflow:hidden;margin-top:2px;">
          <div style="width:${pct}%;background:${color};height:100%;border-radius:6px;"></div>
        </div>
      </div>`;
  }).join('');
  return `
    <div style="padding:4px 10px 8px;font-family:Arial,sans-serif;">
      <div style="font-size:13px;font-weight:700;color:#333;margin-bottom:6px;">❤️‍🔥 Zonas de ritmo cardíaco</div>
      ${rows}
    </div>`;
}

// Plugin de marcadores máx/mín/media para gráficas de bicicleta estática (indoor).
// Dibuja punto máximo, punto mínimo y línea discontinua de media, igual que en las
// gráficas de pulsaciones/velocidad/potencia de las categorías pulmonar y eléctrica.
// Oscurece un color hex (#RRGGBB) multiplicando por f (sin cambiar el tono),
// para que los puntos de marcador destaquen sobre la línea del gráfico.
function darkenColor(hex, f = 0.72) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = Math.max(0, Math.round(parseInt(m[1], 16) * f));
  const g = Math.max(0, Math.round(parseInt(m[2], 16) * f));
  const b = Math.max(0, Math.round(parseInt(m[3], 16) * f));
  return `rgb(${r}, ${g}, ${b})`;
}

function indoorMarkersPlugin({ maxColor, minColor, avgColor, unit, decimals = 0, showMin = true, maxLabelPos = 'point' }) {
  return {
    id: 'indoorMarkers',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const chartW = chart.width;
      const data = chart.data.datasets[0] && chart.data.datasets[0].data;
      if (!data || data.length === 0) return;

      const ys = data.map(d => d.y);
      const maxVal = Math.max(...ys);
      const minVal = Math.min(...ys);
      const avgVal = ys.reduce((s, v) => s + v, 0) / ys.length;
      const maxPoint = data.find(d => d.y === maxVal);
      const minPoint = data.find(d => d.y === minVal);
      const fmtV = (v) => decimals ? v.toFixed(decimals) : Math.round(v);

      const drawPoint = (point, color, prefix, labelPos) => {
        if (!point) return;
        const xPx = xScale.getPixelForValue(point.x);
        const yPx = yScale.getPixelForValue(point.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = darkenColor(color);
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();

        if (labelPos !== 'bottom') {
          c.save();
          c.font = 'bold 11px Arial';
          c.fillStyle = color;
          c.textAlign = xPx + 60 > chartW ? 'right' : 'left';
          c.fillText(`${prefix} ${fmtV(point.y)} ${unit}`, xPx + (xPx + 60 > chartW ? -8 : 8), yPx + 4);
          c.restore();
        }
      };

      drawPoint(maxPoint, maxColor, '↑', maxLabelPos);
      if (showMin) drawPoint(minPoint, minColor, '↓', 'point');

      const avgPx = yScale.getPixelForValue(avgVal);
      c.save();
      c.setLineDash([6, 4]);
      c.strokeStyle = avgColor;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, avgPx);
      c.lineTo(chartW, avgPx);
      c.stroke();
      c.setLineDash([]);
      c.restore();

      const chartArea = chart.chartArea;
      if (chartArea) {
        const labelY = chart.height - 8;
        const leftX = chartArea.left + 4;
        const rightX = chartArea.right - 4;
        const pad = 4;
        c.save();
        c.font = 'bold 11px Arial';

        if (maxLabelPos === 'bottom') {
          const maxLabel = `↗ ${fmtV(maxVal)} ${unit}`;
          const maxW = c.measureText(maxLabel).width;
          c.fillStyle = 'rgba(255,255,255,0.9)';
          c.fillRect(leftX - pad, labelY - 10 + pad, maxW + pad * 2, 14);
          c.fillStyle = maxColor;
          c.textAlign = 'left';
          c.fillText(maxLabel, leftX, labelY + 4);
        }

        const avgLabel = `∅ ${fmtV(avgVal)} ${unit}`;
        const avgW = c.measureText(avgLabel).width;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
        c.fillStyle = avgColor;
        c.textAlign = 'right';
        c.fillText(avgLabel, rightX, labelY + 4);
        c.restore();
      }
    }
  };
}

function renderIndoorCharts(pulsaciones) {
  // Downsample para rendimiento (~300 puntos máx)
  const step = Math.max(1, Math.ceil(pulsaciones.length / 300));
  const sampled = pulsaciones.filter((_, i) => i % step === 0);

  const buildXY = (campo, filtroPositivo) => sampled
    .map(p => ({ x: parseFloat(p.kilometro) || 0, y: p[campo] != null ? parseFloat(p[campo]) : null }))
    .filter(d => d.y != null && (!filtroPositivo || d.y > 0));

  const mkChart = (canvasId, label, data, color, markerOpts) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    window.__indoorCharts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: color + '33',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        plugins: { legend: { display: false }, title: { display: true, text: label, align: 'start', font: { size: 13, weight: 'bold' } } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'km (estimado)' }, ticks: { maxTicksLimit: 8 } },
          y: { beginAtZero: false },
        },
      },
      plugins: [indoorMarkersPlugin(markerOpts)],
    });
  };

  mkChart('indoorHrChart', 'Pulsaciones (bpm)', buildXY('pulsaciones', true),
    '#DC143C', { maxColor: '#DC143C', minColor: '#5B9BD5', avgColor: 'rgba(255,107,107,0.8)', unit: 'bpm' });
  mkChart('indoorSpeedChart', 'Velocidad (km/h)', buildXY('velocidad', false),
    '#4CAF50', { maxColor: '#4CAF50', minColor: '#5B9BD5', avgColor: 'rgba(255,107,107,0.8)', unit: 'km/h', decimals: 1, showMin: false, maxLabelPos: 'bottom' });
  mkChart('indoorPowerChart', 'Potencia (W)', buildXY('potencia', false),
    '#00BCD4', { maxColor: '#00BCD4', minColor: '#5B9BD5', avgColor: 'rgba(255,107,107,0.8)', unit: 'W', showMin: false, maxLabelPos: 'bottom' });
}

// Compartir sesión de bicicleta estática (indoor) por WhatsApp como imagen.
async function compartirIndoorWhatsApp() {
  const ruta = window.__indoorRuta;
  const pulsaciones = window.__indoorPulsaciones || [];
  if (!ruta) return;

  Swal.showLoading();

  try {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:800px;z-index:-1;background:#fff;';
    document.body.appendChild(container);

    const kms = ruta.kms ? parseFloat(ruta.kms).toFixed(2) : '0';
    const fechaHora = ruta.fecha_inicio ? formatFechaTimeISO(ruta.fecha_inicio) : '';

    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'text-align:center;padding:14px 10px 6px;font-size:17px;font-weight:700;color:#333;font-family:Arial,sans-serif;';
    titleBar.innerHTML = `🏠 ${fechaHora ? fechaHora + ' — ' : ''}${kms} km (estimado)`;
    container.appendChild(titleBar);

    const addSep = () => {
      const sep = document.createElement('hr');
      sep.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
      container.appendChild(sep);
    };
    addSep();

    // Gráficas (FC, velocidad, potencia) desde pulsaciones
    const chartInstances = [];
    const step = pulsaciones.length > 0 ? Math.max(1, Math.ceil(pulsaciones.length / 500)) : 1;
    const sampled = pulsaciones.filter((_, i) => i % step === 0);
    const buildXY = (campo, filtroPositivo) => sampled
      .map(p => ({ x: parseFloat(p.kilometro) || 0, y: p[campo] != null ? parseFloat(p[campo]) : null }))
      .filter(d => d.y != null && (!filtroPositivo || d.y > 0));

    const addChart = (titulo, data, color, markerOpts) => {
      if (!data || data.length === 0) return;
      const div = document.createElement('div');
      div.style.cssText = 'width:800px;height:180px;padding:8px;';
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 180;
      canvas.style.cssText = 'width:100%;height:100%;';
      div.appendChild(canvas);
      container.appendChild(div);
      const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { datasets: [{ label: titulo, data, borderColor: color, backgroundColor: color + '33', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false, parsing: false, devicePixelRatio: 4,
          plugins: { legend: { display: false }, title: { display: true, text: titulo, align: 'start', font: { size: 13, weight: 'bold' } } },
          scales: { x: { type: 'linear', title: { display: true, text: 'km (estimado)' }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: false } },
        },
        plugins: [indoorMarkersPlugin(markerOpts)],
      });
      chartInstances.push(chart);
      addSep();
    };

    addChart('❤️ Pulsaciones (bpm)', buildXY('pulsaciones', true), '#DC143C',
      { maxColor: '#DC143C', minColor: '#5B9BD5', avgColor: 'rgba(255,107,107,0.8)', unit: 'bpm' });

    const zonasFcIndoor = obtenerZonasFc(ruta, pulsaciones);
    if (zonasFcIndoor && zonasFcIndoor.length) {
      const zDiv = document.createElement('div');
      zDiv.style.cssText = 'font-family:Arial,sans-serif;';
      zDiv.innerHTML = renderZonasFcShareHtml(zonasFcIndoor);
      container.appendChild(zDiv);
      addSep();
    }
    addChart('🚀 Velocidad estimada (km/h)', buildXY('velocidad', false), '#4CAF50',
      { maxColor: '#4CAF50', minColor: '#5B9BD5', avgColor: 'rgba(255,107,107,0.8)', unit: 'km/h', decimals: 1, showMin: false, maxLabelPos: 'bottom' });
    addChart('⚡ Potencia estimada (W)', buildXY('potencia', false), '#00BCD4',
      { maxColor: '#00BCD4', minColor: '#5B9BD5', avgColor: 'rgba(255,107,107,0.8)', unit: 'W', showMin: false, maxLabelPos: 'bottom' });

    const resumen = pulsacionesResumen(pulsaciones);
    const fmt = (v, dec = 2) => (parseFloat(v) || 0).toFixed(dec).replace('.', ',');
    const fieldsShare = [
      { label: "📆 Inicio", value: formatFechaTimeISO(ruta.fecha_inicio) },
      { label: "🕑 Tiempo total", value: ruta.tiempo_total || '—' },
      { label: "📏 Distancia (est.)", value: `${fmt(ruta.kms)} km` },
      { label: "🚀 Vel. media (est.)", value: `${fmt(ruta.velocidad_media, 1)} km/h` },
      { label: "🚀 Vel. máxima (est.)", value: `${fmt(ruta.velocidad_maxima, 1)} km/h` },
      { label: "⚡ Potencia (est.)", value: `${parseInt(ruta.potencia_promedio_w) || 0} W` },
      { label: "❤️ FC media", value: `${resumen.avg || '—'} bpm` },
      { label: "❤️ FC máxima", value: `${resumen.max || '—'} bpm` },
      { label: "💥 Calorías", value: `${ruta.calorias || 0} kcal` },
    ];

    const shareStatsHtml = `
      <div class="ruta-details-captura">
        ${fieldsShare.map(f => `
          <div class="detail-row-captura">
            <strong class="label-captura">${f.label}:</strong>
            <span class="value-captura">${f.value}</span>
          </div>`).join("")}
      </div>
      <div style="margin-top:8px;font-size:11px;color:#888;font-family:Arial,sans-serif;">
        ℹ️ Distancia, velocidad y potencia son estimaciones calculadas a partir de la frecuencia cardíaca, las calorías y el tiempo.
      </div>
      <style>
        .ruta-details-captura { display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;max-height:none;overflow:visible;border:none;padding:0; }
        .detail-row-captura { display:flex;flex-direction:column;gap:1px;justify-content:flex-start;border-bottom:none;padding:6px;background:#f4f6f8;border-radius:6px; }
        .label-captura { font-size:10px;color:#666; }
        .value-captura { font-size:13px;font-weight:700; }
      </style>`;

    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'padding:10px;font-family:Arial,sans-serif;';
    statsDiv.innerHTML = shareStatsHtml;
    container.appendChild(statsDiv);

    const resultCanvas = await html2canvas(container, {
      scale: 4, backgroundColor: '#ffffff', logging: false, useCORS: true, allowTaint: false
    });

    chartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    document.body.removeChild(container);

    const blob = await new Promise(resolve => resultCanvas.toBlob(resolve, 'image/png', 1.0));
    if (!blob) throw new Error('No se pudo generar la imagen');

    Swal.close();

    const fileName = `indoor_${(fechaHora || 'estatica').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const texto = `🏠 ${fechaHora ? fechaHora + ' — ' : ''}${kms} km (estimado)`;

    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData = { text: texto, files: [file] };
      if (navigator.canShare(shareData)) {
        try { await navigator.share(shareData); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = 'https://wa.me/';
    } else {
      window.open('https://wa.me/', '_blank');
    }
  } catch (err) {
    console.error('Error al compartir sesión indoor:', err);
    Swal.hideLoading();
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar la imagen' });
  }
}

// Función principal para mostrar detalles de GPX
const showGpxDetails = async (ruta_id) => {
  const controller = new AbortController();
  let hasMapData = false;
  let trackPoints = [];
  let rutaActualData = null;
  let pulsacionesSummary = null;

    const buildFullHtml = (pulsacionesSummary = null) => {
    const tempDataForStats = window.__tempPreloadedData || null;
    const statsHtml = generarContenidoRuta(rutaActualData, false, tempDataForStats, pulsacionesSummary);
    const zonasFcInicial = (rutaActualData && rutaActualData.has_pulsaciones == 1)
      ? renderZonasFcRows(window.__zonasFcTemp || [])
      : '';
    if (hasMapData) {
      return `
        <div class="ruta-details-wrapper">
          <details id="map-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">🗺️ Mapa de ruta</summary>
            <div id="map-container" style="height: 350px; border-radius: 10px; z-index: 1; border: 2px solid #dee2e6; display: none;"></div>
          </details>
          <details id="elevation-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">📈 Perfil de elevación</summary>
            <div id="elevation-chart-wrapper" style="height: 180px; margin-top: 4px; padding: 1px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="elevationChart"></canvas>
            </div>
          </details>
          ${rutaActualData && rutaActualData.has_pulsaciones == 1 ? `
          <details id="pulsaciones-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">❤️ Pulsaciones</summary>
            <div id="pulsaciones-chart-wrapper" style="height: 180px; margin-top: 4px; padding: 1px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="pulsacionesChart"></canvas>
            </div>
          </details>
          <details id="zonas-fc-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">❤️‍🔥 Zonas de ritmo cardíaco</summary>
            <div id="zonas-fc-wrapper" style="padding:8px 6px;">${zonasFcInicial}</div>
          </details>
          ` : ''}
          <details id="velocidad-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">🚀 Velocidad</summary>
            <div id="velocidad-chart-wrapper" style="height: 180px; margin-top: 4px; padding: 1px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="velocidadChart"></canvas>
            </div>
          </details>
          <details id="potencia-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">⚡ Potencia</summary>
            <div id="potencia-chart-wrapper" style="height: 180px; margin-top: 4px; padding: 1px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="potenciaChart"></canvas>
            </div>
          </details>
          <details id="temp-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">🌡️ Temperatura</summary>
            <div id="temp-chart-wrapper" style="height: 180px; margin-top: 4px; padding: 1px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="tempChart"></canvas>
            </div>
          </details>
          <div>${statsHtml}</div>
        </div>
        <style>
          .ruta-details-wrapper { }
          .leaflet-container { z-index: 1 !important; border-radius: 10px; }
          .ruta-collapse { margin-bottom: 2px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }
          .ruta-collapse-summary { padding: 8px 6px; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--text-primary, #333); background: var(--card-bg, #f8f9fa); user-select: none; text-align: left; }
          .ruta-collapse-summary:hover { background: var(--hover-bg, #e9ecef); }
          .ruta-collapse[open] .ruta-collapse-summary { border-bottom: 1px solid #dee2e6; }
          .swal-wa-top {
            position: absolute; top: 10px; left: 10px; z-index: 10;
            background: #25D366; color: #fff; border: none; border-radius: 50%;
            width: 28px; height: 28px; font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2); transition: transform 0.2s;
          }
          .swal-wa-top:hover { transform: scale(1.1); }
          .swal-close-top {
            font-size: 22px !important; width: 32px !important; height: 32px !important;
            line-height: 32px !important; padding: 0 !important;
            top: 8px !important; right: 8px !important;
          }
        </style>
      `;
    }
    return statsHtml;
  };

  const setupLazyListeners = () => {
    if (!hasMapData) return;
    window.__rutaTrackPoints = trackPoints;
    const mapDetails = document.getElementById('map-details');
    const mapContainer = document.getElementById('map-container');
    const elevDetails = document.getElementById('elevation-details');
    const elevWrapper = document.getElementById('elevation-chart-wrapper');
    const tempDetails = document.getElementById('temp-details');
    const tempWrapper = document.getElementById('temp-chart-wrapper');
    if (!mapDetails || !elevDetails) return;

    let mapInitialized = false;
    let chartInitialized = false;
    let tempChartInitialized = false;
    let tempDataCache = null;

    mapDetails.addEventListener('toggle', () => {
      if (mapDetails.open) {
        mapContainer.style.display = 'block';
        if (!mapInitialized) {
          initRouteMap(trackPoints);
          mapInitialized = true;
        } else if (window.__routeMap) {
          setTimeout(() => window.__routeMap.invalidateSize(), 50);
        }
      } else {
        mapContainer.style.display = 'none';
      }
    });

    elevDetails.addEventListener('toggle', () => {
      if (elevDetails.open) {
        elevWrapper.style.display = 'block';
        if (!chartInitialized) {
          initElevationChart(trackPoints);
          chartInitialized = true;
        }
      } else {
        elevWrapper.style.display = 'none';
      }
    });

    if (tempDetails && tempWrapper) {
      tempDetails.addEventListener('toggle', async () => {
        if (tempDetails.open) {
          tempWrapper.style.display = 'block';
          if (!tempChartInitialized) {
            if (!tempDataCache) {
              if (window.__tempPreloadedData && window.__tempPreloadedData.length > 0) {
                tempDataCache = window.__tempPreloadedData;
              } else if (window.__tempPreloadedPromise) {
                tempWrapper.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Cargando datos climáticos...</p></div>';
                tempDataCache = await window.__tempPreloadedPromise;
              } else {
                tempDataCache = await loadTemperatureData(ruta_id);
              }
            }
            if (tempDataCache && tempDataCache.length > 0) {
              initTemperatureChart(trackPoints, tempDataCache);
            } else if (trackPoints && trackPoints.length > 0) {
              tempWrapper.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Consultando datos climáticos...</p></div>';
              try {
                const routeResult = {
                  track_points: trackPoints.map(p => ({
                    lat: p.lat,
                    lon: p.lon,
                    ele: p.ele || 0,
                    time: p.time || null
                  })),
                  fecha_inicio: rutaActualData.fecha_inicio,
                  fecha_fin: rutaActualData.fecha_fin,
                  kms: rutaActualData.kms
                };
                await fetchWeatherForRouteSilent(routeResult, ruta_id);
                tempDataCache = await loadTemperatureData(ruta_id);
                if (tempDataCache && tempDataCache.length > 0) {
                  tempWrapper.innerHTML = '<div style="height: 180px; padding: 5px; border: 1px solid #dee2e6; border-radius: 8px;"><canvas id="tempChart"></canvas></div>';
                  initTemperatureChart(trackPoints, tempDataCache);
                } else {
                  tempWrapper.innerHTML = '<div class="text-center text-muted p-3">No se pudieron obtener datos climáticos</div>';
                }
              } catch (e) {
                console.error('Error fetching weather retroactively:', e);
                tempWrapper.innerHTML = '<div class="text-center text-muted p-3">Error al consultar datos climáticos</div>';
              }
            } else {
              tempWrapper.innerHTML = '<div class="text-center text-muted p-3">No hay datos de temperatura disponibles</div>';
            }
            tempChartInitialized = true;
          }

          if (tempDataCache && tempDataCache.length > 0) {
            window.__tempPreloadedData = tempDataCache;
            const statsDiv = document.querySelector('.ruta-details-captura');
            if (statsDiv) {
              const tempRegex = /(🌡️ Temp\. máxima|🌡️ Temp\. mínima)/;
              if (!tempRegex.test(statsDiv.parentElement?.innerHTML || '')) {
                statsDiv.outerHTML = generarContenidoRuta(rutaActualData, false, tempDataCache, pulsacionesSummary);
              }
            }
          }
        } else {
          tempWrapper.style.display = 'none';
        }
      });
    }

    const pulsacionesDetails = document.getElementById('pulsaciones-details');
    const pulsacionesWrapper = document.getElementById('pulsaciones-chart-wrapper');
    if (pulsacionesDetails && pulsacionesWrapper) {
      let pulsacionesChartInitialized = false;
      let pulsacionesDataCache = null;

      pulsacionesDetails.addEventListener('toggle', async () => {
        if (pulsacionesDetails.open) {
          pulsacionesWrapper.style.display = 'block';
          if (!pulsacionesChartInitialized) {
            pulsacionesWrapper.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Cargando datos de pulsaciones...</p></div>';
            try {
              pulsacionesDataCache = await getPulsacionesByRuta(ruta_id);
              if (pulsacionesDataCache && pulsacionesDataCache.length > 0) {
                pulsacionesWrapper.innerHTML = '<div style="height: 180px; padding: 5px; border: 1px solid #dee2e6; border-radius: 8px;"><canvas id="pulsacionesChart"></canvas></div>';
                initPulsacionesChart(trackPoints, pulsacionesDataCache);
                const zonasWrapper = document.getElementById('zonas-fc-wrapper');
                if (zonasWrapper && zonasWrapper.children.length === 0) {
                  zonasWrapper.innerHTML = renderZonasFcRows(computeZonasFc(pulsacionesDataCache, rutaActualData ? rutaActualData.fecha_inicio : null));
                }
              } else {
                pulsacionesWrapper.innerHTML = '<div class="text-center text-muted p-3">No hay datos de pulsaciones disponibles</div>';
              }
            } catch (e) {
              console.error('Error loading pulsaciones:', e);
              pulsacionesWrapper.innerHTML = '<div class="text-center text-muted p-3">Error al cargar datos de pulsaciones</div>';
            }
            pulsacionesChartInitialized = true;
          }
        } else {
          pulsacionesWrapper.style.display = 'none';
        }
      });
    }

    const velocidadDetails = document.getElementById('velocidad-details');
    const velocidadWrapper = document.getElementById('velocidad-chart-wrapper');
    if (velocidadDetails && velocidadWrapper) {
      let velocidadChartInitialized = false;

      velocidadDetails.addEventListener('toggle', () => {
        if (velocidadDetails.open) {
          velocidadWrapper.style.display = 'block';
          if (!velocidadChartInitialized) {
            const hasSpeed = trackPoints.length >= 2;
            if (hasSpeed) {
              velocidadWrapper.innerHTML = '<div style="height: 180px; padding: 5px; border: 1px solid #dee2e6; border-radius: 8px;"><canvas id="velocidadChart"></canvas></div>';
              initVelocidadChart(trackPoints, rutaActualData.fecha_inicio, rutaActualData.fecha_fin);
            } else {
              velocidadWrapper.innerHTML = '<div class="text-center text-muted p-3">No hay datos de velocidad disponibles</div>';
            }
            velocidadChartInitialized = true;
          }
        } else {
          velocidadWrapper.style.display = 'none';
        }
      });
    }

    const potenciaDetails = document.getElementById('potencia-details');
    const potenciaWrapper = document.getElementById('potencia-chart-wrapper');
    if (potenciaDetails && potenciaWrapper) {
      let potenciaChartInitialized = false;

      potenciaDetails.addEventListener('toggle', () => {
        if (potenciaDetails.open) {
          potenciaWrapper.style.display = 'block';
          if (!potenciaChartInitialized) {
            const hasPower = trackPoints.length >= 2;
            if (hasPower) {
              potenciaWrapper.innerHTML = '<div style="height: 180px; padding: 5px; border: 1px solid #dee2e6; border-radius: 8px;"><canvas id="potenciaChart"></canvas></div>';
              initPotenciaChart(trackPoints, rutaActualData.fecha_inicio, rutaActualData.fecha_fin);
            } else {
              potenciaWrapper.innerHTML = '<div class="text-center text-muted p-3">No hay datos de potencia disponibles</div>';
            }
            potenciaChartInitialized = true;
          }
        } else {
          potenciaWrapper.style.display = 'none';
        }
      });
    }
  };

  Swal.fire({
    title: false,
    html: '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Cargando detalles...</p></div>',
    width: 800,
    padding: "0px",
    showCloseButton: true,
    showConfirmButton: false,
    showDenyButton: false,
    customClass: {
      popup: 'swal-ruta-detalle',
      closeButton: 'swal-close-top'
    }
  });

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getRutasById'),
      { data: { ruta_id } },
      {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal
      }
    );

    if (!response.data.success) {
      const htmlEl = Swal.getHtml();
      if (htmlEl) htmlEl.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar los detalles</div>';
      return;
    }

    rutaActualData = response.data.content[0];
    window.rutaActual = rutaActualData;

    pulsacionesSummary = null;
    if (rutaActualData.has_pulsaciones == 1) {
      try {
        pulsacionesSummary = await getPulsacionesSummaryByRuta(ruta_id);
      } catch (e) {
        console.warn('Error loading pulsaciones summary:', e);
      }
    }

    window.__zonasFcTemp = null;
    if (rutaActualData.has_pulsaciones == 1) {
      if (rutaActualData.zonas_fc) {
        try {
          const parsed = typeof rutaActualData.zonas_fc === 'string' ? JSON.parse(rutaActualData.zonas_fc) : rutaActualData.zonas_fc;
          if (Array.isArray(parsed) && parsed.length > 0) window.__zonasFcTemp = parsed;
        } catch (e) {}
      }
      if (!window.__zonasFcTemp) {
        try {
          const pul = await getPulsacionesByRuta(ruta_id);
          if (Array.isArray(pul) && pul.length > 0) window.__zonasFcTemp = computeZonasFc(pul, rutaActualData ? rutaActualData.fecha_inicio : null);
        } catch (e) {
          console.warn('Error calculando zonas FC desde pulsaciones:', e);
        }
      }
    }

    if (rutaActualData.gpx_data && rutaActualData.gpx_data !== 'null' && rutaActualData.gpx_data !== '[]') {
      try {
        trackPoints = JSON.parse(rutaActualData.gpx_data);
        hasMapData = trackPoints.length > 2;
      } catch (e) {}
    }

    Swal.update({
      html: buildFullHtml(pulsacionesSummary),
      showConfirmButton: false,
      showDenyButton: false
    });

    setupLazyListeners();

    if (hasMapData) {
      const popup = Swal.getPopup();
      if (popup) {
        popup.style.position = 'relative';
        const waBtn = document.createElement('button');
        waBtn.id = 'wa-share-btn';
        waBtn.className = 'swal-wa-top';
        waBtn.innerHTML = '<i class="fab fa-whatsapp"></i>';
        waBtn.title = 'Compartir por WhatsApp';
        waBtn.onclick = async (e) => {
          e.preventDefault();
          await compartirRutaWhatsApp();
        };
        popup.insertBefore(waBtn, popup.firstChild);
      }

      window.__tempPreloadedData = null;
      window.__tempPreloadedPromise = loadTemperatureData(ruta_id).then(existing => {
        if (existing && existing.length > 0) {
          window.__tempPreloadedData = existing;
          actualizarStatsConTemperatura(rutaActualData, existing, pulsacionesSummary);
          return existing;
        }
        const routeResult = {
          track_points: trackPoints.map(p => ({
            lat: p.lat, lon: p.lon, ele: p.ele || 0, time: p.time || null
          })),
          fecha_inicio: rutaActualData.fecha_inicio,
          fecha_fin: rutaActualData.fecha_fin,
          kms: rutaActualData.kms
        };
        return fetchWeatherForRouteSilent(routeResult, ruta_id).then(downloaded => {
          if (downloaded && downloaded.length > 0) {
            window.__tempPreloadedData = downloaded;
            actualizarStatsConTemperatura(rutaActualData, downloaded, pulsacionesSummary);
            return downloaded;
          }
          return loadTemperatureData(ruta_id);
        });
      }).then(data => {
        if (data && data.length > 0 && !window.__tempPreloadedData) {
          window.__tempPreloadedData = data;
          actualizarStatsConTemperatura(rutaActualData, data, pulsacionesSummary);
        }
      }).catch(e => {
        console.warn('Preload temperature failed:', e);
        return [];
      });
    }

  } catch (err) {
    if (axios.isCancel(err)) return;
    const htmlEl = Swal.getHtml();
    if (htmlEl) htmlEl.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar los detalles</div>';
  }
};

function computeCumulativeDistances(points) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
    distances.push(distances[i-1] + d);
  }
  return distances;
}

function initRouteMap(trackPoints) {
  const container = document.getElementById('map-container');
  if (!container) return;

  const map = L.map(container, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const simplified = downsamplePoints(trackPoints, 2000);
  const latlngs = simplified.map(p => [p.lat, p.lon]);
  const polyline = L.polyline(latlngs, {
    color: '#6A0DAD',
    weight: 4,
    opacity: 0.85
  }).addTo(map);

  map.fitBounds(polyline.getBounds(), { padding: [5, 5], maxZoom: 19 });

  const startLatLng = latlngs[0];
  const endLatLng = latlngs[latlngs.length - 1];
  const distSE = haversine(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1]);
  const startAnchor = distSE < 150 ? [3, 13] : [13, 13];
  const endAnchor = distSE < 150 ? [23, 13] : [13, 13];
  L.marker(startLatLng, {
    icon: L.divIcon({
      className: 'marker-waypoint',
      html: '<div class="marker-waypoint-inner" style="background:linear-gradient(135deg,#333,#000)"><i class="fas fa-door-open" style="font-size:12px;color:#fff"></i></div>',
      iconSize: [26, 26],
      iconAnchor: startAnchor
    })
  }).addTo(map).bindPopup('Salida (0 km)');
  L.marker(endLatLng, {
    icon: L.divIcon({
      className: 'marker-waypoint',
      html: '<div class="marker-waypoint-inner" style="background:linear-gradient(135deg,#4CAF50,#388E3C)"><i class="fas fa-flag-checkered" style="font-size:12px;color:#fff"></i></div>',
      iconSize: [26, 26],
      iconAnchor: endAnchor
    })
  }).addTo(map).bindPopup('Llegada');

  const fullDistances = computeCumulativeDistances(trackPoints);

  let maxEle = -Infinity;
  let maxIdx = 0;
  for (let i = 0; i < trackPoints.length; i++) {
    const ele = trackPoints[i].ele;
    if (ele != null && ele > maxEle) {
      maxEle = ele;
      maxIdx = i;
    }
  }
  if (maxIdx > 0 && maxIdx < trackPoints.length - 1) {
    const maxPt = trackPoints[maxIdx];
    const km = (fullDistances[maxIdx] / 1000).toFixed(2);
    L.marker([maxPt.lat, maxPt.lon], {
      icon: L.divIcon({
        className: 'marker-maxalt',
        html: '<div class="marker-maxalt-inner"><i class="fas fa-mountain" style="font-size:12px;color:#fff"></i></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      })
    }).addTo(map).bindPopup(`<b>🏔️ Altura máxima</b><br>${maxEle} m (km ${km})`);
  }

  let hasDirectSpeed = trackPoints.some(p => p.speed != null && p.speed > 0);
  let speedAtIndex = [];
  if (hasDirectSpeed) {
    speedAtIndex = trackPoints.map(p => p.speed || 0);
  } else {
    speedAtIndex = new Array(trackPoints.length).fill(0);
    for (let i = 1; i < trackPoints.length; i++) {
      const prev = trackPoints[i - 1];
      const curr = trackPoints[i];
      const dt = (curr.time ? new Date(curr.time) - (prev.time ? new Date(prev.time) : 0) : 0) / 1000;
      if (dt <= 0) continue;
      const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
      speedAtIndex[i] = (dist / dt) * 3.6;
    }
  }
  let maxSpeed = -Infinity;
  let maxSpeedIdx = 0;
  for (let i = 0; i < speedAtIndex.length; i++) {
    if (speedAtIndex[i] > maxSpeed) {
      maxSpeed = speedAtIndex[i];
      maxSpeedIdx = i;
    }
  }
  if (maxSpeedIdx > 0 && maxSpeedIdx < trackPoints.length - 1) {
    const maxPt = trackPoints[maxSpeedIdx];
    const km = (fullDistances[maxSpeedIdx] / 1000).toFixed(2);
    L.marker([maxPt.lat, maxPt.lon], {
      icon: L.divIcon({
        className: 'marker-maxspeed',
        html: '<div class="marker-maxspeed-inner"><i class="fas fa-gauge-high" style="font-size:12px;color:#fff"></i></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      })
    }).addTo(map).bindPopup(`<b>🚀 Velocidad máxima</b><br>${maxSpeed} km/h (km ${km})`);
  }
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const interval = 5;
  const halfwayKm = new Array(Math.floor(totalKm / interval)).fill(0).map((_, i) => (i + 1) * interval);

  halfwayKm.forEach(targetKm => {
    const targetM = targetKm * 1000;
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < fullDistances.length; i++) {
      const diff = Math.abs(fullDistances[i] - targetM);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const pt = trackPoints[bestIdx];
    if (bestIdx === 0 || bestIdx === trackPoints.length - 1) return;
    L.marker([pt.lat, pt.lon], {
      icon: L.divIcon({
        className: 'km-marker',
        html: `<div class="km-marker-inner">${targetKm}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    }).addTo(map).bindPopup(`${pt.ele} m`);
  });

  window.__routeMap = map;
  setTimeout(() => map.invalidateSize(), 100);
}

function downsamplePoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const result = [];
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

function initElevationChart(trackPoints, canvasEl, titleText = null, shareDpr = null) {
  const canvas = canvasEl || document.getElementById('elevationChart');
  if (!canvas) return;

  const sampled = downsamplePoints(trackPoints, 500);
  const fullDistances = computeCumulativeDistances(trackPoints);
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;

  let ascAcumFull = 0, descAcumFull = 0;
  const fullAsc = [0];
  const fullDesc = [0];
  for (let i = 1; i < trackPoints.length; i++) {
    const diff = (trackPoints[i].ele || 0) - (trackPoints[i - 1].ele || 0);
    if (diff > 0) ascAcumFull += diff;
    else descAcumFull += Math.abs(diff);
    fullAsc.push(Math.round(ascAcumFull));
    fullDesc.push(Math.round(descAcumFull));
  }

  const chartData = sampled.map(pt => {
    const idx = trackPoints.indexOf(pt);
    const x = parseFloat((fullDistances[idx] / 1000).toFixed(2));
    return { x, y: pt.ele };
  });
  const ascData = sampled.map(pt => {
    const idx = trackPoints.indexOf(pt);
    const x = parseFloat((fullDistances[idx] / 1000).toFixed(2));
    return { x, y: fullAsc[idx] };
  });
  const descData = sampled.map(pt => {
    const idx = trackPoints.indexOf(pt);
    const x = parseFloat((fullDistances[idx] / 1000).toFixed(2));
    return { x, y: fullDesc[idx] };
  });
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(13, 71, 161, 0.3)');
  gradient.addColorStop(1, 'rgba(13, 71, 161, 0.02)');

  const maxVal = Math.max(...chartData.map(d => d.y));
  const maxPoint = chartData.find(d => d.y === maxVal);

  const ascEnd = ascData[ascData.length - 1];
  const descEnd = descData[descData.length - 1];

  const xMax = Math.ceil(totalKm);

  function drawLabelWithBg(c, text, x, y, color, align) {
    c.save();
    c.font = 'bold 11px Arial';
    c.textAlign = align || 'left';
    const m = c.measureText(text);
    const pad = 4;
    const bw = m.width + pad * 2;
    const bh = 14;
    let bx;
    if (align === 'right') bx = x - bw;
    else if (align === 'center') bx = x - bw / 2;
    else bx = x;
    c.fillStyle = '#fff';
    c.fillRect(bx, y - bh + 3, bw, bh);
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }

  const elevationPlugin = {
    id: 'elevationMaxMarker',
    afterDraw(chart) {
      const c = chart.ctx;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const chartArea = chart.chartArea;

      if (!maxPoint) return;

      const xPx = xScale.getPixelForValue(maxPoint.x);
      const yPx = yScale.getPixelForValue(maxPoint.y);

      c.save();
       c.beginPath();
       c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
       c.fillStyle = darkenColor('#9C27B0');
       c.fill();
       c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();

      const altAlign = xPx + 55 > chart.width ? 'right' : 'left';
      const altX = xPx + (xPx + 55 > chart.width ? -8 : 8);
      drawLabelWithBg(c, `${Math.round(maxVal)} m`, altX, yPx - 2, '#9C27B0', altAlign);

      if (ascEnd && descEnd) {
        const labelY = chart.height - 8;
        const leftX = chartArea.left + 4;
        const rightX = chartArea.right - 4;
        drawLabelWithBg(c, `↑${ascEnd.y} m`, leftX, labelY, '#2E7D32', 'left');
        drawLabelWithBg(c, `↓${descEnd.y} m`, rightX, labelY, '#E65100', 'right');
      }
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Elevación (m)',
          data: chartData,
          borderColor: '#6A0DAD',
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...(shareDpr ? { devicePixelRatio: shareDpr } : {}),
      animation: { duration: 500 },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        title: titleText ? { display: true, text: titleText, align: 'start', font: { size: 13, weight: 'bold' } } : { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              return `${ctx.dataset.label}: ${ctx.parsed.y} m`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: xMax,
          title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
          ticks: { stepSize: tickStep, font: { size: 10 }, callback: (v) => Math.abs(v % tickStep) < 0.01 ? v : '' },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: 'Elevación (m)', font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
    },
    plugins: [elevationPlugin]
  });
}

async function compartirRutaWhatsApp() {
  const ruta = window.rutaActual;
  const trackPoints = window.__rutaTrackPoints;
  if (!ruta || !trackPoints || trackPoints.length < 2) return;

  Swal.showLoading();

  let tempData = window.__tempPreloadedData || null;
  if (!tempData && window.__tempPreloadedPromise) {
    try {
      tempData = await Promise.race([
        window.__tempPreloadedPromise,
        new Promise(r => setTimeout(() => r(null), 60000))
      ]);
    } catch (e) {}
  }
  if ((!tempData || tempData.length === 0) && ruta.id) {
    try {
      tempData = await loadTemperatureData(ruta.id);
    } catch (e) {}
  }

  let pulsacionesData = null;
  let pulsacionesSummary = null;
  if (ruta.has_pulsaciones) {
    try {
      pulsacionesData = await getPulsacionesByRuta(ruta.id);
      pulsacionesSummary = await getPulsacionesSummaryByRuta(ruta.id);
    } catch (e) {}
  }

  try {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:800px;z-index:-1;background:#fff;';
    document.body.appendChild(container);

    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'text-align:center;padding:14px 10px 6px;font-size:17px;font-weight:700;color:#333;font-family:Arial,sans-serif;';
    const kms = ruta.kms ? parseFloat(ruta.kms).toFixed(2) : '0';
    const fechaHora = ruta.fecha_inicio ? formatFechaTimeISO(ruta.fecha_inicio) : '';
    titleBar.textContent = fechaHora ? `⛰️ ${fechaHora} — ${kms} km` : `⛰️ ${kms} km`;
    container.appendChild(titleBar);

    const sep = document.createElement('hr');
    sep.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
    container.appendChild(sep);

    const elevDiv = document.createElement('div');
    elevDiv.style.cssText = 'width:800px;height:220px;padding:8px;';
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 220;
    canvas.style.cssText = 'width:100%;height:100%;';
    elevDiv.appendChild(canvas);
    container.appendChild(elevDiv);
    initElevationChart(trackPoints, canvas, '📈 Perfil de elevación', 4);

    const sep2 = document.createElement('hr');
    sep2.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
    container.appendChild(sep2);

    let pulsacionesChartDiv = null;
    let pulsacionesCanvas = null;
    if (pulsacionesData && pulsacionesData.length > 0) {
      pulsacionesChartDiv = document.createElement('div');
      pulsacionesChartDiv.style.cssText = 'width:800px;height:180px;padding:8px;';
      pulsacionesCanvas = document.createElement('canvas');
      pulsacionesCanvas.width = 800;
      pulsacionesCanvas.height = 180;
      pulsacionesCanvas.style.cssText = 'width:100%;height:100%;';
      pulsacionesChartDiv.appendChild(pulsacionesCanvas);
      container.appendChild(pulsacionesChartDiv);

      const sepPuls = document.createElement('hr');
      sepPuls.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
      container.appendChild(sepPuls);
    }

    const zonasFcRuta = obtenerZonasFc(ruta, pulsacionesData);
    if (zonasFcRuta && zonasFcRuta.length) {
      const zDiv = document.createElement('div');
      zDiv.style.cssText = 'font-family:Arial,sans-serif;';
      zDiv.innerHTML = renderZonasFcShareHtml(zonasFcRuta);
      container.appendChild(zDiv);
      const zSep = document.createElement('hr');
      zSep.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
      container.appendChild(zSep);
    }

    let velocidadChartDiv = null;
    let velocidadCanvas = null;
    const hasSpeed = trackPoints.length >= 2;
    if (hasSpeed) {
      velocidadChartDiv = document.createElement('div');
      velocidadChartDiv.style.cssText = 'width:800px;height:180px;padding:8px;';
      velocidadCanvas = document.createElement('canvas');
      velocidadCanvas.width = 800;
      velocidadCanvas.height = 180;
      velocidadCanvas.style.cssText = 'width:100%;height:100%;';
      velocidadChartDiv.appendChild(velocidadCanvas);
      container.appendChild(velocidadChartDiv);

      const sepVel = document.createElement('hr');
      sepVel.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
      container.appendChild(sepVel);
    }

    let potenciaChartDiv = null;
    let potenciaCanvas = null;
    const hasPower = trackPoints.length >= 2;
    if (hasPower) {
      potenciaChartDiv = document.createElement('div');
      potenciaChartDiv.style.cssText = 'width:800px;height:180px;padding:8px;';
      potenciaCanvas = document.createElement('canvas');
      potenciaCanvas.width = 800;
      potenciaCanvas.height = 180;
      potenciaCanvas.style.cssText = 'width:100%;height:100%;';
      potenciaChartDiv.appendChild(potenciaCanvas);
      container.appendChild(potenciaChartDiv);

      const sepPwr = document.createElement('hr');
      sepPwr.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
      container.appendChild(sepPwr);
    }

    let tempChartDiv = null;
    let tempCanvas = null;
    if (tempData && tempData.length > 0) {
      tempChartDiv = document.createElement('div');
      tempChartDiv.style.cssText = 'width:800px;height:180px;padding:8px;';
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = 800;
      tempCanvas.height = 180;
      tempCanvas.style.cssText = 'width:100%;height:100%;';
      tempChartDiv.appendChild(tempCanvas);
      container.appendChild(tempChartDiv);

      const sepTemp = document.createElement('hr');
      sepTemp.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
      container.appendChild(sepTemp);
    }

    const hasElevChart = ruta.gpx_data && ruta.gpx_data !== 'null' && ruta.gpx_data !== '[]';
    const fieldsShare = [
      { label: "📆 Inicio", value: formatFechaTimeISO(ruta.fecha_inicio) },
      { label: "📆 Fin", value: formatFechaTimeISO(ruta.fecha_fin) },
      { label: "🕑 Tiempo total", value: ruta.tiempo_total },
      { label: "⌚ Tiempo en movimiento", value: ruta.tiempo_movimiento },
      { label: "📏 Distancia", value: `${ruta.kms} km` },
      ...(hasElevChart ? [] : [
        { label: "⏫ Ascenso", value: `${ruta.metros_ascenso} m` },
        { label: "⏬ Descenso", value: `${ruta.metros_descenso} m` },
      ]),
      ...(hasElevChart ? [] : [{ label: "⛰️ Altitud máxima", value: `${ruta.altitud_maxima} m` }]),
      { label: `⬆️ Subida (${ruta.tiempo_subida || "00:00:00"})`, value: `${ruta.pct_subida}%` },
      { label: `➡️ Plano (${ruta.tiempo_plano || "00:00:00"})`, value: `${ruta.pct_plano}%` },
    ];

    fieldsShare.push({
      label: `⬇️ Bajada (${ruta.tiempo_bajada || "00:00:00"})`,
      value: `${ruta.pct_bajada}%`
    });

    fieldsShare.push({ label: "💥 Calorías", value: `${ruta.calorias} kcal` });

    if (!tempData || tempData.length === 0) {
      const tempsArr = tempData
        ? tempData.filter(d => d.temperatura !== null && d.temperatura !== undefined).map(d => d.temperatura)
        : [];
      if (tempsArr.length > 0) {
        const tempMaxSh = Math.max(...tempsArr);
        const tempMinSh = Math.min(...tempsArr);
        fieldsShare.push({ label: "🌡️ Temp. mínima", value: `${tempMinSh.toFixed(1)}°C` });
        fieldsShare.push({ label: "🌡️ Temp. máxima", value: `${tempMaxSh.toFixed(1)}°C` });
      }
    }

    const shareStatsHtml = `
      <div class="ruta-details-captura">
        ${fieldsShare.map(f => `
          <div class="detail-row-captura">
            <strong class="label-captura">${f.label}:</strong>
            <span class="value-captura">${f.value}</span>
          </div>
        `).join("")}
      </div>
      <style>
        .ruta-details-captura {
          display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;max-height:none;overflow:visible;border:none;padding:0;
        }
        .detail-row-captura {
          display:flex;flex-direction:column;gap:1px;justify-content:flex-start;border-bottom:none;padding:6px;background:#f4f6f8;border-radius:6px;
        }
        .label-captura { font-size:10px;color:#666; }
        .value-captura { font-size:13px;font-weight:700; }
      </style>`;

    const statsDiv = document.createElement('div');
    statsDiv.id = 'share-stats';
    statsDiv.style.cssText = 'padding:10px;font-family:Arial,sans-serif;';
    statsDiv.innerHTML = shareStatsHtml;
    container.appendChild(statsDiv);

    const sampled = downsamplePoints(trackPoints, 500);
    const fullDistances = computeCumulativeDistances(trackPoints);
    const totalKm = fullDistances[fullDistances.length - 1] / 1000;
    const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;

    if (pulsacionesCanvas && pulsacionesData) {
      const hrChartData = pulsacionesData
        .filter(d => d.pulsaciones !== null && d.pulsaciones !== undefined)
        .map(d => ({ x: parseFloat(d.kilometro), y: parseInt(d.pulsaciones) }));

      if (hrChartData.length > 0) {
        const hrMaxVal = Math.max(...hrChartData.map(d => d.y));
        const hrMinVal = Math.min(...hrChartData.map(d => d.y));
        const hrAvgVal = hrChartData.reduce((s, d) => s + d.y, 0) / hrChartData.length;
        const hrMaxPoint = hrChartData.find(d => d.y === hrMaxVal);
        const hrMinPoint = hrChartData.find(d => d.y === hrMinVal);

        const hrGradient = pulsacionesCanvas.getContext('2d').createLinearGradient(0, 0, 0, 180);
        hrGradient.addColorStop(0, 'rgba(220, 20, 60, 0.25)');
        hrGradient.addColorStop(1, 'rgba(220, 20, 60, 0.02)');

        const shareHrPlugin = {
          id: 'shareHrMarkers',
          afterDatasetsDraw(chart) {
            const c = chart.ctx;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const chartW = chart.width;

            if (hrMaxPoint) {
              const xPx = xScale.getPixelForValue(hrMaxPoint.x);
              const yPx = yScale.getPixelForValue(hrMaxPoint.y);
              c.save();
              c.beginPath();
              c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
              c.fillStyle = darkenColor('#DC143C');
              c.fill();
              c.strokeStyle = '#fff';
              c.lineWidth = 1.5;
              c.stroke();
              c.restore();

              c.save();
              c.font = 'bold 11px Arial';
              c.fillStyle = '#DC143C';
              c.textAlign = xPx + 60 > chartW ? 'right' : 'left';
              c.fillText(`${hrMaxVal} bpm`, xPx + (xPx + 60 > chartW ? -8 : 8), yPx + 4);
              c.restore();
            }

            if (hrMinPoint) {
              const xPx = xScale.getPixelForValue(hrMinPoint.x);
              const yPx = yScale.getPixelForValue(hrMinPoint.y);
              c.save();
              c.beginPath();
              c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
              c.fillStyle = darkenColor('#5B9BD5');
              c.fill();
              c.strokeStyle = '#fff';
              c.lineWidth = 1.5;
              c.stroke();
              c.restore();

              c.save();
              c.font = 'bold 11px Arial';
              c.fillStyle = '#5B9BD5';
              c.textAlign = xPx + 60 > chartW ? 'right' : 'left';
              c.fillText(`${hrMinVal} bpm`, xPx + (xPx + 60 > chartW ? -8 : 8), yPx + 4);
              c.restore();
            }

            const avgPx = yScale.getPixelForValue(hrAvgVal);
            c.save();
            c.setLineDash([6, 4]);
            c.strokeStyle = 'rgba(255, 107, 107, 0.8)';
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(0, avgPx);
            c.lineTo(chartW, avgPx);
            c.stroke();
            c.setLineDash([]);
            c.restore();

            const chartArea = chart.chartArea;
            if (chartArea) {
              const labelY = chart.height - 8;
              const rightX = chartArea.right - 4;
              const pad = 4;
              const avgLabel = `∅ ${Math.round(hrAvgVal)} bpm`;
              c.save();
              c.font = 'bold 11px Arial';
              const avgW = c.measureText(avgLabel).width;
              c.fillStyle = 'rgba(255,255,255,0.9)';
              c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
              c.fillStyle = '#FF6B6B';
              c.textAlign = 'right';
              c.fillText(avgLabel, rightX, labelY + 4);
              c.restore();
            }
          }
        };

        new Chart(pulsacionesCanvas, {
          type: 'line',
          data: {
            datasets: [{
              label: 'Pulsaciones (bpm)',
              data: hrChartData,
              borderColor: '#DC143C',
              backgroundColor: hrGradient,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
              spanGaps: false,
              yAxisID: 'y'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: 4,
            animation: { duration: 0 },
            plugins: { legend: { display: false }, title: { display: true, text: '❤️ Pulsaciones (bpm)', align: 'start', font: { size: 13, weight: 'bold' } } },
            scales: {
              x: {
                type: 'linear', min: 0, max: Math.ceil(totalKm),
                title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
                ticks: { stepSize: tickStep, font: { size: 10 }, callback: v => Math.abs(v % tickStep) < 0.01 ? v : '' },
                grid: { display: false }
              },
              y: {
                title: { display: true, text: 'Pulsaciones (bpm)', font: { size: 11 } },
                ticks: { font: { size: 10 } },
                grid: { color: 'rgba(0,0,0,0.06)' }
              }
            }
          },
          plugins: [shareHrPlugin]
        });
      }
    }

    if (velocidadCanvas && hasSpeed) {
      const fullDistances = computeCumulativeDistances(trackPoints);
      const totalKm = fullDistances[fullDistances.length - 1] / 1000;
      const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;

      const spdPoints = getTrackSpeeds(trackPoints);
      const spdChartData = spdPoints.map(d => ({
        x: fullDistances[d.index] / 1000,
        y: d.speed
      }));

      if (spdChartData.length > 0) {
        const spdMaxVal = Math.max(...spdChartData.map(d => d.y));
        const spdMaxPoint = spdChartData.find(d => d.y === spdMaxVal);
        const spdAvgVal = spdChartData.reduce((s, d) => s + d.y, 0) / spdChartData.length;

        const spdGradient = velocidadCanvas.getContext('2d').createLinearGradient(0, 0, 0, 180);
        spdGradient.addColorStop(0, 'rgba(76, 175, 80, 0.25)');
        spdGradient.addColorStop(1, 'rgba(76, 175, 80, 0.02)');

        const shareSpdPlugin = {
          id: 'shareSpeedMarkers',
          afterDatasetsDraw(chart) {
            const c = chart.ctx;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const chartW = chart.width;

            if (spdMaxPoint) {
              const xPx = xScale.getPixelForValue(spdMaxPoint.x);
              const yPx = yScale.getPixelForValue(spdMaxPoint.y);
              c.save();
              c.beginPath();
              c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
              c.fillStyle = darkenColor('#4CAF50');
              c.fill();
              c.strokeStyle = '#fff';
              c.lineWidth = 1.5;
              c.stroke();
              c.restore();
            }

            const avgPx = yScale.getPixelForValue(spdAvgVal);
            c.save();
            c.setLineDash([6, 4]);
            c.strokeStyle = 'rgba(255, 107, 107, 0.8)';
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(0, avgPx);
            c.lineTo(chartW, avgPx);
            c.stroke();
            c.setLineDash([]);
            c.restore();

            const chartArea = chart.chartArea;
            if (chartArea) {
              const labelY = chart.height - 8;
              const leftX = chartArea.left + 4;
              const rightX = chartArea.right - 4;
              c.save();
              const maxLabel = `↗ ${spdMaxVal.toFixed(1)} km/h`;
              c.font = 'bold 11px Arial';
              const maxW = c.measureText(maxLabel).width;
              const pad = 4;
              c.fillStyle = 'rgba(255,255,255,0.9)';
              c.fillRect(leftX - pad, labelY - 10 + pad, maxW + pad * 2, 14);
              c.fillStyle = '#4CAF50';
              c.textAlign = 'left';
              c.fillText(maxLabel, leftX, labelY + 4);
              c.restore();

              c.save();
              const avgLabel = `∅ ${spdAvgVal.toFixed(1)} km/h`;
              c.font = 'bold 11px Arial';
              const avgW = c.measureText(avgLabel).width;
              c.fillStyle = 'rgba(255,255,255,0.9)';
              c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
              c.fillStyle = '#FF6B6B';
              c.textAlign = 'right';
              c.fillText(avgLabel, rightX, labelY + 4);
              c.restore();
            }
          }
        };

        new Chart(velocidadCanvas, {
          type: 'line',
          data: {
            datasets: [{
              label: 'Velocidad (km/h)',
              data: spdChartData,
              borderColor: '#4CAF50',
              backgroundColor: spdGradient,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
              spanGaps: false,
              yAxisID: 'y'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: 4,
            animation: { duration: 0 },
            plugins: { legend: { display: false }, title: { display: true, text: '🚀 Velocidad (km/h)', align: 'start', font: { size: 13, weight: 'bold' } } },
            scales: {
              x: {
                type: 'linear', min: 0, max: Math.ceil(totalKm),
                title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
                ticks: { stepSize: tickStep, font: { size: 10 }, callback: v => Math.abs(v % tickStep) < 0.01 ? v : '' },
                grid: { display: false }
              },
              y: {
                title: { display: true, text: 'Velocidad (km/h)', font: { size: 11 } },
                ticks: { font: { size: 10 } },
                grid: { color: 'rgba(0,0,0,0.06)' }
              }
            }
          },
          plugins: [shareSpdPlugin]
        });
      }
    }

    if (potenciaCanvas && hasPower) {
      const fullDistances = computeCumulativeDistances(trackPoints);
      const totalKm = fullDistances[fullDistances.length - 1] / 1000;
      const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;

      const pwrPoints = getTrackPower(trackPoints);
      const pwrChartData = pwrPoints.map(d => ({
        x: fullDistances[d.index] / 1000,
        y: d.power
      }));

      if (pwrChartData.length > 0) {
        const pwrMaxVal = Math.max(...pwrChartData.map(d => d.y));
        const pwrMaxPoint = pwrChartData.find(d => d.y === pwrMaxVal);
        const pwrAvgVal = pwrChartData.reduce((s, d) => s + d.y, 0) / pwrChartData.length;

        const pwrGradient = potenciaCanvas.getContext('2d').createLinearGradient(0, 0, 0, 180);
        pwrGradient.addColorStop(0, 'rgba(0, 188, 212, 0.25)');
        pwrGradient.addColorStop(1, 'rgba(0, 188, 212, 0.02)');

        const sharePwrPlugin = {
          id: 'sharePowerMarkers',
          afterDatasetsDraw(chart) {
            const c = chart.ctx;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const chartW = chart.width;

            if (pwrMaxPoint) {
              const xPx = xScale.getPixelForValue(pwrMaxPoint.x);
              const yPx = yScale.getPixelForValue(pwrMaxPoint.y);
              c.save();
              c.beginPath();
              c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
              c.fillStyle = darkenColor('#00BCD4');
              c.fill();
              c.strokeStyle = '#fff';
              c.lineWidth = 1.5;
              c.stroke();
              c.restore();
            }

            const avgPx = yScale.getPixelForValue(pwrAvgVal);
            c.save();
            c.setLineDash([6, 4]);
            c.strokeStyle = 'rgba(255, 107, 107, 0.8)';
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(0, avgPx);
            c.lineTo(chartW, avgPx);
            c.stroke();
            c.setLineDash([]);
            c.restore();

            const chartArea = chart.chartArea;
            if (chartArea) {
              const labelY = chart.height - 8;
              const leftX = chartArea.left + 4;
              const rightX = chartArea.right - 4;
              c.save();
              const maxLabel = `↗ ${pwrMaxVal} W`;
              c.font = 'bold 11px Arial';
              const maxW = c.measureText(maxLabel).width;
              const pad = 4;
              c.fillStyle = 'rgba(255,255,255,0.9)';
              c.fillRect(leftX - pad, labelY - 10 + pad, maxW + pad * 2, 14);
              c.fillStyle = '#00BCD4';
              c.textAlign = 'left';
              c.fillText(maxLabel, leftX, labelY + 4);
              c.restore();

              c.save();
              const avgLabel = `∅ ${Math.round(pwrAvgVal)} W`;
              c.font = 'bold 11px Arial';
              const avgW = c.measureText(avgLabel).width;
              c.fillStyle = 'rgba(255,255,255,0.9)';
              c.fillRect(rightX - avgW - pad, labelY - 10 + pad, avgW + pad * 2, 14);
              c.fillStyle = '#FF6B6B';
              c.textAlign = 'right';
              c.fillText(avgLabel, rightX, labelY + 4);
              c.restore();
            }
          }
        };

        new Chart(potenciaCanvas, {
          type: 'line',
          data: {
            datasets: [{
              label: 'Potencia (W)',
              data: pwrChartData,
              borderColor: '#00BCD4',
              backgroundColor: pwrGradient,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
              spanGaps: false,
              yAxisID: 'y'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: 4,
            animation: { duration: 0 },
            plugins: { legend: { display: false }, title: { display: true, text: '⚡ Potencia (W)', align: 'start', font: { size: 13, weight: 'bold' } } },
            scales: {
              x: {
                type: 'linear', min: 0, max: Math.ceil(totalKm),
                title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
                ticks: { stepSize: tickStep, font: { size: 10 }, callback: v => Math.abs(v % tickStep) < 0.01 ? v : '' },
                grid: { display: false }
              },
              y: {
                title: { display: true, text: 'Potencia (W)', font: { size: 11 } },
                ticks: { font: { size: 10 } },
                grid: { color: 'rgba(0,0,0,0.06)' }
              }
            }
          },
          plugins: [sharePwrPlugin]
        });
      }
    }

    if (tempCanvas && tempData) {
      const tempChartData = tempData.map(d => ({
        x: parseFloat(d.kilometro),
        y: d.temperatura !== null && d.temperatura !== undefined ? parseFloat(d.temperatura) : null
      })).filter(d => d.y !== null);

      const lluviaData = tempData
        .filter(d => d.lluvia == 1 && d.temperatura !== null && d.temperatura !== undefined)
        .map(d => ({ x: parseFloat(d.kilometro), y: parseFloat(d.temperatura) }));

      const temps = tempChartData.filter(d => d.y !== null);
      let maxPoint = null;
      let minPoint = null;
      if (temps.length > 0) {
        const maxVal = Math.max(...temps.map(d => d.y));
        const minVal = Math.min(...temps.map(d => d.y));
        maxPoint = temps.find(d => d.y === maxVal);
        minPoint = temps.find(d => d.y === minVal);
      }

      const tempGradient = tempCanvas.getContext('2d').createLinearGradient(0, 0, 0, 180);
      tempGradient.addColorStop(0, 'rgba(255, 107, 53, 0.3)');
      tempGradient.addColorStop(1, 'rgba(255, 107, 53, 0.02)');

      const shareTempPlugin = {
        id: 'shareTempMarkers',
        afterDatasetsDraw(chart) {
          const c = chart.ctx;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          const yBottom = yScale.getPixelForValue(yScale.min);

          lluviaData.forEach(pt => {
            const xPx = xScale.getPixelForValue(pt.x);
            const yPx = yScale.getPixelForValue(pt.y);
            c.save();
            c.beginPath();
            c.setLineDash([4, 4]);
            c.strokeStyle = 'rgba(33, 150, 243, 0.7)';
            c.lineWidth = 1.5;
            c.moveTo(xPx, yBottom);
            c.lineTo(xPx, yPx);
            c.stroke();
            c.restore();
          });

          if (maxPoint) {
            const xPx = xScale.getPixelForValue(maxPoint.x);
            const yPx = yScale.getPixelForValue(maxPoint.y);
            c.save();
            c.beginPath();
            c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
            c.fillStyle = darkenColor('#DC143C');
            c.fill();
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5;
            c.stroke();
            c.restore();

            const align = xPx + 55 > chart.width ? 'right' : 'left';
            const xOff = xPx + (xPx + 55 > chart.width ? -8 : 8);
            const m = c.measureText(`${maxPoint.y.toFixed(1)}°C`);
            const pad = 4;
            const bw = m.width + pad * 2;
            const bh = 14;
            let bx;
            if (align === 'right') bx = xOff - bw;
            else bx = xOff;
            c.save();
            c.fillStyle = '#fff';
            c.fillRect(bx, yPx + 4 - bh + 3, bw, bh);
            c.font = 'bold 11px Arial';
            c.fillStyle = '#DC143C';
            c.textAlign = align;
            c.fillText(`${maxPoint.y.toFixed(1)}°C`, xOff, yPx + 4);
            c.restore();
          }

          if (minPoint) {
            const xPx = xScale.getPixelForValue(minPoint.x);
            const yPx = yScale.getPixelForValue(minPoint.y);
            c.save();
            c.beginPath();
            c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
            c.fillStyle = darkenColor('#5B9BD5');
            c.fill();
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5;
            c.stroke();
            c.restore();

            const align = xPx + 55 > chart.width ? 'right' : 'left';
            const xOff = xPx + (xPx + 55 > chart.width ? -8 : 8);
            const m = c.measureText(`${minPoint.y.toFixed(1)}°C`);
            const pad = 4;
            const bw = m.width + pad * 2;
            const bh = 14;
            let bx;
            if (align === 'right') bx = xOff - bw;
            else bx = xOff;
            c.save();
            c.fillStyle = '#fff';
            c.fillRect(bx, yPx + 10 - bh + 3, bw, bh);
            c.font = 'bold 11px Arial';
            c.fillStyle = '#5B9BD5';
            c.textAlign = align;
            c.fillText(`${minPoint.y.toFixed(1)}°C`, xOff, yPx + 10);
            c.restore();
          }
        }
      };

      new Chart(tempCanvas, {
        type: 'line',
        data: {
          datasets: [
            {
              type: 'line',
              label: 'Temperatura (°C)',
              data: tempChartData,
              borderColor: '#FF6B35',
              backgroundColor: tempGradient,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              borderWidth: 2,
              spanGaps: false,
              yAxisID: 'y',
              order: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          devicePixelRatio: 4,
          animation: { duration: 0 },
          plugins: { legend: { display: false }, title: { display: true, text: '🌡️ Temperatura (°C)', align: 'start', font: { size: 13, weight: 'bold' } } },
          scales: {
            x: {
              type: 'linear', min: 0, max: Math.ceil(totalKm),
              title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
              ticks: { stepSize: tickStep, font: { size: 10 }, callback: v => Math.abs(v % tickStep) < 0.01 ? v : '' },
              grid: { display: false }
            },
            y: {
              title: { display: true, text: 'Temperatura (°C)', font: { size: 11 } },
              ticks: { font: { size: 10 } },
              grid: { color: 'rgba(0,0,0,0.06)' }
            }
          }
        },
        plugins: [shareTempPlugin]
      });
    }

    const tileBaseUrl = `${getApiBaseUrl()}/api/helpers/tile_proxy.php?z={z}&x={x}&y={y}`;
    const mapCanvas = await renderMapRouteToCanvas(trackPoints, 1600, 800, tileBaseUrl);
    mapCanvas.style.cssText = 'width:800px;height:400px;display:block;';
    const mapTitle = document.createElement('div');
    mapTitle.style.cssText = 'width:800px;padding:8px 8px 0;font-size:13px;font-weight:700;color:#333;font-family:Arial,sans-serif;';
    mapTitle.textContent = '🗺️ Mapa de ruta';
    container.insertBefore(mapTitle, sep);
    container.insertBefore(mapCanvas, sep);

    // Calidad máxima: escala lo mayor que permita el límite del canvas (16384px por lado)
    const maxCanvasDim = 16384;
    const contW = container.offsetWidth || 800;
    const contH = container.offsetHeight || 400;
    const resultCanvas = await html2canvas(container, {
      scale: Math.min(8, Math.floor(maxCanvasDim / Math.max(contW, contH))),
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: false
    });

    document.body.removeChild(container);

    const blob = await new Promise(resolve => resultCanvas.toBlob(resolve, 'image/png', 1.0));
    if (!blob) throw new Error('No se pudo generar la imagen');

    Swal.close();

    const fileName = `ruta_${(fechaHora || 'gpx').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const texto = `⛰️ ${fechaHora ? fechaHora + ' — ' : ''}${kms} km`;

    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData = { text: texto, files: [file] };
      if (navigator.canShare(shareData)) {
        try { await navigator.share(shareData); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = 'https://wa.me/';
    } else {
      window.open('https://wa.me/', '_blank');
    }

  } catch (err) {
    console.error('Error al compartir ruta:', err);
    Swal.hideLoading();
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar la imagen' });
  }
}

// ========== FUNCIONES DE GESTIÓN DE RUTAS ==========

const getRutasByVehiculo = async () => {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) return;

  const data = {
    vehiculo_id: vehiculoId,
  };

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getRutasByVehiculo'),
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
      // Almacenar datos originales con formato de búsqueda para filtrado
      const rutasConFormato = response.data.content.map(item => {
        // Normalizar formato de kms para búsqueda (manejar punto y coma)
        const kmsValor = item.kms ? parseFloat(item.kms) : 0;
        const acumuladoKmsValor = item.acumulado_kms ? parseFloat(item.acumulado_kms) : 0;

        return {
          ...item,
          fecha_formateada: formatFechaTimeISO(item.fecha_inicio),
          kms_str: kmsValor.toFixed(2).replace('.', ','),
          acumulado_kms_str: acumuladoKmsValor.toFixed(2).replace('.', ',')
        };
      });
      window.rutasOriginales = rutasConFormato;

      // Calcular paginación
      window.totalPaginas = Math.ceil(rutasConFormato.length / REGISTROS_POR_PAGINA);
      if (window.paginaActual > window.totalPaginas) {
        window.paginaActual = window.totalPaginas || 1;
      }

      // Obtener registros de la página actual
      const inicio = (window.paginaActual - 1) * REGISTROS_POR_PAGINA;
      const fin = inicio + REGISTROS_POR_PAGINA;
      const rutasPagina = response.data.content.slice(inicio, fin);

      document.getElementById("main_cards").innerHTML =
        await parseHtmlCardsRutas(rutasPagina);
      await formatKilometersBadges();
      configurarLongPressCards(); // Configurar pulsación larga para cards GPX
      renderizarControlesPaginacion();
    }
  } catch (err) {
    console.error("Error al obtener rutas:", err);
  }
};

// ========== SELECCIÓN DE RUTAS (suma de kms) ==========

function toggleRutaSeleccion(id, checked) {
  const rid = String(id);
  if (checked) {
    window.rutasSeleccionadas.add(rid);
  } else {
    window.rutasSeleccionadas.delete(rid);
  }
  actualizarSumaKmsSeleccionadas();
}

function actualizarSumaKmsSeleccionadas() {
  const el = document.getElementById("suma-kms-seleccionadas");
  if (!el) return;
  let total = 0;
  let count = 0;
  if (window.rutasOriginales) {
    for (const r of window.rutasOriginales) {
      if (window.rutasSeleccionadas.has(String(r.id))) {
        total += parseFloat(r.kms) || 0;
        count++;
      }
    }
  }
  el.textContent = total > 0
    ? `${total.toFixed(2).replace('.', ',')} km`
    : '0,00 km';
}

// Función para renderizar controles de paginación
function renderizarControlesPaginacion() {
  const container = document.getElementById("main_cards");
  const paginacionExistente = document.getElementById("paginacion-container");
  if (paginacionExistente) {
    paginacionExistente.remove();
  }

  const botones = window.totalPaginas > 1 ? `
      <div class="d-flex justify-content-center align-items-center" style="gap: 15px;">
        <button
          class="btn btn-sm pag-btn ${window.paginaActual === 1 ? 'disabled' : ''}"
          onclick="cambiarPagina(1)"
          ${window.paginaActual === 1 ? 'disabled' : ''}>
          <i class="fas fa-angles-left"></i>
        </button>
        <button
          class="btn btn-sm pag-btn ${window.paginaActual === 1 ? 'disabled' : ''}"
          onclick="cambiarPagina(${window.paginaActual - 1})"
          ${window.paginaActual === 1 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="pag-text">
          ${window.paginaActual}/${window.totalPaginas}
        </span>
        <button
          class="btn btn-sm pag-btn ${window.paginaActual === window.totalPaginas ? 'disabled' : ''}"
          onclick="cambiarPagina(${window.paginaActual + 1})"
          ${window.paginaActual === window.totalPaginas ? 'disabled' : ''}>
          <i class="fas fa-chevron-right"></i>
        </button>
        <button
          class="btn btn-sm pag-btn ${window.paginaActual === window.totalPaginas ? 'disabled' : ''}"
          onclick="cambiarPagina(${window.totalPaginas})"
          ${window.paginaActual === window.totalPaginas ? 'disabled' : ''}>
          <i class="fas fa-angles-right"></i>
        </button>
      </div>` : '';

  const controlesHTML = `
    <div id="paginacion-container" class="col-12 mt-1 mb-1">
      <div class="d-flex align-items-center" style="gap: 12px;">
        <span id="suma-kms-seleccionadas" class="suma-kms-badge">0,00 km</span>
        <div class="flex-grow-1">${botones}</div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', controlesHTML);
  actualizarSumaKmsSeleccionadas();
}

// Función para cambiar de página
function cambiarPagina(nuevaPagina) {
  if (nuevaPagina < 1 || nuevaPagina > window.totalPaginas) return;
  window.paginaActual = nuevaPagina;
  getRutasByVehiculo();
}

const parseHtmlCardsRutas = async (data) => {
  return data
    .map((item) => {
      const esIndoor = item.origen === "fit_indoor";
      const esImportada = item.origen === "gpx" || esIndoor;

      let iconType;
      if (item.origen === "gpx") {
        iconType = `<i class="fas fa-map-marker-alt" style="font-size: 20px; color: #000; cursor: pointer;" onclick="event.stopPropagation(); showGpxDetails(${item.id})" title="Ruta GPX - Ver detalles"></i>`;
      } else if (esIndoor) {
        iconType = `<i class="fas fa-house" style="font-size: 18px; color: var(--text-primary); cursor: pointer;" onclick="event.stopPropagation(); showIndoorDetails(${item.id})" title="Bicicleta estática - Ver detalles (datos estimados)"></i>`;
      } else {
        iconType = `<i class="fas fa-pen-to-square" style="font-size: 18px; color: #000; cursor: pointer;" onclick="event.stopPropagation(); editarRutaManual('${item.id}', '${item.fecha_inicio}', '${item.kms}', '${item.observaciones || ''}', '${item.regulacion || 0}')" title="Ruta manual - Editar"></i>`;
      }

      // Para rutas manuales: modo edición al pulsar
      // Para rutas importadas (GPX / FIT indoor): eliminación con pulsación larga (long press)
      const cardAttributes = !esImportada ?
        `onclick="editarRutaManual('${item.id}', '${item.fecha_inicio}', '${item.kms}', '${item.observaciones || ''}', '${item.regulacion || 0}')" style="cursor: pointer;"` :
        `data-gpx-id="${item.id}" data-gpx-fecha="${item.fecha_inicio}" data-gpx-kms="${item.kms}" class="gpx-card" style="cursor: pointer; user-select: none;" title="Mantenga pulsado para eliminar"`;

      return `
        <div class="col-12 mb-2">
          <div class="card shadow-sm" ${cardAttributes}>
            <div class="card-body d-flex align-items-center p-2">
              <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center" style="gap: 10px;">
                    <input class="form-check-input ruta-seleccion-check" type="checkbox" id="ruta-check-${item.id}" data-ruta-id="${item.id}" ${window.rutasSeleccionadas.has(String(item.id)) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleRutaSeleccion(${item.id}, this.checked)" title="Seleccionar para sumar kms" style="cursor: pointer;">
                    <div class="card-icon-area" style="min-width: 25px;">${iconType}</div>
                    <p class="text-card-info mb-0">${formatFechaTimeISO(item.fecha_inicio)}${item.regulacion == 1 ? ' <span class="badge bg-warning text-dark" style="font-size:0.6rem">R</span>' : ''}</p>
                  </div>
                  <div class="d-flex align-items-center" style="gap: 25px; margin-left: auto; margin-right: 5px;">
                    <span name="kms" class="text-secondary" style="min-width: 60px; text-align: right;">${(parseFloat(item.kms) || 0).toFixed(2).replace('.', ',')}</span>
                    <span name="kms" class="text-primary" style="min-width: 60px; text-align: right;">${(parseFloat(item.acumulado_kms) || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
};

const getResumenBiker = async () => {
  const data = { usuario_id: sessionStorage.getItem("usuario_id") };

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getResumenBiker'),
      { data }
    );

    if (response.data.success) {
      const contenido = response.data.content;

      // 1. Agrupar por año
      const datosPorAnio = contenido.reduce((acc, item) => {
        if (!acc[item.anio]) acc[item.anio] = [];
        acc[item.anio].push(item);
        return acc;
      }, {});

      // 2. Calcular totales globales
      const totalesGlobales = contenido.reduce(
        (acc, item) => {
          acc.kmsPulmonar += parseFloat(item.kms_mes_pulmonar || 0);
          acc.kmsElectrica += parseFloat(item.kms_mes_electrica || 0);
          acc.kmsEstatica += parseFloat(item.kms_mes_estatica || 0);
          acc.rutasPulmonar += parseInt(item.rutas_mes_pulmonar || 0);
          acc.rutasElectrica += parseInt(item.rutas_mes_electrica || 0);
          acc.rutasEstatica += parseInt(item.rutas_mes_estatica || 0);
          return acc;
        },
        {
          kmsPulmonar: 0,
          kmsElectrica: 0,
          kmsEstatica: 0,
          rutasPulmonar: 0,
          rutasElectrica: 0,
          rutasEstatica: 0,
        }
      );

      const totalKms = totalesGlobales.kmsPulmonar + totalesGlobales.kmsElectrica + totalesGlobales.kmsEstatica;
      const totalRutas =
        totalesGlobales.rutasPulmonar + totalesGlobales.rutasElectrica + totalesGlobales.rutasEstatica;

      // 3. Generar HTML del resumen superior
      let htmlResumen = `
        <div class="mb-1 p-1 bg-white shadow-sm rounded border">
          <div class="d-flex justify-content-around" style="font-size: 0.9rem;">
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Kms Pulmonar">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🫁 Kms</div>
              <div class="fw-bold text-primary text-center">${totalesGlobales.kmsPulmonar.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Kms Eléctrica">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🔌 Kms</div>
              <div class="fw-bold text-success text-center">${totalesGlobales.kmsElectrica.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Kms Estática">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🏠 Kms</div>
              <div class="fw-bold text-center" style="color: orange;">${totalesGlobales.kmsEstatica.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Total Kms">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🧭 Total</div>
              <div class="fw-bold text-dark text-center">${totalKms.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
          </div>
          <div class="d-flex justify-content-around" style="font-size: 0.9rem; margin-top: -5px;">
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Rutas Pulmonar">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🫁 Rutas</div>
              <div class="fw-bold text-primary text-center">${
                totalesGlobales.rutasPulmonar
              }</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Rutas Eléctrica">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🔌 Rutas</div>
              <div class="fw-bold text-success text-center">${
                totalesGlobales.rutasElectrica
              }</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Sesiones Estática">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🏠 Ses.</div>
              <div class="fw-bold text-center" style="color: orange;">${
                totalesGlobales.rutasEstatica
              }</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Total Rutas">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🚴‍♂️ Total</div>
              <div class="fw-bold text-dark text-center">${totalRutas}</div>
            </div>
          </div>
        </div>
      `;

      // 4. Obtener años, ordenarlos de mayor a menor y generar HTML
      let htmlFinal = htmlResumen;
      const aniosOrdenados = Object.keys(datosPorAnio).sort((a, b) => b - a);

      aniosOrdenados.forEach((anio, index) => {
        // El primer año (índice 0) lo dejamos expandido por defecto
        const expandir = false;
        htmlFinal += generarAcordeonAnual(anio, datosPorAnio[anio], expandir);
      });

      document.getElementById("accordionSummary").innerHTML = htmlFinal;
    }
  } catch (err) {
    console.error("Error al cargar resumen:", err);
  }
};

const generarAcordeonAnual = (anio, meses, expandir) => {
  const global = meses[0]; // Datos anuales
  const collapseClass = expandir ? "show" : "";
  const buttonClass = expandir ? "" : "collapsed";

  return `
        <div class="accordion-item mb-1 shadow-sm border-0">
            <h2 class="accordion-header" id="heading_${anio}">
                <button class="accordion-button ${buttonClass} py-2" type="button" data-bs-toggle="collapse"
                    data-bs-target="#collapse_${anio}" aria-expanded="${expandir}">
                    <div class="d-flex w-100 pe-3 align-items-center" style="display: flex; justify-content: space-between;">
                        <span class="fw-bold" style="flex: 0 0 auto;">${anio}</span>
                        <span class="small" style="flex: 1; text-align: center;">🧭 ${(() => { const n = Number(global.total_anual_kms_global); const [int, dec] = n.toFixed(2).split('.'); return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec; })()} km</span>
                        <span class="small" style="flex: 0 0 auto;">🚴‍♂️ ${global.rutas_anio}</span>
                    </div>
                </button>
            </h2>
            <div id="collapse_${anio}" class="accordion-collapse collapse ${collapseClass}" aria-labelledby="heading_${anio}" data-bs-parent="#accordionSummary">
                <div class="accordion-body p-1 bg-light">
                    ${meses
                      .map(
                        (m) => `
                        <div class="card mb-1 border-0 shadow-sm">
                            <div class="card-body p-1">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="fw-bold text-primary small">${m.mes_nombre}</span>
                                    <span class="fw-bold small">${m.total_kms_mes} <small>km</small></span>
                                </div>
                                <div class="d-flex justify-content-between mt-0 small" style="font-size: 0.75rem;">
                                    <span>🫁 ${m.kms_mes_pulmonar}</span>
                                    <span>🔌 ${m.kms_mes_electrica}</span>
                                    <span>🏠 ${m.kms_mes_estatica}</span>
                                    <span class="">${m.rutas_mes} rut.</span>
                                </div>
                            </div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
        </div>`;
};

const gotoBackMantenimientos = async () => {
  // Verificar si estamos en modo edición (botón cancelar visible)
  const cancelBtn = document.getElementById("cancelar_btn");
  if (cancelBtn && cancelBtn.style.display !== "none") {
    // Si estamos en modo edición, volver a la pestaña principal
    const tab1Tab = document.getElementById("tab1-tab");
    const tab1 = document.getElementById("tab1");
    const tab2Tab = document.getElementById("tab2-tab");
    const tab2 = document.getElementById("tab2");

    tab2Tab.classList.remove("active");
    tab2.classList.remove("show", "active");
    tab1Tab.classList.add("active");
    tab1.classList.add("show", "active");

    // Restaurar botones y limpiar formulario
    cancelarEdicionRuta();
  } else {
    // Si no estamos en modo edición, ir a main.php
    window.location.href = "../main.php";
  }
};

// Variable para rastrear la última búsqueda
let ultimoTerminoBusqueda = "";

// ========== FUNCIÓN DE FILTRADO DE RUTAS ==========
async function filtrarRutas(searchTerm) {
  const container = document.getElementById("main_cards");

  if (!window.rutasOriginales || window.rutasOriginales.length === 0) {
    return;
  }
  const term = searchTerm.toLowerCase().trim();

  // Resetear a página 1 si el término de búsqueda cambió
  if (term !== ultimoTerminoBusqueda) {
    window.paginaActual = 1;
    ultimoTerminoBusqueda = term;
  }

  let rutasParaProcesar = window.rutasOriginales;

  if (term !== "") {
    // Filtrar rutas por fecha, kms o kms acumulados
    rutasParaProcesar = window.rutasOriginales.filter(item => {
      const fechaISO = item.fecha_inicio ? item.fecha_inicio.toLowerCase() : "";
      const fechaFormateada = item.fecha_formateada ? item.fecha_formateada.toLowerCase() : "";
      const kms = item.kms ? item.kms.toString() : "";
      const kmsStr = item.kms_str ? item.kms_str.toLowerCase() : "";
      const kmsTotal = item.acumulado_kms ? item.acumulado_kms.toString() : "";
      const kmsTotalStr = item.acumulado_kms_str ? item.acumulado_kms_str.toLowerCase() : "";

      const match = fechaISO.includes(term) ||
             fechaFormateada.includes(term) ||
             kms.includes(term) ||
             kmsStr.includes(term) ||
             kmsTotal.includes(term) ||
             kmsTotalStr.includes(term);
      return match;
    });
  }

  // Calcular paginación para resultados filtrados
  window.totalPaginas = Math.ceil(rutasParaProcesar.length / REGISTROS_POR_PAGINA);
  if (window.paginaActual > window.totalPaginas) {
    window.paginaActual = window.totalPaginas || 1;
  }

  // Obtener registros de la página actual
  const inicio = (window.paginaActual - 1) * REGISTROS_POR_PAGINA;
  const fin = inicio + REGISTROS_POR_PAGINA;
  const rutasPagina = rutasParaProcesar.slice(inicio, fin);

  // Extraer solo los datos originales sin los campos formateados adicionales
  const rutasParaMostrar = rutasPagina.map(item => ({
    id: item.id,
    vehiculo_id: item.vehiculo_id,
    fecha_inicio: item.fecha_inicio,
    kms: item.kms,
    acumulado_kms: item.acumulado_kms,
    origen: item.origen,
    observaciones: item.observaciones
  }));

  // Mostrar resultados
  container.innerHTML = await parseHtmlCardsRutas(rutasParaMostrar);
  await formatKilometersBadges();
  configurarLongPressCards(); // Configurar pulsación larga para cards GPX
  renderizarControlesPaginacion();

  // Activar la primera pestaña para mostrar los resultados
  const tab1Tab = document.getElementById("tab1-tab");
  const tab1 = document.getElementById("tab1");

  // Remover active de todas las pestañas
  document.querySelectorAll('.nav-link').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('show', 'active');
  });

  // Activar tab1
  tab1Tab.classList.add('active');
  tab1.classList.add('show', 'active');
}

// ========== BÚSQUEDA MÓVIL: INPUT DESLIZANTE SOBRE TABS ==========
let searchExpanded = false;

function toggleSearchMobile() {
  const overlay = document.getElementById("searchMobileOverlay");
  const input = document.getElementById("searchMobileInput");

  if (!searchExpanded) {
    overlay.style.display = "flex";
    setTimeout(() => { overlay.classList.add("open"); }, 10);
    setTimeout(() => input && input.focus(), 200);
    searchExpanded = true;
  } else {
    overlay.classList.remove("open");
    input.value = "";
    filtrarRutas("");
    setTimeout(() => { overlay.style.display = "none"; }, 300);
    searchExpanded = false;
  }
}

document.addEventListener('click', function(event) {
  if (!searchExpanded) return;
  const overlay = document.getElementById("searchMobileOverlay");
  const input = document.getElementById("searchMobileInput");
  if (overlay && overlay.contains(event.target)) return;
  if (event.target.closest('#searchMobileTrigger')) return;
  overlay.classList.remove("open");
  input.value = "";
  filtrarRutas("");
  setTimeout(() => { overlay.style.display = "none"; }, 300);
  searchExpanded = false;
});

// ========== GRÁFICA DE VELOCIDADES MENSUALES ==========
let velocidadesChartInstance = null;
let datosVelocidadesGlobal = null;

async function cargarGraficaVelocidades() {
  const usuario_id = sessionStorage.getItem("usuario_id");
  const vehiculoBtn = document.getElementById("vehiculo-select");
  const vehiculo_id = vehiculoBtn?.dataset?.selected || vehiculoBtn?.value;
  if (!usuario_id || !vehiculo_id) return;

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getVelocidadesMensuales'),
      { data: { usuario_id } },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data.success) {
      const datos = response.data.content;
      datosVelocidadesGlobal = datos;
      poblarSelectorAnio(datos);
      actualizarGraficaPorAnio();
    }
  } catch (err) {
    console.error("Error al obtener velocidades:", err);
  }
}

function poblarSelectorAnio(datos) {
  const select = document.getElementById("anio-filtro");
  if (!select) return;

  // Obtener años únicos
  const anios = [...new Set(datos.map(d => d.mes_anio.substring(0, 4)))].sort().reverse();

  select.innerHTML = '';
  anios.forEach(anio => {
    const option = document.createElement("option");
    option.value = anio;
    option.textContent = anio;
    select.appendChild(option);
  });

  // Seleccionar año en curso por defecto
  const anioActual = new Date().getFullYear().toString();
  if (anios.includes(anioActual)) {
    select.value = anioActual;
  }
}

function actualizarGraficaPorAnio() {
  if (!datosVelocidadesGlobal) return;

  const vehiculoBtn = document.getElementById("vehiculo-select");
  const vehiculo_id = vehiculoBtn?.dataset?.selected || vehiculoBtn?.value;
  const anioSeleccionado = document.getElementById("anio-filtro")?.value;

  if (!vehiculo_id || !anioSeleccionado) return;

  // Filtrar datos por vehículo y año
  const datosFiltrados = datosVelocidadesGlobal.filter(d =>
    d.vehiculo_id == vehiculo_id && d.mes_anio.startsWith(anioSeleccionado)
  );

  renderizarGraficaVelocidades(datosFiltrados, vehiculo_id, anioSeleccionado);
}

function renderizarGraficaVelocidades(datos, vehiculo_id, anio) {
  const canvas = document.getElementById("velocidadesChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // Destruir instancia anterior si existe
  if (velocidadesChartInstance) {
    velocidadesChartInstance.destroy();
  }

  if (datos.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.fillText("No hay datos de velocidad para este vehículo en " + anio, canvas.width / 2, canvas.height / 2);
    return;
  }

  // Obtener nombre del vehículo
  const vehiculoNombre = datos[0].vehiculo_anagrama + " - " + datos[0].vehiculo_nombre;

  // Ordenar datos por mes
  const datosOrdenados = datos.sort((a, b) => a.mes_anio.localeCompare(b.mes_anio));

  // Obtener todos los meses
  const todosMeses = datosOrdenados.map(d => d.mes_anio);

  // Preparar datos para velocidad media
  const velocidadesMedias = datosOrdenados.map(d => parseFloat(d.velocidad_media_promedio));

  // Preparar datos para velocidad máxima
  const velocidadesMaximas = datosOrdenados.map(d => parseFloat(d.velocidad_maxima_maxima));

  // Formatear etiquetas de mes
  const etiquetas = todosMeses.map(mes => {
    const [year, month] = mes.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return meses[parseInt(month) - 1];
  });

  // Crear datasets para Chart.js
  const datasets = [
    {
      label: vehiculoNombre + ' (Media)',
      data: velocidadesMedias,
      borderColor: '#007bff',
      backgroundColor: '#007bff20',
      borderWidth: 2,
      fill: false,
      tension: 0.2,
      pointRadius: 4,
      pointHoverRadius: 6
    },
    {
      label: vehiculoNombre + ' (Máxima)',
      data: velocidadesMaximas,
      borderColor: '#dc3545',
      backgroundColor: '#dc354520',
      borderWidth: 2,
      borderDash: [5, 5],
      fill: false,
      tension: 0.2,
      pointRadius: 4,
      pointHoverRadius: 6
    }
  ];

  // Crear gráfico
  velocidadesChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Velocidad media y maxima - ' + anio,
          font: { size: 16 }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              const isMedia = context.dataset.label.includes('Media');
              const label = isMedia ? 'Media' : 'Maxima';
              return label + ': ' + value + ' km/h';
            }
          }
        },
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            usePointStyle: true,
            font: { size: 11 }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Velocidad (km/h)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Mes'
          }
        }
      }
    }
  });
}

function latLngToPixel(lat, lng, zoom) {
  const world = 256 * Math.pow(2, zoom);
  const x = (lng + 180) / 360 * world;
  const latRad = lat * Math.PI / 180;
  const y = world / 2 - world * Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
  return { x, y };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderMapRouteToCanvas(routePoints, canvasWidth, canvasHeight, tileUrlTemplate) {
  const lats = routePoints.map(p => p.lat);
  const lngs = routePoints.map(p => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const pts = downsamplePoints(routePoints, 2000);

  let zoom = 1;
  for (let z = 19; z >= 1; z--) {
    const minPx = latLngToPixel(maxLat, minLng, z);
    const maxPx = latLngToPixel(minLat, maxLng, z);
    const pw = Math.abs(maxPx.x - minPx.x);
    const ph = Math.abs(maxPx.y - minPx.y);
    if (pw <= canvasWidth * 0.95 && ph <= canvasHeight * 0.95) {
      zoom = z;
      break;
    }
  }

  const centerPx = latLngToPixel(centerLat, centerLng, zoom);
  const vpLeft = centerPx.x - canvasWidth / 2;
  const vpTop = centerPx.y - canvasHeight / 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const tileXMin = Math.floor(vpLeft / 256);
  const tileYMin = Math.floor(vpTop / 256);
  const tileXMax = Math.ceil((vpLeft + canvasWidth) / 256);
  const tileYMax = Math.ceil((vpTop + canvasHeight) / 256);

  const tilePromises = [];
  for (let tx = tileXMin; tx < tileXMax; tx++) {
    for (let ty = tileYMin; ty < tileYMax; ty++) {
      const src = tileUrlTemplate.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
      const drawX = tx * 256 - vpLeft;
      const drawY = ty * 256 - vpTop;
      tilePromises.push(
        loadImage(src).then(img => {
          ctx.drawImage(img, drawX, drawY, 256, 256);
        }).catch(() => {
          ctx.fillStyle = '#e0e0e0';
          ctx.fillRect(drawX, drawY, 256, 256);
        })
      );
    }
  }
  await Promise.all(tilePromises);

  ctx.beginPath();
  ctx.strokeStyle = '#6A0DAD';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length; i++) {
    const px = latLngToPixel(pts[i].lat, pts[i].lon, zoom);
    const vx = px.x - vpLeft;
    const vy = px.y - vpTop;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.stroke();

  return canvas;
}
