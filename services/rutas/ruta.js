const EARTH_RADIUS = 6371000;
const MASS = 63;
const G = 9.81;
const RHO_AIR = 1.208;
const CdA = 0.42;
const Crr = 0.018;
const DRIVETRAIN_LOSS = 0.05;
const MASSBIKER = 52;

// Variable global para almacenar los datos de la ruta actual
window.rutaActual = null;

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
  console.log("Iniciando processGPX");

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Archivo GPX inválido: " + parseError.textContent);
  }

  const trkpts = Array.from(doc.querySelectorAll("trkpt"))
    .map((pt) => {
      const eleElem = pt.querySelector("ele");
      const timeElem = pt.querySelector("time");

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

  console.log(`Puntos GPX procesados: ${trkpts.length}`);

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
    velocidad_maxima: Number(maxSpeed.toFixed(1)),
    potencia_promedio_w: Math.round(avgPower),
    calorias: Math.round(calories),
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
  await getRutasByVehiculo();
  document.getElementById("vehiculo-select").value =
    sessionStorage.getItem("vehiculo_id");
  setupGPXUpload();
  setupMultipleGPXUpload();
}

const cambiarVehiculo = async (id) => {
  await setVehiculo(id);
  // Limpiar campo de búsqueda al cambiar de vehículo
  const searchInput = document.getElementById("searchRutas");
  if (searchInput) searchInput.value = "";
  await getRutasByVehiculo();
};

// ========== FUNCIONALIDAD PARA UN SOLO ARCHIVO ==========
function setupGPXUpload() {
  const input = document.getElementById("gpxFile");
  const loadingIndicator = document.getElementById("loading-indicator");

  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const loading = loadingIndicator;
    if (loading) loading.style.display = "block";
    document.getElementById("output-container").innerHTML = "";

    try {
      const text = await file.text();
      let result;
      console.log("📁 Procesando archivo GPX...");
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

  console.log(`Archivos seleccionados: ${files.length}`);

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

      console.log(`Procesando archivo: ${file.name}`);
      const text = await file.text();
      const result = processGPX(text);

      await sendToAPISilent(result);
      successCount++;

      console.log(`✅ ${file.name} procesado correctamente`);
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

const guardarRutaManual = async () => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    kms: document.getElementById("kms_ruta").value,
    observaciones: document.getElementById("obs_ruta").value,
    fecha: document.getElementById("fecha_ruta").value,
  };
  try {
    const response = await axios.post(
      getApiUrl('ruta.php?guardarRutaManual'),
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

const editarRutaManual = (id, fecha, kms, observaciones) => {
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
    document.getElementById("fecha_ruta").value = fecha.split(' ')[0];
    
    // Cambiar el botón de guardar para que haga update en lugar de insert
    const saveBtn = document.querySelector('img[onclick="guardarRutaManual()"]');
    if (saveBtn) {
      saveBtn.setAttribute("onclick", `actualizarRutaManual('${id}')`);
      saveBtn.setAttribute("title", "Actualizar ruta");
    }
    
    // Mostrar botón cancelar
    const cancelBtn = document.getElementById("cancelar_btn");
    if (cancelBtn) {
      cancelBtn.style.display = "block";
    }
  }, 100);
};

const actualizarRutaManual = async (id) => {
  const data = {
    id: id,
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    kms: document.getElementById("kms_ruta").value,
    observaciones: document.getElementById("obs_ruta").value,
    fecha: document.getElementById("fecha_ruta").value,
  };
  try {
    const response = await axios.post(
      getApiUrl('ruta.php?actualizarRutaManual'),
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
      await Swal.fire({
        text: "✅ Ruta actualizada correctamente",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
      
      // Restaurar el botón original
      const saveBtn = document.querySelector('img[onclick*="actualizarRutaManual"]');
      if (saveBtn) {
        saveBtn.setAttribute("onclick", "guardarRutaManual()");
        saveBtn.setAttribute("title", "Guardar ruta");
      }
      
      // Limpiar formulario
      document.getElementById("kms_ruta").value = "";
      document.getElementById("obs_ruta").value = "";
      document.getElementById("fecha_ruta").value = "";
      
      // Ocultar botón cancelar
      const cancelBtn = document.getElementById("cancelar_btn");
      if (cancelBtn) {
        cancelBtn.style.display = "none";
      }
      
      // Volver a la pestaña principal y recargar
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
    console.error("Error actualizando ruta:", err);
    await Swal.fire({
      text: "❌ Error al actualizar la ruta",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
};

const cancelarEdicionRuta = () => {
  // Restaurar el botón original
  const saveBtn = document.querySelector('img[onclick*="actualizarRutaManual"]');
  if (saveBtn) {
    saveBtn.setAttribute("onclick", "guardarRutaManual()");
    saveBtn.setAttribute("title", "Guardar ruta");
  }
  
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

// Función para generar el contenido HTML de la ruta
function generarContenidoRuta(ruta, hasHR = false) {
  const formatFechaTimeISO = (fecha) => {
    if (!fecha) return "";
    try {
      const dateObj = new Date(fecha);
      if (isNaN(dateObj.getTime())) return "";
      const dia = String(dateObj.getDate()).padStart(2, "0");
      const mes = String(dateObj.getMonth() + 1).padStart(2, "0");
      const año = dateObj.getFullYear();
      const horas = String(dateObj.getHours()).padStart(2, "0");
      const minutos = String(dateObj.getMinutes()).padStart(2, "0");
      return `${dia}/${mes}/${año} ${horas}:${minutos}`;
    } catch (error) {
      console.error("Error formateando fecha:", error);
      return "";
    }
  };

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
  console.log("render =>", ruta);
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
        margin-bottom: px;
        padding: 4px 0;
        border-bottom: 1px solid #e0e0e0;
      }
      .detail-row-captura:last-child {
        border-bottom: none;
      }
      .label-captura {
        font-size: 14px;
        color: #555;
        font-weight: 600;
      }
      .value-captura {
        font-size: 14px;
        font-weight: 700;
        color: #2c3e50;
      }
    </style>
  `;
}

// Función principal para mostrar detalles de GPX
const showGpxDetails = async (ruta_id) => {
  const data = {
    ruta_id: ruta_id,
  };

  try {
    const response = await axios.post(
      getApiUrl('ruta.php?getRutasById'),
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
      const ruta = response.data.content[0];

      // Guardar los datos de la ruta globalmente para usarlos en la captura
      window.rutaActual = ruta;

      const htmlContent = generarContenidoRuta(ruta);

      Swal.fire({
        title: "📊 Detalles ",
        html: htmlContent,
        width: 600,
        maxHeight: 480,
        padding: "10px",
        showCloseButton: false,
        showConfirmButton: true,
        confirmButtonText: "Cerrar",
        confirmButtonColor: "#3085d6",
      });
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
        const formatFechaTimeISO = (fecha) => {
          if (!fecha) return "";
          try {
            const dateObj = new Date(fecha);
            if (isNaN(dateObj.getTime())) return "";
            const dia = String(dateObj.getDate()).padStart(2, "0");
            const mes = String(dateObj.getMonth() + 1).padStart(2, "0");
            const año = dateObj.getFullYear();
            const horas = String(dateObj.getHours()).padStart(2, "0");
            const minutos = String(dateObj.getMinutes()).padStart(2, "0");
            return `${dia}/${mes}/${año} ${horas}:${minutos}`;
          } catch (error) {
            return "";
          }
        };
        
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
      document.getElementById("main_cards").innerHTML =
        await parseHtmlCardsRutas(response.data.content);
      await formatKilometersBadges();
    }
  } catch (err) {
    console.error("Error al obtener rutas:", err);
  }
};

const parseHtmlCardsRutas = async (data) => {
  const formatFechaTimeISO = (fecha) => {
    if (!fecha) return "";
    try {
      const dateObj = new Date(fecha);
      if (isNaN(dateObj.getTime())) return "";
      const dia = String(dateObj.getDate()).padStart(2, "0");
      const mes = String(dateObj.getMonth() + 1).padStart(2, "0");
      const año = dateObj.getFullYear();
      const horas = String(dateObj.getHours()).padStart(2, "0");
      const minutos = String(dateObj.getMinutes()).padStart(2, "0");
      return `${dia}/${mes}/${año} ${horas}:${minutos}`;
    } catch (error) {
      console.error("Error formateando fecha:", error);
      return "";
    }
  };

  return data
    .map((item) => {
      const iconType =
        item.origen === "gpx"
          ? `<img height="25px" src="../../assets/images/icons/gpx.png" alt="GPX" onclick="showGpxDetails(${item.id})" style="cursor: pointer;" title="Ver detalles GPX">`
          : `<img class="me-3" height="20px" src="../../assets/images/icons/papelera.png" alt="Eliminar" onclick="eliminaRutaManual('${item.id}')" style="cursor: pointer;" title="Ver observaciones">`;
      const cardClickHandler = item.origen !== "gpx" ? 
        `onclick="editarRutaManual('${item.id}', '${item.fecha_inicio}', '${item.kms}', '${item.observaciones || ''}')" style="cursor: pointer;"` : 
        '';
      
      return `
        <div class="col-12 mb-2">
          <div class="card shadow-sm" ${cardClickHandler}>
            <div class="card-body d-flex align-items-center p-2">
              <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-baseline">
                  <p class="text-card-info mb-1">${formatFechaTimeISO(
                    item.fecha_inicio
                  )}</p>
                  <div class="mt-1">${iconType}</div>
                  <span name="kms" class="text-secondary me-1">${
                    item.kms || 0
                  }</span>
                  <span name="kms" class="text-primary">${
                    item.acumulado_kms || 0
                  }</span>
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
        <div class="d-flex justify-content-around flex-wrap mb-1 p-1 bg-white shadow-sm rounded border" style="font-size: 0.75rem;">
          <div class="text-center px-1 py-1" title="Kms Pulmonar">
            <div class="text-muted mb-0" style="font-size: 0.65rem;">🫁 Kms</div>
            <div class="fw-bold text-primary">${totalesGlobales.kmsPulmonar.toLocaleString(
              undefined,
              { minimumFractionDigits: 0, maximumFractionDigits: 1 }
            )}</div>
          </div>
          <div class="text-center px-1 py-1" title="Kms Eléctrica">
            <div class="text-muted mb-0" style="font-size: 0.65rem;">🔌 Kms</div>
            <div class="fw-bold text-success">${totalesGlobales.kmsElectrica.toLocaleString(
              undefined,
              { minimumFractionDigits: 0, maximumFractionDigits: 1 }
            )}</div>
          </div>
          <div class="text-center px-1 py-1" title="Total Kms">
            <div class="text-muted mb-0" style="font-size: 0.65rem;">🧭 Total</div>
            <div class="fw-bold text-dark">${totalKms.toLocaleString(
              undefined,
              { minimumFractionDigits: 0, maximumFractionDigits: 1 }
            )}</div>
          </div>
          <div class="text-center px-1 py-1" title="Rutas Pulmonar">
            <div class="text-muted mb-0" style="font-size: 0.65rem;">🫁 Rutas</div>
            <div class="fw-bold text-primary">${
              totalesGlobales.rutasPulmonar
            }</div>
          </div>
          <div class="text-center px-1 py-1" title="Rutas Eléctrica">
            <div class="text-muted mb-0" style="font-size: 0.65rem;">🔌 Rutas</div>
            <div class="fw-bold text-success">${
              totalesGlobales.rutasElectrica
            }</div>
          </div>
          <div class="text-center px-1 py-1" title="Total Rutas">
            <div class="text-muted mb-0" style="font-size: 0.65rem;">🚴‍♂️ Total</div>
            <div class="fw-bold text-dark">${totalRutas}</div>
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
                    <div class="d-flex justify-content-between w-100 pe-3 align-items-center">
                        <span class="fw-bold">${anio}</span>
                        <div class="text-end small">
                            <span class="me-3">🧭 ${global.total_anual_kms_global.toLocaleString()} km</span>
                            <span class="">🚴‍♂️ ${global.rutas_anio}</span>
                        </div>
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

// ========== FUNCIÓN DE FILTRADO DE RUTAS ==========
async function filtrarRutas(searchTerm) {
  console.log("🔍 Buscando:", searchTerm);
  const container = document.getElementById("main_cards");
  
  if (!window.rutasOriginales || window.rutasOriginales.length === 0) {
    console.log("⚠️ No hay rutas cargadas");
    return;
  }
  
  console.log("📊 Total rutas cargadas:", window.rutasOriginales.length);
  const term = searchTerm.toLowerCase().trim();
  
  if (term === "") {
    // Si no hay término de búsqueda, mostrar todas las rutas
    const rutasParaMostrar = window.rutasOriginales.map(item => ({
      id: item.id,
      vehiculo_id: item.vehiculo_id,
      fecha_inicio: item.fecha_inicio,
      kms: item.kms,
      acumulado_kms: item.acumulado_kms,
      origen: item.origen,
      observaciones: item.observaciones
    }));
    container.innerHTML = await parseHtmlCardsRutas(rutasParaMostrar);
    await formatKilometersBadges();
    
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
    return;
  }
  
  // Filtrar rutas por fecha, kms o kms acumulados
  const rutasFiltradas = window.rutasOriginales.filter(item => {
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
    
    if (match && term.length > 0) {
      console.log("✅ Coincidencia encontrada:", {
        fechaISO: fechaISO.substring(0, 20),
        fechaFormateada: fechaFormateada,
        kms: kms,
        kmsStr: kmsStr
      });
    }
    
    return match;
  });
  
  console.log("📋 Rutas filtradas:", rutasFiltradas.length);
  
  // Extraer solo los datos originales sin los campos formateados adicionales
  const rutasParaMostrar = rutasFiltradas.map(item => ({
    id: item.id,
    vehiculo_id: item.vehiculo_id,
    fecha_inicio: item.fecha_inicio,
    kms: item.kms,
    acumulado_kms: item.acumulado_kms,
    origen: item.origen,
    observaciones: item.observaciones
  }));
  
  // Mostrar resultados filtrados
  container.innerHTML = await parseHtmlCardsRutas(rutasParaMostrar);
  await formatKilometersBadges();
  
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

// ========== FUNCIÓN PARA MOSTRAR/OCULTAR INPUT DE BÚSQUEDA EN MÓVIL ==========
let searchExpanded = false;

function toggleSearchMobile() {
  const inputMobile = document.getElementById("searchRutasMobile");
  const inputDesktop = document.getElementById("searchRutas");
  
  if (!searchExpanded) {
    // Expandir input
    inputMobile.style.width = "100px";
    inputMobile.style.padding = "0.25rem 0.4rem";
    inputMobile.style.border = "1px solid #ced4da";
    inputMobile.style.borderRadius = "4px 4px 0 0";
    inputMobile.style.borderBottom = "2px solid #dee2e6";
    inputMobile.focus();
    searchExpanded = true;
  } else {
    // Colapsar input
    inputMobile.style.width = "0";
    inputMobile.style.padding = "0";
    inputMobile.style.border = "none";
    inputMobile.value = "";
    // Limpiar búsqueda al cerrar
    if (inputDesktop) {
      inputDesktop.value = "";
    }
    filtrarRutas("");
    searchExpanded = false;
  }
}

// Cerrar input de búsqueda al hacer clic fuera
document.addEventListener('click', function(event) {
  const searchContainer = document.getElementById('searchContainer');
  const inputMobile = document.getElementById("searchRutasMobile");
  
  if (searchExpanded && searchContainer && !searchContainer.contains(event.target)) {
    inputMobile.style.width = "0";
    inputMobile.style.padding = "0";
    inputMobile.style.border = "none";
    inputMobile.value = "";
    filtrarRutas("");
    searchExpanded = false;
  }
});
