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
function calcularTiemposTerreno(trkpts) {
  let tiempoSubida = 0;
  let tiempoBajada = 0;
  let tiempoPlano = 0;

  for (let i = 1; i < trkpts.length; i++) {
    const prev = trkpts[i - 1];
    const curr = trkpts[i];

    const dt = (curr.time - prev.time) / 1000;
    if (dt <= 0) continue;

    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const dAlt = curr.ele - prev.ele;

    const slopePerc = dist > 0 ? (dAlt / dist) * 100 : 0;

    if (slopePerc > 1) {
      tiempoSubida += dt;
    } else if (slopePerc < -1) {
      tiempoBajada += dt;
    } else {
      tiempoPlano += dt;
    }
  }

  return {
    tiempoSubida: formatTime(tiempoSubida),
    tiempoBajada: formatTime(tiempoBajada),
    tiempoPlano: formatTime(tiempoPlano),
  };
}

function processGPX(text) {

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Archivo GPX inválido: " + parseError.textContent);
  }

  const GPX_NS = "http://www.topografix.com/GPX/1/1";

  let trkptsNodes = doc.getElementsByTagNameNS(GPX_NS, "trkpt");
  if (trkptsNodes.length === 0) trkptsNodes = doc.querySelectorAll("trkpt");

  const trkpts = Array.from(trkptsNodes)
    .map((pt) => {
      let eleElem = pt.getElementsByTagNameNS(GPX_NS, "ele")[0];
      let timeElem = pt.getElementsByTagNameNS(GPX_NS, "time")[0];
      if (!eleElem) eleElem = pt.querySelector("ele");
      if (!timeElem) timeElem = pt.querySelector("time");

      return {
        lat: parseFloat(pt.getAttribute("lat")),
        lon: parseFloat(pt.getAttribute("lon")),
        ele: eleElem ? parseFloat(eleElem.textContent) : 0,
        time: timeElem ? new Date(timeElem.textContent) : new Date(),
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

  let distSubida = 0;
  let distBajada = 0;
  let distPlano = 0;

  for (let i = 1; i < trkpts.length; i++) {
    const prev = trkpts[i - 1];
    const curr = trkpts[i];

    const dt = (curr.time - prev.time) / 1000;
    if (dt <= 0) continue;

    const dist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const dAlt = curr.ele - prev.ele;
    const speed = dist / dt;

    totalDist += dist;

    if (dAlt > 0) ascent += dAlt;
    else descent -= dAlt;

    if (curr.ele > maxAlt) maxAlt = curr.ele;

    const slopePerc = (dAlt / dist) * 100;
    if (slopePerc > 1) {
      distSubida += dist;
    } else if (slopePerc < -1) {
      distBajada += dist;
    } else {
      distPlano += dist;
    }

    const isMoving = speed > 0.2778;
    if (isMoving) totalTimeMoving += dt;

    const speedKmh = speed * 3.6;
    if (speedKmh > maxSpeed) maxSpeed = speedKmh;

    const power = isMoving ? estimatePower(dist, dt, dAlt, speed) : 0;
    totalPowerSec += power * dt;
  }

  const filteredSpeeds = calculateSpeedWithFilter(trkpts);
  let maxSpeedFiltered = 0;
  for (let i = 1; i < filteredSpeeds.length; i++) {
    const speedKmh = filteredSpeeds[i] * 3.6;
    if (speedKmh > maxSpeedFiltered) {
      maxSpeedFiltered = speedKmh;
    }
  }

  // Calcular tiempos por tipo de terreno
  const tiemposTerreno = calcularTiemposTerreno(trkpts);

  const totalTimeElapsed =
    (trkpts[trkpts.length - 1].time - trkpts[0].time) / 1000;
  const avgSpeedMoving =
    totalTimeMoving > 0 ? (totalDist / totalTimeMoving) * 3.6 : 0;
  const avgPower = totalTimeMoving > 0 ? totalPowerSec / totalTimeMoving : 0;

  const calories = estimateCalories(totalTimeMoving, MASSBIKER, 7.32);

  const totalDistRuta = distSubida + distBajada + distPlano;
  const subidaPerc =
    totalDistRuta > 0 ? ((distSubida / totalDistRuta) * 100).toFixed(0) : 0;
  const bajadaPerc =
    totalDistRuta > 0 ? ((distBajada / totalDistRuta) * 100).toFixed(0) : 0;
  const planoPerc =
    totalDistRuta > 0 ? ((distPlano / totalDistRuta) * 100).toFixed(0) : 0;

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
    tiempo_subida: tiemposTerreno.tiempoSubida,
    tiempo_bajada: tiemposTerreno.tiempoBajada,
    tiempo_plano: tiemposTerreno.tiempoPlano,
    velocidad_media: Number(avgSpeedMoving.toFixed(1)),
    velocidad_maxima: Number(maxSpeedFiltered.toFixed(1)),
    potencia_promedio_w: Math.round(avgPower),
    calorias: Math.round(calories),
    track_points: trkpts.map(p => ({
      lat: parseFloat(p.lat.toFixed(6)),
      lon: parseFloat(p.lon.toFixed(6)),
      ele: Math.round(p.ele),
      time: p.time.toISOString()
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
  setupGPXUpload();
  setupMultipleGPXUpload();

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

window.selectVehiculoPicker = (id, nombre) => {
  sessionStorage.setItem("vehiculo_id", id);
  const btn = document.getElementById("vehiculo-select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
  const searchInput = document.getElementById("searchRutas");
  if (searchInput) searchInput.value = "";
  window.paginaActual = 1;
  getRutasByVehiculo();
  const activePane = document.querySelector('.tab-pane.show.active');
  if (activePane) {
    const id = activePane.id;
    if (id === 'tab5') cargarGraficaVelocidades();
    else if (id === 'tab6' || id === 'tab7') cargarGraficasAnalisis();
  }
};

// ========== FUNCIONALIDAD PARA UN SOLO ARCHIVO ==========
function setupGPXUpload() {
  const inputs = ["gpxFile", "gpxFileOrux"];
  const loadingIndicator = document.getElementById("loading-indicator");

  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const loading = loadingIndicator;
      if (loading) loading.style.display = "block";
      document.getElementById("output-container").innerHTML = "";

      try {
        const text = await file.text();
        let result;
        result = processGPX(text);
        const container = document.getElementById("output-container");
        container.innerHTML = generarContenidoRuta(result, file.name.endsWith(".tcx"));
        await sendToAPI(result);
      } catch (err) {
        console.error("💥 Error:", err);
        document.getElementById("output-container").innerHTML = `
          <div class="col-12">
            <div class="alert alert-danger">${err.message}</div>
          </div>
        `;
      } finally {
        if (loading) loading.style.display = "none";
      }
    });
  });
}

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

async function sendToAPI(result) {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");

  if (!vehiculoId) {
    await Swal.fire({
      text: "Error: No hay vehículo seleccionado",
      icon: "error",
      timer: 3000,
    });
    return;
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
    tiempo_subida: result.tiempo_subida,
    tiempo_plano: result.tiempo_plano,
    tiempo_bajada: result.tiempo_bajada,
    fecha_inicio: result.fecha_inicio,
    fecha_fin: result.fecha_fin,
    frecuencia_cardiaca_promedio: result.frecuencia_cardiaca_promedio,
    frecuencia_cardiaca_maxima: result.frecuencia_cardiaca_maxima,
    gpx_data: JSON.stringify(result.track_points),
  };

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?guardarRutaGPX'),
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
      await Swal.fire({
        text: "✅ Ruta guardada correctamente",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
      await getRutasByVehiculo();
      await crearBackup();

      const rutaId = response.data.content;
      if (rutaId && result.track_points && result.track_points.length > 0) {
        fetchWeatherForRoute(result, rutaId);
      }
    } else {
      throw new Error(response.data.message || "Error del servidor");
    }
  } catch (err) {
    console.error("Error al enviar a API:", err);
    await Swal.fire({
      text: `❌ Error al guardar: ${err.response?.data?.message || err.message}`,
      icon: "error",
      timer: 3000,
    });
  }
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

  const BATCH_SIZE = 10;
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

      try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${pt.lat}&longitude=${pt.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,precipitation&timezone=auto`;
        const resp = await fetch(url);
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
        console.warn('Weather fetch error for point', pt.kilometro, 'km:', e);
        return null;
      }
    }));

    for (const r of batchResults) {
      if (r) weatherData.push(r);
    }

    const progressEl = document.getElementById('clima-progress');
    if (progressEl) progressEl.textContent = `Procesando ${Math.min(i + BATCH_SIZE, samples.length)}/${samples.length} puntos`;
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

  const BATCH_SIZE = 10;
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

      try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${pt.lat}&longitude=${pt.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,precipitation&timezone=auto`;
        const resp = await fetch(url);
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
        return null;
      }
    }));

    for (const r of batchResults) {
      if (r) weatherData.push(r);
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
  if (temps.length > 0) {
    const maxVal = Math.max(...temps.map(d => d.y));
    const minVal = Math.min(...temps.map(d => d.y));
    maxPoint = temps.find(d => d.y === maxVal);
    minPoint = temps.find(d => d.y === minVal);
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
        c.fillStyle = '#DC143C';
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
      }

      if (minPoint) {
        const xPx = xScale.getPixelForValue(minPoint.x);
        const yPx = yScale.getPixelForValue(minPoint.y);
        c.save();
        c.beginPath();
        c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
        c.fillStyle = '#5B9BD5';
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
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
  const result = await Swal.fire({
    title: 'Eliminar ruta GPX',
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

// Función para generar el contenido HTML de la ruta
function generarContenidoRuta(ruta, hasHR = false, tempData = null) {
  const fields = [
    { label: "📆 Inicio", value: formatFechaTimeISO(ruta.fecha_inicio) },
    { label: "📆 Fin", value: formatFechaTimeISO(ruta.fecha_fin) },
    { label: "🕑 Tiempo total", value: ruta.tiempo_total },
    { label: "⌚ Tiempo en movimiento", value: ruta.tiempo_movimiento },
    { label: "📏 Distancia", value: `${ruta.kms} km` },
    { label: "🏎️ Velocidad media", value: `${ruta.velocidad_media} km/h` },
    { label: "🚀 Velocidad máxima", value: `${ruta.velocidad_maxima} km/h` },
    { label: "⏫ Ascenso", value: `${ruta.metros_ascenso} m` },
    { label: "⏬ Descenso", value: `${ruta.metros_descenso} m` },
    { label: "⛰️ Altitud máxima", value: `${ruta.altitud_maxima} m` },
    { label: "⚡ Potencia promedio", value: `${ruta.potencia_promedio_w} W` },
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

  if (tempData && tempData.length > 0) {
    const temps = tempData.filter(d => d.temperatura !== null && d.temperatura !== undefined).map(d => d.temperatura);
    const hasRain = tempData.some(d => d.lluvia == 1);
    if (temps.length > 0) {
      const tempMax = Math.max(...temps);
      const tempMin = Math.min(...temps);
      fields.push({ label: "🌡️ Temp. máxima", value: `${tempMax.toFixed(1)}°C` });
      fields.push({ label: "🌡️ Temp. mínima", value: `${tempMin.toFixed(1)}°C` });
      fields.push({ label: "☂️ Lluvia", value: hasRain ? '☔' : '☀️' });
    }
  }
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
        padding: 15px;
        border: 2px solid #2562D3;
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

function actualizarStatsConTemperatura(ruta, tempData) {
  if (!tempData || tempData.length === 0) return;
  const statsDiv = document.querySelector('.ruta-details-captura');
  if (!statsDiv) return;
  const tempRegex = /(🌡️ Temp\. máxima|🌡️ Temp\. mínima|☂️ Lluvia)/;
  if (tempRegex.test(statsDiv.parentElement?.innerHTML || '')) return;
  const nuevoHtml = generarContenidoRuta(ruta, false, tempData);
  const wrapper = statsDiv.parentElement;
  if (wrapper) wrapper.innerHTML = nuevoHtml;
}

// Función principal para mostrar detalles de GPX
const showGpxDetails = async (ruta_id) => {
  const controller = new AbortController();
  let hasMapData = false;
  let trackPoints = [];
  let rutaActualData = null;

  const buildFullHtml = () => {
    const tempDataForStats = window.__tempPreloadedData || null;
    const statsHtml = generarContenidoRuta(rutaActualData, false, tempDataForStats);
    if (hasMapData) {
      return `
        <div class="ruta-details-wrapper">
          <details id="map-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">🗺️ Mapa de ruta</summary>
            <div id="map-container" style="height: 350px; border-radius: 10px; z-index: 1; border: 2px solid #dee2e6; display: none;"></div>
          </details>
          <details id="elevation-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">📈 Perfil de elevación</summary>
            <div id="elevation-chart-wrapper" style="height: 180px; margin-top: 8px; padding: 5px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="elevationChart"></canvas>
            </div>
          </details>
          <details id="temp-details" class="ruta-collapse">
            <summary class="ruta-collapse-summary">🌡️ Temperatura</summary>
            <div id="temp-chart-wrapper" style="height: 180px; margin-top: 8px; padding: 5px; border: 1px solid #dee2e6; border-radius: 8px; display: none;">
              <canvas id="tempChart"></canvas>
            </div>
          </details>
          <div style="margin-top: 10px;">${statsHtml}</div>
        </div>
        <style>
          .ruta-details-wrapper { }
          .leaflet-container { z-index: 1 !important; border-radius: 10px; }
          .ruta-collapse { margin-bottom: 8px; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; }
          .ruta-collapse-summary { padding: 10px 14px; cursor: pointer; font-weight: 600; font-size: 14px; color: var(--text-primary, #333); background: var(--card-bg, #f8f9fa); user-select: none; text-align: left; }
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
                await fetchWeatherForRoute(routeResult, ruta_id);
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
              const nuevoHtml = generarContenidoRuta(rutaActualData, false, tempDataCache);
              const tempRegex = /(🌡️ Temp\. máxima|🌡️ Temp\. mínima|☂️ Lluvia)/;
              if (!tempRegex.test(statsDiv.parentElement?.innerHTML || '')) {
                const wrapper = statsDiv.parentElement;
                if (wrapper) wrapper.innerHTML = nuevoHtml;
              }
            }
          }
        } else {
          tempWrapper.style.display = 'none';
        }
      });
    }
  };

  Swal.fire({
    title: false,
    html: '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Cargando detalles...</p></div>',
    width: 800,
    padding: "10px",
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

    if (rutaActualData.gpx_data && rutaActualData.gpx_data !== 'null' && rutaActualData.gpx_data !== '[]') {
      try {
        trackPoints = JSON.parse(rutaActualData.gpx_data);
        hasMapData = trackPoints.length > 2;
      } catch (e) {}
    }

    Swal.update({
      html: buildFullHtml(),
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
          actualizarStatsConTemperatura(rutaActualData, existing);
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
            actualizarStatsConTemperatura(rutaActualData, downloaded);
            return downloaded;
          }
          return loadTemperatureData(ruta_id);
        });
      }).then(data => {
        if (data && data.length > 0 && !window.__tempPreloadedData) {
          window.__tempPreloadedData = data;
          actualizarStatsConTemperatura(rutaActualData, data);
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

  L.marker(latlngs[0], {
    icon: L.divIcon({
      className: 'marker-waypoint',
      html: '<div class="marker-waypoint-inner" style="background:linear-gradient(135deg,#2196F3,#1976D2)"><i class="fas fa-map-pin" style="font-size:16px;color:#fff"></i></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    })
  }).addTo(map).bindPopup('Salida (0 km)');
  L.marker(latlngs[latlngs.length - 1], {
    icon: L.divIcon({
      className: 'marker-waypoint',
      html: '<div class="marker-waypoint-inner" style="background:linear-gradient(135deg,#4CAF50,#388E3C)"><i class="fas fa-flag-checkered" style="font-size:16px;color:#fff"></i></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    })
  }).addTo(map).bindPopup('Llegada');

  const fullDistances = computeCumulativeDistances(trackPoints);
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

function initElevationChart(trackPoints) {
  const canvas = document.getElementById('elevationChart');
  if (!canvas) return;

  const sampled = downsamplePoints(trackPoints, 500);
  const fullDistances = computeCumulativeDistances(trackPoints);
  const totalKm = fullDistances[fullDistances.length - 1] / 1000;
  const tickStep = totalKm <= 5 ? 1 : totalKm <= 20 ? 1 : totalKm <= 50 ? 2 : totalKm <= 100 ? 5 : 10;
  const chartData = sampled.map(pt => {
    const idx = trackPoints.indexOf(pt);
    const x = parseFloat((fullDistances[idx] / 1000).toFixed(2));
    return { x, y: pt.ele };
  });
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(13, 71, 161, 0.3)');
  gradient.addColorStop(1, 'rgba(13, 71, 161, 0.02)');

  const xMax = Math.ceil(totalKm);
  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Elevación (m)',
        data: chartData,
        borderColor: '#6A0DAD',
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2
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
            label: (ctx) => `${ctx.parsed.y} m @ ${ctx.parsed.x} km`
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
    }
  });
}

async function compartirRutaWhatsApp() {
  const ruta = window.rutaActual;
  const trackPoints = window.__rutaTrackPoints;
  if (!ruta || !trackPoints || trackPoints.length < 2) return;

  Swal.showLoading();

  let tempData = window.__tempPreloadedData || null;
  if (!tempData && ruta.id) {
    try {
      tempData = await loadTemperatureData(ruta.id);
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
    titleBar.textContent = fechaHora ? `${fechaHora} — ${kms} km` : `${kms} km`;
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

    const sep2 = document.createElement('hr');
    sep2.style.cssText = 'margin:6px 0;border:none;border-top:2px solid #6A0DAD;';
    container.appendChild(sep2);

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

    const fieldsShare = [
      { label: "📆 Inicio", value: formatFechaTimeISO(ruta.fecha_inicio) },
      { label: "📆 Fin", value: formatFechaTimeISO(ruta.fecha_fin) },
      { label: "🕑 Tiempo total", value: ruta.tiempo_total },
      { label: "⌚ Tiempo en movimiento", value: ruta.tiempo_movimiento },
      { label: "📏 Distancia", value: `${ruta.kms} km` },
      { label: "🏎️ Velocidad media", value: `${ruta.velocidad_media} km/h` },
      { label: "🚀 Velocidad máxima", value: `${ruta.velocidad_maxima} km/h` },
      { label: "⏫ Ascenso", value: `${ruta.metros_ascenso} m` },
      { label: "⏬ Descenso", value: `${ruta.metros_descenso} m` },
      { label: "⛰️ Altitud máxima", value: `${ruta.altitud_maxima} m` },
      { label: "⚡ Potencia promedio", value: `${ruta.potencia_promedio_w} W` },
      { label: "💥 Calorías", value: `${ruta.calorias} kcal` },
      { label: `⬆️ Subida (${ruta.tiempo_subida || "00:00:00"})`, value: `${ruta.pct_subida}%` },
      { label: `➡️ Plano (${ruta.tiempo_plano || "00:00:00"})`, value: `${ruta.pct_plano}%` },
    ];

    const hasRainShare = tempData ? tempData.some(d => d.lluvia == 1) : false;
    fieldsShare.push({
      label: `⬇️ Bajada (${ruta.tiempo_bajada || "00:00:00"})`,
      value: `${ruta.pct_bajada}%`
    });
    fieldsShare.push({
      label: "☂️ Lluvia",
      value: hasRainShare ? '☔' : '☀️'
    });

    const tempsArr = (tempData && tempData.length > 0)
      ? tempData.filter(d => d.temperatura !== null && d.temperatura !== undefined).map(d => d.temperatura)
      : [];
    if (tempsArr.length > 0) {
      const tempMaxSh = Math.max(...tempsArr);
      const tempMinSh = Math.min(...tempsArr);
      fieldsShare.push({ label: "🌡️ Temp. mínima", value: `${tempMinSh.toFixed(1)}°C` });
      fieldsShare.push({ label: "🌡️ Temp. máxima", value: `${tempMaxSh.toFixed(1)}°C` });
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
    const chartData = sampled.map(pt => {
      const idx = trackPoints.indexOf(pt);
      return { x: parseFloat((fullDistances[idx] / 1000).toFixed(2)), y: pt.ele };
    });

    new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Elevación (m)',
          data: chartData,
          borderColor: '#6A0DAD',
          backgroundColor: function(ctx) {
            if (!ctx.chart.chartArea) return 'transparent';
            const g = ctx.chart.ctx.createLinearGradient(0, ctx.chart.chartArea.top, 0, ctx.chart.chartArea.bottom);
            g.addColorStop(0, 'rgba(102,126,234,0.3)');
            g.addColorStop(1, 'rgba(102,126,234,0.02)');
            return g;
          },
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            type: 'linear', min: 0, max: Math.ceil(totalKm),
            title: { display: true, text: 'Distancia (km)', font: { size: 11 } },
            ticks: { stepSize: tickStep, font: { size: 10 }, callback: v => Math.abs(v % tickStep) < 0.01 ? v : '' },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: 'Elevación (m)', font: { size: 11 } },
            ticks: { font: { size: 10 } },
            grid: { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });

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
            c.fillStyle = '#DC143C';
            c.fill();
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5;
            c.stroke();
            c.restore();
          }

          if (minPoint) {
            const xPx = xScale.getPixelForValue(minPoint.x);
            const yPx = yScale.getPixelForValue(minPoint.y);
            c.save();
            c.beginPath();
            c.arc(xPx, yPx, 5, 0, 2 * Math.PI);
            c.fillStyle = '#5B9BD5';
            c.fill();
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5;
            c.stroke();
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
          animation: { duration: 0 },
          plugins: { legend: { display: false } },
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
    const mapCanvas = await renderMapRouteToCanvas(trackPoints, 800, 400, tileBaseUrl);
    mapCanvas.style.cssText = 'width:800px;height:400px;display:block;';
    container.insertBefore(mapCanvas, sep);

    const resultCanvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false
    });

    document.body.removeChild(container);

    const blob = await new Promise(resolve => resultCanvas.toBlob(resolve, 'image/png', 1.0));
    if (!blob) throw new Error('No se pudo generar la imagen');

    Swal.close();

    const fileName = `ruta_${(fechaHora || 'gpx').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const texto = `${fechaHora || ''} — ${kms} km`;

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

// Función para renderizar controles de paginación
function renderizarControlesPaginacion() {
  const container = document.getElementById("main_cards");
  const paginacionExistente = document.getElementById("paginacion-container");
  if (paginacionExistente) {
    paginacionExistente.remove();
  }

  if (window.totalPaginas <= 1) return;

  const controlesHTML = `
    <div id="paginacion-container" class="col-12 mt-1 mb-1">
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
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', controlesHTML);
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
      const iconType =
        item.origen === "gpx"
          ? `<i class="fas fa-map-marker-alt" style="font-size: 20px; color: #000; cursor: pointer;" onclick="event.stopPropagation(); showGpxDetails(${item.id})" title="Ruta GPX - Ver detalles"></i>`
          : `<i class="fas fa-pen-to-square" style="font-size: 18px; color: #000; cursor: pointer;" onclick="event.stopPropagation(); editarRutaManual('${item.id}', '${item.fecha_inicio}', '${item.kms}', '${item.observaciones || ''}', '${item.regulacion || 0}')" title="Ruta manual - Editar"></i>`;

      // Para rutas manuales: modo edición al pulsar
      // Para rutas GPX: eliminación con pulsación larga (long press)
      const cardAttributes = item.origen !== "gpx" ?
        `onclick="editarRutaManual('${item.id}', '${item.fecha_inicio}', '${item.kms}', '${item.observaciones || ''}', '${item.regulacion || 0}')" style="cursor: pointer;"` :
        `data-gpx-id="${item.id}" data-gpx-fecha="${item.fecha_inicio}" data-gpx-kms="${item.kms}" class="gpx-card" style="cursor: pointer; user-select: none;" title="Mantenga pulsado para eliminar"`;

      return `
        <div class="col-12 mb-2">
          <div class="card shadow-sm" ${cardAttributes}>
            <div class="card-body d-flex align-items-center p-2">
              <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center" style="gap: 10px;">
                    <div style="min-width: 25px;">${iconType}</div>
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
          acc.rutasPulmonar += parseInt(item.rutas_mes_pulmonar || 0);
          acc.rutasElectrica += parseInt(item.rutas_mes_electrica || 0);
          return acc;
        },
        {
          kmsPulmonar: 0,
          kmsElectrica: 0,
          rutasPulmonar: 0,
          rutasElectrica: 0,
        }
      );

      const totalKms = totalesGlobales.kmsPulmonar + totalesGlobales.kmsElectrica;
      const totalRutas =
        totalesGlobales.rutasPulmonar + totalesGlobales.rutasElectrica;

      // 3. Generar HTML del resumen superior
      let htmlResumen = `
        <div class="mb-1 p-1 bg-white shadow-sm rounded border">
          <div class="d-flex justify-content-around" style="font-size: 0.9rem;">
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Kms Pulmonar">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🫁 Kms</div>
              <div class="fw-bold text-primary text-end">${totalesGlobales.kmsPulmonar.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Kms Eléctrica">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🔌 Kms</div>
              <div class="fw-bold text-success text-end">${totalesGlobales.kmsElectrica.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Total Kms">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🧭 Total</div>
              <div class="fw-bold text-dark text-end">${totalKms.toLocaleString(
                undefined,
                { minimumFractionDigits: 0, maximumFractionDigits: 1 }
              )}</div>
            </div>
          </div>
          <div class="d-flex justify-content-around" style="font-size: 0.9rem; margin-top: -5px;">
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Rutas Pulmonar">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🫁 Rutas</div>
              <div class="fw-bold text-primary text-end">${
                totalesGlobales.rutasPulmonar
              }</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Rutas Eléctrica">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🔌 Rutas</div>
              <div class="fw-bold text-success text-end">${
                totalesGlobales.rutasElectrica
              }</div>
            </div>
            <div class="text-center px-1 py-1" style="min-width: 80px;" title="Total Rutas">
              <div class="text-muted mb-0" style="font-size: 0.75rem;">🚴‍♂️ Total</div>
              <div class="fw-bold text-dark text-end">${totalRutas}</div>
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
