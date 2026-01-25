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
    inicio: trkpts[0].time.toISOString(),
    fin: trkpts[trkpts.length - 1].time.toISOString(),
    tiempoTranscurrido: formatTime(totalTimeElapsed),
    tiempoEnMovimiento: formatTime(totalTimeMoving),
    distanciaMetros: Math.round(totalDist),
    distanciaKm: (totalDist / 1000).toFixed(3),
    ascensoMetros: Math.round(ascent),
    descensoMetros: Math.round(descent),
    altitudMaximaMetros: Math.round(maxAlt),
    subidaPerc: parseInt(subidaPerc),
    planoPerc: parseInt(planoPerc),
    bajadaPerc: parseInt(bajadaPerc),
    tiempoSubida: tiemposTerreno.tiempoSubida,
    tiempoBajada: tiemposTerreno.tiempoBajada,
    tiempoPlano: tiemposTerreno.tiempoPlano,
    velocidadMediaEnMovimientoKmh: Number(avgSpeedMoving.toFixed(1)),
    velocidadMaximaKmh: Number(maxSpeed.toFixed(1)),
    potenciaPromedioW: Math.round(avgPower),
    caloriasKcal: Math.round(calories),
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
      renderResult(result, file.name.endsWith(".tcx")); // pasamos flag para HR
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
    kms: result.distanciaKm,
    tiempo_movimiento: result.tiempoEnMovimiento,
    tiempo_total: result.tiempoTranscurrido,
    velocidad_media: result.velocidadMediaEnMovimientoKmh,
    velocidad_maxima: result.velocidadMaximaKmh,
    metros_ascenso: result.ascensoMetros,
    metros_descenso: result.descensoMetros,
    altitud_maxima: result.altitudMaximaMetros,
    potencia_promedio_w: result.potenciaPromedioW,
    calorias: result.caloriasKcal,
    pct_subida: result.subidaPerc,
    pct_plano: result.planoPerc,
    pct_bajada: result.bajadaPerc,
    fecha_inicio: result.inicio,
    fecha_fin: result.fin,
    tiempo_subida: result.tiempoSubida,
    tiempo_plano: result.tiempoPlano,
    tiempo_bajada: result.tiempoBajada,
    frecuencia_cardiaca_promedio: result.frecuenciaCardiacaPromedio,
    frecuencia_cardiaca_maxima: result.frecuenciaCardiacaMaxima,
  };

  const response = await axios.post(
    `../../api/rutas/ruta.php?guardarRutaGPX`,
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
    kms: result.distanciaKm,
    tiempo_movimiento: result.tiempoEnMovimiento,
    tiempo_total: result.tiempoTranscurrido,
    velocidad_media: result.velocidadMediaEnMovimientoKmh,
    velocidad_maxima: result.velocidadMaximaKmh,
    metros_ascenso: result.ascensoMetros,
    metros_descenso: result.descensoMetros,
    altitud_maxima: result.altitudMaximaMetros,
    potencia_promedio_w: result.potenciaPromedioW,
    calorias: result.caloriasKcal,
    pct_subida: result.subidaPerc,
    pct_plano: result.planoPerc,
    pct_bajada: result.bajadaPerc,
    tiempo_subida: result.tiempoSubida,
    tiempo_plano: result.tiempoPlano,
    tiempo_bajada: result.tiempoBajada,
    fecha_inicio: result.inicio,
    fecha_fin: result.fin,
    frecuencia_cardiaca_promedio: result.frecuenciaCardiacaPromedio,
    frecuencia_cardiaca_maxima: result.frecuenciaCardiacaMaxima,
  };

  try {
    const response = await axios.post(
      `../../api/rutas/ruta.php?guardarRutaGPX`,
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
      text: `❌ Error al guardar: ${
        err.response?.data?.message || err.message
      }`,
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
      `../../api/rutas/ruta.php?guardarRutaManual`,
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
      `../../api/rutas/ruta.php?actualizarRutaManual`,
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
      `../../api/rutas/ruta.php?eliminaRutaManual`,
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
      `../../api/rutas/ruta.php?getRutasById`,
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
      `../../api/rutas/ruta.php?getRutasByVehiculo`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.success) {
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
      `../../api/rutas/ruta.php?getResumenBiker`,
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
